"""Author: MiYu. Original terrain and source abilities isolate visibility, detection and item consumers."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit caster=null
unit target=null
unit enemy_unit=null
unit detector=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    set caster=CreateUnit(Player(0),'hsor',0,0,0)
    set target=CreateUnit(Player(0),'hfoo',128,0,0)
    set enemy_unit=CreateUnit(Player(1),'hfoo',256,0,0)
    set detector=CreateUnit(Player(1),'ushd',2048,0,0)
    call SetUnitAcquireRange(caster,0)
    call SetUnitAcquireRange(target,0)
    call SetUnitAcquireRange(enemy_unit,0)
    call SetUnitPathing(target,false)
    call UnitAddAbility(target,'AInv')
    call SetPlayerTechResearched(Player(0),'Rhst',1)
    call StartCampaignAI(Player(1),"visibility.ai")
endfunction
'''
STRATEGY = '''function main takes nothing returns nothing
    call InitAI()
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/invisibility/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    files['visibility.ai'] = STRATEGY.encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
