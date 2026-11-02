// Author: MiYu. Bind Lua primitive native calls to the owning JASS runtime without yielding.
#include "lua_runtime.h"
#include "jass_runtime.h"
extern "C" {
#include <lua.h>
#include <lauxlib.h>
}
#include <bit>
#include <cmath>
#include <cstdio>
#include <limits>
#include <stdexcept>
#include <vector>
namespace war3 {
namespace {
constexpr const char* handleMetatable="war3.jass.handle";
char handleCacheKey;
struct LuaHandle {std::uint64_t generation;std::uint32_t bits;};
int handleEqual(lua_State* L){auto a=static_cast<LuaHandle*>(luaL_testudata(L,1,handleMetatable));auto b=static_cast<LuaHandle*>(luaL_testudata(L,2,handleMetatable));lua_pushboolean(L,a && b && a->generation==b->generation && a->bits==b->bits);return 1;}
int handleText(lua_State* L){auto h=static_cast<LuaHandle*>(luaL_checkudata(L,1,handleMetatable));char text[32];std::snprintf(text,sizeof(text),"handle: 0x%X",h->bits);lua_pushstring(L,text);return 1;}
void resetHandles(lua_State* L){luaL_newmetatable(L,handleMetatable);lua_pushcfunction(L,handleEqual);lua_setfield(L,-2,"__eq");lua_pushcfunction(L,handleText);lua_setfield(L,-2,"__tostring");lua_pop(L,1);lua_newtable(L);lua_newtable(L);lua_pushliteral(L,"v");lua_setfield(L,-2,"__mode");lua_setmetatable(L,-2);lua_rawsetp(L,LUA_REGISTRYINDEX,&handleCacheKey);}
void pushHandle(lua_State* L,std::uint64_t generation,std::uint32_t bits){if(!bits){lua_pushnil(L);return;}lua_rawgetp(L,LUA_REGISTRYINDEX,&handleCacheKey);lua_rawgeti(L,-1,lua_Integer(bits));if(lua_isnil(L,-1)){lua_pop(L,1);auto h=static_cast<LuaHandle*>(lua_newuserdata(L,sizeof(LuaHandle)));*h={generation,bits};luaL_getmetatable(L,handleMetatable);lua_setmetatable(L,-2);lua_pushvalue(L,-1);lua_rawseti(L,-3,lua_Integer(bits));}lua_remove(L,-2);}
int rejectWrite(lua_State* L){return luaL_error(L,"Lua JASS global writes are not implemented");}
jass::Value argument(lua_State* L,int index,jass::Runtime& vm,jass::Id type,std::uint64_t generation){
    auto category=vm.module().type(type).category;auto kind=lua_type(L,index);
    if(category==jass::Category::Integer){std::uint32_t bits=0;if(kind==LUA_TBOOLEAN)bits=lua_toboolean(L,index)?1u:0u;else if(kind==LUA_TNUMBER){if(lua_isinteger(L,index))bits=std::uint32_t(lua_tointeger(L,index));else{double n=lua_tonumber(L,index);if(!std::isfinite(n) || n<-9223372036854775808.0 || n>=9223372036854775808.0)throw std::runtime_error("Lua JASS integer out of range");bits=std::uint32_t(static_cast<std::int64_t>(n));}}return vm.integer(std::bit_cast<std::int32_t>(bits));}
    if(category==jass::Category::Boolean){if(kind==LUA_TBOOLEAN)return vm.boolean(lua_toboolean(L,index)!=0);return vm.boolean(lua_tonumber(L,index)!=0);}
    if(category==jass::Category::Real){if(kind!=LUA_TNIL && kind!=LUA_TNUMBER)throw std::runtime_error("Unsupported Lua JASS real argument");float value=kind==LUA_TNIL?0.0f:static_cast<float>(lua_tonumber(L,index));return vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(value)));}
    if(category==jass::Category::String){size_t length=0;auto value=lua_tolstring(L,index,&length);if(value)return vm.string(std::string(value,length));return {vm.module().typeId("<null>"),0,{}};}
    if(category==jass::Category::Handle){if(kind==LUA_TNIL)return vm.handle(vm.module().type(type).name,0);auto h=static_cast<LuaHandle*>(luaL_testudata(L,index,handleMetatable));if(!h || h->generation!=generation)throw std::runtime_error("Invalid or stale Lua JASS handle");return vm.handle(vm.module().type(type).name,h->bits);}
    throw std::runtime_error("Unsupported Lua JASS argument type: "+vm.module().type(type).name);
}
int result(lua_State* L,jass::Runtime& vm,const jass::Value& value,std::uint64_t generation){
    switch(vm.module().type(value.type).category){
    case jass::Category::Nothing:return 0;
    case jass::Category::Integer:lua_pushinteger(L,std::bit_cast<std::int32_t>(value.bits));return 1;
    case jass::Category::Boolean:lua_pushboolean(L,value.bits!=0);return 1;
    case jass::Category::Real:lua_pushnumber(L,std::bit_cast<float>(value.bits));return 1;
    case jass::Category::String:if(value.text)lua_pushlstring(L,value.text->data(),value.text->size());else lua_pushnil(L);return 1;
    case jass::Category::Handle:pushHandle(L,generation,value.bits);return 1;
    default:throw std::runtime_error("Unsupported Lua JASS result type: "+vm.module().type(value.type).name);
    }
}
}
bool LuaRuntime::jassAlive() const {auto lifetime=jassLifetime_.lock();return jass_ && lifetime && lifetime->alive;}
void LuaRuntime::attachJass(jass::Runtime& runtime){
    if(jassAlive() || !runtime.ready())throw std::runtime_error("Invalid Lua JASS attachment");++jassGeneration_;jass_=&runtime;jassLifetime_=runtime.lifetimeToken();int top=lua_gettop(state_);resetHandles(state_);luaL_getsubtable(state_,LUA_REGISTRYINDEX,LUA_LOADED_TABLE);lua_newtable(state_);lua_newtable(state_);lua_pushlightuserdata(state_,this);lua_pushinteger(state_,lua_Integer(jassGeneration_));lua_pushcclosure(state_,jassLookup,2);lua_setfield(state_,-2,"__index");lua_pushcfunction(state_,rejectWrite);lua_setfield(state_,-2,"__newindex");lua_setmetatable(state_,-2);lua_setfield(state_,-2,"jass.common");lua_settop(state_,top);
}
void LuaRuntime::detachJass(){jass_=nullptr;jassLifetime_.reset();++jassGeneration_;}
int LuaRuntime::jassLookup(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || self->jassGeneration_!=generation)throw std::runtime_error("Lua JASS runtime detached");size_t length=0;auto raw=lua_tolstring(L,2,&length);if(!raw || !length || length>1024 || std::string_view(raw,length).find('\0')!=std::string_view::npos)throw std::runtime_error("Invalid Lua JASS native name");std::string name(raw,length);auto& module=self->jass_->module();auto id=module.functionId(name);if(id==jass::none || !module.program().functions()[id].native)throw std::runtime_error("Unknown Lua JASS native: "+name);lua_pushlightuserdata(L,self);lua_pushinteger(L,lua_Integer(generation));lua_pushlstring(L,name.data(),name.size());lua_pushcclosure(L,jassCall,3);return 1;}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
int LuaRuntime::jassCall(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || self->jassGeneration_!=generation)throw std::runtime_error("Lua JASS runtime detached");auto& vm=*self->jass_;std::string name=lua_tostring(L,lua_upvalueindex(3));auto id=vm.module().functionId(name);if(id==jass::none || !vm.module().program().functions()[id].native)throw std::runtime_error("Unknown Lua JASS native: "+name);auto& signature=vm.module().functions()[id];auto output=vm.module().type(signature.result).category;if(output!=jass::Category::Nothing && output!=jass::Category::Integer && output!=jass::Category::Boolean && output!=jass::Category::Real && output!=jass::Category::String && output!=jass::Category::Handle)throw std::runtime_error("Unsupported Lua JASS result type: "+vm.module().type(signature.result).name);if(size_t(lua_gettop(L))<signature.parameters.size()){lua_pushnil(L);return 1;}std::vector<jass::Value> values;values.reserve(signature.parameters.size());for(size_t i=0;i<signature.parameters.size();++i)values.push_back(argument(L,int(i+1),vm,signature.parameters[i],generation));jass::Value code{vm.module().typeId("code"),id+1,{},&vm};return result(L,vm,vm.invokeNoYield(code,values),generation);}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
}
