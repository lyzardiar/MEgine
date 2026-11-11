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
integer blightEffects=0
integer removeSoulOnPickup=0
integer soulPickups=0
integer conversionSummons=0
integer conversionRemoveSource=0
unit conversionSource=null
unit conversionSummoned=null
endglobals
function quiet takes unit u returns nothing
    call SetUnitPathing(u,false)
    call SetUnitAcquireRange(u,0)
    call SetUnitState(u,UNIT_STATE_MAX_MANA,1000)
    call SetUnitState(u,UNIT_STATE_MANA,1000)
endfunction
function spell_effect takes nothing returns nothing
    if GetSpellAbilityId()=='Ablp' then
        set blightEffects=blightEffects+1
    endif
    if GetSpellTargetDestructable()!=null then
        set spellTree=GetSpellTargetDestructable()
    endif
endfunction
function item_picked takes nothing returns nothing
    if GetItemTypeId(GetManipulatedItem())=='soul' then
        set soulPickups=soulPickups+1
        if removeSoulOnPickup!=0 then
            call RemoveItem(GetManipulatedItem())
        endif
    endif
endfunction
function conversion_summoned takes nothing returns nothing
    if GetUnitTypeId(GetSummonedUnit())=='nzom' then
        set conversionSummons=conversionSummons+1
        set conversionSource=GetSummoningUnit()
        set conversionSummoned=GetSummonedUnit()
        if conversionRemoveSource!=0 then
            call RemoveUnit(conversionSource)
            call SetUnitOwner(conversionSummoned,Player(1),true)
        endif
    endif
endfunction
function set_conversion_callback takes integer value returns nothing
    set conversionRemoveSource=value
endfunction
function set_soul_callback takes integer value returns nothing
    set removeSoulOnPickup=value
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    local trigger itemTrigger=CreateTrigger()
    local trigger summonTrigger=CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(summonTrigger,Player(0),EVENT_PLAYER_UNIT_SUMMON,null)
    call TriggerAddAction(summonTrigger,function conversion_summoned)
    call TriggerRegisterPlayerUnitEvent(itemTrigger,Player(0),EVENT_PLAYER_UNIT_PICKUP_ITEM,null)
    call TriggerAddAction(itemTrigger,function item_picked)
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
    parser.add_argument('--light-targets', choices=['partial', 'invu', 'invulnerable'])
    parser.add_argument('--ensnare-targets', choices=['player', 'player-enemy', 'player-notself'])
    parser.add_argument('--steal-targets', choices=['player', 'player-enemy'])
    parser.add_argument('--charm-targets', choices=['player', 'neutral', 'enemy'])
    parser.add_argument('--teleport-targets', choices=['player', 'allies', 'self'])
    parser.add_argument('--devour-targets', choices=['player', 'enemy', 'mixed', 'player-notself'])
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    entries = [(b'AIps', 'air,ground,ward,tree')]
    if args.ensnare_targets:
        targets = dict(player='grou,play', **{'player-enemy': 'grou,play,enem', 'player-notself': 'grou,play,nots'})[args.ensnare_targets]
        entries.append((b'Aens', targets))
    if args.steal_targets:
        entries.append((b'Aste', 'grou,play,enem' if args.steal_targets == 'player-enemy' else 'grou,play'))
    if args.charm_targets:
        entries.append((b'ANch', {'player': 'grou,play', 'neutral': 'grou,neut', 'enemy': 'grou,enem'}[args.charm_targets]))
    if args.teleport_targets:
        entries.append((b'AHmt', {'player': 'grou,play', 'allies': 'grou,alli', 'self': 'grou,self'}[args.teleport_targets]))
    if args.devour_targets:
        entries.append((b'Advm', {'player': 'air,grou,play', 'enemy': 'air,grou,enem', 'mixed': 'air,grou,play,enem', 'player-notself': 'air,grou,play,nots'}[args.devour_targets]))
    if args.light_targets:
        targets = {'partial': 'ground,organic,notself,vuln,notinvu', 'invu': 'ground,organic,notself,vuln,invu', 'invulnerable': 'ground,organic,notself,vuln,invulnerable'}[args.light_targets]
        entries.extend((ability, targets) for ability in (b'AHhb', b'AUdc'))
    files['war3map.w3a'] = struct.pack('<II', 2, len(entries)) + b''.join(ability + bytes(4) + struct.pack('<I', 1) + b'atar' + struct.pack('<III', 3, 1, 0) + targets.encode('ascii') + b'\0' + ability for ability, targets in entries) + struct.pack('<I', 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
