"""Author: MiYu. Build a three-player fixture for extended LAN synchronization."""

import argparse
from pathlib import Path
import struct
import sys


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from warcraft_mpq_writer import build_archive


SCRIPT = b'''globals
    unit builder=null
    unit barracks=null
    unit captain=null
    unit escort=null
    item potion=null
    integer buildings=0
    integer recruits=0
    integer casts=0
    integer itemsUsed=0
    integer wins=0
    integer winner=-1
endglobals

function BuildComplete takes nothing returns nothing
    if GetUnitTypeId(GetConstructedStructure())=='hhou' then
        set buildings=buildings+1
    endif
endfunction

function TrainComplete takes nothing returns nothing
    if GetTrainedUnitType()=='hfoo' then
        set recruits=recruits+1
    endif
endfunction

function CastComplete takes nothing returns nothing
    if GetSpellAbilityId()=='AHhb' and GetSpellTargetUnit()==escort then
        set casts=casts+1
    endif
endfunction

function ItemUsed takes nothing returns nothing
    if GetManipulatedItem()==potion then
        set itemsUsed=itemsUsed+1
    endif
endfunction

function Victory takes nothing returns nothing
    set wins=wins+1
    set winner=GetPlayerId(GetWinningPlayer())
endfunction

function CheckObjective takes nothing returns nothing
    if buildings==1 and recruits==6 and casts==1 and itemsUsed==1 and GetUnitY(captain)>1664 then
        call PauseTimer(GetExpiredTimer())
        call RemovePlayer(Player(0),PLAYER_GAME_RESULT_DEFEAT)
        call RemovePlayer(Player(1),PLAYER_GAME_RESULT_DEFEAT)
        call RemovePlayer(Player(2),PLAYER_GAME_RESULT_VICTORY)
        call EndGame(true)
    endif
endfunction

function config takes nothing returns nothing
endfunction

function main takes nothing returns nothing
    local trigger t=CreateTrigger()
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,1500)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,1500)
    call SetPlayerState(Player(1),PLAYER_STATE_RESOURCE_GOLD,1500)
    call SetPlayerState(Player(1),PLAYER_STATE_RESOURCE_LUMBER,1500)
    call SetPlayerState(Player(1),PLAYER_STATE_RESOURCE_FOOD_CAP,30)
    set builder=CreateUnit(Player(0),'hpea',320,640,0)
    call CreateUnit(Player(0),'htow',320,320,0)
    set barracks=CreateUnit(Player(1),'hbar',1248,352,0)
    call CreateUnit(Player(1),'htow',1664,352,0)
    set captain=CreateUnit(Player(2),'Hpal',1344,1088,0)
    set escort=CreateUnit(Player(2),'hfoo',1488,1088,0)
    call SelectHeroSkill(captain,'AHhb')
    call SetUnitState(captain,UNIT_STATE_LIFE,150)
    call SetUnitState(escort,UNIT_STATE_LIFE,70)
    set potion=UnitAddItemById(captain,'phea')
    call TriggerRegisterPlayerUnitEvent(t,Player(0),EVENT_PLAYER_UNIT_CONSTRUCT_FINISH,null)
    call TriggerAddAction(t,function BuildComplete)
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,barracks,EVENT_UNIT_TRAIN_FINISH)
    call TriggerAddAction(t,function TrainComplete)
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,captain,EVENT_UNIT_SPELL_EFFECT)
    call TriggerAddAction(t,function CastComplete)
    set t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,captain,EVENT_UNIT_USE_ITEM)
    call TriggerAddAction(t,function ItemUsed)
    set t=CreateTrigger()
    call TriggerRegisterGameEvent(t,EVENT_GAME_VICTORY)
    call TriggerAddAction(t,function Victory)
    call TimerStart(CreateTimer(),0.25,true,function CheckObjective)
endfunction
'''


def pack(fmt, *values):
    return struct.pack('<' + fmt, *values)


def fixture():
    size = 20
    info = pack('3i', 18, 0, 6059) + b'Quartermaster Trial\0MEgine\0\0\0'
    info += pack('8f4i2iI', 0, 0, 2560, 2560, 0, 2560, 2560, 0, 0, 0, 0, 0, size, size, 0)
    info += b'L' + pack('i', -1) + b'\0' * 3 + pack('i', -1) + b'\0' * 3
    info += pack('i', 3)
    for player, label, position in [(0, b'Builder', (320, 320)), (1, b'Trainer', (1248, 352)), (2, b'Captain', (1344, 1088))]:
        info += pack('4i', player, 1, 1, 1) + label + b'\0' + pack('2f2I', *position, 0, 0)
    info += pack('4i', 0, 0, 0, 0)
    terrain = b'W3E!' + pack('i', 11) + b'L' + pack('2i', 0, 1) + b'Ldrt' + pack('i', 1) + b'CLdi'
    terrain += pack('2i2f', size + 1, size + 1, 0, 0)
    terrain += pack('2H3B', 8192, 8192, 0, 0, 2) * ((size + 1) * (size + 1))
    return build_archive({
        'war3map.w3i': info,
        'war3map.w3e': terrain,
        'war3map.wpm': b'MP3W' + pack('3i', 0, size * 4, size * 4) + b'\0' * (size * size * 16),
        'war3map.j': SCRIPT,
    })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, nargs='?', default=ROOT / 'tmp/docs-artifacts/war3/p1-lan-long-match/quartermaster.w3m')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(fixture())
