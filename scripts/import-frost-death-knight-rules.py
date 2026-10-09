"""Author: MiYu. Derive Death Knight rules, classifications and editor meanings from signed original sources."""
import argparse
import importlib
import json
import re
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-orc-heroes')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-root', type=Path, default=SAMPLE)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); source = args.source_root.resolve(); output = args.output.resolve(); filename = 'death-knight-rules-sources.json'
    old = json.loads((output / filename).read_bytes()) if (output / filename).exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        raw = (output / p).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified generated output: ' + p
    manifest = json.loads((source / 'undead-hero-sources.json').read_bytes())
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
            r = dict(path=path, output='SourceAssets/DeathKnight/rules/' + path, archive=name, bytes=len(raw), sha256=sha(raw))
        used[path] = r
        if r['output'].startswith('SourceAssets/DeathKnight/'): files[r['output']] = raw
        return raw
    try:
        raw = (source / 'undead-hero-rules.json').read_bytes(); record = next(r for r in manifest['outputs'] if r['path'] == 'undead-hero-rules.json')
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Undead hero rules fingerprint mismatch'
        heroes = json.loads(raw); unit = heroes['units']['Udea']; ids = unit['commandOrder']; number = base.number
        metadata = base.rows(original('Units/AbilityMetaData.slk')); editor = original('UI/WorldEditStrings.txt')
        try: editor = editor.decode('utf-8-sig')
        except UnicodeDecodeError: editor = editor.decode('gb18030')
        labels = dict(line.split('=', 1) for line in editor.splitlines() if line.startswith('WESTRING_') and '=' in line)
        fields = {id: [dict(id=key, sourceRow=r, label=labels[r['displayName']]) for key, r in metadata.items() if id in r.get('useSpecific', '').split(',') and r.get('field') == 'Data'] for id in ids}
        tables = {n: base.rows(original('Units/' + n + '.slk')) for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']}
        b, w = unit['sourceRows']['UnitBalance'], unit['sourceRows']['UnitWeapons']
        unit.update(label='Death Knight', model='ClassicDeathKnight', portrait='ClassicDeathKnightPortrait', initialMana=number(b['mana0']), regenerationType=b['regenType'], primary=b['Primary'], armor=b['defType'], launch=[number(w['launchX']) / 100, number(w['launchZ']) / 100, -number(w['launchY']) / 100], weapon=dict(damage=number(w['avgdmg1']), dice=int(w['dice1']), sides=int(w['sides1']), bonus=number(w['dmgplus1']), attack=w['atkType1'], range=number(w['rangeN1']) / 100, cooldown=number(w['cool1']), damagePoint=number(w['dmgpt1']), backswing=number(w['backSw1']), antiAir='air' in w['targs1'].split(',')))
        abilities = {id: heroes['abilities'][id] for id in ids}
        for id, ability in abilities.items():
            for level in ability['levels']:
                data = level['data']
                if id == 'AUdc': level.update(heal=number(data['DataA']), damage=number(data['DataA']) / 2, missileSpeed=number(ability['sourceFunc']['Missilespeed']) / 100, homing=ability['sourceFunc']['MissileHoming'] == '1')
                elif id == 'AUdp': level.update(manaConversion=number(data['DataA']), lifeConversion=number(data['DataB']), manaRatio=number(data['DataC']), lifeRatio=number(data['DataD']), targetSurvives=data['DataE'] == '1')
                elif id == 'AUau': level.update(speedBonus=number(data['DataA']), regenerationBonus=number(data['DataB']), percentageRegeneration=data['DataC'] == '1')
                else: level.update(count=int(number(data['DataA'])), invulnerable=data['DataB'] == '1', inheritUpgrades=data['DataC'] == '1')
        classification = {id: dict(race=d.get('race', ''), deathType=int(number(d.get('deathType', '0'))), targets=d.get('targType', ''), type=tables['UnitBalance'][id].get('type', '')) for id, d in tables['UnitData'].items() if id in tables['UnitBalance']}
        revival = {}
        for id, c in classification.items():
            b = tables['UnitBalance'][id]
            if not c['deathType'] & 1 or number(b['isbldg']): continue
            d, w, ui = [tables[n][id] for n in ['UnitData', 'UnitWeapons', 'unitUI']]
            weapons = {slot: dict(damage=number(w['avgdmg' + slot]), dice=int(number(w['dice' + slot])), sides=int(number(w['sides' + slot])), bonus=number(w['dmgplus' + slot]), attack=w['atkType' + slot], range=number(w['rangeN' + slot]) / 100, cooldown=number(w['cool' + slot]), damagePoint=number(w['dmgpt' + slot]), backswing=number(w['backSw' + slot]), targets=w['targs' + slot], weaponType=w['weapTp' + slot]) for slot in ['1', '2'] if int(number(w['weapsOn'])) & int(slot)}
            revival[id] = dict(sourceUnit=id, hp=number(b['HP']), mana=number(b['manaN']), initialMana=number(b['mana0']), speed=number(b['spd']) / 100, armorValue=number(b['def']), armor=b['defType'], collision=number(b['collision']) / 100, healthRegen=number(b['regenHP']), manaRegen=number(b['regenMana']), regenerationType=b['regenType'], daySight=number(b['sight']) / 100, nightSight=number(b['nsight']) / 100, movement=d['movetp'], sourceModel=ui['file'], modelScale=number(ui['modelScale']), selectionScale=number(ui['scale']), abilityIds=[v for v in tables['UnitAbilities'][id]['abilList'].split(',') if v not in ['', '_', '-']], weapons=weapons)
        constants = dict(re.findall(r'constant integer\s+(\w+)\s*=\s*\x27(.{4})\x27', original('Scripts/common.ai').decode('utf-8-sig')))
        skill = {}; builds = {}
        for line in original('Scripts/undead.ai').decode('utf-8-sig').splitlines():
            match = re.search(r'set skill\[\s*(\d+)\]\s*=\s*(\w+)', line)
            if match: skill[int(match[1])] = match[2]
            match = re.search(r'SetSkillArray\(([123]),DEATH_KNIGHT\)', line)
            if match: builds[{'1': 'first', '2': 'later', '3': 'third'}[match[1]]] = [ids.index(constants[skill[n]]) for n in range(1, 11)]
        assert set(builds) == {'first', 'later', 'third'}
        rules = dict(author='MiYu', schemaVersion=1, unit=unit, abilities=abilities, buffs={id: heroes['buffs'][id] for id in ['BUau', 'BUan']}, classifications=classification, revivalUnits=revival, skillBuilds=builds, fieldMetadata=fields, misc=heroes['misc'], runtimeIntegrated=False, originalRuntimeVerified=False)
        files['death-knight-rules.json'] = encode(rules)
        for p, raw in files.items():
            if (output / p).exists() and p not in owned: assert (output / p).read_bytes() == raw, 'Unowned output collision: ' + p
        tools = ['scripts/import-frost-death-knight-rules.py', 'scripts/import-frost-orc-heroes.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py']
        result = dict(author='MiYu', sources=list(used.values()), inputs=[dict(path='undead-hero-rules.json', bytes=record['bytes'], sha256=record['sha256'])], generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], runtimeIntegrated=False, originalRuntimeVerified=False)
        for p, raw in files.items():
            dest = output / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        (output / filename).write_bytes(encode(result)); print('PASS original Death Knight rules, classifications, AI and editor field meanings')
    finally:
        for _, archive in archives: archive.file.close()


if __name__ == '__main__': main()
