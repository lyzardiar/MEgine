"""Author: MiYu. Check Flying Machine source assets, original rules and offline deterministic rebuilding."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
OUT=ROOT/'tmp/docs-artifacts/frost-flying-machine'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
read=lambda p:json.loads((SAMPLE/p).read_bytes())
r=read('flying-machine-sources.json');fx=read('flying-machine-effects-sources.json')
for record in r['files']+fx['outputs']:
    raw=(SAMPLE/record['path']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256'],record['path']
for record in r['sources']:
    raw=(SAMPLE/'SourceAssets/FlyingMachine'/record['path']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256'],record['path']
for record in fx['sources']:
    assert sha((SAMPLE/record['output']).read_bytes())==record['sha256'],record['output']
for record in r['generators']+fx['generators']:
    assert sha((ROOT/record['path']).read_bytes().replace(b'\r\n',b'\n'))==record['sha256'],record['path']
rules=read('flying-machine.json');u=rules['unit']
assert [u[k] for k in ['hp','gold','wood','food','time','speed','armorValue','collision','weaponsEnabled']]==[200,90,30,1,13,4,2,.08,1]
assert [u['weapons']['1'][k] for k in ['damage','range','damagePoint','cooldown','weaponType','targets']]==[14.5,5,.03,2,'instant',['air']]
assert [u['weapons']['2'][k] for k in ['damage','range','damagePoint','cooldown','missileSpeed','weaponType']]==[7.5,1,.633,2.5,9,'missile']
assert u['organic'] is False and u['flying'] is True
assert rules['research']['Rhgb']['sourceRow']['effect1']=='renw' and rules['research']['Rhgb']['sourceRow']['base1']=='3'
assert [rules['research']['Rhgb'][k] for k in ['gold','wood','time','requires']]==[150,100,35,['hcas']]
assert [rules['research']['Rhfc'][k] for k in ['gold','wood','time','requires']]==[100,150,40,['hcas']]
assert rules['abilities']['Agyv']['radius']==9 and rules['abilities']['Agyv']['detectionType']==3
assert rules['abilities']['Aflk']['damageBands']==[[.75,7],[1.5,6],[3.25,5]]
assert rules['abilities']['Aflk']['targets']==['air','enemy','neutral']
models=read('flying-machine-models.json');body=models['ClassicFlyingMachine'];portrait=read('flying-machine-portraits.json')['ClassicFlyingMachine']
assert body['sourceModel'].lower().endswith('gyrocopter_v1.mdx')
assert {a['name'] for a in body['animations']} >= {'Stand','Walk','Attack one','Attack two','Death'}
assert portrait['model']=='ClassicFlyingMachinePortrait' and portrait['schemaVersion']==1
assert len(portrait['sequences'])==len(models[portrait['model']]['animations'])
assert portrait['view']['camera3D']['projection']=='perspective' and portrait['sourceCamera']['near']>0
effects=read('flying-machine-effects.json');assert len(effects)==5 and effects['FlyingMachineFlak']['particleOnly']
assert r['reaUpstream']=='https://github.com/morluto/rea'
print('PASS Flying Machine source/output/converter hashes, two weapon profiles, both research paths, True Sight, Flak bands, TFT body and animated portrait')
OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='reproduce-',dir=OUT) as directory:
    output=Path(directory)
    command=[sys.executable,str(ROOT/'scripts/import-frost-flying-machine.py'),'--output',str(output),'--game',str(output/'no-game'),'--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result=subprocess.run(command,capture_output=True,text=True);assert result.returncode==0,result.stdout+result.stderr
    for record in r['files']:
        assert (output/record['path']).read_bytes()==(SAMPLE/record['path']).read_bytes(),record['path']
    assert (output/'flying-machine-sources.json').read_bytes()==(SAMPLE/'flying-machine-sources.json').read_bytes()
    effects_command=[sys.executable,str(ROOT/'scripts/import-frost-flying-machine-effects.py'),'--output',str(output),'--source-root',str(SAMPLE),'--game',str(output/'no-game'),'--sampler','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result=subprocess.run(effects_command,capture_output=True,text=True);assert result.returncode==0,result.stdout+result.stderr
    for record in fx['outputs']:
        assert (output/record['path']).read_bytes()==(SAMPLE/record['path']).read_bytes(),record['path']
    assert (output/'flying-machine-effects-sources.json').read_bytes()==(SAMPLE/'flying-machine-effects-sources.json').read_bytes()
    target=output/'flying-machine.json';target.write_bytes(target.read_bytes()+b' ')
    before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True,text=True);assert result.returncode!=0 and 'Preserve edited output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS byte-exact body/portrait/effects rebuild without game installation and modified-output protection')
