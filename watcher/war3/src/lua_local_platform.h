// Author: MiYu. Persist simulated platform data through the user's gamecache store.
#pragma once
#include <memory>
#include <string>
#include <string_view>

namespace war3 {
class LuaRuntime;
class ScriptSession;
class LuaLocalPlatform {
    struct State;
    std::shared_ptr<State> state_;
public:
    LuaLocalPlatform(LuaRuntime& lua,ScriptSession& session);
    LuaLocalPlatform(const LuaLocalPlatform&)=delete;
    LuaLocalPlatform& operator=(const LuaLocalPlatform&)=delete;
};
}
