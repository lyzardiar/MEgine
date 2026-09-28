"""Author: MiYu. Reproducible faction buildings assembled from licensed Kenney modules."""
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import shutil
import urllib.request
import zipfile
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
PACKS={
    'nature-kit':('https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip','fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d'),
    'castle-kit':('https://kenney.nl/media/pages/assets/castle-kit/a395102d20-1711543616/kenney_castle-kit.zip','921f3f73927bb23106cae34bc21d5ab4b033a9fc120475e96f714a406e3169df'),
    'graveyard-kit':('https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip','1a93613f2e5675f3310acf49ec9ef13ae7adeb756ac3b205bfb6cc9311a81062'),
}

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

def part(pack,name,size,at=(0,0,0),yaw=0):
    return {'pack':pack,'model':name,'size':list(size),'position':list(at),'yaw':yaw}

def layouts():
    c=lambda name,size,at=(0,0,0),yaw=0:part('castle-kit',name,size,at,yaw)
    n=lambda name,size,at=(0,0,0),yaw=0:part('nature-kit',name,size,at,yaw)
    g=lambda name,size,at=(0,0,0),yaw=0:part('graveyard-kit',name,size,at,yaw)
    crowns=lambda model,height:[c(model,(.9,height,.9),(x,0,z)) for x,z in [(-1.65,-1.65),(1.65,-1.65),(-1.65,1.65),(1.65,1.65)]]
    stakes=lambda:[n('stump_oldTall',(.35,2.7,.35),(x,0,z)) for x,z in [(-1.8,-1.6),(1.8,-1.6),(-1.8,1.6),(1.8,1.6)]]
    trees=lambda:[n('tree_oak',(2,3.2,2),(x,0,-.8)) for x in [-1.55,1.55]]
    spires=lambda:[g('pillar-obelisk',(.55,3.5,.55),(x,0,z)) for x,z in [(-1.7,-1.7),(1.7,-1.7),(-1.7,1.7),(1.7,1.7)]]
    return {
        'KingdomHall':[c('tower-square-base',(3.8,2.1,3.8)),c('tower-square-top-roof-high-windows',(4,2.2,4),(0,2,0))]+crowns('tower-square-top',2.8),
        'KingdomBarracks':[c('tower-square-mid-door',(3.3,1.8,3)),c('tower-square-roof',(3.6,1.3,3.3),(0,1.8,0)),c('flag-banner-long',(.4,1.3,.15),(1.1,2.2,1.55))],
        'KingdomLodge':[c('tower-square-mid-door',(2.4,1.4,2.2)),c('tower-slant-roof',(2.6,1.1,2.4),(0,1.4,0))],
        'KingdomTower':[c('tower-square-mid-windows',(1.4,3.4,1.4)),c('tower-square-top',(1.9,.85,1.9),(0,3.4,0))],
        'KingdomAltar':[c('tower-hexagon-base',(2.6,.5,2.6)),c('tower-hexagon-mid',(1.9,2.4,1.9),(0,.5,0)),c('tower-hexagon-roof',(2.5,1.6,2.5),(0,2.9,0))],
        'KingdomWorkshop':[c('tower-square-mid-open',(3.5,1.7,3)),c('tower-square-roof',(3.8,1.2,3.3),(0,1.7,0)),c('siege-ballista',(1.6,1,1.7),(1,0,1.4))],
        'WarclansHall':[n('tent_detailedOpen',(3.8,3,3.8))]+stakes()+[n('campfire_logs',(1,.5,1),(0,0,2))],
        'WarclansBarracks':[n('tent_detailedOpen',(2.4,2.2,3),(-.8,0,0)),n('tent_smallClosed',(1.7,1.7,2.4),(1.3,0,-.2)),n('log_stackLarge',(1.8,.8,.8),(0,0,1.7))],
        'WarclansLodge':[n('tent_smallOpen',(2.4,1.8,2.4)),n('log_stack',(1.4,.6,.6),(0,0,1.4))],
        'WarclansTower':[n('stump_oldTall',(.6,3,.6)),c('tower-hexagon-top-wood',(1.9,1.2,1.9),(0,2.3,0)),n('tent_smallClosed',(1.6,1.1,1.6),(0,3.4,0))],
        'WarclansAltar':[n('statue_ring',(2.8,.4,2.8)),n('statue_head',(1.7,2.2,1.4),(0,.4,0)),n('campfire_logs',(.8,.5,.8),(0,.4,1.1))],
        'WarclansWorkshop':[n('tent_detailedOpen',(3.5,2.1,3)),c('siege-catapult',(2,1.5,2),(0,0,1.3)),n('log_stackLarge',(1,1.2,2),(-1.7,0,0))],
        'WildwoodHall':[n('stump_old',(2.3,1.3,2.3)),n('tree_oak',(4.6,5.4,4.6)),n('statue_ring',(3.2,.4,3.2),(0,1.6,0))],
        'WildwoodBarracks':trees()+[n('statue_ring',(3.2,.45,2.7)),n('stump_old',(1.7,1.5,1.3),(0,0,-.3))],
        'WildwoodLodge':[n('tree_fat',(2.5,3.2,2.5)),n('statue_ring',(2.4,.3,2.4))],
        'WildwoodTower':[n('tree_thin',(1.8,4.8,1.8)),n('statue_ring',(1.5,.4,1.5),(0,2.5,0))],
        'WildwoodAltar':[n('statue_ring',(2.8,.6,2.8)),n('statue_obelisk',(.85,3,.85),(0,.5,0))]+[n('tree_small',(1,1.9,1),(x,0,-.7)) for x in [-1.1,1.1]],
        'WildwoodWorkshop':[n('stump_oldTall',(2,2.5,2),(-.65,0,0)),n('tree_oak',(3.1,3.8,3.1),(-.65,0,0)),c('siege-trebuchet',(1.9,2.5,1.9),(1,0,.8))],
        'RevenantHall':[g('crypt-large',(3.5,2.4,3.5)),g('crypt-large-roof',(4,1.1,4),(0,2.35,0))]+spires(),
        'RevenantBarracks':[g('crypt',(3.2,2,2.6)),g('crypt-small-roof',(3.5,1.1,2.9),(0,1.8,0))]+[g('gravestone-decorative',(.6,1.1,.4),(x,0,1.5)) for x in [-1.3,1.3]],
        'RevenantLodge':[g('grave-border',(2.4,.25,2.4)),g('gravestone-cross-large',(1.1,2.5,.6),(0,0,-.6)),g('coffin',(1,.5,1.8),(0,.25,.3))],
        'RevenantTower':[g('pillar-obelisk',(1.5,4.4,1.5)),g('altar-stone',(1.8,.5,1.8))],
        'RevenantAltar':[g('altar-stone',(2.7,1,2.7)),g('cross-column',(1.2,3.1,.8),(0,.7,0))]+[g('candle-multiple',(.5,.8,.5),(x,1,0)) for x in [-.9,.9]],
        'RevenantWorkshop':[g('crypt-a',(3,2.3,2.6)),g('coffin-old',(1,.5,2.2),(-1,0,1.5)),g('coffin-old',(1,.5,2.2),(1,0,1.5)),g('pillar-obelisk',(.7,3,.7),(0,0,-1.4))],
    }

