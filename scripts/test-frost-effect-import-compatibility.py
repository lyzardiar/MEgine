"""Author: MiYu. Reproduce existing hero effects before refreshing the shared importer provenance."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
SHARED = 'scripts/import-frost-blademaster-effects.py'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--refresh-receipts', action='store_true'); args = parser.parse_args()
    packs = [('blademaster-effects-sources.json', SHARED), ('farseer-effects-sources.json', 'scripts/import-frost-farseer-effects.py'), ('tauren-effects-sources.json', 'scripts/import-frost-tauren-effects.py')]
    updates = {}; results = []
    with tempfile.TemporaryDirectory(prefix='effect-import-compatibility-', dir=ROOT / 'tmp') as folder:
        for filename, generator in packs:
            before = json.loads((SAMPLE / filename).read_bytes()); expected = copy.deepcopy(before)
            for entry in expected['generators']:
                actual = sha((ROOT / entry['path']).read_bytes().replace(b'\r\n', b'\n'))
                if args.refresh_receipts and entry['path'] == SHARED: entry['sha256'] = actual
                else: assert actual == entry['sha256'], entry['path']
            output = Path(folder) / filename.removesuffix('.json')
            run = subprocess.run([sys.executable, str(ROOT / generator), '--source-root', str(SAMPLE), '--output', str(output), '--game', str(Path(folder) / 'absent-game')], capture_output=True)
            assert run.returncode == 0, run.stderr.decode('utf-8', errors='replace')
            for entry in before['outputs']:
                old = (SAMPLE / entry['path']).read_bytes(); assert len(old) == entry['bytes'] and sha(old) == entry['sha256'], entry['path']
                assert (output / entry['path']).read_bytes() == old, entry['path']
            raw = (output / filename).read_bytes(); assert json.loads(raw) == expected, filename; updates[filename] = raw
            results.append(dict(receipt=filename, outputs=len(before['outputs']), byteIdentical=True))
            print('PASS shared effect importer compatibility:', filename, len(before['outputs']), 'unchanged outputs', flush=True)
    if args.refresh_receipts:
        for filename, raw in updates.items(): (SAMPLE / filename).write_bytes(raw)
    report = dict(author='MiYu', passed=True, importerSha256=sha((ROOT / SHARED).read_bytes().replace(b'\r\n', b'\n')), offlineByteIdentical=True, packs=results, scope='Existing source assets reproduced byte-for-byte; gameplay and GPU rendering are separate checks.')
    (ROOT / 'docs/designs/frostbound-realms/shadowhunter-import-compatibility.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')


if __name__ == '__main__': main()
