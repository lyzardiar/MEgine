"""Author: MiYu. Isolated source map geometry with deterministic boundary inputs for stage passive checks."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('channel_fixture', Path(__file__).with_name('generate-channel-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=fixture.fixture.ROOT/'tmp/docs-artifacts/war3/auras-passives/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    helper = fixture.fixture.fixture
    archive = helper.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = helper.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: helper.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = b"""globals
integer pawnCount=0
unit pawnSeller=null
unit pawnBuyer=null
item pawnSold=null
endglobals
function OnPawn takes nothing returns nothing
    set pawnCount=pawnCount+1
    set pawnSeller=GetSellingUnit()
    set pawnBuyer=GetBuyingUnit()
    set pawnSold=GetSoldItem()
endfunction
function InstallPawnTest takes unit seller returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,seller,EVENT_UNIT_PAWN_ITEM)
    call TriggerAddAction(t,function OnPawn)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
"""
    records = []
    for base, marker, changes in [
        (b'Aall', b'A0AL', [('Neu1', 2, 720., 1)]),
        (b'AOcr', b'A0CR', [('Ocr1', 2, 100., 1), ('Ocr2', 2, 2., 2)]),
        (b'AOcr', b'A0NM', [('Ocr1', 2, 100., 1), ('Ocr2', 2, 2., 2), ('Ocr5', 0, 1, 5)]),
        (b'AEev', b'A0EV', [('Eev1', 2, 1., 1)]),
        (b'AHbh', b'A0BH', [('Hbh1', 2, 100., 1)]),
        (b'AUau', b'A0PL', [('atar', 3, 'air,ground,invulnerable,player,vulnerable', 0)]),
        (b'Aasl', b'A0SL', [('Slo1', 2, .2, 1), ('atar', 3, 'self', 0), ('aare', 2, 0., 0)]),
        (b'Aspb', b'A0PB', [('spb1', 3, 'A0SL', 1), ('spb3', 0, 1, 3), ('spb4', 0, 1, 4)])
    ]:
        records.append(base+marker+struct.pack('<I', len(changes))+b''.join(fixture.modification(field, kind, value, slot, marker) for field, kind, value, slot in changes))
    files['war3map.w3a'] = struct.pack('<III', 2, 0, len(records))+b''.join(records)
    sight_item = b'rat6' + b'I0SI' + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + b'AIsi\0' + b'I0SI'
    files['war3map.w3t'] = struct.pack('<III', 2, 0, 1) + sight_item
    units = [(b'hpea', b'z0u1', b'uwu2'), (b'hfoo', b'z0u2', b'uwu1')]
    files['war3map.w3u'] = struct.pack('<III', 2, 0, len(units))+b''.join(base+custom+struct.pack('<I', 1)+field+struct.pack('<II', 0, 0)+custom for base, custom, field in units)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+helper.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
