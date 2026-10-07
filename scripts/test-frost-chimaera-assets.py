"""Author: MiYu. Verify original art, source rules, exact regeneration and protected writes."""
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha = base.ROOT, base.SAMPLE, base.sha
receipt = json.loads((SAMPLE/'chimaera-sources.json').read_bytes())
for p, expected in receipt['generators'].items(): assert sha((ROOT/p).read_bytes())==expected,p
for r in receipt['files']:
    raw=(SAMPLE/r['path']).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
for r in receipt['sources']:
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/r['path'].replace('\\','/')).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
rules=json.loads((SAMPLE/'chimaera-rules.json').read_bytes()); unit=rules['units']['chimaera']; building=rules['buildings']['chimaeraroost']
assert (unit['hp'],unit['food'],unit['gold'],unit['wood'],unit['time'],unit['speed'],unit['range'],unit['damage'],unit['flightHeight'])==(1000,5,330,70,60,2.5,4.5,75,2.8)
assert unit['weaponMask']==2 and not unit['antiAir'] and not unit['leavesCorpse']
assert unit['weapons']['1']['targets']==['structure','debris'] and unit['weapons']['1']['range']==8.5 and unit['weapons']['1']['damage']==50
assert unit['weapons']['2']['splashTargets']==['ground','debris'] and unit['weapons']['2']['splashBands']==[[.5,1],[1.25,.5],[2,.1]]
assert (building['hp'],building['gold'],building['wood'],building['time'],building['selectionScale'])==(1200,140,190,80,4)
assert building['requires']==['etoe','eaow'] and building['sourceUnit']=='edos'
for u in [unit,building]:
    for name,row in u['sourceRows'].items(): assert base.rows((SAMPLE/f'SourceAssets/WarcraftIII/Units/{name}.slk').read_bytes())[u['sourceUnit']]==row
row=rules['research']['Recb']['sourceRow']; assert (row['goldbase'],row['lumberbase'],row['timebase'],row['effect1'],row['base1'])==('125','225','40','renw','3')
models=json.loads((SAMPLE/'chimaera-models.json').read_bytes()); assert len(models)==5
portraits=json.loads((SAMPLE/'chimaera-portraits.json').read_bytes()); assert len(portraits)==1
for model in models.values():
    assert model['classic'] and model['boundsSource']=='nativeStand' and model['animations'] and model['parts']
    for part in model['parts']: assert (SAMPLE/part['mesh']).is_file() and (SAMPLE/part['material']).is_file()
for portrait in portraits.values():
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/portrait['source']).read_bytes(); assert sha(raw)==portrait['sourceSha256']; assert importlib.import_module('import-frost-dryad-portrait').convert(raw)['view']==portrait['view']
with tempfile.TemporaryDirectory(prefix='test-frost-chimaera-') as temp:
    output=pathlib.Path(temp);command=[sys.executable,str(ROOT/'scripts/import-frost-chimaera.py'),'--output',temp]
    result=subprocess.run(command,capture_output=True); assert result.returncode==0,result.stderr.decode('utf-8','replace')
    for r in receipt['files']: assert (output/r['path']).read_bytes()==(SAMPLE/r['path']).read_bytes(),r['path']
    assert json.loads((output/'chimaera-sources.json').read_bytes())==receipt
    (output/'chimaera-rules.json').write_bytes(b'{}\n'); before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True); assert result.returncode!=0 and b'Preserve modified Chimaera output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS Chimaera original hashes, signed source rules, dual weapons, native bounds/camera, exact regeneration and protected writes:',len(receipt['files']),'signed outputs')
