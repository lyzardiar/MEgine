"""Author: MiYu. Execute original animation-tag registration, Stand ranking and weighted selection."""
import hashlib
import json
import ctypes
from pathlib import Path
import random
import struct
import sys
from warcraft_doodads import ANIMATION_TAGS, stand_sequence_candidates, stand_sequence_index, sequence_weight, MsvcRandom

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_EBP, UC_X86_REG_EBX, UC_X86_REG_EDI, UC_X86_REG_XMM0, UC_X86_REG_XMM1

binary=Path(sys.argv[1] if len(sys.argv)>1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw=binary.read_bytes();digest=hashlib.sha256(raw).hexdigest()
assert digest=='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe=pefile.PE(data=raw);blob=pe.get_memory_mapped_image()
cpu=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_32)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase,(len(blob)+4095)&~4095);cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase,blob)
cpu.mem_map(0x1000000,0x40000)
model,names,stack,stop,query,table,requested,parsed,candidates=[0x1000000+i*0x2000 for i in range(1,10)]
def word(address):return struct.unpack('<I',cpu.mem_read(address,4))[0]
def write(address,value):cpu.mem_write(address,struct.pack('<I',value&0xffffffff))
def string(address):return bytes(cpu.mem_read(address,128)).split(b'\0')[0].decode('ascii')
def returned(count,value=0):
    sp=cpu.reg_read(UC_X86_REG_ESP);cpu.reg_write(UC_X86_REG_EAX,value&0xffffffff)
    cpu.reg_write(UC_X86_REG_EIP,word(sp));cpu.reg_write(UC_X86_REG_ESP,sp+4+count)
def run(entry,ecx=0,edx=0):
    write(stack,stop);cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,ecx);cpu.reg_write(UC_X86_REG_EDX,edx)
    cpu.emu_start(entry,stop,count=500000);assert cpu.reg_read(UC_X86_REG_EIP)==stop
    return cpu.reg_read(UC_X86_REG_EAX)

tags={};labels=[];normalized=[];draw=0
def external(uc,address,size,unused):
    sp=uc.reg_read(UC_X86_REG_ESP)
    if address==0x6f18e490:
        tags[string(uc.reg_read(UC_X86_REG_EDX))]=word(sp+4);returned(4)
    elif address==0x6f18e3e0:returned(0,tags.get(string(uc.reg_read(UC_X86_REG_EDX)).lower(),-1))
    elif address==0x6f12068e:
        # Storm token extraction is supplied here; source delimiter and capacity are checked.
        pointer,output,capacity,delimiter=word(sp+4),word(sp+8),word(sp+12),word(sp+16)
        assert string(delimiter)==' ' and capacity==32 and word(sp+20)==0
        start=word(pointer);text=string(start);leading=len(text)-len(text.lstrip(' '));text=text[leading:]
        token,separator,remaining=text.partition(' ')
        uc.mem_write(output,token[:capacity-1].encode('ascii')+b'\0')
        write(pointer,start+leading+len(token)+1 if separator else 0);returned(20)
    elif address==0x6f12f610:returned(0,len(labels))
    elif address==0x6f12f630:
        index=uc.reg_read(UC_X86_REG_EDX);assert index<len(labels)
        output=word(sp+4);uc.mem_write(output,bytes(32));write(output+4,names+index*128)
        uc.mem_write(output+16,struct.pack('<f',normalized[index]));returned(4)
    elif address==stop+16:returned(0,draw)
    elif address==0x6f771f98:
        a=struct.unpack('<d',struct.pack('<Q',uc.reg_read(UC_X86_REG_XMM0)&0xffffffffffffffff))[0]
        b=struct.unpack('<d',struct.pack('<Q',uc.reg_read(UC_X86_REG_XMM1)&0xffffffffffffffff))[0]
        uc.reg_write(UC_X86_REG_XMM0,struct.unpack('<Q',struct.pack('<d',a**b))[0]);returned(0)
cpu.hook_add(unicorn.UC_HOOK_CODE,external)
run(0x6f6a6f50)
assert frozenset(tags)==ANIMATION_TAGS and len(tags)==64
write(0x6fbed148,table);write(0x6fbeddf4,7)
for header,buffer in [(0x6fbeddf8,requested),(0x6fbedde4,parsed),(0x6fbede08,candidates)]:
    write(header,512);write(header+4,0);write(header+8,buffer);write(header+12,512)
cpu.mem_write(query,b'Stand\0')
write(0x6f94e414,stop+16)

def normalize(rarities):
    if not rarities:return []
    write(table,model);write(stack-4,len(rarities))
    for i,rarity in enumerate(rarities):cpu.mem_write(model+i*140+16,struct.pack('<f',rarity))
    cpu.reg_write(UC_X86_REG_EBP,stack);cpu.reg_write(UC_X86_REG_EBX,table);cpu.reg_write(UC_X86_REG_EDI,0);cpu.reg_write(UC_X86_REG_ESP,stack-256)
    cpu.emu_start(0x6f785330,0x6f785369,count=10000);assert cpu.reg_read(UC_X86_REG_EIP)==0x6f785369
    return [struct.unpack('<f',cpu.mem_read(model+i*140+16,4))[0] for i in range(len(rarities))]

