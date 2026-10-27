// Author: MiYu. Guard posts reserve real units, route returns and request replacements through paid production.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}float distance(const UnitState& unit,WorldPoint point){return std::hypot(number(unit.x)-number(point.x),number(unit.y)-number(point.y));}}
void ScriptSession::aiRemoveGuard(std::uint32_t unit){
    for(auto& slot:ais_)if(slot){auto& ai=*slot;for(auto it=ai.guards.begin();it!=ai.guards.end();)if(it->second.unit==unit)it=ai.guards.erase(it);else ++it;ai.guardUnits.erase(unit);}
    if(alive(unit,NativeKind::Unit)){auto u=units_.at(unit);u->guardHome.reset();u->guardOwner=UINT_MAX;u->guardPost=0;u->guardRemoved=true;}
}
void ScriptSession::aiRecycleGuard(std::uint32_t unit){
    if(!alive(unit,NativeKind::Unit))return;auto u=units_.at(unit);aiRemoveGuard(unit);u->guardRemoved=false;auto& slot=ais_[u->owner];if(!slot || u->removing || number(u->life)<=0)return;auto& ai=*slot;if(ai.guards.size()>=4096 || ai.guardTicket==UINT64_MAX)throw std::runtime_error("AI recycled guard budget exceeded");auto id=++ai.guardTicket;ai.guards.emplace(id,AIGuardPost{u->type,unit,{u->x,u->y},0,true,false});ai.guardUnits.insert(unit);ai.captain.erase(unit);u->guardHome=WorldPoint{u->x,u->y};u->guardOwner=ai.owner;u->guardPost=id;
}
void ScriptSession::aiFillGuards(ScriptAI& ai){
    std::vector<std::uint64_t> posts;for(auto& [id,post]:ai.guards)posts.push_back(id);
    for(auto id:posts){auto found=ai.guards.find(id);if(found==ai.guards.end())continue;auto post=found->second;
        if(post.unit){bool valid=alive(post.unit,NativeKind::Unit) && !units_.at(post.unit)->removing && units_.at(post.unit)->owner==ai.owner && number(units_.at(post.unit)->life)>0;if(valid)continue;ai.guardUnits.erase(post.unit);if(alive(post.unit,NativeKind::Unit)){auto u=units_.at(post.unit);if(u->guardOwner==ai.owner && u->guardPost==id){u->guardHome.reset();u->guardOwner=UINT_MAX;u->guardPost=0;}}found->second.unit=0;found->second.requested=false;++found->second.losses;post=found->second;}
        if(!ai.fillGuards || (post.filled && ai.replacementCount>=0 && post.losses>unsigned(ai.replacementCount)))continue;
        std::uint32_t candidate=0;float best=FLT_MAX;for(auto& [unit,u]:units_)if(u->owner==ai.owner && u->type==post.type && !u->removing && !u->hidden() && !u->paused && !u->construction && !u->guardRemoved && number(u->life)>0 && !ai.guardUnits.contains(unit) && !ai.captain.contains(unit) && (ai.groupTimedLife || !u->timedLife)){auto d=distance(*u,post.point);if(d<best){best=d;candidate=unit;}}
        if(candidate){auto u=units_.at(candidate);found->second.unit=candidate;found->second.filled=true;found->second.requested=false;ai.guardUnits.insert(candidate);u->guardHome=post.point;u->guardOwner=ai.owner;u->guardPost=id;continue;}
        if(post.requested && aiCount(ai,post.type,false)>aiCount(ai,post.type,true))continue;
        bool queued=false;if(definitions().property(post.type,"ubdg","0")=="1"){std::vector<std::uint32_t> workers;for(auto& [unit,u]:units_)if(u->owner==ai.owner && !u->removing && !u->buildOrder && !u->workingOn && std::find(u->buildables.begin(),u->buildables.end(),post.type)!=u->buildables.end())workers.push_back(unit);for(auto unit:workers)if(build(unit,post.type,post.point)){queued=true;break;}}else queued=aiProduce(ai,1,post.type,-1);
        if(auto current=ai.guards.find(id);current!=ai.guards.end())current->second.requested=queued;
    }
}
void ScriptSession::aiReturnGuards(ScriptAI& ai,bool force){
    std::vector<std::pair<std::uint64_t,AIGuardPost>> posts;for(auto& [id,post]:ai.guards)if(post.unit)posts.emplace_back(id,post);for(auto& [id,post]:posts)if(alive(post.unit,NativeKind::Unit)){auto found=ai.guards.find(id);if(found==ai.guards.end() || found->second.unit!=post.unit)continue;auto u=units_.at(post.unit);if(u->owner!=ai.owner || u->removing || u->hidden() || u->paused || u->stunned() || u->construction || u->building || u->buildOrder || u->workingOn || u->repair || u->cast || u->gather.phase!=GatherOrder::Phase::None || number(u->life)<=0)continue;if((force || !u->currentOrder) && distance(*u,post.point)>64){u->combat.home=post.point;moveUnit(post.unit,post.point);}}
}
}
