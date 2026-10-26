// Author: MiYu. Source blight natives share the world's terrain/pathing mutation and render invalidation.
#include "session.h"
#include <bit>

namespace war3 {
void ScriptSession::bindBlightNatives() {
    auto point=[](jass::Value x,jass::Value y){return WorldPoint{jass::Real::fromBits(x.bits),jass::Real::fromBits(y.bits)};};
    bind("IsPointBlighted","boolean",{"real","real"},[this,point](auto& vm,auto a){return vm.boolean(requireWorld().blighted(point(a[0],a[1])));});
    bind("GetTerrainType","integer",{"real","real"},[this,point](auto& vm,auto a){return vm.integer(std::bit_cast<std::int32_t>(requireWorld().terrainType(point(a[0],a[1]))));});
    bind("GetTerrainVariance","integer",{"real","real"},[this,point](auto& vm,auto a){return vm.integer(int(requireWorld().terrainVariation(point(a[0],a[1]))));});
    bind("SetBlight","nothing",{"player","real","real","real","boolean"},[this,point](auto& vm,auto a){playerId(a[0]);requireWorld().blight(point(a[1],a[2]),std::bit_cast<float>(a[3].bits),a[4].bits!=0);return vm.nothing();});
    bind("SetBlightPoint","nothing",{"player","real","real","boolean"},[this,point](auto& vm,auto a){playerId(a[0]);requireWorld().blightPoint(point(a[1],a[2]),a[3].bits!=0);return vm.nothing();});
    bind("SetBlightRect","nothing",{"player","rect","boolean"},[this](auto& vm,auto a){playerId(a[0]);requireWorld().blight(std::get<WorldRect>(object(a[1],NativeKind::Rect).state),a[2].bits!=0);return vm.nothing();});
    bind("SetBlightLoc","nothing",{"player","location","real","boolean"},[this](auto& vm,auto a){playerId(a[0]);requireWorld().blight(std::get<WorldPoint>(object(a[1],NativeKind::Location).state),std::bit_cast<float>(a[2].bits),a[3].bits!=0);return vm.nothing();});
}
}
