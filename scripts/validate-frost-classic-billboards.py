"""Author: MiYu. Compare original actor and building billboards with independent camera-aware MDX poses."""
import argparse
import importlib
import json
import pathlib
import subprocess
import tempfile
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
converter = importlib.import_module('convert-frost-classic-billboards')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe'))
parser.add_argument('--reference', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/billboard-reference/BillboardReference.dll')
args = parser.parse_args()
library = ROOT / 'asset-library/warcraft-iii/classic-billboard-ready'
overrides, receipt_sha, receipt = converter.load_overlay(library)
sample = ROOT / 'samples/frostbound-realms'
imported = json.loads((sample / 'classic-sources.json').read_bytes())
assert imported['billboardReceiptSha256'] == receipt_sha
for record in imported['files']:
    raw = (sample / record['path']).read_bytes()
    assert converter.digest(raw) == record['sha256'] and len(raw) == record['bytes'], record['path']
for annotation in receipt['annotations']:
    raw = (ROOT / 'asset-library/warcraft-iii' / annotation['pack'] / annotation['path']).read_bytes()
    old, old_binary = converter.read_glb(raw); new, new_binary = converter.read_glb(overrides[(annotation['pack'], converter.key(annotation['path']))])
    assert old_binary == new_binary, annotation['path']
    del new['extras']['mengineMdxAnimation']
    if not new['extras']: del new['extras']
    for index, node in enumerate(new['nodes']):
        if 'mengineBillboard' in node.get('extras', {}) and 'mengineBillboard' not in old['nodes'][index].get('extras', {}):
            del node['extras']['mengineBillboard']
            if not node['extras']: del node['extras']
    assert old == new, annotation['path']
    assert (sample / annotation['path']).read_bytes() == overrides[(annotation['pack'], converter.key(annotation['path']))], annotation['path']
catalogs = {pack: json.loads((ROOT / 'asset-library/warcraft-iii' / pack / 'Assets/WarcraftIII/model-catalog.json').read_bytes())['models'] for pack in receipt['sourceCollections']}
selected = sorted({(a['pack'], a['source']) for a in receipt['annotations']})
views = [(np.array([0., -.7, -.71414284]), 0.), (np.array([-.8, -.6, 0.]), .65), (np.array([0., -.3, .9539392]), -.4), (np.array([0., -1., 0.]), 0.)]
axes = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0.]])
loads, comparisons, max_error, results = 0, 0, 0., []
with tempfile.TemporaryDirectory(prefix='classic-billboard-reference-', dir=ROOT / 'tmp') as temp:
    for pack, source in selected:
        asset = next(m for m in catalogs[pack] if converter.key(m['source']) == converter.key(source))
        parts = [p for p in asset['parts'] if (pack, converter.key(p['animatedMesh'])) in overrides]
        result = dict(pack=pack, source=source, parts=len(parts), clips=len(asset['clips']), loads=0, vertices=0, maxPositionError=0.)
        for view_index, (direction, yaw) in enumerate(views):
            look = direction / np.linalg.norm(direction)
            up = np.array([0., 0., -1.]) if abs(look[1]) > .999 else np.array([0., 1., 0.])
            up -= look * np.dot(up, look); up /= np.linalg.norm(up)
            c, s = np.cos(yaw), np.sin(yaw)
            model = np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.]])
            camera = [*(axes.T @ model[:3, :3].T @ look), *(axes.T @ model[:3, :3].T @ up)]
            source_path = ROOT / 'asset-library/warcraft-iii' / pack / 'SourceAssets' / pathlib.PureWindowsPath(source).as_posix()
            target = pathlib.Path(temp) / 'reference.json'
            run = subprocess.run(['dotnet', str(args.reference.resolve()), str(source_path), str(target), *map(str, camera)], capture_output=True, text=True, encoding='utf-8')
            assert run.returncode == 0, run.stderr
            references = json.loads(target.read_bytes())['clips']; assert len(references) == len(asset['clips']), source
            keys, expected = [], []
            for part in parts:
                for clip, (animation, ref) in enumerate(zip(asset['clips'], references)):
                    assert animation['name'] == ref['name'], source
                    for frame in ref['samples']:
                        keys.append(str((sample / part['animatedMesh']).resolve()) + f'#pose={clip}:{frame["frame"]}')
                        expected.append(np.array(frame['geosets'][part['geoset']]))
            run = subprocess.run([str(args.probe.resolve()), '--stdin', '--positions', '--billboard-camera=' + ','.join(map(str, [*look, *up])), '--billboard-model=' + ','.join(map(str, model.T.flatten()))], input='\n'.join(keys) + '\n', capture_output=True, text=True, encoding='utf-8')
            assert run.returncode == 0, run.stderr
            actual = [json.loads(row) for row in run.stdout.splitlines()]; assert len(actual) == len(keys)
            for key, row, ref in zip(keys, actual, expected):
                positions = np.array(row['positions']); assert positions.shape == ref.shape and np.isfinite(positions).all(), key
                error = float(np.max(np.abs(positions - ref))); assert error < .5 / 128, (key, view_index, error)
                max_error = max(max_error, error); result['maxPositionError'] = max(result['maxPositionError'], error)
                comparisons += len(positions); result['vertices'] += len(positions)
            loads += len(keys); result['loads'] += len(keys)
        results.append(result)
        print('PASS source camera poses:', source, 'loads', result['loads'], 'max error', result['maxPositionError'], flush=True)
report = dict(passed=True, sourceModels=len(receipt['sourceFiles']), billboardModels=len({(a['pack'], a['source']) for a in receipt['annotations'] if a['nodes']}), geometryParts=len(overrides), sourceBillboardNodes=len({(a['pack'], a['source'], n['sourceNode']) for a in receipt['annotations'] for n in a['nodes']}), sourceFlags=sorted({n['flags'] for a in receipt['annotations'] for n in a['nodes']}), nativeLoads=loads, comparedVertices=comparisons, maxPositionError=max_error, cameraViews=len(views), binaryBuffersPreserved=True, importedFiles=len(imported['files']), probeSha256=converter.digest(args.probe.read_bytes()), referenceSha256=converter.digest(args.reference.read_bytes()), models=results, scope='Independent pinned source MDX evaluator against imported native actor and building poses. All clips, start/middle/exact endpoints, actor yaw, full billboards and source lock-Z billboards, including degenerate overhead views. Separate GPU and game integration validation required.')
(ROOT / 'docs/designs/frostbound-realms/classic-billboard-pose-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('PASS classic billboard poses:', json.dumps({k:v for k,v in report.items() if k != 'models'}))
