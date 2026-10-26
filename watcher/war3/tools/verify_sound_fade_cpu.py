"""Author: MiYu. Compare MIDI fade steps and control transitions with original 1.27 instructions."""
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
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/audio/fade-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Fade addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, STOP, SOUND, DEFINITION, VOICE, HEAD, PARAMETERS = 0x1008000, 0x1010000, 0x1011000, 0x1012000, 0x1013000, 0x1014000, 0x1015000
PHASE = {0: 3, 1: 2, 2: 1, 3: 4}
backend = dict(playing=False, stopped=False, started=False)

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
    if address == 0x6f32f290:
        returned(8)  # State-list membership: scalar state/rate writes remain original.
    elif address == 0x6f173cb0:
        returned(12)  # Hardware volume application: original setter retains logical volume.
    elif address == 0x6f145dc0:
        backend.update(playing=False, stopped=True)
        returned()
    elif address == 0x6f144c10:
        uc.reg_write(UC_X86_REG_EAX, int(backend['playing']))
        returned()
    elif address == 0x6f145020:
        write(VOICE + 0x144, uc.reg_read(UC_X86_REG_EDX))
        backend.update(playing=True, started=True)
        uc.reg_write(UC_X86_REG_EAX, 0)
        returned(12)
    elif address == 0x6f18ce10:
        returned()  # Zero-volume diagnostic has no effect on playback controls.

for address in [0x6f32f290, 0x6f173cb0, 0x6f145dc0, 0x6f144c10, 0x6f145020, 0x6f18ce10]:
    cpu.hook_add(unicorn.UC_HOOK_CODE, boundary, begin=address, end=address)

def run(address, ecx=SOUND, edx=0, parameters=()):
    cpu.mem_write(STACK, struct.pack('<' + 'I' * (len(parameters) + 1), STOP, *parameters))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, ecx)
    cpu.reg_write(UC_X86_REG_EDX, edx)
    cpu.emu_start(address, STOP, count=30000)
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP, ('Fade instructions did not return', hex(address))

def setup(phase, in_rate, out_rate, target, level, active, playing=True):
    cpu.mem_write(SOUND, bytes(0x200))
    cpu.mem_write(DEFINITION, bytes(0x100))
    cpu.mem_write(VOICE, bytes(0x200))
    write(SOUND, 0x6f9897f4)
    write(SOUND + 8, VOICE)
    write(SOUND + 0xc, in_rate)
    write(SOUND + 0x10, out_rate)
    write(SOUND + 0x14, active)
    write(SOUND + 0x18, PHASE[phase])
    write(SOUND + 0x138, DEFINITION)
    write(DEFINITION + 0x2c, target)
    write(VOICE + 0x144, level)
    backend.update(playing=playing, stopped=False, started=False)

fixture_raw = args.fixture.read_bytes()
fixture = json.loads(fixture_raw)
assert fixture['steps'] and fixture['starts'] and fixture['rates']
for phase, in_rate, out_rate, target, before, after_phase, after, action, active in fixture['steps']:
    setup(phase, in_rate, out_rate, target, before, active)
    run(0x6f3223d0 if phase == 2 else 0x6f322810)
    actual = (word(VOICE + 0x144), word(SOUND + 0x18), 2 if backend['started'] else 1 if backend['stopped'] else 0)
    expected = (after, PHASE[after_phase], action)
    assert actual == expected, ('Fade step differs', phase, in_rate, out_rate, target, before, actual, expected)

for rate, expected_in, expected_out in fixture['rates']:
    write(PARAMETERS, rate)
    write(PARAMETERS + 4, rate)
    run(0x6f31fe20, ecx=PARAMETERS, edx=PARAMETERS + 4)
    assert (word(PARAMETERS), word(PARAMETERS + 4)) == (expected_in, expected_out), 'Unsigned rate normalization differs'

for rate, target, faded, playing, before, after, phase, started in fixture['starts']:
    normalized = max(1, rate)
    setup(1 if playing else 0, normalized, normalized, target, before, 0, bool(playing))
    run(0x6f33ba00, edx=faded)
    actual = (word(VOICE + 0x144), word(SOUND + 0x18), backend['started'])
    assert actual == (after, PHASE[phase], bool(started)), ('Source start differs', rate, target, faded, playing, actual, (after, PHASE[phase], started))

report = dict(binarySha256=digest, fixtureSha256=hashlib.sha256(fixture_raw).hexdigest(), sourceSha256=hashlib.sha256((ROOT / 'watcher/war3/src/sound_fade.cpp').read_bytes()).hexdigest(), stepCases=len(fixture['steps']), rateCases=len(fixture['rates']), startCases=len(fixture['starts']), failed=0, gameDllLoaded=False, substitutedFunctions=['0x6f32f290 intrusive list links', '0x6f173cb0 hardware volume', '0x6f145dc0 backend stop', '0x6f144c10 playback status', '0x6f145020 backend play', '0x6f18ce10 zero-volume diagnostic'], limitations=['Non-spatial MIDI with available resource and volume target in 0..127; physical output and source timers are not emulated.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
