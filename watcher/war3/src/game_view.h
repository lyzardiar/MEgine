// Author: MiYu. Source camera presets, rendered world, unit selection and local player commands.
#pragma once
#include "game_loading.h"
#include "glue.h"
#include "scene_streaming.h"
#include "fog_render.h"

namespace war3 {
class QuestDialog;
struct GameInput {UiInput ui;bool right=false,active=false,left=false,up=false,rightKey=false,down=false;std::wstring characters;};
class GameView {
    std::unique_ptr<GameData> data_;
    Renderer& renderer_;
    Text& text_;
    Log& log_;
    std::unique_ptr<SceneStreaming> streaming_;
    bool streamUpload_=false;
    std::uint64_t destructableStreamRevision_=0;
    FogRender fogRender_;
    std::vector<float> distances_,angles_,fovs_;
    float x_=0,y_=0,distance_=1650,angle_=56,fov_=70,rotation_=90,near_=100,far_=5000,speed_=3000;
    unsigned zoom_=0,frames_=0;
    std::optional<WorldPoint> cameraTarget_;
    std::uint64_t last_=0;
    D3DVIEWPORT9 viewport_{};
    D3DMATRIX view_{},projection_{};
    enum class OrderMode {None,Move,Attack,Patrol,Harvest,Entangle};
    OrderMode orderMode_=OrderMode::None;
    std::uint32_t buildMenuUnit_=0;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> buildTarget_;
    bool chatOpen_=false;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> itemTarget_;
    std::unique_ptr<QuestDialog> questDialog_;
    bool questsOpen_=false;
    std::wstring chatText_;
    std::array<float,3> eye_{};
    size_t drawnChunks_=0,drawnObjects_=0,drawnUnits_=0;
    void camera(const GameInput& input,double delta);
    std::optional<std::array<float,3>> ground(float x,float y) const;
    std::optional<std::pair<float,float>> project(float x,float y,float z) const;
    void input(const GameInput& input);
    void hud(const GameInput& input);
    void commandPanel(const GameInput& input,std::uint32_t unit);
    void selection();
    void buildingPreview(const GameInput& input);
    void stream();
    void command(float x,float y,OrderMode mode);
    std::uint32_t widget(float x,float y,bool items) const;
    void drawProjectiles(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    void activateItem(std::uint32_t unit,std::uint32_t item);
    std::vector<std::uint32_t> selected(bool owned=false) const;
public:
    GameView(std::unique_ptr<GameData> data,Renderer& renderer,Text& text,Log& log);
    ~GameView();
    bool draw(const GameInput& input);
    unsigned frames() const {return frames_;}
};
}
