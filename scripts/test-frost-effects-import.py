"""Author: MiYu. Independent effect import reproduction and modified-output protection."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sampler', type=pathlib.Path, required=True)
args = parser.parse_args()
sample = ROOT / 'samples/frostbound-realms'
manifest = json.loads((sample / 'effect-sources.json').read_text())
with tempfile.TemporaryDirectory(prefix='effect-import-', dir=ROOT / 'tmp') as directory:
    output = pathlib.Path(directory)
    command = ['python', str(ROOT / 'scripts/import-frost-effects.py'), '--sampler', str(args.sampler.resolve()), '--output', str(output)]
    run = subprocess.run(command, capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    for entry in manifest['files']:
        raw = (output / entry['path']).read_bytes()
        assert raw == (sample / entry['path']).read_bytes(), entry['path']
        assert hashlib.sha256(raw).hexdigest() == entry['sha256'], entry['path']
    assert (output / 'effect-sources.json').read_bytes() == (sample / 'effect-sources.json').read_bytes()
    modified = next(entry['path'] for entry in manifest['files'] if entry['path'].endswith('.mfx'))
    target = output / modified
    target.write_bytes(target.read_bytes() + b'\n')
    before = {p: (output / p).read_bytes() for p in [*map(lambda e: e['path'], manifest['files']), 'effect-sources.json']}
    run = subprocess.run(command, capture_output=True, text=True)
    assert run.returncode != 0 and 'Preserve modified effect output' in run.stderr, run.stdout + run.stderr
    assert all((output / p).read_bytes() == raw for p, raw in before.items()), 'Refused generation cannot change any output'
report = dict(passed=True, reproducedFiles=len(manifest['files']) + 1, protectedModifiedOutputs=True, effects=len(manifest['sources']), attachmentModels=manifest['attachmentModels'])
(ROOT / 'docs/designs/frostbound-realms/status-effects-reproduction.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('PASS effect imports:', json.dumps(report))
