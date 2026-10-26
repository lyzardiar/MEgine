"""Author: MiYu. Compare valid inline colors with the pinned original x86 text parser.

Runs original parser and color packing instructions under Unicorn. ASCII decoding
and CRT strtol are controlled boundaries; it does not verify glyphs or gameplay.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/map-tests/text-color-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/map-menu/text-color-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
binary = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(binary).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Addresses require pinned Game.dll'
pe = pefile.PE(data=binary)
assert pe.OPTIONAL_HEADER.ImageBase == 0x6f000000 and pe.FILE_HEADER.Machine == 0x14c
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
blob = pe.get_memory_mapped_image()
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, TOKEN, COLOR, USED, CHAR, STOP, STRTOL = (0x1008000, 0x1001000, 0x1001100, 0x1001200, 0x1001300, 0x1010000, 0x1010010)


def u32(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]


def put(address, value):
    cpu.mem_write(address, struct.pack('<I', value))


def returned(value):
    stack = cpu.reg_read(UC_X86_REG_ESP)
    cpu.reg_write(UC_X86_REG_EAX, value)
    cpu.reg_write(UC_X86_REG_ESP, stack + 4)
    cpu.reg_write(unicorn.x86_const.UC_X86_REG_EIP, u32(stack))


def hook(_cpu, address, _size, _user):
    if address == 0x6f0501a0:
        char = cpu.mem_read(cpu.reg_read(UC_X86_REG_ECX), 1)[0]
        assert 0 < char < 128, 'Probe only supplies ASCII tokens'
        put(cpu.reg_read(UC_X86_REG_EDX), 1)
        returned(char)
    elif address == STRTOL:
        stack = cpu.reg_read(UC_X86_REG_ESP)
        token, end, base = struct.unpack('<3I', cpu.mem_read(stack + 4, 12))
        text = bytes(cpu.mem_read(token, 3))
        assert base == 16 and text[2] == 0
        put(end, token + 2)
        returned(int(text[:2], 16))


put(0x6f94e474, STRTOL)
cpu.hook_add(unicorn.UC_HOOK_CODE, hook)
cases = json.loads(args.fixture.read_text(encoding='utf-8'))
for case in cases:
    text = case['token'].encode('ascii')
    assert len(text) == 10
    cpu.mem_write(TOKEN, text + b'\0')
    for pointer in [COLOR, USED, CHAR]:
        put(pointer, 0)
    cpu.mem_write(STACK, struct.pack('<6I', STOP, COLOR, 0, 0, CHAR, len(text)))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, TOKEN)
    cpu.reg_write(UC_X86_REG_EDX, USED)
    cpu.emu_start(0x6f0d8780, STOP, count=2000)
    actual = u32(COLOR)
    assert actual == case['value'], (case, hex(actual))
    assert cpu.reg_read(UC_X86_REG_EAX) == 0 and u32(USED) == 10
    assert cpu.reg_read(UC_X86_REG_ESP) == STACK + 24
result = dict(binarySha256=digest, nativeFixtureSha256=hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
              colorCasesCompared=len(cases), passed=True, entry='0x6f0d8780', opaqueAlpha='0x6f0d8948',
              stubbedBoundaries=['ASCII codepoint decode', 'CRT strtol for two valid hex digits'],
              limitations=['Valid inline color tokens only; original Game.dll is instruction data under Unicorn.', 'Glyph rendering, malformed escapes, UI pixels and gameplay are outside this check.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
