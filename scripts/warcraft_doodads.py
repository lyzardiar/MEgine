"""Author: MiYu. Lossless classic war3map.doo placements, including item and terrain records.

Reference and MIT notice: third_party/warcraft-map-format/README.md.
"""
import struct
import math
from warcraft_map import Reader


# Registered by source 0x6f6a6f50; unknown words and numeric suffixes are not animation tags.
ANIMATION_TAGS = frozenset('alternate alternateex attack berserk birth chain channel cinematic complete critical death decay defend dissipate drain eattree entangle fast fifth fill fire first five flail flesh four fourth gold hit large left light looping lumber medium moderate morph off one portrait puke ready right second severe slam sleep small spell spiked spin stand swim talk third three throw turn two upgrade victory walk work wounded'.split())


def stand_sequence_candidates(clips):
    """Source 0x6f6f19f0 ranking: most requested tags, then fewest additional known tags."""
    best = (0, -1000)
    candidates = []
    for index, clip in enumerate(clips):
        tags = [word for word in clip['name'].lower().split(' ') if word in ANIMATION_TAGS]
        matches = int('stand' in tags)
        score = (matches, matches - len(tags))
        if score < best:
            continue
        if score > best:
            best = score
            candidates.clear()
        candidates.append(index)
    return candidates


class MsvcRandom:
    """MSVCR120 rand stream, explicitly seeded for reproducible generated previews."""
    def __init__(self, seed=1):
        self.state = seed & 0xffffffff

    def __call__(self):
        self.state = (self.state * 214013 + 2531011) & 0xffffffff
        return (self.state >> 16) & 0x7fff


def sequence_weight(rarity):
    """Source renderer 0x6f785330 normalizes rarity before 0x6f6f1c0e converts to integer weight."""
    f32 = lambda value: struct.unpack('<f', struct.pack('<f', value))[0]
    if not math.isfinite(rarity) or rarity <= -128:
        raise ValueError('Unsupported sequence rarity')
    if rarity >= 128:
        return 0
    normalized = f32(1 / f32(2 ** f32(rarity)))
    if normalized > 0x7fffffff / 100:
        raise ValueError('Sequence rarity overflows the source integer weight')
    weight = int(f32(normalized * 100))
    if weight > 0x7fffffff:
        raise ValueError('Sequence rarity overflows the source integer weight')
    return weight


def stand_sequence_index(clips, rand):
    candidates = stand_sequence_candidates(clips)
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    weights = [sequence_weight(clips[index]['rarity']) for index in candidates]
    total = sum(weights)
    if total > 0x7fffffff:
        raise ValueError('Sequence weights overflow the source signed accumulator')
    # Source range helper uses an exclusive upper bound; zero total falls through to model index zero.
    roll = 1 + rand() % (total - 1) if total > 1 else 1
    cumulative = 0
    for index, weight in zip(candidates, weights):
        cumulative += weight
        if roll <= cumulative:
            return index
    return 0


def mdx_sequence_rarities(raw):
    if raw[:4] != b'MDLX':
        raise ValueError('Expected original MDX')
    offset = 4
    result = []
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise ValueError('Truncated MDX chunk header')
        tag, size = struct.unpack_from('<4sI', raw, offset)
        offset += 8
        if offset + size > len(raw):
            raise ValueError('Truncated MDX chunk')
        if tag == b'SEQS':
            if size % 132:
                raise ValueError('Invalid classic sequence record size')
            for start in range(offset, offset + size, 132):
                begin, end = struct.unpack_from('<II', raw, start + 80)
                if end > begin:
                    result.append(dict(name=raw[start:start+80].split(b'\0')[0].decode('utf-8'),rarity=struct.unpack_from('<f',raw,start+96)[0]))
        offset += size
    return result


def placement_kind(is_destructable, flags):
    """Source 0x6f751980 dispatch with the runtime mode flag clear; flags are not a visibility mask."""
    if not is_destructable or flags & 1:
        return 'decorative'
    return 'destructable' if flags & 2 else 'suppressed'


def named_sequence_index(clips, name):
    """Source 0x6f6f1f50 selects the first complete, case-insensitive name match."""
    return next((i for i, clip in enumerate(clips) if clip['name'] and clip['name'].lower() == name.lower()), None)


def parse_doodads(data):
    r = Reader(data, 'war3map.doo')
    if r.take(4) != b'W3do':
        r.fail('invalid magic')
    version, subversion = r.values('2i')
    if version not in (7, 8):
        r.fail(f'unsupported classic version {version}')
    doodads = []
    for _ in range(r.count(42 if version == 7 else 50)):
        entry = dict(id=r.code(), variation=r.integer(), location=r.values('3f'), angle=r.values('f')[0], scale=r.values('3f'))
        entry['flags'], entry['life'] = r.values('2B')
        if version == 8:
            entry['itemTable'] = r.unsigned()
            entry['itemSets'] = [[dict(id=r.code(), chance=r.integer()) for _ in range(r.count(8))] for _ in range(r.count(4))]
        entry['editorId'] = r.integer()
        doodads.append(entry)
    terrain_version = r.unsigned()
    terrain = [dict(id=r.code(), unknown=r.unsigned(), location=r.values('2I')) for _ in range(r.count(16))]
    r.finish()
    return dict(version=version, subversion=subversion, doodads=doodads, terrainVersion=terrain_version, terrainDoodads=terrain)


def encode_doodads(value):
    raw = bytearray(b'W3do'+struct.pack('<3i',value['version'],value['subversion'],len(value['doodads'])))
    for d in value['doodads']:
        raw += d['id'].encode('latin1')+struct.pack('<i7f2B',d['variation'],*d['location'],d['angle'],*d['scale'],d['flags'],d['life'])
        if value['version'] == 8:
            raw += struct.pack('<II',d['itemTable'],len(d['itemSets']))
            for items in d['itemSets']:
                raw += struct.pack('<I',len(items))
                for item in items:
                    raw += item['id'].encode('latin1')+struct.pack('<i',item['chance'])
        raw += struct.pack('<i',d['editorId'])
    raw += struct.pack('<II',value['terrainVersion'],len(value['terrainDoodads']))
    for d in value['terrainDoodads']:
        raw += d['id'].encode('latin1')+struct.pack('<3I',d['unknown'],*d['location'])
    return bytes(raw)
