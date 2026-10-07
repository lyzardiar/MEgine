"""Author: MiYu. Verify map probe archives with the pinned independent MPQ reader."""
import io
import unittest
from warcraft_mpq import mpyq, read_archive
from warcraft_mpq_writer import build_archive, encrypt_table


class WriterTests(unittest.TestCase):
    def test_bytes_collisions_and_case_lookup(self):
        files = {'war3map.j': b'function main takes nothing returns nothing\nendfunction\n', 'empty': b'', 'large': bytes(range(256)) * 400}
        files.update({'Data\\file' + str(i): bytes([i]) for i in range(90)})
        raw = build_archive(files); archive = mpyq.MPQArchive(io.BytesIO(raw))
        for name, expected in files.items(): self.assertEqual(read_archive(archive, name.upper()), expected)
        self.assertEqual(archive.header['archive_size'], len(raw))
    def test_deterministic_names_and_tables(self):
        self.assertEqual(build_archive({'b': b'2', 'a': b'1'}), build_archive({'a': b'1', 'b': b'2'}))
        self.assertEqual(build_archive({'Data/a': b'1'}), build_archive({'Data\\a': b'1'}))
        plain = bytes(range(64)); key = mpyq.MPQArchive._hash(mpyq.MPQArchive, '(hash table)', 'TABLE')
        self.assertEqual(mpyq.MPQArchive._decrypt(mpyq.MPQArchive, encrypt_table(plain, key), key), plain)
    def test_duplicate_rejected(self):
        with self.assertRaises(ValueError): build_archive({'file': b'1', 'FILE': b'2'})


if __name__ == '__main__': unittest.main()
