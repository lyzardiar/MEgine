"""Author: MiYu. Compare string decoding and rawcodes with original 1.27 instructions.

The string constructor's isolated decode loop and the complete rawcode callback
run as PE instruction data. No original game code or external call is replaced.
This does not execute string allocation/interning, the full lexer, or the VM.
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
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/runtime-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/runtime-literals-cpu.json')
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
CONTEXT, TOKEN, OUTPUT, STACK, STOP = 0x1001000, 0x1002000, 0x1004000, 0x1008000, 0x1010000
fixture_bytes = args.fixture.read_bytes()
fixture = json.loads(fixture_bytes)
for input_hex, output_hex in fixture['strings']:
    text, expected = bytes.fromhex(input_hex), bytes.fromhex(output_hex)
    assert len(text) < 1024 and b'\0' not in text
    cpu.mem_write(TOKEN, text + b'\0')
    cpu.mem_write(OUTPUT, bytes(2048))
    cpu.reg_write(UC_X86_REG_EDX, TOKEN)
    cpu.reg_write(UC_X86_REG_EAX, OUTPUT)
    cpu.emu_start(0x6f7f4bb1, 0x6f7f4c0f, count=50000)
    assert cpu.reg_read(UC_X86_REG_EIP) == 0x6f7f4c0f, 'Decode loop did not complete'
    size = cpu.reg_read(UC_X86_REG_EAX) - OUTPUT
    actual = bytes(cpu.mem_read(OUTPUT, size))
    assert actual == expected, (text.hex(), actual.hex(), expected.hex())
    assert cpu.mem_read(OUTPUT + size, 1) == b'\0'
for input_hex, expected in fixture['rawcodes']:
    text = b"'" + bytes.fromhex(input_hex) + b"'"
    cpu.mem_write(CONTEXT, bytes(256))
    cpu.mem_write(TOKEN, text + b'\0')
    cpu.mem_write(CONTEXT + 0x98, struct.pack('<I', TOKEN))
    cpu.mem_write(CONTEXT + 0xc4, struct.pack('<I', len(text)))
    cpu.mem_write(STACK, struct.pack('<I', STOP))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, CONTEXT)
    cpu.emu_start(0x6f7fb5c0, STOP, count=50000)
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP
    actual = struct.unpack('<I', cpu.mem_read(CONTEXT + 0x24, 4))[0]
    assert actual == expected, (text.hex(), hex(actual), hex(expected))
    assert cpu.reg_read(UC_X86_REG_EAX) == 0x108 and cpu.reg_read(UC_X86_REG_ESP) == STACK + 4
result = dict(binarySha256=digest, nativeFixtureSha256=hashlib.sha256(fixture_bytes).hexdigest(),
              stringCases=len(fixture['strings']), rawcodeCases=len(fixture['rawcodes']), passed=True,
              stringInstructions=['0x6f7f4bb1', '0x6f7f4c0c'], rawcodeEntry='0x6f7fb5c0', stubbedBoundaries=[],
              limitations=['String comparison covers the decode loop, not allocation, interning, concatenation or VM equality.',
                           'Rawcodes use an already classified callback; malformed source and full lexer acceptance are not compared.',
                           'Unknown string escapes are rejected by the client; the original loop is not executed on those inputs.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
