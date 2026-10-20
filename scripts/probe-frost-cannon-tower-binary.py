"""Author: MiYu. Execute original artillery bands and circle overlap with supplied object positions."""
import argparse
import hashlib
import json
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
    from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_EBP, UC_X86_REG_ESI, UC_X86_REG_EDI
    pe = pefile.PE(data=raw); base = pe.OPTIONAL_HEADER.ImageBase; image = pe.get_memory_mapped_image()
    cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
    cpu.mem_map(base, (len(image)+4095)&~4095); cpu.mem_write(base,image)
    cpu.mem_map(0x1000000,0x10000)
    missile,target,body,world,stack,stop=[0x1000000+i*0x1000 for i in range(1,7)]
    def integer(p,n): cpu.mem_write(p,struct.pack('<I',n&0xffffffff))
    def real(p,n): cpu.mem_write(p,struct.pack('<f',n))
    def word(p): return struct.unpack('<I',cpu.mem_read(p,4))[0]
    def value(p): return struct.unpack('<f',cpu.mem_read(p,4))[0]
    def returned(n=0,eax=0):
        sp=cpu.reg_read(UC_X86_REG_ESP);cpu.reg_write(UC_X86_REG_EAX,eax);cpu.reg_write(UC_X86_REG_EIP,word(sp));cpu.reg_write(UC_X86_REG_ESP,sp+4+n)
    factors=[]
    def external(uc,address,size,data):
        sp=cpu.reg_read(UC_X86_REG_ESP)
        if address==stop+0x100:
            output=word(sp+4);real(output,600);real(output+4,0);returned(4,output)
        elif address==stop+0x110: returned(0,target+0x300)
        elif address==0x6f037350: returned(0,body)
        elif address==0x6f10d790:
            output=word(sp+4);real(output,1);returned(4,output)
        elif address==0x6f6b1500:
            factors.append(value(word(sp+12)));output=word(sp+4);real(output,1);returned(12,output)
        elif address==stop+0x120: returned(4,1)
    cpu.hook_add(unicorn.UC_HOOK_CODE,external)
    integer(missile,stop+0x200);integer(stop+0x200+0xa0,stop+0x100)
    integer(target,stop+0x400);integer(stop+0x400+0xb8,stop+0x110)
    integer(stop+0x200+0xcc,stop+0x120);integer(stop+0x200+0xd0,0x6f6b8d10)
    integer(0x6fbb82bc,world);real(0x6fbb81d8,1);real(0x6fbb81d4,0)
    for offset,n in [(0xb8,50),(0xc0,100),(0xc8,125),(0xa8,.5),(0xb0,.1)]: real(missile+offset,n)
    cases=[]
    for collision in [0,32,72,80]:
        for distance in [0,49+collision,51+collision,99+collision,101+collision,124+collision,126+collision]:
            factors.clear();real(body+0x78,600/32);real(body+0x7c,distance/32);real(body+0x90,collision/32)
            integer(stack,stop);integer(stack+4,target);integer(stack+8,world+0x400)
            cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,missile)
            cpu.emu_start(0x6f6b8d10,stop,count=5000)
            # The enclosing enumeration supplies the outer radius; this virtual callback chooses full/half/quarter.
            expected=1 if distance<=50+collision else .5 if distance<=100+collision else .1
            assert len(factors)==1 and abs(factors[0]-expected)<1e-6,(collision,distance,factors,expected)
            cases.append(dict(collision=collision,distance=distance,callbackFactor=factors[0],insideOuterRadius=distance<=125+collision))
    # Supply one spatial-index candidate and execute the original outer-circle test through the band callback.
    query,entry,context,frame=world+0x500,world+0x600,world+0x700,stack+0x500
    integer(query+0xc,entry);integer(entry,entry+0x100);integer(entry+0x130,body)
    integer(body+0x30,entry+0x100);integer(entry+0x154,target);integer(context,missile)
    boundary=[]
    for collision in [0,32,72,80]:
        for radius in [50,100,125]:
            for delta in [-.002,0,.00025,.002]:
                for diagonal in ([False] if delta==0 else [False,True]):
                    # Delta is in the native /32 squared-distance units, straddling its 0.001 tolerance.
                    distance=(((radius+collision)/32)**2+delta)**.5*32
                    x,z=(distance*.6,distance*.8) if diagonal else (0,distance)
                    factors.clear();real(body+0x78,(600+x)/32);real(body+0x7c,z/32);real(body+0x90,collision/32)
                    real(frame-0x30,600/32);real(frame-0x2c,0);real(frame+8,125/32)
                    integer(frame+0x14,0x6f6afe00);integer(frame+0x18,context)
                    cpu.reg_write(UC_X86_REG_ESP,frame-0x80);cpu.reg_write(UC_X86_REG_EBP,frame)
                    cpu.reg_write(UC_X86_REG_ESI,query);cpu.reg_write(UC_X86_REG_EDI,0)
                    cpu.emu_start(0x6f03fe90,0x6f03fefe,count=10000)
                    assert cpu.reg_read(UC_X86_REG_EIP)==0x6f03fefe
                    expected=(0 if delta>0 else .1) if radius==125 else (1 if radius==50 else .5) if delta<.001 else (.5 if radius==50 else .1)
                    factor=factors[0] if factors else 0
                    assert abs(factor-expected)<1e-6,(collision,radius,delta,diagonal,factor,expected)
                    boundary.append(dict(collision=collision,radius=radius,delta=delta,diagonal=diagonal,distance=distance,offset=[x,z],factor=factor))
    return dict(author='MiYu',passed=True,binarySha256=EXPECTED,cases=cases,boundaryCases=boundary,functions={name:dict(address=hex(a),bytes=n,sha256=hashlib.sha256(image[a-base:a-base+n]).hexdigest()) for name,a,n in [('artilleryBands',0x6f6b8d10,0x19a),('overlap',0x6f03e260,0x139),('outerCandidate',0x6f03fe90,0x6e),('candidateCallback',0x6f6afe00,0x2c)]},limitations=['Spatial-index candidates, object handles, circle bounds, interpolation, target eligibility and final damage callback are supplied; original outer candidate distance filter, callback dispatch, band selection and collision arithmetic execute unmodified.', 'Spatial-index construction, target-mask filtering, full original runtime and non-circular building pathing footprints are not executed. JavaScript uses double precision; exact float32 tangencies remain a fidelity boundary.'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--binary',type=Path,required=True);parser.add_argument('--dependencies',type=Path);parser.add_argument('--report',type=Path,default=ROOT/'tmp/docs-artifacts/frost-cannon-tower/binary.json')
    args=parser.parse_args();report=probe(args.binary,args.dependencies);args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(f"PASS original Cannon artillery bands, outer-circle filter and collision tolerance: {len(report['cases'])+len(report['boundaryCases'])} CPU cases")
