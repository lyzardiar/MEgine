"""Author: MiYu. Reproduce engine-ready classic Warcraft assets from the inspected export."""
import argparse
import base64
import hashlib
import json
import math
import pathlib
import shutil
import struct
import subprocess
import urllib.request
import uuid
import zipfile

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMMIT = '4fe46a0772520fc7b55078bf32cda1237d1b5f2e'
UPSTREAM = 'https://github.com/Darithos/W3ModelViewer'
PREFIX = pathlib.Path('Assets/WarcraftIII')
AXES = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)
REPLACEMENTS = {1: r'ReplaceableTextures\TeamColor\TeamColor00.blp', 2: r'ReplaceableTextures\TeamGlow\TeamGlow00.blp', 31: r'ReplaceableTextures\LordaeronTree\LordaeronSummerTree.blp'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(path):
    value = pathlib.PureWindowsPath(path)
    if value.is_absolute() or any(x in ('.', '..') for x in value.parts) or ':' in path:
        raise ValueError(f'Unsafe source path: {path}')
    return pathlib.Path(*value.parts)


def json_write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=None if compact else 2, allow_nan=False) + '\n', encoding='utf-8')


def sidecar(path, output):
    kind = {'.glb': 'model', '.png': 'texture', '.mmat': 'material', '.mscene': 'scene', '.prefab': 'prefab'}.get(path.suffix)
    if kind:
        identifier = uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/warcraft-iii/classic/' + path.relative_to(output).as_posix())
        json_write(path.with_name(path.name + '.meta'), dict(schemaVersion=1, guid=str(identifier), importer=kind))


def sampler():
    cache = ROOT / 'tmp/warcraft-converter' / COMMIT
    cache.mkdir(parents=True, exist_ok=True)
    core = cache / 'upstream/src/Wc3ModelViewer.Core'
    archive = cache / 'upstream.zip'
    if not archive.exists():
        urllib.request.urlretrieve(f'https://codeload.github.com/Darithos/W3ModelViewer/zip/{COMMIT}', archive)
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            parts = pathlib.PurePosixPath(member.filename).parts[1:]
            if not parts or '..' in parts or member.is_dir():
                continue
            if parts[0] == 'LICENSE' or parts[:2] == ('src', 'Wc3ModelViewer.Core'):
                target = cache / 'upstream' / pathlib.Path(*parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(package.read(member))
    sources = {'upstream.zip': sha(archive.read_bytes())}
    binary = cache / 'bin'
    subprocess.run(['dotnet', 'build', str(ROOT / 'scripts/warcraft-assets/MdxExport.csproj'), '-p:Wc3Core=' + str(core), '-o', str(binary), '--nologo', '--verbosity', 'quiet'], check=True)
    return binary / 'MdxExport.dll', cache / 'upstream/LICENSE', sources


class Glb:
    def __init__(self):
        self.doc = dict(asset=dict(version='2.0', generator='MiYu MEngine classic Warcraft converter'), buffers=[], bufferViews=[], accessors=[])
        self.blob = bytearray()

    def accessor(self, values, dtype, kind, bounds=False):
        data = np.asarray(values, dtype=dtype)
        if not len(data) or not np.isfinite(data).all():
            raise ValueError('Empty/non-finite glTF accessor')
        self.blob.extend(b'\0' * (-len(self.blob) % 4))
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append(dict(buffer=0, byteOffset=len(self.blob), byteLength=data.nbytes))
        self.blob.extend(data.tobytes())
        a = dict(bufferView=view, componentType={'<f4': 5126, '<u2': 5123, '<u4': 5125}[dtype], count=len(data), type=kind)
        if bounds:
            a.update(min=data.min(axis=0).reshape(-1).tolist(), max=data.max(axis=0).reshape(-1).tolist())
        self.doc['accessors'].append(a)
        return len(self.doc['accessors']) - 1

    def mesh(self, positions, normals, uvs, indices):
        p = dict(attributes=dict(POSITION=self.accessor(positions, '<f4', 'VEC3', True), NORMAL=self.accessor(normals, '<f4', 'VEC3'), TEXCOORD_0=self.accessor(uvs, '<f4', 'VEC2')), indices=self.accessor(indices, '<u4', 'SCALAR'), mode=4)
        self.doc.update(meshes=[dict(primitives=[p])], nodes=[dict(mesh=0)], scenes=[dict(nodes=[0])], scene=0)
        return p

    def save(self, path):
        self.doc['buffers'] = [dict(byteLength=len(self.blob))]
        encoded = json.dumps(self.doc, separators=(',', ':'), allow_nan=False).encode()
        encoded += b' ' * (-len(encoded) % 4)
        self.blob.extend(b'\0' * (-len(self.blob) % 4))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(self.blob)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(self.blob), 0x004E4942) + self.blob)


