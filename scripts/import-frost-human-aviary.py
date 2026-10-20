"""Author: MiYu. Preserve Frozen Throne Human Gryphon Aviary rules, body, portrait and command icons."""
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
BINDINGS = [
    dict(key='KingdomGryphonAviary', source='GryphonAviary', pack='game-ready', model='Buildings/Human/GryphonAviary/GryphonAviary.mdx', building=True),
    dict(key='ClassicGryphon', source='GryphonRider', pack='game-ready', model='Units/Human/GryphonRider/GryphonRider.mdx'),
    dict(key='ClassicDragonHawk', source='BloodElfDragonHawk', pack='game-ready', model='Units/Human/BloodElfDragonHawk/BloodElfDragonHawk.mdx'),
    dict(key='ClassicGryphonPortrait', source='GryphonRider_Portrait', pack='remaining-ready', model='Units/Human/GryphonRider/GryphonRider_Portrait.mdx'),
    dict(key='ClassicDragonHawkPortrait', source='BloodElfDragonHawk_Portrait', pack='remaining-ready', model='Units/Human/BloodElfDragonHawk/BloodElfDragonHawk_Portrait.mdx')]


def number(value, scale=1):
    return float(value) / scale if value is not None and value.strip() not in ['', '-', '_'] else None


def values(value):
    return value.split(',') if value and value.strip() not in ['-', '_'] else []


