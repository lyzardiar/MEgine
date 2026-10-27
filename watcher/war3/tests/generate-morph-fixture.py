"""Author: MiYu. Original terrain and source forms isolate Hex, Polymorph, Cyclone and a non-dispellable map override."""
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
unit hexer=null
unit sorceress=null
unit talon=null
unit purger=null
unit groundUnit=null
unit airUnit=null
unit cycloneUnit=null
endglobals
function quiet takes unit u returns nothing
    call SetUnitPathing(u,false)
    call SetUnitAcquireRange(u,0)
    call SetUnitState(u,UNIT_STATE_MAX_MANA,2000)
    call SetUnitState(u,UNIT_STATE_MANA,2000)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    call SetPlayerTechResearched(Player(0),'Rhst',2)
    call SetPlayerTechResearched(Player(0),'Redt',2)
    set hexer=CreateUnit(Player(0),'Oshd',0,0,0)
    set sorceress=CreateUnit(Player(0),'hsor',0,256,0)
    set talon=CreateUnit(Player(0),'edot',0,-256,0)
    set purger=CreateUnit(Player(0),'oshm',0,-512,0)
    set groundUnit=CreateUnit(Player(1),'hfoo',128,0,0)
    set airUnit=CreateUnit(Player(1),'hgry',128,256,0)
    set cycloneUnit=CreateUnit(Player(1),'hfoo',128,-256,0)
    call quiet(hexer)
    call quiet(sorceress)
    call quiet(talon)
    call quiet(purger)
    call quiet(groundUnit)
    call quiet(airUnit)
    call quiet(cycloneUnit)
    call UnitAddAbility(hexer,'AOhx')
    call UnitAddAbility(groundUnit,'AHwe')
    call UnitAddAbility(groundUnit,'AHad')
    call UnitAddAbility(groundUnit,'AInv')
    call UnitAddAbility(cycloneUnit,'AHwe')
    call IssueImmediateOrder(sorceress,"slowoff")
    call IssueImmediateOrder(purger,"bloodlustoff")
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/morph-cyclone/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    files['war3map.w3a'] = struct.pack('<III',2,0,1)+b'AcycC000'+struct.pack('<I',1)+b'cyc1'+struct.pack('<IIII',0,1,1,0)+b'C000'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
