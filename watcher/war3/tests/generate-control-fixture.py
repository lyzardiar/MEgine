"""Author: MiYu. Original terrain and source casters isolate control spells, real grounded targets and Purge widgets."""
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
unit raider=null
unit fiend=null
unit dread=null
unit shaman=null
unit mage=null
unit flying=null
unit foe=null
unit friendly=null
destructable tree=null
destructable spellTree=null
endglobals
function quiet takes unit u returns nothing
    call SetUnitPathing(u,false)
    call SetUnitAcquireRange(u,0)
    call SetUnitState(u,UNIT_STATE_MAX_MANA,1000)
    call SetUnitState(u,UNIT_STATE_MANA,1000)
endfunction
function spell_effect takes nothing returns nothing
    if GetSpellTargetDestructable()!=null then
        set spellTree=GetSpellTargetDestructable()
    endif
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetPlayerAlliance(Player(0),Player(1),ALLIANCE_PASSIVE,false)
    call SetPlayerAlliance(Player(1),Player(0),ALLIANCE_PASSIVE,false)
    call SetPlayerTechResearched(Player(0),'Roen',1)
    call SetPlayerTechResearched(Player(0),'Ruwb',1)
    set raider=CreateUnit(Player(0),'orai',0,0,0)
    set fiend=CreateUnit(Player(0),'ucry',0,256,0)
    set dread=CreateUnit(Player(0),'Udre',0,-256,0)
    set shaman=CreateUnit(Player(0),'oshm',0,-512,0)
    set mage=CreateUnit(Player(0),'Hblm',0,-768,0)
    set flying=CreateUnit(Player(1),'hgry',128,0,0)
    set foe=CreateUnit(Player(1),'hfoo',128,-256,0)
    set friendly=CreateUnit(Player(0),'hfoo',128,-768,0)
    set tree=CreateDestructable('LTlt',256,-512,0,1,0)
    call quiet(raider)
    call quiet(fiend)
    call quiet(dread)
    call quiet(shaman)
    call quiet(mage)
    call quiet(flying)
    call quiet(foe)
    call quiet(friendly)
    call IssueImmediateOrder(fiend,"weboff")
    call UnitAddAbility(dread,'AUsl')
    call UnitAddAbility(mage,'AHbn')
    call UnitAddAbility(mage,'AHhb')
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_SPELL_EFFECT,null)
    call TriggerAddAction(t,function spell_effect)
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/control-spells/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    files['war3map.w3a'] = struct.pack('<II', 2, 1) + b'AIps' + bytes(4) + struct.pack('<I', 1) + b'atar' + struct.pack('<III', 3, 1, 0) + b'air,ground,ward,tree\0' + b'AIps' + struct.pack('<I', 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
