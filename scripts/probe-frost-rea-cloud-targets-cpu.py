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
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP

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

event_calls = []
def external(uc, address, size, unused):
    sp = uc.reg_read(UC_X86_REG_ESP)
    if address in [stop + 0x10, 0x6f667470]: returned(0, 0x12345678)
    elif address == stop + 0x20: returned(0, word(target + 0x300))
    elif address == 0x6f470a60: returned(0, 0)
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

# The actual ranged predicate uses cached weapon codes and damage flags, never missile speed.
integer(attack + 0x20, 0x180000)
weapons = []
for slot in [0, 1]:
    for weapon_code in range(10):
        for damage_flag in [1, 2, 4, 8, 16, 32, 64, 128, 256]:
            integer(attack + 0xdc + slot * 4, weapon_code)
            integer(attack + 0x218 + slot * 4, damage_flag)
            integer(attack + 0x228, 0)
            assert run(0x6f47c060, attack, [slot]) == 1
            integer(attack + 0x228, 1)
            allowed = bool(run(0x6f47c060, attack, [slot]))
            ranged = 2 <= weapon_code <= 8 and damage_flag not in [1, 64, 128, 256]
            assert allowed == (not ranged), (slot, weapon_code, damage_flag)
            weapons.append(dict(slot=slot, weaponCode=weapon_code, damageFlag=damage_flag, cloudAllowsAttack=allowed))

report = dict(author='MiYu', passed=True, binarySha256=digest, sourceTokens=tokens, rawMask=hex(mask), normalizedMask=hex(normalized), targetCases=targets, weaponCases=weapons, limitations=['The preserved source targs tokens are supplied as a raw mask; the original ability-data loader is not executed.', 'Original effect filter, unit flag composition, defaults, target validator and ranged weapon gate execute. Unit category/owner/state fields and object references are fixtures; final ability immunity/event rejection is supplied as success.', 'Weapon codes and damage flags are supplied directly; their source-field loading and complete runtime battle remain unverified. No new original-runtime acceptance is claimed.'])
out = ROOT / 'tmp/docs-artifacts/frost-human-aviary/cloud-targets/cpu.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f'PASS original Cloud: {len(targets)} target cases and {len(weapons)} ranged weapon gates')
