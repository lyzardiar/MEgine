// Author: MiYu. Retain Lua closures and dispatch typed callbacks without yielding.
#include "lua_jass_callbacks.h"
#include "lua_runtime.h"
extern "C" {
#include <lua.h>
#include <lauxlib.h>
}
#include <stdexcept>
namespace war3 {
LuaJassCallbacks::LuaJassCallbacks(LuaRuntime& owner,jass::Runtime& host):owner_(owner){
    std::string source;for(unsigned type=0;type<2;++type)for(unsigned i=0;i<slots;++i)source+="native luaCallback"+std::to_string(type)+"_"+std::to_string(i)+" takes nothing returns "+(type?"boolean":"nothing")+"\n";
    auto module=jass::Module::compile(jass::Program::parse({{"lua-callbacks.j",std::move(source),"Lua"}}));runtime_=std::make_unique<jass::Runtime>(std::move(module));runtime_->shareThreads(host);runtime_->scopedSharedDestruction();for(unsigned type=0;type<2;++type)for(unsigned i=0;i<slots;++i){auto name="luaCallback"+std::to_string(type)+"_"+std::to_string(i);runtime_->bind(name,[this,type,i](auto& vm,auto){if(i>=references_[type].size())throw std::runtime_error("Unknown Lua callback reference");auto value=owner_.invokeLuaCallback(references_[type][i],type!=0);return type?vm.boolean(value):vm.nothing();});}runtime_->initialize();
}
LuaJassCallbacks::~LuaJassCallbacks(){runtime_.reset();for(auto& group:references_)for(auto ref:group)luaL_unref(owner_.state_,LUA_REGISTRYINDEX,ref);}
jass::Value LuaJassCallbacks::reference(lua_State* state,int index,bool predicate){
    if(!lua_isfunction(state,index))throw std::runtime_error("Lua callback must be a function");auto identity=reinterpret_cast<std::uintptr_t>(lua_topointer(state,index));auto key=std::pair{identity,predicate};auto found=functions_.find(key);unsigned slot;if(found!=functions_.end())slot=found->second;else{auto& refs=references_[predicate?1:0];if(refs.size()>=slots)throw std::runtime_error("Lua callback budget exceeded");slot=unsigned(refs.size());lua_pushvalue(state,index);auto ref=luaL_ref(state,LUA_REGISTRYINDEX);try{refs.push_back(ref);functions_.emplace(key,slot);}catch(...){if(refs.size()>slot)refs.pop_back();luaL_unref(state,LUA_REGISTRYINDEX,ref);throw;}}auto name="luaCallback"+std::to_string(predicate?1:0)+"_"+std::to_string(slot);auto id=runtime_->module().functionId(name);return {runtime_->module().typeId("code"),id+1,{},runtime_.get(),runtime_->lifetimeToken()};
}
}
