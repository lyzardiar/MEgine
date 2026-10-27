// Author: MiYu. Source Frost Armor retaliation and Shadow Strike poison share real armor, missiles, damage and timed state.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
void ScriptSession::frostPoisonInfo(SpellInfo& s){
    auto field=[&](const char* key){return definitions().number(s.ability,"AbilityData",std::string(key)+std::to_string(s.level));};if(!s.buff)throw std::runtime_error("Frost Armor or Shadow Strike requires its source buff");
    if(s.kind==SpellKind::FrostArmor){s.armor=s.secondary;auto buffs=definitions().field(s.ability,"AbilityData","BuffID"+std::to_string(s.level));s.guardBuff=buffs.size()>=9 && buffs[4]==','?ObjectData::code(buffs.substr(5,4)):ObjectData::code("Bfro");if(s.amount<=0 || s.amount>86400 || s.armor<0 || s.armor>1000000 || s.duration<0 || s.heroDuration<0)throw std::runtime_error("Invalid source Frost Armor duration or armor");return;}
    s.period=field("Cast");s.moveReduction=s.secondary;s.attackReduction=s.loss;s.decayPeriod=field("DataD");s.initialDamage=field("DataE");if(s.period<1.f/1024 || s.period>86400 || s.duration<=0 || s.duration>86400 || s.heroDuration<=0 || s.heroDuration>86400 || s.duration/s.period>262144 || s.heroDuration/s.period>262144 || s.amount<0 || s.amount>1000000 || s.initialDamage<0 || s.initialDamage>1000000 || s.moveReduction<0 || s.moveReduction>1 || s.attackReduction<0 || s.attackReduction>10 || s.decayPeriod<0 || s.decayPeriod>86400)throw std::runtime_error("Invalid source Shadow Strike damage, recovery or period");
}
const SpellInfo* ScriptSession::frostArmorReaction(const UnitState& unit){
    const SpellInfo* result=nullptr;for(auto& [id,b]:unit.buffs)if(b.kind==BuffKind::FrostArmor && b.remaining>0 && b.originAbility){auto& s=spellInfo(b.originAbility,b.sourceLevel);if(!result || s.armor>result->armor || (s.armor==result->armor && s.level>result->level))result=&s;}return result;
}
void ScriptSession::frostArmorChill(std::uint32_t protectedUnit,std::uint32_t attacker,const SpellInfo& s,std::uint64_t revision){
    if(!alive(protectedUnit,NativeKind::Unit) || !alive(attacker,NativeKind::Unit))return;auto from=units_.at(protectedUnit),to=units_.at(attacker);if(to->removing || to->deathRevision!=revision || number(to->life)<=0 || !enemy(from->owner,to->owner) || to->invulnerable || to->cycloned() || capability(*to,"Avul") || capability(*to,"Amim"))return;auto chill=s;chill.buff=s.guardBuff;chill.armor=0;applyBuff(attacker,protectedUnit,chill,BuffKind::Frost);auto art=s;art.ability=s.buff;spellVisual(art,"Specialart",attacker,{to->x,to->y});
}
void ScriptSession::shadowStrikeImpact(const SpellMissile& missile){
    if(!alive(missile.source,NativeKind::Unit) || !alive(missile.target,NativeKind::Unit))return;auto from=units_.at(missile.source),to=units_.at(missile.target);auto& s=missile.spell;if(!spellTarget(*from,*to,s,false,missile.owner))return;auto revision=to->deathRevision;if(!to->ethereal())damageUnit(missile.source,missile.target,s.initialDamage,0,5);if(!alive(missile.source,NativeKind::Unit) || from->removing || !alive(missile.target,NativeKind::Unit) || to->removing || to->deathRevision!=revision || number(to->life)<=0 || !spellTarget(*from,*to,s,false,missile.owner))return;applyBuff(missile.target,missile.source,s,BuffKind::ShadowStrike);
}
float ScriptSession::shadowStrikeTick(UnitBuff& buff,double elapsed){
    auto& s=spellInfo(buff.originAbility,buff.sourceLevel);buff.period+=elapsed;float damage=0;while(buff.period+1e-7>=s.period){buff.period-=s.period;damage+=s.amount;}double progress=0;if(s.decayPeriod>0 && buff.total>0)progress=std::clamp(std::floor((buff.total-buff.remaining+1e-7)/s.decayPeriod)*s.decayPeriod/buff.total,0.,1.);buff.moveReduction=s.moveReduction*float(1-progress);buff.attackReduction=s.attackReduction*float(1-progress);return damage;
}
}
