"""Author: MiYu. Verify Arcane Tower provenance and retained-source reproduction."""
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT/'samples/frostbound-realms'
OUT = ROOT/'tmp/docs-artifacts/frost-arcane-tower'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE/'arcane-tower-sources.json').read_bytes())
for r in receipt['files'] + receipt['sharedAssets'] + [receipt['sharedCatalog']]:
    raw = (SAMPLE/r['path']).read_bytes()
    assert sha(raw) == r['sha256'], r['path']
for r in receipt['sources']:
    raw = (SAMPLE/'SourceAssets/ArcaneTower'/r['path']).read_bytes()
    assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
for r in receipt['generators']:
    assert sha((ROOT/r['path']).read_bytes()) == r['sha256'], r['path']
effects = json.loads((SAMPLE/'arcane-tower-effects-sources.json').read_bytes())
for r in effects['outputs']:
    assert sha((SAMPLE/r['path']).read_bytes()) == r['sha256'], r['path']
for r in effects['sources']:
    assert sha((SAMPLE/r['output']).read_bytes()) == r['sha256'], r['output']
rules = json.loads((SAMPLE/'arcane-tower.json').read_bytes())
assert [rules['weapon'][k] for k in ['damage','bonus','dice','sides','range','cooldown','damagePoint','missileSpeed','missileArc']] == [9,7,1,3,8,1,.3,15,.15]
assert [rules['abilities']['Afbt'][k] for k in ['manaBurn','heroManaBurn','summonedDamage']] == [24,12,20]
assert [rules['abilities']['AHta'][k] for k in ['cooldown','duration','radius','requires']] == [180,15,9,'Rhse']
assert receipt['reaUpstream'] == 'https://github.com/morluto/rea'
print('PASS Arcane original rules, source/output/shared hashes and effect artifacts')
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='reproduce-',dir=OUT) as directory:
    output = Path(directory)
    command = [sys.executable,str(ROOT/'scripts/import-frost-arcane-tower.py'),'--game',str(output/'no-game'),'--output',str(output),'--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe']
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode == 0, result.stdout+result.stderr
    for r in receipt['files']:
        assert (output/r['path']).read_bytes() == (SAMPLE/r['path']).read_bytes(), r['path']
    assert (output/'arcane-tower-sources.json').read_bytes() == (SAMPLE/'arcane-tower-sources.json').read_bytes()
    target = output/'arcane-tower.json'; target.write_bytes(target.read_bytes()+b' ')
    before = {str(p.relative_to(output)):sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode != 0 and 'Preserve edited output' in result.stderr
    assert before == {str(p.relative_to(output)):sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS Arcane byte-exact rebuild without installed game and modified-output protection')
