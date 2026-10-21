"""Author: MiYu. Execute original Cloud target masks and ranged-attack restriction gates."""
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_EBX, UC_X86_REG_EDI, UC_X86_REG_ESI

binary = Path(sys.argv[1] if len(sys.argv) > 1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw = binary.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe = pefile.PE(data=raw)
blob = pe.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase, (len(blob) + 4095) & ~4095)
cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase, blob)
cpu.mem_map(0, 0x1000)  # MSVC exception-registration slot inside the emulator.
cpu.mem_map(0x1000000, 0x10000)
effect, target, ability, attack, unit_vt, stack, stop = [0x1000000 + i * 0x1000 for i in range(1, 8)]

def word(p): return struct.unpack('<I', cpu.mem_read(p, 4))[0]
def integer(p, n): cpu.mem_write(p, struct.pack('<I', n & 0xffffffff))
def returned(count, value=0):
    sp = cpu.reg_read(UC_X86_REG_ESP)
    cpu.reg_write(UC_X86_REG_EAX, value)
    cpu.reg_write(UC_X86_REG_EIP, word(sp))
    cpu.reg_write(UC_X86_REG_ESP, sp + 4 + count)

source_text, cache, bucket, record = 0x1008000, 0x1009000, 0x100a000, 0x100b000
source_slot = 0
def string(p): return bytes(cpu.mem_read(p, 80)).split(b'\0')[0].lower()

event_calls = []
def external(uc, address, size, unused):
    sp = uc.reg_read(UC_X86_REG_ESP)
    if address in [stop + 0x10, 0x6f667470]: returned(0, 0x12345678)
    elif address == stop + 0x20: returned(0, word(target + 0x300))
    elif address == 0x6f470a60: returned(0, 0)
    elif address == 0x6f68f870:
        assert word(sp + 8) == effect + 0x674 + source_slot * 12
        returned(8, source_text)
    elif address == 0x6f12070c: returned(12, int(string(word(sp + 4)) != string(word(sp + 8))))
    elif address == 0x6f17a710: returned(0, 0x12345678)
    elif address == 0x6f044150: returned(0, ability)
    elif address == 0x6f1d2e80:
        output = uc.reg_read(UC_X86_REG_ECX)
        integer(output, ability)
        integer(ability + 4, word(ability + 4) + 1)
        returned(4, output)
    elif address == 0x6f654740:
        event_calls.append({'event': word(sp + 4), 'ability': word(sp + 8)})
        returned(8, 0)
    elif address in [0x6f1c4fe0, 0x6f1ccfd0]:
        raise AssertionError('An unrestricted relationship mask must bypass alliance lookup')

cpu.hook_add(unicorn.UC_HOOK_CODE, external)
def run(address, this, args=(), edx=0):
    for i, n in enumerate([stop, *args]): integer(stack + i * 4, n)
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, this)
    cpu.reg_write(UC_X86_REG_EDX, edx)
    cpu.emu_start(address, stop, count=20000)
    assert cpu.reg_read(UC_X86_REG_EIP) == stop
    return cpu.reg_read(UC_X86_REG_EAX)

masks = {}
for p in range(0x6fb6a0b0, 0x6fb6a240, 8):
    ptr = word(p)
    name = bytes(cpu.mem_read(ptr, 64)).split(b'\0')[0].decode('ascii')
    masks[name] = word(p + 4)
rules = json.loads((ROOT / 'samples/frostbound-realms/human-aviary.json').read_text(encoding='utf-8'))
tokens = rules['abilities']['Aclf']['sourceRow']['targs1'].split(',')
assert set(tokens) == {'vuln', 'invu', 'structure'}
mask = 0
for name in tokens: mask |= masks[name]
normalized = run(0x6f68c7b0, mask)
assert normalized & 0x1f000 == 0x1f000
assert normalized & 0x7fe == masks['structure']
assert normalized & 0x300000 == masks['vuln'] | masks['invu']
integer(effect, 0x6f9cc54c)
assert word(0x6f9cc54c + 0xcc) == 0x6f4bf1f0 and word(0x6f9cc54c + 0xd0) == 0x6f4a17d0
integer(effect + 0x100, mask)
integer(effect + 0x104, 0)
integer(effect + 0x114, 0xd0142)
integer(effect + 0x118, 1)
integer(effect + 0x11c, 1)
integer(ability + 4, 2)
integer(target, unit_vt)
integer(unit_vt + 0x1c, stop + 0x10)
integer(unit_vt + 0xec, stop + 0x20)
targets = []
for kind in ['ground', 'air', 'structure', 'ward']:
    for owner in [0, 1, 2]:
        for dead in [False, True]:
            for invulnerable in [False, True]:
                integer(target + 0x24c, masks[kind])
                integer(target + 0x300, owner)
                integer(target + 0x5c, 0x100 if dead else 0)
                integer(target + 0x20, 8 if invulnerable else 0)
                event_calls.clear()
                accepted = bool(run(0x6f4a17d0, effect, [target]))
                assert accepted == (kind == 'structure' and not dead), (kind, owner, dead, invulnerable)
                assert len(event_calls) == int(accepted)
                assert word(ability + 4) == 2
                targets.append(dict(kind=kind, owner=owner, dead=dead, invulnerable=invulnerable, accepted=accepted))

