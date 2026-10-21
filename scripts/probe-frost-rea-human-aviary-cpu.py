"""Author: MiYu. Bounded original Game.dll missile, listener and spatial-grid checks."""
import hashlib, json, struct, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile, unicorn
from unicorn.x86_const import *
raw=Path(sys.argv[1] if len(sys.argv)>1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll').read_bytes()
sha=hashlib.sha256(raw).hexdigest()
assert sha=='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe=pefile.PE(data=raw); blob=pe.get_memory_mapped_image(); base=pe.OPTIONAL_HEADER.ImageBase
cpu=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_32)
cpu.mem_map(base,(len(blob)+4095)&~4095);cpu.mem_write(base,blob)
cpu.mem_map(0x1000000,0x30000)
cpu.mem_map(0,4096)
obj,target,query,node,data,vt,stub,motion,world,entries=[0x1000000+i*0x1000 for i in range(1,11)]
stack=0x102d000;stop=0x102e000
def word(p):return struct.unpack('<I',cpu.mem_read(p,4))[0]
def integer(p,n):cpu.mem_write(p,struct.pack('<I',n&0xffffffff))
def real(p,n):cpu.mem_write(p,struct.pack('<f',n))
def getreal(p):return struct.unpack('<f',cpu.mem_read(p,4))[0]
def bits(n):return struct.unpack('<I',struct.pack('<f',n))[0]
events=[]
damage_events=[]
filter_accept=0
lead_events=[]
velocity=[0,0]
extension_events=[]
skip_primary_setup=False
schedule_events=[]
position=[0,0]
def hook(uc,addr,size,unused):
    sp=cpu.reg_read(UC_X86_REG_ESP);ecx=cpu.reg_read(UC_X86_REG_ECX)
    pop=None;result=0
    if addr==0x6f10d790:
        result=word(sp+4);real(result,0);pop=4
    elif addr==0x6f03ebf0:
        result=word(sp+4);real(result,position[0]);real(result+4,position[1]);pop=8
    elif addr==0x6f773b90:result=motion;pop=0
    elif addr==0x6f02f150:pop=0
    elif addr==0x6f037350:result=target;pop=0
    elif addr==0x6f11fba0:
        p=word(sp+12);events.append(dict(mode='coordinates',xyz=[getreal(p+i*4) for i in range(3)]));result=1;pop=20
    elif addr==0x6f11fde0:
        events.append(dict(mode='target',target=hex(word(sp+12))));result=1;pop=24
    elif addr==stub:result=obj;pop=0
    elif addr==0x6f039010:pop=8
    elif addr in [0x6f634dd0,0x6f02fbf0]:result=1;pop=0
    elif addr==stub+0x100:
        real(ecx+4,getreal(word(sp+4)));pop=8
    elif addr==0x6f6b0320:
        damage_events.append(dict(stage='filter',baseDamage=getreal(ecx+0x44),accepted=bool(filter_accept)));result=filter_accept;pop=4
    elif addr==0x6f667a80:pop=0
    elif addr==0x6f6b1500:
        damage_events.append(dict(stage='damage',baseDamage=getreal(ecx+0x44)));pop=12
    elif addr==stub+0x200:result=target;pop=0
    elif addr==stub+0x220:result=word(sp+4);real(result,0);pop=4
    elif addr==0x6f03b720:
        result=word(sp+4)
        for i,n in enumerate([*position,0]):real(result+i*4,n)
        pop=4
    elif addr==0x6f03d8c0:
        result=word(sp+4)
        for i,n in enumerate(velocity):real(result+i*4,n)
        pop=4
    elif addr==0x6f76d960:
        for i,n in enumerate([-10000,-10000,10000,10000]):real(ecx+i*4,n)
        result=ecx;pop=0
    elif addr==0x6f6b8b20:pop=4
    elif addr==0x6f6b57d0:
        p=word(sp+8);lead_events.append([getreal(p+i*4) for i in range(3)]);pop=8
    elif addr==0x6f03b6f0:
        p=word(sp+4);extension_events.append([getreal(p+i*4) for i in range(3)]);pop=4
    elif addr==0x6f6b5d20 and skip_primary_setup:pop=4
    elif addr==0x6f108da0:result=entries;pop=4
    elif addr==0x6f10aa60:
        schedule_events.append(dict(interval=getreal(sp+12),deadline=getreal(word(sp+16))));result=node;pop=20
    elif addr==0x6f17a710:result=7;pop=0
    elif addr in [stub+0x300,0x6f656be0]:pop=0
    elif addr==0x6f03f600:pop=8
    elif addr==0x6f10cb20:pop=4
    if pop is not None:
        cpu.reg_write(UC_X86_REG_EAX,result);cpu.reg_write(UC_X86_REG_EIP,word(sp));cpu.reg_write(UC_X86_REG_ESP,sp+4+pop)
