// Author: MiYu. Unstable Concoction carries the real caster through a separate flight and consumes it only after a valid impact.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
}
void ScriptSession::concoctionInfo(SpellInfo& s){
    auto field=[&](const char* name){return definitions().number(s.ability,"AbilityData",std::string(name)+std::to_string(s.level));};s.fullArea=s.amount;s.initialDamage=s.secondary;s.halfArea=s.loss;s.extraDamage=field("DataD");s.maxDamage=field("DataE");s.moveBonus=field("DataF");s.amount=s.secondary=s.loss=0;s.orderOn=s.orderOff=0;
    if(s.fullArea<0 || s.fullArea>100000 || s.halfArea<s.fullArea || s.halfArea>100000 || s.initialDamage<0 || s.initialDamage>1000000 || s.extraDamage<0 || s.extraDamage>1000000 || s.maxDamage<0 || s.maxDamage>100000000 || s.moveBonus<0 || s.moveBonus>1000000)throw std::runtime_error("Invalid source Unstable Concoction damage, range or movement bonus");
}
void ScriptSession::startConcoction(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit) || !alive(cast.target,NativeKind::Unit))return;auto u=units_.at(id),target=units_.at(cast.target);auto death=u->deathRevision,ownership=u->ownerRevision,combat=u->combat.revision;auto active=[&]{return alive(id,NativeKind::Unit) && !u->removing && number(u->life)>0 && u->deathRevision==death && u->ownerRevision==ownership && u->owner==cast.owner;};if(!active() || !u->cast || u->cast->ticket!=cast.ticket || !spellTarget(*u,*target,cast.spell,false,cast.owner))return;u->cast->resume.reset();finishCast(id,cast.ticket);if(!active() || u->cast || u->castRevision!=cast.ticket+1 || u->combat.revision!=combat || u->currentOrder || !alive(cast.target,NativeKind::Unit) || !spellTarget(*u,*target,cast.spell,false,cast.owner))return;if(concoctions_.size()>=4096)throw std::runtime_error("Concoction flight budget exceeded");
    ConcoctionFlight flight;flight.spell=cast.spell;flight.target=cast.target;flight.owner=cast.owner;flight.sourceType=u->type;flight.sourceDeath=death;flight.sourceOwner=ownership;flight.targetDeath=target->deathRevision;flight.endpoint={target->x,target->y};flight.initialHeight=u->flyHeight;flight.height=requireWorld().height({u->x,u->y})+u->displayFlyHeight();auto visual=createEffect(u->displayModel(),{u->x,u->y},0,{},false);flight.visual=visual.bits;if(visual.bits){auto e=effects_.at(visual.bits);e->z=u->displayFlyHeight();e->scale=u->displayScale()*std::max({u->visualScale[0],u->visualScale[1],u->visualScale[2]});e->facing=number(u->facing)*3.14159265359f/180;e->teamColor=u->color.value_or(config_.players[u->owner].color);e->tint=(std::uint32_t(u->tint[3])<<24)|(std::uint32_t(u->tint[0])<<16)|(std::uint32_t(u->tint[1])<<8)|u->tint[2];}u->concoction=true;u->route.clear();u->waypoint=0;u->currentOrder=0;concoctions_[id]=std::move(flight);++fogRevision_;
}
void ScriptSession::clearConcoction(std::uint32_t id){
    if(auto found=concoctions_.find(id);found!=concoctions_.end()){destroyEffect(found->second.visual);effects_.erase(found->second.visual);concoctions_.erase(found);}if(alive(id,NativeKind::Unit) && units_.at(id)->concoction){units_.at(id)->concoction=false;++fogRevision_;}
}
void ScriptSession::explodeConcoction(std::uint32_t id,const ConcoctionFlight& flight){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);auto active=[&]{return alive(id,NativeKind::Unit) && !u->removing && number(u->life)>0 && u->owner==flight.owner && u->deathRevision==flight.sourceDeath && u->ownerRevision==flight.sourceOwner;};if(!active())return;auto& s=flight.spell;WorldPoint point{u->x,u->y};std::vector<std::uint32_t> victims;for(auto& [target,v]:units_)if(target!=id && spellTarget(*u,*v,s,false,flight.owner) && std::hypot(number(v->x)-number(point.x),number(v->y)-number(point.y))<=s.halfArea+v->collision)victims.push_back(target);std::stable_sort(victims.begin(),victims.end(),[&](auto a,auto b){return (a==flight.target)>(b==flight.target);});float allocated=0;
    for(auto target:victims){if(!active())break;if(!alive(target,NativeKind::Unit))continue;auto victim=units_.at(target);if(!spellTarget(*u,*victim,s,false,flight.owner))continue;float distance=std::hypot(number(victim->x)-number(point.x),number(victim->y)-number(point.y));float amount=target==flight.target || distance<=s.fullArea+victim->collision?s.initialDamage:s.extraDamage;if(s.maxDamage>0)amount=std::min(amount,std::max(0.f,s.maxDamage-allocated));if(amount<=0)continue;allocated+=amount;damageUnit(id,target,amount,0,22);}
    if(active()){u->concoction=false;u->noCorpse=u->exploded=true;++fogRevision_;unitLife(runtime_.handle("unit",id),{});}else if(alive(id,NativeKind::Unit)){u->concoction=false;++fogRevision_;}
}
void ScriptSession::concoctionsTick(double delta){
    std::vector<std::uint32_t> actors;for(auto& [id,flight]:concoctions_)actors.push_back(id);for(auto id:actors){auto found=concoctions_.find(id);if(found==concoctions_.end())continue;auto flight=found->second;if(!alive(id,NativeKind::Unit)){clearConcoction(id);continue;}auto u=units_.at(id);if(u->removing || number(u->life)<=0 || u->type!=flight.sourceType || u->deathRevision!=flight.sourceDeath || u->ownerRevision!=flight.sourceOwner || u->owner!=flight.owner){clearConcoction(id);continue;}if(u->paused)continue;
        if(!alive(flight.target,NativeKind::Unit)){clearConcoction(id);continue;}auto target=units_.at(flight.target);if(target->deathRevision!=flight.targetDeath || !spellTarget(*u,*target,flight.spell,false,flight.owner)){clearConcoction(id);continue;}flight.endpoint={target->x,target->y};float x=number(u->x),y=number(u->y),dx=number(target->x)-x,dy=number(target->y)-y,distance=std::hypot(dx,dy),step=std::max(1.f,number(u->currentMoveSpeed())+flight.spell.moveBonus)*float(delta),fraction=distance>.001f?std::min(1.f,step/distance):1.f;u->x=real(x+dx*fraction);u->y=real(y+dy*fraction);u->timedFacing.reset();u->facing=real(std::fmod(std::atan2(dy,dx)*180.f/3.14159265359f+360.f,360.f));float height=requireWorld().height(flight.endpoint)+target->displayFlyHeight();flight.height+=(height-flight.height)*fraction;if(auto effect=effects_.find(flight.visual);effect!=effects_.end()){effect->second->point={u->x,u->y};effect->second->z=flight.height-requireWorld().height({u->x,u->y});effect->second->facing=number(u->facing)*3.14159265359f/180;}
        if(fraction<1){concoctions_[id]=std::move(flight);continue;}concoctions_.erase(id);destroyEffect(flight.visual);effects_.erase(flight.visual);explodeConcoction(id,flight);
    }
}
}
