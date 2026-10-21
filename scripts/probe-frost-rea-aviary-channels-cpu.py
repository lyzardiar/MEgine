"""Author: MiYu. Execute original initialized Magic Leash timing and damage dispatch."""
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
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
blob = pe.get_memory_mapped_image()
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase, (len(blob) + 4095) & ~4095)
cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase, blob)
cpu.mem_map(0x1000000, 0x40000)
buff, unit, buff_vt, unit_vt, data, event, ability, table, rows = [0x1000000 + i * 0x1000 for i in range(1, 10)]
stack, stop, bind_stub, hp_stub, damage_stub, result_stub = [0x1030000 + i * 0x100 for i in range(6)]
timers, hits = [], []
hp = 1000.0

def word(p): return struct.unpack('<I', cpu.mem_read(p, 4))[0]
def integer(p, n): cpu.mem_write(p, struct.pack('<I', n & 0xffffffff))
def real(p, n): cpu.mem_write(p, struct.pack('<f', n))
def number(p): return struct.unpack('<f', cpu.mem_read(p, 4))[0]

def returned(bytes_, value=0):
    sp = cpu.reg_read(UC_X86_REG_ESP)
    cpu.reg_write(UC_X86_REG_EAX, value)
    cpu.reg_write(UC_X86_REG_EIP, word(sp))
    cpu.reg_write(UC_X86_REG_ESP, sp + 4 + bytes_)

def hook(uc, address, size, unused):
    global hp
    sp = uc.reg_read(UC_X86_REG_ESP)
    if address == bind_stub:
        returned(12)
    elif address == 0x6f0437e0:
        timers.append({'delay': number(word(sp + 4)), 'event': word(sp + 8), 'target': word(sp + 12)})
        returned(20)
    elif address == 0x6f0434f0:
        returned(0)
    elif address == 0x6f4f7d30:
        returned(0, 1)
    elif address == 0x6f46f440:
        returned(20)
    elif address == 0x6f02a380:
        returned(4)
    elif address == hp_stub:
        out = word(sp + 4)
        real(out, hp)
        returned(4, out)
    elif address == damage_stub:
        descriptor = word(sp + 8)
        amount = number(descriptor + 0x10)
        hits.append({'amount': amount, 'damageType': word(descriptor + 0x14)})
        hp -= amount
        real(word(sp + 4), amount)
        returned(16)
    elif address == result_stub:
        returned(4)

cpu.hook_add(unicorn.UC_HOOK_CODE, hook)

def run(address, this=0, args=()):
    for i, value in enumerate([stop, *args]): integer(stack + i * 4, value)
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.reg_write(UC_X86_REG_ECX, this)
    cpu.reg_write(UC_X86_REG_EDX, 0)
    cpu.emu_start(address, stop, count=20000)
    assert cpu.reg_read(UC_X86_REG_EIP) == stop, hex(cpu.reg_read(UC_X86_REG_EIP))

# CRT-initialized float constants must be executed, not read from zero-filled image data.
assert bytes(cpu.mem_read(0x6f7718b4, 10)) == b'\x68' + struct.pack('<I', 0x6f950a94) + b'\x68' + struct.pack('<I', 0x6f94eb54)
assert word(0x6f94ebc8) == 0x6f001a30 and word(0x6f94ebcc) == 0x6f001b30
assert any(entry.address == 0x6f94e338 and entry.name == b'_initterm' for dll in pe.DIRECTORY_ENTRY_IMPORT for entry in dll.imports)
assert number(0x6fbb81d8) == 0
run(word(0x6f94ebc8))
run(word(0x6f94ebcc))
assert number(0x6fbb81d4) == 0 and number(0x6fbb81d8) == 1
cpu.mem_write(buff_vt, bytes(cpu.mem_read(0x6fa3e3b4, 0x400)))
integer(buff_vt + 0x320, bind_stub)
integer(buff_vt + 0x370, result_stub)
integer(unit_vt + 0x120, damage_stub)
integer(unit_vt + 0x12c, hp_stub)
integer(unit, unit_vt)
integer(ability + 0x54, table)
integer(table + 0x2c, 1)
integer(table + 0x50, 1)
integer(table + 0x54, rows)
cases = []
for source_damage in [15.0, 30.0, 60.0]:
    cpu.mem_write(buff, bytes(0x400))
    integer(buff, buff_vt)
    integer(buff + 0x30, unit)
    integer(buff + 0xe8, 0x6f96fd80)
    real(rows + 0x20, source_damage)
    run(0x6f3f7410, ability, [data, 0])
    assert number(data) == source_damage
    real(data + 4, 40)
    timers.clear()
    hits.clear()
    run(0x6f5128d0, buff, [unit, 0, data + 4, data])
    assert number(buff + 0xec) == source_damage
    assert len(timers) == 1 and abs(timers[0]['delay'] - .01) < 1e-8 and timers[0]['event'] == 0xd01e2
    assert not hits
    for event_id in [0xd01e2, 0xd01c1, 0xd01c1]:
        integer(event + 8, event_id)
        run(0x6f513a00, buff, [event])
    assert [t['delay'] for t in timers[1:]] == [1, 1, 1]
    assert all(t['event'] == 0xd01c1 for t in timers[1:])
    assert hits == [{'amount': source_damage, 'damageType': 0x4000}] * 3
    assert word(buff + 0x20) & 0x8000000 == 0
    cases.append({'sourceDamage': source_damage, 'timers': list(timers), 'hits': list(hits)})
report = {'author': 'MiYu', 'passed': True, 'binarySha256': digest, 'initializedPeriod': number(0x6fbb81d8), 'cases': cases, 'scope': 'Original constant constructors, loaded-level getter, buff setter/initializer, event handler, damage getter and descriptor constructor execute. Source-level row, unit ownership/status, timer sink and final unit damage/armor entry are fixtures. No original match or scheduler time quantization is claimed.'}
out = ROOT / 'tmp/docs-artifacts/frost-human-aviary/rea/channels/timing-cpu.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('PASS original Magic Leash: initialized 1-second period, .01-second first event, 15/30/60 damage unchanged through native dispatch')
