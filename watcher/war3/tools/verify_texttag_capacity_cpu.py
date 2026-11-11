"""Author: MiYu. Inspect pinned original text-tag slots and alpha under a synthetic manager.

Runs original create, lookup, destroy and alpha-update instructions under Unicorn. The manager,
free list and callback boundaries are controlled; this does not run JASS or UI.
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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/texttag-capacity/reference.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
binary = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(binary).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Addresses require pinned Game.dll'
pe = pefile.PE(data=binary)
assert pe.OPTIONAL_HEADER.ImageBase == 0x6f000000 and pe.FILE_HEADER.Machine == 0x14c
blob = pe.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x10000000, 0x100000)
cpu.mem_map(0x20000000, 0x100000)
cpu.mem_map(0x30000000, 0x1000)


def put(address, value):
    cpu.mem_write(address, struct.pack('<I', value))


def u32(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]


def invoke(address, this, *args):
    stack = 0x200f0000
    cpu.mem_write(stack, struct.pack('<' + 'I' * (1 + len(args)), 0x30000020, *args))
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, this)
    cpu.emu_start(address, 0x30000020, count=10000)
    return cpu.reg_read(UC_X86_REG_EAX)


parent, array, free, vtable = 0x10001000, 0x10010000, 0x10020000, 0x10030000
pool = parent + 0x2c8
assert u32(0x6fb78224) == 100
cpu.mem_write(0x30000000, b'\xc3')
cpu.mem_write(0x30000010, b'\xc2\x04\x00')
put(pool, vtable)
put(vtable, 0x30000000)
put(vtable + 4, 0x30000010)
put(pool + 8, 100)
put(pool + 12, array)
put(pool + 0x20, free)
put(pool + 0x24, 100)
for index in range(100):
    put(free + index * 4, index)
    put(array + index * 0x34 + 0x30, 0x10)
created = [invoke(0x6f265f80, parent) for _ in range(100)]
assert created == list(range(99, -1, -1))
assert u32(pool + 0x24) == 0 and u32(pool + 0x14) == 100
assert u32(array + 0x30) & 0x10 == 0
assert invoke(0x6f265f80, parent) == 0
assert u32(pool + 0x24) == 0 and u32(pool + 0x14) == 100
assert invoke(0x6f8770e0, pool, 0) == array
invoke(0x6f877060, pool, 0)
assert u32(pool + 0x24) == 1 and u32(pool + 0x14) == 99
assert invoke(0x6f265f80, parent) == 0
assert u32(pool + 0x24) == 0 and u32(pool + 0x14) == 100
invoke(0x6f877060, pool, 42)
assert invoke(0x6f265f80, parent) == 42
color = 0x10040000
record = array + 42 * 0x34
put(color, 0x80112233)
invoke(0x6f877f80, pool, 42, color)
assert cpu.mem_read(record + 0x27, 2) == bytes([128, 255])
step = struct.unpack('<I', struct.pack('<f', 1 / 32))[0]
invoke(0x6f8781e0, pool, step)
assert cpu.mem_read(record + 0x27, 1)[0] == 255
invoke(0x6f878140, pool, 42, 1)
put(color, 0x11112233)
invoke(0x6f877f80, pool, 42, color)
invoke(0x6f8781e0, pool, step)
assert cpu.mem_read(record + 0x27, 1)[0] == 17
invoke(0x6f878140, pool, 42, 0)
invoke(0x6f8774b0, pool, 42, 0)
invoke(0x6f877f60, pool, 42, struct.unpack('<I', struct.pack('<f', 50))[0])
put(color, 0x80112233)
invoke(0x6f877f80, pool, 42, color)
invoke(0x6f8781e0, pool, step)
assert cpu.mem_read(record + 0x27, 1)[0] == 128
invoke(0x6f877f60, pool, 42, struct.unpack('<I', struct.pack('<f', 95))[0])
invoke(0x6f8781e0, pool, step)
assert cpu.mem_read(record + 0x27, 1)[0] == 126
invoke(0x6f877fa0, pool, 42, struct.unpack('<I', struct.pack('<f', 98))[0])
invoke(0x6f8781e0, pool, step)
assert cpu.mem_read(record + 0x27, 1)[0] == 126
invoke(0x6f8774b0, pool, 42, 1)
invoke(0x6f8781e0, pool, step)
assert cpu.mem_read(record + 0x27, 1)[0] == 255
result = dict(binarySha256=digest, slots=100, first=created[0], last=created[-1], fullReturn=0,
              zeroSlotAllocated=True, zeroSlotReusable=True, nonzeroSlotReusable=True, alphaTransitions=True, passed=True,
              boundaries=['Synthetic manager and prepopulated free list', 'Virtual callbacks replaced by returns'],
              limitations=['Raw x86 entry points only; JASS null mapping, runtime initialization, UI and gameplay were not executed.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
