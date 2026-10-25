globals
    constant integer   bj_MAX_PLAYERS                   =  12
    constant integer   bj_MELEE_STARTING_GOLD_V0        = 750
    constant integer   bj_MELEE_STARTING_LUMBER_V0      = 200
    constant integer   bj_MELEE_STARTING_GOLD_V1        = 500
    constant integer   bj_MELEE_STARTING_LUMBER_V1      = 150
endglobals

function MeleeStartingResources takes nothing returns nothing
    local integer index
    local player  indexPlayer
    local version v
    local integer startingGold
    local integer startingLumber

    set v = VersionGet()
    if (v == VERSION_REIGN_OF_CHAOS) then
        set startingGold = bj_MELEE_STARTING_GOLD_V0
        set startingLumber = bj_MELEE_STARTING_LUMBER_V0
    else
        set startingGold = bj_MELEE_STARTING_GOLD_V1
        set startingLumber = bj_MELEE_STARTING_LUMBER_V1
    endif

    // Set each player's starting resources.
    set index = 0
    loop
        set indexPlayer = Player(index)
        if (GetPlayerSlotState(indexPlayer) == PLAYER_SLOT_STATE_PLAYING) then
            call SetPlayerState(indexPlayer, PLAYER_STATE_RESOURCE_GOLD, startingGold)
            call SetPlayerState(indexPlayer, PLAYER_STATE_RESOURCE_LUMBER, startingLumber)
        endif

        set index = index + 1
        exitwhen index == bj_MAX_PLAYERS
    endloop
endfunction
