"""Author: MiYu. Execute original Barrage dispatch, exclusion filter and damage/count loop."""
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
    from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP
    pe = pefile.PE(data=raw); base = pe.OPTIONAL_HEADER.ImageBase; image = pe.get_memory_mapped_image()
    cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
    cpu.mem_map(base, (len(image)+4095)&~4095); cpu.mem_write(base, image)
    cpu.mem_map(0, 0x1000); cpu.mem_map(0x1000000, 0x20000)
    ability, owner, primary, event, config, levels, candidates, array, filter_context, stack, stop = [0x1000000+i*0x1000 for i in range(1,12)]
    def integer(p,n): cpu.mem_write(p,struct.pack('<I',n&0xffffffff))
    def real(p,n): cpu.mem_write(p,struct.pack('<f',n))
    def word(p): return struct.unpack('<I',cpu.mem_read(p,4))[0]
    def value(p): return struct.unpack('<f',cpu.mem_read(p,4))[0]
    def returned(n=0,eax=0):
        sp=cpu.reg_read(UC_X86_REG_ESP); cpu.reg_write(UC_X86_REG_EAX,eax); cpu.reg_write(UC_X86_REG_EIP,word(sp)); cpu.reg_write(UC_X86_REG_ESP,sp+4+n)
    launches=[]; enum={}; filters=[]
    def next_candidate():
        if enum['pending']:
            target=enum['pending'].pop(0); enum['current']=target
            integer(enum['sp']-4,stop+0x110); cpu.reg_write(UC_X86_REG_ESP,enum['sp']-4)
            cpu.reg_write(UC_X86_REG_ECX,target); cpu.reg_write(UC_X86_REG_EDX,filter_context); cpu.reg_write(UC_X86_REG_EIP,0x6f66e820)
        else:
            context=enum['context']; accepted=enum['accepted']
            integer(context+0x10,len(accepted)); integer(context+0x14,len(accepted)); integer(context+0x18,array)
            for i,target in enumerate(accepted): integer(array+i*8,target); real(array+i*8+4,i)
            cpu.reg_write(UC_X86_REG_ESP,enum['sp']); returned()
    def external(uc,address,size,data):
        sp=cpu.reg_read(UC_X86_REG_ESP)
        if address==0x6f3fc090: returned(4,1)  # Supplied enabled ability state.
        elif address==0x6f044150: returned(0,ability)
        elif address in [0x6f667470,stop+0x100]: returned(0,0x12345678)
        elif address==0x6f02fbf0: returned(0,1)
        elif address==0x6f661060:
            # Supply ordered spatial candidates, but run the original candidate != excluded predicate.
            tokens=[word(sp+4*i) for i in range(1,13)]
            assert tokens[0]==0x6f6b94d0 and tokens[2]==10 and tokens[5]==29 and tokens[9]==15 and tokens[11]==31,tokens
            enum.clear(); enum.update(sp=sp,context=tokens[1],excluded=tokens[10],accepted=[],pending=[primary]+[candidates+i*0x80 for i in range(case['candidates'])])
            assert enum['excluded']==primary
            integer(filter_context+0x14,enum['excluded']); next_candidate()
        elif address==stop+0x110:
            accepted=bool(cpu.reg_read(UC_X86_REG_EAX)); filters.append(dict(target=hex(enum['current']),accepted=accepted))
            if accepted: enum['accepted'].append(enum['current'])
            next_candidate()
        elif address==0x6f78bfc0: returned(8)  # Supplied candidate order; no spatial-sort acceptance claim.
        elif address==0x6f6b6770:
            context=cpu.reg_read(UC_X86_REG_EDX)
            launches.append(dict(target=hex(cpu.reg_read(UC_X86_REG_ECX)),damage=value(context+0x34),abilityRawCode=hex(word(context+0x24)),source=hex(word(context+0x2c))))
            returned()
        elif address==0x6f1205ce: returned(16)
    cpu.hook_add(unicorn.UC_HOOK_CODE,external)
    integer(ability,0x6fa16ab4); integer(ability+0x30,owner); integer(ability+0x34,0x41726f63)
    integer(ability+0x24,0xffffffff); integer(ability+0x28,0xffffffff); integer(owner+0x1dc,1); integer(owner+0x1e0,1)
    assert word(word(ability)+0x150)==0x6f571fa0 and word(word(ability)+0x308)==0x6f589250
    integer(ability+0x50,0); integer(ability+0x54,config); integer(ability+0x4c,4)
    integer(config+0x2c,1); integer(config+0x50,1); integer(config+0x54,levels)
    integer(owner,stop+0x200); integer(stop+0x200+0x1c,stop+0x100)
    real(0x6fbb81d8,1); real(0x6fbb81d4,0); real(levels+0x18,500)
    cases=[]
    specs=[('native-min',13,25,630,9,15,10),('native-max',14,25,630,9,15,10),('one-limit',13,25,630,1,15,2),('zero-limit',13,25,630,0,15,15),('no-candidates',13,25,630,9,0,0),('few-candidates',13,25,630,9,3,3),('budget-overshoot',100,25,630,9,15,7),('budget-exact',90,25,630,9,15,7),('budget-below-damage',13,25,1,9,15,1),('zero-budget',13,25,0,9,15,10),('zero-both',13,25,0,0,15,15),('data-a-change',13,999,630,9,15,10),('source-damage-change',42,25,630,9,15,10)]
    for label,damage,data_a,budget,limit,count,expected in specs:
        case=dict(label=label,sourceDamage=damage,dataA=data_a,dataB=budget,dataC=limit,candidates=count)
        launches.clear(); filters.clear(); integer(owner+4,100)
        for i in range(count): integer(candidates+i*0x80+4,100)
        real(event+0x44,damage); real(levels+0x20,data_a); real(levels+0x24,budget); real(levels+0x28,limit)
        integer(stack,stop); integer(stack+4,primary); integer(stack+8,event)
        cpu.reg_write(UC_X86_REG_ESP,stack); cpu.reg_write(UC_X86_REG_ECX,owner)
        cpu.emu_start(0x6f6624a0,stop,count=50000)
        assert cpu.reg_read(UC_X86_REG_EIP)==stop
        assert len(launches)==expected,(label,len(launches),expected)
        assert all(x['damage']==damage and x['target']!=hex(primary) and x['source']==hex(owner) for x in launches),(label,launches)
        assert filters[0]==dict(target=hex(primary),accepted=False)
        assert cpu.reg_read(UC_X86_REG_EAX)==0  # Original attack handler continues the normal primary projectile.
        cases.append(dict(**case,extraLaunches=list(launches),extraDamageTotal=sum(x['damage'] for x in launches),excludedPrimary=hex(primary),filterCases=list(filters),handlerReturn=0))
    weapon_cases=[]
    for name,address,expected in [('missile',0x6f6624a0,10),('instant',0x6f6620e0,0),('mline',0x6f662360,0)]:
        launches.clear(); filters.clear(); case=dict(candidates=15)
        integer(stack,stop); integer(stack+4,primary); integer(stack+8,event)
        cpu.reg_write(UC_X86_REG_ESP,stack); cpu.reg_write(UC_X86_REG_ECX,owner)
        cpu.emu_start(address,stop,count=50000)
        assert cpu.reg_read(UC_X86_REG_EIP)==stop and len(launches)==expected,(name,launches)
        weapon_cases.append(dict(weapon=name,dispatcher=hex(address),extraCount=len(launches)))
    functions=[('missileDispatcher',0x6f6624a0,0x92),('instantDispatcher',0x6f6620e0,0x92),('dispatch',0x6f571fa0,0xc6),('countDamageLoop',0x6f6b933b,0xac),('excludePrimary',0x6f66e820,9),('dataB',0x6f3f7470,0x57),('dataC',0x6f3f74d0,0x57),('subtract',0x6f0528b0,0x102)]
    return dict(author='MiYu',passed=True,binarySha256=EXPECTED,barrageVtable='0x6fa16ab4',cases=cases,weaponCases=weapon_cases,functions={name:dict(address=hex(a),bytes=n,sha256=hashlib.sha256(image[a-base:a-base+n]).hexdigest()) for name,a,n in functions},limitations=['Original weapon dispatchers, Barrage handler with its actual vtable, data getters, primary-target inequality predicate and damage/count loop execute unmodified x86 bytes. Spatial enumeration, candidate ordering, object type/reference infrastructure, ability-enabled state and missile launch are supplied callbacks.', 'The probe observes launch requests and their damage payloads; it does not execute original missile travel, impact, armor, upgrades, attack-slot selection, or the complete original game. Weapon string/branch mapping and the outer attack caller continuing to construct the primary missile are established by separate static evidence at 0x6f689580, 0x6f477182 and 0x6f477375-0x6f4773a6.'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--binary',type=Path,required=True); parser.add_argument('--dependencies',type=Path); parser.add_argument('--report',type=Path,default=ROOT/'tmp/docs-artifacts/frost-siege-engine/binary.json')
    args=parser.parse_args(); report=probe(args.binary,args.dependencies); args.report.parent.mkdir(parents=True,exist_ok=True); args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(f"PASS original Barrage dispatch, exclusion and count/damage loop: {len(report['cases'])+len(report['weaponCases'])} CPU cases")
