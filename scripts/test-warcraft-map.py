"""Author: MiYu. Validate classic map layouts, source preservation and original-map coordinates."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
import tempfile
import unittest
from warcraft_map import Reader, corner_at, encode_terrain, load_map, parse_info, parse_pathing, parse_strings, parse_terrain, pathing_at
from warcraft_mpq_writer import build_archive

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('map_importer', ROOT / 'scripts/import-frost-original-map.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
pack = lambda fmt, *values: struct.pack('<' + fmt, *values)
text = lambda value: value.encode('utf-8') + b'\0'


def terrain_fixture():
    header = b'W3E!' + pack('i', 11) + b'L' + pack('ii', 0, 1) + b'Ldrt' + pack('i', 1) + b'CLdi' + pack('2i2f', 3, 2, -128, -64)
    # Non-square, asymmetric rows; water includes bit 15 to verify preservation.
    corners = [(8192 + i * 32, 0xe020 + i, 0xf0, 0xe7, 0x32) for i in range(6)]
    return header + b''.join(pack('hHBBB', *corner) for corner in corners)


def pathing_fixture():
    return b'MP3W' + pack('3i', 0, 8, 4) + bytes(range(32))


def info_fixture(version):
    data = pack('3i', version, 7, 6059) + b''.join(text(v) for v in ['TRIGSTR_007', 'Author', 'Description', '2 players'])
    data += pack('8f4i2iI', -128, -64, 128, 64, -128, 64, 128, -64, 1, 1, 0, 0, 2, 1, 0x80000000) + b'L' + pack('i', -1)
    if version == 25:
        data += text('Loading.mdx')
    data += b'\0' * 3 + pack('i', -1)
    if version == 25:
        data += text('Prologue.mdx')
    data += b'\0' * 3
    if version == 25:
        data += pack('i3f', 1, 0, 5000, 0.5) + bytes([1, 2, 3, 4]) + pack('I', 0xffffffff) + text('Default') + b'L' + bytes([5, 6, 7, 8])
    data += pack('i4i', 2, 0, 1, 1, 1) + text('Player A') + pack('2f2I', -96, 0, 0x80000000, 2)
    data += pack('4i', 7, 1, 2, 0) + text('Player B') + pack('2f2I', 96, -32, 0, 1)
    data += pack('i2I', 1, 3, 129) + text('Force')
    data += pack('iI', 1, 129) + b'Rhme' + pack('2i', 2, 1)
    data += pack('iI', 1, 129) + b'hfoo'
    data += pack('2i', 1, 42) + text('Units') + pack('5i', 2, 0, 1, 1, 100) + b'hfoo' + b'hpea'
    if version == 25:
        data += pack('2i', 1, 9) + text('Items') + pack('3i', 1, 1, 100) + b'phea'
    return data


def map_fixture(version=25, wrapped=True):
    members = {'war3map.w3e': terrain_fixture(), 'war3map.wpm': pathing_fixture(), 'war3map.w3i': info_fixture(version),
               'war3map.wts': '\ufeffSTRING 7\r\n{\r\n测试地图\r\n}\r\n'.encode('utf-8'), 'war3map.j': b'// retained only\n'}
    raw = build_archive(members)
    return ((b'HM3W' + bytes(508)) if wrapped else b'') + raw, members


class MapTests(unittest.TestCase):
    def test_terrain_bits_and_rectangular_coordinates(self):
        raw = terrain_fixture()
        terrain = parse_terrain(raw)
        self.assertEqual(encode_terrain(terrain), raw)
        self.assertEqual(terrain['tileSize'], [2, 1])
        corner = corner_at(terrain, 2, 1)
        self.assertEqual(corner['worldXY'], [128, 64])
        self.assertEqual(corner['groundHeight'], 160 / 512)
        self.assertEqual(corner['waterHeight'], 37 / 512)
        self.assertTrue(all(corner[k] for k in ['mapEdge', 'ramp', 'blight', 'water', 'boundary']))
        self.assertEqual([corner[k] for k in ['groundTexture', 'groundVariation', 'cliffVariation', 'cliffTexture', 'layerHeight']], [0, 7, 7, 3, 2])
        for x, y in [(-1, 0), (3, 0), (0, 2), (0.5, 0)]:
            with self.assertRaises(IndexError):
                corner_at(terrain, x, y)

    def test_pathing_cell_centers_edges_and_axis_order(self):
        terrain, pathing = parse_terrain(terrain_fixture()), parse_pathing(pathing_fixture())
        for y in range(4):
            for x in range(8):
                for dx, dy in [(0, 0), (16, 16), (31.999, 31.999)]:
                    self.assertEqual(pathing_at(terrain, pathing, -128 + 32*x + dx, -64 + 32*y + dy), y*8+x)
        for point in [(-128.001, -64), (-128, -64.001), (128, -64), (-128, 64)]:
            self.assertIsNone(pathing_at(terrain, pathing, *point))
        with self.assertRaises(ValueError):
            pathing_at(terrain, pathing, float('nan'), 0)

    def test_classic_info_versions_and_tables(self):
        for version in [18, 25]:
            result = parse_info(info_fixture(version))
            self.assertEqual(result['version'], version)
            self.assertEqual(result['players'][1]['id'], 7)
            self.assertEqual(result['players'][1]['startLocation'], [96, -32])
            self.assertEqual(result['players'][0]['allyLowPriorities'], 0x80000000)
            self.assertEqual(result['forces'][0]['playerMask'], 129)
            self.assertEqual(result['upgradeAvailability'][0]['id'], 'Rhme')
            self.assertEqual(result['techAvailability'][0]['id'], 'hfoo')
            self.assertEqual(result['randomUnitTables'][0]['units'], [dict(chance=100, ids=['hfoo', 'hpea'])])
            if version == 25:
                self.assertEqual(result['randomItemTables'][0]['sets'], [[dict(chance=100, id='phea')]])
                self.assertEqual(result['globalWeather'], 0xffffffff)

    def test_every_truncation_and_trailing_bytes(self):
        for parse, raw in [(parse_terrain, terrain_fixture()), (parse_pathing, pathing_fixture()), (parse_info, info_fixture(18)), (parse_info, info_fixture(25))]:
            for length in range(len(raw)):
                with self.subTest(parser=parse.__name__, length=length), self.assertRaises(ValueError):
                    parse(raw[:length])
            with self.assertRaises(ValueError):
                parse(raw + b'\0')

    def test_explicit_omitted_editor_tables_and_nested_script_source(self):
        raw, members = map_fixture()
        info = members['war3map.w3i']
        end = info.index(text('Force')) + len(text('Force'))
        for tail in [b'', b'\xff']:
            omitted = info[:end] + tail
            with self.assertRaises(ValueError): parse_info(omitted)
            decoded = parse_info(omitted, allow_missing_editor_tables=True)
            self.assertTrue(decoded['omittedEditorTables'])
            self.assertEqual(decoded['editorTableTail'], tail.hex())
            self.assertEqual(decoded['forces'][0]['playerMask'], 129)
            self.assertEqual(decoded['randomItemTables'], [])
        for tail in [b'\0', b'\xff\xff', b'\0\0\0']:
            with self.assertRaises(ValueError): parse_info(info[:end]+tail, allow_missing_editor_tables=True)
        members['war3map.w3i'] = info[:end] + b'\xff'
        members['Scripts\\war3map.j'] = members.pop('war3map.j')
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'optimized.w3x'
            source.write_bytes(build_archive(members))
            data, actual = load_map(source)
            self.assertEqual(data['coverage']['info'], 'decoded-with-omitted-editor-tables')
            self.assertEqual(data['coverage']['strings'], 'decoded')
            self.assertEqual(data['source']['members']['war3map.j']['archivePath'], 'Scripts/war3map.j')
            self.assertEqual(actual['war3map.j'], members['Scripts\\war3map.j'])

    def test_reject_versions_counts_dimensions_and_nonfinite(self):
        for parse, raw, offset in [(parse_terrain, terrain_fixture(), 4), (parse_pathing, pathing_fixture(), 4), (parse_info, info_fixture(25), 0)]:
            with self.assertRaisesRegex(ValueError, 'unsupported version'):
                parse(raw[:offset] + pack('i', 999) + raw[offset+4:])
        for value in [-1, 0x7fffffff]:
            raw = terrain_fixture()
            with self.assertRaises(ValueError):
                parse_terrain(raw[:13] + pack('i', value) + raw[17:])
            raw = pathing_fixture()
            with self.assertRaises(ValueError):
                parse_pathing(raw[:8] + pack('i', value) + raw[12:])
        raw = terrain_fixture()
        with self.assertRaisesRegex(ValueError, 'non-finite'):
            parse_terrain(raw[:37] + pack('f', float('inf')) + raw[41:])
        for data in [b'no terminator', b'\xff\0']:
            with self.assertRaises(ValueError):
                Reader(data, 'fixture').text()

    def test_string_table_multiline_and_invalid(self):
        self.assertEqual(parse_strings(b'// comment\nSTRING 007\n{\nline one\nline two\n}\n'), {'7': 'line one\nline two'})
        self.assertEqual(parse_strings(b'STRING 1\r\n// Sound\\Dialogue.mp3\r\n\r\n{\r\n// dialogue text\r\n}\r\n'), {'1': '// dialogue text'})
        self.assertEqual(parse_strings(b'STRING 1\n{   \ntext\n}\n'), {'1': 'text'})
        for raw in [b'STRING 1\n{\nunclosed', b'garbage', b'STRING 1\n{\nx\n}\nSTRING 001\n{\ny\n}']:
            with self.assertRaises(ValueError):
                parse_strings(raw)

    def test_archive_wrapping_export_receipts_and_existing_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for wrapped in [False, True]:
                raw, members = map_fixture(wrapped=wrapped)
                source = root / ('wrapped.w3x' if wrapped else 'plain.w3x')
                source.write_bytes(raw)
                data, actual = load_map(source)
                self.assertEqual(actual, members)
                self.assertEqual(data['name'], '测试地图')
                self.assertEqual(data['source']['mpqOffset'], 512 if wrapped else 0)
                output = root / source.stem
                importer.export_map(source, output)
                exported = json.loads((output / 'map.json').read_text('utf-8'))
                self.assertFalse(exported['coverage']['runtimePlayable'])
                self.assertEqual((output / exported['source']['preservedArchive']).read_bytes(), raw)
                for name, member in members.items():
                    receipt = exported['source']['members'][name]
                    self.assertEqual((output / receipt['preservedFile']).read_bytes(), member)
                    self.assertEqual(receipt['sha256'], hashlib.sha256(member).hexdigest())
                with self.assertRaises(FileExistsError):
                    importer.export_map(source, output)
                self.assertEqual(source.read_bytes(), raw)
            self.assertFalse(list(root.glob('.warcraft-map-*')))

    def test_cross_file_dimensions_and_unsupported_wrapper(self):
        raw, members = map_fixture()
        members['war3map.wpm'] = b'MP3W' + pack('3i', 0, 1, 1) + b'\0'
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'invalid.w3m'
            source.write_bytes(build_archive(members))
            with self.assertRaisesRegex(ValueError, 'four cells'):
                load_map(source)
            source.write_bytes(b'garbage' + raw)
            with self.assertRaisesRegex(ValueError, 'wrapper'):
                load_map(source)

    def test_unsupported_strings_preserve_geometry_and_report_coverage(self):
        _, members = map_fixture()
        members['war3map.wts'] = b'STRING 7\n{\nunterminated'
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'localized.w3x'
            source.write_bytes(build_archive(members))
            result, originals = load_map(source)
            self.assertEqual(result['name'], 'TRIGSTR_007')
            self.assertEqual(result['strings'], {})
            self.assertEqual(result['coverage']['strings'], 'preserved-unparsed')
            self.assertEqual(result['diagnostics'][0]['file'], 'war3map.wts')
            self.assertEqual(originals['war3map.wts'], members['war3map.wts'])
            self.assertEqual(encode_terrain(result['terrain']), members['war3map.w3e'])


def verify_maps(root, report_path):
    rows, errors = [], []
    for source in sorted(list(root.rglob('*.w3m')) + list(root.rglob('*.w3x'))):
        try:
            data, members = load_map(source)
            assert encode_terrain(data['terrain']) == members['war3map.w3e'], 'terrain round-trip differs'
            pathing = data['pathing']
            assert b'MP3W' + pack('3i', pathing['version'], *pathing['size']) + bytes(pathing['cells']) == members['war3map.wpm'], 'pathing round-trip differs'
            # Generated classic JASS is independent of the W3I binary layout.
            starts = re.findall(rb'call\s+DefineStartLocation\(\s*(\d+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)', members.get('war3map.j', b''))
            available = [(float(x), float(y)) for _, x, y in starts]
            checked, different = 0, []
            if available:
                for player in data['info']['players']:
                    if any(abs(x - player['startLocation'][0]) <= 0.051 and abs(y - player['startLocation'][1]) <= 0.051 for x, y in available):
                        checked += 1
                    else:
                        different.append(player['id'])
            rows.append(dict(path=str(source.relative_to(root)), sha256=data['source']['sha256'], name=data['name'], version=data['info']['version'],
                             terrainTiles=data['terrain']['tileSize'], players=len(data['info']['players']), jassStartsMatched=checked,
                             jassStartsDifferent=different, jassStartLiterals=len(starts), diagnostics=data['diagnostics']))
        except Exception as error:
            errors.append(dict(path=str(source.relative_to(root)), error=str(error)))
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(dict(passed=rows, failed=errors), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Original maps: {len(rows)} passed, {len(errors)} rejected; report: {report_path}')
    if errors:
        print(json.dumps(errors[:10], ensure_ascii=True))
    return bool(rows) and not errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--maps', type=Path)
    parser.add_argument('--report', type=Path, default=ROOT / 'tmp/docs-artifacts/frost-original-maps/corpus.json')
    args = parser.parse_args()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(MapTests))
    valid = result.wasSuccessful()
    if args.maps and valid:
        valid = verify_maps(args.maps, args.report)
    raise SystemExit(0 if valid else 1)
