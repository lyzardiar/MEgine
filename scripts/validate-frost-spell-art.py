"""Author: MiYu. Verify imported provenance and native spell geometry/effect loading."""
import argparse
import hashlib
import json
import math
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe'))
args = parser.parse_args()
sample = ROOT / 'samples/frostbound-realms'
manifest = json.loads((sample / 'effect-sources.json').read_text())
catalog = json.loads((sample / 'effect-catalog.json').read_text())
for record in manifest['files']:
    raw = (sample / record['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == record['sha256'] and len(raw) == record['bytes'], record['path']
assert hashlib.sha256((ROOT / 'scripts/import-frost-effects.py').read_bytes()).hexdigest() == manifest['importerSha256']
models = {name: art for name, art in catalog['effects'].items() if art.get('parts')}
geometry = ROOT / 'asset-library/warcraft-iii' / manifest['geometryCollection']
geometry_receipt = (geometry / 'asset-sources.json').read_bytes()
assert hashlib.sha256(geometry_receipt).hexdigest() == manifest['geometryReceiptSha256']
receipts = {}
for source in manifest['sources']:
    name = pathlib.PureWindowsPath(source['source']).stem
    pack = 'spell-effects-ready' if name in models else 'effects-ready'
    library = ROOT / 'asset-library/warcraft-iii' / pack
    if pack not in receipts:
        raw = (library / 'asset-sources.json').read_bytes()
        receipts[pack] = (hashlib.sha256(raw).hexdigest(), json.loads(raw))
    receipt_hash, receipt = receipts[pack]
    assert receipt_hash == source['conversionReceiptSha256'], source['source']
    path = library / 'SourceAssets' / source['collection'] / pathlib.PureWindowsPath(source['source']).as_posix()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == source['sourceSha256'], path
for record in receipts['spell-effects-ready'][1]['generatedFiles']:
    path = ROOT / 'asset-library/warcraft-iii/spell-effects-ready' / record['path']
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == record['sha256'] and len(raw) == record['bytes'], path
for relative, expected in receipts['spell-effects-ready'][1]['converter'].items():
    assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, relative
keys, holds = [], []
for name, art in models.items():
    keys.append(str((sample / art['effect']).resolve()))
    for part in art['parts']:
        for clip, animation in enumerate(art['animations']):
            end = math.ceil(animation['duration'] * 30)
            for frame in [0, end // 2, end, end + 3]:
                keys.append(str((sample / part['mesh']).resolve()) + f'#pose={clip}:{frame}@30')
            if not animation['loop']:
                holds.append((len(keys) - 2, len(keys) - 1))
run = subprocess.run([str(args.probe.resolve()), '--stdin'], input='\n'.join(keys)+'\n', capture_output=True, text=True, encoding='utf-8')
assert run.returncode == 0, f"Native load failed at {keys[len(run.stdout.splitlines())]}: {run.stderr}"
results = [json.loads(line) for line in run.stdout.splitlines()]
assert len(results) == len(keys)
for reference, row in zip(keys, results):
    assert row.get('effect', row.get('mesh')) == reference, reference
    if 'effect' in row:
        expected = next(a for a in models.values() if str((sample / a['effect']).resolve()) == row['effect'])
        assert row['clips'] == len(expected['animations']) and row['frames'] > 0
    else:
        assert row['vertices'] > 0 and all(math.isfinite(v) for k in ['min', 'max'] for v in row[k])
for a, b in holds:
    assert all(results[a][key] == results[b][key] for key in ['vertices', 'min', 'max']), keys[a]
report = dict(passed=True, verifiedFiles=len(manifest['files']), sourceModels=len(manifest['sources']), verifiedSpellConversionFiles=len(receipts['spell-effects-ready'][1]['generatedFiles']), models=len(models), geometryParts=sum(len(a['parts']) for a in models.values()), nativeLoads=len(keys), terminalHolds=len(holds), effectFrames=sum(r.get('frames', 0) for r in results), particles=sum(r.get('particles', 0) for r in results), ribbonQuads=sum(r.get('quads', 0) for r in results), lights=sum(r.get('lights', 0) for r in results), probeSha256=hashlib.sha256(args.probe.read_bytes()).hexdigest(), scope='Source and imported hashes, native geometry pose loading and non-looping endpoint clamping. Game View and TCP checks are recorded separately.')
(ROOT / 'docs/designs/frostbound-realms/spell-art-validation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('PASS native original spell asset verification:', json.dumps(report))
