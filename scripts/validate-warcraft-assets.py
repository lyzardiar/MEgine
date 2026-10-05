"""Author: MiYu. Validate serialized Warcraft GLBs against MDX poses and real runtime loaders."""
import argparse
import importlib.util
import io
import json
import pathlib
import struct
import subprocess

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('warcraft_converter', ROOT / 'scripts/convert-warcraft-assets.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


def load_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert (magic, version, length) == (0x46546C67, 2, len(data)), path
    count, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20+count])
    offset = 20 + count
    size, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942 and offset + 8 + size == len(data)
    blob = data[offset+8:]
    assert doc['buffers'][0]['byteLength'] <= len(blob)
    return doc, blob


def accessor(doc, blob, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    size = a['count'] * width * np.dtype(dtype).itemsize
    assert offset + size <= v.get('byteOffset', 0) + v['byteLength'] <= len(blob)
    assert not a.get('sparse') and not v.get('byteStride')
    return np.frombuffer(blob, dtype=dtype, count=a['count']*width, offset=offset).reshape(-1, width)


def serialized_pose(doc, blob, clip, frame):
    nodes = doc['nodes']
    trs = [dict(translation=n.get('translation', [0, 0, 0]), rotation=n.get('rotation', [0, 0, 0, 1]), scale=n.get('scale', [1, 1, 1])) for n in nodes]
    animation = doc['animations'][clip]
    for c in animation['channels']:
        s = animation['samplers'][c['sampler']]
        assert s['interpolation'] == 'LINEAR'
        values = accessor(doc, blob, s['output'])
        times = accessor(doc, blob, s['input'])[:, 0]
        assert len(times) == len(values) and np.all(np.diff(times) > 0)
        trs[c['target']['node']][c['target']['path']] = values[min(frame,len(values)-1)]
    parents = {}
    for i, node in enumerate(nodes):
        for child in node.get('children', []):
            assert child not in parents
            parents[child] = i
    local = [converter.matrix(t) for t in trs]
    def world(i, seen=()):
        assert i not in seen
        return local[i] if i not in parents else world(parents[i], seen+(i,)) @ local[i]
    primitive = doc['meshes'][0]['primitives'][0]
    attrs = primitive['attributes']
    positions = accessor(doc, blob, attrs['POSITION'])
    if not doc.get('skins'):
        node=next(i for i,n in enumerate(nodes) if n.get('mesh')==0)
        return (world(node) @ np.column_stack([positions,np.ones(len(positions))]).T).T[:,:3]
    skin = doc['skins'][0]
    ibms = accessor(doc, blob, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    matrices = np.array([world(j) @ ibm for j, ibm in zip(skin['joints'], ibms)])
    sets=sorted(int(k.split('_')[1]) for k in attrs if k.startswith('JOINTS_'))
    ids = np.concatenate([accessor(doc, blob, attrs[f'JOINTS_{i}']) for i in sets],axis=1)
    weights = np.concatenate([accessor(doc, blob, attrs[f'WEIGHTS_{i}']) for i in sets],axis=1)
    assert np.allclose(weights.sum(axis=1), 1) and np.all(weights >= 0)
    blended = np.sum(matrices[ids] * weights[:, :, None, None], axis=1)
    return np.einsum('nij,nj->ni', blended, np.column_stack([positions, np.ones(len(positions))]))[:, :3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii/classic')
    parser.add_argument('--runtime', type=pathlib.Path, default=ROOT / 'target/release/mengine-runtime.exe')
    args = parser.parse_args()
    root = args.root.resolve()
    source = json.loads((root / 'asset-sources.json').read_text())
    for f in source['sourceFiles']:
        p = root / 'SourceAssets' / converter.relative(f['path'])
        assert p.stat().st_size == f['bytes'] and converter.sha(p.read_bytes()) == f['sha256'], p
    for f in source['generatedFiles']:
        p = root / f['path']
        assert p.stat().st_size == f['bytes'] and converter.sha(p.read_bytes()) == f['sha256'], p
    texture_checks = []
    for f in source['sourceFiles']:
        path = converter.relative(f['path'])
        if path.suffix.lower() != '.blp':
            continue
        raw = (root / 'SourceAssets' / path).read_bytes()
        if raw[:4] != b'BLP1' or struct.unpack_from('<I', raw, 4)[0] != 0:
            continue
        alpha_bits = struct.unpack_from('<I', raw, 8)[0]
        header_size = struct.unpack_from('<I', raw, 156)[0]
        offset, size = struct.unpack_from('<I', raw, 28)[0], struct.unpack_from('<I', raw, 92)[0]
        jpeg = Image.open(io.BytesIO(raw[160:160+header_size] + raw[offset:offset+size]))
        assert jpeg.mode in ('CMYK','RGB')
        # BLP JPEG component planes are BGRA, not CMYK colourants. Force the independent
        # libjpeg decoder to return the raw four planes without colour conversion/inversion.
        jpeg.tile = [jpeg.tile[0]._replace(args=(jpeg.mode, jpeg.mode))]
        jpeg.load()
        planes=jpeg.split();b,g,r=planes[:3]
        a=planes[3] if len(planes)==4 and alpha_bits else Image.new('L',jpeg.size,255)
        reference = np.array(Image.merge('RGBA', (r, g, b, a)))
        image = np.array(Image.open(root / converter.PREFIX / 'Textures' / path.with_suffix('.png')).convert('RGBA'))
        delta = int(np.max(np.abs(reference.astype(int) - image.astype(int))))
        assert delta <= 2, (path, delta)
        texture_checks.append(dict(path=f['path'], maxChannelDelta=delta, alphaMin=int(image[:,:,3].min()), alphaMax=int(image[:,:,3].max())))
    catalog = json.loads((root / converter.PREFIX / 'model-catalog.json').read_text())
    cache = ROOT / 'tmp/warcraft-converter' / converter.COMMIT / 'sampled'
    checks = []
    uv_samples, texture_samples = 0, 0
    for entry in catalog['models']:
        sample = json.loads((cache / (converter.sha(entry['source'].lower().encode())[:12] + '-' + entry['id'] + '.json')).read_text())
        result = dict(model=entry['id'], samples=0, vertices=0, maxPositionError=0.0)
        for part in entry['parts']:
            doc, blob = load_glb(root / part['animatedMesh'])
            assert [a['name'] for a in doc.get('animations',[])] == [c['name'] for c in entry['clips']]
            g = part['geoset']
            expected_uv=np.array([[v['x'],v['y']] for v in sample['model']['geosets'][g]['uvLayers'][part.get('uvChannel',0)]])
            assert np.allclose(accessor(doc,blob,doc['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']),expected_uv,atol=1e-6)
            for ci, clip in enumerate(sample['clips']):
                for fi, f in enumerate(clip['frames']):
                    state = f['state']['materials'][part['materialIndex']][part['layer']]
                    if part['textureAnimationId'] >= 0:
                        actual = doc['animations'][ci]['extras']['mengineUv']['frames'][fi]
                        assert np.allclose(actual, state['uv'], atol=1e-7), (entry['id'], g, ci, fi, 'UV')
                        uv_samples += 1
                    if part['textureMaterials']:
                        mat = json.loads((root / part['textureMaterials'][str(state['texture'])]).read_text())
                        assert (root / mat['base_color_texture']).is_file()
                        texture_samples += 1
                    if f['reference'] is None:
                        continue
                    posed = serialized_pose(doc, blob, ci, fi)
                    reference = np.array(f['reference'][g]['positions'])
                    error = float(np.max(np.abs(posed-reference)))
                    assert error < converter.POSE_TOLERANCE, (entry['id'], g, ci, fi, error)
                    result['maxPositionError'] = max(result['maxPositionError'], error)
                    result['samples'] += 1
                    result['vertices'] += len(posed)
        checks.append(result)
    guids = set()
    for p in (root / 'Assets').rglob('*.meta'):
        meta = json.loads(p.read_text())
        assert meta['schemaVersion'] == 1 and meta['guid'] not in guids
        assert p.with_suffix('').is_file()
        guids.add(meta['guid'])
    for p in (root / 'Assets').rglob('*.prefab'):
        prefab = json.loads(p.read_text())
        assert prefab['version'] == 2
        ids = [prefab['root']['id']] + [n['id'] for n in prefab['root']['children']]
        assert len(ids) == len(set(ids))
    terrain = json.loads((root / converter.PREFIX / 'terrain-catalog.json').read_text())
    for atlas in terrain['atlases']:
        image = Image.open(root / atlas['atlas']).convert('RGBA')
        for tile in atlas['tiles']:
            x, y, w, h = tile['sourceRect']
            actual = Image.open(root / tile['texture']).convert('RGBA')
            assert np.array_equal(np.array(actual), np.array(image.crop((x, y, x+w, y+h))))
    report = dict(sourceFiles=len(source['sourceFiles']), generatedFiles=len(source['generatedFiles']), sidecarGuids=len(guids), uvAnimationSamples=uv_samples, textureAnimationSamples=texture_samples, jpegPlaneChecks=dict(textures=len(texture_checks), maxChannelDelta=max((x['maxChannelDelta'] for x in texture_checks),default=0), texturesWithAlpha=sum(x['alphaMin']<255 for x in texture_checks)), serializedGlbPoseChecks=checks, runtimeExecutable=str(args.runtime.resolve()), runtimeSha256=converter.sha(args.runtime.read_bytes()))
    converter.json_write(root / 'Validation/verification.json', report)
    def package_manifest():
        files = [dict(path=p.relative_to(root).as_posix(), size=p.stat().st_size, sha256=converter.sha(p.read_bytes())) for p in sorted(root.rglob('*')) if p.is_file() and p.name != 'mengine-build.json']
        converter.json_write(root / 'mengine-build.json', dict(schemaVersion=1, files=files))
    package_manifest()
    run = subprocess.run([str(args.runtime), '--validate-package', '--project-root', str(root), '--scene', 'Validation/AllAssets.mscene'], capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(run.stdout)
    if run.returncode:
        print(run.stderr)
        raise RuntimeError(f'Engine package validation failed: {run.returncode}')
    report.update(runtimePassed=True, runtimeOutput=run.stdout.strip())
    converter.json_write(root / 'Validation/verification.json', report)
    # Refresh the integrity manifest after adding the completed validation report.
    package_manifest()
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
