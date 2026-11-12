"""Author: MiYu. Probe pinned 1.27 creep-camp selection with synthetic camps and distance results.

The original selection routine runs under Unicorn; campaign objects, path costs and its
external helpers are controlled. It does not execute map AI or original pathfinding.
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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/creep-distance-analysis/selection.json')
args = parser.parse_args()
binary = (args.data_root / 'Game.dll').read_bytes()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
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

def get(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]

current = 0
helpers = {0x6f891140: 4, 0x6f88eb10: 0, 0x6f03b720: 4, 0x6f03c310: 32, 0x6f107730: 0, 0x6f88ff40: 0, 0x6f890e80: 0}

def hook(uc, address, size, user):
    global current
    if address not in helpers:
        return
    ecx = uc.reg_read(UC_X86_REG_ECX)
    value = 0
    if address == 0x6f88eb10:
        current = ecx
        value = get(ecx + 0x20)
    elif address == 0x6f03c310:
        value = get(current + 0x28)
    elif address == 0x6f107730:
        value = 0x10002000
    elif address == 0x6f88ff40:
        value = get(ecx + 0x2c)
    elif address == 0x6f890e80:
        value = get(ecx + 0x30)
    stack = uc.reg_read(UC_X86_REG_ESP)
    uc.reg_write(UC_X86_REG_EAX, value)
    uc.reg_write(UC_X86_REG_EIP, get(stack))
    uc.reg_write(UC_X86_REG_ESP, stack + 4 + helpers[address])

cpu.hook_add(unicorn.UC_HOOK_CODE, hook)
put(0x10002000 + 0x9c, 100000)

def select(camps, minimum=5, maximum=10, air=False):
    array, actor, stack = 0x10003000, 0x10004000, 0x200f0000
    put(0x6fbf17e4, len(camps))
    put(0x6fbf1834, array)
    for index, (distance, level, flying) in enumerate(camps):
        camp = 0x10010000 + index * 0x400
        unit = camp + 0x100
        put(array + index * 4, camp)
        put(camp + 0x20, unit)
        put(camp + 0x24, 1)
        put(camp + 0x28, distance)
        put(camp + 0x2c, level)
        put(camp + 0x30, int(flying))
    cpu.mem_write(stack, struct.pack('<III', 0x30000020, maximum, int(air)))
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, actor)
    cpu.reg_write(UC_X86_REG_EDX, minimum)
    cpu.emu_start(0x6f88f940, 0x30000020, count=10000)
    result = cpu.reg_read(UC_X86_REG_EAX)
    return None if result == 0 else (result - 0x10010100) // 0x400

cases = [
    ('preferred_over_weak', [(100, 2, False), (200, 5, False)], False, 1),
    ('weak_fallback', [(100, 2, False), (200, 3, False)], False, 0),
    ('strong_blocks_far', [(100, 11, False), (301, 5, False)], False, None),
    ('strong_allows_boundary', [(100, 11, False), (300, 5, False)], False, 1),
    ('strong_clears_prior', [(301, 5, False), (100, 11, False)], False, None),
    ('strong_keeps_prior_boundary', [(300, 5, False), (100, 11, False)], False, 0),
    ('air_blocks_when_forbidden', [(100, 5, True), (301, 5, False)], False, None),
    ('air_allowed', [(100, 5, True), (301, 5, False)], True, 0),
    ('equal_cost_keeps_first', [(100, 5, False), (100, 6, False)], False, 0),
    ('strong_clears_weak', [(301, 2, False), (100, 11, False)], False, None),
    ('strong_keeps_weak_boundary', [(300, 2, False), (100, 11, False)], False, 0),
    ('unreachable_sentinel', [(999999, 5, False)], False, None),
    ('empty', [], False, None),
]
results = []
for name, camps, air, expected in cases:
    actual = select(camps, air=air)
    assert actual == expected, f'{name}: expected {expected}, got {actual}'
    results.append({'name': name, 'actual': actual})
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'sha256': digest, 'results': results, 'scope': 'synthetic camps and injected distance results; original selection instructions only'}, indent=2), encoding='utf-8')
print(f'RESULT passed={len(results)} failed=0 output={args.output}')
