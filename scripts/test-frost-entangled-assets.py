"""Author: MiYu. Verify original mine source hashes, icon decoding and atomic asset regeneration."""
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
spec = importlib.util.spec_from_file_location('entangled_assets', ROOT / 'scripts/import-frost-entangled-assets.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
receipt = json.loads((SAMPLE / 'entangled-asset-sources.json').read_bytes())
assert module.sha((ROOT / receipt['generator']).read_bytes()) == receipt['generatorSha256']
assert module.sha((SAMPLE / 'classic-sources.json').read_bytes()) == receipt['classicReceiptSha256']
for record in receipt['sources']:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / record['path'].replace('\\', '/')).read_bytes()
    assert len(raw) == record['bytes'] and module.sha(raw) == record['sha256']
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and module.sha(raw) == record['sha256']
with tempfile.TemporaryDirectory(prefix='entangled-assets-test-') as directory:
    sandbox = pathlib.Path(directory)
    for path in ['entangled-asset-sources.json', 'classic-sources.json', 'building-scale-catalog.json', 'model-catalog.json'] + [r['path'] for r in receipt['files']]:
        target = sandbox / path; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(SAMPLE / path, target)
    command = [sys.executable, str(ROOT / receipt['generator']), '--icons', str(sandbox / 'no-exports'), '--output', str(sandbox)]
    result = subprocess.run(command, capture_output=True, text=True); assert result.returncode == 0, result.stderr
    for path in ['entangled-asset-sources.json'] + [r['path'] for r in receipt['files']]: assert (sandbox / path).read_bytes() == (SAMPLE / path).read_bytes(), path
    (sandbox / 'Assets/Art/classic-entangle-mine.png').write_bytes(b'artist modification\n')
    before = {p.relative_to(sandbox).as_posix(): p.read_bytes() for p in sandbox.rglob('*') if p.is_file()}
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode != 0 and 'Preserve modified Entangled Mine asset' in result.stderr
    assert before == {p.relative_to(sandbox).as_posix(): p.read_bytes() for p in sandbox.rglob('*') if p.is_file()}
print('PASS Entangled Mine source hashes, retained-source icon regeneration, byte-identical receipts and atomic artist-output protection')
