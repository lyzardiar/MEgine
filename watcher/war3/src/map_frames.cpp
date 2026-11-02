// Author: MiYu. Runtime FDF frame ownership and inherited visibility.
#include "map_frames.h"
#include <algorithm>
#include <stdexcept>

namespace war3 {
MapFrames::MapFrames(std::shared_ptr<FrameDefinitions> definitions):definitions_(std::move(definitions)){if(!definitions_)throw std::runtime_error("Missing map frame definitions");FrameDefinition root;root.type="FRAME";root.name="GameUI";root.properties["Width"]={"0.8"};root.properties["Height"]={"0.6"};nodes_.emplace(1,Node{1,0,0,std::move(root),true,{}});}
const MapFrames::Node& MapFrames::node(std::uint32_t id) const{auto found=nodes_.find(id);if(found==nodes_.end())throw std::runtime_error("Unknown map frame: "+std::to_string(id));return found->second;}
std::uint32_t MapFrames::add(FrameDefinition definition,std::uint32_t parent,std::uint32_t context,unsigned depth){if(depth>32 || nodes_.size()>=16384 || !next_)throw std::runtime_error("Map frame budget exceeded");auto children=std::move(definition.children);definition.children.clear();auto id=next_++;nodes_.emplace(id,Node{id,parent,context,std::move(definition),true,{}});nodes_.at(parent).children.push_back(id);for(auto& child:children)add(std::move(child),id,context,depth+1);return id;}
std::uint32_t MapFrames::create(const std::string& name,std::uint32_t parent,std::uint32_t context){node(parent);auto definition=definitions_->frame(name);auto staged=*this;auto id=staged.add(std::move(definition),parent,context,0);++staged.revision_;*this=std::move(staged);return id;}
void MapFrames::destroy(std::uint32_t id){if(id==root())throw std::runtime_error("Cannot destroy map UI root");auto parent=node(id).parent;std::vector<std::uint32_t> pending{id};for(size_t i=0;i<pending.size();++i){auto& children=node(pending[i]).children;pending.insert(pending.end(),children.begin(),children.end());}auto& siblings=nodes_.at(parent).children;std::erase(siblings,id);for(auto child:pending)nodes_.erase(child);++revision_;}
void MapFrames::visible(std::uint32_t id,bool value){node(id);auto& current=nodes_.at(id).visible;if(current!=value){current=value;++revision_;}}
bool MapFrames::visible(std::uint32_t id) const{node(id);for(unsigned depth=0;id;++depth){if(depth>34)throw std::runtime_error("Invalid map frame hierarchy");auto& current=node(id);if(!current.visible)return false;id=current.parent;}return true;}
}
