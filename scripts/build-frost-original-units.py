"""Author: MiYu. Add source unit placement visuals to an existing original-map project."""
import argparse
import importlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import struct
import tempfile
from warcraft_map import load_map
from warcraft_doodads import MsvcRandom
from warcraft_mpq import mpyq, read_archive

shared=importlib.import_module('build-frost-original-doodads')
ROOT=shared.ROOT
PREFIX='Assets/OriginalUnits/'


class UnitSceneAssets(shared.SceneAssets):
    def particle_model(self,path):
        path=path[:-4]+'.mdx' if path.lower().endswith('.mdl') else path
        raw=self.read(path);offset=4
        while offset<len(raw):
            tag,size=struct.unpack_from('<4sI',raw,offset)
            if tag in (b'PREM',b'PRE2',b'RIBB',b'LITE') and size:raise ValueError('Nested particle model effects require explicit support: '+path)
            offset+=8+size
        model=self.prepare(path);ci=shared.named_sequence_index(model['clips'],'stand')
        if ci is None:raise ValueError('Particle model has no Stand: '+path)
        clip=model['clips'][ci];parts=[]
        for part in model['parts']:
            states=[];first_material=None
            for frame,state in enumerate(part['states'][ci]):
                material=json.loads((self.project/self.material(part['pack'],part['textureMaterials'].get(str(state['texture']),part['material']))).read_bytes())
                if first_material is None:first_material=material
                value=dict(color=state['color'],texture=material['base_color_texture'])
                if not states or any(value[k]!=states[-1][k] for k in value):states.append(dict(frame=frame,**value))
            parts.append(dict(mesh=part['mesh'],texture=first_material['base_color_texture'],blend=first_material['blend_mode'],alphaCutoff=first_material.get('alpha_cutoff',0) if first_material['surface']=='cutout' else 0,states=states))
        return dict(clip=ci,duration=clip['duration'],fps=12,loop=clip['loop'],parts=parts)


def appearance(unit, ui, data):
    if unit['id']=='sloc':return None
    if unit['id'] in ('uDNR','iDNR'):raise ValueError('Resolve random placement before rendering: '+unit['id'])
    if unit['id'] not in ui or unit['id'] not in data:raise ValueError('Missing source unit definition: '+unit['id'])
    row,stats=ui[unit['id']],data[unit['id']]
    model=row['file'];model=model[:-4] if model.lower().endswith(('.mdl','.mdx')) else model
    scale=float(row['modelScale']);height=float(stats['moveHeight'])
    if not math.isfinite(scale) or scale<=0 or not math.isfinite(height):raise ValueError('Invalid unit scale or movement height')
    transform=shared.placement_transform(unit);transform['scale']=[v*scale for v in transform['scale']];transform['position'][1]+=height/128
    color=unit['customTeamColor'] if unit['customTeamColor']>=0 else int(row['teamColor'])
    if color<0:color=min(unit['player'],12)
    if not 0<=color<=12:raise ValueError('Unsupported classic team color')
    return dict(model=model+'.mdx',transform=transform,tint=[float(row[c])/255 for c in ['red','green','blue']],teamColor=color,modelScale=scale,moveHeight=height)


