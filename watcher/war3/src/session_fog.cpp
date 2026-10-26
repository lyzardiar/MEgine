// Author: MiYu. Live unit vision and script modifiers drive the same per-player fog state used by native queries.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
const FogGrid& ScriptSession::fog(unsigned owner) {
    if(owner>=16)throw std::runtime_error("Fog player outside classic range");auto& grid=fogGrids_[owner];if(!grid)grid=std::make_unique<FogGrid>(requireWorld().data().terrain);if(grid->stamp==fogRevision_)return *grid;grid->begin();auto modifiers=[&](bool after){for(auto& [id,modifier]:fogModifiers_)if(modifier->enabled && modifier->afterUnits==after && (modifier->owner==owner || (modifier->shared && (config_.players[modifier->owner].alliances[owner]&(1u<<5))))){if(modifier->radial)grid->circle(modifier->center,modifier->radius,modifier->state);else grid->rect(modifier->rect,modifier->state);}};modifiers(false);
    for(auto& [id,u]:units_)if(u->visible && std::bit_cast<float>(u->life.bits())>0 && (u->owner==owner || (config_.players[u->owner].alliances[owner]&(1u<<5)))){float sight=definitions().number(u->type,"UnitBalance",requireWorld().clock().daytime()?"sight":"nsight",800);if(sight>0)grid->circle({u->x,u->y},jass::Real::fromBits(std::bit_cast<std::uint32_t>(sight)),4);}modifiers(true);grid->finish(fogEnabled_,fogMaskEnabled_);grid->stamp=fogRevision_;return *grid;
}
void ScriptSession::bindFogNatives() {
    auto make=[this](unsigned owner,unsigned state,bool shared,bool after,WorldRect rect,WorldPoint center,jass::Real radius,bool radial){if(state!=1 && state!=2 && state!=4)throw std::runtime_error("Invalid fog state");auto value=std::make_shared<FogModifier>();value->owner=owner;value->state=state;value->shared=shared;value->afterUnits=after;value->rect=rect;value->center=center;value->radius=radius;value->radial=radial;auto handle=create(NativeKind::Fog);std::get<std::shared_ptr<FogModifier>>(object(handle,NativeKind::Fog).state)=value;fogModifiers_[handle.bits]=std::move(value);return handle;};
    bind("CreateFogModifierRect","fogmodifier",{"player","fogstate","rect","boolean","boolean"},[this,make](auto&,auto a){return make(playerId(a[0]),a[1].bits,a[3].bits!=0,a[4].bits!=0,std::get<WorldRect>(object(a[2],NativeKind::Rect).state),{},jass::Real{},false);});
    bind("CreateFogModifierRadius","fogmodifier",{"player","fogstate","real","real","real","boolean","boolean"},[this,make](auto&,auto a){auto radius=std::bit_cast<float>(a[4].bits);if(!std::isfinite(radius) || radius<0)throw std::runtime_error("Invalid fog modifier radius");return make(playerId(a[0]),a[1].bits,a[5].bits!=0,a[6].bits!=0,{},WorldPoint{jass::Real::fromBits(a[2].bits),jass::Real::fromBits(a[3].bits)},jass::Real::fromBits(a[4].bits),true);});
    bind("CreateFogModifierRadiusLoc","fogmodifier",{"player","fogstate","location","real","boolean","boolean"},[this,make](auto&,auto a){auto radius=std::bit_cast<float>(a[3].bits);if(!std::isfinite(radius) || radius<0)throw std::runtime_error("Invalid fog modifier radius");return make(playerId(a[0]),a[1].bits,a[4].bits!=0,a[5].bits!=0,{},std::get<WorldPoint>(object(a[2],NativeKind::Location).state),jass::Real::fromBits(a[3].bits),true);});
    for(auto [name,start]:std::initializer_list<std::pair<const char*,bool>>{{"FogModifierStart",true},{"FogModifierStop",false}})bind(name,"nothing",{"fogmodifier"},[this,start](auto& vm,auto a){std::get<std::shared_ptr<FogModifier>>(object(a[0],NativeKind::Fog).state)->enabled=start;++fogRevision_;return vm.nothing();});
    bind("DestroyFogModifier","nothing",{"fogmodifier"},[this](auto& vm,auto a){if(a[0].bits){object(a[0],NativeKind::Fog);fogModifiers_.erase(a[0].bits);destroy(a[0],NativeKind::Fog);++fogRevision_;}return vm.nothing();});
    for(auto [name,state]:std::initializer_list<std::pair<const char*,unsigned>>{{"IsVisibleToPlayer",4},{"IsFoggedToPlayer",2},{"IsMaskedToPlayer",1}})bind(name,"boolean",{"real","real","player"},[this,state](auto& vm,auto a){return vm.boolean(fog(playerId(a[2])).state({jass::Real::fromBits(a[0].bits),jass::Real::fromBits(a[1].bits)})==state);});
    bind("IsUnitVisible","boolean",{"unit","player"},[this](auto& vm,auto a){auto& u=unit(a[0]);return vm.boolean(u.visible && (u.owner==playerId(a[1]) || fog(playerId(a[1])).state({u.x,u.y})==4));});
}
}
