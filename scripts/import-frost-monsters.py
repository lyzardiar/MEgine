"""Author: MiYu. Import pinned, animated CC0 Quaternius faction units with original rigs."""
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
MODELS={
    'Orc':('17675H4Owu5FeHUk_7Goyc9TKI5YK3cEM','e61a37f8d9b2eee28928bdfad2c55e0798cc0a212e925cc5dcc66b243526c1a3'),
    'Orc_Skull':('13wbbztVj_2eYyF5lavumLvK9JyCfQEhI','e27e3acf826e9f5cad021c647bd3ce6f1c82d2aaa3530c03ee442df4828a710e'),
    'Tribal':('1hWEwACHKMfDzYbqG2Cum3KP6semUY_Ap','ffe686b0f0e7a2fb968ea9829358f059df903d2a60c9a94bd3516b1c3d42b7c4'),
    'Demon':('1XhBLnR6tjqIrFy0AUfRlqKf-hYmVwIR4','9ce361b41a0e80d42a70f6325169b9c70a6e3304b8d856b8344a2b7f185067af'),
    'Ghost_Skull':('1JIw8lx6H5IIhf_3Z5FprEu_yCoMcoRN7','5bf24cf0f22aa94b0b58315e7d879afc53a0964a5b326aa0c844ba3278cae1da'),
}

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

def main():
    adapter=module('ion_adapter','scripts/import-ion-assets.py');adapter.SAMPLE=SAMPLE
    importer=module('frost_adapter','scripts/import-frost-assets.py');catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8'));sources=[]
    for name,(file_id,sha) in MODELS.items():
        relative='SourceAssets/monsters/'+name+'.gltf';source=SAMPLE/relative;source.parent.mkdir(parents=True,exist_ok=True);url='https://drive.usercontent.google.com/download?id='+file_id+'&export=download&confirm=t'
        if not source.exists():
            temporary=source.with_suffix('.part');urllib.request.urlretrieve(url,temporary);json.loads(temporary.read_text(encoding='utf-8'));temporary.replace(source)
        if hashlib.sha256(source.read_bytes()).hexdigest()!=sha:raise ValueError('Source SHA-256 mismatch: '+name)
        doc=json.loads(source.read_text(encoding='utf-8'))
        if len(doc.get('skins',[]))!=1 or not doc.get('animations'):raise ValueError('Missing animated rig: '+name)
        if any(s.get('interpolation','LINEAR') not in ['LINEAR','STEP'] for a in doc['animations'] for s in a['samplers']):raise ValueError('Unsupported interpolation: '+name)
        catalog[name]=importer.adapt_character(source,name,adapter)
        sources.append({'author':'Quaternius','license':'CC0-1.0','page':'https://quaternius.com/packs/ultimatemonsters.html','download':url,'file':relative,'sha256':sha,'animations':catalog[name]['animations'],'generated':[{'file':p.relative_to(SAMPLE).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [SAMPLE/'Assets/Models'/(name+'.glb'),SAMPLE/'Assets/Textures'/(name+'.png'),SAMPLE/'Assets/Materials'/(name+'.mmat')]]})
    catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8');(SAMPLE/'monster-sources.json').write_text(json.dumps(sources,indent=2)+'\n',encoding='utf-8')
    (SAMPLE/'Licenses/Quaternius-Faction-Monsters.txt').write_text('Quaternius Ultimate Monsters: Orc, Orc_Skull, Tribal, Demon, Ghost_Skull.\nCC0-1.0\nhttps://quaternius.com/packs/ultimatemonsters.html\nhttps://creativecommons.org/publicdomain/zero/1.0/\nOriginal embedded glTF files, source URLs and SHA-256 values: monster-sources.json\n',encoding='utf-8')
    print('Imported five animated faction monsters; source rigs, clips and embedded atlas retained.')

if __name__=='__main__':main()
