"""Author: MiYu. Resolve classic object overrides into source tables for map visuals and selection.

Binary layout follows the pinned Warcraft map format reference in third_party/warcraft-map-format.
Fields outside the loaded source tables remain preserved in the original archive.
"""
import copy
import importlib
from warcraft_map import Reader, resolve_string

rows = importlib.import_module('import-frost-wisp-rules').rows


def parse_objects(raw, name, extended=False):
    r = Reader(raw, name)
    version = r.integer()
    if version not in (1, 2):
        r.fail('unsupported classic object data version ' + str(version))
    result = []
    for custom in (False, True):
        for _ in range(r.count(12)):
            base, target = r.code(), r.code()
            if not custom:
                target = base
            elif target == '\0' * 4:
                r.fail('custom object has an empty ID')
            changes, end_markers, levels = [], [], []
            for _ in range(r.count(21 if extended else 13)):
                field, kind = r.code(), r.integer()
                levels.append(r.values('2i') if extended else [0, 0])
                if kind == 0: value = r.integer()
                elif kind in (1, 2): value = r.values('f')[0]
                elif kind == 3: value = r.text()
                else: r.fail('unsupported object value type ' + str(kind))
                end_markers.append(r.code())
                changes.append((field, value))
            result.append(dict(base=base, id=target, custom=custom, changes=changes, endMarkers=end_markers, levels=levels))
    r.finish()
    return result


def doodad_tables(read, members, strings):
    definitions = rows(read('Doodads/Doodads.slk'))
    destructables = rows(read('Units/DestructableData.slk'))
    records = []
    for file, table, metadata_path in [('war3map.w3b', destructables, 'Units/DestructableMetaData.slk'), ('war3map.w3d', definitions, 'Doodads/DoodadMetaData.slk')]:
        if file not in members: continue
        metadata = rows(read(metadata_path))
        for obj in parse_objects(members[file], file, extended=file.endswith('.w3d')):
            base, target = obj['base'], obj['id']
            if base not in table: raise ValueError('Missing base object ' + base + ' for ' + target)
            if obj['custom']:
                if target in table: raise ValueError('Duplicate custom object ' + target)
                table[target] = copy.deepcopy(table[base])
            applied, preserved = [], []
            for (field, value), (level, pointer) in zip(obj['changes'], obj['levels']):
                meta = metadata.get(field, {})
                key = meta.get('field')
                if key and pointer == 0:
                    if int(meta.get('repeat', '0')):
                        if level < 1: raise ValueError('Invalid doodad variation for ' + field)
                        key += f'{level:02}'
                    table[target][key] = resolve_string(str(value), strings); applied.append(field)
                else: preserved.append(field)
            records.append(dict(source=file, base=base, id=target, applied=applied, preserved=preserved))
    definitions.update(destructables)
    return dict(definitions=definitions, destructables=destructables, overrides=records)


def unit_tables(read, members, strings):
    tables = {name: rows(read('Units/' + name + '.slk')) for name in ['UnitUI', 'UnitData', 'UnitBalance', 'ItemData']}
    metadata = rows(read('Units/UnitMetaData.slk'))
    aliases, names, records = {}, {}, []
    for file in ['war3map.w3u', 'war3map.w3t']:
        if file not in members: continue
        for obj in parse_objects(members[file], file):
            base, target = obj['base'], obj['id']
            if not any(base in table for table in tables.values()): raise ValueError('Missing base object ' + base + ' for ' + target)
            if obj['custom']:
                if any(target in table for table in tables.values()): raise ValueError('Duplicate custom object ' + target)
                for table in tables.values():
                    if base in table: table[target] = copy.deepcopy(table[base])
                aliases[target] = aliases.get(base, base)
                if base in names: names[target] = names[base]
            applied, preserved = [], []
            for field, value in obj['changes']:
                meta = metadata.get(field, {})
                if field == 'unam':
                    names[target] = resolve_string(str(value), strings); applied.append(field); continue
                table = tables.get(meta.get('slk'))
                if table is not None and target in table and meta.get('index', '-1') == '-1':
                    table[target][meta['field']] = str(value); applied.append(field)
                else: preserved.append(field)
            records.append(dict(source=file, base=base, id=target, applied=applied, preserved=preserved))
    ui, movement, balance = (tables[name] for name in ['UnitUI', 'UnitData', 'UnitBalance'])
    for kind, item in tables['ItemData'].items():
        if kind in ui: continue
        ui[kind] = dict(file=item['file'], modelScale=item.get('scale', '1'), scale=item.get('scale', '1'), selZ='0', teamColor='-1', red=item.get('colorR', '255'), green=item.get('colorG', '255'), blue=item.get('colorB', '255'))
        movement[kind] = dict(moveHeight='0')
        balance[kind] = dict(HP=item.get('HP', '1'), manaN='0', mana0='0')
    return dict(ui=ui, movement=movement, balance=balance, aliases=aliases, names=names, overrides=records, items=set(tables['ItemData']))
