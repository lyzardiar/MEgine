// Author: MiYu. Deliver deterministic empty responses on a later local update.
#include "lua_local_post.h"
#include "lua_runtime.h"
#include <array>
#include <stdexcept>

namespace war3 {
LuaLocalPost::LuaLocalPost(LuaRuntime& lua):lua_(lua){
    std::weak_ptr<State> weak=state_;lua_.attachPostHost({[weak](std::uint64_t id,std::string_view,std::string_view){auto state=weak.lock();if(!state)throw std::runtime_error("Local Lua post host detached");if(state->pending.size()>=256)throw std::runtime_error("Local Lua post queue exceeds budget");state->pending.push_back(id);}});
}
void LuaLocalPost::pump(){
    auto count=state_->pending.size();while(count--){auto id=state_->pending.front();state_->pending.pop_front();LuaResult result;result.kind=LuaResult::Kind::String;lua_.completePost(id,std::array{result});}
}
}
