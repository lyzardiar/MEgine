"""Author: MiYu. Texture aliases retain map priority and the actual source path."""
import unittest
from unittest.mock import patch
from warcraft_mpq import read_asset_source


def read(archive, path):
    key = path.replace('\\', '/').lower()
    if key not in archive:
        raise FileNotFoundError(path)
    return archive[key]


class TextureSourceTests(unittest.TestCase):
    @patch('warcraft_mpq.read_archive', side_effect=read)
    def test_alias_preserves_map_priority_and_source(self, _):
        archives = [('map', {'cliff.blp': b'map'}), ('base', {'cliff.tga': b'base'})]
        self.assertEqual(read_asset_source(archives, 'Cliff.tga'), ('map', 'Cliff.blp', b'map'))
        archives[0][1]['cliff.tga'] = b'exact'
        self.assertEqual(read_asset_source(archives, 'Cliff.tga'), ('map', 'Cliff.tga', b'exact'))

    @patch('warcraft_mpq.read_archive', side_effect=read)
    def test_reverse_alias_and_non_texture_paths(self, _):
        self.assertEqual(read_asset_source([('map', {'custom.tga': b'raw'})], 'Custom.blp')[1], 'Custom.tga')
        self.assertEqual(read_asset_source([('map', {'model.mdx': b'model'})], 'model.mdx')[2], b'model')
        with self.assertRaisesRegex(FileNotFoundError, 'missing.tga / missing.blp'):
            read_asset_source([('map', {})], 'missing.tga')

    def test_cache_uses_resolved_member_and_archive_identity(self):
        class Cache:
            def member(self, archive, path, identity):
                self.last = (path, identity)
                return read(archive, path)
        cache = Cache()
        self.assertEqual(read_asset_source([('game', {'cliff.blp': b'raw'})], 'cliff.tga', cache, {'game':'sha'}), ('game','cliff.blp',b'raw'))
        self.assertEqual(cache.last, ('cliff.blp', 'sha'))

    @patch('warcraft_mpq.read_archive', side_effect=ValueError('corrupt sector'))
    def test_corrupt_texture_is_not_silently_replaced(self, _):
        with self.assertRaisesRegex(ValueError, 'corrupt sector'):
            read_asset_source([('map', {})], 'cliff.tga')


if __name__ == '__main__':
    unittest.main()
