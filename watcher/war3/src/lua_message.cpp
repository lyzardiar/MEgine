// Author: MiYu. Host-driven Lua input message callbacks.
#include "lua_runtime.h"
#include "jass_runtime.h"
extern "C" {
#include <lua.h>
#include <lauxlib.h>
}
#include <cmath>
#include <limits>
#include <stdexcept>

namespace war3 {
void LuaRuntime::clearMessage(){if(messageHook_){luaL_unref(state_,LUA_REGISTRYINDEX,*messageHook_);messageHook_.reset();}messageAttached_=false;}
void LuaRuntime::attachMessageHost(){
    if(!jassAlive() || messageAttached_ || callbackDepth_ || lua_gethook(state_))throw std::runtime_error("Invalid Lua message attachment");int top=lua_gettop(state_);struct Reset{lua_State* state;int top;~Reset(){lua_settop(state,top);}}reset{state_,top};messageAttached_=true;luaL_getsubtable(state_,LUA_REGISTRYINDEX,LUA_LOADED_TABLE);lua_newtable(state_);lua_newtable(state_);for(auto [name,fn]:{std::pair{"__index",messageGet},std::pair{"__newindex",messageSet}}){lua_pushlightuserdata(state_,this);lua_pushinteger(state_,lua_Integer(jassGeneration_));lua_pushcclosure(state_,fn,2);lua_setfield(state_,-2,name);}lua_setmetatable(state_,-2);lua_setfield(state_,-2,"jass.message");
}
int LuaRuntime::messageGet(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || !self->messageAttached_ || self->jassGeneration_!=generation)throw std::runtime_error("Lua message host detached");size_t length=0;auto name=lua_tolstring(L,2,&length);if(!name || std::string_view(name,length)!="hook")throw std::runtime_error("Unsupported Lua message property");if(self->messageHook_)lua_rawgeti(L,LUA_REGISTRYINDEX,*self->messageHook_);else lua_pushnil(L);return 1;}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
int LuaRuntime::messageSet(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || !self->messageAttached_ || self->jassGeneration_!=generation)throw std::runtime_error("Lua message host detached");size_t length=0;auto name=lua_tolstring(L,2,&length);if(!name || std::string_view(name,length)!="hook")throw std::runtime_error("Unsupported Lua message property");if(!lua_isnil(L,3) && !lua_isfunction(L,3))throw std::runtime_error("Lua message hook must be a function or nil");std::optional<int> ref;if(lua_isfunction(L,3)){lua_pushvalue(L,3);ref=luaL_ref(L,LUA_REGISTRYINDEX);}if(self->messageHook_)luaL_unref(L,LUA_REGISTRYINDEX,*self->messageHook_);self->messageHook_=ref;return 0;}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
bool LuaRuntime::dispatchMessage(LuaInputMessage& message){
    if(!jassAlive() || !messageAttached_)throw std::runtime_error("Lua message host detached");if(lua_gethook(state_) || callbackDepth_ || activeJassState_ || jass_->currentThread())throw std::runtime_error("Cannot dispatch Lua message during script execution");const char* type=nullptr;bool key=false;switch(message.kind){case LuaInputMessage::Kind::KeyDown:type="key_down";key=true;break;case LuaInputMessage::Kind::KeyUp:type="key_up";key=true;break;case LuaInputMessage::Kind::MouseDown:type="mouse_down";break;case LuaInputMessage::Kind::MouseUp:type="mouse_up";break;default:throw std::runtime_error("Unsupported Lua input message");}if(!std::isfinite(message.x) || !std::isfinite(message.y))throw std::runtime_error("Invalid Lua message coordinates");if(!messageHook_)return true;int top=lua_gettop(state_);struct Reset{lua_State* state;int top;~Reset(){lua_settop(state,top);}}reset{state_,top};if(!lua_checkstack(state_,8))throw std::runtime_error("Lua message stack exhausted");lua_createtable(state_,0,5);lua_pushstring(state_,type);lua_setfield(state_,-2,"type");lua_pushinteger(state_,message.code);lua_setfield(state_,-2,"code");lua_pushinteger(state_,message.state);lua_setfield(state_,-2,"state");if(!key){lua_pushnumber(state_,message.x);lua_setfield(state_,-2,"x");lua_pushnumber(state_,message.y);lua_setfield(state_,-2,"y");}lua_rawgeti(state_,LUA_REGISTRYINDEX,*messageHook_);lua_pushvalue(state_,-2);protectedCallback(state_,1,1);bool allowed=lua_toboolean(state_,-1)!=0;lua_pop(state_,1);if(key){lua_pushliteral(state_,"code");lua_rawget(state_,-2);int valid=0;auto code=lua_tointegerx(state_,-1,&valid);if(!valid || code<0 || std::uint64_t(code)>std::numeric_limits<std::uint32_t>::max())throw std::runtime_error("Invalid Lua message key code");message.code=std::uint32_t(code);}return allowed;
}
}
