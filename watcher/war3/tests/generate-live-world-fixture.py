"""Author: MiYu. Add delayed native-consumer probes to a copy of original BootyBay; keep all generated maps in tmp."""
import argparse
import hashlib
import io
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from warcraft_mpq import mpyq, read_archive
from warcraft_mpq_writer import build_archive

GLOBALS = '''
unit native_probe_unit=null
item native_probe_item=null
integer native_probe_stage=0
integer native_probe_enter=0
integer native_probe_items=0
'''
FUNCTIONS = '''
function NativeProbeAssert takes boolean ok, string label returns nothing
    if not ok then
        call ExecuteFunc("NativeProbeFailure_"+label)
    endif
endfunction
function NativeProbeItem takes nothing returns nothing
    if GetManipulatedItem()==native_probe_item then
        set native_probe_items=native_probe_items+1
    endif
endfunction
function NativeProbeEnter takes nothing returns nothing
    if GetEnteringUnit()==native_probe_unit then
        call NativeProbeAssert(IsUnitInRegion(GetTriggeringRegion(),native_probe_unit),"region_membership")
        set native_probe_enter=native_probe_enter+1
    endif
endfunction
function NativeProbeSpawn takes nothing returns nothing
    local real x=GetStartLocationX(0)+128
    local real y=GetStartLocationY(0)+128
    local fogmodifier f
    local rect fogRect=Rect(x-256,y-256,x+256,y+256)
    local location fogLoc=Location(x,y)
    local hashtable h=InitHashtable()
    local gamecache c=InitGameCache("native-probe.w3v")
    set native_probe_unit=CreateUnit(Player(0),'ogru',x,y,90)
    call SetUnitColor(native_probe_unit,ConvertPlayerColor(1))
    call SetUnitVertexColor(native_probe_unit,180,255,200,128)
    call SetUnitScale(native_probe_unit,0.8,0.9,1.1)
    call SetUnitFlyHeight(native_probe_unit,192,192)
    call SetUnitTimeScale(native_probe_unit,1.5)
    call SetUnitAnimation(native_probe_unit,"walk")
    call QueueUnitAnimation(native_probe_unit,"attack")
    call UnitAddAbility(native_probe_unit,'AInv')
    set native_probe_item=CreateItem('ratf',x,y)
    call NativeProbeAssert(UnitAddItem(native_probe_unit,native_probe_item),"pickup")
    call NativeProbeAssert(UnitItemInSlot(native_probe_unit,0)==native_probe_item,"inventory_slot")
    call UnitRemoveItem(native_probe_unit,native_probe_item)
    call NativeProbeAssert(UnitAddItem(native_probe_unit,native_probe_item),"repickup")
    call SaveInteger(h,1,2,317)
    call SaveUnitHandle(h,1,3,native_probe_unit)
    call NativeProbeAssert(LoadInteger(h,1,2)==317,"hashtable_integer")
    call NativeProbeAssert(LoadUnitHandle(h,1,3)==native_probe_unit,"hashtable_unit")
    call SaveWidgetHandle(h,1,3,native_probe_unit)
    call NativeProbeAssert(LoadUnitHandle(h,1,3)==native_probe_unit,"hashtable_widget")
    call FlushChildHashtable(h,1)
    call NativeProbeAssert(not HaveSavedInteger(h,1,2),"hashtable_flush")
    call StoreInteger(c,"probe","v",41)
    call StoreString(c,"probe","s","ready")
    call NativeProbeAssert(GetStoredInteger(c,"probe","v")==41,"cache_integer")
    call NativeProbeAssert(GetStoredString(c,"probe","s")=="ready","cache_string")
    set f=CreateFogModifierRadius(Player(0),FOG_OF_WAR_MASKED,x,y,256,false,true)
    call FogModifierStart(f)
    call NativeProbeAssert(IsMaskedToPlayer(x,y,Player(0)),"fog_masked")
    call FogModifierStop(f)
    call NativeProbeAssert(IsVisibleToPlayer(x,y,Player(0)),"unit_vision")
    call DestroyFogModifier(f)
    call SetFogStateRect(Player(0),FOG_OF_WAR_MASKED,fogRect,false)
    call NativeProbeAssert(IsMaskedToPlayer(x,y,Player(0)),"set_fog_rect_masked")
    call SetFogStateRadius(Player(0),FOG_OF_WAR_VISIBLE,x,y,192,false)
    call NativeProbeAssert(IsVisibleToPlayer(x,y,Player(0)),"set_fog_radius_visible")
    call SetFogStateRadiusLoc(Player(0),FOG_OF_WAR_FOGGED,fogLoc,192,false)
    call NativeProbeAssert(IsFoggedToPlayer(x,y,Player(0)),"set_fog_location_fogged")
    call RemoveLocation(fogLoc)
    call RemoveRect(fogRect)
    call SetCameraPosition(x,y)
    call DisplayTimedTextToPlayer(Player(0),0,0,10,"Native world probe: inventory and fog ready")
    set native_probe_stage=1
endfunction
function NativeProbeFinish takes nothing returns nothing
    call NativeProbeAssert(native_probe_stage==1,"timer_callback")
    call NativeProbeAssert(native_probe_enter==1,"region_enter")
    call NativeProbeAssert(native_probe_items==3,"item_events")
    call NativeProbeAssert(GetUnitFlyHeight(native_probe_unit)>0,"height_rate")
    set native_probe_stage=2
endfunction
function NativeProbeBegin takes nothing returns nothing
    local trigger t=CreateTrigger()
    local region r=CreateRegion()
    local rect area=Rect(GetStartLocationX(0)+32,GetStartLocationY(0)+32,GetStartLocationX(0)+224,GetStartLocationY(0)+224)
    call RegionAddRect(r,area)
    call TriggerRegisterEnterRegion(t,r,null)
    call TriggerAddAction(t,function NativeProbeEnter)
    set t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_PICKUP_ITEM,null)
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_DROP_ITEM,null)
    call TriggerAddAction(t,function NativeProbeItem)
    call TimerStart(CreateTimer(),0.5,false,function NativeProbeSpawn)
    call TimerStart(CreateTimer(),1.0,false,function NativeProbeFinish)
endfunction
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/live-world-fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    source = args.data_root/'Maps/(2)BootyBay.w3m'
    original = source.read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: read_archive(archive, name) for name in names if name and name != '(listfile)'}
    script = files['war3map.j'].decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
    script = script.replace('globals\n', 'globals\n'+GLOBALS, 1)
    main_function = re.search(r'(?ms)^function main\s+takes.*?^endfunction', script)
    if not main_function:
        raise ValueError('Original BootyBay main not found')
    start, end = main_function.span()
    body = script[start:end].replace('endfunction', 'call NativeProbeBegin()\nendfunction')
    files['war3map.j'] = (script[:start]+FUNCTIONS+body+script[end:]).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+build_archive(files))
    if source.read_bytes() != original:
        raise ValueError('Original map changed')
    print('fixture='+str(args.output.resolve()))
    print('source_sha256='+hashlib.sha256(original).hexdigest())

if __name__ == '__main__':
    main()
