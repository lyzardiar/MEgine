// Author: MiYu. Meat Wagon corpse cargo and source Exhume generation share real corpse handles, research and transport cleanup.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
bool ScriptSession::corpseCargoCandidate(const UnitState& u){for(auto [ability,level]:u.abilities)if(level>0){auto found=corpseHoldAbilities_.find(ability);if(found==corpseHoldAbilities_.end())found=corpseHoldAbilities_.emplace(ability,ObjectData::name(ability)=="Amtc" || definitions().field(ability,"AbilityData","code")=="Amtc").first;if(found->second)return true;}return false;}
jass::Value ScriptSession::createCorpse(unsigned owner,std::uint32_t type,WorldPoint point,jass::Real facing){
    auto handle=createUnit(owner,type,point.x,point.y,facing,0,nullptr,false);if(!alive(handle.bits,NativeKind::Unit))return handle;auto u=units_.at(handle.bits);u->life={};u->mana={};u->currentOrder=0;unitFootprint(*u);beginCorpse(*u,true);++fogRevision_;return handle;
}
void ScriptSession::exhumeCorpses(std::uint32_t id,double delta){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);auto info=cargoInfo(*u);if(!info || info->kind!=CargoKind::Corpse){u->exhume.reset();return;}auto source=sourceAbility(*u,"Aexh");if(!source.first){u->exhume.reset();return;}auto& p=passiveInfo(source.first,source.second);if(p.kind!=PassiveKind::Exhume)throw std::runtime_error("Exhume requires a real corpse generator");if(!u->exhume || u->exhume->ability!=source.first || u->exhume->level!=source.second)u->exhume=ExhumeState{source.first,source.second,0};auto available=config_.players[u->owner].abilityAvailable.find(source.first);SpellInfo needs;needs.prerequisites=p.prerequisites;if((available!=config_.players[u->owner].abilityAvailable.end() && !available->second) || !spellRequirements(u->owner,needs)){u->exhume->elapsed=0;return;}if(!cargoReady(*u))return;auto maximum=std::min(info->capacity,unsigned(p.amount));if(cargoUsed(id)>=maximum){u->exhume->elapsed=0;return;}u->exhume->elapsed=std::min(double(p.duration),u->exhume->elapsed+delta);if(u->exhume->elapsed<p.duration || simulationTime_<u->cargoDue)return;auto body=createCorpse(u->owner,p.corpseType,{u->x,u->y},u->facing);if(!alive(id,NativeKind::Unit) || !alive(body.bits,NativeKind::Unit))return;if(loadUnit(id,body.bits)){if(u->exhume)u->exhume->elapsed=0;}else removeUnit(body.bits);
}
}
