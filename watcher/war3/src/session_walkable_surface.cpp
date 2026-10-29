// Author: MiYu. Archive-backed walkable model surfaces shared by map scripts and game presentation.
#include "session.h"
#include "walkable_geometry.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
void ScriptSession::walkableSurfaceIndex(const DestructableState& state,bool add) {
    if(!state.handle)return;for(auto cell:state.cliffOverlay){auto found=walkableSurfaces_.find(cell.index);if(add){if(found==walkableSurfaces_.end())found=walkableSurfaces_.emplace(cell.index,std::vector<std::uint32_t>{}).first;found->second.push_back(state.handle);}else{if(found==walkableSurfaces_.end())throw std::runtime_error("Missing walkable surface index");auto owner=std::find(found->second.begin(),found->second.end(),state.handle);if(owner==found->second.end())throw std::runtime_error("Missing walkable surface owner");found->second.erase(owner);if(found->second.empty())walkableSurfaces_.erase(found);}}
}
std::optional<float> ScriptSession::walkableSurface(WorldPoint point,std::uint32_t exclude) {
    auto& world=requireWorld();std::optional<float> result;float x=std::bit_cast<float>(point.x.bits()),y=std::bit_cast<float>(point.y.bits());auto cell=world.terrainCliffCell(point);if(!cell)return {};auto candidates=walkableSurfaces_.find(*cell);if(candidates==walkableSurfaces_.end())return {};auto milliseconds=[](double seconds){if(!std::isfinite(seconds) || seconds<0)throw std::runtime_error("Invalid walkable animation clock");return std::uint64_t(std::min(seconds*1000.,double(UINT64_MAX/4)));};auto clock=milliseconds(simulationTime_);
    for(auto id:candidates->second){if(id==exclude || !alive(id,NativeKind::Destructable))continue;auto found=destructables_.find(id);if(found==destructables_.end())continue;auto& state=*found->second;if(state.removed || !state.solid || !state.visible || !state.walkable || state.model.empty())continue;auto cached=walkableModels_.find(state.model);if(cached==walkableModels_.end()){if(walkableModels_.size()>=4096)throw std::runtime_error("Walkable model count exceeds budget");auto member=world.resources().read(state.model);std::shared_ptr<WalkableGeometry> model;if(member){constexpr size_t budget=128*1024*1024;if(member->bytes.size()>budget-walkableModelBytes_)throw std::runtime_error("Walkable model input budget exceeded");model=WalkableGeometry::read(member->bytes);walkableModelBytes_+=member->bytes.size();}cached=walkableModels_.emplace(state.model,std::move(model)).first;}if(!cached->second)continue;auto animation=state.animation.empty()?(state.life>0?"Stand":"Death"):state.animation;auto elapsed=state.initialDead && state.animation.empty()?UINT64_MAX/2:milliseconds(state.animationElapsed(simulationTime_));if(auto visual=doodad(state.doodadIndex);visual && visual->randomStart==state.animationStart && visual->randomAnimation==animation){auto duration=cached->second->sequenceDuration(animation);if(duration)elapsed+=visual->randomPhase%duration;}std::array<float,3> position{x,y,0};position[0]=std::bit_cast<float>(state.position.x.bits());position[1]=std::bit_cast<float>(state.position.y.bits());position[2]=destructableHeight(state);if(auto height=cached->second->verticalSurface(x,y,position,state.scale,state.angle,animation,elapsed,clock);height && (!result || *height>*result))result=*height;}
    return result;
}
float ScriptSession::surfaceHeight(WorldPoint point,std::uint32_t exclude) {float result=requireWorld().height(point);if(auto surface=walkableSurface(point,exclude))result=std::max(result,*surface);return result;}
}
