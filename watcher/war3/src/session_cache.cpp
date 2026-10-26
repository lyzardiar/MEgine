// Author: MiYu. Typed in-session gamecache missions/keys; on-disk campaign formats remain an explicit later capability.
#include "session.h"
#include <algorithm>

namespace war3 {
void ScriptSession::bindCacheNatives() {
    auto text=[](jass::Value v){return v.text?*v.text:std::string{};};auto cache=[this](jass::Value value){return std::get<std::shared_ptr<ScriptCache>>(object(value,NativeKind::Cache).state);};
    bind("InitGameCache","gamecache",{"string"},[this,text](auto& vm,auto a){auto name=text(a[0]);if(name.empty() || name.size()>1024)return vm.handle("gamecache",0);if(auto found=caches_.find(name);found!=caches_.end())return vm.handle("gamecache",found->second);if(caches_.size()>=256)throw std::runtime_error("Session gamecache count exceeds budget");auto state=std::make_shared<ScriptCache>();state->name=name;auto handle=create(NativeKind::Cache);std::get<std::shared_ptr<ScriptCache>>(object(handle,NativeKind::Cache).state)=std::move(state);caches_[name]=handle.bits;return handle;});
    for(auto [suffix,type]:std::initializer_list<std::pair<const char*,const char*>>{{"Integer","integer"},{"Real","real"},{"Boolean","boolean"},{"String","string"}}){
        bind((std::string("Store")+suffix).c_str(),std::string_view(type)=="string"?"boolean":"nothing",{"gamecache","string","string",type},[cache,text,type](auto& vm,auto a){auto state=cache(a[0]);auto mission=text(a[1]),key=text(a[2]);if(mission.size()>1024 || key.size()>1024 || state->values.size()>=65536)throw std::runtime_error("Session gamecache storage budget exceeded");state->values[{mission,key,type}]=a[3];return std::string_view(type)=="string"?vm.boolean(true):vm.nothing();});
        bind((std::string("GetStored")+suffix).c_str(),type,{"gamecache","string","string"},[cache,text,type](auto& vm,auto a){auto state=cache(a[0]);auto found=state->values.find({text(a[1]),text(a[2]),type});if(found!=state->values.end())return found->second;if(std::string_view(type)=="integer")return vm.integer(0);if(std::string_view(type)=="real")return vm.real(jass::Real{});if(std::string_view(type)=="boolean")return vm.boolean(false);return vm.string({});});
        bind((std::string("HaveStored")+suffix).c_str(),"boolean",{"gamecache","string","string"},[cache,text,type](auto& vm,auto a){return vm.boolean(cache(a[0])->values.contains({text(a[1]),text(a[2]),type}));});
        bind((std::string("FlushStored")+suffix).c_str(),"nothing",{"gamecache","string","string"},[cache,text,type](auto& vm,auto a){cache(a[0])->values.erase({text(a[1]),text(a[2]),type});return vm.nothing();});
    }
    bind("FlushStoredMission","nothing",{"gamecache","string"},[cache,text](auto& vm,auto a){auto state=cache(a[0]);auto mission=text(a[1]);std::erase_if(state->values,[&](auto& value){return std::get<0>(value.first)==mission;});return vm.nothing();});
    bind("FlushGameCache","nothing",{"gamecache"},[cache](auto& vm,auto a){cache(a[0])->values.clear();return vm.nothing();});
}
}
