"""Author: MiYu. Execute original pathing mask conversion and flag writes without engine stubs."""
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ECX,UC_X86_REG_EDX,UC_X86_REG_ESP

raw=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll').read_bytes()
digest=hashlib.sha256(raw).hexdigest();assert digest=='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe=pefile.PE(data=raw);blob=pe.get_memory_mapped_image();cpu=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_32)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase,(len(blob)+4095)&~4095);cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase,blob)
cpu.mem_map(0x1000000,0x4000);stack,cell,stop=0x1001000,0x1002000,0x1003000


def run(address,arg,ecx=0,edx=0):
    cpu.mem_write(stack,struct.pack('<2I',stop,arg&0xffffffff));cpu.reg_write(UC_X86_REG_ESP,stack)
    cpu.reg_write(UC_X86_REG_ECX,ecx);cpu.reg_write(UC_X86_REG_EDX,edx);cpu.reg_write(UC_X86_REG_EAX,0x12345678)
    cpu.emu_start(address,stop,count=100)
    assert cpu.reg_read(UC_X86_REG_ESP)==stack+(8 if address==0x6f036e20 else 4)
    return cpu.reg_read(UC_X86_REG_EAX)&255


masks=[]
for value in [-2147483648,-1,*range(256),2147483647]:
    mask=run(0x6f1e3be0,value);expected=[255,2,4,8,16,32,64,128][value] if 0<=value<8 else 0
    assert mask==expected;masks.append([value,mask])
changed=0
for before in range(256):
    for mask in [0,255,2,4,8,16,32,64,128]:
        for pathable in [False,True]:
            initial=(before<<24)|0x12abcd;cpu.mem_write(cell,struct.pack('<I',initial))
            run(0x6f036e20,int(not pathable),cell,mask)
            actual=struct.unpack('<I',cpu.mem_read(cell,4))[0]
            expected=(before&~mask if pathable else before|mask)<<24|0x12abcd
            assert actual==expected;changed+=1
out=ROOT/'tmp/docs-artifacts/frost-original-maps/pathing-evidence';out.mkdir(parents=True,exist_ok=True)
(out/'cpu.json').write_text(json.dumps(dict(binarySha256=digest,masks=masks,writes=changed,lower24BitsPreserved=True,externalStubs=False,limitations=['Only type conversion and one terrain flag word are executed; world lookup, dynamic blockers and full JASS behavior are not verified']),indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(maskCases=len(masks),flagWrites=changed,passed=True)))
