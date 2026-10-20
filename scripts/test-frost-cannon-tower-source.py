"""Author: MiYu. Verify signed Cannon Tower inputs/outputs and deterministic retained-source reproduction."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
OUT = ROOT / 'tmp/docs-artifacts/frost-cannon-tower'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE/'cannon-tower-sources.json').read_bytes())
for record in receipt['files']:
    raw = (SAMPLE/record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['sources']:
    raw = (SAMPLE/'SourceAssets/CannonTower'/record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['generators']:
    assert sha((ROOT/record['path']).read_bytes()) == record['sha256'], record['path']
rules = json.loads((SAMPLE/'cannon-tower.json').read_bytes()); w = rules['weapons'][0]; second = rules['weapons'][1]
assert [w[k] for k in ['damage','bonus','dice','sides','range','acquisition','cooldown','damagePoint','backswing','missileSpeed','missileArc']] == [100.5,89,1,22,8,8,2.5,.3,.3,7,.35]
assert w['rangeBuffer'] == float(w['sourceRow']['RngBuff1'])/100 == 2.5
assert w['launch'] == [0,1.6,0] and w['impactHeight'] == 1.2
assert w['weaponType'] == 'artillery' and second['weaponType'] == 'missile'
assert w['targets'] == ['ground','debris','tree','wall','ward','item'] and second['targets'] == ['structure']
assert w['splashBands'] == [[.5,1],[1,.5],[1.25,.1]] and second['splashBands'] == []
assert w['splashTargets'] == ['ground','structure','debris','tree','wall','notself']
assert rules['damageTable']['siege']['fortified'] == 1.5
assert [rules['unit'][k] for k in ['hp','armorValue','gold','wood','time']] == [600,5,200,120,75]
assert rules['unit']['sourceFunc']['Requires'] == 'harm'
assert receipt['reaUpstream'] == 'https://github.com/morluto/rea'
catalog = json.loads((SAMPLE/'cannon-tower-models.json').read_bytes()); model = catalog['ClassicCannonTowerMissile']; tower = catalog['KingdomCannonTower']
assert model['parts'] and all(p['mesh'].startswith('Assets/CannonTower/') for p in model['parts'])
assert tower['classicTier'] == 3 and tower['animations'][7]['name'] == 'Stand Upgrade Second'
for record in receipt['sharedAssets'] + [receipt['sharedCatalog']]:
    assert sha((SAMPLE/record['path']).read_bytes()) == record['sha256'], record['path']
print('PASS signed Cannon Tower source rows, model, runtime artifacts, generators, original weapon fields and armor table')
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='reproduce-',dir=OUT) as directory:
    output = Path(directory)
    command = [sys.executable,str(ROOT/'scripts/import-frost-cannon-tower.py'),'--game',str(output/'no-installation'),'--output',str(output),'--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    for record in receipt['files']:
        assert (output/record['path']).read_bytes() == (SAMPLE/record['path']).read_bytes(), record['path']
    assert (output/'cannon-tower-sources.json').read_bytes() == (SAMPLE/'cannon-tower-sources.json').read_bytes()
    target = output/'cannon-tower.json'; target.write_bytes(target.read_bytes()+b' ')
    before = {str(p.relative_to(output)):sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode != 0 and 'Preserve edited output' in result.stderr
    assert before == {str(p.relative_to(output)):sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS retained-source rebuild without game installation is byte exact; modified output rejected before writes')
with tempfile.TemporaryDirectory(prefix='unsigned-',dir=OUT) as directory:
    output = Path(directory); target = output/'cannon-tower.json'; target.write_bytes(b'preserve user file\n')
    command[command.index('--output')+1] = str(output)
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode != 0 and 'Preserve unsigned output' in result.stderr
    assert target.read_bytes() == b'preserve user file\n' and list(output.iterdir()) == [target]
print('PASS unsigned Cannon output collision is preserved without partial installation')
(OUT/'source-verification.json').write_text(json.dumps(dict(passed=True,files=len(receipt['files']),sources=len(receipt['sources']),retainedReproduction=True,modifiedOutputPreserved=True),indent=2),encoding='utf-8')
