"""Author: MiYu. Match, dialog and input consumers on a read-only copy of original BootyBay geometry."""
import argparse
import importlib.util
import io
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
SCRIPT = '''globals
dialog probe_dialog=null
button probe_button=null
integer probe_dialog_events=0
integer probe_button_events=0
integer probe_victory_events=0
integer probe_leave_events=0
dialog probe_end_dialog=null
button probe_end_button=null
unit probe_filter_unit=null
integer probe_filter_calls=0
integer probe_filter_events=0
integer probe_filter_denied_events=0
endglobals
function ProbeUnitFilter takes nothing returns boolean
    set probe_filter_calls=probe_filter_calls+1
    return GetFilterUnit()==probe_filter_unit and GetTriggerUnit()==probe_filter_unit
endfunction
function ProbeUnitDeny takes nothing returns boolean
    return false
endfunction
function ProbeFilteredEvent takes nothing returns nothing
    if GetTriggerUnit()!=probe_filter_unit or GetTriggerEventId()!=EVENT_UNIT_DEATH then
        call ExecuteFunc("MatchFailure_unit_filter_context")
    endif
    set probe_filter_events=probe_filter_events+1
endfunction
function ProbeDeniedEvent takes nothing returns nothing
    set probe_filter_denied_events=probe_filter_denied_events+1
endfunction
function ProbeFilterUnitSetup takes unit whichUnit returns nothing
    local trigger t=CreateTrigger()
    set probe_filter_unit=whichUnit
    call TriggerRegisterFilterUnitEvent(t,whichUnit,EVENT_UNIT_DEATH,Filter(function ProbeUnitFilter))
    call TriggerAddAction(t,function ProbeFilteredEvent)
    set t=CreateTrigger()
    call TriggerRegisterFilterUnitEvent(t,whichUnit,EVENT_UNIT_DEATH,Filter(function ProbeUnitDeny))
    call TriggerAddAction(t,function ProbeDeniedEvent)
endfunction
function ProbeDialogEvent takes nothing returns nothing
    if GetClickedDialog()!=probe_dialog or GetClickedButton()!=probe_button or GetTriggerPlayer()!=Player(0) then
        call ExecuteFunc("MatchFailure_dialog_context")
    endif
    set probe_dialog_events=probe_dialog_events+1
endfunction
function ProbeButtonEvent takes nothing returns nothing
    set probe_button_events=probe_button_events+1
    call DialogDestroy(probe_dialog)
    if GetClickedButton()!=probe_button then
        call ExecuteFunc("MatchFailure_destroyed_context")
    endif
endfunction
function ProbeVictory takes nothing returns nothing
    if GetTriggerPlayer()!=Player(0) or GetTriggerEventId()!=EVENT_PLAYER_VICTORY then
        call ExecuteFunc("MatchFailure_player_context")
    endif
    set probe_victory_events=probe_victory_events+1
    call RemovePlayer(Player(0),PLAYER_GAME_RESULT_VICTORY)
endfunction
function ProbeLeave takes nothing returns nothing
    set probe_leave_events=probe_leave_events+1
endfunction
function ProbeDialog takes nothing returns nothing
    local trigger t=CreateTrigger()
    set probe_dialog=DialogCreate()
    call DialogSetMessage(probe_dialog,"Match dialog")
    set probe_button=DialogAddButton(probe_dialog,"Continue",67)
    call TriggerRegisterDialogEvent(t,probe_dialog)
    call TriggerAddAction(t,function ProbeDialogEvent)
    set t=CreateTrigger()
    call TriggerRegisterDialogButtonEvent(t,probe_button)
    call TriggerAddAction(t,function ProbeButtonEvent)
    call DialogDisplay(Player(0),probe_dialog,true)
endfunction
function ProbeEndDialogEvent takes nothing returns nothing
    call EndGame(true)
endfunction
function ProbeEndDialog takes nothing returns nothing
    local trigger t=CreateTrigger()
    set probe_end_dialog=DialogCreate()
    set probe_end_button=DialogAddQuitButton(probe_end_dialog,false,"End",69)
    call TriggerRegisterDialogButtonEvent(t,probe_end_button)
    call TriggerAddAction(t,function ProbeEndDialogEvent)
    call DialogDisplay(Player(0),probe_end_dialog,true)
endfunction
function ProbeLocalEnd takes nothing returns nothing
    if GetLocalPlayer()==Player(1) then
        call EndGame(false)
    endif
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterPlayerEvent(t,Player(0),EVENT_PLAYER_VICTORY)
    call TriggerAddAction(t,function ProbeVictory)
    set t=CreateTrigger()
    call TriggerRegisterPlayerEvent(t,Player(0),EVENT_PLAYER_LEAVE)
    call TriggerAddAction(t,function ProbeLeave)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/game-flow/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {n: fixture.read_archive(archive, n) for n in names if n and n != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
