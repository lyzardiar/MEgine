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
group probe_destroyed_group=null
integer probe_group_calls=0
force probe_destroyed_force=null
integer probe_force_calls=0
boolean probe_force_valid=false
group probe_live_group=null
unit probe_old_member=null
unit probe_live_first=null
unit probe_live_second=null
force probe_live_force=null
boolean probe_live_group_valid=true
boolean probe_live_force_valid=true
integer probe_enemy_filter_calls=0
boolean probe_force_scope_valid=false
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
function ProbeDestroyedGroupFilter takes nothing returns boolean
    set probe_group_calls=probe_group_calls+1
    call DestroyGroup(probe_destroyed_group)
    return true
endfunction
function ProbeGroupAction takes nothing returns nothing
    call ExecuteFunc("GroupFailure_invalid_callback")
endfunction
function ProbeInvalidGroup takes real x, real y returns nothing
    local group g=CreateGroup()
    local rect r=Rect(x-128,y-128,x+128,y+128)
    local unit u=CreateUnit(Player(0),'hfoo',x,y,0)
    call GroupAddUnit(g,u)
    call ForGroup(null,function ProbeGroupAction)
    call GroupEnumUnitsInRect(null,null,null)
    call GroupEnumUnitsInRect(g,null,null)
    if FirstOfGroup(g)!=u then
        call ExecuteFunc("GroupFailure_invalid_rect_changed_group")
    endif
    set probe_destroyed_group=CreateGroup()
    call GroupEnumUnitsInRect(probe_destroyed_group,r,Filter(function ProbeDestroyedGroupFilter))
    call RemoveUnit(u)
    call DestroyGroup(g)
    call RemoveRect(r)
endfunction
function ProbeForceFilter takes nothing returns boolean
    set probe_force_calls=probe_force_calls+1
    call DestroyForce(probe_destroyed_force)
    return true
endfunction
function ProbeForceAction takes nothing returns nothing
    call ExecuteFunc("ForceFailure_invalid_callback")
endfunction
function ProbeInvalidForce takes nothing returns nothing
    local force f=CreateForce()
    local force dead=CreateForce()
    call ForceAddPlayer(f,Player(0))
    call DestroyForce(dead)
    call ForceAddPlayer(null,Player(0))
    call ForceRemovePlayer(dead,Player(0))
    call ForceClear(dead)
    call DestroyForce(dead)
    call ForceEnumPlayers(null,null)
    call ForceEnumAllies(f,null,null)
    call ForForce(null,function ProbeForceAction)
    set probe_force_valid=IsPlayerInForce(Player(0),f) and not IsPlayerInForce(null,f) and not IsPlayerInForce(Player(0),dead)
    set probe_destroyed_force=CreateForce()
    call ForceEnumPlayers(probe_destroyed_force,Filter(function ProbeForceFilter))
    call DestroyForce(f)
endfunction
function ProbeLiveGroupFilter takes nothing returns boolean
    if IsUnitInGroup(probe_old_member,probe_live_group) then
        set probe_live_group_valid=false
    endif
    if GetFilterUnit()==probe_live_second and not IsUnitInGroup(probe_live_first,probe_live_group) then
        set probe_live_group_valid=false
    endif
    return true
endfunction
function ProbeLiveForceFilter takes nothing returns boolean
    if IsPlayerInForce(Player(15),probe_live_force) then
        set probe_live_force_valid=false
    endif
    if GetFilterPlayer()==Player(1) and not IsPlayerInForce(Player(0),probe_live_force) then
        set probe_live_force_valid=false
    endif
    return true
endfunction
function ProbeLiveCollections takes real x, real y returns nothing
    local rect r=Rect(x-128,y-128,x+128,y+128)
    set probe_live_group=CreateGroup()
    set probe_old_member=CreateUnit(Player(0),'hfoo',x+512,y,0)
    set probe_live_first=CreateUnit(Player(0),'hfoo',x,y,0)
    set probe_live_second=CreateUnit(Player(0),'hfoo',x+32,y,0)
    call GroupAddUnit(probe_live_group,probe_old_member)
    call GroupEnumUnitsInRect(probe_live_group,r,Filter(function ProbeLiveGroupFilter))
    set probe_live_force=CreateForce()
    call ForceAddPlayer(probe_live_force,Player(15))
    call ForceEnumPlayersCounted(probe_live_force,Filter(function ProbeLiveForceFilter),2)
    call RemoveUnit(probe_old_member)
    call RemoveUnit(probe_live_first)
    call RemoveUnit(probe_live_second)
    call DestroyGroup(probe_live_group)
    call DestroyForce(probe_live_force)
    call RemoveRect(r)
endfunction
function ProbeAllianceFilter takes nothing returns boolean
    if GetFilterPlayer()==Player(1) then
        set probe_enemy_filter_calls=probe_enemy_filter_calls+1
    endif
    return true
endfunction
function ProbeForceScope takes nothing returns nothing
    local force f=CreateForce()
    call ForceEnumPlayers(f,null)
    set probe_force_scope_valid=not IsPlayerInForce(Player(12),f) and not IsPlayerInForce(Player(15),f)
    call ForceEnumPlayersCounted(f,null,-1)
    set probe_force_scope_valid=probe_force_scope_valid and IsPlayerInForce(Player(0),f) and IsPlayerInForce(Player(11),f)
    call ForceEnumPlayersCounted(f,null,0)
    set probe_force_scope_valid=probe_force_scope_valid and not IsPlayerInForce(Player(0),f)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call ForceEnumAllies(f,Player(0),Filter(function ProbeAllianceFilter))
    set probe_force_scope_valid=probe_force_scope_valid and not IsPlayerInForce(Player(1),f)
    call DestroyForce(f)
endfunction
function ProbeInvalidRects takes nothing returns nothing
    local rect dead=Rect(0,0,32,32)
    call RemoveRect(dead)
    call EnumItemsInRect(null,null,function ProbeForceAction)
    call EnumItemsInRect(dead,null,function ProbeForceAction)
    call EnumDestructablesInRect(null,null,function ProbeForceAction)
    call EnumDestructablesInRect(dead,null,function ProbeForceAction)
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
