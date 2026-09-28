"""Author: MiYu. Pinned CC0 environment packs, source retention and native adaptation."""
import hashlib
import importlib.util
import json
import shutil
import struct
import urllib.request
import zipfile
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
PACKS = {
    'castle-kit': ('https://kenney.nl/media/pages/assets/castle-kit/a395102d20-1711543616/kenney_castle-kit.zip', '921f3f73927bb23106cae34bc21d5ab4b033a9fc120475e96f714a406e3169df', ['tower-square', 'tower-square-mid-windows', 'tower-square-top', 'tower-square-top-roof-high', 'tower-hexagon-top', 'wall', 'wall-corner', 'flag', 'bridge-straight', 'siege-ballista', 'siege-catapult', 'siege-trebuchet', 'siege-ram']),
    'nature-kit': ('https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip', 'fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d', ['tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'rock_largeA', 'rock_largeB', 'rock_smallA', 'cliff_rock']),
}

def fetch(url, target, expected=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix('.part')
        urllib.request.urlretrieve(url, temporary)
        temporary.replace(target)
    actual = hashlib.sha256(target.read_bytes()).hexdigest()
    if expected and actual != expected:
        raise ValueError('Source SHA-256 mismatch: ' + str(target))
    return actual

def main():
    spec = importlib.util.spec_from_file_location('ion_adapter', ROOT / 'scripts/import-ion-assets.py')
    adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter); adapter.SAMPLE = SAMPLE
    catalog_path = SAMPLE / 'model-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    source_path = SAMPLE / 'environment-sources.json'
    pinned = {a['file']: a['sha256'] for a in json.loads(source_path.read_text())} if source_path.exists() else {}
    sources = []
    for pack, (url, sha, names) in PACKS.items():
        relative = 'SourceAssets/' + pack + '.zip'
        archive = SAMPLE / relative
        fetch(url, archive, sha)
        folder = ROOT / 'tmp/frost-environment' / pack
        folder.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as z:
            for entry in z.infolist():
                if not (folder / entry.filename).resolve().is_relative_to(folder.resolve()):
                    raise ValueError('Archive path escapes source directory')
            z.extractall(folder)
        shutil.copyfile(next(folder.rglob('License.txt')), SAMPLE / 'Licenses' / (pack + '.txt'))
        for name in names:
            original = next(folder.rglob(name + '.glb'))
            adapted = original
            if pack == 'nature-kit':
                doc, data = adapter.read_glb(original)
                # Keep the source archive unchanged; map the source's flat material palette to winter vegetation.
                palette = {'wood': [.18,.105,.055,1], 'leaf': [.065,.19,.13,1], 'dirt': [.24,.28,.32,1], 'grass': [.66,.73,.75,1], 'rock': [.28,.32,.36,1]}
                for material in doc.get('materials', []):
                    for key, color in palette.items():
                        if key in material.get('name', '').lower():
                            material.setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = color
                encoded = json.dumps(doc, separators=(',', ':')).encode(); encoded += b' ' * (-len(encoded) % 4)
                data += b'\0' * (-len(data) % 4)
                adapted = original.with_name(name + '-winter.glb')
                adapted.write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data)
            catalog[name] = adapter.import_model(adapted, pack, name)
            if pack == 'nature-kit':
                material_path = SAMPLE / catalog[name]['material']
                material = json.loads(material_path.read_text())
                material.update(shader='custom', custom_shader='Assets/Shaders/Snowcap.mshader', metallic=0, roughness=.92)
                material_path.write_text(json.dumps(material), encoding='utf-8')
        sources.append({'author': 'Kenney', 'license': 'CC0-1.0', 'page': 'https://kenney.nl/assets/' + pack, 'download': url, 'file': relative, 'sha256': sha, 'models': names})
    for name, crown in [('GuardTower','tower-square-top'),('FrostTower','tower-square-top-roof-high'),('EmberTower','tower-hexagon-top')]:
        positions=[];normals=[];uvs=[];indices=[];height=0
        for part in ['tower-square-mid-windows', crown]:
            entry=catalog[part];doc,data=adapter.read_glb(SAMPLE/entry['parts'][0]['mesh']);primitive=doc['meshes'][0]['primitives'][0]
            p=adapter.accessor(doc,data,primitive['attributes']['POSITION']);p[:,1]+=height
            indices.extend((adapter.accessor(doc,data,primitive['indices']).reshape(-1)+len(positions)).tolist())
            positions.extend(p);normals.extend(adapter.accessor(doc,data,primitive['attributes']['NORMAL']));uvs.extend(adapter.accessor(doc,data,primitive['attributes']['TEXCOORD_0']));height+=entry['size'][1]
        mesh='Assets/Models/'+name+'.glb';adapter.glb(SAMPLE/mesh,np.array(positions),normals,uvs,indices)
        catalog[name]={'material':catalog[crown]['material'],'parts':[{'name':name,'mesh':mesh,'pivot':[0,0,0]}],'size':[1,height,1]}
    for asset in ['snow_02', 'rocky_terrain']:
        name = asset + '_diff_1k.jpg'
        relative = 'SourceAssets/' + name
        url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/' + asset + '/' + name
        sha = fetch(url, SAMPLE / relative, pinned.get(relative))
        shutil.copyfile(SAMPLE / relative, SAMPLE / 'Assets/Textures' / name)
        sources.append({'author': 'Poly Haven', 'license': 'CC0-1.0', 'page': 'https://polyhaven.com/a/' + asset, 'licenseUrl': 'https://polyhaven.com/license', 'download': url, 'file': relative, 'sha256': sha})
    (SAMPLE / 'Licenses/PolyHaven.txt').write_text('Poly Haven snow_02 and rocky_terrain. CC0-1.0.\nhttps://polyhaven.com/license\nhttps://creativecommons.org/publicdomain/zero/1.0/\n', encoding='utf-8')
    catalog_path.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    source_path.write_text(json.dumps(sources, indent=2) + '\n', encoding='utf-8')
    print('Imported 20 CC0 environment models, assembled 3 towers and copied 2 ground textures; retained pinned source archives.')

if __name__ == '__main__':
    main()
