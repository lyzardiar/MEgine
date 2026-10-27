// Author: MiYu. Real spell impacts, bounded chain selection and timed stun/root/frost affect shared simulation state.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}
}
void ScriptSession::applyBuff(std::uint32_t target,std::uint32_t source,const SpellInfo& s,BuffKind kind) {
    if(!s.buff || !alive(target,NativeKind::Unit))return;auto u=units_.at(target);if(u->removing || number(u->life)<=0 || capability(*u,"Amim"))return;double duration=u->hero?s.heroDuration:s.duration;if(duration<=0)return;UnitBuff buff;buff.id=s.buff;buff.source=source;buff.kind=kind;buff.remaining=duration;if(kind==BuffKind::Roots)buff.damage=s.amount;if(kind==BuffKind::Slow){buff.moveReduction=s.moveReduction;buff.attackReduction=s.attackReduction;}if(kind==BuffKind::Frost){buff.moveReduction=gameplayNumber("FrostMoveSpeedDecrease",.5f);buff.attackReduction=gameplayNumber("FrostAttackSpeedDecrease",.25f);if(buff.moveReduction<0 || buff.moveReduction>1 || buff.attackReduction<0)throw std::runtime_error("Invalid source frost factors");}u->buffs[s.buff]=buff;if(kind==BuffKind::Stun){u->route.clear();u->waypoint=0;u->currentOrder=0;cancelCombat(*u);}else if(kind==BuffKind::Roots){u->route.clear();u->waypoint=0;}
}
void ScriptSession::spellImpact(SpellMissile missile) {
    if(!alive(missile.source,NativeKind::Unit) || !alive(missile.target,NativeKind::Unit))return;auto caster=units_.at(missile.source),target=units_.at(missile.target);auto& s=missile.spell;if(!spellTarget(*caster,*target,s,false,missile.owner))return;auto heal=[&](std::uint32_t id,float amount){if(alive(id,NativeKind::Unit)){auto u=units_.at(id);if(!u->removing && number(u->life)>0)unitLife(runtime_.handle("unit",id),real(number(u->life)+amount));}};
    if(s.kind==SpellKind::HolyLight || s.kind==SpellKind::DeathCoil){if(enemy(missile.owner,target->owner))damageUnit(missile.source,missile.target,missile.amount*.5f,0,14);else heal(missile.target,missile.amount);return;}
    if(s.kind==SpellKind::FanKnives){damageUnit(missile.source,missile.target,missile.amount,0,14);return;}
    if(s.kind==SpellKind::StormBolt){damageUnit(missile.source,missile.target,missile.amount,0,14);applyBuff(missile.target,missile.source,s,BuffKind::Stun);return;}
    if(s.kind==SpellKind::Roots){applyBuff(missile.target,missile.source,s,BuffKind::Roots);return;}
    if(s.kind==SpellKind::FrostNova){auto center=WorldPoint{target->x,target->y};std::vector<std::uint32_t> victims;for(auto& [id,u]:units_)if(id==missile.target || std::hypot(number(u->x)-number(center.x),number(u->y)-number(center.y))<=s.area)if(spellTarget(*caster,*u,s,false,missile.owner))victims.push_back(id);for(auto id:victims){if(!alive(missile.source,NativeKind::Unit))break;if(!alive(id,NativeKind::Unit))continue;damageUnit(missile.source,id,s.amount+(id==missile.target?s.secondary:0),0,14);applyBuff(id,missile.source,s,BuffKind::Frost);}return;}
    if(s.kind==SpellKind::HealingWave)heal(missile.target,missile.amount);else if(s.kind==SpellKind::ChainLightning)damageUnit(missile.source,missile.target,missile.amount,0,14);else throw std::runtime_error("Missing spell effect consumer");
    missile.visited.push_back(missile.target);if(missile.visited.size()>=s.targets || !alive(missile.source,NativeKind::Unit))return;float nearest=s.area;std::uint32_t next=0;for(auto& [id,u]:units_)if(std::find(missile.visited.begin(),missile.visited.end(),id)==missile.visited.end() && spellTarget(*caster,*u,s,false,missile.owner) && (s.kind!=SpellKind::HealingWave || number(u->life)<number(u->maxLife))){float distance=std::hypot(number(u->x)-number(target->x),number(u->y)-number(target->y));if(distance<nearest || (distance==nearest && (!next || id<next))){nearest=distance;next=id;}}if(!next)return;missile.position={target->x,target->y};missile.target=next;missile.amount*=1-s.loss;spellMissiles_.emplace(++spellTicket_,std::move(missile));
}
void ScriptSession::buffsTick(double delta) {
    std::vector<std::uint32_t> actors;for(auto& [id,u]:units_)if(!u->buffs.empty())actors.push_back(id);for(auto id:actors){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(number(u->life)<=0 || u->removing){u->buffs.clear();continue;}if(u->paused)continue;std::vector<std::pair<std::uint32_t,float>> damage;for(auto it=u->buffs.begin();it!=u->buffs.end();){auto& b=it->second;double elapsed=std::min(delta,b.remaining);b.remaining-=elapsed;if(b.kind==BuffKind::Roots){b.period+=elapsed;while(b.period>=1){b.period-=1;damage.emplace_back(b.source,b.damage);}}if(b.remaining<=0)it=u->buffs.erase(it);else ++it;}for(auto [source,amount]:damage){if(!alive(id,NativeKind::Unit) || number(u->life)<=0)break;damageUnit(source,id,amount,0,14);}}
    std::vector<std::uint64_t> flights;for(auto& [id,p]:spellMissiles_)flights.push_back(id);for(auto id:flights){auto it=spellMissiles_.find(id);if(it==spellMissiles_.end())continue;auto& p=it->second;if(!alive(p.target,NativeKind::Unit)){spellMissiles_.erase(it);continue;}auto target=units_.at(p.target);float dx=number(target->x)-number(p.position.x),dy=number(target->y)-number(p.position.y),distance=std::hypot(dx,dy),step=p.spell.speed*float(delta);if(p.spell.speed<=0 || distance<=step){auto impact=std::move(p);spellMissiles_.erase(it);spellImpact(std::move(impact));}else{p.position.x=real(number(p.position.x)+dx/distance*step);p.position.y=real(number(p.position.y)+dy/distance*step);}}
}
}
