// Author: MiYu. Original Acoi/Adec life, identity, food and partner-motion measurement.
globals
    timer clock = null
    timer phaseTimer = null
    unit archer = null
    unit hippo = null
    unit rider = null
    gamecache cache = null
    integer caseIndex = 0
    integer phase = 0
    integer lineCount = 0
    string array lines
    real x = @X@
    real y = @Y@
endglobals

function Text takes string value returns nothing
    set lines[lineCount] = value
    set lineCount = lineCount + 1
    call Preload(value)
endfunction

function IntegerRecord takes string key, integer value returns nothing
    call StoreInteger(cache, "measurements", key, value)
    call Text("MENGINE|" + key + "=" + I2S(value))
endfunction

function Record takes string key, real value returns nothing
    call StoreReal(cache, "measurements", key, value)
    call Text("MENGINE|" + key + "=" + R2S(value))
endfunction

function State takes string name, unit u returns nothing
    call IntegerRecord(name + ".type", GetUnitTypeId(u))
    call IntegerRecord(name + ".id", GetHandleId(u))
    call Record(name + ".hp", GetUnitState(u, UNIT_STATE_LIFE))
    call Record(name + ".maxHp", GetUnitState(u, UNIT_STATE_MAX_LIFE))
    call Record(name + ".x", GetUnitX(u))
    call Record(name + ".y", GetUnitY(u))
    call Record(name + ".height", GetUnitFlyHeight(u))
    call IntegerRecord(name + ".order", GetUnitCurrentOrder(u))
    call IntegerRecord(name + ".owner", GetPlayerId(GetOwningPlayer(u)))
    if IsUnitHidden(u) then
        call Record(name + ".hidden", 1.0)
    else
        call Record(name + ".hidden", 0.0)
    endif
endfunction

function FindRider takes nothing returns nothing
    if GetUnitTypeId(GetEnumUnit()) == 'ehpr' then
        set rider = GetEnumUnit()
    endif
endfunction

function FindArcher takes nothing returns nothing
    if GetUnitTypeId(GetEnumUnit()) == 'earc' then
        set archer = GetEnumUnit()
    elseif GetUnitTypeId(GetEnumUnit()) == 'ehip' then
        set hippo = GetEnumUnit()
    endif
endfunction

function Population takes string prefix returns nothing
    call Record(prefix + ".food", I2R(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_FOOD_USED)))
endfunction

