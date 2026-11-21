"""Author: MiYu. Build the self-contained map for a two-process save and resume check."""

import argparse
from pathlib import Path
import struct
import sys


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from warcraft_mpq_writer import build_archive


SCRIPT = b'''globals
    unit captain=null
    unit barracks=null
    quest escort=null
    boolean trainingStarted=false
    boolean restored=false
    integer trained=0
endglobals

function OnTrain takes nothing returns nothing
    if GetTrainedUnitType()=='hfoo' then
        set trained=trained+1
        if restored then
            call DisplayTimedTextToPlayer(Player(0),0,0,30,"The restored training queue completed.")
        endif
    endif
endfunction

function OnLoad takes nothing returns nothing
    local item supplies=UnitItemInSlot(captain,0)
    if GetHeroLevel(captain)==3 and GetUnitUserData(captain)==172 and supplies!=null and GetItemTypeId(supplies)=='phea' and GetItemCharges(supplies)==1 and IsQuestDiscovered(escort) and IsQuestEnabled(escort) and not IsQuestCompleted(escort) and trainingStarted and trained==0 then
        set restored=true
        call DisplayTimedTextToPlayer(Player(0),0,0,45,"Checkpoint verified. Wait for the recruits, then move west of the tower.")
    else
        call DisplayTimedTextToPlayer(Player(0),0,0,45,"Checkpoint state did not match the active mission.")
    endif
endfunction

function Patrol takes nothing returns nothing
    if not trainingStarted and GetUnitX(captain)>1150 then
        if IssueImmediateOrderById(barracks,'hfoo') then
            set trainingStarted=IssueImmediateOrderById(barracks,'hfoo')
            call DisplayTimedTextToPlayer(Player(0),0,0,45,"Two recruits ordered. Save the game before either finishes.")
        endif
    endif
    if restored and trained==2 and GetUnitX(captain)<860 and not IsQuestCompleted(escort) then
        call QuestSetCompleted(escort,true)
        call RemovePlayer(Player(0),PLAYER_GAME_RESULT_VICTORY)
        call EndGame(true)
    endif
endfunction

function config takes nothing returns nothing
endfunction

function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    local timer patrol=CreateTimer()
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_FOOD_CAP,30)
    set captain=CreateUnit(Player(0),'Hpal',1024,1024,0)
    call SetHeroLevel(captain,3,false)
    call SetUnitUserData(captain,172)
    call UnitAddItemById(captain,'phea')
    set barracks=CreateUnit(Player(0),'hbar',640,832,0)
    call CreateUnit(Player(0),'htow',992,768,0)
    set escort=CreateQuest()
    call QuestSetTitle(escort,"Escort the Recruits")
    call QuestSetDescription(escort,"Lead the captain east to call up recruits. After resuming the checkpoint, move west with both recruits ready.")
    call QuestSetRequired(escort,true)
    call QuestSetDiscovered(escort,true)
    call QuestSetEnabled(escort,true)
    call TriggerRegisterUnitEvent(t,barracks,EVENT_UNIT_TRAIN_FINISH)
    call TriggerAddAction(t,function OnTrain)
    set t=CreateTrigger()
    call TriggerRegisterGameEvent(t,EVENT_GAME_LOADED)
    call TriggerAddAction(t,function OnLoad)
    call TimerStart(patrol,0.25,true,function Patrol)
endfunction
'''


def pack(fmt, *values):
    return struct.pack('<' + fmt, *values)


def fixture():
    width, height = 16, 16
    info = pack('3i', 18, 0, 6059) + b'Checkpoint Patrol\0MEgine\0\0\0'
    info += pack('8f4i2iI', 0, 0, 2048, 2048, 0, 2048, 2048, 0, 0, 0, 0, 0, width, height, 0)
    info += b'L' + pack('i', -1) + b'\0' * 3 + pack('i', -1) + b'\0' * 3
    info += pack('5i', 1, 0, 1, 1, 1) + b'Captain\0' + pack('2f2I', 1024, 1024, 0, 0) + pack('4i', 0, 0, 0, 0)
    terrain = b'W3E!' + pack('i', 11) + b'L' + pack('2i', 0, 1) + b'Ldrt' + pack('i', 1) + b'CLdi'
    terrain += pack('2i2f', width + 1, height + 1, 0, 0)
    terrain += pack('2H3B', 8192, 8192, 0, 0, 2) * ((width + 1) * (height + 1))
    return build_archive({
        'war3map.w3i': info,
        'war3map.w3e': terrain,
        'war3map.wpm': b'MP3W' + pack('3i', 0, width * 4, height * 4) + b'\0' * (width * height * 16),
        'war3map.j': SCRIPT,
    })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, nargs='?', default=ROOT / 'tmp/docs-artifacts/war3/p0-save-resume/checkpoint-patrol.w3m')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(fixture())
