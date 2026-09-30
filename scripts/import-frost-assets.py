"""Author: MiYu. Download licensed art, preserving source models, licenses and hashes."""
import importlib.util
import json
import pathlib
import urllib.request
import zipfile
import hashlib
import shutil
import base64
import struct
import io
import numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
PACKS = {
    'fantasy-town-kit': 'https://kenney.nl/media/pages/assets/fantasy-town-kit/efe948d309-1754222374/kenney_fantasy-town-kit_2.0.zip',
    'particle-pack': 'https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip',
}
QUATERNIUS = {
    'Cleric': '1LlmtVPWTRVbB5rXemboYstI5lor7I8vO', 'Monk': '1GUeuxXhHiraTNo1voRxxhV3cgzZ7dPiq',
    'Ranger': '1e3eAO6oHYVyDNdhoNogNii5CtLQB7pLc', 'Rogue': '1mnmoERmMi_342qyS_WPioVU0pmIQvIYa',
    'Warrior': '1oALqyqy7yVQnLh-Vs19kKg3eZgJqIgoc', 'Wizard': '1OfEos4LtQLrMfJLpw2OdBNhbu36RtZUd',
    'Barracks': '1qMCMZi-luDJhdMJCQjZfTjsB5iF4hFva', 'Citadel': '1Yh-YB_Ft0uy_3DcJqKXR1UNlcH1Y5UPb',
    'Farm': '1gBb75Su5P45fYssJBjtOcezyu7OkijV5', 'House': '1ITHANc2S6cJxNRx0O0wDfEmYC4nXBBVg',
    'Archery': '1-XDduQ7MN-uGlcenuHkTOyeN5u4-Ch31',
}

def verify_source(path, relative):
    manifest=SAMPLE/'asset-sources.json'
    if manifest.exists():
        expected=next((a['sha256'] for a in json.loads(manifest.read_text(encoding='utf-8')) if a.get('file')==relative),None)
        if expected and hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
            raise ValueError('Source SHA-256 differs from the recorded license manifest: '+relative)

def download():
    cache = ROOT / 'tmp/frost-assets'
    cache.mkdir(parents=True, exist_ok=True)
    for name, url in PACKS.items():
        archive = cache / (name + '.zip')
        if not archive.exists() and (SAMPLE/'SourceAssets'/(name+'.zip')).exists():
            shutil.copyfile(SAMPLE/'SourceAssets'/(name+'.zip'),archive)
        if not archive.exists():
            print('Downloading', name, flush=True)
            urllib.request.urlretrieve(url, archive)
        verify_source(archive,'SourceAssets/'+name+'.zip')
        folder = cache / name
        if not folder.exists():
            with zipfile.ZipFile(archive) as z:
                for item in z.infolist():
                    if not (folder / item.filename).resolve().is_relative_to(folder.resolve()):
                        raise ValueError('Unsafe archive member')
                z.extractall(folder)
        print(name, 'cached', flush=True)
    return cache

