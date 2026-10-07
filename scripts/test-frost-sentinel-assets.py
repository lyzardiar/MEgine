"""Author: MiYu. Verify original Owl signatures, source geometry, billboards, particles and protected reproducible import."""
import hashlib
import json
import pathlib
import struct
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
load = lambda path: json.loads(path.read_bytes())
receipt = load(SAMPLE / 'sentinel-sources.json')
assert sha((ROOT / receipt['generator']).read_bytes()) == receipt['generatorSha256']
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['sources']:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / pathlib.PureWindowsPath(record['path']).as_posix()).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
assert len(receipt['sources']) == 6
original = (SAMPLE / 'SourceAssets/WarcraftIII/Units/NightElf/Owl/Owl.mdx').read_bytes()
assert original[:4] == b'MDLX' and sha(original) == 'cfef44526635c98962dd9d1c72d2ef0bc1d6b2c267252ec49bb87b748ac27999'
for converter in ['nodeConverter', 'effectConverter']:
    for name, expected in receipt[converter].items(): assert sha((ROOT / name).read_bytes()) == expected, name
art = load(SAMPLE / 'sentinel-catalog.json'); model = art['model']
assert model['sourcePack'] == 'remaining-ready' and len(model['parts']) == 3 and art['particles'] == 2
assert model['bounds']['min'][1] > 0 and model['classicYaw'] == 0 and 'worldHeight' not in model
assert [(a['name'], a['duration'], a['loop']) for a in model['animations']] == [('Walk', 1.334, True), ('Stand 2', 1.333, True), ('Stand 3', 2.667, True), ('Birth', .666, False), ('Death', .5, False)]
def glb(raw):
    assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw))
    size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+size]), raw[28+size:]
for i, part in enumerate(model['parts']):
    doc, binary = glb((SAMPLE / part['mesh']).read_bytes())
    source_doc, source_binary = glb((ROOT / 'asset-library/warcraft-iii/remaining-ready' / part['mesh']).read_bytes())
    assert binary == source_binary, 'Preserve original converted vertices, UVs, skin and animation samples'
    assert len(doc['extras']['mengineMdxAnimation']['sequences']) == 5
    if i == 2: assert any(n.get('extras', {}).get('mengineBillboard', {}).get('flags') == 8 for n in doc['nodes'])
    assert len(part['states']) == 5
effect = load(SAMPLE / art['effect'])
assert len(effect['sourceModel']['particleEmitters']) == 2 and len(effect['clips']) == 5
assert any(frame['particles'] for c in effect['clips'] for frame in c['frames'])
probe = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe')
with tempfile.TemporaryDirectory(prefix='sentinel-asset-test-', dir=ROOT / 'tmp') as scratch:
    output = pathlib.Path(scratch)
    command = [sys.executable, str(ROOT / 'scripts/import-frost-sentinel.py'), '--pose-probe', str(probe), '--output', str(output)]
    run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf8')
    assert run.returncode == 0, run.stdout + run.stderr
    assert (output / 'sentinel-sources.json').read_bytes() == (SAMPLE / 'sentinel-sources.json').read_bytes(), 'Stable conversion receipt'
    for record in receipt['files']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
    path = output / model['parts'][0]['mesh']; damaged = path.read_bytes() + b'edited'; path.write_bytes(damaged)
    run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf8')
    assert run.returncode != 0 and 'Preserve modified Sentinel asset' in run.stderr
    assert path.read_bytes() == damaged
print('PASS original Owl assets:', len(receipt['sources']), 'signed originals /', len(receipt['files']), 'outputs; binary-preserving geometry, billboard, exact clip metadata, two sampled emitters, byte-exact regeneration and edited-output protection')