cpu.hook_add(unicorn.UC_HOOK_CODE,hook)
def run(addr,ecx,edx=0,args=()):
    for i,value in enumerate([stop]+list(args)):integer(stack+i*4,value)
    cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,ecx);cpu.reg_write(UC_X86_REG_EDX,edx)
    cpu.emu_start(addr,stop,count=100000)
    assert cpu.reg_read(UC_X86_REG_EIP)==stop,hex(cpu.reg_read(UC_X86_REG_EIP))
    return cpu.reg_read(UC_X86_REG_EAX)
# Original circle overlap and original software-float arithmetic; only spatial position access is supplied.
integer(node+0x30,target);real(query+0x50,50/32);real(0x6fbb81d4,0)
radius_cases=[]
for radius,x,y,expected in [(16,60,0,1),(16,66,0,0),(16,66.01,0,0),(16,0,65,1),(0,0,0,0),(32,80,0,1)]:
    real(target+0x90,radius/32);position[:]=[x/32,y/32]
    actual=run(0x6f10b210,node,query)
    assert actual==expected,(radius,x,y,actual)
    radius_cases.append(dict(targetRadius=radius,spillRadius=50,x=x,y=y,included=bool(actual)))
# Original launcher branches, using explicit boundary callbacks for motion creation and event registration.
integer(obj,vt);integer(vt+0x14,stub);integer(0x6fbb82bc,world)
real(world+0x6c,0);real(world+0x70,0);real(data,64);real(data+4,1100)
for homing in [0,1]:
    assert run(0x6f773bf0,obj,args=[data,bits(320),bits(640),bits(96),data+4,0xd019c,0,data+8,target if homing else 0])==1
assert events==[dict(mode='coordinates',xyz=[10.0,20.0,3.0]),dict(mode='target',target=hex(target))],events
# Original overlap identity lookup uses both handle index and generation; repeat only marks presence.
integer(obj+0x64,entries);integer(target+0x14,7);integer(target+0x18,99)
integer(entries,7);integer(entries+4,99);integer(entries+8,0)
dedup=[]
for generation in [99,99,100]:
    integer(target+0x18,generation);found=run(0x6f10bc00,obj,args=[target,1])
    assert found==(generation==99)
    dedup.append(dict(generation=generation,found=bool(found),flags=word(entries+8)))
# Original attenuation runs before the supplied acceptance filter, including rejected contacts.
integer(target,vt);integer(target+4,10);integer(vt+0x1c,stub);integer(node+0x10,target)
integer(obj+0x40,vt+0x100);integer(vt+0x100,stub+0x100);real(obj+0x44,100);real(obj+0xbc,.2);real(0x6fbb81d8,1)
for accept in [0,1,1]:
    filter_accept=accept;run(0x6f6af320,obj,args=[node])
assert [e['stage'] for e in damage_events]==['filter','filter','damage','filter','damage'],damage_events
assert all(abs(e['baseDamage']-n)<1e-4 for e,n in zip(damage_events,[80,64,64,51.2,51.2])),damage_events
real(0x6fbb81dc,2);real(0x6fbb81e4,4)
integer(obj+0x90,vt+0x100);integer(obj+0x98,vt+0x100)
integer(vt+0xb8,stub+0x200);integer(vt+0x118,stub+0x220)
integer(vt+0xe4,stub+0x240);cpu.mem_write(stub+0x240,b'\xd9\xee\xc2\x10\x00')
integer(world+0x6c,target);real(world+0x4c,1100)
lead_cases=[]
for target_xy,target_velocity,expected in [([500,0],[0,0],[500,0]),([500,0],[100,0],[550,0]),([500,0],[-100,0],[458.3333333,0]),([500,0],[0,100],[500,45.64355]),([500,0],[1200,0],[239.130435,0]),([500,0],[1100,0],[500,0]),([0,0],[0,100],[0,0])]:
    position[:]=target_xy;velocity[:]=target_velocity
    run(0x6f6b5d20,obj,args=[world])
    lead_cases.append(dict(target=target_xy,velocity=target_velocity,landing=lead_events[-1]))
    assert all(abs(a-b)<.003 for a,b in zip(lead_events[-1],expected)),lead_cases[-1]
