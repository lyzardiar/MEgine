"""Author: MiYu. Derive Shadow Hunter rules and editor field meanings from signed original sources."""
import argparse
import importlib
import json
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-orc-heroes')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-root', type=Path, default=SAMPLE)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); source = args.source_root.resolve(); output = args.output.resolve(); filename = 'shadowhunter-rules-sources.json'
    old = json.loads((output / filename).read_bytes()) if (output / filename).exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        raw = (output / p).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified generated output: ' + p
    manifest = json.loads((source / 'orc-hero-sources.json').read_bytes())
    prior = json.loads((source / filename).read_bytes()) if (source / filename).exists() else {}
    signed = {r['path'].lower(): r for r in manifest['sources'] + prior.get('sources', [])}; used = {}; files = {}; archives = []
    def original(path):
        if path.lower() in signed:
            r = signed[path.lower()]; raw = (source / r['output']).read_bytes()
            assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Source fingerprint mismatch: ' + path
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original source: ' + path)
            r = dict(path=path, output='SourceAssets/ShadowHunter/rules/' + path, archive=name, bytes=len(raw), sha256=sha(raw))
        used[path] = r
        if r['output'].startswith('SourceAssets/ShadowHunter/'): files[r['output']] = raw
        return raw
    try:
        raw = (source / 'orc-hero-rules.json').read_bytes(); record = next(r for r in manifest['outputs'] if r['path'] == 'orc-hero-rules.json')
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Orc hero rules fingerprint mismatch'
        heroes = json.loads(raw); unit = heroes['units']['Oshd']; ids = unit['commandOrder']
        metadata = base.rows(original('Units/AbilityMetaData.slk')); buffs = base.rows(original('Units/AbilityBuffData.slk'))
        editor = original('UI/WorldEditStrings.txt')
        try: editor = editor.decode('utf-8-sig')
        except UnicodeDecodeError: editor = editor.decode('gb18030')
        labels = dict(line.split('=', 1) for line in editor.splitlines() if line.startswith('WESTRING_') and '=' in line)
        fields = {id: [dict(id=key, sourceRow=r, label=labels[r['displayName']]) for key, r in metadata.items() if id in r.get('useSpecific', '').split(',') and r.get('field') == 'Data'] for id in ids}
        tables = {n: base.rows(original('Units/' + n + '.slk')) for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI', 'AbilityData']}
        unit_func = original('Units/OrcUnitFunc.txt'); unit_strings = original('Units/OrcUnitStrings.txt'); neutral_func = original('Units/NeutralUnitFunc.txt'); neutral_strings = original('Units/NeutralUnitStrings.txt'); wards = {}; forms = {}; number = base.number
        for rank in [1, 2, 3]:
            id = heroes['abilities']['AOsw']['sourceRow']['UnitID' + str(rank)]; b, w, a, ui = [tables[n][id] for n in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI']]; func = base.section(unit_func, id); strings = base.section(unit_strings, id)
            wards[id] = dict(id=id, rank=rank, name=strings['Name'], hp=number(b['HP']), armorValue=number(b['def']), armor=b['defType'], speed=number(b['spd']) / 100, collision=number(b['collision']) / 100, healthRegen=number(b['regenHP']), daySight=number(b['sight']) / 100, nightSight=number(b['nsight']) / 100, abilityIds=a['abilList'].split(','), model='ClassicSerpentWard', modelScale=number(ui['modelScale']), selectionScale=number(ui['scale']), sourceModel=ui['file'], sourceRows={n: tables[n][id] for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, sourceFunc=func, sourceStrings=strings, weapon=dict(damage=number(w['avgdmg1']), dice=int(w['dice1']), sides=int(w['sides1']), bonus=number(w['dmgplus1']), attack=w['atkType1'], range=number(w['rangeN1']) / 100, cooldown=number(w['cool1']), damagePoint=number(w['dmgpt1']), backswing=number(w['backSw1']), antiAir='air' in w['targs1'].split(',')), launch=[number(w['launchX']) / 100, number(w['launchZ']) / 100, -number(w['launchY']) / 100])
        pools = {key: heroes['abilities']['AOhx']['levels'][0]['data'][field].split(',') for key, field in [('ground', 'DataB'), ('air', 'DataC'), ('amphibious', 'DataD'), ('water', 'DataE')]}
        for id in dict.fromkeys(id for pool in pools.values() for id in pool):
            b, d, ui = [tables[n][id] for n in ['UnitBalance', 'UnitData', 'unitUI']]; forms[id] = dict(id=id, name=base.section(neutral_strings, id)['Name'], model='ClassicHex' + id, sourceModel=ui['file'], modelScale=number(ui['modelScale']), selectionScale=number(ui['scale']), speed=number(b['spd']) / 100, movement=d['movetp'], sourceFunc=base.section(neutral_func, id), sourceRows={n: tables[n][id] for n in ['UnitBalance', 'UnitData', 'unitUI']})
        ward_abilities = {id: dict(sourceRow=tables['AbilityData'][id]) for id in dict.fromkeys(id for r in wards.values() for id in r['abilityIds']) if id not in ['', '_', '-']}
        rules = dict(author='MiYu', schemaVersion=1, unit=unit, abilities={id: heroes['abilities'][id] for id in ids}, buffs={id: heroes['buffs'][id] for id in ['BOhx', 'BOwd', 'BOvd', 'BOvc']}, wards=wards, wardAbilities=ward_abilities, hexForms=forms, hexPools=pools, fieldMetadata=fields, misc=heroes['misc'], runtimeIntegrated=False, originalRuntimeVerified=False)
        files['shadowhunter-rules.json'] = encode(rules)
        for p, raw in files.items():
            if (output / p).exists() and p not in owned: assert (output / p).read_bytes() == raw, 'Unowned output collision: ' + p
        tools = ['scripts/import-frost-shadowhunter-rules.py', 'scripts/import-frost-orc-heroes.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py']
        result = dict(author='MiYu', sources=list(used.values()), inputs=[dict(path='orc-hero-rules.json', bytes=record['bytes'], sha256=record['sha256'])], generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], runtimeIntegrated=False, originalRuntimeVerified=False)
        for p, raw in files.items():
            dest = output / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        (output / filename).write_bytes(encode(result)); print('PASS original ShadowHunter rules, four source command cards and editor field meanings')
    finally:
        for _, archive in archives: archive.file.close()


if __name__ == '__main__': main()