def characters(cache):
    folder=cache/'quaternius'
    folder.mkdir(exist_ok=True)
    def fetch(item):
        name, file_id=item
        target=folder/(name+'.gltf')
        if not target.exists() and (SAMPLE/'SourceAssets'/(name+'.gltf')).exists():
            shutil.copyfile(SAMPLE/'SourceAssets'/(name+'.gltf'),target)
        try: json.loads(target.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            temporary=target.with_suffix('.part')
            urllib.request.urlretrieve('https://drive.usercontent.google.com/download?id='+file_id+'&export=download&confirm=t',temporary)
            json.loads(temporary.read_text())
            temporary.replace(target)
        verify_source(target,'SourceAssets/'+name+'.gltf')
        doc=json.loads(target.read_text())
        print(name, len(doc.get('animations',[])), 'animations', flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(fetch,QUATERNIUS.items()))

def adapt_character(original, name, adapter):
    doc=json.loads(original.read_text(encoding='utf-8'))
    blob=bytearray();offsets=[]
    for b in doc['buffers']:
        offsets.append(len(blob));blob.extend(base64.b64decode(b['uri'].split(',',1)[1]));blob.extend(b'\0'*(-len(blob)%4))
    for view in doc['bufferViews']:view['byteOffset']=view.get('byteOffset',0)+offsets[view['buffer']];view['buffer']=0
    materials=doc.get('materials',[{}]);width=256;atlas=Image.new('RGBA',(width*len(materials),width),(255,255,255,255))
    for i,m in enumerate(materials):
        pbr=m.get('pbrMetallicRoughness',{});color=pbr.get('baseColorFactor',[1,1,1,1])
        if 'baseColorTexture' in pbr:
            im=doc['images'][doc['textures'][pbr['baseColorTexture']['index']]['source']]
            view=doc['bufferViews'][im['bufferView']];tile=Image.open(io.BytesIO(blob[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGBA').resize((252,252))
        else:tile=Image.new('RGBA',(252,252),tuple(round(v*255) for v in color))
        atlas.paste(tile,(i*width+2,2));atlas.paste(tile.resize((256,2)),(i*width,0));atlas.paste(tile.resize((256,2)),(i*width,254))
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            mi=primitive.get('material',0)
            if 'TEXCOORD_0' in primitive['attributes']: uv=adapter.accessor(doc,blob,primitive['attributes']['TEXCOORD_0']).astype('<f4')
            else:uv=np.full((doc['accessors'][primitive['attributes']['POSITION']]['count'],2),.5,dtype='<f4')
            uv=np.clip(uv,0,1);uv[:,0]=(mi*256+2+uv[:,0]*252)/(256*len(materials));uv[:,1]=(2+uv[:,1]*252)/256
            view_index=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':uv.nbytes});blob.extend(uv.tobytes())
            accessor_index=len(doc['accessors']);doc['accessors'].append({'bufferView':view_index,'componentType':5126,'count':len(uv),'type':'VEC2'});primitive['attributes']['TEXCOORD_0']=accessor_index;primitive.pop('material',None)
    # The renderer supplies the atlas material; remove external texture/image dependencies.
    for key in ['materials','images','textures','samplers']:doc.pop(key,None)
    doc['buffers']=[{'byteLength':len(blob)}]
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);blob.extend(b'\0'*(-len(blob)%4))
    model='Assets/Models/'+name+'.glb';(SAMPLE/model).write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(blob))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(blob),0x004e4942)+blob)
    atlas.save(SAMPLE/'Assets/Textures'/(name+'.png'))
    material='Assets/Materials/'+name+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':name,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':'Assets/Textures/'+name+'.png','roughness':.9}),encoding='utf-8')
    animations=[]
    for a in doc.get('animations',[]):
        duration=max(float(adapter.accessor(doc,blob,s['input']).max()) for s in a['samplers']);animations.append({'name':a['name'],'frames':max(1,round(duration*12))})
    return {'material':material,'parts':[{'name':name,'mesh':model,'pivot':[0,0,0]}],'animations':animations,'size':[1,3,1]}

