"""Author: MiYu. Compare clock real assignments with pinned original instructions before subscriber notification."""
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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/clock/tests/clock-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/clock/clock-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Clock addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, STOP, VARIABLE, REFERENCE, INPUT, OUTPUT, TEMP = 0x1008000, 0x1010000, 0x1011000, 0x1012000, 0x1013000, 0x1014000, 0x1015000

def word(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]

def write(address, value):
    cpu.mem_write(address, struct.pack('<I', value & 0xffffffff))

def returned(extra=0):
    stack = cpu.reg_read(UC_X86_REG_ESP)
    target = word(stack)
    cpu.reg_write(UC_X86_REG_ESP, stack + 4 + extra)
    cpu.reg_write(UC_X86_REG_EIP, target)

def boundary(uc, address, size, data):
    if address == 0x6f037350:
        uc.reg_write(UC_X86_REG_EAX, VARIABLE)
        returned()
    elif address == 0x6f10d790:
        out = word(uc.reg_read(UC_X86_REG_ESP) + 4)
        write(out, 0)
        uc.reg_write(UC_X86_REG_EAX, out)
        returned(4)
    elif address == 0x6f10d7e0:
        returned()

for address in [0x6f037350, 0x6f10d790, 0x6f10d7e0]:
    cpu.hook_add(unicorn.UC_HOOK_CODE, boundary, begin=address, end=address)

def run(address, ecx=REFERENCE, edx=0, parameters=()):
    cpu.mem_write(STACK, struct.pack('<' + 'I' * (len(parameters) + 1), STOP, *parameters))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, ecx)
    cpu.reg_write(UC_X86_REG_EDX, edx)
    cpu.emu_start(address, STOP, count=30000)
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP, 'Clock instructions did not return'
    return cpu.reg_read(UC_X86_REG_EAX)

fixture_raw = args.fixture.read_bytes()
fixture = json.loads(fixture_raw)
assert fixture['assignments'] and fixture['rates']
mismatches = []
for scale, initial, requested, expected in fixture['assignments']:
    cpu.mem_write(VARIABLE, bytes(0x90))
    write(VARIABLE + 0x78, initial)
    write(VARIABLE + 0x80, 0xff7fffff if scale else 0)
    write(VARIABLE + 0x84, 0x7f7fffff if scale else 0x41c00000)
    write(INPUT, requested)
    run(0x6f03afb0, parameters=(INPUT,))
    run(0x6f03adf0, parameters=(OUTPUT,))
    if word(OUTPUT) != expected:
        mismatches.append((scale, initial, requested, word(OUTPUT), expected))

assert not mismatches, ('Clock assignment differs', len(mismatches), mismatches[:16])

for scale, hours, length, expected in fixture['rates']:
    write(INPUT, scale)
    write(INPUT + 4, hours)
    write(INPUT + 8, length)
    run(0x6f0527e0, ecx=TEMP, edx=INPUT, parameters=(INPUT + 4,))
    run(0x6f052af0, ecx=OUTPUT, edx=TEMP, parameters=(INPUT + 8, 0x6fbb81d4))
    assert word(OUTPUT) == expected, ('Clock rate differs', scale, hours, length, word(OUTPUT), expected)

report = dict(binarySha256=digest, fixtureSha256=hashlib.sha256(fixture_raw).hexdigest(), clockSourceSha256=hashlib.sha256((ROOT / 'watcher/war3/src/game_clock.cpp').read_bytes()).hexdigest(), assignmentCases=len(fixture['assignments']), rateCases=len(fixture['rates']), failed=0, gameDllLoaded=False, substitutedFunctions=['0x6f037350 reference resolution', '0x6f10d790 zero elapsed simulation time', '0x6f10d7e0 timestamp storage'], limitations=['No variable subscribers: this comparison excludes day-boundary notification, timer scheduling, and gameplay simulation.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
