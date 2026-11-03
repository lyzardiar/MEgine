// Author: MiYu. Deferred single-player delivery for Lua map synchronization messages.
#pragma once
#include <deque>
#include <memory>
#include <string>
#include <string_view>

namespace war3 {
class LuaRuntime;
class ScriptSession;
class LuaLocalSync {
    LuaRuntime& lua_;
    unsigned player_;
    struct Message {bool dz=false;std::string prefix,text;};
    struct State {std::deque<Message> pending;size_t bytes=0;};
    std::shared_ptr<State> state_=std::make_shared<State>();
    static void send(State& state,bool dz,std::string_view prefix,std::string_view message);
public:
    LuaLocalSync(LuaRuntime& lua,ScriptSession& session);
    LuaLocalSync(const LuaLocalSync&)=delete;
    LuaLocalSync& operator=(const LuaLocalSync&)=delete;
    void pump();
};
}