def main():
    adapter=module('ion_adapter','scripts/import-ion-assets.py')
    sources=[];folders={}
    for pack,(url,sha) in PACKS.items():
        archive=SAMPLE/'SourceAssets'/(pack+'.zip')
        if not archive.exists():
            temporary=archive.with_suffix('.part');urllib.request.urlretrieve(url,temporary);temporary.replace(archive)
        if hashlib.sha256(archive.read_bytes()).hexdigest()!=sha:raise ValueError('Source SHA-256 mismatch: '+pack)
        folder=ROOT/'tmp/frost-factions'/pack;folder.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(archive) as z:
            for item in z.infolist():
                if not (folder/item.filename).resolve().is_relative_to(folder.resolve()):raise ValueError('Unsafe archive path')
            z.extractall(folder)
        folders[pack]=folder;license_path=SAMPLE/'Licenses'/(pack+'.txt')
        if not license_path.exists():shutil.copyfile(next(folder.rglob('License.txt')),license_path)
        sources.append({'author':'Kenney','license':'CC0-1.0','page':'https://kenney.nl/assets/'+pack,'download':url,'file':'SourceAssets/'+pack+'.zip','sha256':sha})
    geometry={}
    def load(pack,name):
        key=(pack,name)
        if key in geometry:return geometry[key]
        source=next(folders[pack].rglob(name+'.glb'));doc,blob=adapter.read_glb(source);ps=[];ns=[];cs=[];indices=[]
        def visit(i,parent):
            node=doc['nodes'][i];matrix=parent@adapter.matrix(node)
            if 'mesh' in node:
                for primitive in doc['meshes'][node['mesh']]['primitives']:
                    positions=adapter.accessor(doc,blob,primitive['attributes']['POSITION']);normals=adapter.accessor(doc,blob,primitive['attributes']['NORMAL'])
                    positions=(matrix@np.c_[positions,np.ones(len(positions))].T).T[:,:3];normals=(np.linalg.inv(matrix[:3,:3]).T@normals.T).T
                    mat=doc.get('materials',[{}])[primitive.get('material',0)];pbr=mat.get('pbrMetallicRoughness',{});factor=np.array(pbr.get('baseColorFactor',[1,1,1,1])[:3]);colors=np.tile(factor,(len(positions),1))
                    if 'baseColorTexture' in pbr:
                        texture=pbr['baseColorTexture'];image=doc['images'][doc['textures'][texture['index']]['source']]
                        if 'uri' in image:
                            target=(source.parent/image['uri']).resolve()
                            if not target.is_relative_to(folders[pack].resolve()):raise ValueError('Texture escapes source pack')
                            im=Image.open(target).convert('RGB')
                        else:
                            view=doc['bufferViews'][image['bufferView']];offset=view.get('byteOffset',0);im=Image.open(io.BytesIO(blob[offset:offset+view['byteLength']])).convert('RGB')
                        uv=adapter.accessor(doc,blob,primitive['attributes']['TEXCOORD_0']);pixels=np.asarray(im)
                        colors=pixels[np.clip((uv[:,1]*im.height).astype(int),0,im.height-1),np.clip((uv[:,0]*im.width).astype(int),0,im.width-1)]/255*factor
                    material=mat.get('name','').lower()
                    if 'leaf' in material:colors[:]=[.12,.35,.22]
                    elif 'wood' in material:colors[:]=[.3,.17,.09] if 'bark' in material else [.43,.27,.12]
                    elif material=='colorred':colors[:]=[.55,.21,.08]
                    indices.extend((adapter.accessor(doc,blob,primitive['indices']).astype(np.int64).reshape(-1)+len(ps)).tolist());ps.extend(positions);ns.extend(normals);cs.extend(colors)
            for child in node.get('children',[]):visit(child,matrix)
        for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4))
        ps=np.array(ps);lo=ps.min(axis=0);hi=ps.max(axis=0);ps-=np.array([(hi[0]+lo[0])/2,lo[1],(hi[2]+lo[2])/2]);ps/=np.maximum(hi-lo,.0001)
        geometry[key]=(ps,np.array(ns)*(hi-lo),np.array(cs),np.array(indices));return geometry[key]
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8'));models=layouts()
    upgrades={
        'Kingdom':[part('castle-kit','tower-square-mid-windows',(1.4,2.2,1.4),(0,3,0)),part('castle-kit','tower-square-top-roof-high',(1.8,1.5,1.8),(0,5.1,0))],
        'Warclans':[part('nature-kit','statue_head',(1.3,2.5,1),(0,2.5,0))],
        'Wildwood':[part('nature-kit','statue_ring',(2.2,.5,2.2),(0,5.1,0)),part('nature-kit','statue_obelisk',(.6,1.5,.6),(0,5.4,0))],
        'Revenant':[part('graveyard-kit','cross-column',(1.1,3.4,.8),(0,3.1,0))],
    }
    for faction,extra in upgrades.items():
        models[faction+'Hall2']=models[faction+'Hall']+extra
        pack,model=('nature-kit','tree_thin') if faction=='Wildwood' else ('graveyard-kit','pillar-obelisk') if faction=='Revenant' else ('castle-kit','tower-hexagon-top-wood') if faction=='Warclans' else ('castle-kit','tower-square-top-roof-high')
        models[faction+'Hall3']=models[faction+'Hall2']+[part(pack,model,(.85,5.7,.85),(x,0,-1.2)) for x in [-1.5,1.5]]
    for name,parts in models.items():
        positions=[];normals=[];colors=[];indices=[]
        for item in parts:
            p,n,color,idx=load(item['pack'],item['model']);scale=np.array(item['size']);angle=math.radians(item['yaw']);c=math.cos(angle);s=math.sin(angle);rotation=np.array([[c,0,s],[0,1,0],[-s,0,c]])
            positions.extend((p*scale)@rotation.T+item['position']);normal=(n/scale)@rotation.T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);normals.extend(normal)
            # Cold dark stone distinguishes the crypt faction while preserving source color regions.
            if name.startswith('Revenant'):color=color*np.array([.6,.64,.85])
            colors.extend(np.round(np.clip(color,0,1)*255).astype(int));indices.extend((idx+len(positions)-len(p)).tolist())
        palette=[];uv=[]
        for color in colors:
            rgb=tuple(color)
            if rgb not in palette:palette.append(rgb)
            uv.append([(palette.index(rgb)+.5)/256,.5])
        if len(palette)>256:raise ValueError('Module needs a textured atlas: '+name)
        image=Image.new('RGB',(256,1),'white')
        for i,rgb in enumerate(palette):image.putpixel((i,0),rgb)
        texture='Assets/Textures/'+name+'.png';image.resize((1024,4),Image.Resampling.NEAREST).save(SAMPLE/texture)
        mesh='Assets/Models/'+name+'.glb';adapter.glb(SAMPLE/mesh,positions,normals,uv,indices)
        material='Assets/Materials/'+name+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':name,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':texture,'roughness':.87,'metallic':0}),encoding='utf-8')
        bounds=np.array(positions);catalog[name]={'material':material,'parts':[{'name':name,'mesh':mesh,'pivot':[0,0,0]}],'size':(bounds.max(axis=0)-bounds.min(axis=0)).round(6).tolist(),'factionBuilding':True}
    catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
    (SAMPLE/'faction-sources.json').write_text(json.dumps({'sources':sources,'models':models,'generated':[{'file':p.relative_to(SAMPLE).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for name in sorted(models) for p in [SAMPLE/'Assets/Models'/(name+'.glb'),SAMPLE/'Assets/Textures'/(name+'.png'),SAMPLE/'Assets/Materials'/(name+'.mmat')]]},indent=2)+'\n',encoding='utf-8')
    print('Built',len(models),'faction buildings from',len(geometry),'licensed source modules; original archives retained.')

if __name__=='__main__':main()
