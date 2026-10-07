"""Author: MiYu. Import original Faerie Dragon bodies, portraits, icons and source rules."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import struct
import tempfile

base = importlib.import_module('import-frost-druids')
camera = importlib.import_module('import-frost-dryad-portrait')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
SPELLS = [('FaerieDragon_Invis','NightElf/FaerieDragonInvis'),('ManaFlareTarget','Human/ManaFlare'),('ManaFlareMissile','Human/ManaFlare'),('ManaFlareBoltImpact','Human/ManaFlare'),('ManaFlareBase','Human/ManaFlare')]
BINDINGS = [
    dict(key='ClassicFaerieDragonBody',source='FaerieDragon',pack='game-ready',model='Units/NightElf/FaerieDragon/FaerieDragon.mdx'),
    dict(key='ClassicFaerieDragonPortrait',source='FaerieDragon_Portrait',pack='remaining-ready',model='Units/NightElf/FaerieDragon/FaerieDragon_Portrait.mdx',environment=True),
    dict(key='ClassicFaerieDragonMissile',source='FaerieDragonMissile',pack='remaining-ready',model='Abilities/Weapons/FaerieDragonMissile/FaerieDragonMissile.mdx',environment=True),
]+[dict(key='Classic'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/{d}/{n}.mdx',environment=True) for n,d in SPELLS if n!='FaerieDragon_Invis']


def portrait_camera(raw):
    # MiYu: retain source camera tracks; the current portrait uses the source frame-zero camera.
    offset=4;chunks=[];tracks=[]
    while offset<len(raw):
        tag,length=struct.unpack_from('<4sI',raw,offset);offset+=8;data=raw[offset:offset+length];offset+=length
        if tag==b'CAMS':
            size=struct.unpack_from('<I',data)[0];assert size==len(data);track=120
            while track<size:
                kind,count,interpolation,sequence=struct.unpack_from('<4sIIi',data,track);track+=16;dimensions=1 if kind==b'KCRL' else 3
                assert kind in [b'KCTR',b'KTTR',b'KCRL'] and interpolation in range(4) and sequence==-1
                keys=[]
                for _ in range(count):
                    frame=struct.unpack_from('<I',data,track)[0];track+=4;values=struct.unpack_from('<'+str(dimensions*(3 if interpolation>1 else 1))+'f',data,track);track+=4*len(values);keys.append(dict(frame=frame,values=list(values)))
                assert keys[0]['frame']==0 and all(v==0 for v in keys[0]['values'][:dimensions]);tracks.append(dict(kind=kind.decode(),interpolation=interpolation,keys=keys))
            data=struct.pack('<I',120)+data[4:120]
        chunks.append(struct.pack('<4sI',tag,len(data))+data)
    return dict(**camera.convert(b'MDLX'+b''.join(chunks)),sourceCameraTracks=tracks,cameraSampleFrame=0)



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--pose-probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    parser.add_argument('--sampler',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args = parser.parse_args(); files, sources, archives = {}, [], []
    with tempfile.TemporaryDirectory(prefix='frost-faerie-dragon-') as temp:
        work = pathlib.Path(temp); geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({}))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        overlay = work / 'overlay'
        def run(script, *params): subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, params)], check=True)
        run('convert-frost-classic-billboards.py', '--bindings', bindings, '--output', overlay, '--metadata-reader', args.metadata_reader)
        run('import-frost-classic.py', '--bindings', bindings, '--output', geometry, '--keys', *[r['key'] for r in BINDINGS], '--billboard-library', overlay, '--pose-probe', args.pose_probe)
        mesh_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in mesh_receipt['files']:
            raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            target = record['path'].replace('Assets/WarcraftIII/', 'Assets/FaerieDragon/')
            if target.endswith('.mmat'): raw = raw.replace(b'Assets/WarcraftIII/', b'Assets/FaerieDragon/')
            files[target] = raw
        files['faerie-dragon-models.json'] = (geometry / 'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/', b'Assets/FaerieDragon/')
        files['SourceAssets/FaerieDragon/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        portraits = {}
        for binding in BINDINGS:
            library = ROOT / 'asset-library/warcraft-iii' / binding['pack']
            signed = json.loads((library / 'asset-sources.json').read_bytes())
            record = next(r for r in signed['sourceFiles'] if r['path'].replace('\\', '/').lower() == binding['model'].lower())
            path = record['path'].replace('\\', '/'); raw = (library / 'SourceAssets' / path).read_bytes()
            assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            sample_path = 'Buildings/' + path[len('buildings/'):] if path.startswith('buildings/') else path
            files['SourceAssets/WarcraftIII/' + sample_path] = raw; sources.append(dict(record, path=sample_path, libraryPath=path, pack=binding['pack']))
            if binding['key'].endswith('Portrait'): portraits[binding['key']] = dict(source=path, sourceSha256=sha(raw), **portrait_camera(raw))
        files['faerie-dragon-portraits.json'] = encode(portraits)
        effects=work/'effects'
        run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for n,d in SPELLS for v in ['--source',f'remaining-ready/Abilities/Spells/{d}/{n}.mdx']])
        receipt=json.loads((effects/'asset-sources.json').read_bytes());models=json.loads(files['faerie-dragon-models.json']);catalog={}
        for record in receipt['generatedFiles']:
            if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
            raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256']
            target=record['path'].replace('Assets/WarcraftIII/','Assets/FaerieDragon/')
            if target.endswith(('.meffect','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/FaerieDragon/')
            files[target]=raw
        effect_models=json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']
        for name,_ in SPELLS:
            effect=next(m for m in effect_models if pathlib.PureWindowsPath(m['source']).stem.lower()==name.lower());mesh=models.get('Classic'+name)
            if mesh is None:
                catalog[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/FaerieDragon/'),parts=[],animations=effect['clips'],clip=0,duration=effect['clips'][0]['duration']);continue
            assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
            clip=next((i for i,c in enumerate(mesh['animations']) if c['name'].lower()=='stand'),0)
            catalog[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/FaerieDragon/'),parts=mesh['parts'],animations=mesh['animations'],clip=clip,duration=mesh['animations'][clip]['duration'])
        files['faerie-dragon-art.json']=encode(catalog)
        files['SourceAssets/FaerieDragon/effect-conversion.json']=encode(receipt)

    signed = {r['path']:r for r in json.loads((SAMPLE / 'druid-sources.json').read_bytes())['files']}
    def original(path):
        p = 'SourceAssets/WarcraftIII/' + path; raw = (SAMPLE / p).read_bytes(); record = signed[p]
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes'], p
        files[p] = raw; sources.append(dict(path=path, bytes=len(raw), sha256=sha(raw), receipt='druid-sources.json'))
        return raw
    tables = {name:base.rows(original('Units/' + name + '.slk')) for name in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData','UpgradeData']}
    texts = {name:original('Units/NightElf' + name + '.txt') for name in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings','UpgradeFunc','UpgradeStrings']}
    def icons(key, path):
        result = {}
        for field, source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN'))]:
            if not archives: archives.extend((n,base.mpyq.MPQArchive(str(args.game / n),listfile=False)) for n in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq'])
            for archive_name, archive in reversed(archives):
                try: raw = base.read_archive(archive,source); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original icon: ' + source)
            source = source.replace('\\','/'); files['SourceAssets/WarcraftIII/' + source] = raw
            sources.append(dict(path=source, archive=archive_name, bytes=len(raw), sha256=sha(raw)))
            target = 'Assets/Art/classic-' + key + ('-disabled' if field == 'disabledIcon' else '') + '.png'
            files[target] = base.base.decode_icon(raw); result[field] = target
        return result
    numeric=lambda v:float(v) if v.strip() not in ['-','_',''] else 0
    source='efdr';b,m,w,ui=[tables[n][source] for n in ['UnitBalance','UnitData','UnitWeapons','unitUI']]
    art,text=base.section(texts['UnitFunc'],source),base.section(texts['UnitStrings'],source)
    unit=dict(sourceUnit=source,label='Faerie Dragon',model='ClassicFaerieDragonBody',portrait='ClassicFaerieDragonPortrait',hp=int(b['HP']),armor='light',armorValue=float(b['def']),gold=int(b['goldcost']),wood=int(b['lumbercost']),food=numeric(b['fused']),time=float(b['bldtm']),speed=numeric(b['spd'])/100,collision=float(b['collision'])/100,modelScale=float(ui['modelScale']),selectionScale=float(ui['scale']),hotkey=text['Hotkey'],slot=2,sourceRows={n:tables[n][source] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=art,sourceStrings=text,damage=float(w['avgdmg1']),attack=w['atkType1'],range=float(w['rangeN1'])/100,cooldown=float(w['cool1']),damagePoint=float(w['dmgpt1']),backswing=float(w['backSw1']),missileSpeed=float(art['Missilespeed'])/100,missileArc=float(art['Missilearc']),projectile='faerie-dragon',launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100],flying=True,antiAir=True,flightHeight=float(m['moveHeight'])/100,leavesCorpse=False,organic=True,maxMana=float(b['manaN']),initialMana=float(b['mana0']),manaRegen=float(b['regenMana']),nightRegen=float(b['regenHP']),magicImmune=True,**icons('faeriedragon',art['Art']))
    abilities={}
    for id in ['Apsh','Amfl','Amim']:
        func=base.section(texts['AbilityFunc'],id);row=tables['AbilityData'][id]
        icon=icons('faerie-'+id,func['Art'])
        if 'Unart' in func:icon['offIcon']=icons('faerie-'+id+'-off',func['Unart'])['icon']
        abilities[id]=dict(sourceRow=row,sourceFunc=func,sourceStrings=base.section(texts['AbilityStrings'],id),slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])),cost=numeric(row['Cost1']),cooldown=numeric(row['Cool1']),duration=numeric(row['Dur1']),cast=numeric(row['Cast1']),**icon)
    rules=dict(author='MiYu',schemaVersion=1,sourceUnitsPerWorldUnit=100,units={'faeriedragon':unit},abilities=abilities,initialPhaseAutocast=tables['UnitAbilities'][source]['auto']=='Apsh',originalRuntimeVerified=False,unverified=['Phase Shift autocast trigger, projectile cancellation and interruption','Mana Flare spell-event eligibility, proc interval, splash semantics and casting restrictions'])
    files['faerie-dragon-rules.json']=encode(rules)
    files['Assets/FaerieDragon/.gitattributes'] = b'* -text whitespace=cr-at-eol\n'
    files['Assets/Licenses/Classic-FaerieDragon.txt'] = b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: faerie-dragon-sources.json.\n'
    tools = ['scripts/import-frost-faerie-dragon.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py']
    receipt = dict(author='MiYu',generators={p:sha((ROOT/p).read_bytes()) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    output = args.output.resolve(); receipt_path = output/'faerie-dragon-sources.json'
    previous = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}; old = {r['path']:r['sha256'] for r in previous.get('files',[])}
    for p, raw in files.items():
        target = output/p
        assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p), 'Preserve modified Faerie Dragon output: ' + p
    for p, raw in files.items():
        target = output/p; target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_bytes()!=raw: target.write_bytes(raw)
    receipt_path.write_bytes(encode(receipt))
    print('PASS original Faerie Dragon art and source rules:',len(files),'signed outputs')


if __name__ == '__main__': main()
