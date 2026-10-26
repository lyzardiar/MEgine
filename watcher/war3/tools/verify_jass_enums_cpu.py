"""Author: MiYu. Compare session enum natives and GetHandleId with pinned 1.27 instructions."""
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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EIP, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/session-enums-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/session-enums-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
base = image.OPTIONAL_HEADER.ImageBase
metadata = (ROOT / 'watcher/war3/src/jass_enums.inc').read_text(encoding='utf-8').encode('utf-8')
entries = {name: (kind, int(address, 16)) for name, kind, address in re.findall(r'\{"(\w+)","(\w+)",(0x[0-9a-f]+)u\}', metadata.decode('utf-8'))}
assert len(entries) == 44
entries['GetHandleId'] = ('integer', 0x6f1e27a0)

def original_text(address):
    at = address - base
    assert 0 <= at < len(blob)
    end = blob.index(b'\0', at)
    return blob[at:end].decode('ascii')

registrations = set()
for match in re.finditer(rb'\x68(.{4})\xba(.{4})\xb9(.{4})\xe8(.{4})', blob, re.S):
    signature, name, entry = struct.unpack('<III', b''.join(match.groups()[:3]))
    target = base + match.start() + 20 + struct.unpack('<i', match[4])[0]
    if target != 0x6f7e3710:
        continue
    try:
        name = original_text(name)
        if name in entries:
            registrations.add((name, original_text(signature), entry))
    except (ValueError, UnicodeDecodeError):
        pass
for name, (kind, entry) in entries.items():
    signature = '(Hhandle;)I' if name == 'GetHandleId' else '(I)H' + kind + ';'
    assert (name, signature, entry) in registrations, ('Original registration differs', name)

cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(base, (len(blob) + 4095) & ~4095)
cpu.mem_write(base, blob)
cpu.mem_map(0x1000000, 0x20000)
STACK, STOP = 0x1008000, 0x1010000
fixture_bytes = args.fixture.read_bytes()
fixture = json.loads(fixture_bytes)
assert len(fixture['natives']) == len(entries) and {record['name'] for record in fixture['natives']} == entries.keys()
cases = 0
for record in fixture['natives']:
    name, entry = record['name'], record['entry']
    assert entry == entries[name][1]
    for bits, expected in zip(fixture['values'], record['results'], strict=True):
        cpu.mem_write(STACK, struct.pack('<II', STOP, bits))
        cpu.reg_write(UC_X86_REG_ESP, STACK)
        cpu.emu_start(entry, STOP, count=2000)
        assert cpu.reg_read(UC_X86_REG_EIP) == STOP and cpu.reg_read(UC_X86_REG_ESP) == STACK + 4
        assert cpu.reg_read(UC_X86_REG_EAX) == expected, (name, hex(bits), hex(cpu.reg_read(UC_X86_REG_EAX)), hex(expected))
        cases += 1
result = dict(binarySha256=digest, nativeFixtureSha256=hashlib.sha256(fixture_bytes).hexdigest(),
              metadataSha256=hashlib.sha256(metadata).hexdigest(), nativeCount=len(entries), enumNatives=44,
              valuesPerNative=len(fixture['values']), cases=cases, passed=True, originalRegistrationFunction='0x6f7e3710',
              stubbedBoundaries=[], limitations=['Only integer-to-enum natives and GetHandleId execute.',
                                               'Native object allocation, player state, config effects and complete VM parity are outside this comparison.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
