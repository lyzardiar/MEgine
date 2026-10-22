"""Author: MiYu. Rebuild Cloud weapon rules from pinned originals and reject changed inputs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
OUT = ROOT / 'tmp/docs-artifacts/frost-human-aviary/cloud-weapons'
OUT.mkdir(parents=True, exist_ok=True)
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE / 'cloud-weapon-sources.json').read_bytes())
generator = ROOT / receipt['generator']
assert sha(generator.read_bytes().replace(b'\r\n', b'\n')) == receipt['generatorSha256']
source = SAMPLE / receipt['source']['path']
assert sha(source.read_bytes()) == receipt['source']['sha256']
assert receipt['reaCommit'] == '3b79af28e80785afce9f5998d8f03289402a1847'
assert receipt['originalBattleVerified'] is False
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
with tempfile.TemporaryDirectory(dir=OUT) as directory:
    output = Path(directory) / 'rebuilt'
    subprocess.run([sys.executable, str(generator), '--output', str(output)], check=True, cwd=ROOT)
    for name in ['cloud-weapon-rules.json', 'cloud-weapon-sources.json']:
        assert (output / name).read_bytes() == (SAMPLE / name).read_bytes(), name
    for option in ['--source', '--binary']:
        changed = Path(directory) / 'changed-source'
        changed.write_bytes(b'changed input')
        result = subprocess.run([sys.executable, str(generator), option, str(changed), '--output', str(output)], capture_output=True, text=True, cwd=ROOT)
        assert result.returncode != 0 and 'source changed' in result.stderr, result.stderr
        for name in ['cloud-weapon-rules.json', 'cloud-weapon-sources.json']:
            assert (output / name).read_bytes() == (SAMPLE / name).read_bytes()
print('PASS Cloud weapon source: pinned inputs, generator/output hashes, byte-exact rebuild and tamper rejection')
