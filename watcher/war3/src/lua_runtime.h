// Author: MiYu. Lua 5.3 chunk execution with an instruction hook; bytecode inputs must be trusted.
#pragma once
#include <cstdint>
#include <functional>
#include <optional>
#include <memory>
#include <map>
#include <span>
#include <string>
#include <string_view>
#include <vector>
struct lua_State;

namespace war3 {
class Archives;
class JassBinarySession;
struct JassBinaryNativeValue;
class ObjectData;
class ScriptSession;
class LuaJassCallbacks;
namespace jass {class Runtime;struct RuntimeLifetime;struct Value;}
struct LuaResult {enum class Kind {Nil,Boolean,Integer,Number,String,Other};Kind kind=Kind::Nil;bool boolean=false;std::int64_t integer=0;double number=0;std::string text;};
enum class LuaChunkFormat {Standard, MapOpcodes};
struct LuaJapiSignature {std::string result;std::vector<std::string> parameters;bool operator==(const LuaJapiSignature&) const = default;};
struct LuaLogHost {std::function<std::string()> path;std::function<void(std::string_view)> setPath;std::function<void(std::string_view)> write;};
struct LuaConsoleHost {std::function<bool()> enabled;std::function<void(bool)> setEnabled;std::function<void(std::string_view)> write;std::function<std::optional<std::string>()> read;};
class LuaRuntime {
    friend class LuaJassCallbacks;
    lua_State* state_=nullptr;
    std::uint64_t remaining_=0;
    std::unique_ptr<Archives> archives_;
    std::unique_ptr<ObjectData> slkObjects_;
    std::optional<LuaConsoleHost> console_;
    std::optional<LuaLogHost> log_;
    unsigned logLevel_=0;
    LuaChunkFormat archiveFormat_=LuaChunkFormat::Standard;
    jass::Runtime* jass_=nullptr;
    ScriptSession* japiSession_=nullptr;
    std::function<std::optional<std::string>(unsigned)> japiPlayerName_;
    std::function<std::optional<std::string>()> japiVersion_;
    std::weak_ptr<const jass::RuntimeLifetime> jassLifetime_;
    std::weak_ptr<JassBinarySession> binary_;
    bool binaryAttached_=false;
    std::uint64_t jassGeneration_=0;
    std::unique_ptr<LuaJassCallbacks> callbacks_;
    lua_State* activeJassState_=nullptr;
    unsigned callbackDepth_=0;
    std::optional<int> errorHandler_;
    bool handlingError_=false;
    std::map<std::string,int> hookRefs_;
    std::map<std::string,int> codeRefs_;
    std::map<std::string,LuaJapiSignature> japiSignatures_;
    void clearHooks();
    void clearCodeOverrides();
    JassBinaryNativeValue invokeBinaryOverride(const std::string& name,std::span<const JassBinaryNativeValue> arguments);
    void clearErrorHandler();
    std::string callbackError(lua_State* state,std::string_view prefix);
    void protectedCallback(lua_State* state,int arguments,int results);
    jass::Value invokeJassHook(const std::string& name,std::span<const jass::Value> arguments);
    jass::Value callbackReference(lua_State* state,int index,bool predicate);
    bool invokeLuaCallback(int reference,bool predicate);
    bool jassAlive() const;
    std::shared_ptr<JassBinarySession> binarySession() const;
    static int logGet(lua_State* state);
    static int logSet(lua_State* state);
    static int logWrite(lua_State* state);
    static int consoleGet(lua_State* state);
    static int consoleSet(lua_State* state);
    static int consoleWrite(lua_State* state);
    static int consoleRead(lua_State* state);
    static int slkCategory(lua_State* state);
    static int slkObject(lua_State* state);
    static int slkField(lua_State* state);
    static int slkWrite(lua_State* state);
    static int slkPairs(lua_State* state);
    static int archiveSearcher(lua_State* state);
    static int runtimeGet(lua_State* state);
    static int runtimeSet(lua_State* state);
    static int registerJapi(lua_State* state);
    static int japiUnavailable(lua_State* state);
    static int japiLookup(lua_State* state);
    static int japiCall(lua_State* state);
    static int japiUnsupported(lua_State* state);
    static int jassBinaryCall(lua_State* state);
    static int jassHookLookup(lua_State* state);
    static int jassHookWrite(lua_State* state);
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
    void attachConsole(LuaConsoleHost host);
    void attachLog(LuaLogHost host);
    // Both runtimes are used on their owner thread; destroyed JASS bindings become invalid.
    void attachJass(jass::Runtime& runtime,std::shared_ptr<JassBinarySession> binary={});
    void attachJapi(ScriptSession& session);
    // Provider supplies platform identities by session slot; missing identities remain unavailable.
    void attachJapiPlayerNames(std::function<std::optional<std::string>(unsigned)> provider);
    // Provider reports the actual JAPI host version when one is available.
    void attachJapiVersion(std::function<std::optional<std::string>()> provider);
    void detachJass();
    LuaResult execute(std::span<const std::uint8_t> chunk,const std::string& name,std::uint64_t instructionLimit=1000000,LuaChunkFormat format=LuaChunkFormat::Standard,std::string_view moduleName={});
};
}
