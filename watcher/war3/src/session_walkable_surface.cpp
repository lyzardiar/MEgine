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
const std::shared_ptr<WalkableGeometry>& ScriptSession::walkableModel(const std::string& path) {
    auto cached=walkableModels_.find(path);if(cached!=walkableModels_.end())return cached->second;if(walkableModels_.size()>=4096)throw std::runtime_error("Walkable model count exceeds budget");auto member=requireWorld().resources().read(path);std::shared_ptr<WalkableGeometry> model;if(member){constexpr size_t budget=128*1024*1024;if(member->bytes.size()>budget-walkableModelBytes_)throw std::runtime_error("Walkable model input budget exceeded");model=WalkableGeometry::read(member->bytes);walkableModelBytes_+=member->bytes.size();}return walkableModels_.emplace(path,std::move(model)).first->second;
}
size_t ScriptSession::prepareWalkableSurfaces(const std::function<void()>& checkpoint,const std::function<void(const std::string&)>& onError) {
    std::set<std::string> seen;size_t prepared=0,visited=0;for(auto& [id,state]:destructables_){if(checkpoint && (++visited%256)==0)checkpoint();if(!state->walkable || !state->solid || state->removed || state->cliffOverlay.empty() || state->model.empty() || !seen.insert(state->model).second)continue;if(seen.size()>64)break;if(checkpoint)checkpoint();try{if(walkableModel(state->model))++prepared;else if(onError)onError(state->model+": model not found");}catch(const std::exception& e){if(onError)onError(state->model+": "+e.what());}}return prepared;
}
std::optional<float> ScriptSession::walkableSurface(WorldPoint point,std::uint32_t exclude) {
    auto& world=requireWorld();std::optional<float> result;float x=std::bit_cast<float>(point.x.bits()),y=std::bit_cast<float>(point.y.bits());auto cell=world.terrainCliffCell(point);if(!cell)return {};auto candidates=walkableSurfaces_.find(*cell);if(candidates==walkableSurfaces_.end())return {};auto milliseconds=[](double seconds){if(!std::isfinite(seconds) || seconds<0)throw std::runtime_error("Invalid walkable animation clock");return std::uint64_t(std::min(seconds*1000.,double(UINT64_MAX/4)));};auto clock=milliseconds(simulationTime_);
    for(auto id:candidates->second){if(id==exclude || !alive(id,NativeKind::Destructable))continue;auto found=destructables_.find(id);if(found==destructables_.end())continue;auto& state=*found->second;if(state.removed || !state.solid || !state.visible || !state.walkable || state.model.empty())continue;auto& model=walkableModel(state.model);if(!model)continue;auto animation=state.animation.empty()?(state.life>0?"Stand":"Death"):state.animation;auto elapsed=state.initialDead && state.animation.empty()?UINT64_MAX/2:milliseconds(state.animationElapsed(simulationTime_));if(auto visual=doodad(state.doodadIndex);visual && visual->randomStart==state.animationStart && visual->randomAnimation==animation){auto duration=model->sequenceDuration(animation);if(duration)elapsed+=visual->randomPhase%duration;}std::array<float,3> position{x,y,0};position[0]=std::bit_cast<float>(state.position.x.bits());position[1]=std::bit_cast<float>(state.position.y.bits());position[2]=destructableHeight(state);if(auto height=model->verticalSurface(x,y,position,state.scale,state.angle,animation,elapsed,clock);height && (!result || *height>*result))result=*height;}
    return result;
}
float ScriptSession::surfaceHeight(WorldPoint point,std::uint32_t exclude) {float result=requireWorld().height(point);if(auto surface=walkableSurface(point,exclude))result=std::max(result,*surface);return result;}
}
