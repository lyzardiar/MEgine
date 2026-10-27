// Author: MiYu. Cancelable background map main/CPU preparation and measured render-thread upload.
#pragma once
#include "map_preparation.h"
#include "terrain_scene.h"
#include "scene_objects.h"

namespace war3 {
struct ConsolePiece {float x,y,w,h,u0,v0,u1,v1;std::string image;};
struct GameCommand {std::string icon,hotkey,name,tip;unsigned x=0,y=0;};
struct GameData {
    std::unique_ptr<ScriptSession> session;
    std::unique_ptr<SceneAssets> assets;
    std::unique_ptr<TerrainScene> terrain;
    std::unique_ptr<SceneObjects> objects;
    std::vector<ConsolePiece> console;
    std::string minimap,autocastModel;
    std::array<std::string,3> resourceIcons;
    std::array<GameCommand,5> commands;
    std::array<GameCommand,4> buildCommands;
    GameCommand cancelCommand,cancelBuildCommand,cancelReviveCommand,selectSkillCommand;
    void prepareConsole();
    bool uploadOne(Renderer& renderer);
    size_t uploadCount() const {return assets->uploadCount()+terrain->uploadCount();}
    size_t uploaded() const {return assets->uploaded()+terrain->uploaded();}
};
struct GameLoadResult {std::uint64_t request=0;std::unique_ptr<GameData> data;std::string error;};
class GameLoading {
    struct Request {std::uint64_t id;std::unique_ptr<ScriptSession> session;};
    Log& log_;
    std::atomic<std::uint64_t> generation_=0;
    std::atomic<unsigned> phase_=0;
    std::mutex mutex_;
    std::condition_variable wake_;
    std::optional<Request> pending_;
    std::optional<GameLoadResult> ready_;
    std::jthread worker_;
    void run(std::stop_token stop);
public:
    explicit GameLoading(Log& log);
    ~GameLoading();
    std::uint64_t request(std::unique_ptr<ScriptSession> session);
    void cancel();
    std::optional<GameLoadResult> poll();
    unsigned phase() const {return phase_.load();}
};
}
