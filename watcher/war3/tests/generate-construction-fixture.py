"""Author: MiYu. Construction lifecycle consumers on read-only copies of original map geometry."""
import argparse
import importlib.util
import io
import pathlib
import struct

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
unit probe_repair_worker=null
unit probe_repair_target=null
integer probe_repair_reissued=0
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
function ProbeRepairPayment takes nothing returns nothing
    if probe_repair_reissued==0 then
        set probe_repair_reissued=1
        call IssueTargetOrderById(probe_repair_worker,852024,probe_repair_target)
    endif
endfunction
function ProbeRepairSetup takes unit worker, unit target returns nothing
    local trigger t=CreateTrigger()
    set probe_repair_worker=worker
    set probe_repair_target=target
    set probe_repair_reissued=0
    call TriggerRegisterPlayerStateEvent(t,Player(0),PLAYER_STATE_RESOURCE_GOLD,LESS_THAN,100.0)
    call TriggerAddAction(t,function ProbeRepairPayment)
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
    parser.add_argument('--repair-targets', choices=['partial', 'positive', 'vulnerable', 'invu', 'invulnerable'])
    parser.add_argument('--race-overrides', action='store_true')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    if args.repair_targets:
        targets = {'partial': 'notground,notstructure,notair', 'positive': 'ground,notair,notnonancient', 'vulnerable': 'ground', 'invu': 'ground,invu', 'invulnerable': 'ground,invulnerable'}[args.repair_targets]
        files['war3map.w3a'] = struct.pack('<II', 2, 2) + b''.join(ability + bytes(4) + struct.pack('<I', 1) + b'atar' + struct.pack('<III', 3, 1, 0) + targets.encode('ascii') + b'\0' + ability for ability in (b'Arep', b'Ahrp')) + struct.pack('<I', 0)
    if args.race_overrides:
        units = [(b'z0r1', b'_'), (b'z0r2', b'mystery'), (b'z0r3', b'NAGA'), (b'z0r4', b'naga')]
        files['war3map.w3u'] = struct.pack('<III', 2, 0, len(units)) + b''.join(b'hpea' + unit + struct.pack('<I', 1) + b'urac' + struct.pack('<I', 3) + race + b'\0' + unit for unit, race in units)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
