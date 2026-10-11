"""Author: MiYu. Verify original Mortar data, complete effect dependencies and signed reproducible outputs."""
import hashlib
import importlib
import json
import pathlib
import struct
import subprocess
import sys
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
read=lambda path:json.loads(path.read_bytes())
rows=importlib.import_module('import-frost-wisp-rules').rows
section=importlib.import_module('import-frost-human-army').section


def main():
    receipt=read(SAMPLE/'human-mortar-sources.json');effects=read(SAMPLE/'human-mortar-effects-sources.json');catalog=read(SAMPLE/'human-mortar.json')
    for item in receipt['files']+effects['outputs']:
        raw=(SAMPLE/item['path']).read_bytes();assert len(raw)==item['bytes'] and sha(raw)==item['sha256'],item['path']
        if item['path'].endswith('.png'):assert raw[:8]==b'\x89PNG\r\n\x1a\n'
    for item in receipt['generators']+effects['generators']:
        raw=(ROOT/item['path']).read_bytes()
        if item in effects['generators']:raw=raw.replace(b'\r\n',b'\n')
        assert sha(raw)==item['sha256'],item['path']
    raw=SAMPLE/'SourceAssets/HumanMortar';balance=rows((raw/'Units/UnitBalance.slk').read_bytes());weapons=rows((raw/'Units/UnitWeapons.slk').read_bytes());ability=rows((raw/'Units/AbilityData.slk').read_bytes());upgrades=rows((raw/'Units/UpgradeData.slk').read_bytes())
    mortar=catalog['unit'];workshop=catalog['building'];assert [mortar[k] for k in ['hp','gold','wood','food','time','speed','armorValue']]==[360,180,70,3,32,2.7,0]
    assert [workshop[k] for k in ['hp','gold','wood','time','armorValue']]==[1200,140,140,60,5];assert workshop['requires']==['hkee','hbla']
    for d in [mortar,workshop]:
        source=d['sourceUnit'];assert d['sourceRows']['UnitBalance']==balance[source] and d['sourceRows']['UnitWeapons']==weapons[source]
    assert weapons['hmtm']['weapsOn']=='3';assert mortar['weapons'][0]['weaponType']=='artillery' and mortar['weapons'][1]['weaponType']=='missile'
    assert mortar['weapons'][0]['splashBands']==[[.25,1],[1.5,.4],[2.5,.1]] and mortar['weapons'][1]['splashBands']==[]
    assert mortar['weapons'][0]['targets']==['ground','debris','tree','wall','item','ward'];assert mortar['weapons'][1]['targets']==['structure']
    for weapon in mortar['weapons']:assert [weapon[k] for k in ['damage','cooldown','damagePoint','range','minRange','missileSpeed','missileArc']]==[58,3.5,1,11.5,2.5,9,.35]
    for key,r in catalog['research'].items():assert r['sourceRow']==upgrades[key]
    assert [catalog['research']['Rhfl'][k] for k in ['gold','wood','time','requires']]==[50,50,30,['hkee']]
    assert [catalog['research']['Rhfs'][k] for k in ['gold','wood','time','requires']]==[50,100,40,['hcas']]
    flare=catalog['abilities']['Afla'];shards=catalog['abilities']['Afsh'];assert flare['sourceRow']==ability['Afla'] and shards['sourceRow']==ability['Afsh']
    assert [flare[k] for k in ['duration','cooldown','radius','range','delay','detectionType']]==[15,120,18,999.99,.8,3]
    assert shards['damageBands']==[[1,25],[2.75,18],[2.5,12]] and shards['armorTargets']==['unarmored','medium'];assert shards['sourceRow']['targs1']=='ground,enemy,neutral'
    artifacts=read(SAMPLE/'human-mortar-effects.json');particle_count=0;sidecars=set();guids=set()
    for name,art in artifacts.items():
        effect=read(SAMPLE/art['effect']);assert len(art['animations'])==len(effect['clips'])
        for material in effect['materials']:
            if material.get('texture'):assert (SAMPLE/material['texture']).is_file()
        particles=sum(len(f['particles']) for clip in effect['clips'] for f in clip['frames']);assert particles>0,name;particle_count+=particles
        for part in art['parts']:
            blob=(SAMPLE/part['animatedMesh']).read_bytes();assert blob[:4]==b'glTF';doc=json.loads(blob[20:20+struct.unpack_from('<I',blob,12)[0]])
            assert doc.get('animations'),part['animatedMesh'];material=part['material'];assert (SAMPLE/material).is_file();sidecars.add(material+'.meta')
    for p in sidecars:
        meta=read(SAMPLE/p);assert meta['guid'] not in guids,p;guids.add(meta['guid'])
    with tempfile.TemporaryDirectory(prefix='human-mortar-source-',dir=ROOT/'tmp') as folder:
        output=pathlib.Path(folder);command=[sys.executable,'-B',str(ROOT/'scripts/import-frost-human-mortar.py'),'--output',str(output)];run=subprocess.run(command,capture_output=True,text=True,encoding='utf-8');assert run.returncode==0,run.stderr
        for item in receipt['files']:assert (output/item['path']).read_bytes()==(SAMPLE/item['path']).read_bytes(),item['path']
        assert (output/'human-mortar-sources.json').read_bytes()==(SAMPLE/'human-mortar-sources.json').read_bytes()
        target=output/'human-mortar.json';target.write_bytes(target.read_bytes()+b' ');before={p:p.read_bytes() for p in output.rglob('*') if p.is_file()};run=subprocess.run(command,capture_output=True,text=True,encoding='utf-8');assert run.returncode!=0 and 'Preserve edited output' in run.stderr
        assert all(p.read_bytes()==raw for p,raw in before.items()),'Refused import must preserve every output'
    print('PASS source Mortar/Workshop: exact dual weapon targeting/timing/minimum range and splash; Flare delay/detection; raw nonmonotonic Shards data; %d signed data/effect outputs, %d sampled particles, %d unique effect material sidecars; source reproduction and edited-output protection'%(len(receipt['files'])+len(effects['outputs']),particle_count,len(sidecars)))


if __name__=='__main__':main()
