// Author: MiYu. Feedback consumes actual mana on a valid weapon hit and adds source-defined damage to the same hit payload.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
float ScriptSession::feedbackAttack(const CombatProjectile& projectile){
    if(projectile.visited.size()>1 || projectile.reflected || !alive(projectile.source,NativeKind::Unit) || !alive(projectile.target,NativeKind::Unit))return 0;auto source=units_.at(projectile.source),target=units_.at(projectile.target);if(source->removing || target->removing || number(target->life)<=0 || capability(*target,"Amim"))return 0;const PassiveInfo* best=nullptr;float amount=0,damage=0;for(auto& p:projectile.procs)if(p.kind==PassiveKind::Feedback && passiveTarget(*source,*target,p)){float burn=std::min(number(target->mana),target->hero?p.heroAmount:p.amount),extra=burn*(target->hero?p.heroFactor:p.secondary)+((target->summoner || target->timedLife || target->illusion)?p.summonDamage:0);if(!best || extra>damage || (extra==damage && burn>amount)){best=&p;amount=burn;damage=extra;}}if(!best || (amount<=0 && damage<=0))return 0;target->mana=real(std::max(0.f,number(target->mana)-amount));SpellInfo art;art.ability=best->ability;spellVisual(art,"Specialart",projectile.target,{target->x,target->y});return damage;
}
}
