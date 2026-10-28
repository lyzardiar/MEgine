// Author: MiYu. Unit lifetime and production reservations update player food before dispatching script events.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <sstream>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}}
void ScriptSession::refreshUpkeep(unsigned owner) {
    if(!upkeepRules_){
        UpkeepRules rules;rules.usage.fill(10000);rules.usage[0]=campaignExpansion_?50:40;rules.usage[1]=campaignExpansion_?80:70;rules.rates[0].fill(60);rules.rates[0][0]=0;rules.rates[0][1]=30;rules.rates[1].fill(0);
        auto parse=[&](const char* key,auto& values,bool rate){auto value=gameplay().value("Misc",key);if(value.empty())return;std::istringstream input(value);std::string part;unsigned count=0;while(std::getline(input,part,',')){if(count>=values.size())throw std::runtime_error(std::string("Upkeep list exceeds source limit: ")+key);size_t end=0;float n=std::stof(part,&end);while(end<part.size() && (part[end]==' ' || part[end]=='\t' || part[end]=='\r'))++end;if(end!=part.size() || !std::isfinite(n) || n<0 || (rate?n>1:n>10000000) || (!rate && n!=std::floor(n)))throw std::runtime_error(std::string("Invalid upkeep source: ")+key);values[count++]=rate?int(std::lround(n*100)):int(n);}if(!count)throw std::runtime_error(std::string("Empty upkeep source: ")+key);for(unsigned i=count;i<values.size();++i)values[i]=values[count-1];};
        parse("UpkeepUsage",rules.usage,false);parse("UpkeepGoldTax",rules.rates[0],true);parse("UpkeepLumberTax",rules.rates[1],true);for(unsigned i=1;i<rules.usage.size();++i)if(rules.usage[i]<rules.usage[i-1])throw std::runtime_error("Unordered upkeep thresholds");upkeepRules_=std::move(rules);
    }
    auto& player=config_.players.at(owner);unsigned level=0;int food=player.states[5];while(level+1<upkeepRules_->usage.size() && food>upkeepRules_->usage[level])++level;std::array<int,2> before{},after{};for(unsigned i=0;i<2;++i){before[i]=player.states[13+i];after[i]=player.upkeepOverride[i]?before[i]:upkeepRules_->rates[i][level];player.states[13+i]=after[i];}for(unsigned i=0;i<2;++i)if(before[i]!=after[i] && player.states[13+i]==after[i])playerChange(owner,13+i,before[i],after[i],false);
}
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
