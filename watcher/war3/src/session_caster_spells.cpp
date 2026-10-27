// Author: MiYu. Source caster abilities change actual life, timed modifiers, magic protection and dispellable state.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}}
bool ScriptSession::spellRequirements(unsigned owner,const SpellInfo& s){for(auto [type,count]:s.prerequisites)if(techCount(owner,type,false)<count)return false;return true;}
bool ScriptSession::usefulDispel(const UnitState& caster,const UnitState& target,const SpellInfo& s) {
    bool hostile=enemy(caster.owner,target.owner);if(hostile && ((s.secondary>0 && (target.illusion || target.summoner || target.timedLife)) || (s.amount>0 && number(target.mana)>0)))return true;for(auto& [id,b]:target.buffs)if(!b.physical && b.dispellable && (s.kind==SpellKind::Dispel || b.positive==hostile))return true;return false;
}
void ScriptSession::dispelSpell(std::uint32_t source,std::uint32_t id,const SpellInfo& s) {
    if(!alive(source,NativeKind::Unit) || !alive(id,NativeKind::Unit))return;auto caster=units_.at(source),target=units_.at(id);bool hostile=enemy(caster->owner,target->owner);for(auto it=target->buffs.begin();it!=target->buffs.end();)if(!it->second.physical && it->second.dispellable && (s.kind==SpellKind::Dispel || it->second.positive==hostile)){releaseBuff(it->second);it=target->buffs.erase(it);}else ++it;
    if(hostile){target->mana=real(std::max(0.f,number(target->mana)-s.amount));if(target->illusion)unitLife(runtime_.handle("unit",id),{},source);else if(s.secondary>0 && (target->summoner || target->timedLife))damageUnit(source,id,s.secondary,0,26);}if(alive(id,NativeKind::Unit))spellVisual(s,"TargetArt",id,{target->x,target->y});
}
void ScriptSession::casterEffect(const SpellMissile& missile) {
    if(!alive(missile.source,NativeKind::Unit) || !alive(missile.target,NativeKind::Unit))return;auto target=units_.at(missile.target);auto& s=missile.spell;
    if(s.kind==SpellKind::Heal){unitLife(runtime_.handle("unit",missile.target),real(number(target->life)+spellHealAmount(*target,s.amount)));return;}if(s.kind==SpellKind::Abolish){dispelSpell(missile.source,missile.target,s);return;}
    BuffKind kind;switch(s.kind){case SpellKind::Slow:kind=BuffKind::Slow;break;case SpellKind::InnerFire:kind=BuffKind::InnerFire;break;case SpellKind::FrostArmor:kind=BuffKind::FrostArmor;break;case SpellKind::Bloodlust:kind=BuffKind::Bloodlust;break;case SpellKind::Rejuvenation:kind=BuffKind::Rejuvenation;break;case SpellKind::Frenzy:kind=BuffKind::Frenzy;break;case SpellKind::Curse:kind=BuffKind::Curse;break;case SpellKind::AntiMagicShell:kind=BuffKind::Shell;break;case SpellKind::Invisibility:kind=BuffKind::Invisibility;break;default:throw std::runtime_error("Missing caster effect consumer");}
    if(s.kind==SpellKind::AntiMagicShell){target->mana=real(std::max(0.f,number(target->mana)-s.manaLoss));if(s.amount>0 && (target->summoner || target->timedLife))damageUnit(missile.source,missile.target,s.amount,0,26);}applyBuff(missile.target,missile.source,s,kind);
}
}
