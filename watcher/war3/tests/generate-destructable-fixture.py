"""Author: MiYu. Isolated widget event and lumber consumers on copied original terrain."""
import argparse
import importlib.util
import io
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SCRIPT = '''globals
destructable probe_tree=null
integer probe_deaths=0
integer probe_enumerated=0
item probe_item=null
item probe_nested_item=null
rect probe_nested_rect=null
integer probe_items=0
integer probe_nested_items=0
item probe_transfer_first=null
item probe_transfer_second=null
unit probe_carrier=null
integer probe_transfer_count=0
boolean probe_transfer_ok=false
unit probe_first=null
unit probe_second=null
boolean probe_group_valid=false
endglobals
function ProbeDeath takes nothing returns nothing
    if GetTriggerDestructable()!=probe_tree or GetTriggerWidget()!=probe_tree then
        call ExecuteFunc("DestructableFailure_death_context")
    endif
    set probe_deaths=probe_deaths+1
endfunction
function ProbeWatch takes destructable d returns nothing
    local trigger t=CreateTrigger()
    set probe_tree=d
    call TriggerRegisterDeathEvent(t,d)
    call TriggerAddAction(t,function ProbeDeath)
endfunction
function ProbeFilter takes nothing returns boolean
    if GetEnumDestructable()!=null then
        call ExecuteFunc("DestructableFailure_filter_enum_context")
    endif
    return GetFilterDestructable()==probe_tree
endfunction
function ProbeEnumerated takes nothing returns nothing
    if GetEnumDestructable()!=probe_tree or GetFilterDestructable()!=null then
        call ExecuteFunc("DestructableFailure_enum_context")
    endif
    set probe_enumerated=probe_enumerated+1
endfunction
function ProbeEnumerate takes real x, real y returns nothing
    local rect r=Rect(x-128,y-128,x+128,y+128)
    call EnumDestructablesInRect(r,Filter(function ProbeFilter),function ProbeEnumerated)
    call RemoveRect(r)
endfunction
function ProbeItemFilter takes nothing returns boolean
    if GetEnumItem()!=null then
        call ExecuteFunc("ItemFailure_filter_enum_context")
    endif
    return GetFilterItem()==probe_item
endfunction
function ProbeNestedItemFilter takes nothing returns boolean
    if GetEnumItem()!=probe_item then
        call ExecuteFunc("ItemFailure_nested_filter_context")
    endif
    return GetFilterItem()==probe_nested_item
endfunction
function ProbeNestedItemAction takes nothing returns nothing
    if GetEnumItem()!=probe_nested_item or GetFilterItem()!=null then
        call ExecuteFunc("ItemFailure_nested_enum_context")
    endif
    set probe_nested_items=probe_nested_items+1
endfunction
function ProbeItemAction takes nothing returns nothing
    if GetEnumItem()!=probe_item or GetFilterItem()!=null then
        call ExecuteFunc("ItemFailure_enum_context")
    endif
    call EnumItemsInRect(probe_nested_rect,Filter(function ProbeNestedItemFilter),function ProbeNestedItemAction)
    if GetEnumItem()!=probe_item or GetFilterItem()!=null then
        call ExecuteFunc("ItemFailure_outer_context_restoration")
    endif
    set probe_items=probe_items+1
endfunction
function ProbeItemEnumerate takes real x, real y returns nothing
    local rect r=Rect(x-128,y-128,x+128,y+128)
    set probe_item=CreateItem('rat6',x,y)
    set probe_nested_item=CreateItem('rat6',x+32,y)
    set probe_nested_rect=r
    call EnumItemsInRect(r,Filter(function ProbeItemFilter),function ProbeItemAction)
    set probe_nested_rect=null
    call RemoveItem(probe_item)
    call RemoveItem(probe_nested_item)
    call RemoveRect(r)
endfunction
function ProbeTransferFilter takes nothing returns boolean
    if GetFilterItem()==probe_transfer_first then
        set probe_transfer_ok=UnitAddItem(probe_carrier,probe_transfer_second)
    endif
    return true
endfunction
function ProbeTransferAction takes nothing returns nothing
    set probe_transfer_count=probe_transfer_count+1
endfunction
function ProbeTransferEnumerate takes real x, real y returns nothing
    local rect r=Rect(x-128,y-128,x+128,y+128)
    set probe_carrier=CreateUnit(Player(0),'Hpal',x,y,0)
    set probe_transfer_first=CreateItem('rat6',x,y)
    set probe_transfer_second=CreateItem('rat6',x+32,y)
    call EnumItemsInRect(r,Filter(function ProbeTransferFilter),function ProbeTransferAction)
    call RemoveItem(probe_transfer_first)
    call RemoveItem(probe_transfer_second)
    call RemoveUnit(probe_carrier)
    call RemoveRect(r)
endfunction
function ProbeGroupFilter takes nothing returns boolean
    if GetFilterUnit()==probe_second then
        call RemoveUnit(probe_first)
    endif
    return true
endfunction
function ProbeGroupEnumerate takes real x, real y returns nothing
    local group g=CreateGroup()
    local rect r=Rect(x-128,y-128,x+128,y+128)
    set probe_first=CreateUnit(Player(0),'hfoo',x,y,0)
    set probe_second=CreateUnit(Player(0),'hfoo',x+32,y,0)
    call GroupEnumUnitsInRect(g,r,Filter(function ProbeGroupFilter))
    set probe_group_valid=FirstOfGroup(g)==probe_second and not IsUnitInGroup(probe_first,g)
    call RemoveUnit(probe_second)
    call DestroyGroup(g)
    call RemoveRect(r)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/destructables/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