skip_primary_setup=True
for offset in [0xb8,0xc0,0xc8,0xd0]:integer(obj+offset,vt+0x100)
real(world+0x84,200);real(world+0x88,50);real(0x6fbed2b8,.0001)
extension_cases=[]
for start,target_xy,expected in [([0,0],[500,0],[750,0]),([0,0],[300,400],[450,600]),([100,200],[400,600],[550,800])]:
    real(world,start[0]);real(world+4,start[1]);position[:]=target_xy
    run(0x6f6b60d0,obj,args=[world])
    extension_cases.append(dict(start=start,target=target_xy,spillRadius=50,spillDistance=200,endpoint=extension_events[-1]))
    assert all(abs(a-b)<.02 for a,b in zip(extension_events[-1],expected)),extension_cases[-1]
run(0x6f0174e0,0)
interval=getreal(0x6fbed2b4)
assert abs(interval-.2)<1e-7
# Original source-link scheduling: default listener flags and supplied clock manager.
integer(query+0x30,target);integer(query+0x40,target);integer(query+0x4c,0x20190400);integer(query+0x1c,0)
real(query+0x44,interval);real(entries+0x40,123);integer(node+0x10,0)
run(0x6f10ad60,query)
assert len(schedule_events)==1 and abs(schedule_events[0]['deadline']-123.2)<1e-5,schedule_events
assert abs(schedule_events[0]['interval']-.2)<1e-7 and word(node+0x10)&1
# Original unit collision getter -> minimum-one clamp -> /32 -> spatial radius store.
bucket,row,nodes=0x1010000,0x1011000,0x1012000
integer(0x6fbec494,0);integer(0x6fbec48c,bucket);integer(bucket+8,row)
integer(row,7);integer(row+0x14,0x68666f6f);integer(obj+0x30,0x68666f6f)
integer(vt+0x168,0x6f656bc0);integer(vt+0x160,stub+0x300);integer(vt+0x164,stub+0x300)
collision_cases=[]
for collision in [0,16,32]:
    real(row+0x19c,collision);run(0x6f676e70,obj)
    native=getreal(target+0x90);assert native==max(collision,1)/32
    collision_cases.append(dict(tableCollision=collision,nativeSpatialRadius=native,worldRadius=native*32/100))
# Original grid-size initialization and original free-list head insertion for two spatial entries.
run(0x6f003410,0);grid_size=getreal(0x6fbc5fb8);assert grid_size==8
integer(query+0x3c,1);integer(query+0x28,data);integer(query+0x78,nodes);integer(query+0xac,0)
integer(data,0xffffff);integer(nodes,1);integer(nodes+8,0xffffff)
run(0x6f0fa140,query,args=[0,0,obj,0x1000000]);run(0x6f0fa140,query,args=[0,0,target,0x1000000])
head=word(data)&0xffffff;next_index=word(nodes+head*8)&0xffffff
assert head==1 and next_index==0 and word(nodes+head*8+4)==target and word(nodes+next_index*8+4)==obj
grid_case=dict(nativeCellSize=grid_size,originalCellSize=grid_size*32,worldCellSize=grid_size*32/100,insertionOrder=[hex(obj),hex(target)],enumerationOrder=[hex(target),hex(obj)])
report=dict(passed=True,binarySha256=sha,radiusCases=radius_cases,motionDispatch=events,overlapIdentityCases=dedup,attenuationEvents=damage_events,leadCases=lead_cases,extensionCases=extension_cases,listenerInterval=interval,initialListenerSchedule=schedule_events,unitCollisionCases=collision_cases,gridCase=grid_case,limitations=['Original x86 functions run in Unicorn, not a live Warcraft match.','Position access, motion creation, target-handle resolver and event registration are explicit callbacks; native motion ticking and full missile damage are not executed.','Unit collision row, hash resolver and native spatial handle are fixtures; original getter, minimum-one clamp, coordinate scaling and native radius store execute unchanged, but table parsing does not execute.','Overlap identity lookup is tested; complete listener delivery, re-entry and simultaneous event order are not CPU-tested.','Attenuation type predicate, acceptance filter, property setter and final damage sink are callbacks; original attenuation arithmetic and branch order execute unchanged.','Lead target-position/velocity, bounds and height accessors are supplied callbacks; original coefficient construction, root solver and landing arithmetic execute unchanged.','Original extension setup uses a target position fixture and supplied position/property sinks; its final launch call is suppressed after endpoint construction.','Initial listener flags are supplied from the observed constructor path; clock-manager lookup and queue insertion are callbacks. Original interval initialization, deadline arithmetic and periodic flag writes execute unchanged.','Grid free-list and cell bounds are fixtures; original two-node head insertion executes unchanged. Complete movement reinsertion history is not emulated.'])
output=root/'tmp/docs-artifacts/frost-human-aviary/rea/gameplay/cpu-results.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS: 6 radius, 2 dispatch, 3 identity, 3 attenuation, 7 lead, 3 extension, 3 collision mappings, listener interval/scheduling, grid initialization/head insertion')
