// Author: MiYu. Per-player source AI VM, orders, harvest goals and captain state share the live map session.
#pragma once
#include "jass_runtime.h"
#include "world.h"
#include <array>
#include <deque>
#include <map>
#include <set>

namespace war3 {
struct AIGuardPost {std::uint32_t type=0,unit=0;WorldPoint point;unsigned losses=0;bool filled=false,requested=false;};
struct AIZeppelinPurchase {std::uint32_t shop=0,buyer=0;double deadline=0;std::uint64_t revision=0;};
struct AIItemPurchase {std::uint32_t shop=0,buyer=0,item=0;double deadline=0;std::uint64_t revision=0;};
struct AIZeppelinWave {std::uint64_t ticket=0;WorldPoint destination;double deadline=0;bool departing=false;std::map<std::uint32_t,std::uint32_t> passengers;std::set<std::uint32_t> carriers;};
struct AICaptainRoute {std::uint64_t ticket=0;std::vector<WorldPoint> points;std::map<std::uint32_t,size_t> members;};
struct ScriptAI {
    enum Policy {DefendPlayer,GroupsFlee,HeroesBuy,HeroesFlee,HeroesTake,IgnoreInjured,PeonsRepair,SmartArtillery,TargetHeroes,UnitsFlee,WatchMega,PolicyCount};
    unsigned owner=0;
    bool campaign=false,gathering=true,retreating=false,homeOverride=false,defenseHomeOverride=false;
    std::string file,origin;
    std::unique_ptr<jass::Runtime> runtime;
    std::array<bool,PolicyCount> policies{};
    std::vector<std::uint32_t> towns;
    std::map<int,std::pair<int,int>> harvesting;
    std::map<std::uint32_t,unsigned> assault,defenders;
    std::set<std::uint32_t> captain,defenderUnits,guardUnits;
    std::map<std::uint32_t,int> suicideUnits;
    std::map<std::uint64_t,AIGuardPost> guards;
    std::uint64_t guardTicket=0;
    bool fillGuards=false,groupTimedLife=true,newHeroes=true,slowChopping=false,captainChanges=true;
    int replacementCount=0;
    std::optional<WorldPoint> townSpot;
    std::optional<AIZeppelinPurchase> zeppelinPurchase;
    std::optional<AIItemPurchase> itemPurchase;
    std::optional<AIZeppelinWave> zeppelinWave;
    std::uint64_t zeppelinWaveTicket=0;
    bool amphibious=false,pathingDisabled=false;
    std::optional<AICaptainRoute> captainRoute;
    std::uint64_t captainRouteTicket=0;
    bool reservesUnit(std::uint32_t unit) const {return (zeppelinPurchase && zeppelinPurchase->buyer==unit) || (itemPurchase && itemPurchase->buyer==unit);}
    bool waveUnit(std::uint32_t unit) const {return zeppelinWave && (zeppelinWave->passengers.contains(unit) || zeppelinWave->carriers.contains(unit));}
    std::deque<std::pair<int,int>> commands;
    WorldPoint home,defenseHome,townHome,goal,stage;
    std::uint32_t allianceTarget=0,enemyBase=0,expansion=0,hero=0;
    jass::Value heroLevels;
    double nextTick=0,nextItems=0;
    std::vector<std::string> diagnostics;
};
}
