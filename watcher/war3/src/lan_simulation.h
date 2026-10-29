// Author: MiYu. Consume supported classic and explicitly enabled experimental actions through network time slots.
#pragma once
#include "lan_actions.h"
#include "lan_selection_sync.h"
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
    struct Escape {unsigned player;};
    struct Chat {unsigned player;std::string text;ChatChannel channel;};
    struct SelectionSync {std::uint8_t peer;LanActionExperimentalSelection part;};
    struct Purchase {unsigned player;std::uint32_t shop,type;bool item;};
    struct Departure {std::uint8_t peer;};
    struct Subgroup {unsigned player;std::uint32_t unit,type;};
    struct GroupAssign {unsigned player,group;std::vector<std::uint32_t> units;};
    struct GroupSelect {unsigned player;std::vector<std::uint32_t> units;};
    struct CancelRevival {unsigned player;std::uint32_t hero;};
    struct Transfer {unsigned player,recipient;int gold,lumber;};
    struct Alliance {unsigned player,recipient,flags;};
    struct Trackable {std::uint32_t handle;bool hit;};
    struct ExperimentalSpell {PlayerCommand command;};
    struct ExperimentalUnit {PlayerCommand command;std::uint64_t ticket=0;};
    struct ExperimentalDialog {unsigned player;std::uint32_t dialog,button;std::uint64_t generation;};
    struct Command {unsigned player;PlayerCommandKind kind;std::uint32_t order=0,target=0,xBits=0,yBits=0,expectedUnit=0,queueIndex=0,expectedType=0,expectedItem=0,itemSlot=0;bool constructionCancel=false,subgroup=false,itemOrder=false,itemById=false,queued=false;};
    using Event=std::variant<LanActionPause,LanActionResume,Escape,Chat,SelectionSync,Purchase,Departure,Selection,Subgroup,GroupAssign,GroupSelect,Command,CancelRevival,Transfer,Alliance,Trackable,ExperimentalSpell,ExperimentalUnit,ExperimentalDialog>;
    ScriptSession& session_;
    ObjectResolver resolve_;
    std::vector<std::vector<Event>> decoded_;
    LanSelectionSyncProjection projectedSync_;
    std::map<unsigned,std::set<std::uint32_t>> projectedSelections_;
    std::set<std::uint8_t> projectedDepartures_;
    std::map<unsigned,std::array<std::vector<std::uint32_t>,10>> groups_,projectedGroups_;
    std::map<unsigned,std::pair<std::uint32_t,std::uint32_t>> subgroups_,projectedSubgroups_;
    std::size_t cursor_=0;
    bool consuming_=false,experimental_=false;
    LanTimeDriver driver_;
    bool validate(const LanAction& action);
    bool apply(ScriptSession& session,const LanAction& action);
public:
    explicit LanSimulation(ScriptSession& session,ObjectResolver resolve={},bool experimental=false);
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
