"""Author: MiYu. Verify classic placement records, malformed inputs and source-map round trips."""
import argparse
import collections
import hashlib
import importlib
import io
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
from warcraft_doodads import parse_doodads, encode_doodads
from warcraft_mpq import mpyq, read_archive
from warcraft_mpq_writer import build_archive

pack = lambda fmt,*args:struct.pack('<'+fmt,*args)


def fixture(version):
    # Literal bytes independently specify two placements, asymmetric scaling, reserved bits,
    # signed editor IDs, nested drops and a cliff doodad with unsigned grid coordinates.
    raw = b'W3do'+pack('3i',version,9 if version==7 else 11,2)
    for index in range(2):
        raw += b'LTlt'+pack('i7f2B',index,-128.25,256.5,384.75,-math.pi/2,1.25,.75,2.5,0x82,100 if index==0 else 0)
        if version==8:
            raw += pack('II',0xffffffff,2)+pack('I',2)+b'phea'+pack('i',35)+b'ratf'+pack('i',65)+pack('I',0)
        raw += pack('i',-10+index)
    return raw+pack('2I',7,1)+b'YSc1'+pack('3I',0x80000000,0xffffffff,57)


class DoodadTests(unittest.TestCase):
    def test_versions_and_exact_fields(self):
        for version in (7,8):
            raw=fixture(version);data=parse_doodads(raw);d=data['doodads'][0]
            self.assertEqual(encode_doodads(data),raw)
            self.assertEqual(d['location'],[-128.25,256.5,384.75])
            self.assertEqual(d['scale'],[1.25,.75,2.5])
            self.assertAlmostEqual(d['angle'],-math.pi/2,places=6)
            self.assertEqual((d['flags'],d['life'],d['editorId']),(0x82,100,-10))
            self.assertEqual(data['terrainDoodads'],[dict(id='YSc1',unknown=0x80000000,location=[0xffffffff,57])])
            self.assertEqual('itemSets' in d,version==8)
            if version==8:
                self.assertEqual(d['itemTable'],0xffffffff)
                self.assertEqual(d['itemSets'],[[dict(id='phea',chance=35),dict(id='ratf',chance=65)],[]])

    def test_every_truncation_and_trailing_bytes(self):
        for version in (7,8):
            raw=fixture(version)
            for size in range(len(raw)):
                with self.assertRaises(ValueError,msg=f'version {version}, cut {size}'):
                    parse_doodads(raw[:size])
            with self.assertRaisesRegex(ValueError,'trailing'):
                parse_doodads(raw+b'\0')

    def test_invalid_header_count_and_nonfinite_values(self):
        for offset,replacement in [(0,b'W3xx'),(4,pack('i',9)),(12,pack('i',-1)),(12,pack('i',2147483647)),(24,pack('f',float('nan'))),(36,pack('f',float('inf'))),(40,pack('f',float('-inf'))),(58,pack('i',-1))]:
            raw=bytearray(fixture(8));raw[offset:offset+len(replacement)]=replacement
            with self.assertRaises(ValueError,msg=f'bad field {offset}'):
                parse_doodads(bytes(raw))

    def test_empty_file_and_arbitrary_fourcc(self):
        raw=b'W3do'+pack('5I',8,11,0,0xffffffff,0)
        self.assertEqual(encode_doodads(parse_doodads(raw)),raw)
        raw=bytearray(fixture(7));raw[16:20]=bytes([0,127,128,255])
        self.assertEqual(encode_doodads(parse_doodads(raw)),raw)

    def test_import_preserves_overrides_and_records_hash(self):
        testmap=importlib.import_module('test-warcraft-map')
        _,members=testmap.map_fixture();members.update({'war3map.doo':fixture(8),'war3map.w3b':b'preserved destructibles','war3map.w3d':b'preserved doodads'})
        importer=importlib.import_module('import-frost-original-map')
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'map.w3x';source.write_bytes(build_archive(members));before=source.read_bytes()
            exported=importer.export_map(source,Path(folder)/'export')
            self.assertEqual(exported['coverage']['doodads'],'decoded')
            self.assertEqual(exported['coverage']['destructibleOverrides'],'preserved-unparsed')
            self.assertEqual(exported['coverage']['doodadOverrides'],'preserved-unparsed')
            self.assertEqual(encode_doodads(exported['doodads']),members['war3map.doo'])
            for name in ['war3map.doo','war3map.w3b','war3map.w3d']:
                self.assertEqual((Path(folder)/'export'/exported['source']['members'][name]['preservedFile']).read_bytes(),members[name])
            self.assertEqual(exported['importer']['doodadReaderSha256'],hashlib.sha256(Path(__file__).with_name('warcraft_doodads.py').read_bytes()).hexdigest())
            self.assertEqual(source.read_bytes(),before)


def verify_maps(root,report_path):
    passed,failed,absent=[],[],[]
    for source in sorted([*root.rglob('*.w3m'),*root.rglob('*.w3x')]):
        try:
            raw=source.read_bytes();offset=512 if raw[:4]==b'HM3W' else 0
            archive=mpyq.MPQArchive(io.BytesIO(raw[offset:]),listfile=False)
            try:data=read_archive(archive,'war3map.doo')
            except FileNotFoundError:
                absent.append(str(source.relative_to(root)));continue
            finally:archive.file.close()
            parsed=parse_doodads(data)
            assert encode_doodads(parsed)==data,'byte round trip differs'
            passed.append(dict(path=str(source.relative_to(root)),mapSha256=hashlib.sha256(raw).hexdigest(),memberSha256=hashlib.sha256(data).hexdigest(),version=parsed['version'],subversion=parsed['subversion'],count=len(parsed['doodads']),terrainCount=len(parsed['terrainDoodads']),types=dict(collections.Counter(d['id'] for d in parsed['doodads']))))
        except Exception as error:
            failed.append(dict(path=str(source.relative_to(root)),error=str(error)))
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(dict(passed=passed,failed=failed,absent=absent),indent=2,ensure_ascii=False),encoding='utf-8')
    print(f'Doodads: {len(passed)} exact round trips, {len(failed)} rejected, {len(absent)} absent; {report_path}')
    if failed:print(json.dumps(failed[:8],ensure_ascii=False))
    return bool(passed) and not failed


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--maps',type=Path);parser.add_argument('--report',type=Path,default=Path('tmp/docs-artifacts/frost-original-doodads/corpus.json'))
    args=parser.parse_args();passed=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DoodadTests)).wasSuccessful()
    if args.maps and passed:passed=verify_maps(args.maps,args.report)
    raise SystemExit(0 if passed else 1)
