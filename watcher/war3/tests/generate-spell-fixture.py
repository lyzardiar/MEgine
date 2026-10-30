"""Author: MiYu. Stage-batch ability event consumers in a copy of original BootyBay geometry."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
SCRIPT = '''globals
unit probe_caster=null
unit probe_target=null
integer probe_ability=0
integer probe_channel=0
integer probe_cast=0
integer probe_effect=0
integer probe_finish=0
integer probe_end=0
integer probe_summons=0
boolean probe_interrupt=false
boolean probe_remove=false
integer poison_effect=0
integer poison_marked_damage=0
endglobals
function ProbeCaster takes unit u returns nothing
    set probe_caster=u
endfunction
function ProbeTarget takes unit u, integer id returns nothing
    set probe_target=u
    set probe_ability=id
endfunction
function ProbeFlags takes boolean interrupt, boolean remove returns nothing
    set probe_interrupt=interrupt
    set probe_remove=remove
endfunction
function ProbeSpell takes nothing returns nothing
    local eventid e=GetTriggerEventId()
    local location p=GetSpellTargetLoc()
    if GetSpellAbilityUnit()!=probe_caster or GetSpellAbilityId()!=probe_ability or GetSpellTargetUnit()!=probe_target or GetSpellAbility()==null or GetSpellTargetItem()!=null or GetSpellTargetDestructable()!=null then
        call ExecuteFunc("SpellFailure_context")
    endif
    if GetLocationX(p)!=GetSpellTargetX() or GetLocationY(p)!=GetSpellTargetY() then
        call ExecuteFunc("SpellFailure_target_point")
    endif
    call RemoveLocation(p)
    if e==EVENT_UNIT_SPELL_CHANNEL then
        set probe_channel=probe_channel+1
    elseif e==EVENT_UNIT_SPELL_CAST then
        set probe_cast=probe_cast+1
        if probe_interrupt then
            call IssueImmediateOrder(probe_caster,"stop")
        endif
        if probe_remove then
            call RemoveUnit(probe_caster)
        endif
    elseif e==EVENT_UNIT_SPELL_EFFECT then
        set probe_effect=probe_effect+1
    elseif e==EVENT_UNIT_SPELL_FINISH then
        set probe_finish=probe_finish+1
    else
        set probe_end=probe_end+1
    endif
endfunction
function ProbeSummon takes nothing returns nothing
    if GetSummoningUnit()!=probe_caster or GetSummonedUnit()==null or not IsUnitType(GetSummonedUnit(),UNIT_TYPE_SUMMONED) then
        call ExecuteFunc("SpellFailure_summon_context")
    endif
    set probe_summons=probe_summons+1
endfunction
function ProbeRegister takes nothing returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,probe_caster,EVENT_UNIT_SPELL_CHANNEL)
    call TriggerRegisterUnitEvent(t,probe_caster,EVENT_UNIT_SPELL_CAST)
    call TriggerRegisterUnitEvent(t,probe_caster,EVENT_UNIT_SPELL_EFFECT)
    call TriggerRegisterUnitEvent(t,probe_caster,EVENT_UNIT_SPELL_FINISH)
    call TriggerRegisterUnitEvent(t,probe_caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function ProbeSpell)
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,probe_caster,EVENT_UNIT_SUMMON)
    call TriggerAddAction(t,function ProbeSummon)
endfunction
function PoisonEffect takes nothing returns nothing
    if GetSpellAbilityId()=='A0PA' then
        set poison_effect=poison_effect+1
    endif
endfunction
function PoisonDamaged takes nothing returns nothing
    if GetUnitAbilityLevel(GetTriggerUnit(),'Bpoi')>0 then
        set poison_marked_damage=poison_marked_damage+1
    endif
endfunction
function PoisonRegister takes unit caster, unit target returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_EFFECT)
    call TriggerAddAction(t,function PoisonEffect)
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,target,EVENT_UNIT_DAMAGED)
    call TriggerAddAction(t,function PoisonDamaged)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/spells/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    def instant_blizzard(custom, waves):
        values = [(b'Hbz1',0,1,waves),(b'Hbz2',2,2,50.),(b'Hbz3',0,3,0),(b'acas',2,0,0.),(b'aare',2,0,250.),(b'atar',3,0,b'ground,enemy')]
        changes=[]
        for field,kind,slot,value in values:
            payload=value+b'\0' if kind==3 else struct.pack('<f' if kind==2 else '<i',value)
            changes.append(field+struct.pack('<III',kind,1,slot)+payload+custom)
        return b'AHbz'+custom+struct.pack('<I',len(changes))+b''.join(changes)
    def mana_shield(custom, fraction):
        changes = b''.join(field+struct.pack('<IIIf',2,1,slot,value)+custom for field,slot,value in [(b'Nms1',1,0.),(b'Nms2',2,fraction)])
        return b'ANms'+custom+struct.pack('<I',2)+changes
    zero_locust = b'AUls'+b'A0L0'+struct.pack('<I',1)+b'Uls3'+struct.pack('<IIIi',0,1,3,0)+b'A0L0'
    poison_arrow = b'AEpa'+b'A0PA'+struct.pack('<I',2)+b'atar'+struct.pack('<III',3,1,0)+b'ground,enemies,organic\0'+b'A0PA'+b'amcs'+struct.pack('<IIIi',0,1,0,20)+b'A0PA'
    def acid_speeds(custom, move, attack):
        values = [(b'Nab1',1,move),(b'Nab2',2,attack),(b'Nab3',3,0.),(b'Nab4',4,0.),(b'Nab5',5,0.),(b'aare',0,0.)]
        changes = b''.join(field+struct.pack('<IIIf',2,1,slot,value)+custom for field,slot,value in values)
        return b'ANab'+custom+struct.pack('<I',len(values))+changes
    files['war3map.w3a']=struct.pack('<III',2,0,8)+instant_blizzard(b'A0ZB',3)+instant_blizzard(b'A0Z0',0)+mana_shield(b'A0MZ',0.)+mana_shield(b'A0MP',1.)+zero_locust+poison_arrow+acid_speeds(b'A0AN',-.2,-.3)+acid_speeds(b'A0AP',.25,.4)

    mind_rot_item = b'woms' + b'I0MR' + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + b'ANmr\0' + b'I0MR'
    files['war3map.w3t'] = struct.pack('<III', 2, 0, 1) + mind_rot_item

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()
