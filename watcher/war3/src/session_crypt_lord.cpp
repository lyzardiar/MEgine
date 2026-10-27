// Author: MiYu. Carrion Beetles consume corpses with a per-caster cap; Spiked Carapace changes real armor and melee retaliation.
#include "session.h"
#include <algorithm>
#include <bit>
#include <tuple>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
unsigned ScriptSession::carrionCount(std::uint32_t caster,std::uint32_t ability){
    auto found=carrionSummons_.find({caster,ability});if(found==carrionSummons_.end())return 0;unsigned count=0;for(auto id:found->second)if(alive(id,NativeKind::Unit)){auto u=units_.at(id);if(!u->removing && (number(u->life)>0 || u->rebirth) && u->summoner==caster && u->summonAbility==ability)++count;}return count;
}
bool ScriptSession::carrionReady(const UnitState& caster,const SpellInfo& s){
    if(carrionCount(caster.handle,s.ability)>=s.summonLimit)return false;for(auto id:corpseTargets(caster,s,{caster.x,caster.y})){auto body=units_.at(id);for(auto [type,count]:s.corpseSummons)if(count && summonPoint({body->x,body->y},type))return true;}return false;
}
void ScriptSession::summonCarrion(std::uint32_t id,const SpellInfo& s,unsigned owner){
    if(!alive(id,NativeKind::Unit))return;auto caster=units_.at(id);auto revision=caster->castRevision,death=caster->deathRevision,ownership=caster->ownerRevision;auto active=[&]{return alive(id,NativeKind::Unit) && !caster->removing && number(caster->life)>0 && caster->owner==owner && caster->castRevision==revision && caster->deathRevision==death && caster->ownerRevision==ownership;};
    if(!active() || !carrionReady(*caster,s))return;auto targets=corpseTargets(*caster,s,{caster->x,caster->y});for(auto corpse:targets){if(!active() || carrionCount(id,s.ability)>=s.summonLimit)return;if(!corpseTarget(*caster,*units_.at(corpse),s,false))continue;auto body=units_.at(corpse);WorldPoint point{body->x,body->y};bool space=false;for(auto [type,count]:s.corpseSummons)if(count && summonPoint(point,type)){space=true;break;}if(!space)continue;consumeCorpse(corpse);if(!active())return;spellVisual(s,"CasterArt",id,{caster->x,caster->y});spellVisual(s,"EffectArt",0,point);
        for(auto [type,count]:s.corpseSummons)for(unsigned i=0;i<count;++i){if(!active() || carrionCount(id,s.ability)>=s.summonLimit)return;auto at=summonPoint(point,type);if(!at)continue;auto handle=createUnit(owner,type,at->x,at->y,caster->facing);if(!alive(handle.bits,NativeKind::Unit))continue;auto unit=units_.at(handle.bits);if(!active() || unit->removing || number(unit->life)<=0 || unit->owner!=owner || unit->type!=type || carrionCount(id,s.ability)>=s.summonLimit){if(!unit->removing)removeUnit(handle.bits);if(!active())return;continue;}unit->summoner=id;unit->summonAbility=s.ability;unit->diesWithSummoner=s.summonsDieWithCaster;carrionSummons_[{id,s.ability}].insert(handle.bits);if(s.duration>0)unit->timedLife=TimedLife{s.buff,s.duration,s.duration,false};if(s.buff)unit->abilities[s.buff]=1;spellVisual(s,"TargetArt",handle.bits,*at);ScriptContext context;context.summoningUnit=id;context.summonedUnit=handle.bits;unitEvent(id,47,84,context);}
        return;
    }
}
void ScriptSession::releaseCarrionSummon(const UnitState& unit){
    auto found=carrionSummons_.find({unit.summoner,unit.summonAbility});if(found==carrionSummons_.end())return;found->second.erase(unit.handle);if(found->second.empty())carrionSummons_.erase(found);
}
void ScriptSession::killCarrionSummons(std::uint32_t caster){
    std::vector<std::pair<std::uint32_t,std::uint64_t>> victims;for(auto it=carrionSummons_.lower_bound({caster,0});it!=carrionSummons_.end() && it->first.first==caster;++it)for(auto id:it->second)if(alive(id,NativeKind::Unit)){auto u=units_.at(id);if(u->diesWithSummoner && !u->removing && number(u->life)>0)victims.emplace_back(id,u->deathRevision);}for(auto [id,revision]:victims)if(alive(id,NativeKind::Unit)){auto u=units_.at(id);if(!u->removing && number(u->life)>0 && u->deathRevision==revision && u->summoner==caster && u->diesWithSummoner)unitLife(runtime_.handle("unit",id),{});}
}
const PassiveInfo* ScriptSession::spikedCarapace(const UnitState& unit){
    const PassiveInfo* result=nullptr;for(auto [ability,level]:passiveAbilities(unit)){auto& p=passiveInfo(ability,level);if(p.kind==PassiveKind::SpikedCarapace && (!result || std::tuple{p.bonus,p.amount,-p.secondary,p.level}>std::tuple{result->bonus,result->amount,-result->secondary,result->level}))result=&p;}return result;
}
void ScriptSession::carapaceReflect(const CombatProjectile& p,float damage,const PassiveInfo& passive,std::uint64_t attackerRevision,std::uint64_t defenderRevision){
    if(damage<=0 || passive.amount<=0 || p.definition.kind!="normal" || !alive(p.source,NativeKind::Unit) || !alive(p.target,NativeKind::Unit))return;auto source=units_.at(p.source),target=units_.at(p.target);bool sameLife=target->deathRevision==defenderRevision || (defenderRevision<UINT64_MAX && target->deathRevision==defenderRevision+1 && number(target->life)<=0 && !target->rebirth && !target->phoenixCycle);if(source->removing || target->removing || number(source->life)<=0 || source->deathRevision!=attackerRevision || !sameLife || target->illusion || !enemy(p.owner,target->owner))return;damageUnit(p.target,p.source,damage*passive.amount,0,21);if(alive(p.source,NativeKind::Unit) && !source->removing && source->deathRevision==attackerRevision && number(source->life)>0){SpellInfo art;art.ability=passive.buff?passive.buff:passive.ability;spellVisual(art,"SpecialArt",p.source,{source->x,source->y});}
}
}
