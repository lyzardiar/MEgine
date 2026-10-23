"""Author: MiYu. Lossless classic war3map.doo placements, including item and terrain records.

Reference and MIT notice: third_party/warcraft-map-format/README.md.
"""
import struct
from warcraft_map import Reader


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
