"""Author: MiYu. Verify signed Guard Tower inputs/outputs and deterministic retained-source reproduction."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
OUT = ROOT / 'tmp/docs-artifacts/frost-guard-tower'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE/'guard-tower-sources.json').read_bytes())
for record in receipt['files']:
    raw = (SAMPLE/record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['sources']:
    raw = (SAMPLE/'SourceAssets/GuardTower'/record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['generators']:
    assert sha((ROOT/record['path']).read_bytes()) == record['sha256'], record['path']
rules = json.loads((SAMPLE/'guard-tower.json').read_bytes()); w = rules['weapon']
assert [w[k] for k in ['damage','bonus','dice','sides','range','acquisition','cooldown','damagePoint','backswing','missileSpeed','missileArc']] == [25,22,1,5,7,7,.9,.3,.3,18,.15]
assert w['launch'] == [0,1.45,0] and w['impactHeight'] == 1.2
assert w['targets'] == ['ground','structure','debris','air','item','ward']
assert rules['damageTable']['pierce']['fortified'] == .35
assert receipt['reaUpstream'] == 'https://github.com/morluto/rea'
catalog = json.loads((SAMPLE/'guard-tower-models.json').read_bytes()); model = catalog['ClassicGuardTowerMissile']
assert model['parts'] and all(p['mesh'].startswith('Assets/GuardTower/') for p in model['parts'])
print('PASS signed Guard Tower source rows, model, runtime artifacts, generators, original weapon fields and armor table')
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='reproduce-',dir=OUT) as directory:
    output = Path(directory)
    command = [sys.executable,str(ROOT/'scripts/import-frost-guard-tower.py'),'--game',str(output/'no-installation'),'--output',str(output),'--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    for record in receipt['files']:
        assert (output/record['path']).read_bytes() == (SAMPLE/record['path']).read_bytes(), record['path']
    assert (output/'guard-tower-sources.json').read_bytes() == (SAMPLE/'guard-tower-sources.json').read_bytes()
    target = output/'guard-tower.json'; target.write_bytes(target.read_bytes()+b' ')
    before = {str(p.relative_to(output)):sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode != 0 and 'Preserve edited output' in result.stderr
    assert before == {str(p.relative_to(output)):sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS retained-source rebuild without game installation is byte exact; modified output rejected before writes')
(OUT/'source-verification.json').write_text(json.dumps(dict(passed=True,files=len(receipt['files']),sources=len(receipt['sources']),retainedReproduction=True,modifiedOutputPreserved=True),indent=2),encoding='utf-8')
