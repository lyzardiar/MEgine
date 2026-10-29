// Author: MiYu. Acolytes approach an owned Sacrificial Pit and produce a Shade through the session production queue.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
bool ScriptSession::sacrificePitTarget(const UnitState& worker,const UnitState& pit){
    if(worker.handle==pit.handle || worker.owner!=pit.owner || worker.removing || worker.hidden() || worker.hero || worker.building || worker.illusion || number(worker.life)<=0 || !worker.groundTarget() || worker.classifications(definitions().unitClasses(worker.type)).find("mechanical")!=std::string::npos || pit.removing || pit.hidden() || !pit.building || pit.paused || pit.stunned() || pit.abilitiesDisabled() || pit.productionBlocked() || pit.construction || pit.buildingUpgrade || pit.unsummon || number(pit.life)<=0 || !pit.production.empty())return false;
    auto workerAbility=sourceAbility(worker,"Alam"),pitAbility=sourceAbility(pit,"Asac");if(!workerAbility.first || !pitAbility.first)return false;auto available=[&](std::uint32_t ability){auto it=config_.players[pit.owner].abilityAvailable.find(ability);return it==config_.players[pit.owner].abilityAvailable.end() || it->second;};return available(workerAbility.first) && available(pitAbility.first);
}
void ScriptSession::releaseSacrifice(const ProductionOrder& job,UnitState& pit){
    if(!job.sacrificialWorker || !alive(job.sacrificialWorker,NativeKind::Unit))return;auto worker=units_.at(job.sacrificialWorker);if(worker->sacrificePit!=pit.handle)return;worker->sacrificePit=0;if(!worker->removing && number(worker->life)>0){auto point=cargoPoint(pit,*worker,{worker->x,worker->y});if(point){worker->x=point->x;worker->y=point->y;}worker->combat.home={worker->x,worker->y};unitFootprint(*worker);}++fogRevision_;
}
void ScriptSession::cancelSacrificeForUnit(std::uint32_t id){
    if(!alive(id,NativeKind::Unit))return;auto unit=units_.at(id);if(unit->sacrificePit){auto pitId=unit->sacrificePit;if(alive(pitId,NativeKind::Unit)){auto pit=units_.at(pitId);for(size_t i=0;i<pit->production.size();++i)if(pit->production[i].sacrificialWorker==id){cancelProduction(pitId,i);return;}}unit->sacrificePit=0;if(!unit->removing && number(unit->life)>0)unitFootprint(*unit);++fogRevision_;return;}if(unit->removing || number(unit->life)<=0)return;for(size_t i=0;i<unit->production.size();++i)if(unit->production[i].sacrificialWorker){cancelProduction(id,i);return;}
}
void ScriptSession::sacrificePit(std::uint32_t workerId,std::uint32_t pitId){
    if(!alive(workerId,NativeKind::Unit) || !alive(pitId,NativeKind::Unit))return;auto worker=units_.at(workerId),pit=units_.at(pitId);if(!sacrificePitTarget(*worker,*pit) || productionTicket_==UINT64_MAX)return;auto& shade=product(ObjectData::code("ushd"));if(!std::isfinite(shade.trainTime) || shade.trainTime<0 || shade.food<0)return;auto food=std::max(0,shade.food-(worker->foodCounted?worker->foodUsed:0));auto duration=std::max(1./32,double(shade.trainTime));auto ticket=++productionTicket_;pit->production.push_back({ObjectData::code("ushd"),0,0,food,duration,0,false,false,ticket});pit->production.back().sacrificialWorker=workerId;worker->sacrificePit=pitId;worker->route.clear();worker->waypoint=0;unitFootprint(*worker);++fogRevision_;startProduction(pitId);
}
}
