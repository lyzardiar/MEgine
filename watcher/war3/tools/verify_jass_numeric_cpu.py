"""Author: MiYu. Compare native JASS numeric operations with original 1.27 instructions.

Original I2R/R2I wrappers and helpers run under Unicorn with no substituted code
boundaries. Game.dll is PE instruction data; no Windows DLL loading occurs.
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
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/numeric-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/numeric-cpu.json')
parser.add_argument('--arithmetic-only', action='store_true', help='Reuse conversion evidence and compare arithmetic/decimal fixtures')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, VALUE, STOP = 0x1008000, 0x1001000, 0x1010000
fixture = json.loads(args.fixture.read_text(encoding='utf-8'))
i2r = [] if args.arithmetic_only else fixture['i2r']
r2i = [] if args.arithmetic_only else fixture['r2i']
for integer, expected in i2r:
    cpu.mem_write(STACK, struct.pack('<2I', STOP, integer & 0xffffffff))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.emu_start(0x6f1e7230, STOP, count=2000)
    actual = cpu.reg_read(UC_X86_REG_EAX)
    assert actual == expected, ('I2R', integer, hex(actual), hex(expected))
    assert cpu.reg_read(UC_X86_REG_ESP) == STACK + 4
for bits, expected in r2i:
    cpu.mem_write(VALUE, struct.pack('<I', bits))
    cpu.mem_write(STACK, struct.pack('<2I', STOP, VALUE))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.emu_start(0x6f1f2710, STOP, count=2000)
    actual = struct.unpack('<i', struct.pack('<I', cpu.reg_read(UC_X86_REG_EAX)))[0]
    assert actual == expected, ('R2I', hex(bits), actual, expected)
    assert cpu.reg_read(UC_X86_REG_ESP) == STACK + 4
operations = {'add': 0x6f0529d0, 'subtract': 0x6f0528b0, 'multiply': 0x6f0527e0, 'divide': 0x6f052af0}
binary = fixture.get('binary', [])
if args.arithmetic_only:
    assert binary, 'Arithmetic mode requires a binary fixture'
for left, right, *expected in binary:
    for (name, entry), expected_bits in zip(operations.items(), expected, strict=True):
        cpu.mem_write(VALUE, struct.pack('<3I', left, right, 0))
        cpu.mem_write(STACK, struct.pack('<2I', STOP, VALUE + 4))
        cpu.reg_write(UC_X86_REG_ESP, STACK)
        cpu.reg_write(UC_X86_REG_ECX, VALUE + 8)
        cpu.reg_write(UC_X86_REG_EDX, VALUE)
        cpu.emu_start(entry, STOP, count=5000)
        actual = struct.unpack('<I', cpu.mem_read(VALUE + 8, 4))[0]
        assert actual == expected_bits, (name, hex(left), hex(right), hex(actual), hex(expected_bits))
        assert cpu.reg_read(UC_X86_REG_EAX) == VALUE + 8 and cpu.reg_read(UC_X86_REG_ESP) == STACK + 8
CONTEXT, TOKEN = 0x1002000, 0x1003000
decimals = fixture.get('decimals', [])
for token, expected in decimals:
    text = token.encode('ascii')
    assert len(text) < 4096
    cpu.mem_write(CONTEXT, bytes(256))
    cpu.mem_write(TOKEN, text + b'\0')
    cpu.mem_write(CONTEXT + 0x98, struct.pack('<I', TOKEN))
    cpu.mem_write(CONTEXT + 0xc4, struct.pack('<I', len(text)))
    cpu.mem_write(STACK, struct.pack('<I', STOP))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, CONTEXT)
    cpu.emu_start(0x6f7fb880, STOP, count=20000)
    actual = struct.unpack('<I', cpu.mem_read(CONTEXT + 0x24, 4))[0]
    assert actual == expected, ('decimal', token, hex(actual), hex(expected))
    assert cpu.reg_read(UC_X86_REG_EAX) == 0x109 and cpu.reg_read(UC_X86_REG_ESP) == STACK + 4
result = dict(binarySha256=digest, nativeFixtureSha256=hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
              i2rCases=len(i2r), r2iCases=len(r2i), binaryPairs=len(binary), arithmeticCases=len(binary) * 4, decimalCases=len(decimals), passed=True,
              entries={'I2R': '0x6f1e7230', 'R2I': '0x6f1f2710'}, helpers=['0x6f053b90', '0x6f052b50', '0x6f052f80'],
              arithmeticEntries={name: hex(entry) for name, entry in operations.items()} if binary else {},
              reciprocalTableSha256=hashlib.sha256(image.get_data(0x952fc0, 4100)).hexdigest() if binary else None,
              decimalEntry='0x6f7fb880' if decimals else None,
              stubbedBoundaries=[], limitations=['Only selected numeric helpers and decimal token callback execute.', 'Full tokenizer, VM error/zero-divisor handling, expression ordering and gameplay are outside this check.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
