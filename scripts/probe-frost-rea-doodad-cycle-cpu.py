"""Author: MiYu. Execute the source renderer clock and doodad completion callback with bounded model APIs."""
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_FPCW, UC_X86_REG_MXCSR

binary=Path(sys.argv[1] if len(sys.argv)>1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw=binary.read_bytes();digest=hashlib.sha256(raw).hexdigest()
assert digest=='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe=pefile.PE(data=raw);blob=pe.get_memory_mapped_image()
cpu=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_32)
cpu.reg_write(UC_X86_REG_FPCW,0x37f);cpu.reg_write(UC_X86_REG_MXCSR,0x1f80)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase,(len(blob)+4095)&~4095);cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase,blob)
cpu.mem_map(0x1000000,0x20000)
owner,vtable,entity,model,renderer,sequences,definitions,tracks,stack,stop=[0x1000000+i*0x1000 for i in range(1,11)]
def word(address):return struct.unpack('<I',cpu.mem_read(address,4))[0]
def write(address,value):cpu.mem_write(address,struct.pack('<I',value&0xffffffff))
def returned(count,value=0):
    sp=cpu.reg_read(UC_X86_REG_ESP);cpu.reg_write(UC_X86_REG_EAX,value&0xffffffff)
    cpu.reg_write(UC_X86_REG_EIP,word(sp));cpu.reg_write(UC_X86_REG_ESP,sp+4+count)
events=[];next_clip=0;trace=[]
def external(uc,address,size,unused):
    trace.append(hex(address));del trace[:-12]
    sp=uc.reg_read(UC_X86_REG_ESP)
    if address==0x6f6f19f0:returned(0,next_clip)  # Candidate weighting is independently verified by the Stand probe.
    elif address==0x6f12fa70:
        index=uc.reg_read(UC_X86_REG_EDX);events.append(dict(action='select',clip=index))
        uc.mem_write(renderer+0x58,bytes([index]));write(tracks+index*16+4,1);returned(4,1)
    elif address==0x6f12f500:
        events.append(dict(action='seek',clip=uc.reg_read(UC_X86_REG_EDX),time=word(sp+4)))
        uc.reg_write(UC_X86_REG_ECX,renderer);uc.reg_write(UC_X86_REG_EIP,0x6f77a370)
    elif address==0x6f12fb80:
        write(renderer+0x48,word(sp+4));returned(4)
cpu.hook_add(unicorn.UC_HOOK_CODE,external)
write(owner,vtable);write(vtable+0x28,0x6f7592a0);write(entity+0x144,owner);write(entity+0x58,model)
write(model+0x98,renderer);write(renderer+8,tracks);write(renderer+0x44,sequences);write(renderer+0x48,0x3f800000)
write(sequences+0x18,definitions);write(renderer+0x3c,0x6f75e840);write(renderer+0x40,entity)
for index,duration in enumerate([100,60]):
    write(definitions+index*140,index*1000);write(definitions+index*140+4,index*1000+duration)
    write(definitions+index*140+12,index);write(tracks+index*16,index*1000);write(tracks+index*16+4,1)

def tick(delta):
    write(stack,stop);cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,renderer);cpu.reg_write(UC_X86_REG_EDX,delta)
    try:cpu.emu_start(0x6f77a360,stop,count=10000)
    except unicorn.UcError:
        print('Source execution stopped',hex(cpu.reg_read(UC_X86_REG_EIP)),trace);raise
    assert cpu.reg_read(UC_X86_REG_EIP)==stop
    clip=bytes(cpu.mem_read(renderer+0x58,1))[0]
    return dict(clip=clip,time=word(tracks+clip*16)-clip*1000,skip=bool(word(renderer+0x54)&0x20),callbacks=word(entity+0x140),events=list(events))

cases=[]
for initial in (0,1):
    write(renderer+0x4c,0);write(renderer+0x54,0x20);cpu.mem_write(renderer+0x58,bytes([initial]));write(entity+0x150,1);write(entity+0x140,0)
    for i in range(2):write(tracks+i*16,i*1000);write(tracks+i*16+4,1)
    expected_clip=initial;elapsed=0;skip=True;count=0
    for delta in [16,0,30,29,1,40,1,500,16,100,16,60,0,1]:
        next_clip=1-expected_clip;events.clear()
        if skip:skip=False
        else:
            elapsed+=delta
            if elapsed>=[100,60][expected_clip]:expected_clip=next_clip;elapsed=0;skip=True;count+=1
        actual=tick(delta)
        assert (actual['clip'],actual['time'],actual['skip'],actual['callbacks'])==(expected_clip,elapsed,skip,count),(delta,actual)
        cases.append(dict(initial=initial,deltaMs=delta,**actual))

out=ROOT/'tmp/docs-artifacts/warcraft-map-tests/doodad-runtime';out.mkdir(parents=True,exist_ok=True)
(out/'cycle-cpu.json').write_text(json.dumps(dict(binarySha256=digest,passed=len(cases),cases=cases,
    clock='0x6f77a1e0',boundary='0x6f77ba30',callback='0x6f75e840',state='0x6f7592a0',seek='0x6f77a370',
    limitations=['Selection choice, sequence selection API and speed setter are supplied; clock, boundary, callback, Stand state dispatch and seek execute as original code',
        'Forward speed-one Stand only; visibility gating, original RNG order, special state queues and particle simulation remain unverified']),indent=2),encoding='utf-8')
assert hashlib.sha256(binary.read_bytes()).hexdigest()==digest
print(f'PASS source doodad cycles: {len(cases)} steps; loop/nonloop complete, seek skips next advance, overshoot is discarded')
