"""Download CC0 Kenney packs; bake complete node transforms into MEngine meshes.

Requires numpy and Pillow. Original GLBs/licenses and a SHA-256 manifest remain in the sample.
The runtime currently uses one material per MeshRenderer, so colors are baked to a palette.
"""
import hashlib
import io
import json
import pathlib
import shutil
import struct
import urllib.request
import zipfile
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/ion-outpost'
SOURCES = {
    'space-kit': ('https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip', ['astronautA', 'astronautB', 'alien', 'hangar_roundA', 'hangar_smallA', 'machine_generatorLarge', 'machine_wireless', 'barrels', 'barrel', 'satelliteDish', 'rock_largeA', 'rock_largeB', 'rock_crystalsLargeA', 'rock', 'craft_speederA', 'rover', 'gate_simple', 'terrain', 'turret_double', 'platform_small']),
    'blaster-kit': ('https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip', ['blaster-f', 'blaster-n', 'crate-medium', 'crate-wide']),
    'blocky-characters': ('https://kenney.nl/media/pages/assets/blocky-characters/8369c0cf30-1749547469/kenney_blocky-characters_20.zip', ['character-a', 'character-f']),
}

def read_glb(path):
    b = path.read_bytes(); length = struct.unpack_from('<I', b, 12)[0]
    doc = json.loads(b[20:20 + length]); start = 20 + length
    return doc, b[start + 8:]

def accessor(doc, data, index):
    a = doc['accessors'][index]; v = doc['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', np.dtype(dtype).itemsize * width)
    return np.ndarray((a['count'], width), dtype=dtype, buffer=data, offset=offset, strides=(stride, np.dtype(dtype).itemsize)).copy()

def matrix(node):
    if 'matrix' in node: return np.array(node['matrix']).reshape(4, 4).T
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    m = np.eye(4); m[:3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
    m[:3, :3] = m[:3, :3] @ np.diag(node.get('scale', [1, 1, 1])); m[:3, 3] = node.get('translation', [0, 0, 0])
    return m

def glb(path, pos, norm, uv, indices):
    arrays = [np.asarray(pos, '<f4'), np.asarray(norm, '<f4'), np.asarray(uv, '<f4'), np.asarray(indices, '<u4')]
    blob = bytearray(); views = []; accesses = []
    for i, a in enumerate(arrays):
        raw = a.tobytes(); views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(raw)})
        ac = {'bufferView': i, 'componentType': 5125 if i == 3 else 5126, 'count': len(a), 'type': ['VEC3', 'VEC3', 'VEC2', 'SCALAR'][i]}
        if i == 0: ac.update(min=a.min(axis=0).tolist(), max=a.max(axis=0).tolist())
        accesses.append(ac); blob.extend(raw)
    doc = {'asset': {'version': '2.0', 'generator': 'MEngine CC0 asset adapter'}, 'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accesses, 'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3}]}], 'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}], 'scene': 0}
    payload = json.dumps(doc, separators=(',', ':')).encode(); payload += b' ' * (-len(payload) % 4)
    path.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(payload) + len(blob)) + struct.pack('<II', len(payload), 0x4e4f534a) + payload + struct.pack('<II', len(blob), 0x004e4942) + blob)

