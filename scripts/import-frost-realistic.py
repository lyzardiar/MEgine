"""Author: MiYu. Import pinned CC0 scan/PBR assets with reproducible textured LODs.
Requires numpy, Pillow, Node, Blender 4.5.9 via BLENDER/PATH, and pinned meshoptimizer@0.24.0.
"""
import hashlib
import argparse
import importlib.util
import json
import math
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';MANIFEST=SAMPLE/'realistic-sources.json'
UA={'User-Agent':'MEngineAssetImporter/1.0 (https://github.com/lyzardiar/MEgine)'}

def texture_mapping(texture):
    transform=texture.get('extensions',{}).get('KHR_texture_transform',{})
    return (transform.get('texCoord',texture.get('texCoord',0)),tuple(transform.get('scale',[1,1])),tuple(transform.get('offset',[0,0])),transform.get('rotation',0))

def texture_uvs(uv,mapping):
    _,scale,offset,rotation=mapping;c=math.cos(rotation);s=math.sin(rotation)
    return (np.asarray(uv)*scale)@np.array([[c,s],[-s,c]])+offset

def pad_texture(image,mask,radius=32):
    """Extend authored texels into unused repeating UV space before mip generation."""
    if image.size!=mask.size:raise ValueError('Padding mask must match the source texture')
    pixels=np.array(image);valid=np.array(mask.convert('L'))>=128
    if not valid.any():raise ValueError('Padding mask has no authored texels')
    for _ in range(radius):
        filled=valid.copy()
        for axis,shift in [(0,-1),(0,1),(1,-1),(1,1)]:
            take=~filled&np.roll(valid,shift,axis)
            pixels[take]=np.roll(pixels,shift,axis)[take];filled|=take
        if np.array_equal(valid,filled):break
        valid=filled
    return Image.fromarray(pixels)

def alpha_image(path):
    image=Image.open(path)
    if image.mode.startswith('I'):
        values=np.asarray(image);return Image.fromarray(np.rint(values/257).clip(0,255).astype(np.uint8))
    return image.convert('L')

