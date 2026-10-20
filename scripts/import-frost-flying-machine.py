"""Author: MiYu. Preserve Frozen Throne Flying Machine rules, body, portrait and command icons."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
BINDINGS = [dict(key='ClassicFlyingMachine', source='Gyrocopter_V1', pack='remaining-ready', model='Units/Human/GyroCopter/Gyrocopter_V1.mdx'), dict(key='ClassicFlyingMachinePortrait', source='Gyrocopter_V1_portrait', pack='remaining-ready', model='Units/Human/GyroCopter/Gyrocopter_V1_portrait.mdx')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--library', type=Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=Path, required=True)
    parser.add_argument('--metadata-reader', type=Path, required=True)
    args = parser.parse_args(); output = args.output.resolve(); receipt = 'flying-machine-sources.json'; prefix = 'SourceAssets/FlyingMachine/'
    retained = json.loads((args.source_sample / receipt).read_bytes()) if (args.source_sample / receipt).exists() else {}
    previous = json.loads((output / receipt).read_bytes()) if (output / receipt).exists() else {}
    files, sources, archives = {}, {}, []
    for r in previous.get('files', []):
        raw = (output / r['path']).read_bytes()
        assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Preserve edited output: ' + r['path']

    def original(path):
        if path in sources: return files[prefix + path]
        record = next((r for r in retained.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (args.source_sample / prefix / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files[prefix + path] = raw; sources[path] = record
        return raw

    def icons(name, art, with_disabled=True):
        result = {}
        for disabled in ([False, True] if with_disabled else [False]):
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            target = 'Assets/Art/classic-flying-machine-' + name + ('-disabled' if disabled else '') + '.png'
            files[target] = png.getvalue(); files[target+'.meta'] = encode(dict(guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/'+target))))
            result['disabledIcon' if disabled else 'icon'] = target
        return result

    rows = importlib.import_module('import-frost-wisp-rules').rows; section = importlib.import_module('import-frost-human-army').section
    tables = {k: rows(original('Units/'+k+'.slk')) for k in ['UnitBalance','UnitWeapons','UnitData','UnitUI','UnitAbilities','AbilityData','AbilityMetaData','UpgradeData']}
    b,w,d,ui,a = [tables[k]['hgyr'] for k in ['UnitBalance','UnitWeapons','UnitData','UnitUI','UnitAbilities']]
    f,strings = [section(original('Units/HumanUnit'+n+'.txt'),'hgyr') for n in ['Func','Strings']]
    weapons = {}
    for n in [1,2]:
        k = lambda field: field+str(n)
        weapons[str(n)] = dict(slot=n, damage=float(w[k('avgdmg')]), bonus=float(w[k('dmgplus')]), dice=int(w[k('dice')]), sides=int(w[k('sides')]), range=float(w[k('rangeN')])/100, rangeBuffer=float(w[k('RngBuff')])/100, cooldown=float(w[k('cool')]), damagePoint=float(w[k('dmgpt')]), backswing=float(w[k('backSw')]), attack=w[k('atkType')], weaponType=w[k('weapTp')], targets=w[k('targs')].split(','), missileSpeed=float(f['Missilespeed'].split(',')[n-1])/100, missileArc=float(f['Missilearc'].split(',')[n-1]), missileModel=f['Missileart'].split(',')[n-1].replace('\\','/').replace('.mdl','.mdx'))
    unit = dict(sourceUnit='hgyr', label='Flying Machine', model='ClassicFlyingMachine', hp=int(b['HP']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']), time=float(b['bldtm']), speed=float(b['spd'])/100, armor='heavy', armorValue=float(b['def']), armorPerRank=float(b['defUp']), collision=float(b['collision'])/100, organic=False, flying=True, moveHeight=float(d['moveHeight'])/100, moveFloor=float(d['moveFloor'])/100, sight=float(b['sight'])/100, nightSight=float(b['nsight'])/100, acquisition=float(w['acquire'])/100, weaponsEnabled=int(w['weapsOn']), weapons=weapons, launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100], impactHeight=float(w['impactZ'])/100, abilities=a['abilList'].split(','), upgrades=b['upgrades'].split(','), requires=f.get('Requires','').split(',') if f.get('Requires') else [], slot=sum(int(v)*factor for v,factor in zip(f['Buttonpos'].split(','),[1,4])), hotkey=strings['Hotkey'], modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), sourceRows={k:tables[k]['hgyr'] for k in ['UnitBalance','UnitWeapons','UnitData','UnitUI','UnitAbilities']}, sourceFunc=f, sourceStrings=strings, **icons('unit',f['Art']))
    research,abilities = {},{}
    for key in ['Rhgb','Rhfc']:
        r=tables['UpgradeData'][key];func,text=[section(original('Units/HumanUpgrade'+n+'.txt'),key) for n in ['Func','Strings']]
        research[key]=dict(id=key,name=text['Name'],gold=int(r['goldbase']),wood=int(r['lumberbase']),time=float(r['timebase']),requires=func['Requires'].split(','),slot=sum(int(v)*factor for v,factor in zip(func['Buttonpos'].split(','),[1,4])),hotkey=text['Hotkey'],sourceRow=r,sourceFunc=func,sourceStrings=text,**icons(key.lower(),func['Art']))
    for key in unit['abilities']:
        r=tables['AbilityData'][key];func,text=[section(original('Units/HumanAbility'+n+'.txt'),key) for n in ['Func','Strings']]
        abilities[key]=dict(id=key,name=text['Name'],requires=func.get('Requires'),slot=sum(int(v)*factor for v,factor in zip(func['Buttonpos'].split(','),[1,4])),sourceRow=r,sourceFunc=func,sourceStrings=text,sourceMetadata={k:v for k,v in tables['AbilityMetaData'].items() if key in v.get('useSpecific','').split(',')},**icons(key.lower(),func['Art'],bool(func.get('Requires'))))
    r=abilities['Agyv']['sourceRow'];abilities['Agyv'].update(radius=float(r['Rng1'])/100,detectionType=int(r['DataA1']),targets=r['targs1'].split(','))
    r=abilities['Aflk']['sourceRow'];abilities['Aflk'].update(damageBands=[[float(r['Area1'])/100,float(r['DataC1'])],[float(r['DataA1'])/100,float(r['DataD1'])],[float(r['DataB1'])/100,float(r['DataE1'])]],targets=r['targs1'].split(','))
    misc=section(original('Units/MiscGame.txt'),'Misc');armor=['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    files['flying-machine.json']=encode(dict(author='MiYu',unit=unit,research=research,abilities=abilities,workshopSource=section(original('Units/HumanUnitFunc.txt'),'harm'),damageTable={k:dict(zip(armor,map(float,misc['DamageBonus'+k.capitalize()].split(',')))) for k in ['pierce','siege']}))
    library_receipt=json.loads((args.library/'remaining-ready/asset-sources.json').read_bytes())
    for binding in BINDINGS:
        raw=original(binding['model']);record=next(r for r in library_receipt['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower())
        assert sha(raw)==record['sha256'], 'Library model differs from original: '+binding['model']
        at=4
        while at<len(raw):
            tag,size=struct.unpack_from('<4sI',raw,at);at+=8
            if tag==b'TEXS':
                for offset in range(at,at+size,268):
                    texture=raw[offset+4:offset+264].split(b'\0',1)[0].decode('utf-8').replace('\\','/')
                    if not texture:continue
                    record=next(r for r in library_receipt['sourceFiles'] if r['path'].replace('\\','/').lower()==texture.lower());texture=record['path'].replace('\\','/');original_texture=original(texture)
                    assert sha(original_texture)==record['sha256'], 'Library texture differs from original: '+texture
            at+=size
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='flying-machine-',dir=output.parent) as directory:
        work=Path(directory);overlay=work/'overlay';geometry=work/'geometry';geometry.mkdir()
        (geometry/'model-catalog.json').write_bytes(encode({}));(geometry/'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes=importlib.import_module('convert-frost-classic-billboards');nodes.LIBRARY=args.library.resolve()
        classic=importlib.import_module('import-frost-classic');classic.LIBRARY=nodes.LIBRARY
        sys.argv=['convert-frost-classic-billboards.py','--bindings',str(bindings),'--output',str(overlay),'--metadata-reader',str(args.metadata_reader)];nodes.main()
        sys.argv=['import-frost-classic.py','--output',str(geometry),'--pose-probe',str(args.pose_probe),'--billboard-library',str(overlay),'--bindings',str(bindings),'--keys',*[b['key'] for b in BINDINGS]];classic.main()
        remap=lambda p:p.replace('Assets/WarcraftIII/','Assets/FlyingMachine/')
        models=json.loads((geometry/'model-catalog.json').read_bytes());body=models['ClassicFlyingMachine'];body.update(sourceUnit='hgyr',sourceModelScale=unit['modelScale'],sourceSelectionScale=unit['selectionScale'],worldHeight=body['size'][1]*1.28*unit['modelScale'])
        files['flying-machine-models.json']=encode(json.loads(remap(json.dumps(models,ensure_ascii=False))))
        for record in json.loads((geometry/'classic-sources.json').read_bytes())['files']:
            path=remap(record['path']);raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256']
            if path.endswith('.meta'):
                meta=json.loads(raw);meta['guid']=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+path[:-5]));raw=encode(meta)
            elif path.endswith(('.mmat','.json')):raw=remap(raw.decode('utf-8')).encode('utf-8')
            files[path]=raw
        node_receipt=json.loads((overlay/'asset-sources.json').read_bytes());files['flying-machine-node-sources.json']=encode(node_receipt)
        for r in node_receipt['generatedFiles']:
            if r['path'].startswith(('Nodes/','Licenses/')):files[prefix+'Conversion/'+r['path']]=(overlay/r['path']).read_bytes()
    portrait=importlib.import_module('import-frost-animated-portrait').convert(original(BINDINGS[1]['model']))
    files['flying-machine-portraits.json']=encode(dict(ClassicFlyingMachine=dict(model='ClassicFlyingMachinePortrait',**portrait)))
    files['Assets/Licenses/Classic-Flying-Machine.txt']=b'Warcraft III Frozen Throne Flying Machine body, portrait, rules and command textures: Blizzard Entertainment original game asset terms apply. Original archive identities, hashes and converter dependencies: flying-machine-sources.json. REA upstream: https://github.com/morluto/rea.\n'
    owned={r['path']:r['sha256'] for r in previous.get('files',[])}
    for path,raw in files.items():
        target=output/path
        if target.exists() and target.read_bytes()!=raw:assert sha(target.read_bytes())==owned.get(path),'Preserve edited output: '+path
    for path,raw in files.items():
        target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    for _,archive in archives:archive.file.close()
    generators=['scripts/import-frost-flying-machine.py','scripts/import-frost-human-army.py','scripts/import-frost-wisp-rules.py','scripts/warcraft_mpq.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-animated-portrait.py']
    report=dict(author='MiYu',reaUpstream='https://github.com/morluto/rea',reaVersion='6.5.0',reaCommit='3b79af28e80785afce9f5998d8f03289402a1847',sources=sorted(sources.values(),key=lambda r:r['path']),generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n'))) for p in generators],generatorHashMode='lf-text',sourceCollection=dict(pack='remaining-ready',sha256=sha((args.library/'remaining-ready/asset-sources.json').read_bytes())),poseProbeSha256=sha(args.pose_probe.read_bytes()),metadataReaderSha256=sha(args.metadata_reader.read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())],originalRuntimeVerified=False)
    (output/receipt).write_bytes(encode(report));print('PASS Flying Machine source weapons, abilities, research, TFT body and animated portrait; '+str(len(files))+' signed outputs')


if __name__=='__main__':main()
