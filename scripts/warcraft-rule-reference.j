// Author: MiYu. Original-game measurements of Druid forms, mana, flight and Dryad poison.
globals
    gamecache referenceCache = null
    timer referenceClock = null
    timer referenceTimer = null
    timer referenceFlight = null
    unit referenceUnit = null
    unit poisonA = null
    unit poisonB = null
    unit poisonTarget = null
    unit poisonControl = null
    trigger poisonTrigger = null
    integer referencePhase = 0
    integer poisonCase = 0
    integer poisonHits = 0
    integer poisonHitsA = 0
    integer poisonHitsB = 0
    integer poisonEvents = 0
    boolean poisonValid = true
    integer flightSamples = 0
    integer lineCount = 0
    string flightName = ""
    string array referenceLines
endglobals

function ReferenceText takes string key, string value returns nothing
    set referenceLines[lineCount] = "MENGINE|" + key + "=" + value
    call Preload(referenceLines[lineCount])
    set lineCount = lineCount + 1
endfunction

function ReferenceRecord takes string key, real value returns nothing
    call StoreReal(referenceCache, "measurements", key, value)
    call ReferenceText(key, R2S(value))
endfunction

function ReferenceState takes string name returns nothing
    call ReferenceRecord(name + ".hp", GetUnitState(referenceUnit, UNIT_STATE_LIFE))
    call ReferenceRecord(name + ".maxHp", GetUnitState(referenceUnit, UNIT_STATE_MAX_LIFE))
    call ReferenceRecord(name + ".mana", GetUnitState(referenceUnit, UNIT_STATE_MANA))
    call ReferenceRecord(name + ".maxMana", GetUnitState(referenceUnit, UNIT_STATE_MAX_MANA))
    call StoreInteger(referenceCache, "unitTypes", name, GetUnitTypeId(referenceUnit))
    call ReferenceText(name + ".type", I2S(GetUnitTypeId(referenceUnit)))
    call ReferenceRecord(name + ".height", GetUnitFlyHeight(referenceUnit))
endfunction

function ReferenceOrder takes string name returns nothing
    if IssueImmediateOrder(referenceUnit, name) then
        call ReferenceRecord("order." + I2S(referencePhase) + "." + name, 1.0)
    else
        call ReferenceRecord("order." + I2S(referencePhase) + "." + name, 0.0)
    endif
endfunction

function ReferenceFlightSample takes nothing returns nothing
    call ReferenceRecord(flightName + "." + I2S(flightSamples) + ".time", TimerGetElapsed(referenceClock))
    call ReferenceRecord(flightName + "." + I2S(flightSamples) + ".height", GetUnitFlyHeight(referenceUnit))
    call ReferenceText(flightName + "." + I2S(flightSamples) + ".type", I2S(GetUnitTypeId(referenceUnit)))
    set flightSamples = flightSamples + 1
    if flightSamples == 30 then
        call PauseTimer(referenceFlight)
    endif
endfunction

function ReferenceFlightStart takes string name returns nothing
    set flightName = name
    set flightSamples = 0
    call ReferenceFlightSample()
    call TimerStart(referenceFlight, 0.1, true, function ReferenceFlightSample)
endfunction

function PoisonFinished takes nothing returns nothing
    call ReferenceRecord("poison." + I2S(poisonCase) + ".endHp", GetUnitState(poisonTarget, UNIT_STATE_LIFE))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".endTime", TimerGetElapsed(referenceClock))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".controlEndHp", GetUnitState(poisonControl, UNIT_STATE_LIFE))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".hitsA", I2R(poisonHitsA))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".hitsB", I2R(poisonHitsB))
    if GetUnitState(poisonTarget, UNIT_STATE_LIFE) <= 0.0 or poisonCase == 0 and poisonHitsA != 1 or poisonCase == 1 and poisonHitsA != 2 or poisonCase == 2 and (poisonHitsA != 1 or poisonHitsB != 1) then
        set poisonValid = false
    endif
    call RemoveUnit(poisonA)
    call RemoveUnit(poisonB)
    call RemoveUnit(poisonTarget)
    call RemoveUnit(poisonControl)
    call DestroyTrigger(poisonTrigger)
    set poisonCase = poisonCase + 1
endfunction

function PoisonBaseline takes nothing returns nothing
    call ReferenceRecord("poison." + I2S(poisonCase) + ".baselineHp", GetUnitState(poisonTarget, UNIT_STATE_LIFE))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".baselineTime", TimerGetElapsed(referenceClock))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".controlBaselineHp", GetUnitState(poisonControl, UNIT_STATE_LIFE))
    call TimerStart(referenceTimer, 4.0, false, function PoisonFinished)
endfunction

