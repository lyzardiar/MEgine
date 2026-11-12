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
transformed = None
helpers = {0x6f891140: 4, 0x6f88eb10: 0, 0x6f03b720: 4, 0x6f03c310: 32, 0x6f107730: 0, 0x6f88ff40: 0, 0x6f890e80: 0, 0x6f111380: 24}

def hook(uc, address, size, user):
    global current, transformed
    if address == 0x6f10ef30 and transformed is not None:
        stack = uc.reg_read(UC_X86_REG_ESP)
        source, target = get(stack + 8), get(stack + 12)
        transformed.extend((struct.unpack('<ff', uc.mem_read(source, 8)), struct.unpack('<ff', uc.mem_read(target, 8))))
        uc.reg_write(UC_X86_REG_EAX, 123)
        uc.reg_write(UC_X86_REG_EIP, get(stack))
        uc.reg_write(UC_X86_REG_ESP, stack + 32)
        return
    if address not in helpers:
        return
    ecx = uc.reg_read(UC_X86_REG_ECX)
    value = 0
    if address == 0x6f111380:
        value = 1
    elif address == 0x6f88eb10:
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
def path_cost(points):
    actor, nodes, stack = 0x10005000, 0x10060000, 0x200f0000
    put(actor + 0x5c, nodes)
    put(actor + 0xa0, 0)
    for index, (x, y, special) in enumerate(points):
        node = nodes + index * 36
        put(node, x & 0xffffffff)
        put(node + 4, y & 0xffffffff)
        put(node + 0x1c, index - 1 if index else 0xffffffff)
        cpu.mem_write(node + 0x23, bytes([int(special)]))
    cpu.mem_write(stack, struct.pack('<II', 0x30000020, len(points) - 1))
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, actor)
    cpu.emu_start(0x6f10fb90, 0x30000020, count=10000)
    return cpu.reg_read(UC_X86_REG_EAX), get(actor + 0xa0)

path_cases = [
    ('path_single', [(0, 0, False)], (0, 0)),
    ('path_straight', [(0, 0, False), (3, 4, False)], (10, 0)),
    ('path_turn', [(0, 0, False), (3, 0, False), (3, 4, False)], (14, 0)),
    ('path_special', [(0, 0, True), (50, 50, False)], (2, 1)),
]
for name, points, expected in path_cases:
    actual = path_cost(points)
    assert actual == expected, f'{name}: expected {expected}, got {actual}'
    results.append({'name': name, 'actual': actual})
def direct_cost(start, end):
    actor, source, target, result, stack = 0x10005000, 0x10006000, 0x10006100, 0x10006200, 0x200f0000
    cpu.mem_write(source, struct.pack('<ff', *start))
    cpu.mem_write(target, struct.pack('<ff', *end))
    cpu.mem_write(stack, struct.pack('<IIIIIIII', 0x30000020, 0, source, target, 0, 0, result, 0))
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, actor)
    cpu.emu_start(0x6f10ef30, 0x30000020, count=10000)
    return cpu.reg_read(UC_X86_REG_EAX)

for name, start, end, expected in [
    ('direct_zero', (0, 0), (0, 0), 0),
    ('direct_axis', (0, 0), (3, 0), 6),
    ('direct_three_four', (0, 0), (3, 4), 10),
]:
    actual = direct_cost(start, end)
    assert actual == expected, f'{name}: expected {expected}, got {actual}'
    results.append({'name': name, 'actual': actual})
def coordinate_transform(scale, start, end):
    global transformed
    actor, config, bounds, source, target, stack = 0x10002000, 0x10007000, 0x10008000, 0x10009000, 0x10009100, 0x200f0000
    put(actor + 0x1c, config)
    for offset, value in zip((0x64, 0x68), scale):
        cpu.mem_write(config + offset, struct.pack('<f', value))
    put(0x6fbb82bc, bounds)
    put(bounds + 0x6c, 0)
    put(bounds + 0x70, 0)
    cpu.mem_write(source, struct.pack('<ff', *start))
    cpu.mem_write(target, struct.pack('<ff', *end))
    cpu.mem_write(stack, struct.pack('<IIIIIIIII', 0x30000020, 5000, 0, 0, 0, 0, 0, 0, 0))
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, source)
    cpu.reg_write(UC_X86_REG_EDX, target)
    transformed = []
    cpu.emu_start(0x6f03c3b0, 0x30000020, count=100000)
    result = transformed
    transformed = None
    assert cpu.reg_read(UC_X86_REG_EAX) == 123 and len(result) == 2
    return result

for name, scale, start, end, expected in [
    ('transform_unit', (1, 1), (32, 64), (96, 128), [(1, 2), (3, 4)]),
    ('transform_mixed_scales', (2, .5), (32, 64), (96, 128), [(.5, 1), (1.5, 2)]),
    ('transform_small_scale', (.0625, .0625), (32, 64), (96, 128), [(.0625, .125), (.1875, .25)]),
]:
    actual = coordinate_transform(scale, start, end)
    assert actual == expected, f'{name}: expected {expected}, got {actual}'
    results.append({'name': name, 'actual': actual})
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'sha256': digest, 'results': results, 'scope': 'synthetic camps and injected distance results; synthetic path nodes, map scales and injected path results; no original path search'}, indent=2), encoding='utf-8')
print(f'RESULT passed={len(results)} failed=0 output={args.output}')
