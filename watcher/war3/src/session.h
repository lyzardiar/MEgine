// Author: MiYu. Script-owned map configuration and native object lifetime for a session.
#pragma once
#include "jass_runtime.h"
#include "map.h"
#include "world.h"
#include "sound.h"
#include "music.h"
#include "audio_random.h"
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
#include "consumables.h"
#include "phoenix_fire.h"
#include "swarm.h"
#include "stampede.h"
#include "alchemist.h"
#include "camera_control.h"
#include "chat_channel.h"
#include "lan_actions.h"
#include "lan_selection_sync.h"
#include "lan_cache_sync.h"
#include "indicator.h"
#include "model_sequence.h"
#include <variant>
#include <deque>
#include <unordered_map>

namespace war3 {
class PlayerSetup;
class WalkableGeometry;
struct LanSessionSetup;
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
    std::array<bool,2> upkeepOverride{};
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
struct DoodadState {
    std::uint32_t type=0,handle=0,randomPhase=0;
    float x=0,y=0;
    std::string animation,randomAnimation;
    double animationStart=0,randomStart=-1;
    bool active=true;
};
struct PresentationSpellSound {std::uint32_t ability=0;WorldPoint position{};std::string label;};
enum class NativeKind {Trackable,TextTag,Multiboard,MultiboardItem,Leaderboard,Player,Group,Timer,Trigger,Location,Rect,Sound,Unit,Item,Weather,Force,Boolean,Action,Condition,Event,TimerDialog,Region,Fog,Cache,Hashtable,Quest,QuestItem,Destructable,Dialog,Button,DefeatCondition,Ability,Effect,Lightning,CameraSetup,UnitPool,ItemPool,Image,Ubersplat,TerrainDeformation};
class ScriptSession {
    struct PlayerRef {unsigned id;};
    struct Group {std::vector<std::uint32_t> units;};
    struct RandomPool {std::vector<std::pair<std::uint32_t,float>> entries;};
    using Timer=ScriptTimer;
    using Trigger=ScriptTrigger;
    struct Object {NativeKind kind;bool alive=true;std::variant<std::monostate,std::shared_ptr<ScriptTrackable>,std::shared_ptr<ScriptTextTag>,PlayerRef,Group,RandomPool,Timer,Trigger,WorldPoint,WorldRect,std::shared_ptr<ScriptSound>,std::shared_ptr<UnitState>,std::shared_ptr<ItemState>,std::shared_ptr<WeatherState>,ScriptForce,std::shared_ptr<ScriptBoolean>,ScriptCallback,ScriptEvent,std::shared_ptr<ScriptTimerDialog>,std::shared_ptr<ScriptLeaderboard>,std::shared_ptr<ScriptMultiboard>,ScriptMultiboardItem,std::shared_ptr<SpatialRegion>,std::shared_ptr<FogModifier>,std::shared_ptr<ScriptCache>,std::shared_ptr<ScriptHashtable>,std::shared_ptr<ScriptQuest>,std::shared_ptr<ScriptQuestItem>,std::shared_ptr<DestructableState>,std::shared_ptr<ScriptDialog>,std::shared_ptr<ScriptButton>,std::shared_ptr<ScriptDefeatCondition>,ScriptAbility,std::shared_ptr<ScriptEffect>,std::shared_ptr<ScriptLightning>,std::shared_ptr<ScriptImage>,std::shared_ptr<ScriptUbersplat>,ScriptCameraSetup> state;std::uint32_t localNetworkOrdinal=0;};
    static constexpr std::uint32_t handleBase=0x100000;
    MapStrings strings_;
    SessionConfig config_;
    std::vector<Object> objects_;
    std::vector<std::uint32_t> localNetworkObjects_;
    std::vector<std::uint32_t> localNetworkUiObjects_;
    std::vector<std::uint32_t> eventHandles_,timerHandles_;
    unsigned combatTargetEventMask_=0;
    std::array<std::int32_t,2> integerGameStates_{};
    std::array<std::uint64_t,2> integerGameStateRevision_{};
    std::map<std::uint32_t,std::vector<std::uint32_t>> unitStateObservers_;
    jass::Runtime runtime_;
    bool failed_=false,configured_=false;
    std::optional<unsigned> localPlayer_;
    int reservedLocalHeroButtons_=0;
    std::optional<std::uint32_t> initialRandomSeed_;
    std::map<std::uint8_t,unsigned> networkPlayers_;
    std::set<std::uint8_t> networkActivePeers_;
    bool experimentalSelectionSync_=false;
    std::optional<bool> networkLocalEndRequest_;
    std::vector<unsigned> networkSlotPlayers_;
    std::array<std::uint32_t,16> playerLeaderboards_{};
    std::map<std::uint32_t,std::shared_ptr<ScriptMultiboard>> multiboards_;
    bool multiboardsSuppressed_=false;
    std::array<std::set<std::uint32_t>,16> synchronizedSelections_;
    std::array<std::map<std::uint32_t,std::uint64_t>,16> selectionRevisions_;
    using SelectionSnapshot=std::array<std::set<std::uint32_t>,16>;
    struct SelectionSyncRound {bool requested=false; jass::ExternalWaitToken token=0;std::optional<double> started;std::map<std::uint8_t,LanSelectionSyncPart> parts;std::shared_ptr<SelectionSnapshot> result;};
    std::uint32_t selectionSyncIssued_=0;
    std::map<std::uint32_t,SelectionSyncRound> selectionSyncRounds_;
    std::map<jass::ThreadId,std::shared_ptr<const SelectionSnapshot>> selectionSyncViews_;
    std::shared_ptr<const SelectionSnapshot> selectionSyncLatest_;
    std::deque<std::pair<std::uint64_t,LanActionExperimentalSelection>> selectionSyncOutgoing_;
    std::deque<std::pair<std::uint64_t,LanActionCacheSync>> cacheSyncOutgoing_;
    std::deque<unsigned> forcedUIKeys_;
    std::uint64_t syncOutgoingSequence_=0;
    size_t cacheSyncOutgoingBytes_=0;
    void flushLocalCacheSync();
    void syncSelections(jass::Runtime& vm);
    void finishSelectionSync(std::uint32_t round);
    void checkSelectionSyncTimeout() const;
    void syncLocalSelection();
    void transferAutomaticSelection(std::uint32_t source,std::uint32_t target,bool keepSource,bool ownerOnly=false);
    void selectionEvent(std::uint32_t unit,unsigned player,bool selected,std::uint64_t revision);
    std::unique_ptr<World> world_;
    bool setupApplied_=false,mainAttempted_=false,mainCompleted_=false;
    std::unique_ptr<SoundScene> audio_;
    std::unique_ptr<MusicScene> music_;
    std::unique_ptr<MusicScene> thematicMusic_;
    bool resumeMapAfterThematic_=false;
    bool audioMuted_=false,audioSimulationClock_=false;
    std::optional<std::array<float,3>> audioListener_,audioListenerRight_;
    std::vector<PresentationSpellSound> pendingSpellSounds_;
    void queueSpellSound(std::uint32_t ability,WorldPoint position);
    void queueLabelSound(const std::string& label,WorldPoint position);
    float localSoundGain_=1,localMusicGain_=1;
    std::array<bool,3> localSoundCategories_{true,true,true};
    std::unique_ptr<ObjectData> definitions_;
    std::map<std::uint32_t,std::shared_ptr<UnitState>> units_;
    std::set<std::uint32_t> queuedPlayerUnits_;
    std::map<std::string,std::vector<mdx::Sequence>> animationSequences_;
    std::set<std::uint32_t> animatedDestructables_;
    const std::vector<mdx::Sequence>& sequencesForModel(const std::string& model);
    void updateUnitAnimation(UnitState& unit);
    void updateDestructableAnimations();
    std::map<std::uint32_t,std::shared_ptr<ItemState>> items_;
    struct InventoryAbilityInfo {bool inventory=false;unsigned slots=0;std::vector<std::pair<std::uint32_t,unsigned>> prerequisites;};
    std::map<std::pair<std::uint32_t,unsigned>,InventoryAbilityInfo> inventoryAbilityInfo_;
    const InventoryAbilityInfo& inventoryAbilityInfo(std::uint32_t ability,unsigned level);
    bool inventoryAbilityReady(unsigned owner,const InventoryAbilityInfo& info);
    std::optional<std::pair<std::uint32_t,std::uint32_t>> requestedBook_;
    std::map<std::uint32_t,std::shared_ptr<DestructableState>> destructables_;
    std::unordered_map<size_t,std::vector<std::uint32_t>> walkableSurfaces_;
    std::map<std::string,std::shared_ptr<WalkableGeometry>> walkableModels_;
    size_t walkableModelBytes_=0;
    std::optional<PlacedDefinitions> destructableDefinitions_;
    std::optional<SourceSettings> destructableStrings_;
    std::map<std::string,Image> pathImages_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,ProductInfo> buildingUpgradeProducts_;
    std::unique_ptr<Images> pathDecoder_;
    std::vector<std::uint32_t> placedDestructables_;
    std::vector<DoodadState> doodads_;
    std::vector<size_t> freeDoodads_;
    std::map<std::pair<int,int>,std::vector<size_t>> doodadGrid_;
    float maxDestructableRadius_=0;
    bool loadingDoodads_=false;
    size_t addDoodad(std::uint32_t type,float x,float y,std::uint32_t handle);
    void removeDoodad(size_t index);
    void animateDoodads(const DoodadAnimation& animation);
    std::map<std::pair<int,int>,std::vector<std::uint32_t>> treeGrid_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,bool> techAliases_;
    size_t footprintCells_=0,pathImageBytes_=0;
    std::uint64_t destructableRevision_=1;
    std::optional<SourceTable> weather_;
    std::map<std::uint32_t,std::shared_ptr<WeatherState>> weatherEffects_;
    std::map<std::string,std::shared_ptr<ScriptSound>> weatherSounds_;
    std::shared_ptr<WeatherState> makeWeather(std::uint32_t type,WorldRect region);
    void initializeMapWeather();
    void updateWeatherAudio(float x,float y,float z);
    std::vector<ScriptContext> contexts_;
    std::map<jass::ThreadId,std::vector<ScriptContext>> threadContexts_{{0,{}}};
    void bindThreadNatives();
    double simulationTime_=0,accumulator_=0;
    std::uint32_t routeRetryCursor_=0;
    struct PointDamage {
        std::uint32_t source=0,attackType=0,damageType=0;
        float x=0,y=0,radius=0,amount=0;
        bool attack=false,ranged=false;
    };
    std::multimap<double,PointDamage> pointDamageQueue_;
    bool scriptDamageWidget(std::uint32_t source,std::uint32_t target,float amount,unsigned attackType,unsigned damageType,bool attack,bool ranged);
    void applyPointDamage(const PointDamage& damage);
    void pointDamageTick();
    IndicatorState indicators_;
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
    bool aiMergeUnits(ScriptAI& ai,int quantity,std::uint32_t first,std::uint32_t second,std::uint32_t result);
    bool aiConvertUnits(ScriptAI& ai,int quantity,std::uint32_t type);
    void aiPurchaseZeppelin(ScriptAI& ai);
    void aiPurchaseZeppelinTick(ScriptAI& ai);
    void aiLoadZeppelinWave(ScriptAI& ai,WorldPoint destination);
    void aiZeppelinWaveTick(ScriptAI& ai);
    void aiCancelZeppelinWave(ScriptAI& ai);
    void aiHarvest(ScriptAI& ai);
    void aiFormCaptains(ScriptAI& ai,bool force=false);
    void aiSuicide(ScriptAI& ai,int quantity,std::uint32_t type,int targetPlayer);
    void aiSuicideTick(ScriptAI& ai);
    void aiCombatSpells(ScriptAI& ai,std::uint32_t unit);
    bool aiUnitDefense(ScriptAI& ai,std::uint32_t unit,const std::map<std::uint32_t,std::vector<std::uint32_t>>& attackers);
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
    bool campaignExpansion_=true,forceCampaignSelect_=false;
    std::string nextLevel_;
    std::string modelCinematic_,movieCinematic_;
    bool showScores_=false,userControl_=true,userUI_=true,selectionEnabled_=true,selectionUI_=true,dragSelectionEnabled_=true,dragSelectionUI_=true;
    bool occlusionEnabled_=true;
    ScriptCineFilter cineFilter_;
    bool forceCinematicSubtitles_=false;
    bool interfaceVisible_=true;
    float interfaceFrom_=1;
    double interfaceChanged_=0,interfaceDuration_=0;
    std::optional<ScriptCinematicScene> cinematicScene_;
    CameraControl cameraControl_;
    unsigned gameDifficulty_=1,defaultDifficulty_=1;
    bool simulationPaused_=false,fogEnabled_=true,fogMaskEnabled_=true;
    unsigned gameSpeed_=2;
    unsigned version_=1;
    bool versionSelected_=false;
    std::array<bool,2> versionsSupported_{true,true};
    AudioRandom gameRandom_{0x69707365u};
    std::array<AudioRandom,45> auxiliaryRandom_{};
    int stockItemSlots_=12,stockUnitSlots_=12;
    std::vector<std::shared_ptr<const Member>> preloaded_;
    size_t preloadBytes_=0;
    unsigned preloadDepth_=0;
    std::vector<std::string> preloadMissing_;
    std::optional<FrameDefinitions> localized_;
    std::map<std::uint32_t,std::shared_ptr<ScriptTimerDialog>> timerDialogs_;
    std::array<std::unique_ptr<FogGrid>,16> fogGrids_;
    std::array<std::uint32_t,16> exposedPlayers_{};
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
    std::map<std::uint64_t,SentinelState> sentinels_;
    std::uint64_t revealTicket_=0;
    void stealthTick(double delta);
    void startSentinel(std::uint32_t source,const CastOrder& cast);
    void sentinelTick(double delta);
    void startShadowMeld(std::uint32_t unit,const SpellInfo& spell);
    void cancelShadowMeld(UnitState& unit);
    void addReveal(unsigned owner,const SpellInfo& spell,WorldPoint point);
    void dustSpell(std::uint32_t source,const SpellInfo& spell,WorldPoint point,unsigned owner);
    std::pair<float,bool> windWalkStrike(const UnitState& unit);
    std::optional<WorldPoint> blinkPoint(const UnitState& unit,const SpellInfo& spell,WorldPoint point);
    void blinkSpell(std::uint32_t unit,const SpellInfo& spell,WorldPoint point);
    void startMirrorImage(std::uint32_t unit,const CastOrder& cast);
    void mobilityTick(double delta);
    const DeathPassiveInfo* deathPassiveInfo(std::uint32_t ability,unsigned level);
    void initializeDeathRestart(UnitState& unit);
    void clearDeathRestart(UnitState& unit);
    bool cancelDeathActivities(UnitState& unit);
    bool tryDeathRestart(std::uint32_t unit);
    void deathRestartsTick(double delta);
    void summonPhoenix(std::uint32_t unit,const SpellInfo& spell,unsigned owner);
    std::map<std::pair<std::uint32_t,unsigned>,std::optional<DeathPassiveInfo>> deathPassives_;
    std::set<std::uint32_t> deathRestartActors_;
    const SpellInfo& phoenixFireInfo(std::uint32_t ability,unsigned level);
    void refreshPhoenixFire(UnitState& unit);
    void removePhoenixFire(std::uint32_t unit);
    void clearPhoenixBurn(std::uint32_t target,std::uint64_t ticket=0);
    void phoenixFireImpact(const SpellMissile& missile);
    void phoenixFireTick(double delta);
    std::map<std::pair<std::uint32_t,unsigned>,SpellInfo> phoenixFireInfo_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,PhoenixFireClock> phoenixFireClocks_;
    std::set<std::uint32_t> phoenixFireActors_;
    std::map<std::uint64_t,SiegeFire> siegeFires_;
    std::map<std::uint32_t,ConcoctionFlight> concoctions_;
    std::map<std::uint32_t,PhoenixBurn> phoenixBurns_;
    std::uint64_t phoenixBurnTicket_=0;
    void heroUltimateInfo(SpellInfo& spell);
    void frostPoisonInfo(SpellInfo& spell);
    const SpellInfo* frostArmorReaction(const UnitState& unit);
    void frostArmorChill(std::uint32_t protectedUnit,std::uint32_t attacker,const SpellInfo& spell,std::uint64_t deathRevision);
    void shadowStrikeImpact(const SpellMissile& missile);
    float shadowStrikeTick(UnitBuff& buff,double elapsed);
    bool ultimateEffectActive(std::uint32_t unit,unsigned owner,std::uint64_t ticket,std::uint32_t buff=0);
    void ultimateAreaDamage(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,float amount,bool buildingsOnly,unsigned owner,std::uint64_t ticket,std::uint32_t buff=0);
    void startHeroUltimate(std::uint32_t unit,const CastOrder& cast);
    void releaseUltimateMark(std::uint32_t source,std::uint64_t ticket,std::uint32_t unit,std::uint32_t buff);
    void releaseHeroUltimate(CastOrder& cast);
    void heroUltimateChannelTick(std::uint32_t unit,double delta);
    void heroUltimatesTick(double delta);
    std::set<std::uint32_t> bladestormActors_;
    void teleportSpellInfo(SpellInfo& spell);
    bool teleportTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility);
    std::uint32_t teleportAnchor(const UnitState& caster,const SpellInfo& spell,WorldPoint point,bool automatic=false);
    bool teleportReady(const UnitState& caster,const SpellInfo& spell,WorldPoint point);
    void startTeleport(std::uint32_t unit,const CastOrder& cast);
    std::uint32_t preservationAnchor(const UnitState& target,const SpellInfo& spell);
    void preserveUnit(std::uint32_t unit,const CastOrder& cast);
    void teleportTick(std::uint32_t unit,double delta);
    bool useTeleportItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point);
    bool itemSpellReady(const UnitState& unit,const SpellInfo& spell,std::uint32_t item);
    bool commitItemSpell(std::uint32_t unit,const CastOrder& cast);
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
    std::map<std::pair<std::uint32_t,std::uint32_t>,std::set<std::uint32_t>> corpseSummons_;
    unsigned corpseSummonCount(std::uint32_t caster,std::uint32_t ability);
    bool corpseSummonReady(const UnitState& caster,const SpellInfo& spell);
    void summonCorpseUnits(std::uint32_t caster,const SpellInfo& spell,unsigned owner);
    void releaseCorpseSummon(const UnitState& unit);
    void killDependentSummons(std::uint32_t caster);
    void startCannibalize(std::uint32_t caster,const CastOrder& cast);
    void cannibalizeTick(std::uint32_t caster,double delta);
    void bindCorpseNatives();
    void bindControlNatives();
    std::set<std::uint32_t> eatTreeActors_;
    std::map<std::uint32_t,std::pair<std::uint32_t,std::uint64_t>> eatenTrees_;
    bool eatTreeTarget(const UnitState& unit,std::uint32_t tree,bool visibility);
    void startEatTree(std::uint32_t unit,const CastOrder& cast);
    void cancelEatTree(UnitState& unit,std::uint64_t ticket);
    void eatTreesTick(double delta);
    void devourMagic(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    void startAbsorb(std::uint32_t unit,const CastOrder& cast);
    void absorbImpact(const SpellMissile& missile);
    bool absorbTarget(const UnitState& unit,const UnitState& target,const SpellInfo& spell);
    const SpellInfo* attackOrb(const UnitState& unit,const UnitState& target,std::uint32_t forced=0);
    void orbWeapon(WeaponDefinition& weapon,const SpellInfo& spell);
    float defensePassiveDamage(const UnitState& unit,float amount,unsigned attackType,bool attack,bool ranged,bool spellDamage,unsigned owner);
    void warClubInfo(SpellInfo& spell);
    void siegePassiveInfo(PassiveInfo& passive);
    void prepareSiegeAttack(const UnitState& unit,CombatProjectile& projectile);
    void siegeImpact(const CombatProjectile& projectile,bool primary);
    void barrageVolley(const CombatProjectile& projectile);
    void barragePulse(std::uint32_t unit,const PassiveInfo& passive,AmbientClock& clock);
    void siegeFiresTick(double delta);
    void weaponEffectInfo(PassiveInfo& passive);
    void refreshWeaponEffects(UnitState& unit);
    void clearWeaponEffects(UnitState& unit);
    const PassiveInfo* inventoryOrb(const UnitState& unit);
    void prepareWeaponEffects(const UnitState& unit,const UnitState& target,CombatProjectile& projectile);
    void weaponEffectsBeforeHit(const CombatProjectile& projectile,std::uint32_t target);
    void weaponEffectsAfterHit(const CombatProjectile& projectile,std::uint32_t target,float damage,std::uint64_t targetRevision);
    void poisonHit(std::uint32_t target,const CombatProjectile& projectile,const PassiveInfo& passive);
    void poisonTick(UnitBuff& buff,double delta,std::vector<StatusDamage>& damage);
    void frostPillageInfo(PassiveInfo& passive);
    void frostBreathImpact(const CombatProjectile& projectile);
    void pillageHit(const CombatProjectile& projectile,float damage,std::uint32_t targetType,jass::Real targetMaxLife,unsigned targetOwner);
    void concoctionInfo(SpellInfo& spell);
    void startConcoction(std::uint32_t unit,const CastOrder& cast);
    void clearConcoction(std::uint32_t unit);
    void concoctionsTick(double delta);
    void explodeConcoction(std::uint32_t unit,const ConcoctionFlight& flight);
    void plaguePassiveInfo(PassiveInfo& passive);
    void plaguePulse(std::uint32_t source,const PassiveInfo& passive);
    void createPlagueWard(unsigned owner,std::uint32_t type,WorldPoint point,double duration,std::uint32_t source,std::uint32_t ability);
    void plagueDeath(const UnitState& unit);
    void plagueTossImpact(const CombatProjectile& projectile);
    void startGrabTree(std::uint32_t unit,const CastOrder& cast);
    void cancelGrabTree(UnitState& unit,std::uint64_t ticket);
    void clearWarClub(UnitState& unit,bool cancelGrab=true);
    void warClubAttack(UnitState& unit,unsigned slot);
    void warClubsTick(double delta);
    std::set<std::uint32_t> warClubActors_;
    void couplingInfo(SpellInfo& spell);
    bool coupleTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility=true);
    std::uint32_t couplePartner(const UnitState& caster,const SpellInfo& spell);
    bool prepareCoupling(UnitState& unit,SpellInfo& spell,std::uint32_t& target,SpellTargeting& targeting);
    bool claimCouple(std::uint32_t unit,const CastOrder& cast);
    void releaseCouple(const CastOrder& cast);
    bool smartCouple(std::uint32_t unit,std::uint32_t target);
    std::vector<WorldPoint> couplingPlacement(const UnitState& caster,const std::vector<std::uint32_t>& types,const std::vector<std::uint32_t>& ignore);
    void couplingCooldown(UnitState& unit,const SpellInfo& source);
    void replaceCouplingUnits(const std::vector<std::uint32_t>& before,const std::vector<std::uint32_t>& after);
    void coupleEffect(std::uint32_t unit,const CastOrder& cast);
    void decoupleEffect(std::uint32_t unit,const CastOrder& cast);
    std::map<std::uint32_t,std::pair<std::uint32_t,std::uint64_t>> coupleClaims_;
    void faerieSpellInfo(SpellInfo& spell);
    bool phaseShift(std::uint32_t unit,const SpellInfo& spell,bool automatic=false);
    bool phaseShiftReaction(std::uint32_t unit,std::uint32_t attacker);
    bool manaFlareActive(const UnitState& unit,const SpellInfo& spell) const;
    bool stopManaFlare(std::uint32_t unit,std::uint32_t ability);
    void startManaFlare(std::uint32_t unit,const CastOrder& cast);
    void releaseManaFlare(const CastOrder& cast);
    void manaFlareReaction(std::uint32_t unit,const CastOrder& cast);
    bool manaFlareImpact(const SpellMissile& missile);
    std::set<std::uint32_t> manaFlareActors_;
    void spellBookInfo(SpellInfo& spell);
    void refreshSpellBooks(UnitState& unit);
    void bookSharedCooldown(UnitState& unit,std::uint32_t ability,double duration);
    int learnedLevel(const UnitState& unit,std::uint32_t ability) const;
    bool canRetrain(const UnitState& unit);
    void retrainHero(std::uint32_t unit,const SpellInfo& spell);
    void restorationInfo(SpellInfo& spell);
    void refreshRestoration(UnitState& unit);
    bool restorationTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility,unsigned owner);
    std::vector<std::uint32_t> restorationTargets(const UnitState& caster,const SpellInfo& spell);
    bool restorationPrepare(const UnitState& caster,SpellInfo& spell);
    void restorationEffect(std::uint32_t caster,const CastOrder& cast);
    bool restorationAutocast(UnitState& caster,const SpellInfo& spell);
    bool smartRecharge(std::uint32_t unit,std::uint32_t well,std::uint32_t ability=0);
    void rechargeFollow(UnitState& unit);
    void wardSpellInfo(SpellInfo& spell);
    void roarSpellInfo(SpellInfo& spell);
    void roarEffect(std::uint32_t source,const SpellInfo& spell,unsigned owner);
    void initializeWard(std::uint32_t unit,const SpellInfo& spell);
    void wardsTick(double delta);
    bool useWardRoarItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point);
    std::map<std::uint32_t,StasisWard> stasisWards_;
    void humanSpellInfo(SpellInfo& spell);
    std::optional<std::pair<std::uint32_t,std::uint32_t>> spellStealChoice(const UnitState& caster,const UnitState& holder,const SpellInfo& spell,bool visibility=true,unsigned owner=UINT_MAX);
    const std::vector<std::uint32_t>& spellStealNeighborhood(const UnitState& caster,float radius);
    std::map<std::pair<std::uint32_t,std::uint32_t>,std::vector<std::uint32_t>> spellStealNeighborhoods_;
    double spellStealNeighborhoodTime_=-1;
    std::uint64_t spellStealNeighborhoodFog_=0;
    size_t spellStealNeighborhoodUnits_=0;
    void spellStealImpact(const SpellMissile& missile);
    bool useHumanCasterItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point);
    void startHumanChannel(std::uint32_t source,const CastOrder& cast);
    bool humanChannelTick(std::uint32_t source,double delta);
    void releaseHumanChannel(const CastOrder& cast);
    void releaseHumanClaim(std::uint32_t source,std::uint64_t ticket,std::uint32_t target,std::uint32_t buff);
    bool cloudTarget(const UnitState& target,const SpellInfo& spell);
    void cloudPulse(std::uint32_t source,const CastOrder& cast);
    void aggregateCloud(UnitBuff& buff);
    float feedbackAttack(const CombatProjectile& projectile);
    void unitCasterInfo(SpellInfo& spell);
    void unitCasterEffect(const SpellMissile& missile);
    void retireUnitCasterBuff(const UnitBuff& buff);
    void unitCastersTick(double delta);
    float spiritLinkDamage(std::uint32_t source,std::uint32_t target,float damage,unsigned owner);
    bool faerieFireVision(const UnitState& unit,unsigned viewer) const;
    bool useUnitCasterItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target);
    std::map<std::pair<unsigned,std::uint32_t>,std::set<std::uint32_t>> spiritLinks_;
    std::set<std::pair<std::uint32_t,std::uint32_t>> lightningShieldActors_;
    void refreshEngineering(UnitState& unit);
    std::uint32_t engineeringAbility(const UnitState& unit,std::uint32_t ability,bool reverse=false) const;
    void tinkerSpellInfo(SpellInfo& spell);
    void tinkerVolley(std::uint32_t source,const CastOrder& cast);
    void tinkerVolleyImpact(const TinkerVolley& volley);
    void tinkerTick(double delta);
    void factorySpawn(std::uint32_t factory,std::uint64_t ticket);
    void selfDestructDeath(const UnitState& victim);
    void tinkerExplosion(const TinkerExplosion& explosion);
    std::map<std::uint64_t,TinkerVolley> tinkerVolleys_;
    std::map<std::uint32_t,PocketFactoryState> factories_;
    std::map<std::uint32_t,ClockwerkState> clockwerks_;
    std::map<std::uint64_t,TinkerExplosion> tinkerExplosions_;
    void alchemistSpellInfo(SpellInfo& spell);
    bool alchemistImpact(const SpellMissile& missile);
    float acidBombTick(UnitBuff& buff,double elapsed);
    void healingSprayPulse(std::uint32_t source,const CastOrder& cast);
    void healingSprayImpact(const HealingSprayWave& wave);
    void healingSpraysTick(double delta);
    std::map<std::uint64_t,HealingSprayWave> healingSprays_;
    void transmute(std::uint32_t source,std::uint32_t target,const SpellInfo& spell,unsigned owner);
    void creditKillResources(unsigned owner,int gold,int lumber);
    void awardKillBounty(std::uint32_t killer,const UnitState& victim);
    void firelordSpellInfo(SpellInfo& spell);
    bool firelordTarget(unsigned owner,const UnitState& target,const SpellInfo& spell,bool living=true);
    bool firelordImpact(const SpellMissile& missile);
    float firelordBuffTick(UnitBuff& buff,double elapsed);
    float prepareIncinerateHit(const CombatProjectile& projectile,std::uint32_t target);
    void incinerateDeath(const UnitState& victim);
    std::map<std::uint64_t,Incineration> incinerations_;
    std::map<std::uint64_t,VolcanoRock> volcanoRocks_;
    std::set<std::uint32_t> lavaActors_;
    void initializeLavaSpawn(std::uint32_t summoner,std::uint32_t unit,const SpellInfo& spell,unsigned generation=0);
    void clearLavaSpawn(UnitState& unit);
    void lavaSpawnHit(const CombatProjectile& projectile,float damage);
    void lavaSpawnsTick(double delta);
    void splitLavaSpawn(std::uint32_t unit);
    void startVolcano(std::uint32_t source,const CastOrder& cast);
    void releaseVolcano(const CastOrder& cast);
    void volcanoChannelTick(std::uint32_t source,double delta);
    void volcanoPulse(std::uint32_t source,const CastOrder& cast);
    void firelordTick(double delta);
    void firelordExplosion(const Incineration& explosion);
    void volcanoImpact(const VolcanoRock& rock);
    void spiritSpellInfo(SpellInfo& spell);
    std::set<std::uint32_t> spiritSplitActors_,ambientActors_;
    std::map<std::pair<std::uint32_t,std::uint32_t>,AmbientClock> ambientClocks_;
    bool spiritSplitReady(const UnitState& unit,const SpellInfo& spell);
    void startSpiritSplit(std::uint32_t source,const CastOrder& cast);
    void clearSpiritSplit(UnitState& unit,bool returnToSurvivor=false);
    void noteSpiritMember(UnitState& unit,std::uint32_t killer=0);
    void spiritSplitsTick(double delta);
    void startTornado(std::uint32_t source,const CastOrder& cast);
    void releaseTornado(const CastOrder& cast);
    void tornadoChannelTick(std::uint32_t source,double delta);
    void refreshAmbientPassives(UnitState& unit,const std::map<std::uint32_t,unsigned>& abilities);
    void removeAmbientPassives(std::uint32_t unit);
    void ambientPassivesTick(double delta);
    std::unordered_map<std::uint64_t,std::vector<std::uint32_t>> ambientGrid_;
    std::vector<std::uint32_t> ambientNearby(WorldPoint point,float radius);
    void ambientPulse(std::uint32_t source,const PassiveInfo& passive,AmbientClock& clock);
    void tauntSpell(std::uint32_t source,const SpellInfo& spell);
    void pulverizeDamage(const CombatProjectile& projectile,const PassiveInfo& passive);
    void neutralSpellInfo(SpellInfo& spell);
    bool neutralSpellImpact(const SpellMissile& missile);

    void breathFireHit(std::uint32_t source,std::uint32_t target,const SpellInfo& spell,unsigned owner,float amount);
    float neutralBurnTick(UnitBuff& buff,double elapsed);
    void doomDeath(const UnitState& victim);
    void arrowStatusInfo(SpellInfo& spell);
    std::map<std::uint64_t,StampedeBeast> stampedeBeasts_;
    StampedeIndex stampedeUnitIndex_,stampedePropIndex_;
    std::uint64_t stampedePropRevision_=UINT64_MAX;
    void rebuildStampedeIndexes();
    std::map<std::uint64_t,AttackLightning> attackLightnings_;
    std::uint64_t stampedeTicket_=0,attackLightningTicket_=0;
    void stampedeInfo(SpellInfo& spell);
    void stampedePulse(std::uint32_t caster,const CastOrder& cast);
    void stampedeTick(double delta);
    void releaseStampede(const CastOrder& cast);
    bool stampedeActive(const StampedeBeast& beast);
    void stampedeImpact(const StampedeBeast& beast);
    void retireStampedeEffect(std::uint32_t effect);
    const PassiveInfo* lightningAttack(const UnitState& unit);
    void lightningWeapon(WeaponDefinition& weapon,const PassiveInfo& passive);
    void queueAttackLightning(const CombatProjectile& projectile,const PassiveInfo& passive);
    void attackLightningsTick();
    void lightningAttackHit(const CombatProjectile& projectile,std::uint32_t target);
    bool arrowTarget(unsigned owner,const UnitState& target,const SpellInfo& spell);
    void prepareArrowHit(const CombatProjectile& projectile,std::uint32_t target);
    void finishArrowHit(const CombatProjectile& projectile,std::uint32_t target,std::uint64_t revision);
    void blackArrowDeath(const UnitState& victim);
    void summonedEvent(std::uint32_t source,std::uint32_t summoned,unsigned owner);
    void silenceEffect(std::uint32_t source,const SpellInfo& spell,WorldPoint point,unsigned owner);
    bool useSilenceItem(std::uint32_t unit,std::uint32_t item,WorldPoint point);
    std::set<std::uint32_t> rootActors_;
    void initializeRoot(UnitState& unit);
    void prepareRootSpell(const UnitState& unit,SpellInfo& spell);
    bool rootReady(const UnitState& unit,const SpellInfo& spell);
    void startRoot(std::uint32_t unit,const CastOrder& cast);
    void rootsTick(double delta);
    void cancelRoot(UnitState& unit,std::uint64_t ticket);
    std::set<std::uint32_t> unitFormActors_;
    bool alternateForm(const UnitState& unit,const SpellInfo& spell);
    bool unitFormReady(const UnitState& unit,const SpellInfo& spell,bool placement=true);
    void prepareUnitFormSpell(const UnitState& unit,SpellInfo& spell);
    std::optional<WorldPoint> formLanding(const UnitState& unit,std::uint32_t type);
    bool changeUnitForm(std::uint32_t unit,std::uint32_t type,float healthBonus,bool heroForm);
    bool militiaCommand(std::uint32_t unit,bool returning,std::uint32_t order=0);
    bool militiaTownBell(std::uint32_t town,bool returning);
    void militiaTick(double delta);
    void cancelMilitiaOrder(UnitState& unit);
    void applyChaosForm(std::uint32_t unit);
    bool commitUnitForm(std::uint32_t unit);
    void startUnitForm(std::uint32_t unit,const CastOrder& cast);
    void returnUnitForm(std::uint32_t unit);
    void unitFormsTick(double delta);
    void cancelUnitForm(UnitState& unit,std::uint64_t ticket);
    void unitFormDeath(UnitState& unit);
    std::map<std::uint32_t,std::shared_ptr<const MorphAppearance>> morphAppearances_;
    std::shared_ptr<const MorphAppearance> morphAppearance(std::uint32_t type);
    void morphEffect(std::uint32_t source,std::uint32_t target,const SpellInfo& spell);
    void cycloneEffect(std::uint32_t source,std::uint32_t target,const SpellInfo& spell);
    bool controlTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility,unsigned owner);
    std::optional<WorldPoint> spellWidgetPoint(std::uint32_t target);
    bool spellWidgetTarget(const UnitState& caster,std::uint32_t target,const SpellInfo& spell,bool visibility=true);
    float spellTargetCollision(std::uint32_t target) const;
    void controlEffect(const SpellMissile& missile);
    void purgeSpell(std::uint32_t source,std::uint32_t target,const SpellInfo& spell);
    void controlBuff(UnitState& unit,UnitBuff& buff,const SpellInfo& spell);
    void controlBuffTick(UnitBuff& buff,double elapsed);
    void updateGrounding(UnitState& unit,double delta);
    void wakeUnit(std::uint32_t unit);
    void naturalSleepTick();
    float spellHealAmount(const UnitState& unit,float amount);
    jass::Value createCorpse(unsigned owner,std::uint32_t type,WorldPoint point,jass::Real facing);
    void exhumeCorpses(std::uint32_t transport,double delta);
    std::map<std::uint32_t,bool> corpseHoldAbilities_;
    bool corpseCargoCandidate(const UnitState& unit);
    bool useItemImpl(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point);
    bool useCombinedRecoveryItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point,const std::vector<std::uint32_t>& abilities);
    std::map<std::string,std::uint32_t> caches_;
    std::vector<ScriptText> texts_;
    std::map<std::uint32_t,std::shared_ptr<ScriptTextTag>> textTags_;
    std::vector<ScriptMinimapPing> minimapPings_;
    std::uint64_t nextMinimapPing_=0;
    std::optional<std::pair<std::uint32_t,std::uint32_t>> minimapPingColors_;
    std::optional<std::array<std::string,2>> attackAlertLabels_;
    double nextAttackAlert_=0;
    std::pair<std::uint32_t,std::uint32_t> pingColors();
    void minimapPing(float x,float y,float duration,std::optional<std::uint32_t> color,bool extra);
    void attackAlert(const UnitState& unit);
    std::map<std::pair<std::uint32_t,bool>,ProductInfo> products_;
    std::map<std::pair<std::uint32_t,unsigned>,ResearchInfo> researchInfo_;
    std::map<std::pair<std::uint32_t,bool>,std::optional<std::pair<int,int>>> globalStock_;
    std::uint64_t productionTicket_=0;
    std::optional<SourceSettings> gameplay_;
    struct UpkeepRules {std::array<int,10> usage{};std::array<std::array<int,10>,2> rates{};};
    std::optional<UpkeepRules> upkeepRules_;
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
    std::map<std::pair<std::uint32_t,std::uint32_t>,std::shared_ptr<LocustSwarm>> locustSwarms_;
    std::map<std::uint32_t,LocustAgent> locustAgents_;
    std::uint64_t locustTicket_=0;
    void startLocustSwarm(std::uint32_t caster,const SpellInfo& spell,unsigned owner);
    void clearLocustSwarm(const std::shared_ptr<LocustSwarm>& swarm);
    void removeLocust(std::uint32_t unit);
    void locustsTick(double delta);
    bool locustTarget(const LocustSwarm& swarm,const UnitState& target);
    void locustDamage(std::uint32_t locust,float damage);
    bool flyLocust(UnitState& locust,WorldPoint point,float height,float stop,double delta);
    void startImpale(std::uint32_t caster,const CastOrder& cast,unsigned owner);
    void impaleWaveArt(SpellWave& wave,float next);
    void impaleHit(std::uint32_t caster,std::uint32_t target,const SpellInfo& spell,unsigned owner);
    float impaleLanding(UnitBuff& buff,double elapsed);
    unsigned auraTicks_=0;
    enum class GhostFlag { MorphImmune, NoBuildingCollision };
    bool ghostFlag(const UnitState& unit,GhostFlag flag);
    std::vector<std::pair<std::uint32_t,unsigned>> passiveAbilities(const UnitState& unit);
    bool passiveTarget(const UnitState& source,const UnitState& target,const PassiveInfo& definition);
    bool passiveTarget(const UnitState& source,const UnitState& target,const std::set<std::string>& allowed);
    void aurasTick(double delta);
    void aggregateAuras(UnitState& unit,bool visuals=true);
    void clearAuras(UnitState& unit);
    void releaseAuraSource(std::uint32_t unit);
    bool passiveChance(float chance);
    bool criticalChance(const UnitState& unit,const PassiveInfo& passive);
    void prepareAttack(const UnitState& source,const UnitState& target,CombatProjectile& projectile);
    bool evadeAttack(const UnitState& target,const CombatProjectile& projectile);
    const PassiveInfo* spikedCarapace(const UnitState& unit);
    float armorBasePoints(const UnitState& unit);
    float armorPoints(const UnitState& unit,const PassiveInfo* carapace,float base);
    float attackDamageBeforeProc(const UnitState& unit,const WeaponDefinition& weapon,float damage);
    void carapaceReflect(const CombatProjectile& projectile,float damage,const PassiveInfo& passive,std::uint64_t attackerRevision,std::uint64_t defenderRevision);
    void attackPassives(const CombatProjectile& projectile,float damage,const AuraBonuses& defense);
    std::map<std::pair<std::uint32_t,std::uint32_t>,std::uint32_t> abilityHandles_;
    std::map<std::uint64_t,SpellMissile> spellMissiles_;
    std::uint64_t spellTicket_=0;
    std::map<std::uint64_t,SpellWave> spellWaves_;
    std::map<std::uint64_t,DelayedSpell> delayedSpells_;
    std::map<std::uint64_t,GroundSpell> groundSpells_;
    bool changeUnitOwner(std::uint32_t unit,unsigned owner,bool color,bool stop=false);
    void ownershipSpellInfo(SpellInfo& spell);
    bool ownershipTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility,unsigned owner=UINT_MAX);
    float ownershipMana(const SpellInfo& spell,const UnitState& target) const;
    void startPossession(std::uint32_t caster,const CastOrder& cast);
    void possessionTick(std::uint32_t caster,double delta);
    void releasePossession(CastOrder& cast);
    bool ownershipEffect(std::uint32_t caster,std::uint32_t target,const SpellInfo& spell,unsigned owner);
    void resourceSpellInfo(SpellInfo& spell);
    bool resourceSpellTarget(const UnitState& caster,const UnitState& target,const SpellInfo& spell,bool visibility,unsigned owner=UINT_MAX);
    void startDrain(std::uint32_t unit);
    void releaseDrain(CastOrder& cast);
    void drainPulse(std::uint32_t unit,const CastOrder& cast);
    void drainRestore(std::uint32_t unit,const SpellInfo& spell,float life,float mana);
    void drainBonusTick(UnitState& unit,UnitBuff& buff,double delta);
    void startManaBurn(std::uint32_t unit,const CastOrder& cast,unsigned owner);
    void manaBurn(std::uint32_t unit,std::uint32_t target,const SpellInfo& spell,unsigned owner);
    void sacrifice(std::uint32_t unit,std::uint32_t target,const SpellInfo& spell,unsigned owner);
    bool sacrificePitTarget(const UnitState& worker,const UnitState& pit);
    void sacrificePit(std::uint32_t worker,std::uint32_t pit);
    void releaseSacrifice(const ProductionOrder& job,UnitState& pit);
    void cancelSacrificeForUnit(std::uint32_t unit);
    void startChannel(std::uint32_t unit);
    void channelTick(std::uint32_t unit,double delta);
    void channelPulse(std::uint32_t unit,const CastOrder& cast);
    void finishCast(std::uint32_t unit,std::uint64_t ticket);
    void restoreCastCombat(UnitState& unit,const CastOrder& cast,std::uint64_t castRevision,std::uint64_t combatRevision);
    void cancelFailedCast(UnitState& unit);
    void releaseCastVisuals(CastOrder& cast);
    void groundSpellsTick(double delta);
    void persistentSpellPulse(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner,float amount,bool percent,std::optional<std::uint64_t> cast={});
    bool beginSpell(std::uint32_t unit,std::uint32_t ability,std::uint32_t target,WorldPoint point,SpellTargeting targeting,bool automatic=false,std::uint32_t issuedOrder=0,std::uint32_t item=0);
    void casterEffect(const SpellMissile& missile);
    bool usefulDispel(const UnitState& caster,const UnitState& target,const SpellInfo& spell);
    void dispelSpell(std::uint32_t source,std::uint32_t target,const SpellInfo& spell,unsigned owner=UINT_MAX);
    void detonateSpell(std::uint32_t source,const SpellInfo& spell,unsigned owner);
    void autocastTick();
    bool spellRequirements(unsigned owner,const SpellInfo& spell);
    unsigned autocastTicks_=0;
    bool spellPoint(const UnitState& unit,const SpellInfo& spell,WorldPoint point);
    float spellRange(const UnitState& unit,const SpellInfo& spell,WorldPoint point,std::uint32_t target);
    std::uint32_t itemBuildingType(const UnitState& unit,const SpellInfo& spell);
    bool useSummonItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point);
    void placeItemBuilding(std::uint32_t unit,const CastOrder& cast);
    bool lureCreep(std::uint32_t unit,std::uint32_t ward);
    void releaseSpell(std::uint32_t unit,const CastOrder& cast,unsigned owner);
    void areaSpell(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    void areaSpellsTick(double delta);
    std::vector<std::uint32_t> spellTargets(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    std::vector<std::uint32_t> spellTrees(const SpellInfo& spell,WorldPoint point);
    std::optional<WorldPoint> summonPoint(WorldPoint point,std::uint32_t type,float minimum=0);
    void summonSpell(std::uint32_t unit,const SpellInfo& spell,WorldPoint point,unsigned owner);
    void bindSpellNatives();
    void bindEffectNatives();
    void bindTrackableNatives();
    std::map<std::uint32_t,std::shared_ptr<ScriptTrackable>> trackables_;
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
    std::map<std::uint32_t,std::shared_ptr<ScriptImage>> images_;
    std::map<std::uint32_t,std::shared_ptr<ScriptUbersplat>> ubersplats_;
    std::map<std::string,UbersplatInfo> ubersplatInfo_;
    void ubersplatTick(double delta);
    jass::Value createEffect(const std::string& model,WorldPoint point,std::uint32_t target=0,const std::string& attachment={},bool automatic=false);
    void destroyEffect(std::uint32_t id);
    void effectsTick();
    std::vector<std::uint32_t> spellVisual(const SpellInfo& spell,const char* field,std::uint32_t target,WorldPoint point,bool automatic=true);
    void releaseBuff(UnitBuff& buff);
    void selfSpellInfo(SpellInfo& spell);
    bool selfSpellActive(const UnitState& unit,const SpellInfo& spell) const;
    void prepareSelfSpell(const UnitState& unit,SpellInfo& spell);
    bool selfSpellReady(const UnitState& unit,const SpellInfo& spell) const;
    void selfSpellEffect(std::uint32_t unit,const SpellInfo& spell,bool ownedAbility=true);
    void selfSpellsTick(double delta);
    std::set<std::uint32_t> selfSpellActors_;
    bool defendProjectile(const CombatProjectile& projectile);
    bool instantSelfSpell(std::uint32_t unit,const SpellInfo& spell);
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
    unsigned playerRace(unsigned id);
    SessionStart& start(std::uint32_t index);
    void destroy(jass::Value handle,NativeKind kind);
    void bind(const char* name,const char* result,std::initializer_list<const char*> parameters,jass::Runtime::Native native);
    void bindNatives();
    void bindWorldNatives();
    void bindCameraSetupNatives();
    void bindSoundNatives();
    void bindMusicNatives();
    void bindEntityNatives();
    void bindOrderNatives();
    void bindVisualNatives();
    void bindSpatialEvents();
    void bindInventoryNatives();
    void bindFogNatives();
    void bindTextNatives();
    void bindTextTagNatives();
    void textTagsTick(double delta);
    void bindIndicatorNatives();
    void bindCacheNatives();
    void bindCampaignNatives();
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
    bool reviveHero(std::uint32_t hero,WorldPoint point,bool visual,int reserved=0,bool awaken=false);
    ProductInfo awakenInfo(std::uint32_t hero);
    bool awakenAllowed(std::uint32_t building,unsigned player,std::uint32_t hero,std::string& reason,bool paid=false);
    void awakenButtons(std::uint32_t building,unsigned player,std::array<bool,12>& occupied,std::vector<CommandButton>& buttons);
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
    float handicapBaseLife(std::uint32_t type,jass::Real handicap);
    void adjustUnitHandicap(UnitState& unit,jass::Real previous,jass::Real next);
    bool upgradeAllowed(const UnitState& unit,const ProductInfo& product,std::string& reason);
    void buildingUpgrades(double delta);
    void finishBuildingUpgrade(std::uint32_t unit);
    void repairTick(double delta);
    std::pair<std::uint32_t,unsigned> repairAbility(const UnitState& unit);
    double humanConstruction(std::uint32_t building,double delta);
    bool payWork(std::uint32_t worker,double gold,double lumber);
    bool repairTarget(const UnitState& worker,const UnitState& target,std::uint32_t ability,unsigned level);
    struct ItemBlightGrowth {WorldPoint point;float radius=0,maximum=0,step=0;double due=0,interval=0;bool add=false;};
    std::vector<ItemBlightGrowth> itemBlightGrowth_;
    size_t itemBlightReservations_=0;
    bool reserveItemBlight();
    void releaseItemBlightReservation();
    bool startItemBlight(std::uint32_t ability,WorldPoint point);
    void itemBlightTick();
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
    void walkableSurfaceIndex(const DestructableState& destructable,bool add);
    const std::shared_ptr<WalkableGeometry>& walkableModel(const std::string& path);
    void destructableLife(std::uint32_t id,float value,ScriptContext context={});
    void widgetDeath(std::uint32_t id,ScriptContext context={});
    std::uint32_t nearestTree(WorldPoint point,float range,std::uint32_t exclude=0);
    std::pair<std::uint32_t,unsigned> sourceAbility(const UnitState& unit,const char* code);
    void initializeHarvest(UnitState& unit);
    void cancelGather(UnitState& unit);
    bool unloadMinePassenger(std::uint32_t mine,std::uint32_t worker,WorldPoint point);
    void harvestTick(double delta);
    bool harvestTree(std::uint32_t unit,std::uint32_t tree);
    void lumberTick(std::uint32_t unit);
    bool acceptsResource(const UnitState& depot,unsigned resource);
    std::uint32_t resourceDepot(const UnitState& unit,unsigned resource);
    void creditResource(unsigned owner,unsigned resource,int amount);
    unsigned researchLevel(unsigned owner,std::uint32_t type) const;
    void setResearch(unsigned owner,std::uint32_t type,int level);
    void refreshResearch(UnitState& unit);
    unsigned defenseType(const UnitState& unit);
    bool researchAllowed(const UnitState& unit,const ResearchInfo& info,std::string& reason);
    WeaponDefinition unitWeapon(const UnitState& unit,unsigned slot);
    const std::array<WeaponDefinition,2>& weapons(std::uint32_t type);
    bool capability(const UnitState& unit,const char* code);
    bool weaponEnabled(const UnitState& unit,unsigned slot);
    bool enemy(unsigned owner,unsigned other) const;
    bool weaponTarget(const UnitState& source,const UnitState& target,const WeaponDefinition& weapon,bool automatic=false,bool splash=false,bool committed=false);
    std::optional<unsigned> weaponFor(const UnitState& source,const UnitState& target,bool automatic=false);
    bool cancelCombat(UnitState& unit);
    bool chase(UnitState& unit,WorldPoint target,float standoff);
    void combat(double delta);
    void launchAttack(std::uint32_t source,std::uint32_t target,unsigned weapon,float stealthDamage=0,bool backstab=false,std::uint32_t ability=0);
    void projectiles(double delta);
    void impact(const CombatProjectile& projectile);
    void awardExperience(std::uint32_t killer,const UnitState& victim);
    void timedLives(double delta);
    void regenerate(double delta);
    std::vector<std::uint32_t> illusions(std::uint32_t caster,std::uint32_t original,unsigned count,float dealt,float taken,double duration,std::uint32_t buff,std::uint32_t ability=0);
    void removeItem(std::uint32_t item);
    void refreshUpkeep(unsigned owner);
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
    bool inventoryFlag(const UnitState& unit,const char* field);
    const std::vector<std::uint32_t>& itemAbilities(std::uint32_t type);
    std::vector<std::uint32_t> itemActiveAbilities(std::uint32_t type);
    const EquipmentBonuses* equipmentInfo(std::uint32_t ability,unsigned level);
    void refreshEquipment(UnitState& unit);
    void captureSoul(std::uint32_t caster,const CastOrder& cast);
    void releaseSoul(std::uint32_t caster);
    void permanentItem(std::uint32_t unit,std::uint32_t ability);
    std::map<std::pair<std::uint32_t,unsigned>,std::optional<EquipmentBonuses>> equipmentInfo_;
    const ConsumableInfo* consumableInfo(std::uint32_t ability);
    bool useConsumable(std::uint32_t unit,std::uint32_t item,std::uint32_t target,std::optional<WorldPoint> point,const ConsumableInfo& info);
    std::map<std::uint32_t,std::optional<ConsumableInfo>> consumableInfo_;
    bool giveItem(std::uint32_t unit,std::uint32_t item,std::optional<unsigned> slot={});
    bool itemMoveTick(UnitState& unit);
    bool itemApproach(UnitState& unit,WorldPoint destination,float reach);
    bool issueItemMove(unsigned player,std::uint32_t unit,std::uint32_t item,ItemMoveOrder::Kind kind,WorldPoint point,std::uint32_t target,unsigned slot);
    void spatialEvents();
    void moveUnits(double delta);
    void waygateTick();
    bool enterWaygate(std::uint32_t source,std::uint32_t gate,std::uint32_t order);
    void bindWaygateNatives();
    void playerOrderQueueTick();
    void bindWeatherNatives();
    void bindCallbackNatives();
    void bindCollectionNatives();
    void bindGameNatives();
    void bindDialogNatives();
    void bindLeaderboardNatives();
    void bindMultiboardNatives();
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
    void bindRescueNatives();
    void rescueTick();
    float turnUnit(UnitState& unit,float target,double delta);
    void unitLife(jass::Value handle,jass::Real value,std::uint32_t killer=0,bool bounty=true);
    void observeUnitStates(std::uint32_t handle);
    void observeUnitStatesTick();
    void playerChange(unsigned player,std::uint32_t field,int before,int after,bool alliance);
    void tick(double delta);
    void clockChange(jass::Real before,jass::Real after,bool cyclic);
    void setIntegerGameState(unsigned state,std::int32_t value);
    std::uint32_t random();
    void seedAuxiliaryRandom(std::uint32_t seed);
    ObjectData& definitions();
    UnitState& unit(jass::Value value);
    ItemState& item(jass::Value value);
    jass::Value createUnit(std::uint32_t owner,std::uint32_t type,jass::Real x,jass::Real y,jass::Real facing,int reservedFood=0,const UnitState* illusionSource=nullptr,bool completed=true);
    jass::Value createItem(std::uint32_t type,jass::Real x,jass::Real y);
    SoundScene& requireAudio();
    MusicScene& requireMusic();
    MusicScene& requireThematicMusic();
    World& requireWorld();
public:
    std::string unitUiField(std::uint32_t type,const char* field) {return definitions().field(type,"UnitUI",field);}
    float unitUiNumber(std::uint32_t type,const char* field) {return definitions().number(type,"UnitUI",field);}
    std::string buffProfile(std::uint32_t id,const char* key) {return mapString(definitions().field(id,"Profile",key),strings_);}
    bool corpseAvailable(std::uint32_t corpse,std::uint32_t claimant=0);
    bool corpseCarrier(std::uint32_t transport);
    unsigned cargoCapacity(std::uint32_t transport);
    unsigned cargoUsed(std::uint32_t transport);
    unsigned cargoCost(std::uint32_t passenger);
    unsigned mineCargoCapacity(std::uint32_t mine);
    std::vector<std::uint32_t> mineCargoPassengers(std::uint32_t mine);
    bool unloadMineWorker(std::uint32_t mine,std::uint32_t worker);
    bool boardUnit(std::uint32_t passenger,std::uint32_t transport,std::uint32_t order=851971);
    bool unloadUnit(std::uint32_t transport,std::uint32_t passenger);
    bool unloadAll(std::uint32_t transport,WorldPoint point);
    ScriptSession(jass::Module module,const MapInfo& info,MapStrings strings={},std::optional<unsigned> gameType={},std::optional<std::uint32_t> initialRandomSeed={});
    ~ScriptSession();
    void initialize();
    void configure();
    void applySetup(const PlayerSetup& setup);
    void applyLanSetup(const LanSessionSetup& setup);
    std::optional<unsigned> networkPlayer(std::uint8_t peerId) const;
    bool networkPeerActive(std::uint8_t peerId) const;
    bool networkPeerDeparted(std::uint8_t peerId);
    std::optional<unsigned> networkSlotPlayer(unsigned slot) const;
    std::optional<unsigned> networkPlayerSlot(unsigned player) const;
    bool selectionSyncFirst() const {return !selectionSyncOutgoing_.empty() && (cacheSyncOutgoing_.empty() || selectionSyncOutgoing_.front().first<cacheSyncOutgoing_.front().first);}
    const LanActionExperimentalSelection* pendingSelectionSync() const;
    void popSelectionSync();
    void discardSelectionSyncOutgoing();
    bool unfinishedSelectionSync() const;
    void receiveSelectionSync(std::uint8_t peer,const LanActionExperimentalSelection& part);
    bool validateSelectionSync(std::uint8_t peer,const LanActionExperimentalSelection& part,LanSelectionSyncProjection& projection) const;
    void attachWorld(std::unique_ptr<World> world);
    const World* world() const {return world_.get();}
    World* world() {return world_.get();}
    bool unitSelectable(std::uint32_t handle);
    std::optional<UnitCombatDisplay> unitCombatDisplay(std::uint32_t handle);
    void clearPlayerOrders(std::uint32_t handle);
    bool queuePlayerOrder(std::uint32_t handle,const PlayerCommand& command);
    bool idleWorker(std::uint32_t handle,unsigned player);
    void selectUnit(std::uint32_t handle,bool selected);
    bool setPlayerUnitSelected(unsigned player,std::uint32_t handle,bool selected);
    std::set<std::uint32_t> playerSelection(unsigned player);
    bool moveUnit(std::uint32_t handle,WorldPoint target,std::uint32_t order=851986,std::optional<WorldPoint> destination={});
    bool stopUnit(std::uint32_t handle,bool hold=false);
    bool targetOrder(std::uint32_t source,std::uint32_t target,std::uint32_t order=851971);
    std::optional<unsigned> groundAttackWeapon(const UnitState& source);
    bool attackGround(std::uint32_t source,WorldPoint point);
    void combatAttackGround(std::uint32_t source,double delta);
    void launchGroundAttack(std::uint32_t source,WorldPoint point,unsigned slot);
    bool attackWidget(std::uint32_t source,std::uint32_t target);
    std::vector<std::uint32_t> nearbyWeaponDestructables(WorldPoint point,float radius);
    bool destructableWeaponTarget(const DestructableState& target,const WeaponDefinition& weapon,bool splash=false);
    bool itemWeaponTarget(const ItemState& target,const WeaponDefinition& weapon,bool splash=false);
    std::optional<WidgetAttackTarget> widgetAttackTarget(std::uint32_t target) const;
    std::optional<unsigned> widgetWeapon(const UnitState& source,std::uint32_t target);
    void combatWidget(std::uint32_t source,double delta);
    void launchWidgetAttack(std::uint32_t source,std::uint32_t target,unsigned slot);
    bool attackUnit(std::uint32_t source,std::uint32_t target,bool forced=true,std::uint32_t ability=0);
    bool attackMove(std::uint32_t source,WorldPoint target,bool patrol=false,std::optional<WorldPoint> destination={});
    bool hasWeapon(std::uint32_t unit);
    const SpellInfo& spellInfo(std::uint32_t ability,unsigned level);
    SpellTargeting spellTargeting(const UnitState& unit,const SpellInfo& spell) const {return spell.kind==SpellKind::Root && (!unit.roots || !unit.roots->uprooted)?SpellTargeting::None:spell.targeting;}
    std::optional<WorldPoint> rootSite(std::uint32_t unit,WorldPoint point,std::string& reason,WorldPoint* preview=nullptr);
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
    std::vector<CommandButton> abilityCommands(std::uint32_t unit,unsigned player,bool learning=false,std::uint32_t book=0);
    std::vector<std::uint32_t> spellBookContents(const UnitState& unit,std::uint32_t book) const;
    bool spellBookReady(const UnitState& unit,std::uint32_t book);
    bool openSpellBook(std::uint32_t unit,std::uint32_t book);
    std::optional<std::pair<std::uint32_t,std::uint32_t>> takeSpellBookRequest(){auto value=requestedBook_;requestedBook_.reset();return value;}
    std::optional<unsigned> takeForcedUIKey(){if(forcedUIKeys_.empty())return {};auto key=forcedUIKeys_.front();forcedUIKeys_.pop_front();return key;}
    const auto& spellMissiles() const {return spellMissiles_;}
    const auto& spellWaves() const {return spellWaves_;}
    const auto& groundSpells() const {return groundSpells_;}
    const auto& effects() const {return effects_;}
    const auto& trackables() const {return trackables_;}
    void trackableEvent(std::uint32_t id,bool hit);
    const auto& images() const {return images_;}
    const auto& lightnings() const {return lightnings_;}
    void effectExpires(std::uint32_t id,double time);
    const auto& projectiles() const {return projectiles_;}
    const auto& destructables() const {return destructables_;}
    const auto& weatherEffects() const {return weatherEffects_;}
    bool validateCacheSync(const LanActionCacheSync& action,LanCacheSyncProjection& projection);
    bool applyCacheSync(const LanActionCacheSync& action);
    const LanActionCacheSync* pendingCacheSync() const {return cacheSyncOutgoing_.empty()?nullptr:&cacheSyncOutgoing_.front().second;}
    void popCacheSync();
    void discardCacheSyncOutgoing();
    float destructableHeight(const DestructableState& state) const;
    size_t prepareWalkableSurfaces(const std::function<void()>& checkpoint={},const std::function<void(const std::string&)>& onError={});
    std::optional<float> walkableSurface(WorldPoint point,std::uint32_t exclude=0);
    float surfaceHeight(WorldPoint point,std::uint32_t exclude=0);
    std::uint64_t destructableRevision() const {return destructableRevision_;}
    std::uint32_t placedDestructable(size_t index) const {return index<placedDestructables_.size()?placedDestructables_[index]:0;}
    const DoodadState* doodad(size_t index) const {return index<doodads_.size() && doodads_[index].active?&doodads_[index]:nullptr;}
    const WeaponDefinition& projectileWeapon(const CombatProjectile& projectile) const {return projectile.definition;}
    void dropItem(std::uint32_t unit,std::uint32_t item,std::optional<WorldPoint> point={});
    bool orderItemDrop(unsigned player,std::uint32_t unit,std::uint32_t item,WorldPoint point);
    bool orderItemGive(unsigned player,std::uint32_t unit,std::uint32_t item,std::uint32_t target);
    bool orderItemSlot(unsigned player,std::uint32_t unit,std::uint32_t item,unsigned slot);
    bool itemNeedsTarget(std::uint32_t item);
    bool itemTargetsTrees(std::uint32_t item);
    double itemCooldown(std::uint32_t unit,std::uint32_t item);
    bool useItem(std::uint32_t unit,std::uint32_t item,std::uint32_t target=0);
    bool useItemAt(std::uint32_t unit,std::uint32_t item,WorldPoint point);
    bool itemNeedsPoint(std::uint32_t item);
    std::uint32_t itemBuilding(std::uint32_t unit,std::uint32_t item);
    bool mechanicalDisguised(const UnitState& unit,unsigned viewer) const;
    bool damageUnit(std::uint32_t source,std::uint32_t target,float amount,unsigned attackType,unsigned damageType,bool attack=false,bool ranged=false,float* dealt=nullptr,bool deflected=false,bool useEtherealBonus=true,std::optional<unsigned> orphanOwner={},bool redistributed=false,bool diseaseAura=false,bool nonlethal=false);
    const ProductInfo& product(std::uint32_t type,bool item=false);
    const ResearchInfo& researchInfo(std::uint32_t type,unsigned level);
    bool research(std::uint32_t unit,std::uint32_t type);
    std::optional<WorldPoint> buildSite(std::uint32_t worker,std::uint32_t type,WorldPoint point,std::string& reason,std::uint32_t* base=nullptr,WorldPoint* preview=nullptr,bool itemBuild=false);
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
    bool neutralRevealAvailable(std::uint32_t shop,unsigned player,std::uint32_t ability,std::string* reason=nullptr);
    bool neutralReveal(std::uint32_t shop,unsigned player,std::uint32_t ability,WorldPoint point);
    ProductInfo revivalInfo(std::uint32_t hero);
    bool queueRevival(std::uint32_t building,std::uint32_t hero);
    bool awakenHero(std::uint32_t building,unsigned player,std::uint32_t hero);
    bool train(std::uint32_t unit,std::uint32_t type);
    bool cancelProduction(std::uint32_t unit,size_t index=0,bool refund=true);
    bool setRally(std::uint32_t unit,WorldPoint point,std::uint32_t target=0);
    void chat(unsigned player,const std::string& message,ChatChannel channel=ChatChannel::All,std::optional<unsigned> recipient={});
    const FogGrid& fog(unsigned player);
    bool unitInvisible(std::uint32_t unit);
    bool unitDetected(std::uint32_t unit,unsigned player);
    bool unitInvisibleTo(std::uint32_t unit,unsigned player);
    bool unitVisibleTo(std::uint32_t unit,unsigned player);
    const std::vector<ScriptText>& texts() const {return texts_;}
    const auto& textTags() const {return textTags_;}
    const std::vector<ScriptMinimapPing>& minimapPings() const {return minimapPings_;}
    const auto& quests() const {return quests_;}
    std::uint64_t questRevision() const {return questRevision_;}
    bool questFlash() const {return questFlash_;}
    void acknowledgeQuests() {questFlash_=false;}
    void displayText(unsigned owner,float x,float y,double duration,std::string text);
    void startAI(unsigned player,const std::string& script,bool campaign=false);
    const auto& ais() const {return ais_;}
    void startMain();
    void finishGame(bool scores,SessionExit action=SessionExit::Return);
    bool networkLocalEndPending() const{return networkLocalEndRequest_.has_value();}
    std::optional<bool> takeNetworkLocalEnd(){auto request=networkLocalEndRequest_;networkLocalEndRequest_.reset();return request;}
    void campaignContext(bool expansion,unsigned difficulty) {if(mainAttempted_ || difficulty>2)throw std::runtime_error("Invalid campaign session context");campaignExpansion_=expansion;gameDifficulty_=defaultDifficulty_=difficulty;}
    void versionContext(unsigned version) {if(version>1 || runtime_.ready() || failed_ || world_)throw std::runtime_error("Game version requires a fresh session");version_=version;versionSelected_=true;}
    const std::string& nextLevel() const {return nextLevel_;}
    std::optional<std::pair<std::string,bool>> takeCinematic(){if(!modelCinematic_.empty()){auto value=std::move(modelCinematic_);modelCinematic_.clear();return std::pair{std::move(value),true};}if(!movieCinematic_.empty()){auto value=std::move(movieCinematic_);movieCinematic_.clear();return std::pair{std::move(value),false};}return {};}
    bool forceCampaignSelection() const {return forceCampaignSelect_;}
    void removePlayer(unsigned owner,unsigned result);
    int reservedLocalHeroButtons() const {return reservedLocalHeroButtons_;}
    bool canControlUnit(unsigned viewer,const UnitState& unit) const;
    bool canManageUnitInventory(unsigned viewer,const UnitState& unit) const;
    unsigned inventorySize(const UnitState& unit);
    bool setAlliedVictory(unsigned owner,bool enabled);
    bool setAllianceOption(unsigned from,unsigned to,unsigned option,bool enabled);
    bool setAllianceSnapshot(unsigned from,unsigned to,unsigned flags,bool victory);
    bool transferResources(unsigned from,unsigned to,int gold,int lumber);
    void leaveGame();
    bool endCinematic(unsigned owner);
    std::uint32_t indicatorColor(std::uint32_t id,std::uint32_t base) const {return indicators_.color(id,base,simulationTime_);}
    bool clickDialog(unsigned owner,std::uint32_t button,bool requireVisible=true,std::uint64_t clickedGeneration=0,bool finishOnQuit=true);
    std::optional<std::uint32_t> dialogNetworkFingerprint(std::uint32_t button) const;
    void pause(bool value) {simulationPaused_=value;}
    unsigned gameSpeed() const {return gameSpeed_;}
    void gameSpeed(unsigned value) {if(value>4)throw std::runtime_error("Unknown game speed");gameSpeed_=value;}
    double gameSpeedFactor() const {constexpr double factors[]={.5,.75,1.,1.25,1.5};return factors[gameSpeed_];}
    bool paused() const {return simulationPaused_;}
    bool userControl() const {return userControl_;}
    bool userUI() const {return userUI_;}
    bool occlusionEnabled() const {return occlusionEnabled_;}
    const ScriptCineFilter& cineFilter() const {return cineFilter_;}
    bool forceCinematicSubtitles() const {return forceCinematicSubtitles_;}
    float interfaceAmount() const {auto progress=interfaceDuration_>0?float(std::clamp((simulationTime_-interfaceChanged_)/interfaceDuration_,0.,1.)):1.f;return std::lerp(interfaceFrom_,interfaceVisible_?1.f:0.f,progress);}
    bool interfaceVisible() const {return interfaceAmount()>.5f;}
    const std::optional<ScriptCinematicScene>& cinematicScene() const {return cinematicScene_;}
    CameraControl& cameraControl() {return cameraControl_;}
    bool selectionEnabled() const {return selectionEnabled_;}
    bool selectionUI() const {return selectionUI_;}
    bool dragSelectionEnabled() const {return dragSelectionEnabled_;}
    bool dragSelectionUI() const {return dragSelectionUI_;}
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
    std::vector<std::uint8_t> encodePlayerStates() const;
    void restorePlayerStates(std::span<const std::uint8_t> bytes);
    std::vector<std::uint8_t> encodeRandomState() const;
    void restoreRandomState(std::span<const std::uint8_t> bytes);
    double simulationTime() const {return simulationTime_;}
    double presentationTime() const {return simulationTime_+accumulator_;}
    void audioMuted(bool muted);
    void localAudioGains(float sound,float music);
    void localAudioCategories(bool ambient,bool movement,bool units);
    void audioSimulationClock() {if(audio_)throw std::runtime_error("Audio simulation clock must be set before audio initialization");audioSimulationClock_=true;}
    void updateAudio();
    void updateAudioListener(float x,float y,float z,std::array<float,3> right);
    bool animationSound(const std::string& code,const std::array<float,3>& position);
    std::vector<PresentationSpellSound> takeSpellSounds();
    void playSpellSound(const PresentationSpellSound& sound);
    std::shared_ptr<ScriptSound> startSpellLoop(std::uint32_t unit,const SpellInfo& spell);
    void stopSpellLoop(const std::shared_ptr<ScriptSound>& sound);
    const SoundScene* audio() const {return audio_.get();}
    const MusicScene* music() const {return music_.get();}
    const ScriptLeaderboard* leaderboard(unsigned player) const;
    const std::map<std::uint32_t,std::shared_ptr<ScriptMultiboard>>& multiboards() const {return multiboards_;}
    bool multiboardsSuppressed() const {return multiboardsSuppressed_;}
    void toggleMultiboard(std::uint32_t id);
    std::optional<unsigned> localPlayer() const {return localPlayer_;}
    bool configured() const {return configured_ && !failed_;}
    bool initialized() const {return runtime_.ready() && !failed_;}
    const SessionConfig& config() const {return config_;}
    std::optional<std::pair<std::uint32_t,std::uint32_t>> localNetworkObject(std::uint32_t handle) const;
    std::optional<std::uint32_t> localNetworkObject(std::uint32_t ordinal,std::uint32_t type) const;
    bool localNetworkObjectRemoved(std::uint32_t ordinal,std::uint32_t type) const;
    std::uint32_t localNetworkChecksum() const;
    jass::Runtime& runtime() {return runtime_;}
    const jass::Runtime& runtime() const {return runtime_;}
    size_t liveObjects(NativeKind kind) const;
    const std::map<std::uint32_t,std::shared_ptr<UnitState>>& units() const {return units_;}
    const std::map<std::uint32_t,std::shared_ptr<ItemState>>& items() const {return items_;}
    const std::vector<std::string>& preloadMissing() const {return preloadMissing_;}
    const std::map<std::uint32_t,std::shared_ptr<ScriptTimerDialog>>& timerDialogs() const {return timerDialogs_;}
    double timerDialogRemaining(const ScriptTimerDialog& dialog) const;
};
}
