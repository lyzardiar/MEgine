// Author: MiYu. Provide map-scoped local storage for simulated platform records.
#include "lua_local_platform.h"
#include "local_platform_store.h"
#include "lua_runtime.h"
#include "map_script_runtime.h"
#include "session.h"
#include <array>
#include <stdexcept>

namespace war3 {
struct LuaLocalPlatform::State {
    ScriptSession& session;LocalPlatformStore store;std::string owner;
    explicit State(ScriptSession& value):session(value),store(value){}
    bool save(unsigned player,std::string_view key,std::string_view data){return store.save(player,key,data);}
    bool load(unsigned player,std::string_view key){
        auto value=store.read(player,key);if(!value)return false;auto name=MapScriptRuntime::defaultLocalPlatformName(player);if(!name)return false;auto& vm=session.runtime();auto destination=vm.invokeNativeOriginalNoYield("InitGameCache",std::array{vm.string("11.s")});return destination.bits && vm.invokeNativeOriginalNoYield("StoreString",std::array{destination,vm.string(*name),vm.string(std::string(key)),vm.string(*value)}).bits;
    }
};
LuaLocalPlatform::LuaLocalPlatform(LuaRuntime& lua,ScriptSession& session){
    auto local=session.localPlayer();if(!local || session.networkPlayerSlot(*local) || !session.world())throw std::runtime_error("Local platform storage requires a single-player map");state_=std::make_shared<State>(session);std::weak_ptr<State> weak=state_;lua.attachJapiPlatformStorage({[weak](unsigned player,std::string_view key,std::string_view data){auto state=weak.lock();if(!state)throw std::runtime_error("Local platform storage detached");return state->save(player,key,data);},[weak](unsigned player,std::string_view key){auto state=weak.lock();if(!state)throw std::runtime_error("Local platform storage detached");return state->load(player,key);},[weak](std::string_view owner){auto state=weak.lock();if(!state)throw std::runtime_error("Local platform storage detached");state->owner=owner;}});
}
}
