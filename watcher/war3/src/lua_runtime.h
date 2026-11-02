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
class JassBinarySession;
class LuaJassCallbacks;
namespace jass {class Runtime;struct RuntimeLifetime;struct Value;}
struct LuaResult {enum class Kind {Nil,Boolean,Integer,Number,String,Other};Kind kind=Kind::Nil;bool boolean=false;std::int64_t integer=0;double number=0;std::string text;};
enum class LuaChunkFormat {Standard, MapOpcodes};
class LuaRuntime {
    friend class LuaJassCallbacks;
    lua_State* state_=nullptr;
    std::uint64_t remaining_=0;
    std::unique_ptr<Archives> archives_;
    LuaChunkFormat archiveFormat_=LuaChunkFormat::Standard;
    jass::Runtime* jass_=nullptr;
    std::weak_ptr<const jass::RuntimeLifetime> jassLifetime_;
    std::weak_ptr<JassBinarySession> binary_;
    bool binaryAttached_=false;
    std::uint64_t jassGeneration_=0;
    std::unique_ptr<LuaJassCallbacks> callbacks_;
    lua_State* activeJassState_=nullptr;
    unsigned callbackDepth_=0;
    jass::Value callbackReference(lua_State* state,int index,bool predicate);
    bool invokeLuaCallback(int reference,bool predicate);
    bool jassAlive() const;
    std::shared_ptr<JassBinarySession> binarySession() const;
    static int archiveSearcher(lua_State* state);
    static int jassBinaryCall(lua_State* state);
    static int jassCodePairs(lua_State* state);
    static int jassCodeLookup(lua_State* state);
    static int jassCodeWrite(lua_State* state);
    static int jassDebug(lua_State* state);
    static int jassDebugLookup(lua_State* state);
    static int jassLookup(lua_State* state);
    static int jassCall(lua_State* state);
    static int jassWrite(lua_State* state);
    static int jassArrayRead(lua_State* state);
    static int jassArrayWrite(lua_State* state);
public:
    LuaRuntime();
    ~LuaRuntime();
    LuaRuntime(const LuaRuntime&)=delete;
    LuaRuntime& operator=(const LuaRuntime&)=delete;
    void compile(std::span<const std::uint8_t> chunk,const std::string& name,LuaChunkFormat format=LuaChunkFormat::Standard);
    void preload(std::string_view moduleName,std::span<const std::uint8_t> chunk,const std::string& name,LuaChunkFormat format=LuaChunkFormat::Standard);
    void attachArchive(const Archives& archives,LuaChunkFormat format);
    // Both runtimes are used on their owner thread; destroyed JASS bindings become invalid.
    void attachJass(jass::Runtime& runtime,std::shared_ptr<JassBinarySession> binary={});
    void detachJass();
    LuaResult execute(std::span<const std::uint8_t> chunk,const std::string& name,std::uint64_t instructionLimit=1000000,LuaChunkFormat format=LuaChunkFormat::Standard,std::string_view moduleName={});
};
}
