// Author: MiYu. Provide map-scoped local storage for simulated platform records.
#include "lua_local_platform.h"
#include "lua_runtime.h"
#include "map_script_runtime.h"
#include "session.h"
#include "archive.h"
#include <array>
#include <stdexcept>

namespace war3 {
struct LuaLocalPlatform::State {
    ScriptSession& session;std::string cacheName,owner;
    explicit State(ScriptSession& value):session(value),cacheName("11-local/"+value.world()->resources().mapDigest()){}
    bool save(unsigned player,std::string_view key,std::string_view data){
        auto name=MapScriptRuntime::defaultLocalPlatformName(player);if(!name)return false;auto& vm=session.runtime();auto cache=vm.invokeNativeOriginalNoYield("InitGameCache",std::array{vm.string(cacheName)});if(!cache.bits)return false;auto mission=vm.string(*name),entry=vm.string(std::string(key));auto args=std::array{cache,mission,entry};bool existed=vm.invokeNativeOriginalNoYield("HaveStoredString",args).bits!=0;auto old=existed?vm.invokeNativeOriginalNoYield("GetStoredString",args):vm.string({});if(!vm.invokeNativeOriginalNoYield("StoreString",std::array{cache,mission,entry,vm.string(std::string(data))}).bits)return false;if(vm.invokeNativeOriginalNoYield("SaveGameCache",std::array{cache}).bits)return true;if(existed)vm.invokeNativeOriginalNoYield("StoreString",std::array{cache,mission,entry,old});else vm.invokeNativeOriginalNoYield("FlushStoredString",args);return false;
    }
    bool load(unsigned player,std::string_view key){
        auto name=MapScriptRuntime::defaultLocalPlatformName(player);if(!name)return false;auto& vm=session.runtime();auto cache=vm.invokeNativeOriginalNoYield("InitGameCache",std::array{vm.string(cacheName)});if(!cache.bits)return false;auto mission=vm.string(*name),entry=vm.string(std::string(key));auto args=std::array{cache,mission,entry};if(!vm.invokeNativeOriginalNoYield("HaveStoredString",args).bits)return false;auto value=vm.invokeNativeOriginalNoYield("GetStoredString",args);auto destination=vm.invokeNativeOriginalNoYield("InitGameCache",std::array{vm.string("11.s")});return destination.bits && vm.invokeNativeOriginalNoYield("StoreString",std::array{destination,mission,entry,value}).bits;
    }
};
LuaLocalPlatform::LuaLocalPlatform(LuaRuntime& lua,ScriptSession& session){
    auto local=session.localPlayer();if(!local || session.networkPlayerSlot(*local) || !session.world())throw std::runtime_error("Local platform storage requires a single-player map");state_=std::make_shared<State>(session);std::weak_ptr<State> weak=state_;lua.attachJapiPlatformStorage({[weak](unsigned player,std::string_view key,std::string_view data){auto state=weak.lock();if(!state)throw std::runtime_error("Local platform storage detached");return state->save(player,key,data);},[weak](unsigned player,std::string_view key){auto state=weak.lock();if(!state)throw std::runtime_error("Local platform storage detached");return state->load(player,key);},[weak](std::string_view owner){auto state=weak.lock();if(!state)throw std::runtime_error("Local platform storage detached");state->owner=owner;}});
}
}
