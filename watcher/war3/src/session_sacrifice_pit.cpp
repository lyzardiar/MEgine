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
void ScriptSession::sacrificePit(std::uint32_t workerId,std::uint32_t pitId){
    if(!alive(workerId,NativeKind::Unit) || !alive(pitId,NativeKind::Unit))return;auto worker=units_.at(workerId),pit=units_.at(pitId);if(!sacrificePitTarget(*worker,*pit) || productionTicket_==UINT64_MAX)return;auto& shade=product(ObjectData::code("ushd"));if(!std::isfinite(shade.trainTime) || shade.trainTime<0 || shade.food<0)return;auto owner=pit->owner;auto revision=pit->ownerRevision,death=pit->deathRevision;auto food=shade.food;auto duration=std::max(1./32,double(shade.trainTime));removeUnit(workerId);if(!alive(pitId,NativeKind::Unit) || units_.at(pitId)!=pit || pit->owner!=owner || pit->ownerRevision!=revision || pit->deathRevision!=death || pit->removing || number(pit->life)<=0 || !pit->production.empty())return;pit->production.push_back({ObjectData::code("ushd"),0,0,food,duration,0,false,false,++productionTicket_});startProduction(pitId);
}
}
