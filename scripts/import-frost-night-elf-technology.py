"""Author: MiYu. Preserve original Ancient of War and Hunter's Hall research, effects and icons."""
import argparse
import csv
import importlib
import json
import pathlib
import re
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-entangled-assets')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-natures-blessing').section
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
BUILDINGS = {'eaom': ['Resc', 'Reib', 'Remk', 'Remg', 'Repb'], 'edob': ['Resm', 'Rema', 'Resw', 'Rerh', 'Reuv', 'Rews']}
IDS = [key for research in BUILDINGS.values() for key in research]
REFERENCES = {
    'sentinel': 'https://classic.battle.net/war3/nightelf/units/huntress.shtml',
    'vorpalBlades': 'https://classic.battle.net/war3/nightelf/units/glaivethrower.shtml',
}


def numeric(value):
    return None if value.strip() in ['', '-', '_'] else float(value)


def ranks(value, count):
    result = next(csv.reader([value]))
    assert len(result) == count, ('Unexpected research rank count', count, value)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    previous_path = SAMPLE / 'night-elf-technology-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    signed = {}
    for receipt in [previous] + [json.loads((SAMPLE / (name + '-sources.json')).read_bytes()) for name in ['natures-blessing', 'ancient-war', 'wisp-rule', 'detonate']]:
        for record in receipt.get('sources', []):
            path = record['path'].replace('\\', '/')
            if path in signed: assert all(signed[path][key] == record[key] for key in ['bytes', 'sha256']), 'Conflicting signed source: ' + path
            signed[path] = dict(record, path=path)
    files, sources, archives = {}, {}, []

    def original(path):
        if path in sources: return files['SourceAssets/WarcraftIII/' + path]
        record = signed.get(path)
        if record:
            raw = (SAMPLE / 'SourceAssets/WarcraftIII' / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Invalid signed source: ' + path
        else:
            if not archives: archives.extend((name, mpyq.MPQArchive(str(args.game / name))) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Night Elf technology source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/WarcraftIII/' + path] = raw; sources[path] = record
        return raw

    upgrade, balance, weapons, abilities, ability_data = [rows(original('Units/' + name + '.slk')) for name in ['UpgradeData', 'UnitBalance', 'UnitWeapons', 'UnitAbilities', 'AbilityData']]
    unit_func = original('Units/NightElfUnitFunc.txt')
    upgrade_func = original('Units/NightElfUpgradeFunc.txt')
    upgrade_strings = original('Units/NightElfUpgradeStrings.txt')
    ability_func = original('Units/NightElfAbilityFunc.txt')
    ability_meta = rows(original('Units/AbilityMetaData.slk'))
    effect_meta = rows(original('Units/UpgradeEffectMetaData.slk'))
    editor_strings = section(original('UI/WorldEditStrings.txt').removeprefix(b'\xef\xbb\xbf'), 'WorldEditStrings')
    assert '\ufffd' not in upgrade_strings.decode('utf-8'), 'Damaged original research localization'
    buildings = {}
    for building, expected in BUILDINGS.items():
        func = section(unit_func, building)
        assert func['Researches'].split(',') == expected, 'Changed original research list: ' + building
        buildings[building] = dict(researches=expected, sourceFunc=func)

    research = {}
    for key in IDS:
        row, art, text = upgrade[key], section(upgrade_func, key), section(upgrade_strings, key)
        count = int(row['maxlevel'])
        names, hotkeys, tips, tooltips, icons = [ranks(value, count) for value in [text['Name'], text['Hotkey'], text['Tip'], text['Ubertip'], art['Art']]]
        x, y = map(int, art['Buttonpos'].split(','))
        assert 0 <= x < 4 and 0 <= y < 3 and count == int(art.get('Requirescount', '1'))
        effects = []
        for n in range(1, 5):
            code = row['effect' + str(n)]
            if code == '_': continue
            metadata = {k: v for k, v in effect_meta.items() if v['effectID'] == code}
            labels = {k: editor_strings[v['displayName']] for k, v in metadata.items()}
            effects.append(dict(code=code, base=numeric(row['base' + str(n)]), mod=numeric(row['mod' + str(n)]), sourceCode=row['code' + str(n)], sourceMetadata=metadata, sourceLabels=labels))
        affected = sorted(k for k, unit in balance.items() if key in unit.get('upgrades', '').split(','))
        assert affected, 'Research without original unit bindings: ' + key
        levels = []
        for n in range(count):
            source_icon = icons[n].replace('\\', '/')
            icon = 'Assets/Art/classic-research-' + key + '-' + str(n + 1)
            for disabled in [False, True]:
                path = source_icon.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN') if disabled else source_icon
                files[icon + ('-disabled' if disabled else '') + '.png'] = base.decode_icon(original(path))
            requirement = art.get('Requires' + (str(n) if n else ''), '')
            amounts = art.get('Requiresamount' + (str(n) if n else ''), '')
            requirements = requirement.split(',') if requirement else []
            counts = list(map(int, amounts.split(','))) if amounts else [1] * len(requirements)
            assert len(requirements) == len(counts)
            values = {effect['code']: effect['base'] + (effect['mod'] or 0) * n if effect['base'] is not None else None for effect in effects}
            levels.append(dict(rank=n + 1, name=names[n], hotkey=hotkeys[n], tip=tips[n], tooltip=tooltips[n], gold=int(row['goldbase']) + int(row['goldmod']) * n, wood=int(row['lumberbase']) + int(row['lumbermod']) * n, time=float(row['timebase']) + float(row['timemod']) * n, requires=[dict(id=r, amount=c) for r, c in zip(requirements, counts)], icon=icon + '.png', disabledIcon=icon + '-disabled.png', effects=values))
        research[key] = dict(building=next(b for b, ids in BUILDINGS.items() if key in ids), slot=x + y * 4, maxLevel=count, units=affected, levels=levels, effects=effects, sourceRow=row, sourceFunc=art, sourceStrings=text)

    assert sum(r['maxLevel'] for r in research.values()) == 19
    units = {}
    for key in sorted({u for r in research.values() for u in r['units']}):
        b, w = balance[key], weapons[key]
        attack = {}
        for n in [1, 2]:
            dice, sides = numeric(w['dice' + str(n)]), numeric(w['sides' + str(n)])
            attack[str(n)] = dict(dice=dice, sides=sides, bonus=numeric(w['dmgplus' + str(n)]), averageDiceDamage=(sides + 1) / 2 if sides is not None and sides > 0 else 0, range=numeric(w['rangeN' + str(n)]), spillDistance=numeric(w['spillDist' + str(n)]), spillRadius=numeric(w['spillRadius' + str(n)]), targets=w['targs' + str(n)].split(','))
        units[key] = dict(upgrades=b['upgrades'].split(','), armor=numeric(b['def']), armorPerRank=numeric(b['defUp']), daySight=float(b['sight']), nightSight=float(b['nsight']), maxMana=numeric(b['manaN']), initialMana=numeric(b['mana0']), manaRegen=numeric(b['regenMana']), hpRegenType=b['regenType'], weapons=attack, sourceRows=dict(UnitBalance=b, UnitWeapons=w, UnitAbilities=abilities[key]))
    # MiYu: Upgrade bindings are authoritative; class=melee/ranged does not define target units.
    assert research['Resm']['units'] == ['earc', 'ebal', 'ehpr', 'ensh', 'esen', 'eshd', 'nhea']
    assert 'ebal' not in research['Rema']['units'] and 'edoc' not in research['Resw']['units']
    assert research['Rews']['units'] == ['emow']
    sentinel = ability_data['Aesn']; sentinel_art = section(ability_func, 'Aesn')
    assert sentinel_art['Requires'] == 'Resc' and sentinel['targs1'] == 'tree,vuln,invu' and sentinel['Dur1'] == '0' and sentinel['DataD1'] == '1'
    assert 'Aesn' in abilities['esen']['abilList'].split(',')
    sentinel_meta = {k: ability_meta[k] for k in ['Esn1', 'Esn2', 'Esn3', 'Esn4']}
    for n, meta in enumerate(sentinel_meta.values(), 1): assert meta['useSpecific'] == 'Aesn' and meta['data'] == str(n)
    moon_well = ability_data['Ambt']; moon_meta = {k: ability_meta[k] for k in ['Mbt1', 'Mbt2', 'Mbt3', 'Mbt4', 'Mbt5']}
    assert 'Ambt' in abilities['emow']['abilList'].split(',') and moon_well['DataE1'] == '1'
    special = dict(
        sentinel=dict(sourceAbility='Aesn', usesPerUnit=1, range=float(sentinel['Rng1']), mana=float(sentinel['Cost1']), duration=float(sentinel['Dur1']), durationZeroMeansUnlimited=True, flightSight=float(sentinel['DataA1']), perchedSight=float(sentinel['DataB1']), perchedHeight=float(sentinel['DataC1']), count=int(sentinel['DataD1']), detectsInvisible=True, dispellable=True, removedOnAnchoredTreeDamage=True, sourceRow=sentinel, sourceFunc=sentinel_art, sourceMetadata=sentinel_meta, sourceLabels={k: editor_strings[v['displayName']] for k, v in sentinel_meta.items()}, ruleReference=REFERENCES['sentinel']),
        moonGlaive=dict(sourceUnit='esen', originalTargets=int(weapons['esen']['targCount1']), upgradedTargets=int(weapons['esen']['targCount1']) + int(upgrade['Remg']['base1']), damageLoss=float(weapons['esen']['damageLoss1'])),
        vorpalBlades=dict(sourceUnit='ebal', spillDistanceBonus=float(upgrade['Repb']['base1']), spillRadius=float(weapons['ebal']['spillRadius1']), enabledWeaponMask=int(upgrade['Repb']['base2']), minRange=float(weapons['ebal']['minRange']), attackGroundSpills=False, spillDamagesTrees=False, directAttackTargetsTrees=True, attackGroundDamagesMultipleTrees=True, ruleReference=REFERENCES['vorpalBlades']),
        ultravision=dict(nightSightEqualsDaySight=True, units=research['Reuv']['units']),
        wellSpring=dict(sourceUnit='emow', sourceAbility='Ambt', regeneratesOnlyAtNight=bool(int(moon_well['DataE1'])), healthPerWellMana=float(moon_well['DataA1']), targetManaPerWellMana=float(moon_well['DataB1']), maxManaBonus=float(upgrade['Rews']['base1']), manaRegenMultiplier=1 + float(upgrade['Rews']['base2']), upgradedMaxMana=units['emow']['maxMana'] + float(upgrade['Rews']['base1']), upgradedManaRegen=round(units['emow']['manaRegen'] * (1 + float(upgrade['Rews']['base2'])), 6), sourceAbilityRow=moon_well, sourceMetadata=moon_meta, sourceLabels={k: editor_strings[v['displayName']] for k, v in moon_meta.items()}),
    )
    assert special['moonGlaive']['upgradedTargets'] == 3
    catalog = dict(author='MiYu', schemaVersion=1, sourceUnitsPerWorldUnit=100, localization='zh-CN', buildings=buildings, research=research, units=units, specialRules=special)
    files['night-elf-technology.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Night-Elf-Technology.txt'] = b'Original Warcraft III research tables, localization and command icons: Blizzard Entertainment. Original game asset terms apply; download or extraction does not grant a free redistribution license. Source paths, archive identities, SHA-256 signatures and generator are recorded in night-elf-technology-sources.json. Supplementary gameplay rules cite Blizzard unit references in night-elf-technology.json.\n'
    generator = 'scripts/import-frost-night-elf-technology.py'
    receipt = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=[sources[p] for p in sorted(sources)], files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    files['night-elf-technology-sources.json'] = encode(receipt)
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    if previous: old['night-elf-technology-sources.json'] = sha(encode(previous))
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Night Elf technology output: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    print('PASS original Night Elf technology: 11 research IDs / 19 ranks / 38 icons, original bindings, localization and source effect semantics')


if __name__ == '__main__': main()
