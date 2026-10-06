"""Author: MiYu. Verify original transform curves at higher pose rates and beyond animation endpoints."""
import importlib
import json
import pathlib
import subprocess
import tempfile
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
converter = importlib.import_module('convert-frost-classic-billboards')
probe = pathlib.Path('D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe')
reference = ROOT / 'tmp/warcraft-effects/classic-node-rates-reference/BillboardReference.dll'
sample = ROOT / 'samples/frostbound-realms'
names = ['AncientOfWonder', 'SlaughterHouse', 'Wisp', 'Ent', 'DruidoftheClaw', 'peasant']
catalog = json.loads((ROOT / 'asset-library/warcraft-iii/game-ready/Assets/WarcraftIII/model-catalog.json').read_bytes())['models']
look = np.array([-.8, -.6, 0.]); up = np.array([0., 1., 0.]); up -= look * np.dot(up, look); up /= np.linalg.norm(up)
c, s = np.cos(.65), np.sin(.65)
model = np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.]])
axes = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0.]])
camera = [*(axes.T @ model[:3, :3].T @ look), *(axes.T @ model[:3, :3].T @ up)]
loads, vertices, maximum, holds = 0, 0, 0., 0
with tempfile.TemporaryDirectory(prefix='source-pose-rates-', dir=ROOT / 'tmp') as temp:
    for name in names:
        asset = next(m for m in catalog if m['id'].lower() == name.lower())
        source = ROOT / 'asset-library/warcraft-iii/game-ready/SourceAssets' / pathlib.PureWindowsPath(asset['source']).as_posix()
        for rate in [30, 60]:
            target = pathlib.Path(temp) / 'reference.json'
            run = subprocess.run(['dotnet', str(reference), str(source), str(target), *map(str, camera), str(rate)], capture_output=True, text=True)
            assert run.returncode == 0, run.stderr
            clips = json.loads(target.read_bytes())['clips']; keys, expected = [], []
            for part in asset['parts']:
                for clip, ref in enumerate(clips):
                    for frame in ref['samples']:
                        keys.append(str((sample / part['animatedMesh']).resolve()) + f'#pose={clip}:{frame["frame"]}@{rate}')
                        expected.append(np.array(frame['geosets'][part['geoset']]))
                    if not asset['clips'][clip]['loop']: holds += 1
            run = subprocess.run([str(probe), '--stdin', '--positions', '--billboard-camera=' + ','.join(map(str, [*look, *up])), '--billboard-model=' + ','.join(map(str, model.T.flatten()))], input='\n'.join(keys) + '\n', capture_output=True, text=True)
            assert run.returncode == 0, run.stderr
            actual = [json.loads(row) for row in run.stdout.splitlines()]; assert len(actual) == len(keys)
            for key, row, ref in zip(keys, actual, expected):
                positions = np.array(row['positions']); assert positions.shape == ref.shape and np.isfinite(positions).all(), key
                error = float(np.max(np.abs(positions - ref))); assert error < .5 / 128, (key, error)
                maximum = max(maximum, error); vertices += len(positions)
            loads += len(keys)
report = dict(passed=True, models=names, poseRates=[30, 60], nativeLoads=loads, comparedVertices=vertices, maxPositionError=maximum, nonloopTerminalHolds=holds, actorYaw=.65, probeSha256=converter.digest(probe.read_bytes()), referenceSha256=converter.digest(reference.read_bytes()), referenceSourceSha256=converter.digest((ROOT / 'scripts/warcraft-billboard-reference/Program.cs').read_bytes()), scope='Independent source MDX curves at 30/60 Hz, exact and beyond-end frames, loop boundaries, full and lock-Z billboards, actor rotation and collapsed scales. Does not change the game animation cadence.')
(ROOT / 'docs/designs/frostbound-realms/classic-node-rates-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('PASS original source pose rates:', json.dumps(report))
