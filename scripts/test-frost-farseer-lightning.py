"""Author: MiYu. Original Chain Lightning provenance, source fields and offline tamper rejection."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'


def main():
    sha = lambda raw: hashlib.sha256(raw).hexdigest()
    receipt = json.loads((SAMPLE / 'farseer-lightning-sources.json').read_bytes())
    for entry in receipt['outputs'] + [dict(r, path=r['output']) for r in receipt['sources']]:
        p = SAMPLE / entry['path']; raw = p.read_bytes(); assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], p
    for r in receipt['generators']: assert sha((ROOT / r['path']).read_bytes().replace(b'\r\n', b'\n')) == r['sha256']
    rows = json.loads((SAMPLE / 'farseer-lightning.json').read_bytes())['lightning']
    assert list(rows) == ['CLPB', 'CLSB']; assert [float(v['Width']) for v in rows.values()] == [50, 30]
    assert all(float(v['NoiseScale']) == .05 and float(v['TexCoordScale']) == .5 and float(v['Duration']) == 2 for v in rows.values())
    with tempfile.TemporaryDirectory(prefix='farseer-lightning-', dir=ROOT / 'tmp') as folder:
        work = Path(folder); command = [sys.executable, str(ROOT / 'scripts/import-frost-farseer-lightning.py'), '--source-root', str(SAMPLE), '--output', str(work), '--game', str(work / 'absent-game')]
        run = subprocess.run(command, capture_output=True); assert run.returncode == 0, run.stderr
        for r in receipt['outputs']: assert (work / r['path']).read_bytes() == (SAMPLE / r['path']).read_bytes(), r['path']
        target = work / rows['CLPB']['texture']; target.write_bytes(target.read_bytes() + b'tampered')
        run = subprocess.run(command, capture_output=True); assert run.returncode != 0 and b'Modified lightning output' in run.stderr
    print('PASS original CLPB/CLSB widths, UV/noise/lifetime, signed sources/outputs, byte-identical offline reconstruction and tampered-output rejection')


if __name__ == '__main__': main()