rarity_cases=[]
for rarity in [-24.25,-4,-1,0,.25,.5,1,2,3,4,6,7,8,24,127,128,256]:
    weight=normalize([rarity])[0]
    expected=int(struct.unpack('<f',struct.pack('<f',weight*100))[0])
    assert sequence_weight(rarity)==expected
    rarity_cases.append(dict(rarity=rarity,normalized=weight,weight=expected))

fixtures=[[],[''],['Stand'],['Stand - 1','Stand'],['Stand Work','Stand Alternate','Stand'],
    ['Work Stand','Stand Work'],['StandWork','Death'],['Death','Unknown'],['Stand Stand','Stand'],
    ['sTaNd  - 2','Stand - 1','Stand Hit'],['Stand\tWork','Stand'],['Stand-1','Death','Stand'],
    ['Walk','Death'],['Stand Alternate','Stand Work Work'],['Stand Walk','Stand gold']]
rng=random.Random(127)
words=sorted(tags)+['-','1','2','Unknown','StandWork','Stand','Stand','Stand']
for _ in range(250):fixtures.append([' '.join(rng.choices(words,k=rng.randrange(0,6))) for _ in range(rng.randrange(1,20))])
ranking=[]
for labels in fixtures:
    rarities=[rng.choice([0,.25,1,2,4,8]) for _ in labels];normalized=normalize(rarities);draw=rng.randrange(32768)
    for i,name in enumerate(labels):cpu.mem_write(names+i*128,name.encode('ascii')+b'\0')
    selected=run(0x6f6f19f0,model,query)
    actual=[word(candidates+i*8) for i in range(word(0x6fbede0c))]
    clips=[dict(name=name,rarity=rarity) for name,rarity in zip(labels,rarities)]
    expected=stand_sequence_candidates(clips)
    assert actual==expected,(labels,actual,expected)
    assert [word(candidates+i*8+4) for i in range(len(actual))]==[sequence_weight(rarities[i]) for i in actual]
    choice=stand_sequence_index(clips,lambda:draw)
    assert selected==(0xffffffff if choice is None else choice),(clips,selected,choice)
    ranking.append(dict(names=labels,rarities=rarities,candidates=actual,selected=choice,rand=draw))

# Exercise the real weighted chooser and range conversion separately, including SSE/tail accumulation.
weighted=[]
for weights in [[],[0],[1],[100],[0,0],[0,100],[100,0],[25,75],[0,0,100],list(range(8)),list(range(9)),[7]*17]:
    write(0x6fbede0c,len(weights))
    for i,weight in enumerate(weights):write(candidates+i*8,i+10);write(candidates+i*8+4,weight)
    for draw in (0,1,7,99,32767):
        selected=run(0x6f7011a0,0x6fbede08,0)
        total=sum(weights);roll=1 if total<=1 else 1+draw%(total-1)
        cumulative=0;expected=0
        for i,weight in enumerate(weights):
            cumulative+=weight
            if roll<=cumulative:expected=i+10;break
        assert selected==expected,(weights,draw,selected,expected)
        weighted.append(dict(weights=weights,rand=draw,roll=roll,selected=selected))

# Compare the preview's stream with the installed MSVCR120 C runtime in this process.
runtime=Path('C:/Windows/System32/msvcr120.dll');crt=ctypes.CDLL(str(runtime));crt.srand.argtypes=[ctypes.c_uint];crt.rand.restype=ctypes.c_int
random_cases=0
for seed in (0,1,127,0xffffffff):
    crt.srand(seed);stream=MsvcRandom(seed)
    for _ in range(64):assert stream()==crt.rand();random_cases+=1

out=ROOT/'tmp/docs-artifacts/warcraft-map-tests/doodad-runtime';out.mkdir(parents=True,exist_ok=True)
report=dict(binarySha256=digest,registeredTags=tags,rankingPassed=len(ranking),weightedPassed=len(weighted),rarityPassed=len(rarity_cases),randomPassed=random_cases,ranking=ranking,weighted=weighted,rarities=rarity_cases,
    randomRuntime=dict(path=str(runtime),sha256=hashlib.sha256(runtime.read_bytes()).hexdigest()),
    entry='0x6f6f19f0',registration='0x6f6a6f50',weightedSelection='0x6f7011a0',randomRange='0x6f704ee0',
    limitations=['Storm token extraction, dictionary storage/lookup, model metadata, pow and rand values are supplied by the fixture',
        'Source rarity normalization, registration, ranking, array matching, weight accumulation and range arithmetic execute as machine code',
        'MSVCR120 stream check uses the installed native DLL; original process RNG initialization/call order, animation scheduling and rendering remain unverified'])
(out/'stand-cpu.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
assert hashlib.sha256(binary.read_bytes()).hexdigest()==digest
print(f'PASS source Stand: {len(tags)} tags, {len(ranking)} selections, {len(weighted)} weighted/range cases, {len(rarity_cases)} rarities, {random_cases} native C rand draws')
