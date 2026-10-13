"""Author: MiYu. Check signed MOBA assets, reproducibility, material metadata and edit protection."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-moba-art')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pose-probe', required=True)
parser.add_argument('--metadata-reader', required=True)
args = parser.parse_args(); receipt = json.loads((base.SAMPLE / 'moba-model-sources.json').read_bytes())
for r in receipt['files']:
    raw = (base.SAMPLE / r['path']).read_bytes(); assert len(raw) == r['bytes'] and base.sha(raw) == r['sha256'], r['path']
    if r['path'].startswith('Assets/') and r['path'].endswith(('.png', '.glb', '.mmat')): assert any(f['path'] == r['path'] + '.meta' for f in receipt['files']), r['path']
for path, expected in receipt['generators'].items(): assert base.sha((base.ROOT / path).read_bytes().replace(b'\r\n', b'\n')) == expected, path
with tempfile.TemporaryDirectory(prefix='verify-frost-moba-') as temp:
    target = pathlib.Path(temp)
    command = [sys.executable, str(base.ROOT / 'scripts/import-frost-moba-art.py'), '--output', str(target), '--pose-probe', args.pose_probe, '--metadata-reader', args.metadata_reader]
    subprocess.run(command, check=True)
    for r in receipt['files']: assert (target / r['path']).read_bytes() == (base.SAMPLE / r['path']).read_bytes(), r['path']
    model = target / 'moba-models.json'; model.write_text('{}\n', encoding='utf-8')
    before = {p.relative_to(target).as_posix(): base.sha(p.read_bytes()) for p in target.rglob('*') if p.is_file()}
    run = subprocess.run(command, capture_output=True); assert run.returncode != 0 and b'Preserve modified MOBA asset' in run.stderr
    after = {p.relative_to(target).as_posix(): base.sha(p.read_bytes()) for p in target.rglob('*') if p.is_file()}; assert before == after, 'Refused import must not partially overwrite output'
print('PASS MOBA art:', len(receipt['files']), 'signed outputs, all material metadata, exact reproduction and transactional modified-output refusal')