function Tick takes nothing returns nothing
    local string prefix = "case." + I2S(caseIndex)
    local group g = CreateGroup()
    local boolean accepted = false
    local integer i = 0
    if phase == 0 then
        set archer = CreateUnit(Player(0), 'earc', x, y, 0.0)
        set hippo = CreateUnit(Player(0), 'ehip', x + 400.0, y, 180.0)
        if caseIndex == 1 then
            call SetUnitState(archer, UNIT_STATE_LIFE, 100.0)
            call SetUnitState(hippo, UNIT_STATE_LIFE, 200.0)
        elseif caseIndex == 2 then
            call SetUnitState(archer, UNIT_STATE_LIFE, 200.0)
            call SetUnitState(hippo, UNIT_STATE_LIFE, 100.0)
        endif
        call State(prefix + ".archer.before", archer)
        call State(prefix + ".hippo.before", hippo)
        call Population(prefix + ".before")
        call Record(prefix + ".mount.start", TimerGetElapsed(clock))
        if caseIndex == 3 then
            set accepted = IssueImmediateOrder(hippo, "coupleinstant")
        else
            set accepted = IssueTargetOrder(archer, "coupletarget", hippo)
        endif
        if accepted then
            call Record(prefix + ".mount.accepted", 1.0)
        else
            call Record(prefix + ".mount.accepted", 0.0)
        endif
        set phase = 1
        call TimerStart(phaseTimer, 0.1, false, function Tick)
    elseif phase == 1 then
        call State(prefix + ".archer.approach", archer)
        call State(prefix + ".hippo.approach", hippo)
        set phase = 2
        call TimerStart(phaseTimer, 5.9, false, function Tick)
    elseif phase == 2 then
        call GroupEnumUnitsOfPlayer(g, Player(0), null)
        set rider = null
        call ForGroup(g, function FindRider)
        call Record(prefix + ".mount.end", TimerGetElapsed(clock))
        call State(prefix + ".archer.after", archer)
        call State(prefix + ".hippo.after", hippo)
        call State(prefix + ".rider.after", rider)
        call Population(prefix + ".mounted")
        if rider != null then
            call SetUnitState(rider, UNIT_STATE_LIFE, 300.0)
            call State(prefix + ".rider.wounded", rider)
            call Record(prefix + ".dismount.start", TimerGetElapsed(clock))
            set accepted = IssueImmediateOrder(rider, "decouple")
            if accepted then
                call Record(prefix + ".dismount.accepted", 1.0)
            else
                call Record(prefix + ".dismount.accepted", 0.0)
            endif
        endif
        set phase = 3
        // Observe after the source 30-second shared ability cooldown.
        call TimerStart(phaseTimer, 31.0, false, function Tick)
    elseif phase == 3 then
        if rider != null and GetUnitTypeId(rider) == 'ehpr' then
            // The immediate order above may be rejected by the mounting cooldown.
            if IssueImmediateOrder(rider, "decouple") then
                call Record(prefix + ".dismount.retry", 1.0)
            else
                call Record(prefix + ".dismount.retry", 0.0)
            endif
        else
            call Record(prefix + ".dismount.retry", 0.0)
        endif
        set phase = 4
        call TimerStart(phaseTimer, 2.0, false, function Tick)
    else
        call GroupEnumUnitsOfPlayer(g, Player(0), null)
        set archer = null
        set hippo = null
        call ForGroup(g, function FindArcher)
        call Record(prefix + ".dismount.end", TimerGetElapsed(clock))
        call State(prefix + ".archer.return", archer)
        call State(prefix + ".hippo.return", hippo)
        call Population(prefix + ".returned")
        call RemoveUnit(archer)
        call RemoveUnit(hippo)
        if rider != null and GetUnitTypeId(rider) == 'ehpr' then
            call RemoveUnit(rider)
        endif
        set caseIndex = caseIndex + 1
        set phase = 0
        if caseIndex < 4 then
            call TimerStart(phaseTimer, 1.0, false, function Tick)
        else
            call Record("completed", 1.0)
            call PreloadGenEnd("@OUTPUT@")
            call PreloadGenClear()
            call PreloadGenStart()
            loop
                exitwhen i >= lineCount
                call Preload(lines[i])
                set i = i + 1
            endloop
            call PreloadGenEnd("CustomMapData\\@TAG@.pld")
            call SaveGameCache(cache)
            call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 60.0, "MEngine coupling measurements completed: @TAG@")
        endif
    endif
    call DestroyGroup(g)
    set g = null
endfunction

function main takes nothing returns nothing
    call InitBlizzard()
    call SetCameraPosition(x, y)
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetFloatGameState(GAME_STATE_TIME_OF_DAY, 12.0)
    call SetTimeOfDayScale(0.0)
    call SetPlayerTechResearched(Player(0), 'Reht', 1)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_FOOD_CAP, 100)
    set cache = InitGameCache("@TAG@.w3v")
    set clock = CreateTimer()
    set phaseTimer = CreateTimer()
    call TimerStart(clock, 3600.0, false, null)
    call PreloadGenClear()
    call PreloadGenStart()
    call Text("MENGINE|tag=@TAG@")
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 20.0, "MEngine coupling reference started: @TAG@")
    call TimerStart(phaseTimer, 1.0, false, function Tick)
endfunction

function config takes nothing returns nothing
    call SetMapName("MEngine original Hippogryph reference")
    call SetPlayers(1)
    call SetTeams(1)
    call DefineStartLocation(0, x, y)
    call SetPlayerStartLocation(Player(0), 0)
    call SetPlayerRacePreference(Player(0), RACE_PREF_NIGHTELF)
    call SetPlayerRaceSelectable(Player(0), false)
    call SetPlayerController(Player(0), MAP_CONTROL_USER)
    call SetPlayerSlotAvailable(Player(0), MAP_CONTROL_USER)
endfunction
