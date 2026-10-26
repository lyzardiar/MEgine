"""Author: MiYu. Compare music RNG and fade arithmetic with pinned classic x86 instructions."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESP, UC_X86_REG_FPCW, UC_X86_REG_MXCSR

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/audio/music-tests/music-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/audio/music-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Music addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
table = (ROOT / 'watcher/war3/src/audio_random.inc').read_text(encoding='utf-8')
words = [int(value, 16) for value in re.findall(r'\b0x([0-9a-fA-F]{8})u', table)]
assert len(words) == 64 and struct.pack('<64I', *words) == blob[0x964e48:0x964f48], 'Source sound RNG table differs'
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
# Win32 CRT masks floating exceptions; Unicorn's reset x87 control word is zero.
cpu.reg_write(UC_X86_REG_FPCW, 0x37f)
cpu.reg_write(UC_X86_REG_MXCSR, 0x1f80)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, STOP, RANDOM = 0x1008000, 0x1010000, 0x1011000
state = dict(now=0, volume=None, paused=False, timer=False)


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
    if address == 0x6f154d30:
        uc.reg_write(UC_X86_REG_EAX, state['now'])
        returned()
    elif address == 0x6f33a250:
        uc.reg_write(UC_X86_REG_EAX, 1)
        returned()
    elif address == 0x6f145a20:
        state['volume'] = uc.reg_read(UC_X86_REG_EDX)
        returned()
    elif address == 0x6f057d50:
        assert word(uc.reg_read(UC_X86_REG_ESP) + 4) == 0x3d4ccccd, 'Source callback cadence differs'
        assert uc.reg_read(UC_X86_REG_ECX) == 0x6f3308e0, 'Source fade callback differs'
        state['timer'] = True
        uc.reg_write(UC_X86_REG_EAX, 0x1012000)
        returned(4)
    elif address == 0x6f33b120:
        assert uc.reg_read(UC_X86_REG_ECX) == 0, 'Source fade completion must pause without another fade'
        state['paused'] = True
        returned()


for address in [0x6f154d30, 0x6f33a250, 0x6f145a20, 0x6f057d50, 0x6f33b120]:
    cpu.hook_add(unicorn.UC_HOOK_CODE, boundary, begin=address, end=address)


def run(address, ecx=RANDOM, parameters=()):
    cpu.mem_write(STACK, struct.pack('<' + 'I' * (len(parameters) + 1), STOP, *parameters))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, ecx)
    try:
        cpu.emu_start(address, STOP, count=30000)
    except unicorn.UcError as error:
        raise RuntimeError(f'Music CPU failed at {cpu.reg_read(UC_X86_REG_EIP):#x}, state={state}') from error
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP, ('Music instructions did not return', hex(address))


fixture_raw = args.fixture.read_bytes()
fixture = json.loads(fixture_raw)
assert fixture['rng'] and fixture['fade']
rng_cases = 0
for seed, value, offsets, draws in fixture['rng']:
    run(0x6f1ae7e0, parameters=(seed,))
    assert (word(RANDOM), word(RANDOM + 4)) == (value, offsets), ('Source sound RNG seed differs', seed)
    rng_cases += 1
    for value, offsets in draws:
        run(0x6f199400)
        assert (cpu.reg_read(UC_X86_REG_EAX), word(RANDOM), word(RANDOM + 4)) == (value, value, offsets), ('Source sound RNG step differs', seed, value, offsets)
        rng_cases += 1

for volume, duration, elapsed, out, expected in fixture['fade']:
    write(0x6fb69494, 0)
    write(0x6fbe61d4, duration)
    write(0x6fbe61d8, 0xfffffff0)
    write(0x6fbe5b54, out)
    write(0x6fb694a0, volume)
    state.update(now=(0xfffffff0 + elapsed) & 0xffffffff, volume=None, paused=False, timer=False)
    run(0x6f3308e0)
    assert state['volume'] == expected and state['timer'] and not state['paused'], ('Source fade differs', volume, duration, elapsed, out, expected, state)

# Exercise the original first-callback and strict completion branches, beyond ratio samples.
for out in [0, 1]:
    write(0x6fb69494, 1)
    write(0x6fbe61d4, 1000)
    write(0x6fbe5b54, out)
    write(0x6fb694a0, 127)
    state.update(now=1234, volume=None, paused=False, timer=False)
    run(0x6f3308e0)
    assert word(0x6fb69494) == 0 and word(0x6fbe61d8) == 1234
    assert state['timer'] and state['volume'] is None and not state['paused']
    state.update(now=2235, volume=None, paused=False, timer=False)
    run(0x6f3308e0)
    assert not state['timer'] and (state['paused'] if out else state['volume'] == 127)

source_paths = ['audio_random.cpp', 'audio_random.inc', 'music.cpp']
report = dict(binarySha256=digest, fixtureSha256=hashlib.sha256(fixture_raw).hexdigest(), sourceSha256={name: hashlib.sha256((ROOT / 'watcher/war3/src' / name).read_bytes()).hexdigest() for name in source_paths}, rngCases=rng_cases, fadeCases=len(fixture['fade']), callbackCases=4, failed=0, gameDllLoaded=False, substitutedFunctions=['0x6f154d30 wall-clock sample', '0x6f33a250 music presence', '0x6f145a20 hardware volume', '0x6f057d50 timer registration', '0x6f33b120 pause boundary'], limitations=['RNG seed/step run unchanged with the pinned table. Fade preserves source SSE arithmetic and original float-to-integer conversion; playback, scheduler phase, skin lookup and shared sound RNG consumption are outside this CPU comparison.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