def import_material_parts(asset,doc,blob,base,adapter,catalog,models,generated):
    """Keep authored repeating UVs and independent PBR materials on a shared model pivot."""
    key=asset['id'];materials=doc['materials'];bindings=[];mappings=[]
    for mat in materials:
        pbr=mat['pbrMetallicRoughness'];mapping=texture_mapping(pbr['baseColorTexture']);mappings.append(mapping);maps={};mask=None
        for channel,texture in [('base',pbr['baseColorTexture']),('normal',mat['normalTexture']),('arm',pbr['metallicRoughnessTexture'])]:
            if texture_mapping(texture)!=mapping:raise ValueError('Part material texture transforms must match: '+mat['name'])
            entry=doc['textures'][texture['index']];sampler=doc.get('samplers',[{}])[entry.get('sampler',0)]
            if sampler.get('wrapS',10497)!=10497 or sampler.get('wrapT',10497)!=10497:raise ValueError('Part material requires repeat sampling')
            image=doc['images'][entry['source']];source=(base/image['uri']).resolve()
            if not source.is_relative_to(base.resolve()):raise ValueError('Texture escapes asset')
            authored=asset.get('material_images',{}).get(mat['name'],{})
            if channel=='base' and authored.get('base'):
                source=(SAMPLE/authored['base']).resolve()
                if not source.is_relative_to(SAMPLE.resolve()):raise ValueError('Base color image escapes sample')
            im=Image.open(source).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
            if mat.get('alphaMode','OPAQUE')!='OPAQUE':
                if mask is None:
                    alpha=(SAMPLE/authored['alpha']).resolve() if authored.get('alpha') else None
                    if alpha and not alpha.is_relative_to(SAMPLE.resolve()):raise ValueError('Alpha image escapes sample')
                    mask=alpha_image(alpha).resize((1024,1024),Image.Resampling.LANCZOS) if alpha else Image.open(source).convert('RGBA').getchannel('A').resize((1024,1024),Image.Resampling.LANCZOS)
                im=pad_texture(im,mask)
                if channel=='base':im.putalpha(mask)
            file='Assets/Textures/Real_'+mat['name']+'_'+channel+'.png';im.save(SAMPLE/file);maps[channel]=file;generated.add(file)
        material='Assets/Materials/Real_'+mat['name']+'.mmat';values={'version':8,'name':'Real '+mat['name'],'shader':'pbr','base_color':pbr.get('baseColorFactor',[1,1,1,1]),'base_color_texture':maps['base'],'normal_texture':maps['normal'],'normal_scale':mat['normalTexture'].get('scale',1),'metallic_roughness_texture':maps['arm'],'metallic':pbr.get('metallicFactor',0),'roughness':pbr.get('roughnessFactor',1),'double_sided':True,'occlusion_texture':maps['arm'],'occlusion_strength':.7}
        if mask is not None:values.update(surface='cutout',alpha_cutoff=.3)
        (SAMPLE/material).write_bytes(json.dumps(values).encode());generated.add(material);bindings.append(material)
    authored={node:(asset['names'][i],lod) for i,pair in enumerate(asset['lod_nodes']) for lod,node in enumerate(pair)}
    if not set(authored).issubset({n.get('name') for n in doc['nodes']}):raise ValueError('Missing part LOD node')
    for node in doc['nodes']:
        if 'mesh' not in node:continue
        name,lod=authored[node['name']];transform=adapter.matrix(node);groups={}
        for prim in doc['meshes'][node['mesh']]['primitives']:
            if prim.get('mode',4)!=4:raise ValueError('Expected part triangles')
            index=prim.get('material',0);mapping=mappings[index];p=adapter.accessor(doc,blob,prim['attributes']['POSITION']);n=adapter.accessor(doc,blob,prim['attributes']['NORMAL']);uv=texture_uvs(adapter.accessor(doc,blob,prim['attributes']['TEXCOORD_'+str(mapping[0])]),mapping)
            group=groups.setdefault(index,{'positions':[],'normals':[],'coords':[],'indices':[]});group['indices'].extend((adapter.accessor(doc,blob,prim['indices']).astype(np.int64).reshape(-1)+len(group['positions'])).tolist());group['positions'].extend((transform@np.c_[p,np.ones(len(p))].T).T[:,:3]);normal=(np.linalg.inv(transform[:3,:3]).T@n.T).T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);group['normals'].extend(normal);group['coords'].extend(uv)
        positions=np.concatenate([g['positions'] for g in groups.values()]);lo=positions.min(axis=0);hi=positions.max(axis=0);pivot=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]);parts=[];stats=[]
        for index,g in sorted(groups.items()):
            part=materials[index]['name'].removeprefix(key+'_');mesh='Assets/Models/'+name+'-'+part+('-far' if lod else '')+'.glb';adapter.glb(SAMPLE/mesh,np.asarray(g['positions'])-pivot,g['normals'],g['coords'],g['indices']);generated.add(mesh);parts.append({'name':part,'mesh':mesh,'material':bindings[index],'pivot':[0,0,0]});stats.append({'material':materials[index]['name'],'triangles':len(g['indices'])//3,'vertices':len(g['positions'])})
        entry=models.setdefault(name,{'source':key,'nodes':asset['lod_nodes'][asset['names'].index(name)],'lods':[None,None]});entry['lods'][lod]={'triangles':sum(s['triangles'] for s in stats),'vertices':sum(s['vertices'] for s in stats),'authored':not bool(asset.get('decimate')),'parts':stats}
        art=catalog.setdefault(name,{'lods':[None,None],'lod_parts':[None,None],'realistic':True});art['lod_parts'][lod]=parts;art['lods'][lod]=parts[0]['mesh']
        if lod==0:art.update(material=parts[0]['material'],parts=parts,size=(hi-lo).round(6).tolist())
        print(name,entry['lods'][lod],flush=True)

def main():
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    parser=argparse.ArgumentParser();parser.add_argument('--asset',action='append',choices=[a['id'] for a in manifest['assets']]);args=parser.parse_args()
    for item in manifest['sources']:
        if args.asset and item['asset'] not in args.asset:continue
        target=(SAMPLE/item['file']).resolve()
        if not target.is_relative_to(SAMPLE.resolve()):raise ValueError('Source escapes sample')
        if not target.exists():
            data=urllib.request.urlopen(urllib.request.Request(item['url'],headers=UA),timeout=90).read()
            if hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Downloaded source changed: '+item['file'])
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Source changed: '+item['file'])
    spec=importlib.util.spec_from_file_location('adapter',ROOT/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());models=dict(manifest.get('models',{})) if args.asset else {};generated={e['file'] for e in manifest.get('generated',[])} if args.asset else set();work=ROOT/'tmp/realistic-import';work.mkdir(parents=True,exist_ok=True)
    for texture in manifest.get('textures',[]):
        if args.asset:continue
        shutil.copyfile(SAMPLE/texture['source'],SAMPLE/texture['output']);generated.add(texture['output'])
    for asset in manifest['assets']:
        if args.asset and asset['id'] not in args.asset:continue
        key=asset['id'];base=SAMPLE/'SourceAssets/polyhaven'/key
        if asset.get('blend'):
            base=work/key
            subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/export-frost-foliage.py'),'--',str(base/(key+'_1k.gltf')),'--asset',key],check=True)
        doc=json.loads((base/(key+'_1k.gltf')).read_text())
        if len(doc['buffers'])!=1:raise ValueError('Expected one geometry buffer')
        blob=(base/doc['buffers'][0]['uri']).read_bytes();materials=doc['materials'];mappings=[]
        if asset.get('separate_materials'):
            import_material_parts(asset,doc,blob,base,adapter,catalog,models,generated);continue
        for mat in materials:
            pbr=mat['pbrMetallicRoughness'];mapping=texture_mapping(pbr['baseColorTexture'])
            if any(texture_mapping(texture)!=mapping for texture in [mat['normalTexture'],pbr['metallicRoughnessTexture']]):raise ValueError('Atlas requires matching color, normal and ARM texture transforms: '+mat['name'])
            mappings.append(mapping)
        def read_uv(primitive):
            mapping=mappings[primitive.get('material',0)]
            return texture_uvs(adapter.accessor(doc,blob,primitive['attributes']['TEXCOORD_'+str(mapping[0])]),mapping)
        uvs=[read_uv(p) for m in doc['meshes'] for p in m['primitives']];vmin=math.floor(min(uv[:,1].min() for uv in uvs)+1e-6);vmax=math.ceil(max(uv[:,1].max() for uv in uvs)-1e-6);rows=max(1,vmax-vmin)
        tiles=[];columns=0
        for i in range(len(materials)):
            mus=[read_uv(p) for m in doc['meshes'] for p in m['primitives'] if p.get('material',0)==i]
            low=math.floor(min(uv[:,0].min() for uv in mus)+1e-6);high=math.ceil(max(uv[:,0].max() for uv in mus)-1e-6);width=max(1,high-low);tiles.append((low,width,columns));columns+=width
        if max(columns,rows)>8:raise ValueError('Tiled atlas exceeds 8192 pixels')
        maps={};alpha_masks={}
        for i,mat in enumerate(materials):
            if mat.get('alphaMode','OPAQUE')!='OPAQUE':
                texture=mat['pbrMetallicRoughness']['baseColorTexture'];image=doc['images'][doc['textures'][texture['index']]['source']]
                source_alpha=asset.get('material_images',{}).get(mat['name'],{}).get('alpha')
                if source_alpha:
                    source_alpha=(SAMPLE/source_alpha).resolve()
                    if not source_alpha.is_relative_to(SAMPLE.resolve()):raise ValueError('Alpha image escapes sample')
                source_color=asset.get('material_images',{}).get(mat['name'],{}).get('base')
                alpha=(alpha_image(source_alpha) if source_alpha else Image.open(SAMPLE/source_color if source_color else base/image['uri']).convert('RGBA').getchannel('A')).resize((1024,1024),Image.Resampling.LANCZOS)
                if alpha.getextrema()[0]<255:alpha_masks[i]=alpha
        for channel in ['base','normal','arm']:
            atlas=Image.new('RGBA' if channel=='base' and alpha_masks else 'RGB',(1024*columns,1024*rows))
            for i,mat in enumerate(materials):
                texture=mat['normalTexture'] if channel=='normal' else mat['pbrMetallicRoughness']['baseColorTexture' if channel=='base' else 'metallicRoughnessTexture']
                image=doc['images'][doc['textures'][texture['index']]['source']];source=(base/image['uri']).resolve()
                if not source.is_relative_to(base.resolve()):raise ValueError('Texture escapes asset')
                source_color=asset.get('material_images',{}).get(mat['name'],{}).get('base') if channel=='base' else None
                if source_color:
                    source=(SAMPLE/source_color).resolve()
                    if not source.is_relative_to(SAMPLE.resolve()):raise ValueError('Base color image escapes sample')
                im=Image.open(source).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
                if i in alpha_masks:im=pad_texture(im,alpha_masks[i])
                if atlas.mode=='RGBA':im.putalpha(alpha_masks.get(i,Image.new('L',(1024,1024),255)))
                for row in range(rows):
                    for col in range(tiles[i][1]):atlas.paste(im,((tiles[i][2]+col)*1024,row*1024))
            file='Assets/Textures/Real_'+key+'_'+channel+'.png';atlas.save(SAMPLE/file);maps[channel]=file;generated.add(file)
        material='Assets/Materials/Real_'+key+'.mmat';values={'version':8,'name':'Real '+key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':maps['base'],'normal_texture':maps['normal'],'normal_scale':1,'metallic_roughness_texture':maps['arm'],'metallic':0,'roughness':1,'double_sided':True}
        if alpha_masks:values.update(surface='cutout',alpha_cutoff=.3)
        if key!='rock_moss_set_01':values.update(occlusion_texture=maps['arm'],occlusion_strength=.7)
        (SAMPLE/material).write_bytes(json.dumps(values).encode());generated.add(material)
        if asset.get('dry_base'):
            if len(materials)!=1 or columns!=1 or rows!=1 or 0 not in alpha_masks:raise ValueError('Dry grass requires a single masked texture panel')
            dry=pad_texture(Image.open(SAMPLE/asset['dry_base']).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS),alpha_masks[0]).convert('RGBA');dry.putalpha(alpha_masks[0])
            dry_texture='Assets/Textures/Real_'+key+'_dry.png';dry.save(SAMPLE/dry_texture);generated.add(dry_texture)
            dry_material='Assets/Materials/Real_'+key+'_dry.mmat';(SAMPLE/dry_material).write_bytes(json.dumps({**values,'name':'Real dry '+key,'base_color_texture':dry_texture}).encode());generated.add(dry_material)
        authored={node_name:(asset['names'][index],lod) for index,pair in enumerate(asset.get('lod_nodes',[])) for lod,node_name in enumerate(pair)}
        if authored and not set(authored).issubset({node.get('name') for node in doc['nodes']}):raise ValueError('Missing authored LOD node')
        selected=asset.get('source_nodes');node_names={node.get('name') for node in doc['nodes'] if 'mesh' in node}
        if selected and (len(selected)!=len(asset['names']) or not set(selected).issubset(node_names)):raise ValueError('Missing selected source node')
        for index,node in enumerate(doc['nodes']):
            if 'mesh' not in node or selected and node['name'] not in selected:continue
            name,authored_lod=authored[node['name']] if authored else (asset['names'][selected.index(node['name']) if selected else index],None)
            positions=[];normals=[];coords=[];indices=[];transform=adapter.matrix(node)
            for prim in doc['meshes'][node['mesh']]['primitives']:
                if prim.get('mode',4)!=4:raise ValueError('Expected triangles')
                p=adapter.accessor(doc,blob,prim['attributes']['POSITION']);n=adapter.accessor(doc,blob,prim['attributes']['NORMAL']);uv=read_uv(prim);tile=tiles[prim.get('material',0)];uv[:,0]=(uv[:,0]-tile[0]+tile[2])/columns;uv[:,1]=(uv[:,1]-vmin)/rows
                indices.extend((adapter.accessor(doc,blob,prim['indices']).astype(np.int64).reshape(-1)+len(positions)).tolist());positions.extend((transform@np.c_[p,np.ones(len(p))].T).T[:,:3]);normal=(np.linalg.inv(transform[:3,:3]).T@n.T).T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);normals.extend(normal);coords.extend(uv)
            positions=np.asarray(positions);lo=positions.min(axis=0);hi=positions.max(axis=0);positions-=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]);original=work/(name+'.glb');adapter.glb(original,positions,normals,coords,indices)
            meshes=[];stats=[]
            if authored_lod is not None:
                mesh='Assets/Models/'+name+('-far' if authored_lod else '')+'.glb';shutil.copyfile(original,SAMPLE/mesh);generated.add(mesh)
                entry=models.setdefault(name,{'source':key,'nodes':asset['lod_nodes'][asset['names'].index(name)],'lods':[None,None]})
                entry.pop('node',None);entry['nodes']=asset['lod_nodes'][asset['names'].index(name)]
                entry['lods'][authored_lod]={'triangles':len(indices)//3,'vertices':len(positions),'authored':not bool(asset.get('decimate'))}
                if authored_lod==0:catalog[name]={'material':material,'parts':[{'name':name,'mesh':mesh,'pivot':[0,0,0]}],'size':(hi-lo).round(6).tolist(),'lods':['Assets/Models/'+name+'.glb','Assets/Models/'+name+'-far.glb'],'realistic':True}
            else:
                for lod,target in enumerate(asset['triangles']):
                    mesh='Assets/Models/'+name+('-far' if lod else '')+'.glb';result=subprocess.check_output(['node',str(ROOT/'scripts/simplify-frost-model.mjs'),str(original),str(SAMPLE/mesh),str(target),str(.012 if lod==0 else .04)],cwd=ROOT,text=True);meshes.append(mesh);stats.append(json.loads(result));generated.add(mesh)
                catalog[name]={'material':material,'parts':[{'name':name,'mesh':meshes[0],'pivot':[0,0,0]}],'size':(hi-lo).round(6).tolist(),'lods':meshes,'realistic':True};models[name]={'source':key,'node':index,'lods':stats}
            print(name,models[name],flush=True)
    manifest['models']=models;manifest['generated']=[{'file':file,'sha256':hashlib.sha256((SAMPLE/file).read_bytes()).hexdigest()} for file in sorted(generated)];MANIFEST.write_bytes((json.dumps(manifest,indent=2)+'\n').encode());catalog_path.write_bytes((json.dumps(catalog,indent=2)+'\n').encode())
if __name__=='__main__':main()
