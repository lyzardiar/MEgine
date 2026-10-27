// Author: MiYu. Source Lightning Attack supplies actual missile presentation and separately timed CHIM graphics without changing weapon damage timing.
#include "session.h"
#include <bit>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
const PassiveInfo* ScriptSession::lightningAttack(const UnitState& unit){
    if(unit.morphed())return nullptr;for(auto [ability,level]:unit.abilities)if(level>0){auto& p=passiveInfo(ability,unsigned(level));if(p.kind==PassiveKind::LightningAttack){auto available=config_.players[unit.owner].abilityAvailable.find(ability);if(available==config_.players[unit.owner].abilityAvailable.end() || available->second)return &p;}}return nullptr;
}
void ScriptSession::lightningWeapon(WeaponDefinition& weapon,const PassiveInfo& p){weapon.model=p.attackMissile;weapon.speed=p.missileSpeed;weapon.arc=p.missileArc;weapon.homing=p.missileHoming;}
void ScriptSession::queueAttackLightning(const CombatProjectile& projectile,const PassiveInfo& p){
    if(attackLightnings_.size()>=4096 || attackLightningTicket_==UINT64_MAX)throw std::runtime_error("Attack lightning presentation budget exceeded");AttackLightning graphic;graphic.definition=&p;graphic.source=projectile.source;graphic.target=projectile.target;graphic.start=projectile.start;graphic.end=projectile.endpoint;graphic.startHeight=projectile.startHeight;graphic.endHeight=projectile.endHeight;auto source=units_.at(graphic.source),target=units_.at(graphic.target);graphic.sourceDeath=source->deathRevision;graphic.targetDeath=target->deathRevision;graphic.sourceFly=source->displayFlyHeight();graphic.targetFly=target->displayFlyHeight();graphic.due=simulationTime_+p.amount;attackLightnings_.emplace(++attackLightningTicket_,std::move(graphic));
}
void ScriptSession::attackLightningsTick(){
    std::vector<std::uint64_t> due;for(auto& [id,graphic]:attackLightnings_)if(graphic.due<=simulationTime_)due.push_back(id);for(auto id:due){auto found=attackLightnings_.find(id);if(found==attackLightnings_.end())continue;auto graphic=std::move(found->second);attackLightnings_.erase(found);auto from=graphic.start,to=graphic.end;float fromZ=graphic.startHeight,toZ=graphic.endHeight;auto current=[&](std::uint32_t unit,std::uint64_t death){return alive(unit,NativeKind::Unit) && !units_.at(unit)->removing && number(units_.at(unit)->life)>0 && units_.at(unit)->deathRevision==death;};bool source=current(graphic.source,graphic.sourceDeath),target=current(graphic.target,graphic.targetDeath);if(source){auto u=units_.at(graphic.source);from={u->x,u->y};fromZ+=u->displayFlyHeight()-graphic.sourceFly;}if(target){auto u=units_.at(graphic.target);to={u->x,u->y};toZ+=u->displayFlyHeight()-graphic.targetFly;}auto handle=createLightning(graphic.definition->lightningType,true,{from.x,from.y,real(requireWorld().height(from)+fromZ)},{to.x,to.y,real(requireWorld().height(to)+toZ)},graphic.definition->secondary);auto l=lightnings_.at(handle.bits);l->fromUnit=source?graphic.source:0;l->toUnit=target?graphic.target:0;l->fromHeight=graphic.startHeight-graphic.sourceFly;l->toHeight=graphic.endHeight-graphic.targetFly;}
}
void ScriptSession::lightningAttackHit(const CombatProjectile& projectile,std::uint32_t target){
    if(!projectile.visualAbility || !projectile.visualLevel)return;auto& p=passiveInfo(projectile.visualAbility,projectile.visualLevel);if(p.kind!=PassiveKind::LightningAttack)return;auto point=projectile.endpoint;if(alive(target,NativeKind::Unit)){auto u=units_.at(target);point={u->x,u->y};}else target=0;SpellInfo visual;visual.ability=p.ability;auto ids=spellVisual(visual,"TargetArt",target,point);for(auto id:ids)if(effects_.contains(id))effects_.at(id)->fallbackExpires=simulationTime_+16;
}
}