function PoisonDamage takes nothing returns nothing
    local unit source = GetEventDamageSource()
    local real sourceNumber = 0.0
    if source == poisonA then
        set sourceNumber = 1.0
    elseif source == poisonB then
        set sourceNumber = 2.0
    endif
    call ReferenceRecord("poison." + I2S(poisonCase) + ".event." + I2S(poisonEvents) + ".damage", GetEventDamage())
    call ReferenceRecord("poison." + I2S(poisonCase) + ".event." + I2S(poisonEvents) + ".source", sourceNumber)
    call ReferenceRecord("poison." + I2S(poisonCase) + ".event." + I2S(poisonEvents) + ".time", TimerGetElapsed(referenceClock))
    set poisonEvents = poisonEvents + 1
    if GetEventDamage() > 8.0 and (source == poisonA or source == poisonB) then
        set poisonHits = poisonHits + 1
        if source == poisonA then
            set poisonHitsA = poisonHitsA + 1
        else
            set poisonHitsB = poisonHitsB + 1
        endif
        call ReferenceRecord("poison." + I2S(poisonCase) + ".hit." + I2S(poisonHits) + ".damage", GetEventDamage())
        call ReferenceRecord("poison." + I2S(poisonCase) + ".hit." + I2S(poisonHits) + ".time", TimerGetElapsed(referenceClock))
        if poisonCase != 1 or poisonHits >= 2 then
            call IssueImmediateOrder(source, "stop")
            call PauseUnit(source, true)
        endif
        if poisonHits == 1 and poisonCase == 0 or poisonHits == 2 and poisonCase != 0 then
            call TimerStart(referenceTimer, 0.25, false, function PoisonBaseline)
        endif
    endif
    set source = null
endfunction

function PoisonStart takes nothing returns nothing
    set poisonHits = 0
    set poisonHitsA = 0
    set poisonHitsB = 0
    set poisonEvents = 0
    set poisonA = CreateUnit(Player(0), 'edry', @X@, @Y@, 0.0)
    set poisonB = null
    set poisonTarget = CreateUnit(Player(1), 'hfoo', @X@ + 160.0, @Y@, 180.0)
    set poisonControl = CreateUnit(Player(1), 'hfoo', @X@ + 400.0, @Y@ + 400.0, 180.0)
    call SetUnitState(poisonControl, UNIT_STATE_LIFE, 300.0)
    call SetUnitAcquireRange(poisonA, 0.0)
    call SetUnitAcquireRange(poisonTarget, 0.0)
    call IssueImmediateOrder(poisonTarget, "holdposition")
    set poisonTrigger = CreateTrigger()
    call TriggerRegisterUnitEvent(poisonTrigger, poisonTarget, EVENT_UNIT_DAMAGED)
    call TriggerAddAction(poisonTrigger, function PoisonDamage)
    call ReferenceRecord("poison." + I2S(poisonCase) + ".startHp", GetUnitState(poisonTarget, UNIT_STATE_LIFE))
    call ReferenceRecord("poison." + I2S(poisonCase) + ".startTime", TimerGetElapsed(referenceClock))
    call IssueTargetOrder(poisonA, "attack", poisonTarget)
    if poisonCase == 2 then
        set poisonB = CreateUnit(Player(0), 'edry', @X@, @Y@ + 80.0, 0.0)
        call SetUnitAcquireRange(poisonB, 0.0)
        call IssueTargetOrder(poisonB, "attack", poisonTarget)
    endif
endfunction

function ReferenceFinish takes nothing returns nothing
    local integer i = 0
    if poisonCase == 3 and poisonValid then
        call ReferenceRecord("completed", 1.0)
    else
        call ReferenceRecord("completed", 0.0)
    endif
    if SaveGameCache(referenceCache) then
        call ReferenceRecord("cacheSaved", 1.0)
    else
        call ReferenceRecord("cacheSaved", 0.0)
    endif
    call PreloadGenEnd("@OUTPUT@")
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i >= lineCount
        call Preload(referenceLines[i])
        set i = i + 1
    endloop
    call PreloadGenEnd("CustomMapData\\@TAG@.pld")
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 120.0, "MEngine original-rule reference completed: @TAG@")
endfunction

