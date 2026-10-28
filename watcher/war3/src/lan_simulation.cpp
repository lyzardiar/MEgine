// Author: MiYu. Validate complete W3GS slots before consuming supported player actions.
#include "lan_simulation.h"
#include "lan_spell_orders.h"
#include "lan_production_orders.h"
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
    auto player=session_.networkPlayer(action.playerId);if(!player)return false;auto events=decodeLanActions(action.bytes);std::vector<Event> prepared;prepared.reserve(events.size());auto selected=[&]() -> std::set<std::uint32_t>& {auto found=projectedSelections_.find(*player);if(found==projectedSelections_.end())found=projectedSelections_.emplace(*player,session_.playerSelection(*player)).first;return found->second;};
    for(const auto& event:events){
        if(std::holds_alternative<LanActionPause>(event)){prepared.emplace_back(LanActionPause{});continue;}
        if(std::holds_alternative<LanActionResume>(event)){prepared.emplace_back(LanActionResume{});continue;}
        if(auto selection=std::get_if<LanActionSelection>(&event)){
            if(!resolve_)return false;Selection item{*player,selection->mode==1,{}};item.units.reserve(selection->objects.size());for(auto object:selection->objects){auto handle=resolve_(object);if(!handle || !session_.units().contains(*handle) || (item.add && !session_.unitSelectable(*handle)))return false;item.units.push_back(*handle);}for(auto id:item.units){if(item.add)selected().insert(id);else selected().erase(id);}prepared.emplace_back(std::move(item));continue;
        }
        auto ability=std::get_if<LanActionAbility>(&event);if(!ability || !resolve_ || (ability->flags&~0x0008u))return false;Command command;command.player=*player;command.order=ability->order;command.xBits=ability->xBits;command.yBits=ability->yBits;auto production=[&](bool point)->std::optional<PlayerCommandKind>{auto& units=selected();if(units.size()!=1 || !session_.units().contains(*units.begin()))return {};return lanProductionOrder(*session_.units().at(*units.begin()),ability->order,point);};
        if(ability->opcode==0x10){if(ability->order==851972)command.kind=PlayerCommandKind::Stop;else if(ability->order==851993)command.kind=PlayerCommandKind::Hold;else if(lanSpellOrder(ability->order,LanSpellTarget::None))command.kind=PlayerCommandKind::SpellImmediateOrder;else if(auto kind=production(false))command.kind=*kind;else return false;}
        else if(ability->opcode==0x11){auto kind=groundKind(ability->order);if(!finitePoint(ability->xBits,ability->yBits))return false;if(kind)command.kind=*kind;else if(lanSpellOrder(ability->order,LanSpellTarget::Point))command.kind=PlayerCommandKind::SpellPointOrder;else if(auto productionKind=production(true))command.kind=*productionKind;else return false;}
        else if(ability->opcode==0x12){if(ability->target.first==0xffffffffu && ability->target.second==0xffffffffu){auto kind=groundKind(ability->order);if(!kind || !finitePoint(ability->xBits,ability->yBits))return false;command.kind=*kind;}else{bool spell=lanSpellOrder(ability->order,LanSpellTarget::Unit);if(!finitePoint(ability->xBits,ability->yBits))return false;if(!spell && !targetOrder(ability->order))return false;auto handle=resolve_(ability->target);if(!handle || (!session_.units().contains(*handle) && !session_.items().contains(*handle) && !session_.destructables().contains(*handle)))return false;if(spell && !session_.units().contains(*handle))return false;command.kind=spell?PlayerCommandKind::SpellUnitOrder:PlayerCommandKind::TargetOrder;command.target=*handle;}}
        else return false;bool spell=command.kind==PlayerCommandKind::SpellUnitOrder || command.kind==PlayerCommandKind::SpellPointOrder || command.kind==PlayerCommandKind::SpellImmediateOrder;bool productionOrder=command.kind==PlayerCommandKind::BuildAt || command.kind==PlayerCommandKind::Train || command.kind==PlayerCommandKind::Research || command.kind==PlayerCommandKind::Upgrade;if(spell || productionOrder){auto& units=selected();if(units.size()!=1)return false;command.expectedUnit=*units.begin();}prepared.emplace_back(command);
    }
    decoded_.push_back(std::move(prepared));return true;
}
bool LanSimulation::apply(ScriptSession& session,const LanAction&){
    if(cursor_>=decoded_.size())return false;
    for(const auto& event:decoded_[cursor_++]){
        if(std::holds_alternative<LanActionPause>(event))session.pause(true);
        else if(std::holds_alternative<LanActionResume>(event))session.pause(false);
        else if(auto selection=std::get_if<Selection>(&event)){for(auto id:selection->units){session.setPlayerUnitSelected(selection->player,id,selection->add);if(driver_.failed())return false;}}
        else if(auto source=std::get_if<Command>(&event)){PlayerCommand command;command.player=source->player;command.kind=source->kind;command.order=source->order;command.target=source->target;command.xBits=source->xBits;command.yBits=source->yBits;auto units=session.playerSelection(source->player);bool production=source->kind==PlayerCommandKind::BuildAt || source->kind==PlayerCommandKind::Train || source->kind==PlayerCommandKind::Research || source->kind==PlayerCommandKind::Upgrade;if(production)command.objectType=source->order;bool spell=source->kind==PlayerCommandKind::SpellUnitOrder || source->kind==PlayerCommandKind::SpellPointOrder || source->kind==PlayerCommandKind::SpellImmediateOrder;if((spell || production) && (units.size()!=1 || *units.begin()!=source->expectedUnit))return false;for(auto id:units){command.units={id};dispatchPlayerCommand(session,command);if(driver_.failed())return false;}}
        else return false;if(driver_.failed())return false;
    }
    return true;
}
LanStepResult LanSimulation::consume(std::uint64_t sequence,const LanTimeSlot& slot){
    if(consuming_)return driver_.consume(sequence,slot);consuming_=true;struct Reset{bool& value;~Reset(){value=false;}}reset{consuming_};decoded_.clear();projectedSelections_.clear();cursor_=0;auto result=driver_.consume(sequence,slot);decoded_.clear();projectedSelections_.clear();cursor_=0;return result;
}
}
