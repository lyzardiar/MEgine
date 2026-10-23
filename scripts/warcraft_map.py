"""Author: MiYu. Read classic Warcraft map geometry without resizing or dropping packed bits.

Format reference: flowtsohg/mdx-m3-viewer, pinned source and MIT notice in
third_party/warcraft-map-format/README.md. MPQ decoding stays in warcraft_mpq.
"""
import hashlib
import io
import math
import re
import struct
from pathlib import Path
from warcraft_mpq import mpyq, read_archive


class Reader:
    def __init__(self, data, name):
        self.data, self.name, self.offset = data, name, 0

    def fail(self, message):
        raise ValueError(f'{self.name} at byte {self.offset}: {message}')

    def take(self, size):
        if size < 0 or size > len(self.data) - self.offset:
            self.fail(f'truncated field ({size} bytes)')
        start = self.offset
        self.offset += size
        return self.data[start:self.offset]

    def values(self, fmt):
        result = list(struct.unpack('<' + fmt, self.take(struct.calcsize('<' + fmt))))
        if any(isinstance(v, float) and not math.isfinite(v) for v in result):
            self.fail('non-finite coordinate')
        return result

    def integer(self):
        return self.values('i')[0]

    def unsigned(self):
        return self.values('I')[0]

    def count(self, minimum_bytes=1):
        count = self.integer()
        if count < 0 or count > (len(self.data) - self.offset) // minimum_bytes:
            self.fail('invalid record count')
        return count

    def text(self):
        end = self.data.find(b'\0', self.offset)
        if end < 0:
            self.fail('unterminated string')
        raw = self.take(end - self.offset + 1)[:-1]
        try:
            return raw.decode('utf-8')
        except UnicodeDecodeError:
            self.fail('unsupported non-UTF-8 string; original bytes remain in archive')

    def code(self, size=4):
        return self.take(size).decode('latin1')

    def finish(self):
        if self.offset != len(self.data):
            self.fail(f'{len(self.data) - self.offset} unexpected trailing bytes')


def parse_terrain(data):
    r = Reader(data, 'war3map.w3e')
    if r.take(4) != b'W3E!':
        r.fail('invalid magic')
    version = r.integer()
    if version != 11:
        r.fail(f'unsupported version {version}')
    tileset, custom = r.code(1), r.integer()
    ground = [r.code() for _ in range(r.count(4))]
    cliffs = [r.code() for _ in range(r.count(4))]
    width, height = r.values('2i')
    origin = r.values('2f')
    if width < 2 or height < 2 or width * height * 7 != len(data) - r.offset:
        r.fail('invalid vertex dimensions or payload length')
    # Raw signed ground, unsigned water and three packed bytes retain every bit.
    corners = [list(v) for v in struct.iter_unpack('<hHBBB', r.take(width * height * 7))]
    r.finish()
    return dict(version=version, tileset=tileset, customTileset=custom, groundTilesets=ground, cliffTilesets=cliffs,
                vertexSize=[width, height], tileSize=[width - 1, height - 1], origin=origin,
                tileWorldSize=128, cornerEncoding='i16-ground,u16-water,u8-textureFlags,u8-variation,u8-cliffLayer', corners=corners)


def encode_terrain(terrain):
    """Round-trip the supported layout, including reserved packed bits."""
    t = terrain
    raw = b'W3E!' + struct.pack('<i', t['version']) + t['tileset'].encode('latin1') + struct.pack('<i', t['customTileset'])
    for name in ['groundTilesets', 'cliffTilesets']:
        raw += struct.pack('<i', len(t[name])) + ''.join(t[name]).encode('latin1')
    raw += struct.pack('<2i2f', *t['vertexSize'], *t['origin'])
    return raw + b''.join(struct.pack('<hHBBB', *v) for v in t['corners'])


