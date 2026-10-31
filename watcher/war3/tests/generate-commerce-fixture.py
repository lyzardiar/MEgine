"""Author: MiYu. Copy original BootyBay geometry and replace only its map script for focused commerce checks."""
import argparse
import hashlib
import importlib.util
import io
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SCRIPT = '''globals
unit probe_barracks=null
unit probe_buyer=null
unit probe_shop=null
unit probe_ownshop=null
unit probe_own_sold=null
unit probe_own_buyer=null
integer probe_own_sales=0
integer probe_sold=0
integer probe_items=0
integer probe_started=0
integer probe_finished=0
integer probe_cancelled=0
integer probe_levelled=0
integer probe_learned=0
integer probe_summons=0
integer probe_damage=0
unit probe_illusion=null
unit probe_acolyte=null
unit probe_trained=null
endglobals
function ProbeAssert takes boolean ok, string message returns nothing
    if not ok then
        call ExecuteFunc("CommerceFailure_"+message)
    endif
endfunction
function ProbeSale takes nothing returns nothing
    call ProbeAssert(GetSellingUnit()==probe_shop,"seller")
    call ProbeAssert(GetBuyingUnit()==probe_buyer,"buyer")
    if GetSoldUnit()!=null then
        set probe_sold=probe_sold+1
    endif
    if GetSoldItem()!=null then
        set probe_items=probe_items+1
    endif
endfunction
function ProbeOwnSale takes nothing returns nothing
    set probe_own_sales=probe_own_sales+1
    set probe_own_sold=GetSoldUnit()
    set probe_own_buyer=GetBuyingUnit()
endfunction
function ProbeOwnShopSetup takes nothing returns nothing
    local trigger t=CreateTrigger()
    set probe_ownshop=CreateUnit(Player(0),'hbar',GetStartLocationX(1),GetStartLocationY(1),270)
    call UnitAddAbility(probe_ownshop,'Asud')
    call AddUnitToStock(probe_ownshop,'hfoo',1,1)
    call TriggerRegisterUnitEvent(t,probe_ownshop,EVENT_UNIT_SELL)
    call TriggerAddAction(t,function ProbeOwnSale)
endfunction
function ProbeTrain takes nothing returns nothing
    call ProbeAssert(GetTrainedUnitType()=='hfoo',"trained_type")
    if GetTriggerEventId()==EVENT_UNIT_TRAIN_START then
        set probe_started=probe_started+1
    elseif GetTriggerEventId()==EVENT_UNIT_TRAIN_CANCEL then
        set probe_cancelled=probe_cancelled+1
    elseif GetTriggerEventId()==EVENT_UNIT_TRAIN_FINISH then
        set probe_finished=probe_finished+1
        set probe_trained=GetTrainedUnit()
    endif
endfunction
function ProbeHeroEvent takes nothing returns nothing
    if GetTriggerEventId()==EVENT_UNIT_HERO_LEVEL then
        call ProbeAssert(GetLevelingUnit()==probe_buyer,"levelling_unit")
        set probe_levelled=probe_levelled+1
    else
        call ProbeAssert(GetLearningUnit()==probe_buyer and GetLearnedSkill()=='AHhb' and GetLearnedSkillLevel()==1,"learn_context")
        set probe_learned=probe_learned+1
    endif
endfunction
function ProbeHero takes nothing returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,probe_buyer,EVENT_UNIT_HERO_LEVEL)
    call TriggerRegisterUnitEvent(t,probe_buyer,EVENT_UNIT_HERO_SKILL)
    call TriggerAddAction(t,function ProbeHeroEvent)
    call SetPlayerHandicapXP(Player(1),2.0)
    call AddHeroXP(probe_buyer,100,false)
    call ProbeAssert(GetHeroXP(probe_buyer)==200 and GetHeroLevel(probe_buyer)==2,"xp_handicap")
    call ProbeAssert(GetHeroStr(probe_buyer,false)==24 and GetHeroSkillPoints(probe_buyer)==2,"growth")
    call SelectHeroSkill(probe_buyer,'AHhb')
    call ProbeAssert(GetUnitAbilityLevel(probe_buyer,'AHhb')==1 and GetHeroSkillPoints(probe_buyer)==1,"learned_state")
    call SuspendHeroXP(probe_buyer,true)
    call AddHeroXP(probe_buyer,100,false)
    call ProbeAssert(GetHeroXP(probe_buyer)==200,"suspended")
    call SetHeroLevel(probe_buyer,3,false)
    call SetHeroStr(probe_buyer,30,true)
    call ProbeAssert(GetHeroXP(probe_buyer)==500 and GetHeroStr(probe_buyer,true)==30,"level_and_strength")
endfunction
function ProbeSummon takes nothing returns nothing
    call ProbeAssert(GetSummoningUnit()==probe_buyer,"summoner")
    set probe_illusion=GetSummonedUnit()
    call ProbeAssert(IsUnitIllusion(probe_illusion),"illusion_flag")
    set probe_summons=probe_summons+1
endfunction
function ProbeDamage takes nothing returns nothing
    call ProbeAssert(GetEventDamageSource()==probe_buyer and GetEventDamage()==300.0,"illusion_damage")
    set probe_damage=probe_damage+1
endfunction
function ProbeIllusion takes nothing returns nothing
    local trigger t=CreateTrigger()
    local item wand=UnitAddItemById(probe_buyer,'will')
    local item potion
    call TriggerRegisterUnitEvent(t,probe_buyer,EVENT_UNIT_SUMMON)
    call TriggerAddAction(t,function ProbeSummon)
    call ProbeAssert(not IsUnitIllusion(probe_buyer),"real_unit")
    call ProbeAssert(UnitUseItemTarget(probe_buyer,wand,probe_buyer),"wand_use")
    call ProbeAssert(GetItemCharges(wand)==2 and GetUnitFoodUsed(probe_illusion)==5,"wand_charge")
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,probe_illusion,EVENT_UNIT_DAMAGED)
    call TriggerAddAction(t,function ProbeDamage)
    call ProbeAssert(UnitDamageTarget(probe_buyer,probe_illusion,100,false,false,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL,WEAPON_TYPE_WHOKNOWS),"damage_illusion")
    call ProbeAssert(GetUnitState(probe_illusion,UNIT_STATE_LIFE)==550,"illusion_taken")
    call ProbeAssert(UnitDamageTarget(probe_illusion,probe_buyer,100,false,false,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL,WEAPON_TYPE_WHOKNOWS),"damage_by_illusion")
    call ProbeAssert(GetUnitState(probe_buyer,UNIT_STATE_LIFE)==800,"illusion_dealt")
    set potion=UnitAddItemById(probe_buyer,'phea')
    call ProbeAssert(UnitUseItem(probe_buyer,potion),"heal_use")
    call ProbeAssert(GetUnitState(probe_buyer,UNIT_STATE_LIFE)==850,"heal_result")
    set potion=UnitAddItemById(probe_buyer,'phea')
    call ProbeAssert(not UnitUseItem(probe_buyer,potion),"shared_cooldown")
    call UnitPauseTimedLife(probe_illusion,true)
endfunction
function ProbeResumeIllusion takes nothing returns nothing
    call UnitPauseTimedLife(probe_illusion,false)
endfunction
function ProbeQuest takes nothing returns nothing
    local quest q=CreateQuest()
    local questitem objective=QuestCreateItem(q)
    call ProbeAssert(GetItemPlayer(null)==null and GetItemUserData(null)==0 and GetItemCharges(null)==0,"empty_item_slot")
    call ProbeAssert(IsUnitType(probe_buyer,UNIT_TYPE_MELEE_ATTACKER),"source_melee_class")
    call QuestSetTitle(q,"Source quest consumer")
    call QuestSetDescription(q,"First line|nSecond line")
    call QuestSetIconPath(q,"ReplaceableTextures\\\\CommandButtons\\\\BTNFootman.blp")
    call QuestSetRequired(q,false)
    call QuestSetDiscovered(q,true)
    call QuestSetEnabled(q,true)
    call QuestItemSetDescription(objective,"Complete the objective")
    call QuestItemSetCompleted(objective,true)
    call QuestSetCompleted(q,true)
    call ProbeAssert(IsQuestItemCompleted(objective) and IsQuestCompleted(q) and IsQuestDiscovered(q) and not IsQuestRequired(q),"quest_state")
    call FlashQuestDialogButton()
    call ForceQuestDialogUpdate()
endfunction
function ProbeBlight takes nothing returns nothing
    local real x=GetStartLocationX(0)+256
    local real y=GetStartLocationY(0)+256
    local rect r=Rect(x-128,y-128,x+256,y+256)
    call SetBlightRect(Player(0),r,false)
    call ProbeAssert(not IsPointBlighted(x+32,y+32),"clear_blight")
    call SetBlightPoint(Player(0),x,y,true)
    call ProbeAssert(IsPointBlighted(x+32,y+32),"point_blight")
    set probe_acolyte=CreateUnit(Player(0),'uaco',x+32,y+32,270)
    call SetUnitAcquireRange(probe_acolyte,0)
    call SetUnitState(probe_acolyte,UNIT_STATE_LIFE,100)
    call RemoveRect(r)
endfunction
function ProbeRepeatBlight takes nothing returns nothing
    call SetBlightPoint(Player(0),GetStartLocationX(0)+256,GetStartLocationY(0)+256,true)
endfunction
function ProbeClearBlight takes nothing returns nothing
    call SetBlight(Player(0),GetUnitX(probe_acolyte),GetUnitY(probe_acolyte),256,false)
    call ProbeAssert(not IsPointBlighted(GetUnitX(probe_acolyte),GetUnitY(probe_acolyte)),"remove_blight")
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local real x=GetStartLocationX(0)
    local real y=GetStartLocationY(0)
    local trigger t=CreateTrigger()
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,10000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,10000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_FOOD_CAP,100)
    set probe_barracks=CreateUnit(Player(0),'hbar',x,y,270)
    set probe_buyer=CreateUnit(Player(0),'Hpal',x+128,y,270)
    set probe_shop=CreateUnit(Player(15),'nmer',x+256,y,270)
    call TriggerRegisterUnitEvent(t,probe_shop,EVENT_UNIT_SELL)
    call TriggerRegisterUnitEvent(t,probe_shop,EVENT_UNIT_SELL_ITEM)
    call TriggerAddAction(t,function ProbeSale)
    call AddUnitToStock(probe_shop,'hfoo',1,1)
    call ProbeAssert(IssueNeutralTargetOrderById(Player(0),probe_shop,'hfoo',probe_buyer),"unit_sale")
    call ProbeAssert(not IssueNeutralImmediateOrderById(Player(0),probe_shop,'hfoo'),"empty_stock")
    call AddItemToStock(probe_shop,'ratf',1,1)
    call ProbeAssert(IssueNeutralTargetOrderById(Player(0),probe_shop,'ratf',probe_buyer),"item_sale")
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,probe_barracks,EVENT_UNIT_TRAIN_START)
    call TriggerRegisterUnitEvent(t,probe_barracks,EVENT_UNIT_TRAIN_FINISH)
    call TriggerRegisterUnitEvent(t,probe_barracks,EVENT_UNIT_TRAIN_CANCEL)
    call TriggerAddAction(t,function ProbeTrain)
    call ProbeAssert(IssuePointOrder(probe_barracks,"setrally",x+512,y),"rally")
    call ProbeAssert(IssueImmediateOrderById(probe_barracks,'hfoo'),"first_train")
    call ProbeAssert(IssueImmediateOrderById(probe_barracks,'hfoo'),"second_train")
    call ProbeAssert(IssueImmediateOrder(probe_barracks,"cancel"),"cancel")
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', required=True, type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/commerce-fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    ability_id = b'A0IL'
    changes = b''.join(field + struct.pack('<III f', 2, 1, slot, value) + ability_id for field, slot, value in [(b'Iild', 1, .5), (b'Iilw', 2, 3.), (b'adur', 0, 2.), (b'ahdu', 0, 2.)])
    files['war3map.w3a'] = struct.pack('<III', 2, 0, 1) + b'AIil' + ability_id + struct.pack('<I', 4) + changes
    files['war3map.w3t'] = struct.pack('<II', 2, 1) + b'will' + bytes(4) + struct.pack('<I', 1) + b'iabi' + struct.pack('<I', 3) + ability_id + bytes(1) + b'will' + struct.pack('<I', 0)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))
    print('source_sha256='+hashlib.sha256(original).hexdigest())


if __name__ == '__main__':
    main()
