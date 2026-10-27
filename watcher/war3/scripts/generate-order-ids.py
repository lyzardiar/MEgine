"""Author: MiYu. Extract source order registrations confirmed by REA at the original registration call."""
import argparse
import hashlib
from pathlib import Path
import re
import struct


def extract(binary):
    pe = struct.unpack_from('<I', binary, 0x3c)[0]
    if binary[pe:pe+4] != b'PE\0\0' or struct.unpack_from('<H', binary, pe+4)[0] != 0x14c:
        raise ValueError('Expected source x86 PE')
    count, optional_size = struct.unpack_from('<H', binary, pe+6)[0], struct.unpack_from('<H', binary, pe+20)[0]
    base = struct.unpack_from('<I', binary, pe+24+28)[0]
    sections = []
    for index in range(count):
        offset = pe+24+optional_size+40*index
        virtual_size, address, size, raw = struct.unpack_from('<IIII', binary, offset+8)
        sections.append((base+address, min(size, virtual_size or size), raw))

    def offset(address):
        for begin, size, raw in sections:
            if begin <= address < begin+size:
                return raw+address-begin
        raise ValueError('Unmapped registration address')

    entries = {}
    for begin, size, raw in sections:
        for match in re.finditer(rb'\x68(.{4})\x68(.{4})\x8b\xce\xe8(.{4})', binary[raw:raw+size], re.S):
            at = begin+match.start()
            target = at+17+struct.unpack('<i', match[3])[0]
            order = struct.unpack('<I', match[2])[0]
            if target != 0x6f1c9820 or not 0xd0000 <= order <= 0xd1000:
                continue
            name_at = offset(struct.unpack('<I', match[1])[0])
            name = binary[name_at:name_at+80].split(b'\0', 1)[0]
            if not re.fullmatch(rb'[a-z][a-z0-9]*', name):
                continue
            name = name.decode('ascii')
            if name in entries and entries[name] != order:
                raise ValueError('Conflicting registration')
            entries[name] = order
    if len(entries) != 344:
        raise ValueError(f'Expected 344 verified registrations, got {len(entries)}')
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-dll', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'src/order_ids.inc')
    args = parser.parse_args()
    binary = args.game_dll.read_bytes()
    digest = hashlib.sha256(binary).hexdigest()
    if digest != 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a':
        raise ValueError('Game.dll differs from the REA-analyzed 1.27.0.52240 source')
    entries = extract(binary)
    header = '// Author: MiYu. REA-observed 1.27.0.52240 order registrations.\n// Game.dll SHA256: '+digest+'\n'
    args.output.write_text(header+''.join('{"'+name+'",'+str(order)+'u},\n' for name, order in sorted(entries.items())), encoding='utf-8', newline='\n')
    print(f'Generated {len(entries)} registrations: {args.output}')


if __name__ == '__main__':
    main()
