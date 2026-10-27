// Author: MiYu. Script-owned map configuration and native object lifetime for a session.
#pragma once
#include "jass_runtime.h"
#include "map.h"
#include "world.h"
#include "sound.h"
#include "music.h"
#include "entities.h"
#include "game_state.h"
#include "script_state.h"
#include "fdf.h"
#include "spatial_region.h"
#include "fog_grid.h"
#include "placed_definition.h"
#include "image.h"
#include "effects.h"
#include "ai.h"
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
enum class NativeKind {Player,Group,Timer,Trigger,Location,Rect,Sound,Unit,Item,Weather,Force,Boolean,Action,Condition,Event,TimerDialog,Region,Fog,Cache,Hashtable,Quest,QuestItem,Destructable,Dialog,Button,DefeatCondition,Ability,Effect,Lightning};
class ScriptSession {
    struct PlayerRef {unsigned id;};
    struct Group {std::vector<std::uint32_t> units;};
    using Timer=ScriptTimer;
    using Trigger=ScriptTrigger;
    struct Object {NativeKind kind;bool alive=true;std::variant<std::monostate,PlayerRef,Group,Timer,Trigger,WorldPoint,WorldRect,std::shared_ptr<ScriptSound>,std::shared_ptr<UnitState>,std::shared_ptr<ItemState>,std::shared_ptr<WeatherState>,ScriptForce,std::shared_ptr<ScriptBoolean>,ScriptCallback,ScriptEvent,std::shared_ptr<ScriptTimerDialog>,std::shared_ptr<SpatialRegion>,std::shared_ptr<FogModifier>,std::shared_ptr<ScriptCache>,std::shared_ptr<ScriptHashtable>,std::shared_ptr<ScriptQuest>,std::shared_ptr<ScriptQuestItem>,std::shared_ptr<DestructableState>,std::shared_ptr<ScriptDialog>,std::shared_ptr<ScriptButton>,std::shared_ptr<ScriptDefeatCondition>,ScriptAbility,std::shared_ptr<ScriptEffect>,std::shared_ptr<ScriptLightning>> state;};
    static constexpr std::uint32_t handleBase=0x100000;
    MapStrings strings_;
    SessionConfig config_;
    std::vector<Object> objects_;
    std::vector<std::uint32_t> eventHandles_,timerHandles_;
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
    std::map<std::uint32_t,std::shared_ptr<DestructableState>> destructables_;
    std::optional<PlacedDefinitions> destructableDefinitions_;
    std::optional<SourceSettings> destructableStrings_;
    std::map<std::string,Image> pathImages_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,ProductInfo> buildingUpgradeProducts_;
    std::unique_ptr<Images> pathDecoder_;
    std::vector<std::uint32_t> placedDestructables_;
    std::map<std::pair<int,int>,std::vector<std::uint32_t>> treeGrid_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,bool> techAliases_;
    size_t footprintCells_=0,pathImageBytes_=0;
    std::uint64_t destructableRevision_=1;
    std::optional<SourceTable> weather_;
    std::vector<ScriptContext> contexts_;
    std::map<jass::ThreadId,std::vector<ScriptContext>> threadContexts_{{0,{}}};
    void bindThreadNatives();
    double simulationTime_=0,accumulator_=0;
    std::array<std::unique_ptr<ScriptAI>,16> ais_;
    std::array<std::uint32_t,16> aiPauseDepth_{};
    void pauseAI(unsigned player,bool paused);
    void bindAiControlNatives();
    void bindAiGuardNatives(ScriptAI& ai);
    void aiFillGuards(ScriptAI& ai);
    void aiReturnGuards(ScriptAI& ai,bool force=false);
    void aiRemoveGuard(std::uint32_t unit);
    void aiRecycleGuard(std::uint32_t unit);
    void bindAiNatives();
    void bindAiRuntime(ScriptAI& ai);
    void aiTick();
    void aiTowns(ScriptAI& ai);
    int aiTown(ScriptAI& ai,const UnitState& unit);
    unsigned aiCount(ScriptAI& ai,std::uint32_t type,bool done,int town=-1);
    bool aiProduce(ScriptAI& ai,unsigned quantity,std::uint32_t type,int town);
    bool aiUpgrade(ScriptAI& ai,std::uint32_t type);
    void aiHarvest(ScriptAI& ai);
    void aiFormCaptains(ScriptAI& ai,bool force=false);
    void aiSuicide(ScriptAI& ai,int quantity,std::uint32_t type,int targetPlayer);
    void aiSuicideTick(ScriptAI& ai);
    void aiTeleportCaptain(ScriptAI& ai,WorldPoint point);
    void aiUnsummon(ScriptAI& ai,std::uint32_t target);
    bool unsummonTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell);
    void startUnsummon(std::uint32_t caster,const CastOrder& cast);
    void cancelUnsummon(UnitState& unit);
    void unsummonTick(double delta);
    std::uint32_t aiMine(ScriptAI& ai,int town);
    std::uint32_t aiEnemy(ScriptAI& ai,unsigned owner=UINT_MAX,bool buildings=false);
    std::vector<std::uint32_t> aiCaptain(ScriptAI& ai);
    void aiAttack(ScriptAI& ai,WorldPoint point,std::uint32_t target=0);
    std::array<std::optional<unsigned>,16> results_;
    std::array<PlayerStatistics,16> statistics_{};
    std::array<std::vector<HeroSummary>,16> heroSummaries_;
    std::array<bool,16> heroSnapshotValid_{};
    std::map<std::uint32_t,std::shared_ptr<ScriptDialog>> dialogs_;
    std::map<std::uint32_t,std::shared_ptr<ScriptButton>> buttons_;
    std::map<std::uint32_t,std::shared_ptr<ScriptDefeatCondition>> defeatConditions_;
    SessionExit exit_=SessionExit::None;
    bool showScores_=false,userControl_=true,userUI_=true,selectionEnabled_=true,selectionUI_=true;
    unsigned gameDifficulty_=1,defaultDifficulty_=1;
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
    struct Detector {unsigned owner=0,mask=0;float x=0,y=0,range=0;std::uint32_t vision=0;};
    std::map<std::pair<int,int>,std::vector<Detector>> detectors_;
    std::vector<Detector> wideDetectors_;
    double detectorTime_=-1;
    std::uint64_t detectorFogRevision_=0;
    size_t detectorUnits_=0;
    void updateDetectors();
    bool detection(std::uint32_t unit,unsigned player,unsigned mask);
    void breakInvisibility(UnitState& unit);
    bool stealthAcquire(const UnitState& unit);
    std::map<std::uint64_t,RevealArea> revealAreas_;
    std::uint64_t revealTicket_=0;
    void stealthTick(double delta);
    void startShadowMeld(std::uint32_t unit,const SpellInfo& spell);
    void cancelShadowMeld(UnitState& unit);
    void addReveal(unsigned owner,const SpellInfo& spell,WorldPoint point);
    void dustSpell(std::uint32_t source,const SpellInfo& spell,WorldPoint point,unsigned owner);
    std::pair<float,bool> windWalkStrike(const UnitState& unit);
    std::optional<WorldPoint> blinkPoint(const UnitState& unit,const SpellInfo& spell,WorldPoint point);
    void blinkSpell(std::uint32_t unit,const SpellInfo& spell,WorldPoint point);
    void startMirrorImage(std::uint32_t unit,const CastOrder& cast);
    void mobilityTick(double delta);
    std::map<std::pair<std::uint32_t,unsigned>,CargoInfo> cargoInfo_;
    const CargoInfo* cargoInfo(const UnitState& unit);
    unsigned cargoSize(const UnitState& unit);
    bool cargoReady(const UnitState& unit);
    bool cargoCanUnload(const UnitState& unit);
    bool canLoad(const UnitState& transport,const UnitState& passenger);
    bool loadUnit(std::uint32_t transport,std::uint32_t passenger,const SpellInfo* devour=nullptr);
    std::optional<WorldPoint> cargoPoint(const UnitState& transport,const UnitState& passenger,WorldPoint point);
    bool unloadPassenger(std::uint32_t transport,std::uint32_t passenger,WorldPoint point);
    void startCargoDrop(std::uint32_t transport,const CastOrder& cast);
    void detachCargo(UnitState& passenger);
    void releaseCargo(UnitState& transport,std::uint32_t killer=0);
    void transportTick(double delta);
    void bindTransportNatives();
    unsigned garrisonCount(const UnitState& unit);
    bool canDevour(const UnitState& carrier,const UnitState& victim,const SpellInfo& spell);
    void battleStations(std::uint32_t burrow,const SpellInfo& spell);
    bool garrisonLoadOrder(std::uint32_t burrow,std::uint32_t peon);
    void resumeCargoWork(std::uint32_t passenger);
    void beginDigestion(std::uint32_t carrier,std::uint32_t victim,const SpellInfo& spell,WorldPoint point);
    void endDigestion(UnitState& victim);
    void releaseDevoured(std::uint32_t victim);
    void devourTick(double delta);
    std::set<std::uint32_t> corpseHandles_;
    void beginCorpse(UnitState& unit,bool immediate=false);
    void clearCorpse(UnitState& unit);
    void corpsesTick(double delta);
    bool corpseTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility=true);
    std::vector<std::uint32_t> corpseTargets(const UnitState& caster,const SpellInfo& spell,WorldPoint point,float radius=-1);
    void releaseCorpseClaim(std::uint32_t corpse,std::uint32_t caster,std::uint64_t ticket);
    void consumeCorpse(std::uint32_t corpse);
    bool restoreCorpse(std::uint32_t corpse,float health,float mana,bool invulnerable);
    void corpseSpellEffect(std::uint32_t caster,const SpellInfo& spell,std::uint32_t target,WorldPoint point,unsigned owner);
    void startCannibalize(std::uint32_t caster,const CastOrder& cast);
    void cannibalizeTick(std::uint32_t caster,double delta);
    void bindCorpseNatives();
    jass::Value createCorpse(unsigned owner,std::uint32_t type,WorldPoint point,jass::Real facing);
    void exhumeCorpses(std::uint32_t transport,double delta);
    std::map<std::uint32_t,bool> corpseHoldAbilities_;
    bool corpseCargoCandidate(const UnitState& unit);
    bool useItemImpl(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point);
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
    std::map<std::pair<std::uint32_t,unsigned>,SpellInfo> spellInfo_;
    std::map<std::pair<std::uint32_t,unsigned>,PassiveInfo> passiveInfo_;
    std::map<std::uint32_t,std::vector<std::uint32_t>> itemPassives_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,AuraEmitterVisual> auraEmitters_;
    unsigned auraTicks_=0;
    std::vector<std::pair<std::uint32_t,unsigned>> passiveAbilities(const UnitState& unit);
    bool passiveTarget(const UnitState& source,const UnitState& target,const PassiveInfo& definition);
    void aurasTick(double delta);
    void aggregateAuras(UnitState& unit,bool visuals=true);
    void clearAuras(UnitState& unit);
    void releaseAuraSource(std::uint32_t unit);
    bool passiveChance(float chance);
    void prepareAttack(const UnitState& source,const UnitState& target,CombatProjectile& projectile);
    bool evadeAttack(const UnitState& target,const CombatProjectile& projectile);
    void attackPassives(const CombatProjectile& projectile,float damage,const AuraBonuses& defense);
    std::map<std::pair<std::uint32_t,std::uint32_t>,std::uint32_t> abilityHandles_;
    std::map<std::uint64_t,SpellMissile> spellMissiles_;
    std::uint64_t spellTicket_=0;
    std::map<std::uint64_t,SpellWave> spellWaves_;
    std::map<std::uint64_t,DelayedSpell> delayedSpells_;
    std::map<std::uint64_t,GroundSpell> groundSpells_;
    void startChannel(std::uint32_t unit);
    void channelTick(std::uint32_t unit,double delta);
    void channelPulse(std::uint32_t unit,const CastOrder& cast);
    void finishCast(std::uint32_t unit,std::uint64_t ticket);
    void releaseCastVisuals(CastOrder& cast);
    void groundSpellsTick(double delta);
    void persistentSpellPulse(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner,float amount,bool percent,std::optional<std::uint64_t> cast={});
    bool beginSpell(std::uint32_t unit,std::uint32_t ability,std::uint32_t target,WorldPoint point,SpellTargeting targeting,bool automatic=false,std::uint32_t issuedOrder=0);
    void casterEffect(const SpellMissile& missile);
    bool usefulDispel(const UnitState& caster,const UnitState& target,const SpellInfo& spell);
    void dispelSpell(std::uint32_t source,std::uint32_t target,const SpellInfo& spell);
    void autocastTick();
    bool spellRequirements(unsigned owner,const SpellInfo& spell);
    unsigned autocastTicks_=0;
    bool spellPoint(const UnitState& unit,const SpellInfo& spell,WorldPoint point);
    void releaseSpell(std::uint32_t unit,const CastOrder& cast,unsigned owner);
    void areaSpell(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    void areaSpellsTick(double delta);
    std::vector<std::uint32_t> spellTargets(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    std::vector<std::uint32_t> spellTrees(const SpellInfo& spell,WorldPoint point);
    std::optional<WorldPoint> summonPoint(WorldPoint point,std::uint32_t type,float minimum=0);
    void summonSpell(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    void bindSpellNatives();
    void bindEffectNatives();
    void bindLightningNatives();
    std::map<std::string,LightningInfo> lightningInfo_;
    std::map<std::uint32_t,std::shared_ptr<ScriptLightning>> lightnings_;
    const LightningInfo& lightningInfo(const std::string& type);
    jass::Value createLightning(const std::string& type,bool visibility,std::array<jass::Real,3> from,std::array<jass::Real,3> to,std::optional<double> duration={});
    bool moveLightning(std::uint32_t id,bool visibility,std::array<jass::Real,3> from,std::array<jass::Real,3> to);
    bool destroyLightning(std::uint32_t id);
    void lightningTick();
    void spellLightning(const SpellMissile& missile);
    std::map<std::uint32_t,std::shared_ptr<ScriptEffect>> effects_;
    jass::Value createEffect(const std::string& model,WorldPoint point,std::uint32_t target=0,const std::string& attachment={},bool automatic=false);
    void destroyEffect(std::uint32_t id);
    void effectsTick();
    std::vector<std::uint32_t> spellVisual(const SpellInfo& spell,const char* field,std::uint32_t target,WorldPoint point,bool automatic=true);
    void releaseBuff(UnitBuff& buff);
    bool spellTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility=true,unsigned owner=UINT_MAX);
    bool cancelCast(UnitState& unit,bool preserveRoute=false);
    void spellEvent(std::uint32_t unit,const CastOrder& cast,unsigned stage);
    void spellsTick(double delta);
    void buffsTick(double delta);
    void spellImpact(SpellMissile missile);
    void launchSpellMissile(SpellMissile missile);
    void applyBuff(std::uint32_t target,std::uint32_t source,const SpellInfo& spell,BuffKind kind,bool physical=false);
    void releaseAbility(std::uint32_t unit,std::uint32_t ability);
    std::uint32_t abilityHandle(std::uint32_t unit,std::uint32_t ability);
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
    void bindRevivalNatives();
    bool revivalAllowed(std::uint32_t building,std::uint32_t hero,std::string& reason);
    void cancelHeroRevival(std::uint32_t hero);
    void cancelBuildingRevivals(std::uint32_t building);
    void revivalLink(const ProductionOrder& job);
    bool reviveHero(std::uint32_t hero,WorldPoint point,bool visual,int reserved=0);
    void revivalButtons(std::uint32_t building,std::array<bool,12>& occupied,std::vector<CommandButton>& buttons);
    void bindIllusionNatives();
    void bindDamageNatives();
    void bindQuestNatives();
    void bindBlightNatives();
    void bindCombatNatives();
    void bindResearchNatives();
    void bindHarvestNatives();
    void bindDestructableNatives();
    void bindConstructionNatives();
    void initializeUnitType(UnitState& unit,std::uint32_t type);
    bool upgradeAllowed(const UnitState& unit,const ProductInfo& product,std::string& reason);
    void buildingUpgrades(double delta);
    void finishBuildingUpgrade(std::uint32_t unit);
    void repairTick(double delta);
    std::pair<std::uint32_t,unsigned> repairAbility(const UnitState& unit);
    double humanConstruction(std::uint32_t building,double delta);
    bool payWork(std::uint32_t worker,double gold,double lumber);
    bool repairTarget(const UnitState& worker,const UnitState& target,std::uint32_t ability,unsigned level);
    void blightGrowth(double delta);
    const Image* footprintImage(const std::string& path);
    std::vector<PathCell> pathFootprint(const std::string& path,WorldPoint point,float angle);
    void replaceFootprint(std::vector<PathCell>& current,std::vector<PathCell> next);
    void unitFootprint(UnitState& unit);
    void cancelWork(UnitState& unit);
    void constructionTick(double delta);
    bool resumeConstruction(std::uint32_t worker,std::uint32_t building);
    void finishConstruction(std::uint32_t building);
    void releaseBuilder(std::uint32_t building,bool consume);
    bool approachConstruction(UnitState& worker,const BuildOrder& order);
    int& resourceAmount(UnitState& unit);
    void linkMine(std::uint32_t base,std::uint32_t cover);
    void releaseMine(UnitState& unit);
    void exhaustMine(std::uint32_t mine);
    void finishEntangle(std::uint32_t tree);
    const PlacedDefinitions& destructableDefinitions();
    std::string destructableName(const std::string& name);
    void loadDestructables();
    jass::Value createDestructable(std::uint32_t type,WorldPoint point,float z,float angle,std::array<float,3> scale,int variation,float lifePercent=100,bool visible=true,bool solid=true,int editorId=-1);
    void destructableFootprint(DestructableState& destructable);
    void destructableLife(std::uint32_t id,float value);
    void widgetDeath(std::uint32_t id,ScriptContext context={});
    std::uint32_t nearestTree(WorldPoint point,float range,std::uint32_t exclude=0);
    std::pair<std::uint32_t,unsigned> sourceAbility(const UnitState& unit,const char* code);
    void initializeHarvest(UnitState& unit);
    void cancelGather(UnitState& unit);
    void harvestTick(double delta);
    bool harvestTree(std::uint32_t unit,std::uint32_t tree);
    void lumberTick(std::uint32_t unit);
    bool acceptsResource(const UnitState& depot,unsigned resource);
    std::uint32_t resourceDepot(const UnitState& unit,unsigned resource);
    void creditResource(unsigned owner,unsigned resource,int amount);
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
    bool cancelCombat(UnitState& unit);
    bool chase(UnitState& unit,WorldPoint target,float standoff);
    void combat(double delta);
    void launchAttack(std::uint32_t source,std::uint32_t target,unsigned weapon,float stealthDamage=0,bool backstab=false);
    void projectiles(double delta);
    void impact(const CombatProjectile& projectile);
    void awardExperience(std::uint32_t killer,const UnitState& victim);
    void timedLives(double delta);
    void regenerate(double delta);
    std::vector<std::uint32_t> illusions(std::uint32_t caster,std::uint32_t original,unsigned count,float dealt,float taken,double duration,std::uint32_t buff,std::uint32_t ability=0);
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
    bool techEquivalent(std::uint32_t actual,std::uint32_t required);
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
    void bindScriptDialogNatives();
    void bindMatchNatives();
    void playerEvent(unsigned player,unsigned event);
    void clearDialog(std::uint32_t dialog);
    unsigned playerUnitCount(unsigned player,bool structures,bool incomplete,std::optional<std::uint32_t> type={},bool upgrades=false);
    std::string localized(const std::string& key);
    void cacheHeroes(unsigned owner);
    void recordStat(unsigned owner,int PlayerStatistics::* field,int amount=1);
    void preload(const std::string& member);
    void preloader(const std::string& member);
    bool alive(std::uint32_t handle,NativeKind kind) const;
    std::shared_ptr<ScriptBoolean> expression(jass::Value handle);
    bool evaluate(const std::shared_ptr<ScriptBoolean>& expression,unsigned depth=0);
    bool triggerEvaluate(std::uint32_t handle);
    jass::ThreadId triggerExecute(std::uint32_t handle,bool wait=false);
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
    jass::Value createUnit(std::uint32_t owner,std::uint32_t type,jass::Real x,jass::Real y,jass::Real facing,int reservedFood=0,const UnitState* illusionSource=nullptr,bool completed=true);
    jass::Value createItem(std::uint32_t type,jass::Real x,jass::Real y);
    SoundScene& requireAudio();
    MusicScene& requireMusic();
    World& requireWorld();
public:
    bool corpseAvailable(std::uint32_t corpse,std::uint32_t claimant=0);
    bool corpseCarrier(std::uint32_t transport);
    unsigned cargoCapacity(std::uint32_t transport);
    unsigned cargoUsed(std::uint32_t transport);
    unsigned cargoCost(std::uint32_t passenger);
    bool boardUnit(std::uint32_t passenger,std::uint32_t transport);
    bool unloadUnit(std::uint32_t transport,std::uint32_t passenger);
    bool unloadAll(std::uint32_t transport,WorldPoint point);
    ScriptSession(jass::Module module,const MapInfo& info,MapStrings strings={},std::optional<unsigned> gameType={});
    ~ScriptSession();
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
    const SpellInfo& spellInfo(std::uint32_t ability,unsigned level);
    const PassiveInfo& passiveInfo(std::uint32_t ability,unsigned level);
    bool castSpell(std::uint32_t unit,std::uint32_t ability,std::uint32_t target=0);
    bool castSpellAt(std::uint32_t unit,std::uint32_t ability,WorldPoint point);
    bool castPointOrder(std::uint32_t unit,std::uint32_t order,WorldPoint point);
    bool castImmediateOrder(std::uint32_t unit,std::uint32_t order);
    bool abilityAutocast(std::uint32_t unit,std::uint32_t ability,bool active);
    bool castOrder(std::uint32_t unit,std::uint32_t order,std::uint32_t target);
    bool learnHeroSkill(std::uint32_t unit,std::uint32_t ability) {return learnSkill(unit,ability);}
    bool canLearnSkill(std::uint32_t unit,std::uint32_t ability);
    double spellCooldown(std::uint32_t unit,std::uint32_t ability) const;
    std::vector<CommandButton> abilityCommands(std::uint32_t unit,unsigned player,bool learning=false);
    const auto& spellMissiles() const {return spellMissiles_;}
    const auto& spellWaves() const {return spellWaves_;}
    const auto& groundSpells() const {return groundSpells_;}
    const auto& effects() const {return effects_;}
    const auto& lightnings() const {return lightnings_;}
    void effectExpires(std::uint32_t id,double time);
    const auto& projectiles() const {return projectiles_;}
    const auto& destructables() const {return destructables_;}
    std::uint64_t destructableRevision() const {return destructableRevision_;}
    std::uint32_t placedDestructable(size_t index) const {return index<placedDestructables_.size()?placedDestructables_[index]:0;}
    const WeaponDefinition& projectileWeapon(const CombatProjectile& projectile) const {return projectile.definition;}
    void dropItem(std::uint32_t unit,std::uint32_t item);
    bool itemNeedsTarget(std::uint32_t item);
    double itemCooldown(std::uint32_t unit,std::uint32_t item);
    bool useItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target=0);
    bool useItemAt(std::uint32_t unit,std::uint32_t item,WorldPoint point);
    bool itemNeedsPoint(std::uint32_t item);
    bool damageUnit(std::uint32_t source,std::uint32_t target,float amount,unsigned attackType,unsigned damageType,bool attack=false,bool ranged=false,float* dealt=nullptr);
    const ProductInfo& product(std::uint32_t type,bool item=false);
    const ResearchInfo& researchInfo(std::uint32_t type,unsigned level);
    bool research(std::uint32_t unit,std::uint32_t type);
    std::optional<WorldPoint> buildSite(std::uint32_t worker,std::uint32_t type,WorldPoint point,std::string& reason,std::uint32_t* base=nullptr,WorldPoint* preview=nullptr);
    float buildingAngle();
    std::array<float,2> buildingSize(std::uint32_t type);
    bool build(std::uint32_t worker,std::uint32_t type,WorldPoint point);
    const ProductInfo& buildingUpgradeInfo(std::uint32_t from,std::uint32_t to);
    bool upgradeBuilding(std::uint32_t unit,std::uint32_t type);
    bool cancelBuildingUpgrade(std::uint32_t unit,bool refund=true);
    bool repair(std::uint32_t worker,std::uint32_t target);
    bool repairAutocast(std::uint32_t worker,bool enabled);
    bool cancelConstruction(std::uint32_t building,bool refund=true);
    bool entangleMine(std::uint32_t tree,std::uint32_t mine,bool instant=false);
    int remainingResources(std::uint32_t unit) const;
    void entangleTick(double delta);
    bool harvest(std::uint32_t unit,std::uint32_t mine);
    bool returnResources(std::uint32_t unit,std::uint32_t depot=0);
    std::vector<CommandButton> commands(std::uint32_t unit,unsigned player,bool buildMenu=false);
    bool purchase(std::uint32_t shop,unsigned player,std::uint32_t type,bool item,std::uint32_t buyer=0);
    ProductInfo revivalInfo(std::uint32_t hero);
    bool queueRevival(std::uint32_t building,std::uint32_t hero);
    bool train(std::uint32_t unit,std::uint32_t type);
    bool cancelProduction(std::uint32_t unit,size_t index=0,bool refund=true);
    bool setRally(std::uint32_t unit,WorldPoint point,std::uint32_t target=0);
    void chat(unsigned player,const std::string& message);
    const FogGrid& fog(unsigned player);
    bool unitInvisible(std::uint32_t unit);
    bool unitDetected(std::uint32_t unit,unsigned player);
    bool unitInvisibleTo(std::uint32_t unit,unsigned player);
    bool unitVisibleTo(std::uint32_t unit,unsigned player);
    const std::vector<ScriptText>& texts() const {return texts_;}
    const auto& quests() const {return quests_;}
    std::uint64_t questRevision() const {return questRevision_;}
    bool questFlash() const {return questFlash_;}
    void acknowledgeQuests() {questFlash_=false;}
    void displayText(unsigned owner,float x,float y,double duration,std::string text);
    void startAI(unsigned player,const std::string& script,bool campaign=false);
    const auto& ais() const {return ais_;}
    void startMain();
    void finishGame(bool scores,SessionExit action=SessionExit::Return);
    void removePlayer(unsigned owner,unsigned result);
    void leaveGame();
    bool clickDialog(unsigned owner,std::uint32_t button);
    void pause(bool value) {simulationPaused_=value;}
    bool paused() const {return simulationPaused_;}
    bool userControl() const {return userControl_;}
    bool userUI() const {return userUI_;}
    bool selectionEnabled() const {return selectionEnabled_;}
    bool selectionUI() const {return selectionUI_;}
    SessionExit exitRequest() const {return exit_;}
    bool showScores() const {return showScores_;}
    const auto& results() const {return results_;}
    const auto& statistics() const {return statistics_;}
    const auto& heroSummaries() const {return heroSummaries_;}
    const auto& dialogs() const {return dialogs_;}
    const auto& buttons() const {return buttons_;}
    const auto& defeatConditions() const {return defeatConditions_;}
    bool mainCompleted() const {return mainCompleted_ && !failed_;}
    bool mainStarted() const {return mainAttempted_ && !failed_;}
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
