"""Author: MiYu. Verify original art, source rules, exact regeneration and protected writes."""
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha = base.ROOT, base.SAMPLE, base.sha
receipt = json.loads((SAMPLE/'faerie-dragon-sources.json').read_bytes())
for p, expected in receipt['generators'].items(): assert sha((ROOT/p).read_bytes())==expected,p
for r in receipt['files']:
    raw=(SAMPLE/r['path']).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
for r in receipt['sources']:
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/r['path'].replace('\\','/')).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
rules=json.loads((SAMPLE/'faerie-dragon-rules.json').read_bytes());unit=rules['units']['faeriedragon']
assert (unit['hp'],unit['food'],unit['gold'],unit['wood'],unit['time'],unit['speed'],unit['range'],unit['damage'],unit['flightHeight'])==(450,2,155,25,25,3.5,3,15,2.4)
assert unit['antiAir'] and unit['magicImmune'] and not unit['leavesCorpse'] and unit['sourceFunc']['Requires']=='eden'
assert (unit['initialMana'],unit['maxMana'],unit['manaRegen'])==(75,200,.75)
assert (rules['abilities']['Apsh']['cost'],rules['abilities']['Apsh']['duration'],rules['abilities']['Apsh']['cooldown'])==(20,1.5,6.5)
assert rules['initialPhaseAutocast'] and rules['abilities']['Amfl']['sourceRow']['DataE1']=='12'
for name,row in unit['sourceRows'].items():assert base.rows((SAMPLE/f'SourceAssets/WarcraftIII/Units/{name}.slk').read_bytes())['efdr']==row
models=json.loads((SAMPLE/'faerie-dragon-models.json').read_bytes());assert len(models)==7
portraits=json.loads((SAMPLE/'faerie-dragon-portraits.json').read_bytes());assert len(portraits)==1
for model in models.values():
    assert model['classic'] and model['boundsSource']=='nativeStand' and model['animations'] and model['parts']
    for part in model['parts']:assert (SAMPLE/part['mesh']).is_file() and (SAMPLE/part['material']).is_file()
for portrait in portraits.values():
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/portrait['source']).read_bytes();assert sha(raw)==portrait['sourceSha256'];assert importlib.import_module('import-frost-faerie-dragon').portrait_camera(raw)['view']==portrait['view'];assert portrait['sourceCameraTracks']
art=json.loads((SAMPLE/'faerie-dragon-art.json').read_bytes());assert len(art)==5
for effect in art.values():assert (SAMPLE/effect['effect']).is_file()
with tempfile.TemporaryDirectory(prefix='test-frost-faerie-dragon-') as temp:
    output=pathlib.Path(temp);command=[sys.executable,str(ROOT/'scripts/import-frost-faerie-dragon.py'),'--output',temp]
    result=subprocess.run(command,capture_output=True); assert result.returncode==0,result.stderr.decode('utf-8','replace')
    for r in receipt['files']: assert (output/r['path']).read_bytes()==(SAMPLE/r['path']).read_bytes(),r['path']
    assert json.loads((output/'faerie-dragon-sources.json').read_bytes())==receipt
    (output/'faerie-dragon-rules.json').write_bytes(b'{}\n'); before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True); assert result.returncode!=0 and b'Preserve modified Faerie Dragon output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS Faerie Dragon original hashes, signed source rules, phase/channel rules, native bounds/camera, exact regeneration and protected writes:',len(receipt['files']),'signed outputs')