def corner_at(terrain, x, y):
    width, height = terrain['vertexSize']
    if not isinstance(x, int) or not isinstance(y, int) or not (0 <= x < width and 0 <= y < height):
        raise IndexError('terrain vertex outside map')
    ground, water, flags, variation, cliff = terrain['corners'][y * width + x]
    return dict(worldXY=[terrain['origin'][0] + x * 128, terrain['origin'][1] + y * 128],
                groundHeight=(ground - 8192) / 512, waterHeight=((water & 0x3fff) - 8192) / 512,
                mapEdge=bool(water & 0x4000), ramp=bool(flags & 0x10), blight=bool(flags & 0x20),
                water=bool(flags & 0x40), boundary=bool(flags & 0x80), groundTexture=flags & 15,
                groundVariation=variation & 31, cliffVariation=variation >> 5, cliffTexture=cliff >> 4, layerHeight=cliff & 15)


def parse_pathing(data):
    r = Reader(data, 'war3map.wpm')
    if r.take(4) != b'MP3W':
        r.fail('invalid magic')
    version, width, height = r.values('3i')
    if version != 0:
        r.fail(f'unsupported version {version}')
    if width < 1 or height < 1 or width * height != len(data) - r.offset:
        r.fail('invalid pathing dimensions or payload length')
    cells = list(r.take(width * height))
    r.finish()
    return dict(version=version, size=[width, height], cellWorldSize=32, cells=cells)


def pathing_at(terrain, pathing, world_x, world_y):
    """Return the complete source byte; outside the half-open map returns None."""
    if not math.isfinite(world_x) or not math.isfinite(world_y):
        raise ValueError('non-finite pathing coordinate')
    x, y = math.floor((world_x - terrain['origin'][0]) / 32), math.floor((world_y - terrain['origin'][1]) / 32)
    width, height = pathing['size']
    return pathing['cells'][y * width + x] if 0 <= x < width and 0 <= y < height else None


def parse_info(data):
    r = Reader(data, 'war3map.w3i')
    version = r.integer()
    if version not in (18, 25):
        r.fail(f'unsupported version {version}; supported classic versions are 18 and 25')
    result = dict(version=version, saves=r.integer(), editorVersion=r.integer())
    for key in ['name', 'author', 'description', 'recommendedPlayers']:
        result[key] = r.text()
    result.update(cameraBounds=r.values('8f'), cameraBoundsComplements=r.values('4i'), playableSize=r.values('2i'), flags=r.unsigned(), tileset=r.code(1), campaignBackground=r.integer())
    if version == 25:
        result['loadingScreenModel'] = r.text()
    for key in ['loadingScreenText', 'loadingScreenTitle', 'loadingScreenSubtitle']:
        result[key] = r.text()
    result['loadingScreen'] = r.integer()
    if version == 25:
        result['prologueScreenModel'] = r.text()
    for key in ['prologueScreenText', 'prologueScreenTitle', 'prologueScreenSubtitle']:
        result[key] = r.text()
    if version == 25:
        result.update(useTerrainFog=r.integer(), fogHeight=r.values('2f'), fogDensity=r.values('f')[0], fogColor=list(r.take(4)), globalWeather=r.unsigned(), soundEnvironment=r.text(), lightEnvironmentTileset=r.code(1), waterVertexColor=list(r.take(4)))
    result['players'] = [dict(id=r.integer(), type=r.integer(), race=r.integer(), fixedStartPosition=r.integer(), name=r.text(), startLocation=r.values('2f'), allyLowPriorities=r.unsigned(), allyHighPriorities=r.unsigned()) for _ in range(r.count(33))]
    result['forces'] = [dict(flags=r.unsigned(), playerMask=r.unsigned(), name=r.text()) for _ in range(r.count(9))]
    result['upgradeAvailability'] = [dict(playerFlags=r.unsigned(), id=r.code(), level=r.integer(), availability=r.integer()) for _ in range(r.count(16))]
    result['techAvailability'] = [dict(playerFlags=r.unsigned(), id=r.code()) for _ in range(r.count(8))]
    result['randomUnitTables'] = []
    for _ in range(r.count(13)):
        table = dict(id=r.integer(), name=r.text())
        positions = r.count(4)
        table['columnTypes'] = r.values(f'{positions}i')
        table['units'] = [dict(chance=r.integer(), ids=[r.code() for _ in range(positions)]) for _ in range(r.count(4 + 4 * positions))]
        result['randomUnitTables'].append(table)
    if version == 25:
        result['randomItemTables'] = []
        for _ in range(r.count(9)):
            table = dict(id=r.integer(), name=r.text())
            table['sets'] = [[dict(chance=r.integer(), id=r.code()) for _ in range(r.count(8))] for _ in range(r.count(4))]
            result['randomItemTables'].append(table)
    r.finish()
    return result


