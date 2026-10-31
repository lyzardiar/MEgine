"""Author: MiYu. Isolated source map geometry with deterministic boundary inputs for stage passive checks."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('channel_fixture', Path(__file__).with_name('generate-channel-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=fixture.fixture.ROOT/'tmp/docs-artifacts/war3/auras-passives/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    helper = fixture.fixture.fixture
    archive = helper.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = helper.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: helper.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = b"""globals
integer timerIndexTrace=0
boolean timerIndexAdded=false
timer timerIndexMain=null
timer timerIndexOther=null
trigger timerIndexB=null
trigger timerIndexD=null
trigger timerIndexE=null
integer eventIndexTrace=0
boolean eventIndexAdded=false
trigger eventIndexA=null
trigger eventIndexB=null
trigger eventIndexC=null
trigger eventIndexD=null
trigger eventIndexE=null
unit eventIndexUnit=null
integer pawnCount=0
unit pawnSeller=null
unit pawnBuyer=null
item pawnSold=null
endglobals
function TimerIndexA takes nothing returns nothing
    if GetExpiredTimer()==timerIndexMain then
        set timerIndexTrace=timerIndexTrace*10+1
    endif
endfunction
function TimerIndexB takes nothing returns nothing
    set timerIndexTrace=timerIndexTrace*10+2
endfunction
function TimerIndexC takes nothing returns nothing
    set timerIndexTrace=timerIndexTrace*10+3
endfunction
function TimerIndexD takes nothing returns nothing
    if GetExpiredTimer()==timerIndexMain then
        set timerIndexTrace=timerIndexTrace*10+4
    endif
endfunction
function TimerIndexE takes nothing returns nothing
    set timerIndexTrace=timerIndexTrace*10+5
endfunction
function TimerIndexOther takes nothing returns nothing
    set timerIndexTrace=timerIndexTrace*10+9
endfunction
function TimerIndexCallback takes nothing returns nothing
    if GetExpiredTimer()==timerIndexMain then
        set timerIndexTrace=timerIndexTrace*10+8
    endif
    if not timerIndexAdded then
        set timerIndexAdded=true
        call DestroyTrigger(timerIndexB)
        call TriggerRegisterTimerExpireEvent(timerIndexD,timerIndexMain)
        call TriggerRegisterTimerEvent(timerIndexE,0.,false)
        call PauseTimer(timerIndexOther)
    endif
endfunction
function ProbeTimerIndex takes nothing returns nothing
    local trigger a=CreateTrigger()
    local trigger c=CreateTrigger()
    set timerIndexB=CreateTrigger()
    set timerIndexD=CreateTrigger()
    set timerIndexE=CreateTrigger()
    set timerIndexMain=CreateTimer()
    set timerIndexOther=CreateTimer()
    call TriggerAddAction(a,function TimerIndexA)
    call TriggerAddAction(timerIndexB,function TimerIndexB)
    call TriggerAddAction(c,function TimerIndexC)
    call TriggerAddAction(timerIndexD,function TimerIndexD)
    call TriggerAddAction(timerIndexE,function TimerIndexE)
    call TriggerRegisterTimerExpireEvent(a,timerIndexMain)
    call TriggerRegisterTimerExpireEvent(timerIndexB,timerIndexMain)
    call TriggerRegisterTimerEvent(c,0.,false)
    call TimerStart(timerIndexMain,0.,false,function TimerIndexCallback)
    call TimerStart(timerIndexOther,0.,false,function TimerIndexOther)
endfunction
function RestartTimerIndex takes nothing returns nothing
    set timerIndexTrace=0
    call TimerStart(timerIndexMain,0.,false,function TimerIndexCallback)
endfunction
function EventIndexE takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+5
endfunction
function EventIndexA takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+1
    if not eventIndexAdded then
        set eventIndexAdded=true
        call DestroyTrigger(eventIndexD)
        call TriggerRegisterUnitEvent(eventIndexE,eventIndexUnit,EVENT_UNIT_ISSUED_POINT_ORDER)
    endif
endfunction
function EventIndexB takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+2
endfunction
function EventIndexC takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+3
endfunction
function EventIndexD takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+4
endfunction
function EventIndexFilter takes nothing returns boolean
    return GetFilterUnit()==eventIndexUnit
endfunction
function ProbeEventIndex takes unit u returns nothing
    set eventIndexUnit=u
    set eventIndexA=CreateTrigger()
    set eventIndexB=CreateTrigger()
    set eventIndexC=CreateTrigger()
    set eventIndexD=CreateTrigger()
    set eventIndexE=CreateTrigger()
    call TriggerAddAction(eventIndexA,function EventIndexA)
    call TriggerAddAction(eventIndexB,function EventIndexB)
    call TriggerAddAction(eventIndexC,function EventIndexC)
    call TriggerAddAction(eventIndexD,function EventIndexD)
    call TriggerAddAction(eventIndexE,function EventIndexE)
    call TriggerRegisterPlayerUnitEvent(eventIndexA,Player(0),EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER,null)
    call TriggerRegisterFilterUnitEvent(eventIndexB,u,EVENT_UNIT_ISSUED_POINT_ORDER,Filter(function EventIndexFilter))
    call TriggerRegisterPlayerUnitEvent(eventIndexC,Player(0),EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER,null)
    call TriggerRegisterUnitEvent(eventIndexD,u,EVENT_UNIT_ISSUED_POINT_ORDER)
