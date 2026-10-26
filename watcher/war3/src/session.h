// Author: MiYu. Script-owned map configuration and native object lifetime for a session.
#pragma once
#include "jass_runtime.h"
#include "map.h"
#include "world.h"
#include "sound.h"
#include "music.h"
#include "entities.h"
#include "script_state.h"
#include "fdf.h"
#include <variant>

namespace war3 {
class PlayerSetup;
struct StartPriority {unsigned other=0,priority=0;};
struct SessionStart {bool defined=false;std::array<jass::Real,2> position{};std::vector<StartPriority> priorities;};
struct SessionPlayer {
    std::string name;
    unsigned team=0,color=0,controller=5,racePreference=0,slotState=0;
    unsigned difficulty=1;
    jass::Real handicap=jass::Real::fromBits(0x3f800000);
    int start=-1;
    bool raceSelectable=true,forcedStart=false,onScoreScreen=true;
    std::array<unsigned,16> alliances{};
    std::map<unsigned,int> states;
    std::map<std::pair<unsigned,unsigned>,int> taxes;
    std::map<std::uint32_t,int> techMaximum,research;
    std::map<std::uint32_t,bool> abilityAvailable;
    unsigned race=0;
    bool observer=false;
};
struct SessionConfig {
    std::string name,description;
    unsigned playerCount=0,teamCount=0,placement=0,gameType=4,supportedGameTypes=0;
    std::uint32_t mapFlags=0;
    std::array<SessionPlayer,16> players;
    std::array<SessionStart,16> starts;
};
enum class NativeKind {Player,Group,Timer,Trigger,Location,Rect,Sound,Unit,Item,Weather,Force,Boolean,Action,Condition,Event,TimerDialog};
class ScriptSession {
    struct PlayerRef {unsigned id;};
    struct Group {std::vector<std::uint32_t> units;};
    using Timer=ScriptTimer;
    using Trigger=ScriptTrigger;
    struct Object {NativeKind kind;bool alive=true;std::variant<std::monostate,PlayerRef,Group,Timer,Trigger,WorldPoint,WorldRect,std::shared_ptr<ScriptSound>,std::shared_ptr<UnitState>,std::shared_ptr<ItemState>,std::shared_ptr<WeatherState>,ScriptForce,std::shared_ptr<ScriptBoolean>,ScriptCallback,ScriptEvent,std::shared_ptr<ScriptTimerDialog>> state;};
    static constexpr std::uint32_t handleBase=0x100000;
    MapStrings strings_;
    SessionConfig config_;
    std::vector<Object> objects_;
    jass::Runtime runtime_;
    bool failed_=false,configured_=false;
    std::optional<unsigned> localPlayer_;
    std::unique_ptr<World> world_;
    bool setupApplied_=false,mainAttempted_=false,mainCompleted_=false;
    std::unique_ptr<SoundScene> audio_;
    std::unique_ptr<MusicScene> music_;
    bool audioMuted_=false;
    std::unique_ptr<ObjectData> definitions_;
    std::map<std::uint32_t,std::shared_ptr<UnitState>> units_;
    std::map<std::uint32_t,std::shared_ptr<ItemState>> items_;
    std::optional<SourceTable> weather_;
    std::vector<ScriptContext> contexts_;
    double simulationTime_=0,accumulator_=0;
    bool simulationPaused_=false,fogEnabled_=true,fogMaskEnabled_=true;
    unsigned gameSpeed_=2;
    unsigned version_=1;
    std::uint32_t randomState_=0x12705224u;
    int stockItemSlots_=12,stockUnitSlots_=12;
    std::vector<std::shared_ptr<const Member>> preloaded_;
    size_t preloadBytes_=0;
    unsigned preloadDepth_=0;
    std::vector<std::string> preloadMissing_;
    std::optional<FrameDefinitions> localized_;
    std::map<std::uint32_t,std::shared_ptr<ScriptTimerDialog>> timerDialogs_;
    jass::Value create(NativeKind kind);
    Object& object(jass::Value handle,NativeKind kind);
    SessionPlayer& player(jass::Value handle);
    unsigned playerId(jass::Value handle);
    SessionStart& start(std::uint32_t index);
    void destroy(jass::Value handle,NativeKind kind);
    void bind(const char* name,const char* result,std::initializer_list<const char*> parameters,jass::Runtime::Native native);
    void bindNatives();
    void bindWorldNatives();
    void bindSoundNatives();
    void bindMusicNatives();
    void bindEntityNatives();
    void bindOrderNatives();
    void moveUnits(double delta);
    void bindWeatherNatives();
    void bindCallbackNatives();
    void bindCollectionNatives();
    void bindGameNatives();
    void bindDialogNatives();
    void preload(const std::string& member);
    void preloader(const std::string& member);
    bool alive(std::uint32_t handle,NativeKind kind) const;
    std::shared_ptr<ScriptBoolean> expression(jass::Value handle);
    bool evaluate(const std::shared_ptr<ScriptBoolean>& expression,unsigned depth=0);
    bool triggerEvaluate(std::uint32_t handle);
    void triggerExecute(std::uint32_t handle);
    void fire(std::uint32_t event,ScriptContext context={});
    void unitEvent(std::uint32_t unit,unsigned playerEvent,unsigned unitEvent,ScriptContext context={});
    void unitLife(jass::Value handle,jass::Real value);
    void playerChange(unsigned player,std::uint32_t field,int before,int after,bool alliance);
    void tick(double delta);
    void clockChange(jass::Real before,jass::Real after,bool cyclic);
    std::uint32_t random();
    ObjectData& definitions();
    UnitState& unit(jass::Value value);
    ItemState& item(jass::Value value);
    jass::Value createUnit(std::uint32_t owner,std::uint32_t type,jass::Real x,jass::Real y,jass::Real facing);
    jass::Value createItem(std::uint32_t type,jass::Real x,jass::Real y);
    SoundScene& requireAudio();
    MusicScene& requireMusic();
    World& requireWorld();
public:
    ScriptSession(jass::Module module,const MapInfo& info,MapStrings strings={},std::optional<unsigned> gameType={});
    void initialize();
    void configure();
    void applySetup(const PlayerSetup& setup);
    void attachWorld(std::unique_ptr<World> world);
    const World* world() const {return world_.get();}
    World* world() {return world_.get();}
    void selectUnit(std::uint32_t handle,bool selected);
    bool moveUnit(std::uint32_t handle,WorldPoint target,std::uint32_t order=851986);
    bool stopUnit(std::uint32_t handle,bool hold=false);
    void startMain();
    bool mainCompleted() const {return mainCompleted_ && !failed_;}
    void advance(double elapsed);
    double simulationTime() const {return simulationTime_;}
    void audioMuted(bool muted);
    void updateAudio();
    const SoundScene* audio() const {return audio_.get();}
    const MusicScene* music() const {return music_.get();}
    std::optional<unsigned> localPlayer() const {return localPlayer_;}
    bool configured() const {return configured_ && !failed_;}
    bool initialized() const {return runtime_.ready() && !failed_;}
    const SessionConfig& config() const {return config_;}
    jass::Runtime& runtime() {return runtime_;}
    const jass::Runtime& runtime() const {return runtime_;}
    size_t liveObjects(NativeKind kind) const;
    const std::map<std::uint32_t,std::shared_ptr<UnitState>>& units() const {return units_;}
    const std::map<std::uint32_t,std::shared_ptr<ItemState>>& items() const {return items_;}
    const std::vector<std::string>& preloadMissing() const {return preloadMissing_;}
    const std::map<std::uint32_t,std::shared_ptr<ScriptTimerDialog>>& timerDialogs() const {return timerDialogs_;}
};
}
