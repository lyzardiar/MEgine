// Author: MiYu. Runtime FDF frame ownership and inherited visibility.
#pragma once
#include "fdf.h"
#include <memory>

namespace war3 {
class MapFrames {
public:
    struct Node {std::uint32_t id=0,parent=0;FrameDefinition definition;bool visible=true;std::vector<std::uint32_t> children;};
private:
    std::shared_ptr<FrameDefinitions> definitions_;
    std::map<std::uint32_t,Node> nodes_;
    std::uint32_t next_=2;
    std::uint32_t add(FrameDefinition definition,std::uint32_t parent,unsigned depth);
public:
    explicit MapFrames(std::shared_ptr<FrameDefinitions> definitions);
    std::uint32_t root() const {return 1;}
    const std::shared_ptr<FrameDefinitions>& definitions() const {return definitions_;}
    const Node& node(std::uint32_t id) const;
    std::uint32_t create(const std::string& name,std::uint32_t parent);
    void destroy(std::uint32_t id);
    void visible(std::uint32_t id,bool value);
    bool visible(std::uint32_t id) const;
    size_t size() const {return nodes_.size();}
};
}
