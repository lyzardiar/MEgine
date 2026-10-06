"""Author: MiYu. Independent source geometry and byte reproducibility for embedded construction assets."""
import argparse
import importlib
import json
import pathlib
import subprocess
import tempfile
import numpy as np

base = importlib.import_module('convert-frost-classic-billboards')
importer = importlib.import_module('import-frost-construction')
sequence = [dict(start=100, end=200)]
assert importer.visible_clips(dict(visibility=None), sequence) == [0]
assert importer.visible_clips(dict(visibility=dict(times=[100, 200], values=[[0], [0]], interpolation=0, globalSequence=-1)), sequence) == []
assert importer.visible_clips(dict(visibility=dict(times=[300], values=[[0]], interpolation=0, globalSequence=-1)), sequence) == [0]
assert importer.visible_clips(dict(visibility=dict(times=[100, 200], values=[[0], [0]], interpolation=2, globalSequence=-1)), sequence) == [0]
ROOT = base.ROOT
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
parser.add_argument('--sampler', type=pathlib.Path, required=True)
parser.add_argument('--probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe'))
parser.add_argument('--reference', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/billboard-reference/BillboardReference.dll')
args = parser.parse_args(); library = base.LIBRARY / 'construction-ready'; sample = ROOT / 'samples/frostbound-realms'
receipt = json.loads((library / 'asset-sources.json').read_bytes()); imported = json.loads((sample / 'construction-sources.json').read_bytes()); catalog = json.loads((library / 'construction-catalog.json').read_bytes())['models']
for container, records in [(library, receipt['generatedFiles']), (sample, imported['files'])]:
    paths = set()
    for f in records:
        raw = (container / f['path']).read_bytes(); assert base.digest(raw) == f['sha256'] and len(raw) == f['bytes'], f['path']
        assert f['path'].lower() not in paths, 'Case-conflicting generated paths'; paths.add(f['path'].lower())
axes = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0.]])
views = [(np.array([0., -.7, -.71414284]), 0.), (np.array([-.8, -.6, 0.]), .65), (np.array([0., -.3, .9539392]), -.4), (np.array([0., -1., 0.]), 0.)]
loads, vertices, max_error = 0, 0, 0.
def run(command):
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert result.returncode == 0, result.stdout + result.stderr
    return result
with tempfile.TemporaryDirectory(prefix='construction-validation-', dir=ROOT / 'tmp') as directory:
    temporary = pathlib.Path(directory); converted = temporary / 'library'
    command = ['python', str(ROOT / 'scripts/convert-frost-construction.py'), '--metadata-reader', str(args.metadata_reader.resolve()), '--sampler', str(args.sampler.resolve()), '--output', str(converted)]
    run(command)
    for f in receipt['generatedFiles']: assert (converted / f['path']).read_bytes() == (library / f['path']).read_bytes(), f['path']
    assert (converted / 'asset-sources.json').read_bytes() == (library / 'asset-sources.json').read_bytes()
    isolated = temporary / 'sample'; isolated.mkdir()
    import_command = ['python', str(ROOT / 'scripts/import-frost-construction.py'), '--library', str(converted), '--output', str(isolated)]
    run(import_command)
    for f in imported['files']: assert (isolated / f['path']).read_bytes() == (sample / f['path']).read_bytes(), f['path']
    assert (isolated / 'construction-sources.json').read_bytes() == (sample / 'construction-sources.json').read_bytes()
    for target, records, regenerate, message in [(converted, receipt['generatedFiles'], command, 'Preserve modified construction output'), (isolated, imported['files'], import_command, 'Preserve modified construction import')]:
        selected = next(f for f in records if f['path'].endswith('.glb')); path = target / selected['path']; path.write_bytes(path.read_bytes() + b'\n')
        before = {f['path']: base.digest((target / f['path']).read_bytes()) for f in records}
        result = subprocess.run(regenerate, capture_output=True, text=True, encoding='utf-8'); assert result.returncode != 0 and message in result.stderr, result.stdout + result.stderr
        assert all(base.digest((target / name).read_bytes()) == digest for name, digest in before.items()), 'Refusal modified outputs'
        path.write_bytes(((library if target == converted else sample) / selected['path']).read_bytes())
    for source, asset in catalog.items():
        original = next(f for f in receipt['sourceFiles'] if f['key'] == source)
        source_path = base.LIBRARY / 'remaining-ready/SourceAssets' / pathlib.PureWindowsPath(original['path']).as_posix()
        for part in asset['parts']:
            old, old_binary = base.read_glb((base.LIBRARY / 'remaining-ready' / part['animatedMesh']).read_bytes()); new, new_binary = base.read_glb((sample / part['mesh']).read_bytes())
            assert old_binary == new_binary and old['skins'] == new['skins'], part['mesh']
        for direction, yaw in views:
            look = direction / np.linalg.norm(direction); up = np.array([0., 0., -1.]) if abs(look[1]) > .999 else np.array([0., 1., 0.]); up -= look * np.dot(up, look); up /= np.linalg.norm(up)
            c, s = np.cos(yaw), np.sin(yaw); model = np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.]])
            camera = [*(axes.T @ model[:3, :3].T @ look), *(axes.T @ model[:3, :3].T @ up)]; reference = temporary / 'reference.json'
            run(['dotnet', str(args.reference.resolve()), str(source_path), str(reference), *map(str, camera)])
            clips = json.loads(reference.read_bytes())['clips']; keys, expected = [], []
            for part in asset['parts']:
                for clip, ref in enumerate(clips):
                    for frame in ref['samples']:
                        keys.append(str((sample / part['mesh']).resolve()) + f'#pose={clip}:{frame["frame"]}')
                        expected.append(np.array(frame['geosets'][part['geoset']]))
            result = subprocess.run([str(args.probe.resolve()), '--stdin', '--positions', '--billboard-camera=' + ','.join(map(str, [*look, *up])), '--billboard-model=' + ','.join(map(str, model.T.flatten()))], input='\n'.join(keys) + '\n', capture_output=True, text=True, encoding='utf-8'); assert result.returncode == 0, result.stderr
            actual = [json.loads(line) for line in result.stdout.splitlines()]; assert len(actual) == len(keys)
            for key, row, expected in zip(keys, actual, expected):
                positions = np.array(row['positions']); assert positions.shape == expected.shape and np.isfinite(positions).all(), key
                error = float(np.max(np.abs(positions - expected))); assert error < .5 / 128, (key, error)
                max_error = max(max_error, error); vertices += len(positions)
            loads += len(keys)
        print('PASS construction source:', source, flush=True)
report = dict(passed=True, models=len(catalog), parts=sum(len(a['parts']) for a in catalog.values()), cameraViews=len(views), nativeLoads=loads, comparedVertices=vertices, maxPositionError=max_error, binaryBuffersAndSkinsPreserved=True, reproducedLibraryFiles=len(receipt['generatedFiles']) + 1, reproducedImportedFiles=len(imported['files']) + 1, modifiedOutputProtected=True, refusalsLeaveOutputsUnchanged=True, probeSha256=base.digest(args.probe.read_bytes()), referenceSha256=base.digest(args.reference.read_bytes()))
(ROOT / 'docs/designs/frostbound-realms/construction-asset-validation.json').write_bytes(base.encode(report))
print('PASS construction validation:', json.dumps(report))
