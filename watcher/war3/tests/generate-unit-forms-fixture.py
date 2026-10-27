"""Author: MiYu. Source terrain and definitions isolate Bear Form, Crow Form and Metamorphosis orders."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit bear=null
unit crow=null
unit demon=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerTechResearched(Player(0),'Redc',2)
    call SetPlayerTechResearched(Player(0),'Redt',2)
    set bear=CreateUnit(Player(0),'edoc',0,0,0)
    set crow=CreateUnit(Player(0),'edot',0,256,0)
    set demon=CreateUnit(Player(0),'Edem',0,-256,0)
    call SetUnitAcquireRange(bear,0)
    call SetUnitAcquireRange(crow,0)
    call SetUnitAcquireRange(demon,0)
    call UnitAddAbility(demon,'AEme')
    call SetHeroLevel(demon,6,false)
    call SetUnitState(bear,UNIT_STATE_MANA,200)
    call SetUnitState(crow,UNIT_STATE_MANA,200)
    call SetUnitState(demon,UNIT_STATE_MANA,200)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/unit-forms/fixture.w3m')
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
