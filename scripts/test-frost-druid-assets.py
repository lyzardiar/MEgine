"""Author: MiYu. Verify original Druid source signatures, regeneration and protected output writes."""
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha = base.ROOT, base.SAMPLE, base.sha
receipts = [json.loads((SAMPLE / name).read_bytes()) for name in ['druid-sources.json', 'druid-model-sources.json']]
for receipt in receipts:
    for f in receipt['files']:
        raw = (SAMPLE / f['path']).read_bytes(); assert len(raw) == f['bytes'] and sha(raw) == f['sha256'], f['path']
    for f in receipt['sources']:
        raw = (SAMPLE / 'SourceAssets/WarcraftIII' / pathlib.PureWindowsPath(f['path'])).read_bytes(); assert len(raw) == f['bytes'] and sha(raw) == f['sha256'], f['path']
    for p, expected in receipt.get('generators', {receipt.get('generator'): receipt.get('generatorSha256')}).items():
        if p: assert sha((ROOT / p).read_bytes()) == expected, p
with tempfile.TemporaryDirectory(prefix='verify-frost-druids-') as temp:
    target = pathlib.Path(temp)
    subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-druids.py'), '--output', str(target)], check=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-druid-models.py'), '--output', str(target), '--pose-probe', 'D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'], check=True)
    for receipt in receipts:
        for f in receipt['files']: assert (target / f['path']).read_bytes() == (SAMPLE / f['path']).read_bytes(), f['path']
    (target / 'druid-rules.json').write_text('{}\n', encoding='utf8')
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-druids.py'), '--output', str(target)], capture_output=True)
    assert r.returncode != 0 and b'Preserve modified Druid output' in r.stderr
print('PASS original Druid asset signatures, byte-exact regeneration and edited-output protection:', sum(len(r['files']) for r in receipts), 'signed outputs')
