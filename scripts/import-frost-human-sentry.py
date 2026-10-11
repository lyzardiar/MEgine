"""Author: MiYu. Reproduce original Magic Sentry detection, tower identities, enum and passive icon."""
import argparse
import hashlib
import importlib
import json
import pathlib
import uuid
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
decode = importlib.import_module('import-frost-blood-mage').decode_texture
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-root', type=pathlib.Path)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve(); receipt_name = 'human-sentry-sources.json'; prefix = 'SourceAssets/HumanSentry/'
    old = json.loads((output / receipt_name).read_bytes()) if (output / receipt_name).exists() else {}
    for r in old.get('outputs', []):
        p = output / r['path']
        if not p.is_file() or len(p.read_bytes()) != r['bytes'] or sha(p.read_bytes()) != r['sha256']: raise ValueError('Modified signed sentry output: ' + r['path'])
    retained = json.loads((args.source_root / receipt_name).read_bytes()) if args.source_root else {}
    sources, files, archives = {}, {}, []
    def original(path):
        if args.source_root:
            record = next(r for r in retained['sources'] if r['path'] == path); raw = (args.source_root / prefix / path).read_bytes()
            if len(raw) != record['bytes'] or sha(raw) != record['sha256']: raise ValueError('Corrupt sentry source: ' + path)
        else:
            if not archives: archives.extend((name, mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['War3Patch.mpq', 'War3x.mpq', 'War3.mpq'] if (args.game / name).exists())
            for name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\'))
                except FileNotFoundError: continue
                if raw: break
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files[prefix + path] = raw; return raw
    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['AbilityData', 'AbilityMetaData', 'UnitAbilities', 'UnitUI']}
    func = section(original('Units/HumanAbilityFunc.txt'), 'Adts'); strings = section(original('Units/HumanAbilityStrings.txt'), 'Adts')
    enum = section(original('UI/UnitEditorData.txt'), 'detectionType'); ability = tables['AbilityData']['Adts']; value = int(ability['DataA1'])
    assert enum['03'] == '3,WESTRING_UE_DETECTIONTYPE_BOTH' and value == 3
    assert func['Requires'] == 'Rhse' and func['Casterattach'] == 'overhead' and float(ability['Rng1']) == 900
    tower_rows = {key: dict(abilities=tables['UnitAbilities'][key], ui=tables['UnitUI'][key]) for key in ['hwtw', 'hgtw', 'hatw', 'hctw']}
    assert all('Adts' in r['abilities']['abilList'].split(',') for r in tower_rows.values())
    for key in ['hars', 'htow', 'hkee', 'hcas']: assert 'Adts' not in tables['UnitAbilities'][key]['abilList'].split(',')
    bindings = {'scouttower': {'unit': 'hwtw', 'model': 'KingdomScoutTower'}, 'guardtower': {'unit': 'hgtw', 'model': 'KingdomTower'}, 'tower': {'unit': 'hgtw', 'model': 'KingdomTower'}}
    scale_raw = (args.source_root or SAMPLE).joinpath('building-scale-catalog.json').read_bytes(); scales = json.loads(scale_raw)
    if args.source_root:
        dependency = next(r for r in retained['dependencies'] if r['path'] == 'building-scale-catalog.json')
        if len(scale_raw) != dependency['bytes'] or sha(scale_raw) != dependency['sha256']: raise ValueError('Corrupt sentry dependency: building-scale-catalog.json')
    for binding in bindings.values(): assert scales['models'][binding['model']]['unit'] == binding['unit']
    icon = 'Assets/Art/classic-human-sentry.png'; files[icon] = decode(original(func['Art'].replace('\\', '/')))
    files[icon + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture'))
    metadata = {key: row for key, row in tables['AbilityMetaData'].items() if 'Adts' in row.get('useSpecific', '').split(',')}
    rule = dict(author='MiYu', sourceAbility='Adts', sourceUnitsPerWorldUnit=100, sourceRow=ability, sourceFunc=func, sourceStrings=strings, sourceMetadata=metadata, detectionEnum=enum, detectionType=value, detectsInvisible=True, detectsBurrowed=True, range=float(ability['Rng1']) / 100, research='Rhse', passive=True, slot=sum(int(v) * f for v, f in zip(func['Buttonpos'].split(','), [1, 4])), icon=icon, towerBindings=bindings, sourceTowers=tower_rows, unsupportedTowerSources=['hatw', 'hctw'])
    files['human-sentry.json'] = encode(rule)
    signed = {r['path'] for r in old.get('outputs', [])}
    for path in files:
        if (output / path).exists() and path not in signed: raise ValueError('Unsigned sentry output exists: ' + path)
    for path, raw in files.items(): target = output / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    receipt = dict(author='MiYu', schemaVersion=1, sources=list(sources.values()), outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())], dependencies=[dict(path='building-scale-catalog.json', bytes=len(scale_raw), sha256=sha(scale_raw))], generator=dict(path='scripts/import-frost-human-sentry.py', sha256=sha(pathlib.Path(__file__).read_bytes().replace(b'\r\n', b'\n'))), originalRuntimeVerified=False)
    (output / receipt_name).write_bytes(encode(receipt)); print('PASS Magic Sentry: source range 9, detection enum 3=INVIS+BURROW, Rhse dependency, exact supported tower models and original passive icon')


if __name__ == '__main__': main()
