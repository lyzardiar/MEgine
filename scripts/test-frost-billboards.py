"""Author: MiYu. Reproduce camera-facing geometry and refuse modified generated assets."""
import argparse
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sampler', type=pathlib.Path, required=True)
args = parser.parse_args()
library = ROOT / 'asset-library/warcraft-iii/billboard-ready'
manifest = json.loads((library / 'asset-sources.json').read_bytes())
with tempfile.TemporaryDirectory(prefix='billboard-reproduction-', dir=ROOT / 'tmp') as temp:
    output = pathlib.Path(temp)
    command = ['python', str(ROOT / 'scripts/convert-frost-billboards.py'), '--sampler', str(args.sampler.resolve()), '--output', str(output)]
    run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stderr
    paths = [r['path'] for r in manifest['generatedFiles']] + ['asset-sources.json']
    for path in paths: assert (output / path).read_bytes() == (library / path).read_bytes(), path
    changed = next(a['path'] for a in manifest['annotations'] if a['nodes'])
    target = output / changed; target.write_bytes(target.read_bytes() + b'\n')
    before = {p: (output / p).read_bytes() for p in paths}
    run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
    assert run.returncode != 0 and 'Preserve modified billboard output' in run.stderr, run.stdout + run.stderr
    assert all((output / p).read_bytes() == raw for p, raw in before.items())
report = dict(passed=True, reproducedFiles=len(paths), modifiedOutputsProtected=True, refusalLeavesOutputsUnchanged=True)
(ROOT / 'docs/designs/frostbound-realms/billboard-reproduction.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print('PASS billboard reproduction:', json.dumps(report))
