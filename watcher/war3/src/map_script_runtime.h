// Author: MiYu. Own the supported 2SAJ map script and Lua bridge alongside its session.
#pragma once
#include "lua_runtime.h"
#include "lua_native_console.h"
#include "lua_file_log.h"
#include "lua_local_sync.h"
#include "jass_binary_session.h"
#include <memory>

namespace war3 {
class ScriptSession;
class MapScriptRuntime {
    ScriptSession& session_;
    std::shared_ptr<JassBinarySession> binary_;
    std::shared_ptr<FrameDefinitions> definitions_;
    std::shared_ptr<MapFrames> frames_;
    LuaNativeConsole console_;
    LuaFileLog log_;
    LuaRuntime lua_;
    std::unique_ptr<LuaLocalSync> localSync_;
    bool started_=false,requiresLuaEntry_=false;
    MapScriptRuntime(ScriptSession& session,std::shared_ptr<const JassBinaryProgram> program,const std::string& initializer);
public:
    static std::unique_ptr<MapScriptRuntime> create(ScriptSession& session);
    ~MapScriptRuntime();
    MapScriptRuntime(const MapScriptRuntime&)=delete;
    MapScriptRuntime& operator=(const MapScriptRuntime&)=delete;
    void start();
    void attachPlatformPlayerNames(std::function<std::optional<std::string>(unsigned)> provider);
    void attachPostHost(LuaPostHost host);
    void completePost(std::uint64_t id,std::span<const LuaResult> values);
    void pump();
    bool uiRootVisible() const;
    std::vector<std::uint32_t> frameEventTargets() {return lua_.frameEventTargets();}
    void updateFramePointer(std::span<const std::uint32_t> hovered) {lua_.updateFramePointer(hovered);}
    std::optional<std::vector<std::uint8_t>> frameTextureOverride(std::string_view name) const {return lua_.stormTextureOverride(name);}
    std::uint64_t frameTextureRevision() const {return lua_.stormOverlayRevision();}
    const std::shared_ptr<MapFrames>& frames() const {return frames_;}
};
}
