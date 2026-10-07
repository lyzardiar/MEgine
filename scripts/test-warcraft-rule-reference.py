"""Author: MiYu. Test the measurement acceptance gate with synthetic data, not runtime evidence."""
import importlib
import pathlib
import tempfile
import unittest

analyze = importlib.import_module('analyze-warcraft-rule-reference').analyze


def fixture():
    data = {'completed':1, 'cacheSaved':1}
    ids = {'claw':'edoc', 'bear':'edcm', 'talon':'edot', 'crow':'edtm'}
    for name in ['claw.fixed.before','bear.fixed.after','claw.fixed.return','claw.half.before','bear.half.after','claw.half.return','claw.regen.after','bear.regen.after','talon.regen.after','crow.after','crow.regen.after','talon.return']:
        data.update({name+'.'+k:v for k,v in dict(hp=100,maxHp=500,mana=10,maxMana=400,height=0,type=int.from_bytes(ids[name.split('.')[0]].encode(), 'big')).items()})
    for name in ids: data.update({name+'.regen.start':0,name+'.regen.end':5})
    for phase, order in [(0,'bearform'),(1,'unbearform'),(2,'bearform'),(3,'unbearform'),(5,'bearform'),(8,'ravenform'),(10,'unravenform')]: data['order.'+str(phase)+'.'+order] = 1
    for name in ['takeoff','landing']:
        for i in range(30): data.update({name+'.'+str(i)+'.'+k:v for k,v in dict(time=i*.1,height=240,type=int.from_bytes(b'edtm','big')).items()})
    for case, counts in enumerate([(1,0),(2,0),(1,1)]):
        prefix='poison.'+str(case)
        data.update({prefix+'.'+k:v for k,v in dict(hitsA=counts[0],hitsB=counts[1],baselineTime=1,endTime=5,baselineHp=300,endHp=284,controlBaselineHp=300,controlEndHp=301).items()})
        sources = [1]*counts[0]+[2]*counts[1]+[1]
        for i, source in enumerate(sources): data.update({prefix+'.event.'+str(i)+'.'+k:v for k,v in dict(damage=18 if i<len(sources)-1 else 4,source=source,time=i*.1).items()})
    return data


class ReferenceTests(unittest.TestCase):
    def check(self, data, suffix=''):
        with tempfile.TemporaryDirectory() as temp:
            path=pathlib.Path(temp)/'synthetic.pld'
            path.write_text('\n'.join('call Preload("MENGINE|'+k+'='+str(v)+'")' for k,v in data.items())+suffix, encoding='utf-8')
            return analyze(path)
    def test_valid_synthetic_gate(self):
        result=self.check(fixture())
        self.assertEqual(result['manaRegeneration']['bear']['manaPerSecond'],2)
        self.assertEqual(result['poison'][2]['regenAdjustedWindowLoss'],17)
        self.assertEqual(len(result['flight']['takeoff']),30)
    def test_incomplete(self):
        data=fixture();data['completed']=0
        with self.assertRaisesRegex(ValueError,'did not complete'): self.check(data)
    def test_missing_and_wrong_form(self):
        data=fixture();del data['takeoff.29.type']
        with self.assertRaisesRegex(ValueError,'Missing measurement'): self.check(data)
        data=fixture();data['bear.fixed.after.type']=int.from_bytes(b'edoc','big')
        with self.assertRaisesRegex(ValueError,'unit type differs'): self.check(data)
    def test_contaminated_hits(self):
        data=fixture();data['poison.2.hitsB']=0
        with self.assertRaisesRegex(ValueError,'attack identities'): self.check(data)
        data=fixture();data['poison.0.event.1.damage']=18
        with self.assertRaisesRegex(ValueError,'trace disagrees'): self.check(data)
    def test_wrong_interval(self):
        data=fixture();data['poison.0.endTime']=4
        with self.assertRaisesRegex(ValueError,'observation interval'): self.check(data)
    def test_duplicate(self):
        with self.assertRaisesRegex(ValueError,'Duplicate measurement'): self.check(fixture(),'\nMENGINE|completed=1')


if __name__ == '__main__': unittest.main()
