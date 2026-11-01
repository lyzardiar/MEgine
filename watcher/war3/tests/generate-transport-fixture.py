"""Author: MiYu. Original terrain and Zeppelin definitions exercise live transport orders and loaded events."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit carrier=null
unit passenger=null
unit hero=null
unit siege=null
unit enemy_unit=null
integer loaded_count=0
unit loaded_event_unit=null
unit loaded_event_carrier=null
unit loaded_trigger_unit=null
endglobals
function on_loaded takes nothing returns nothing
    set loaded_count=loaded_count+1
    set loaded_event_unit=GetLoadedUnit()
    set loaded_event_carrier=GetTransportUnit()
    set loaded_trigger_unit=GetTriggerUnit()
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    set carrier=CreateUnit(Player(0),'nzep',0,0,0)
    set passenger=CreateUnit(Player(0),'hfoo',128,0,0)
    set hero=CreateUnit(Player(0),'Hamg',64,0,0)
    set siege=CreateUnit(Player(0),'ocat',256,0,0)
    set enemy_unit=CreateUnit(Player(1),'hfoo',2048,0,0)
    call SetUnitAcquireRange(passenger,0)
    call SetUnitAcquireRange(hero,0)
    call SetUnitAcquireRange(siege,0)
    call SetUnitAcquireRange(enemy_unit,0)
    call SetUnitPathing(passenger,false)
    call SetUnitPathing(hero,false)
    call SetUnitPathing(siege,false)
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_LOADED,null)
    call TriggerAddAction(t,function on_loaded)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/transport/fixture.w3m')
    parser.add_argument('--crash-damage', action='store_true')
    parser.add_argument('--crash-revive', action='store_true')
    parser.add_argument('--crash-remove', action='store_true')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    script = SCRIPT
    if args.crash_revive or args.crash_remove:
        script = script.replace('endglobals', 'integer crash_damage_events=0\nendglobals', 1)
        action = 'RemoveUnit(carrier)' if args.crash_remove else 'SetWidgetLife(carrier,100.0)'
        script = script.replace('function config takes nothing returns nothing', "function on_crash_damage takes nothing returns nothing\n    if GetTriggerUnit()==passenger and GetWidgetLife(carrier)<=0 then\n        set crash_damage_events=crash_damage_events+1\n        call " + action + "\n    endif\nendfunction\nfunction config takes nothing returns nothing", 1)
        script = script.replace('    local trigger t=CreateTrigger()', '    local trigger t=CreateTrigger()\n    local trigger damage=CreateTrigger()', 1)
        script = script.replace('    call TriggerAddAction(t,function on_loaded)', '    call TriggerAddAction(t,function on_loaded)\n    call TriggerRegisterUnitEvent(damage,passenger,EVENT_UNIT_DAMAGED)\n    call TriggerAddAction(damage,function on_crash_damage)', 1)
    files['war3map.j'] = script.encode('utf-8')
    if args.crash_damage or args.crash_revive or args.crash_remove:
        files['war3map.w3a'] = struct.pack('<II', 2, 1) + b'Achd' + bytes(4) + struct.pack('<I', 1) + b'Chd3' + struct.pack('<III f', 1, 1, 3, 75.0) + b'Achd' + struct.pack('<I', 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