def weapon(row, func, slot):
    n = str(slot); get = lambda field, scale=1: number(row.get(field+n), scale)
    # MiYu: null means no explicit source entry for this slot; runtime fallback is resolved separately.
    missile = lambda field: func[field].split(',')[slot-1] if field in func and len(func[field].split(',')) >= slot else None
    homing = missile('MissileHoming') if 'MissileHoming' in func else missile('Missilehoming')
    model = missile('Missileart')
    return dict(slot=slot, damage=get('avgdmg'), bonus=get('dmgplus'), dice=get('dice'), sides=get('sides'), range=get('rangeN',100), rangeBuffer=get('RngBuff',100), cooldown=get('cool'), damagePoint=get('dmgpt'), backswing=get('backSw'), attack=row.get('atkType'+n), weaponType=row.get('weapTp'+n), targets=values(row.get('targs'+n)), splashTargets=values(row.get('splashTargs'+n)), fullSplash=get('Farea',100), halfSplash=get('Harea',100), quarterSplash=get('Qarea',100), halfFactor=get('Hfact'), quarterFactor=get('Qfact'), targetCount=get('targCount'), damageLoss=get('damageLoss'), spillDistance=get('spillDist',100), spillRadius=get('spillRadius',100), missileSpeed=number(missile('Missilespeed'),100), missileArc=number(missile('Missilearc')), missileModel=model.replace('\\','/').replace('.mdl','.mdx') if model else None, missileHoming=homing=='1' if homing is not None else None)



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--library', type=Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=Path, required=True)
    parser.add_argument('--metadata-reader', type=Path, required=True)
    args = parser.parse_args(); output = args.output.resolve(); receipt = 'human-aviary-sources.json'; prefix = 'SourceAssets/HumanAviary/'
    retained = json.loads((args.source_sample / receipt).read_bytes()) if (args.source_sample / receipt).exists() else {}
    previous = json.loads((output / receipt).read_bytes()) if (output / receipt).exists() else {}
    files, sources, archives = {}, {}, []
    for r in previous.get('files', []):
        raw = (output / r['path'].replace('\\','/')).read_bytes()
        assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Preserve edited output: ' + r['path']

    def original(path):
        path = path.replace('\\','/')
        if path in sources: return files[prefix + path]
        record = next((dict(r,path=path) for r in retained.get('sources', []) if r['path'].replace('\\','/') == path), None)
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
            target = 'Assets/Art/classic-human-aviary-' + name + ('-disabled' if disabled else '') + '.png'
            files[target] = png.getvalue(); files[target+'.meta'] = encode(dict(guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/'+target))))
            result['disabledIcon' if disabled else 'icon'] = target
        return result

    rows = importlib.import_module('import-frost-wisp-rules').rows; section = importlib.import_module('import-frost-human-army').section
    tables = {k: rows(original('Units/'+k+'.slk')) for k in ['UnitBalance','UnitWeapons','UnitData','UnitUI','UnitAbilities','AbilityData','AbilityMetaData','AbilityBuffData','UpgradeData','UpgradeMetaData','UpgradeEffectMetaData']}
    units, buildings = {}, {}
    for unit_id, binding, label in zip(['hgra','hgry','hdhw'], BINDINGS, ['Gryphon Aviary','Gryphon Rider','Dragonhawk Rider']):
        b,w,d,ui,a = [tables[k][unit_id] for k in ['UnitBalance','UnitWeapons','UnitData','UnitUI','UnitAbilities']]
        f,strings = [section(original('Units/HumanUnit'+n+'.txt'),unit_id) for n in ['Func','Strings']]
        building = unit_id=='hgra'; weapons = {str(n):weapon(w,f,n) for n in [1,2] if int(w['weapsOn']) & n}
        unit = dict(sourceUnit=unit_id, label=label, model=binding['key'], hp=int(b['HP']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=number(b['fused']), time=float(b['bldtm']), speed=number(b['spd'],100), armor={'fort':'fortified','small':'light'}[b['defType']], armorValue=float(b['def']), armorPerRank=float(b['defUp']), collision=float(b['collision'])/100, organic=not building, flying=d['movetp']=='fly', moveHeight=float(d['moveHeight'])/100, moveFloor=float(d['moveFloor'])/100, sight=float(b['sight'])/100, nightSight=float(b['nsight'])/100, acquisition=number(w['acquire'],100), weaponsEnabled=int(w['weapsOn']), weapons=weapons, launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100], impactHeight=float(w['impactZ'])/100, healthRegen=number(b['regenHP']), healthRegenType=b['regenType'], mana=number(b['manaN']), initialMana=number(b['mana0']), manaRegen=number(b['regenMana']), castPoint=number(w['castpt']), castBackswing=number(w['castbsw']), abilities=values(a['abilList']), upgrades=values(b['upgrades']), requires=values(f.get('Requires')), slot=sum(int(v)*factor for v,factor in zip(f['Buttonpos'].split(','),[1,4])), hotkey=strings['Hotkey'], modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), sourceRows={k:tables[k][unit_id] for k in ['UnitBalance','UnitWeapons','UnitData','UnitUI','UnitAbilities']}, sourceFunc=f, sourceStrings=strings, **icons(unit_id,f['Art']))
        if building: unit.update(radius=unit['collision'],trains=values(f['Trains']),researches=values(f['Researches']))
        (buildings if building else units)[unit_id]=unit
    research,abilities = {},{}
    for key in ['Rhhb','Rhcd']:
        r=tables['UpgradeData'][key];func,text=[section(original('Units/HumanUpgrade'+n+'.txt'),key) for n in ['Func','Strings']]
        research[key]=dict(id=key,name=text['Name'],gold=int(r['goldbase']),wood=int(r['lumberbase']),time=float(r['timebase']),requires=values(func.get('Requires')),slot=sum(int(v)*factor for v,factor in zip(func['Buttonpos'].split(','),[1,4])),hotkey=text['Hotkey'],sourceRow=r,sourceFunc=func,sourceStrings=text,**icons(key.lower(),func['Art']))
    for key in ['Asth','Aclf','Amls']:
        r=tables['AbilityData'][key];func,text=[section(original('Units/HumanAbility'+n+'.txt'),key) for n in ['Func','Strings']]
        abilities[key]=dict(id=key,name=text['Name'],requires=values(func.get('Requires')),sourceRow=r,sourceFunc=func,sourceStrings=text,sourceMetadata={k:v for k,v in tables['AbilityMetaData'].items() if key in v.get('useSpecific','').split(',')},cost=number(r['Cost1']),cooldown=number(r['Cool1']),duration=number(r['Dur1']),heroDuration=number(r['HeroDur1']),range=number(r['Rng1'],100),radius=number(r['Area1'],100),targets=values(r['targs1']),slot=sum(int(v)*factor for v,factor in zip(func['Buttonpos'].split(','),[1,4])),**icons(key.lower(),func['Art'],key!='Asth'))
    buffs={}
    for key in ['Bclf','Xclf','Bmlc','Bmlt']:
        func,text=[section(original('Units/HumanAbility'+n+'.txt'),key) for n in ['Func','Strings']]
        buffs[key]=dict(sourceRow=tables['AbilityBuffData'][key],sourceFunc=func,sourceStrings=text)
        if func.get('Buffart'):buffs[key].update(icons(key.lower(),func['Buffart'],False))
    lightning=rows(original('Splats/LightningData.slk'))['LEAS'];texture='Assets/HumanAviary/Lightning/'+Path(lightning['file']).with_suffix('.png').name
    files[texture]=importlib.import_module('import-frost-blood-mage').decode_texture(original(lightning['Dir'].replace('\\','/')+'/'+lightning['file']))
    files[texture+'.meta']=encode(dict(guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+texture))))
    misc=section(original('Units/MiscGame.txt'),'Misc');armor=['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    files['human-aviary.json']=encode(dict(author='MiYu',sourceUnitsPerWorldUnit=100,building=buildings['hgra'],buildings=buildings,units=units,research=research,abilities=abilities,buffs=buffs,lightning={'LEAS':dict(lightning,texture=texture)},upgradeMetadata={k:v for k,v in tables['UpgradeEffectMetaData'].items() if v.get('effectID')=='rasd'},missileSourceSemantics='Null indicates no explicit per-slot source entry, not a runtime absence. Original comma-separated sourceFunc values are retained; fallback behavior requires original runtime verification.',damageTable={k:dict(zip(armor,map(float,misc['DamageBonus'+k.capitalize()].split(',')))) for k in ['magic','pierce']},originalRuntimeVerified=False,runtimeIntegrated=False))
    library_receipts={pack:json.loads((args.library/pack/'asset-sources.json').read_bytes()) for pack in sorted({b['pack'] for b in BINDINGS})}
    for binding in BINDINGS:
        library_receipt=library_receipts[binding['pack']]
        raw=original(binding['model']);record=next(r for r in library_receipt['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower())
        assert sha(raw)==record['sha256'], 'Library model differs from original: '+binding['model']
        at=4
        while at<len(raw):
            tag,size=struct.unpack_from('<4sI',raw,at);at+=8
            if tag==b'TEXS':
                for offset in range(at,at+size,268):
                    texture=raw[offset+4:offset+264].split(b'\0',1)[0].decode('utf-8').replace('\\','/')
                    replaceable=struct.unpack_from('<I',raw,offset)[0]
                    paths=[texture] if texture else []
                    if not texture and replaceable in [1,2]:
                        kind='Color' if replaceable==1 else 'Glow';paths=[f'ReplaceableTextures/Team{kind}/Team{kind}{n:02}.blp' for n in range(2)]
                    for texture in paths:
                        record=next(r for r in library_receipt['sourceFiles'] if r['path'].replace('\\','/').lower()==texture.lower());texture=record['path'].replace('\\','/');original_texture=original(texture)
                        assert sha(original_texture)==record['sha256'], 'Library texture differs from original: '+texture
            at+=size
    work_root=ROOT/'tmp/docs-artifacts/frost-human-aviary';work_root.mkdir(parents=True,exist_ok=True)
    temporary_directory=tempfile.TemporaryDirectory
    tempfile.TemporaryDirectory=lambda **options:temporary_directory(**{**options,'dir':work_root})
    with tempfile.TemporaryDirectory(prefix='human-aviary-') as directory:
        work=Path(directory);overlay=work/'overlay';geometry=work/'geometry';geometry.mkdir()
        (geometry/'model-catalog.json').write_bytes(encode({}));(geometry/'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes=importlib.import_module('convert-frost-classic-billboards');nodes.LIBRARY=args.library.resolve()
        classic=importlib.import_module('import-frost-classic');classic.LIBRARY=nodes.LIBRARY
        sys.argv=['convert-frost-classic-billboards.py','--bindings',str(bindings),'--output',str(overlay),'--metadata-reader',str(args.metadata_reader)];nodes.main()
        sys.argv=['import-frost-classic.py','--output',str(geometry),'--pose-probe',str(args.pose_probe),'--billboard-library',str(overlay),'--bindings',str(bindings),'--keys',*[b['key'] for b in BINDINGS]];classic.main()
        remap=lambda p:p.replace('Assets/WarcraftIII/','Assets/HumanAviary/')
        models=json.loads((geometry/'model-catalog.json').read_bytes())
        for unit in [*buildings.values(),*units.values()]:
            body=models[unit['model']];body.update(sourceUnit=unit['sourceUnit'],sourceModelScale=unit['modelScale'],sourceSelectionScale=unit['selectionScale'])
            body['worldHeight']=body['size'][1]*1.28*unit['modelScale']
            if unit['sourceUnit']=='hgra':body['maxWorldHeight']=body['worldHeight']
        files['human-aviary-models.json']=encode(json.loads(remap(json.dumps(models,ensure_ascii=False))))
        for record in json.loads((geometry/'classic-sources.json').read_bytes())['files']:
            path=remap(record['path']);raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256']
            if path.endswith('.meta'):
                meta=json.loads(raw);meta['guid']=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+path[:-5]));raw=encode(meta)
            elif path.endswith(('.mmat','.json')):raw=remap(raw.decode('utf-8')).encode('utf-8')
            files[path]=raw
        node_receipt=json.loads((overlay/'asset-sources.json').read_bytes());files['human-aviary-node-sources.json']=encode(node_receipt)
        for r in node_receipt['generatedFiles']:
            if r['path'].startswith(('Nodes/','Licenses/')):files[prefix+'Conversion/'+r['path']]=(overlay/r['path']).read_bytes()
    tempfile.TemporaryDirectory=temporary_directory
    portraits={}
    for body,portrait_binding in [(BINDINGS[0],BINDINGS[0]),(BINDINGS[1],BINDINGS[3]),(BINDINGS[2],BINDINGS[4])]:
        portrait=importlib.import_module('import-frost-animated-portrait').convert(original(portrait_binding['model']))
        portraits[body['key']]=dict(model=portrait_binding['key'],**portrait)
    files['human-aviary-portraits.json']=encode(portraits)
    files['Assets/Licenses/Classic-Human-Aviary.txt']=b'Warcraft III Frozen Throne Human Gryphon Aviary body, portrait, rules and command textures: Blizzard Entertainment original game asset terms apply. Original archive identities, hashes and converter dependencies: human-aviary-sources.json. REA upstream: https://github.com/morluto/rea.\n'
    owned={r['path'].replace('\\','/'):r['sha256'] for r in previous.get('files',[])}
    for path,raw in files.items():
        target=output/path
        if target.exists() and target.read_bytes()!=raw:assert sha(target.read_bytes())==owned.get(path),'Preserve edited output: '+path
    for path,raw in files.items():
        target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    for _,archive in archives:archive.file.close()
    generators=['scripts/import-frost-human-aviary.py','scripts/import-frost-human-army.py','scripts/import-frost-wisp-rules.py','scripts/warcraft_mpq.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-animated-portrait.py','scripts/import-frost-blood-mage.py']
    report=dict(author='MiYu',reaUpstream='https://github.com/morluto/rea',reaVersion='6.5.0',reaCommit='3b79af28e80785afce9f5998d8f03289402a1847',sources=sorted(sources.values(),key=lambda r:r['path']),generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n'))) for p in generators],generatorHashMode='lf-text',sourceCollections={pack:sha((args.library/pack/'asset-sources.json').read_bytes()) for pack in library_receipts},poseProbeSha256=sha(args.pose_probe.read_bytes()),metadataReaderSha256=sha(args.metadata_reader.read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())],originalRuntimeVerified=False,runtimeIntegrated=False)
    (output/receipt).write_bytes(encode(report));print('PASS Human Gryphon Aviary source weapons, abilities, research, three bodies and source-camera portraits; '+str(len(files))+' signed outputs')


if __name__=='__main__':main()
