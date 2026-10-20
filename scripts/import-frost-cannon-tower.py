"""Author: MiYu. Preserve original Cannon Tower weapon rules and missile through the existing MDX pipeline."""
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
import tempfile
import uuid
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
BINDING = dict(key='ClassicCannonTowerMissile', source='CannonTowerMissile', pack='remaining-ready', model='Abilities/Weapons/CannonTowerMissile/CannonTowerMissile.mdx', environment=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--library', type=Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=Path, required=True)
    parser.add_argument('--metadata-reader', type=Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'cannon-tower-sources.json'; source_root = 'SourceAssets/CannonTower/'
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
    w = rows(original('Units/UnitWeapons.slk'))['hctw']
    f = section(original('Units/HumanUnitFunc.txt'), 'hctw')
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    assert w['weapsOn'] == '3' and w['weapTp1'] == 'artillery' and w['weapTp2'] == 'missile' and w['atkType1'] == 'siege'
    weapon = dict(sourceUnit='hctw', damage=float(w['avgdmg1']), bonus=int(w['dmgplus1']), dice=int(w['dice1']), sides=int(w['sides1']), range=float(w['rangeN1'])/100, acquisition=float(w['acquire'])/100, rangeBuffer=float(w['RngBuff1'])/100, cooldown=float(w['cool1']), damagePoint=float(w['dmgpt1']), backswing=float(w['backSw1']), attack=w['atkType1'], antiAir='air' in w['targs1'].split(','), targets=w['targs1'].split(','), missileSpeed=float(f['Missilespeed'])/100, missileArc=float(f['Missilearc']), launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100], impactHeight=float(w['impactZ'])/100, projectile='cannon-tower', sourceRow=w, sourceFunc=f)
    armor = ['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    weapons = []
    for slot in [1, 2]:
        key = lambda name: name + str(slot)
        weapons.append(dict(weapon, damage=float(w[key('avgdmg')]), bonus=int(w[key('dmgplus')]), dice=int(w[key('dice')]), sides=int(w[key('sides')]), range=float(w[key('rangeN')])/100, rangeBuffer=float(w[key('RngBuff')])/100, cooldown=float(w[key('cool')]), damagePoint=float(w[key('dmgpt')]), backswing=float(w[key('backSw')]), attack=w[key('atkType')], antiAir='air' in w[key('targs')].split(','), slot=slot, weaponType=w[key('weapTp')], targets=w[key('targs')].split(','), minRange=0, splashEnemiesOnly=False, splashBands=[[float(w[key(area)])/100, float(factor)] for area, factor in [('Farea', 1), ('Harea', w[key('Hfact')]), ('Qarea', w[key('Qfact')])]] if slot == 1 else [], splashTargets=w[key('splashTargs')].split(',')))
    b = rows(original('Units/UnitBalance.slk'))['hctw']; ui = rows(original('Units/UnitUI.slk'))['hctw']; abilities = rows(original('Units/UnitAbilities.slk'))['hctw']
    strings = section(original('Units/HumanUnitStrings.txt'), 'hctw')
    unit = dict(sourceUnit='hctw', label='Cannon Tower', hp=int(b['HP']), armorValue=float(b['def']), armorPerRank=float(b['defUp']), armor='fortified', gold=int(b['goldcost']), wood=int(b['lumbercost']), time=float(b['bldtm']), speed=0, mana=0, sourceBalance=b, sourceFunc=f, sourceStrings=strings, sourceUI=ui, sourceAbilities=abilities)
    for disabled in [False, True]:
        art = f['Art'].replace('\\', '/')
        if disabled: art = art.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
        png = io.BytesIO(); Image.open(io.BytesIO(original(art))).convert('RGBA').save(png, format='PNG')
        path = 'Assets/Art/classic-cannon-tower' + ('-disabled' if disabled else '') + '.png'
        files[path] = png.getvalue(); unit['disabledIcon' if disabled else 'icon'] = path
        files[path+'.meta'] = encode(dict(guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+path))))
    files['cannon-tower.json'] = encode(dict(author='MiYu', unit=unit, weapons=weapons, damageTable=dict(siege=dict(zip(armor,map(float,misc['DamageBonusSiege'].split(',')))))))
    original(BINDING['model'])
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='cannon-tower-', dir=output.parent) as directory:
        work = Path(directory); overlay = work/'overlay'; geometry = work/'geometry'; geometry.mkdir()
        (geometry/'model-catalog.json').write_bytes(encode({})); (geometry/'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work/'bindings.json'; bindings.write_bytes(encode(dict(models=[BINDING])))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py','--bindings',str(bindings),'--output',str(overlay),'--metadata-reader',str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py','--output',str(geometry),'--pose-probe',str(args.pose_probe),'--billboard-library',str(overlay),'--bindings',str(bindings),'--keys',BINDING['key']]; classic.main()
        remap = lambda text: text.replace('Assets/WarcraftIII/', 'Assets/CannonTower/')
        files['cannon-tower-models.json'] = encode(json.loads(remap((geometry/'model-catalog.json').read_text(encoding='utf-8'))))
        geometry_receipt = json.loads((geometry/'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry/record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat','.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay/'asset-sources.json').read_bytes())
        files['cannon-tower-node-sources.json'] = encode(node_receipt)
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/','Licenses/')): files[source_root+'Conversion/'+record['path']] = (overlay/record['path']).read_bytes()
    library = args.library/BINDING['pack']; signed = json.loads((library/'asset-sources.json').read_bytes())
    model_record = next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower() == BINDING['model'].lower())
    assert model_record['sha256'] == sha(files[source_root+BINDING['model']]), 'Converted library model must match original MPQ model'
    tower_path = 'Buildings/Human/HumanTower/HumanTower.mdx'
    tower_raw = original(tower_path)
    tower_sources = json.loads((args.library/'game-ready/asset-sources.json').read_bytes())
    assert next(r for r in tower_sources['sourceFiles'] if r['path'].replace('\\','/').lower() == tower_path.lower())['sha256'] == sha(tower_raw)
    catalog = json.loads((args.source_sample/'model-catalog.json').read_bytes())
    tower = copy.deepcopy(catalog['KingdomTower']); tower['classicTier'] = 3
    assert 'HumanTower' in tower['sourceModel'] and tower['animations'][7]['name'] == 'Stand Upgrade Second'
    visible = [p for p in tower['parts'] if p['states'][7][0][4] > .001]
    body = [p for p in visible if not p['sourceFlags'] & 1] or visible
    with subprocess.Popen([args.pose_probe, '--stdin'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8') as probe:
        boxes = []
        for part in body:
            probe.stdin.write(str(args.source_sample / part['mesh']) + '#pose=7:0\n'); probe.stdin.flush()
            boxes.append(json.loads(probe.stdout.readline()))
        probe.stdin.close(); assert probe.wait(timeout=10) == 0
    minimum = [min(b['min'][i] for b in boxes) for i in range(3)]; maximum = [max(b['max'][i] for b in boxes) for i in range(3)]
    tower.update(bounds=dict(min=minimum,max=maximum), size=[max(.01,maximum[i]-minimum[i]) for i in range(3)], boundsSource='nativeStand')
    models = json.loads(files['cannon-tower-models.json']); models['KingdomCannonTower'] = tower; files['cannon-tower-models.json'] = encode(models)
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
    files['Assets/Licenses/Classic-Cannon-Tower.txt'] = b'Warcraft III Cannon Tower weapons, body, icons and missile: Blizzard Entertainment original game terms. Provenance, shared geometry and conversion hashes: cannon-tower-sources.json. REA upstream https://github.com/morluto/rea; maintenance third_party/rea/README-MENGINE.md.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output/path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-cannon-tower.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-human-army.py','scripts/warcraft_mpq.py']
    receipt = dict(author='MiYu',reaUpstream='https://github.com/morluto/rea',reaVersion='6.5.0',archivePrecedence=['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq'],sources=list(sources.values()),models=geometry_receipt['models'],sharedAssets=[dict(path=p,sha256=sha((args.source_sample/p).read_bytes())) for p in sorted(shared)],sharedCatalog=dict(path='model-catalog.json',sha256=sha((args.source_sample/'model-catalog.json').read_bytes())),sourceCollections={pack:sha((args.library/pack/'asset-sources.json').read_bytes()) for pack in ['game-ready','remaining-ready']},generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in generators],poseProbeSha256=sha(args.pose_probe.read_bytes()),metadataReaderSha256=sha(args.metadata_reader.read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    for path, raw in files.items():
        target = output/path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output/receipt_name).write_bytes(encode(receipt))
    print('PASS source Cannon Tower: 90-111 siege, dual weapons, source upgrade body, icons and original missile')


if __name__ == '__main__': main()
