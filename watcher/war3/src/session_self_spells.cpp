// Author: MiYu. Source self abilities drive real health, armor, damage, mana, missile reflection and reversible commands.
#include "session.h"
#include "order_ids.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
BuffKind selfKind(SpellKind kind){return BuffKind(unsigned(BuffKind::Avatar)+unsigned(kind)-unsigned(SpellKind::Avatar));}
std::uint32_t effectKey(const SpellInfo& s){return s.buff?s.buff:s.ability;}
}
void ScriptSession::selfSpellInfo(SpellInfo& s){
    auto field=[&](const char* key){return definitions().number(s.ability,"AbilityData",std::string(key)+std::to_string(s.level));};s.orderOn=s.orderOff=0;
    if(s.kind==SpellKind::Avatar){s.armor=s.amount;s.healthBonus=s.secondary;s.flatDamage=s.loss;s.magicFactor=field("DataD");s.scaleBonus=s.area;if(gameplayNumber("CanDeactivateAvatar",0)!=0)s.unorder=orderId("unavatar");}
    if(s.kind==SpellKind::Berserk){s.moveBonus=s.amount;s.attackBonus=s.secondary;s.damageTakenBonus=s.loss;}
    if(s.kind==SpellKind::Defend){s.pierceFactor=s.amount;s.attackFactor=s.secondary;s.moveReduction=1-std::min(1.f,s.loss);s.moveBonus=std::max(0.f,s.loss-1);s.attackReduction=field("DataD");s.magicFactor=field("DataE");s.deflectChance=field("DataF")/100;s.deflectPierce=field("DataG");s.deflectMagic=field("DataH");if(gameplayNumber("CanDeactivateDefend",1)!=0)s.unorder=orderId("undefend");}
    if(s.kind==SpellKind::DivineShield && s.amount!=0 && s.amount!=1)throw std::runtime_error("Invalid source Divine Shield cancellation flag");
    if(s.kind==SpellKind::DivineShield && (s.amount!=0 || gameplayNumber("CanDeactivateDivineShield",0)!=0))s.unorder=orderId("undivineshield");
    if(s.kind==SpellKind::Immolation){s.period=s.duration;if(gameplayNumber("CanDeactivateImmolation",1)!=0)s.unorder=orderId("unimmolation");}
    if(s.kind==SpellKind::ManaShield && gameplayNumber("CanDeactivateManaShield",1)!=0)s.unorder=orderId("manashieldoff");
    if((s.kind==SpellKind::Berserk || s.kind==SpellKind::DivineShield || s.kind==SpellKind::Immolation || s.kind==SpellKind::ManaShield) && !s.buff)throw std::runtime_error("Self ability requires its source buff");
    if((s.kind==SpellKind::Avatar || s.kind==SpellKind::Berserk || s.kind==SpellKind::DivineShield) && (s.duration<=0 || s.heroDuration<=0))throw std::runtime_error("Timed self ability requires source durations");
    if(s.kind==SpellKind::Immolation && (s.period<1.f/1024 || s.period>86400 || s.area<=0 || s.secondary<0 || s.loss<0))throw std::runtime_error("Invalid source Immolation period, area or mana buffer");
    if(s.kind==SpellKind::ManaShield && (s.amount<=0 || s.secondary<0 || s.secondary>1))throw std::runtime_error("Invalid source Mana Shield efficiency or absorption");
    if(s.healthBonus<0 || s.healthBonus>1000000 || s.flatDamage<0 || s.flatDamage>1000000 || s.damageTakenBonus<0 || s.damageTakenBonus>100 || s.magicFactor<0 || s.magicFactor>100 || s.pierceFactor<0 || s.pierceFactor>100 || s.attackFactor<0 || s.attackFactor>100 || s.deflectChance<0 || s.deflectChance>1 || s.deflectPierce<0 || s.deflectPierce>100 || s.deflectMagic<0 || s.deflectMagic>100)throw std::runtime_error("Self ability modifier outside supported range");
}
bool ScriptSession::selfSpellActive(const UnitState& u,const SpellInfo& s) const {auto b=u.buffs.find(effectKey(s));return b!=u.buffs.end() && b->second.kind==selfKind(s.kind) && b->second.ability==s.ability;}
void ScriptSession::prepareSelfSpell(const UnitState& u,SpellInfo& s){if(selfSpell(s.kind) && selfSpellActive(u,s) && s.unorder){s.order=s.unorder;s.mana=s.cooldown=0;s.prerequisites.clear();}}
bool ScriptSession::selfSpellReady(const UnitState& u,const SpellInfo& s) const {if(selfSpellActive(u,s))return s.unorder && s.order==s.unorder;return s.kind!=SpellKind::Immolation || number(u.mana)>=std::max(s.mana,s.loss);}
bool ScriptSession::instantSelfSpell(std::uint32_t id,const SpellInfo& s){
    auto u=units_.at(id);if(u->selfCasting)return false;u->selfCasting=true;struct Reset {UnitState& unit;~Reset(){unit.selfCasting=false;}} reset{*u};CastOrder cast;cast.caster=id;cast.owner=u->owner;cast.spell=s;cast.point={u->x,u->y};cast.abilityHandle=abilityHandle(id,s.ability);cast.started=true;
    auto valid=[&]{return alive(id,NativeKind::Unit) && !u->removing && !u->hidden() && !u->paused && !u->abilitiesDisabled() && number(u->life)>0 && u->owner==cast.owner && u->abilities.contains(s.ability) && u->abilities.at(s.ability)>0;};ScriptContext context;context.issuedOrder=s.order;unitEvent(id,38,75,context);if(!valid() || !selfSpellReady(*u,s))return true;
    for(unsigned stage=0;stage<2;++stage){spellEvent(id,cast,stage);if(!valid())return true;}if(!selfSpellReady(*u,s) || !spellRequirements(u->owner,s) || number(u->mana)<s.mana || (!freeFormReturn(s) && spellCooldown(id,s.ability)>0))return true;
    u->mana=real(number(u->mana)-s.mana);if(!freeFormReturn(s)){u->spellCooldowns[s.ability]=simulationTime_+s.cooldown;bookSharedCooldown(*u,s.ability,s.cooldown);breakInvisibility(*u);}spellEvent(id,cast,2);if(!valid())return true;if(!s.unorder || s.order!=s.unorder)queueSpellSound(s.ability,{u->x,u->y});selfSpellEffect(id,s);spellEvent(id,cast,3);if(valid())spellEvent(id,cast,4);return true;
}
void ScriptSession::selfSpellEffect(std::uint32_t id,const SpellInfo& s,bool ownedAbility){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);auto key=effectKey(s);if(s.unorder && s.order==s.unorder){auto old=u->buffs.find(key);if(old!=u->buffs.end() && old->second.ability==s.ability){releaseBuff(old->second);u->buffs.erase(old);}return;}
    if(auto old=u->buffs.find(key);old!=u->buffs.end()){releaseBuff(old->second);u->buffs.erase(old);}UnitBuff b;b.id=s.buff;b.ability=ownedAbility?s.ability:0;b.source=b.target=id;b.kind=selfKind(s.kind);b.remaining=u->hero?s.heroDuration:s.duration;b.positive=b.physical=true;b.dispellable=false;b.persistent=s.kind==SpellKind::Defend || s.kind==SpellKind::Immolation || s.kind==SpellKind::ManaShield;b.armor=s.armor;b.flatDamage=s.flatDamage;b.healthBonus=s.healthBonus;b.attackBonus=s.attackBonus;b.moveBonus=s.moveBonus;b.moveReduction=s.moveReduction;b.attackReduction=s.attackReduction;b.scaleBonus=s.scaleBonus;b.damageTakenBonus=s.damageTakenBonus;b.pierceFactor=s.pierceFactor;b.attackFactor=s.attackFactor;b.magicFactor=s.magicFactor;b.deflectChance=s.deflectChance;b.deflectPierce=s.deflectPierce;b.deflectMagic=s.deflectMagic;b.magicImmune=s.kind==SpellKind::Avatar && s.magicFactor==0;b.invulnerable=s.kind==SpellKind::DivineShield;b.manaEfficiency=s.kind==SpellKind::ManaShield?s.amount:0;b.absorbFraction=s.kind==SpellKind::ManaShield?s.secondary:0;
    if(b.healthBonus>0){u->maxLife=real(number(u->maxLife)+b.healthBonus);u->life=real(std::min(number(u->maxLife),number(u->life)+b.healthBonus));}if(s.buff){auto art=s;art.ability=s.buff;b.visuals=spellVisual(art,"TargetArt",id,{u->x,u->y},false);}auto caster=spellVisual(s,"CasterArt",id,{u->x,u->y},false);b.visuals.insert(b.visuals.end(),caster.begin(),caster.end());u->buffs.emplace(key,std::move(b));if(ownedAbility)selfSpellActors_.insert(id);
}
void ScriptSession::selfSpellsTick(double delta){
    struct Pulse {std::uint32_t unit,ability;unsigned level;};std::vector<Pulse> pulses;std::vector<std::uint32_t> actors(selfSpellActors_.begin(),selfSpellActors_.end());
    for(auto id:actors){
        if(!alive(id,NativeKind::Unit)){selfSpellActors_.erase(id);continue;}auto u=units_.at(id);if(u->removing || number(u->life)<=0){selfSpellActors_.erase(id);continue;}if(u->paused)continue;
        for(auto it=u->buffs.begin();it!=u->buffs.end();){auto& b=it->second;if(!b.ability){++it;continue;}auto known=u->abilities.find(b.ability);if(known==u->abilities.end() || known->second<=0){releaseBuff(b);it=u->buffs.erase(it);continue;}if(b.kind!=BuffKind::Immolation || u->hidden() || u->morphed()){++it;continue;}auto& s=spellInfo(b.ability,unsigned(known->second));double elapsed=delta;if(s.secondary>0)elapsed=std::min(elapsed,double(number(u->mana)/s.secondary));u->mana=real(std::max(0.f,number(u->mana)-float(elapsed)*s.secondary));b.period+=elapsed;while(b.period>=s.period){b.period-=s.period;pulses.push_back({id,s.ability,s.level});}if(elapsed<delta || number(u->mana)<=0){releaseBuff(b);it=u->buffs.erase(it);}else ++it;}
        if(std::none_of(u->buffs.begin(),u->buffs.end(),[](auto& entry){return entry.second.ability!=0;}))selfSpellActors_.erase(id);
    }
    for(auto& pulse:pulses){if(!alive(pulse.unit,NativeKind::Unit))continue;auto source=units_.at(pulse.unit);if(source->removing || source->hidden() || source->morphed() || number(source->life)<=0)continue;auto point=WorldPoint{source->x,source->y};auto& s=spellInfo(pulse.ability,pulse.level);auto targets=spellTargets(pulse.unit,s,point,source->owner);for(auto id:targets){if(!alive(pulse.unit,NativeKind::Unit) || source->removing || number(source->life)<=0)break;float dealt=0;damageUnit(pulse.unit,id,s.amount,0,8,false,false,&dealt);if(dealt>0 && alive(id,NativeKind::Unit)){auto art=s;art.ability=s.buff;auto target=units_.at(id);spellVisual(art,"Specialart",id,{target->x,target->y});}}}
}
bool ScriptSession::defendProjectile(const CombatProjectile& p){
    if(p.reflected || p.definition.kind!="missile" || (p.definition.attackType!=2 && p.definition.attackType!=4) || !alive(p.source,NativeKind::Unit) || !alive(p.target,NativeKind::Unit) || gameplayNumber("DefendDeflection",1)==0)return false;auto from=units_.at(p.source),to=units_.at(p.target);if(!weaponTarget(*from,*to,p.definition,false,false,true) || to->abilitiesDisabled() || number(to->life)<=0 || to->removing || !weaponTarget(*to,*from,p.definition,false,false,true))return false;
    for(auto& [id,b]:to->buffs)if(b.kind==BuffKind::Defend && passiveChance(b.deflectChance)){if(projectiles_.size()>=8192)throw std::runtime_error("Reflected projectile budget exceeded");auto reflected=p;reflected.id=++projectileId_;reflected.source=p.target;reflected.target=p.source;reflected.sourceType=to->type;reflected.owner=to->owner;reflected.reflected=true;reflected.ability=0;reflected.stealthDamage=0;reflected.procs.clear();reflected.visited={p.source};reflected.start=reflected.position={to->x,to->y};reflected.endpoint={from->x,from->y};reflected.startHeight=p.endHeight;reflected.startMovement=p.endMovement;reflected.endMovement=pathMovement(from->movementType);reflected.endHeight=from->displayFlyHeight()+definitions().number(from->type,"UnitWeapons","impactZ",60);reflected.travelled=0;reflected.distance=std::hypot(number(from->x)-number(to->x),number(from->y)-number(to->y));reflected.born=simulationTime_;projectiles_.emplace(reflected.id,std::move(reflected));return true;}return false;
}
}