def parse_strings(data):
    text = data.decode('utf-8-sig')
    pattern = re.compile(r'^STRING[ \t]+(\d+)[ \t]*\r?\n(?:[ \t]*(?://[^\r\n]*)?\r?\n)*[ \t]*\{[ \t]*\r?\n(.*?)^[ \t]*\}[ \t]*(?:\r?\n|$)', re.MULTILINE | re.DOTALL)
    result = {}
    for match in pattern.finditer(text):
        key = str(int(match[1]))
        if key in result:
            raise ValueError('war3map.wts: duplicate string ' + key)
        result[key] = match[2].removesuffix('\n').removesuffix('\r')
    remainder = pattern.sub('', text)
    if re.sub(r'//[^\r\n]*', '', remainder).strip():
        raise ValueError('war3map.wts: unsupported string table syntax')
    return result


def resolve_string(value, strings):
    match = re.fullmatch(r'TRIGSTR_(\d+)', value)
    return strings.get(str(int(match[1])), value) if match else value


def load_map(source):
    source = Path(source)
    raw = source.read_bytes()
    offset = 0 if raw.startswith(b'MPQ\x1a') else 512 if raw.startswith(b'HM3W') and raw[512:516] == b'MPQ\x1a' else -1
    if offset < 0:
        raise ValueError(f'{source.name}: expected MPQ or 512-byte HM3W wrapper')
    archive = mpyq.MPQArchive(io.BytesIO(raw[offset:]), listfile=False)
    members = {name: read_archive(archive, name) for name in ['war3map.w3e', 'war3map.w3i', 'war3map.wpm']}
    for name in ['war3map.wts', 'war3map.doo', 'war3mapUnits.doo', 'war3map.j']:
        try:
            members[name] = read_archive(archive, name)
        except FileNotFoundError:
            pass
    terrain, info, pathing = parse_terrain(members['war3map.w3e']), parse_info(members['war3map.w3i']), parse_pathing(members['war3map.wpm'])
    if pathing['size'] != [n * 4 for n in terrain['tileSize']]:
        raise ValueError('WPM dimensions must be four cells per W3E tile on both axes')
    diagnostics = []
    try:
        strings = parse_strings(members.get('war3map.wts', b''))
    except (ValueError, UnicodeDecodeError) as error:
        strings = {}
        diagnostics.append(dict(file='war3map.wts', severity='warning', message=str(error), action='Preserve source bytes; keep unresolved TRIGSTR identifiers'))
    sha = lambda data: hashlib.sha256(data).hexdigest()
    result = dict(schema='mengine.warcraft-map', schemaVersion=1, name=resolve_string(info['name'], strings),
                  source=dict(path=str(source.resolve()), sha256=sha(raw), bytes=len(raw), mpqOffset=offset,
                              members={name: dict(sha256=sha(data), bytes=len(data)) for name, data in members.items()}),
                  terrain=terrain, pathing=pathing, info=info, strings=strings, diagnostics=diagnostics,
                  coverage=dict(terrain='decoded', pathing='decoded', info='decoded', strings='preserved-unparsed' if diagnostics else 'decoded' if 'war3map.wts' in members else 'absent',
                                doodads='preserved-unparsed' if 'war3map.doo' in members else 'absent',
                                units='preserved-unparsed' if 'war3mapUnits.doo' in members else 'absent',
                                script='preserved-not-executed' if 'war3map.j' in members else 'absent', runtimePlayable=False))
    return result, members
