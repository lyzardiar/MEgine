// Author: MiYu. Lua 5.3 chunk execution with an instruction hook; bytecode inputs must be trusted.
#pragma once
#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <string_view>
struct lua_State;

namespace war3 {
class Archives;
struct LuaResult {enum class Kind {Nil,Boolean,Integer,Number,String,Other};Kind kind=Kind::Nil;bool boolean=false;std::int64_t integer=0;double number=0;std::string text;};
enum class LuaChunkFormat {Standard, MapOpcodes};
class LuaRuntime {
    lua_State* state_=nullptr;
    std::uint64_t remaining_=0;
    std::unique_ptr<Archives> archives_;
    LuaChunkFormat archiveFormat_=LuaChunkFormat::Standard;
    static int archiveSearcher(lua_State* state);
public:
    LuaRuntime();
    ~LuaRuntime();
    LuaRuntime(const LuaRuntime&)=delete;
    LuaRuntime& operator=(const LuaRuntime&)=delete;
    void compile(std::span<const std::uint8_t> chunk,const std::string& name,LuaChunkFormat format=LuaChunkFormat::Standard);
    void preload(std::string_view moduleName,std::span<const std::uint8_t> chunk,const std::string& name,LuaChunkFormat format=LuaChunkFormat::Standard);
    void attachArchive(const Archives& archives,LuaChunkFormat format);
    LuaResult execute(std::span<const std::uint8_t> chunk,const std::string& name,std::uint64_t instructionLimit=1000000,LuaChunkFormat format=LuaChunkFormat::Standard,std::string_view moduleName={});
};
}
