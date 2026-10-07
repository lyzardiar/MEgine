"""Author: MiYu. Deterministic uncompressed MPQ v0 maps for original-game rule probes."""
import struct
from warcraft_mpq import mpyq


def encrypt_table(raw, key):
    seed = 0xEEEEEEEE; words = []
    for (plain,) in struct.iter_unpack('<I', raw):
        seed = (seed + mpyq.MPQArchive.encryption_table[0x400 + (key & 255)]) & 0xFFFFFFFF
        words.append((plain ^ (key + seed)) & 0xFFFFFFFF)
        key = (((~key << 21) + 0x11111111) | (key >> 11)) & 0xFFFFFFFF
        seed = (plain + seed + (seed << 5) + 3) & 0xFFFFFFFF
    return struct.pack('<' + 'I' * len(words), *words)


def build_archive(files):
    entries = [(name.replace('/', '\\'), bytes(raw)) for name, raw in files.items()]
    if len({name.upper() for name, _ in entries}) != len(entries): raise ValueError('Duplicate MPQ name')
    files = dict(entries)
    files['(listfile)'] = ('\r\n'.join(sorted(set(files) | {'(listfile)'}, key=str.upper)) + '\r\n').encode('ascii')
    names = sorted(files, key=str.upper)
    if len({name.upper() for name in names}) != len(names): raise ValueError('Duplicate MPQ name')
    for name in names: name.encode('ascii')
    slots = 4
    while slots < len(names) * 2: slots *= 2
    hash_name = lambda name, kind: mpyq.MPQArchive._hash(mpyq.MPQArchive, name, kind)
    hashes = [struct.pack('<4I', *([0xFFFFFFFF] * 4)) for _ in range(slots)]
    blocks, data = [], bytearray()
    for index, name in enumerate(names):
        slot = hash_name(name, 'TABLE_OFFSET') % slots
        while hashes[slot] != b'\xff' * 16: slot = (slot + 1) % slots
        hashes[slot] = struct.pack('<2I2HI', hash_name(name, 'HASH_A'), hash_name(name, 'HASH_B'), 0, 0, index)
        raw = files[name]; blocks.append(struct.pack('<4I', 32 + len(data), len(raw), len(raw), mpyq.MPQ_FILE_EXISTS | mpyq.MPQ_FILE_SINGLE_UNIT)); data.extend(raw)
    hash_offset = 32 + len(data); block_offset = hash_offset + slots * 16
    header = struct.pack('<4s2I2H4I', b'MPQ\x1a', 32, block_offset + len(blocks) * 16, 0, 3, hash_offset, block_offset, slots, len(blocks))
    return header + data + encrypt_table(b''.join(hashes), hash_name('(hash table)', 'TABLE')) + encrypt_table(b''.join(blocks), hash_name('(block table)', 'TABLE'))
