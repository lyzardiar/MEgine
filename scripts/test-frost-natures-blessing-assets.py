"""Author: MiYu. Verify source signatures, repeatable Renb import and atomic protection of edited assets."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
receipt = json.loads((SAMPLE / 'natures-blessing-sources.json').read_bytes())
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha((ROOT / receipt['generator']).read_bytes()) == receipt['generatorSha256']
for r in receipt['files']:
    raw = (SAMPLE / r['path']).read_bytes()
    assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
with tempfile.TemporaryDirectory(prefix='frost-renb-') as folder:
    output = pathlib.Path(folder)
    args = [sys.executable, str(ROOT / receipt['generator']), '--output', str(output), '--game', str(output / 'not-installed')]
    result = subprocess.run(args, capture_output=True)
    assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
    for r in receipt['files']: assert (output / r['path']).read_bytes() == (SAMPLE / r['path']).read_bytes(), r['path']
    assert json.loads((output / 'natures-blessing-sources.json').read_bytes()) == receipt
    icon = output / 'Assets/Art/classic-natures-blessing.png'; icon.write_bytes(icon.read_bytes() + b'artist edit')
    before = {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(args, capture_output=True)
    assert result.returncode != 0 and b'Preserve modified' in result.stderr
    assert before == {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
report = dict(author='MiYu', passed=True, signedFiles=len(receipt['files']), originalSourceFiles=len(receipt['sources']), reproducibleWithoutGameInstallation=True, preservesModifiedOutputAtomically=True)
(ROOT / 'docs/designs/frostbound-realms/natures-blessing-art-validation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('PASS Renb assets:', report['signedFiles'], 'signatures, original enabled/disabled icons, exact reproduction without game and atomic edit protection')
