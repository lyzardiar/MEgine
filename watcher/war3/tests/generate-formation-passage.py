"""Author: MiYu. Build a synthetic map with two open areas joined by a narrow passage."""
import argparse
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from warcraft_mpq_writer import build_archive


def pack(fmt, *values):
    return struct.pack('<' + fmt, *values)


def fixture():
    width, height = 16, 12
    info = pack('3i', 18, 0, 6059) + b'Formation Passage\0MEgine\0\0\0'
    info += pack('8f4i2iI', 0, 0, 2048, 1536, 0, 1536, 2048, 0, 0, 0, 0, 0, width, height, 0)
    info += b'L' + pack('i', -1) + b'\0' * 3 + pack('i', -1) + b'\0' * 3
    info += pack('5i', 1, 0, 1, 1, 1) + b'Player One\0' + pack('2f2I', 576, 672, 0, 0) + pack('4i', 0, 0, 0, 0)
    terrain = b'W3E!' + pack('i', 11) + b'L' + pack('2i', 0, 1) + b'Ldrt' + pack('i', 1) + b'CLdi'
    terrain += pack('2i2f', width + 1, height + 1, 0, 0)
    terrain += pack('2H3B', 8192, 8192, 0, 0, 2) * ((width + 1) * (height + 1))
    pathing = bytes(2 if x in (31, 32) and y not in (20, 21, 22) else 0
                    for y in range(height * 4) for x in range(width * 4))
    return build_archive({
        'war3map.w3i': info,
        'war3map.w3e': terrain,
        'war3map.wpm': b'MP3W' + pack('3i', 0, width * 4, height * 4) + pathing,
        'war3map.j': b'''function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
''',
    })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(fixture())
