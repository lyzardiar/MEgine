"""Author: MiYu. Compare native map UI rules with the pinned original x86 instructions.

This analysis-only check emulates layout/arithmetic with GUI and configuration
boundaries supplied by the harness. It neither loads Game.dll through Windows
nor verifies pixels, text metrics, the client lifecycle or gameplay.
"""
import argparse
import configparser
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tmp/docs-artifacts/frost-siege-engine/dependencies'))
sys.path.insert(0, str(ROOT / 'scripts'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EBP, UC_X86_REG_ECX, UC_X86_REG_EDI, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESP
from warcraft_mpq import mpyq, read_archive

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/map-tests/map-ui-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/map-menu/source-ui-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
binary = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(binary).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Addresses require the pinned Game.dll'
native = json.loads(args.fixture.read_text(encoding='utf-8'))
archives = [mpyq.MPQArchive(args.data_root / name, listfile=False) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']]
source_digests = {}


def source_config(member):
    for archive in archives:
        try:
            raw = read_archive(archive, member)
        except FileNotFoundError:
            continue
        source_digests[member] = hashlib.sha256(raw).hexdigest()
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw.decode('gb18030')
        config = configparser.ConfigParser(strict=False, interpolation=None, comment_prefixes=('//', ';'), inline_comment_prefixes=('//', ';'))
        config.read_string(text)
        return config
    raise FileNotFoundError(member)


data = source_config(r'UI\WorldEditData.txt')
strings = source_config(r'UI\WorldEditGameStrings.txt')
image = pefile.PE(data=binary)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x40000)
cpu.mem_map(0x2000000, 0x10000)
cpu.mem_map(0x3000000, 0x10000)
PANE, VTABLE, STOP = 0x1000000, 0x1030000, 0x3000f00
BOUNDS, SHOW, HIDE = 0x3000010, 0x3000020, 0x3000030
STACK, BASE = 0x2008000, 0x200f000
fields = {0x3bc: 'AuthIcon', 0x3c0: 'MaxPlayersIcon', 0x3c4: 'MaxPlayersValue', 0x3c8: 'MapNameValue', 0x3cc: 'MinimapImage', 0x3d0: 'MinimapImageBackdrop', 0x3d4: 'SuggestedPlayersLabel', 0x3d8: 'MapSizeLabel', 0x3dc: 'MapTilesetLabel', 0x3e0: 'MapDescLabel', 0x3e4: 'SuggestedPlayersValue', 0x3e8: 'MapSizeValue', 0x3ec: 'MapTilesetValue', 0x3f0: 'MapDescValue'}
frames = {name: 0x1010000 + i * 0x100 for i, name in enumerate(fields.values())}
names = {pointer + 0xb4: name for name, pointer in frames.items()}
names[PANE + 0xb4] = 'MapInfoPane'
point_names = ['TOPLEFT', 'TOP', 'TOPRIGHT', 'LEFT', 'CENTER', 'RIGHT', 'BOTTOMLEFT', 'BOTTOM', 'BOTTOMRIGHT']
anchors = []


def u32(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]


def put(address, value):
    cpu.mem_write(address, struct.pack('<I', value))


def number(address, value):
    cpu.mem_write(address, struct.pack('<f', value))


def cstring(address):
    raw = bytearray()
    for i in range(1024):
        byte = cpu.mem_read(address + i, 1)
        if byte == b'\0':
            return raw.decode('utf-8')
        raw.extend(byte)
    raise ValueError('Unterminated original string argument')


def returns(count, value=1):
    stack = cpu.reg_read(UC_X86_REG_ESP)
    cpu.reg_write(UC_X86_REG_EAX, value)
    cpu.reg_write(UC_X86_REG_EIP, u32(stack))
    cpu.reg_write(UC_X86_REG_ESP, stack + 4 + count)


def hook(_, address, size, context):
    stack = cpu.reg_read(UC_X86_REG_ESP)
    ecx, edx = cpu.reg_read(UC_X86_REG_ECX), cpu.reg_read(UC_X86_REG_EDX)
    if address == BOUNDS:
        cpu.mem_write(u32(stack + 4), struct.pack('<4f', .1, .2, .4, .434375))
        returns(4)
    elif address in (SHOW, HIDE):
        returns(0)
    elif address in (0x6f0bcb50, 0x6f0bd630):
        returns(4)
    elif address == 0x6f0bd8a0:
        point, target, relative, x, y, valid = struct.unpack('<IIIffI', cpu.mem_read(stack + 4, 24))
        assert valid == 1
        anchors.append(dict(frame=names[ecx], point=point_names[point], relative=names[target], target=point_names[relative], x=x, y=y))
        returns(24)
    elif address == 0x6f701fb0:
        value = data[cstring(ecx)][cstring(edx)].split(',')[0]
        returns(4, int(value))
    elif address == 0x6f1205d4:
        dest, length, fmt, index = struct.unpack('<4I', cpu.mem_read(stack + 4, 16))
        assert cstring(fmt) == 'Size%02d'
        text = f'Size{index:02d}'.encode()
        assert len(text) < length
        cpu.mem_write(dest, text + b'\0')
        returns(0, len(text))
    elif address == 0x6f7020d0:
        dest, length, index = struct.unpack('<3I', cpu.mem_read(stack + 4, 12))
        key = data[cstring(ecx)][cstring(edx)].split(',')[index]
        text = strings['WorldEditStrings'][key].encode('utf-8')
        assert len(text) < length
        cpu.mem_write(dest, text + b'\0')
        returns(12)
    elif address == 0x6f700320:
        length = u32(stack + 4)
        text = strings['WorldEditStrings'][cstring(ecx)].encode('utf-8')
        assert len(text) < length
        cpu.mem_write(edx, text + b'\0')
        returns(8)
    elif address == 0x6f771125:
        returns(0)


cpu.hook_add(unicorn.UC_HOOK_CODE, hook)


def reset(mode=1):
    anchors.clear()
    for pointer in [PANE, *frames.values()]:
        put(pointer, VTABLE)
        put(pointer + 0xb4, VTABLE)
        number(pointer + 0xb4 + 0x58, .01875)
        number(pointer + 0xb4 + 0x60, 1)
    put(VTABLE + 0x10, BOUNDS)
    put(VTABLE + 0x18, 0x6f0bce40)
    put(VTABLE + 0xd0, HIDE)
    put(VTABLE + 0xd4, SHOW)
    for offset, name in fields.items():
        put(PANE + offset, frames[name])
    put(PANE + 0x194, 0xffff)
    put(PANE + 0x184, mode)
    number(PANE + 0x3ac, .002)
    number(frames['MinimapImage'] + 0xb4 + 0x58, .13125)
    number(frames['MinimapImageBackdrop'] + 0xb4 + 0x58, .183125)
    cpu.reg_write(UC_X86_REG_EBP, BASE)
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, PANE)
    put(STACK, STOP)


layouts = []
for mode in [0, 1]:
    reset(mode)
    cpu.emu_start(0x6f2b3f50, STOP, count=10000)
    assert cpu.reg_read(UC_X86_REG_ESP) == STACK + 4
    layouts.append(dict(mode=mode, anchors=list(anchors)))
for actual, expected in zip(layouts[1]['anchors'], native['anchors'], strict=True):
    for key in ['frame', 'point', 'relative', 'target']:
        assert actual[key] == expected[key], (actual, expected)
    for key in ['x', 'y']:
        assert abs(actual[key] - expected[key]) < 1e-7, (actual, expected)

titles = []
for name, icon, auth, known, expected in native['titles']:
    reset()
    number(frames['AuthIcon'] + 0xb4 + 0x58, auth)
    number(BASE - 0x3db8, icon)
    number(BASE - 0x3dcc, name)
    put(BASE - 0x3db4, 0 if known else 2)
    cpu.reg_write(UC_X86_REG_EDI, PANE)
    cpu.reg_write(UC_X86_REG_ECX, frames['AuthIcon'])
    cpu.emu_start(0x6f2b3d06, 0x6f2b3de0, count=1000)
    assert len(anchors) == 1 and anchors[0]['frame'] == 'MaxPlayersIcon'
    assert abs(anchors[0]['x'] + expected) < 1e-7 and abs(anchors[0]['y'] + .002) < 1e-7, (anchors, expected)
    titles.append(dict(name=name, icon=icon, auth=auth, authenticated=known, sourceOffset=-anchors[0]['x']))

sizes = []
for width, height, expected in native['sizes']:
    reset()
    dest = 0x1031000
    cpu.mem_write(dest, bytes(512))
    cpu.mem_write(STACK, struct.pack('<3I', STOP, dest, 512))
    cpu.reg_write(UC_X86_REG_ECX, width)
    cpu.reg_write(UC_X86_REG_EDX, height)
    cpu.emu_start(0x6f701fe0, STOP, count=10000)
    actual = cstring(dest)
    assert actual == expected, (width, height, actual, expected)
    sizes.append(dict(width=width, height=height, text=actual))

result = dict(binarySha256=digest, originalLayoutModes=layouts, anchorsCompared=len(native['anchors']), titleCases=titles, sizeCases=sizes,
              sourceMembers=source_digests,
              nativeFixtureSha256=hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
              stubbedBoundaries=['frame bounds/visibility/invalidation/anchor sink', 'config integer/string lookup', 'bounded string formatting', 'security-cookie check'],
              limitations=['Only source layout and size-classification instructions execute under Unicorn.', 'Font metrics, resource pixels, device lifecycle, input and gameplay remain unverified.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(anchorsCompared=len(native['anchors']), titleCases=len(titles), sizeCases=len(sizes), passed=True)))