function ReferenceTick takes nothing returns nothing
    local real delay = 3.0
    call DestroyTimer(GetExpiredTimer())
    call ReferenceRecord("phase." + I2S(referencePhase) + ".time", TimerGetElapsed(referenceClock))
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 2.5, "MEngine reference phase " + I2S(referencePhase))
    if referencePhase == 0 then
        call SetPlayerTechResearched(Player(0), 'Redc', 2)
        call SetPlayerTechResearched(Player(0), 'Redt', 2)
        set referenceUnit = CreateUnit(Player(0), 'edoc', @X@, @Y@, 0.0)
        call SetUnitState(referenceUnit, UNIT_STATE_LIFE, 100.0)
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 300.0)
        call ReferenceState("claw.fixed.before")
        call ReferenceOrder("bearform")
    elseif referencePhase == 1 then
        call ReferenceState("bear.fixed.after")
        call ReferenceOrder("unbearform")
    elseif referencePhase == 2 then
        call ReferenceState("claw.fixed.return")
        call SetUnitState(referenceUnit, UNIT_STATE_LIFE, GetUnitState(referenceUnit, UNIT_STATE_MAX_LIFE) * 0.5)
        call ReferenceState("claw.half.before")
        call ReferenceOrder("bearform")
    elseif referencePhase == 3 then
        call ReferenceState("bear.half.after")
        call ReferenceOrder("unbearform")
    elseif referencePhase == 4 then
        call ReferenceState("claw.half.return")
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 0.0)
        call ReferenceRecord("claw.regen.start", TimerGetElapsed(referenceClock))
        set delay = 5.0
    elseif referencePhase == 5 then
        call ReferenceState("claw.regen.after")
        call ReferenceRecord("claw.regen.end", TimerGetElapsed(referenceClock))
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 300.0)
        call ReferenceOrder("bearform")
    elseif referencePhase == 6 then
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 0.0)
        call ReferenceRecord("bear.regen.start", TimerGetElapsed(referenceClock))
        set delay = 5.0
    elseif referencePhase == 7 then
        call ReferenceState("bear.regen.after")
        call ReferenceRecord("bear.regen.end", TimerGetElapsed(referenceClock))
        call RemoveUnit(referenceUnit)
        set referenceUnit = CreateUnit(Player(0), 'edot', @X@, @Y@, 0.0)
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 0.0)
        call ReferenceRecord("talon.regen.start", TimerGetElapsed(referenceClock))
        set delay = 5.0
    elseif referencePhase == 8 then
        call ReferenceState("talon.regen.after")
        call ReferenceRecord("talon.regen.end", TimerGetElapsed(referenceClock))
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 300.0)
        call ReferenceOrder("ravenform")
        call ReferenceFlightStart("takeoff")
    elseif referencePhase == 9 then
        call ReferenceState("crow.after")
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 0.0)
        call ReferenceRecord("crow.regen.start", TimerGetElapsed(referenceClock))
        set delay = 5.0
    elseif referencePhase == 10 then
        call ReferenceState("crow.regen.after")
        call ReferenceRecord("crow.regen.end", TimerGetElapsed(referenceClock))
        call SetUnitState(referenceUnit, UNIT_STATE_MANA, 300.0)
        call ReferenceOrder("unravenform")
        call ReferenceFlightStart("landing")
    elseif referencePhase == 11 then
        call ReferenceState("talon.return")
        call RemoveUnit(referenceUnit)
        set referenceUnit = null
        call PoisonStart()
        set delay = 8.0
    elseif referencePhase >= 12 and referencePhase <= 13 then
        if poisonCase == referencePhase - 11 then
            call PoisonStart()
        else
            call ReferenceRecord("poison.timeout", I2R(referencePhase))
            call ReferenceFinish()
            return
        endif
        set delay = 8.0
    else
        call ReferenceFinish()
        return
    endif
    set referencePhase = referencePhase + 1
    call TimerStart(CreateTimer(), delay, false, function ReferenceTick)
endfunction

function main takes nothing returns nothing
    call InitBlizzard()
    call SetCameraPosition(@X@, @Y@)
    call FogEnable(false)
    call FogMaskEnable(false)
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 10.0, "MEngine reference started: @TAG@")
    call SetFloatGameState(GAME_STATE_TIME_OF_DAY, 12.0)
    call SetTimeOfDayScale(0.0)
    set referenceCache = InitGameCache("@TAG@.w3v")
    set referenceClock = CreateTimer()
    set referenceTimer = CreateTimer()
    set referenceFlight = CreateTimer()
    call TimerStart(referenceClock, 3600.0, false, null)
    call PreloadGenClear()
    call PreloadGenStart()
    call TimerStart(CreateTimer(), 1.0, false, function ReferenceTick)
endfunction

function config takes nothing returns nothing
    call SetMapName("MEngine original-rule reference")
    call SetMapDescription("Automatic local Druid and Dryad measurements")
    call SetPlayers(2)
    call SetTeams(2)
    call DefineStartLocation(0, @X@, @Y@)
    call DefineStartLocation(1, @X@ + 1000.0, @Y@)
    call SetPlayerStartLocation(Player(0), 0)
    call SetPlayerRacePreference(Player(0), RACE_PREF_NIGHTELF)
    call SetPlayerRaceSelectable(Player(0), false)
    call SetPlayerController(Player(0), MAP_CONTROL_USER)
    call SetPlayerSlotAvailable(Player(0), MAP_CONTROL_USER)
    call SetPlayerTeam(Player(0), 0)
    call SetPlayerStartLocation(Player(1), 1)
    call SetPlayerRacePreference(Player(1), RACE_PREF_HUMAN)
    call SetPlayerRaceSelectable(Player(1), false)
    call SetPlayerController(Player(1), MAP_CONTROL_COMPUTER)
    call SetPlayerSlotAvailable(Player(1), MAP_CONTROL_COMPUTER)
    call SetPlayerTeam(Player(1), 1)
endfunction
