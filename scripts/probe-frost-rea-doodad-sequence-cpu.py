"""Author: MiYu. Compare named Death selection and missing-sequence behavior with original x86 code."""
import hashlib
import importlib
import json
from pathlib import Path
import struct
import sys
from warcraft_doodads import named_sequence_index

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP

placement_clip=importlib.import_module('build-frost-original-doodads').placement_clip
binary=Path(sys.argv[1] if len(sys.argv)>1 else 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll')
raw=binary.read_bytes();digest=hashlib.sha256(raw).hexdigest()
assert digest=='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a'
pe=pefile.PE(data=raw);blob=pe.get_memory_mapped_image()
cpu=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_32)
cpu.mem_map(pe.OPTIONAL_HEADER.ImageBase,(len(blob)+4095)&~4095);cpu.mem_write(pe.OPTIONAL_HEADER.ImageBase,blob)
cpu.mem_map(0x1000000,0x10000)
model,names,stack,stop,query,loop_output,entity=[0x1000000+i*0x1000 for i in range(1,8)]
def word(address):return struct.unpack('<I',cpu.mem_read(address,4))[0]
def write(address,value):cpu.mem_write(address,struct.pack('<I',value&0xffffffff))
def string(address):return bytes(cpu.mem_read(address,128)).split(b'\0')[0].decode('ascii')
def returned(count,value=0):
    sp=cpu.reg_read(UC_X86_REG_ESP);cpu.reg_write(UC_X86_REG_EAX,value)
    cpu.reg_write(UC_X86_REG_EIP,word(sp));cpu.reg_write(UC_X86_REG_ESP,sp+4+count)

compare_call=0x6f6f1f95
assert bytes(cpu.mem_read(compare_call,1))==b'\xe8'
compare_target=compare_call+5+struct.unpack('<i',cpu.mem_read(compare_call+1,4))[0]
events=[];clips=[]
def external(uc,address,size,unused):
    sp=uc.reg_read(UC_X86_REG_ESP)
    if address==0x6f12f610:returned(0,len(clips))
    elif address==0x6f12f630:
        index=uc.reg_read(UC_X86_REG_EDX);assert 0<=index<len(clips)
        output=word(sp+4);cpu.mem_write(output,bytes(32))
        write(output+4,names+index*128);write(output+8,1000+index*137);write(output+24,index&1)
        returned(4)
    elif address==compare_target:
        assert word(sp+12)==0x7fffffff
        returned(12,int(string(word(sp+4)).lower()!=string(word(sp+8)).lower()))
    elif address in (0x6f12fa70,0x6f12f500):
        events.append(dict(action='select' if address==0x6f12fa70 else 'seek',clip=uc.reg_read(UC_X86_REG_EDX),value=word(sp+4)))
        returned(4)
cpu.hook_add(unicorn.UC_HOOK_CODE,external)
cpu.mem_write(query,b'death\0');write(entity+0x58,model)

fixtures=[[],[''],['Stand'],['Stand','Death Alternate'],['Death Alternate','Stand','dEaTh'],
    ['Death','DEATH'],['Stand','Death '],['Stand',' Death'],['Stand','Death1'],
    ['Stand','Undeath'],['Stand','death','Death Alternate'],['Death Alternate','Stand'],
    ['Stand','Death - 1'],['Stand','Death\t'],['','DEATH']]
cases=[]
for labels in fixtures:
    clips=[dict(name=name) for name in labels]
    for i,name in enumerate(labels):cpu.mem_write(names+i*128,name.encode('ascii')+b'\0')
    expected=named_sequence_index(clips,'death')
    for at_end in (False,True):
        for report_loop in (False,True):
            events.clear();write(loop_output,0xdeadbeef)
            for i,value in enumerate([stop,int(at_end),loop_output if report_loop else 0]):write(stack+i*4,value)
            cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,model);cpu.reg_write(UC_X86_REG_EDX,query)
            cpu.emu_start(0x6f6f1f50,stop,count=5000);assert cpu.reg_read(UC_X86_REG_EIP)==stop
            assert cpu.reg_read(UC_X86_REG_EAX)==int(expected is not None)
            expected_events=[] if expected is None else [dict(action='select',clip=expected,value=0),dict(action='seek',clip=expected,value=1000+expected*137 if at_end else 0)]
            assert events==expected_events,(labels,at_end,events)
            assert word(loop_output)==(int(not(expected&1)) if report_loop and expected is not None else 0xdeadbeef)
            cases.append(dict(names=labels,atEnd=at_end,reportLoop=report_loop,events=list(events)))
    # Run the actual terminal-death state transition, not only its helper.
    events.clear();write(entity+0x150,3)
    write(stack,stop);write(stack+4,entity);cpu.reg_write(UC_X86_REG_ESP,stack);cpu.reg_write(UC_X86_REG_ECX,0)
    cpu.emu_start(0x6f7592a0,stop,count=5000);assert cpu.reg_read(UC_X86_REG_EIP)==stop
    assert word(entity+0x150)==4
    assert events==([] if expected is None else [dict(action='select',clip=expected,value=0),dict(action='seek',clip=expected,value=1000+expected*137)])
    if clips:
        initial,initial_held=placement_clip(clips)
        selected,held=placement_clip(clips,True)
        assert not initial_held
        assert (selected,held)==((expected,True) if expected is not None else (initial,False))
    cases.append(dict(names=labels,state=word(entity+0x150),events=list(events)))

out=ROOT/'tmp/docs-artifacts/warcraft-map-tests/doodad-runtime';out.mkdir(parents=True,exist_ok=True)
report=dict(binarySha256=digest,passed=len(cases),cases=cases,entry='0x6f6f1f50',deathState='0x6f7592a0',
    limitations=['Model metadata, Storm case-insensitive comparison and model select/seek APIs are stubbed',
        'Executes source name scan and terminal-death branch; Stand variant choice, full creation and original rendering remain unverified'])
(out/'sequence-cpu.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
assert hashlib.sha256(binary.read_bytes()).hexdigest()==digest
print(f'PASS source named sequences: {len(cases)} cases; exact first match or unchanged playback, terminal death state retained')
