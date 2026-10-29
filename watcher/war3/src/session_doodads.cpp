// Author: MiYu. Resolve source doodad animation targets independently of rendering.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <limits>

namespace war3 {
namespace {
int cell(double value){return int(std::clamp(std::floor(value/2048),double(INT_MIN),double(INT_MAX)));}
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
}
size_t ScriptSession::addDoodad(std::uint32_t type,float x,float y,std::uint32_t handle){
    if(!std::isfinite(x) || !std::isfinite(y))throw std::runtime_error("Non-finite doodad position");size_t index;
    if(freeDoodads_.empty()){if(doodads_.size()>=400000)throw std::runtime_error("Doodad count exceeds budget");index=doodads_.size();doodads_.emplace_back();}else{index=freeDoodads_.back();freeDoodads_.pop_back();doodads_[index]=DoodadState{};}
    auto& state=doodads_[index];state.type=type;state.handle=handle;state.x=x;state.y=y;doodadGrid_[{cell(x),cell(y)}].push_back(index);return index;
}
void ScriptSession::removeDoodad(size_t index){
    if(index>=doodads_.size() || !doodads_[index].active)return;auto& state=doodads_[index];auto bucket=doodadGrid_.find({cell(state.x),cell(state.y)});if(bucket!=doodadGrid_.end()){std::erase(bucket->second,index);if(bucket->second.empty())doodadGrid_.erase(bucket);}state=DoodadState{};state.active=false;freeDoodads_.push_back(index);
}
void ScriptSession::animateDoodads(const DoodadAnimation& command){
    double left=command.circular?double(command.x)-command.radius:number(command.rectangle.minX),right=command.circular?double(command.x)+command.radius:number(command.rectangle.maxX),bottom=command.circular?double(command.y)-command.radius:number(command.rectangle.minY),top=command.circular?double(command.y)+command.radius:number(command.rectangle.maxY);if(!std::isfinite(left) || !std::isfinite(right) || !std::isfinite(bottom) || !std::isfinite(top) || left>right || bottom>top)return;
    std::vector<size_t> matches;size_t nearest=SIZE_MAX;double nearestDistance=std::numeric_limits<double>::infinity();auto end=doodadGrid_.upper_bound({cell(right),INT_MAX});
    for(auto it=doodadGrid_.lower_bound({cell(left),INT_MIN});it!=end;++it){if(it->first.second<cell(bottom) || it->first.second>cell(top))continue;for(auto index:it->second){auto& d=doodads_[index];if(!d.active || (command.type && d.type!=command.type))continue;if(d.handle){auto found=destructables_.find(d.handle);if(found==destructables_.end() || found->second->removed)continue;}if(d.x<left || d.x>right || d.y<bottom || d.y>top)continue;double dx=double(d.x)-command.x,dy=double(d.y)-command.y,distance=dx*dx+dy*dy;if(command.circular && distance>double(command.radius)*command.radius)continue;if(command.nearest){if(distance<nearestDistance){nearestDistance=distance;nearest=index;}}else matches.push_back(index);}}
    if(nearest!=SIZE_MAX)matches.push_back(nearest);for(auto index:matches){auto& state=doodads_[index];state.randomStart=command.random?command.started:-1;state.randomAnimation=command.animation;state.randomPhase=std::uint32_t((index+1)*2654435761u)^state.type^std::uint32_t(std::uint64_t(command.started*1000));if(state.handle){auto found=destructables_.find(state.handle);if(found==destructables_.end() || found->second->removed)continue;auto& d=*found->second;d.animation=command.animation;d.resetAnimationClock(command.started);d.animationQueue.clear();animatedDestructables_.erase(state.handle);}else{state.animation=command.animation;state.animationStart=command.started;}}
}
}
