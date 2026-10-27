"""Author: MiYu. Original terrain and source Meat Wagons isolate real corpse cargo, decay suspension and researched generation."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit wagon=null
unit ghoul=null
unit necro=null
unit paladin=null
unit knight=null
unit walker=null
integer decays=0
unit decaying=null
endglobals
function on_decay takes nothing returns nothing
    set decays=decays+1
    set decaying=GetDecayingUnit()
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    call SetPlayerTechResearched(Player(0),'Ruac',1)
    call SetPlayerTechResearched(Player(0),'Rowt',2)
    set wagon=CreateUnit(Player(0),'umtw',0,0,0)
    call SetUnitPathing(wagon,false)
    call SetUnitAcquireRange(wagon,0)
    set ghoul=CreateUnit(Player(0),'ugho',0,-512,0)
    set necro=CreateUnit(Player(0),'unec',0,256,0)
    set paladin=CreateUnit(Player(0),'Hpal',0,-256,0)
    set knight=CreateUnit(Player(0),'Udea',0,-512,0)
    set walker=CreateUnit(Player(0),'ospw',0,512,0)
    call SetHeroLevel(paladin,6,false)
    call SetHeroLevel(knight,6,false)
    call UnitAddAbility(paladin,'AHre')
    call UnitAddAbility(knight,'AUan')
    call IssueImmediateOrder(necro,"raisedeadoff")
    call SetUnitState(necro,UNIT_STATE_MANA,GetUnitState(necro,UNIT_STATE_MAX_MANA))
    call SetUnitState(paladin,UNIT_STATE_MANA,GetUnitState(paladin,UNIT_STATE_MAX_MANA))
    call SetUnitState(knight,UNIT_STATE_MANA,GetUnitState(knight,UNIT_STATE_MAX_MANA))
    call SetUnitState(walker,UNIT_STATE_MANA,GetUnitState(walker,UNIT_STATE_MAX_MANA))
    call SetUnitPathing(ghoul,false)
    call SetUnitPathing(necro,false)
    call SetUnitPathing(walker,false)
    call SetUnitAcquireRange(necro,0)
    call SetUnitAcquireRange(paladin,0)
    call SetUnitAcquireRange(knight,0)
    call SetUnitAcquireRange(walker,0)
    call TriggerRegisterPlayerUnitEvent(t,Player(1),EVENT_PLAYER_UNIT_DECAY,null)
    call TriggerAddAction(t,function on_decay)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/corpse-cargo/fixture.w3m')
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
