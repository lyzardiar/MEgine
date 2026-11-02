// Author: MiYu. Bound Lua 5.3 serialized prototype counts, strings and debug tables before loading.
#include "lua_binary.h"
extern "C" {
#include <lua.h>
#include <lobject.h>
#include <lundump.h>
#include <lopcodes.h>
}
#include <cstring>
#include <limits>
#include <stdexcept>
#include <string_view>

namespace war3 {
namespace {
class Reader {
    std::span<const std::uint8_t> bytes_;size_t pos_=0,allocated_=0;
    [[noreturn]] void fail() const {throw std::runtime_error("Invalid Lua binary structure");}
    void skip(size_t n){if(n>bytes_.size()-pos_)fail();pos_+=n;}
    template<typename T>T read(){T result{};if(sizeof(T)>bytes_.size()-pos_)fail();std::memcpy(&result,bytes_.data()+pos_,sizeof(T));pos_+=sizeof(T);return result;}
    int count(size_t minimum=1){auto n=read<int>();if(n<0 || size_t(n)>(bytes_.size()-pos_)/minimum)fail();return n;}
    void charge(size_t n){constexpr size_t limit=64u*1024u*1024u;if(n>limit-allocated_)fail();allocated_+=n;}
    bool string(){size_t n=read<std::uint8_t>();if(n==0xff)n=read<size_t>();if(!n)return false;skip(n-1);charge(n);return true;}
    void function(unsigned depth,int expectedUpvalues,int parentStack,int parentUpvalues){
        if(depth>200)fail();charge(sizeof(Proto));string();read<int>();read<int>();auto params=read<std::uint8_t>(),vararg=read<std::uint8_t>(),stack=read<std::uint8_t>();if(stack<2 || params>stack || vararg>1)fail();
        auto code=count(sizeof(Instruction));charge(size_t(code)*sizeof(Instruction));skip(size_t(code)*sizeof(Instruction));auto constants=count();charge(size_t(constants)*sizeof(TValue));
        for(int i=0;i<constants;++i){switch(read<std::uint8_t>()){case LUA_TNIL:break;case LUA_TBOOLEAN:if(read<std::uint8_t>()>1)fail();break;case LUA_TNUMFLT:read<lua_Number>();break;case LUA_TNUMINT:read<lua_Integer>();break;case LUA_TSHRSTR:case LUA_TLNGSTR:if(!string())fail();break;default:fail();}}
        auto upvalues=count(2);if(upvalues>255 || (expectedUpvalues>=0 && upvalues!=expectedUpvalues))fail();charge(size_t(upvalues)*sizeof(Upvaldesc));for(int i=0;i<upvalues;++i){auto instack=read<std::uint8_t>(),index=read<std::uint8_t>();if(instack>1 || (parentStack>=0 && index>=(instack?parentStack:parentUpvalues)))fail();}
        auto protos=count();charge(size_t(protos)*sizeof(Proto*));for(int i=0;i<protos;++i)function(depth+1,-1,stack,upvalues);
        auto lines=count(sizeof(int));if(lines && lines!=code)fail();charge(size_t(lines)*sizeof(int));skip(size_t(lines)*sizeof(int));auto locals=count();charge(size_t(locals)*sizeof(LocVar));for(int i=0;i<locals;++i){string();auto start=read<int>(),end=read<int>();if(start<0 || end<start || end>code)fail();}
        auto names=count();if(names>upvalues)fail();for(int i=0;i<names;++i)string();
    }
public:
    explicit Reader(std::span<const std::uint8_t> bytes):bytes_(bytes){}
    void validate(){
        auto literal=[&](std::string_view value){for(auto c:value)if(read<std::uint8_t>()!=std::uint8_t(c))fail();};
        literal(std::string_view(LUA_SIGNATURE,4));if(read<std::uint8_t>()!=LUAC_VERSION || read<std::uint8_t>()!=LUAC_FORMAT)fail();literal(std::string_view(LUAC_DATA,6));
        if(read<std::uint8_t>()!=sizeof(int) || read<std::uint8_t>()!=sizeof(size_t) || read<std::uint8_t>()!=sizeof(Instruction) || read<std::uint8_t>()!=sizeof(lua_Integer) || read<std::uint8_t>()!=sizeof(lua_Number))fail();
        if(read<lua_Integer>()!=LUAC_INT || read<lua_Number>()!=LUAC_NUM)fail();auto upvalues=read<std::uint8_t>();function(0,upvalues,-1,-1);if(pos_!=bytes_.size())fail();
    }
};
}
void validateLuaBinaryStructure(std::span<const std::uint8_t> bytes){if(bytes.size()>16u*1024u*1024u)throw std::runtime_error("Lua binary exceeds budget");Reader(bytes).validate();}
}
