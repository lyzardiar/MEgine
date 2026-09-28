"""Author: MiYu. Reproduce the CC0 Quaternius dragon from pinned FBX and converter bytes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
SOURCE = 'https://raw.githubusercontent.com/Another-Axiom/GT_CustomMapExample/main/Assets/Meshes/Animated_Monsters_by_Quaternius/Dragon/Dragon.fbx'
SOURCE_SHA = '5a45dcf6ac912b6357ab28ecb9d0b2104e7ee0fdae20d082a180cdc8c65adeba'
CONVERTER = 'https://registry.npmjs.org/fbx2gltf/-/fbx2gltf-0.9.7-p1.tgz'
CONVERTER_SHA = '9ff30dc5839155aead31ddadce99884773f8bf81678f3ac9a97ca24f8d58d64c'

def module(name, path):
    spec=importlib.util.spec_from_file_location(name, ROOT/path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

def fetch(url, path, expected):
    if not path.exists():
        temporary=path.with_suffix('.part');urllib.request.urlretrieve(url, temporary);temporary.replace(path)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ValueError('SHA-256 mismatch: '+str(path))

def main():
    cache=ROOT/'tmp/fbx2gltf';cache.mkdir(parents=True,exist_ok=True)
    archive=cache/'fbx2gltf-0.9.7-p1.tgz';fetch(CONVERTER,archive,CONVERTER_SHA)
    with tarfile.open(archive) as package:package.extractall(cache,filter='data')
    original=SAMPLE/'SourceAssets/Dragon.fbx';fetch(SOURCE,original,SOURCE_SHA)
    subprocess.run([str(cache/'package/bin/Windows_NT/FBX2glTF.exe'),'-i',str(original),'-o',str(cache/'Dragon'),'-e','--anim-framerate','bake24'],check=True)
    converted=SAMPLE/'SourceAssets/Dragon.gltf';shutil.copyfile(cache/'Dragon_out/Dragon.gltf',converted)
    doc=json.loads(converted.read_text());assert len(doc['skins'])==1 and len(doc['animations'])==5
    assert all(s.get('interpolation','LINEAR') in ['LINEAR','STEP'] for a in doc['animations'] for s in a['samplers'])
    assert all('JOINTS_1' not in p['attributes'] for m in doc['meshes'] for p in m['primitives'])
    adapter=module('ion_adapter','scripts/import-ion-assets.py');adapter.SAMPLE=SAMPLE
    importer=module('frost_adapter','scripts/import-frost-assets.py')
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text())
    palette={'Eyes':[.95,.72,.2,1],'Main':[.25,.55,.72,1],'Belly':[.68,.78,.78,1],'Claws':[.2,.25,.3,1],'Wings':[.16,.32,.48,1]}
    for material in doc['materials']:material['pbrMetallicRoughness']['baseColorFactor']=palette[material['name']]
    # These are flat-color materials; sampling the center avoids the source UVs' unused atlas gutters.
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:primitive['attributes'].pop('TEXCOORD_0',None)
    adapted=cache/'Dragon-winter.gltf';adapted.write_text(json.dumps(doc),encoding='utf-8')
    catalog['Dragon']=importer.adapt_character(adapted,'Dragon',adapter)
    catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
    manifest=[{'author':'Quaternius','page':'https://quaternius.com/packs/ultimatemonsters.html','license':'CC0-1.0','download':SOURCE,'file':'SourceAssets/Dragon.fbx','sha256':SOURCE_SHA,'conversion':{'tool':'FBX2glTF 0.9.7','download':CONVERTER,'sha256':CONVERTER_SHA,'arguments':['-e','--anim-framerate','bake24']}},{'file':'SourceAssets/Dragon.gltf','derivedFrom':'SourceAssets/Dragon.fbx','sha256':hashlib.sha256(converted.read_bytes()).hexdigest()}]
    manifest[0]['atlasSrgbPalette']=palette
    (SAMPLE/'dragon-sources.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (SAMPLE/'Licenses/Quaternius-Ultimate-Monsters.txt').write_text('Ultimate Monsters / Dragon\nAuthor: Quaternius\nCC0-1.0\nhttps://quaternius.com/packs/ultimatemonsters.html\nhttps://creativecommons.org/publicdomain/zero/1.0/\nSource mirror and hashes: dragon-sources.json\n',encoding='utf-8')
    print('Imported CC0 Dragon: one skin, five baked animation clips; original FBX and converted glTF retained.')

if __name__=='__main__':main()
