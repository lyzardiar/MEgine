"""Author: MiYu. Verify original Web model bindings, native poses and offline regeneration."""
import hashlib
import importlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
RECEIPT = 'crypt-web-model-sources.json'
IMPORTER = ROOT / 'scripts/import-frost-crypt-web-models.py'
PROBE = Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe')
sha = lambda raw: hashlib.sha256(raw).hexdigest()
sys.path.insert(0, str(ROOT / 'scripts'))
read_glb = importlib.import_module('convert-frost-classic-billboards').read_glb
receipt = json.loads((SAMPLE / RECEIPT).read_bytes())
models = json.loads((SAMPLE / 'crypt-web-models.json').read_bytes())
paths = [r['path'] for r in receipt['files']] + [RECEIPT]
checks = []
ARTIFACTS = ROOT / 'tmp/docs-artifacts/frost-crypt-web'
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def run(source, output):
    return subprocess.run([sys.executable, str(IMPORTER), '--source-sample', str(source), '--output', str(output)], cwd=ROOT, capture_output=True)


for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['sources']:
    raw = (SAMPLE / record['retained']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    assert raw == (ROOT / 'asset-library/warcraft-iii' / record['library']).read_bytes()
for record in receipt['generators']:
    assert sha((ROOT / record['path']).read_bytes().replace(b'\r\n', b'\n')) == record['sha256'], record['path']
assert sha((SAMPLE / receipt['sourceReceipt']['path']).read_bytes()) == receipt['sourceReceipt']['sha256']
for relative in paths:
    parent = SAMPLE
    for part in Path(relative).parts:
        assert part in {p.name for p in parent.iterdir()}, 'Actual path case mismatch: ' + relative
        parent /= part
checks.append('47 outputs, seven originals, source receipt and generators match fingerprints; actual directory case matches paths')

library = ROOT / 'asset-library/warcraft-iii/remaining-ready'
source_catalog = {m['source'].replace('\\', '/').lower(): m for m in json.loads((library / 'Assets/WarcraftIII/model-catalog.json').read_bytes())['models']}
guids = [json.loads((SAMPLE / p).read_bytes())['guid'] for p in paths if p.endswith('.meta')]
assert len(guids) == len(set(guids)), 'Duplicate generated GUID'
for model in models.values():
    source_model = source_catalog[model['sourceModel'].replace('\\', '/').lower()]
    assert [a['name'] for a in model['animations']] == [c['name'] for c in source_model['clips']]
    for part in model['parts']:
        original = next(p for p in source_model['parts'] if p['geoset'] == part['geoset'])
        doc, binary = read_glb((SAMPLE / part['animatedMesh']).read_bytes())
        assert binary == read_glb((library / original['animatedMesh']).read_bytes())[1], 'Source geometry/animation binary changed'
        assert doc['extras']['mengineMdxAnimation']['sequences'] and doc['extras']['mengineMdxAnimation']['nodes']
        assert len(part['states']) == len(model['animations'])
checks.append('source clip names, unchanged GLB binary, original MDX node tracks, material state tracks and unique GUIDs')


def references(value):
    if isinstance(value, dict):
        for child in value.values(): references(child)
    elif isinstance(value, list):
        for child in value: references(child)
    elif isinstance(value, str) and value.startswith('Assets/'):
        assert (SAMPLE / value).is_file(), 'Missing asset reference: ' + value


references(models)
for path in paths:
    if path.endswith(('.mmat', '.mfx')): references(json.loads((SAMPLE / path).read_bytes()))
for key, model in models.items():
    effect = json.loads((SAMPLE / model['effect']).read_bytes())
    assert effect['fps'] == 12 and len(effect['sourceModel']['particleEmitters']) == 1
    assert [c['name'] for c in effect['clips']] == [a['name'] for a in model['animations']]
    assert all(Path(m['texture']).suffix == '.png' for m in effect['materials'])
    assert sum(len(f['particles']) + len(f['quads']) for c in effect['clips'] for f in c['frames']) > 0
assert len(models['ClassicCryptWebAirTarget']['animations']) == 9
checks.append('complete material/texture/effect references, three emitter simulations and all nine air-target size sequences')

refs = []
for key, model in models.items():
    for clip, animation in enumerate(model['animations']):
        for frame in {0, animation['frames']//2}:
            for part in model['parts']: refs.append(str(SAMPLE / part['animatedMesh']) + f'#pose={clip}:{frame}')
result = subprocess.run([str(PROBE), '--stdin'], input=('\n'.join(refs) + '\n').encode(), capture_output=True)
assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
bounds = [json.loads(line) for line in result.stdout.splitlines()]
assert len(bounds) == len(refs)
for bound in bounds:
    assert all(math.isfinite(v) for v in [*bound['min'], *bound['max']]) and all(a <= b for a, b in zip(bound['min'], bound['max']))
checks.append(f'native gltf_bounds parsed {len(refs)} poses across every source animation')

with tempfile.TemporaryDirectory(prefix='model-check-', dir=ARTIFACTS) as temp:
    temp = Path(temp); replay = temp / 'replay'
    result = run(SAMPLE, replay)
    assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
    assert all((SAMPLE / p).read_bytes() == (replay / p).read_bytes() for p in paths), 'Offline output differs'
    checks.append('offline retained-original/source-library rebuild equals all 48 delivered files byte-for-byte')
    edited = replay / models['ClassicCryptWebMissile']['effect']; edited.write_bytes(edited.read_bytes() + b'edited')
    before = {p: (replay / p).read_bytes() for p in paths}
    result = run(SAMPLE, replay)
    assert result.returncode != 0 and b'Preserve edited output' in result.stderr
    assert all((replay / p).read_bytes() == raw for p, raw in before.items())
    checks.append('edited generated output rejects regeneration without changing any output')
    source = temp / 'source'; source.mkdir()
    for path in ['crypt-web-sources.json', 'crypt-web.json']: shutil.copy2(SAMPLE / path, source / path)
    for record in receipt['sources']:
        target = source / record['retained']; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(SAMPLE / record['retained'], target)
    damaged = source / receipt['sources'][0]['retained']; damaged.write_bytes(damaged.read_bytes() + b'damaged')
    output = temp / 'rejected'
    result = run(source, output)
    assert result.returncode != 0 and b'Original/library mismatch' in result.stderr and not output.exists()
    checks.append('changed retained source rejects conversion before writing output')

report = dict(passed=len(checks), failed=0, checks=checks, nativePoses=len(refs), outputs=len(paths), models=list(models), statistics=receipt['statistics'])
(ARTIFACTS / 'model-import-check.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
