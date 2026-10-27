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
#include "spatial_region.h"
#include "fog_grid.h"
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
    jass::Real handicapXP=jass::Real::fromBits(0x3f800000);
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
enum class NativeKind {Player,Group,Timer,Trigger,Location,Rect,Sound,Unit,Item,Weather,Force,Boolean,Action,Condition,Event,TimerDialog,Region,Fog,Cache,Hashtable,Quest,QuestItem};
class ScriptSession {
    struct PlayerRef {unsigned id;};
    struct Group {std::vector<std::uint32_t> units;};
    using Timer=ScriptTimer;
    using Trigger=ScriptTrigger;
    struct Object {NativeKind kind;bool alive=true;std::variant<std::monostate,PlayerRef,Group,Timer,Trigger,WorldPoint,WorldRect,std::shared_ptr<ScriptSound>,std::shared_ptr<UnitState>,std::shared_ptr<ItemState>,std::shared_ptr<WeatherState>,ScriptForce,std::shared_ptr<ScriptBoolean>,ScriptCallback,ScriptEvent,std::shared_ptr<ScriptTimerDialog>,std::shared_ptr<SpatialRegion>,std::shared_ptr<FogModifier>,std::shared_ptr<ScriptCache>,std::shared_ptr<ScriptHashtable>,std::shared_ptr<ScriptQuest>,std::shared_ptr<ScriptQuestItem>> state;};
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
    std::array<std::unique_ptr<FogGrid>,16> fogGrids_;
    std::map<std::uint32_t,std::shared_ptr<FogModifier>> fogModifiers_;
    std::uint64_t fogRevision_=1,fogTicks_=0;
    std::map<std::string,std::uint32_t> caches_;
    std::vector<ScriptText> texts_;
    std::map<std::pair<std::uint32_t,bool>,ProductInfo> products_;
    std::map<std::pair<std::uint32_t,unsigned>,ResearchInfo> researchInfo_;
    std::map<std::pair<std::uint32_t,bool>,std::optional<std::pair<int,int>>> globalStock_;
    std::uint64_t productionTicket_=0;
    std::optional<SourceSettings> gameplay_;
    std::vector<int> heroThresholds_;
    std::map<std::uint32_t,std::shared_ptr<ScriptQuest>> quests_;
    std::uint64_t questRevision_=0;
    bool questFlash_=false;
    std::map<std::uint32_t,std::array<WeaponDefinition,2>> weapons_;
    std::map<std::uint64_t,CombatProjectile> projectiles_;
    std::uint64_t projectileId_=0,combatTicks_=0;
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
    void bindVisualNatives();
    void bindSpatialEvents();
    void bindInventoryNatives();
    void bindFogNatives();
    void bindTextNatives();
    void bindCacheNatives();
    void bindHashtableNatives();
    void bindCommerceNatives();
    void bindFoodNatives();
    void bindProductionNatives();
    void bindHeroNatives();
    void bindIllusionNatives();
    void bindDamageNatives();
    void bindQuestNatives();
    void bindBlightNatives();
    void bindCombatNatives();
    void bindResearchNatives();
    unsigned researchLevel(unsigned owner,std::uint32_t type) const;
    void setResearch(unsigned owner,std::uint32_t type,int level);
    void refreshResearch(UnitState& unit);
    bool researchAllowed(const UnitState& unit,const ResearchInfo& info,std::string& reason);
    WeaponDefinition unitWeapon(const UnitState& unit,unsigned slot);
    const std::array<WeaponDefinition,2>& weapons(std::uint32_t type);
    bool capability(const UnitState& unit,const char* code);
    bool enemy(unsigned owner,unsigned other) const;
    bool weaponTarget(const UnitState& source,const UnitState& target,const WeaponDefinition& weapon,bool automatic=false,bool splash=false);
    std::optional<unsigned> weaponFor(const UnitState& source,const UnitState& target,bool automatic=false);
    void cancelCombat(UnitState& unit);
    bool chase(UnitState& unit,WorldPoint target,float standoff);
    void combat(double delta);
    void launchAttack(std::uint32_t source,std::uint32_t target,unsigned weapon);
    void projectiles(double delta);
    void impact(const CombatProjectile& projectile);
    void awardExperience(std::uint32_t killer,const UnitState& victim);
    void timedLives(double delta);
    void regenerate(double delta);
    std::vector<std::uint32_t> illusions(std::uint32_t caster,std::uint32_t original,unsigned count,float dealt,float taken,double duration,std::uint32_t buff);
    void removeItem(std::uint32_t item);
    const SourceSettings& gameplay();
    float gameplayNumber(const char* key,float fallback);
    void initializeHero(UnitState& unit);
    void refreshHero(UnitState& unit);
    const std::vector<int>& heroThresholds();
    void heroExperience(std::uint32_t unit,int value);
    bool learnSkill(std::uint32_t unit,std::uint32_t ability);
    void removeUnit(std::uint32_t unit);
    std::optional<WorldPoint> spawnPoint(const UnitState& producer,std::uint32_t type);
    void initializeCommerce(UnitState& unit);
    void setStock(UnitState& unit,std::uint32_t type,bool item,int current,int maximum);
    bool sells(const UnitState& unit,bool item) const;
    std::shared_ptr<UnitState> shopper(std::uint32_t shop,unsigned owner,std::uint32_t requested=0,bool inventory=false);
    bool productAllowed(unsigned owner,const ProductInfo& product,std::string& reason,bool food=true);
    unsigned techCount(unsigned owner,std::uint32_t type,bool queued);
    void restock();
    void production(double delta);
    void adjustFood(unsigned owner,int used,int capacity);
    void unitFood(std::uint32_t unit,bool counted,int reserved=0);
    void transferFood(const UnitState& unit,unsigned oldOwner,unsigned newOwner);
    bool startProduction(std::uint32_t unit);
    unsigned inventorySize(const UnitState& unit);
    bool giveItem(std::uint32_t unit,std::uint32_t item,std::optional<unsigned> slot={});
    void spatialEvents();
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
    void unitLife(jass::Value handle,jass::Real value,std::uint32_t killer=0);
    void playerChange(unsigned player,std::uint32_t field,int before,int after,bool alliance);
    void tick(double delta);
    void clockChange(jass::Real before,jass::Real after,bool cyclic);
    std::uint32_t random();
    ObjectData& definitions();
    UnitState& unit(jass::Value value);
    ItemState& item(jass::Value value);
    jass::Value createUnit(std::uint32_t owner,std::uint32_t type,jass::Real x,jass::Real y,jass::Real facing,int reservedFood=0,const UnitState* illusionSource=nullptr);
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
    bool targetOrder(std::uint32_t source,std::uint32_t target,std::uint32_t order=851971);
    bool attackUnit(std::uint32_t source,std::uint32_t target,bool forced=true);
    bool attackMove(std::uint32_t source,WorldPoint target,bool patrol=false);
    bool hasWeapon(std::uint32_t unit);
    const auto& projectiles() const {return projectiles_;}
    const WeaponDefinition& projectileWeapon(const CombatProjectile& projectile) const {return projectile.definition;}
    void dropItem(std::uint32_t unit,std::uint32_t item);
    bool itemNeedsTarget(std::uint32_t item);
    double itemCooldown(std::uint32_t unit,std::uint32_t item);
    bool useItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target=0);
    bool damageUnit(std::uint32_t source,std::uint32_t target,float amount,unsigned attackType,unsigned damageType,bool attack=false,bool ranged=false);
    const ProductInfo& product(std::uint32_t type,bool item=false);
    const ResearchInfo& researchInfo(std::uint32_t type,unsigned level);
    bool research(std::uint32_t unit,std::uint32_t type);
    std::vector<CommandButton> commands(std::uint32_t unit,unsigned player);
    bool purchase(std::uint32_t shop,unsigned player,std::uint32_t type,bool item,std::uint32_t buyer=0);
    bool train(std::uint32_t unit,std::uint32_t type);
    bool cancelProduction(std::uint32_t unit,size_t index=0,bool refund=true);
    bool setRally(std::uint32_t unit,WorldPoint point,std::uint32_t target=0);
    void chat(unsigned player,const std::string& message);
    const FogGrid& fog(unsigned player);
    const std::vector<ScriptText>& texts() const {return texts_;}
    const auto& quests() const {return quests_;}
    std::uint64_t questRevision() const {return questRevision_;}
    bool questFlash() const {return questFlash_;}
    void acknowledgeQuests() {questFlash_=false;}
    void displayText(unsigned owner,float x,float y,double duration,std::string text);
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
