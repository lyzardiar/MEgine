"""Author: MiYu. Reproduce original signed Entangle rules and protect modified outputs atomically."""
import hashlib
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
receipt = json.loads((SAMPLE / 'entangled-rule-sources.json').read_bytes())
sha = lambda raw: hashlib.sha256(raw).hexdigest()
assert sha((ROOT / receipt['generator']).read_bytes()) == receipt['generatorSha256']
for record in [*receipt['sources'], dict(receipt['sourceUI'], path=receipt['sourceUI']['path'].removeprefix('SourceAssets/WarcraftIII/'))]:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / pathlib.PureWindowsPath(record['path']).as_posix()).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
with tempfile.TemporaryDirectory(prefix='entangle-rule-test-', dir=ROOT / 'tmp') as temporary:
    output = pathlib.Path(temporary)
    command = ['python', str(ROOT / receipt['generator']), '--output', str(output)]
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert result.returncode == 0, result.stderr
    for record in receipt['files']:
        raw = (output / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and raw == (SAMPLE / record['path']).read_bytes()
    assert (output / 'entangled-rule-sources.json').read_bytes() == (SAMPLE / 'entangled-rule-sources.json').read_bytes()
    path = output / 'entangled-rules.json'; path.write_bytes(path.read_bytes() + b' ')
    before = {p: p.read_bytes() for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert result.returncode != 0 and 'Preserve modified Entangle rules' in result.stderr
    assert all(p.read_bytes() == raw for p, raw in before.items())
icon = json.loads((SAMPLE / 'entangled-wisp-icon-sources.json').read_bytes())
assert sha((ROOT / icon['generator']).read_bytes()) == icon['generatorSha256']
assert sha((ROOT / 'scripts/import-frost-entangled-assets.py').read_bytes()) == icon['decoderSha256']
with tempfile.TemporaryDirectory(prefix='entangle-icon-test-', dir=ROOT / 'tmp') as temporary:
    output = pathlib.Path(temporary); command = ['python', str(ROOT / icon['generator']), '--output', str(output)]
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert result.returncode == 0, result.stderr
    for record in icon['files']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes() and sha((output / record['path']).read_bytes()) == record['sha256']
    assert (output / 'entangled-wisp-icon-sources.json').read_bytes() == (SAMPLE / 'entangled-wisp-icon-sources.json').read_bytes()
    target = output / 'Assets/Art/classic-wisp-icon.png'; target.write_bytes(target.read_bytes() + b' ')
    before = {p: p.read_bytes() for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert result.returncode != 0 and 'Preserve modified Wisp icon' in result.stderr
    assert all(p.read_bytes() == raw for p, raw in before.items())
print('PASS Entangle rules and original Wisp icon hashes, byte-identical regeneration, modified-output refusal and atomic preservation')
