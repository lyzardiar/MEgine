"""Author: MiYu. CPU-check Warcraft Feedback damage packing and its shared physical armor path."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'


def probe(binary, dependencies):
    raw = binary.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == EXPECTED, 'Unsupported Game.dll'
    if dependencies: sys.path.insert(0, str(dependencies))
    import pefile
    import unicorn
    from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EBX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EDI, UC_X86_REG_ESI, UC_X86_REG_EBP, UC_X86_REG_ESP, UC_X86_REG_EIP
    pe = pefile.PE(data=raw); base = pe.OPTIONAL_HEADER.ImageBase; image = pe.get_memory_mapped_image()
    assert base == 0x6f000000 and pe.FILE_HEADER.Machine == 0x14c
    cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
    cpu.mem_map(base, (len(image) + 4095) & ~4095); cpu.mem_write(base, image)
    cpu.mem_map(0, 4096); cpu.mem_map(0x1000000, 0x10000)
    missile, target, packet, frame, stack, stop = [0x1000000 + i * 0x1000 for i in range(1, 7)]
    def integer(p, n): cpu.mem_write(p, struct.pack('<I', n & 0xffffffff))
    def real(p, n): cpu.mem_write(p, struct.pack('<f', n))
    def word(p): return struct.unpack('<I', cpu.mem_read(p, 4))[0]
    def value(p): return struct.unpack('<f', cpu.mem_read(p, 4))[0]
    def run(address, end=stop): cpu.emu_start(address, end, count=100000)
    def returned(n=0, eax=None):
        sp = cpu.reg_read(UC_X86_REG_ESP)
        if eax is not None: cpu.reg_write(UC_X86_REG_EAX, eax)
        cpu.reg_write(UC_X86_REG_EIP, word(sp)); cpu.reg_write(UC_X86_REG_ESP, sp + 4 + n)

    # Only external object queries and the MiscGame scalar are supplied; native arithmetic is executed.
    callbacks = {0x6f02a4b0, 0x6f6b35b0, 0x6f3e79c0, stop + 0x100}
    def external(uc, address, size, data):
        if address == 0x6f02a4b0:
            assert bytes(cpu.mem_read(word(cpu.reg_read(UC_X86_REG_ESP) + 4), 13)) == b'DefenseArmor\0'
            output = cpu.reg_read(UC_X86_REG_ECX); real(output, .06); returned(8, output)
        elif address in callbacks: returned(0, 0)
    cpu.hook_add(unicorn.UC_HOOK_CODE, external)
    real(0x6fbb81d8, 1); integer(0x6fb69e6c, 0)
    integer(missile, 0x6fa15510); integer(missile + 0x2c, -1); integer(missile + 0x30, -1)
    integer(target, stop + 0x200); integer(stop + 0x200 + 0x11c, stop + 0x100)
    source = json.loads((ROOT / 'samples/frostbound-realms/human-sanctum.json').read_bytes())
    armor_names = ['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored']
    for i, name in enumerate(armor_names): real(0x6fbec368 + (1 * 8 + i) * 4, source['damageTable']['normal'][name])
    results = []
    for armor in [0, 5, 10]:
        for kind in ['light', 'medium', 'heavy', 'hero']:
            burn = 4 if kind == 'hero' else 20
            # CMissileFeedback has already replaced +4c with actual mana burned times its source ratio.
            real(missile + 0x44, 13); real(missile + 0x4c, burn)
            integer(missile + 0x38, 0x10); integer(missile + 0x3c, 0x10); integer(missile + 0x5c, 1)
            real(stop + 0x400, 1)
            integer(stack, stop); integer(stack + 4, packet); integer(stack + 8, target); integer(stack + 12, stop + 0x400)
            cpu.reg_write(UC_X86_REG_ESP, stack); cpu.reg_write(UC_X86_REG_ECX, missile)
            run(0x6f6b6e70)
            assert value(packet + 0x10) == 13 + burn and value(packet + 0x18) == burn
            assert word(packet + 0x14) == 0x10 and word(packet + 0x1c) == 0x10 and word(packet + 0x20) == 1
            # Execute the intact armor and attack-type-table branch, stopping before later ethereal/ability handling.
            integer(frame - 0x18, 0x10); integer(frame - 0x1c, armor_names.index(kind)); integer(frame - 0x10, 1)
            real(target + 0xe0, armor)
            for reg, n in [(UC_X86_REG_EBP, frame), (UC_X86_REG_ESP, stack), (UC_X86_REG_EBX, packet), (UC_X86_REG_EDI, target), (UC_X86_REG_ESI, 0x6fbb81d8)]: cpu.reg_write(reg, n)
            run(0x6f67dfad, 0x6f67e04b)
            expected = burn / (1 + .06 * armor) * source['damageTable']['normal'][kind]
            assert math.isclose(value(packet + 0x18), expected, rel_tol=2e-6), (armor, kind, value(packet + 0x18), expected)
            assert math.isclose(value(packet + 0x10), (13 + burn) / (1 + .06 * armor) * source['damageTable']['normal'][kind], rel_tol=2e-6)
            results.append(dict(armor=armor, armorType=kind, manaBurn=burn, feedbackDamage=value(packet + 0x18), combinedDamage=value(packet + 0x10)))
    functions = {'packet': (0x6f6b6e70, 0x13a), 'bonus': (0x6f68c870, 0x61), 'armorBranch': (0x6f67dfad, 0x9e), 'armor': (0x6f64fbf0, 0x83), 'scale': (0x6f6971c0, 0x36)}
    return dict(author='MiYu', passed=True, binarySha256=EXPECTED, cases=results, functions={k:dict(address=hex(a),bytes=n,sha256=hashlib.sha256(image[a-base:a-base+n]).hexdigest()) for k,(a,n) in functions.items()}, limitations=['Original packet construction and armor/type scaling execute in an isolated CPU emulator with supplied object queries, DefenseArmor and source damage table.', 'Full original attack acceptance, miss/evasion ordering, mana removal, other defensive abilities and runtime animation are not measured.', 'The negative-armor lookup and bit-exact full-engine floating-point parity are outside these cases.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True); parser.add_argument('--dependencies', type=Path)
    parser.add_argument('--report', type=Path, default=ROOT / 'tmp/docs-artifacts/frost-feedback/binary.json')
    args = parser.parse_args(); report = probe(args.binary, args.dependencies)
    args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS original Feedback damage packet and physical armor/type scaling: 12 CPU cases')
