// Author: MiYu. Bind Lua primitive native calls to the owning JASS runtime without yielding.
#include "lua_runtime.h"
#include "jass_runtime.h"
#include "jass_binary_session.h"
#include "lua_jass_callbacks.h"
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
constexpr const char* arrayMetatable="war3.jass.array";
constexpr const char* arrayDataMetatable="war3.jass.array.data";
char arrayDataKey;
char arrayNameKey;
struct LuaArray {LuaRuntime* owner;std::uint64_t generation;jass::Id index;bool binary;};
LuaArray arrayData(lua_State* L){if(!lua_istable(L,1))throw std::runtime_error("Invalid Lua JASS array");lua_rawgetp(L,1,&arrayDataKey);auto value=static_cast<LuaArray*>(luaL_testudata(L,-1,arrayDataMetatable));if(!value)throw std::runtime_error("Invalid Lua JASS array");auto copy=*value;lua_pop(L,1);return copy;}
jass::Id globalId(const jass::Module& module,std::string_view name){auto& globals=module.program().globals();for(size_t i=0;i<globals.size();++i)if(globals[i].name==name)return jass::Id(i);return jass::none;}
std::string key(lua_State* L,int index){size_t size=0;auto data=lua_tolstring(L,index,&size);if(!data || !size || size>1024 || std::string_view(data,size).find('\0')!=std::string_view::npos)throw std::runtime_error("Invalid Lua JASS name");return std::string(data,size);}
jass::Value argument(lua_State* L,int index,jass::Runtime& vm,jass::Id type,std::uint64_t generation);
std::string arrayName(lua_State* L){lua_rawgetp(L,1,&arrayNameKey);auto name=key(L,-1);lua_pop(L,1);return name;}
jass::Id binaryType(jass::Runtime& vm,std::uint8_t type){if(type>=9 && type<=13)type-=5;const char* name=nullptr;switch(type){case 4:name="integer";break;case 5:name="real";break;case 6:name="string";break;case 7:name="handle";break;case 8:name="boolean";break;default:throw std::runtime_error("Unsupported Lua 2SAJ global type");}auto id=vm.module().typeId(name);if(id==jass::none)throw std::runtime_error("Missing Lua 2SAJ global type");return id;}
JassBinaryNativeValue binaryArgument(lua_State* L,int index,jass::Runtime& vm,std::uint8_t type,std::uint64_t generation){auto value=argument(L,index,vm,binaryType(vm,type),generation);if(vm.module().type(value.type).category==jass::Category::Null)return {2,0,{}};return fromJass2Value(vm,value);}
int arrayIndex(lua_State* L){int valid=0;auto value=lua_tointegerx(L,2,&valid);if(!valid)throw std::runtime_error("Invalid Lua JASS array index");return value<0 || value>=8192?-1:int(value);}

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
std::shared_ptr<JassBinarySession> LuaRuntime::binarySession() const {if(!binaryAttached_)return {};auto session=binary_.lock();if(!session || &session->owner()!=jass_)throw std::runtime_error("Lua 2SAJ session detached");return session;}
void LuaRuntime::attachJass(jass::Runtime& runtime,std::shared_ptr<JassBinarySession> binary){
    if(jassAlive() || !runtime.ready() || (binary && &binary->owner()!=&runtime))throw std::runtime_error("Invalid Lua JASS attachment");++jassGeneration_;jass_=&runtime;jassLifetime_=runtime.lifetimeToken();binary_=binary;binaryAttached_=bool(binary);int top=lua_gettop(state_);resetHandles(state_);
    luaL_newmetatable(state_,arrayDataMetatable);lua_pop(state_,1);luaL_newmetatable(state_,arrayMetatable);lua_pushcfunction(state_,jassArrayRead);lua_setfield(state_,-2,"__index");lua_pushcfunction(state_,jassArrayWrite);lua_setfield(state_,-2,"__newindex");lua_pop(state_,1);
    luaL_getsubtable(state_,LUA_REGISTRYINDEX,LUA_LOADED_TABLE);for(auto name:{"jass.common","jass.globals"}){lua_newtable(state_);lua_newtable(state_);lua_pushlightuserdata(state_,this);lua_pushinteger(state_,lua_Integer(jassGeneration_));lua_pushboolean(state_,std::string_view(name)=="jass.globals");lua_pushcclosure(state_,jassLookup,3);lua_setfield(state_,-2,"__index");lua_pushlightuserdata(state_,this);lua_pushinteger(state_,lua_Integer(jassGeneration_));lua_pushcclosure(state_,jassWrite,2);lua_setfield(state_,-2,"__newindex");lua_setmetatable(state_,-2);lua_setfield(state_,-2,name);}lua_settop(state_,top);
}
jass::Value LuaRuntime::callbackReference(lua_State* state,int index,bool predicate){if(!jassAlive())throw std::runtime_error("Lua JASS runtime detached");if(!callbacks_){if(jass_->currentThread())throw std::runtime_error("Lua callback adapter requires an idle JASS scheduler");callbacks_=std::make_unique<LuaJassCallbacks>(*this,*jass_);}return callbacks_->reference(state,index,predicate);}
void LuaRuntime::detachJass(){if(callbackDepth_ || activeJassState_ || (jassAlive() && jass_->currentThread()))throw std::runtime_error("Cannot detach Lua JASS during script execution");callbacks_.reset();jass_=nullptr;jassLifetime_.reset();binary_.reset();binaryAttached_=false;++jassGeneration_;}
int LuaRuntime::jassLookup(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || self->jassGeneration_!=generation)throw std::runtime_error("Lua JASS runtime detached");auto name=key(L,2);auto& vm=*self->jass_;auto& module=vm.module();auto function=module.functionId(name);if(!lua_toboolean(L,lua_upvalueindex(3)) && function!=jass::none && module.program().functions()[function].native){lua_pushlightuserdata(L,self);lua_pushinteger(L,lua_Integer(generation));lua_pushlstring(L,name.data(),name.size());lua_pushcclosure(L,jassCall,3);return 1;}auto binary=self->binarySession();if(binary && binary->storage().contains(name)){auto type=binary->storage().type(name);if(type>=9){lua_newtable(L);auto data=static_cast<LuaArray*>(lua_newuserdata(L,sizeof(LuaArray)));*data={self,generation,jass::none,true};luaL_getmetatable(L,arrayDataMetatable);lua_setmetatable(L,-2);lua_rawsetp(L,-2,&arrayDataKey);lua_pushlstring(L,name.data(),name.size());lua_rawsetp(L,-2,&arrayNameKey);luaL_getmetatable(L,arrayMetatable);lua_setmetatable(L,-2);return 1;}return result(L,vm,toJass2Value(vm,binary->program(),binaryType(vm,type),binary->storage().read(name)),generation);}auto id=globalId(module,name);if(id==jass::none){if(lua_toboolean(L,lua_upvalueindex(3))){lua_pushnil(L);return 1;}throw std::runtime_error("Unknown Lua JASS native or global: "+name);}if(module.globals()[id].array){lua_newtable(L);auto data=static_cast<LuaArray*>(lua_newuserdata(L,sizeof(LuaArray)));*data={self,generation,id,false};luaL_getmetatable(L,arrayDataMetatable);lua_setmetatable(L,-2);lua_rawsetp(L,-2,&arrayDataKey);luaL_getmetatable(L,arrayMetatable);lua_setmetatable(L,-2);return 1;}return result(L,vm,vm.global(name),generation);}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
int LuaRuntime::jassWrite(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || self->jassGeneration_!=generation)throw std::runtime_error("Lua JASS runtime detached");auto name=key(L,2);auto& vm=*self->jass_;struct Restore{lua_State*& slot;lua_State* previous;~Restore(){slot=previous;}}restore{self->activeJassState_,self->activeJassState_};self->activeJassState_=L;auto binary=self->binarySession();if(binary && binary->storage().contains(name)){auto type=binary->storage().type(name);if(type>=9)throw std::runtime_error("Cannot replace Lua 2SAJ array: "+name);binary->storage().write(name,binaryArgument(L,3,vm,type,generation));return 0;}auto id=globalId(vm.module(),name);if(id==jass::none)throw std::runtime_error("Unknown Lua JASS global: "+name);auto& slot=vm.module().globals()[id];if(slot.array)throw std::runtime_error("Cannot replace Lua JASS array: "+name);vm.setGlobal(name,argument(L,3,vm,slot.type,generation));return 0;}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
int LuaRuntime::jassArrayRead(lua_State* L){
    try{auto array=arrayData(L);auto self=array.owner;if(!self || !self->jassAlive() || self->jassGeneration_!=array.generation)throw std::runtime_error("Lua JASS runtime detached");auto& vm=*self->jass_;if(array.binary){auto binary=self->binarySession();if(!binary)throw std::runtime_error("Lua 2SAJ session detached");auto name=arrayName(L);auto type=binary->storage().type(name);if(type<9 || type>13)throw std::runtime_error("Invalid Lua 2SAJ array");auto index=arrayIndex(L);if(index<0){lua_pushnil(L);return 1;}return result(L,vm,toJass2Value(vm,binary->program(),binaryType(vm,type),binary->storage().readArray(name,std::uint32_t(index),type-5)),array.generation);}auto& globals=vm.module().program().globals();if(array.index>=globals.size() || !vm.module().globals()[array.index].array)throw std::runtime_error("Invalid Lua JASS array");auto index=arrayIndex(L);if(index<0){lua_pushnil(L);return 1;}return result(L,vm,vm.global(globals[array.index].name,std::uint32_t(index)),array.generation);}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
int LuaRuntime::jassArrayWrite(lua_State* L){
    try{auto array=arrayData(L);auto self=array.owner;if(!self || !self->jassAlive() || self->jassGeneration_!=array.generation)throw std::runtime_error("Lua JASS runtime detached");auto& vm=*self->jass_;struct Restore{lua_State*& slot;lua_State* previous;~Restore(){slot=previous;}}restore{self->activeJassState_,self->activeJassState_};self->activeJassState_=L;if(array.binary){auto binary=self->binarySession();if(!binary)throw std::runtime_error("Lua 2SAJ session detached");auto name=arrayName(L);auto type=binary->storage().type(name);if(type<9 || type>13)throw std::runtime_error("Invalid Lua 2SAJ array");auto index=arrayIndex(L);if(index<0)return 0;binary->storage().writeArray(name,std::uint32_t(index),binaryArgument(L,3,vm,type,array.generation));return 0;}auto& globals=vm.module().program().globals();if(array.index>=globals.size() || !vm.module().globals()[array.index].array)throw std::runtime_error("Invalid Lua JASS array");auto index=arrayIndex(L);if(index<0)return 0;vm.setGlobal(globals[array.index].name,argument(L,3,vm,vm.module().globals()[array.index].type,array.generation),std::uint32_t(index));return 0;}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
int LuaRuntime::jassCall(lua_State* L){
    try{auto self=static_cast<LuaRuntime*>(lua_touserdata(L,lua_upvalueindex(1)));auto generation=std::uint64_t(lua_tointeger(L,lua_upvalueindex(2)));if(!self || !self->jassAlive() || self->jassGeneration_!=generation)throw std::runtime_error("Lua JASS runtime detached");auto& vm=*self->jass_;std::string name=lua_tostring(L,lua_upvalueindex(3));auto id=vm.module().functionId(name);if(id==jass::none || !vm.module().program().functions()[id].native)throw std::runtime_error("Unknown Lua JASS native: "+name);auto& signature=vm.module().functions()[id];auto output=vm.module().type(signature.result).category;if(output!=jass::Category::Nothing && output!=jass::Category::Integer && output!=jass::Category::Boolean && output!=jass::Category::Real && output!=jass::Category::String && output!=jass::Category::Handle)throw std::runtime_error("Unsupported Lua JASS result type: "+vm.module().type(signature.result).name);if(size_t(lua_gettop(L))<signature.parameters.size()){lua_pushnil(L);return 1;}std::vector<jass::Value> values;values.reserve(signature.parameters.size());for(size_t i=0;i<signature.parameters.size();++i){auto type=signature.parameters[i];if(vm.module().type(type).category!=jass::Category::Code){values.push_back(argument(L,int(i+1),vm,type,generation));continue;}if(lua_isnil(L,int(i+1))){values.push_back({type,0,{}});continue;}bool predicate=name=="Condition" || name=="Filter";bool action=name=="TriggerAddAction" || name=="TimerStart" || name=="ForGroup" || name=="ForForce" || name=="EnumDestructablesInRect" || name=="EnumItemsInRect" || name=="StartThread";if(!predicate && !action)throw std::runtime_error("Unsupported Lua callback native: "+name);values.push_back(self->callbackReference(L,int(i+1),predicate));}jass::Value code{vm.module().typeId("code"),id+1,{},&vm};struct Restore{lua_State*& slot;lua_State* previous;~Restore(){slot=previous;}}restore{self->activeJassState_,self->activeJassState_};self->activeJassState_=L;return result(L,vm,vm.invokeNoYield(code,values),generation);}catch(const std::exception& e){lua_pushstring(L,e.what());}return lua_error(L);
}
}
