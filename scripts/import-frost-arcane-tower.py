"""Author: MiYu. Preserve original Arcane Tower rules, abilities, icons and shared tower body."""
import argparse
import hashlib
import importlib
import io
import copy
import subprocess
from PIL import Image
import json
from pathlib import Path
import sys
import uuid
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--library', type=Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'arcane-tower-sources.json'; source_root = 'SourceAssets/ArcaneTower/'
    retained_path = args.source_sample / receipt_name
    retained = json.loads(retained_path.read_bytes()) if retained_path.exists() else {}
    old_path = output / receipt_name
    previous = json.loads(old_path.read_bytes()) if old_path.exists() else {}
    files, sources, archives = {}, {}, []
    for record in previous.get('files', []):
        raw = (output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Preserve edited output: ' + record['path']

    def original(path):
        record = next((r for r in retained.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (args.source_sample / source_root / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files[source_root + path] = raw; sources[path] = record
        return raw

    rows = importlib.import_module('import-frost-wisp-rules').rows
    section = importlib.import_module('import-frost-human-army').section
    w = rows(original('Units/UnitWeapons.slk'))['hatw']
    f = section(original('Units/HumanUnitFunc.txt'), 'hatw')
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    assert w['weapsOn'] == '1' and w['weapTp1'] == 'missile' and w['atkType1'] == 'pierce'
    weapon = dict(sourceUnit='hatw', damage=float(w['avgdmg1']), bonus=int(w['dmgplus1']), dice=int(w['dice1']), sides=int(w['sides1']), range=float(w['rangeN1'])/100, acquisition=float(w['acquire'])/100, rangeBuffer=float(w['RngBuff1'])/100, cooldown=float(w['cool1']), damagePoint=float(w['dmgpt1']), backswing=float(w['backSw1']), attack=w['atkType1'], antiAir='air' in w['targs1'].split(','), targets=w['targs1'].split(','), missileSpeed=float(f['Missilespeed'])/100, missileArc=float(f['Missilearc']), launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100], impactHeight=float(w['impactZ'])/100, projectile='arcane-tower', sourceRow=w, sourceFunc=f)
    armor = ['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    b = rows(original('Units/UnitBalance.slk'))['hatw']; ui = rows(original('Units/UnitUI.slk'))['hatw']; abilities = rows(original('Units/UnitAbilities.slk'))['hatw']
    strings = section(original('Units/HumanUnitStrings.txt'), 'hatw')
    unit = dict(sourceUnit='hatw', label='Arcane Tower', hp=int(b['HP']), armorValue=float(b['def']), armorPerRank=float(b['defUp']), armor='heavy', gold=int(b['goldcost']), wood=int(b['lumbercost']), time=float(b['bldtm']), speed=0, mana=0, sourceBalance=b, sourceFunc=f, sourceStrings=strings, sourceUI=ui, sourceAbilities=abilities)
    def icons(name, art):
        result = {}
        for disabled in [False, True]:
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            target = 'Assets/Art/classic-arcane-tower-' + name + ('-disabled' if disabled else '') + '.png'
            files[target] = png.getvalue(); result['disabledIcon' if disabled else 'icon'] = target
            files[target+'.meta'] = encode(dict(guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+target))))
        return result
    unit.update(icons('unit', f['Art']))
    ability_rows = rows(original('Units/AbilityData.slk')); metadata = rows(original('Units/AbilityMetaData.slk'))
    ability_func = original('Units/HumanAbilityFunc.txt'); ability_strings = original('Units/HumanAbilityStrings.txt')
    powers = {}
    for key in ['Afbt', 'AHta']:
        row = ability_rows[key]; func = section(ability_func, key); text = section(ability_strings, key)
        x, y = map(int, func.get('Buttonpos', func.get('ButtonPos')).split(','))
        powers[key] = dict(sourceRow=row, sourceFunc=func, sourceStrings=text, sourceMetadata={k:v for k,v in metadata.items() if row['code'] in v.get('useSpecific','').split(',')}, name='Feedback' if key=='Afbt' else 'Reveal', slot=y*4+x, **icons(key.lower(),func['Art']))
    feedback = powers['Afbt']; r = feedback['sourceRow']
    feedback.update(manaBurn=float(r['DataA1']),damageRatio=float(r['DataB1']),heroManaBurn=float(r['DataC1']),heroDamageRatio=float(r['DataD1']),summonedDamage=float(r['DataE1']),targets=r['targs1'].split(','))
    reveal = powers['AHta']; r = reveal['sourceRow']
    reveal.update(cooldown=float(r['Cool1']),duration=float(r['Dur1']),manaCost=float(r['Cost1']),radius=float(r['Area1'])/100,range=float(r['Rng1'])/100,detectionType=int(r['DataA1']),requires=reveal['sourceFunc']['Requires'],hotkey=reveal['sourceStrings']['Hotkey'])
    files['arcane-tower.json'] = encode(dict(author='MiYu',unit=unit,weapon=weapon,abilities=powers,damageTable=dict(pierce=dict(zip(armor,map(float,misc['DamageBonusPierce'].split(',')))))))
    tower_path = 'Buildings/Human/HumanTower/HumanTower.mdx'
    tower_raw = original(tower_path)
    tower_sources = json.loads((args.library/'game-ready/asset-sources.json').read_bytes())
    assert next(r for r in tower_sources['sourceFiles'] if r['path'].replace('\\','/').lower() == tower_path.lower())['sha256'] == sha(tower_raw)
    catalog = json.loads((args.source_sample/'model-catalog.json').read_bytes())
    tower = copy.deepcopy(catalog['KingdomTower']); tower['classicTier'] = 4
    assert 'HumanTower' in tower['sourceModel'] and tower['animations'][9]['name'] == 'Stand Upgrade Third Attack Ready'
    visible = [p for p in tower['parts'] if p['states'][9][0][4] > .001]
    body = [p for p in visible if not p['sourceFlags'] & 1] or visible
    with subprocess.Popen([args.pose_probe, '--stdin'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8') as probe:
        boxes = []
        for part in body:
            probe.stdin.write(str(args.source_sample / part['mesh']) + '#pose=9:0\n'); probe.stdin.flush()
            boxes.append(json.loads(probe.stdout.readline()))
        probe.stdin.close(); assert probe.wait(timeout=10) == 0
    minimum = [min(b['min'][i] for b in boxes) for i in range(3)]; maximum = [max(b['max'][i] for b in boxes) for i in range(3)]
    tower.update(bounds=dict(min=minimum,max=maximum), size=[max(.01,maximum[i]-minimum[i]) for i in range(3)], boundsSource='nativeStand')
    files['arcane-tower-models.json'] = encode(dict(KingdomArcaneTower=tower))
    shared = set()
    def reference(value):
        if isinstance(value, str) and value.startswith('Assets/'):
            path = value.split('#')[0]
            if path in shared: return
            assert (args.source_sample/path).is_file(), 'Missing shared tower asset: '+path
            shared.add(path)
            if (args.source_sample/(path+'.meta')).is_file(): shared.add(path+'.meta')
            if path.endswith('.mmat'): reference(json.loads((args.source_sample/path).read_bytes()))
        elif isinstance(value, dict):
            for item in value.values(): reference(item)
        elif isinstance(value, list):
            for item in value: reference(item)
    reference(tower)
    files['Assets/Licenses/Classic-Arcane-Tower.txt'] = b'Warcraft III Arcane Tower weapon, body, abilities and icons: Blizzard Entertainment original game terms. Provenance, shared geometry and conversion hashes: arcane-tower-sources.json. REA upstream https://github.com/morluto/rea; maintenance third_party/rea/README-MENGINE.md.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output/path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-arcane-tower.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-human-army.py','scripts/warcraft_mpq.py']
    receipt = dict(author='MiYu',reaUpstream='https://github.com/morluto/rea',reaVersion='6.5.0',archivePrecedence=['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq'],sources=list(sources.values()),sharedAssets=[dict(path=p,sha256=sha((args.source_sample/p).read_bytes())) for p in sorted(shared)],sharedCatalog=dict(path='model-catalog.json',sha256=sha((args.source_sample/'model-catalog.json').read_bytes())),sourceCollections={pack:sha((args.library/pack/'asset-sources.json').read_bytes()) for pack in ['game-ready']},generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in generators],poseProbeSha256=sha(args.pose_probe.read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    for path, raw in files.items():
        target = output/path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output/receipt_name).write_bytes(encode(receipt))
    print('PASS source Arcane Tower: 8-10 piercing, Feedback, Reveal, source upgrade-third body and icons')


if __name__ == '__main__': main()
