// Author: MiYu. Lua 5.3 chunk execution with an instruction hook; bytecode inputs must be trusted.
#pragma once
#include <cstdint>
#include <functional>
#include <optional>
#include <memory>
#include <map>
#include <span>
#include <set>
#include <string>
#include <string_view>
#include <vector>
struct lua_State;

namespace war3 {
class Archives;
class JassBinarySession;
class FrameDefinitions;
class MapFrames;
class FontMetrics;
struct JassBinaryNativeValue;
class ObjectData;
class ScriptSession;
class LuaJassCallbacks;
struct StormArchiveOverlay;
namespace jass {class Runtime;struct RuntimeLifetime;struct Value;}
struct LuaResult {enum class Kind {Nil,Boolean,Integer,Number,String,Other};Kind kind=Kind::Nil;bool boolean=false;std::int64_t integer=0;double number=0;std::string text;};
enum class LuaChunkFormat {Standard, MapOpcodes};
struct LuaJapiSignature {std::string result;std::vector<std::string> parameters;bool operator==(const LuaJapiSignature&) const = default;};
std::optional<std::int32_t> knownPluginGameVersion(std::span<const std::uint8_t> image);
struct LuaStormHost {std::function<std::optional<std::string>(std::string_view)> load;std::function<bool(std::string_view,std::string_view)> save;};
struct LuaInputMessage {enum class Kind {KeyDown,KeyUp,MouseDown,MouseUp};Kind kind=Kind::KeyDown;std::uint32_t code=0,state=0;double x=0,y=0;};
struct LuaSyncHost {std::function<void(std::string_view)> send;std::function<void(std::string_view,std::string_view)> sendDz;};
struct LuaPostHost {std::function<void(std::uint64_t,std::string_view,std::string_view)> submit;};
struct LuaPlatformStorageHost {std::function<bool(unsigned,std::string_view,std::string_view)> save;std::function<bool(unsigned,std::string_view)> load;std::function<void(std::string_view)> setOwner;};
struct LuaLogHost {std::function<std::string()> path;std::function<void(std::string_view)> setPath;std::function<void(std::string_view)> write;};
struct LuaConsoleHost {std::function<bool()> enabled;std::function<void(bool)> setEnabled;std::function<void(std::string_view)> write;std::function<std::optional<std::string>()> read;};
class LuaRuntime {
    friend class LuaJassCallbacks;
    lua_State* state_=nullptr;
    std::uint64_t remaining_=0;
    std::uint64_t callbackInstructionLimit_=1000000;
    std::unique_ptr<Archives> archives_;
    std::shared_ptr<FrameDefinitions> frameDefinitions_;
    std::shared_ptr<MapFrames> mapFrames_;
    std::unique_ptr<FontMetrics> fontMetrics_;
    std::unique_ptr<ObjectData> slkObjects_;
    std::optional<LuaConsoleHost> console_;
    std::optional<LuaStormHost> stormHost_;
    std::shared_ptr<StormArchiveOverlay> stormOverlay_;
    std::optional<LuaPostHost> postHost_;
    std::map<std::uint64_t,int> postCallbacks_;
    std::uint64_t nextPostId_=1;
    std::optional<LuaLogHost> log_;
    unsigned logLevel_=0;
    LuaChunkFormat archiveFormat_=LuaChunkFormat::Standard;
    jass::Runtime* jass_=nullptr;
    ScriptSession* japiSession_=nullptr;
    std::function<std::optional<std::string>(unsigned)> japiPlayerName_;
    std::function<std::uint32_t()> japiTargetObject_;
    std::function<bool()> japiWindowActive_;
    std::function<float()> japiFps_;
    std::function<std::optional<std::string>()> japiVersion_;
    std::optional<std::string> knownPluginVersion_;
    std::function<std::optional<std::int32_t>()> japiGameVersion_;
    std::optional<LuaSyncHost> japiSyncHost_;
    std::optional<LuaPlatformStorageHost> japiPlatformStorage_;
    std::weak_ptr<const jass::RuntimeLifetime> jassLifetime_;
    std::weak_ptr<JassBinarySession> binary_;
    bool binaryAttached_=false,binaryScriptAttached_=false,mapEntryAttached_=false,mapEntryExecuted_=false;
    char binaryScriptOwner_=0,mapEntryOwner_=0;
    std::uint64_t jassGeneration_=0;
    std::unique_ptr<LuaJassCallbacks> callbacks_;
    lua_State* activeJassState_=nullptr;
    unsigned callbackDepth_=0;
    std::optional<int> errorHandler_;
    std::optional<int> messageHook_;
    bool messageAttached_=false;
    bool handlingError_=false;
    std::map<std::string,int> hookRefs_;
    std::vector<std::string> activeNativeHooks_;
    std::map<std::string,int> codeRefs_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,int> frameEventRefs_;
    std::set<std::uint32_t> hoveredFrames_;
    std::map<std::string,LuaJapiSignature> japiSignatures_;
    void clearHooks();
    void clearFrameEvents();
    void pruneFrameEvents();
    void clearMapEntryHook();
    void clearMessage();
    void clearCodeOverrides();
    JassBinaryNativeValue invokeBinaryOverride(const std::string& name,std::span<const JassBinaryNativeValue> arguments);
    void clearErrorHandler();
    std::string callbackError(lua_State* state,std::string_view prefix);
    static int callbackErrorHandler(lua_State* state);
    int protectedCall(lua_State* state,int arguments,int results);
    void protectedCallback(lua_State* state,int arguments,int results,std::uint64_t instructionLimit=1000000);
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
    static int postMessage(lua_State* state);
    static int messageGet(lua_State* state);
    static int messageSet(lua_State* state);
    static int stormLoad(lua_State* state);
    static int stormSave(lua_State* state);
    static int slkCategory(lua_State* state);
    static int slkObject(lua_State* state);
    static int slkField(lua_State* state);
    static int slkWrite(lua_State* state);
    static int slkPairs(lua_State* state);
    static int archiveSearcher(lua_State* state);
    static int runtimeGet(lua_State* state);
    static int runtimeSet(lua_State* state);
    static int registerJapi(lua_State* state);
    static int dzapiLookup(lua_State* state);
    static int dzapiSetFrameScript(lua_State* state);
    static int japiUnavailable(lua_State* state);
    static int japiLookup(lua_State* state);
    static int japiCall(lua_State* state);
    static int japiDispatch(lua_State* state);
    static int japiUnsupported(lua_State* state);
    static int jassBinaryCall(lua_State* state);
    static int jassHookLookup(lua_State* state);
    static int jassHookWrite(lua_State* state);
    static int jassCodePairs(lua_State* state);
    static int jassCodeLookup(lua_State* state);
    static int jassCodeWrite(lua_State* state);
    static int jassDebug(lua_State* state);
    static int jassDebugHandleField(lua_State* state);
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
    void attachStormHost(LuaStormHost host);
    void attachStormArchiveOverlay(const Archives& archives);
    std::optional<std::vector<std::uint8_t>> stormTextureOverride(std::string_view name) const;
    std::uint64_t stormOverlayRevision() const;
    std::vector<std::uint8_t> encodeStormOverlay() const;
    void restoreStormOverlay(std::span<const std::uint8_t> bytes);
    void attachFrameDefinitions(std::shared_ptr<FrameDefinitions> definitions);
    void attachMapFrames(std::shared_ptr<MapFrames> frames);
    std::vector<std::uint32_t> frameEventTargets();
    void updateFramePointer(std::span<const std::uint32_t> hovered);
    // Attach and dispatch on the owner thread while Lua is idle.
    void attachMessageHost();
    void callbackInstructionLimit(std::uint64_t limit);
    bool dispatchMessage(LuaInputMessage& message);
    // Submit and completion run on the owning thread; submit copies both views before returning.
    // Complete only while Lua is idle and stop using this runtime after destruction.
    void attachPostHost(LuaPostHost host);
    void completePost(std::uint64_t id,std::span<const LuaResult> values);
    void attachLog(LuaLogHost host);
    // Both runtimes are used on their owner thread; destroyed JASS bindings become invalid.
    void attachJass(jass::Runtime& runtime,std::shared_ptr<JassBinarySession> binary={});
    void prepareJassCallbacks();
    void attachJapi(ScriptSession& session);
    bool attachKnownPluginJapi(std::span<const std::uint8_t> bytes);
    void attachBinaryExecuteScript(std::uint64_t instructionLimit=1000000);
    void attachMapEntryHook(std::uint64_t instructionLimit=1000000);
    bool mapEntryExecuted() const {return mapEntryExecuted_;}
    // Provider supplies platform identities by session slot; missing identities remain unavailable.
    void attachJapiPlayerNames(std::function<std::optional<std::string>(unsigned)> provider);
    void attachJapiTargetObject(std::function<std::uint32_t()> provider);
    void attachJapiWindowActive(std::function<bool()> provider);
    void attachJapiFps(std::function<float()> provider);
    // Provider reports the actual JAPI host version when one is available.
    void attachJapiVersion(std::function<std::optional<std::string>()> provider);
    void attachJapiGameVersion(std::function<std::optional<std::int32_t>()> provider);
    // Sender copies the view and later delivers synchronized messages on the owner thread.
    void attachJapiSyncHost(LuaSyncHost host);
    void attachJapiPlatformStorage(LuaPlatformStorageHost host);
    void deliverJapiMessage(unsigned player,std::string_view message);
    void deliverDzMessage(unsigned player,std::string_view prefix,std::string_view message);
    void detachJass();
    LuaResult execute(std::span<const std::uint8_t> chunk,const std::string& name,std::uint64_t instructionLimit=1000000,LuaChunkFormat format=LuaChunkFormat::Standard,std::string_view moduleName={});
};
}