endfunction
function EventIndexSix takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+6
endfunction
function EventIndexSeven takes nothing returns nothing
    set eventIndexTrace=eventIndexTrace*10+7
endfunction
function ProbeSelectionIndex takes unit u returns nothing
    local trigger p=CreateTrigger()
    local trigger t=CreateTrigger()
    call TriggerAddAction(p,function EventIndexSix)
    call TriggerAddAction(t,function EventIndexSeven)
    call TriggerRegisterPlayerUnitEvent(p,Player(0),EVENT_PLAYER_UNIT_SELECTED,null)
    call TriggerRegisterUnitEvent(t,u,EVENT_UNIT_SELECTED)
endfunction
function ProbeSummonIndex takes unit u returns nothing
    local trigger p=CreateTrigger()
    local trigger t=CreateTrigger()
    call TriggerAddAction(p,function EventIndexSix)
    call TriggerAddAction(t,function EventIndexSeven)
    call TriggerRegisterPlayerUnitEvent(p,Player(0),EVENT_PLAYER_UNIT_SUMMON,null)
    call TriggerRegisterUnitEvent(t,u,EVENT_UNIT_SUMMON)
endfunction
function EventIndexDamage takes nothing returns nothing
    if GetEventDamage()>0. then
        set eventIndexTrace=eventIndexTrace*10+8
    endif
endfunction
function EventIndexTarget takes nothing returns nothing
    if GetEventTargetUnit()!=null then
        set eventIndexTrace=eventIndexTrace*10+9
    endif
endfunction
function ProbeCombatIndex takes unit attacker,unit target returns nothing
    local trigger d=CreateTrigger()
    local trigger t=CreateTrigger()
    call TriggerAddAction(d,function EventIndexDamage)
    call TriggerAddAction(t,function EventIndexTarget)
    call TriggerRegisterUnitEvent(d,target,EVENT_UNIT_DAMAGED)
    call TriggerRegisterUnitEvent(t,attacker,EVENT_UNIT_ACQUIRED_TARGET)
endfunction
function ResetEventIndex takes nothing returns nothing
    set eventIndexTrace=0
endfunction
function DestroyEventIndex takes nothing returns nothing
    call DestroyTrigger(eventIndexA)
    call DestroyTrigger(eventIndexB)
    call DestroyTrigger(eventIndexC)
    call DestroyTrigger(eventIndexE)
endfunction
function OnPawn takes nothing returns nothing
    set pawnCount=pawnCount+1
    set pawnSeller=GetSellingUnit()
    set pawnBuyer=GetBuyingUnit()
    set pawnSold=GetSoldItem()
endfunction
function InstallPawnTest takes unit seller returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,seller,EVENT_UNIT_PAWN_ITEM)
    call TriggerAddAction(t,function OnPawn)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
"""
    records = []
    for base, marker, changes in [
        (b'Aall', b'A0AL', [('Neu1', 2, 720., 1)]),
        (b'AOcr', b'A0CR', [('Ocr1', 2, 100., 1), ('Ocr2', 2, 2., 2)]),
        (b'AOcr', b'A0NM', [('Ocr1', 2, 100., 1), ('Ocr2', 2, 2., 2), ('Ocr5', 0, 1, 5)]),
        (b'AEev', b'A0EV', [('Eev1', 2, 1., 1)]),
        (b'AHbh', b'A0BH', [('Hbh1', 2, 100., 1)]),
        (b'AUau', b'A0PL', [('atar', 3, 'air,ground,invulnerable,player,vulnerable', 0)]),
        (b'Aasl', b'A0SL', [('Slo1', 2, .2, 1), ('atar', 3, 'self', 0), ('aare', 2, 0., 0)]),
        (b'Aspb', b'A0PB', [('spb1', 3, 'A0SL', 1), ('spb3', 0, 1, 3), ('spb4', 0, 1, 4)])
    ]:
        records.append(base+marker+struct.pack('<I', len(changes))+b''.join(fixture.modification(field, kind, value, slot, marker) for field, kind, value, slot in changes))
    files['war3map.w3a'] = struct.pack('<III', 2, 0, len(records))+b''.join(records)
    sight_item = b'rat6' + b'I0SI' + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + b'AIsi\0' + b'I0SI'
    ethereal_item = b'rat6' + b'I0ET' + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + b'Aetl\0' + b'I0ET'
    drop_item = b'phea' + b'I0DR' + struct.pack('<I', 1) + b'idrp' + struct.pack('<II', 0, 1) + b'I0DR'
    keep_flag = b'flag' + b'I0ND' + struct.pack('<I', 1) + b'idrp' + struct.pack('<II', 0, 0) + b'I0ND'
    files['war3map.w3t'] = struct.pack('<III', 2, 0, 4) + sight_item + ethereal_item + drop_item + keep_flag
    units = [(b'hpea', b'z0u1', b'uwu2'), (b'hfoo', b'z0u2', b'uwu1')]
    files['war3map.w3u'] = struct.pack('<III', 2, 0, len(units))+b''.join(base+custom+struct.pack('<I', 1)+field+struct.pack('<II', 0, 0)+custom for base, custom, field in units)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+helper.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
