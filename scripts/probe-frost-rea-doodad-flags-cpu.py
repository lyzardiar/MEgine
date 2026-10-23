"""Author: MiYu. Execute source placement dispatch and callback packing for every flags byte."""
import hashlib
import json
from pathlib import Path
import struct
import sys
from warcraft_doodads import placement_kind

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP

binary=Path(sys.argv[1] if len(sys.argv)>1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw=binary.read_bytes();digest=hashlib.sha256(raw).hexdigest()
assert digest=='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe=pefile.PE(data=raw);blob=pe.get_memory_mapped_image()
cpu=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_32)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase,(len(blob)+4095)&~4095);cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase,blob)
cpu.mem_map(0x1000000,0x10000)
owner,identity,placement,stack,stop=[0x1000000+i*0x1000 for i in range(1,6)]
def word(address):return struct.unpack('<I',cpu.mem_read(address,4))[0]
def write(address,value):cpu.mem_write(address,struct.pack('<I',value&0xffffffff))
def returned(count,value=0):
    sp=cpu.reg_read(UC_X86_REG_ESP);cpu.reg_write(UC_X86_REG_EAX,value)
    cpu.reg_write(UC_X86_REG_EIP,word(sp));cpu.reg_write(UC_X86_REG_ESP,sp+4+count)
calls=[]
destructable=False
def external(uc,address,size,unused):
    if address==0x6f6d5790:returned(12,int(destructable))  # Source-table membership is supplied by the fixture.
    elif address==0x6f0527e0:returned(4,placement+12)  # Conversion outside flags dispatch.
    elif address==stop+16:
        record=uc.reg_read(UC_X86_REG_ECX);calls.append(dict(heightOverride=word(record+28),typeId=word(record)))
        returned(0)

cpu.hook_add(unicorn.UC_HOOK_CODE,external)
write(owner+0x110,stop+16);write(identity,0x4c546c74);write(identity+4,4)
cpu.mem_write(placement,struct.pack('<6f',128,256,384,0,1,100))
cases=[]
for mode in (0,1):
    write(0x6fbed448,mode)
    for destructable in (False,True):
        for flags in range(256):
            calls.clear()
            for i,value in enumerate([stop,identity,placement,flags]):write(stack+i*4,value)
            cpu.reg_write(UC_X86_REG_ECX,owner);cpu.reg_write(UC_X86_REG_ESP,stack)
            cpu.emu_start(0x6f751980,stop,count=1000)
            assert cpu.reg_read(UC_X86_REG_EIP)==stop
            direct=bool(cpu.reg_read(UC_X86_REG_EAX))
            kind='decorative' if direct else 'destructable' if calls else 'suppressed'
            assert kind==('decorative' if mode else placement_kind(destructable,flags)),(mode,destructable,flags,kind)
            assert len(calls)<=1
            if calls:assert calls[0]['heightOverride']==int(bool(flags&4)) and calls[0]['typeId']==0x746c544c
            cases.append(dict(mode=mode,destructable=destructable,flags=flags,kind=kind,calls=list(calls)))
out=ROOT/'tmp/docs-artifacts/warcraft-map-tests/doodad-runtime';out.mkdir(parents=True,exist_ok=True)
(out/'flags-cpu.json').write_text(json.dumps(dict(binarySha256=digest,passed=len(cases),cases=cases,
    entry='0x6f751980',callbackPacking='0x6f7518a0',modeAddress='0x6fbed448',
    limitations=['Source-table lookup and angle conversion are stubbed; creation callback records arguments only',
        'Proves dispatch and callback packing, not complete model creation, visibility after creation, collisions or live game execution']),indent=2),encoding='utf-8')
assert hashlib.sha256(binary.read_bytes()).hexdigest()==digest
print(f'PASS source doodad flags: {len(cases)} dispatch cases match importer; callback preserves height override bit')
