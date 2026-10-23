"""Author: MiYu. Build original placed models, sampled animation and embedded effects over native terrain."""
import argparse
import hashlib
import importlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
from warcraft_map import load_map
from warcraft_doodads import placement_kind, named_sequence_index, stand_sequence_index, stand_sequence_candidates, sequence_weight, MsvcRandom, mdx_sequence_rarities
from warcraft_mpq import mpyq, read_archive

terrain_builder = importlib.import_module('build-frost-original-terrain')
converter = importlib.import_module('convert-warcraft-assets')
nodes = importlib.import_module('convert-frost-classic-billboards')
rows = importlib.import_module('import-frost-wisp-rules').rows
ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT/'asset-library/warcraft-iii'
PREFIX = 'Assets/OriginalDoodads/'
sha = lambda raw:hashlib.sha256(raw).hexdigest()
encode = lambda value:(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode('utf-8')
key = lambda path:converter.relative(path).as_posix().lower()


def placement_transform(d):
    x,y,z=d['location'];sx,sy,sz=d['scale'];angle=d['angle']/2
    return dict(position=[x/128,z/128,-y/128],rotation=[0,math.sin(angle),0,math.cos(angle)],scale=[sx,sz,sy])


def model_path(row,variation):
    path=row['file'];path=path[:-4] if path.lower().endswith(('.mdl','.mdx')) else path
    count=int(row['numVar'])
    if variation<0 or count<1:raise ValueError('Invalid source model variation')
    return path+(str(min(variation,count-1)) if count>1 else '')+'.mdx'


def placement_clip(clips,dead=False,rand=None):
    if not clips:raise ValueError('Source model has no sampled animation clips')
    death=named_sequence_index(clips,'death') if dead else None
    if death is not None:return death,True
    # A missing named sequence leaves the initial animation unchanged, including playback.
    found=stand_sequence_index(clips,rand if rand is not None else MsvcRandom())
    return (found if found is not None else 0),False


def moving_clip(raw,clip):
    doc,binary=nodes.read_glb(raw)
    if not doc.get('animations'):return False
    if doc.get('extras',{}).get('mengineMdxAnimation',{}).get('globalSequences'):return True
    animation=doc['animations'][clip]
    for sampler in animation['samplers']:
        accessor=doc['accessors'][sampler['output']];view=doc['bufferViews'][accessor['bufferView']]
        size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]*4
        if accessor['componentType']!=5126:raise ValueError('Expected float animation output')
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',size)
        first=binary[offset:offset+size]
        if any(binary[offset+i*stride:offset+i*stride+size]!=first for i in range(1,accessor['count'])):return True
    uv=animation.get('extras',{}).get('mengineUv',{}).get('frames',[])
    return bool(uv and any(frame!=uv[0] for frame in uv[1:]))


