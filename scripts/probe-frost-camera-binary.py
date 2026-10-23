"""Author: MiYu. Execute the preserved Warcraft perspective matrix with supplied FOV and aspect."""
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
    raw = binary.read_bytes(); assert hashlib.sha256(raw).hexdigest() == EXPECTED
    if dependencies: sys.path.insert(0, str(dependencies))
    import pefile
    import unicorn
    from unicorn.x86_const import UC_X86_REG_ECX, UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_XMM0
    pe = pefile.PE(data=raw); base = pe.OPTIONAL_HEADER.ImageBase; image = pe.get_memory_mapped_image()
    cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
    cpu.mem_map(base, (len(image)+4095)&~4095); cpu.mem_write(base,image)
    cpu.mem_map(0x1000000,0x10000); matrix,stack,stop = 0x1001000,0x1008000,0x1009000
    constants = {hex(a):struct.unpack_from('<f',image,a-base)[0] for a in [0x6f950d88,0x6f950d8c,0x6f95a588,0x6f95a58c,0x6f95d54c]}
    assert list(constants.values()) == [.5,1,struct.unpack('<f',struct.pack('<f',math.pi))[0],180,-2]
    def external(uc,address,size,data):
        if address not in [0x6f771f7a,0x6f771f80]: return
        value = struct.unpack('<d',cpu.reg_read(UC_X86_REG_XMM0).to_bytes(16,'little')[:8])[0]
        result = math.sqrt(value) if address == 0x6f771f7a else math.tan(value)
        cpu.reg_write(UC_X86_REG_XMM0,int.from_bytes(struct.pack('<d',result),'little'))
        sp = cpu.reg_read(UC_X86_REG_ESP)
        cpu.reg_write(UC_X86_REG_EIP,struct.unpack('<I',cpu.mem_read(sp,4))[0]); cpu.reg_write(UC_X86_REG_ESP,sp+4)
    cpu.hook_add(unicorn.UC_HOOK_CODE,external)
    cases = []
    for fov in [30,70,110]:
        for aspect in [4/3,16/9,960/900,9/16,32/9]:
            for near,far in [(100,5000),(.78125,39.0625)]:
                cpu.mem_write(stack,struct.pack('<Iffff',stop,math.radians(fov),aspect,near,far))
                cpu.reg_write(UC_X86_REG_ESP,stack); cpu.reg_write(UC_X86_REG_ECX,matrix)
                cpu.emu_start(0x6f0d31d0,stop,count=1000)
                assert cpu.reg_read(UC_X86_REG_EIP) == stop
                actual = list(struct.unpack('<16f',cpu.mem_read(matrix,64)))
                vertical = fov/math.sqrt(1+aspect*aspect); scale = 1/math.tan(math.radians(vertical)/2)
                expected = [scale/aspect,0,0,0,0,scale,0,0,0,0,(far+near)/(far-near),1,0,0,-2*far*near/(far-near),0]
                assert all(math.isclose(a,b,rel_tol=5e-7,abs_tol=1e-7) for a,b in zip(actual,expected)),(fov,aspect,actual,expected)
                cases.append(dict(sourceFov=fov,aspect=aspect,verticalFov=vertical,near=near,far=far,matrix=actual))
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == EXPECTED
    return dict(passed=True,binarySha256=EXPECTED,address='0x6f0d31d0',codeSha256=hashlib.sha256(image[0xd31d0:0xd32d4]).hexdigest(),constants=constants,cases=cases,
                limitations=['Original x86 matrix instructions execute in Unicorn; only external sqrt/tan are supplied by Python math.', 'Inputs are supplied; this probe does not execute the original window, HUD or camera controller. Float32 results are compared with tolerance, not bitwise CRT equivalence.'])


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--binary',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')); parser.add_argument('--dependencies',type=Path); parser.add_argument('--report',type=Path,default=ROOT/'tmp/docs-artifacts/war3-ui/camera-source/binary.json')
    args=parser.parse_args(); report=probe(args.binary,args.dependencies); args.report.parent.mkdir(parents=True,exist_ok=True); args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(f"PASS original camera matrix: {len(report['cases'])} CPU cases")
