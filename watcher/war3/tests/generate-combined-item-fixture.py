"""Author: MiYu. Custom two-effect recovery item and item-use reentrancy fixture."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('control_fixture', Path(__file__).with_name('generate-control-fixture.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)
ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/combined-item/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = control.fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = control.fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: control.fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    script = control.SCRIPT.replace('integer soulPickups=0', 'integer soulPickups=0\ninteger combinedUses=0\ninteger combinedEvents=0\nboolean removeCombined=false\nitem reentryItem=null')
    script = script.replace('function config takes nothing returns nothing', '''function combined_used takes nothing returns nothing
    set combinedEvents=combinedEvents+1
    if GetItemTypeId(GetManipulatedItem())=='I0CM' then
        set combinedUses=combinedUses+1
        if removeCombined then
            call RemoveItem(GetManipulatedItem())
        endif
    endif
endfunction
function set_combined_remove takes boolean value returns nothing
    set removeCombined=value
endfunction
function combined_life_changed takes nothing returns nothing
    call RemoveItem(reentryItem)
    call SetUnitOwner(GetTriggerUnit(),Player(1),false)
endfunction
function watch_combined_life takes unit u, item i returns nothing
    local trigger t=CreateTrigger()
    set reentryItem=i
    call TriggerRegisterUnitStateEvent(t,u,UNIT_STATE_LIFE,GREATER_THAN,150.)
    call TriggerAddAction(t,function combined_life_changed)
endfunction
function config takes nothing returns nothing''')
    script = script.replace('local trigger itemTrigger=CreateTrigger()', '''local trigger itemTrigger=CreateTrigger()
    local trigger combinedTrigger=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(combinedTrigger,Player(0),EVENT_PLAYER_UNIT_USE_ITEM,null)
    call TriggerRegisterPlayerUnitEvent(combinedTrigger,Player(1),EVENT_PLAYER_UNIT_USE_ITEM,null)
    call TriggerAddAction(combinedTrigger,function combined_used)''')
    files['war3map.j'] = script.encode('utf-8')
    def ability(base, custom, field, amount, price, cooldown):
        change = field + struct.pack('<IIII', 0, 1, 1, amount) + custom
        change += b'amcs' + struct.pack('<IIII', 0, 1, 0, price) + custom
        change += b'acdn' + struct.pack('<IIIf', 2, 1, 0, cooldown) + custom
        return base + custom + struct.pack('<I', 3) + change
    files['war3map.w3a'] = struct.pack('<III', 2, 0, 2) + ability(b'AIh2',b'A0CH',b'Ihpg',137,5,10.) + ability(b'AIm2',b'A0CM',b'Impg',67,7,20.)
    def item(custom, abilities):
        return b'phea' + custom + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + abilities + b'\0' + custom
    files['war3map.w3t'] = struct.pack('<III', 2, 0, 2) + item(b'I0CM',b'A0CH,A0CM') + item(b'I0UN',b'A0CH,A0CM,AIil')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset] + control.fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
