"""Author: MiYu. Classic override decoding and unit/item inheritance preserve source values."""
import copy
import struct
import unittest
from unittest.mock import patch
from warcraft_object_data import parse_objects, unit_tables, doodad_tables
from warcraft_unit_bindings import ini


def objects(original=(), custom=(), version=1, levels=None):
    result = struct.pack('<i', version)
    for table in [original, custom]:
        result += struct.pack('<i', len(table))
        for base, target, changes in table:
            result += base.encode() + target.encode() + struct.pack('<i', len(changes))
            for field, kind, value in changes:
                result += field.encode() + struct.pack('<i', kind)
                if levels is not None: result += struct.pack('<2i', *levels.get(field, (0, 0)))
                result += struct.pack('<i', value) if kind == 0 else struct.pack('<f', value) if kind in (1, 2) else value.encode() + b'\0'
                result += b'last'
    return result


class ObjectDataTests(unittest.TestCase):
    def test_doodad_variations_and_destructable_inheritance(self):
        tables = {'Doodads':{'AOob':{'file':'old.mdl','numVar':'3','vertR01':'255','vertR02':'255'}},'DestructableData':{'ATtr':{'file':'tree.mdl','colorR':'255'}},'DoodadMetaData':{'dfil':{'field':'file','repeat':'0'},'dvr1':{'field':'vertR','repeat':'10'}},'DestructableMetaData':{'bvcr':{'field':'colorR'}}}
        members = {'war3map.w3b':objects(custom=[('ATtr','B001',[('bvcr',0,190)])]),'war3map.w3d':objects(custom=[('AOob','D001',[('dfil',3,'custom.mdx'),('dvr1',0,100),('xxxx',0,8)])],levels={'dvr1':(2,0)})}
        with patch('warcraft_object_data.rows', side_effect=lambda key:copy.deepcopy(tables[key])):
            result=doodad_tables(lambda path:path.split('/')[-1][:-4],members,{})
        self.assertEqual(result['destructables']['B001']['colorR'],'190')
        self.assertEqual(result['definitions']['D001']['file'],'custom.mdx')
        self.assertEqual(result['definitions']['D001']['vertR01'],'255')
        self.assertEqual(result['definitions']['D001']['vertR02'],'100')
        self.assertEqual(result['overrides'][-1]['preserved'],['xxxx'])
        with self.assertRaises(ValueError):parse_objects(members['war3map.w3d'][:-1],'doodad',extended=True)

    def test_source_profile_accepts_unassigned_item_description_lines(self):
        profile = ini(b'[item]\nName=Medusa Pebble\nPurchase Medusa Pebble\nTip=Purchase\n')
        self.assertEqual(profile['item']['Name'], 'Medusa Pebble')
        self.assertEqual(profile['item']['Tip'], 'Purchase')

    def test_versions_types_and_source_markers(self):
        self.assertEqual(parse_objects(objects(custom=[('hfoo','H001',[('unam',3,'')])]), 'unit')[0]['changes'], [('unam','')])
        for version in [1, 2]:
            raw = objects(custom=[('hfoo','H001',[('uhpm',0,300),('usca',1,1.5),('umvh',2,35.0),('unam',3,'名字')])],version=version)
            row = parse_objects(raw, 'unit')[0]
            self.assertEqual(row['changes'], [('uhpm',300),('usca',1.5),('umvh',35.0),('unam','名字')])
            self.assertEqual(row['endMarkers'], ['last']*4)
            for malformed in [raw[:-1],raw+b'x',struct.pack('<i',3)+raw[4:],raw[:4]+struct.pack('<i',-1)+raw[8:]]:
                with self.assertRaises(ValueError): parse_objects(malformed,'unit')

    def tables(self):
        return {'UnitUI':{'hfoo':{'file':'old.mdl','modelScale':'1','red':'255'}},'UnitData':{'hfoo':{'moveHeight':'0'}},'UnitBalance':{'hfoo':{'HP':'100'}},'ItemData':{'phea':{'file':'chest.mdl','HP':'75'}},'UnitMetaData':{'umdl':{'slk':'UnitUI','field':'file','index':'-1'},'usca':{'slk':'UnitUI','field':'modelScale','index':'-1'},'uhpm':{'slk':'UnitBalance','field':'HP','index':'-1'},'ihtp':{'slk':'ItemData','field':'HP','index':'-1'}}}

    def resolve(self, tables, members):
        with patch('warcraft_object_data.rows', side_effect=lambda raw: copy.deepcopy(tables[raw])):
            return unit_tables(lambda path:path.split('/')[-1][:-4], members, {'7':'自定义单位'})

    def test_inherit_changed_base_and_keep_siblings_isolated(self):
        tables=self.tables();before=copy.deepcopy(tables)
        raw=objects(original=[('hfoo','\0'*4,[('uhpm',0,150)])],custom=[('hfoo','H001',[('umdl',3,'custom.mdx'),('usca',2,2.0),('unam',3,'TRIGSTR_007'),('uabi',3,'AHbz')]),('hfoo','H002',[])])
        resolved=self.resolve(tables,{'war3map.w3u':raw})
        self.assertEqual(resolved['ui']['H001']['file'],'custom.mdx');self.assertEqual(resolved['ui']['H002']['file'],'old.mdl')
        self.assertEqual(resolved['balance']['H001']['HP'],'150');self.assertEqual(resolved['names']['H001'],'自定义单位')
        self.assertEqual(resolved['aliases']['H001'],'hfoo');self.assertEqual(resolved['overrides'][1]['preserved'],['uabi']);self.assertEqual(tables,before)

    def test_item_overrides_in_both_classic_tables(self):
        for file in ['war3map.w3u','war3map.w3t']:
            resolved=self.resolve(self.tables(),{file:objects(custom=[('phea','I001',[('ihtp',0,200),('unam',3,'Potion')])])})
            self.assertEqual(resolved['ui']['I001']['file'],'chest.mdl');self.assertEqual(resolved['balance']['I001']['HP'],'200');self.assertEqual(resolved['names']['I001'],'Potion')
            self.assertEqual(resolved['movement']['I001']['moveHeight'],'0')

    def test_missing_base_duplicate_and_nonfinite_rejected(self):
        for entries in [[('none','H001',[])],[('hfoo','H001',[]),('hfoo','H001',[])]]:
            with self.assertRaises(ValueError):self.resolve(self.tables(),{'war3map.w3u':objects(custom=entries)})
        with self.assertRaises(ValueError):parse_objects(objects(custom=[('hfoo','H001',[('usca',1,float('nan'))])]),'unit')


if __name__ == '__main__':
    unittest.main()