def vectors(items):
    return np.array([[x['x'], x['y'], x['z']] for x in items], dtype=float)


def matrix(trs):
    x, y, z, w = trs['rotation']
    norm = math.sqrt(x*x + y*y + z*z + w*w)
    x, y, z, w = x/norm, y/norm, z/norm, w/norm
    rot = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    result = np.eye(4)
    result[:3, :3] = rot @ np.diag(trs['scale'])
    result[:3, 3] = trs['translation']
    return result


def weights(geoset, nodes):
    if geoset['hasSkin']:
        raise ValueError('This collection accepts classic MDX matrix groups only')
    ids = {node['objectId']: i for i, node in enumerate(nodes)}
    groups = []
    offset = 0
    for size in geoset['matrixGroupSizes']:
        group = [ids[x] for x in geoset['matrixIndices'][offset:offset+size]]
        if not group or len(group) > 4:
            raise ValueError(f'Unsupported joint influence count: {len(group)}')
        groups.append(group)
        offset += size
    joints = np.zeros((geoset['vertexCount'], 4), dtype='<u2')
    values = np.zeros((geoset['vertexCount'], 4), dtype='<f4')
    groups_per_vertex = base64.b64decode(geoset['vertexGroups'])
    assert len(groups_per_vertex) == geoset['vertexCount']
    for i, group_index in enumerate(groups_per_vertex):
        group = groups[group_index]
        joints[i, :len(group)] = group
        values[i, :len(group)] = 1 / len(group)
    assert np.allclose(values.sum(axis=1), 1)
    return joints, values


def check_poses(sample):
    model = sample['model']
    parents = sample['parents']
    result = dict(samples=0, vertices=0, maxPositionError=0.0)
    for clip in sample['clips']:
        for frame in clip['frames']:
            if frame['reference'] is None:
                continue
            local = [matrix(t) for t in frame['joints']]
            def world(i, stack=()):
                if i in stack:
                    raise ValueError('Cyclic MDX joint hierarchy')
                return local[i] if parents[i] < 0 else world(parents[i], stack+(i,)) @ local[i]
            joints = []
            for i, node in enumerate(model['nodes']):
                pivot = AXES @ vectors([node['pivot']])[0] / 128
                inverse_bind = np.eye(4)
                inverse_bind[:3, 3] = -pivot
                joints.append(world(i) @ inverse_bind)
            for g, reference in zip(model['geosets'], frame['reference']):
                ids, ws = weights(g, model['nodes'])
                blended = np.sum(np.asarray(joints)[ids] * ws[:, :, None, None], axis=1)
                p = vectors(g['positions']) @ AXES.T / 128
                p = np.column_stack([p, np.ones(len(p))])
                posed = np.einsum('nij,nj->ni', blended, p)[:, :3]
                error = float(np.max(np.abs(posed - reference['positions'])))
                result['maxPositionError'] = max(result['maxPositionError'], error)
                result['vertices'] += len(p)
            result['samples'] += 1
    if result['maxPositionError'] > 0.002:
        raise ValueError(f'Converted skin disagrees with MDX animator: {result}')
    return result


