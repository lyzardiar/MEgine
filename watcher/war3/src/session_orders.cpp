// Author: MiYu. Player and JASS commands share path search, fixed-step movement and order events.
#include "session.h"
#include <bit>
#include <cmath>
#include <algorithm>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}}
void ScriptSession::selectUnit(std::uint32_t handle,bool selected) {auto& u=unit(runtime_.handle("unit",handle));if(u.selected==selected)return;u.selected=selected;unitEvent(handle,selected?24:25,selected?57:58);}
bool ScriptSession::stopUnit(std::uint32_t handle,bool hold) {auto& u=unit(runtime_.handle("unit",handle));if(u.paused || number(u.life)<=0)return false;cancelCombat(u);u.route.clear();u.waypoint=0;u.currentOrder=hold?851993:851972;u.holding=hold;u.animationStart=simulationTime_;u.animationTime=0;u.animation.clear();u.animationIndex.reset();u.animationQueue.clear();ScriptContext context;context.issuedOrder=u.currentOrder;auto revision=u.combat.revision;unitEvent(handle,38,75,context);if(!hold && alive(handle,NativeKind::Unit) && u.combat.revision==revision && u.currentOrder==851972)u.currentOrder=0;return true;}
bool ScriptSession::moveUnit(std::uint32_t handle,WorldPoint target,std::uint32_t order) {
    if(order==851983 || order==851990)return attackMove(handle,target,order==851990);auto& u=unit(runtime_.handle("unit",handle));if(order==851980 || (order==851971 && u.building))return setRally(handle,target);if((order!=851986 && order!=851971) || u.paused || u.building || number(u.life)<=0 || number(u.moveSpeed)<=0)return false;target=requireWorld().clamp(target);auto route=u.pathing?requireWorld().route({u.x,u.y},target,u.collision,u.movementType=="fly"):std::vector<WorldPoint>{target};if(route.empty())return false;cancelCombat(u);u.route=std::move(route);u.waypoint=0;u.currentOrder=order;u.holding=false;u.animationStart=simulationTime_;u.animationTime=0;u.animation.clear();u.animationIndex.reset();u.animationQueue.clear();ScriptContext context;context.issuedOrder=order;context.orderPoint=target;unitEvent(handle,39,76,context);return true;
}
void ScriptSession::moveUnits(double delta) {
    for(auto& [handle,state]:units_){auto& u=*state;if(!u.paused){u.animationTime+=delta*u.animationRate*(u.animation=="Attack"?u.combat.animationSpeed:1);auto difference=u.targetFlyHeight-u.flyHeight;auto step=float(delta)*u.flyRate;if(step>0)u.flyHeight+=std::clamp(difference,-step,step);}if(u.paused || u.waypoint>=u.route.size() || number(u.life)<=0)continue;float remaining=float(delta)*number(u.moveSpeed);while(remaining>0 && u.waypoint<u.route.size()){auto target=u.route[u.waypoint];float x=number(u.x),y=number(u.y),dx=number(target.x)-x,dy=number(target.y)-y,distance=std::hypot(dx,dy);if(distance>.001f)u.facing=real(std::fmod(std::atan2(dy,dx)*180.f/3.14159265359f+360.f,360.f));if(distance<=remaining){u.x=target.x;u.y=target.y;remaining-=distance;++u.waypoint;}else{u.x=real(x+dx/distance*remaining);u.y=real(y+dy/distance*remaining);remaining=0;}}if(u.waypoint>=u.route.size()){u.route.clear();u.waypoint=0;if(!u.combat.target && !u.combat.attackMove && !u.combat.follow && !u.combat.pickup && !u.combat.returning)u.currentOrder=0;u.animationStart=simulationTime_;u.animationTime=0;u.animation.clear();u.animationIndex.reset();u.animationQueue.clear();}}
}
void ScriptSession::bindOrderNatives() {
    auto point=[](jass::Value x,jass::Value y){return WorldPoint{jass::Real::fromBits(x.bits),jass::Real::fromBits(y.bits)};};auto id=[](const jass::Value& v){return v.text && *v.text=="move"?851986u:v.text && *v.text=="smart"?851971u:v.text && *v.text=="setrally"?851980u:v.text && *v.text=="attack"?851983u:v.text && *v.text=="patrol"?851990u:0u;};
    bind("IssuePointOrder","boolean",{"unit","string","real","real"},[this,point,id](auto& vm,auto a){return vm.boolean(moveUnit(a[0].bits,point(a[2],a[3]),id(a[1])));});
    bind("IssuePointOrderById","boolean",{"unit","integer","real","real"},[this,point](auto& vm,auto a){return vm.boolean(moveUnit(a[0].bits,point(a[2],a[3]),a[1].bits));});
    bind("IssuePointOrderLoc","boolean",{"unit","string","location"},[this,id](auto& vm,auto a){auto p=std::get<WorldPoint>(object(a[2],NativeKind::Location).state);return vm.boolean(moveUnit(a[0].bits,p,id(a[1])));});
    bind("IssuePointOrderByIdLoc","boolean",{"unit","integer","location"},[this](auto& vm,auto a){auto p=std::get<WorldPoint>(object(a[2],NativeKind::Location).state);return vm.boolean(moveUnit(a[0].bits,p,a[1].bits));});
    bind("IssueImmediateOrderById","boolean",{"unit","integer"},[this](auto& vm,auto a){if(a[1].bits==851976)return vm.boolean(cancelProduction(a[0].bits));if(a[1].bits==851972 || a[1].bits==851993)return vm.boolean(stopUnit(a[0].bits,a[1].bits==851993));return vm.boolean(train(a[0].bits,a[1].bits));});
    bind("GetIssuedOrderId","integer",{},[this](auto& vm,auto){return vm.integer(contexts_.empty()?0:std::bit_cast<std::int32_t>(contexts_.back().issuedOrder));});
    bind("GetOrderedUnit","unit",{},[this](auto& vm,auto){return vm.handle("unit",contexts_.empty() || !contexts_.back().issuedOrder?0:contexts_.back().triggerUnit);});
    bind("GetOrderPointX","real",{},[this](auto& vm,auto){return vm.real(contexts_.empty()?jass::Real{}:contexts_.back().orderPoint.x);});
    bind("GetOrderPointY","real",{},[this](auto& vm,auto){return vm.real(contexts_.empty()?jass::Real{}:contexts_.back().orderPoint.y);});
    bind("GetOrderPointLoc","location",{},[this](auto&,auto){auto p=contexts_.empty()?WorldPoint{}:contexts_.back().orderPoint;auto handle=create(NativeKind::Location);std::get<WorldPoint>(object(handle,NativeKind::Location).state)=p;return handle;});
}
}
