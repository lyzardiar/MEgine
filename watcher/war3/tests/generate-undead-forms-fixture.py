"""Author: MiYu. Read-only source terrain isolates paid Destroyer, Stone Form and Burrow gameplay."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit statue=null
unit gargoyle=null
unit fiend=null
unit enemyUnit=null
endglobals
function config takes nothing returns nothing
endfunction
function quiet takes unit u returns nothing
    call SetUnitPathing(u,false)
    call SetUnitAcquireRange(u,0)
endfunction
function main takes nothing returns nothing
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_FOOD_CAP,90)
    call SetPlayerTechResearched(Player(0),'Rusp',1)
    call SetPlayerTechResearched(Player(0),'Rusf',1)
    call SetPlayerTechResearched(Player(0),'Rubu',1)
    set statue=CreateUnit(Player(0),'uobs',0,0,0)
    set gargoyle=CreateUnit(Player(0),'ugar',0,256,0)
    set fiend=CreateUnit(Player(0),'ucry',0,-256,0)
    set enemyUnit=CreateUnit(Player(1),'hfoo',256,-256,0)
    call quiet(statue)
    call quiet(gargoyle)
    call quiet(fiend)
    call quiet(enemyUnit)
    call UnitAddAbility(enemyUnit,'AHtb')
    call SetUnitState(enemyUnit,UNIT_STATE_MAX_MANA,1000)
    call SetUnitState(enemyUnit,UNIT_STATE_MANA,1000)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/advanced-forms/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    files['war3map.w3a'] = struct.pack('<III', 2, 0, 1) + b'AbdtA0BD' + struct.pack('<I', 1) + b'Det1' + struct.pack('<IIII', 0, 1, 1, 2) + b'A0BD'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
