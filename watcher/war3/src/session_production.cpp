// Author: MiYu. Paid training queues, food reservations, completion events and rally commands share simulation state.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}}
std::optional<WorldPoint> ScriptSession::spawnPoint(const UnitState& source,std::uint32_t type) {
    auto& data=definitions();float radius=std::clamp(data.number(type,"UnitBalance","collision",data.number(type,"UnitData","collision",16)),0.f,512.f),distance=source.collision+radius+32;bool flying=data.property(type,"umvt",data.field(type,"UnitData","movetp"))=="fly";float x=number(source.x),y=number(source.y);
    for(unsigned ring=0;ring<9;++ring)for(unsigned side=0;side<16;++side){float angle=float(side)*6.28318530718f/16;WorldPoint candidate{real(x+std::cos(angle)*(distance+ring*32)),real(y+std::sin(angle)*(distance+ring*32))};candidate=requireWorld().clamp(candidate);auto route=requireWorld().route(candidate,candidate,radius,flying);if(route.empty() || std::hypot(number(route.back().x)-number(candidate.x),number(route.back().y)-number(candidate.y))>1)continue;bool free=true;for(auto& [id,u]:units_)if(!u->hidden() && u->pathing && number(u->life)>0 && (u->movementType=="fly")==flying && std::hypot(number(u->x)-number(candidate.x),number(u->y)-number(candidate.y))<u->collision+radius){free=false;break;}if(free)return candidate;}return {};
}
bool ScriptSession::train(std::uint32_t handle,std::uint32_t type) {
    if(!alive(handle,NativeKind::Unit))return false;auto u=units_.at(handle);if(u->removing || u->construction || u->buildingUpgrade || u->hidden() || u->paused || number(u->life)<=0 || u->production.size()>=7 || std::find(u->trainables.begin(),u->trainables.end(),type)==u->trainables.end())return false;auto& info=product(type);std::string reason;if(!productAllowed(u->owner,info,reason,false))return false;auto owner=u->owner;auto& states=config_.players[owner].states;int gold=states[1],lumber=states[2];states[1]-=info.gold;states[2]-=info.lumber;u->production.push_back({type,info.gold,info.lumber,info.food,std::max(1./32,double(info.trainTime)),0,false,false,++productionTicket_});playerChange(owner,1,gold,gold-info.gold,false);playerChange(owner,2,lumber,lumber-info.lumber,false);startProduction(handle);return true;
}
bool ScriptSession::startProduction(std::uint32_t handle) {
    if(!alive(handle,NativeKind::Unit))return false;auto u=units_.at(handle);if(u->removing || u->construction || u->buildingUpgrade || u->hidden() || u->paused || number(u->life)<=0 || u->production.empty())return false;auto& job=u->production.front();if(job.started)return true;auto& states=config_.players[u->owner].states;if(job.food>0 && states[5]>std::min(states[4],states[6])-job.food)return false;job.started=true;job.reserved=!job.research;auto ticket=job.ticket;bool researching=job.research;ScriptContext context;if(researching)context.researched=job.type;else context.trainedType=job.type;int food=job.food;if(!researching)adjustFood(u->owner,food,0);if(alive(handle,NativeKind::Unit) && !u->production.empty() && u->production.front().ticket==ticket)unitEvent(handle,researching?35:32,researching?72:69,context);return true;
}
bool ScriptSession::cancelProduction(std::uint32_t handle,size_t index,bool refund) {
    if(!alive(handle,NativeKind::Unit))return false;auto u=units_.at(handle);if(index>=u->production.size())return false;auto job=u->production[index];u->production.erase(u->production.begin()+index);auto owner=u->owner;auto& states=config_.players[owner].states;int gold=states[1],lumber=states[2],food=states[5];if(refund){states[1]=int(std::min(std::int64_t(INT_MAX),std::int64_t(gold)+job.gold));states[2]=int(std::min(std::int64_t(INT_MAX),std::int64_t(lumber)+job.lumber));}if(job.reserved)states[5]=std::max(0,food-job.food);int afterGold=states[1],afterLumber=states[2],afterFood=states[5];playerChange(owner,5,food,afterFood,false);playerChange(owner,1,gold,afterGold,false);playerChange(owner,2,lumber,afterLumber,false);ScriptContext context;if(job.research)context.researched=job.type;else context.trainedType=job.type;unitEvent(handle,job.research?36:33,job.research?73:70,context);return true;
}
void ScriptSession::production(double delta) {
    std::vector<std::uint32_t> producers;for(auto& [id,u]:units_)if(!u->production.empty())producers.push_back(id);
    for(auto id:producers){if(!startProduction(id) || !alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->production.empty() || u->paused || u->removing || number(u->life)<=0)continue;auto& front=u->production.front();if(!front.started)continue;front.elapsed+=delta;if(front.elapsed<front.duration)continue;
        if(front.research){auto job=front;u->production.pop_front();if(researchLevel(u->owner,job.type)<job.level){setResearch(u->owner,job.type,int(job.level));ScriptContext context;context.researched=job.type;unitEvent(id,37,74,context);}startProduction(id);continue;}
        auto point=spawnPoint(*u,front.type);if(!point)continue;auto job=front;u->production.pop_front();auto owner=u->owner;auto rally=u->rally;auto target=u->rallyTarget;auto created=createUnit(owner,job.type,point->x,point->y,u->facing,job.reserved?job.food:0);if(alive(created.bits,NativeKind::Unit) && rally){if(alive(target,NativeKind::Unit)){auto destination=units_.at(target);rally=WorldPoint{destination->x,destination->y};}if(!target || !targetOrder(created.bits,target))moveUnit(created.bits,*rally);}ScriptContext context;context.trainedType=job.type;context.trainedUnit=created.bits;unitEvent(id,34,71,context);startProduction(id);}
}
bool ScriptSession::setRally(std::uint32_t handle,WorldPoint point,std::uint32_t target) {
    if(!alive(handle,NativeKind::Unit))return false;auto u=units_.at(handle);if(u->removing || !u->building || u->paused || number(u->life)<=0)return false;if(target && !alive(target,NativeKind::Unit) && !alive(target,NativeKind::Destructable))return false;u->rally=requireWorld().clamp(point);u->rallyTarget=target;ScriptContext context;context.issuedOrder=851980;context.orderPoint=*u->rally;context.orderTarget=target;unitEvent(handle,target?40:39,target?77:76,context);return true;
}
void ScriptSession::bindProductionNatives() {
    bind("GetTrainedUnitType","integer",{},[this](auto& vm,auto){return vm.integer(contexts_.empty()?0:std::bit_cast<std::int32_t>(contexts_.back().trainedType));});
    bind("GetTrainedUnit","unit",{},[this](auto& vm,auto){return vm.handle("unit",contexts_.empty()?0:contexts_.back().trainedUnit);});
    bind("GetUnitRallyPoint","location",{"unit"},[this](auto& vm,auto a){auto point=unit(a[0]).rally;if(!point)return vm.handle("location",0);auto handle=create(NativeKind::Location);std::get<WorldPoint>(object(handle,NativeKind::Location).state)=*point;return handle;});
    bind("GetUnitRallyDestructable","destructable",{"unit"},[this](auto& vm,auto a){auto target=unit(a[0]).rallyTarget;return vm.handle("destructable",alive(target,NativeKind::Destructable)?target:0);});
    bind("GetUnitRallyUnit","unit",{"unit"},[this](auto& vm,auto a){auto target=unit(a[0]).rallyTarget;return vm.handle("unit",alive(target,NativeKind::Unit)?target:0);});
}
}
