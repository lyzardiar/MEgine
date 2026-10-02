"""Author: MiYu. Build textured 3D grove buildings from attributed existing game meshes."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',ROOT/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8'))
keys=['RealTreant','RealSpruceA','RealMossRock1','KingdomLodge','KingdomTower','KingdomWorkshop']
sources=[];geometry={};generated=[]
atlases={channel:Image.new('RGBA' if channel=='base' else 'RGB',(3072,2048),color) for channel,color in [('base',(255,255,255,255)),('normal',(128,128,255)),('arm',(255,224,0))]}
for slot,key in enumerate(keys):
    asset=catalog[key];material=json.loads((SAMPLE/asset['material']).read_text(encoding='utf-8'));mesh=asset['parts'][0]['mesh'];doc,blob=adapter.read_glb(SAMPLE/mesh)
    paths=[mesh,asset['material']]
    for channel,field in [('base','base_color_texture'),('normal','normal_texture'),('arm','metallic_roughness_texture')]:
        file=material.get(field)
        if file:
            paths.append(file);im=Image.open(SAMPLE/file).convert(atlases[channel].mode).resize((1008,1008),Image.Resampling.LANCZOS)
            tile=im.resize((1024,1024),Image.Resampling.NEAREST);tile.paste(im,(8,8));atlases[channel].paste(tile,(slot%3*1024,slot//3*1024))
    for file in dict.fromkeys(paths):sources.append({'file':file,'sha256':hashlib.sha256((SAMPLE/file).read_bytes()).hexdigest()})
    ps=[];ns=[];uv=[];idx=[]
    def visit(i,parent):
        node=doc['nodes'][i];matrix=parent@adapter.matrix(node)
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                attrs=primitive['attributes'];p=adapter.accessor(doc,blob,attrs['POSITION']);n=adapter.accessor(doc,blob,attrs['NORMAL']);t=adapter.accessor(doc,blob,attrs['TEXCOORD_0'])
                p=(matrix@np.c_[p,np.ones(len(p))].T).T[:,:3];n=(np.linalg.inv(matrix[:3,:3]).T@n.T).T
                idx.extend((adapter.accessor(doc,blob,primitive['indices']).reshape(-1)+len(ps)).tolist());ps.extend(p);ns.extend(n)
                uv.extend((t*1008+np.array([slot%3*1024+8,slot//3*1024+8]))/np.array([3072,2048]))
        for child in node.get('children',[]):visit(child,matrix)
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4))
    p=np.array(ps);lo=p.min(axis=0);hi=p.max(axis=0);size=np.maximum(hi-lo,.0001);p-=np.array([(hi[0]+lo[0])/2,lo[1],(hi[2]+lo[2])/2])
    geometry[key]=(p/size,np.array(ns)*size,np.array(uv),np.array(idx))

material='Assets/Materials/RealWildwood.mmat';maps={}
for channel,atlas in atlases.items():
    file='Assets/Textures/RealWildwood_'+channel+'.png';atlas.save(SAMPLE/file);maps[channel]=file;generated.append(file)
(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Wildwood bark, needles and timber','shader':'pbr','base_color':[1,1,1,1],'base_color_texture':maps['base'],'normal_texture':maps['normal'],'normal_scale':1,'metallic_roughness_texture':maps['arm'],'occlusion_texture':maps['arm'],'occlusion_strength':.7,'roughness':1,'metallic':0,'double_sided':True,'surface':'cutout','alpha_cutoff':.3})+'\n',encoding='utf-8');generated.append(material)
def part(key,size,at=(0,0,0),yaw=0):return {'key':key,'size':size,'position':at,'yaw':yaw}
rock=lambda size,at:part('RealMossRock1',size,at)
tree=lambda size,at:part('RealSpruceA',size,at)
roots=[rock((1.5,.6,1.3),(x,0,z)) for x,z in [(-1.5,1),(1.5,1),(-1.5,-1),(1.5,-1)]]
hall=[part('RealTreant',(4,4.8,2.8)),tree((2.4,6,2.4),(0,1,-.5))]+roots
layouts={
    'WildwoodHall':hall,
    'WildwoodHall2':hall+[tree((1.6,5,1.6),(-1.4,0,-1)),tree((1.6,5,1.6),(1.4,0,-1))],
    'WildwoodHall3':hall+[tree((2,6.8,2),(-1.5,0,-1)),tree((2,6.8,2),(1.5,0,-1))],
    'WildwoodBarracks':[part('KingdomLodge',(3.5,2.8,2.5))]+[tree((1.9,4.6,1.9),(x,0,-.7)) for x in [-1.9,1.9]],
    'WildwoodLodge':[part('KingdomLodge',(2.3,2.2,1.8)),tree((2.3,4.6,2.3),(0,0,-.7))],
    'WildwoodTower':[part('KingdomTower',(1.4,4,1.4)),tree((2.1,5.8,2.1),(0,0,-.4)),rock((2,.6,1.8),(0,0,0))],
    'WildwoodAltar':[part('RealTreant',(2.1,2.8,1.6),(0,.4,0)),rock((3,.7,2.8),(0,0,0))]+[tree((1.3,3.6,1.3),(x,0,-.6)) for x in [-1.2,1.2]],
    'WildwoodWorkshop':[part('KingdomWorkshop',(3.2,3,2.8)),tree((2.5,5.2,2.5),(-1,0,-.5)),rock((1.2,.9,1.1),(1.4,0,1))],
}
for key,parts in layouts.items():
    positions=[];normals=[];uvs=[];indices=[]
    for item in parts:
        p,n,t,idx=geometry[item['key']];scale=np.array(item['size']);a=math.radians(item['yaw']);c=math.cos(a);s=math.sin(a);rotation=np.array([[c,0,s],[0,1,0],[-s,0,c]])
        indices.extend((idx+len(positions)).tolist());positions.extend((p*scale)@rotation.T+item['position']);normal=(n/scale)@rotation.T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);normals.extend(normal);uvs.extend(t)
    positions=np.array(positions);lo=positions.min(axis=0);hi=positions.max(axis=0);positions-=np.array([(hi[0]+lo[0])/2,lo[1],(hi[2]+lo[2])/2])
    mesh='Assets/Models/Real'+key+'.glb';adapter.glb(SAMPLE/mesh,positions,normals,uvs,indices);generated.append(mesh)
    catalog[key]={'material':material,'parts':[{'name':key,'mesh':mesh,'pivot':[0,0,0]}],'size':(hi-lo).round(6).tolist(),'factionBuilding':True,'realistic':True}
catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
manifest={'generator':'scripts/import-frost-wildwood.py','licenses':['CC0-1.0','CC-BY-3.0'],'attributionManifests':['realistic-sources.json','house-sources.json','treant-sources.json'],'sources':sources,'models':layouts,'generated':[{'file':file,'sha256':hashlib.sha256((SAMPLE/file).read_bytes()).hexdigest()} for file in generated]}
(SAMPLE/'wildwood-sources.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(SAMPLE/'Assets/Licenses/Wildwood-buildings.txt').write_text('Wildwood 3D buildings and faction-buildings.png atlas derivatives:\nEntangled Roots tree creature by piacenti, mysterymagination and Misha, CC-BY-3.0: https://opengameart.org/content/entangled-roots\nhttps://creativecommons.org/licenses/by/3.0/\nTimber houses by Daniel74, CC0-1.0; Poly Haven spruce and moss rock scans, CC0-1.0.\nOriginal attribution and source hashes: treant-sources.json, house-sources.json, realistic-sources.json.\nGeometry, packed textures and grove arrangements generated by scripts/import-frost-wildwood.py.\n',encoding='utf-8')
print('Built',len(layouts),'textured 3D Wildwood buildings with shared PBR atlas.')
