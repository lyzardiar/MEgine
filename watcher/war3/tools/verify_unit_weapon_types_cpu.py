"""Author: MiYu. Check original 1.27 weapon-target classification on synthetic data."""
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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_ESP, UC_X86_REG_EDX

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/unit-attack-types/reference.json')
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


def invoke(address, obj):
    cpu.mem_write(0x200f0000, struct.pack('<I', 0x30000020))
    cpu.reg_write(UC_X86_REG_ESP, 0x200f0000)
    cpu.reg_write(UC_X86_REG_ECX, obj)
    cpu.emu_start(address, 0x30000020, count=10000)
    return cpu.reg_read(UC_X86_REG_EAX)


# The original parsed-target table maps full and abbreviated names to bit flags.
for address, name, flag in [(0x6fb6a0b0, b'air', 4), (0x6fb6a130, b'grou', 2),
                            (0x6fb6a138, b'ground', 2), (0x6fb6a1f8, b'stru', 8),
                            (0x6fb6a200, b'structure', 8)]:
    assert bytes(cpu.mem_read(u32(address), len(name) + 1)) == name + b'\0'
    assert u32(address + 4) == flag
weapon = 0x10001000
for enabled, first, second, ground, air in [
        (0x80000, 8, 0, 0, 0), (0x80000, 2, 0, 1, 0),
        (0x80000, 4, 0, 0, 1), (0x100000, 0, 2, 1, 0),
        (0x80000, 8, 2, 0, 0), (0x180000, 8, 6, 1, 1)]:
    put(weapon + 0x20, enabled)
    put(weapon + 0x218, first)
    put(weapon + 0x21c, second)
    assert invoke(0x6f47b9b0, weapon) == ground
    assert invoke(0x6f47b960, weapon) == air
# Compare raw type and target-mask predicates, and the live two-weapon path.
classification = [(1, 64, 0, 0), (1, 128, 0, 0), (1, 256, 0, 0), (1, 1, 0, 0),
                  (1, 66, 1, 0), (2, 64, 0, 0), (2, 2, 0, 1), (8, 66, 0, 1),
                  (0, 2, 0, 0), (9, 2, 0, 0)]
for kind, mask, melee, ranged in classification:
    for entry, expected in [(0x6f1e7f40, melee), (0x6f1e8350, ranged)]:
        cpu.mem_write(0x200f0000, struct.pack('<I', 0x30000020))
        cpu.reg_write(UC_X86_REG_ESP, 0x200f0000)
        cpu.reg_write(UC_X86_REG_ECX, kind)
        cpu.reg_write(UC_X86_REG_EDX, mask)
        cpu.emu_start(entry, 0x30000020, count=10000)
        assert cpu.reg_read(UC_X86_REG_EAX) == expected
    put(weapon + 0x20, 0x80000)
    put(weapon + 0xdc, kind)
    put(weapon + 0x218, mask)
    assert invoke(0x6f47ba00, weapon) == melee
    assert invoke(0x6f47ba90, weapon) == ranged

result = dict(binarySha256=digest, passed=True, cases=6, classificationCases=len(classification), tableChecked=True,
              limitations=['Synthetic weapon object; JASS runtime, maps and gameplay were not executed.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
