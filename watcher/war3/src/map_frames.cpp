// Author: MiYu. Runtime FDF frame ownership and inherited visibility.
#include "map_frames.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace war3 {
MapFrameRect solveMapFramePoints(float width,float height,std::span<const MapFramePoint> points){
    if(points.empty() || !std::isfinite(width) || !std::isfinite(height) || width<0 || height<0)throw std::runtime_error("Invalid map frame layout");
    auto axis=[&](bool vertical,float size){auto coefficient=[&](const MapFramePoint& p){return float(vertical?p.point/3:p.point%3)*.5f;};auto value=[&](const MapFramePoint& p){return vertical?p.y:p.x;};auto first=points.front();if(first.point>8 || !std::isfinite(first.x) || !std::isfinite(first.y))throw std::runtime_error("Invalid map frame point");float c=coefficient(first),v=value(first);bool sized=false;for(auto& p:points){if(p.point>8 || !std::isfinite(p.x) || !std::isfinite(p.y))throw std::runtime_error("Invalid map frame point");float d=coefficient(p)-c;if(d!=0 && !sized){size=(value(p)-v)/d;sized=true;}}if(!std::isfinite(size) || size<0)throw std::runtime_error("Invalid map frame extent");float origin=v-c*size;for(auto& p:points)if(std::abs(origin+coefficient(p)*size-value(p))>1e-5f)throw std::runtime_error("Conflicting map frame anchors");return std::pair{origin,size};};
    auto [x,w]=axis(false,width);auto [y,h]=axis(true,height);return {x,y,w,h};
}
MapFrames::MapFrames(std::shared_ptr<FrameDefinitions> definitions):definitions_(std::move(definitions)){if(!definitions_)throw std::runtime_error("Missing map frame definitions");FrameDefinition root;root.type="FRAME";root.name="GameUI";root.properties["Width"]={"0.8"};root.properties["Height"]={"0.6"};nodes_.emplace(1,Node{1,0,0,std::move(root),true,{},{}});}
const MapFrames::Node& MapFrames::node(std::uint32_t id) const{auto found=nodes_.find(id);if(found==nodes_.end())throw std::runtime_error("Unknown map frame: "+std::to_string(id));return found->second;}
std::uint32_t MapFrames::add(FrameDefinition definition,std::uint32_t parent,std::uint32_t context,unsigned depth){if(depth>32 || nodes_.size()>=16384 || !next_)throw std::runtime_error("Map frame budget exceeded");auto children=std::move(definition.children);definition.children.clear();auto id=next_++;nodes_.emplace(id,Node{id,parent,context,std::move(definition),true,{},{}});nodes_.at(parent).children.push_back(id);for(auto& child:children)add(std::move(child),id,context,depth+1);return id;}
std::uint32_t MapFrames::create(const std::string& name,std::uint32_t parent,std::uint32_t context){node(parent);auto definition=definitions_->frame(name);auto staged=*this;auto id=staged.add(std::move(definition),parent,context,0);++staged.revision_;*this=std::move(staged);return id;}
void MapFrames::destroy(std::uint32_t id){if(id==root())throw std::runtime_error("Cannot destroy map UI root");auto parent=node(id).parent;std::vector<std::uint32_t> pending{id};for(size_t i=0;i<pending.size();++i){auto& children=node(pending[i]).children;pending.insert(pending.end(),children.begin(),children.end());}std::set<std::uint32_t> removed(pending.begin(),pending.end());auto& siblings=nodes_.at(parent).children;std::erase(siblings,id);for(auto child:pending)nodes_.erase(child);for(auto& [key,current]:nodes_)std::erase_if(current.anchors,[&](auto& entry){return removed.contains(entry.second.target);});++revision_;}
void MapFrames::setPoint(std::uint32_t id,std::uint32_t point,std::uint32_t target,std::uint32_t targetPoint,float x,float y){node(id);node(target);if(id==root() || id==target || point>8 || targetPoint>8 || !std::isfinite(x) || !std::isfinite(y))throw std::runtime_error("Invalid map frame anchor");nodes_.at(id).anchors.insert_or_assign(point,Anchor{point,target,targetPoint,x,y});++revision_;}
void MapFrames::visible(std::uint32_t id,bool value){node(id);auto& current=nodes_.at(id).visible;if(current!=value){current=value;++revision_;}}
bool MapFrames::visible(std::uint32_t id) const{node(id);for(unsigned depth=0;id;++depth){if(depth>34)throw std::runtime_error("Invalid map frame hierarchy");auto& current=node(id);if(!current.visible)return false;id=current.parent;}return true;}
}
