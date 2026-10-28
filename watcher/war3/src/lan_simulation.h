// Author: MiYu. Consume only supported original actions through network time slots.
#pragma once
#include "lan_actions.h"
#include "lan_time_driver.h"
#include "player_commands.h"
#include <map>
#include <set>

namespace war3 {
// Resolver must be read-only and translate an original wire ID to a verified, stable session handle.
// Unsupported actions fail the whole slot before any simulation effects.
class LanSimulation {
public:
    using ObjectResolver=std::function<std::optional<std::uint32_t>(LanObjectId)>;
private:
    struct Selection {unsigned player;bool add;std::vector<std::uint32_t> units;};
    struct Subgroup {unsigned player;std::uint32_t unit,type;};
    struct CancelRevival {unsigned player;std::uint32_t hero;};
    struct Transfer {unsigned player,recipient;int gold,lumber;};
    struct Alliance {unsigned player,recipient,flags;};
    struct Command {unsigned player;PlayerCommandKind kind;std::uint32_t order=0,target=0,xBits=0,yBits=0,expectedUnit=0,queueIndex=0,expectedType=0;bool constructionCancel=false,subgroup=false;};
    using Event=std::variant<LanActionPause,LanActionResume,Selection,Subgroup,Command,CancelRevival,Transfer,Alliance>;
    ScriptSession& session_;
    ObjectResolver resolve_;
    std::vector<std::vector<Event>> decoded_;
    std::map<unsigned,std::set<std::uint32_t>> projectedSelections_;
    std::map<unsigned,std::pair<std::uint32_t,std::uint32_t>> subgroups_,projectedSubgroups_;
    std::size_t cursor_=0;
    bool consuming_=false;
    LanTimeDriver driver_;
    bool validate(const LanAction& action);
    bool apply(ScriptSession& session,const LanAction& action);
public:
    explicit LanSimulation(ScriptSession& session,ObjectResolver resolve={});
    LanSimulation(const LanSimulation&)=delete;
    LanSimulation& operator=(const LanSimulation&)=delete;
    LanSimulation(LanSimulation&&)=delete;
    LanSimulation& operator=(LanSimulation&&)=delete;
    LanStepResult consume(std::uint64_t sequence,const LanTimeSlot& slot);
    bool failed() const{return driver_.failed();}
    const std::string& error() const{return driver_.error();}
    std::uint64_t nextSequence() const{return driver_.nextSequence();}
    std::uint64_t elapsedMilliseconds() const{return driver_.elapsedMilliseconds();}
};
}
