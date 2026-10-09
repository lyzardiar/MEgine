"""Author: MiYu. Reproduce original Lich profile, spell field meanings, autocast icons and source AI."""
import argparse
import importlib
import json
import re
import uuid
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-orc-heroes')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); source = (args.source_root or SAMPLE).resolve(); output = args.output.resolve(); receipt_name = 'lich-rules-sources.json'
    old = json.loads((output / receipt_name).read_bytes()) if (output / receipt_name).exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        raw = (output / p).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified generated output: ' + p
    manifest = json.loads((source / 'undead-hero-sources.json').read_bytes()); signed = {r['path'].lower(): r for r in manifest['sources']}
    for name in ['death-knight-rules-sources.json', receipt_name]:
        if (source / name).exists(): signed.update({r['path'].lower(): r for r in json.loads((source / name).read_bytes())['sources']})
    used, files, archives = {}, {}, []
    def original(path):
        path = path.replace('\\', '/')
        if path.lower() in signed:
            r = signed[path.lower()]; raw = (source / r['output']).read_bytes()
            assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Source fingerprint mismatch: ' + path
        else:
            if args.source_root: raise ValueError('Missing signed source: ' + path)
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original source: ' + path)
            r = dict(path=path, output='SourceAssets/Lich/rules/' + path, archive=name, bytes=len(raw), sha256=sha(raw))
        used[path] = r
        if r['output'].startswith('SourceAssets/Lich/'): files[r['output']] = raw
        return raw
    try:
        raw = (source / 'undead-hero-rules.json').read_bytes(); record = next(r for r in manifest['outputs'] if r['path'] == 'undead-hero-rules.json')
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Undead hero rules fingerprint mismatch'
        heroes = json.loads(raw); unit = heroes['units']['Ulic']; ids = unit['commandOrder']; number = base.number
        metadata = base.rows(original('Units/AbilityMetaData.slk')); editor = original('UI/WorldEditStrings.txt')
        try: editor = editor.decode('utf-8-sig')
        except UnicodeDecodeError: editor = editor.decode('gb18030')
        labels = dict(line.split('=', 1) for line in editor.splitlines() if line.startswith('WESTRING_') and '=' in line)
        fields = {id: [dict(id=key, sourceRow=r, label=labels[r['displayName']]) for key, r in metadata.items() if id in r.get('useSpecific', '').split(',') and r.get('field') == 'Data'] for id in ids}
        b, w, d = [unit['sourceRows'][n] for n in ['UnitBalance', 'UnitWeapons', 'UnitData']]
        unit.update(label='Lich', model='ClassicLich', portrait='ClassicLichPortrait', initialMana=number(b['mana0']), regenerationType=b['regenType'], primary=b['Primary'], armor=b['defType'], castPoint=number(w['castpt']), castBackswing=number(w['castbsw']), movement=d['movetp'], movementHeight=number(d['moveHeight']) / 100, launch=[number(w['launchX']) / 100, number(w['launchZ']) / 100, -number(w['launchY']) / 100], weapon=dict(damage=number(w['avgdmg1']), dice=int(w['dice1']), sides=int(w['sides1']), bonus=number(w['dmgplus1']), attack=w['atkType1'], range=number(w['rangeN1']) / 100, cooldown=number(w['cool1']), damagePoint=number(w['dmgpt1']), backswing=number(w['backSw1']), antiAir='air' in w['targs1'].split(','), missileSpeed=number(unit['sourceFunc']['Missilespeed']) / 100, homing=unit['sourceFunc']['MissileHoming'] == '1'))
        abilities = {id: heroes['abilities'][id] for id in ids}
        for id, a in abilities.items():
            for level in a['levels']:
                data = level['data']
                if id == 'AUfn': level.update(areaDamage=number(data['DataA']), targetDamage=number(data['DataB']))
                elif id == 'AUfu': level.update(armorDuration=number(data['DataA']), armorBonus=number(data['DataB']))
                elif id == 'AUdr': level.update(manaConversion=number(data['DataA']), lifeConversion=number(data['DataB']), manaRatio=number(data['DataC']), lifeRatio=number(data['DataD']), targetSurvives=data['DataE'] == '1')
                else: level.update(maxLifeFractionPerSecond=number(data['DataA']), buildingReduction=number(data['DataB']))
        armor = abilities['AUfu']; off = armor['sourceFunc']['Unart']; disabled = off.replace('\\CommandButtons\\BTN', '\\CommandButtonsDisabled\\DISBTN')
        armor['autocast'] = dict(order=armor['sourceFunc']['Order'], on=armor['sourceFunc']['Orderon'], off=armor['sourceFunc']['Orderoff'])
        for key, path in [('offIcon', off), ('offDisabledIcon', disabled)]:
            dest = 'Assets/Lich/Icons/AUfu-' + ('off-disabled' if key == 'offDisabledIcon' else 'off') + '.png'; files[dest] = base.base.decode_icon(original(path)); armor['autocast'][key] = dest
            files[dest + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + dest)), importer='texture'))
        func = original('Units/UndeadAbilityFunc.txt'); effect = dict(id='XUdd', sourceFunc=base.section(func, 'XUdd'))
        assert effect['sourceFunc']['Effectart'] and effect['sourceFunc']['Effectsoundlooped']
        constants = dict(re.findall(r'constant integer\s+(\w+)\s*=\s*\x27(.{4})\x27', original('Scripts/common.ai').decode('utf-8-sig')))
        skills, builds = {}, {}
        for line in original('Scripts/undead.ai').decode('utf-8-sig').splitlines():
            match = re.search(r'set skill\[\s*(\d+)\]\s*=\s*(\w+)', line)
            if match: skills[int(match[1])] = match[2]
            match = re.search(r'SetSkillArray\(([123]),LICH\)', line)
            if match: builds[{'1': 'first', '2': 'later', '3': 'third'}[match[1]]] = [ids.index(constants[skills[n]]) for n in range(1, 11)]
        assert set(builds) == {'first', 'later', 'third'}
        misc = base.section(original('Units/MiscGame.txt'), 'Misc')
        rules = dict(author='MiYu', schemaVersion=1, unit=unit, abilities=abilities, buffs={id: heroes['buffs'][id] for id in ['Bfro', 'BUfa', 'BUdd']}, effects={'XUdd': effect}, skillBuilds=builds, fieldMetadata=fields, misc=misc, runtimeIntegrated=False, originalRuntimeVerified=False)
        files['lich-rules.json'] = encode(rules)
        files['Assets/Licenses/Classic-Lich-Rules.txt'] = b'Original Warcraft III rules and icons belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source archives, hashes and generator: lich-rules-sources.json.\n'
        for p, raw in files.items():
            if (output / p).exists() and p not in owned: assert (output / p).read_bytes() == raw, 'Unowned output collision: ' + p
        tools = ['scripts/import-frost-lich-rules.py', 'scripts/import-frost-orc-heroes.py', 'scripts/import-frost-entangled-assets.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py']
        receipt = dict(author='MiYu', sources=list(used.values()), inputs=[dict(path='undead-hero-rules.json', bytes=record['bytes'], sha256=record['sha256'])], generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], runtimeIntegrated=False, originalRuntimeVerified=False)
        for p, raw in files.items():
            dest = output / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        (output / receipt_name).write_bytes(encode(receipt)); print('PASS original Lich profile, ranked field meanings, frost constants, autocast icons and AI')
    finally:
        for _, archive in archives: archive.file.close()


if __name__ == '__main__': main()
