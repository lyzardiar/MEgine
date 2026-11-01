"""Author: MiYu. Custom multi-effect recovery item and item-use reentrancy fixture."""
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
    script = control.SCRIPT.replace('integer soulPickups=0', 'integer soulPickups=0\ninteger combinedUses=0\ninteger combinedEvents=0\nboolean removeCombined=false\nitem reentryItem=null\nunit changedTarget=null\nunit revivedTarget=null')
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
function targets_life_changed takes nothing returns nothing
    call SetUnitOwner(changedTarget,Player(1),false)
    call KillUnit(revivedTarget)
    call ReviveHero(revivedTarget,256.,-768.,false)
    call SetWidgetLife(revivedTarget,100.)
endfunction
function watch_combined_targets takes unit u, unit changed, unit revived returns nothing
    local trigger t=CreateTrigger()
    set changedTarget=changed
    set revivedTarget=revived
    call TriggerRegisterUnitStateEvent(t,u,UNIT_STATE_LIFE,GREATER_THAN,150.)
    call TriggerAddAction(t,function targets_life_changed)
endfunction
function protection_life_changed takes nothing returns nothing
    local unit u=GetTriggerUnit()
    call DisableTrigger(GetTriggeringTrigger())
    call KillUnit(u)
    call ReviveHero(u,256.,-768.,false)
    call SetWidgetLife(u,100.)
    call SetUnitState(u,UNIT_STATE_MANA,0.)
endfunction
function watch_protection_revival takes unit u returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitStateEvent(t,u,UNIT_STATE_LIFE,GREATER_THAN,150.)
    call TriggerAddAction(t,function protection_life_changed)
endfunction
function config takes nothing returns nothing''')
    if 'local trigger summonTrigger=CreateTrigger()' not in script or 'call TriggerRegisterPlayerUnitEvent(summonTrigger,Player(0),EVENT_PLAYER_UNIT_SUMMON,null)' not in script:
        raise ValueError('Control fixture trigger layout changed')
    script = script.replace('local trigger summonTrigger=CreateTrigger()', '''local trigger summonTrigger=CreateTrigger()
    local trigger combinedTrigger=CreateTrigger()''')
    script = script.replace('call TriggerRegisterPlayerUnitEvent(summonTrigger,Player(0),EVENT_PLAYER_UNIT_SUMMON,null)', '''call TriggerRegisterPlayerUnitEvent(combinedTrigger,Player(0),EVENT_PLAYER_UNIT_USE_ITEM,null)
    call TriggerRegisterPlayerUnitEvent(combinedTrigger,Player(1),EVENT_PLAYER_UNIT_USE_ITEM,null)
    call TriggerAddAction(combinedTrigger,function combined_used)
    call TriggerRegisterPlayerUnitEvent(summonTrigger,Player(0),EVENT_PLAYER_UNIT_SUMMON,null)''')
    files['war3map.j'] = script.encode('utf-8')
    def ability(base, custom, field, amount, price, cooldown):
        change = field + struct.pack('<IIII', 0, 1, 1, amount) + custom
        change += b'amcs' + struct.pack('<IIII', 0, 1, 0, price) + custom
        change += b'acdn' + struct.pack('<IIIf', 2, 1, 0, cooldown) + custom
        return base + custom + struct.pack('<I', 3) + change
    def timed_ability(base, custom):
        changes = b''.join(field + struct.pack('<IIIf', 2, 1, 0, value) + custom for field, value in [(b'adur', 3.), (b'ahdu', 9.)])
        return base + custom + struct.pack('<I', 2) + changes
    files['war3map.w3a'] = struct.pack('<III', 2, 0, 5) + ability(b'AIh2',b'A0CH',b'Ihpg',137,5,10.) + ability(b'AIm2',b'A0CM',b'Impg',67,7,20.) + ability(b'AIh2',b'A0CX',b'Ihpg',31,2,12.) + timed_ability(b'AIv1',b'A0VI') + timed_ability(b'AIpv',b'A0VP')
    def item(custom, abilities):
        return b'phea' + custom + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + abilities + b'\0' + custom
    files['war3map.w3t'] = struct.pack('<III', 2, 0, 47) + item(b'I0EN',b'Aens,AIgo') + item(b'I0BN',b'AHbn,AIgo') + item(b'I0HX',b'AOhx,AIgo') + item(b'I0HL',b'Ahea,AIgo') + item(b'I0SO',b'Aslo,AIgo') + item(b'I0IF',b'Ainf,AIgo') + item(b'I0NR',b'ANmr,AIgo') + item(b'I0LS',b'Alsh,AIgo') + item(b'I0FF',b'Afae,AIgo') + item(b'I0CR',b'Acri,AIgo') + item(b'I0ST',b'Aspl,AIgo') + b'rsps' + b'I0SL' + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + b'Aspl,AIgo\0' + b'I0SL' + item(b'I0RP',b'AIdb,AIgo') + item(b'I0RT',b'A0CH,AIha') + item(b'I0RB',b'AIrb,AIgo') + item(b'I0DI',b'AIdi,AIgo') + item(b'I0MO',b'AIct,AIgo') + item(b'I0SA',b'AIsa,AIgo') + item(b'I0RM',b'AImr,AIgo') + item(b'I0RA',b'AIra,AIgo') + item(b'I0RG',b'AIrl,AIgo') + item(b'I0PR',b'AIda,AIgo') + item(b'I0SH',b'ANse,AIgo') + item(b'I0V3',b'AIvu,AIgo') + item(b'I0S3',b'AIsp,AIgo') + item(b'I0RH',b'AIha,AIgo') + item(b'I0RO',b'Aroa,AIgo') + item(b'I0DU',b'AItb,AIgo') + item(b'I0CM',b'A0CH,A0CM') + item(b'I0UN',b'A0CH,A0CM,Ache') + item(b'I0MX',b'A0CH,A0CM,A0CX') + item(b'I0MR',b'A0CM,AIre') + item(b'I0GR',b'A0CH,AIgo,AIlu') + item(b'I0PA',b'AIxm,AIgo') + item(b'I0GL',b'AIgu,AIgo') + item(b'I0IL',b'AIil,AIgo') + item(b'I0IV',b'AIv1,AIgo') + item(b'I0VP',b'AIpv,AIgo') + item(b'I0V1',b'A0VI') + item(b'I0V2',b'A0VI,AIgo') + item(b'I0P1',b'A0VP') + item(b'I0P2',b'A0VP,AIgo') + item(b'I0RS',b'AIrs,AIgo') + item(b'I0AN',b'AIan,AIgo') + item(b'I0RV',b'AIrv,AIgo') + item(b'I0DS',b'AHds,AIgo') + item(b'I0BZ',b'Absk,AIgo')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset] + control.fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
