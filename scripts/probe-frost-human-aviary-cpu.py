"""Author: MiYu. Original rasd mutation and unit missile getter CPU checks."""
import hashlib, json, struct, sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile, unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP
binary = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw = binary.read_bytes(); sha = hashlib.sha256(raw).hexdigest()
assert sha == 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe = pefile.PE(data=raw); image = pe.get_memory_mapped_image(); base = pe.OPTIONAL_HEADER.ImageBase
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(base, (len(image)+4095)&~4095); cpu.mem_write(base, image)
cpu.mem_map(0x1000000, 0x20000)
attack, unit, upgrade, stack, stop, row, vtable, setter, output, data = [0x1000000+i*0x1000 for i in range(1,11)]
def word(p): return struct.unpack('<I', cpu.mem_read(p,4))[0]
def integer(p,n): cpu.mem_write(p,struct.pack('<I',n&0xffffffff))
def real(p,n): cpu.mem_write(p,struct.pack('<f',n))
def getreal(p): return struct.unpack('<f',cpu.mem_read(p,4))[0]
def hook(uc,address,size,user):
    if address not in [0x6f327020,setter]: return
    sp=cpu.reg_read(UC_X86_REG_ESP)
    if address == setter:
        obj=cpu.reg_read(UC_X86_REG_ECX); integer(obj+4,word(word(sp+4))); pop=12
    else:
        cpu.reg_write(UC_X86_REG_EAX,row); pop=4
    cpu.reg_write(UC_X86_REG_EIP,word(sp)); cpu.reg_write(UC_X86_REG_ESP,sp+pop)
cpu.hook_add(unicorn.UC_HOOK_CODE,hook)
def run(address,ecx,edx=0,args=[]):
    for i,value in enumerate([stop]+args): integer(stack+4*i,value)
    cpu.reg_write(UC_X86_REG_ESP,stack); cpu.reg_write(UC_X86_REG_ECX,ecx); cpu.reg_write(UC_X86_REG_EDX,edx)
    cpu.emu_start(address,stop,count=30000)
    assert cpu.reg_read(UC_X86_REG_EIP)==stop
    return cpu.reg_read(UC_X86_REG_EAX)
integer(unit+0x1e8,attack); integer(vtable,setter)
for at in [attack+0x10c,attack+0x11c]: integer(at,vtable)
real(upgrade+0x28,200); real(upgrade+0x30,0); real(0x6fbb81d4,0)
upgrades=[]
for old,new in [(0,1),(1,0),(1,1)]:
    for at in [attack+0x110,attack+0x120]: real(at,200*old)
    run(0x6f698980,upgrade,args=[unit,old,new])
    result=[getreal(attack+0x110),getreal(attack+0x120)]; assert result==[200*new]*2
    upgrades.append(dict(oldRank=old,newRank=new,spillDistance=result))
# Unit UI lists: count/data at art +40/+44, speed +60/+64, arc +6c/+70, homing +78/+7c.
for count,pointer,offset in [(0x40,0x44,0),(0x60,0x64,4),(0x6c,0x70,8)]:
    integer(row+count,1); integer(row+pointer,data+offset)
integer(data,0x12345678); real(data+4,1100); real(data+8,.15); integer(row+0x78,0)
getters=[]
for slot in [0,1,7]:
    art=run(0x6f3246d0,0x68677279,slot)
    run(0x6f3256f0,output,0x68677279,[slot]); speed=getreal(output)
    run(0x6f325670,output,0x68677279,[slot]); arc=getreal(output)
    homing=run(0x6f3256c0,0x68677279,slot)
    assert art==0x12345678 and speed==1100 and abs(arc-.15)<1e-7 and homing==0
    getters.append(dict(weaponIndex=slot,modelPointer=hex(art),speed=speed,arc=arc,homing=homing))
# Verify the actual selected attack slot reaches the same arc/speed/homing getters.
integer(attack+0x30,unit); integer(unit+0x30,0x68677279); integer(attack+0x2b8,1)
run(0x6f47b4a0,attack,args=[output]); assert abs(getreal(output)-.15)<1e-7
run(0x6f47b4f0,attack,args=[output]); assert getreal(output)==1100
assert run(0x6f47b4d0,attack)==0
report=dict(passed=True,binarySha256=sha,upgradeCases=upgrades,getterCases=getters,selectedWeapon2GettersPassed=True,limitations=['Original x86 functions execute in Unicorn, not a running Warcraft match.','Unit UI resolver 0x6f327020 returns a configured parsed row. Lists, model pointer and upgrade object are fixture inputs; MPQ parsing is not executed.','Spill property setter is a supplied callback that stores the passed value; original upgrade rank math and both-slot mutation loop execute unchanged.','Original missile event ordering, collision geometry, target immunity and final armor damage are not executed.'])
out = root/'tmp/docs-artifacts/frost-human-aviary/rea'; out.mkdir(parents=True, exist_ok=True)
(out/'cpu-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS: 3 original rasd rank transitions, 3 original singleton getter indices, selected weapon2 arc/speed/homing chain')
