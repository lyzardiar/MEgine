"""Author: MiYu. Verify pinned PKWARE data, MPQ compression paths and rejected output sizes."""
import hashlib
import io
import json
import struct
import unittest
from pathlib import Path
from types import SimpleNamespace
import warcraft_mpq as reader

ROOT=Path(__file__).resolve().parents[1]
PACK=(ROOT/'third_party/blast/test.pk').read_bytes()
TEXT=(ROOT/'third_party/blast/test.txt').read_bytes()

def archive(data,flags,size=len(TEXT)):
    block=SimpleNamespace(offset=0,archived_size=len(data),size=size,flags=flags)
    return SimpleNamespace(file=io.BytesIO(data),header={'offset':0,'sector_size_shift':0},block_table=[block],get_hash_table_entry=lambda _:SimpleNamespace(block_table_index=0),_hash=lambda *_:0)

class PkwareTests(unittest.TestCase):
    def test_pinned_sources(self):
        for record in json.loads((ROOT/'third_party/blast/source.json').read_bytes())['files']:
            raw=(ROOT/'third_party/blast'/record['path']).read_bytes()
            self.assertEqual(len(raw),record['bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(),record['sha256'])
    def test_upstream_vector(self):
        self.assertEqual(reader.explode(PACK,len(TEXT)),TEXT)
    def test_rejected_output_and_truncation(self):
        for data,size in [(PACK,len(TEXT)-1),(PACK,len(TEXT)+1),(PACK[:-2],len(TEXT)),(b'\x09\xff',len(TEXT))]:
            with self.subTest(size=size,data=data),self.assertRaises(ValueError):reader.explode(data,size)
    def test_single_unit_paths(self):
        for flag,data in [(reader.mpyq.MPQ_FILE_IMPLODE,PACK),(reader.mpyq.MPQ_FILE_COMPRESS,b'\x08'+PACK)]:
            self.assertEqual(reader.read_archive(archive(data,flag|reader.mpyq.MPQ_FILE_SINGLE_UNIT),'fixture.txt'),TEXT)
    def test_sector_paths_and_uncompressed_storage(self):
        for flag,data in [(reader.mpyq.MPQ_FILE_IMPLODE,PACK),(reader.mpyq.MPQ_FILE_COMPRESS,b'\x08'+PACK),(reader.mpyq.MPQ_FILE_IMPLODE,TEXT)]:
            self.assertEqual(reader.read_archive(archive(struct.pack('<II',8,8+len(data))+data,flag),'fixture.txt'),TEXT)
    def test_sector_offsets_rejected(self):
        with self.assertRaisesRegex(ValueError,'invalid sector offsets'):
            reader.read_archive(archive(struct.pack('<II',7,100)+PACK,reader.mpyq.MPQ_FILE_IMPLODE),'fixture.txt')

if __name__=='__main__':unittest.main()
