"""Author: MiYu. Import CC0 KayKit skeletons with weapons attached to the authored hand socket."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
REVISION='15b62b9bad122f72926c10fb14d622c73819fa54'
BASE='https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/'+REVISION+'/'
PREFIX='addons/kaykit_character_pack_skeletons/'
FILES={
    'LICENSE.txt':'5d822abca4e08c5a91d329e5372b3dc605cba8d994f752cb0f7dfdb7a0a79954',
    PREFIX+'Characters/gltf/Skeleton_Rogue.glb':'4003f2b77891bb56f7e0de7d555abcb497aebbcaee35b614211f16275f9ccae3',
    PREFIX+'Characters/gltf/Skeleton_Mage.glb':'e05b0f5cfa395271c9f75fd07c0a0613c56f401ece4ab644e080001a79971075',
    PREFIX+'Assets/gltf/Skeleton_Crossbow.gltf':'8b7b8adbc33d2b9921637735d3f319b86a98b8bab9dbbce022541cc732e415ce',
    PREFIX+'Assets/gltf/Skeleton_Crossbow.bin':'dfe637f4d112fcfa515a6f8c921034bb017c68896751cceb8119675c157fa1f8',
    PREFIX+'Assets/gltf/Skeleton_Staff.gltf':'6bb554fef0889dc9e1a69a71ddae793a772fc18eea059ded61be4f8157fd2f04',
    PREFIX+'Assets/gltf/Skeleton_Staff.bin':'2b91a59316cea919b2a8b3d94ab85e3b5faa9fdb607a9ab633a6bb6d1e6bbf2f',
    PREFIX+'Assets/gltf/skeleton_texture.png':'15741a25c53e04fa9bf3beac3bc0de442359404b1ff9be863b892cb551ad3657',
}

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

def main():
    source=SAMPLE/'SourceAssets/kaykit-skeletons';source.mkdir(parents=True,exist_ok=True)
    records=[]
    for relative,sha in FILES.items():
        target=source/Path(relative).name
        if not target.exists():
            temporary=target.with_suffix('.part');urllib.request.urlretrieve(BASE+relative,temporary)
            if hashlib.sha256(temporary.read_bytes()).hexdigest()!=sha:raise ValueError('Download SHA-256 mismatch: '+relative)
            temporary.replace(target)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise ValueError('Source SHA-256 mismatch: '+relative)
        records.append({'file':target.relative_to(SAMPLE).as_posix(),'download':BASE+relative,'sha256':sha})
    (SAMPLE/'Licenses/KayKit-Skeletons.txt').write_bytes((source/'LICENSE.txt').read_bytes())
    adapter=module('ion_adapter','scripts/import-ion-assets.py');importer=module('frost_adapter','scripts/import-frost-assets.py')
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8'));models={};generated=[]
    cache=ROOT/'tmp/frost-skeletons';cache.mkdir(parents=True,exist_ok=True)
    for name,weapon,attack in [('Skeleton_Rogue','Skeleton_Crossbow','2H_Ranged_Shooting'),('Skeleton_Mage','Skeleton_Staff','Spellcast_Shoot')]:
        doc,data=adapter.read_glb(source/(name+'.glb'));blob=bytearray(data)
        accessory=json.loads((source/(weapon+'.gltf')).read_text(encoding='utf-8'))
        assert len(accessory['buffers'])==1 and len(accessory['meshes'])==1 and len(accessory['nodes'])==1
        # Both authored accessories use the character's skeleton_texture atlas, with an origin at the grip.
        assert accessory['images'][0]['uri']=='skeleton_texture.png'
        image=doc['bufferViews'][doc['images'][0]['bufferView']];assert blob[image['byteOffset']:image['byteOffset']+image['byteLength']]==(source/'skeleton_texture.png').read_bytes()
        view_offset=len(doc['bufferViews']);accessor_offset=len(doc['accessors']);mesh_index=len(doc['meshes'])
        blob.extend(b'\0'*(-len(blob)%4));byte_offset=len(blob);blob.extend((source/(weapon+'.bin')).read_bytes())
        for view in accessory['bufferViews']:view['buffer']=0;view['byteOffset']=view.get('byteOffset',0)+byte_offset
        for accessor in accessory['accessors']:accessor['bufferView']+=view_offset
        for primitive in accessory['meshes'][0]['primitives']:
            primitive['attributes']={key:value+accessor_offset for key,value in primitive['attributes'].items()}
            if 'indices' in primitive:primitive['indices']+=accessor_offset
            primitive['material']=0
        doc['bufferViews'].extend(accessory['bufferViews']);doc['accessors'].extend(accessory['accessors']);doc['meshes'].extend(accessory['meshes'])
        rotation=[0,2**-.5,0,2**-.5] if name=='Skeleton_Rogue' else [0,0,2**-.5,2**-.5]
        socket=next(node for node in doc['nodes'] if node.get('name')=='handslot.r');socket.setdefault('children',[]).append(len(doc['nodes']));doc['nodes'].append({'name':weapon,'mesh':mesh_index,'rotation':rotation})
        clips=['Idle','Walking_A',attack,'Hit_A','Death_A','Spawn_Ground']
        available={a['name']:a for a in doc['animations']};doc['animations']=[available[clip] for clip in clips if clip in available]
        assert len(doc['animations'])>=3 and len(doc['skins'])==1
        assert all(s.get('interpolation','LINEAR') in ['LINEAR','STEP'] for a in doc['animations'] for s in a['samplers'])
        doc['buffers']=[{'byteLength':len(blob),'uri':'data:application/octet-stream;base64,'+base64.b64encode(blob).decode()}]
        combined=cache/(name+'.gltf');combined.write_text(json.dumps(doc),encoding='utf-8');catalog[name]=importer.adapt_character(combined,name,adapter)
        catalog[name]['size']=[2.3,2.65 if name=='Skeleton_Mage' else 2.3,2]
        models[name]={'weapon':weapon,'socket':'handslot.r','rotation':rotation,'clips':[a['name'] for a in doc['animations']]}
        for relative in ['Assets/Models/'+name+'.glb','Assets/Textures/'+name+'.png','Assets/Materials/'+name+'.mmat']:
            generated.append({'file':relative,'sha256':hashlib.sha256((SAMPLE/relative).read_bytes()).hexdigest()})
    catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
    report={'author':'Kay Lousberg','license':'CC0-1.0','page':'https://kaylousberg.itch.io/kaykit-skeletons','revision':REVISION,'sources':records,'models':models,'generated':generated}
    (SAMPLE/'skeleton-sources.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('Imported two animated KayKit skeletons with socket-mounted crossbow and staff.')

if __name__=='__main__':main()
