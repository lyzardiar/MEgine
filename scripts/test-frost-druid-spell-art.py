"""Author: MiYu. Verify exact original Druid effect source hashes and reproducible protected outputs."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
receipt=json.loads((SAMPLE/'druid-spell-art-sources.json').read_bytes())
for p,expected in receipt['generators'].items():assert sha((ROOT/p).read_bytes())==expected,p
for r in receipt['files']:
    raw=(SAMPLE/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
for r in receipt['sources']:
    raw=(SAMPLE/'SourceAssets/DruidSpells'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes']
with tempfile.TemporaryDirectory(prefix='test-druid-spell-art-') as temp:
    target=pathlib.Path(temp);command=[sys.executable,str(ROOT/'scripts/import-frost-druid-spell-art.py'),'--output',str(target)]
    r=subprocess.run(command,capture_output=True);assert r.returncode==0,r.stderr.decode('utf8','replace')
    for f in receipt['files']:assert (target/f['path']).read_bytes()==(SAMPLE/f['path']).read_bytes(),f['path']
    (target/'druid-spell-art.json').write_bytes(b'{}\n');r=subprocess.run(command,capture_output=True);assert r.returncode!=0 and b'Preserve modified Druid spell art' in r.stderr
print('PASS original Druid spell art hashes, byte-exact regeneration and edited-output protection:',len(receipt['files']),'outputs')
