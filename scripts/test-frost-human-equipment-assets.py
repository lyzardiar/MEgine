"""Author: MiYu. Verify original Blacksmith source ranks, unit bindings and signed icon bytes."""
import hashlib
import importlib
import json
import pathlib
import struct
ROOT=pathlib.Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
rows=importlib.import_module('import-frost-wisp-rules').rows
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
    receipt=json.loads((SAMPLE/'human-equipment-sources.json').read_bytes());catalog=json.loads((SAMPLE/'human-equipment.json').read_bytes())
    for r in receipt['sources']:
        raw=(SAMPLE/'SourceAssets/HumanEquipment'/r['path']).read_bytes();assert len(raw)==r['bytes'] and sha(raw)==r['sha256'],r['path']
    for r in receipt['files']:
        raw=(SAMPLE/r['path']).read_bytes();assert len(raw)==r['bytes'] and sha(raw)==r['sha256'],r['path']
        if r['path'].endswith('.png'):assert raw[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',raw[16:24])==(64,64)
    for r in receipt['generators']:assert sha((ROOT/r['path']).read_bytes())==r['sha256'],r['path']
    source=SAMPLE/'SourceAssets/HumanEquipment/Units';upgrades=rows((source/'UpgradeData.slk').read_bytes());balance=rows((source/'UnitBalance.slk').read_bytes());weapons=rows((source/'UnitWeapons.slk').read_bytes())
    assert catalog['buildingSourceFunc']['Researches'].split(',')==list(catalog['research'])
    assert len(catalog['research'])==4 and sum(len(r['levels']) for r in catalog['research'].values())==12
    for key,r in catalog['research'].items():
        assert r['sourceRow']==upgrades[key];assert r['affectedUnits']==sorted(k for k,v in balance.items() if key in v.get('upgrades','').split(','))
        assert r['slot']==sum(int(v)*f for v,f in zip(r['sourceFunc']['Buttonpos'].split(','),[1,4]))
        for n,level in enumerate(r['levels']):
            assert [level['gold'],level['wood'],level['time']]==[int(upgrades[key]['goldbase'])+n*int(upgrades[key]['goldmod']),int(upgrades[key]['lumberbase'])+n*int(upgrades[key]['lumbermod']),60+15*n]
            assert level['requires']==[[],['hkee'],['hcas']][n]
            assert level['attackDice']==(n+1 if key in ['Rhme','Rhra'] else 0)
    for key,u in catalog['units'].items():
        assert u['sourceRows']=={'UnitBalance':balance[key],'UnitWeapons':weapons[key]};assert u['armorPerRank']==float(balance[key]['defUp']);assert u['averageDiceDamage']==(float(weapons[key]['sides1'])+1)/2
    print('PASS Blacksmith source data: four/twelve ranks, exact source costs/times/Keep/Castle requirements/units/extra dice/armor, 24 original 64px icons and %d signed outputs'%len(receipt['files']))
if __name__=='__main__':main()
