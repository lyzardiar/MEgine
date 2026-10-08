"""Author: MiYu. Verify original art, source rules, exact regeneration and protected writes."""
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha = base.ROOT, base.SAMPLE, base.sha
receipt = json.loads((SAMPLE/'mountain-giant-sources.json').read_bytes()); assert receipt['generatorHashMode']=='lf-text'
for p, expected in receipt['generators'].items(): assert sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n'))==expected,p
for r in receipt['files']:
    raw=(SAMPLE/r['path']).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
for r in receipt['sources']:
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/r['path'].replace('\\','/')).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
rules=json.loads((SAMPLE/'mountain-giant-rules.json').read_bytes());unit=rules['units']['mountaingiant']
assert (unit['hp'],unit['food'],unit['gold'],unit['wood'],unit['time'],unit['speed'])==(1600,7,425,100,50,2.7)
assert unit['weapons']['1']['attack']=='normal' and unit['weapons']['2']['attack']=='siege' and not unit['antiAir']
assert unit['leavesCorpse'] and not unit['corpseUsable'] and unit['maxMana']==0
for name,row in unit['sourceRows'].items():assert base.rows((SAMPLE/f'SourceAssets/WarcraftIII/Units/{name}.slk').read_bytes())['emtg']==row
assert rules['abilities']['Agra']['sourceRow']['DataE1']=='15' and rules['abilities']['Assk']['sourceRow']['DataC1']=='12'
models=json.loads((SAMPLE/'mountain-giant-models.json').read_bytes());assert len(models)==3
for model in models.values():
 assert model['classic'] and model['boundsSource']=='nativeStand' and model['animations'] and model['parts']
 for part in model['parts']:assert (SAMPLE/part['mesh']).is_file() and (SAMPLE/part['material']).is_file()
portraits=json.loads((SAMPLE/'mountain-giant-portraits.json').read_bytes());assert len(portraits)==1
for portrait in portraits.values():
 raw=(SAMPLE/'SourceAssets/WarcraftIII'/portrait['source']).read_bytes();assert sha(raw)==portrait['sourceSha256'];assert importlib.import_module('import-frost-faerie-dragon').portrait_camera(raw)['view']==portrait['view']
art=json.loads((SAMPLE/'mountain-giant-art.json').read_bytes());assert len(art)==1
for effect in art.values():assert (SAMPLE/effect['effect']).is_file() and effect['parts'] and not effect['animations'][0]['loop']
with tempfile.TemporaryDirectory(prefix='test-frost-mountain-giant-') as temp:
    output=pathlib.Path(temp);command=[sys.executable,str(ROOT/'scripts/import-frost-mountain-giant.py'),'--output',temp]
    result=subprocess.run(command,capture_output=True); assert result.returncode==0,result.stderr.decode('utf-8','replace')
    for r in receipt['files']: assert (output/r['path']).read_bytes()==(SAMPLE/r['path']).read_bytes(),r['path']
    assert json.loads((output/'mountain-giant-sources.json').read_bytes())==receipt
    (output/'mountain-giant-rules.json').write_bytes(b'{}\n'); before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True); assert result.returncode!=0 and b'Preserve modified Mountain Giant output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS Mountain Giant original hashes, signed source rules, dual weapon/skin rules, native bounds/camera, exact regeneration and protected writes:',len(receipt['files']),'signed outputs')
