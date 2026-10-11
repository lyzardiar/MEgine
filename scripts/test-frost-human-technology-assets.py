"""Author: MiYu. Verify original human upgrade/Defend tables, source command art and signed bytes."""
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
    receipt=json.loads((SAMPLE/'human-technology-sources.json').read_bytes());catalog=json.loads((SAMPLE/'human-technology.json').read_bytes())
    for row in receipt['sources']:
        raw=(SAMPLE/'SourceAssets/HumanTechnology'/row['path']).read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256'],row['path']
    for row in receipt['files']:
        raw=(SAMPLE/row['path']).read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256'],row['path']
        if row['path'].endswith('.png'):assert raw[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',raw[16:24])==(64,64)
    for row in receipt['generators']:assert sha((ROOT/row['path']).read_bytes())==row['sha256'],row['path']
    upgrade=rows((SAMPLE/'SourceAssets/HumanTechnology/Units/UpgradeData.slk').read_bytes());ability=rows((SAMPLE/'SourceAssets/HumanTechnology/Units/AbilityData.slk').read_bytes())['Adef']
    for key,r in catalog['research'].items():
        assert r['sourceRow']==upgrade[key];assert [r['gold'],r['wood'],r['time']]==[int(upgrade[key]['goldbase']),int(upgrade[key]['lumberbase']),float(upgrade[key]['timebase'])]
        assert r['slot']==sum(int(v)*f for v,f in zip(r['sourceFunc']['Buttonpos'].split(','),[1,4]))
    assert catalog['defend']['sourceRow']==ability
    assert [catalog['defend'][k] for k in ['incomingPiercingFactor','movementMultiplier','reflectChance','reflectedPiercingFactor']]==[.5,.7,.3,0]
    assert [catalog['rangeBonus'],catalog['healthBonus']]==[2,150]
    assert catalog['research']['Rhri']['requires']==['hkee'];assert catalog['research']['Rhan']['requires']==['hlum','hcas','hbla']
    print('PASS human technology source rows, original upgrade prerequisites/costs/times/slots, Defend metadata, ten 64px icons and %d signed outputs'%len(receipt['files']))


if __name__=='__main__':main()
