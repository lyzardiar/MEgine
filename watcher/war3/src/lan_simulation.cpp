// Author: MiYu. Validate complete W3GS slots before consuming supported player actions.
#include "lan_simulation.h"
#include "session.h"
#include <bit>
#include <cmath>
#include <utility>

namespace war3 {
namespace {
bool finitePoint(std::uint32_t x,std::uint32_t y){return std::isfinite(std::bit_cast<float>(x)) && std::isfinite(std::bit_cast<float>(y));}
std::optional<PlayerCommandKind> groundKind(std::uint32_t order){switch(order){case 851986:return PlayerCommandKind::GroundMove;case 851983:return PlayerCommandKind::GroundAttack;case 851990:return PlayerCommandKind::GroundPatrol;default:return {};}}
bool targetOrder(std::uint32_t order){return order==851971 || order==851983 || order==851986 || order==852018 || order==852024 || order==852147 || order==852148;}
}
LanSimulation::LanSimulation(ScriptSession& session,ObjectResolver resolve):session_(session),resolve_(std::move(resolve)),driver_(session,[this](const LanAction& action){return validate(action);},[this](ScriptSession& target,const LanAction& action){return apply(target,action);}){}
bool LanSimulation::validate(const LanAction& action){
    auto player=session_.networkPlayer(action.playerId);if(!player)return false;auto events=decodeLanActions(action.bytes);std::vector<Event> prepared;prepared.reserve(events.size());
    for(const auto& event:events){
        if(std::holds_alternative<LanActionPause>(event)){prepared.emplace_back(LanActionPause{});continue;}
        if(std::holds_alternative<LanActionResume>(event)){prepared.emplace_back(LanActionResume{});continue;}
        if(auto selection=std::get_if<LanActionSelection>(&event)){
            if(!resolve_)return false;Selection item{*player,selection->mode==1,{}};item.units.reserve(selection->objects.size());for(auto object:selection->objects){auto handle=resolve_(object);if(!handle || !session_.units().contains(*handle))return false;item.units.push_back(*handle);}prepared.emplace_back(std::move(item));continue;
        }
        auto ability=std::get_if<LanActionAbility>(&event);if(!ability || !resolve_ || (ability->flags&~0x0008u))return false;Command command;command.player=*player;command.order=ability->order;command.xBits=ability->xBits;command.yBits=ability->yBits;
        if(ability->opcode==0x10){if(ability->order==851972)command.kind=PlayerCommandKind::Stop;else if(ability->order==851993)command.kind=PlayerCommandKind::Hold;else return false;}
        else if(ability->opcode==0x11){auto kind=groundKind(ability->order);if(!kind || !finitePoint(ability->xBits,ability->yBits))return false;command.kind=*kind;}
        else if(ability->opcode==0x12){if(ability->target.first==0xffffffffu && ability->target.second==0xffffffffu){auto kind=groundKind(ability->order);if(!kind || !finitePoint(ability->xBits,ability->yBits))return false;command.kind=*kind;}else{if(!targetOrder(ability->order))return false;auto handle=resolve_(ability->target);if(!handle || (!session_.units().contains(*handle) && !session_.items().contains(*handle) && !session_.destructables().contains(*handle)))return false;command.kind=PlayerCommandKind::TargetOrder;command.target=*handle;}}
        else return false;prepared.emplace_back(command);
    }
    decoded_.push_back(std::move(prepared));return true;
}
bool LanSimulation::apply(ScriptSession& session,const LanAction&){
    if(cursor_>=decoded_.size())return false;
    for(const auto& event:decoded_[cursor_++]){
        if(std::holds_alternative<LanActionPause>(event))session.pause(true);
        else if(std::holds_alternative<LanActionResume>(event))session.pause(false);
        else if(auto selection=std::get_if<Selection>(&event)){for(auto id:selection->units){session.setPlayerUnitSelected(selection->player,id,selection->add);if(driver_.failed())return false;}}
        else if(auto source=std::get_if<Command>(&event)){PlayerCommand command;command.player=source->player;command.kind=source->kind;command.order=source->order;command.target=source->target;command.xBits=source->xBits;command.yBits=source->yBits;auto units=session.playerSelection(source->player);for(auto id:units){command.units={id};dispatchPlayerCommand(session,command);if(driver_.failed())return false;}}
        else return false;if(driver_.failed())return false;
    }
    return true;
}
LanStepResult LanSimulation::consume(std::uint64_t sequence,const LanTimeSlot& slot){
    if(consuming_)return driver_.consume(sequence,slot);consuming_=true;struct Reset{bool& value;~Reset(){value=false;}}reset{consuming_};decoded_.clear();cursor_=0;auto result=driver_.consume(sequence,slot);decoded_.clear();cursor_=0;return result;
}
}
