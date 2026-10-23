"""Author: MiYu. Verify classic unit placements, malformed records and selected map sources."""
import argparse
from collections import Counter
import importlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
from warcraft_units import parse_units, encode_units

pack = lambda fmt,*values:struct.pack('<'+fmt,*values)


def fixture(version, subversion, random_flag):
    raw = b'W3do'+pack('3i',version,subversion,1)
    raw += b'Hpal'+pack('i7fBiHii',2,-128.25,256.5,384.75,-1.25,1.25,.75,2.5,0x82,15,0xa581,-1,75)
    if subversion > 10:
        raw += pack('i',-1)
    raw += pack('2i',2,2)+b'phea'+pack('i',35)+b'ratf'+pack('2i',65,0)
    raw += pack('ifi',12500,-2.0,7)
    if subversion > 10:
        raw += pack('3i',20,21,22)
    raw += pack('2i',1,5)+b'ratf'+pack('i',1)+b'AHhb'+pack('3i',1,3,random_flag)
    if random_flag == 0:
        raw += pack('4B',0xff,0xfe,0x80,7)
    elif random_flag == 1:
        raw += pack('2I',0x80000000,0xffffffff)
    elif random_flag == 2:
        raw += pack('i',2)+b'hfoo'+pack('i',25)+b'hrif'+pack('i',75)
    return raw+pack('3i',-1,-1,1234)


class UnitTests(unittest.TestCase):
    def test_fields_and_all_random_modes(self):
        for version,subversion in [(7,9),(8,11)]:
            for flag in [-1,0,1,2]:
                raw=fixture(version,subversion,flag);data=parse_units(raw);u=data['units'][0]
                self.assertEqual(encode_units(data),raw)
                self.assertEqual(u['location'],[-128.25,256.5,384.75]);self.assertEqual(u['scale'],[1.25,.75,2.5])
                self.assertEqual((u['player'],u['unknown'],u['hitpoints'],u['mana'],u['goldAmount']),(15,0xa581,-1,75,12500))
                self.assertEqual(u['droppedItemSets'],[dict(items=[dict(id='phea',chance=35),dict(id='ratf',chance=65)]),dict(items=[])])
                self.assertEqual(u['itemsInInventory'],[dict(slot=5,id='ratf')])
                self.assertEqual(u['modifiedAbilities'],[dict(id='AHhb',activeForAutocast=1,heroLevel=3)])
                self.assertEqual('heroStrength' in u,subversion==11)
                self.assertEqual(u['targetAcquisition'],-2)
                if flag==0:self.assertEqual(u['level'],[255,254,128])
                if flag==1:self.assertEqual((u['unitGroup'],u['positionInGroup']),(0x80000000,0xffffffff))
                if flag==2:self.assertEqual(u['randomUnitTables'],[dict(id='hfoo',chance=25),dict(id='hrif',chance=75)])

    def test_every_truncation(self):
        for version,subversion in [(7,9),(8,11)]:
            for flag in [-1,0,1,2]:
                raw=fixture(version,subversion,flag)
                for cut in range(len(raw)):
                    with self.assertRaises(ValueError,msg=f'{version}/{flag} at {cut}'):parse_units(raw[:cut])
                with self.assertRaisesRegex(ValueError,'trailing'):parse_units(raw+b'\0')

    def test_invalid_header_float_count_and_random_mode(self):
        raw=fixture(8,11,-1)
        for offset,replacement in [(0,b'W3xx'),(4,pack('i',9)),(8,pack('i',10)),(12,pack('i',-1)),(12,pack('i',2147483647)),(24,pack('f',float('nan'))),(36,pack('f',float('inf'))),(71,pack('i',-1)),(75,pack('i',2147483647)),(len(raw)-16,pack('i',3))]:
            data=bytearray(raw);data[offset:offset+len(replacement)]=replacement
            with self.assertRaises(ValueError,msg=str(offset)):parse_units(data)

    def test_empty(self):
        raw=b'W3do'+pack('3i',8,11,0)
        self.assertEqual(parse_units(raw)['units'],[]);self.assertEqual(encode_units(parse_units(raw)),raw)

    def test_export_keeps_placements_overrides_and_receipts(self):
        from warcraft_mpq_writer import build_archive
        _,members=importlib.import_module('test-warcraft-map').map_fixture()
        members['war3mapUnits.doo']=fixture(8,11,-1)
        for suffix in ['w3u','w3t','w3a']:members['war3map.'+suffix]=b'opaque override '+suffix.encode()
        parent=Path(__file__).resolve().parents[1]/'tmp/docs-artifacts/warcraft-map-tests';parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='unit-export-',dir=parent) as temporary:
            source=Path(temporary)/'source.w3x';source.write_bytes(build_archive(members))
            output=Path(temporary)/'export';data=importlib.import_module('import-frost-original-map').export_map(source,output)
            self.assertEqual(data['units'],parse_units(members['war3mapUnits.doo']))
            self.assertEqual(data['coverage']['units'],'decoded-editor-placements');self.assertFalse(data['coverage']['runtimePlayable'])
            self.assertEqual(len(data['importer']['unitReaderSha256']),64)
            for key,suffix in [('unitOverrides','w3u'),('itemOverrides','w3t'),('abilityOverrides','w3a')]:
                self.assertEqual(data['coverage'][key],'preserved-unparsed')
                self.assertEqual((output/data['source']['members']['war3map.'+suffix]['preservedFile']).read_bytes(),members['war3map.'+suffix])


def exports(output, maps):
    output.mkdir(parents=True,exist_ok=False);entries=[]
    for version,subversion in [(7,9),(8,11)]:
        for flag in [-1,0,1,2]:
            name=f'fixture-{version}-{flag}';raw=fixture(version,subversion,flag)
            (output/(name+'.doo')).write_bytes(raw);(output/(name+'.json')).write_text(json.dumps(parse_units(raw)),encoding='utf-8')
            entries.append(dict(name=name,raw=name+'.doo',decoded=name+'.json'))
    for index,source in enumerate(maps):
        data=importlib.import_module('import-frost-original-map').export_map(source,output/f'map-{index}')
        member=data['source']['members']['war3mapUnits.doo'];raw=(output/f'map-{index}'/member['preservedFile']).read_bytes()
        assert encode_units(data['units'])==raw
        name=f'map-{index}';(output/(name+'.json')).write_text(json.dumps(data['units']),encoding='utf-8')
        entries.append(dict(name=source.name,raw=f'map-{index}/'+member['preservedFile'],decoded=name+'.json',mapSha256=data['source']['sha256'],counts=dict(Counter(u['id'] for u in data['units']['units']))))
    (output/'manifest.json').write_text(json.dumps(entries,indent=2),encoding='utf-8');print(json.dumps(dict(output=str(output),inputs=len(entries))))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path);parser.add_argument('--maps',nargs='*',type=Path,default=[]);args=parser.parse_args()
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(UnitTests))
    if not result.wasSuccessful():raise SystemExit(1)
    if args.output:exports(args.output,args.maps)
