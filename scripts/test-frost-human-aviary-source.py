"""Author: MiYu. Verify Gryphon Aviary source rules, signed assets and byte-exact offline rebuilding."""
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
OUT = ROOT / 'tmp/docs-artifacts/frost-human-aviary'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
read = lambda p: json.loads((SAMPLE / p).read_bytes())
receipt = read('human-aviary-sources.json')
assert all('\\' not in record['path'] for record in receipt['files'] + receipt['sources'])
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['sources']:
    raw = (SAMPLE / 'SourceAssets/HumanAviary' / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['generators']:
    assert sha((ROOT / record['path']).read_bytes().replace(b'\r\n', b'\n')) == record['sha256'], record['path']
assert receipt['reaUpstream'] == 'https://github.com/morluto/rea' and receipt['reaVersion'] == '6.5.0'
assert receipt['reaCommit'] == '3b79af28e80785afce9f5998d8f03289402a1847' and receipt['originalRuntimeVerified'] is False
rules = read('human-aviary.json'); gryphon = rules['units']['hgry']; dragonhawk = rules['units']['hdhw']; aviary = rules['building']
assert aviary == rules['buildings']['hgra']
assert [aviary[k] for k in ['gold','wood','time','hp','armor','armorValue','requires','slot','hotkey']] == [140,150,75,1200,'fortified',5,['hkee','hlum'],9,'G']
assert aviary['trains'] == ['hgry','hdhw'] and aviary['researches'] == ['Rhhb','Rhcd'] and aviary['weapons'] == {}
assert [gryphon[k] for k in ['gold','wood','food','time','hp','speed','requires','slot','hotkey']] == [280,70,4,45,825,3.2,['hcas'],1,'G']
assert [dragonhawk[k] for k in ['gold','wood','food','time','hp','speed','requires','slot','hotkey']] == [200,30,3,28,575,3.5,['hvlt'],0,'D']
assert [dragonhawk[k] for k in ['mana','initialMana','manaRegen','healthRegen','castPoint','castBackswing']] == [300,150,.75,.25,.3,1.03]
assert gryphon['mana'] is None and gryphon['initialMana'] is None and gryphon['manaRegen'] is None
assert gryphon['flying'] and dragonhawk['flying'] and gryphon['moveHeight'] == dragonhawk['moveHeight'] == 2.4
w = gryphon['weapons']['1']; air = gryphon['weapons']['2']; hawk = dragonhawk['weapons']['1']
assert [w[k] for k in ['weaponType','damage','bonus','dice','sides','range','cooldown','damagePoint','backswing','spillDistance','spillRadius','damageLoss']] == ['mline',50,44,1,11,4.5,2.2,.8,.87,0,.5,.2]
assert w['targets'] == ['ground','structure','debris','item','ward'] and w['splashTargets'] == ['ground','structure','enemy','debris']
assert [air[k] for k in ['weaponType','damage','cooldown','damagePoint','backswing','targets']] == ['missile',50,2.4,.8,.87,['air']]
assert [hawk[k] for k in ['weaponType','damage','range','cooldown','damagePoint','backswing','missileHoming']] == ['missile',19,3,1.75,.43,.633,True]
assert w['missileSpeed'] == hawk['missileSpeed'] == 11 and w['missileArc'] == hawk['missileArc'] == .15
assert all(air[k] is None for k in ['missileModel','missileSpeed','missileArc','missileHoming'])
assert w['missileHoming'] is None and 'MissileHoming' not in gryphon['sourceFunc'] and ',' not in gryphon['sourceFunc']['Missileart']
assert w['fullSplash'] is None and w['halfSplash'] is None and w['quarterSplash'] is None
for key, expected in [('Rhhb',[125,225,45,['hcas']]),('Rhcd',[50,100,35,['hvlt']])]:
    assert [rules['research'][key][k] for k in ['gold','wood','time','requires']] == expected
assert rules['research']['Rhhb']['sourceRow']['effect1'] == 'rasd' and rules['research']['Rhhb']['sourceRow']['base1'] == '200'
assert {k for k in rules['upgradeMetadata']} == {'asdb','asdm'}
assert rules['abilities']['Asth']['requires'] == ['Rhhb'] and rules['abilities']['Aclf']['requires'] == ['Rhcd']
assert [rules['abilities']['Aclf'][k] for k in ['cost','cooldown','duration','heroDuration','range','radius','targets']] == [100,20,30,30,10,3,['vuln','invu','structure']]
assert rules['silenceFlags']['01'] == '1,WESTRING_UE_SILENCEFLAGS_RANGED'
assert rules['abilities']['Aclf']['sourceRow']['DataA1'] == '2' and rules['abilities']['Aclf']['sourceMetadata']['Nsi1']['type'] == 'silenceFlags'
assert [rules['abilities']['Amls'][k] for k in ['cost','cooldown','duration','heroDuration','range','radius','targets']] == [75,30,40,10,5.5,None,['air','enemy','organic']]
assert rules['abilities']['Amls']['sourceRow']['DataA1'] == '30' and rules['abilities']['Amls']['sourceFunc']['LightningEffect'] == 'LEAS'
assert set(rules['buffs']) == {'Bclf','Xclf','Bmlc','Bmlt'}
assert rules['buffs']['Bmlt']['sourceFunc']['Targetattach'] == 'chest,mount'
assert [rules['lightning']['LEAS'][k] for k in ['file','AvgSegLen','Width','NoiseScale','Duration']] == ['lariatCaught.blp','50','80','0.01','2']
assert '\ufffd' not in (SAMPLE / 'human-aviary.json').read_text(encoding='utf-8')
assert rules['research']['Rhhb']['name'] == '\u98ce\u66b4\u6218\u9524'
assert rules['research']['Rhcd']['name'] == '\u4e4c\u4e91\u6280\u80fd'
assert receipt['runtimeIntegrated'] is True and rules['runtimeIntegrated'] is True
art_receipts = {name: read(name) for name in ['human-aviary-particle-sources.json','human-aviary-effects-sources.json']}
for art in art_receipts.values():
    for record in art['outputs']:
        raw=(SAMPLE/record['path']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256'],record['path']
    for record in art['sources']:
        raw=(SAMPLE/record['output']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256'],record['output']
    for record in art['generators']:
        assert sha((ROOT/record['path']).read_bytes().replace(b'\r\n',b'\n'))==record['sha256'],record['path']
    assert art['runtimeIntegrated'] is True and art['originalRuntimeVerified'] is False
fx=art_receipts['human-aviary-effects-sources.json'];effects=read('human-aviary-effects.json')
assert len(effects)==8 and len(read('human-aviary-particle-models.json'))==4
assert all(effects[k]['particleOnly'] for k in ['GryphonImpact','DragonHawkMissile','CloudOfFog'])
cloud=read('Assets/HumanAviaryEffects/Effects/CloudOfFog.mfx'); stand=next(c for c in cloud['clips'] if c['name']=='Stand'); death=next(c for c in cloud['clips'] if c['name']=='Death')
assert stand['prewarmSeconds']>=max(e['life'] for e in cloud['sourceModel']['particleEmitters'])
assert min(len(f['particles']) for f in stand['frames'])>200 and len(death['frames'][0]['particles'])>200
assert len(death['frames'][-1]['particles'])<len(death['frames'][0]['particles'])
assert fx['statistics']['KingdomGryphonAviaryEmbedded']['sourceParticles']==8
assert fx['statistics']['ClassicDragonHawkEmbedded']['sourceParticles']==6
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
for unit in [aviary,gryphon,dragonhawk]:
    for name,row in unit['sourceRows'].items():
        assert row == rows((SAMPLE/'SourceAssets/HumanAviary/Units'/f'{name}.slk').read_bytes())[unit['sourceUnit']]
    for suffix in ['Func','Strings']:
        assert unit['source'+suffix] == section((SAMPLE/'SourceAssets/HumanAviary/Units'/f'HumanUnit{suffix}.txt').read_bytes(),unit['sourceUnit'])
models = read('human-aviary-models.json'); portraits = read('human-aviary-portraits.json')
assert len(models) == 5 and len(portraits) == 3
for key, count in [('KingdomGryphonAviary',6),('ClassicGryphon',7),('ClassicDragonHawk',10),('ClassicGryphonPortrait',1),('ClassicDragonHawkPortrait',2)]:
    assert len(models[key]['animations']) == count
for key, portrait in portraits.items():
    assert len(portrait['sequences']) == len(models[portrait['model']]['animations'])
    assert portrait['view']['camera3D']['projection'] == 'perspective' and portrait['sourceCamera']['near'] == 8
assert portraits['KingdomGryphonAviary']['model'] == 'KingdomGryphonAviary'
assert portraits['KingdomGryphonAviary']['sequences'][portraits['KingdomGryphonAviary']['initialSequence']]['name'] == 'portrait'
print('PASS original source hashes, rules, weapon slots, null semantics, research metadata, buff/lightning and all body/portrait models')
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='reproduce-', dir=OUT) as directory:
    output = Path(directory)
    command = [sys.executable,str(ROOT/'scripts/import-frost-human-aviary.py'),'--output',str(output),'--game',str(output/'no-game'),'--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe','--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll']
    result = subprocess.run(command,capture_output=True,text=True)
    assert result.returncode == 0,result.stdout+result.stderr
    for record in receipt['files']:
        assert (output/record['path']).read_bytes() == (SAMPLE/record['path']).read_bytes(),record['path']
    assert (output/'human-aviary-sources.json').read_bytes() == (SAMPLE/'human-aviary-sources.json').read_bytes()
    legacy=json.loads((output/'human-aviary-sources.json').read_bytes())
    for record in legacy['files']+legacy['sources']:
        record['path']=record['path'].replace('ReplaceableTextures/Weather/','ReplaceableTextures\\Weather/')
    (output/'human-aviary-sources.json').write_text(json.dumps(legacy),encoding='utf-8')
    migration=command+['--source-sample',str(output)]
    result=subprocess.run(migration,capture_output=True,text=True)
    assert result.returncode==0,result.stdout+result.stderr
    assert (output/'human-aviary-sources.json').read_bytes()==(SAMPLE/'human-aviary-sources.json').read_bytes()
    for script,receipt_name,changed_path in [('import-frost-human-aviary-particles.py','human-aviary-particle-sources.json','human-aviary-particle-models.json'),('import-frost-human-aviary-effects.py','human-aviary-effects-sources.json','human-aviary-effects.json')]:
        art_command=[sys.executable,str(ROOT/'scripts'/script),'--output',str(output),'--source-root',str(SAMPLE),'--game',str(output/'no-game'),'--sampler',str(ROOT/art_receipts[receipt_name]['binaries'][0]['path']),'--metadata-reader','E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll','--pose-probe','D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe']
        result=subprocess.run(art_command,capture_output=True,text=True)
        assert result.returncode==0,result.stdout+result.stderr
        for record in art_receipts[receipt_name]['outputs']:
            assert (output/record['path']).read_bytes()==(SAMPLE/record['path']).read_bytes(),record['path']
        assert (output/receipt_name).read_bytes()==(SAMPLE/receipt_name).read_bytes()
        target=output/changed_path;target.write_bytes(target.read_bytes()+b' ')
        before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
        result=subprocess.run(art_command,capture_output=True,text=True)
        assert result.returncode!=0 and 'Modified generated output' in result.stderr,result.stdout+result.stderr
        assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
        target.write_bytes((SAMPLE/changed_path).read_bytes())
    target=output/'human-aviary.json';target.write_bytes(target.read_bytes()+b' ')
    before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True,text=True)
    assert result.returncode != 0 and 'Preserve edited output' in result.stderr
    assert before == {p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    target.write_bytes((SAMPLE/'human-aviary.json').read_bytes())
    source=output/'SourceAssets/HumanAviary/Units/UnitBalance.slk';source.write_bytes(source.read_bytes()+b' ')
    clean=output/'clean-output';command[command.index('--output')+1]=str(clean);command+=['--source-sample',str(output)]
    result=subprocess.run(command,capture_output=True,text=True)
    assert result.returncode != 0 and 'Corrupt retained source' in result.stderr
    assert not clean.exists()
print('PASS byte-exact body/portrait/particle/effects rebuild without game installation, three edited-output protections and corrupted-source rejection before publication')