class SceneAssets:
    def __init__(self,project,read,sampler,metadata_reader,prefix=PREFIX,resource_cache=None):
        self.project,self.read,self.sampler,self.metadata_reader=project,read,sampler,metadata_reader
        self.prefix=prefix
        self.resource_cache=resource_cache
        self.models,self.collections,self.materials,self.prepared={},{},{},{}
        self.texture_sources,self.textures,self.collection_hashes={},{},{}
        self.records=[]
        for pack in ['game-ready','remaining-ready']:
            base=LIBRARY/pack;receipt_raw=(base/'asset-sources.json').read_bytes();receipt=json.loads(receipt_raw)
            self.collection_hashes[pack]=sha(receipt_raw)
            generated={key(r['path']):r for r in receipt['generatedFiles']}
            self.collections[pack]=(base,generated,{key(r['path']):r for r in receipt['sourceFiles']})
            for record in receipt['sourceFiles']:
                source=converter.relative(record['path'])
                if source.suffix.lower() in ('.blp','.tga','.png'):
                    self.texture_sources[(pack,key('Assets/WarcraftIII/Textures/'+source.with_suffix('.png').as_posix()))]=record['path']
            for name in ['W3ModelViewer-MIT.txt','converter-sources.json']:
                self.write('Assets/Licenses/'+Path(prefix).name+'/'+pack+'/'+name,(base/'Licenses'/name).read_bytes())
            catalog=json.loads(self.verified(pack,'Assets/WarcraftIII/model-catalog.json'))
            for model in catalog['models']:self.models[key(model['source'])]=(pack,model)

    def write(self,path,raw):
        target=self.project/converter.relative(path);target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists() and target.read_bytes()!=raw:raise ValueError('Asset collision: '+path)
        target.write_bytes(raw)
        return path

    def verified(self,pack,path):
        base,files,_=self.collections[pack];record=files[key(path)];raw=(base/converter.relative(record['path'])).read_bytes()
        if sha(raw)!=record['sha256']:raise ValueError('Changed converted asset: '+path)
        return raw

    def texture(self,path):
        normalized=key(path)
        if normalized in self.textures:return self.textures[normalized]
        raw=self.read(path);target=self.prefix+'Textures/'+sha(raw)+'.png'
        if not (self.project/target).exists():
            self.write(target,self.resource_cache.texture_bytes(raw,converter.decode_texture) if self.resource_cache else self.texture_bytes(raw))
        self.textures[normalized]=target;return target

    @staticmethod
    def texture_bytes(raw):
        image=converter.decode_texture(raw);buffer=io.BytesIO();image.save(buffer,format='PNG');return buffer.getvalue()

    def tool_json(self,kind,raw,tool,source,output,flags=()):
        def build():
            subprocess.run(['dotnet',str(tool),*flags,str(source),str(output)],check=True,capture_output=True)
            return output.read_bytes()
        value=self.resource_cache.produce(kind,[sha(raw)],build) if self.resource_cache else build()
        return json.loads(value)

    def material(self,pack,path,replacement=None):
        pair=(pack,key(path),key(replacement) if replacement else None)
        if pair in self.materials:return self.materials[pair]
        mat=json.loads(self.verified(pack,path))
        for field in ['base_color_texture','normal_texture','metallic_roughness_texture','occlusion_texture','emissive_texture']:
            if mat.get(field):
                if field=='base_color_texture' and replacement:continue
                source=self.texture_sources.get((pack,key(mat[field])))
                if source is None:raise ValueError('Texture has no direct source binding: '+mat[field])
                mat[field]=self.texture(source)
        if replacement:mat['base_color_texture']=self.texture(replacement)
        raw=encode(mat);self.materials[pair]=self.write(self.prefix+'Materials/'+sha(raw)+'.mmat',raw)
        return self.materials[pair]

    def particle_model(self,path):
        raise ValueError('Model-particle binding required: '+path)

    def prepare(self,path):
        normalized=key(path)
        if normalized in self.prepared:return self.prepared[normalized]
        raw=self.read(path);source=self.project/'SourceAssets'/converter.relative(path);source.parent.mkdir(parents=True,exist_ok=True);source.write_bytes(raw)
        result=dict(source=path,sourceSha256=sha(raw),parts=[],clips=[])
        if normalized in self.models:
            pack,model=self.models[normalized];record=self.collections[pack][2][normalized]
            if record['sha256']!=sha(raw):raise ValueError('Source MDX differs from converted library: '+path)
            metadata_path=source.with_suffix('.nodes.json')
            metadata=self.tool_json('node-metadata',raw,self.metadata_reader,source,metadata_path)
            tracks=json.loads(self.verified(pack,model['stateTracks']))
            result['clips']=model['clips']
            if not result['clips'] or tracks.get('fps')!=12 or len(tracks['clips'])!=len(result['clips']):raise ValueError('Unsupported source animation tracks: '+path)
            for part in model['parts']:
                mesh_raw=self.verified(pack,part['animatedMesh']);doc,_=nodes.read_glb(mesh_raw)
                if doc.get('skins'):
                    before=mesh_raw
                    mesh_raw=self.resource_cache.produce('annotated-mesh',[sha(before),sha(encode(metadata)),part['geoset']],lambda:nodes.annotate(before,metadata,part['geoset'])[0]) if self.resource_cache else nodes.annotate(before,metadata,part['geoset'])[0]
                mesh=self.write(self.prefix+'Models/'+sha(mesh_raw)+'.glb',mesh_raw)
                states=[]
                for clip in tracks['clips']:
                    sequence=[]
                    for frame in clip['frames']:
                        geo=frame['geosets'][part['geoset']];layer=frame['materials'][part['materialIndex']][part['layer']]
                        sequence.append(dict(color=[*geo['color'],geo['alpha']*layer['alpha']],texture=layer['texture']))
                    states.append(sequence)
                def movement():return encode([moving_clip(mesh_raw,i) for i in range(len(result['clips']))])
                moving=json.loads(self.resource_cache.produce('mesh-movement',[sha(mesh_raw),len(result['clips'])],movement) if self.resource_cache else movement())
                result['parts'].append(dict(part,mesh=mesh,pack=pack,states=states,moving=moving))
        # Source emitters are retained even when the MDX also has ordinary geosets.
        if raw[:4]!=b'MDLX':raise ValueError('Expected original MDX: '+path)
        chunks=[];offset=4
        while offset<len(raw):
            if offset+8>len(raw):raise ValueError('Truncated MDX chunk: '+path)
            tag,size=struct.unpack_from('<4sI',raw,offset);chunks.append((tag,size));offset+=8+size
        if offset!=len(raw):raise ValueError('Invalid MDX chunk bounds: '+path)
        if any(tag in (b'PREM',b'PRE2',b'RIBB',b'LITE') and size for tag,size in chunks):
            sampled=source.with_suffix('.effects.json')
            effect=self.tool_json('model-effects',raw,self.sampler,source,sampled,('--effects',));textures=effect['sourceModel']['textures']
            for mat in effect['materials']:
                if mat.get('modelPath'):
                    mat['model']=self.particle_model(mat['modelPath']);mat['texture']='';continue
                texture=textures[mat['textureId']] if 0<=mat['textureId']<len(textures) else {}
                replacement=mat['replaceableId'] or texture.get('replaceableId',0)
                texture_path=converter.REPLACEMENTS.get(replacement,texture.get('fileName',''))
                if not texture_path:raise ValueError('Unresolved effect texture; sampler must preserve original model-particle bindings: '+path)
                mat['texture']=self.texture(texture_path)
            result['effectClips']=[dict(name=c['name'],duration=c['duration'],loop=c['loop'],frameCount=len(c['frames'])) for c in effect['clips']]
            result['effect']=self.write(self.prefix+'Effects/'+sha(raw)+'.mfx',encode(effect))
            if not result['clips']:result['clips']=result['effectClips']
        if not result['parts'] and not result.get('effect'):raise ValueError('No native representation for source: '+path)
        source_clips=mdx_sequence_rarities(raw)
        if not source_clips and len(result['clips'])==1:source_clips=[dict(name=result['clips'][0]['name'],rarity=0,durationMs=round(result['clips'][0]['duration']*1000))]
        if [c['name'] for c in source_clips]!=[c['name'] for c in result['clips']]:raise ValueError('Sampled/source sequence order differs: '+path)
        result['clips']=[dict(clip,rarity=source['rarity'],durationMs=source['durationMs']) for clip,source in zip(result['clips'],source_clips)]
        result['choices']=[[index,sequence_weight(result['clips'][index]['rarity'])] for index in stand_sequence_candidates(result['clips'])]
        if result.get('effect') and [c['name'] for c in result['effectClips']]!=[c['name'] for c in result['clips']]:raise ValueError('Mesh/effect sequence order differs: '+path)
        self.records.append(dict(source=path,sha256=sha(raw),parts=len(result['parts']),effect=result.get('effect'),clips=result['clips']))
        self.prepared[normalized]=result
        print('Prepared source model',len(self.prepared),path,flush=True)
        return result


