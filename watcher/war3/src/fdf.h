// Author: MiYu. Classic FDF definitions, includes and template inheritance.
#pragma once
#include "archive.h"
#include <map>
#include <set>

namespace war3 {
std::string sourceText(std::span<const std::uint8_t> bytes);
std::string skinValue(Archives& archives,const std::string& key,const std::string& fallback);
struct FrameDefinition {
    std::string type, name, inherits;
    bool inheritChildren = false;
    std::map<std::string,std::vector<std::string>> properties;
    std::vector<std::vector<std::string>> points;
    std::vector<FrameDefinition> children;
    const std::vector<std::string>& property(const std::string& key) const;
    float number(const std::string& key, float fallback = 0) const;
};
struct FrameFocus {std::string name,next;bool enabled=false,initial=false;};
std::string nextFrameFocus(const std::vector<FrameFocus>& frames,const std::string& current,bool reverse=false);
class FrameDefinitions {
    std::map<std::string,FrameDefinition> frames_;
    std::map<std::string,std::string> strings_;
    std::vector<std::string> loaded_, loading_;
    size_t sourceBytes_=0;
    void registerFrame(const FrameDefinition& frame);
    FrameDefinition resolve(const FrameDefinition& frame, unsigned depth, unsigned& budget) const;
public:
    void load(Archives& archives, const std::string& member);
    FrameDefinition frame(const std::string& name) const;
    std::string string(const std::string& key) const;
};
}
