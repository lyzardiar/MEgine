"""Author: MiYu. Verify Siege Engine weapon animation and ranged dice from original bytes."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
DLL_SHA = 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
MDX_SHA = '777a345298f07b1e5b853fc2dcd3397b38a46f039201e672fd09a4e31b2ac02f'


def source_probe():
    source = ROOT / 'samples/frostbound-realms/SourceAssets/SiegeEngine'
    raw = (source / 'Units/Human/WarWagon/WarWagon_V1.mdx').read_bytes()
    assert raw[:4] == b'MDLX' and hashlib.sha256(raw).hexdigest() == MDX_SHA
    integer = lambda p: struct.unpack_from('<I', raw, p)[0]
    name = lambda p: raw[p:p+80].split(b'\0')[0].decode('ascii')
    sequences, events, particles = [], [], []
    p = 4
    while p < len(raw):
        tag, end = raw[p:p+4], p+8+integer(p+4)
        q = p+8
        if tag == b'SEQS':
            while q < end:
                sequences.append(dict(index=len(sequences), name=name(q), start=integer(q+80), end=integer(q+84))); q += 132
        elif tag == b'EVTS':
            while q < end:
                e = q+integer(q)
                assert raw[e:e+4] == b'KEVT'
                count = integer(e+4)
                events.append(dict(name=name(q+4), offset=q, times=list(struct.unpack_from('<'+'I'*count, raw, e+12))))
                q = e+12+count*4
        elif tag == b'PRE2':
            while q < end:
                stop = q+integer(q); node_end = q+4+integer(q+4)
                tracks = {}
                for track in [b'KP2V', b'KP2E']:
                    at = raw.find(track, node_end, stop)
                    if at < 0: continue
                    count, interpolation, global_id = struct.unpack_from('<IIi', raw, at+4)
                    assert interpolation in [0, 1] and global_id == -1
                    tracks[track.decode()] = dict(offset=at, keys=[dict(time=integer(at+16+i*8), value=struct.unpack_from('<f', raw, at+20+i*8)[0]) for i in range(count)])
                particles.append(dict(name=name(q+8), offset=q, tracks=tracks)); q = stop
        p = end
    assert len(sequences) == 15 and len(particles) == 14
    attacks = [sequences[i] for i in [4, 11, 12]]
    assert [s['name'] for s in attacks] == ['Attack', 'Attack Two Alternate', 'Attack One Alternate']
    assert next(e for e in events if e['name'] == 'SNDxKSTT')['times'] == [13833, 48800]
    fire = next(p for p in particles if p['name'] == 'BlizParticleMortarFire')
    assert [(k['time'], round(k['value'], 1)) for k in fire['tracks']['KP2E']['keys'] if k['value'] > 0] == [(14033, 71.2), (49000, 71.2)]
    rocket = next(p for p in particles if p['name'] == 'BlizParticle01')
    assert [k['time'] for k in rocket['tracks']['KP2V']['keys'] if k['value'] > 0] == [46667]
    rows = importlib.import_module('import-frost-wisp-rules').rows((source / 'Units/UpgradeData.slk').read_bytes())
    assert [rows['Rhra'][k] for k in ['effect1', 'base1', 'mod1']] == ['ratd', '1', '1']
    return dict(mdxSha256=MDX_SHA, attacks=attacks, events=events, particles=particles, rangedUpgrade=rows['Rhra'])


def binary_probe(binary, dependencies):
    sys.path.insert(0, str(dependencies))
    import pefile
    import unicorn
    from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EIP, UC_X86_REG_ESP
    raw = binary.read_bytes(); assert hashlib.sha256(raw).hexdigest() == DLL_SHA
    pe = pefile.PE(data=raw); base = pe.OPTIONAL_HEADER.ImageBase; image = pe.get_memory_mapped_image()
    cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
    cpu.mem_map(base, (len(image)+4095)&~4095); cpu.mem_write(base, image)
    cpu.mem_map(0x1000000, 0x20000)
    attack, unit, upgrade, stack, stop = [0x1000000+i*0x1000 for i in range(1, 6)]
    def integer(p, n): cpu.mem_write(p, struct.pack('<I', n&0xffffffff))
    def real(p, n): cpu.mem_write(p, struct.pack('<f', n))
    def word(p): return struct.unpack('<I', cpu.mem_read(p, 4))[0]
    def run(address, ecx, args):
        for i, value in enumerate([stop]+args): integer(stack+i*4, value)
        cpu.reg_write(UC_X86_REG_ESP, stack); cpu.reg_write(UC_X86_REG_ECX, ecx)
        cpu.emu_start(address, stop, count=30000)
        assert cpu.reg_read(UC_X86_REG_EIP) == stop
        return cpu.reg_read(UC_X86_REG_EAX)
    refreshes = []
    def hook(uc, address, size, data):
        if address == 0x6f676600:
            refreshes.append(cpu.reg_read(UC_X86_REG_ECX)); sp = cpu.reg_read(UC_X86_REG_ESP)
            cpu.reg_write(UC_X86_REG_EIP, word(sp)); cpu.reg_write(UC_X86_REG_ESP, sp+4)
    cpu.hook_add(unicorn.UC_HOOK_CODE, hook)
    animation_cases = []
    for slot in [0, 1]:
        token = run(0x6f47fd80, attack, [slot]); assert token == 44+slot
        animation_cases.append(dict(weaponSlot=slot+1, propertyToken=token, sourceSequence=12 if slot == 0 else 11))
    integer(attack+0x30, unit); integer(unit+0x1e8, attack)
    integer(attack+0xdc, 4); integer(attack+0xe0, 2)
    integer(attack+0x218, 0x800); integer(attack+0x21c, 2)
    real(upgrade+0x28, 1); real(upgrade+0x30, 1); real(0x6fbb81d4, 0)
    assert run(0x6f47aa00, attack, [1, 1, 0, 0]) == 3
    dice_cases = []
    for old, new in [(0, 1), (1, 2), (2, 3), (0, 3), (3, 0)]:
        integer(attack+0x88, 1+old); integer(attack+0x8c, 1+old)
        run(0x6f698800, upgrade, [unit, old, new])
        dice = [word(attack+0x88), word(attack+0x8c)]; assert dice == [1+new]*2
        dice_cases.append(dict(oldRank=old, newRank=new, dice=dice))
    assert len(refreshes) == 5 and all(u == unit for u in refreshes)
    return dict(binarySha256=DLL_SHA, animationCases=animation_cases, diceCases=dice_cases, limitations=['Runs original weapon-index-to-animation-token function and ranged-upgrade level, weapon-mask and dice mutation functions. Unit refresh is a supplied callback. Unit layout and original weapon enum/target masks are configured inputs; no full game playback or target-selection acceptance is claimed.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll'))
    parser.add_argument('--dependencies', type=Path, default=ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies')
    parser.add_argument('--report', type=Path, default=ROOT/'tmp/docs-artifacts/frost-siege-engine/rea/animation-source-cpu.json')
    args = parser.parse_args(); report = dict(source=source_probe(), cpu=binary_probe(args.binary, args.dependencies), passed=True)
    args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('PASS original MDX event/particle tracks; 2 original animation selector CPU cases; 5 ranged upgrade CPU cases')
