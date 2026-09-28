"""Author: MiYu. Import pinned CC0 scan/PBR assets with reproducible textured LODs.
Requires numpy, Pillow, Node and: npm install --prefix tmp/frost-realistic-tools meshoptimizer@0.24.0 --ignore-scripts
"""
import hashlib
import importlib.util
import json
import math
import shutil
import subprocess
import urllib.request
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';MANIFEST=SAMPLE/'realistic-sources.json'
UA={'User-Agent':'MEngineAssetImporter/1.0 (https://github.com/lyzardiar/MEgine)'}

def main():
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    for item in manifest['sources']:
        target=(SAMPLE/item['file']).resolve()
        if not target.is_relative_to(SAMPLE.resolve()):raise ValueError('Source escapes sample')
        if not target.exists():
            data=urllib.request.urlopen(urllib.request.Request(item['url'],headers=UA),timeout=90).read()
            if hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Downloaded source changed: '+item['file'])
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Source changed: '+item['file'])
    spec=importlib.util.spec_from_file_location('adapter',ROOT/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());models={};generated=set();work=ROOT/'tmp/realistic-import';work.mkdir(parents=True,exist_ok=True)
    for texture in manifest.get('textures',[]):
        shutil.copyfile(SAMPLE/texture['source'],SAMPLE/texture['output']);generated.add(texture['output'])
    for asset in manifest['assets']:
        key=asset['id'];base=SAMPLE/'SourceAssets/polyhaven'/key;doc=json.loads((base/(key+'_1k.gltf')).read_text())
        if len(doc['buffers'])!=1:raise ValueError('Expected one geometry buffer')
        blob=(base/doc['buffers'][0]['uri']).read_bytes();materials=doc['materials'];uvs=[adapter.accessor(doc,blob,p['attributes']['TEXCOORD_0']) for m in doc['meshes'] for p in m['primitives']];vmin=math.floor(min(uv[:,1].min() for uv in uvs)+1e-6);vmax=math.ceil(max(uv[:,1].max() for uv in uvs)-1e-6);rows=max(1,vmax-vmin)
        tiles=[];columns=0
        for i in range(len(materials)):
            mus=[adapter.accessor(doc,blob,p['attributes']['TEXCOORD_0']) for m in doc['meshes'] for p in m['primitives'] if p.get('material',0)==i]
            low=math.floor(min(uv[:,0].min() for uv in mus)+1e-6);high=math.ceil(max(uv[:,0].max() for uv in mus)-1e-6);width=max(1,high-low);tiles.append((low,width,columns));columns+=width
        if max(columns,rows)>8:raise ValueError('Tiled atlas exceeds 8192 pixels')
        maps={}
        for channel in ['base','normal','arm']:
            atlas=Image.new('RGB',(1024*columns,1024*rows))
            for i,mat in enumerate(materials):
                texture=mat['normalTexture'] if channel=='normal' else mat['pbrMetallicRoughness']['baseColorTexture' if channel=='base' else 'metallicRoughnessTexture']
                image=doc['images'][doc['textures'][texture['index']]['source']];source=(base/image['uri']).resolve()
                if not source.is_relative_to(base.resolve()):raise ValueError('Texture escapes asset')
                im=Image.open(source).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
                for row in range(rows):
                    for col in range(tiles[i][1]):atlas.paste(im,((tiles[i][2]+col)*1024,row*1024))
            file='Assets/Textures/Real_'+key+'_'+channel+'.png';atlas.save(SAMPLE/file);maps[channel]=file;generated.add(file)
        material='Assets/Materials/Real_'+key+'.mmat';values={'version':8,'name':'Real '+key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':maps['base'],'normal_texture':maps['normal'],'normal_scale':1,'metallic_roughness_texture':maps['arm'],'metallic':0,'roughness':1,'double_sided':True}
        if key!='rock_moss_set_01':values.update(occlusion_texture=maps['arm'],occlusion_strength=.7)
        (SAMPLE/material).write_bytes(json.dumps(values).encode());generated.add(material)
        for index,node in enumerate(doc['nodes']):
            if 'mesh' not in node:continue
            name=asset['names'][index];positions=[];normals=[];coords=[];indices=[];transform=adapter.matrix(node)
            for prim in doc['meshes'][node['mesh']]['primitives']:
                if prim.get('mode',4)!=4:raise ValueError('Expected triangles')
                p=adapter.accessor(doc,blob,prim['attributes']['POSITION']);n=adapter.accessor(doc,blob,prim['attributes']['NORMAL']);uv=adapter.accessor(doc,blob,prim['attributes']['TEXCOORD_0']);tile=tiles[prim.get('material',0)];uv[:,0]=(uv[:,0]-tile[0]+tile[2])/columns;uv[:,1]=(uv[:,1]-vmin)/rows
                indices.extend((adapter.accessor(doc,blob,prim['indices']).astype(np.int64).reshape(-1)+len(positions)).tolist());positions.extend((transform@np.c_[p,np.ones(len(p))].T).T[:,:3]);normal=(np.linalg.inv(transform[:3,:3]).T@n.T).T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);normals.extend(normal);coords.extend(uv)
            positions=np.asarray(positions);lo=positions.min(axis=0);hi=positions.max(axis=0);positions-=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]);original=work/(name+'.glb');adapter.glb(original,positions,normals,coords,indices)
            meshes=[];stats=[]
            for lod,target in enumerate(asset['triangles']):
                mesh='Assets/Models/'+name+('-far' if lod else '')+'.glb';result=subprocess.check_output(['node',str(ROOT/'scripts/simplify-frost-model.mjs'),str(original),str(SAMPLE/mesh),str(target),str(.012 if lod==0 else .04)],cwd=ROOT,text=True);meshes.append(mesh);stats.append(json.loads(result));generated.add(mesh)
            catalog[name]={'material':material,'parts':[{'name':name,'mesh':meshes[0],'pivot':[0,0,0]}],'size':(hi-lo).round(6).tolist(),'lods':meshes,'realistic':True};models[name]={'source':key,'node':index,'lods':stats};print(name,stats,flush=True)
    manifest['models']=models;manifest['generated']=[{'file':file,'sha256':hashlib.sha256((SAMPLE/file).read_bytes()).hexdigest()} for file in sorted(generated)];MANIFEST.write_bytes((json.dumps(manifest,indent=2)+'\n').encode());catalog_path.write_bytes((json.dumps(catalog,indent=2)+'\n').encode())
if __name__=='__main__':main()
