"""Author: MiYu. Read MPQ sectors, including encrypted Warcraft map dependencies."""
import bz2
import struct
import sys
import zlib
from pathlib import Path, PureWindowsPath

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'third_party/mpyq'))
import mpyq


def read_archive(archive, path):
    entry = archive.get_hash_table_entry(path)
    if entry is None:
        raise FileNotFoundError(path)
    block = archive.block_table[entry.block_table_index]
    archive.file.seek(archive.header['offset'] + block.offset)
    data = archive.file.read(block.archived_size)
    if len(data) != block.archived_size:
        raise ValueError(f'{path}: truncated block')
    encrypted = bool(block.flags & mpyq.MPQ_FILE_ENCRYPTED)
    key = archive._hash(PureWindowsPath(path).name, 'TABLE')
    if block.flags & mpyq.MPQ_FILE_FIX_KEY:
        key = ((key + block.offset) ^ block.size) & 0xffffffff

    def decrypt(data, key):
        count = len(data) // 4 * 4
        return archive._decrypt(data[:count], key & 0xffffffff) + data[count:]

    def expand(data, expected):
        if block.flags & mpyq.MPQ_FILE_IMPLODE:
            raise ValueError(f'{path}: PKWARE implode requires a supported decoder')
        if len(data) < expected and block.flags & mpyq.MPQ_FILE_COMPRESS:
            if not data:
                raise ValueError(f'{path}: missing compressed sector')
            mask, data = data[0], data[1:]
            if mask == 2:
                data = zlib.decompress(data)
            elif mask == 16:
                data = bz2.decompress(data)
            else:
                raise ValueError(f'{path}: unsupported compression mask {mask}')
        if len(data) != expected:
            raise ValueError(f'{path}: expected {expected} sector bytes, got {len(data)}')
        return data

    if block.flags & mpyq.MPQ_FILE_SINGLE_UNIT:
        return expand(decrypt(data, key) if encrypted else data, block.size)
    sector_size = 512 << archive.header['sector_size_shift']
    count = (block.size + sector_size - 1) // sector_size
    if block.flags & (mpyq.MPQ_FILE_COMPRESS | mpyq.MPQ_FILE_IMPLODE):
        size = 4 * (count + 1)
        table = decrypt(data[:size], key - 1) if encrypted else data[:size]
        offsets = struct.unpack(f'<{count+1}I', table)
        if offsets[0] < size or offsets[-1] > len(data) or any(a > b for a, b in zip(offsets, offsets[1:])):
            raise ValueError(f'{path}: invalid sector offsets')
        sectors = [data[offsets[i]:offsets[i+1]] for i in range(count)]
    else:
        sectors = [data[i*sector_size:min((i+1)*sector_size, block.size)] for i in range(count)]
    result = b''.join(expand(decrypt(sector, key+i) if encrypted else sector, min(sector_size, block.size-i*sector_size)) for i, sector in enumerate(sectors))
    if len(result) != block.size:
        raise ValueError(f'{path}: file size mismatch')
    return result
