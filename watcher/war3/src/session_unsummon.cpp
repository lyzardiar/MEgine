// Author: MiYu. Original unsummon ability and AI orders share live building decay, incremental refunds and lifecycle cleanup.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
bool ScriptSession::unsummonTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell){
    if(caster.owner!=target.owner || target.handle==caster.handle || !target.building || target.removing || target.hidden() || target.unsummon || target.illusion || number(target.life)<=0)return false;if((target.invulnerable || capability(target,"Avul")) && !spell.allowed.contains("invu") && !spell.allowed.contains("invulnerable"))return false;return true;
}
void ScriptSession::cancelUnsummon(UnitState& u){if(!u.unsummon)return;u.unsummon.reset();if(u.currentOrder==852210)u.currentOrder=0;if(u.animation=="Birth"){u.animation.clear();u.animationIndex.reset();u.animationQueue.clear();u.animationTime=0;}}
void ScriptSession::startUnsummon(std::uint32_t caster,const CastOrder& cast){
    if(!alive(caster,NativeKind::Unit) || !alive(cast.target,NativeKind::Unit))return;auto worker=units_.at(caster),u=units_.at(cast.target);if(worker->owner!=cast.owner || !unsummonTarget(*worker,*u,cast.spell))return;if(u->construction){cancelConstruction(cast.target);return;}auto& info=product(u->type);UnsummonOrder job;job.owner=u->owner;job.caster=caster;job.ability=cast.spell.ability;job.ticket=++productionTicket_;job.initialLife=number(u->life);job.maximumLife=std::max(1.f,number(u->maxLife));job.rate=cast.spell.secondary;job.factor=cast.spell.amount;job.gold=info.gold;job.lumber=info.lumber;u->unsummon=job;
    auto valid=[&]{return alive(cast.target,NativeKind::Unit) && !u->removing && number(u->life)>0 && u->owner==job.owner && u->unsummon && u->unsummon->ticket==job.ticket;};if(!cancelCombat(*u)){if(valid())cancelUnsummon(*u);return;}if(!valid())return;u->route.clear();u->waypoint=0;u->currentOrder=852210;u->holding=false;
    if(u->buildingUpgrade){cancelBuildingUpgrade(cast.target);if(!valid())return;}
    auto jobs=u->production;for(auto& pending:jobs){if(!valid())return;auto it=std::find_if(u->production.begin(),u->production.end(),[&](auto& entry){return entry.ticket==pending.ticket;});if(it!=u->production.end())cancelProduction(cast.target,size_t(it-u->production.begin()));}
    std::vector<std::uint32_t> workers;for(auto& [id,unit]:units_)if(unit->gather.mine==cast.target || unit->gather.depot==cast.target)workers.push_back(id);for(auto id:workers){if(!valid())return;if(!alive(id,NativeKind::Unit))continue;auto unit=units_.at(id);if(unit->gather.mine!=cast.target && unit->gather.depot!=cast.target)continue;if(!cancelCombat(*unit))continue;unit->route.clear();unit->waypoint=0;unit->currentOrder=0;if(unit->carriedGold || unit->carriedLumber)returnResources(id);}
    if(!valid())return;u->currentOrder=852210;u->animation="Birth";u->animationIndex.reset();u->animationQueue.clear();u->animationTime=0;spellVisual(cast.spell,"TargetArt",cast.target,{u->x,u->y});
}
void ScriptSession::unsummonTick(double delta){
    std::vector<std::uint32_t> active;for(auto& [id,u]:units_)if(u->unsummon)active.push_back(id);for(auto id:active){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(!u->unsummon)continue;auto job=*u->unsummon;if(u->removing || u->owner!=job.owner || number(u->life)<=0){cancelUnsummon(*u);continue;}if(u->paused || u->stunned() || u->hidden())continue;auto valid=[&]{return alive(id,NativeKind::Unit) && !u->removing && u->owner==job.owner && u->unsummon && u->unsummon->ticket==job.ticket;};float life=number(u->life),drain=std::min(life,job.rate>0?float(delta)*job.rate:life);u->unsummon->drained=std::min(double(job.initialLife),job.drained+drain);job=*u->unsummon;
        auto due=[&](int cost){return int(std::clamp(std::floor(double(cost)*job.factor*job.drained/job.maximumLife+1e-7),0.,double(INT_MAX)));};int gold=due(job.gold),lumber=due(job.lumber);auto& states=config_.players[job.owner].states;int beforeGold=states[1],beforeLumber=states[2];int afterGold=states[1]=int(std::min(std::int64_t(INT_MAX),std::int64_t(beforeGold)+gold-job.returnedGold)),afterLumber=states[2]=int(std::min(std::int64_t(INT_MAX),std::int64_t(beforeLumber)+lumber-job.returnedLumber));u->unsummon->returnedGold=gold;u->unsummon->returnedLumber=lumber;u->life=real(std::max(.0001f,life-drain));
        playerChange(job.owner,1,beforeGold,afterGold,false);playerChange(job.owner,2,beforeLumber,afterLumber,false);if(!valid())continue;if(drain>=life && number(u->life)<=.0001f){unitLife(runtime_.handle("unit",id),{});if(alive(id,NativeKind::Unit) && u->owner==job.owner && number(u->life)<=0)removeUnit(id);}
    }
}
void ScriptSession::aiUnsummon(ScriptAI& ai,std::uint32_t target){
    if(!alive(target,NativeKind::Unit))return;auto building=units_.at(target);if(building->owner!=ai.owner || !building->building || building->unsummon || building->removing || number(building->life)<=0)return;std::vector<std::pair<float,std::uint32_t>> candidates;for(auto& [id,u]:units_)if(u->owner==ai.owner && !u->removing && !u->paused && !u->stunned() && !u->hidden() && !u->building && !u->construction && !u->cast && !u->buildOrder && !u->workingOn && !u->repair && number(u->life)>0 && sourceAbility(*u,"Auns").first)candidates.emplace_back(std::hypot(number(u->x)-number(building->x),number(u->y)-number(building->y)),id);std::sort(candidates.begin(),candidates.end());for(auto [distance,id]:candidates)if(alive(id,NativeKind::Unit)){auto ability=sourceAbility(*units_.at(id),"Auns");if(ability.first && castSpell(id,ability.first,target))break;}
}
}
