// Author: MiYu. Protected component bundle for staged session recovery; continuation remains disabled.
#include "session.h"
#include "snapshot_codec.h"
#include <algorithm>
#include <array>
#include <map>
#include <set>

namespace war3 {
namespace {
constexpr size_t recoveryBudget=256u*1024u*1024u;
constexpr std::array recoveryNames{"UnitIdentities","UnitCore","Waygates","Militia","UnitForms","TreeActions","RevealState","Selection","UnitStealth","FutureMovementPhase","Ambient","Corpses","Construction","Harvest","Cargo","Production","UnitSummons","ShopStock","UnitVisuals","UnitMovement","UnitAnimations","UnitCooldowns","UnitCombatOrders","QueuedPlayerOrders","UnitBuffs","UnitAuras","UnitCasts","SpellMissiles","AttackProjectiles","AbilityIdentities","Items","Destructables","Effects","Lightnings","Quests","Booleans","Triggers","TimerEvents","WidgetDeathEvents","ActorEvents","GameEvents","SpatialEvents","CameraState","Collections","Sounds","Timers","TimerDialogs","FogState","GameCaches","Hashtables","SimulationClock","PlayerConfiguration","PlayerStates","PlayerStatistics","PlayerTechnology","RandomState","RandomPools","Globals","AIStates","SleepingScripts","Terrain","Pathing","Blight"};
}
Bytes ScriptSession::encodeRecoveryBundle() const {
    if(!mainAttempted_ || failed_ || !world_ || !setupApplied_)throw std::runtime_error("Recovery bundle requires a started local session");auto identity=[](std::string_view,std::uint32_t id){return id;};std::map<std::string,Bytes> data;
    data["UnitIdentities"]=this->encodeUnitIdentities(identity);
    data["UnitCore"]=this->encodeUnitCore(identity);
    data["RevealState"]=this->encodeRevealState(identity);
    data["TreeActions"]=this->encodeTreeActions(identity);
    data["UnitForms"]=this->encodeUnitForms(identity);
    data["Militia"]=this->encodeMilitia(identity);
    data["Waygates"]=this->encodeWaygates(identity);
    data["Selection"]=this->encodeSelection(identity);
    data["UnitStealth"]=this->encodeUnitStealth(identity);
    data["FutureMovementPhase"]=this->encodeFutureMovementPhase();
    data["Ambient"]=this->encodeAmbientPassives(identity);
    data["Corpses"]=this->encodeCorpses(identity);
    data["Construction"]=this->encodeConstruction(identity);
    data["Harvest"]=this->encodeHarvest(identity);
    data["Cargo"]=this->encodeCargo(identity);
    data["Production"]=this->encodeProduction(identity);
    data["UnitSummons"]=this->encodeUnitSummons(identity);
    data["ShopStock"]=this->encodeShopStock(identity);
    data["UnitVisuals"]=this->encodeUnitVisuals(identity);
    data["UnitMovement"]=this->encodeUnitMovement(identity);
    data["UnitAnimations"]=this->encodeUnitAnimations(identity);
    data["UnitCooldowns"]=this->encodeUnitCooldowns(identity);
    data["UnitCombatOrders"]=this->encodeUnitCombatOrders(identity);
    data["QueuedPlayerOrders"]=this->encodeQueuedPlayerOrders(identity);
    data["UnitBuffs"]=this->encodeUnitBuffs(identity);
    data["UnitAuras"]=this->encodeUnitAuras(identity);
    data["UnitCasts"]=this->encodeUnitCasts(identity);
    data["SpellMissiles"]=this->encodeSpellMissiles(identity);
    data["AttackProjectiles"]=this->encodeAttackProjectiles(identity);
    data["AbilityIdentities"]=this->encodeAbilityIdentities(identity);
    data["Items"]=this->encodeItems(identity);
    data["Destructables"]=this->encodeDestructables(identity);
    data["Effects"]=this->encodeEffects(identity);
    data["Lightnings"]=this->encodeLightnings(identity);
    data["Quests"]=this->encodeQuests(identity);
    data["Booleans"]=this->encodeBooleanExpressions(identity);
    data["Triggers"]=this->encodeTriggers(identity);
    data["TimerEvents"]=this->encodeTimerEvents(identity);
    data["WidgetDeathEvents"]=this->encodeWidgetDeathEvents(identity);
    data["ActorEvents"]=this->encodeActorEvents(identity);
    data["GameEvents"]=this->encodeGameEvents(identity);
    data["SpatialEvents"]=this->encodeSpatialEvents(identity);
    data["CameraState"]=this->encodeCameraState(identity);
    data["Collections"]=this->encodeCollections(identity);
    data["Sounds"]=this->encodeSounds(identity);
    data["Timers"]=this->encodeTimers(identity);
    data["TimerDialogs"]=this->encodeTimerDialogs(identity);
    data["FogState"]=this->encodeFogState(identity);
    data["GameCaches"]=this->encodeGameCaches(identity);
    data["Hashtables"]=this->encodeHashtables(identity);
    data["SimulationClock"]=this->encodeSimulationClock();
    data["PlayerConfiguration"]=this->encodePlayerConfiguration();
    data["PlayerStates"]=this->encodePlayerStates();
    data["PlayerStatistics"]=this->encodePlayerStatistics();
    data["PlayerTechnology"]=this->encodePlayerTechnology();
    data["RandomState"]=this->encodeRandomState();
    data["RandomPools"]=this->encodeRandomPools(identity);
    data["Globals"]=this->runtime().encodeGlobals(identity);
    constexpr size_t aiBudget=128u*1024u*1024u;SnapshotWriter aiOut(aiBudget-64);aiOut.u32(tag("SAIL"));aiOut.u32(1);if(aiRuntimeOrder_.size()>12)throw std::runtime_error("AI recovery count exceeds budget");aiOut.size(aiRuntimeOrder_.size());std::set<unsigned> aiOwners;std::vector<jass::Runtime*> runtimes{const_cast<jass::Runtime*>(&runtime_)};for(auto owner:aiRuntimeOrder_){if(owner>=12 || !aiOwners.insert(owner).second || !ais_[owner] || ais_[owner]->owner!=owner || ais_[owner]->runtime->threadsPaused()!=(aiPauseDepth_[owner]!=0))throw std::runtime_error("Invalid AI recovery order or pause state");auto& ai=*ais_[owner];auto globals=ai.runtime->encodeGlobals(identity),state=encodeAIState(owner,identity);aiOut.u32(owner);aiOut.u32(ai.campaign);aiOut.text(ai.file,65536);aiOut.size(globals.size());aiOut.raw(globals);aiOut.size(state.size());aiOut.raw(state);runtimes.push_back(ai.runtime.get());}for(unsigned owner=0;owner<ais_.size();++owner)if(bool(ais_[owner])!=aiOwners.contains(owner))throw std::runtime_error("Invalid AI recovery order");data["AIStates"]=sealSnapshot(aiOut.finish(),aiBudget);
    data["SleepingScripts"]=this->encodeSharedSleepingScripts(runtimes,this->snapshotSharedSleepingScripts(runtimes,identity));
    data["Terrain"]=this->world()->encodeTerrainState();
    data["Pathing"]=this->world()->encodePathingState();
    data["Blight"]=this->world()->encodeBlightState();
    SnapshotWriter out(recoveryBudget-64);out.u32(tag("SRBF"));out.u32(10);out.text(world_->resources().mapDigest(),64);out.u32(mainCompleted_?1:0);out.size(data.size());for(auto& [name,bytes]:data){out.text(name,64);out.size(bytes.size());out.raw(bytes);}return sealSnapshot(out.finish(),recoveryBudget);
}
std::map<std::uint32_t,std::uint32_t> ScriptSession::restoreRecoveryBundle(std::span<const std::uint8_t> bytes) {
    if(!runtime_.ready() || failed_ || !world_ || !setupApplied_ || mainAttempted_ || unitRecoveryIncomplete_ || recoveryBundleRestored_)throw std::runtime_error("Recovery bundle requires a fresh initialized local session");Binary in(openSnapshot(bytes,recoveryBudget));in.expect(tag("SRBF"));if(in.u32()!=10 || snapshotText(in,64)!=world_->resources().mapDigest())throw std::runtime_error("Recovery bundle version or map differs");auto completed=in.u32();if(completed>1)throw std::runtime_error("Invalid recovery main state");auto count=in.count(8,64);if(count!=recoveryNames.size())throw std::runtime_error("Recovery component count differs");std::map<std::string,std::span<const std::uint8_t>> data;for(unsigned i=0;i<count;++i){auto name=snapshotText(in,64);auto size=in.u32();if(size>128u*1024u*1024u || !data.emplace(name,in.take(size)).second)throw std::runtime_error("Invalid recovery component");}in.finish();for(auto name:recoveryNames)if(!data.contains(name))throw std::runtime_error("Missing recovery component");std::map<std::uint32_t,std::uint32_t> ids;auto decode=[&](std::string_view type,std::uint32_t id){if(!id || id<handleBase || (type=="player" && id<handleBase+16))return id;auto found=ids.find(id);return found==ids.end()?0u:found->second;};auto single=[&](const auto& values){for(auto [oldId,newId]:values)if(!ids.emplace(oldId,newId).second)throw std::runtime_error("Duplicate recovery handle");};auto typed=[&](const auto& values){for(auto& [key,newId]:values)if(!ids.emplace(key.second,newId).second)throw std::runtime_error("Duplicate recovery handle");};
    constexpr size_t aiBudget=128u*1024u*1024u,aiPartBudget=32u*1024u*1024u;struct SavedAI{unsigned owner;bool campaign;std::string file;std::span<const std::uint8_t> globals,state;};std::vector<SavedAI> savedAI;Binary aiIn(openSnapshot(data.at("AIStates"),aiBudget));aiIn.expect(tag("SAIL"));if(aiIn.u32()!=1)throw std::runtime_error("Unsupported AI recovery version");auto aiCount=aiIn.count(20,12);std::set<unsigned> aiOwners;for(unsigned i=0;i<aiCount;++i){auto owner=aiIn.u32(),campaign=aiIn.u32();auto file=snapshotText(aiIn,65536);auto globalsSize=aiIn.u32();if(owner>=12 || campaign>1 || file.empty() || globalsSize>aiPartBudget || !aiOwners.insert(owner).second)throw std::runtime_error("Invalid AI recovery entry");auto globals=aiIn.take(globalsSize);auto stateSize=aiIn.u32();if(stateSize>aiPartBudget)throw std::runtime_error("AI state exceeds budget");savedAI.push_back({owner,campaign!=0,std::move(file),globals,aiIn.take(stateSize)});}aiIn.finish();struct Guard{bool& failed;bool done=false;~Guard(){if(!done)failed=true;}}guard{failed_};
    this->restoreSimulationClock(data.at("SimulationClock"));
    this->restorePlayerConfiguration(data.at("PlayerConfiguration"));
    this->restorePlayerTechnology(data.at("PlayerTechnology"));
    this->restorePlayerStates(data.at("PlayerStates"));
    this->restorePlayerStatistics(data.at("PlayerStatistics"));
    this->world()->restoreTerrainState(data.at("Terrain"));
    this->world()->restorePathingState(data.at("Pathing"));
    this->world()->restoreBlightState(data.at("Blight"));
    single(this->rebuildDestructables(data.at("Destructables")));
    single(this->rebuildUnitIdentities(data.at("UnitIdentities")));
    this->prepareUnitCore(data.at("UnitCore"),decode);
    single(this->rebuildItems(data.at("Items"),decode));
    this->finishUnitCore(data.at("UnitCore"),decode);
    this->restoreCorpses(data.at("Corpses"),decode);
    this->restoreWaygates(data.at("Waygates"),decode);
    this->restoreMilitia(data.at("Militia"),decode);
    this->restoreUnitForms(data.at("UnitForms"),decode);
    this->restoreSelection(data.at("Selection"),decode);
    this->restoreUnitStealth(data.at("UnitStealth"),decode);
    this->restoreHarvest(data.at("Harvest"),decode);
    this->restoreCargo(data.at("Cargo"),decode);
    this->restoreProduction(data.at("Production"),decode);
    this->restoreConstruction(data.at("Construction"),decode);
    this->restoreUnitSummons(data.at("UnitSummons"),decode);
    this->restoreShopStock(data.at("ShopStock"),decode);
    this->restoreUnitVisuals(data.at("UnitVisuals"),decode);
    this->restoreUnitMovement(data.at("UnitMovement"),decode);
    this->restoreUnitAnimations(data.at("UnitAnimations"),decode);
    this->restoreUnitCooldowns(data.at("UnitCooldowns"),decode);
    this->restoreUnitCombatOrders(data.at("UnitCombatOrders"),decode);
    this->restoreQueuedPlayerOrders(data.at("QueuedPlayerOrders"),decode);
    single(this->rebuildAbilityIdentities(data.at("AbilityIdentities"),decode));
    single(this->rebuildEffects(data.at("Effects"),decode));
    single(this->rebuildLightnings(data.at("Lightnings"),decode));
    this->restoreUnitBuffs(data.at("UnitBuffs"),decode);
    this->restoreAmbientPassives(data.at("Ambient"),decode);
    this->restoreRevealState(data.at("RevealState"),decode);
    this->restoreTreeActions(data.at("TreeActions"),decode);
    this->restoreUnitAuras(data.at("UnitAuras"),decode);
    this->restoreUnitCasts(data.at("UnitCasts"),decode);
    this->restoreSpellMissiles(data.at("SpellMissiles"),decode);
    this->restoreAttackProjectiles(data.at("AttackProjectiles"),decode);
    single(this->rebuildGameCaches(data.at("GameCaches")));
    single(this->rebuildFogState(data.at("FogState")));
    typed(this->rebuildQuests(data.at("Quests")));
    typed(this->rebuildCollections(data.at("Collections"),decode));
    single(this->rebuildCameraState(data.at("CameraState"),decode));
    single(this->rebuildSounds(data.at("Sounds"),decode));
    single(this->rebuildTimers(data.at("Timers")));
    single(this->rebuildTimerDialogs(data.at("TimerDialogs"),decode));
    single(this->rebuildBooleanExpressions(data.at("Booleans")));
    typed(this->restoreTriggers(data.at("Triggers")));
    single(this->rebuildTimerEvents(data.at("TimerEvents"),decode));
    single(this->rebuildWidgetDeathEvents(data.at("WidgetDeathEvents"),decode));
    single(this->rebuildActorEvents(data.at("ActorEvents"),decode));
    single(this->rebuildGameEvents(data.at("GameEvents"),decode));
    single(this->rebuildSpatialEvents(data.at("SpatialEvents"),decode));
    single(this->rebuildRandomPools(data.at("RandomPools")));
    single(this->rebuildHashtables(data.at("Hashtables"),decode));
    this->restoreRandomState(data.at("RandomState"));
    this->runtime().restoreGlobals(data.at("Globals"),decode);
    std::vector<jass::Runtime*> runtimes{&runtime_};for(auto& saved:savedAI){prepareAIRecovery(saved.owner,saved.file,saved.campaign,saved.globals,decode);restoreAIState(saved.owner,saved.state,decode);runtimes.push_back(ais_[saved.owner]->runtime.get());}auto sleeping=decodeSharedSleepingScripts(runtimes,data.at("SleepingScripts"));if(sleeping.scripts.paused.size()!=runtimes.size())throw std::runtime_error("AI recovery pause count differs");for(size_t i=0;i<savedAI.size();++i)if(sleeping.scripts.paused[i+1]!=(aiPauseDepth_[savedAI[i].owner]!=0))throw std::runtime_error("AI recovery pause state differs");restoreSharedSleepingScripts(runtimes,sleeping,decode);
    this->restoreFutureMovementPhase(data.at("FutureMovementPhase"));
    recoverySourceMainCompleted_=completed!=0;recoveryBundleRestored_=true;guard.done=true;return ids;
}
}
