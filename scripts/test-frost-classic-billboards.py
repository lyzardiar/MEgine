"""Author: MiYu. Reproduce original node animation imports and protect modified generated files."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
args = parser.parse_args()
sample = ROOT / 'samples/frostbound-realms'
imported = json.loads((sample / 'classic-sources.json').read_bytes())
library=ROOT/imported.get('billboardPath', 'asset-library/warcraft-iii/'+imported['billboardCollection'])
manifest = json.loads((library / 'asset-sources.json').read_bytes())
attachment_nodes=manifest['generator']=='scripts/convert-frost-classic-attachments.py'
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def run(command): return subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
with tempfile.TemporaryDirectory(prefix='classic-node-reproduction-', dir=ROOT / 'tmp') as directory:
    output = pathlib.Path(directory) / library.name
    command = [sys.executable, str(ROOT / ('scripts/convert-frost-classic-attachments.py' if attachment_nodes else 'scripts/convert-frost-classic-billboards.py')), '--metadata-reader', str(args.metadata_reader.resolve()), '--output', str(output)]
    if attachment_nodes: command += ['--base', str(library.parent / manifest['baseCollection'])]
    result = run(command); assert result.returncode == 0, result.stderr
    paths = [r['path'] for r in manifest['generatedFiles']] + ['asset-sources.json']
    for path in paths: assert (output / path).read_bytes() == (library / path).read_bytes(), path
    changed = manifest['annotations'][0]['output']; target = output / changed
    target.write_bytes(target.read_bytes() + b'\n')
    before = {path: digest(output / path) for path in paths}
    result = run(command); assert result.returncode != 0 and ('Preserve modified attachment output' if attachment_nodes else 'Preserve modified node billboard output') in result.stderr, result.stdout + result.stderr
    assert all(digest(output / path) == expected for path, expected in before.items()), 'Refusal changed generated files'
    target.write_bytes((library / changed).read_bytes())
    isolated = pathlib.Path(directory) / 'sample'; isolated.mkdir()
    (isolated / 'model-catalog.json').write_bytes((sample / 'model-catalog.json').read_bytes())
    command = [sys.executable, str(ROOT / 'scripts/import-frost-classic.py'), '--pose-probe', str(args.pose_probe.resolve()), '--billboard-library', str(output), '--output', str(isolated)]
    result = run(command); assert result.returncode == 0, result.stderr
    imported_paths = [r['path'] for r in imported['files']] + ['model-catalog.json', 'classic-sources.json', 'Assets/Licenses/warcraft-classic-sources.json', 'Assets/Licenses/warcraft-classic.txt']
    for path in imported_paths:
        actual = (isolated / path).read_bytes(); expected = (sample / path).read_bytes()
        if path.endswith('classic-sources.json'):
            a, b = json.loads(actual), json.loads(expected)
            assert a.pop('billboardPath') == output.relative_to(ROOT).as_posix()
            b.pop('billboardPath')
            assert a == b, path
            continue
        if actual != expected and path.endswith('.json'):
            a, b = json.loads(actual), json.loads(expected)
            print('Import differs:', path, {k: [str(a.get(k))[:300], str(b.get(k))[:300]] for k in set(a) | set(b) if a.get(k) != b.get(k)}, flush=True)
        assert actual == expected, path
    changed = manifest['annotations'][0]['path']; target = isolated / changed
    target.write_bytes(target.read_bytes() + b'\n')
    before = {path: digest(isolated / path) for path in imported_paths}
    result = run(command); assert result.returncode != 0 and 'Preserve modified classic asset' in result.stderr, result.stdout + result.stderr
    assert all(digest(isolated / path) == expected for path, expected in before.items()), 'Refusal changed imported files'
report = dict(passed=True, reproducedLibraryFiles=len(paths), reproducedImportedFiles=len(imported_paths), modifiedLibraryProtected=True, modifiedImportProtected=True, refusalsLeaveOutputsUnchanged=True)
(ROOT / 'docs/designs/frostbound-realms' / ('classic-attachment-import-reproduction.json' if attachment_nodes else 'classic-billboard-reproduction.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('PASS original node animation reproduction:', json.dumps(report))
