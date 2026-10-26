// Author: MiYu. Session callbacks, filters and deterministic timer/event records.
#pragma once
#include "jass_runtime.h"
#include "world.h"
#include <array>
#include <set>
#include <map>
#include <tuple>

namespace war3 {
struct ScriptBoolean {
    enum class Operation {Code,And,Or,Not};
    Operation operation=Operation::Code;
    jass::Value code;
    std::shared_ptr<ScriptBoolean> left,right;
};
struct ScriptCallback {std::uint32_t owner=0;jass::Value code;std::shared_ptr<ScriptBoolean> condition;};
struct ScriptTimer {
    jass::Real timeout,elapsed;
    bool running=false,periodic=false;
    double due=0,started=0;
    std::uint64_t revision=0;
    jass::Value callback;
};
struct ScriptTrigger {
    bool enabled=true,waitOnSleeps=true;
    unsigned evaluations=0,executions=0;
    std::vector<std::uint32_t> actions,conditions;
};
struct ScriptForce {std::uint32_t players=0;};
struct ScriptEvent {
    enum class Kind {Timer,TimerExpire,Clock,Player,PlayerUnit,Unit,Game,Alliance,PlayerState,RegionEnter,RegionLeave,UnitRange,Chat};
    Kind kind=Kind::Game;
    std::uint32_t owner=0,target=0,event=0,comparison=0;
    std::uint32_t stateKey=0;
    jass::Real limit;
    double due=0,interval=0;
    bool periodic=false;
    std::shared_ptr<ScriptBoolean> filter;
    std::set<std::uint32_t> inside;
    std::string match;
    bool exact=false;
};
struct ScriptContext {
    std::uint32_t trigger=0,event=0,expiredTimer=0,triggerPlayer=0,triggerUnit=0;
    std::uint32_t filterUnit=0,enumUnit=0,filterPlayer=0,enumPlayer=0;
    std::uint32_t previousOwner=0,killingUnit=0;
    std::uint32_t playerState=0;
    std::uint32_t issuedOrder=0;
    WorldPoint orderPoint;
    std::uint32_t triggeringRegion=0,enteringUnit=0,leavingUnit=0,manipulatedItem=0;
    std::uint32_t buyingUnit=0,soldUnit=0,sellingUnit=0,soldItem=0,trainedUnit=0,trainedType=0;
    std::uint32_t learnedSkill=0,learnedLevel=0;
    std::uint32_t summoningUnit=0,summonedUnit=0,damageSource=0,orderTarget=0;
    jass::Real damage;
    std::string chat,chatMatch;
};
struct ScriptTimerDialog {
    std::uint32_t timer=0;
    std::string title;
    std::array<std::uint8_t,4> titleColor{255,255,255,255},timeColor{255,255,255,255};
    bool displayed=false;
    float speed=1;
    std::optional<std::pair<std::uint64_t,float>> realTime;
};
struct ScriptText {unsigned owner=0;float x=0,y=0;double expires=0;std::string text;};
struct ScriptCache {std::string name;std::map<std::tuple<std::string,std::string,std::string>,jass::Value> values;};
struct ScriptHashtable {std::map<std::tuple<std::uint32_t,std::uint32_t,std::string>,jass::Value> values;};
}
