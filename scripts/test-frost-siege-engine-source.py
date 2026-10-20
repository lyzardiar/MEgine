"""Author: MiYu. Check Siege Engine source assets, original rules and offline deterministic rebuilding."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
OUT=ROOT/'tmp/docs-artifacts/frost-siege-engine'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
read=lambda p:json.loads((SAMPLE/p).read_bytes())
r=read('siege-engine-sources.json');fx=read('siege-engine-effects-sources.json')
for record in r['files']+fx['outputs']:
    raw=(SAMPLE/record['path']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256'],record['path']
for record in r['sources']:
    raw=(SAMPLE/'SourceAssets/SiegeEngine'/record['path']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256'],record['path']
for record in fx['sources']:
    assert sha((SAMPLE/record['output']).read_bytes())==record['sha256'],record['output']
for record in r['generators']+fx['generators']:
    assert sha((ROOT/record['path']).read_bytes().replace(b'\r\n',b'\n'))==record['sha256'],record['path']
rules=read('siege-engine.json');u=rules['units']['hmtt'];v=rules['units']['hrtt']
assert rules['unit']==u
for form in [u,v]:
    assert [form[k] for k in ['hp','gold','wood','food','time','speed','armorValue','collision']]==[700,195,60,3,55,2.2,2,.48]
    assert form['armor']=='fortified' and form['organic'] is False and form['flying'] is False
    assert [form['weapons']['1'][k] for k in ['damage','bonus','dice','sides','range','damagePoint','cooldown','weaponType','targets']]==[50,44,1,11,1.92,.5,2.1,'instant',['structure','debris']]
assert u['weaponsEnabled']==1 and v['weaponsEnabled']==3
assert u['weapons']['2']['missileModel'] is None
assert [v['weapons']['2'][k] for k in ['damage','range','damagePoint','backswing','cooldown','missileSpeed','missileArc','weaponType','targets']]==[13.5,5,.125,.875,2,9,.15,'missile',['air']]
assert u['animationProperties']=='' and v['animationProperties']=='alternate'
assert u['sourceStrings']['Name']=='蒸汽机车' and v['sourceStrings']['Name']=='蒸汽机车'
assert u['launch']==[0,.6,0] and v['launch']==[0,1,.6]
assert rules['research']['Rhrt']['sourceRow']['effect1']=='rtma' and rules['research']['Rhrt']['sourceRow']['code1']=='hmtt' and rules['research']['Rhrt']['sourceRow']['base1']=='1'
assert rules['research']['Rhrt']['sourceRow']['code2']=='hrtt' and rules['research']['Rhrt']['sourceRow']['base2']=='-1'
assert [rules['research']['Rhrt'][k] for k in ['gold','wood','time','requires']]==[50,150,40,['hcas']]
assert rules['abilities']['Srtt']['targetUnit']=='hrtt' and rules['abilities']['Srtt']['sourceRow']['code']=='Acha'
assert rules['abilities']['Srtt']['sourceStrings']=={'Requires':'Rhrt'} and rules['abilities']['Srtt']['sourceFunc']=={}
assert rules['abilities']['Aroc']['requires']=='Rhrt' and rules['abilities']['Aroc']['targets']==['air','enemy']
assert [rules['abilities']['Aroc']['sourceRow'][k] for k in ['Area1','DataA1','DataB1','DataC1','Cool1','Dur1']]==['500','25','630','9','2','1']
assert rules['workshopSource']['Trains'].split(',')==['hgyr','hmtm','hmtt','hrtt']
models=read('siege-engine-models.json');body=models['ClassicSiegeEngine'];portrait=read('siege-engine-portraits.json')['ClassicSiegeEngine']
assert body['sourceModel'].lower().endswith('warwagon_v1.mdx')
assert {a['name'] for a in body['animations']} >= {'Stand','Walk','Attack','Death','Stand Alternate','Walk Alternate','Attack One Alternate','Attack Two Alternate','Death Alternate'}
assert len(body['animations'])==15 and body['sourceUnits']==['hmtt','hrtt']
assert portrait['model']=='ClassicSiegeEnginePortrait' and portrait['schemaVersion']==1
assert [s['name'] for s in portrait['sequences']]==['Portrait','Portrait Alternate']
assert len(portrait['sequences'])==len(models[portrait['model']]['animations'])
assert portrait['view']['camera3D']['projection']=='perspective' and portrait['sourceCamera']['near']==8
assert all(s['archive']=='War3Patch.mpq' for s in r['sources'] if s['path'].endswith('.mdx'))
effects=read('siege-engine-effects.json');assert len(effects)==4 and effects['SiegeEngineImpact']['particleOnly']
assert fx['statistics']['SiegeEngineRocket']['sourceRibbons']==1
assert fx['statistics']['ClassicSiegeEngineEmbedded']['sourceParticles']==14
assert fx['statistics']['ClassicSiegeEnginePortraitEmbedded']['sourceParticles']==3
assert r['reaUpstream']=='https://github.com/morluto/rea' and r['reaVersion']=='6.5.0' and r['reaCommit']=='3b79af28e80785afce9f5998d8f03289402a1847'
assert r['originalRuntimeVerified'] is False and fx['originalRuntimeVerified'] is False
assert fx['runtimeIntegrated'] is True
assert '\ufffd' not in (SAMPLE/'siege-engine.json').read_text(encoding='utf-8')
print('PASS Siege Engine source/output/converter hashes, both forms, weapons, research, transformation, rocket ability, TFT body and animated portrait')
OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='reproduce-',dir=OUT) as directory:
    output=Path(directory)
    command=[sys.executable,str(ROOT/'scripts/import-frost-siege-engine.py'),'--output',str(output),'--game',str(output/'no-game'),'--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result=subprocess.run(command,capture_output=True,text=True);assert result.returncode==0,result.stdout+result.stderr
    for record in r['files']:
        assert (output/record['path']).read_bytes()==(SAMPLE/record['path']).read_bytes(),record['path']
    assert (output/'siege-engine-sources.json').read_bytes()==(SAMPLE/'siege-engine-sources.json').read_bytes()
    effects_command=[sys.executable,str(ROOT/'scripts/import-frost-siege-engine-effects.py'),'--output',str(output),'--source-root',str(SAMPLE),'--game',str(output/'no-game'),'--sampler','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result=subprocess.run(effects_command,capture_output=True,text=True);assert result.returncode==0,result.stdout+result.stderr
    for record in fx['outputs']:
        assert (output/record['path']).read_bytes()==(SAMPLE/record['path']).read_bytes(),record['path']
    assert (output/'siege-engine-effects-sources.json').read_bytes()==(SAMPLE/'siege-engine-effects-sources.json').read_bytes()
    target=output/'siege-engine.json';target.write_bytes(target.read_bytes()+b' ')
    before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True,text=True);assert result.returncode!=0 and 'Preserve edited output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    effect_target=output/'siege-engine-effects.json';effect_target.write_bytes(effect_target.read_bytes()+b' ')
    before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(effects_command,capture_output=True,text=True);assert result.returncode!=0 and 'Modified generated output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS byte-exact body/portrait/effects rebuild without game installation and both modified-output protections')
