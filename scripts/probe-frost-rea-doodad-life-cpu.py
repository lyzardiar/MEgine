"""Author: MiYu. Execute source doodad life and animation-state branches with bounded external stubs."""
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP

binary = Path(sys.argv[1] if len(sys.argv)>1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw = binary.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe = pefile.PE(data=raw)
blob = pe.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase, (len(blob)+4095)&~4095)
cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase, blob)
cpu.mem_map(0x1000000, 0x10000)
owner, entity, vtable, model, names, stack, stop = [0x1000000+i*0x1000 for i in range(1,8)]

def word(address): return struct.unpack('<I',cpu.mem_read(address,4))[0]
def write(address,value): cpu.mem_write(address,struct.pack('<I',value&0xffffffff))
def string(address): return bytes(cpu.mem_read(address,64)).split(b'\0')[0].decode('ascii')
def returned(count,value=0):
    sp=cpu.reg_read(UC_X86_REG_ESP)
    cpu.reg_write(UC_X86_REG_EAX,value)
    cpu.reg_write(UC_X86_REG_EIP,word(sp))
    cpu.reg_write(UC_X86_REG_ESP,sp+4+count)

compare_call=0x6f6f1f95
assert bytes(cpu.mem_read(compare_call,1))==b'\xe8'
compare_target=compare_call+5+struct.unpack('<i',cpu.mem_read(compare_call+1,4))[0]
events=[]

def external(uc,address,size,unused):
    sp=uc.reg_read(UC_X86_REG_ESP)
    if address in (0x6f74e120,0x6f74e420): returned(8)  # Pathing/registration changes.
    elif address in (0x6f75c030,0x6f7554f0): returned(4)  # Model/texture refresh.
    elif address==0x6f12f610: returned(0,2)
    elif address==0x6f12f630:
        index=uc.reg_read(UC_X86_REG_EDX);assert index in (0,1)
        output=word(sp+4);cpu.mem_write(output,bytes(32));write(output+4,names+index*64);write(output+8,2000);write(output+24,index)
        returned(4)
    elif address==compare_target:
        returned(12,int(string(word(sp+4)).lower()!=string(word(sp+8)).lower()))
    elif address in (0x6f12fa70,0x6f12f500):
        events.append(dict(action='select' if address==0x6f12fa70 else 'seek',clip=uc.reg_read(UC_X86_REG_EDX),value=word(sp+4)))
        returned(4)
    elif address==0x6f12fb80: returned(4)  # Animation speed setter.
    elif address==0x6f6f19f0:
        assert string(uc.reg_read(UC_X86_REG_EDX))=='Stand';returned(0,0)  # Stand variant selection is outside this probe.

cpu.hook_add(unicorn.UC_HOOK_CODE,external)
cpu.mem_write(names,b'Stand\0');cpu.mem_write(names+64,b'Death\0')
write(owner,vtable);write(vtable+0x28,0x6f7592a0)
cases=[]
for destructable in (False,True):
    for previous in (0,100):
        for life in range(256):
            cpu.mem_write(entity,bytes(0x180));cpu.mem_write(entity+0x87,bytes([int(destructable)]))
            write(entity+0x58,model);write(entity+0x14c,previous);write(entity+0x150,4 if previous==0 else 1)
            events.clear()
            for i,value in enumerate([stop,entity,life,0,0]):write(stack+i*4,value)
            cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,owner)
            cpu.emu_start(0x6f75c5f0,stop,count=5000)
            assert cpu.reg_read(UC_X86_REG_EIP)==stop
            expected=min(life,100) if destructable else previous
            assert word(entity+0x14c)==expected,(destructable,previous,life)
            if not destructable or expected==previous:assert not events
            elif expected==0:assert events==[dict(action='select',clip=1,value=0),dict(action='seek',clip=1,value=2000)]
            elif previous==0:assert events==[dict(action='select',clip=0,value=0),dict(action='seek',clip=0,value=0)]
            else:assert not events
            cases.append(dict(destructable=destructable,previous=previous,sourceLife=life,storedLife=expected,events=list(events)))

out=ROOT/'tmp/docs-artifacts/warcraft-map-tests/doodad-runtime'
out.mkdir(parents=True,exist_ok=True)
report=dict(binarySha256=digest,passed=len(cases),cases=cases,entry='0x6f75c5f0',animationState='0x6f7592a0',namedSequence='0x6f6f1f50',
    limitations=['Life setter and named-sequence branches only; no original game render or complete DOO loader execution',
        'External model metadata, pathing/refresh and Stand variant chooser are stubbed; random scheduling and flags visibility are not verified'])
(out/'life-cpu.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
assert hashlib.sha256(binary.read_bytes()).hexdigest()==digest
print(f'PASS original doodad life: {len(cases)} cases; ordinary doodads ignore life; dead destructables seek Death end')