# The actual ranged predicate uses cached weapon codes and target masks, never missile speed.
integer(attack + 0x20, 0x180000)
weapons = []
for slot in [0, 1]:
    for weapon_code in range(10):
        for target_mask in [1, 2, 4, 8, 16, 32, 64, 128, 256]:
            integer(attack + 0xdc + slot * 4, weapon_code)
            integer(attack + 0x218 + slot * 4, target_mask)
            integer(attack + 0x228, 0)
            assert run(0x6f47c060, attack, [slot]) == 1
            integer(attack + 0x228, 1)
            allowed = bool(run(0x6f47c060, attack, [slot]))
            ranged = 2 <= weapon_code <= 8 and target_mask not in [1, 64, 128, 256]
            assert allowed == (not ranged), (slot, weapon_code, target_mask)
            weapons.append(dict(slot=slot, weaponCode=weapon_code, targetMask=target_mask, cloudAllowsAttack=allowed))

# Parse weapTp through the original field getter/converter, then execute cached getters and assignment slices.
integer(0x6fbec494, 0)
integer(0x6fbec48c, bucket)
integer(bucket + 8, cache)
integer(cache, 0x12345678)
integer(cache + 0x14, 0x68677477)
source_weapons = []
for source_slot in [0, 1]:
    for name, expected in {'normal': 1, 'missile': 2, 'artillery': 3, 'instant': 4, 'msplash': 5, 'mbounce': 6, 'mline': 7, 'aline': 8}.items():
        cpu.mem_write(source_text, name.encode() + b'\0')
        code = run(0x6f689580, effect, [source_slot, 0])
        assert code == expected
        integer(cache + 0xf8 + source_slot * 4, code)
        integer(cache + 0xa0 + source_slot * 4, masks['ground'] | masks['air'])
        loaded_code = run(0x6f64ce60, 0x68677477, edx=source_slot)
        loaded_targets = run(0x6f64cdf0, 0x68677477, edx=source_slot)
        assert loaded_code == code and loaded_targets == masks['ground'] | masks['air']
        integer(record, loaded_targets)
        integer(record + 0x38, 1)
        integer(record + 0x44, loaded_code)
        cpu.reg_write(UC_X86_REG_EBX, record)
        cpu.reg_write(UC_X86_REG_EDI, attack)
        cpu.reg_write(UC_X86_REG_ESI, source_slot)
        cpu.emu_start(0x6f47f459, 0x6f47f475, count=50)
        assert cpu.reg_read(UC_X86_REG_EIP) == 0x6f47f475
        cpu.reg_write(UC_X86_REG_ECX, source_slot)
        cpu.emu_start(0x6f47f6ba, 0x6f47f6c4, count=50)
        assert cpu.reg_read(UC_X86_REG_EIP) == 0x6f47f6c4
        assert word(attack + 0x218 + source_slot * 4) == loaded_targets
        assert word(attack + 0xdc + source_slot * 4) == code
        integer(attack + 0x228, 1)
        allowed = bool(run(0x6f47c060, attack, [source_slot]))
        assert allowed == (name == 'normal')
        source_weapons.append(dict(slot=source_slot, sourceWeapTp=name, code=code, targetMask=loaded_targets, cloudAllowsAttack=allowed))

report = dict(author='MiYu', passed=True, binarySha256=digest, sourceTokens=tokens, rawMask=hex(mask), normalizedMask=hex(normalized), targetCases=targets, weaponCases=weapons, sourceWeaponCases=source_weapons, limitations=['The preserved source targs tokens are supplied as a raw mask; the original ability-data loader is not executed.', 'Original effect filter, unit flag composition, defaults, target validator and ranged weapon gate execute. Unit category/owner/state fields and object references are fixtures; final ability immunity/event rejection is supplied as success.', 'Source weapon cases execute the original weapTp field getter/converter, cached getters, assignment slices and restriction gate. Source string retrieval/comparison, parsed cache records, hash and assembly are supplied; full unit construction and original battle are not executed. Target-mask field identity is also traced statically through the targs getter and parser.'])
out = ROOT / 'tmp/docs-artifacts/frost-human-aviary/cloud-targets/cpu.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f'PASS original Cloud: {len(targets)} target cases and {len(weapons)} ranged weapon gates, {len(source_weapons)} source weapon paths')
