// Author: MiYu. Unit lifetime and production reservations update player food before dispatching script events.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}}
void ScriptSession::adjustFood(unsigned owner,int used,int capacity) {
    auto& states=config_.players.at(owner).states;int beforeUsed=states[5],beforeCap=states[4];auto sum=[](int value,int delta){return int(std::clamp(std::int64_t(value)+delta,std::int64_t(0),std::int64_t(INT_MAX)));};int afterUsed=states[5]=sum(beforeUsed,used),afterCap=states[4]=sum(beforeCap,capacity);
    playerChange(owner,5,beforeUsed,afterUsed,false);playerChange(owner,4,beforeCap,afterCap,false);
}
void ScriptSession::unitFood(std::uint32_t handle,bool counted,int reserved) {
    if(!alive(handle,NativeKind::Unit))return;auto state=units_.at(handle);counted=counted && !state->construction && !state->illusion && state->useFood && !state->removing && number(state->life)>0;int sign=int(counted)-int(state->foodCounted);state->foodCounted=counted;adjustFood(state->owner,sign*state->foodUsed-reserved,sign*state->foodMade);
}
void ScriptSession::transferFood(const UnitState& u,unsigned oldOwner,unsigned newOwner) {
    int used=u.foodCounted?u.foodUsed:0,capacity=u.foodCounted?u.foodMade:0;if(u.construction)used+=u.construction->food;if(u.buildingUpgrade)used+=u.buildingUpgrade->food;for(auto& job:u.production)if(job.reserved)used+=job.food;
    auto& old=config_.players[oldOwner].states;auto& next=config_.players[newOwner].states;int oldUsed=old[5],oldCap=old[4],newUsed=next[5],newCap=next[4];old[5]=std::max(0,oldUsed-used);old[4]=std::max(0,oldCap-capacity);int afterUsed=next[5]=int(std::clamp(std::int64_t(newUsed)+used,std::int64_t(0),std::int64_t(INT_MAX))),afterCap=next[4]=int(std::clamp(std::int64_t(newCap)+capacity,std::int64_t(0),std::int64_t(INT_MAX)));
    playerChange(oldOwner,5,oldUsed,std::max(0,oldUsed-used),false);playerChange(oldOwner,4,oldCap,std::max(0,oldCap-capacity),false);playerChange(newOwner,5,newUsed,afterUsed,false);playerChange(newOwner,4,newCap,afterCap,false);
}
void ScriptSession::removeUnit(std::uint32_t handle) {
    if(!alive(handle,NativeKind::Unit))return;auto state=units_.at(handle);if(state->removing)return;state->removing=true;clearConcoction(handle);clearWeaponEffects(*state);clearWarClub(*state);noteSpiritMember(*state);clearSpiritSplit(*state);clearLavaSpawn(*state);removeLocust(handle);releaseCorpseSummon(*state);killDependentSummons(handle);removePhoenixFire(handle);clearDeathRestart(*state);stasisWards_.erase(handle);rootActors_.erase(handle);unitFormActors_.erase(handle);corpseHandles_.erase(handle);++fogRevision_;releaseCargo(*state);cancelUnsummon(*state);cancelHeroRevival(handle);cancelBuildingRevivals(handle);clearAuras(*state);releaseAuraSource(handle);for(auto& [id,buff]:state->buffs)releaseBuff(buff);state->buffs.clear();cancelCombat(*state);unitFootprint(*state);auto held=state->inventory;auto jobs=std::move(state->production);state->production.clear();int reserved=state->construction?state->construction->food:0;state->construction.reset();if(state->buildingUpgrade)reserved+=state->buildingUpgrade->food;state->buildingUpgrade.reset();for(auto& job:jobs)if(job.reserved)reserved+=job.food;releaseBuilder(handle,false);unitFood(handle,false,reserved);releaseMine(*state);
    for(auto id:held)if(alive(handle,NativeKind::Unit) && id && alive(id,NativeKind::Item) && items_.at(id)->holder==handle)dropItem(handle,id);
    for(auto& o:objects_)if(o.alive && o.kind==NativeKind::Group)std::erase(std::get<Group>(o.state).units,handle);for(auto it=abilityHandles_.begin();it!=abilityHandles_.end();)if(it->first.first==handle){destroy(runtime_.handle("ability",it->second),NativeKind::Ability);it=abilityHandles_.erase(it);}else ++it;units_.erase(handle);destroy(runtime_.handle("unit",handle),NativeKind::Unit);
}
void ScriptSession::bindFoodNatives() {
    bind("SetUnitUseFood","nothing",{"unit","boolean"},[this](auto& vm,auto a){auto& u=unit(a[0]);u.useFood=a[1].bits!=0;unitFood(a[0].bits,u.useFood);return vm.nothing();});
    for(auto [name,capacity]:std::initializer_list<std::pair<const char*,bool>>{{"GetFoodUsed",false},{"GetFoodMade",true}})bind(name,"integer",{"integer"},[this,capacity](auto& vm,auto a){if(!definitions().contains(a[0].bits))return vm.integer(0);return vm.integer(int(definitions().number(a[0].bits,"UnitBalance",capacity?"fmade":"fused")));});

}
}