def animated_mesh(sample, g, uv, positions, normals):
    model, parents = sample['model'], sample['parents']
    ids, values = weights(g, model['nodes'])
    used = set(int(i) for i, w in zip(ids.flat, values.flat) if w > 0)
    for i in list(used):
        parent = parents[i]
        while parent >= 0:
            used.add(parent)
            parent = parents[parent]
    used = sorted(used)
    remap = {old: new for new, old in enumerate(used)}
    node_ids = np.array([[remap[int(i)] if w > 0 else 0 for i, w in zip(js, ws)] for js, ws in zip(ids, values)], dtype='<u2')
    glb = Glb()
    primitive = glb.mesh(positions, normals, uv, g['indices'])
    primitive['attributes'].update(JOINTS_0=glb.accessor(node_ids, '<u2', 'VEC4'), WEIGHTS_0=glb.accessor(values, '<f4', 'VEC4'))
    nodes, inverse = [], []
    for old in used:
        node = model['nodes'][old]
        pivot = AXES @ vectors([node['pivot']])[0] / 128
        parent_pivot = AXES @ vectors([model['nodes'][parents[old]]['pivot']])[0] / 128 if parents[old] >= 0 else np.zeros(3)
        item = dict(name=node['name'], translation=(pivot-parent_pivot).tolist())
        children = [remap[j] for j in used if parents[j] == old]
        if children:
            item['children'] = children
        nodes.append(item)
        ibm = np.eye(4)
        ibm[:3, 3] = -pivot
        inverse.append(ibm.T.reshape(-1))
    mesh_node = len(nodes)
    nodes.append(dict(mesh=0, skin=0))
    glb.doc.update(nodes=nodes, skins=[dict(joints=list(range(mesh_node)), inverseBindMatrices=glb.accessor(inverse, '<f4', 'MAT4'))], scenes=[dict(nodes=[mesh_node]+[remap[j] for j in used if parents[j] < 0])], animations=[])
    for clip in sample['clips']:
        times = glb.accessor([[f['seconds']] for f in clip['frames']], '<f4', 'SCALAR', True)
        animation = dict(name=clip['name'], samplers=[], channels=[])
        for old in used:
            for channel, kind in [('translation', 'VEC3'), ('rotation', 'VEC4'), ('scale', 'VEC3')]:
                values = np.array([f['joints'][old][channel] for f in clip['frames']], dtype=float)
                if channel == 'rotation':
                    values /= np.linalg.norm(values, axis=1)[:, None]
                    for i in range(1, len(values)):
                        if np.dot(values[i-1], values[i]) < 0:
                            values[i] *= -1
                index = len(animation['samplers'])
                animation['samplers'].append(dict(input=times, output=glb.accessor(values, '<f4', kind), interpolation='LINEAR'))
                animation['channels'].append(dict(sampler=index, target=dict(node=remap[old], path=channel)))
        glb.doc['animations'].append(animation)
    return glb


