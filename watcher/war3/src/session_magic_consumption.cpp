// Author: MiYu. Real dispels and owned-unit drains produce bounded life/mana payloads travelling back to the consuming unit.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
bool ScriptSession::absorbTarget(const UnitState& u,const UnitState& target,const SpellInfo& s){return u.handle!=target.handle && u.owner==target.owner && !target.removing && !target.hidden() && !target.cycloned() && number(target.life)>0 && ((s.amount>0 && number(target.life)>0) || (s.secondary>0 && number(target.mana)>0));}
void ScriptSession::startAbsorb(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit) || !alive(cast.target,NativeKind::Unit))return;auto u=units_.at(id),donor=units_.at(cast.target);auto& s=cast.spell;if(!absorbTarget(*u,*donor,s))return;SpellMissile payload;payload.spell=s;payload.source=payload.target=id;payload.owner=u->owner;payload.position={donor->x,donor->y};payload.visited.push_back(cast.target);payload.amount=std::min(s.amount,number(donor->life));payload.mana=std::min(s.secondary,number(donor->mana));donor->mana=real(number(donor->mana)-payload.mana);if(payload.amount>0)unitLife(runtime_.handle("unit",cast.target),real(number(donor->life)-payload.amount),id);if(alive(id,NativeKind::Unit) && number(u->life)>0)launchSpellMissile(std::move(payload));
}
void ScriptSession::absorbImpact(const SpellMissile& missile){
    if(!alive(missile.source,NativeKind::Unit))return;auto u=units_.at(missile.source);if(u->removing || number(u->life)<=0 || u->owner!=missile.owner)return;u->mana=real(std::clamp(number(u->mana)+missile.mana,0.f,number(u->maxMana)));if(missile.amount>0)unitLife(runtime_.handle("unit",missile.source),real(number(u->life)+missile.amount));
}
void ScriptSession::devourMagic(std::uint32_t id,const SpellInfo& s,WorldPoint point,unsigned owner){
    if(!alive(id,NativeKind::Unit))return;auto caster=units_.at(id);auto targets=spellTargets(id,s,point,owner);for(auto targetId:targets){if(!alive(id,NativeKind::Unit) || caster->removing || number(caster->life)<=0)return;if(!alive(targetId,NativeKind::Unit))continue;auto target=units_.at(targetId);bool hostile=enemy(owner,target->owner);unsigned removed=0;for(auto it=target->buffs.begin();it!=target->buffs.end();)if(!it->second.physical && it->second.dispellable && !(s.ignoreFriendlyBuffs && !hostile && it->second.positive)){releaseBuff(it->second);it=target->buffs.erase(it);++removed;}else ++it;bool affected=removed>0;auto origin=WorldPoint{target->x,target->y};
        if(hostile && target->illusion){affected=true;unitLife(runtime_.handle("unit",targetId),{},id);}else if(hostile && !capability(*target,"Arsk") && target->typeFlag(10,target->sourceSummoned || target->summoner!=0 || bool(target->timedLife)) && s.maxDamage>0){float dealt=0;damageUnit(id,targetId,s.maxDamage,0,26,false,false,&dealt);affected|=dealt>0;}if(!alive(id,NativeKind::Unit) || caster->removing || number(caster->life)<=0)return;if(!affected)continue;spellVisual(s,"Specialart",alive(targetId,NativeKind::Unit)?targetId:0,origin);SpellMissile payload;payload.spell=s;payload.source=payload.target=id;payload.owner=owner;payload.position=origin;payload.visited.push_back(targetId);payload.amount=s.amount+removed*s.buffHealth;payload.mana=s.secondary+removed*s.buffMana;launchSpellMissile(std::move(payload));
    }
}
}
