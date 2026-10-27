// Author: MiYu. Real illusion instances, summon context and timed life share the fixed simulation and unit renderer.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}}
std::vector<std::uint32_t> ScriptSession::illusions(std::uint32_t caster,std::uint32_t original,unsigned count,float dealt,float taken,double duration,std::uint32_t buff,std::uint32_t ability) {
    if(count>64 || !std::isfinite(dealt) || dealt<0 || !std::isfinite(taken) || taken<0 || !std::isfinite(duration) || duration<0 || duration>86400)throw std::runtime_error("Illusion parameters outside supported range");std::vector<std::uint32_t> created;if(!alive(caster,NativeKind::Unit) || !alive(original,NativeKind::Unit))return created;auto summoner=units_.at(caster),source=units_.at(original);if(source->building || source->illusion || number(source->life)<=0 || source->removing)return created;
    auto owner=summoner->owner;for(unsigned i=0;i<count;++i){if(!alive(caster,NativeKind::Unit) || !alive(original,NativeKind::Unit) || summoner->owner!=owner || source->removing || number(source->life)<=0)break;auto point=spawnPoint(*source,source->type);if(!point)break;auto unit=createUnit(owner,source->type,point->x,point->y,source->facing,0,source.get());if(!alive(unit.bits,NativeKind::Unit))continue;auto clone=units_.at(unit.bits);clone->illusionOriginal=original;clone->summoner=caster;clone->summonAbility=ability;clone->damageDealt=dealt;clone->damageTaken=taken;clone->timedLife=TimedLife{buff,duration,duration,false};if(buff)clone->abilities[buff]=1;created.push_back(unit.bits);}
    for(auto id:created){if(!alive(caster,NativeKind::Unit) || !alive(id,NativeKind::Unit))continue;ScriptContext context;context.summoningUnit=caster;context.summonedUnit=id;unitEvent(caster,47,84,context);}return created;
}
void ScriptSession::timedLives(double delta) {
    std::vector<std::uint32_t> expired;for(auto& [id,u]:units_)if(u->illusion && number(u->life)<=0)expired.push_back(id);else if(u->timedLife && !u->timedLife->paused && number(u->life)>0){u->timedLife->remaining=std::max(0.,u->timedLife->remaining-delta);if(u->timedLife->remaining<=0)expired.push_back(id);}
    for(auto id:expired){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->illusion && number(u->life)<=0){removeUnit(id);continue;}if(!u->timedLife || u->timedLife->paused || u->timedLife->remaining>0)continue;auto buff=u->timedLife->buff;u->timedLife.reset();if(buff)u->abilities.erase(buff);unitLife(runtime_.handle("unit",id),{});if(u->illusion && alive(id,NativeKind::Unit))removeUnit(id);}
}
void ScriptSession::bindIllusionNatives() {
    bind("IsUnitIllusion","boolean",{"unit"},[this](auto& vm,auto a){return vm.boolean(a[0].bits && unit(a[0]).illusion);});
    bind("UnitApplyTimedLife","nothing",{"unit","integer","real"},[this](auto& vm,auto a){auto duration=number(jass::Real::fromBits(a[2].bits));if(!std::isfinite(duration) || duration<0 || duration>86400)throw std::runtime_error("Timed life duration outside supported range");auto& u=unit(a[0]);if(u.timedLife && u.timedLife->buff)u.abilities.erase(u.timedLife->buff);u.timedLife=TimedLife{a[1].bits,duration,duration,false};if(a[1].bits)u.abilities[a[1].bits]=1;return vm.nothing();});
    bind("UnitPauseTimedLife","nothing",{"unit","boolean"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(u.timedLife)u.timedLife->paused=a[1].bits!=0;return vm.nothing();});
    bind("GetSummoningUnit","unit",{},[this](auto& vm,auto){return vm.handle("unit",contexts_.empty()?0:contexts_.back().summoningUnit);});
    bind("GetSummonedUnit","unit",{},[this](auto& vm,auto){return vm.handle("unit",contexts_.empty()?0:contexts_.back().summonedUnit);});
}
}