def adapt(cache):
    spec=importlib.util.spec_from_file_location('ion_adapter',ROOT/'scripts/import-ion-assets.py')
    adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter);adapter.SAMPLE=SAMPLE
    for name in ['Assets/Models','Assets/Textures','Assets/Materials','SourceAssets','Licenses']: (SAMPLE/name).mkdir(parents=True,exist_ok=True)
    catalog={};manifest=[]
    for pack in PACKS:
        license_file=next((cache/pack).rglob('License.txt'))
        shutil.copyfile(license_file,SAMPLE/'Licenses'/(pack+'.txt'))
        archive='SourceAssets/'+pack+'.zip'
        shutil.copyfile(cache/(pack+'.zip'),SAMPLE/archive)
        manifest.append({'author':'Kenney','page':'https://kenney.nl/assets/'+pack,'license':'CC0-1.0','download':PACKS[pack],'file':archive,'sha256':hashlib.sha256((SAMPLE/archive).read_bytes()).hexdigest()})
    for name in ['tree','tree-high','rock-large','rock-wide','windmill','wall-block','roof-point']:
        original=next((cache/'fantasy-town-kit').rglob(name+'.glb'))
        dest=SAMPLE/'SourceAssets/fantasy-town-kit';dest.mkdir(exist_ok=True)
        shutil.copyfile(original,dest/original.name)
        doc,_=adapter.read_glb(original)
        for im in doc.get('images',[]):
            if 'uri' in im:
                target=dest/im['uri'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(original.parent/im['uri'],target)
        catalog[name]=adapter.import_model(original,'fantasy-town-kit',name)
    for name in ['magic_01','spark_01','smoke_01','star_04']:
        source=next(p for p in (cache/'particle-pack').rglob(name+'.png') if 'Transparent' in str(p))
        shutil.copyfile(source,SAMPLE/'Assets/Textures'/(name+'.png'))
    for name,file_id in QUATERNIUS.items():
        original=cache/'quaternius'/(name+'.gltf');doc=json.loads(original.read_text())
        shutil.copyfile(original,SAMPLE/'SourceAssets'/(name+'.gltf'))
        catalog[name]=adapt_character(original,name,adapter)
        manifest.append({'author':'Quaternius','page':'https://quaternius.com/packs/'+('rpgcharacters' if catalog[name]['animations'] else 'ultimatefantasyrts')+'.html','license':'CC0-1.0','download':'https://drive.usercontent.google.com/download?id='+file_id+'&export=download&confirm=t','file':'SourceAssets/'+name+'.gltf','sha256':hashlib.sha256(original.read_bytes()).hexdigest()})
    (SAMPLE/'Licenses/Quaternius.txt').write_text('Quaternius RPG Character Pack and Ultimate Fantasy RTS\nAuthor: Quaternius\nLicense: Creative Commons Zero 1.0 Universal\nhttps://creativecommons.org/publicdomain/zero/1.0/\nhttps://quaternius.com/packs/rpgcharacters.html\nhttps://quaternius.com/packs/ultimatefantasyrts.html\nOfficial pages explicitly label these packs CC0.\n',encoding='utf-8')
    (SAMPLE/'model-catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
    (SAMPLE/'asset-sources.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print('Adapted',len(catalog),'models; original skeletons and clips preserved',flush=True)

if __name__ == '__main__':
    cache=download();characters(cache);adapt(cache)
    environment_spec=importlib.util.spec_from_file_location('frost_environment',ROOT/'scripts/import-frost-environment.py')
    environment=importlib.util.module_from_spec(environment_spec);environment_spec.loader.exec_module(environment);environment.main()
    dragon_spec=importlib.util.spec_from_file_location('frost_dragon',ROOT/'scripts/import-frost-dragon.py')
    dragon=importlib.util.module_from_spec(dragon_spec);dragon_spec.loader.exec_module(dragon);dragon.main()

    faction_spec=importlib.util.spec_from_file_location('frost_factions',ROOT/'scripts/import-frost-factions.py')
    faction=importlib.util.module_from_spec(faction_spec);faction_spec.loader.exec_module(faction);faction.main()
    monster_spec=importlib.util.spec_from_file_location('frost_monsters',ROOT/'scripts/import-frost-monsters.py')
    monster=importlib.util.module_from_spec(monster_spec);monster_spec.loader.exec_module(monster);monster.main()

    skeleton_spec=importlib.util.spec_from_file_location('frost_skeletons',ROOT/'scripts/import-frost-skeletons.py')
    skeleton=importlib.util.module_from_spec(skeleton_spec);skeleton_spec.loader.exec_module(skeleton);skeleton.main()
    realistic_spec=importlib.util.spec_from_file_location('frost_realistic',ROOT/'scripts/import-frost-realistic.py')
    realistic=importlib.util.module_from_spec(realistic_spec);realistic_spec.loader.exec_module(realistic);realistic.main()
    import os, subprocess
    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/import-frost-houses.py')],check=True,cwd=ROOT)
    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/import-frost-warclans.py')],check=True,cwd=ROOT)
    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/import-frost-humans.py')],check=True,cwd=ROOT)
    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/import-frost-humans.py'),'--','--manifest','siege-sources.json'],check=True,cwd=ROOT)
    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/import-frost-humans.py'),'--','--manifest','cavalry-sources.json'],check=True,cwd=ROOT)
    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/import-frost-humans.py'),'--','--manifest','paladin-sources.json'],check=True,cwd=ROOT)

    subprocess.run([os.environ.get('BLENDER','blender'),'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'scripts/bake-frost-foliage.py')],check=True,cwd=ROOT)
