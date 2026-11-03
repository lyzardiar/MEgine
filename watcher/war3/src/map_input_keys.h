// Author: MiYu. Track map-filtered keyboard state independently of physical keys.
#pragma once
#include "lua_runtime.h"
#include <algorithm>
#include <array>
#include <stdexcept>

namespace war3 {
class MapInputKeys {
    std::array<unsigned,256> keys_{};
public:
    void clear() {keys_.fill(0);}
    bool down(unsigned key) const {return key<keys_.size() && std::find(keys_.begin(),keys_.end(),key+1)!=keys_.end();}
    template<class Filter> bool process(unsigned original,bool pressed,LuaInputMessage& event,Filter filter){if(original>=keys_.size())return true;event.code=original;bool allowed=filter(event);if(event.code>=keys_.size())throw std::runtime_error("Invalid Lua message virtual key");keys_[original]=pressed && allowed?event.code+1:0;return allowed;}
};
}
