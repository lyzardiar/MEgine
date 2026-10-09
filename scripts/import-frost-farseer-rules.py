"""Author: MiYu. Derive original Far Seer and ranked Spiritwolf rules from signed Orc tables."""
import argparse
import importlib
import json
from pathlib import Path

base = importlib.import_module('import-frost-orc-heroes')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--output', type=Path, default=SAMPLE); parser.add_argument('--source-root', type=Path, default=SAMPLE); args = parser.parse_args()
    source = args.source_root.resolve(); output = args.output.resolve(); receipt_path = output / 'farseer-rules-sources.json'
    old = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for path, r in owned.items():
        raw = (output / path).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified generated output: ' + path
    manifest = json.loads((source / 'orc-hero-sources.json').read_bytes()); signed = {r['path'].lower(): r for r in manifest['sources']}; used = {}
    def original(path):
        r = signed[path.lower()]; raw = (source / r['output']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Source fingerprint mismatch: ' + path; used[path] = r; return raw
    tables = {name: base.rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI', 'AbilityData']}
    unit_func = original('Units/OrcUnitFunc.txt'); unit_strings = original('Units/OrcUnitStrings.txt'); ability_func = original('Units/OrcAbilityFunc.txt'); ability_strings = original('Units/OrcAbilityStrings.txt')
    raw = (source / 'orc-hero-rules.json').read_bytes(); record = next(r for r in manifest['outputs'] if r['path'] == 'orc-hero-rules.json'); assert sha(raw) == record['sha256']; heroes = json.loads(raw)
    units = {}; abilities = {}; number = base.number
    ids = [heroes['abilities']['AOsf']['sourceRow']['UnitID' + str(rank)] for rank in [1, 2, 3]]
    for rank, unit in enumerate(ids, 1):
        b, w, a, ui = [tables[n][unit] for n in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'unitUI']]; func = base.section(unit_func, unit); strings = base.section(unit_strings, unit)
        ids = [id for id in a['abilList'].split(',') if id not in ['', '_', '-']]
        units[unit] = dict(id=unit, rank=rank, name=strings['Name'], hp=number(b['HP']), speed=number(b['spd']) / 100, collision=number(b['collision']) / 100, armorValue=number(b['def']), armor=b['defType'], healthRegen=number(b['regenHP']), manaRegen=number(b['regenMana']), daySight=number(b['sight']) / 100, nightSight=number(b['nsight']) / 100, model='ClassicSpiritWolf', portrait='ClassicSpiritWolfPortrait', modelScale=number(ui['modelScale']), selectionScale=number(ui['scale']), sourceModel=ui['file'], abilityIds=ids, sourceFunc=func, sourceStrings=strings, sourceRows={name: tables[name][unit] for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, weapon=dict(damage=number(w['avgdmg1']), dice=int(w['dice1']), sides=int(w['sides1']), bonus=number(w['dmgplus1']), attack=w['atkType1'], range=number(w['rangeN1']) / 100, cooldown=number(w['cool1']), damagePoint=number(w['dmgpt1']), backswing=number(w['backSw1']), missileSpeed=0, antiAir=False))
        for id in ids:
            r = tables['AbilityData'][id]; abilities[id] = dict(sourceRow=r, sourceFunc=base.section(ability_func, id), sourceStrings=base.section(ability_strings, id))
    rules = dict(author='MiYu', schemaVersion=1, unit=heroes['units']['Ofar'], abilities={id: heroes['abilities'][id] for id in heroes['units']['Ofar']['commandOrder']}, buffs=heroes['buffs'], wolves=units, wolfAbilities=abilities, misc=heroes['misc'], runtimeIntegrated=False, originalRuntimeVerified=False)
    files = {'farseer-rules.json': encode(rules)}
    for path, raw in files.items():
        if (output / path).exists() and path not in owned and (output / path).read_bytes() != raw: raise ValueError('Unowned output collision: ' + path)
    tools = ['scripts/import-frost-farseer-rules.py', 'scripts/import-frost-orc-heroes.py', 'scripts/import-frost-wisp-rules.py']
    receipt = dict(author='MiYu', sources=list(used.values()), inputs=[record], generatorHashMode='lf-text', generators=[dict(path=path, sha256=sha((ROOT / path).read_bytes().replace(b'\r\n', b'\n'))) for path in tools], outputs=[dict(path=path, bytes=len(raw), sha256=sha(raw)) for path, raw in files.items()], runtimeIntegrated=False, originalRuntimeVerified=False)
    output.mkdir(parents=True, exist_ok=True)
    for path, raw in files.items(): (output / path).write_bytes(raw)
    receipt_path.write_bytes(encode(receipt)); print('PASS Far Seer source rules:', len(used), 'signed table/text sources,', len(units), 'ranked wolves,', len(abilities), 'wolf abilities')


if __name__ == '__main__': main()
