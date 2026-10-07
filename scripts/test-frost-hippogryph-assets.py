"""Author: MiYu. Verify original art, source rules, exact regeneration and protected writes."""
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha = base.ROOT, base.SAMPLE, base.sha
receipt = json.loads((SAMPLE/'hippogryph-sources.json').read_bytes())
for p, expected in receipt['generators'].items(): assert sha((ROOT/p).read_bytes())==expected,p
for r in receipt['files']:
    raw=(SAMPLE/r['path']).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
for r in receipt['sources']:
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/r['path'].replace('\\','/')).read_bytes(); assert sha(raw)==r['sha256'] and len(raw)==r['bytes'],r['path']
rules=json.loads((SAMPLE/'hippogryph-rules.json').read_bytes()); hip,rider=rules['units'].values()
assert (hip['hp'],hip['food'],hip['gold'],hip['wood'],hip['time'],hip['speed'],hip['range'],hip['damage'],hip['airOnly'])==(525,2,160,20,30,4,1.28,53.5,True)
assert (rider['hp'],rider['food'],rider['speed'],rider['range'],rider['damage'],rider['airOnly'])==(765,4,3.5,4,17,False)
assert all(u['flightHeight']==2.4 and not u['leavesCorpse'] and u['maxMana']==0 for u in [hip,rider])
for u in [hip,rider]:
    for name,row in u['sourceRows'].items(): assert base.rows((SAMPLE/f'SourceAssets/WarcraftIII/Units/{name}.slk').read_bytes())[u['sourceUnit']]==row
assert rules['producer']['sourceFunc']['Trains']=='ehip,edot,efdr'
for id,partner,move in [('Aco2','ehip','0'),('Aco3','earc','1')]:
    row=rules['abilities'][id]['sourceRow']; assert row['code']=='Acoi' and row['DataA1']==partner and row['DataB1']==move and row['UnitID1']=='ehpr' and row['Area1']=='900' and row['Cool1']=='30'
models=json.loads((SAMPLE/'hippogryph-models.json').read_bytes()); assert len(models)==4
portraits=json.loads((SAMPLE/'hippogryph-portraits.json').read_bytes()); assert len(portraits)==2
for model in models.values():
    assert model['classic'] and model['boundsSource']=='nativeStand' and model['animations'] and model['parts']
    for part in model['parts']: assert (SAMPLE/part['mesh']).is_file() and (SAMPLE/part['material']).is_file()
for portrait in portraits.values():
    raw=(SAMPLE/'SourceAssets/WarcraftIII'/portrait['source']).read_bytes(); assert sha(raw)==portrait['sourceSha256']; assert importlib.import_module('import-frost-dryad-portrait').convert(raw)['view']==portrait['view']
with tempfile.TemporaryDirectory(prefix='test-frost-hippogryph-') as temp:
    output=pathlib.Path(temp);command=[sys.executable,str(ROOT/'scripts/import-frost-hippogryph.py'),'--output',temp]
    result=subprocess.run(command,capture_output=True); assert result.returncode==0,result.stderr.decode('utf-8','replace')
    for r in receipt['files']: assert (output/r['path']).read_bytes()==(SAMPLE/r['path']).read_bytes(),r['path']
    assert json.loads((output/'hippogryph-sources.json').read_bytes())==receipt
    (output/'hippogryph-rules.json').write_bytes(b'{}\n'); before={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result=subprocess.run(command,capture_output=True); assert result.returncode!=0 and b'Preserve modified Hippogryph output' in result.stderr
    assert before=={p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS Hippogryph original hashes, source identities, Acoi rules, native bounds/cameras, exact regeneration and protected writes:',len(receipt['files']),'signed outputs')
