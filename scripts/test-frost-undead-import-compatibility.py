"""Author: MiYu. Verify existing hero assets before updating shared importer provenance."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
TOOLS = ['scripts/import-frost-orc-heroes.py', 'scripts/import-frost-orc-hero-art.py']
sha = lambda raw: hashlib.sha256(raw).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--refresh-receipts', action='store_true'); args = parser.parse_args()
    receipts = {}; outputs = {}
    for path in SAMPLE.glob('*sources.json'):
        data = json.loads(path.read_bytes())
        if not isinstance(data, dict) or not isinstance(data.get('generators'), list): continue
        relevant = [r for r in data['generators'] if r['path'] in TOOLS]
        if not relevant: continue
        for record in data.get('outputs', []):
            raw = (SAMPLE / record['path']).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
        receipts[path] = data; outputs[path.name] = len(data.get('outputs', []))
    reproduced = {}
    with tempfile.TemporaryDirectory(prefix='undead-shared-compat-', dir=ROOT / 'tmp') as temp:
        for script, receipt in [('import-frost-orc-heroes.py', 'orc-hero-sources.json'), ('import-frost-orc-hero-art.py', 'orc-hero-art-sources.json')]:
            target = pathlib.Path(temp) / script; command = [sys.executable, str(ROOT / 'scripts' / script), '--source-root', str(SAMPLE), '--output', str(target), '--game', str(pathlib.Path(temp) / 'missing-game')]
            run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stderr
            before = receipts[SAMPLE / receipt]; after = json.loads((target / receipt).read_bytes())
            for record in before['outputs']: assert (target / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
            assert before['outputs'] == after['outputs']
            reproduced[receipt] = len(before['outputs'])
    changes = []
    for path, data in receipts.items():
        encoded = path.read_bytes()
        for record in data['generators']:
            if record['path'] not in TOOLS: continue
            raw = (ROOT / record['path']).read_bytes()
            if data.get('generatorHashMode') == 'lf-text': raw = raw.replace(b'\r\n', b'\n')
            current = sha(raw)
            if current != record['sha256']:
                assert encoded.count(record['sha256'].encode()) == 1
                encoded = encoded.replace(record['sha256'].encode(), current.encode()); changes.append(dict(receipt=path.name, generator=record['path'], before=record['sha256'], after=current)); record['sha256'] = current
        if args.refresh_receipts: path.write_bytes(encoded)
    report = dict(author='MiYu', passed=True, verifiedSignedOutputs=outputs, reproducedExistingPacks=reproduced, provenanceChanges=changes, refreshed=args.refresh_receipts, scope='All referenced signed outputs verified unchanged; existing four Orc hero rules and art packs independently reproduced byte-for-byte. Other consumers use unchanged helper functions or the verified default art conversion; their packs were not independently regenerated in this check.')
    (ROOT / 'docs/designs/frostbound-realms/undead-import-compatibility.json').write_bytes((json.dumps(report, indent=2) + '\n').encode()); print(json.dumps(report))

if __name__ == '__main__': main()
