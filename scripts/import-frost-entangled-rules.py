"""Author: MiYu. Derive Entangle and rotating mine income rules from signed original Warcraft tables."""
import argparse
import hashlib
import importlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
base = importlib.import_module('import-frost-wisp-rules')
ui = importlib.import_module('import-frost-building-scales')
def sha(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    output = parser.parse_args().output.resolve()
    sources, tables = [], {}
    receipt = json.loads((SAMPLE / 'wisp-rule-sources.json').read_bytes())
    for record in receipt['sources']:
        path = pathlib.PureWindowsPath(record['path']).as_posix()
        raw = (SAMPLE / 'SourceAssets/WarcraftIII' / path).read_bytes()
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes'], path
        sources.append(record); tables[pathlib.Path(path).stem] = base.rows(raw)
    scale = json.loads((SAMPLE / 'building-scale-sources.json').read_bytes())
    record = next(r for r in scale['files'] if r['path'].endswith('unitUI.slk'))
    raw = (SAMPLE / record['path']).read_bytes(); assert sha(raw) == record['sha256']
    tables['UnitUI'] = ui.rows(raw)
    selected = dict(balance=tables['UnitBalance']['egol'], weapons=tables['UnitWeapons']['egol'], mineAbilities=tables['UnitAbilities']['egol'], treeAbilities={key: tables['UnitAbilities'][key] for key in ['etol', 'etoa', 'etoe']}, mineUI=tables['UnitUI']['egol'], treeUI={key: tables['UnitUI'][key] for key in ['etol', 'etoa', 'etoe']}, abilities={key: tables['AbilityData'][key] for key in ['Aent', 'Aenc', 'Aegm', 'Slo2']})
    abilities, balance = selected['abilities'], selected['balance']
    assert abilities['Aent']['UnitID1'] == 'egol' and abilities['Slo2']['UnitID1'] == 'ewsp'
    assert selected['weapons']['weapsOn'] == '0' and balance['defType'] == 'fort'
    assert all('Aent' in r['abilList'].split(',') for r in selected['treeAbilities'].values())
    assert all(k in selected['mineAbilities']['abilList'].split(',') for k in ['Aenc', 'Slo2', 'Aegm'])
    units = 100
    selected['treeBalance'] = {key: tables['UnitBalance'][key] for key in ['etol', 'etoa', 'etoe']}
    catalog = dict(author='MiYu', sourceUnit='egol', sourceUnitsPerWorldUnit=units, hp=int(balance['HP']), armorValue=int(balance['def']), armor='fortified', time=int(balance['bldtm']), gold=int(balance['goldcost']), wood=int(balance['lumbercost']), castTime=float(abilities['Aent']['Cast1']), range=float(abilities['Aent']['Rng1']) / units, capacity=int(abilities['Aenc']['DataA1']), loadRange=float(abilities['Aenc']['Rng1']) / units, goldPerInterval=int(abilities['Aegm']['DataA1']), interval=float(abilities['Aegm']['DataB1']), mineCollision=float(balance['collision']) / units, treeCollision={key: float(r['collision']) / units for key, r in selected['treeBalance'].items()}, sourceRows=selected)
    files = {'entangled-rules.json': encode(catalog), 'Assets/Licenses/Classic-Entangled-Rules.txt': b'Original Warcraft III Entangle and Entangled Gold Mine ability/unit data: Blizzard Entertainment. Original game asset terms apply. Signed source tables are retained in SourceAssets/WarcraftIII/Units and referenced by entangled-rule-sources.json.\n'}
    path = output / 'entangled-rule-sources.json'; previous = json.loads(path.read_bytes()) if path.exists() else {}
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Entangle rules: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-entangled-rules.py'
    report = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, sourceUI=record, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], incomeReference=dict(commit='f9e0aeed4be372d6016519d0e97b384aa873f374', url='https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/abilities/mine/CAbilityEntangledMine.java', scope='Independent reference for advancing one cargo index per interval; original client timing phase is not measured.'))
    path.write_bytes(encode(report))
    print('PASS original Entangle rules:', catalog['castTime'], 's cast,', catalog['time'], 's construction,', catalog['capacity'], 'cargo seats,', catalog['goldPerInterval'], 'gold per', catalog['interval'], 's seat interval')


if __name__ == '__main__': main()
