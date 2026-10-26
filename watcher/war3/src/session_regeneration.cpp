// Author: MiYu. Source regeneration consumes live day/night and blight state during fixed simulation steps.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
void ScriptSession::regenerate(double delta) {
    bool daytime=requireWorld().clock().daytime();std::vector<std::uint32_t> active;for(auto& [id,u]:units_)if(!u->paused && !u->removing && number(u->life)>0 && (number(u->life)<number(u->maxLife) || number(u->mana)<number(u->maxMana) || u->healthRegen<0 || u->manaRegen<0))active.push_back(id);if(active.empty())return;bool hero=std::any_of(active.begin(),active.end(),[&](auto id){return units_.at(id)->hero;});float strength=hero?gameplayNumber("StrRegenBonus",.05f):0,intelligence=hero?gameplayNumber("IntRegenBonus",.05f):0;
    for(auto id:active){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->paused || u->removing || number(u->life)<=0)continue;bool health=u->regenType=="always" || (u->regenType=="day" && daytime) || (u->regenType=="night" && !daytime) || (u->regenType=="blight" && requireWorld().blighted({u->x,u->y}));if(u->regenType!="always" && u->regenType!="day" && u->regenType!="night" && u->regenType!="blight" && u->regenType!="none" && !u->regenType.empty() && u->regenType!="_")throw std::runtime_error("Unknown regeneration type: "+u->regenType);float hp=health?u->healthRegen+(u->hero?u->appliedHeroStats[0]*strength:0):0,mana=u->manaRegen+(u->hero?u->appliedHeroStats[2]*intelligence:0);if(!std::isfinite(hp) || !std::isfinite(mana))throw std::runtime_error("Regeneration rate outside supported range");if(hp!=0)unitLife(runtime_.handle("unit",id),real(number(u->life)+float(delta)*hp));if(alive(id,NativeKind::Unit) && number(u->life)>0 && mana!=0)u->mana=real(std::clamp(number(u->mana)+float(delta)*mana,0.f,number(u->maxMana)));}
}
}
