"""Author: MiYu. Reproduce corpse rules offline and reject altered retained source/output bytes."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'samples/frostbound-realms'
GENERATOR = ROOT / 'scripts/import-frost-corpse-rules.py'
receipt = json.loads((SOURCE / 'corpse-rules-sources.json').read_bytes())
assert receipt['generatorSha256'] == hashlib.sha256(GENERATOR.read_bytes().replace(b'\r\n', b'\n')).hexdigest()
for record in receipt['outputs']:
    raw = (SOURCE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and hashlib.sha256(raw).hexdigest() == record['sha256'], record['path']
with tempfile.TemporaryDirectory(prefix='frost-corpse-') as folder:
    root = Path(folder); output = root / 'output'; retained = root / 'source'
    def run(source=SOURCE):
        return subprocess.run([sys.executable, str(GENERATOR), '--output', str(output), '--source-root', str(source)], cwd=ROOT, capture_output=True, encoding='utf-8')
    result = run(); assert result.returncode == 0, result.stderr
    assert (output / 'corpse-rules-sources.json').read_bytes() == (SOURCE / 'corpse-rules-sources.json').read_bytes()
    for record in receipt['outputs']: assert (output / record['path']).read_bytes() == (SOURCE / record['path']).read_bytes()
    target = output / 'corpse-rules.json'; target.write_bytes(target.read_bytes() + b' ')
    before = target.read_bytes(); result = run(); assert result.returncode != 0 and 'Modified output' in result.stderr
    assert target.read_bytes() == before
    shutil.rmtree(output); retained.mkdir(); shutil.copyfile(SOURCE / 'corpse-rules-sources.json', retained / 'corpse-rules-sources.json')
    for record in receipt['sources']:
        target = retained / record['output']; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(SOURCE / record['output'], target)
    target.write_bytes(target.read_bytes() + b' '); result = run(retained)
    assert result.returncode != 0 and 'Source fingerprint mismatch' in result.stderr
    assert not output.exists()
print('PASS corpse source receipts: all source/output/generator SHA256, archive-free byte-exact reproduction and atomic rejection of altered source/output bytes')
