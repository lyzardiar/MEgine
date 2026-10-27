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
struct ScriptAI {
    enum Policy {DefendPlayer,GroupsFlee,HeroesBuy,HeroesFlee,HeroesTake,IgnoreInjured,PeonsRepair,SmartArtillery,TargetHeroes,UnitsFlee,WatchMega,PolicyCount};
    unsigned owner=0;
    bool campaign=false,gathering=true,retreating=false,homeOverride=false;
    std::string file,origin;
    std::unique_ptr<jass::Runtime> runtime;
    std::array<bool,PolicyCount> policies{};
    std::vector<std::uint32_t> towns;
    std::map<int,std::pair<int,int>> harvesting;
    std::map<std::uint32_t,unsigned> assault,defenders;
    std::set<std::uint32_t> captain,guardUnits;
    std::map<std::uint64_t,AIGuardPost> guards;
    std::uint64_t guardTicket=0;
    bool fillGuards=false,groupTimedLife=true;
    int replacementCount=0;
    std::optional<WorldPoint> townSpot;
    std::deque<std::pair<int,int>> commands;
    WorldPoint home,goal,stage;
    std::uint32_t allianceTarget=0,enemyBase=0,expansion=0,hero=0;
    jass::Value heroLevels;
    double nextTick=0,nextItems=0;
    std::vector<std::string> diagnostics;
};
}
