"""Author: MiYu. Probe pinned original network-object pool instructions with synthetic memory.

The original x86 pool code runs offline; Storm allocation imports use a bounded synthetic
heap. This does not establish actual object creation order or original LAN compatibility.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESP

ROOT = Path(__file__).resolve().parents[3]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/network-object-pool-cpu/result.json')
args = parser.parse_args()
binary = (args.data_root / 'Game.dll').read_bytes()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
digest = hashlib.sha256(binary).hexdigest()
if digest != profile['referenceGame']['sha256']:
    raise RuntimeError('Object-pool addresses require the pinned Game.dll')
image = pefile.PE(data=binary)
if image.OPTIONAL_HEADER.ImageBase != 0x6f000000 or image.FILE_HEADER.Machine != 0x14c:
    raise RuntimeError('Object-pool probe requires the pinned Win32 x86 image')
blob = image.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x100000)
cpu.mem_map(0x2000000, 0x10000)
cpu.mem_map(0x9000000, 0x1000)
POOL, CONFIG, LINKS, STACK, STOP = 0x1000000, 0x1004000, 0x1005000, 0x200f000, 0x9000000
HEAP, HEAP_END = 0x1080000, 0x1100000
next_heap = HEAP
blocks, imports, results = {}, [], []

def put(address, value):
    cpu.mem_write(address, struct.pack('<I', value & 0xffffffff))

def get(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]

def allocate_import(uc, address, size, user):
    global next_heap
    if address not in (0x6f120628, 0x6f12062e):
        return
    stack = uc.reg_read(UC_X86_REG_ESP)
    reallocate = address == 0x6f12062e
    old = get(stack + 4) if reallocate else 0
    length = get(stack + (8 if reallocate else 4))
    if not 0 < length <= 0x10000:
        raise RuntimeError('Synthetic Storm allocation exceeds budget')
    memory = next_heap
    next_heap += (length + 15) & ~15
    if next_heap > HEAP_END:
        raise RuntimeError('Synthetic Storm heap exhausted')
    if reallocate:
        if old not in blocks:
            raise RuntimeError('Synthetic Storm reallocation has unknown source')
        uc.mem_write(memory, bytes(uc.mem_read(old, min(blocks[old], length))))
    blocks[memory] = length
    imports.append({'kind': 'realloc' if reallocate else 'alloc', 'bytes': length})
    uc.reg_write(UC_X86_REG_EAX, memory)
    uc.reg_write(UC_X86_REG_ESP, stack + (24 if reallocate else 20))
    uc.reg_write(UC_X86_REG_EIP, get(stack))

cpu.hook_add(unicorn.UC_HOOK_CODE, allocate_import, begin=0x6f120628, end=0x6f12062e)
put(0x6fbe40a8, POOL)
for offset in (0, 0x20):
    put(POOL + offset + 4, 0xffffffff)
    put(POOL + offset + 0x14, 2)
put(POOL + 0x40, 0xffffffff)
put(POOL + 0x44, 0xffffffff)

def call(address, ecx, arguments=(), edx=0):
    put(STACK, STOP)
    for index, value in enumerate(arguments):
        put(STACK + 4 + index * 4, value)
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, ecx)
    cpu.reg_write(UC_X86_REG_EDX, edx)
    cpu.emu_start(address, STOP, count=10000)
    if cpu.reg_read(UC_X86_REG_EIP) != STOP:
        raise RuntimeError('Original function did not return within instruction budget')
    return cpu.reg_read(UC_X86_REG_EAX)

def allocate(link, config=0):
    call(0x6f1a76f0, link, (config,))
    return get(link + 0x14), get(link + 0x18)

def resolve(identity):
    return call(0x6f037350, identity[0], edx=identity[1])

def check(name, actual, expected):
    if actual != expected:
        raise RuntimeError(f'{name}: expected {expected!r}, got {actual!r}')
    results.append({'name': name, 'actual': actual})

put(CONFIG + 0x24, 0xfffffffe)
identities = []
for index in range(3):
    low, high = allocate(LINKS + 2 * index * 0x100), allocate(LINKS + (2 * index + 1) * 0x100, CONFIG)
    identities.extend((low, high))
    check(f'low_allocate_{index}', low, (index, index))
    check(f'high_allocate_{index}', high, (0x80000000 + index, index))
check('both_pools_count', (get(POOL + 0x1c), get(POOL + 0x3c)), (3, 3))
check('heap_growth', imports, [{'kind': 'alloc', 'bytes': 16}, {'kind': 'alloc', 'bytes': 16}, {'kind': 'realloc', 'bytes': 32}, {'kind': 'realloc', 'bytes': 32}])
for index, identity in enumerate(identities):
    check(f'resolve_{index}', resolve(identity), LINKS + index * 0x100)
call(0x6f1ae2b0, POOL, (identities[3][0], LINKS + 3 * 0x100))
check('released_identity', resolve(identities[3]), 0)
reused = allocate(LINKS + 6 * 0x100, CONFIG)
check('high_pool_reuse', reused, (0x80000001, 3))
check('reused_identity', resolve(reused), LINKS + 6 * 0x100)
check('stale_identity', resolve(identities[3]), 0)
check('other_pool_unchanged', resolve(identities[2]), LINKS + 2 * 0x100)
check('out_of_range_low', resolve((3, 0)), 0)
check('out_of_range_high', resolve((0x80000003, 0)), 0)
call(0x6f1ae2b0, POOL, (identities[0][0], LINKS))
check('released_low_identity', resolve(identities[0]), 0)
low_reused = allocate(LINKS + 7 * 0x100)
check('low_pool_reuse', low_reused, (0, 3))
check('low_reused_identity', resolve(low_reused), LINKS + 7 * 0x100)
check('low_stale_identity', resolve(identities[0]), 0)
check('high_pool_unchanged', resolve(reused), LINKS + 6 * 0x100)

args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'sha256': digest, 'results': results, 'scope': 'Synthetic two-pool state and bounded Storm allocation imports; no original runtime object creation order, actual Storm allocation behavior, product integration or LAN compatibility.'}, indent=2), encoding='utf-8')
print(f'RESULT passed={len(results)} failed=0 output={args.output}')
