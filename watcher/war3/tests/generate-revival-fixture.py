"""Author: MiYu. Controlled map fixture for real hero identities, altar queues and revive event contexts."""
import argparse
import importlib.util
import io
from pathlib import Path

spec=importlib.util.spec_from_file_location('live_fixture',Path(__file__).with_name('generate-live-world-fixture.py'))
fixture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT=Path(__file__).resolve().parents[3]
SCRIPT='''globals
unit hero=null
unit altar=null
unit backup=null
integer revivable=0
integer started=0
integer cancelled=0
integer finished=0
unit awakenShop=null
integer awakenMode=0
integer awakenCalls=0
boolean awakenNested=false
unit purchaseShop=null
integer leaveCount=0
integer leavePlayer=-1
integer leaveSyncDone=0
endglobals
function RecordLeave takes nothing returns nothing
    set leaveCount=leaveCount+1
    set leavePlayer=GetPlayerId(GetTriggerPlayer())
endfunction
function BeginLeaveSync takes nothing returns nothing
    call SyncSelections()
    set leaveSyncDone=1
endfunction
function RemoveShopOnSale takes nothing returns nothing
    call RemoveUnit(purchaseShop)
endfunction
function InstallShopRemovalTest takes unit shop returns nothing
    local trigger t=CreateTrigger()
    set purchaseShop=shop
    call TriggerRegisterUnitEvent(t,shop,EVENT_UNIT_SELL_ITEM)
    call TriggerAddAction(t,function RemoveShopOnSale)
endfunction
function AwakenOrder takes nothing returns nothing
    set awakenCalls=awakenCalls+1
    if awakenMode==1 then
        set awakenNested=IssueNeutralTargetOrderById(Player(0),awakenShop,852466,hero)
    elseif awakenMode==2 then
        call SetHeroLevel(hero,4,false)
    endif
endfunction
function InstallAwakenTest takes unit shop returns nothing
    local trigger t=CreateTrigger()
    set awakenShop=shop
    call TriggerRegisterUnitEvent(t,shop,EVENT_UNIT_ISSUED_TARGET_ORDER)
    call TriggerAddAction(t,function AwakenOrder)
endfunction
function SetAwakenTestMode takes integer mode returns nothing
    set awakenMode=mode
endfunction
function Record takes nothing returns nothing
    if GetTriggerEventId()==EVENT_UNIT_HERO_REVIVABLE then
        if GetRevivableUnit()!=hero then
            call ExecuteFunc("FailureRevivableContext")
        endif
        set revivable=revivable+1
    else
        if GetRevivingUnit()!=hero then
            call ExecuteFunc("FailureRevivingContext")
        endif
        if GetTriggerEventId()==EVENT_UNIT_HERO_REVIVE_START then
            set started=started+1
        elseif GetTriggerEventId()==EVENT_UNIT_HERO_REVIVE_CANCEL then
            set cancelled=cancelled+1
        else
            set finished=finished+1
        endif
    endif
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    local trigger l=CreateTrigger()
    call TriggerRegisterPlayerEvent(l,Player(1),EVENT_PLAYER_LEAVE)
    call TriggerAddAction(l,function RecordLeave)
    set hero=CreateUnit(Player(0),'Hamg',0,0,0)
    set altar=CreateUnit(Player(0),'halt',512,0,0)
    set backup=CreateUnit(Player(0),'halt',-512,0,0)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_FOOD_CAP,100)
    call SetHeroLevel(hero,3,false)
    call SelectHeroSkill(hero,'AHwe')
    call UnitAddItemById(hero,'bspd')
    call TriggerRegisterUnitEvent(t,hero,EVENT_UNIT_HERO_REVIVABLE)
    call TriggerRegisterUnitEvent(t,hero,EVENT_UNIT_HERO_REVIVE_START)
    call TriggerRegisterUnitEvent(t,hero,EVENT_UNIT_HERO_REVIVE_CANCEL)
    call TriggerRegisterUnitEvent(t,hero,EVENT_UNIT_HERO_REVIVE_FINISH)
    call TriggerAddAction(t,function Record)
endfunction
'''
MISC='''[Misc]
ReviveTimeFactor=0.001
ReviveRefundRate=1.0
HeroReviveLifeFactor=0.5
HeroReviveManaStart=0
HeroReviveManaFactor=0.25
'''
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'tmp/docs-artifacts/war3/hero-revival/fixture.w3m')
    args=parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture must stay outside the read-only installation')
    original=(args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset=original.index(b'MPQ\x1a')
    archive=fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]),listfile=False)
    names=fixture.read_archive(archive,'(listfile)').decode('ascii').splitlines()
    files={name:fixture.read_archive(archive,name) for name in names if name and name!='(listfile)'}
    files['war3map.j']=SCRIPT.encode('utf-8')
    files['revival.ai']=b'function main takes nothing returns nothing\ncall SetNewHeroes(false)\nendfunction\n'
    files['war3mapMisc.txt']=MISC.encode('utf-8')
    files.pop('war3map.doo',None)
    pathing=files['war3map.wpm']
    files['war3map.wpm']=pathing[:16]+bytes(len(pathing)-16)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))
if __name__=='__main__':
    main()
