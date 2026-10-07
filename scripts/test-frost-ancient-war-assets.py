"""Author: MiYu. Verify signed Ancient of War sources and reproduce all generated assets without an installation."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE / 'ancient-war-sources.json').read_bytes())
assert sha((ROOT / receipt['generator']).read_bytes()) == receipt['generatorSha256']
for record in receipt['sources']:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
cache = ROOT / 'tmp/ancient-war-reproduction'
cache.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='verify-', dir=cache) as name:
    output = pathlib.Path(name).resolve()
    assert output.parent == cache.resolve()
    subprocess.run([sys.executable, str(ROOT / receipt['generator']), '--output', str(output), '--game', str(output / 'unavailable-game')], cwd=ROOT, check=True, capture_output=True)
    for record in receipt['files']:
        assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
    assert json.loads((output / 'ancient-war-sources.json').read_bytes()) == receipt
report = dict(author='MiYu', passed=True, sources=len(receipt['sources']), signedFiles=len(receipt['files']), regenerationWithoutInstallation=True, byteExact=True)
(ROOT / 'docs/designs/frostbound-realms/ancient-war-art-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print('PASS Ancient of War assets:', report)
