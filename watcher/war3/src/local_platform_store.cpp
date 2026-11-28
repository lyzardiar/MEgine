// Author: MiYu. Store offline platform records in the map-scoped user gamecache.
#include "local_platform_store.h"
#include "map_script_runtime.h"
#include "session.h"
#include "archive.h"
#include <array>
#include <stdexcept>

namespace war3 {
LocalPlatformStore::LocalPlatformStore(ScriptSession& session):session_(session){
    if(!session.world())throw std::runtime_error("Local platform storage requires map resources");
    cacheName_="11-local/"+session.world()->resources().mapDigest();
}
bool LocalPlatformStore::saveMission(const std::string& mission,std::string_view key,std::string_view data){
    auto& vm=session_.runtime();auto cache=vm.invokeNativeOriginalNoYield("InitGameCache",std::array{vm.string(cacheName_)});if(!cache.bits)return false;auto missionValue=vm.string(mission),entry=vm.string(std::string(key));auto args=std::array{cache,missionValue,entry};bool existed=vm.invokeNativeOriginalNoYield("HaveStoredString",args).bits!=0;auto old=existed?vm.invokeNativeOriginalNoYield("GetStoredString",args):vm.string({});if(!vm.invokeNativeOriginalNoYield("StoreString",std::array{cache,missionValue,entry,vm.string(std::string(data))}).bits)return false;if(vm.invokeNativeOriginalNoYield("SaveGameCache",std::array{cache}).bits)return true;if(existed)vm.invokeNativeOriginalNoYield("StoreString",std::array{cache,missionValue,entry,old});else vm.invokeNativeOriginalNoYield("FlushStoredString",args);return false;
}
std::optional<std::string> LocalPlatformStore::readMission(const std::string& mission,std::string_view key){
    auto& vm=session_.runtime();auto cache=vm.invokeNativeOriginalNoYield("InitGameCache",std::array{vm.string(cacheName_)});if(!cache.bits)return {};auto args=std::array{cache,vm.string(mission),vm.string(std::string(key))};if(!vm.invokeNativeOriginalNoYield("HaveStoredString",args).bits)return {};auto value=vm.invokeNativeOriginalNoYield("GetStoredString",args);return value.text?*value.text:std::string{};
}
bool LocalPlatformStore::save(unsigned player,std::string_view key,std::string_view data){auto name=MapScriptRuntime::defaultLocalPlatformName(player);return name && saveMission(*name,key,data);}
std::optional<std::string> LocalPlatformStore::read(unsigned player,std::string_view key){auto name=MapScriptRuntime::defaultLocalPlatformName(player);if(!name)return {};return readMission(*name,key);}
bool LocalPlatformStore::saveShared(std::string_view key,std::string_view data){return saveMission("Global",key,data);}
std::optional<std::string> LocalPlatformStore::readShared(std::string_view key){return readMission("Global",key);}
}
