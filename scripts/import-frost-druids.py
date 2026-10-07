"""Author: MiYu. Preserve original Druid forms, Ancient producers, training and transformation commands."""
import argparse
import csv
import importlib
import json
import pathlib
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-entangled-assets')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-natures-blessing').section
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
UNITS = {'druidclaw': ('edoc', 'Druid of the Claw', 'ClassicDruid'), 'druidbear': ('edcm', 'Bear Form', 'ClassicDruid'), 'druidtalon': ('edot', 'Druid of the Talon', 'ClassicDruidTalon'), 'druidcrow': ('edtm', 'Storm Crow Form', 'ClassicDruidTalon')}
BUILDINGS = {'ancientlore': ('eaoe', 'Ancient of Lore', 'ClassicAncientLore'), 'ancientwind': ('eaow', 'Ancient of Wind', 'ClassicAncientWind')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    previous = json.loads((SAMPLE / 'druid-sources.json').read_bytes()) if (SAMPLE / 'druid-sources.json').exists() else {}
    signed = {}
    for receipt in [previous] + [json.loads((SAMPLE / (name + '-sources.json')).read_bytes()) for name in ['night-elf-technology', 'production-ancient', 'building-scale']]:
        for record in receipt.get('sources', []): signed[record['path'].replace('\\', '/')] = record
    files, sources, archives = {}, {}, []

    def original(path):
        if path in sources: return files['SourceAssets/WarcraftIII/' + path]
        record = signed.get(path)
        if record:
            raw = (SAMPLE / 'SourceAssets/WarcraftIII' / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], path
        else:
            if not archives: archives.extend((name, mpyq.MPQArchive(str(args.game / name))) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Druid source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/WarcraftIII/' + path] = raw; sources[path] = record
        return raw

    table = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI', 'UpgradeData', 'AbilityData', 'AbilityMetaData']}
    func, strings, upgrades, upgrade_strings, abilities, ability_strings = [original('Units/' + name + '.txt') for name in ['NightElfUnitFunc', 'NightElfUnitStrings', 'NightElfUpgradeFunc', 'NightElfUpgradeStrings', 'NightElfAbilityFunc', 'NightElfAbilityStrings']]
    armor = {'medium': 'medium', 'small': 'light', 'large': 'heavy', 'none': 'unarmored', 'fort': 'fortified'}
    units, buildings, scales = {}, {}, {}
    def icons(key, path):
        target = 'Assets/Art/classic-' + key
        files[target + '.png'] = base.decode_icon(original(path.replace('\\', '/')))
        files[target + '-disabled.png'] = base.decode_icon(original(path.replace('\\CommandButtons\\BTN', '\\CommandButtonsDisabled\\DISBTN').replace('\\', '/')))
        return dict(icon=target + '.png', disabledIcon=target + '-disabled.png')
    for kind, (source, label, model) in UNITS.items():
        b, w, a, ui = [table[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI']]
        art, text = section(func, source), section(strings, source)
        alternate = kind in ['druidbear', 'druidcrow']
        units[kind] = dict(sourceUnit=source, label=label, model=model, hp=int(b['HP']), armor=armor[b['defType']], armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']), time=float(b['bldtm']), damage=float(w['avgdmg1']), attack=w['atkType1'], range=float(w['rangeN1']) / 100, cooldown=float(w['cool1']), speed=float(b['spd']) / 100, collision=float(b['collision']) / 100, antiAir='air' in w['targs1'].split(','), flying=kind == 'druidcrow', airOnly=kind == 'druidcrow', organic=True, nightRegen=float(b['regenHP']), maxMana=float(b['manaN']), initialMana=float(b['mana0']), manaRegen=float(b['regenMana']), alternate=alternate, slot=sum(int(v) * f for v, f in zip(art['Buttonpos'].split(','), [1, 4])), hotkey=text['Hotkey'], research='Redc' if kind in ['druidclaw', 'druidbear'] else 'Redt', damagePoint=float(w['dmgpt1']), modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), sourceRows={name: table[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, sourceFunc=art, sourceStrings=text, **icons(kind, art['Art']))
        if w['weapTp1'] != 'normal': units[kind].update(missileSpeed=float(art['Missilespeed']) / 100, projectile='nature', missileArc=float(art.get('Missilearc', '0')))
        scales.setdefault(model, dict(unit=source, modelScale=float(ui['modelScale']), selectionScale=float(ui['scale'])))
    for kind, (source, label, model) in BUILDINGS.items():
        b, w, a, ui = [table[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI']]
        art = section(func, source); root = table['AbilityData'][next(k for k in a['abilList'].split(',') if k in ['Aro1', 'Aro2'])]
        weapons = {form: dict(slot=int(n), damage=float(w['avgdmg' + n]), range=float(w['rangeN' + n]) / 100, cooldown=float(w['cool' + n]), attack=w['atkType' + n], antiAir='air' in w['targs' + n].split(','), weaponType=w['weapTp' + n]) for form, n in [('rooted', root['DataA1']), ('uprooted', root['DataB1'])]}
        buildings[kind] = dict(sourceUnit=source, name=label, label=label, model=model, radius=2, hp=int(b['HP']), armor='fortified', armorValue=float(b['def']), armorBonus=float(b['defUp']), speed=float(b['spd']) / 100, nightRegen=float(b['regenHP']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=0, time=float(b['bldtm']), morph=float(root['Dur1']), weapons=weapons, sourceRows={name: table[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, sourceRoot=root, sourceFunc=art, **icons(kind, art['Art']), requires=art['Requires'].split(','), training=['druidclaw'] if kind == 'ancientlore' else ['druidtalon'])
        scales[model] = dict(unit=source, modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']))
    research = {}
    for key, building in [('Redc', 'ancientlore'), ('Redt', 'ancientwind'), ('Reeb', 'ancientlore'), ('Reec', 'ancientwind')]:
        row, art, text = table['UpgradeData'][key], section(upgrades, key), section(upgrade_strings, key); count = int(row['maxlevel'])
        values = {k: next(csv.reader([text[k]])) for k in ['Name', 'Hotkey', 'Tip', 'Ubertip']}; paths = next(csv.reader([art['Art']]))
        effects = {row['effect' + str(n)]: [float(row['base' + str(n)]), float(row['mod' + str(n)])] for n in range(1, 5) if row['effect' + str(n)] != '_'}
        levels = []
        for n in range(count):
            requirement = art.get('Requires' + (str(n) if n else ''), ''); amounts = art.get('Requiresamount' + (str(n) if n else ''), '')
            required = requirement.split(',') if requirement else []; counts = list(map(int, amounts.split(','))) if amounts else [1] * len(required)
            levels.append(dict(rank=n + 1, name=values['Name'][n], hotkey=values['Hotkey'][n], tip=values['Tip'][n], tooltip=values['Ubertip'][n], gold=int(row['goldbase']) + int(row['goldmod']) * n, wood=int(row['lumberbase']) + int(row['lumbermod']) * n, time=float(row['timebase']) + float(row['timemod']) * n, requires=[dict(id=r, amount=c) for r, c in zip(required, counts)], **icons('research-' + key + '-' + str(n + 1), paths[n])))
        research[key] = dict(building=building, maxLevel=count, slot=sum(int(v) * factor for v, factor in zip(art['Buttonpos'].split(','), [1, 4])), effects=effects, levels=levels, sourceRow=row, sourceFunc=art, sourceStrings=text)
    commands = {}
    for key in ['Abrf', 'Arav', 'Aroa', 'Ara2', 'Arej', 'Afae', 'Afa2', 'Acyc']:
        row, art, text = table['AbilityData'][key], section(abilities, key), section(ability_strings, key)
        number = lambda k: float(row[k]) if row[k] not in ['-', '_', ''] else 0
        commands[key] = dict(sourceRow=row, sourceFunc=art, sourceStrings=text, cost=number('Cost1'), cooldown=number('Cool1'), range=number('Rng1') / 100, duration=number('Dur1'), heroDuration=number('HeroDur1'), name=text['Name'], hotkey=text['Hotkey'], slot=sum(int(v) * factor for v, factor in zip(art['Buttonpos'].split(','), [1, 4])), **icons(key, art['Art']))
        if 'Unart' in art: commands[key]['offIcon'] = icons(key + '-off', art['Unart'])['icon']
        commands[key]['metadata'] = {k: v for k, v in table['AbilityMetaData'].items() if key in v.get('useSpecific', '').split(',')}
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    damage_table = {k: dict(zip(['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored'], map(float, misc['DamageBonus' + k.capitalize()].split(',')))) for k in ['normal', 'magic']}
    catalog = dict(author='MiYu', schemaVersion=1, sourceUnitsPerWorldUnit=100, units=units, buildings=buildings, scales=scales, research=research, commands=commands, damageTable=damage_table)
    files['druid-rules.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Druids.txt'] = b'Original Warcraft III Druid tables, models and icons belong to Blizzard Entertainment. Original game asset terms apply. Source archives, hashes and generator are recorded in druid-sources.json. Extraction does not establish a free redistribution license.\n'
    generator = 'scripts/import-frost-druids.py'
    receipt = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=[sources[p] for p in sorted(sources)], files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    files['druid-sources.json'] = encode(receipt)
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    if previous: old['druid-sources.json'] = sha(encode(previous))
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Druid output: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    print('PASS original Druids: four forms, two Ancients, six research ranks and eight commands')


if __name__ == '__main__': main()