def import_model(source, pack, name):
    doc, data = read_glb(source); groups = []; colors = []
    def visit(index, parent):
        node = doc['nodes'][index]; transform = parent @ matrix(node)
        if 'mesh' in node:
            positions = []; normals = []; uvs = []; indices = []
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                p = accessor(doc, data, primitive['attributes']['POSITION']); n = accessor(doc, data, primitive['attributes']['NORMAL'])
                pos = (transform @ np.c_[p, np.ones(len(p))].T).T[:, :3]
                normal = (np.linalg.inv(transform[:3, :3]).T @ n.T).T; normal /= np.maximum(np.linalg.norm(normal, axis=1)[:, None], 1e-9)
                mat = doc.get('materials', [{}])[primitive.get('material', 0)].get('pbrMetallicRoughness', {})
                if 'baseColorTexture' in mat: uv = accessor(doc, data, primitive['attributes']['TEXCOORD_0'])
                else:
                    color = mat.get('baseColorFactor', [1, 1, 1, 1])
                    if color not in colors: colors.append(color)
                    uv = np.tile([(colors.index(color) + .5) / 32, .5], (len(p), 1))
                indices.extend((accessor(doc, data, primitive['indices']).reshape(-1) + len(positions)).tolist())
                positions.extend(pos.tolist()); normals.extend(normal.tolist()); uvs.extend(uv.tolist())
            groups.append({'name': node.get('name', str(index)), 'pivot': transform[:3, 3], 'positions': np.array(positions), 'normals': normals, 'uvs': uvs, 'indices': indices})
        for child in node.get('children', []): visit(child, transform)
    for index in doc['scenes'][doc.get('scene', 0)]['nodes']: visit(index, np.eye(4))
    all_pos = np.concatenate([g['positions'] for g in groups]); lower = all_pos.min(axis=0); upper = all_pos.max(axis=0)
    center = np.array([(lower[0] + upper[0]) / 2, lower[1], (lower[2] + upper[2]) / 2])
    character = name in ['astronautA', 'astronautB', 'alien', 'character-a', 'character-f']
    scale = 1.85 / (upper[1] - lower[1]) if character else 1
    texture = f'{pack}.png' if colors else f'{name}.png'
    texture_path = SAMPLE / 'Assets/Textures' / texture
    if colors:
        # Same stable material names across this pack use per-model palettes.
        texture = f'{name}.png'; texture_path = SAMPLE / 'Assets/Textures' / texture
        image = Image.new('RGBA', (32, 1), (255, 255, 255, 255))
        for i, c in enumerate(colors): image.putpixel((i, 0), tuple(round(max(0, min(1, v)) * 255) for v in c[:3]) + (255,))
        image.resize((256, 8), Image.Resampling.NEAREST).save(texture_path)
    else:
        image = doc['images'][0]
        if 'uri' in image: shutil.copyfile(source.parent / image['uri'], texture_path)
        else:
            view = doc['bufferViews'][image['bufferView']]; start = view.get('byteOffset', 0)
            Image.open(io.BytesIO(data[start:start + view['byteLength']])).save(texture_path)
    material = f'Assets/Materials/{name}.mmat'
    (SAMPLE / material).write_text(json.dumps({'version': 8, 'name': name, 'shader': 'pbr', 'base_color': [1, 1, 1, 1], 'base_color_texture': 'Assets/Textures/' + texture, 'roughness': .68, 'metallic': .18 if pack == 'space-kit' else .1}), encoding='utf-8')
    if not character:
        combined = {'name': name, 'pivot': center, 'positions': [], 'normals': [], 'uvs': [], 'indices': []}
        for g in groups:
            combined['indices'].extend((np.array(g['indices']) + len(combined['positions'])).tolist())
            for key in ['positions', 'normals', 'uvs']: combined[key].extend(g[key])
        combined['positions'] = np.array(combined['positions']); groups = [combined]
    parts = []
    for g in groups:
        pivot = g['pivot'] if character else center
        mesh = f'Assets/Models/{name}-{g["name"]}.glb'
        glb(SAMPLE / mesh, (g['positions'] - pivot) * scale, g['normals'], g['uvs'], g['indices'])
        parts.append({'name': g['name'], 'mesh': mesh, 'pivot': ((pivot - center) * scale).round(6).tolist()})
    return {'material': material, 'size': ((upper-lower)*scale).round(6).tolist(), 'parts': parts}

def main():
    for folder in ['Assets/Models', 'Assets/Textures', 'Assets/Materials', 'SourceAssets', 'Licenses']: (SAMPLE / folder).mkdir(parents=True, exist_ok=True)
    manifest = []; catalog = {}
    for pack, (url, names) in SOURCES.items():
        cache = ROOT / 'tmp/fps-assets' / pack; archive = cache.with_suffix('.zip')
        if not archive.exists():
            archive.parent.mkdir(parents=True, exist_ok=True); urllib.request.urlretrieve(url, archive)
        if not cache.exists():
            with zipfile.ZipFile(archive) as z: z.extractall(cache)
        shutil.copyfile(cache / 'License.txt', SAMPLE / 'Licenses' / (pack + '.txt'))
        entry = {'author': 'Kenney', 'page': 'https://kenney.nl/assets/' + pack, 'download': url, 'license': 'CC0-1.0', 'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/', 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'files': []}
        for name in names:
            source = next(cache.rglob(name + '.glb')); target = SAMPLE / 'SourceAssets' / pack; target.mkdir(exist_ok=True)
            shutil.copyfile(source, target / source.name)
            doc, _ = read_glb(source)
            for image in doc.get('images', []):
                if 'uri' in image:
                    dest = target / image['uri']; dest.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(source.parent / image['uri'], dest)
            entry['files'].append({'path': f'SourceAssets/{pack}/{source.name}', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
            catalog[name] = import_model(source, pack, name)
        manifest.append(entry)
    (SAMPLE / 'asset-sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (SAMPLE / 'model-catalog.json').write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    print('Imported', len(catalog), 'complete models with original source/license records')

if __name__ == '__main__': main()
