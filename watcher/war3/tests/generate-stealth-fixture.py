"""Author: MiYu. Source terrain and source units isolate live nighttime cloaking and temporary reveal."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit archer=null
unit hero=null
unit shade=null
item removalItem=null
integer removalUnitEvents=0
integer removalPlayerEvents=0
integer removalErrors=0
endglobals
function removal_unit_event takes nothing returns nothing
    set removalUnitEvents=removalUnitEvents+1
    if GetManipulatedItem()!=removalItem or GetTriggerUnit()!=hero or GetItemTypeId(removalItem)!='desc' or UnitItemInSlot(hero,0)!=null then
        set removalErrors=removalErrors+1
    endif
    call RemoveItem(removalItem)
endfunction
function removal_player_event takes nothing returns nothing
    set removalPlayerEvents=removalPlayerEvents+1
    if GetManipulatedItem()!=removalItem or GetTriggerUnit()!=hero or GetItemTypeId(removalItem)!='desc' then
        set removalErrors=removalErrors+1
    endif
endfunction
function set_removal_item takes item i returns nothing
    set removalItem=i
endfunction
function watch_item_removal takes nothing returns nothing
    local trigger u=CreateTrigger()
    local trigger p=CreateTrigger()
    call TriggerRegisterUnitEvent(u,hero,EVENT_UNIT_DROP_ITEM)
    call TriggerAddAction(u,function removal_unit_event)
    call TriggerRegisterPlayerUnitEvent(p,Player(0),EVENT_PLAYER_UNIT_DROP_ITEM,null)
    call TriggerAddAction(p,function removal_player_event)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_SHARED_VISION,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_SHARED_VISION,false)
    call SetTimeOfDayScale(0)
    call SetFloatGameState(GAME_STATE_TIME_OF_DAY,12)
    set archer=CreateUnit(Player(0),'earc',0,0,0)
    set hero=CreateUnit(Player(0),'Hamg',128,0,0)
    set shade=CreateUnit(Player(1),'ushd',2048,0,0)
    call SetUnitAcquireRange(archer,0)
    call SetUnitAcquireRange(hero,0)
    call SetUnitAcquireRange(shade,0)
    call SetUnitPathing(archer,false)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m')
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
