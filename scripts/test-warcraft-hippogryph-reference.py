"""Author: MiYu. Synthetic acceptance-gate checks; these are not original-game measurements."""
import hashlib
import importlib
import json
import pathlib
import tempfile
import unittest

analyze=importlib.import_module('analyze-warcraft-hippogryph-reference').analyze


def fixture():
    data={'completed':1}
    for i in range(4):
        p='case.'+str(i);data.update({p+'.'+k:v for k,v in {'mount.accepted':1,'dismount.accepted':0,'dismount.retry':1,'mount.start':0,'mount.end':6,'dismount.start':6,'dismount.end':39,'before.food':4,'mounted.food':4,'returned.food':4}.items()})
        hp=[(245,525),(100,200),(200,100),(245,525)][i]
        for name,kind,maxHp,current,id in [('archer.before','earc',245,hp[0],1),('hippo.before','ehip',525,hp[1],2),('rider.after','ehpr',765,400,3),('rider.wounded','ehpr',765,300,3),('archer.return','earc',245,100,4),('hippo.return','ehip',525,200,5),('archer.approach','earc',245,hp[0],1),('hippo.approach','ehip',525,hp[1],2),('archer.after','earc',245,0,1),('hippo.after','ehip',525,0,2)]:
            data.update({p+'.'+name+'.'+k:v for k,v in dict(type=int.from_bytes(kind.encode(),'big'),id=id,hp=current,maxHp=maxHp,x=0,y=0,height=0,order=0,owner=0,hidden=0).items()})
    return data


class GateTests(unittest.TestCase):
    def run_fixture(self,data,tag='SyntheticHippo',extra='',bad_hash=False):
        with tempfile.TemporaryDirectory(prefix='hippo-reference-gate-') as temp:
            root=pathlib.Path(temp);map=root/'synthetic.w3x';map.write_bytes(b'synthetic acceptance fixture, not a real map')
            receipt=root/'receipt.json';receipt.write_text(json.dumps(dict(map=str(map),mapSha256='bad' if bad_hash else hashlib.sha256(map.read_bytes()).hexdigest(),tag='SyntheticHippo',scriptSha256='synthetic',runtime={})),encoding='utf-8')
            file=root/'result.pld';file.write_text('MENGINE|tag='+tag+'\n'+'\n'.join('MENGINE|'+k+'='+str(v) for k,v in data.items())+'\n'+extra,encoding='utf-8')
            return analyze(file,receipt)
    def test_complete(self):
        result=self.run_fixture(fixture());self.assertEqual(len(result['cases']),4);self.assertEqual(result['cases'][0]['mounted']['type'],int.from_bytes(b'ehpr','big'));self.assertEqual(result['cases'][3]['order'],'coupleinstant')
    def test_missing(self):
        for k in ['completed','case.0.archer.approach.x','case.3.hippo.return.type','case.2.dismount.accepted']:
            data=fixture();del data[k]
            with self.assertRaises(ValueError):self.run_fixture(data)
    def test_bad_measurements(self):
        for key,value in [('case.0.mount.accepted',0),('case.0.mounted.food',6),('case.1.archer.before.hp',245),('case.2.rider.after.type',int.from_bytes(b'ehip','big')),('case.3.archer.return.hidden',1),('case.0.dismount.end',20),('case.0.rider.wounded.id',6)]:
            data=fixture();data[key]=value
            with self.assertRaises(ValueError):self.run_fixture(data)
    def test_duplicate(self):
        with self.assertRaises(ValueError):self.run_fixture(fixture(),extra='MENGINE|completed=1')
    def test_wrong_tag(self):
        with self.assertRaises(ValueError):self.run_fixture(fixture(),tag='OtherHippo')
    def test_wrong_map(self):
        with self.assertRaises(ValueError):self.run_fixture(fixture(),bad_hash=True)


if __name__=='__main__':unittest.main()
