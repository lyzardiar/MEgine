"""Author: MiYu. Verify Control Magic operands and charge in an owned Warcraft 1.27 DLL using x86 emulation."""
import argparse
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path
import struct
import sys

EXPECTED_SHA = 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
ROOT = Path(__file__).resolve().parents[1]


def verify_identity(raw):
    assert hashlib.sha256(raw).hexdigest() == EXPECTED_SHA, 'Unsupported Warcraft binary; addresses are version-specific'


def probe(binary, dependencies):
    raw = binary.read_bytes()
    verify_identity(raw)
    if dependencies: sys.path.insert(0, str(dependencies))
    import capstone
    import pefile
    import unicorn
    from unicorn.x86_const import UC_X86_REG_ECX, UC_X86_REG_ESP
    pe = pefile.PE(data=raw)
    base = pe.OPTIONAL_HEADER.ImageBase
    assert base == 0x6f000000 and pe.FILE_HEADER.Machine == 0x14c
    image = pe.get_memory_mapped_image()
    disassembler = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

    def word(address): return struct.unpack_from('<I', image, address - base)[0]
    def string(address):
        start = address - base
        return image[start:image.index(b'\0', start)].decode('ascii')
    def instructions(address, count): return list(disassembler.disasm(image[address - base:address - base + count], address))
    def has(address, size, mnemonic, operand): return any(i.mnemonic == mnemonic and i.op_str == operand for i in instructions(address, size))
    def method(slot): return word(0x6f9cb5e0 + slot * 4)

    # MiYu: authenticate the RTTI name, complete object locator and actual virtual dispatch chain.
    locator = word(0x6f9cb5dc)
    descriptor = word(locator + 12)
    name = b'.?AVCAbilityControlMagic@@'
    assert image[descriptor - base + 8:descriptor - base + 8 + len(name)] == name
    assert method(219) == 0x6f49f0c0 and method(252) == 0x6f4a1de0 and method(265) == 0x6f4ac8e0
    assert has(0x6f49f5a0, 0xb2, 'call', 'dword ptr [eax + 0x36c]')
    assert has(0x6f49f5a0, 0xb2, 'call', '0x6f3f74d0')
    assert has(0x6f49f5a0, 0xb2, 'call', 'dword ptr [eax + 0x12c]')
    assert has(0x6f49f5a0, 0xb2, 'call', 'dword ptr [eax + 0x130]')
    assert has(0x6f3f7470, 0x57, 'mov', 'ecx, dword ptr [eax + ecx + 0x24]')
    assert has(0x6f3f74d0, 0x57, 'mov', 'ecx, dword ptr [eax + ecx + 0x28]')
    for address, pointer, offset in [(0x6f68a0d0, '0x6fb6a090', '0x20'), (0x6f68a0ff, '0x6fb6a094', '0x24'), (0x6f68a12e, '0x6fb6a01c', '0x28')]:
        assert has(address, 0x2f, 'push', f'dword ptr [{pointer}]') and has(address, 0x2f, 'mov', f'dword ptr [esi + {offset}], eax')
    assert [string(word(p)) for p in [0x6fb6a090, 0x6fb6a094, 0x6fb6a01c]] == ['DataA', 'DataB', 'DataC']
    # GetWidgetLife calls the same current-life virtual getter selected by DataC != 0.
    assert word(0x6fa4a704 + 0x12c) == 0x6f667a40 and word(0x6fa4a704 + 0x130) == 0x6f667b40
    assert has(0x6f1e6730, 0x80, 'call', 'dword ptr [eax + 0x12c]') or has(0x6f1e6730, 0x80, 'call', 'dword ptr [edx + 0x12c]')
    assert has(0x6f0527e0, 0xc9, 'mul', 'ebx') and has(0x6f0529d0, 0x110, 'lea', 'eax, [edx + esi]')
    assert image[0xbb81d4:0xbb81d8] == b'\0' * 4
    assert has(0x6f4ac8e0, 0x153, 'call', '0x6f511fa0') and has(0x6f511fa0, 6, 'mov', 'eax, 0x42544c46')
    assert word(0x6f9afda8 + 0x1d8) == 0x6f4becf0 and has(0x6f4becf0, 3, 'xor', 'eax, eax')
    assert has(0x6f4ac938, 0x38, 'test', 'byte ptr [esi + 0x20], 0x80')
    assert has(0x6f4ac938, 0x38, 'call', '0x6f511dd0') and has(0x6f4ac938, 0x38, 'call', 'dword ptr [eax + 0x34c]')
    assert has(0x6f4ac938, 0x38, 'mov', 'dword ptr [ebp - 4], 0')

    emulator = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
    emulator.mem_map(base, (len(image) + 4095) & ~4095)
    emulator.mem_write(base, image)
    emulator.mem_map(0x1000000, 0x10000)
    ability, target, cache, row, table, output = [0x1000000 + i * 0x1000 for i in range(1, 7)]
    current_getter, maximum_getter, stop, stack = 0x1007100, 0x1007200, 0x1008000, 0x100f000

    def integer(address, value): emulator.mem_write(address, struct.pack('<I', value))
    def real(address, value): emulator.mem_write(address, struct.pack('<f', value))
    def getter(address, value_address):
        # Only target health inputs are substituted. Fixed executable bytes read mutable data,
        # so Unicorn's translated-code cache cannot retain an earlier case's immediate value.
        emulator.mem_write(address, b'\x8b\x44\x24\x04\x8b\x15' + struct.pack('<I', value_address) + b'\x89\x10\xc2\x04\x00')

    integer(ability, 0x6f9cb5e0); integer(ability + 0x50, 0); integer(ability + 0x54, cache)
    integer(cache + 0x2c, 1); integer(cache + 0x50, 1); integer(cache + 0x54, row)
    integer(target, table); integer(table + 0x12c, current_getter); integer(table + 0x130, maximum_getter)
    getter(current_getter, output + 0x200); getter(maximum_getter, output + 0x204)
    source = json.loads((ROOT / 'samples/frostbound-realms/human-sanctum.json').read_bytes())['abilities']['Acmg']['sourceRow']
    fixed, ratio, flag = int(source['Cost1']), float(source['DataB1']), float(source['DataC1'])
    cases = [(hp, 525, fixed, ratio, flag) for hp in [1, 5, 100, 500, 525]]
    cases += [(100, 525, fixed, ratio, 0), (100, 525, 40, .35, 1), (100, 525, 0, .75, 1)]
    cases += [(100, 525, fixed, ratio, 2), (750, 900, fixed, ratio, 1)]
    results = []
    for hp, maximum, cost, factor, use_current in cases:
        integer(row + 0x10, cost); real(row + 0x24, factor); real(row + 0x28, use_current)
        real(output + 0x200, hp); real(output + 0x204, maximum); real(output, -1)
        integer(stack, stop); integer(stack + 4, output); integer(stack + 8, target)
        emulator.reg_write(UC_X86_REG_ESP, stack); emulator.reg_write(UC_X86_REG_ECX, ability)
        emulator.emu_start(0x6f49f5a0, stop, count=10000)
        actual = struct.unpack('<f', emulator.mem_read(output, 4))[0]
        expected = cost + factor * (hp if use_current else maximum)
        assert math.isclose(actual, expected, rel_tol=1e-6, abs_tol=1e-5), (hp, maximum, use_current, actual, expected)
        assert emulator.reg_read(UC_X86_REG_ESP) == stack + 12
        results.append(dict(currentHp=hp, maxHp=maximum, fixedCost=cost, healthRatio=factor, dataC=use_current, charge=actual, mathematicalCharge=expected))
    rejected = False
    try:
        modified = bytearray(raw); modified[0x400] ^= 1
        verify_identity(modified)
    except AssertionError: rejected = True
    assert rejected
    functions = {'charge': (0x6f49f5a0, 0xb2), 'fixedCost': (0x6f49f0c0, 0x1c), 'dataB': (0x6f3f7470, 0x57), 'dataC': (0x6f3f74d0, 0x57), 'multiply': (0x6f0527e0, 0xc9), 'add': (0x6f0529d0, 0x110)}
    return dict(author='MiYu', passed=True, binarySha256=EXPECTED_SHA, binaryVersion='1.27.0.52240', imageBase=hex(base), abilityVtable='0x6f9cb5e0',
        sourceRowSha256=hashlib.sha256(json.dumps(source, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
        formula='Cost1 + DataB1 * (DataC1 != 0 ? currentHp : maxHp)', cases=results, mismatchedBinaryRejected=rejected,
        staticEvidence=dict(fieldNamesAndOffsetsMatched=True, currentAndMaximumGetterSlotsMatched=True, activeTimedLifeRemainingDurationBranchMatched=True),
        functionIdentities={key: dict(address=hex(address), bytes=size, sha256=hashlib.sha256(image[address-base:address-base+size]).hexdigest()) for key, (address, size) in functions.items()},
        dependencies={key: version(key) for key in ['pefile', 'capstone', 'unicorn']}, capstoneRuntimeVersion=capstone.__version__,
        limitations=['Only the original charge helper is CPU-emulated; target-health getters supply test operands.', 'No original game process is launched; full cast acceptance, mana deduction, ownership and expiry are not runtime-verified.', 'Soft-float rounding differs slightly from the mathematical real-valued formula.'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--dependencies', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = probe(args.binary, args.dependencies)
    if args.report: args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS original Control Magic charge: ten CPU cases, current/max selector, changed source operands and binary identity')


if __name__ == '__main__': main()
