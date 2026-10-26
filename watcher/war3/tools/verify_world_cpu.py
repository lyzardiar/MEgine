"""Author: MiYu. Execute original world clamping and camera-distance instructions without loading Game.dll."""
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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EBP, UC_X86_REG_ECX, UC_X86_REG_EIP, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/world/world-clamp-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/world/world-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'World addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
base = image.OPTIONAL_HEADER.ImageBase
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(base, (len(blob) + 4095) & ~4095)
cpu.mem_write(base, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, STOP, WORLD, POINT = 0x1008000, 0x1010000, 0x1011000, 0x1012000

fixture_raw = args.fixture.read_bytes()
fixture = json.loads(fixture_raw)
assert len(fixture['bounds']) == 4 and fixture['cases']
cpu.mem_write(WORLD + 0x6c, struct.pack('<4I', *fixture['bounds']))
cpu.mem_write(0x6fbb82bc, struct.pack('<I', WORLD))
# The original static initializer at 0x6f001c20 constructs this Real from integer 32.
cpu.mem_write(0x6fbb8238, struct.pack('<f', 32.0))
for x, y, expected_x, expected_y in fixture['cases']:
    cpu.mem_write(POINT, struct.pack('<II', x, y))
    cpu.mem_write(STACK, struct.pack('<I', STOP))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, POINT)
    cpu.emu_start(0x6f02f150, STOP, count=20000)
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP, 'World clamp did not return'
    actual = struct.unpack('<II', cpu.mem_read(POINT, 8))
    assert actual == (expected_x, expected_y), ('World clamp differs', x, y, actual, expected_x, expected_y)

margin_path = args.fixture.parent / 'world-margin-native.json'
margin_raw = margin_path.read_bytes()
margins = json.loads(margin_raw)
assert margins
for cells, expected in margins:
    cpu.mem_write(STACK, struct.pack('<I', STOP))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_EBP, STACK)
    cpu.reg_write(UC_X86_REG_EAX, cells & 0xffffffff)
    # This tail is the original native's conversion after reading the source integer.
    cpu.emu_start(0x6f1e1a5a, 0x6f1e1a6e, count=100)
    assert cpu.reg_read(UC_X86_REG_EIP) == 0x6f1e1a6e, 'Camera conversion did not finish'
    actual = struct.unpack('<I', cpu.mem_read(STACK + 8, 4))[0]
    assert actual == expected, ('Camera margin conversion differs', cells, actual, expected)

report = dict(binarySha256=digest, clampFixtureSha256=hashlib.sha256(fixture_raw).hexdigest(), marginFixtureSha256=hashlib.sha256(margin_raw).hexdigest(), worldSourceSha256=hashlib.sha256((ROOT / 'watcher/war3/src/world.cpp').read_text(encoding='utf-8').encode()).hexdigest(), clampCases=len(fixture['cases']), cameraCases=len(margins), failed=0, gameDllLoaded=False, substitutedFunctions=0)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
