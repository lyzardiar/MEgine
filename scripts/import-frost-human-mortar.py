"""Author: MiYu. Preserve original Workshop, Mortar Team, Flare and Fragmentation Shards source rules."""
import argparse
import hashlib
import importlib
import io
import json
import pathlib
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    prior_path = SAMPLE / 'human-mortar-sources.json'
    prior = json.loads(prior_path.read_bytes()) if prior_path.exists() else {}
    files, sources, archives = {}, {}, []

    def original(path):
        if path in sources: return files['SourceAssets/HumanMortar/' + path]
        if not archives: archives.extend((name, mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
        for name, archive in reversed(archives):
            try: raw = read_archive(archive, path.replace('/', '\\')); break
            except FileNotFoundError: continue
        else: raise ValueError('Missing original Mortar source: ' + path)
        sources[path] = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/HumanMortar/' + path] = raw
        return raw

    def icons(name, art):
        result = {}
        for disabled in [False, True]:
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            target = 'Assets/Art/classic-' + name + ('-disabled' if disabled else '') + '.png'; files[target] = png.getvalue(); result['disabledIcon' if disabled else 'icon'] = target
        return result

    tables = {key: rows(original('Units/' + key + '.slk')) for key in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'UnitUI', 'UpgradeData', 'AbilityData', 'AbilityMetaData']}
    unit_func, unit_strings = [original('Units/HumanUnit' + name + '.txt') for name in ['Func', 'Strings']]
    upgrade_func, upgrade_strings = [original('Units/HumanUpgrade' + name + '.txt') for name in ['Func', 'Strings']]
    ability_func, ability_strings = [original('Units/HumanAbility' + name + '.txt') for name in ['Func', 'Strings']]
    edit_strings = dict(line.split('=', 1) for line in original('UI/WorldEditStrings.txt').decode('utf-8').splitlines() if '=' in line and not line.startswith('//'))
    armor = {'large': 'heavy', 'fort': 'fortified'}
    profiles = {}
    for kind, source, model, label in [('humanmortar', 'hmtm', 'ClassicMortarTeam', 'Mortar Team'), ('workshop', 'harm', 'KingdomWorkshop', 'Workshop')]:
        b, w, ui = [tables[key][source] for key in ['UnitBalance', 'UnitWeapons', 'UnitUI']]
        func, text = section(unit_func, source), section(unit_strings, source); mobile = source == 'hmtm'
        d = dict(sourceUnit=source, label=label, model=model, hp=int(b['HP']), armor=armor[b['defType']], armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']) if mobile else 0, time=float(b['bldtm']), speed=float(b['spd'])/100 if mobile else 0, collision=float(b['collision'])/100, radius=float(b['collision'])/100, organic=mobile, healthRegen=float(b['regenHP']) if mobile else 0, requires=func.get('Requires','').split(',') if func.get('Requires') else [], slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])), hotkey=text['Hotkey'], modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), sourceRows={key:tables[key][source] for key in ['UnitBalance','UnitWeapons','UnitAbilities','UnitUI']}, sourceFunc=func, sourceStrings=text, **icons(kind,func['Art']))
        if mobile:
            weapons = []
            for n in [1,2]:
                key = lambda field: field + str(n)
                weapons.append(dict(slot=n, targets=w[key('targs')].split(','), damage=float(w[key('avgdmg')]), attack=w[key('atkType')], weaponType=w[key('weapTp')], cooldown=float(w[key('cool')]), damagePoint=float(w[key('dmgpt')]), range=float(w[key('rangeN')])/100, minRange=float(w['minRange'])/100, dice=int(w[key('dice')]), sides=int(w[key('sides')]), bonus=float(w[key('dmgplus')]), missileSpeed=float(func['Missilespeed'])/100, missileArc=float(func['Missilearc']), splashBands=[[float(w[key(area)])/100,float(factor)] for area,factor in [('Farea',1),('Harea',w[key('Hfact')]),('Qarea',w[key('Qfact')])]] if n==1 else [], splashTargets=w[key('splashTargs')].split(',')))
            d.update(weapons=weapons, **weapons[0], antiAir=False, sight=float(b['sight'])/100, nightSight=float(b['nsight'])/100, projectile='mortar', launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100], impactHeight=float(w['impactZ'])/100)
        else: d.update(damage=0, range=0, attack='normal', antiAir=False)
        profiles[kind] = d
    research = {}
    for key in ['Rhfl','Rhfs']:
        row=tables['UpgradeData'][key];func=section(upgrade_func,key);text=section(upgrade_strings,key)
        research[key]=dict(name=text['Name'], hotkey=text['Hotkey'], tooltip=text['Ubertip'], gold=int(row['goldbase']), wood=int(row['lumberbase']), time=float(row['timebase']), requires=func['Requires'].split(','), slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])), sourceRow=row, sourceFunc=func, sourceStrings=text, **icons(key.lower(),func['Art']))
    abilities = {}
    for key in ['Afla','Afsh']:
        row=tables['AbilityData'][key];func=section(ability_func,key);text=section(ability_strings,key);metadata={k:v for k,v in tables['AbilityMetaData'].items() if key in v.get('useSpecific','').split(',')};labels={v['displayName']:edit_strings[v['displayName']] for v in metadata.values() if v.get('displayName') in edit_strings}
        abilities[key]=dict(sourceRow=row, sourceFunc=func, sourceStrings=text, sourceMetadata=metadata, sourceFieldLabels=labels, slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])), **icons(key.lower(),func['Art']))
    flare=abilities['Afla'];r=flare['sourceRow'];flare.update(duration=float(r['Dur1']), cooldown=float(r['Cool1']), radius=float(r['Area1'])/100, range=float(r['Rng1'])/100, delay=float(r['DataB1']), detectionType=int(r['DataA1']))
    shards=abilities['Afsh'];r=shards['sourceRow'];shards.update(armorTargets=['unarmored','medium'], damageBands=[[float(r['Area1'])/100,float(r['DataC1'])],[float(r['DataA1'])/100,float(r['DataD1'])],[float(r['DataB1'])/100,float(r['DataE1'])]])
    misc=section(original('Units/MiscGame.txt'),'Misc');armor_keys=['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    catalog=dict(author='MiYu', unit=profiles['humanmortar'], building=profiles['workshop'], research=research, abilities=abilities, equipmentSource='hmtm', damageTable={'siege':dict(zip(armor_keys,map(float,misc['DamageBonusSiege'].split(','))))}, references={'unit':'https://classic.battle.net/war3/human/units/mortarteam.shtml'})
    files['human-mortar.json']=encode(catalog)
    files['Assets/Licenses/Classic-Human-Mortar.txt']=b'Warcraft III Workshop, Mortar Team, Flare and Fragmentation Shards rules and icons: Blizzard Entertainment. Original game asset terms apply. Preserved MPQ bytes, archive precedence and SHA-256: human-mortar-sources.json. Existing model terms and provenance remain recorded in their original receipts.\n'
    old={r['path']:r['sha256'] for r in prior.get('files',[])}
    for path,raw in files.items():
        target=output/path
        if target.exists() and target.read_bytes()!=raw: assert sha(target.read_bytes())==old.get(path),'Preserve edited output: '+path
    for path,raw in files.items():
        target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    generators=['scripts/import-frost-human-mortar.py','scripts/import-frost-human-army.py','scripts/import-frost-wisp-rules.py','scripts/warcraft_mpq.py']
    receipt=dict(author='MiYu',sources=sorted(sources.values(),key=lambda r:r['path']),generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in generators],files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    (output/'human-mortar-sources.json').write_bytes(encode(receipt));print('PASS source Workshop/Mortar dual weapons, original Flare/Shards metadata and twelve command icons')


if __name__ == '__main__': main()