def material(texture, layer=None, name='', alpha=1):
    layer = layer or dict(filterMode=0, shadingFlags=0)
    mode, flags = layer['filterMode'], layer['shadingFlags']
    return dict(version=8, name=name, shader='unlit' if flags & 1 else 'pbr', surface='opaque' if mode == 0 else 'cutout' if mode == 1 else 'transparent', blend_mode='additive' if mode in (3, 4) else 'multiply' if mode in (5, 6) else 'alpha', base_color=[1, 1, 1, alpha], base_color_texture=texture, roughness=0.95, metallic=0, double_sided=bool(flags & 16), alpha_cutoff=0.75, transparent_depth_write=False, render_queue=2000 if mode in (0, 1) else 3000, wrap_u='repeat', wrap_v='repeat')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=pathlib.Path, default=ROOT / 'tmp/war3-inspect/export')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii/classic')
    args = parser.parse_args()
    source, output = args.input.resolve(), args.output.resolve()
    if (source / 'manifest.json').exists():
        manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
        raw_root, inventory, terrain_preview = source / 'raw', source / 'model-inventory.json', source / 'terrain-preview.jpg'
    else:
        stored = json.loads((source / 'asset-sources.json').read_text(encoding='utf-8'))
        manifest = dict(source=stored['source'], archives=stored['archives'], precedence=stored['archivePrecedence'], files=stored['sourceFiles'], modelSamples=stored['modelSamples'])
        raw_root, inventory, terrain_preview = source / 'SourceAssets', source / 'SourceAssets/model-inventory.json', source / 'Validation/terrain-preview.jpg'
    output.mkdir(parents=True, exist_ok=True)
    prior_manifest = output / 'asset-sources.json'
    if prior_manifest.exists():
        for generated in json.loads(prior_manifest.read_text(encoding='utf-8'))['generatedFiles']:
            target = output / relative(generated['path'])
            if not target.is_file() or sha(target.read_bytes()) != generated['sha256']:
                raise ValueError(f'Preserve locally modified generated file: {target}')
    converter, license_path, tool_hashes = sampler()
    cache = converter.parent.parent / 'sampled'
    cache.mkdir(exist_ok=True)
    pngs, terrain = {}, []
    for record in manifest['files']:
        path = relative(record['path'])
        raw = (raw_root / path).read_bytes()
        if sha(raw) != record['sha256'] or len(raw) != record['bytes']:
            raise ValueError(f'Source checksum mismatch: {path}')
        dest = output / 'SourceAssets' / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
    subprocess.run(['dotnet', str(converter), '--textures', str(output / 'SourceAssets'), str(output / PREFIX / 'Textures')], check=True)
    for record in manifest['files']:
        path = relative(record['path'])
        if path.suffix.lower() != '.blp':
            continue
        png = PREFIX / 'Textures' / path.with_suffix('.png')
        image = Image.open(output / png).convert('RGBA')
        pngs[record['path'].lower()] = png.as_posix()
        if path.parts[0].lower() != 'terrainart':
            continue
        assert image.width % 64 == 0 and image.height % 64 == 0
        entry = dict(source=record['path'], atlas=png.as_posix(), width=image.width, height=image.height, tiles=[])
        for y in range(image.height // 64):
            for x in range(image.width // 64):
                tile = image.crop((x*64, y*64, (x+1)*64, (y+1)*64))
                stem = path.with_suffix('') / f'{y:02}-{x:02}'
                tile_path = PREFIX / 'Textures/Tiles' / stem.with_suffix('.png')
                tile_mat = PREFIX / 'Materials/Tiles' / stem.with_suffix('.mmat')
                target = output / tile_path
                target.parent.mkdir(parents=True, exist_ok=True)
                tile.save(target)
                assert np.array_equal(np.array(Image.open(target)), np.array(tile))
                alpha = np.array(tile)[:, :, 3]
                mat = material(tile_path.as_posix(), dict(filterMode=2 if alpha.min() < 255 else 0, shadingFlags=0), name=f'{path.stem}/{y}-{x}')
                entry['tiles'].append(dict(column=x, row=y, sourceRect=[x*64, y*64, 64, 64], texture=tile_path.as_posix(), material=tile_mat.as_posix(), alphaCoverage=float((alpha/255).mean())))
                json_write(output / tile_mat, mat)
        entry['defaultTile'] = max(range(len(entry['tiles'])), key=lambda i: entry['tiles'][i]['alphaCoverage'])
        terrain.append(entry)
    quad = Glb()
    quad.mesh([[-.5, 0, -.5], [-.5, 0, .5], [.5, 0, .5], [.5, 0, -.5]], [[0, 1, 0]]*4, [[0, 0], [0, 1], [1, 1], [1, 0]], [0, 1, 2, 0, 2, 3])
    plane = PREFIX / 'Models/TerrainTile.glb'
    quad.save(output / plane)
    model_catalog, verification = [], []
    source_paths = {f['path'].lower(): f['path'] for f in manifest['files']}
    for model_source in manifest['modelSamples']:
        path = relative(model_source['path'])
        sampled = cache / (path.stem + '.json')
        actual_source = source_paths[model_source['path'].lower()]
        subprocess.run(['dotnet', str(converter), str(output / 'SourceAssets' / relative(actual_source)), str(sampled)], check=True)
        sample = json.loads(sampled.read_text())
        verification.append(dict(model=model_source['path'], **check_poses(sample)))
        model = sample['model']
        clips = sample['clips']
        entry = dict(id=path.stem, source=model_source['path'], previewSequence=sample['previewSequence'], sourceMaterialLayers=sum(len(model['materials'][g['materialId']]['layers']) for g in model['geosets']), parts=[], clips=[{k: c[k] for k in ['name', 'duration', 'loop', 'frameCount']} for c in clips], effects=dict(particles=len(model['particleEmitters']), ribbons=len(model['ribbonEmitters']), lights=len(model['lights']), billboards=sample['hasBillboards'], skippedChunks=model['skippedChunks']))
        states = [dict(name=c['name'], frames=[f['state'] for f in c['frames']]) for c in clips]
        state_path = PREFIX / 'Animations' / (path.stem + '.json')
        json_write(output / state_path, dict(fps=12, clips=states), compact=True)
        entry['stateTracks'] = state_path.as_posix()
        for g in model['geosets']:
            gi = g['index']
            positions = vectors(g['positions']) @ AXES.T / 128
            normals = vectors(g['normals']) @ AXES.T
            layers = model['materials'][g['materialId']]['layers']
            coords = {l['coordId'] for l in layers}
            if coords != {0}:
                raise ValueError(f'Model uses multiple UV channels: {path} geoset {gi}')
            uv = [[v['x'], v['y']] for v in g['uvs']]
            stem = path.with_suffix('') / f'geoset-{gi:02}'
            static_path = PREFIX / 'Models' / stem.with_suffix('.glb')
            static = Glb()
            static.mesh(sample['restGeometry'][gi]['positions'], sample['restGeometry'][gi]['normals'], uv, g['indices'])
            static.save(output / static_path)
            animated_path = PREFIX / 'Models' / stem.with_name(stem.name + '-animated').with_suffix('.glb')
            animated_mesh(sample, g, uv, positions, normals).save(output / animated_path)
            render_layers = layers
            composite_materials = {}
            if len(layers) > 1:
                if len(layers) != 2 or [l['filterMode'] for l in layers] != [0, 2] or any(l['alphaTrack'] or l['textureIdTrack'] or l['textureAnimationId'] >= 0 for l in layers):
                    raise ValueError(f'Unsupported animated material stack: {path} geoset {gi}')
                bottom = model['textures'][layers[0]['diffuseTextureId']]
                top = model['textures'][layers[1]['diffuseTextureId']]
                if bottom['replaceableId'] != 1:
                    raise ValueError(f'Unsupported material stack: {path} geoset {gi}')
                overlay = Image.open(output / pngs[top['fileName'].lower()]).convert('RGBA')
                for team in (0, 1):
                    team_source = rf'ReplaceableTextures\TeamColor\TeamColor{team:02}.blp'
                    base = Image.open(output / pngs[team_source.lower()]).convert('RGBA').resize(overlay.size)
                    composed = Image.alpha_composite(base, overlay)
                    texture_path = PREFIX / 'Textures/Composed' / stem.with_name(stem.name + f'-team-{team:02}').with_suffix('.png')
                    target = output / texture_path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    composed.save(target)
                    mat_path = PREFIX / 'Materials' / stem.with_name(stem.name + f'-team-{team:02}').with_suffix('.mmat')
                    mat = material(texture_path.as_posix(), dict(filterMode=0, shadingFlags=layers[-1]['shadingFlags']), name=f'{path.stem}/{gi}/team-{team}')
                    mat.update(wrap_u='repeat' if top['flags'] & 1 else 'clamp', wrap_v='repeat' if top['flags'] & 2 else 'clamp')
                    json_write(output / mat_path, mat)
                    composite_materials[str(team)] = mat_path.as_posix()
                render_layers = [layers[-1]]
                # Retire only outputs of the preceding conversion, after checking their recorded
                # hashes. A local edit in a generated file is never removed implicitly.
                prior_manifest = output / 'asset-sources.json'
                old_files = {f['path']: f for f in json.loads(prior_manifest.read_text())['generatedFiles']} if prior_manifest.exists() else {}
                for li in range(len(layers)):
                    old = PREFIX / 'Materials' / stem.with_name(stem.name + f'-layer-{li}').with_suffix('.mmat')
                    for rel in [old, old.with_name(old.name + '.meta')]:
                        existing = output / rel
                        if existing.exists():
                            if rel.as_posix() not in old_files or sha(existing.read_bytes()) != old_files[rel.as_posix()]['sha256']:
                                raise ValueError(f'Preserve locally modified generated file: {existing}')
                            existing.unlink()
            for li, layer in enumerate(render_layers):
                texture_id = layer['diffuseTextureId']
                texture = model['textures'][texture_id]
                source_texture = REPLACEMENTS.get(texture['replaceableId'], texture['fileName'])
                texture_path = pngs[source_texture.lower()]
                mat_path = pathlib.Path(composite_materials['0']) if composite_materials else PREFIX / 'Materials' / stem.with_name(stem.name + f'-layer-{li}').with_suffix('.mmat')
                mat = material(texture_path, layer, name=f'{path.stem}/{gi}/{li}', alpha=layer['alpha'])
                if li:
                    mat['render_queue'] += li
                flags = texture['flags']
                mat.update(wrap_u='repeat' if flags & 1 else 'clamp', wrap_v='repeat' if flags & 2 else 'clamp')
                if not composite_materials:
                    json_write(output / mat_path, mat)
                team_materials = dict(composite_materials)
                if not composite_materials and texture['replaceableId'] in (1, 2):
                    team_materials['0'] = mat_path.as_posix()
                    blue_mat = dict(mat)
                    blue_source = REPLACEMENTS[texture['replaceableId']].replace('00.blp', '01.blp')
                    blue_mat['base_color_texture'] = pngs[blue_source.lower()]
                    blue_path = mat_path.with_name(mat_path.stem + '-team-01.mmat')
                    json_write(output / blue_path, blue_mat)
                    team_materials['1'] = blue_path.as_posix()
                entry['parts'].append(dict(geoset=gi, materialIndex=g['materialId'], layer=len(layers)-1 if composite_materials else li, mesh=static_path.as_posix(), animatedMesh=animated_path.as_posix(), material=mat_path.as_posix(), teamMaterials=team_materials, sourceLayers=layers if composite_materials else [], replaceableId=1 if composite_materials else texture['replaceableId'], defaultVisible=sample['clips'][next(i for i, c in enumerate(clips) if c['name'] == sample['previewSequence'])]['frames'][0]['state']['geosets'][gi]['alpha'] > .001, sourceFlags=layer['shadingFlags'], textureAnimationId=layer['textureAnimationId']))
        prefab_path = PREFIX / 'Prefabs' / (path.stem + '.prefab')
        transform = dict(position=[0, 0, 0], scale=[1, 1, 1], rotation=[0, 0, 0, 1])
        children = [dict(id=f'geoset-{p["geoset"]:02}', name=f'Geoset {p["geoset"]}', active=p['defaultVisible'], components=dict(Transform=transform, MeshRenderer=dict(mesh=p['mesh'], material=p['material'])), children=[]) for p in entry['parts']]
        json_write(output / prefab_path, dict(version=2, name=path.stem, root=dict(id='root', name=path.stem, active=True, components=dict(Transform=transform), children=children)))
        entry['prefab'] = prefab_path.as_posix()
        model_catalog.append(entry)
    json_write(output / PREFIX / 'terrain-catalog.json', dict(version=1, cellSize=64, plane=plane.as_posix(), atlases=terrain))
    json_write(output / PREFIX / 'model-catalog.json', dict(version=1, fps=12, sourceUnitToEngineUnit=1/128, axes='(x,y,z) -> (x,z,-y)', models=model_catalog))
    licenses = output / 'Licenses'
    licenses.mkdir(exist_ok=True)
    shutil.copyfile(license_path, licenses / 'W3ModelViewer-MIT.txt')
    json_write(licenses / 'converter-sources.json', dict(repository=UPSTREAM, commit=COMMIT, files=tool_hashes, python=dict(numpy=np.__version__, pillow=Image.__version__)))
    # Scenes exercise every material and PNG through the actual runtime loaders, and poses at
    # each sequence's beginning, middle and final representable 12 Hz frame.
    entities, preview = [], []
    def entity(name, mesh, mat, position=(0, 0, 0), active=True):
        return dict(entity=0, name=name, parent=None, siblingIndex=0, active=active, components=dict(Transform=dict(position=list(position), scale=[1, 1, 1], rotation=[0, 0, 0, 1]), MeshRenderer=dict(mesh=mesh, material=mat)))
    for i, entry in enumerate(terrain):
        for tile in entry['tiles']:
            entities.append(entity(tile['material'], plane.as_posix(), tile['material']))
        tile = entry['tiles'][entry['defaultTile']]
        preview.append(entity(pathlib.PureWindowsPath(entry['source']).stem, plane.as_posix(), tile['material'], (i%14-7, 0, i//14-6)))
    for i, entry in enumerate(model_catalog):
        for part in entry['parts']:
            entities.append(entity(part['mesh'], part['mesh'], part['material']))
            for variant in part['teamMaterials'].values():
                entities.append(entity(part['mesh']+'/'+variant, part['mesh'], variant))
            for ci, clip in enumerate(entry['clips']):
                for frame in sorted({0, clip['frameCount']//2, max(0, clip['frameCount']-1)}):
                    entities.append(entity(f'{entry["id"]}/{ci}/{frame}', part['animatedMesh']+f'#pose={ci}:{frame}', part['material']))
            preview.append(entity(f'{entry["id"]}/{part["geoset"]}/{part["layer"]}', part['mesh'], part['material'], (i*4-6, .05, 8), part['defaultVisible']))
    # Atlases and unused particle textures are also independently decoded, even when the preview
    # uses cropped cells and the current exporter preserves effect instructions only as source.
    for source_path, texture in pngs.items():
        mat_path = PREFIX / 'Materials/Atlases' / relative(source_path).with_suffix('.mmat')
        json_write(output / mat_path, material(texture, name=source_path))
        entities.append(entity(texture, plane.as_posix(), mat_path.as_posix()))
    def scene(name, entries, path):
        for i, entry in enumerate(entries, 1):
            entry.update(entity=i, siblingIndex=i-1)
        json_write(output / path, dict(version=1, name=name, world=dict(entities=entries)))
    camera = dict(entity=0, name='Camera', parent=None, siblingIndex=0, active=True, components=dict(Transform=dict(position=[0, 17, 21], scale=[1, 1, 1], rotation=[math.sin(-.67/2), 0, 0, math.cos(-.67/2)]), Camera3D=dict(primary=True, projection='orthographic', orthographic_size=13, near=.1, far=100)))
    sun = dict(entity=0, name='Sun', parent=None, siblingIndex=0, active=True, components=dict(Transform=dict(position=[0, 0, 0], scale=[1, 1, 1], rotation=[-.4, -.2, 0, .894427]), DirectionalLight=dict(color=[1, 1, 1, 1], intensity=2.2, cast_shadows=True)))
    scene('Warcraft III asset preview', [camera, sun]+preview, PREFIX / 'Scenes/Preview.mscene')
    validation = output / 'Validation'
    validation.mkdir(exist_ok=True)
    scene('Warcraft III complete asset validation', entities, pathlib.Path('Validation/AllAssets.mscene'))
    for path in sorted((output / 'Assets').rglob('*')):
        if path.is_file():
            sidecar(path, output)
    report = dict(terrainAtlases=len(terrain), terrainTiles=sum(len(t['tiles']) for t in terrain), modelSources=len(model_catalog), geosets=sum(len({p['geoset'] for p in m['parts']}) for m in model_catalog), renderParts=sum(len(m['parts']) for m in model_catalog), sourceMaterialLayers=sum(m['sourceMaterialLayers'] for m in model_catalog), clips=sum(len(m['clips']) for m in model_catalog), poseComparison=verification, validationEntities=len(entities))
    json_write(validation / 'conversion-checks.json', report)
    generated = [dict(path=p.relative_to(output).as_posix(), bytes=p.stat().st_size, sha256=sha(p.read_bytes())) for p in sorted((output / 'Assets').rglob('*')) if p.is_file()]
    json_write(output / 'asset-sources.json', dict(convertedOn='2026-10-05', source=manifest['source'], archives=manifest['archives'], archivePrecedence=manifest['precedence'], modelSamples=[dict(path=s['path']) for s in manifest['modelSamples']], sourceFiles=manifest['files'], generatedFiles=generated, converter=dict(script='scripts/convert-warcraft-assets.py', upstream=UPSTREAM, commit=COMMIT), scope='161 terrain atlases and four extracted model samples; model inventory is not an extracted model collection.'))
    for src, dest in [(inventory, output / 'SourceAssets/model-inventory.json'), (terrain_preview, output / 'Validation/terrain-preview.jpg')]:
        if src.resolve() != dest.resolve():
            shutil.copyfile(src, dest)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
