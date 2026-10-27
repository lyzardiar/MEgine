"""Author: MiYu. Original terrain, burrow, peons and Kodo definitions isolate real garrison and digestion flow."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit burrow=null
unit kodo=null
unit prey=null
unit hero=null
unit ally=null
unit mechanical=null
unit siege_target=null
unit array peons
integer death_count=0
unit last_killer=null
endglobals
function on_death takes nothing returns nothing
    set death_count=death_count+1
    set last_killer=GetKillingUnit()
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local integer i=0
    local trigger t=CreateTrigger()
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    set burrow=CreateUnit(Player(0),'otrb',0,0,0)
    loop
        exitwhen i==5
        set peons[i]=CreateUnit(Player(0),'opeo',128+i*32,128,0)
        call SetUnitPathing(peons[i],false)
        call SetUnitAcquireRange(peons[i],0)
        set i=i+1
    endloop
    set siege_target=CreateUnit(Player(1),'ogru',600,0,0)
    set kodo=CreateUnit(Player(0),'okod',1400,0,0)
    set prey=CreateUnit(Player(1),'ogru',1500,0,0)
    set hero=CreateUnit(Player(1),'Hamg',1500,256,0)
    set ally=CreateUnit(Player(0),'ogru',1500,-256,0)
    set mechanical=CreateUnit(Player(1),'ocat',1500,-128,0)
    call SetUnitPathing(kodo,false)
    call SetUnitPathing(prey,false)
    call SetUnitAcquireRange(siege_target,0)
    call SetUnitAcquireRange(kodo,0)
    call SetUnitAcquireRange(prey,0)
    call SetUnitAcquireRange(hero,0)
    call SetUnitAcquireRange(ally,0)
    call SetUnitAcquireRange(mechanical,0)
    call TriggerRegisterPlayerUnitEvent(t,Player(1),EVENT_PLAYER_UNIT_DEATH,null)
    call TriggerAddAction(t,function on_death)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/orc-cargo/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
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
