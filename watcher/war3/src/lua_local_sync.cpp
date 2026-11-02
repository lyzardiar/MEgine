// Author: MiYu. Keep single-player messages ordered and outside Lua execution.
#include "lua_local_sync.h"
#include "lua_runtime.h"
#include "session.h"
#include <stdexcept>

namespace war3 {
LuaLocalSync::LuaLocalSync(LuaRuntime& lua,ScriptSession& session):lua_(lua),player_(session.localPlayer().value_or(16)){
    if(player_>=16 || session.networkPlayerSlot(player_))throw std::runtime_error("Local Lua sync requires a single-player session");std::weak_ptr<State> weak=state_;lua_.attachJapiSyncHost({[weak](std::string_view message){auto state=weak.lock();if(!state)throw std::runtime_error("Local Lua sync host detached");send(*state,message);}});
}
void LuaLocalSync::send(State& state,std::string_view message){
    constexpr size_t budget=8u*1024u*1024u;if(state.pending.size()>=1024 || message.size()>65536 || message.size()>budget-state.bytes)throw std::runtime_error("Local Lua sync queue exceeds budget");state.pending.emplace_back(message);state.bytes+=message.size();
}
void LuaLocalSync::pump(){
    auto count=state_->pending.size();while(count--){auto message=std::move(state_->pending.front());state_->pending.pop_front();state_->bytes-=message.size();lua_.deliverJapiMessage(player_,message);}
}
}