def build(export,game,output,sampler,metadata_reader,animation_seed=1,resource_cache=None,progress=None):
    export,output=export.resolve(),output.resolve()
    if output.exists():raise FileExistsError('Preserve existing output: '+str(output))
    binaries=[sampler,metadata_reader,sampler.with_name('Wc3ModelViewer.Core.dll'),metadata_reader.with_name('Wc3ModelViewer.Core.dll')]
    for binary in binaries:
        if not binary.is_file():raise FileNotFoundError('Required existing model tool: '+str(binary))
    receipt=json.loads((export/'map.json').read_bytes());original=(export/receipt['source']['preservedArchive']).resolve();original.relative_to(export)
    raw=original.read_bytes()
    if sha(raw)!=receipt['source']['sha256']:raise ValueError('Changed original map')
    data,members=load_map(original)
    if data['doodads'] is None:raise ValueError('Map has no doodad placements')
    if data['doodads']['terrainDoodads']:raise ValueError('Terrain doodad deformation requires a dedicated placement pass')
    if any(name in members for name in ['war3map.w3b','war3map.w3d']):raise ValueError('Map object overrides must be resolved before scene generation')
    output.parent.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='.doodad-scene-',dir=output.parent));archives=[]
    try:
        project=work/'project';terrain_builder.build(export,game,project,resource_cache=resource_cache)
        archives=[('map',mpyq.MPQArchive(io.BytesIO(raw[data['source']['mpqOffset']:]),listfile=False))]
        archives += [(name,mpyq.MPQArchive(str(game/name),listfile=False)) for name in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']]
        source_records={};source_cache={}
        archive_ids={name:receipt['source']['sha256'] if name=='map' else resource_cache.file_identity(game/name) for name,_ in archives} if resource_cache else {}
        def read(path):
            relative=converter.relative(path).as_posix();normalized=relative.lower()
            if normalized in source_cache:return source_cache[normalized]
            for archive_name,archive in archives:
                try:value=resource_cache.member(archive,relative,archive_ids[archive_name]) if resource_cache else read_archive(archive,relative.replace('/','\\'))
                except FileNotFoundError:continue
                destination=project/'SourceAssets'/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(value)
                source_records[normalized]=dict(path=relative,archive=archive_name,sha256=sha(value),bytes=len(value));source_cache[normalized]=value
                return value
            raise FileNotFoundError(relative)
        definitions=rows(read('Doodads/Doodads.slk'));destructables=rows(read('Units/DestructableData.slk'));definitions.update(destructables)
        assets=SceneAssets(project,read,sampler,metadata_reader,resource_cache=resource_cache)
        scene=json.loads((project/'Assets/Scenes/Main.mscene').read_bytes());entities=scene['world']['entities'];groups={};placements=[];animation_rand=MsvcRandom(animation_seed)
        bindings={};definitions_cache={};animation_definitions=[];actors=[]
        def binding(model,row,tint,ci):
            identity=(model['source'],row.get('texID'),row.get('texFile'),tuple(tint),ci)
            if identity in bindings:return bindings[identity]
            clip=model['clips'][ci];parts=[]
            for p in model['parts']:
                replacement=row.get('texFile') if row.get('texID','0')==str(p['replaceableId']) else None
                if replacement in ('_','-',None,''):replacement=None
                elif not replacement.lower().endswith('.blp'):replacement+='.blp'
                materials={str(t):assets.material(p['pack'],p['textureMaterials'].get(str(t),p['material']),replacement) for t in {s['texture'] for s in p['states'][ci]}}
                states=[dict(color=[*(s['color'][i]*tint[i] for i in range(3)),s['color'][3]],material=materials[str(s['texture'])]) for s in p['states'][ci]]
                parts.append(dict(mesh=p['mesh'],clip=ci,frames=len(states),duration=clip['duration'],loop=clip['loop'],moving=p['moving'][ci],states=states,durationMs=clip['durationMs'],restartOnEnd=True))
            effect=None
            if model.get('effect'):effect=dict(effect=model['effect'],clip=ci,playing=False,looping=False,speed=1,time_seconds=0)
            result=dict(durationMs=clip['durationMs'],parts=parts,effect=effect)
            bindings[identity]=result;return result
        def entity(name,components,parent=None,active=True):
            item=dict(entity=len(entities)+1,name=name,active=active,components=components)
            if parent is not None:item['parent']=parent
            entities.append(item);return item['entity']
        for index,d in enumerate(data['doodads']['doodads']):
            if progress:progress(index,len(data['doodads']['doodads']))
            row=definitions[d['id']];model=assets.prepare(model_path(row,d['variation']));dead=d['id'] in destructables and d['life']==0
            kind=placement_kind(d['id'] in destructables,d['flags'])
            ci,held=placement_clip(model['clips'],dead,animation_rand if kind!='suppressed' else MsvcRandom());clip=model['clips'][ci]
            name=f'Doodad-{index}-{d["id"]}-{d["editorId"]}';parent=entity(name,dict(Transform=placement_transform(d)),active=kind!='suppressed')
            tint=[float(row.get('color'+c,row.get(f'vert{c}{min(d["variation"],int(row["numVar"])-1)+1:02}',255)))/255 for c in 'RGB']
            selected=binding(model,row,tint,ci);scheduled=not held and kind!='suppressed' and len(model['choices'])>1
            part_names=[]
            for pi,p in enumerate(selected['parts']):
                states=p['states']
                frame=len(states)-1 if held else 0;state=states[frame];part_name=name+'-part-'+str(pi)
                renderer=dict(mesh=p['mesh']+f'#pose={ci}:{frame}',material=state['material'])
                block=dict(override_base_color=True,base_color=state['color'])
                entity(part_name,dict(Transform=dict(position=[0,0,0]),MeshRenderer=renderer,MaterialPropertyBlock=block),parent,state['color'][3]>.001);part_names.append(part_name)
                moving=p['moving'];varying=any(s!=states[0] for s in states[1:])
                if not held and not scheduled and kind!='suppressed' and (moving or varying):
                    group=p
                    signature=sha(encode(group));groups.setdefault(signature,dict(group,names=[]))['names'].append(part_name)
            if model.get('effect'):
                effect_clip=model['effectClips'][ci];effect=dict(selected['effect'],time_seconds=effect_clip['duration'] if held else 0)
                entity(name+'-effect',dict(Transform=dict(position=[0,0,0]),SampledEffect=effect),parent)
                if not held and not scheduled and kind!='suppressed':
                    group=dict(effect=effect,clip=ci,frames=effect_clip['frameCount'],duration=effect_clip['duration'],durationMs=clip['durationMs'],restartOnEnd=True)
                    signature=sha(encode(group));groups.setdefault(signature,dict(group,names=[]))['names'].append(name+'-effect')
            if scheduled:
                identity=(model['source'],row.get('texID'),row.get('texFile'),tuple(tint))
                if identity not in definitions_cache:
                    variants=[None]*len(model['clips'])
                    for variant in {0,ci,*(candidate for candidate,_ in model['choices'])}:variants[variant]=binding(model,row,tint,variant)
                    definitions_cache[identity]=len(animation_definitions);animation_definitions.append(dict(clips=variants,choices=model['choices']))
                actors.append(dict(definition=definitions_cache[identity],clip=ci,parts=part_names,effect=name+'-effect' if model.get('effect') else None))
            placements.append(dict(index=index,name=name,source=d,kind=kind,model=model['source'],parts=part_names,animation=dict(clip=ci,held=held)))
        (project/'Assets/Scenes/Main.mscene').write_bytes(encode(scene))
        script=Path(__file__).with_name('frost-original-doodads-client.js').read_text(encoding='utf-8')
        with (project/'Assets/Scripts/Main.js').open('a',encoding='utf-8',newline='\n') as stream:
            stream.write('\nvar originalDoodadGroups='+json.dumps(list(groups.values()),separators=(',',':'))+';\n')
            stream.write('var originalDoodadDefinitions='+json.dumps(animation_definitions,separators=(',',':'))+';\nvar originalDoodadActors='+json.dumps(actors,separators=(',',':'))+';\nvar originalDoodadRandomState='+str(animation_rand.state)+';\n'+script)
        (project/'doodad-placements.json').write_bytes(encode(placements))
        tools=[Path(__file__),Path(__file__).with_name('warcraft_doodads.py'),Path(__file__).with_name('frost-original-doodads-client.js'),Path(nodes.__file__),Path(converter.__file__),ROOT/'scripts/warcraft-node-metadata/Program.cs',ROOT/'scripts/warcraft-assets/Program.cs',*binaries]
        if progress:progress(len(placements),len(data['doodads']['doodads']))
        result=dict(mapSha256=sha(raw),placements=len(placements),entities=len(entities),animatedGroups=len(groups),animatedParts=sum(len(g['names']) for g in groups.values()),models=assets.records,sources=list(source_records.values()),sourceCollections=assets.collection_hashes,tools=[dict(path=str(p),sha256=sha(p.read_bytes())) for p in tools],upstream=dict(repository=converter.UPSTREAM,commit=converter.COMMIT),coverage=dict(models=True,sampledAnimation=True,sampledEmitters=True,gameplay=False,originalRuntimeParity=False),limitations=['Sampled viewer particles and ribbons are not verified against the original game solver','Placement dispatch assumes source runtime mode zero; complete creation, collision, pathing and random animation scheduling remain unverified','Object overrides, terrain doodad deformation and model particles are rejected'])
        result['animationSeed']=animation_seed&0xffffffff
        result['scheduledActors']=len(actors);result['animationDefinitions']=len(animation_definitions)
        result['animatedParts']=sum(len(g['names']) for g in groups.values() if not g.get('effect'))+sum(len(a['parts']) for a in actors)
        result['animatedEffects']=sum(len(g['names']) for g in groups.values() if g.get('effect'))+sum(bool(a['effect']) for a in actors)
        terrain_receipt=json.loads((project/'terrain-sources.json').read_bytes());terrain_receipt['entities']=len(entities);terrain_receipt['coverage']['doodads']=True;(project/'terrain-sources.json').write_bytes(encode(terrain_receipt))
        result['generatedFiles']=[dict(path=p.relative_to(project).as_posix(),bytes=p.stat().st_size,sha256=sha(p.read_bytes())) for p in sorted(project.rglob('*')) if p.is_file() and 'SourceAssets' not in p.relative_to(project).parts]
        (project/'doodad-scene-sources.json').write_bytes(encode(result))
        os.rename(project,output)
        return result
    finally:
        for _,archive in archives:archive.file.close()
        work.resolve().relative_to(output.parent);shutil.rmtree(work)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('export',type=Path);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'));parser.add_argument('--sampler',type=Path,default=ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll');parser.add_argument('--metadata-reader',type=Path,default=ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    parser.add_argument('--animation-seed',type=int,default=1,help='Reproducible initial Stand choices; original runtime RNG call order is not reproduced')
    args=parser.parse_args();result=build(args.export,args.game,args.output,args.sampler,args.metadata_reader,args.animation_seed)
    print(json.dumps({k:v for k,v in result.items() if k not in ['models','sources','tools']},ensure_ascii=False))
