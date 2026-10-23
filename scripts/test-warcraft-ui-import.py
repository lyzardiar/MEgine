"""Author: MiYu. Focused synthetic tests for Warcraft palette decoding and backdrop assembly."""
import importlib
import struct
import unittest
from PIL import Image

ui = importlib.import_module('import-frost-warcraft-ui')


def palette_blp(alpha, samples):
    count = len(samples)
    payload = bytearray(1180 + count + (count*alpha+7)//8)
    payload[:4] = b'BLP1'
    struct.pack_into('<IIIIII', payload, 4, 1, alpha, count, 1, 3, 0)
    struct.pack_into('<I', payload, 28, 1180)
    struct.pack_into('<I', payload, 92, len(payload)-1180)
    payload[156:160] = bytes((30, 20, 10, 0))
    if alpha:
        for i, sample in enumerate(samples):
            payload[1180+count+i*alpha//8] |= sample << (i*alpha % 8)
    return payload


class PaletteTests(unittest.TestCase):
    def test_alpha_depths_and_bit_order(self):
        for alpha, samples in [(0, [0]*9), (1, [0, 1, 0, 1, 1, 0, 1, 0, 1]), (4, [0, 1, 7, 15, 3]), (8, [0, 1, 127, 255, 42])]:
            with self.subTest(alpha=alpha):
                image = ui.decode_texture(bytes(palette_blp(alpha, samples)))
                self.assertEqual(image.size, (len(samples), 1))
                self.assertEqual([image.getpixel((i, 0)) for i in range(len(samples))], [(10, 20, 30, 255 if alpha == 0 else sample*255//((1<<alpha)-1)) for sample in samples])

    def test_palette_and_mip_bounds(self):
        valid = palette_blp(8, [0, 255])
        cases = [valid[:100], valid[:-1]]
        for field, value in [(8, 2), (12, 0), (16, 16385), (28, 1179), (28, 999999), (92, 1)]:
            payload = bytearray(valid); struct.pack_into('<I', payload, field, value); cases.append(payload)
        for payload in cases:
            with self.subTest(header=list(payload[:32])):
                with self.assertRaises(ValueError):
                    ui.decode_texture(bytes(payload))


class BackdropTests(unittest.TestCase):
    def setUp(self):
        self.background = Image.new('RGBA', (2, 2), (7, 8, 9, 255))
        self.edge = Image.new('RGBA', (32, 4))
        for i in range(8):
            self.edge.paste((20*i, 0, 0, 255), (4*i, 0, 4*i+4, 4))

    def test_eight_piece_positions_and_center(self):
        image = ui.render_backdrop(self.background, self.edge, (20, 16), 4, 3, 1)
        for i, point in enumerate([(1, 6), (18, 6), (6, 1), (6, 14), (1, 1), (18, 1), (1, 14), (18, 14)]):
            self.assertEqual(image.getpixel(point), (20*i, 0, 0, 255))
        self.assertEqual(image.getpixel((8, 8)), (7, 8, 9, 255))

    def test_horizontal_edge_rotation(self):
        for x in range(4):
            for y in range(4):
                self.edge.putpixel((8+x, y), (x*50, y*50, 0, 255))
        image = ui.render_backdrop(self.background, self.edge, (20, 16), 4, 3, 1)
        self.assertEqual(image.getpixel((4, 0)), (0, 150, 0, 255))
        self.assertEqual(image.getpixel((7, 3)), (150, 0, 0, 255))

    def test_corners_survive_width_change(self):
        narrow = ui.render_backdrop(self.background, self.edge, (20, 16), 4)
        wide = ui.render_backdrop(self.background, self.edge, (31, 16), 4)
        self.assertEqual(narrow.crop((0, 0, 4, 4)).tobytes(), wide.crop((0, 0, 4, 4)).tobytes())
        self.assertEqual(narrow.crop((16, 12, 20, 16)).tobytes(), wide.crop((27, 12, 31, 16)).tobytes())

    def test_short_and_invalid_rectangles(self):
        for size in [(1, 1), (19, 7), (215, 37), (256, 64)]:
            self.assertEqual(ui.render_backdrop(self.background, self.edge, size).size, size)
        for size in [(0, 12), (-1, 12), (16385, 12)]:
            with self.assertRaises(ValueError):
                ui.render_backdrop(self.background, self.edge, size)
        with self.assertRaises(ValueError):
            ui.render_backdrop(self.background, Image.new('RGBA', (20, 8)), (20, 16))


class SkinTests(unittest.TestCase):
    def test_race_overrides_default_without_other_race_leakage(self):
        values = ui.skin_values('[Human]\nA=human\n[Orc]\nB=orc\n[Default]\nA=default\nB=base\n// B=comment', 'Human')
        self.assertEqual(values, {'A': 'human', 'B': 'base'})


class OptionControlTests(unittest.TestCase):
    def test_frame_parser_keeps_nested_frames_and_ignores_comments(self):
        text = '// Frame "FRAME" "Slider" { bad }\nFrame "SLIDER" "Slider" INHERITS WITHCHILDREN "Base" {\n Height 0.016,\n Text "{literal}",\n /* } */ Frame "BUTTON" "Thumb" {\n Width 0.016,\n }\n}\nFrame "FRAME" "Next" {}'
        frame = ui.fdf_frame(text, 'Slider')
        self.assertEqual(ui.fdf_number(frame, 'Height'), .016)
        self.assertEqual(ui.fdf_number(ui.fdf_frame(frame, 'Thumb'), 'Width'), .016)
        self.assertNotIn('Next', frame)
        with self.assertRaises(ValueError):
            ui.fdf_frame(text, 'Missing')
        with self.assertRaises(ValueError):
            ui.fdf_frame('Frame "FRAME" "Bad" {', 'Bad')
        with self.assertRaises(ValueError):
            ui.fdf_number(frame, 'Missing')

    def test_checkbox_blends_only_check_overlay(self):
        background = Image.new('RGBA', (2, 2), (10, 20, 30, 255))
        check = Image.new('RGBA', (2, 2)); check.putpixel((1, 1), (255, 255, 0, 255))
        self.assertEqual(ui.checkbox_image(background).tobytes(), background.tobytes())
        result = ui.checkbox_image(background, check)
        self.assertEqual(result.getpixel((0, 0)), (10, 20, 30, 255))
        self.assertEqual(result.getpixel((1, 1)), (255, 255, 0, 255))
        self.assertEqual(background.getpixel((1, 1)), (10, 20, 30, 255))
        with self.assertRaises(ValueError):
            ui.checkbox_image(background, Image.new('RGBA', (3, 3)))


if __name__ == '__main__':
    unittest.main()
