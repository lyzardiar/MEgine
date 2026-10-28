// Author: MiYu. Source plague emitters infect real organic units and create timed cloud units on death and artillery impact.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
}
void ScriptSession::plaguePassiveInfo(PassiveInfo& p){
    auto& data=definitions();auto type=data.field(p.ability,"AbilityData","UnitID"+std::to_string(p.level));if(type.size()==4){p.corpseType=ObjectData::code(type);if(!data.contains(p.corpseType))throw std::runtime_error("Plague requires a defined source ward type");}else if(!type.empty() && type!="_" && type!="-")throw std::runtime_error("Invalid source Plague Ward type");
    if(p.kind==PassiveKind::PlagueToss){if(!p.corpseType || p.duration<=0 || p.duration>86400)throw std::runtime_error("Plague Toss requires a source ward and positive lifetime");return;}
    auto buffs=data.field(p.ability,"AbilityData","BuffID"+std::to_string(p.level));if(buffs.size()>=9 && buffs[4]==',')p.effectBuff=ObjectData::code(buffs.substr(5,4));p.period=.25f;
    if(!p.buff || p.area<=0 || p.area>100000 || p.amount<0 || p.amount>86400 || p.secondary<0 || p.secondary>1000000 || p.bonus< -1 || p.bonus>86400 || (p.bonus>=0 && !p.corpseType))throw std::runtime_error("Invalid source plague infection, radius, damage or death cloud");
}
void ScriptSession::createPlagueWard(unsigned owner,std::uint32_t type,WorldPoint point,double duration,std::uint32_t source,std::uint32_t ability){
    if(duration<=0)return;if(std::count_if(units_.begin(),units_.end(),[](auto& entry){return entry.second->plagueWard && !entry.second->removing;})>=4096)throw std::runtime_error("Active Plague Ward budget exceeded");auto handle=createUnit(owner,type,point.x,point.y,real(0),0,nullptr,false);if(!alive(handle.bits,NativeKind::Unit))return;auto u=units_.at(handle.bits);if(u->removing || number(u->life)<=0 || u->owner!=owner)return;u->plagueWard=true;u->invulnerable=true;u->pathing=false;u->collision=0;u->noCorpse=true;u->creepGuard=false;u->useFood=false;u->summoner=source;u->summonAbility=ability;u->moveSpeed={};u->timedLife=TimedLife{ObjectData::code("Bplg"),duration,duration,false};u->abilities[u->timedLife->buff]=1;unitFootprint(*u);++fogRevision_;
}
void ScriptSession::plaguePulse(std::uint32_t id,const PassiveInfo& p){
    if(p.amount<=0 || p.secondary<=0 || !alive(id,NativeKind::Unit))return;auto source=units_.at(id);auto abilities=passiveAbilities(*source);if(std::none_of(abilities.begin(),abilities.end(),[&](auto entry){return entry.first==p.ability && entry.second==p.level;}))return;auto candidates=ambientNearby({source->x,source->y},p.area);
    for(auto target:candidates){if(!alive(target,NativeKind::Unit))continue;auto u=units_.at(target);auto classes=u->classifications(definitions().unitClasses(u->type));if(u->typeFlag(14,u->race==3 || classes.find("undead")!=std::string::npos) || !passiveTarget(*source,*u,p) || std::hypot(number(u->x)-number(source->x),number(u->y)-number(source->y))>p.area+u->collision)continue;if(gameplayNumber("MagicImmunesResistDamage",0)!=0 && capability(*u,"Amim"))continue;
        auto old=u->buffs.find(p.buff);if(old!=u->buffs.end() && old->second.kind==BuffKind::Plague){auto& buff=old->second;if(buff.damage>p.secondary)continue;if(buff.damage==p.secondary){buff.remaining=std::max(buff.remaining,double(p.amount));continue;}}
        UnitBuff buff;buff.id=p.buff;buff.kind=BuffKind::Plague;buff.source=source->plagueWard && source->summoner?source->summoner:id;buff.target=target;buff.originAbility=p.ability;buff.sourceLevel=p.level;buff.sourceOwner=source->owner;buff.remaining=buff.total=p.amount;buff.damage=p.secondary;buff.positive=false;buff.physical=true;buff.dispellable=false;
        if(old!=u->buffs.end()){if(old->second.kind==BuffKind::Plague)buff.period=old->second.period;releaseBuff(old->second);u->buffs.erase(old);}SpellInfo art;art.ability=p.buff;buff.visuals=spellVisual(art,"TargetArt",target,{u->x,u->y},false);u->buffs[p.buff]=std::move(buff);
    }
}
void ScriptSession::plagueDeath(const UnitState& victim){
    if(victim.illusion || victim.plagueWard)return;for(auto [ability,level]:passiveAbilities(victim)){auto& p=passiveInfo(ability,level);if(p.kind==PassiveKind::PlagueAura && p.bonus>0 && p.corpseType)createPlagueWard(victim.owner,p.corpseType,{victim.x,victim.y},p.bonus,victim.handle,ability);}
}
void ScriptSession::plagueTossImpact(const CombatProjectile& projectile){
    for(auto& p:projectile.procs)if(p.kind==PassiveKind::PlagueToss)createPlagueWard(projectile.owner,p.corpseType,projectile.endpoint,p.duration,projectile.source,p.ability);
}
}
