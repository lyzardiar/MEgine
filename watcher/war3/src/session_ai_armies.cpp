// Author: MiYu. Campaign captains and suicide waves issue live orders with isolated membership and stable handle snapshots.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
void ScriptSession::aiFormCaptains(ScriptAI& ai,bool force){
    auto eligible=[&](std::uint32_t id){if(!alive(id,NativeKind::Unit))return false;auto& u=*units_.at(id);return u.owner==ai.owner && !u.removing && !u.building && !u.construction && number(u.life)>0 && hasWeapon(id) && !ai.guardUnits.contains(id) && !ai.suicideUnits.contains(id) && !ai.reservesUnit(id) && (ai.groupTimedLife || !u.timedLife);};
    for(auto* members:{&ai.captain,&ai.defenderUnits})for(auto it=members->begin();it!=members->end();)if(!eligible(*it))it=members->erase(it);else ++it;
    if(!force && !ai.captainChanges)return;auto previous=ai.captain;std::map<std::uint32_t,unsigned> attacking,defending;std::set<std::uint32_t> taken;auto desired=[](auto& goals,std::uint32_t type){auto it=goals.find(type);return it==goals.end()?0u:it->second;};
    auto retain=[&](auto& members,auto& goals,auto& counts){for(auto it=members.begin();it!=members.end();){auto type=units_.at(*it)->type;if(taken.contains(*it) || counts[type]>=desired(goals,type))it=members.erase(it);else{++counts[type];taken.insert(*it);++it;}}};retain(ai.captain,ai.assault,attacking);retain(ai.defenderUnits,ai.defenders,defending);
    for(auto& [id,u]:units_)if(eligible(id) && !taken.contains(id) && !u->hidden() && !u->paused && !u->stunned() && u->buildables.empty() && !u->workingOn && !u->buildOrder && !u->repair && !u->cast && u->gather.phase==GatherOrder::Phase::None){if(defending[u->type]<desired(ai.defenders,u->type)){ai.defenderUnits.insert(id);++defending[u->type];taken.insert(id);}else if(attacking[u->type]<desired(ai.assault,u->type)){ai.captain.insert(id);++attacking[u->type];taken.insert(id);}}
    auto members=aiCaptain(ai);for(auto id:members){if(previous.contains(id) || !eligible(id))continue;auto u=units_.at(id);if(!u->currentOrder && std::hypot(number(u->x)-number(ai.goal.x),number(u->y)-number(ai.goal.y))>350){if(ai.goal.x.bits()!=ai.stage.x.bits() || ai.goal.y.bits()!=ai.stage.y.bits())attackMove(id,ai.goal);else moveUnit(id,ai.stage);}}
}
void ScriptSession::aiSuicide(ScriptAI& ai,int quantity,std::uint32_t type,int targetPlayer){
    if(quantity<=0)return;if(quantity>4096 || targetPlayer< -1 || targetPlayer>=16)throw std::runtime_error("AI suicide wave exceeds supported limits");if(!definitions().contains(type))throw std::runtime_error("Unknown suicide wave unit type");std::vector<std::uint32_t> candidates;
    for(auto& [id,u]:units_)if(u->owner==ai.owner && u->type==type && !u->removing && !u->hidden() && !u->building && !u->construction && !u->paused && !u->stunned() && number(u->life)>0 && !u->workingOn && !u->buildOrder && !u->repair && !u->cast && u->gather.phase==GatherOrder::Phase::None && !ai.suicideUnits.contains(id) && !ai.reservesUnit(id) && hasWeapon(id))candidates.push_back(id);
    for(auto id:candidates){if(quantity<=0)break;if(!alive(id,NativeKind::Unit) || units_.at(id)->owner!=ai.owner)continue;aiRemoveGuard(id);ai.captain.erase(id);ai.defenderUnits.erase(id);ai.suicideUnits[id]=targetPlayer;--quantity;}aiSuicideTick(ai);
}
void ScriptSession::aiSuicideTick(ScriptAI& ai){
    auto wave=ai.suicideUnits;for(auto [id,owner]:wave){auto entry=ai.suicideUnits.find(id);if(entry==ai.suicideUnits.end() || entry->second!=owner)continue;if(!alive(id,NativeKind::Unit) || units_.at(id)->owner!=ai.owner || units_.at(id)->removing || number(units_.at(id)->life)<=0){ai.suicideUnits.erase(id);continue;}auto u=units_.at(id);if(u->paused || u->stunned() || u->hidden() || u->cast)continue;
        auto target=u->combat.target;if(target && alive(target,NativeKind::Unit)){auto victim=units_.at(target);if(!victim->removing && !victim->hidden() && number(victim->life)>0 && enemy(ai.owner,victim->owner) && (owner<0 || victim->owner==unsigned(owner)))continue;}
        target=aiEnemy(ai,owner<0?UINT_MAX:unsigned(owner));if(target){auto victim=units_.at(target);if(!attackUnit(id,target) && alive(id,NativeKind::Unit) && u->owner==ai.owner && ai.suicideUnits.contains(id))attackMove(id,{victim->x,victim->y});}else if(u->currentOrder)stopUnit(id);
    }
}
void ScriptSession::aiTeleportCaptain(ScriptAI& ai,WorldPoint point){
    point=requireWorld().clamp(point);auto members=aiCaptain(ai);if(members.empty())return;double x=0,y=0;for(auto id:members){x+=number(units_.at(id)->x);y+=number(units_.at(id)->y);}x/=members.size();y/=members.size();
    for(auto id:members){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->owner!=ai.owner || u->paused || u->stunned() || u->building || u->hidden() || number(u->life)<=0)continue;auto destination=requireWorld().clamp({real(float(number(point.x)+number(u->x)-x)),real(float(number(point.y)+number(u->y)-y))});if(!cancelCombat(*u))continue;u->route.clear();u->waypoint=0;u->currentOrder=0;u->holding=false;u->x=destination.x;u->y=destination.y;u->combat.home=destination;u->animation.clear();u->animationIndex.reset();u->animationQueue.clear();u->animationTime=0;unitFootprint(*u);++fogRevision_;}
    ai.goal=ai.stage=point;ai.retreating=false;
}
}
