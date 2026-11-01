// Author: MiYu. Source clock rules, native session state and original assignment fixtures.
#include "session.h"
#include "setup.h"
#include "snapshot_codec.h"
#include <StormLib.h>
#include <bit>
#include <cmath>
#include <functional>
#include <iostream>

using namespace war3;
using namespace war3::jass;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
template<class F> void rejects(F run,const char* message) {try{run();}catch(const std::exception& e){require(std::string(e.what()).find(message)!=std::string::npos,"Unexpected clock diagnostic");return;}throw std::runtime_error("Invalid clock operation accepted");}
Real real(float value) {return Real::fromBits(std::bit_cast<std::uint32_t>(value));}
void mpq(const fs::path& path,const std::string& name,const std::string& value) {
    HANDLE archive=nullptr;require(SFileCreateArchive(path.c_str(),MPQ_CREATE_ARCHIVE_V1,16,&archive),"Cannot create clock archive");struct Close {HANDLE value;~Close(){SFileCloseArchive(value);}}close{archive};HANDLE member=nullptr;require(SFileCreateFile(archive,name.c_str(),0,DWORD(value.size()),0,MPQ_FILE_COMPRESS,&member),"Cannot create clock member");bool written=SFileWriteFile(member,value.data(),DWORD(value.size()),MPQ_COMPRESSION_ZLIB),finished=SFileFinishFile(member);require(written && finished,"Cannot write clock member");
}
MapData map() {MapData data;data.info.players={{0,1,0,0,"Local",{},0,0}};data.terrain.width=data.terrain.height=2;data.terrain.corners.resize(4);return data;}
Archives* testArchives=nullptr;
std::unique_ptr<World> world() {return World::read(*testArchives);}
const std::string api=R"jass(type destructable extends handle
type fgamestate extends handle
native ConvertFGameState takes integer value returns fgamestate
constant native GetFloatGameState takes fgamestate state returns real
native SetFloatGameState takes fgamestate state, real value returns nothing
native GetTimeOfDayScale takes nothing returns real
native SetTimeOfDayScale takes real value returns nothing
native SuspendTimeOfDay takes boolean value returns nothing
globals
real initial=GetFloatGameState(ConvertFGameState(2))
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
call SetFloatGameState(ConvertFGameState(2),8.0)
call SetTimeOfDayScale(2.0)
call SuspendTimeOfDay(true)
endfunction
)jass";
Module compile() {return Module::compile(Program::parse({{"clock.j",api,"authored clock integration"}}));}
Value call(ScriptSession& session,const char* name,std::initializer_list<Value> args={}) {return session.runtime().invoke(name,std::span<const Value>(args.begin(),args.size()));}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=3){std::cerr<<"Usage: war3_clock_tests <data-root> <output-root>\n";return 2;}Archives fixtureArchives(argv[1]);fixtureArchives.mountMap(fs::path(argv[1])/L"Maps/(2)BootyBay.w3m");testArchives=&fixtureArchives;unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};auto output=fs::absolute(argv[2]);fs::create_directories(output);
    test("unit_core_restores_hero_abilities_equipment_and_vitals",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type item extends widget
 type player extends handle
 type ability extends handle
 type effect extends handle
 type sound extends handle
 type unitstate extends handle
 type location extends handle
 native Player takes integer id returns player
 native Location takes real x, real y returns location
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native CreateItem takes integer id, real x, real y returns item
 native UnitAddItem takes unit u, item i returns boolean
 native UnitAddAbility takes unit u, integer ability returns boolean
 native SetHeroLevel takes unit u, integer level, boolean showEyeCandy returns nothing
 native SetHeroStr takes unit u, integer value, boolean permanent returns nothing
 native SetUnitState takes unit u, unitstate state, real value returns nothing
 native SetUnitFacingTimed takes unit u, real facing, real duration returns nothing
 globals
 unit hero=null
 unit other=null
 item book=null
 item claw=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set hero=CreateUnit(Player(0),'Hpal',0.,0.,270.)
 set other=CreateUnit(Player(0),'Hpal',128.,0.,270.)
 call SetHeroLevel(hero,4,false)
 call SetHeroStr(hero,37,true)
 call UnitAddAbility(hero,'AHhb')
 set book=CreateItem('sbok',0.,0.)
 set claw=CreateItem('ratf',0.,0.)
 call UnitAddItem(hero,book)
 call UnitAddItem(hero,claw)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"unit-core.j",source,"unit core recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto hero=a.global("hero");a.invoke("SetUnitState",std::array{hero,a.handle("unitstate",0),a.real(real(140))});a.invoke("SetUnitState",std::array{hero,a.handle("unitstate",2),a.real(real(31))});a.invoke("SetUnitState",std::array{a.global("other"),a.handle("unitstate",0),a.real(real(0))});auto removed=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(256)),a.real(real(0)),a.real(real(0))});a.invoke("RemoveUnit",std::array{removed});auto mover=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(256)),a.real(real(0)),a.real(real(0))});a.invoke("SetUnitPathing",std::array{mover,a.boolean(false)});require(original->moveUnit(mover.bits,{real(1800),real(0)}),"Could not start movement fixture");auto moving=original->units().at(mover.bits);auto u=original->units().at(hero.bits);require(u->hero && u->level==4 && u->heroAttributes[0]==37 && u->inventory[0] && u->inventory[1] && !u->bookGrants.empty(),"Hero equipment fixture differs");u->userData=77;u->turnSpeed=.75f;u->propWindow=2.f;u->turnApplied=true;u->flyHeight=30;u->targetFlyHeight=80;u->flyRate=5;u->visualScale={2,3,4};u->tint={10,20,30,40};u->color=3;u->spellCooldowns[ObjectData::code("AHhb")]=8.5;a.invoke("SetUnitFacingTimed",std::array{hero,a.real(real(60)),a.real(real(2))});original->advance(.25);require(u->timedFacing && u->timedFacing->elapsed==.25,"Timed facing fixture did not progress");a.invoke("SetUnitPathing",std::array{mover,a.boolean(true)});original->advance(1./32);require(!moving->route.empty(),"Movement fixture lost its route");u->animationStart=.125;u->animationTime=4.75;u->animationBlendClock=9.25;u->animationGeneration=73;u->animationRate=.5f;u->animationBlendTime=.3f;u->animationIndex=4;u->animation="Spell";u->animationProperties="Alternate";u->animationQueue={"Stand","Walk"};moving->routeRetryAt=1.25;moving->routeWatch=true;moving->routeWatchSince=.125;moving->routeWatchPosition={real(100),real(150)};moving->routeWatchGoal={real(1800),real(0)};u->scriptAnimationProperties={{"alternate",true},{"gold",false}};u->lookAt={{"head",{a.global("other").bits,{1.f,2.f,3.f}}},{"chest",{removed.bits,{-1.f,-2.f,-3.f}}},{"self",{hero.bits,{0.f,0.f,0.f}}}};auto identity=[](std::string_view,std::uint32_t id){return id;};auto identities=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),visuals=original->encodeUnitVisuals(identity),movement=original->encodeUnitMovement(identity),animations=original->encodeUnitAnimations(identity),items=original->encodeItems(identity),cooldowns=original->encodeUnitCooldowns(identity),random=original->encodeRandomState(),globals=a.encodeGlobals(identity);Binary movementReader(openSnapshot(movement,64u*1024u*1024u));movementReader.expect(tag("SMOV"));require(movementReader.u32()==1,"Movement snapshot version differs");snapshotText(movementReader,64);snapshotU64(movementReader);snapshotText(movementReader,64);snapshotText(movementReader,64);require(movementReader.u32()==mover.bits,"Movement fixture did not retain the retry cursor");restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(identities);auto decodeUnit=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};auto damaged=core;damaged.back()^=1;rejects([&]{restored->prepareUnitCore(damaged,decodeUnit);},"digest");rejects([&]{restored->prepareUnitCore(core,[](auto,auto){return 0u;});},"core mapping");auto other=a.global("other");rejects([&]{original->encodeUnitAnimations([&](std::string_view,std::uint32_t id){return id==other.bits?hero.bits:id;});},"animation mapping");auto swapped=[&](std::string_view type,std::uint32_t id){if(type!="unit")return 0u;if(id==hero.bits)return units.at(other.bits);if(id==other.bits)return units.at(hero.bits);return 0u;};rejects([&]{restored->prepareUnitCore(core,swapped);},"core mapping");restored->prepareUnitCore(core,decodeUnit);rejects([&]{restored->finishUnitCore(core,{});},"inventory mapping");auto itemMap=restored->rebuildItems(items,decodeUnit);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return decodeUnit(type,id);auto it=itemMap.find(id);return type=="item" && it!=itemMap.end()?it->second:0u;};auto staged=restored->units().at(units.at(hero.bits));staged->heroAttributes[0]+=1;rejects([&]{restored->finishUnitCore(core,decode);},"prepared state");staged->heroAttributes[0]-=1;restored->finishUnitCore(core,decode);auto stagedTurn=staged->turnSpeed;auto badVisual=[&](std::string_view type,std::uint32_t id){return id==other.bits?0u:decodeUnit(type,id);};rejects([&]{restored->restoreUnitVisuals(visuals,badVisual);},"visual mapping");require(staged->turnSpeed==stagedTurn,"Invalid unit visual restore changed earlier units");auto damagedVisual=visuals;damagedVisual.back()^=1;rejects([&]{restored->restoreUnitVisuals(damagedVisual,decodeUnit);},"digest");Bytes invalidVisual(visuals.begin(),visuals.end()-64);auto invalidFacingTime=std::bit_cast<std::uint64_t>(-1.);size_t facingTimeOffset=4+4+4+64+8+4+80+4+4+4;for(unsigned n=0;n<8;++n)invalidVisual.at(facingTimeOffset+n)=std::uint8_t(invalidFacingTime>>(n*8));invalidVisual=sealSnapshot(std::move(invalidVisual),16u*1024u*1024u);rejects([&]{restored->restoreUnitVisuals(invalidVisual,decodeUnit);},"timed facing state");require(staged->turnSpeed==stagedTurn && !staged->timedFacing,"Invalid timed facing changed unit state");SnapshotWriter oldVisualWriter(1024*1024);oldVisualWriter.u32(tag("SUVS"));oldVisualWriter.u32(1);oldVisualWriter.text(original->world()->resources().mapDigest(),64);oldVisualWriter.u64(std::bit_cast<std::uint64_t>(original->simulationTime()));oldVisualWriter.size(original->units().size());for(auto& [id,unit]:original->units()){oldVisualWriter.u32(id);oldVisualWriter.u32(unit->type);oldVisualWriter.u32(unit->owner);for(auto value:{unit->turnSpeed,unit->defaultTurnSpeed,unit->propWindow,unit->defaultPropWindow,unit->flyHeight,unit->targetFlyHeight,unit->flyRate})oldVisualWriter.u32(std::bit_cast<std::uint32_t>(value));for(auto value:unit->visualScale)oldVisualWriter.u32(std::bit_cast<std::uint32_t>(value));for(auto value:unit->tint)oldVisualWriter.u32(value);oldVisualWriter.u32(unit->color?1:0);oldVisualWriter.u32(unit->color.value_or(0));oldVisualWriter.u32(unit->turnApplied?1:0);}auto oldVisual=sealSnapshot(oldVisualWriter.finish(),16u*1024u*1024u);staged->timedFacing=TimedFacing{10,20,.25,1};restored->restoreUnitVisuals(oldVisual,decodeUnit);require(staged->timedFacing && staged->timedFacing->start==10 && staged->timedFacing->elapsed==.25,"Version 1 visual snapshot changed timed facing");restored->restoreUnitVisuals(visuals,decodeUnit);auto movedUnit=restored->units().at(units.at(mover.bits));require(movedUnit->routeRetryPhase!=moving->routeRetryPhase,"Movement fixture did not change handle phase");auto oldPathing=restored->world()->encodePathingState();WorldPoint changedPoint{real(0),real(0)};bool blocked=restored->world()->terrainUnpathable(changedPoint,1);restored->world()->terrainPathable(changedPoint,1,blocked);rejects([&]{restored->restoreUnitMovement(movement,decodeUnit);},"movement pathing differs");require(movedUnit->route.empty(),"Rejected pathing changed unit movement");restored->world()->restorePathingState(oldPathing);auto cell=restored->world()->pathCell(0,0);require(cell.has_value(),"Footprint test point missing");std::array footprint{PathCell{*cell,2}};restored->world()->footprint(footprint,true);auto firstFingerprint=restored->world()->movementFingerprint();auto firstMask=restored->world()->pathMask(changedPoint);restored->world()->footprint(footprint,true);require(restored->world()->pathMask(changedPoint)==firstMask && restored->world()->movementFingerprint()!=firstFingerprint,"Movement fingerprint ignored overlapping footprint owners");rejects([&]{restored->restoreUnitMovement(movement,decodeUnit);},"movement pathing differs");restored->world()->footprint(footprint,false);restored->world()->footprint(footprint,false);rejects([&]{restored->restoreUnitMovement(movement,badVisual);},"movement mapping");require(movedUnit->route.empty(),"Invalid movement mapping changed unit route");restored->restoreUnitMovement(movement,decodeUnit);require(movedUnit->currentOrder==moving->currentOrder && movedUnit->route.size()==moving->route.size() && movedUnit->waypoint==moving->waypoint && movedUnit->moveDestination && moving->moveDestination && movedUnit->moveDestination->x.bits()==moving->moveDestination->x.bits() && movedUnit->route.front().x.bits()==moving->route.front().x.bits() && movedUnit->routeRetryPhase==moving->routeRetryPhase && movedUnit->routeRetryAt==moving->routeRetryAt && movedUnit->routeWatch && movedUnit->routeWatchSince==moving->routeWatchSince && movedUnit->routeWatchGoal.x.bits()==moving->routeWatchGoal.x.bits(),"Restored movement differs");auto beforeAnimation=staged->animation;rejects([&]{restored->restoreUnitAnimations(animations,badVisual);},"animation target mapping");require(staged->animation==beforeAnimation,"Invalid animation mapping changed unit state");auto damagedAnimation=animations;damagedAnimation.back()^=1;rejects([&]{restored->restoreUnitAnimations(damagedAnimation,decodeUnit);},"digest");Bytes invalidAnimation(animations.begin(),animations.end()-64);auto invalidTime=std::bit_cast<std::uint64_t>(-1.);size_t animationTimeOffset=4+4+4+64+8+4+12+8;for(unsigned n=0;n<8;++n)invalidAnimation.at(animationTimeOffset+n)=std::uint8_t(invalidTime>>(n*8));invalidAnimation=sealSnapshot(std::move(invalidAnimation),16u*1024u*1024u);rejects([&]{restored->restoreUnitAnimations(invalidAnimation,decodeUnit);},"animation flags");require(staged->animation==beforeAnimation,"Invalid animation clock changed unit state");SnapshotWriter legacyWriter(1024*1024);legacyWriter.u32(tag("SUAN"));legacyWriter.u32(1);legacyWriter.text(original->world()->resources().mapDigest(),64);legacyWriter.u64(std::bit_cast<std::uint64_t>(original->simulationTime()));legacyWriter.size(original->units().size());for(auto& [id,unit]:original->units()){legacyWriter.u32(id);legacyWriter.u32(unit->type);legacyWriter.u32(unit->owner);for(int n=0;n<4;++n)legacyWriter.u64(0);legacyWriter.u32(std::bit_cast<std::uint32_t>(1.f));for(int n=0;n<4;++n)legacyWriter.u32(0);legacyWriter.text("",4096);legacyWriter.text("",4096);legacyWriter.u32(0);legacyWriter.u32(0);}auto legacy=sealSnapshot(legacyWriter.finish(),16u*1024u*1024u);restored->restoreUnitAnimations(legacy,decodeUnit);require(staged->animation.empty() && staged->animationRate==1 && staged->lookAt.empty(),"Version 1 animation snapshot did not restore");restored->restoreUnitAnimations(animations,decodeUnit);restored->restoreUnitCooldowns(cooldowns,decodeUnit);restored->restoreRandomState(random);b.restoreGlobals(globals,decode);auto target=restored->units().at(b.global("hero").bits),dead=restored->units().at(b.global("other").bits);require(dead->life.bits()==0 && dead->deathRevision==original->units().at(other.bits)->deathRevision,"Dead unit core state differs");require(target->life.bits()==u->life.bits() && target->maxLife.bits()==u->maxLife.bits() && target->mana.bits()==u->mana.bits() && target->maxMana.bits()==u->maxMana.bits() && target->level==u->level && target->experience==u->experience && target->heroAttributes==u->heroAttributes && target->appliedHeroStats==u->appliedHeroStats && target->equipment==u->equipment && target->abilities==u->abilities && target->userData==77,"Restored hero core differs");require(target->turnSpeed==u->turnSpeed && target->propWindow==u->propWindow && target->turnApplied==u->turnApplied && target->flyHeight==u->flyHeight && target->targetFlyHeight==u->targetFlyHeight && target->flyRate==u->flyRate && target->visualScale==u->visualScale && target->tint==u->tint && target->color==u->color,"Restored unit visuals differ");require(target->facing.bits()==u->facing.bits() && target->timedFacing && target->timedFacing->start==u->timedFacing->start && target->timedFacing->delta==u->timedFacing->delta && target->timedFacing->elapsed==u->timedFacing->elapsed && target->timedFacing->duration==u->timedFacing->duration,"Restored timed facing differs");require(target->animationStart==u->animationStart && target->animationTime==u->animationTime && target->animationBlendClock==u->animationBlendClock && target->animationGeneration==u->animationGeneration && target->animationRate==u->animationRate && target->animationBlendTime==u->animationBlendTime && target->animationIndex==u->animationIndex && target->animation==u->animation && target->animationProperties==u->animationProperties && target->animationQueue==u->animationQueue && target->scriptAnimationProperties==u->scriptAnimationProperties,"Restored unit animations differ");require(target->lookAt.size()==3 && target->lookAt.at("head").target==units.at(other.bits) && target->lookAt.at("head").offset==u->lookAt.at("head").offset && target->lookAt.at("chest").target==units.at(removed.bits) && target->lookAt.at("self").target==units.at(hero.bits),"Restored look-at targets differ");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;return 0u;};require(restored->encodeUnitCore(reverse)==core && restored->encodeUnitVisuals(reverse)==visuals && restored->encodeUnitMovement(reverse)==movement && restored->encodeUnitAnimations(reverse)==animations && restored->encodeItems(reverse)==items && restored->encodeUnitCooldowns(reverse)==cooldowns,"Unit core or inventory did not round trip");rejects([&]{restored->startMain();},"Unit state recovery is incomplete");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during unit core recovery");
    });
    test("unit_identities_rebuild_handles_without_population_events",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer id returns player
 native SetPlayerTechResearched takes player p, integer id, integer level returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native SetUnitX takes unit u, real x returns nothing
 native KillUnit takes unit u returns nothing
 native RemoveUnit takes unit u returns nothing
 native GetUnitTypeId takes unit u returns integer
 globals
 unit hero=null
 unit soldier=null
 unit dead=null
 unit removed=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set hero=CreateUnit(Player(0),'Hpal',0.,0.,270.)
 set soldier=CreateUnit(Player(1),'hfoo',128.,0.,90.)
 set dead=CreateUnit(Player(0),'hfoo',256.,0.,0.)
 set removed=CreateUnit(Player(0),'hfoo',384.,0.,0.)
 call SetUnitX(soldier,999999.)
 call KillUnit(dead)
 call RemoveUnit(removed)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"unit-identity.j",source,"unit identity recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();original->advance(.25);auto& a=original->runtime();auto& b=restored->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto identities=original->encodeUnitIdentities(identity),globals=a.encodeGlobals(identity),random=original->encodeRandomState();rejects([&]{original->encodeUnitIdentities([](std::string_view,std::uint32_t){return 1u;});},"identity mapping");auto damaged=identities;damaged.back()^=1;rejects([&]{restored->rebuildUnitIdentities(damaged);},"digest");require(restored->units().empty(),"Invalid identity digest changed target");rejects([&]{restored->rebuildUnitIdentities(identities);},"clock mismatch");restored->restoreSimulationClock(original->encodeSimulationClock());SnapshotWriter invalid(1024);invalid.u32(tag("SUID"));invalid.u32(1);invalid.text(original->world()->resources().mapDigest(),64);invalid.u64(std::bit_cast<std::uint64_t>(original->simulationTime()));invalid.u32(1);invalid.u32(77);invalid.u32(1);invalid.u32(0);invalid.u32(0);invalid.u32(0);invalid.u32(0);invalid.u32(0);auto invalidType=sealSnapshot(invalid.finish(),1024);rejects([&]{restored->rebuildUnitIdentities(invalidType);},"identity values");require(restored->units().empty(),"Invalid unit type changed target");auto players=restored->encodePlayerStates();auto mapped=restored->rebuildUnitIdentities(identities);require(mapped.size()==4 && restored->units().size()==3 && restored->encodePlayerStates()==players,"Unit identity creation changed population or lifetime");auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapped.contains(id)?mapped.at(id):0u;};b.restoreGlobals(globals,decode);auto hero=b.global("hero"),soldier=b.global("soldier"),dead=b.global("dead"),removed=b.global("removed");require(restored->units().at(hero.bits)->type==ObjectData::code("Hpal") && restored->units().at(soldier.bits)->owner==1 && restored->units().at(soldier.bits)->x.bits()==real(999999).bits() && restored->units().contains(dead.bits) && !restored->units().contains(removed.bits) && !b.invoke("GetUnitTypeId",std::array{removed}).bits,"Unit identities or tombstone differ");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapped)if(current==id)return old;return 0u;};require(restored->encodeUnitIdentities(reverse)==identities,"Unit identity snapshot did not round trip");restored->restoreRandomState(random);require(restored->encodeRandomState()==random,"Unit creation random state was not restored");rejects([&]{restored->startMain();},"Unit state recovery is incomplete");require(!restored->mainStarted(),"Incomplete unit recovery started simulation");auto empty=make(),emptyTarget=make();auto emptyIds=empty->encodeUnitIdentities({}),emptyClock=empty->encodeSimulationClock();emptyTarget->rebuildUnitIdentities(emptyIds);rejects([&]{emptyTarget->startMain();},"Unit state recovery is incomplete");rejects([&]{emptyTarget->restoreSimulationClock(emptyClock);},"fresh quiescent");auto normal=make(),seeded=make();auto grant=[&](ScriptSession& session){auto& vm=session.runtime();vm.invoke("SetPlayerTechResearched",std::array{vm.invoke("Player",std::array{vm.integer(0)}),vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("Robk"))),vm.integer(1)});};grant(*normal);grant(*seeded);auto& n=normal->runtime();auto transformed=n.invoke("CreateUnit",std::array{n.invoke("Player",std::array{n.integer(0)}),n.integer(std::bit_cast<std::int32_t>(ObjectData::code("ohun"))),n.real(real(0)),n.real(real(0)),n.real(real(0))});require(normal->units().at(transformed.bits)->type==ObjectData::code("otbk"),"Chaos fixture did not transform normal creation");SnapshotWriter seed(1024);seed.u32(tag("SUID"));seed.u32(1);seed.text(seeded->world()->resources().mapDigest(),64);seed.u64(std::bit_cast<std::uint64_t>(seeded->simulationTime()));seed.u32(1);seed.u32(55);seed.u32(1);seed.u32(ObjectData::code("ohun"));seed.u32(0);seed.u32(0);seed.u32(0);seed.u32(0);auto seedMap=seeded->rebuildUnitIdentities(sealSnapshot(seed.finish(),1024));require(seeded->units().at(seedMap.at(55))->type==ObjectData::code("ohun"),"Recovery repeated chaos transformation");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during unit identity recovery");
    });
    test("quests_restore_objectives_globals_and_tombstones",[&]{
        std::string source=R"jass(type destructable extends handle
 type quest extends handle
 type questitem extends handle
 native CreateQuest takes nothing returns quest
 native DestroyQuest takes quest q returns nothing
 native QuestSetTitle takes quest q, string title returns nothing
 native QuestSetDescription takes quest q, string description returns nothing
 native QuestSetIconPath takes quest q, string icon returns nothing
 native QuestSetRequired takes quest q, boolean value returns nothing
 native QuestSetDiscovered takes quest q, boolean value returns nothing
 native QuestSetFailed takes quest q, boolean value returns nothing
 native QuestSetEnabled takes quest q, boolean value returns nothing
 native QuestSetCompleted takes quest q, boolean value returns nothing
 native IsQuestCompleted takes quest q returns boolean
 native QuestCreateItem takes quest q returns questitem
 native QuestItemSetDescription takes questitem item, string description returns nothing
 native QuestItemSetCompleted takes questitem item, boolean value returns nothing
 native IsQuestItemCompleted takes questitem item returns boolean
 native FlashQuestDialogButton takes nothing returns nothing
 globals
 quest primary=null
 quest optional=null
 quest removed=null
 questitem first=null
 questitem second=null
 questitem oldItem=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set primary=CreateQuest()
 call QuestSetTitle(primary,"主线任务")
 call QuestSetDescription(primary,"保卫营地")
 call QuestSetIconPath(primary,"ReplaceableTextures\\CommandButtons\\BTNHero.blp")
 call QuestSetDiscovered(primary,true)
 set first=QuestCreateItem(primary)
 call QuestItemSetDescription(first,"找到船只")
 call QuestItemSetCompleted(first,true)
 set second=QuestCreateItem(primary)
 call QuestItemSetDescription(second,"到达港口")
 set optional=CreateQuest()
 call QuestSetRequired(optional,false)
 call QuestSetFailed(optional,true)
 call QuestSetEnabled(optional,false)
 set removed=CreateQuest()
 set oldItem=QuestCreateItem(removed)
 call DestroyQuest(removed)
 call FlashQuestDialogButton()
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"quest-snapshot.j",source,"quest recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();original->advance(.25);auto& a=original->runtime();auto& b=restored->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto saved=original->encodeQuests(identity),globals=a.encodeGlobals(identity);rejects([&]{original->encodeQuests([](std::string_view,std::uint32_t){return 1u;});},"handle mapping");auto sourceQuest=original->quests().at(a.global("primary").bits);std::swap(sourceQuest->items[0],sourceQuest->items[1]);rejects([&]{original->encodeQuests(identity);},"objective membership");std::swap(sourceQuest->items[0],sourceQuest->items[1]);auto damaged=saved;damaged.back()^=1;rejects([&]{restored->rebuildQuests(damaged);},"digest");require(restored->quests().empty() && !restored->questFlash(),"Rejected quest snapshot modified target");rejects([&]{restored->rebuildQuests(saved);},"clock mismatch");restored->restoreSimulationClock(original->encodeSimulationClock());SnapshotWriter invalid(1024);invalid.u32(tag("SQST"));invalid.u32(1);invalid.text(original->world()->resources().mapDigest(),64);invalid.u64(std::bit_cast<std::uint64_t>(original->simulationTime()));invalid.u32(1);invalid.u32(1);invalid.u32(1);invalid.u32(77);invalid.u32(1);invalid.u32(999);invalid.text("orphan",1024);invalid.u32(0);auto orphan=sealSnapshot(invalid.finish(),1024);rejects([&]{restored->rebuildQuests(orphan);},"objective owner");require(restored->quests().empty() && !restored->questFlash(),"Invalid quest owner modified target");auto mapped=restored->rebuildQuests(saved);auto decode=[&](std::string_view type,std::uint32_t id){auto at=mapped.find({std::string(type),id});return at==mapped.end()?0u:at->second;};b.restoreGlobals(globals,decode);auto primary=b.global("primary"),optional=b.global("optional"),first=b.global("first"),second=b.global("second"),removed=b.global("removed"),oldItem=b.global("oldItem");auto q=restored->quests().at(primary.bits),o=restored->quests().at(optional.bits);require(q->title=="主线任务" && q->description=="保卫营地" && q->discovered && q->required && q->items.size()==2 && q->items[0].first==first.bits && q->items[1].first==second.bits && q->items[0].second->description=="找到船只" && q->items[0].second->completed && q->items[1].second->description=="到达港口" && !q->items[1].second->completed,"Quest state or objective order differs");require(!o->required && o->failed && !o->enabled && restored->questFlash() && !b.invoke("IsQuestCompleted",std::array{removed}).bits && !b.invoke("IsQuestItemCompleted",std::array{oldItem}).bits,"Quest flags, flash or tombstones differ");auto reverse=[&](std::string_view type,std::uint32_t id){for(auto& [key,value]:mapped)if(key.first==type && value==id)return key.second;return 0u;};require(restored->encodeQuests(reverse)==saved,"Quest snapshot did not round trip");auto revision=restored->questRevision();b.invoke("QuestItemSetCompleted",std::array{second,b.boolean(true)});require(b.invoke("IsQuestItemCompleted",std::array{second}).bits && restored->questRevision()>revision,"Restored objective did not update UI state");restored->acknowledgeQuests();require(!restored->questFlash(),"Restored quest flash did not clear");rejects([&]{restored->rebuildQuests(saved);},"idle local");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during quest recovery");
    });
    test("item_objects_restore_inventory_and_tombstones",[&]{
        std::string source=R"jass(type widget extends handle
 type ability extends handle
 type effect extends handle
 type sound extends handle
 type lightning extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterDeathEvent takes trigger t, widget w returns event
 native GetTriggerWidget takes nothing returns widget
 native Player takes integer id returns player
 native CreateTimer takes nothing returns timer
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native UnitAddAbility takes unit u, integer id returns boolean
 native CreateItem takes integer id, real x, real y returns item
 native RemoveUnit takes unit u returns nothing
 native RemoveItem takes item i returns nothing
 native UnitAddItem takes unit u, item i returns boolean
 native UnitAddItemToSlotById takes unit u, integer id, integer slot returns boolean
 native UnitItemInSlot takes unit u, integer slot returns item
 native UnitRemoveItem takes unit u, item i returns nothing
 native SetItemCharges takes item i, integer value returns nothing
 native SetItemUserData takes item i, integer value returns nothing
 native SetItemPlayer takes item i, player p, boolean change returns nothing
 native SetItemInvulnerable takes item i, boolean value returns nothing
 native SetItemDroppable takes item i, boolean value returns nothing
 native SetItemDropID takes item i, integer value returns nothing
 native SetWidgetLife takes widget w, real life returns nothing
 globals
 item watched=null
 integer deaths=0
 endglobals
 function onDeath takes nothing returns nothing
 if GetTriggerWidget()==watched then
 set deaths=deaths+1
 endif
 endfunction
 function watch takes item i returns nothing
 local trigger t=CreateTrigger()
 set watched=i
 call TriggerAddAction(t,function onDeath)
 call TriggerRegisterDeathEvent(t,i)
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto build=[&]{auto module=Module::compile(Program::parse({{"item-snapshot.j",source,"item object recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=build(),restored=build();original->startMain();auto& vm=original->runtime();auto raw=[](const char* name){return std::bit_cast<std::int32_t>(ObjectData::code(name));};auto hero=[&](auto& runtime){return runtime.invoke("CreateUnit",std::array{runtime.invoke("Player",std::array{runtime.integer(0)}),runtime.integer(raw("Hpal")),runtime.real(Real::fromInteger(0)),runtime.real(Real::fromInteger(0)),runtime.real(Real::fromInteger(0))});};auto item=[&](auto& runtime,const char* name){return runtime.invoke("CreateItem",std::array{runtime.integer(raw(name)),runtime.real(Real::fromInteger(100)),runtime.real(Real::fromInteger(100))});};vm.invoke("CreateTimer");auto actor=hero(vm),book=item(vm,"sbok"),ground=item(vm,"phea"),removed=item(vm,"pman");require(vm.invoke("UnitAddItem",std::array{actor,book}).bits && vm.invoke("UnitAddItemToSlotById",std::array{actor,vm.integer(raw("ratf")),vm.integer(3)}).bits,"Fixture inventory setup failed");auto claw=vm.invoke("UnitItemInSlot",std::array{actor,vm.integer(3)});require(!original->items().at(book.bits)->bookSelections.empty(),"Spell book selection was not created");vm.invoke("SetItemCharges",std::array{book,vm.integer(-3)});vm.invoke("SetItemUserData",std::array{book,vm.integer(-77)});vm.invoke("SetItemPlayer",std::array{book,vm.invoke("Player",std::array{vm.integer(1)}),vm.boolean(false)});vm.invoke("SetItemInvulnerable",std::array{book,vm.boolean(true)});vm.invoke("SetItemDroppable",std::array{book,vm.boolean(false)});vm.invoke("SetItemDropID",std::array{book,vm.integer(raw("pman"))});vm.invoke("SetWidgetLife",std::array{ground,vm.real(Real::fromInteger(0))});vm.invoke("RemoveItem",std::array{removed});vm.invoke("watch",std::array{claw});original->advance(.25);original->units().at(actor.bits)->spellCooldowns[std::uint32_t(raw("AHhb"))]=17.5;original->units().at(actor.bits)->itemCooldowns["phea"]=9.25;auto encode=[](std::string_view,std::uint32_t id){return id;};auto cooldowns=original->encodeUnitCooldowns(encode);auto saved=original->encodeItems(encode),triggerSaved=original->encodeTriggers(encode),eventSaved=original->encodeWidgetDeathEvents(encode),globals=vm.encodeGlobals(encode);restored->restoreSimulationClock(original->encodeSimulationClock());auto& rvm=restored->runtime();auto newActor=hero(rvm);auto invalid=[](std::string_view,std::uint32_t){return 0u;};rejects([&]{restored->rebuildItems(saved,invalid);},"holder mapping");auto wrongActor=rvm.invoke("CreateUnit",std::array{rvm.invoke("Player",std::array{rvm.integer(0)}),rvm.integer(raw("hfoo")),rvm.real(Real::fromInteger(256)),rvm.real(Real::fromInteger(0)),rvm.real(Real::fromInteger(0))});auto wrong=[&](std::string_view,std::uint32_t){return wrongActor.bits;};rejects([&]{restored->rebuildItems(saved,wrong);},"holder mapping");require(restored->liveObjects(NativeKind::Item)==0,"Invalid item mapping modified target");rvm.invoke("RemoveUnit",std::array{wrongActor});auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==actor.bits?newActor.bits:0u;};auto damaged=saved;damaged.back()^=1;rejects([&]{restored->rebuildItems(damaged,decode);},"digest");auto mapped=restored->rebuildItems(saved,decode);require(mapped.size()==4 && restored->liveObjects(NativeKind::Item)==3 && !restored->items().contains(mapped.at(removed.bits)),"Item lifecycle or tombstone differs");auto restoredBook=restored->items().at(mapped.at(book.bits));require(restoredBook->holder==newActor.bits && restoredBook->charges==-3 && restoredBook->userData==-77 && restoredBook->owner==1 && restoredBook->invulnerable && !restoredBook->droppable && restoredBook->dropId==std::uint32_t(raw("pman")),"Restored item state differs");require(rvm.invoke("UnitItemInSlot",std::array{newActor,rvm.integer(0)}).bits==mapped.at(book.bits) && rvm.invoke("UnitItemInSlot",std::array{newActor,rvm.integer(3)}).bits==mapped.at(claw.bits),"Restored inventory slots differ");require(restored->items().at(mapped.at(ground.bits))->life.bits()==0 && std::abs(restored->units().at(newActor.bits)->equipment.damage-original->units().at(actor.bits)->equipment.damage)<.001f,"Ground item or equipment bonus differs");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==newActor.bits?actor.bits:0u;for(auto [old,current]:mapped)if(current==id)return old;return 0u;};require(restored->encodeItems(reverse)==saved,"Item snapshot did not round trip");restored->units().at(newActor.bits)->itemCooldowns["keep"]=3;rejects([&]{restored->restoreUnitCooldowns(cooldowns,invalid);},"unit mapping");auto brokenCooldowns=cooldowns;brokenCooldowns.back()^=1;rejects([&]{restored->restoreUnitCooldowns(brokenCooldowns,decode);},"digest");require(restored->units().at(newActor.bits)->itemCooldowns.contains("keep"),"Rejected cooldown restore modified target");restored->restoreUnitCooldowns(cooldowns,decode);require(restored->encodeUnitCooldowns(reverse)==cooldowns && restored->units().at(newActor.bits)->spellCooldowns.at(std::uint32_t(raw("AHhb")))==17.5 && restored->units().at(newActor.bits)->itemCooldowns.at("phea")==9.25,"Cooldown state differs");auto triggerMap=restored->restoreTriggers(triggerSaved);auto decodeEvent=[&](std::string_view type,std::uint32_t id){if(type=="item"){auto found=mapped.find(id);return found==mapped.end()?0u:found->second;}if(type=="unit")return id==actor.bits?newActor.bits:0u;auto found=triggerMap.find({std::string(type),id});return found==triggerMap.end()?0u:found->second;};auto eventMap=restored->rebuildWidgetDeathEvents(eventSaved,decodeEvent);require(eventMap.size()==1,"Item death event was not restored");rvm.restoreGlobals(globals,decodeEvent);auto restoredClaw=rvm.handle("item",mapped.at(claw.bits));rvm.invoke("SetWidgetLife",std::array{restoredClaw,rvm.real(Real::fromInteger(0))});require(rvm.global("deaths").bits==1,"Restored item death callback failed");rvm.invoke("UnitRemoveItem",std::array{newActor,restoredClaw});require(!restored->items().at(restoredClaw.bits)->holder && !rvm.invoke("UnitItemInSlot",std::array{newActor,rvm.integer(3)}).bits,"Restored item could not be dropped");restored->startMain();auto ally=rvm.invoke("CreateUnit",std::array{rvm.invoke("Player",std::array{rvm.integer(0)}),rvm.integer(raw("hfoo")),rvm.real(Real::fromInteger(64)),rvm.real(Real::fromInteger(0)),rvm.real(Real::fromInteger(0))});rvm.invoke("UnitAddAbility",std::array{newActor,rvm.integer(raw("AHhb"))});restored->units().at(newActor.bits)->mana=restored->units().at(newActor.bits)->maxMana=real(1000);restored->units().at(ally.bits)->life=real(100);restored->units().at(ally.bits)->healthRegen=0;restored->units().at(ally.bits)->regenType="none";auto order=restored->spellInfo(std::uint32_t(raw("AHhb")),1).order;require(restored->spellCooldown(newActor.bits,std::uint32_t(raw("AHhb")))==17.25 && !restored->castOrder(newActor.bits,order,ally.bits),"Restored active cooldown did not block the spell");restored->advance(17.5);require(restored->spellCooldown(newActor.bits,std::uint32_t(raw("AHhb")))==0 && restored->castOrder(newActor.bits,order,ally.bits),"Restored cooldown did not expire");restored->advance(2);require(std::bit_cast<float>(restored->units().at(ally.bits)->life.bits())>100 && restored->spellCooldown(newActor.bits,std::uint32_t(raw("AHhb")))>0,"Spell did not heal and restart cooldown");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("widget_death_events_restore_destructables_and_globals",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native CreateItem takes integer id, real x, real y returns item
 native KillUnit takes unit u returns nothing
 native SetWidgetLife takes widget w, real life returns nothing
 native CreateDestructable takes integer id, real x, real y, real facing, real scale, integer variation returns destructable
 native KillDestructable takes destructable d returns nothing
 native RemoveDestructable takes destructable d returns nothing
 native DestructableRestoreLife takes destructable d, real life, boolean birth returns nothing
 native CreateTrigger takes nothing returns trigger
 native DestroyTrigger takes trigger t returns nothing
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterDeathEvent takes trigger t, widget w returns event
 native GetTriggerDestructable takes nothing returns destructable
 native GetTriggerWidget takes nothing returns widget
 globals
 destructable tracked=null
 destructable gone=null
 unit actor=null
 item treasure=null
 trigger second=null
 integer trace=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function firstAction takes nothing returns nothing
 if GetTriggerDestructable()==tracked and GetTriggerWidget()==tracked then
 set trace=trace*10+1
 endif
 endfunction
 function secondAction takes nothing returns nothing
 if GetTriggerDestructable()==tracked and GetTriggerWidget()==tracked then
 set trace=trace*10+2
 endif
 endfunction
 function unitAction takes nothing returns nothing
 if GetTriggerWidget()==actor then
 set trace=trace*10+3
 endif
 endfunction
 function itemAction takes nothing returns nothing
 if GetTriggerWidget()==treasure then
 set trace=trace*10+4
 endif
 endfunction
 function setup takes destructable a, destructable b, unit c, item d returns nothing
 local trigger first=CreateTrigger()
 local trigger unused=CreateTrigger()
 local trigger units=CreateTrigger()
 local trigger items=CreateTrigger()
 set tracked=a
 set gone=b
 set actor=c
 set treasure=d
 set second=CreateTrigger()
 call TriggerAddAction(first,function firstAction)
 call TriggerAddAction(second,function secondAction)
 call TriggerAddAction(units,function unitAction)
 call TriggerAddAction(items,function itemAction)
 call TriggerRegisterDeathEvent(units,c)
 call TriggerRegisterDeathEvent(items,d)
 call TriggerRegisterDeathEvent(first,a)
 call TriggerRegisterDeathEvent(second,a)
 call TriggerRegisterDeathEvent(unused,b)
 call RemoveDestructable(b)
 endfunction
 )jass";auto build=[&]{auto module=Module::compile(Program::parse({{"widget-events.j",source,"widget event recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=build(),restored=build();original->startMain();auto& vm=original->runtime();auto make=[&](int x){return vm.invoke("CreateDestructable",std::array{vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("LTlt"))),vm.real(Real::fromInteger(x)),vm.real(Real::fromInteger(0)),vm.real(Real::fromInteger(270)),vm.real(Real::fromInteger(1)),vm.integer(0)});};auto first=make(0),removed=make(128);auto actor=vm.invoke("CreateUnit",std::array{vm.invoke("Player",std::array{vm.integer(0)}),vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),vm.real(Real::fromInteger(256)),vm.real(Real::fromInteger(0)),vm.real(Real::fromInteger(0))});auto treasure=vm.invoke("CreateItem",std::array{vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("ratf"))),vm.real(Real::fromInteger(384)),vm.real(Real::fromInteger(0))});vm.invoke("setup",std::array{first,removed,actor,treasure});auto encode=[](std::string_view,std::uint32_t id){return id;};auto objects=original->encodeDestructables(encode),triggers=original->encodeTriggers(encode),events=original->encodeWidgetDeathEvents(encode),globals=vm.encodeGlobals(encode);auto mapped=restored->rebuildDestructables(objects);auto& rvm=restored->runtime();auto newActor=rvm.invoke("CreateUnit",std::array{rvm.invoke("Player",std::array{rvm.integer(0)}),rvm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),rvm.real(Real::fromInteger(256)),rvm.real(Real::fromInteger(0)),rvm.real(Real::fromInteger(0))});auto newTreasure=rvm.invoke("CreateItem",std::array{rvm.integer(std::bit_cast<std::int32_t>(ObjectData::code("ratf"))),rvm.real(Real::fromInteger(384)),rvm.real(Real::fromInteger(0))});auto triggerMap=restored->restoreTriggers(triggers);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==actor.bits?newActor.bits:0u;if(type=="item")return id==treasure.bits?newTreasure.bits:0u;if(type=="destructable"){auto found=mapped.find(id);return found==mapped.end()?0u:found->second;}auto found=triggerMap.find({std::string(type),id});return found==triggerMap.end()?0u:found->second;};auto damaged=events;damaged.back()^=1;rejects([&]{restored->rebuildWidgetDeathEvents(damaged,decode);},"digest");require(restored->liveObjects(NativeKind::Event)==0,"Corrupt widget events modified target");auto invalidMap=[&](std::string_view type,std::uint32_t id){return type=="destructable" && id==removed.bits?mapped.at(first.bits):decode(type,id);};rejects([&]{restored->rebuildWidgetDeathEvents(events,invalidMap);},"mapping");require(restored->liveObjects(NativeKind::Event)==0,"Invalid widget mapping modified target");auto eventMap=restored->rebuildWidgetDeathEvents(events,decode);require(eventMap.size()==5,"Widget event count differs");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==newActor.bits?actor.bits:0u;if(type=="item")return id==newTreasure.bits?treasure.bits:0u;if(type=="destructable"){for(auto [old,current]:mapped)if(current==id)return old;return 0u;}if(type=="event"){for(auto [old,current]:eventMap)if(current==id)return old;return 0u;}for(auto& [key,current]:triggerMap)if(key.first==type && current==id)return key.second;return 0u;};require(restored->encodeWidgetDeathEvents(reverse)==events,"Widget events did not round trip");rvm.restoreGlobals(globals,decode);auto restoredFirst=rvm.global("tracked"),restoredGone=rvm.global("gone");require(restoredFirst.bits==mapped.at(first.bits) && restoredGone.bits==mapped.at(removed.bits),"Restored widget globals differ");for(auto* runtime:{&vm,&rvm}){auto tracked=runtime->global("tracked");runtime->invoke("KillDestructable",std::array{tracked});require(runtime->global("trace").bits==12,"Restored widget death order or context differs");runtime->invoke("DestructableRestoreLife",std::array{tracked,runtime->real(Real::fromInteger(10)),runtime->boolean(false)});runtime->invoke("DestroyTrigger",std::array{runtime->global("second")});runtime->invoke("KillDestructable",std::array{tracked});require(runtime->global("trace").bits==121,"Widget event trigger cleanup differs");runtime->invoke("KillUnit",std::array{runtime->global("actor")});runtime->invoke("SetWidgetLife",std::array{runtime->global("treasure"),runtime->real(Real::fromInteger(0))});require(runtime->global("trace").bits==12134,"Unit or item widget event differs");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("player_resource_natives_follow_original_bounds",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type attacktype extends handle
 type damagetype extends handle
 type weapontype extends handle
 type alliancetype extends handle
 type player extends handle
 type playerstate extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type limitop extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native AddHeroXP takes unit u, integer xp, boolean show returns nothing
 native SetHeroXP takes unit u, integer xp, boolean show returns nothing
 native SetHeroLevel takes unit u, integer level, boolean show returns nothing
 native SuspendHeroXP takes unit u, boolean suspend returns nothing
 native RemoveUnit takes unit u returns nothing
 native GetHeroXP takes unit u returns integer
 native GetHeroLevel takes unit u returns integer
 native SetPlayerAlliance takes player p, player other, alliancetype a, boolean value returns nothing
 native UnitDamageTarget takes unit source, widget target, real amount, boolean attack, boolean ranged, attacktype at, damagetype dt, weapontype wt returns boolean
 native ConvertPlayerState takes integer id returns playerstate
 native ConvertLimitOp takes integer id returns limitop
 native CreateTimer takes nothing returns timer
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterPlayerStateEvent takes trigger t, player p, playerstate state, limitop op, real threshold returns event
 native SetPlayerState takes player p, playerstate state, integer value returns nothing
 native GetPlayerState takes player p, playerstate state returns integer
 native SetPlayerHandicapXP takes player p, real factor returns nothing
 native GetPlayerHandicapXP takes player p returns real
 globals
 integer crossed=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function onLimit takes nothing returns nothing
 set crossed=crossed+1
 endfunction
 function watch takes nothing returns nothing
 local trigger t=CreateTrigger()
 call TriggerAddAction(t,function onLimit)
 call TriggerRegisterPlayerStateEvent(t,Player(0),ConvertPlayerState(1),ConvertLimitOp(4),999999.0)
 endfunction
 )jass";auto module=Module::compile(Program::parse({{"player-resource-bounds.j",source,"authored player state boundary test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)}),timer=vm.invoke("CreateTimer");auto set=[&](jass::Value p,unsigned state,int value){vm.invoke("SetPlayerState",std::array{p,vm.handle("playerstate",state),vm.integer(value)});};auto get=[&](jass::Value p,unsigned state){return std::bit_cast<std::int32_t>(vm.invoke("GetPlayerState",std::array{p,vm.handle("playerstate",state)}).bits);};for(auto id:{0u,timer.bits}){auto invalid=vm.handle("player",id);set(invalid,1,500);vm.invoke("SetPlayerHandicapXP",std::array{invalid,vm.real(Real::fromBits(0x7fc00000))});require(vm.invoke("GetPlayerHandicapXP",std::array{invalid}).bits==real(1.f).bits(),"Invalid player XP handicap was not one");require(get(invalid,1)==0,"Invalid player state was accepted");}for(auto [input,expected]:std::initializer_list<std::pair<float,float>>{{-100.f,.01f},{0.f,.01f},{.01f,.01f},{1.25f,1.25f},{100.f,100.f},{1000.f,100.f}}){vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(input))});require(vm.invoke("GetPlayerHandicapXP",std::array{player}).bits==real(expected).bits(),"Player XP handicap boundary differs");}vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(1.25f))});auto zero=vm.real(real(0)),hero=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<int>(ObjectData::code("Hpal"))),zero,zero,zero});vm.invoke("AddHeroXP",std::array{hero,vm.integer(100),vm.boolean(false)});require(vm.invoke("GetHeroXP",std::array{hero}).bits==100,"Script XP was scaled by player handicap");auto opponent=vm.invoke("Player",std::array{vm.integer(2)});vm.invoke("SetPlayerAlliance",std::array{player,opponent,vm.handle("alliancetype",0),vm.boolean(false)});auto kill=[&]{auto victim=vm.invoke("CreateUnit",std::array{opponent,vm.integer(std::bit_cast<int>(ObjectData::code("hfoo"))),zero,zero,zero});require(vm.invoke("UnitDamageTarget",std::array{hero,victim,vm.real(real(10000)),vm.boolean(true),vm.boolean(false),vm.handle("attacktype",0),vm.handle("damagetype",4),vm.handle("weapontype",0)}).bits,"Hero could not damage XP target");};vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(1.f))});kill();auto first=vm.invoke("GetHeroXP",std::array{hero}).bits;require(first>100,"First kill granted no experience");vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(2.f))});kill();auto second=vm.invoke("GetHeroXP",std::array{hero}).bits;require(second-first==2*(first-100),"Kill experience ignored player handicap");auto base=first-100;unsigned divisor=2;while(divisor<128 && base%divisor!=divisor/2)divisor*=2;require(divisor<=64 && base%divisor==divisor/2,"Kill XP fixture cannot exercise half rounding");vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(1.f/float(divisor)))});kill();auto third=vm.invoke("GetHeroXP",std::array{hero}).bits;require(third-second==base/divisor+1,"Half-point kill experience did not round up");require(base==40,"Shared kill XP fixture source amount differs");auto ally1=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<int>(ObjectData::code("Hpal"))),zero,zero,zero}),ally2=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<int>(ObjectData::code("Hpal"))),zero,zero,zero});vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(.1875f))});kill();require(vm.invoke("GetHeroXP",std::array{hero}).bits==third+2 && vm.invoke("GetHeroXP",std::array{ally1}).bits==2 && vm.invoke("GetHeroXP",std::array{ally2}).bits==2,"Shared kill experience did not use original real arithmetic");vm.invoke("RemoveUnit",std::array{ally1});vm.invoke("RemoveUnit",std::array{ally2});auto resetHero=[&](int xp){vm.invoke("RemoveUnit",std::array{hero});hero=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<int>(ObjectData::code("Hpal"))),zero,zero,zero});vm.invoke("SetHeroXP",std::array{hero,vm.integer(xp),vm.boolean(false)});};vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(1.f))});auto neutral=vm.invoke("Player",std::array{vm.integer(12)});vm.invoke("SetPlayerAlliance",std::array{player,neutral,vm.handle("alliancetype",0),vm.boolean(false)});auto killCreep=[&](jass::Value owner){auto creep=vm.invoke("CreateUnit",std::array{owner,vm.integer(std::bit_cast<int>(ObjectData::code("hfoo"))),zero,zero,zero});require(vm.invoke("UnitDamageTarget",std::array{hero,creep,vm.real(real(10000)),vm.boolean(true),vm.boolean(false),vm.handle("attacktype",0),vm.handle("damagetype",4),vm.handle("weapontype",0)}).bits,"Hero could not damage creep");};resetHero(0);killCreep(neutral);require(vm.invoke("GetHeroXP",std::array{hero}).bits==32,"Same-level creep XP differs");resetHero(190);vm.invoke("SetHeroXP",std::array{hero,vm.integer(50),vm.boolean(false)});require(vm.invoke("GetHeroXP",std::array{hero}).bits==190,"SetHeroXP decreased experience");vm.invoke("SuspendHeroXP",std::array{hero,vm.boolean(true)});vm.invoke("SetHeroXP",std::array{hero,vm.integer(500),vm.boolean(false)});vm.invoke("SetHeroLevel",std::array{hero,vm.integer(3),vm.boolean(false)});require(vm.invoke("GetHeroXP",std::array{hero}).bits==190 && vm.invoke("GetHeroLevel",std::array{hero}).bits==1,"Suspended hero XP or level changed");vm.invoke("SuspendHeroXP",std::array{hero,vm.boolean(false)});killCreep(neutral);require(vm.invoke("GetHeroXP",std::array{hero}).bits==219 && vm.invoke("GetHeroLevel",std::array{hero}).bits==2,"Creep XP did not apply each level factor across the threshold");for(int owner=13;owner<16;++owner){auto other=vm.invoke("Player",std::array{vm.integer(owner)});vm.invoke("SetPlayerAlliance",std::array{player,other,vm.handle("alliancetype",0),vm.boolean(false)});resetHero(0);killCreep(other);require(vm.invoke("GetHeroXP",std::array{hero}).bits==32,"Neutral player creep factor differs");}resetHero(198);vm.invoke("SetPlayerHandicapXP",std::array{player,vm.real(real(100.f))});killCreep(neutral);require(vm.invoke("GetHeroXP",std::array{hero}).bits==1400 && vm.invoke("GetHeroLevel",std::array{hero}).bits==5,"Creep XP did not stop at the zero factor");resetHero(0);vm.invoke("SetHeroXP",std::array{hero,vm.integer(INT_MAX),vm.boolean(false)});require(vm.invoke("GetHeroLevel",std::array{hero}).bits==10 && vm.invoke("GetHeroXP",std::array{hero}).bits==5400,"Hero XP was not capped at the maximum level threshold");for(unsigned state:{1u,2u}){for(auto [value,expected]:std::initializer_list<std::pair<int,int>>{{-1,0},{0,0},{999999,999999},{1000000,1000000},{1000001,1000000},{INT_MAX,0}}){set(player,state,value);require(get(player,state)==expected,"Original resource boundary differs");}}set(player,1,0);vm.invoke("watch");set(player,1,1000001);set(player,1,2000000);require(vm.global("crossed").bits==1 && get(player,1)==1000000,"Resource limit event or clamping differs");set(player,26,42);require(get(player,26)==0 && !session.config().players[0].states.contains(26),"Unsupported player state was retained");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during player state fixture");
    });
    test("food_callbacks_do_not_dispatch_stale_capacity",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type playerstate extends handle
 type limitop extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 native Player takes integer id returns player
 native ConvertPlayerState takes integer id returns playerstate
 native ConvertLimitOp takes integer id returns limitop
 native SetPlayerState takes player p, playerstate state, integer value returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native SetUnitUseFood takes unit u, boolean value returns nothing
 native SetUnitOwner takes unit u, player p, boolean changeColor returns nothing
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterPlayerStateEvent takes trigger t, player p, playerstate state, limitop op, real threshold returns event
 globals
 integer mode=0
 integer observedUsed=0
 integer observedCapacity=0
 integer observedNewUsed=0
 integer observedNewCapacity=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function usedChanged takes nothing returns nothing
 set observedUsed=observedUsed+1
 if mode == 3 or mode == 5 then
 call SetPlayerState(Player(0),ConvertPlayerState(4),2)
 call SetPlayerState(Player(1),ConvertPlayerState(5),0)
 call SetPlayerState(Player(1),ConvertPlayerState(4),0)
 if mode == 5 then
 call SetPlayerState(Player(0),ConvertPlayerState(4),0)
 call SetPlayerState(Player(1),ConvertPlayerState(5),2)
 call SetPlayerState(Player(1),ConvertPlayerState(4),3)
 endif
 elseif mode < 2 then
 call SetPlayerState(Player(0),ConvertPlayerState(4),2)
 if mode == 1 then
 call SetPlayerState(Player(0),ConvertPlayerState(4),0)
 endif
 endif
 endfunction
 function capacityChanged takes nothing returns nothing
 set observedCapacity=observedCapacity+1
 endfunction
 function newUsedChanged takes nothing returns nothing
 set observedNewUsed=observedNewUsed+1
 endfunction
 function newCapacityChanged takes nothing returns nothing
 set observedNewCapacity=observedNewCapacity+1
 endfunction
 function registerWatch takes integer selected returns nothing
 local trigger used=CreateTrigger()
 local trigger capacity=CreateTrigger()
 local trigger newUsed=CreateTrigger()
 local trigger newCapacity=CreateTrigger()
 set mode=selected
 call TriggerAddAction(used,function usedChanged)
 call TriggerAddAction(capacity,function capacityChanged)
 call TriggerAddAction(newUsed,function newUsedChanged)
 call TriggerAddAction(newCapacity,function newCapacityChanged)
 call TriggerRegisterPlayerStateEvent(used,Player(0),ConvertPlayerState(5),ConvertLimitOp(0),1.0)
 call TriggerRegisterPlayerStateEvent(capacity,Player(0),ConvertPlayerState(4),ConvertLimitOp(0),1.0)
 call TriggerRegisterPlayerStateEvent(newUsed,Player(1),ConvertPlayerState(5),ConvertLimitOp(4),1.0)
 call TriggerRegisterPlayerStateEvent(newCapacity,Player(1),ConvertPlayerState(4),ConvertLimitOp(4),1.0)
 endfunction
 )jass";for(int mode:{0,1,2,3,4,5}){auto module=Module::compile(Program::parse({{"food-state-reentry.j",source,"authored food event reentry test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto zero=vm.real(real(0)),player=vm.invoke("Player",std::array{vm.integer(0)}),worker=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),zero,zero,zero});auto unit=session.units().at(worker.bits);unit->foodMade=3;vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",5),vm.integer(unit->foodUsed)});vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",4),vm.integer(3)});auto nextPlayer=vm.invoke("Player",std::array{vm.integer(1)});for(unsigned state:{4u,5u})vm.invoke("SetPlayerState",std::array{nextPlayer,vm.handle("playerstate",state),vm.integer(0)});vm.invoke("registerWatch",std::array{vm.integer(mode)});if(mode>=3)vm.invoke("SetUnitOwner",std::array{worker,nextPlayer,vm.boolean(false)});else vm.invoke("SetUnitUseFood",std::array{worker,vm.boolean(false)});require(vm.global("observedUsed").bits==1 && vm.global("observedCapacity").bits==unsigned(mode==1 || mode==2 || mode==4 || mode==5?1:0),"Food callback dispatched stale capacity event");require(session.config().players[0].states.at(4)==(mode==0 || mode==3?2:0),"Food callback capacity was not retained");if(mode>=3){auto expected=mode==3?0u:1u;require(vm.global("observedNewUsed").bits==expected && vm.global("observedNewCapacity").bits==expected && session.config().players[1].states.at(5)==(mode==3?0:2) && session.config().players[1].states.at(4)==(mode==3?0:3),"Transfer callback dispatched stale recipient food events");}}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during food callback fixture");
    });
    test("transfer_resource_callbacks_ignore_stale_events",[&]{
        std::string source=R"jass(type destructable extends handle
 type player extends handle
 type playerstate extends handle
 type limitop extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 native Player takes integer id returns player
 native ConvertPlayerState takes integer id returns playerstate
 native ConvertLimitOp takes integer id returns limitop
 native SetPlayerState takes player p, playerstate state, integer value returns nothing
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterPlayerStateEvent takes trigger t, player p, playerstate state, limitop op, real threshold returns event
 globals
 integer mode=0
 integer senderGold=0
 integer senderLumber=0
 integer targetGold=0
 integer targetLumber=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function goldChanged takes nothing returns nothing
 set senderGold=senderGold+1
 if mode == 1 then
 call SetPlayerState(Player(0),ConvertPlayerState(2),80)
 call SetPlayerState(Player(0),ConvertPlayerState(2),90)
 elseif mode == 2 then
 call SetPlayerState(Player(1),ConvertPlayerState(1),20)
 call SetPlayerState(Player(1),ConvertPlayerState(1),10)
 elseif mode == 3 then
 call SetPlayerState(Player(1),ConvertPlayerState(2),20)
 call SetPlayerState(Player(1),ConvertPlayerState(2),10)
 elseif mode == 4 then
 call SetPlayerState(Player(2),ConvertPlayerState(2),7)
 elseif mode == 5 then
 call SetPlayerState(Player(0),ConvertPlayerState(2),90)
 elseif mode == 6 then
 call SetPlayerState(Player(0),ConvertPlayerState(2),99)
 endif
 endfunction
 function lumberChanged takes nothing returns nothing
 set senderLumber=senderLumber+1
 endfunction
 function targetGoldChanged takes nothing returns nothing
 set targetGold=targetGold+1
 if mode == 7 then
 call SetPlayerState(Player(0),ConvertPlayerState(2),80)
 call SetPlayerState(Player(0),ConvertPlayerState(2),90)
 elseif mode == 8 then
 call SetPlayerState(Player(1),ConvertPlayerState(2),20)
 call SetPlayerState(Player(1),ConvertPlayerState(2),10)
 endif
 endfunction
 function targetLumberChanged takes nothing returns nothing
 set targetLumber=targetLumber+1
 endfunction
 function registerWatch takes integer selected returns nothing
 local trigger a=CreateTrigger()
 local trigger b=CreateTrigger()
 local trigger c=CreateTrigger()
 local trigger d=CreateTrigger()
 set mode=selected
 call TriggerAddAction(a,function goldChanged)
 call TriggerAddAction(b,function lumberChanged)
 call TriggerAddAction(c,function targetGoldChanged)
 call TriggerAddAction(d,function targetLumberChanged)
 call TriggerRegisterPlayerStateEvent(a,Player(0),ConvertPlayerState(1),ConvertLimitOp(0),95.0)
 call TriggerRegisterPlayerStateEvent(b,Player(0),ConvertPlayerState(2),ConvertLimitOp(0),95.0)
 call TriggerRegisterPlayerStateEvent(c,Player(1),ConvertPlayerState(1),ConvertLimitOp(4),0.0)
 call TriggerRegisterPlayerStateEvent(d,Player(1),ConvertPlayerState(2),ConvertLimitOp(4),0.0)
 endfunction
 )jass";for(int mode:{0,1,2,3,4,5,6,7,8}){auto info=map().info;info.players.push_back({1,1,0,0,"Other",{},0,0});auto module=Module::compile(Program::parse({{"transfer-state-reentry.j",source,"resource transfer reentry"}}));ScriptSession session(std::move(module),info);session.attachWorld(world());session.configure();PlayerSetup setup(info,session.config());require(setup.control(1,SlotControl::ComputerNormal),"Cannot activate transfer recipient");session.applySetup(setup);session.startMain();require(session.setAllianceOption(0,1,0,true),"Cannot ally transfer recipient");auto& vm=session.runtime();for(int player=0;player<2;++player)for(int state=1;state<=2;++state)vm.invoke("SetPlayerState",std::array{vm.invoke("Player",std::array{vm.integer(player)}),vm.handle("playerstate",state),vm.integer(player?0:100)});vm.invoke("registerWatch",std::array{vm.integer(mode)});require(session.transferResources(0,1,10,10),"Resource transfer rejected");require(vm.global("senderGold").bits==1 && vm.global("senderLumber").bits==unsigned(mode!=1 && mode!=6 && mode!=7) && vm.global("targetGold").bits==unsigned(mode!=2) && vm.global("targetLumber").bits==unsigned(mode!=3 && mode!=8),"Transfer dispatched stale resource event");require(session.config().players[0].states.at(1)==90 && session.config().players[0].states.at(2)==(mode==6?99:90) && session.config().players[1].states.at(1)==10 && session.config().players[1].states.at(2)==10,"Transfer balances differ");if(mode==4)require(session.config().players[2].states.at(2)==7,"Unrelated state was lost");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during transfer fixture");
    });
    test("resource_callbacks_do_not_dispatch_stale_mined_total",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type playerstate extends handle
 type limitop extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 native Player takes integer id returns player
 native ConvertPlayerState takes integer id returns playerstate
 native ConvertLimitOp takes integer id returns limitop
 native SetPlayerState takes player p, playerstate state, integer value returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native CreateBlightedGoldmine takes player p, real x, real y, real facing returns unit
 native SetResourceAmount takes unit u, integer amount returns nothing
 native IssueTargetOrder takes unit u, string order, widget target returns boolean
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterPlayerStateEvent takes trigger t, player p, playerstate state, limitop op, real threshold returns event
 globals
 integer mode=0
 integer observedGold=0
 integer observedTotal=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function goldChanged takes nothing returns nothing
 set observedGold=observedGold+1
 if mode < 2 then
 call SetPlayerState(Player(0),ConvertPlayerState(15),0)
 if mode == 1 then
 call SetPlayerState(Player(0),ConvertPlayerState(15),2)
 endif
 elseif mode == 3 then
 call SetPlayerState(Player(0),ConvertPlayerState(2),7)
 endif
 endfunction
 function totalChanged takes nothing returns nothing
 set observedTotal=observedTotal+1
 endfunction
 function registerWatch takes integer selected returns nothing
 local trigger gold=CreateTrigger()
 local trigger total=CreateTrigger()
 set mode=selected
 call TriggerAddAction(gold,function goldChanged)
 call TriggerAddAction(total,function totalChanged)
 call TriggerRegisterPlayerStateEvent(gold,Player(0),ConvertPlayerState(1),ConvertLimitOp(4),0.0)
 call TriggerRegisterPlayerStateEvent(total,Player(0),ConvertPlayerState(15),ConvertLimitOp(4),0.0)
 endfunction
 )jass";for(int mode:{0,1,2,3}){auto module=Module::compile(Program::parse({{"mined-state-reentry.j",source,"authored resource event reentry test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto zero=vm.real(real(0)),player=vm.invoke("Player",std::array{vm.integer(0)});for(unsigned state:{1u,15u})vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",state),vm.integer(0)});auto mine=vm.invoke("CreateBlightedGoldmine",std::array{player,zero,zero,zero}),worker=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("uaco"))),vm.real(real(64)),zero,zero});vm.invoke("SetResourceAmount",std::array{mine,vm.integer(30)});vm.invoke("registerWatch",std::array{vm.integer(mode)});require(vm.invoke("IssueTargetOrder",std::array{worker,vm.string("harvest"),vm.handle("widget",mine.bits)}).bits,"Acolyte harvest order rejected");session.advance(1.125);require(vm.global("observedGold").bits==1 && vm.global("observedTotal").bits==unsigned(mode?1:0),"Resource callback dispatched stale mined-total event");require(session.config().players[0].states.at(15)==(mode?2:0),"Resource callback total was not retained");if(mode==3)require(session.config().players[0].states.at(2)==7,"Unrelated resource change was not retained");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during resource callback fixture");
    });
    test("created_blighted_mine_supports_harvesting_and_depletion",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type playerstate extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type limitop extends handle
 native ConvertLimitOp takes integer n returns limitop
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code c returns triggeraction
 native TriggerRegisterPlayerStateEvent takes trigger t, player p, playerstate state, limitop op, real value returns event
 native RemoveUnit takes unit u returns nothing
 native Player takes integer id returns player
 native SetPlayerState takes player p, playerstate state, integer value returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native CreateBlightedGoldmine takes player p, real x, real y, real facing returns unit
 native IssueTargetOrder takes unit u, string order, widget target returns boolean
 native GetResourceAmount takes unit u returns integer
 native SetResourceAmount takes unit u, integer amount returns nothing
 globals
 unit watchMine=null
 boolean refill=false
 integer observed=0
 endglobals
 function onGold takes nothing returns nothing
 if refill then
 call SetResourceAmount(watchMine,50)
 endif
 call RemoveUnit(watchMine)
 set observed=observed+1
 endfunction
 function watch takes unit mine, boolean shouldRefill returns nothing
 set watchMine=mine
 set refill=shouldRefill
 endfunction
 function registerWatch takes nothing returns nothing
 local trigger t=CreateTrigger()
 call TriggerAddAction(t,function onGold)
 call TriggerRegisterPlayerStateEvent(t,Player(0),ConvertPlayerState(1),ConvertLimitOp(4),0.0)
 endfunction
 native ConvertPlayerState takes integer n returns playerstate
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto module=Module::compile(Program::parse({{"created-mine-harvest.j",source,"authored created mine harvest test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto zero=vm.real(real(0)),player=vm.invoke("Player",std::array{vm.integer(0)});vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",1),vm.integer(0)});auto mine=vm.invoke("CreateBlightedGoldmine",std::array{player,zero,zero,zero}),worker=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("uaco"))),vm.real(real(64)),zero,zero});auto sourceId=session.units().at(mine.bits)->mineSource;vm.invoke("SetResourceAmount",std::array{mine,vm.integer(30)});require(vm.invoke("IssueTargetOrder",std::array{worker,vm.string("harvest"),vm.handle("widget",mine.bits)}).bits,"Created haunted mine rejected harvest order");session.advance(5);auto remaining=vm.invoke("GetResourceAmount",std::array{mine}).bits;require(remaining<30 && session.config().players[0].states.at(1)>0 && remaining==vm.invoke("GetResourceAmount",std::array{vm.handle("unit",sourceId)}).bits,"Harvest did not credit gold or consume shared mine resources");vm.invoke("SetResourceAmount",std::array{mine,vm.integer(3)});session.advance(5);auto cover=session.units().at(mine.bits),base=session.units().at(sourceId),acolyte=session.units().at(worker.bits);require(vm.invoke("GetResourceAmount",std::array{mine}).bits==0 && std::bit_cast<float>(cover->life.bits())<=0 && std::bit_cast<float>(base->life.bits())<=0 && acolyte->gather.phase==GatherOrder::Phase::None,"Mine depletion did not end both mine layers and worker harvest");vm.invoke("registerWatch");for(bool refill:{false,true}){vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",1),vm.integer(0)});auto next=vm.invoke("CreateBlightedGoldmine",std::array{player,zero,zero,zero});auto nextSource=session.units().at(next.bits)->mineSource;vm.invoke("SetResourceAmount",std::array{next,vm.integer(1)});vm.invoke("watch",std::array{next,vm.boolean(refill)});require(vm.invoke("IssueTargetOrder",std::array{worker,vm.string("harvest"),vm.handle("widget",next.bits)}).bits,"Callback mine rejected harvest");session.advance(2);require(vm.global("observed").bits==unsigned(refill?2:1) && !session.units().contains(next.bits),"Gold callback did not remove cover");auto baseState=session.units().at(nextSource);require(refill?(std::bit_cast<float>(baseState->life.bits())>0 && baseState->resources==50):(std::bit_cast<float>(baseState->life.bits())<=0 && baseState->resources==0),"Gold callback changed depleted source lifecycle");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during harvest fixture");
    });
    test("blighted_mine_rejects_invalid_owner_without_orphan",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 native Player takes integer id returns player
 native CreateTimer takes nothing returns timer
 native CreateBlightedGoldmine takes player p, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native GetResourceAmount takes unit u returns integer
 native SetResourceAmount takes unit u, integer amount returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto module=Module::compile(Program::parse({{"invalid-blighted-mine.j",source,"authored mine ownership test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto zero=vm.real(real(0)),timer=vm.invoke("CreateTimer");auto before=session.units().size();for(auto id:{0u,timer.bits}){auto invalid=vm.handle("player",id);require(!vm.invoke("CreateBlightedGoldmine",std::array{invalid,zero,zero,zero}).bits && session.units().size()==before,"Invalid owner left an orphan gold mine");}auto player=vm.invoke("Player",std::array{vm.integer(0)});auto mine=vm.invoke("CreateBlightedGoldmine",std::array{player,zero,zero,zero});require(mine.bits && session.units().size()==before+2,"Valid haunted mine did not create its pair");auto sourceId=session.units().at(mine.bits)->mineSource;require(sourceId && session.units().contains(sourceId) && session.units().at(sourceId)->mineCover==mine.bits,"Haunted mine did not link to its source");vm.invoke("SetResourceAmount",std::array{mine,vm.integer(1234)});require(vm.invoke("GetResourceAmount",std::array{mine}).bits==1234 && vm.invoke("GetResourceAmount",std::array{vm.handle("unit",sourceId)}).bits==1234,"Mine pair did not share resources");vm.invoke("RemoveUnit",std::array{mine});require(session.units().contains(sourceId) && !session.units().at(sourceId)->mineCover && !session.units().at(sourceId)->hidden(),"Removing cover did not release gold mine");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during mine fixture");
    });
    test("unit_creation_rejects_invalid_players_and_locations",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type location extends handle
 type race extends handle
 native Player takes integer id returns player
 native CreateTimer takes nothing returns timer
 native Location takes real x, real y returns location
 native RemoveLocation takes location p returns nothing
 native RemoveUnit takes unit u returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native CreateUnitAtLoc takes player p, integer id, location loc, real facing returns unit
 native CreateUnitByName takes player p, string name, real x, real y, real facing returns unit
 native CreateUnitAtLocByName takes player p, string name, location loc, real facing returns unit
 native GetUnitRace takes unit u returns race
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto module=Module::compile(Program::parse({{"unit-create-invalid.j",source,"authored unit creation handle test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)}),zero=vm.real(real(0)),code=vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),name=vm.string("hfoo"),timer=vm.invoke("CreateTimer"),loc=vm.invoke("Location",std::array{zero,zero}),removed=vm.invoke("Location",std::array{zero,zero});vm.invoke("RemoveLocation",std::array{removed});auto count=session.units().size();for(auto id:{0u,timer.bits}){auto invalid=vm.handle("player",id);require(!vm.invoke("CreateUnit",std::array{invalid,code,zero,zero,zero}).bits && !vm.invoke("CreateUnitByName",std::array{invalid,name,zero,zero,zero}).bits && !vm.invoke("CreateUnitAtLoc",std::array{invalid,code,loc,zero}).bits && !vm.invoke("CreateUnitAtLocByName",std::array{invalid,name,loc,zero}).bits,"Invalid player created a unit");}for(auto id:{0u,removed.bits,timer.bits}){auto invalid=vm.handle("location",id);require(!vm.invoke("CreateUnitAtLoc",std::array{player,code,invalid,zero}).bits && !vm.invoke("CreateUnitAtLocByName",std::array{player,name,invalid,zero}).bits,"Invalid location created a unit");}require(session.units().size()==count,"Rejected creation changed unit population");for(auto value:{vm.invoke("CreateUnit",std::array{player,code,zero,zero,zero}),vm.invoke("CreateUnitByName",std::array{player,name,zero,zero,zero}),vm.invoke("CreateUnitAtLoc",std::array{player,code,loc,zero}),vm.invoke("CreateUnitAtLocByName",std::array{player,name,loc,zero})}){require(value.bits && vm.invoke("GetUnitRace",std::array{value}).bits==1,"Valid unit creation or race failed");vm.invoke("RemoveUnit",std::array{value});require(!vm.invoke("GetUnitRace",std::array{value}).bits,"Removed unit race was not null");}require(!vm.invoke("GetUnitRace",std::array{vm.handle("unit",0)}).bits && !vm.invoke("GetUnitRace",std::array{vm.handle("unit",timer.bits)}).bits,"Invalid unit race was not null");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during unit creation fixture");
    });
    test("immediate_order_rejects_invalid_units_without_stopping_trigger",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native CreateTimer takes nothing returns timer
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterTimerEvent takes trigger t, real timeout, boolean periodic returns event
 native IssueImmediateOrder takes unit u, string order returns boolean
 native IssueImmediateOrderById takes unit u, integer order returns boolean
 globals
 unit removed=null
 unit active=null
 integer continued=0
 boolean activeOrder=false
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function act takes nothing returns nothing
 call IssueImmediateOrder(removed,"stop")
 call IssueImmediateOrderById(removed,851972)
 set activeOrder=IssueImmediateOrder(active,"stop")
 set continued=continued+1
 endfunction
 function setup takes nothing returns nothing
 local trigger t=CreateTrigger()
 set removed=CreateUnit(Player(0),'hfoo',0.0,0.0,0.0)
 set active=CreateUnit(Player(0),'hfoo',20.0,0.0,0.0)
 call RemoveUnit(removed)
 call TriggerAddAction(t,function act)
 call TriggerRegisterTimerEvent(t,0.03125,false)
 endfunction
 )jass";auto module=Module::compile(Program::parse({{"invalid-order.j",source,"authored invalid immediate order test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("setup");auto timer=vm.invoke("CreateTimer");for(auto id:{0u,vm.global("removed").bits,timer.bits}){auto invalid=vm.handle("unit",id);require(!vm.invoke("IssueImmediateOrder",std::array{invalid,vm.string("stop")}).bits && !vm.invoke("IssueImmediateOrderById",std::array{invalid,vm.integer(851972)}).bits,"Invalid immediate order was accepted");}session.advance(.25);require(vm.global("continued").bits==1,"Immediate order stopped trigger");require(vm.global("activeOrder").bits,"Immediate order rejected live unit");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during order fixture");
    });
    test("unit_motion_natives_ignore_invalid_handles",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native KillUnit takes unit u returns nothing
 native UnitApplyTimedLife takes unit u, integer buff, real duration returns nothing
 native UnitPauseTimedLife takes unit u, boolean paused returns nothing
 native SetUnitAcquireRange takes unit u, real r returns nothing
 native GetUnitAcquireRange takes unit u returns real
 native SetUnitTurnSpeed takes unit u, real r returns nothing
 native SetUnitPropWindow takes unit u, real r returns nothing
 native GetUnitTurnSpeed takes unit u returns real
 native GetUnitDefaultTurnSpeed takes unit u returns real
 native GetUnitPropWindow takes unit u returns real
 native GetUnitDefaultPropWindow takes unit u returns real
 native CreateTimer takes nothing returns timer
 native SetUnitX takes unit u, real x returns nothing
 native SetUnitY takes unit u, real y returns nothing
 native GetUnitX takes unit u returns real
 native GetUnitY takes unit u returns real
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto module=Module::compile(Program::parse({{"unit-position.j",source,"authored invalid position handle test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)}),zero=vm.real(real(0)),valid=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),zero,zero,zero}),removed=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),zero,zero,zero}),timer=vm.invoke("CreateTimer");vm.invoke("RemoveUnit",std::array{removed});auto invalidReal=vm.real(Real::fromBits(0x7fc00000));for(auto id:{0u,removed.bits,timer.bits}){auto invalid=vm.handle("unit",id);vm.invoke("SetUnitX",std::array{invalid,invalidReal});vm.invoke("SetUnitY",std::array{invalid,invalidReal});vm.invoke("SetUnitAcquireRange",std::array{invalid,invalidReal});vm.invoke("SetUnitTurnSpeed",std::array{invalid,invalidReal});vm.invoke("SetUnitPropWindow",std::array{invalid,invalidReal});vm.invoke("KillUnit",std::array{invalid});vm.invoke("UnitApplyTimedLife",std::array{invalid,vm.integer(0),invalidReal});vm.invoke("UnitPauseTimedLife",std::array{invalid,vm.boolean(true)});for(auto name:{"GetUnitAcquireRange","GetUnitTurnSpeed","GetUnitDefaultTurnSpeed","GetUnitPropWindow","GetUnitDefaultPropWindow"})require(vm.invoke(name,std::array{invalid}).bits==0,"Invalid unit motion query did not return zero");require(vm.invoke("GetUnitX",std::array{invalid}).bits==0 && vm.invoke("GetUnitY",std::array{invalid}).bits==0,"Invalid unit coordinate did not return zero");}vm.invoke("SetUnitX",std::array{valid,vm.real(real(42))});vm.invoke("SetUnitY",std::array{valid,vm.real(real(-17))});require(vm.invoke("GetUnitX",std::array{valid}).bits==real(42).bits() && vm.invoke("GetUnitY",std::array{valid}).bits==real(-17).bits(),"Valid unit position did not change");vm.invoke("SetUnitAcquireRange",std::array{valid,vm.real(real(333))});vm.invoke("SetUnitTurnSpeed",std::array{valid,vm.real(real(1))});vm.invoke("SetUnitPropWindow",std::array{valid,vm.real(real(2))});require(vm.invoke("GetUnitAcquireRange",std::array{valid}).bits==real(333).bits() && vm.invoke("GetUnitTurnSpeed",std::array{valid}).bits==real(1).bits() && vm.invoke("GetUnitPropWindow",std::array{valid}).bits==real(2).bits(),"Valid motion settings did not change");vm.invoke("UnitApplyTimedLife",std::array{valid,vm.integer(0),vm.real(real(2))});vm.invoke("UnitPauseTimedLife",std::array{valid,vm.boolean(true)});session.advance(1);require(session.units().at(valid.bits)->timedLife && session.units().at(valid.bits)->timedLife->remaining==2,"Paused timed life advanced");vm.invoke("UnitPauseTimedLife",std::array{valid,vm.boolean(false)});session.advance(2);require(session.units().at(valid.bits)->life.bits()==0,"Timed life did not expire after resume");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during position fixture");
    });
    test("collections_rebuild_geometry_forces_and_ordered_groups",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type group extends handle
 type force extends handle
 type location extends handle
 type rect extends handle
 type region extends handle
 native CreateRegion takes nothing returns region
 native RegionAddRect takes region which, rect bounds returns nothing
 native RegionClearRect takes region which, rect bounds returns nothing
 native IsPointInRegion takes region which, real x, real y returns boolean
 native Player takes integer id returns player
 native CreateTimer takes nothing returns timer
 native CreateUnit takes player owner, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit which returns nothing
 native CreateGroup takes nothing returns group
 native GroupAddUnit takes group which, unit member returns nothing
 native FirstOfGroup takes group which returns unit
 native IsUnitInGroup takes unit member, group which returns boolean
 native ForGroup takes group which, code action returns nothing
 native GetEnumUnit takes nothing returns unit
 native CreateForce takes nothing returns force
 native ForceAddPlayer takes force which, player member returns nothing
 native IsPlayerInForce takes player member, force which returns boolean
 native Location takes real x, real y returns location
 native MoveLocation takes location which, real x, real y returns nothing
 native GetLocationX takes location which returns real
 native GetLocationY takes location which returns real
 native Rect takes real x1, real y1, real x2, real y2 returns rect
 native GetRectMinX takes rect which returns real
 native GetRectMaxY takes rect which returns real
 globals
 group baseline=CreateGroup()
 group members=null
 force team=null
 location point=null
 rect bounds=null
 region area=null
 unit living=null
 unit firstUnit=null
 integer enumerated=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function createUnits takes nothing returns nothing
 set living=CreateUnit(Player(0),'hfoo',0.0,0.0,0.0)
 set firstUnit=CreateUnit(Player(0),'hfoo',100.0,0.0,0.0)
 endfunction
 function setup takes nothing returns nothing
 set members=CreateGroup()
 call GroupAddUnit(members,firstUnit)
 call GroupAddUnit(members,living)
 set team=CreateForce()
 call ForceAddPlayer(team,Player(0))
 call ForceAddPlayer(team,Player(2))
 set point=Location(3.5,4.5)
 call MoveLocation(point,-12.25,9.5)
 set bounds=Rect(-100.0,-50.0,100.0,50.0)
 set area=CreateRegion()
 call RegionAddRect(area,bounds)
 call RegionClearRect(area,Rect(-10.0,-10.0,10.0,10.0))
 endfunction
 function countMember takes nothing returns nothing
 if GetEnumUnit()==living then
 set enumerated=enumerated+1
 endif
 endfunction
 function enumerate takes nothing returns nothing
 call ForGroup(members,function countMember)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"collections.j",source,"authored collection persistence test"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=create(),restored=create();auto& a=original->runtime();auto& b=restored->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto legacyCurrent=original->encodeCollections(identity);auto legacyContent=openSnapshot(legacyCurrent,32u*1024u*1024u);Bytes legacy(legacyContent.begin(),legacyContent.end());legacy[4]=1;auto legacySnapshot=sealSnapshot(std::move(legacy),32u*1024u*1024u);auto legacyTarget=create();require(legacyTarget->rebuildCollections(legacySnapshot,{}).size()==1,"Legacy collection snapshot failed");original->startMain();a.invoke("createUnits");a.invoke("setup");auto live=a.global("living"),first=a.global("firstUnit"),group=a.global("members");require(a.invoke("FirstOfGroup",std::array{group}).bits==first.bits && a.invoke("IsUnitInGroup",std::array{first,group}).bits,"First group member was not retained by fixture");auto collections=original->encodeCollections(identity),globals=a.encodeGlobals(identity);auto invalidContent=openSnapshot(collections,32u*1024u*1024u);Bytes invalidVersion(invalidContent.begin(),invalidContent.end());invalidVersion[4]=1;auto invalidLegacy=sealSnapshot(std::move(invalidVersion),32u*1024u*1024u);b.invoke("CreateTimer");b.invoke("createUnits");auto targetLive=b.global("living"),targetDead=b.global("firstUnit"),oldBaseline=b.global("baseline");auto decodeUnit=[&](std::string_view type,std::uint32_t id){if(type!="unit")return 0u;return id==live.bits?targetLive.bits:id==first.bits?targetDead.bits:0u;};rejects([&]{restored->rebuildCollections(invalidLegacy,decodeUnit);},"Invalid collection snapshot entry");auto bad=collections;bad.back()^=1;rejects([&]{restored->rebuildCollections(bad,decodeUnit);},"digest");rejects([&]{restored->rebuildCollections(collections,[&](std::string_view,std::uint32_t){return targetLive.bits;});},"unit mapping");require(b.global("baseline").bits==oldBaseline.bits && restored->liveObjects(NativeKind::Group)==1,"Rejected collection restore changed initial group");auto mapping=restored->rebuildCollections(collections,decodeUnit);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return decodeUnit(type,id);auto found=mapping.find({std::string(type),id});return found==mapping.end()?0u:found->second;};b.restoreGlobals(globals,decode);auto g=b.global("members"),f=b.global("team"),loc=b.global("point"),rect=b.global("bounds");require(b.global("baseline").bits!=oldBaseline.bits && b.invoke("FirstOfGroup",std::array{g}).bits==targetDead.bits && b.invoke("IsUnitInGroup",std::array{targetDead,g}).bits && b.invoke("IsUnitInGroup",std::array{targetLive,g}).bits,"Group order, membership or global mapping changed");require(b.invoke("GetLocationX",std::array{loc}).bits==a.invoke("GetLocationX",std::array{a.global("point")}).bits && b.invoke("GetLocationY",std::array{loc}).bits==a.invoke("GetLocationY",std::array{a.global("point")}).bits && b.invoke("GetRectMinX",std::array{rect}).bits==a.invoke("GetRectMinX",std::array{a.global("bounds")}).bits && b.invoke("GetRectMaxY",std::array{rect}).bits==a.invoke("GetRectMaxY",std::array{a.global("bounds")}).bits,"Geometry values changed");auto area=b.global("area");auto inRegion=[&](float x,float y){return b.invoke("IsPointInRegion",std::array{area,b.real(real(x)),b.real(real(y))}).bits!=0;};require(inRegion(50,0) && !inRegion(0,0) && !inRegion(200,0),"Region membership changed");auto player0=b.invoke("Player",std::array{b.integer(0)}),player1=b.invoke("Player",std::array{b.integer(1)}),player2=b.invoke("Player",std::array{b.integer(2)});require(b.invoke("IsPlayerInForce",std::array{player0,f}).bits && !b.invoke("IsPlayerInForce",std::array{player1,f}).bits && b.invoke("IsPlayerInForce",std::array{player2,f}).bits,"Force membership changed");b.invoke("enumerate");require(b.global("enumerated").bits==1,"Group iteration did not visit the expected member");auto inverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==targetLive.bits?live.bits:id==targetDead.bits?first.bits:0u;for(auto& [key,value]:mapping)if(key.first==type && value==id)return key.second;return 0u;};require(restored->encodeCollections(inverse)==collections,"Collection snapshot did not round-trip");b.invoke("RemoveUnit",std::array{targetDead});require(b.invoke("FirstOfGroup",std::array{g}).bits==targetLive.bits && !b.invoke("IsUnitInGroup",std::array{targetDead,g}).bits,"Removed unit remained in restored group");
    });
    test("spatial_events_rebuild_members_filters_and_order",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type region extends handle
 type rect extends handle
 type boolexpr extends handle
 type filterfunc extends boolexpr
 native Player takes integer id returns player
 native CreateUnit takes player owner, integer id, real x, real y, real facing returns unit
 native SetUnitX takes unit u, real x returns nothing
 native CreateTimer takes nothing returns timer
 native CreateTrigger takes nothing returns trigger
 native DestroyTrigger takes trigger t returns nothing
 native TriggerAddAction takes trigger t, code c returns triggeraction
 native CreateRegion takes nothing returns region
 native Rect takes real x1, real y1, real x2, real y2 returns rect
 native RegionAddRect takes region r, rect b returns nothing
 native Filter takes code c returns filterfunc
 native TriggerRegisterEnterRegion takes trigger t, region r, boolexpr f returns event
 native TriggerRegisterLeaveRegion takes trigger t, region r, boolexpr f returns event
 native TriggerRegisterUnitInRange takes trigger t, unit u, real radius, boolexpr f returns event
 native GetFilterUnit takes nothing returns unit
 globals
 unit observer=null
 unit member=null
 region area=null
 trigger enterTrigger=null
 trigger leaveTrigger=null
 trigger rangeTrigger=null
 integer enters=0
 integer leaves=0
 integer ranges=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function makeUnits takes nothing returns nothing
 set observer=CreateUnit(Player(0),'hfoo',0.0,0.0,0.0)
 set member=CreateUnit(Player(0),'hfoo',20.0,0.0,0.0)
 endfunction
 function accepts takes nothing returns boolean
 return GetFilterUnit()==member
 endfunction
 function onEnter takes nothing returns nothing
 set enters=enters+1
 endfunction
 function onLeave takes nothing returns nothing
 set leaves=leaves+1
 endfunction
 function onRange takes nothing returns nothing
 set ranges=ranges+1
 endfunction
 function setup takes nothing returns nothing
 set area=CreateRegion()
 call RegionAddRect(area,Rect(-50.0,-50.0,50.0,50.0))
 set enterTrigger=CreateTrigger()
 set leaveTrigger=CreateTrigger()
 set rangeTrigger=CreateTrigger()
 call TriggerAddAction(enterTrigger,function onEnter)
 call TriggerAddAction(leaveTrigger,function onLeave)
 call TriggerAddAction(rangeTrigger,function onRange)
 call TriggerRegisterEnterRegion(enterTrigger,area,Filter(function accepts))
 call TriggerRegisterLeaveRegion(leaveTrigger,area,Filter(function accepts))
 call TriggerRegisterUnitInRange(rangeTrigger,observer,40.0,Filter(function accepts))
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"spatial-snapshot.j",source,"authored spatial persistence test"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=create(),restored=create();auto& a=original->runtime();auto& b=restored->runtime();original->startMain();a.invoke("makeUnits");a.invoke("setup");original->advance(.03125);require(a.global("ranges").bits==1 && !a.global("enters").bits,"Spatial fixture did not initialize");auto identity=[](std::string_view,std::uint32_t id){return id;};auto collections=original->encodeCollections(identity),triggers=original->encodeTriggers(identity),events=original->encodeSpatialEvents(identity),globals=a.encodeGlobals(identity);b.invoke("CreateTimer");b.invoke("makeUnits");auto observer=a.global("observer"),member=a.global("member"),targetObserver=b.global("observer"),targetMember=b.global("member");auto units=[&](std::string_view type,std::uint32_t id){return type!="unit"?0u:id==observer.bits?targetObserver.bits:id==member.bits?targetMember.bits:0u;};auto cm=restored->rebuildCollections(collections,units);auto tm=restored->restoreTriggers(triggers);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return units(type,id);if(type=="region" || type=="rect"){auto it=cm.find({std::string(type),id});return it==cm.end()?0u:it->second;}auto it=tm.find({std::string(type),id});return it==tm.end()?0u:it->second;};auto swapped=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==observer.bits?targetMember.bits:id==member.bits?targetObserver.bits:0u;return decode(type,id);};rejects([&]{restored->rebuildSpatialEvents(events,swapped);},"unit order differs");auto bad=events;bad.back()^=1;rejects([&]{restored->rebuildSpatialEvents(bad,decode);},"digest");require(restored->liveObjects(NativeKind::Event)==0,"Rejected spatial restore created events");auto em=restored->rebuildSpatialEvents(events,decode);auto inverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==targetObserver.bits?observer.bits:id==targetMember.bits?member.bits:0u;if(type=="event"){for(auto [stable,local]:em)if(local==id)return stable;}for(auto& [key,local]:cm)if(key.first==type && local==id)return key.second;for(auto& [key,local]:tm)if(key.first==type && local==id)return key.second;return 0u;};require(restored->encodeSpatialEvents(inverse)==events,"Spatial event snapshot did not round-trip");b.restoreGlobals(globals,decode);restored->startMain();original->advance(.03125);restored->advance(.03125);require(b.global("enters").bits==0 && b.global("leaves").bits==0 && b.global("ranges").bits==1,"Restored initial membership fired again");for(auto* session:{original.get(),restored.get()}){auto& vm=session->runtime();vm.invoke("SetUnitX",std::array{vm.global("member"),vm.real(real(200))});session->advance(.03125);vm.invoke("SetUnitX",std::array{vm.global("member"),vm.real(real(20))});session->advance(.03125);}require(a.global("enters").bits==1 && a.global("leaves").bits==1 && a.global("ranges").bits==2 && b.global("enters").bits==a.global("enters").bits && b.global("leaves").bits==a.global("leaves").bits && b.global("ranges").bits==a.global("ranges").bits,"Restored spatial transitions diverged");for(auto* session:{original.get(),restored.get()}){auto& vm=session->runtime();vm.invoke("SetUnitX",std::array{vm.global("observer"),vm.real(real(200))});session->advance(.03125);vm.invoke("SetUnitX",std::array{vm.global("observer"),vm.real(real(0))});session->advance(.03125);}require(b.global("enters").bits==1 && b.global("leaves").bits==1 && b.global("ranges").bits==3 && a.global("ranges").bits==3,"Restored filter or range transitions differ");b.invoke("DestroyTrigger",std::array{b.global("enterTrigger")});require(restored->liveObjects(NativeKind::Event)==2,"Destroyed trigger retained spatial event");
    });
    test("actor_events_rebuild_filters_state_and_dispatch_order",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type boolexpr extends handle
 type filterfunc extends boolexpr
 type playerunitevent extends handle
 type unitevent extends handle
 type unitstate extends handle
 type playerstate extends handle
 type alliancetype extends handle
 type limitop extends handle
 native ConvertPlayerUnitEvent takes integer n returns playerunitevent
 native ConvertUnitEvent takes integer n returns unitevent
 native ConvertUnitState takes integer n returns unitstate
 native ConvertPlayerState takes integer n returns playerstate
 native ConvertAllianceType takes integer n returns alliancetype
 native ConvertLimitOp takes integer n returns limitop
 native Player takes integer id returns player
 native CreateUnit takes player owner, integer id, real x, real y, real facing returns unit
 native CreateTimer takes nothing returns timer
 native KillUnit takes unit u returns nothing
 native RemoveUnit takes unit u returns nothing
 native SetUnitState takes unit u, unitstate state, real value returns nothing
 native SetPlayerState takes player p, playerstate state, integer value returns nothing
 native SetPlayerAlliance takes player p, player other, alliancetype a, boolean value returns nothing
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code c returns triggeraction
 native Filter takes code c returns filterfunc
 native TriggerRegisterPlayerUnitEvent takes trigger t, player p, playerunitevent e, boolexpr f returns event
 native TriggerRegisterUnitEvent takes trigger t, unit u, unitevent e returns event
 native TriggerRegisterUnitStateEvent takes trigger t, unit u, unitstate s, limitop op, real value returns event
 native TriggerRegisterPlayerStateEvent takes trigger t, player p, playerstate s, limitop op, real value returns event
 native TriggerRegisterPlayerAllianceChange takes trigger t, player p, alliancetype a returns event
 native GetFilterUnit takes nothing returns unit
 globals
 unit subject=null
 unit doomed=null
 trigger first=null
 trigger second=null
 trigger third=null
 trigger stateTrigger=null
 trigger playerTrigger=null
 trigger allianceTrigger=null
 integer playerCrossings=0
 integer alliances=0
 integer order=0
 integer crossings=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function makeUnit takes nothing returns nothing
 set subject=CreateUnit(Player(0),'hfoo',0.0,0.0,0.0)
 set doomed=CreateUnit(Player(0),'hfoo',100.0,0.0,0.0)
 endfunction
 function accepts takes nothing returns boolean
 return GetFilterUnit()==subject
 endfunction
 function firstAction takes nothing returns nothing
 set order=order*10+1
 endfunction
 function secondAction takes nothing returns nothing
 set order=order*10+2
 endfunction
 function thirdAction takes nothing returns nothing
 set order=order*10+3
 endfunction
 function crossing takes nothing returns nothing
 set crossings=crossings+1
 endfunction
 function playerCrossing takes nothing returns nothing
 set playerCrossings=playerCrossings+1
 endfunction
 function allianceChanged takes nothing returns nothing
 set alliances=alliances+1
 endfunction
 function setup takes nothing returns nothing
 set first=CreateTrigger()
 set second=CreateTrigger()
 set third=CreateTrigger()
 set stateTrigger=CreateTrigger()
 set playerTrigger=CreateTrigger()
 set allianceTrigger=CreateTrigger()
 call SetPlayerState(Player(0),ConvertPlayerState(1),200)
 call TriggerAddAction(first,function firstAction)
 call TriggerAddAction(second,function secondAction)
 call TriggerAddAction(third,function thirdAction)
 call TriggerAddAction(stateTrigger,function crossing)
 call TriggerAddAction(playerTrigger,function playerCrossing)
 call TriggerAddAction(allianceTrigger,function allianceChanged)
 call TriggerRegisterPlayerUnitEvent(first,Player(0),ConvertPlayerUnitEvent(20),Filter(function accepts))
 call TriggerRegisterUnitEvent(second,subject,ConvertUnitEvent(53))
 call TriggerRegisterUnitEvent(second,doomed,ConvertUnitEvent(53))
 call RemoveUnit(doomed)
 call TriggerRegisterPlayerUnitEvent(third,Player(0),ConvertPlayerUnitEvent(20),null)
 call TriggerRegisterUnitStateEvent(stateTrigger,subject,ConvertUnitState(0),ConvertLimitOp(0),100.0)
 call TriggerRegisterPlayerStateEvent(playerTrigger,Player(0),ConvertPlayerState(1),ConvertLimitOp(0),100.0)
 call TriggerRegisterPlayerAllianceChange(allianceTrigger,Player(0),ConvertAllianceType(0))
 endfunction
 function low takes nothing returns nothing
 call SetUnitState(subject,ConvertUnitState(0),50.0)
 call SetPlayerState(Player(0),ConvertPlayerState(1),50)
 endfunction
 function high takes nothing returns nothing
 call SetUnitState(subject,ConvertUnitState(0),120.0)
 call SetPlayerState(Player(0),ConvertPlayerState(1),200)
 endfunction
 function ally takes nothing returns nothing
 call SetPlayerAlliance(Player(0),Player(1),ConvertAllianceType(0),true)
 endfunction
 function die takes nothing returns nothing
 call KillUnit(subject)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"actor-snapshot.j",source,"authored actor event persistence test"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=create(),restored=create();auto& a=original->runtime();auto& b=restored->runtime();original->startMain();a.invoke("makeUnit");a.invoke("setup");a.invoke("low");require(a.global("crossings").bits==1,"Actor event fixture did not cross state");auto identity=[](std::string_view,std::uint32_t id){return id;};auto triggers=original->encodeTriggers(identity),events=original->encodeActorEvents(identity),globals=a.encodeGlobals(identity);b.invoke("CreateTimer");b.invoke("makeUnit");b.invoke("low");auto sourceUnit=a.global("subject"),targetUnit=b.global("subject"),sourceDoomed=a.global("doomed"),targetDoomed=b.global("doomed");auto tm=restored->restoreTriggers(triggers);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==sourceUnit.bits?targetUnit.bits:id==sourceDoomed.bits?targetDoomed.bits:0u;auto it=tm.find({std::string(type),id});return it==tm.end()?0u:it->second;};rejects([&]{restored->rebuildActorEvents(events,decode);},"handle mapping");b.invoke("RemoveUnit",std::array{targetDoomed});auto bad=events;bad.back()^=1;rejects([&]{restored->rebuildActorEvents(bad,decode);},"digest");rejects([&]{restored->rebuildActorEvents(events,[&](std::string_view type,std::uint32_t id){return type=="unit"?0u:decode(type,id);});},"handle mapping");require(restored->liveObjects(NativeKind::Event)==0,"Rejected actor restore created events");auto em=restored->rebuildActorEvents(events,decode);auto inverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==targetUnit.bits?sourceUnit.bits:id==targetDoomed.bits?sourceDoomed.bits:0u;if(type=="event"){for(auto [stable,local]:em)if(local==id)return stable;}for(auto& [key,local]:tm)if(key.first==type && local==id)return key.second;return 0u;};require(restored->encodeActorEvents(inverse)==events,"Actor event snapshot did not round-trip");b.restoreGlobals(globals,decode);restored->startMain();b.invoke("low");require(b.global("crossings").bits==1,"Restored unit state fired again");for(auto* session:{original.get(),restored.get()}){session->runtime().invoke("high");session->runtime().invoke("low");session->runtime().invoke("ally");session->runtime().invoke("die");}require(a.global("crossings").bits==2 && b.global("crossings").bits==2 && a.global("playerCrossings").bits==2 && b.global("playerCrossings").bits==2 && a.global("alliances").bits==1 && b.global("alliances").bits==1 && a.global("order").bits==123 && b.global("order").bits==123,"Restored actor events diverged");
    });
    test("camera_snapshot_restores_setups_and_active_motion",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type camerasetup extends handle
 type camerafield extends handle
 native ConvertCameraField takes integer n returns camerafield
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native CreateTimer takes nothing returns timer
 native CreateCameraSetup takes nothing returns camerasetup
 native CameraSetupSetField takes camerasetup c, camerafield f, real value, real duration returns nothing
 native CameraSetupGetField takes camerasetup c, camerafield f returns real
 native CameraSetupSetDestPosition takes camerasetup c, real x, real y, real duration returns nothing
 native CameraSetupGetDestPositionX takes camerasetup c returns real
 native CameraSetupApply takes camerasetup c, boolean pan, boolean timed returns nothing
 native SetCameraTargetController takes unit u, real x, real y, boolean inherit returns nothing
 globals
 camerasetup shot=CreateCameraSetup()
 unit subject=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function makeUnit takes nothing returns nothing
 set subject=CreateUnit(Player(0),'hfoo',0.0,0.0,0.0)
 endfunction
 function setup takes nothing returns nothing
 call CameraSetupSetField(shot,ConvertCameraField(0),1800.0,4.0)
 call CameraSetupSetDestPosition(shot,20.0,10.0,4.0)
 call CameraSetupApply(shot,true,true)
 call SetCameraTargetController(subject,7.0,8.0,true)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"camera-snapshot.j",source,"authored camera persistence test"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=create(),restored=create();auto& a=original->runtime();auto& b=restored->runtime();original->startMain();a.invoke("makeUnit");a.invoke("setup");original->advance(1);auto identity=[](std::string_view,std::uint32_t id){return id;};auto clock=original->encodeSimulationClock(),camera=original->encodeCameraState(identity),globals=a.encodeGlobals(identity);restored->restoreSimulationClock(clock);b.invoke("CreateTimer");b.invoke("makeUnit");auto sourceUnit=a.global("subject"),targetUnit=b.global("subject"),old=b.global("shot");auto decodeUnit=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==sourceUnit.bits?targetUnit.bits:0u;};auto bad=camera;bad.back()^=1;rejects([&]{restored->rebuildCameraState(bad,decodeUnit);},"digest");rejects([&]{restored->rebuildCameraState(camera,{});},"requires mapping");require(b.global("shot").bits==old.bits && restored->cameraControl().targetUnit==0,"Rejected camera restore changed target");auto mapping=restored->rebuildCameraState(camera,decodeUnit);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return decodeUnit(type,id);if(type=="camerasetup"){auto found=mapping.find(id);return found==mapping.end()?0u:found->second;}return 0u;};auto inverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==targetUnit.bits?sourceUnit.bits:0u;if(type=="camerasetup")for(auto [stable,local]:mapping)if(local==id)return stable;return 0u;};require(restored->encodeCameraState(inverse)==camera,"Camera snapshot did not round-trip");b.restoreGlobals(globals,decode);require(b.global("shot").bits!=old.bits && restored->cameraControl().targetUnit==targetUnit.bits && restored->cameraControl().inheritOrientation,"Camera setup or unit reference did not restore");auto field=b.invoke("ConvertCameraField",std::array{b.integer(0)});require(b.invoke("CameraSetupGetField",std::array{b.global("shot"),field}).bits==real(1800).bits() && b.invoke("CameraSetupGetDestPositionX",std::array{b.global("shot")}).bits==real(20).bits(),"Restored camera setup differs");restored->startMain();original->advance(1);restored->advance(1);auto& x=original->world()->environment();auto& y=restored->world()->environment();require(x.cameraMotion.value(original->simulationTime())==y.cameraMotion.value(restored->simulationTime()) && x.cameraFields[0].value(original->simulationTime())==y.cameraFields[0].value(restored->simulationTime()),"Restored camera transition diverged");x.cameraMotion.rotate(10,20,1.5f,original->simulationTime(),4);auto orbitClock=original->encodeSimulationClock(),orbitCamera=original->encodeCameraState(identity);auto orbit=create();orbit->restoreSimulationClock(orbitClock);auto& vm=orbit->runtime();vm.invoke("makeUnit");auto orbitUnit=vm.global("subject");orbit->rebuildCameraState(orbitCamera,[&](std::string_view type,std::uint32_t id){return type=="unit" && id==sourceUnit.bits?orbitUnit.bits:0u;});auto future=original->simulationTime()+1;require(x.cameraMotion.value(future)==orbit->world()->environment().cameraMotion.value(future),"Restored camera orbit diverged");
    });
    test("triggers_restore_actions_conditions_and_state",[&]{
        std::string source=R"jass(type destructable extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type triggercondition extends handle
 type boolexpr extends handle
 type conditionfunc extends boolexpr
 native CreateTimer takes nothing returns timer
 native CreateTrigger takes nothing returns trigger
 native Condition takes code c returns conditionfunc
 native And takes boolexpr a, boolexpr b returns boolexpr
 native Not takes boolexpr a returns boolexpr
 native TriggerAddAction takes trigger t, code c returns triggeraction
 native TriggerAddCondition takes trigger t, boolexpr c returns triggercondition
 native TriggerEvaluate takes trigger t returns boolean
 native TriggerExecute takes trigger t returns nothing
 native DisableTrigger takes trigger t returns nothing
 native IsTriggerEnabled takes trigger t returns boolean
 native TriggerWaitOnSleeps takes trigger t, boolean flag returns nothing
 native IsTriggerWaitOnSleeps takes trigger t returns boolean
 native GetTriggerEvalCount takes trigger t returns integer
 native GetTriggerExecCount takes trigger t returns integer
 globals
 trigger t=null
 triggeraction action=null
 triggercondition predicate=null
 integer runs=0
 endglobals
 function yes takes nothing returns boolean
 return true
 endfunction
 function no takes nothing returns boolean
 return false
 endfunction
 function work takes nothing returns nothing
 set runs=runs+1
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function setup takes nothing returns nothing
 set t=CreateTrigger()
 set predicate=TriggerAddCondition(t,And(Condition(function yes),Not(Condition(function no))))
 set action=TriggerAddAction(t,function work)
 call TriggerEvaluate(t)
 call TriggerExecute(t)
 call DisableTrigger(t)
 call TriggerWaitOnSleeps(t,false)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"triggers.j",source,"authored trigger persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();a.invoke("setup");auto trigger=a.global("t").bits,action=a.global("action").bits,condition=a.global("predicate").bits;auto encode=[&](std::string_view type,std::uint32_t id){if(type=="trigger" && id==trigger)return 1u;if(type=="triggeraction" && id==action)return 2u;if(type=="triggercondition" && id==condition)return 3u;return 0u;};auto triggers=original->encodeTriggers(encode),globals=a.encodeGlobals(encode);b.invoke("CreateTimer");auto damaged=triggers;damaged.back()^=1;rejects([&]{restored->restoreTriggers(damaged);},"digest");require(restored->liveObjects(NativeKind::Trigger)==0,"Rejected trigger snapshot created objects");auto mapping=restored->restoreTriggers(triggers);auto decode=[&](std::string_view type,std::uint32_t id){auto it=mapping.find({std::string(type),id});return it==mapping.end()?0u:it->second;};auto reencode=[&](std::string_view type,std::uint32_t id){for(auto& [key,value]:mapping)if(key.first==type && value==id)return key.second;return 0u;};require(restored->encodeTriggers(reencode)==triggers,"Restored trigger snapshot differs");b.restoreGlobals(globals,decode);auto target=b.global("t");require(target.bits!=trigger && !b.invoke("IsTriggerEnabled",std::array{target}).bits && !b.invoke("IsTriggerWaitOnSleeps",std::array{target}).bits && b.invoke("GetTriggerEvalCount",std::array{target}).bits==1 && b.invoke("GetTriggerExecCount",std::array{target}).bits==1 && b.global("runs").bits==1,"Trigger state or handles were not restored");require(b.invoke("TriggerEvaluate",std::array{target}).bits,"Restored compound predicate differs");b.invoke("TriggerExecute",std::array{target});require(b.global("runs").bits==2 && b.invoke("GetTriggerEvalCount",std::array{target}).bits==2 && b.invoke("GetTriggerExecCount",std::array{target}).bits==2,"Restored trigger callbacks did not execute");rejects([&]{restored->restoreTriggers(triggers);},"without triggers");
    });
    test("timer_events_restore_schedule_and_registration_order",[&]{
        std::string source=R"jass(type destructable extends handle
 type timer extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type eventid extends handle
 type gameevent extends eventid
 native ConvertGameEvent takes integer value returns gameevent
 native TriggerRegisterGameEvent takes trigger owner, gameevent value returns event
 native CreateTimer takes nothing returns timer
 native TimerStart takes timer t, real timeout, boolean periodic, code callback returns nothing
 native CreateTrigger takes nothing returns trigger
 native DestroyTrigger takes trigger t returns nothing
 native TriggerAddAction takes trigger t, code callback returns triggeraction
 native TriggerRegisterTimerEvent takes trigger t, real timeout, boolean periodic returns event
 native TriggerRegisterTimerExpireEvent takes trigger t, timer clock returns event
 globals
 timer clock=null
 trigger x=null
 trigger y=null
 trigger z=null
 event e1=null
 event e2=null
 event e3=null
 event e4=null
 event e5=null
 event e6=null
 integer sequence=0
 endglobals
 function ax takes nothing returns nothing
 set sequence=sequence*10+1
 endfunction
 function ay takes nothing returns nothing
 set sequence=sequence*10+2
 endfunction
 function az takes nothing returns nothing
 set sequence=sequence*10+3
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function createClock takes nothing returns nothing
 set clock=CreateTimer()
 endfunction
 function startClock takes nothing returns nothing
 call TimerStart(clock,0.25,false,null)
 endfunction
 function createTriggers takes nothing returns nothing
 set x=CreateTrigger()
 set y=CreateTrigger()
 set z=CreateTrigger()
 call TriggerAddAction(x,function ax)
 call TriggerAddAction(y,function ay)
 call TriggerAddAction(z,function az)
 endfunction
 function assignTriggers takes trigger a, trigger b, trigger c returns nothing
 set x=a
 set y=b
 set z=c
 endfunction
 function forward takes nothing returns nothing
 set e1=TriggerRegisterTimerEvent(x,0.125,false)
 set e2=TriggerRegisterTimerEvent(y,0.25,true)
 set e3=TriggerRegisterTimerExpireEvent(z,clock)
 set e4=TriggerRegisterTimerExpireEvent(x,clock)
 set e5=TriggerRegisterGameEvent(x,ConvertGameEvent(9))
 set e6=TriggerRegisterGameEvent(y,ConvertGameEvent(9))
 endfunction
 function reverse takes nothing returns nothing
 set e6=TriggerRegisterGameEvent(y,ConvertGameEvent(9))
 set e5=TriggerRegisterGameEvent(x,ConvertGameEvent(9))
 set e4=TriggerRegisterTimerExpireEvent(x,clock)
 set e3=TriggerRegisterTimerExpireEvent(z,clock)
 set e2=TriggerRegisterTimerEvent(y,0.25,true)
 set e1=TriggerRegisterTimerEvent(x,0.125,false)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"timer-events.j",source,"authored event persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create(),rebuilt=create();auto& a=original->runtime();auto& b=restored->runtime();auto& c=rebuilt->runtime();original->startMain();a.invoke("createClock");a.invoke("startClock");a.invoke("createTriggers");a.invoke("forward");original->advance(.125);require(a.global("sequence").bits==1,"One-shot timer event did not fire");auto ids=[](Runtime& vm){std::array<std::uint32_t,10> result{};unsigned i=0;for(auto name:{"clock","x","y","z","e1","e2","e3","e4","e5","e6"})result[i++]=vm.global(name).bits;return result;};auto first=ids(a);auto encode=[&](std::string_view type,std::uint32_t id){for(unsigned i=0;i<first.size();++i)if(first[i]==id && type==(i==0?"timer":i<4?"trigger":"event"))return i+1;if(type=="triggeraction")return id;return 0u;};auto clock=original->encodeSimulationClock(),timers=original->encodeTimers(encode),triggers=original->encodeTriggers(encode),events=original->encodeTimerEvents(encode),gameEvents=original->encodeGameEvents(encode),globals=a.encodeGlobals(encode);restored->restoreSimulationClock(clock);b.invoke("createClock");auto targetClock=b.global("clock").bits;restored->restoreTimers(timers,[&](std::string_view type,std::uint32_t id){return type=="timer" && id==1?targetClock:0u;});auto triggerHandles=restored->restoreTriggers(triggers);b.invoke("assignTriggers",std::array{b.handle("trigger",triggerHandles.at({"trigger",2})),b.handle("trigger",triggerHandles.at({"trigger",3})),b.handle("trigger",triggerHandles.at({"trigger",4}))});b.invoke("reverse");auto second=ids(b);auto decode=[&](std::string_view type,std::uint32_t id){if(id<1 || id>second.size() || type!=(id==1?"timer":id<5?"trigger":"event"))return 0u;return second[id-1];};auto broken=events;broken.back()^=1;rejects([&]{restored->restoreTimerEvents(broken,decode);},"digest");rejects([&]{restored->restoreTimerEvents(events,[&](std::string_view type,std::uint32_t id){return type=="event"?second[4]:decode(type,id);});},"mapping");rejects([&]{restored->restoreTimerEvents(events,[&](std::string_view type,std::uint32_t id){return type=="event" && id==5?second[5]:type=="event" && id==6?second[4]:decode(type,id);});},"registration differs");restored->restoreTimerEvents(events,decode);b.restoreGlobals(globals,decode);auto reencode=[&](std::string_view type,std::uint32_t id){for(unsigned i=0;i<second.size();++i)if(second[i]==id && type==(i==0?"timer":i<4?"trigger":"event"))return i+1;return 0u;};require(restored->encodeTimerEvents(reencode)==events,"Restored timer event ordering was not retained");rebuilt->restoreSimulationClock(clock);auto thirdTimers=rebuilt->rebuildTimers(timers);auto thirdClock=thirdTimers.at(1);auto thirdTriggers=rebuilt->restoreTriggers(triggers);auto decodeParents=[&](std::string_view type,std::uint32_t id){if(type=="timer" && id==1)return thirdClock;auto found=thirdTriggers.find({std::string(type),id});return found==thirdTriggers.end()?0u:found->second;};rejects([&]{rebuilt->rebuildTimerEvents(broken,decodeParents);},"digest");rejects([&]{rebuilt->rebuildTimerEvents(events,[&](std::string_view type,std::uint32_t id){return type=="trigger"?decodeParents(type,2):decodeParents(type,id);});},"mapping");require(rebuilt->liveObjects(NativeKind::Event)==0,"Rejected event rebuild created objects");auto thirdEvents=rebuilt->rebuildTimerEvents(events,decodeParents);auto badGame=gameEvents;badGame.back()^=1;auto beforeGame=rebuilt->liveObjects(NativeKind::Event);rejects([&]{rebuilt->rebuildGameEvents(badGame,decodeParents);},"digest");rejects([&]{rebuilt->rebuildGameEvents(gameEvents,[&](std::string_view type,std::uint32_t id){return type=="trigger"?decodeParents(type,2):decodeParents(type,id);});},"mapping");require(rebuilt->liveObjects(NativeKind::Event)==beforeGame,"Rejected game event rebuild changed events");auto thirdGame=rebuilt->rebuildGameEvents(gameEvents,decodeParents);auto decodeThird=[&](std::string_view type,std::uint32_t id){if(type=="event"){auto found=thirdEvents.find(id);if(found!=thirdEvents.end())return found->second;auto game=thirdGame.find(id);return game==thirdGame.end()?0u:game->second;}return decodeParents(type,id);};c.restoreGlobals(globals,decodeThird);auto third=ids(c);auto encodeThird=[&](std::string_view type,std::uint32_t id){for(unsigned i=0;i<third.size();++i)if(third[i]==id && type==(i==0?"timer":i<4?"trigger":"event"))return i+1;return 0u;};require(rebuilt->encodeTimerEvents(encodeThird)==events && rebuilt->encodeGameEvents(encodeThird)==gameEvents,"Rebuilt event state differs");restored->startMain();rebuilt->startMain();original->advance(.375);restored->advance(.375);rebuilt->advance(.375);require(a.global("sequence").bits==13122 && b.global("sequence").bits==13122 && c.global("sequence").bits==13122,"Restored timer events fired at a different time or order");require(original->encodeTimerEvents(encode)==restored->encodeTimerEvents(reencode) && original->encodeTimerEvents(encode)==rebuilt->encodeTimerEvents(encodeThird),"Continued timer event state differs");original->commandMenuOpened(true);rebuilt->commandMenuOpened(true);require(a.global("sequence").bits==1312212 && c.global("sequence").bits==1312212,"Rebuilt game event order differed");c.invoke("DestroyTrigger",std::array{c.global("x")});require(rebuilt->liveObjects(NativeKind::Event)==3,"Rebuilt events were not owned by trigger");rebuilt->commandMenuOpened(true);rebuilt->advance(.25);require(c.global("sequence").bits==131221222,"Remaining events stopped after another trigger was destroyed");
    });
    test("timers_restore_callbacks_order_and_globals",[&]{
        std::string source=R"jass(type destructable extends handle
 type timer extends handle
 native CreateTimer takes nothing returns timer
 native TimerStart takes timer t, real timeout, boolean periodic, code callback returns nothing
 native PauseTimer takes timer t returns nothing
 native ResumeTimer takes timer t returns nothing
 native GetExpiredTimer takes nothing returns timer
 globals
 timer baseline=CreateTimer()
 timer a=null
 timer b=null
 timer c=null
 integer sequence=0
 integer periodicCount=0
 endglobals
 function tickA takes nothing returns nothing
 if GetExpiredTimer()==a then
 set sequence=sequence*10+1
 endif
 endfunction
 function tickB takes nothing returns nothing
 if GetExpiredTimer()==b then
 set sequence=sequence*10+2
 set periodicCount=periodicCount+1
 endif
 endfunction
 function tickC takes nothing returns nothing
 if GetExpiredTimer()==c then
 set sequence=sequence*10+3
 endif
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function setup takes nothing returns nothing
 set a=CreateTimer()
 set b=CreateTimer()
 set c=CreateTimer()
 call TimerStart(a,0.25,false,function tickA)
 call TimerStart(b,0.25,true,function tickB)
 call TimerStart(c,0.5,false,function tickC)
 endfunction
 function pauseC takes nothing returns nothing
 call PauseTimer(c)
 endfunction
 function resumeC takes nothing returns nothing
 call ResumeTimer(c)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"timers.j",source,"authored timer persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create(),rebuilt=create();original->startMain();original->runtime().invoke("setup");original->advance(.125);original->runtime().invoke("pauseC");auto& a=original->runtime();auto& b=restored->runtime();auto& c=rebuilt->runtime();auto a0=a.global("baseline").bits,a1=a.global("a").bits,a2=a.global("b").bits,a3=a.global("c").bits;auto encode=[&](std::string_view type,std::uint32_t id){require(type=="timer","Unexpected handle type");return id==a1?1u:id==a2?2u:id==a3?3u:id==a0?4u:0u;};auto clock=original->encodeSimulationClock(),globals=a.encodeGlobals(encode),timers=original->encodeTimers(encode);restored->restoreSimulationClock(clock);auto b0=b.global("baseline").bits,b3=b.invoke("CreateTimer").bits,b2=b.invoke("CreateTimer").bits,b1=b.invoke("CreateTimer").bits;auto decode=[&](std::string_view type,std::uint32_t id){require(type=="timer","Unexpected mapped type");return id==1?b1:id==2?b2:id==3?b3:id==4?b0:0u;};auto damaged=timers;damaged.back()^=1;rejects([&]{restored->restoreTimers(damaged,decode);},"digest");rejects([&]{restored->restoreTimers(timers,[&](auto,std::uint32_t){return b1;});},"mapping");source+="\n";auto different=create();different->restoreSimulationClock(clock);rejects([&]{different->rebuildTimers(timers);},"source differs");rejects([&]{different->restoreTimers(timers,{});},"source differs");b.restoreGlobals(globals,decode);restored->restoreTimers(timers,decode);rejects([&]{restored->rebuildTimers(timers);},"active timers");rebuilt->restoreSimulationClock(clock);auto initialBaseline=c.global("baseline").bits;rejects([&]{rebuilt->rebuildTimers(damaged);},"digest");require(rebuilt->liveObjects(NativeKind::Timer)==1 && c.global("baseline").bits!=0,"Rejected timer rebuild changed initialized timers");auto thirdTimers=rebuilt->rebuildTimers(timers);auto decodeThird=[&](std::string_view type,std::uint32_t id){auto it=thirdTimers.find(id);return type=="timer" && it!=thirdTimers.end()?it->second:0u;};c.restoreGlobals(globals,decodeThird);require(c.global("baseline").bits==thirdTimers.at(4) && c.global("baseline").bits!=initialBaseline,"Initialized timer global was not remapped");auto encodeThird=[&](std::string_view type,std::uint32_t id){for(auto [stable,local]:thirdTimers)if(type=="timer" && id==local)return stable;return 0u;};require(rebuilt->encodeTimers(encodeThird)==timers,"Rebuilt timers differed before continuation");restored->startMain();rebuilt->startMain();original->advance(.125);restored->advance(.125);rebuilt->advance(.125);require(a.global("sequence").bits==12 && b.global("sequence").bits==12 && c.global("sequence").bits==12,"Same-time timer order or expired handle differed");a.invoke("resumeC");b.invoke("resumeC");c.invoke("resumeC");original->advance(.375);restored->advance(.375);rebuilt->advance(.375);require(a.global("sequence").bits==b.global("sequence").bits && a.global("sequence").bits==c.global("sequence").bits && a.global("periodicCount").bits==b.global("periodicCount").bits && a.global("periodicCount").bits==c.global("periodicCount").bits && a.global("sequence").bits==1223 && original->encodeTimers(encode)==rebuilt->encodeTimers(encodeThird),"Periodic or paused timer continuation differed");require(original->encodeTimers(encode)==restored->encodeTimers([&](std::string_view,std::uint32_t id){return id==b1?1u:id==b2?2u:id==b3?3u:id==b0?4u:0u;}),"Restored timer state differed");
    });
    test("simulation_clock_with_sleeping_script",[&]{
        std::string source=R"jass(type destructable extends handle
type timer extends handle
type trigger extends handle
type event extends handle
native CreateTrigger takes nothing returns trigger
native TriggerRegisterTimerExpireEvent takes trigger owner, timer source returns event
native CreateTimer takes nothing returns timer
native TimerStart takes timer t, real seconds, boolean periodic, code callback returns nothing
native TriggerSleepAction takes real seconds returns nothing
native Probe takes nothing returns nothing
globals
integer completed=0
endglobals
function config takes nothing returns nothing
endfunction
function wait takes nothing returns nothing
call TriggerSleepAction(0.125)
set completed=1
endfunction
function check takes nothing returns nothing
call Probe()
endfunction
function main takes nothing returns nothing
endfunction
)jass";auto create=[&]{auto module=Module::compile(Program::parse({{"simulation-clock.j",source,"authored persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create();original->startMain();original->world()->clock().time(real(8));original->world()->clock().scale(real(2));original->world()->clock().temporary(real(0),real(30));original->advance(2.015625);original->gameSpeed(3);original->runtime().bind("Probe",[&](auto& vm,auto){rejects([&]{original->encodeSimulationClock();},"quiescent");return vm.nothing();});original->runtime().invoke("check");original->runtime().start("wait");require(original->runtime().threadCount()==1,"Script did not sleep");original->pause(true);auto clock=original->encodeSimulationClock(),scripts=original->encodeSleepingScripts(original->snapshotSleepingScripts({}));auto damaged=clock;damaged.back()^=1;rejects([&]{restored->restoreSimulationClock(damaged);},"digest");auto invalid=[&](double time,double remainder,unsigned paused,unsigned speed){SnapshotWriter out(96);out.u32(tag("SCLK"));out.u32(1);out.u64(std::bit_cast<std::uint64_t>(time));out.u64(std::bit_cast<std::uint64_t>(remainder));out.u32(paused);out.u32(speed);auto bytes=sealSnapshot(out.finish(),96);rejects([&]{restored->restoreSimulationClock(bytes);},"Invalid simulation clock");};invalid(2.1,0,0,2);invalid(2.,1./32,0,2);invalid(2.,0,2,2);invalid(2.,0,0,5);invalid(INFINITY,0,0,2);require(restored->simulationTime()==0 && restored->presentationTime()==0 && !restored->paused(),"Rejected clock changed target");auto malformed=clock;malformed[44]^=1;auto digest=sha256(std::span<const std::uint8_t>(malformed.data(),malformed.size()-64));std::copy(digest.begin(),digest.end(),malformed.end()-64);auto beforeWorld=restored->world()->clock().encodeState();rejects([&]{restored->restoreSimulationClock(malformed);},"rules differ");require(restored->world()->clock().encodeState()==beforeWorld && restored->simulationTime()==0,"Rejected world clock changed session");SnapshotWriter old(96);old.u32(tag("SCLK"));old.u32(1);old.u64(std::bit_cast<std::uint64_t>(2.));old.u64(std::bit_cast<std::uint64_t>(0.));old.u32(0);old.u32(2);auto legacy=create();legacy->restoreSimulationClock(sealSnapshot(old.finish(),96));require(legacy->simulationTime()==2 && legacy->world()->clock().time().bits()==0,"Legacy simulation clock restore differs");auto dirty=create();auto& dirtyVm=dirty->runtime();auto dirtyTimer=dirtyVm.invoke("CreateTimer");dirtyVm.invoke("TimerStart",std::array{dirtyTimer,dirtyVm.real(real(1)),dirtyVm.boolean(false),Value{dirtyVm.module().typeId("code"),0}});rejects([&]{dirty->restoreSimulationClock(clock);},"fresh quiescent");require(dirty->simulationTime()==0 && !dirty->paused(),"Timer guard changed target");auto dirtyEvent=create();auto& eventVm=dirtyEvent->runtime();auto eventTimer=eventVm.invoke("CreateTimer"),eventTrigger=eventVm.invoke("CreateTrigger");eventVm.invoke("TriggerRegisterTimerExpireEvent",std::array{eventTrigger,eventTimer});rejects([&]{dirtyEvent->restoreSimulationClock(clock);},"fresh quiescent");restored->restoreSimulationClock(clock);require(restored->simulationTime()==2 && restored->presentationTime()==2.015625 && restored->paused() && restored->gameSpeed()==3 && restored->world()->clock().encodeState()==original->world()->clock().encodeState(),"Simulation or world clock did not restore");restored->startMain();restored->restoreSleepingScripts(restored->decodeSleepingScripts(scripts),{});original->advance(1);restored->advance(1);require(original->simulationTime()==2 && restored->simulationTime()==2 && original->runtime().global("completed").bits==0 && restored->runtime().global("completed").bits==0,"Paused restored clock advanced");original->pause(false);restored->pause(false);original->advance(.015625);restored->advance(.015625);require(original->simulationTime()==restored->simulationTime() && original->runtime().global("completed").bits==0 && restored->runtime().global("completed").bits==0,"Clock remainder or early sleep wake differs");original->advance(.09375);restored->advance(.09375);require(original->simulationTime()==restored->simulationTime() && original->world()->clock().encodeState()==restored->world()->clock().encodeState() && original->runtime().global("completed").bits==1 && restored->runtime().global("completed").bits==1,"Restored simulation, world clock and sleeping script diverged");rejects([&]{restored->restoreSimulationClock(clock);},"fresh quiescent");
    });
    test("player_snapshots_with_sleeping_script",[&]{
        std::string source=R"jass(type destructable extends handle
type player extends handle
type playerstate extends handle
native TriggerSleepAction takes real seconds returns nothing
native Probe takes nothing returns nothing
native SetPlayerState takes player p, playerstate state, integer value returns nothing
native SetPlayerTechMaxAllowed takes player p, integer tech, integer maximum returns nothing
globals
integer completed=0
endglobals
function config takes nothing returns nothing
endfunction
function wait takes nothing returns nothing
call TriggerSleepAction(0.125)
set completed=1
endfunction
function check takes nothing returns nothing
call Probe()
endfunction
)jass";Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/L"Maps/(2)BootyBay.w3m");auto create=[&]{auto module=Module::compile(Program::parse({{"player-sleep.j",source,"authored persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(World::read(archives));result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create();auto& vm=original->runtime();auto player=vm.handle("player",0x100000);auto tech=ObjectData::code("hfoo");vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",1),vm.integer(765)});vm.invoke("SetPlayerTechMaxAllowed",std::array{player,vm.integer(int(tech)),vm.integer(4)});vm.bind("Probe",[&](auto& runtime,auto){rejects([&]{original->encodePlayerStates();},"quiescent");rejects([&]{original->encodePlayerTechnology();},"quiescent");return runtime.nothing();});vm.invoke("check");vm.start("wait");require(vm.threadCount()==1,"Script did not sleep");auto players=original->encodePlayerStates(),technology=original->encodePlayerTechnology();auto scripts=original->encodeSleepingScripts(original->snapshotSleepingScripts({}));rejects([&]{original->restorePlayerStates(players);},"quiescent");restored->restorePlayerStates(players);restored->restorePlayerTechnology(technology);require(restored->config().players[0].states.at(1)==765 && restored->config().players[0].techMaximum.at(tech)==4,"Restored player values differ");restored->restoreSleepingScripts(restored->decodeSleepingScripts(scripts),{});restored->runtime().advanceThreads(.125);vm.advanceThreads(.125);require(restored->runtime().global("completed").bits==1 && vm.global("completed").bits==1 && restored->encodePlayerStates()==players && restored->encodePlayerTechnology()==technology,"Player snapshots and restored sleeping script diverged");
    });
    test("clock_snapshot_restores_temporary_and_rejects_corruption",[]{GameClock original;original.time(real(8));original.scale(real(2));original.temporary(real(0),real(30));original.advance(real(5));original.suspend(true);auto snapshot=original.encodeState();GameClock restored;restored.restoreState(snapshot);require(restored.encodeState()==snapshot,"Clock snapshot did not round-trip");original.advance(real(7));restored.advance(real(7));require(original.encodeState()==restored.encodeState(),"Restored suspended temporary clock diverged");original.suspend(false);restored.suspend(false);original.advance(real(40));restored.advance(real(40));require(original.encodeState()==restored.encodeState(),"Restored temporary expiry diverged");auto before=restored.encodeState();auto truncated=snapshot;truncated.pop_back();rejects([&]{restored.restoreState(truncated);},"Truncated");require(restored.encodeState()==before,"Truncated restore changed clock");auto bad=GameClock{}.rules();bad.dayLength=real(240);GameClock different(bad);rejects([&]{different.restoreState(snapshot);},"rules differ");require(different.time().bits()==0,"Rule rejection changed clock");});
    test("player_state_snapshot_preserves_all_players_transactionally",[]{auto source=R"jass(type destructable extends handle
type player extends handle
type playerstate extends handle
native SetPlayerState takes player p, playerstate state, integer value returns nothing
function config takes nothing returns nothing
endfunction
)jass";auto create=[&]{auto module=Module::compile(Program::parse({{"player-state.j",source,"authored persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto first=create(),second=create();auto set=[](ScriptSession& session,unsigned player,unsigned state,int value){auto& vm=session.runtime();vm.invoke("SetPlayerState",std::array{vm.handle("player",0x100000u+player),vm.handle("playerstate",state),vm.integer(value)});};set(*first,0,1,765);set(*first,1,2,432);set(*first,1,13,30);set(*second,0,1,111);auto snapshot=first->encodePlayerStates();second->restorePlayerStates(snapshot);require(second->encodePlayerStates()==snapshot && second->config().players[1].upkeepOverride[0],"Player state or upkeep override lost");auto truncated=snapshot;truncated.pop_back();set(*second,0,1,222);auto before=second->encodePlayerStates();rejects([&]{second->restorePlayerStates(truncated);},"");require(second->encodePlayerStates()==before,"Rejected player state changed session");});
    test("clock_initial_state_scale_and_suspend",[]{GameClock clock;require(clock.time().bits()==0 && clock.scale().bits()==0x3f800000 && !clock.suspended() && !clock.daytime(),"Source initial clock state differs");auto rate=clock.rate();require(std::bit_cast<float>(rate.bits())>.0499f && std::bit_cast<float>(rate.bits())<.0501f,"Source day rate differs");clock.time(real(6));require(clock.daytime(),"Dawn not inclusive");clock.time(real(18));require(!clock.daytime(),"Dusk not exclusive");clock.scale(real(-2));clock.suspend(true);clock.suspend(true);require(clock.rate().bits()==0 && clock.scale().bits()==real(-2).bits() && clock.time().bits()==real(18).bits(),"Suspension changed clock value or scale");clock.suspend(false);require(std::bit_cast<float>(clock.rate().bits())<0,"Resume lost negative source scale");});
    test("clock_temporary_item_state",[]{GameClock clock;clock.time(real(8));clock.temporary(real(0),real(30));require(clock.time().bits()==real(0).bits() && clock.temporaryTime().bits()==real(8).bits(),"Temporary effect did not retain the baseline");clock.advance(real(10));clock.temporary(real(0),real(30));clock.scale(real(2));clock.advance(real(5));clock.suspend(true);clock.advance(real(25));require(clock.temporaryRemaining().bits()==0 && clock.time().bits()==real(9).bits(),"Repeat, scale or suspension did not preserve baseline");clock.suspend(false);clock.temporary(real(0),real(30));clock.time(real(16));clock.advance(real(30));require(clock.temporaryRemaining().bits()==0 && clock.time().bits()==real(19).bits(),"Script time assignment was overwritten by restoration");});
    test("clock_temporary_expiry_segments",[]{GameClock clock;clock.time(real(8));clock.temporary(real(5.95f),real(1));clock.scale(real(2));auto result=clock.advance(real(2));require(result.restored && std::bit_cast<float>(result.beforeRestore.bits())>=6.f && std::bit_cast<float>(result.restoredTime.bits())>8.f && std::bit_cast<float>(clock.time().bits())>std::bit_cast<float>(result.restoredTime.bits()),"Temporary expiry lost a clock segment");});
    test("clock_map_misc_overlay_and_cycle_validation",[&]{auto scratch=output/(L"rules-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));fs::create_directories(scratch);mpq(scratch/L"war3.mpq","Units\\MiscData.txt","[Misc]\nDayLength=480\nDayHours=24\nDawn=6\nDusk=18\n");mpq(scratch/L"custom.w3x","war3mapMisc.txt","[Misc]\nDayLength=240\nDayHours=12\nDawn=+3\n");Archives archives(scratch);archives.mountMap(scratch/L"custom.w3x");GameClock custom(DayNightRules::read(archives));require(custom.rules().dayLength.bits()==real(240).bits() && custom.rules().dayHours.bits()==real(12).bits() && custom.rules().dawn.bits()==real(3).bits() && custom.rules().dusk.bits()==real(18).bits(),"Map clock override lost an inherited source field");custom.time(real(50));require(custom.time().bits()==real(12).bits(),"Custom source upper bound ignored");archives.unmountMap();require(DayNightRules::read(archives).dayLength.bits()==real(480).bits(),"Map clock override leaked after unmount");auto bad=custom.rules();bad.dayLength=Real{};rejects([&]{GameClock invalid(bad);},"positive");bad.dayLength=Real::fromBits(0x7f800000);rejects([&]{GameClock invalid(bad);},"Non-finite");});
    test("clock_native_globals_main_and_world_lifetime",[]{ScriptSession session(compile(),map().info);session.attachWorld(world());session.configure();require(session.runtime().global("initial").bits==0,"Globals did not observe source zero time");PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();require(session.mainCompleted() && session.world()->clock().time().bits()==real(8).bits() && session.world()->clock().suspended(),"Main did not retain time controls in world");require(call(session,"GetTimeOfDayScale").bits==real(2).bits() && call(session,"GetFloatGameState",{session.runtime().handle("fgamestate",2)}).bits==real(8).bits(),"Native getter disagrees with world clock");ScriptSession next(compile(),map().info);next.attachWorld(world());next.initialize();require(next.runtime().global("initial").bits==0 && next.world()->clock().scale().bits()==real(1).bits() && !next.world()->clock().suspended(),"Clock leaked into another session");});
    test("clock_native_invalid_state_and_missing_world",[]{ScriptSession session(compile(),map().info);session.attachWorld(world());session.initialize();auto& vm=session.runtime();call(session,"SetFloatGameState",{vm.handle("fgamestate",2),vm.real(real(10))});for(auto id:{0u,1u,3u,0xffffffffu}){auto state=vm.handle("fgamestate",id);call(session,"SetFloatGameState",{state,vm.real(real(20))});require(call(session,"GetFloatGameState",{state}).bits==0 && session.world()->clock().time().bits()==real(10).bits(),"Unknown float state modified source state two");}ScriptSession unattached(compile(),map().info);rejects([&]{unattached.initialize();},"attached map terrain");});
    test("clock_original_world_source_defaults",[&]{Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/L"Maps/(2)BootyBay.w3m");auto source=World::read(archives);auto& clock=source->clock();require(clock.rules().dayLength.bits()==real(480).bits() && clock.rules().dayHours.bits()==real(24).bits() && clock.rules().dawn.bits()==real(6).bits() && clock.rules().dusk.bits()==real(18).bits() && clock.time().bits()==0,"Original world clock values differ");archives.unmountMap();require(source->clock().rules().dayLength.bits()==real(480).bits(),"Loader unmount invalidated world rules");});
    test("clock_original_assignment_fixture",[&]{std::ofstream file(output/L"clock-native.json",std::ios::binary);require(bool(file),"Cannot save clock fixture");file<<"{\"assignments\":[";bool comma=false;std::vector<float> values={-1000000,-24,-1,-0.f,0,.00001f,.125f,1,5.999f,6,8,12,17.999f,18,23.999f,24,25,1000000};unsigned seed=0x43adf0;for(unsigned i=0;i<256;++i){seed=seed*1664525u+1013904223u;values.push_back(float(int(seed%200000)-100000)/1024.f);}for(bool scale:{false,true})for(float initial:{0.f,.125f,6.f,8.f,18.f,24.f})for(float requested:values){GameClock clock;if(scale)clock.scale(real(initial));else clock.time(real(initial));auto before=scale?clock.scale():clock.time();if(scale)clock.scale(real(requested));else clock.time(real(requested));if(comma)file<<',';comma=true;file<<'['<<scale<<','<<before.bits()<<','<<real(requested).bits()<<','<<(scale?clock.scale():clock.time()).bits()<<']';}file<<"],\"rates\":[";comma=false;for(float scale:{-100.f,-2.f,0.f,.25f,1.f,2.f,100.f}){GameClock clock;clock.scale(real(scale));if(comma)file<<',';comma=true;file<<'['<<clock.scale().bits()<<','<<clock.rules().dayHours.bits()<<','<<clock.rules().dayLength.bits()<<','<<clock.rate().bits()<<']';}file<<"]}\n";file.close();require(bool(file),"Cannot complete clock fixture");});
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into clock checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
