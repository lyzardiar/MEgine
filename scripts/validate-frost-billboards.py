"""Author: MiYu. Compare native camera-facing poses with an independent source MDX evaluator."""
import argparse
import hashlib
import json
import pathlib
import struct
import subprocess
import tempfile
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
def digest(raw): return hashlib.sha256(raw).hexdigest()
def glb(raw):
    size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20 + size]), raw[28 + size:]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe'))
parser.add_argument('--reference', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/billboard-reference/BillboardReference.dll')
args = parser.parse_args()
library = ROOT / 'asset-library/warcraft-iii/billboard-ready'
original = ROOT / 'asset-library/warcraft-iii/remaining-ready'
receipt = json.loads((library / 'asset-sources.json').read_bytes())
assert digest((original / 'asset-sources.json').read_bytes()) == receipt['sourceReceiptSha256']
for record in receipt['generatedFiles']:
    raw = (library / record['path']).read_bytes()
    assert digest(raw) == record['sha256'] and len(raw) == record['bytes'], record['path']
for source, expected in receipt['converter'].items(): assert digest((ROOT / source).read_bytes()) == expected, source
for annotation in receipt['annotations']:
    path = annotation['path']; raw = (original / path).read_bytes(); assert digest(raw) == annotation['sourceSha256'], path
    old, old_binary = glb(raw); new, new_binary = glb((library / path).read_bytes())
    assert old_binary == new_binary, path
    for node in new['nodes']:
        if 'extras' in node and 'mengineBillboard' in node['extras']:
            del node['extras']['mengineBillboard']
            if not node['extras']: del node['extras']
    assert old == new, path
models = json.loads((library / 'Assets/WarcraftIII/model-catalog.json').read_bytes())['models']
sample = ROOT / 'samples/frostbound-realms'
imported = json.loads((sample / 'effect-sources.json').read_bytes())
assert imported['geometryReceiptSha256'] == digest((library / 'asset-sources.json').read_bytes())
for annotation in receipt['annotations']: assert (sample / annotation['path']).read_bytes() == (library / annotation['path']).read_bytes()
views = [(np.array([0., -.7, -.71414284]), 0.), (np.array([-.8, -.6, 0.]), .65), (np.array([0., -.3, .9539392]), -.4), (np.array([0., -1., 0.]), 0.)]
loads, comparisons, max_error = 0, 0, 0.
with tempfile.TemporaryDirectory(prefix='billboard-reference-', dir=ROOT / 'tmp') as temp:
    for view_index, (look, yaw) in enumerate(views):
        look /= np.linalg.norm(look)
        up = np.array([0., 0., -1.]) if abs(look[1]) > .999 else np.array([0., 1., 0.])
        up -= look * np.dot(up, look); up /= np.linalg.norm(up)
        c, s = np.cos(yaw), np.sin(yaw)
        model = np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.]])
        axes = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0.]])
        source_camera = [*(axes.T @ model[:3, :3].T @ look), *(axes.T @ model[:3, :3].T @ up)]
        keys, expected = [], []
        for asset in models:
            source = original / 'SourceAssets' / pathlib.PureWindowsPath(asset['source']).as_posix()
            target = pathlib.Path(temp) / (asset['id'] + '.json')
            run = subprocess.run(['dotnet', str(args.reference.resolve()), str(source), str(target), *map(str, source_camera)], capture_output=True, text=True, encoding='utf-8')
            assert run.returncode == 0, run.stderr
            reference = json.loads(target.read_bytes())['clips']
            assert len(reference) == len(asset['clips']), asset['id']
            for part in asset['parts']:
                for clip, (animation, ref) in enumerate(zip(asset['clips'], reference)):
                    assert animation['name'] == ref['name']
                    for frame in ref['samples']:
                        keys.append(str((sample / part['animatedMesh']).resolve()) + f'#pose={clip}:{frame["frame"]}')
                        expected.append(np.array(frame['geosets'][part['geoset']]))
        camera_arg = '--billboard-camera=' + ','.join(map(str, [*look, *up]))
        model_arg = '--billboard-model=' + ','.join(map(str, model.T.flatten()))
        run = subprocess.run([str(args.probe.resolve()), '--stdin', '--positions', camera_arg, model_arg], input='\n'.join(keys)+'\n', capture_output=True, text=True, encoding='utf-8')
        assert run.returncode == 0, run.stderr
        actual = [json.loads(row) for row in run.stdout.splitlines()]; assert len(actual) == len(keys)
        for key, row, ref in zip(keys, actual, expected):
            positions = np.array(row['positions']); assert positions.shape == ref.shape and np.isfinite(positions).all(), key
            error = float(np.max(np.abs(positions - ref))); assert error < .5 / 128, (key, view_index, error)
            max_error = max(max_error, error); comparisons += len(positions)
        loads += len(keys)
card = next(m for m in models if m['id'] == 'BloodLustTarget')
look = np.array([-.6, -.5, -.6]); look /= np.linalg.norm(look)
c, s = np.cos(.65), np.sin(.65)
model = np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.]]) @ np.diag([1.7, 2.3, .6, 1.])
clip = next(i for i, c in enumerate(card['clips']) if c['name'].lower() == 'stand')
key = str((sample / card['parts'][0]['animatedMesh']).resolve()) + f'#pose={clip}:2'
run = subprocess.run([str(args.probe.resolve()), '--positions', '--billboard-camera=' + ','.join(map(str, [*look, 0, 1, 0])), '--billboard-model=' + ','.join(map(str, model.T.flatten())), key], capture_output=True, text=True, encoding='utf-8')
assert run.returncode == 0, run.stderr
positions = np.array(json.loads(run.stdout)['positions']) @ model[:3, :3].T
normal = np.cross(positions[1] - positions[0], positions[2] - positions[0]); normal /= np.linalg.norm(normal)
assert abs(float(np.dot(normal, look))) > .99999, 'Nonuniform actor scale must preserve the camera-facing plane'
loads += 1
report = dict(passed=True, models=len(models), geometryParts=sum(len(m['parts']) for m in models), billboardAnnotations=sum(len(a['nodes']) for a in receipt['annotations']), nativeLoads=loads, comparedVertices=comparisons, maxPositionError=max_error, cameraViews=len(views), nonuniformScaleFacesCamera=True, binaryBuffersPreserved=True, probeSha256=digest(args.probe.read_bytes()), referenceSha256=digest(args.reference.read_bytes()), scope='Independent pinned MDX evaluator against native node billboard poses, including overhead cameras, actor yaw, all source clips and exact endpoints. GPU and multiple view rendering are checked separately.')
(ROOT / 'docs/designs/frostbound-realms/billboard-pose-validation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('PASS native billboard poses:', json.dumps(report))
