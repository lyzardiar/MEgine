"""Author: MiYu. Construction lifecycle consumers on read-only copies of original map geometry."""
import argparse
import importlib.util
import io
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SCRIPT = '''globals
integer probe_started=0
integer probe_cancelled=0
integer probe_finished=0
unit probe_structure=null
unit probe_upgrade=null
integer probe_upgrade_started=0
integer probe_upgrade_cancelled=0
integer probe_upgrade_finished=0
endglobals
function ProbeStart takes nothing returns nothing
    set probe_started=probe_started+1
    set probe_structure=GetConstructingStructure()
endfunction
function ProbeCancel takes nothing returns nothing
    if GetCancelledStructure()!=probe_structure then
        call ExecuteFunc("ConstructionFailure_cancel_context")
    endif
    set probe_cancelled=probe_cancelled+1
endfunction
function ProbeFinish takes nothing returns nothing
    if GetConstructedStructure()!=probe_structure then
        call ExecuteFunc("ConstructionFailure_finish_context")
    endif
    set probe_finished=probe_finished+1
endfunction
function ProbeUpgradeStart takes nothing returns nothing
    set probe_upgrade=GetTriggerUnit()
    set probe_upgrade_started=probe_upgrade_started+1
endfunction
function ProbeUpgradeCancel takes nothing returns nothing
    if GetTriggerUnit()!=probe_upgrade then
        call ExecuteFunc("ConstructionFailure_upgrade_cancel_context")
    endif
    set probe_upgrade_cancelled=probe_upgrade_cancelled+1
endfunction
function ProbeUpgradeFinish takes nothing returns nothing
    if GetTriggerUnit()!=probe_upgrade then
        call ExecuteFunc("ConstructionFailure_upgrade_finish_context")
    endif
    set probe_upgrade_finished=probe_upgrade_finished+1
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_CONSTRUCT_START,null)
    call TriggerAddAction(t,function ProbeStart)
    set t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_CONSTRUCT_CANCEL,null)
    call TriggerAddAction(t,function ProbeCancel)
    set t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_CONSTRUCT_FINISH,null)
    call TriggerAddAction(t,function ProbeFinish)
    set t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_UPGRADE_START,null)
    call TriggerAddAction(t,function ProbeUpgradeStart)
    set t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_UPGRADE_CANCEL,null)
    call TriggerAddAction(t,function ProbeUpgradeCancel)
    set t=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_UPGRADE_FINISH,null)
    call TriggerAddAction(t,function ProbeUpgradeFinish)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/construction/fixture.w3m')
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
