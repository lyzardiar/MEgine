"""Author: MiYu. Copy original BootyBay geometry and replace only its map script for focused commerce checks."""
import argparse
import hashlib
import importlib.util
import io
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SCRIPT = '''globals
unit probe_barracks=null
unit probe_buyer=null
unit probe_shop=null
integer probe_sold=0
integer probe_items=0
integer probe_started=0
integer probe_finished=0
integer probe_cancelled=0
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
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))
    print('source_sha256='+hashlib.sha256(original).hexdigest())


if __name__ == '__main__':
    main()
