// Author: MiYu. Adapt Lua closures to guarded JASS callback references on the shared scheduler.
#pragma once
#include "jass_runtime.h"
#include <array>
#include <map>
struct lua_State;
namespace war3 {
class LuaRuntime;
class LuaJassCallbacks {
    static constexpr unsigned slots=2048;
    LuaRuntime& owner_;
    std::unique_ptr<jass::Runtime> runtime_;
    std::array<std::vector<int>,2> references_;
    std::map<std::pair<std::uintptr_t,bool>,unsigned> functions_;
public:
    LuaJassCallbacks(LuaRuntime& owner,jass::Runtime& runtime);
    ~LuaJassCallbacks();
    jass::Value reference(lua_State* state,int index,bool predicate);
};
}
