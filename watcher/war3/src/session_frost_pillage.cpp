// Author: MiYu. Source frost weapons suspend real building work and source pillage converts actual hit damage into retained resource balances.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
}
void ScriptSession::frostPillageInfo(PassiveInfo& p){
    auto& data=definitions();if(p.kind==PassiveKind::Pillage){p.secondary=std::floor(p.secondary);if(p.amount<0 || p.amount>1000000 || p.secondary<1 || p.secondary>1000000)throw std::runtime_error("Invalid source Pillage ratio or payout threshold");return;}if(!p.buff || p.duration<=0 || p.duration>86400 || p.heroDuration<0 || p.heroDuration>86400)throw std::runtime_error("Frost attack requires its source buff and duration");p.attackMissile=data.field(p.ability,"Profile","Missileart");if(auto comma=p.attackMissile.find(',');comma!=std::string::npos)p.attackMissile.resize(comma);if(p.attackMissile=="_")p.attackMissile.clear();if(!p.attackMissile.empty())p.visualModels.push_back(p.attackMissile);
    if(p.kind==PassiveKind::FreezingBreath){p.missileSpeed=data.number(p.ability,"Profile","Missilespeed");p.missileArc=data.number(p.ability,"Profile","Missilearc");p.missileHoming=data.number(p.ability,"Profile","MissileHoming",1)!=0;if(p.area<0 || p.area>100000 || p.attackMissile.empty() || p.missileSpeed<=0 || p.missileSpeed>1000000 || p.missileArc<0 || p.missileArc>10)throw std::runtime_error("Invalid source Freezing Breath missile or radius");}
}
void ScriptSession::frostBreathImpact(const CombatProjectile& projectile){
    if(!alive(projectile.source,NativeKind::Unit))return;auto source=units_.at(projectile.source);for(auto& p:projectile.procs){if(p.kind!=PassiveKind::FrostBreath && p.kind!=PassiveKind::FreezingBreath)continue;float radius=p.kind==PassiveKind::FreezingBreath?p.area:(projectile.definition.kind=="artillery" || projectile.definition.kind=="msplash")?std::max({projectile.definition.fullArea,projectile.definition.halfArea,projectile.definition.quarterArea}):0;std::vector<std::uint32_t> targets;for(auto& [id,u]:units_)if((id==projectile.target || radius>0) && passiveTarget(*source,*u,p) && std::hypot(number(u->x)-number(projectile.endpoint.x),number(u->y)-number(projectile.endpoint.y))<=radius+u->collision)targets.push_back(id);
        for(auto id:targets){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if((p.kind==PassiveKind::FreezingBreath && !u->building) || !passiveTarget(*source,*u,p))continue;SpellInfo spell;spell.ability=p.ability;spell.level=p.level;spell.buff=p.buff;spell.duration=p.duration;spell.heroDuration=p.heroDuration;auto kind=p.kind==PassiveKind::FreezingBreath?BuffKind::FreezingBreath:BuffKind::Frost;applyBuff(id,projectile.source,spell,kind,true);if(auto found=u->buffs.find(p.buff);found!=u->buffs.end() && found->second.kind==kind){found->second.sourceOwner=projectile.owner;if(kind==BuffKind::FreezingBreath){found->second.preventsRepair=true;found->second.dispellable=false;}}}
    }
}
void ScriptSession::pillageHit(const CombatProjectile& projectile,float damage,std::uint32_t type,jass::Real maximum,unsigned targetOwner){
    if(damage<=0 || number(maximum)<=0 || !alive(projectile.source,NativeKind::Unit) || definitions().property(type,"ubdg","0")!="1" || !enemy(projectile.owner,targetOwner))return;auto u=units_.at(projectile.source);if(u->removing || u->illusion || u->owner!=projectile.owner || u->type!=projectile.sourceType)return;
    for(auto& p:projectile.procs){if(p.kind!=PassiveKind::Pillage || p.amount<=0)continue;auto ratio=real(damage).multiply(real(p.amount)).divide(maximum);auto balances=u->pillageBalances[p.ability];balances[0]=balances[0].add(ratio.multiply(real(definitions().number(type,"UnitBalance","goldcost"))));balances[1]=balances[1].add(ratio.multiply(real(definitions().number(type,"UnitBalance","lumbercost"))));
        u->pillageBalances[p.ability]=balances;for(unsigned currency=0;currency<2;++currency){auto& balance=balances[currency];double groups=std::floor((double(number(balance))+.001)/p.secondary);if(groups<=0)continue;auto owner=projectile.owner;auto& states=config_.players[owner].states;auto state=currency+1;int before=states[state];double payout=std::min(groups*double(p.secondary),double(INT_MAX)-before);if(payout<=0)continue;int whole=int(payout);balance=balance.subtract(real(float(whole)));u->pillageBalances[p.ability]=balances;states[state]+=whole;playerChange(owner,state,before,states[state],false);if(!alive(projectile.source,NativeKind::Unit) || u->removing || u->owner!=owner || u->type!=projectile.sourceType || !u->pillageBalances.contains(p.ability))return;}
    }
}
}
