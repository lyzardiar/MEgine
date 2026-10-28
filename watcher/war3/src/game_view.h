// Author: MiYu. Source camera presets, rendered world, unit selection and local player commands.
#pragma once
#include "game_loading.h"
#include "glue.h"
#include "scene_streaming.h"
#include "fog_render.h"
#include "lan_simulation.h"

namespace war3 {
class QuestDialog;
class GameFlowUi;
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
    float x_=0,y_=0,distance_=1650,angle_=56,fov_=70,rotation_=90,roll_=0,zOffset_=0,near_=100,far_=5000,speed_=3000;
    unsigned zoom_=0,frames_=0;
    std::uint64_t cameraRevision_=0;
    std::uint64_t last_=0;
    std::unique_ptr<LanSimulation> lanSimulation_;
    std::function<unsigned(const PlayerCommand&)> lanSubmit_;
    bool drawStarted_=false;
    std::string lanMessage_;
    std::uint64_t lanMessageUntil_=0;
    unsigned submitPlayerCommand(const PlayerCommand& command);
    void localMessage(unsigned owner,float x,float y,double duration,std::string message);
    D3DVIEWPORT9 viewport_{};
    D3DMATRIX view_{},projection_{};
    enum class OrderMode {None,Move,Attack,Patrol,Harvest,Entangle,Repair};
    OrderMode orderMode_=OrderMode::None;
    std::uint32_t buildMenuUnit_=0,skillMenuUnit_=0,bookMenuUnit_=0;
    std::vector<std::uint32_t> spellBookStack_;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> spellTarget_;
    std::vector<CommandButton> commandButtons(std::uint32_t unit);
    std::optional<std::pair<std::uint32_t,std::uint32_t>> buildTarget_;
    bool chatOpen_=false;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> itemTarget_;
    std::unique_ptr<QuestDialog> questDialog_;
    std::unique_ptr<GlueScreen> cinematicPanel_,leaderboardPanel_,multiboardPanel_,timerDialogPanel_,alliancePanel_;
    bool allianceOpen_=false,allianceVictory_=false,allianceVictoryEdited_=false;
    std::array<std::array<std::string,2>,12> allianceAmounts_{};
    std::array<unsigned,12> allianceOptions_{},allianceEdited_{};
    int allianceFocusPlayer_=-1,allianceFocusResource_=0;
    std::string allianceError_,allianceDisabledCheck_;
    std::map<std::string,bool> multiboardIcons_;
    std::set<std::string> multiboardQueued_;
    std::string multiboardDefaultIcon_;
    std::string cinematicSpeaker_,cinematicDialogue_;
    float leaderboardFont_=.007f;
    bool questsOpen_=false;
    std::unique_ptr<GameFlowUi> flow_;
    bool edgeScrollCommitted_=true,edgeScrollPersistable_=true;
    bool appExit_=false;
    std::wstring chatText_;
    std::array<float,3> eye_{};
    size_t drawnChunks_=0,drawnObjects_=0,drawnUnits_=0;
    void camera(const GameInput& input,double delta);
    void drawCineFilter();
    void drawCinematicPanel();
    void drawLeaderboard();
    void drawTimerDialogs();
    void drawTextTags();
    void openAlliance();
    bool drawAlliance(const GameInput& input);
    void drawMultiboards(const GameInput& input);
    bool multiboardHit(float x,float y) const;
    void drawMinimapPings();
    std::optional<std::array<float,3>> ground(float x,float y) const;
    std::optional<std::pair<float,float>> project(float x,float y,float z) const;
    void input(const GameInput& input);
    void hud(const GameInput& input);
    void commandPanel(const GameInput& input,std::uint32_t unit);
    void cargoPanel(const GameInput& input,std::uint32_t unit);
    std::uint32_t corpseWidget(float x,float y) const;
    std::uint32_t cargoPanelUnit_=0;
    unsigned cargoPage_=0;
    void drawAutocast(float x,float y,std::uint32_t unit,std::uint32_t ability);
    std::map<std::pair<std::uint32_t,std::uint32_t>,ModelInstance> autocastInstances_;
    void selection();
    bool castSelection(std::uint32_t caster,std::uint32_t ability,std::uint32_t target=0,std::optional<WorldPoint> point={});
    void spellPreview(const GameInput& input);
    void buildingPreview(const GameInput& input);
    void stream();
    void command(float x,float y,OrderMode mode);
    std::uint32_t widget(float x,float y,bool items) const;
    void drawProjectiles(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    void drawEffects(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    void drawLightning(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    std::map<std::uint64_t,ModelInstance> modelInstances_,pingInstances_;
    std::set<std::uint64_t> modelInstancesSeen_;
    ModelInstance& modelInstance(std::uint64_t id) {modelInstancesSeen_.insert(id);return modelInstances_[id];}
    struct EffectPresentation {bool birth=false,stand=false,death=false,loops=false,missingAttachment=false;std::uint64_t birthTime=0,standTime=0,deathTime=0;};
    std::map<std::uint32_t,EffectPresentation> effectPresentations_;
    std::optional<D3DMATRIX> unitWorld(const UnitState& unit) const;
    void activateItem(std::uint32_t unit,std::uint32_t item);
    std::vector<std::uint32_t> selected(bool owned=false) const;
public:
    GameView(std::unique_ptr<GameData> data,Renderer& renderer,Text& text,Log& log);
    ~GameView();
    bool draw(const GameInput& input);
    // Configure before the first draw; the owner consumes complete slots on this thread.
    bool enableLan(LanSimulation::ObjectResolver resolve,std::function<unsigned(const PlayerCommand&)> submit);
    std::optional<LanStepResult> consumeLanSlot(std::uint64_t sequence,const LanTimeSlot& slot);
    const LanSimulation* lanSimulation() const {return lanSimulation_.get();}
    bool appExitRequested() const {return appExit_;}
    bool restartRequested() const {return data_->session->exitRequest()==SessionExit::Restart;}
    const std::string& nextLevel() const {return data_->session->nextLevel();}
    std::optional<std::pair<std::string,bool>> takeCinematic(){return data_->session->takeCinematic();}
    bool cinematicTransition() const {auto exit=data_->session->exitRequest();return exit==SessionExit::Return || exit==SessionExit::ChangeLevel;}
    void resumeAfterCinematic(){last_=GetTickCount64();}
    Archives& resources() const {return data_->session->world()->resources();}
    fs::path mapPath() const {auto world=data_->session->world();return world?world->resources().mapPath():fs::path{};}
    bool forceCampaignSelection() const {return data_->session->forceCampaignSelection();}
    unsigned frames() const {return frames_;}
};
}