def build(export, base_project, game, output, sampler, metadata_reader, resource_cache=None, progress=None):
    export,base_project,output=export.resolve(),base_project.resolve(),output.resolve()
    if output.exists():raise FileExistsError('Preserve existing output: '+str(output))
    source=json.loads((export/'map.json').read_bytes());original=(export/source['source']['preservedArchive']).resolve();original.relative_to(export)
    raw=original.read_bytes()
    if shared.sha(raw)!=source['source']['sha256']:raise ValueError('Changed source map')
    data,members=load_map(original)
    if data['units'] is None:raise ValueError('Map has no editor unit placements')
    if any(name in members for name in ['war3map.w3u','war3map.w3t','war3map.w3a']):raise ValueError('Resolve source object overrides before unit scene generation')
    base_receipt=json.loads((base_project/'terrain-sources.json').read_bytes())
    if base_receipt['mapSha256']!=data['source']['sha256']:raise ValueError('Base project belongs to another map')
    if (base_project/'unit-placements.json').exists():raise ValueError('Base project already contains unit placements')
    for record in base_receipt['meshes']:
        if shared.sha((base_project/record['path']).read_bytes())!=record['sha256']:raise ValueError('Changed base terrain mesh: '+record['path'])
    output.parent.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='.unit-scene-',dir=output.parent));archives=[]
    try:
        project=work/'project';shutil.copytree(base_project,project,ignore=shutil.ignore_patterns('.mengine'))
        archives=[('map',mpyq.MPQArchive(io.BytesIO(raw[data['source']['mpqOffset']:]),listfile=False))]
        archives += [(name,mpyq.MPQArchive(str(game/name),listfile=False)) for name in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']]
        records={};cache={}
        archive_ids={name:source['source']['sha256'] if name=='map' else resource_cache.file_identity(game/name) for name,_ in archives} if resource_cache else {}
        def read(path):
            relative=shared.converter.relative(path).as_posix();key=relative.lower()
            if key in cache:return cache[key]
            for name,archive in archives:
                try:value=resource_cache.member(archive,relative,archive_ids[name]) if resource_cache else read_archive(archive,relative.replace('/','\\'))
                except FileNotFoundError:continue
                target=project/'SourceAssets'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(value)
                records[key]=dict(path=relative,archive=name,sha256=shared.sha(value),bytes=len(value));cache[key]=value;return value
            raise FileNotFoundError(relative)
        ui=shared.rows(read('Units/UnitUI.slk'));stats=shared.rows(read('Units/UnitData.slk'))
        assets=UnitSceneAssets(project,read,sampler,metadata_reader,PREFIX,resource_cache=resource_cache)
        scene=json.loads((project/'Assets/Scenes/Main.mscene').read_bytes());entities=scene['world']['entities'];first=len(entities);groups={};placements=[];rng=MsvcRandom()
        next_id=max(e['entity'] for e in entities)+1
        def entity(name,components,parent=None,active=True):
            nonlocal next_id
            item=dict(entity=next_id,name=name,active=active,components=components);next_id+=1
            if parent is not None:item['parent']=parent
            entities.append(item);return item['entity']
        effect_cache={}
        for index,unit in enumerate(data['units']['units']):
            if progress:progress(index,len(data['units']['units']))
            info=appearance(unit,ui,stats)
            if info is None:
                placements.append(dict(index=index,source=unit,kind='start-location',rendered=False));continue
            model=assets.prepare(info['model']);ci,_=shared.placement_clip(model['clips'],False,rng);clip=model['clips'][ci]
            name=f'Unit-{index}-{unit["id"]}-{unit["creationNumber"]}';parent=entity(name,dict(Transform=info['transform']));names=[]
            replacements={n:f'ReplaceableTextures/{folder}/{folder}{info["teamColor"]:02}.blp' for n,folder in [(1,'TeamColor'),(2,'TeamGlow')]}
            for pi,p in enumerate(model['parts']):
                replacement=replacements.get(p['replaceableId']);states=p['states'][ci]
                materials={str(t):assets.material(p['pack'],p['textureMaterials'].get(str(t),p['material']),replacement) for t in {s['texture'] for s in states}}
                states=[dict(color=[*(s['color'][j]*info['tint'][j] for j in range(3)),s['color'][3]],material=materials[str(s['texture'])]) for s in states]
                part_name=name+'-part-'+str(pi);names.append(part_name);state=states[0]
                entity(part_name,dict(Transform=dict(position=[0,0,0]),MeshRenderer=dict(mesh=p['mesh']+f'#pose={ci}:0',material=state['material']),MaterialPropertyBlock=dict(override_base_color=True,base_color=state['color'])),parent,state['color'][3]>.001)
                if p['moving'][ci] or any(s!=state for s in states[1:]):
                    group=dict(mesh=p['mesh'],clip=ci,frames=len(states),duration=clip['duration'],loop=clip['loop'],moving=p['moving'][ci],states=states)
                    groups.setdefault(shared.sha(shared.encode(group)),dict(group,names=[]))['names'].append(part_name)
            effect_path=None
            if model.get('effect'):
                identity=(model['effect'],info['teamColor'])
                if identity not in effect_cache:
                    effect=json.loads((project/model['effect']).read_bytes())
                    for material in effect['materials']:
                        if material.get('replaceableId') in replacements:material['texture']=assets.texture(replacements[material['replaceableId']])
                    encoded=shared.encode(effect);effect_cache[identity]=assets.write(PREFIX+'Effects/'+shared.sha(encoded)+'.mfx',encoded)
                effect_path=effect_cache[identity];effect=dict(effect=effect_path,clip=ci,playing=False,looping=False,speed=1,time_seconds=0)
                entity(name+'-effect',dict(Transform=dict(position=[0,0,0]),SampledEffect=effect),parent)
                group=dict(effect=effect,clip=ci,frames=model['effectClips'][ci]['frameCount'],duration=clip['duration'],loop=clip['loop'])
                groups.setdefault(shared.sha(shared.encode(group)),dict(group,names=[]))['names'].append(name+'-effect')
            placements.append(dict(index=index,source=unit,kind='unit-visual',rendered=True,name=name,parts=names,effect=effect_path,appearance=info,animation=dict(clip=ci)))
        if progress:progress(len(placements),len(data['units']['units']))
        (project/'Assets/Scenes/Main.mscene').write_bytes(shared.encode(scene));(project/'unit-placements.json').write_bytes(shared.encode(placements))
        script_path=project/'Assets/Scripts/Main.js';script=script_path.read_text(encoding='utf-8');packed=json.dumps(list(groups.values()),separators=(',',':'))
        if 'var originalDoodadGroups=' in script:script+='\noriginalDoodadGroups=originalDoodadGroups.concat('+packed+');\n'
        else:script+='\nvar originalDoodadGroups='+packed+';\n'+(ROOT/'scripts/frost-original-doodads-client.js').read_text(encoding='utf-8')
        script_path.write_text(script,encoding='utf-8',newline='\n')
        receipt=dict(mapSha256=data['source']['sha256'],placements=len(placements),rendered=sum(p['rendered'] for p in placements),addedEntities=len(entities)-first,groups=len(groups),sources=list(records.values()),models=assets.records,sourceCollections=assets.collection_hashes,
            baseProject=str(base_project),baseSceneSha256=shared.sha((base_project/'Assets/Scenes/Main.mscene').read_bytes()),baseScriptSha256=shared.sha((base_project/'Assets/Scripts/Main.js').read_bytes()),
            tools=[dict(path=str(p),sha256=shared.sha(p.read_bytes())) for p in [Path(__file__),Path(shared.__file__),ROOT/'scripts/warcraft_units.py',ROOT/'scripts/frost-original-doodads-client.js',sampler,metadata_reader,sampler.with_name('Wc3ModelViewer.Core.dll'),metadata_reader.with_name('Wc3ModelViewer.Core.dll')]],
            coverage=dict(editorPlacements=True,sourceModels=True,sampledStand=True,gameplay=False,originalRuntimeParity=False),limitations=['Editor Z and source movement height are used; runtime terrain placement and JASS execution are pending','Stand preview uses source sampled clip loops; unit animation orders and random scheduling are pending','Object overrides, random placements and item visuals require resolution before rendering','Source shadows, collision, pathing, drops and runtime creation are pending'])
        receipt['generatedFiles']=[dict(path=p.relative_to(project).as_posix(),sha256=shared.sha(p.read_bytes())) for p in sorted((project/'Assets/OriginalUnits').rglob('*')) if p.is_file()]
        (project/'unit-scene-sources.json').write_bytes(shared.encode(receipt));os.rename(project,output);return receipt
    finally:
        for _,archive in archives:archive.file.close()
        work.resolve().relative_to(output.parent);shutil.rmtree(work)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('export',type=Path);parser.add_argument('--base-project',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'));parser.add_argument('--sampler',type=Path,default=ROOT/'tmp/warcraft-effects/farseer-bin/MdxExport.dll');parser.add_argument('--metadata-reader',type=Path,default=ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args=parser.parse_args();r=build(args.export,args.base_project,args.game,args.output,args.sampler,args.metadata_reader);print(json.dumps({k:r[k] for k in ['placements','rendered','addedEntities','groups','coverage']}))
