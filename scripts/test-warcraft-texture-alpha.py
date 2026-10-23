"""Author: MiYu. Verify BLP1 palette color channels and separately packed alpha planes."""
import importlib
import struct
import unittest

decode=importlib.import_module('convert-warcraft-assets').decode_texture


def palette_blp(depth,indices,alpha):
    header=bytearray(156);header[:4]=b'BLP1';struct.pack_into('<6I',header,4,1,depth,len(indices),1,4,1)
    struct.pack_into('<I',header,28,1180);struct.pack_into('<I',header,92,len(indices)+len(alpha))
    palette=bytes([10,20,30,0,40,50,60,255])+bytes(1016)
    return bytes(header)+palette+bytes(indices)+bytes(alpha)


class PaletteAlphaTests(unittest.TestCase):
    def test_eight_bit_alpha_uses_mip_plane(self):
        self.assertEqual(decode(palette_blp(8,[0,1,0],[0,127,255])).tobytes(),bytes([30,20,10,0,60,50,40,127,30,20,10,255]))

    def test_four_bit_alpha_is_low_nibble_first(self):
        self.assertEqual(list(decode(palette_blp(4,[0,0,1],[0xf0,0x07])).getchannel('A').tobytes()),[0,255,119])

    def test_one_bit_alpha_is_low_bit_first_with_partial_byte(self):
        self.assertEqual(list(decode(palette_blp(1,[0]*9,[0x81,0x01])).getchannel('A').tobytes()),[255,0,0,0,0,0,0,255,255])

    def test_no_alpha_is_opaque_regardless_of_palette_reserved_byte(self):
        self.assertEqual(list(decode(palette_blp(0,[0,1],[])).getchannel('A').tobytes()),[255,255])

    def test_truncated_or_unsupported_layout_is_rejected(self):
        good=palette_blp(8,[0],[255])
        for raw in [good[:100],good[:-1],palette_blp(3,[0],[255]),palette_blp(8,[],[])]:
            with self.assertRaises(ValueError):decode(raw)


if __name__=='__main__':unittest.main()
