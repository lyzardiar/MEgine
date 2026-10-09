"""Author: MiYu. Reproduce original Dreadlord spells, Infernal attributes and passive source fields."""
import argparse
import importlib
import json
import re
import uuid
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-orc-heroes')
portrait = importlib.import_module('import-frost-dryad-portrait')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); source = (args.source_root or SAMPLE).resolve(); output = args.output.resolve(); receipt_name = 'dreadlord-rules-sources.json'
    old = json.loads((output / receipt_name).read_bytes()) if (output / receipt_name).exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        raw = (output / p).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified generated output: ' + p
    manifest = json.loads((source / 'undead-hero-sources.json').read_bytes()); signed = {r['path'].lower(): r for r in manifest['sources']}
    for name in ['death-knight-rules-sources.json', 'undead-hero-art-sources.json', 'dreadlord-effects-sources.json', receipt_name]:
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
            r = dict(path=path, output='SourceAssets/Dreadlord/rules/' + path, archive=name, bytes=len(raw), sha256=sha(raw))
        used[path] = r
        if r['output'].startswith('SourceAssets/Dreadlord/rules/'): files[r['output']] = raw
        return raw
    def icons(key, path):
        disabled = path.replace('\\CommandButtons\\BTN', '\\CommandButtonsDisabled\\DISBTN').replace('\\PassiveButtons\\PASBTN', '\\CommandButtonsDisabled\\DISPASBTN'); result = {}
        for field, icon in [('icon', path), ('disabledIcon', disabled)]:
            dest = 'Assets/Dreadlord/Icons/' + key + ('-disabled' if field == 'disabledIcon' else '') + '.png'; files[dest] = base.base.decode_icon(original(icon)); result[field] = dest
            files[dest + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + dest)), importer='texture'))
        return result
    number = base.number
    def weapon(w):
        return dict(damage=number(w['avgdmg1']), dice=int(w['dice1']), sides=int(w['sides1']), bonus=number(w['dmgplus1']), attack=w['atkType1'], type=w['weapTp1'], targets=w['targs1'], range=number(w['rangeN1']) / 100, cooldown=number(w['cool1']), damagePoint=number(w['dmgpt1']), backswing=number(w['backSw1']), antiAir='air' in w['targs1'].split(','))
    try:
        raw = (source / 'undead-hero-rules.json').read_bytes(); record = next(r for r in manifest['outputs'] if r['path'] == 'undead-hero-rules.json')
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Undead hero rules fingerprint mismatch'
        heroes = json.loads(raw); unit = heroes['units']['Udre']; ids = unit['commandOrder']
        metadata = base.rows(original('Units/AbilityMetaData.slk')); editor = original('UI/WorldEditStrings.txt')
        try: editor = editor.decode('utf-8-sig')
        except UnicodeDecodeError: editor = editor.decode('gb18030')
        labels = dict(line.split('=', 1) for line in editor.splitlines() if line.startswith('WESTRING_') and '=' in line)
        def fields(id): return [dict(id=key, sourceRow=r, label=labels[r['displayName']]) for key, r in metadata.items() if id in r.get('useSpecific', '').split(',') and r.get('field') == 'Data']
        b, w, d = [unit['sourceRows'][n] for n in ['UnitBalance', 'UnitWeapons', 'UnitData']]
        unit.update(label='Dreadlord', model='ClassicDreadLord', portrait='ClassicDreadLordPortrait', initialMana=number(b['mana0']), regenerationType=b['regenType'], primary=b['Primary'], armor=b['defType'], castPoint=number(w['castpt']), castBackswing=number(w['castbsw']), movement=d['movetp'], movementHeight=number(d['moveHeight']) / 100, weapon=weapon(w))
        abilities = {id: heroes['abilities'][id] for id in ids}
        for id, a in abilities.items():
            for level in a['levels']:
                data = level['data']
                if id == 'AUcs': level.update(damage=number(data['DataA']), maxDamage=number(data['DataB']), distance=number(data['DataC']) / 100, endRadius=number(data['DataD']) / 100, missileSpeed=number(a['sourceFunc']['Missilespeed']) / 100)
                elif id == 'AUsl': level.update(stunDuration=number(data['DataA']))
                elif id == 'AUav': level.update(lifeStealFraction=number(data['DataA']))
                else: level.update(landingDamage=number(data['DataA']), summonDuration=number(data['DataB']), impactDelay=number(data['DataC']), summon=a['sourceRow']['UnitID' + str(level['rank'])])
        tables = {n: base.rows(original('Units/' + n + '.slk')) for n in ['UnitBalance', 'UnitWeapons', 'UnitData', 'UnitAbilities', 'unitUI', 'AbilityData', 'AbilityBuffData']}
        source_rows = {n: tables[n]['ninf'] for n in ['UnitBalance', 'UnitWeapons', 'UnitData', 'UnitAbilities', 'unitUI']}; b, w, d, ui = [source_rows[n] for n in ['UnitBalance', 'UnitWeapons', 'UnitData', 'unitUI']]
        uf, us, af, ast = [original('Units/Neutral' + name + '.txt') for name in ['UnitFunc', 'UnitStrings', 'AbilityFunc', 'AbilityStrings']]; cf = original('Units/CommonAbilityFunc.txt')
        func, strings = base.section(uf, 'ninf'), base.section(us, 'ninf'); passive_ids = source_rows['UnitAbilities']['abilList'].split(',')
        infernal = dict(id='ninf', label='Infernal', name=strings['Name'], model='ClassicInfernal', portrait='ClassicInfernalPortrait', hp=number(b['HP']), healthRegen=number(b['regenHP']), regenerationType=b['regenType'], armorValue=number(b['def']), armor=b['defType'], speed=number(b['spd']) / 100, collision=number(b['collision']) / 100, daySight=number(b['sight']) / 100, nightSight=number(b['nsight']) / 100, modelScale=number(ui['modelScale']), selectionScale=number(ui['scale']), movement=d['movetp'], movementHeight=number(d['moveHeight']) / 100, sourceAutoSleep=d['canSleep'] == '1', weapon=weapon(w), abilityIds=passive_ids, sourceRows=source_rows, sourceFunc=func, sourceStrings=strings, **icons('ninf', func['Art']))
        passives, buffs = {}, {id: heroes['buffs'][id] for id in ['BUcs', 'BUsl', 'BUsp', 'Bust', 'BUav', 'BNin']}
        for id in passive_ids:
            r, f, text = tables['AbilityData'][id], base.section(af, id), base.section(ast, id)
            levels = []
            for rank in range(1, int(r['levels']) + 1):
                get = lambda key: number(r[key + str(rank)])
                level = dict(rank=rank, radius=get('Area') / 100, duration=get('Dur'), heroDuration=get('HeroDur'), targets=r['targs' + str(rank)], data={k: r[k + str(rank)] for k in ['DataA', 'DataB', 'DataC']}, buffs=r.get('BuffID' + str(rank), '').split(','))
                if id == 'ANpi': level.update(damagePerInterval=number(level['data']['DataA']), manaDrain=number(level['data']['DataB']), bufferMana=number(level['data']['DataC']))
                elif id == 'ACmi': level.update(magicDamageFactor=number(level['data']['DataA']))
                levels.append(level)
                for buff in level['buffs']:
                    if buff not in ['', '_', '-']: buffs[buff] = dict(sourceRow=tables['AbilityBuffData'][buff], sourceFunc=base.section(af, buff) or base.section(cf, buff))
            passives[id] = dict(id=id, code=r['code'], name=text['Name'], passive=True, slot=base.slot(f['Buttonpos']), levels=levels, sourceRow=r, sourceFunc=f, sourceStrings=text, **icons(id, f['Art']))
        constants = dict(re.findall(r'constant integer\s+(\w+)\s*=\s*\x27(.{4})\x27', original('Scripts/common.ai').decode('utf-8-sig'))); skills, builds = {}, {}
        for line in original('Scripts/undead.ai').decode('utf-8-sig').splitlines():
            match = re.search(r'set skill\[\s*(\d+)\]\s*=\s*(\w+)', line)
            if match: skills[int(match[1])] = match[2]
            match = re.search(r'SetSkillArray\(([123]),DREAD_LORD\)', line)
            if match: builds[{'1': 'first', '2': 'later', '3': 'third'}[match[1]]] = [ids.index(constants[skills[n]]) for n in range(1, 11)]
        assert set(builds) == {'first', 'later', 'third'}
        rules = dict(author='MiYu', schemaVersion=1, unit=unit, abilities=abilities, infernal=infernal, infernalAbilities=passives, buffs=buffs, skillBuilds=builds, fieldMetadata={id: fields(id) for id in [*ids, *passive_ids]}, misc=base.section(original('Units/MiscGame.txt'), 'Misc'), runtimeIntegrated=False, originalRuntimeVerified=False)
        files['dreadlord-rules.json'] = encode(rules)
        cameras = {}
        for key, path in [('ClassicInfernalPortrait', 'Units/Demon/Infernal/Infernal_Portrait.mdx'), ('ClassicDreadLordPortrait', 'Units/Undead/HeroDreadLord/HeroDreadLord_Portrait.mdx')]:
            raw = original(path); cameras[key] = dict(sourceModel=path, sourceSha256=sha(raw), **portrait.convert(raw))
        files['dreadlord-portraits.json'] = encode(cameras)
        files['Assets/Licenses/Classic-Dreadlord-Rules.txt'] = b'Original Warcraft III rules and icons belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source archives, hashes and generator: dreadlord-rules-sources.json.\n'
        files['Assets/Licenses/Classic-Dreadlord-Art.txt'] = b'Original Warcraft III Dreadlord/Infernal models, portraits, spell effects and textures belong to Blizzard Entertainment. Converter MIT license covers the converter code, not the artwork. Extraction does not establish a free redistribution license. Source archives, SHA-256 fingerprints and reproducible generators: dreadlord-effects-sources.json and dreadlord-rules-sources.json.\n'
        for prefix in ['Assets/Dreadlord/', 'SourceAssets/Dreadlord/']: files[prefix + '.gitattributes'] = b'* -text whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof\n'
        for p, raw in files.items():
            if (output / p).exists() and p not in owned: assert (output / p).read_bytes() == raw, 'Unowned output collision: ' + p
        tools = ['scripts/import-frost-dreadlord-rules.py', 'scripts/import-frost-dryad-portrait.py', 'scripts/import-frost-orc-heroes.py', 'scripts/import-frost-entangled-assets.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py']
        receipt = dict(author='MiYu', sources=list(used.values()), inputs=[dict(path='undead-hero-rules.json', bytes=record['bytes'], sha256=record['sha256'])], generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], runtimeIntegrated=False, originalRuntimeVerified=False)
        for p, raw in files.items():
            dest = output / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        (output / receipt_name).write_bytes(encode(receipt)); print('PASS original Dreadlord ranked spell meanings, Infernal/passive source rules and AI')
    finally:
        for _, archive in archives: archive.file.close()


if __name__ == '__main__': main()
