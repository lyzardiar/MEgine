// Author: MiYu. Source camera presets, rendered world, unit selection and local player commands.
#pragma once
#include "game_loading.h"
#include "game_preferences.h"
#include "glue.h"
#include "scene_streaming.h"
#include "fog_render.h"
#include "lan_simulation.h"
#include "lan_action_encoder.h"
#include <deque>
#include <functional>
#include <tuple>

namespace war3 {
class QuestDialog;
class GameFlowUi;
struct GameInput {UiInput ui;bool right=false,active=false,left=false,up=false,rightKey=false,down=false;std::wstring characters;bool rightShift=false,rightControl=false;};
class GameView {
    std::unique_ptr<GameData> data_;
    Renderer& renderer_;
    Text& text_;
    Log& log_;
    std::unique_ptr<SceneStreaming> streaming_;
    bool streamUpload_=false;
    std::uint64_t destructableStreamRevision_=0;
    FogRender fogRender_;
    Com<IDirect3DTexture9> minimapFogTexture_;
    Com<IDirect3DTexture9> minimapFogStaging_;
    std::vector<std::uint32_t> minimapFogPixels_;
    std::uint64_t minimapFogStamp_=0;
    unsigned minimapFogPlayer_=~0u;
    bool minimapFogDynamic_=false,minimapFogDiscard_=false;
    IDirect3DTexture9* minimapFog(unsigned player);
    std::array<unsigned,4> teamFilterIndices_{};
    std::array<DWORD,4> minimapFilterColors_{};
    bool allyFilterButtonDown_=false,creepFilterButtonDown_=false,terrainFilterButtonDown_=false,minimapTerrainVisible_=true;
    std::unique_ptr<GlueScreen> allyFilterTooltip_;
    struct CreepCamp {float x=0,y=0;std::vector<std::uint32_t> units;};
    std::vector<CreepCamp> creepCamps_;
    std::vector<std::uint32_t> creepCampCandidates_;
    std::uint64_t nextCreepCampRefresh_=0;
    std::array<DWORD,3> creepCampColors_{};
    float creepMiddleThreshold_=10,creepToughThreshold_=20,creepMiddleScale_=1.3f,creepPulseScale_=.5f;
    std::vector<std::uint32_t> creepCandidates() const;
    void buildCreepCamps();
    std::vector<float> distances_,angles_,fovs_;
    float x_=0,y_=0,distance_=1650,angle_=56,fov_=70,rotation_=90,roll_=0,zOffset_=0,near_=100,far_=5000,forwardSpeed_=3000,strafeSpeed_=3000;
    unsigned zoom_=0,frames_=0;
    std::uint64_t cameraRevision_=0;
    std::uint64_t last_=0;
    std::unique_ptr<LanSimulation> lanSimulation_;
    std::function<unsigned(const PlayerCommand&)> lanSubmit_;
    LanWireObjectResolver lanWireObject_;
    std::function<bool(std::span<const std::uint8_t>)> lanSendSelection_;
    std::vector<std::uint8_t> lanPendingSelection_;
    std::deque<LanActionAlliance> lanPendingAlliance_;
    std::uint8_t lanPeer_=0;
    bool drawStarted_=false,replayMode_=false,lanExperimental_=false,lanLeavePending_=false;
    std::optional<bool> lanLocalExitScores_;
    std::string lanMessage_;
    std::uint64_t lanMessageUntil_=0;
    unsigned submitPlayerCommand(const PlayerCommand& command);
    void localMessage(unsigned owner,float x,float y,double duration,std::string message);
    D3DVIEWPORT9 viewport_{};
    D3DMATRIX view_{},projection_{};
    enum class OrderMode {None,Move,Attack,Patrol,Harvest,Entangle,Repair};
    OrderMode orderMode_=OrderMode::None;
    std::uint32_t buildMenuUnit_=0,skillMenuUnit_=0,bookMenuUnit_=0;
    bool buildMenuQueued_=false;
    std::uint32_t subgroupUnit_=0,subgroupType_=0,lastPickUnit_=0;
    std::uint32_t groundItem_=0;
    std::vector<std::uint32_t> subgroupSelection_;
    std::array<std::vector<std::uint32_t>,10> controlGroups_;
    unsigned lastControlGroup_=10;
    std::uint64_t lastControlGroupTime_=0;
    std::vector<std::uint32_t> heroShortcutIds_;
    std::uint32_t lastHeroShortcut_=0;
    std::uint64_t lastHeroShortcutTime_=0;
    std::vector<std::uint32_t> idleWorkers_;
    std::uint32_t lastIdleWorker_=0;
    std::uint64_t nextIdleWorkerRefresh_=0;
    std::vector<std::uint32_t> spellBookStack_;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> spellTarget_;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> neutralRevealTarget_;
    bool spellTargetQueued_=false;
    std::vector<CommandButton> commandButtons(std::uint32_t unit);
    std::optional<std::pair<std::uint32_t,std::uint32_t>> buildTarget_;
    bool buildTargetQueued_=false;
    bool chatOpen_=false;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> itemTarget_;
    bool itemTargetQueued_=false;
    struct InventoryDrag {std::uint32_t holder=0,item=0;unsigned slot=0;bool moving=false;};
    std::optional<InventoryDrag> inventoryDrag_;
    bool inventoryDragBlocked_=false;
    std::unique_ptr<QuestDialog> questDialog_;
    std::unique_ptr<GlueScreen> cinematicPanel_,leaderboardPanel_,multiboardPanel_,timerDialogPanel_,alliancePanel_;
    std::unique_ptr<GlueScreen> commandTooltip_;
    std::array<std::string,3> tooltipCostIcons_{};
    std::string tooltipKey_;
    size_t tooltipScroll_=0,tooltipTitleLines_=0,tooltipBodyLines_=0;
    bool allianceOpen_=false,allianceVictory_=false,allianceVictoryEdited_=false;
    std::array<std::array<std::string,2>,12> allianceAmounts_{};
    std::array<unsigned,12> allianceOptions_{},allianceEdited_{};
    int allianceFocusPlayer_=-1,allianceFocusResource_=0;
    std::string allianceError_,allianceDisabledCheck_;
    std::map<std::string,bool> multiboardIcons_;
    std::set<std::string> multiboardQueued_;
    struct BuffPanelInfo {std::string icon,title,description;};
    std::map<std::uint32_t,BuffPanelInfo> buffPanelInfo_;
    std::map<std::string,bool> buffPanelImages_;
    std::unique_ptr<GlueScreen> buffTooltip_;
    const BuffPanelInfo& buffPanelInfo(std::uint32_t id);
    std::vector<std::uint32_t> buffPanelIds(std::uint32_t unit) const;
    void streamBuffPanel(std::vector<std::string>& textures);
    void drawBuffPanel(const GameInput& input,std::uint32_t unit);
    std::string multiboardDefaultIcon_;
    std::string cinematicSpeaker_,cinematicDialogue_;
    float leaderboardFont_=.007f;
    bool questsOpen_=false;
    std::unique_ptr<GameFlowUi> flow_;
    GameCameraPreferences cameraCommitted_{};
    bool cameraPersistable_=true;
    GameAudioPreferences audioCommitted_{};
    bool audioPersistable_=true;
    GameVideoPreferences videoCommitted_{};
    bool videoPersistable_=true;
    bool appExit_=false;
    std::wstring chatText_;
    wchar_t chatHighSurrogate_=0;
    ChatChannel chatChannel_=ChatChannel::All;
    std::array<float,3> eye_{};
    size_t drawnChunks_=0,drawnObjects_=0,drawnUnits_=0;
    void camera(const GameInput& input,double delta);
    void drawCineFilter();
    void drawCinematicPanel();
    void drawLeaderboard();
    void drawTimerDialogs();
    void drawTextTags();
    void drawHealthBars();
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
    void selectionPanel(const GameInput& input);
    std::uint32_t corpseWidget(float x,float y) const;
    std::uint32_t cargoPanelUnit_=0;
    unsigned cargoPage_=0;
    void drawAutocast(float x,float y,std::uint32_t unit,std::uint32_t ability);
    std::map<std::pair<std::uint32_t,std::uint32_t>,ModelInstance> autocastInstances_;
    void selection();
    bool castSelection(std::uint32_t caster,std::uint32_t ability,std::uint32_t target=0,std::optional<WorldPoint> point={},bool queued=false);
    void spellPreview(const GameInput& input);
    void buildingPreview(const GameInput& input);
    void stream();
    void streamWeather(std::vector<std::string>& textures);
    void drawWeather(std::uint64_t elapsed);
    void command(float x,float y,OrderMode mode,bool queued,bool subgroup);
    std::uint32_t widget(float x,float y,bool items) const;
    std::uint32_t selectedGroundItem() const;
    void clearGroundItem();
    void drawProjectiles(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    void drawEffects(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    struct SpellLoop {std::uint64_t ticket=0;std::shared_ptr<ScriptSound> sound;};
    std::map<std::uint32_t,SpellLoop> spellLoops_;
    void syncSpellLoops(bool stop=false);
    struct FootprintInfo {std::string texture,water,sound;float scale=0,life=0,decay=0;unsigned rows=0,columns=0,blend=0,lifeStart=0,lifeEnd=0,lifeRepeat=1,decayStart=0,decayEnd=0,decayRepeat=1;std::array<std::array<unsigned,4>,3> colors{};};
    struct Footprint {const FootprintInfo* source=nullptr;float x=0,y=0,angle=0;std::uint64_t born=0;bool water=false;};
    std::map<std::string,FootprintInfo> footprintInfo_;
    std::map<std::uint32_t,bool> footprintTerrain_;
    std::vector<Footprint> footprints_;
    bool footprintDataLoaded_=false;
    void modelSounds(Model& model,ModelInstance& instance,std::uint64_t elapsed,std::uint64_t clock,const D3DMATRIX& world,bool refreshPose=false,std::optional<bool> footprintVisible={});
    bool modelHasSounds(const Model& model);
    void modelFootprint(const std::string& code,const std::array<float,3>& position,float angle,std::uint64_t clock,bool visible);
    void drawFootprints(bool water,const DirectX::XMMATRIX& vp,std::uint64_t clock);
    struct UnitShadow {std::string texture,buildingTexture;float width=0,height=0,x=0,y=0;bool onWater=false;};
    std::map<std::uint32_t,UnitShadow> unitShadows_;
    struct BuildingShadowStamp {std::uint32_t id=0,type=0;int x=0,y=0;std::uint8_t alpha=0;bool operator==(const BuildingShadowStamp&) const = default;};
    struct BuildingShadowChunk {unsigned x=0,y=0;float low=0,high=0;std::array<std::uint8_t,256> cells{};};
    std::vector<BuildingShadowStamp> buildingShadowStamps_;
    std::map<std::uint64_t,BuildingShadowChunk> buildingShadowChunks_;
    std::map<std::uint64_t,BuildingShadowChunk> staticShadowChunks_;
    bool staticShadowsReady_=false,buildingShadowsReady_=false;
    const UnitShadow& unitShadow(std::uint32_t type);
    void streamUnitShadows(std::vector<std::string>& textures);
    void drawUnitShadows(bool water,const DirectX::XMMATRIX& vp);
    void drawBuildingShadows(const DirectX::XMMATRIX& vp);
    std::set<std::string> failedModelSounds_;
    std::map<const Model*,bool> modelSoundPresence_;
    void drawTrackables(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    void trackableInput(GameInput& input);
    std::uint32_t hoveredTrackable_=0;
    float trackableMouseX_=-1,trackableMouseY_=-1;
    void drawImages(bool aboveWater,const DirectX::XMMATRIX& vp);
    void drawLightning(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    std::map<std::uint64_t,ModelInstance> modelInstances_,pingInstances_,effectSoundInstances_;
    std::map<std::uint32_t,ModelInstance> unitSoundInstances_;
    std::set<std::uint32_t> unitSoundsSeen_;
    using WaypointKey=std::tuple<std::uint32_t,std::size_t,std::uint32_t,std::uint32_t,std::uint32_t,std::uint32_t>;
    std::map<WaypointKey,ModelInstance> waypointInstances_;
    bool showQueueWaypoints_=false;
    std::set<std::uint64_t> modelInstancesSeen_,effectSoundsSeen_;
    ModelInstance& effectSoundInstance(std::uint64_t id) {effectSoundsSeen_.insert(id);return effectSoundInstances_[id];}
    ModelInstance& modelInstance(std::uint64_t id) {modelInstancesSeen_.insert(id);return modelInstances_[id];}
    void drawQueuedWaypoints(std::uint64_t elapsed,const DirectX::XMMATRIX& vp);
    struct EffectPresentation {bool birth=false,stand=false,death=false,loops=false,missingAttachment=false;std::uint64_t birthTime=0,standTime=0,deathTime=0;};
    std::map<std::uint32_t,EffectPresentation> effectPresentations_;
    std::optional<D3DMATRIX> unitWorld(const UnitState& unit) const;
    std::vector<ModelLookAt> unitLookAt(const UnitState& unit) const;
    void activateItem(std::uint32_t unit,std::uint32_t item,bool queued=false);
    void inventoryDragInput(GameInput& input);
    void drawInventoryDrag(const GameInput& input);
    std::vector<std::uint32_t> selected(bool owned=false) const;
    std::vector<std::uint32_t> primarySelection(std::vector<std::uint32_t> units) const;
    std::vector<std::uint32_t> orderSelection(bool control) const;
    void resetSubgroupInput();
    void syncSubgroup();
    void cycleSubgroup(bool reverse);
    void controlGroup(unsigned group,bool assign,bool append,bool repeat);
    void refreshHeroShortcuts();
    void heroShortcutInput(GameInput& input);
    void drawHeroShortcuts();
    void refreshIdleWorkers(bool force=false);
    void idleWorkerInput(GameInput& input);
    void drawIdleWorkers();
public:
    GameView(std::unique_ptr<GameData> data,Renderer& renderer,Text& text,Log& log);
    ~GameView();
    bool draw(const GameInput& input);
    // Configure before first draw. sendSelection and submit enqueue in order without reentry;
    // the owner consumes complete slots on this thread and must not submit selection separately.
    bool enableLan(std::uint8_t peer,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wireObject,std::function<bool(std::span<const std::uint8_t>)> sendSelection,std::function<unsigned(const PlayerCommand&)> submit,bool experimental=false);
    bool enableReplay(std::uint8_t peer,LanSimulation::ObjectResolver resolve);
    void scoreReplaySaver(std::function<std::pair<bool,std::string>(const std::wstring&)> saver);
    std::optional<LanStepResult> consumeLanSlot(std::uint64_t sequence,const LanTimeSlot& slot);
    const LanSimulation* lanSimulation() const {return lanSimulation_.get();}
    ScriptSession& session() const {return *data_->session;}
    bool appExitRequested() const {return appExit_;}
    std::optional<bool> takeLanLeaveRequest();
    void beginLanLeave();
    bool lanLeavePending() const{return lanLeavePending_;}
    bool lanLocalExitPending() const {return !replayMode_ && lanSimulation_ && (data_->session->networkLocalEndPending() || lanSimulation_->hasLocalDialogQuit());}
    std::optional<bool> lanLocalExitScores() const {return lanLocalExitScores_;}
    void finishLanLocalScores(){lanLeavePending_=false;if(data_->session->exitRequest()==SessionExit::None)data_->session->finishGame(true);}
    GameAudioPreferences audioPreferences() const {return audioCommitted_;}
    bool restartRequested() const {return data_->session->exitRequest()==SessionExit::Restart;}
    const std::string& nextLevel() const {return data_->session->nextLevel();}
    std::optional<std::pair<std::string,bool>> takeCinematic(){return data_->session->takeCinematic();}
    bool cinematicTransition() const {auto exit=data_->session->exitRequest();return !lanLeavePending_ && (exit==SessionExit::Return || exit==SessionExit::ChangeLevel);}
    void resumeAfterCinematic(){last_=GetTickCount64();}
    Archives& resources() const {return data_->session->world()->resources();}
    fs::path mapPath() const {auto world=data_->session->world();return world?world->resources().mapPath():fs::path{};}
    bool forceCampaignSelection() const {return data_->session->forceCampaignSelection();}
    unsigned frames() const {return frames_;}
};
}
