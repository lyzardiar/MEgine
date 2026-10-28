// Author: MiYu. Source Wind Walk attack payloads, bounded legal Blink placement and delayed Mirror Image consume live gameplay.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
std::pair<float,bool> ScriptSession::windWalkStrike(const UnitState& u){
    std::pair<float,bool> result{};for(auto& [id,b]:u.buffs)if(b.kind==BuffKind::WindWalk && b.fadeRemaining<=0 && b.remaining>0 && b.stealthDamage>result.first)result={b.stealthDamage,b.backstab};return result;
}
std::optional<WorldPoint> ScriptSession::blinkPoint(const UnitState& u,const SpellInfo& s,WorldPoint point){
    float x=number(u.x),y=number(u.y),dx=number(point.x)-x,dy=number(point.y)-y,distance=std::hypot(dx,dy);if(!std::isfinite(distance) || distance<.001f)return {};dx/=distance;dy/=distance;distance=std::clamp(distance,s.secondary,s.amount);float desiredX=x+dx*distance,desiredY=y+dy*distance;bool flying=u.movementType=="fly";
    for(unsigned ring=0;ring<=8;++ring)for(unsigned side=0;side<(ring?16u:1u);++side){float angle=float(side)*6.28318530718f/16;auto candidate=requireWorld().clamp({real(desiredX+std::cos(angle)*ring*32),real(desiredY+std::sin(angle)*ring*32)});float cx=number(candidate.x),cy=number(candidate.y),range=std::hypot(cx-x,cy-y);if(range>s.amount+.01f || range+.01f<s.secondary)continue;if(u.pathing){auto route=requireWorld().route(candidate,candidate,u.collision,pathMovement(u.movementType));if(route.empty() || std::hypot(number(route.back().x)-cx,number(route.back().y)-cy)>1)continue;}bool free=true;for(auto& [id,other]:units_)if(id!=u.handle && !other->hidden() && other->pathing && number(other->life)>0 && (other->movementType=="fly")==flying && std::hypot(number(other->x)-cx,number(other->y)-cy)<u.collision+other->collision){free=false;break;}if(free)return candidate;}return {};
}
void ScriptSession::blinkSpell(std::uint32_t id,const SpellInfo& s,WorldPoint point){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);auto destination=blinkPoint(*u,s,point);if(!destination)return;spellVisual(s,"Specialart",0,{u->x,u->y});u->x=destination->x;u->y=destination->y;u->route.clear();u->waypoint=0;u->combat.home=*destination;unitFootprint(*u);++fogRevision_;spellVisual(s,"Areaeffectart",0,*destination);
}
void ScriptSession::startMirrorImage(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);u->mirrorImage=MirrorImageState{cast.spell,u->owner,cast.ticket,cast.spell.impactDelay};u->route.clear();u->waypoint=0;for(auto it=u->buffs.begin();it!=u->buffs.end();)if(!it->second.positive){releaseBuff(it->second);it=u->buffs.erase(it);}else ++it;spellVisual(cast.spell,"Specialart",0,{u->x,u->y});++fogRevision_;
    std::vector<std::uint32_t> previous;for(auto& [cloneId,clone]:units_)if(clone->illusion && clone->summoner==id && clone->summonAbility==cast.spell.ability)previous.push_back(cloneId);for(auto cloneId:previous){if(!alive(id,NativeKind::Unit) || u->removing || u->owner!=cast.owner || !u->mirrorImage || !u->cast || u->cast->ticket!=cast.ticket)return;removeUnit(cloneId);}
}
void ScriptSession::mobilityTick(double delta){
    std::vector<std::uint32_t> actors;for(auto& [id,u]:units_)if(u->mirrorImage)actors.push_back(id);for(auto id:actors){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(!u->mirrorImage)continue;auto state=*u->mirrorImage;if(u->removing || number(u->life)<=0 || u->owner!=state.owner || !u->abilities.contains(state.spell.ability) || u->abilities.at(state.spell.ability)<=0 || !u->cast || u->cast->ticket!=state.ticket){u->mirrorImage.reset();++fogRevision_;continue;}if(u->paused)continue;u->mirrorImage->remaining=std::max(0.,u->mirrorImage->remaining-delta);if(u->mirrorImage->remaining>0)continue;u->mirrorImage.reset();++fogRevision_;auto& s=state.spell;auto created=illusions(id,id,s.summonCount,s.secondary,s.loss,u->hero?s.heroDuration:s.duration,s.buff,s.ability);
        if(!alive(id,NativeKind::Unit) || u->removing || u->owner!=state.owner || number(u->life)<=0 || !u->cast || u->cast->ticket!=state.ticket || u->mirrorImage)continue;created.erase(std::remove_if(created.begin(),created.end(),[&](auto cloneId){return !alive(cloneId,NativeKind::Unit) || units_.at(cloneId)->removing || number(units_.at(cloneId)->life)<=0;}),created.end());auto chosen=random()%(created.size()+1);if(chosen){auto clone=units_.at(created[chosen-1]);std::swap(u->x,clone->x);std::swap(u->y,clone->y);}u->combat.home={u->x,u->y};spellVisual(s,"TargetArt",id,{u->x,u->y});for(auto cloneId:created){auto clone=units_.at(cloneId);clone->combat.home={clone->x,clone->y};spellVisual(s,"TargetArt",cloneId,{clone->x,clone->y});}finishCast(id,state.ticket);
    }
}
}
