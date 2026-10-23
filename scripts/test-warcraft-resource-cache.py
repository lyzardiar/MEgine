"""Author: MiYu. Check shared resource reuse, archive precedence, invalidation and corruption."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
from warcraft_resource_cache import ResourceCache, digest, publish


class ResourceCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def test_reuse_across_process_instances_and_map_override(self):
        calls = []
        def read(archive, name):
            calls.append((archive['id'], name))
            if name.lower() not in archive:
                raise FileNotFoundError(name)
            return archive[name.lower()]
        base = dict(id='base', **{'textures\\a.blp': b'public'})
        map_a = dict(id='map-a')
        map_b = dict(id='map-b', **{'textures\\a.blp': b'custom'})
        def resolve(cache, archives):
            for archive in archives:
                try:
                    return cache.member(archive, 'Textures/A.blp', digest(archive['id'].encode()))
                except FileNotFoundError:
                    pass
            raise AssertionError('Missing fixture')
        with patch('warcraft_resource_cache.read_archive', read):
            first = ResourceCache(self.root)
            self.assertEqual(resolve(first, [map_a, base]), b'public')
            second = ResourceCache(self.root)
            self.assertEqual(resolve(second, [dict(id='another-map'), base]), b'public')
            self.assertEqual(resolve(second, [map_b, base]), b'custom')
            self.assertEqual(resolve(second, [map_a, base]), b'public')
        self.assertEqual(sum(name == 'base' for name, _ in calls), 1)
        self.assertEqual(second.stats['memberHits'], 2)

    def test_archive_and_tool_updates_invalidate_only_their_keys(self):
        tool = self.root/'tool';tool.write_bytes(b'version-one')
        first = ResourceCache(self.root/'cache', [tool])
        raw = first.produce('texture', ['same-source'], lambda: b'old')
        self.assertEqual(raw, b'old')
        tool.write_bytes(b'version-two-and-changed-size')
        second = ResourceCache(self.root/'cache', [tool])
        self.assertNotEqual(first.recipe, second.recipe)
        self.assertEqual(second.produce('texture', ['same-source'], lambda: b'new'), b'new')
        with patch('warcraft_resource_cache.read_archive', side_effect=[b'base-one', b'base-two']) as read:
            self.assertEqual(first.member(None, 'same-path', digest(b'archive-one')), b'base-one')
            self.assertEqual(second.member(None, 'same-path', digest(b'archive-two')), b'base-two')
            self.assertEqual(read.call_count, 2)

    def test_texture_conversion_runs_once_and_returns_independent_images(self):
        first = ResourceCache(self.root);calls = []
        def decode(raw):
            calls.append(raw)
            return Image.new('RGBA', (2, 2), (1, 2, 3, 4))
        image = first.texture(b'blp', decode);image.putpixel((0, 0), (9, 9, 9, 9))
        second = ResourceCache(self.root)
        self.assertEqual(second.texture(b'blp', decode).getpixel((0, 0)), (1, 2, 3, 4))
        self.assertEqual(calls, [b'blp'])

    def test_corrupt_blob_and_incomplete_entry_are_rejected(self):
        cache = ResourceCache(self.root)
        cache.produce('metadata', ['a'], lambda: b'output')
        blob = self.root/'blobs'/digest(b'output')[:2]/digest(b'output')
        blob.write_bytes(b'corrupt')
        with self.assertRaises(ValueError):
            cache.produce('metadata', ['a'], lambda: self.fail('must not silently overwrite'))
        blob.unlink()
        with self.assertRaises(ValueError):
            cache.produce('metadata', ['a'], lambda: self.fail('missing blob'))

    def test_missing_override_blob_never_falls_back_to_base_archive(self):
        cache = ResourceCache(self.root)
        with patch('warcraft_resource_cache.read_archive', return_value=b'override'):
            cache.member(None, 'model.mdx', digest(b'map'))
        (self.root/'blobs'/digest(b'override')[:2]/digest(b'override')).unlink()
        with self.assertRaises(ValueError):
            cache.member(None, 'model.mdx', digest(b'map'))

    def test_immutable_publication_handles_concurrent_writers(self):
        file = self.root/'artifact'
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: publish(file, b'complete'), range(8)))
        self.assertEqual(file.read_bytes(), b'complete')
        with self.assertRaises(ValueError):
            publish(file, b'changed')
        self.assertEqual(list(self.root.glob('.publish-*')), [])


if __name__ == '__main__':
    unittest.main()
