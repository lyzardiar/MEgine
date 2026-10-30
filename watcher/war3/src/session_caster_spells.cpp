// Author: MiYu. Source caster abilities change actual life, timed modifiers, magic protection and dispellable state.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}}
bool ScriptSession::spellRequirements(unsigned owner,const SpellInfo& s){for(auto [type,count]:s.prerequisites)if(techCount(owner,type,false)<count)return false;return true;}
bool ScriptSession::usefulDispel(const UnitState& caster,const UnitState& target,const SpellInfo& s) {
    bool hostile=enemy(caster.owner,target.owner);if(hostile && ((s.secondary>0 && (target.illusion || (!capability(target,"Arsk") && target.typeFlag(10,target.sourceSummoned || target.summoner!=0 || bool(target.timedLife))))) || (s.amount>0 && number(target.mana)>0)))return true;for(auto& [id,b]:target.buffs)if(!b.physical && b.dispellable && (s.kind==SpellKind::Dispel || b.positive==hostile))return true;return false;
}
void ScriptSession::dispelSpell(std::uint32_t source,std::uint32_t id,const SpellInfo& s,unsigned owner) {
    if(!alive(id,NativeKind::Unit))return;if(owner==UINT_MAX){if(!alive(source,NativeKind::Unit))return;owner=units_.at(source)->owner;}auto target=units_.at(id);if(target->removing || number(target->life)<=0)return;auto death=target->deathRevision;bool hostile=enemy(owner,target->owner);for(auto it=target->buffs.begin();it!=target->buffs.end();)if(!it->second.physical && it->second.dispellable && (areaDispel(s.kind) || it->second.positive==hostile)){releaseBuff(it->second);it=target->buffs.erase(it);}else ++it;
    if(hostile || s.kind==SpellKind::Detonate)target->mana=real(std::max(0.f,number(target->mana)-s.amount));if(hostile){if(target->illusion)unitLife(runtime_.handle("unit",id),{},source);else if(s.secondary>0 && !capability(*target,"Arsk") && target->typeFlag(10,target->sourceSummoned || target->summoner!=0 || bool(target->timedLife)))damageUnit(source,id,s.secondary,0,26,false,false,nullptr,false,true,owner);}if(alive(id,NativeKind::Unit) && !target->removing && number(target->life)>0 && target->deathRevision==death)spellVisual(s,"TargetArt",id,{target->x,target->y});
}
void ScriptSession::detonateSpell(std::uint32_t source,const SpellInfo& s,unsigned owner){
    if(!alive(source,NativeKind::Unit))return;auto caster=units_.at(source);WorldPoint point{caster->x,caster->y};std::vector<std::pair<std::uint32_t,std::uint64_t>> victims;for(auto id:spellTargets(source,s,point,owner))if(id!=source)victims.emplace_back(id,units_.at(id)->deathRevision);spellVisual(s,"Specialart",0,point);unitLife(runtime_.handle("unit",source),{});
    for(auto [id,death]:victims){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->deathRevision==death && spellTarget(*caster,*u,s,false,owner))dispelSpell(source,id,s,owner);}
}
void ScriptSession::casterEffect(const SpellMissile& missile) {
    if(!alive(missile.source,NativeKind::Unit) || !alive(missile.target,NativeKind::Unit))return;auto target=units_.at(missile.target);auto& s=missile.spell;
    if(unitCasterSpell(s.kind)){unitCasterEffect(missile);return;}
    if(s.kind==SpellKind::Heal){unitLife(runtime_.handle("unit",missile.target),real(number(target->life)+spellHealAmount(*target,s.amount)));return;}if(s.kind==SpellKind::Abolish){dispelSpell(missile.source,missile.target,s);return;}
    BuffKind kind;switch(s.kind){case SpellKind::Slow:kind=BuffKind::Slow;break;case SpellKind::InnerFire:kind=BuffKind::InnerFire;break;case SpellKind::FrostArmor:kind=BuffKind::FrostArmor;break;case SpellKind::Bloodlust:kind=BuffKind::Bloodlust;break;case SpellKind::Rejuvenation:kind=BuffKind::Rejuvenation;break;case SpellKind::Frenzy:kind=BuffKind::Frenzy;break;case SpellKind::Curse:kind=BuffKind::Curse;break;case SpellKind::AntiMagicShell:kind=BuffKind::Shell;break;case SpellKind::Invisibility:kind=BuffKind::Invisibility;break;case SpellKind::Parasite:kind=BuffKind::Parasite;break;case SpellKind::MindRot:kind=BuffKind::MindRot;break;default:throw std::runtime_error("Missing caster effect consumer");}
    std::vector<PoisonDose> poison;double poisonPeriod=0;if(s.kind==SpellKind::Parasite){auto old=target->buffs.find(s.buff);if(old!=target->buffs.end() && old->second.kind==kind){poison=old->second.poison;poisonPeriod=old->second.period;}}
    if(s.kind==SpellKind::AntiMagicShell){target->mana=real(std::max(0.f,number(target->mana)-s.manaLoss));if(s.amount>0 && !capability(*target,"Arsk") && target->typeFlag(10,target->sourceSummoned || target->summoner!=0 || bool(target->timedLife)))damageUnit(missile.source,missile.target,s.amount,0,26);}applyBuff(missile.target,missile.source,s,kind);
    if(s.kind==SpellKind::Parasite){auto found=target->buffs.find(s.buff);if(found==target->buffs.end() || found->second.kind!=kind)return;auto& buff=found->second;buff.sourceOwner=missile.owner;buff.applied=++spellTicket_;if(poison.size()>=1024)throw std::runtime_error("Poison dose budget exceeded");buff.poison=std::move(poison);buff.period=poisonPeriod;PoisonDose dose;dose.source=missile.source;dose.ability=s.ability;dose.owner=missile.owner;dose.flags=s.stackFlags;dose.damage=s.amount;dose.moveReduction=s.moveReduction;dose.attackReduction=s.attackReduction;dose.remaining=buff.remaining;buff.poison.push_back(dose);std::vector<StatusDamage> ignored;poisonTick(buff,0,ignored);}
}
}
