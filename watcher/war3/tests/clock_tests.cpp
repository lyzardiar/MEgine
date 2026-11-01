// Author: MiYu. Source clock rules, native session state and original assignment fixtures.
#include "manual_save_deletion.h"
#include "session.h"
#include "ai.h"
#include "setup.h"
#include "snapshot_codec.h"
#include "passive_snapshot_codec.h"
#include <StormLib.h>
#include <bit>
#include <cmath>
#include <functional>
#include <fstream>
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
    if(argc!=3){std::cerr<<"Usage: war3_clock_tests <data-root> <output-root>\n";return 2;}Archives fixtureArchives(argv[1]);fixtureArchives.mountMap(fs::path(argv[1])/L"Maps/(2)BootyBay.w3m");testArchives=&fixtureArchives;unsigned passed=0,failed=0;char filter[256]{};auto filterLength=GetEnvironmentVariableA("WAR3_CLOCK_FILTER",filter,sizeof(filter));if(filterLength>=sizeof(filter))throw std::runtime_error("Clock filter too long");auto test=[&](const char* name,const std::function<void()>& run){if(filterLength && std::string_view(name).find(filter)==std::string_view::npos)return;try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};auto output=fs::absolute(argv[2]);fs::create_directories(output);
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
 native FogEnable takes boolean enabled returns nothing
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native CreateItem takes integer id, real x, real y returns item
 native RemoveItem takes item i returns nothing
 native CreateDestructable takes integer id, real x, real y, real facing, real scale, integer variation returns destructable
 native RemoveDestructable takes destructable d returns nothing
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
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"unit-core.j",source,"unit core recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto hero=a.global("hero");a.invoke("SetUnitState",std::array{hero,a.handle("unitstate",0),a.real(real(140))});a.invoke("SetUnitState",std::array{hero,a.handle("unitstate",2),a.real(real(31))});a.invoke("SetUnitState",std::array{a.global("other"),a.handle("unitstate",0),a.real(real(0))});auto removed=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(256)),a.real(real(0)),a.real(real(0))});a.invoke("RemoveUnit",std::array{removed});auto mover=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(256)),a.real(real(0)),a.real(real(0))});a.invoke("SetUnitPathing",std::array{mover,a.boolean(false)});require(original->moveUnit(mover.bits,{real(1800),real(0)}),"Could not start movement fixture");auto moving=original->units().at(mover.bits);auto u=original->units().at(hero.bits);require(u->hero && u->level==4 && u->heroAttributes[0]==37 && u->inventory[0] && u->inventory[1] && !u->bookGrants.empty(),"Hero equipment fixture differs");u->userData=77;u->turnSpeed=.75f;u->propWindow=2.f;u->turnApplied=true;u->flyHeight=30;u->targetFlyHeight=80;u->flyRate=5;u->visualScale={2,3,4};u->tint={10,20,30,40};u->color=3;u->spellCooldowns[ObjectData::code("AHhb")]=8.5;a.invoke("SetUnitFacingTimed",std::array{hero,a.real(real(60)),a.real(real(2))});original->advance(.25);require(u->timedFacing && u->timedFacing->elapsed==.25,"Timed facing fixture did not progress");a.invoke("SetUnitPathing",std::array{mover,a.boolean(true)});original->advance(1./32);require(!moving->route.empty(),"Movement fixture lost its route");a.invoke("FogEnable",std::array{a.boolean(false)});auto attacker=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(-512)),a.real(real(-512)),a.real(real(0))});auto enemy=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(1)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(-384)),a.real(real(-512)),a.real(real(180))});a.invoke("SetUnitPathing",std::array{attacker,a.boolean(false)});a.invoke("SetUnitPathing",std::array{enemy,a.boolean(false)});require(original->attackUnit(attacker.bits,enemy.bits,true),"Combat attack fixture rejected");original->advance(1./32);auto attackerState=original->units().at(attacker.bits);require(attackerState->combat.windup && attackerState->combat.windup->target==enemy.bits,"Combat windup fixture did not start");auto patrol=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(0)),a.real(real(-1024)),a.real(real(0))});a.invoke("SetUnitPathing",std::array{patrol,a.boolean(false)});require(original->attackMove(patrol.bits,{real(1200),real(-1024)},true),"Combat patrol fixture rejected");auto patrolState=original->units().at(patrol.bits);require(patrolState->combat.patrolStart && patrolState->combat.patrolEnd,"Combat patrol endpoints missing");u->animationStart=.125;u->animationTime=4.75;u->animationBlendClock=9.25;u->animationGeneration=73;u->animationRate=.5f;u->animationBlendTime=.3f;u->animationIndex=4;u->animation="Spell";u->animationProperties="Alternate";u->animationQueue={"Stand","Walk"};auto goneItem=a.invoke("CreateItem",std::array{a.integer(int(ObjectData::code("phea"))),a.real(real(128)),a.real(real(0))});require(a.invoke("UnitAddItem",std::array{hero,goneItem}).bits,"Could not hold queued item");auto goneTree=a.invoke("CreateDestructable",std::array{a.integer(int(ObjectData::code("LTlt"))),a.real(real(512)),a.real(real(0)),a.real(real(0)),a.real(real(1)),a.integer(0)});auto otherTree=a.invoke("CreateDestructable",std::array{a.integer(int(ObjectData::code("LTlt"))),a.real(real(768)),a.real(real(0)),a.real(real(0)),a.real(real(1)),a.integer(0)});auto widgetActor=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(600)),a.real(real(0)),a.real(real(0))});auto widgetState=original->units().at(widgetActor.bits);widgetState->combat.widgetTarget=otherTree.bits;widgetState->combat.widgetTargetRevision=original->destructables().at(otherTree.bits)->lifeRevision;require(original->orderItemSlot(0,hero.bits,a.global("claw").bits,4),"Combat item move fixture rejected");PlayerCommand queued;queued.player=0;queued.kind=PlayerCommandKind::GroundMove;queued.units={mover.bits};queued.queued=true;queued.xBits=real(1400).bits();queued.yBits=real(100).bits();require(dispatchPlayerCommand(*original,queued)==1,"Queued movement was rejected");queued.kind=PlayerCommandKind::TargetOrder;queued.order=851983;queued.target=removed.bits;require(dispatchPlayerCommand(*original,queued)==1,"Queued removed unit target was rejected");queued.target=goneTree.bits;require(dispatchPlayerCommand(*original,queued)==1,"Queued destructable target was rejected");PlayerCommand itemOrder;itemOrder.player=0;itemOrder.kind=PlayerCommandKind::ItemImmediate;itemOrder.item=goneItem.bits;require(original->queuePlayerOrder(hero.bits,itemOrder),"Could not queue item order");a.invoke("RemoveItem",std::array{goneItem});a.invoke("RemoveDestructable",std::array{goneTree});moving->routeRetryAt=1.25;moving->routeWatch=true;moving->routeWatchSince=.125;moving->routeWatchPosition={real(100),real(150)};moving->routeWatchGoal={real(1800),real(0)};u->scriptAnimationProperties={{"alternate",true},{"gold",false}};u->lookAt={{"head",{a.global("other").bits,{1.f,2.f,3.f}}},{"chest",{removed.bits,{-1.f,-2.f,-3.f}}},{"self",{hero.bits,{0.f,0.f,0.f}}}};auto identity=[](std::string_view,std::uint32_t id){return id;};auto identities=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),visuals=original->encodeUnitVisuals(identity),movement=original->encodeUnitMovement(identity),combat=original->encodeUnitCombatOrders(identity),queuedOrders=original->encodeQueuedPlayerOrders(identity),destructables=original->encodeDestructables(identity),animations=original->encodeUnitAnimations(identity),items=original->encodeItems(identity),cooldowns=original->encodeUnitCooldowns(identity),random=original->encodeRandomState(),globals=a.encodeGlobals(identity);Binary movementReader(openSnapshot(movement,64u*1024u*1024u));movementReader.expect(tag("SMOV"));require(movementReader.u32()==1,"Movement snapshot version differs");snapshotText(movementReader,64);snapshotU64(movementReader);snapshotText(movementReader,64);snapshotText(movementReader,64);require(movementReader.u32()==mover.bits,"Movement fixture did not retain the retry cursor");restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto destructableMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(identities);auto decodeUnit=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};auto damaged=core;damaged.back()^=1;rejects([&]{restored->prepareUnitCore(damaged,decodeUnit);},"digest");rejects([&]{restored->prepareUnitCore(core,[](auto,auto){return 0u;});},"core mapping");auto other=a.global("other");rejects([&]{original->encodeUnitAnimations([&](std::string_view,std::uint32_t id){return id==other.bits?hero.bits:id;});},"animation mapping");auto swapped=[&](std::string_view type,std::uint32_t id){if(type!="unit")return 0u;if(id==hero.bits)return units.at(other.bits);if(id==other.bits)return units.at(hero.bits);return 0u;};rejects([&]{restored->prepareUnitCore(core,swapped);},"core mapping");restored->prepareUnitCore(core,decodeUnit);rejects([&]{restored->finishUnitCore(core,{});},"inventory mapping");auto itemMap=restored->rebuildItems(items,decodeUnit);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return decodeUnit(type,id);if(type=="item"){auto it=itemMap.find(id);return it!=itemMap.end()?it->second:0u;}if(type=="destructable"){auto it=destructableMap.find(id);return it!=destructableMap.end()?it->second:0u;}return 0u;};auto staged=restored->units().at(units.at(hero.bits));staged->heroAttributes[0]+=1;rejects([&]{restored->finishUnitCore(core,decode);},"prepared state");staged->heroAttributes[0]-=1;restored->finishUnitCore(core,decode);auto stagedTurn=staged->turnSpeed;auto badVisual=[&](std::string_view type,std::uint32_t id){return id==other.bits?0u:decodeUnit(type,id);};rejects([&]{restored->restoreUnitVisuals(visuals,badVisual);},"visual mapping");require(staged->turnSpeed==stagedTurn,"Invalid unit visual restore changed earlier units");auto damagedVisual=visuals;damagedVisual.back()^=1;rejects([&]{restored->restoreUnitVisuals(damagedVisual,decodeUnit);},"digest");Bytes invalidVisual(visuals.begin(),visuals.end()-64);auto invalidFacingTime=std::bit_cast<std::uint64_t>(-1.);size_t facingTimeOffset=4+4+4+64+8+4+80+4+4+4;for(unsigned n=0;n<8;++n)invalidVisual.at(facingTimeOffset+n)=std::uint8_t(invalidFacingTime>>(n*8));invalidVisual=sealSnapshot(std::move(invalidVisual),16u*1024u*1024u);rejects([&]{restored->restoreUnitVisuals(invalidVisual,decodeUnit);},"timed facing state");require(staged->turnSpeed==stagedTurn && !staged->timedFacing,"Invalid timed facing changed unit state");SnapshotWriter oldVisualWriter(1024*1024);oldVisualWriter.u32(tag("SUVS"));oldVisualWriter.u32(1);oldVisualWriter.text(original->world()->resources().mapDigest(),64);oldVisualWriter.u64(std::bit_cast<std::uint64_t>(original->simulationTime()));oldVisualWriter.size(original->units().size());for(auto& [id,unit]:original->units()){oldVisualWriter.u32(id);oldVisualWriter.u32(unit->type);oldVisualWriter.u32(unit->owner);for(auto value:{unit->turnSpeed,unit->defaultTurnSpeed,unit->propWindow,unit->defaultPropWindow,unit->flyHeight,unit->targetFlyHeight,unit->flyRate})oldVisualWriter.u32(std::bit_cast<std::uint32_t>(value));for(auto value:unit->visualScale)oldVisualWriter.u32(std::bit_cast<std::uint32_t>(value));for(auto value:unit->tint)oldVisualWriter.u32(value);oldVisualWriter.u32(unit->color?1:0);oldVisualWriter.u32(unit->color.value_or(0));oldVisualWriter.u32(unit->turnApplied?1:0);}auto oldVisual=sealSnapshot(oldVisualWriter.finish(),16u*1024u*1024u);staged->timedFacing=TimedFacing{10,20,.25,1};restored->restoreUnitVisuals(oldVisual,decodeUnit);require(staged->timedFacing && staged->timedFacing->start==10 && staged->timedFacing->elapsed==.25,"Version 1 visual snapshot changed timed facing");restored->restoreUnitVisuals(visuals,decodeUnit);auto movedUnit=restored->units().at(units.at(mover.bits));require(movedUnit->routeRetryPhase!=moving->routeRetryPhase,"Movement fixture did not change handle phase");auto oldPathing=restored->world()->encodePathingState();WorldPoint changedPoint{real(0),real(0)};bool blocked=restored->world()->terrainUnpathable(changedPoint,1);restored->world()->terrainPathable(changedPoint,1,blocked);rejects([&]{restored->restoreUnitMovement(movement,decodeUnit);},"movement pathing differs");require(movedUnit->route.empty(),"Rejected pathing changed unit movement");restored->world()->restorePathingState(oldPathing);auto cell=restored->world()->pathCell(0,0);require(cell.has_value(),"Footprint test point missing");std::array footprint{PathCell{*cell,2}};restored->world()->footprint(footprint,true);auto firstFingerprint=restored->world()->movementFingerprint();auto firstMask=restored->world()->pathMask(changedPoint);restored->world()->footprint(footprint,true);require(restored->world()->pathMask(changedPoint)==firstMask && restored->world()->movementFingerprint()!=firstFingerprint,"Movement fingerprint ignored overlapping footprint owners");rejects([&]{restored->restoreUnitMovement(movement,decodeUnit);},"movement pathing differs");restored->world()->footprint(footprint,false);restored->world()->footprint(footprint,false);rejects([&]{restored->restoreUnitMovement(movement,badVisual);},"movement mapping");require(movedUnit->route.empty(),"Invalid movement mapping changed unit route");restored->restoreUnitMovement(movement,decodeUnit);require(movedUnit->currentOrder==moving->currentOrder && movedUnit->route.size()==moving->route.size() && movedUnit->waypoint==moving->waypoint && movedUnit->moveDestination && moving->moveDestination && movedUnit->moveDestination->x.bits()==moving->moveDestination->x.bits() && movedUnit->route.front().x.bits()==moving->route.front().x.bits() && movedUnit->routeRetryPhase==moving->routeRetryPhase && movedUnit->routeRetryAt==moving->routeRetryAt && movedUnit->routeWatch && movedUnit->routeWatchSince==moving->routeWatchSince && movedUnit->routeWatchGoal.x.bits()==moving->routeWatchGoal.x.bits(),"Restored movement differs");auto badItem=[&](std::string_view type,std::uint32_t id){return type=="item" && id==goneItem.bits?itemMap.at(a.global("claw").bits):decode(type,id);};rejects([&]{restored->restoreQueuedPlayerOrders(queuedOrders,badItem);},"queued order handle mapping");require(movedUnit->playerOrders.empty() && staged->playerOrders.empty(),"Invalid queued item changed orders");auto badTree=[&](std::string_view type,std::uint32_t id){return type=="destructable" && id==goneTree.bits?destructableMap.at(otherTree.bits):decode(type,id);};rejects([&]{restored->restoreQueuedPlayerOrders(queuedOrders,badTree);},"queued order handle mapping");restored->restoreQueuedPlayerOrders(queuedOrders,decode);require(movedUnit->playerOrders.size()==3 && movedUnit->playerOrders[0].kind==PlayerCommandKind::GroundMove && movedUnit->playerOrders[1].target==units.at(removed.bits) && movedUnit->playerOrders[2].target==destructableMap.at(goneTree.bits) && staged->playerOrders.size()==1 && staged->playerOrders[0].item==itemMap.at(goneItem.bits),"Restored queued orders differ");auto badCombatTree=[&](std::string_view type,std::uint32_t id){return type=="destructable" && id==otherTree.bits?destructableMap.at(goneTree.bits):decode(type,id);};rejects([&]{restored->restoreUnitCombatOrders(combat,badCombatTree);},"combat order handle mapping");require(!restored->units().at(units.at(attacker.bits))->combat.target,"Invalid combat mapping changed unit state");auto badCombatItem=[&](std::string_view type,std::uint32_t id){return type=="item" && id==a.global("claw").bits?itemMap.at(goneItem.bits):decode(type,id);};rejects([&]{restored->restoreUnitCombatOrders(combat,badCombatItem);},"combat order handle mapping");auto damagedCombat=combat;damagedCombat.back()^=1;rejects([&]{restored->restoreUnitCombatOrders(damagedCombat,decode);},"digest");restored->restoreUnitCombatOrders(combat,decode);auto restoredAttacker=restored->units().at(units.at(attacker.bits));auto restoredPatrol=restored->units().at(units.at(patrol.bits));require(restoredAttacker->combat.target==units.at(enemy.bits) && restoredAttacker->combat.windup && restoredAttacker->combat.windup->target==units.at(enemy.bits) && restoredAttacker->combat.windup->due==attackerState->combat.windup->due && restoredPatrol->combat.patrolStart && restoredPatrol->combat.patrolEnd && restoredPatrol->combat.patrolEnd->x.bits()==patrolState->combat.patrolEnd->x.bits() && restored->units().at(units.at(widgetActor.bits))->combat.widgetTarget==destructableMap.at(otherTree.bits) && staged->combat.itemMove && staged->combat.itemMove->item==itemMap.at(a.global("claw").bits),"Restored combat orders differ");auto beforeAnimation=staged->animation;rejects([&]{restored->restoreUnitAnimations(animations,badVisual);},"animation target mapping");require(staged->animation==beforeAnimation,"Invalid animation mapping changed unit state");auto damagedAnimation=animations;damagedAnimation.back()^=1;rejects([&]{restored->restoreUnitAnimations(damagedAnimation,decodeUnit);},"digest");Bytes invalidAnimation(animations.begin(),animations.end()-64);auto invalidTime=std::bit_cast<std::uint64_t>(-1.);size_t animationTimeOffset=4+4+4+64+8+4+12+8;for(unsigned n=0;n<8;++n)invalidAnimation.at(animationTimeOffset+n)=std::uint8_t(invalidTime>>(n*8));invalidAnimation=sealSnapshot(std::move(invalidAnimation),16u*1024u*1024u);rejects([&]{restored->restoreUnitAnimations(invalidAnimation,decodeUnit);},"animation flags");require(staged->animation==beforeAnimation,"Invalid animation clock changed unit state");SnapshotWriter legacyWriter(1024*1024);legacyWriter.u32(tag("SUAN"));legacyWriter.u32(1);legacyWriter.text(original->world()->resources().mapDigest(),64);legacyWriter.u64(std::bit_cast<std::uint64_t>(original->simulationTime()));legacyWriter.size(original->units().size());for(auto& [id,unit]:original->units()){legacyWriter.u32(id);legacyWriter.u32(unit->type);legacyWriter.u32(unit->owner);for(int n=0;n<4;++n)legacyWriter.u64(0);legacyWriter.u32(std::bit_cast<std::uint32_t>(1.f));for(int n=0;n<4;++n)legacyWriter.u32(0);legacyWriter.text("",4096);legacyWriter.text("",4096);legacyWriter.u32(0);legacyWriter.u32(0);}auto legacy=sealSnapshot(legacyWriter.finish(),16u*1024u*1024u);restored->restoreUnitAnimations(legacy,decodeUnit);require(staged->animation.empty() && staged->animationRate==1 && staged->lookAt.empty(),"Version 1 animation snapshot did not restore");restored->restoreUnitAnimations(animations,decodeUnit);restored->restoreUnitCooldowns(cooldowns,decodeUnit);restored->restoreRandomState(random);b.restoreGlobals(globals,decode);auto target=restored->units().at(b.global("hero").bits),dead=restored->units().at(b.global("other").bits);require(dead->life.bits()==0 && dead->deathRevision==original->units().at(other.bits)->deathRevision,"Dead unit core state differs");require(target->life.bits()==u->life.bits() && target->maxLife.bits()==u->maxLife.bits() && target->mana.bits()==u->mana.bits() && target->maxMana.bits()==u->maxMana.bits() && target->level==u->level && target->experience==u->experience && target->heroAttributes==u->heroAttributes && target->appliedHeroStats==u->appliedHeroStats && target->equipment==u->equipment && target->abilities==u->abilities && target->userData==77,"Restored hero core differs");require(target->turnSpeed==u->turnSpeed && target->propWindow==u->propWindow && target->turnApplied==u->turnApplied && target->flyHeight==u->flyHeight && target->targetFlyHeight==u->targetFlyHeight && target->flyRate==u->flyRate && target->visualScale==u->visualScale && target->tint==u->tint && target->color==u->color,"Restored unit visuals differ");require(target->facing.bits()==u->facing.bits() && target->timedFacing && target->timedFacing->start==u->timedFacing->start && target->timedFacing->delta==u->timedFacing->delta && target->timedFacing->elapsed==u->timedFacing->elapsed && target->timedFacing->duration==u->timedFacing->duration,"Restored timed facing differs");require(target->animationStart==u->animationStart && target->animationTime==u->animationTime && target->animationBlendClock==u->animationBlendClock && target->animationGeneration==u->animationGeneration && target->animationRate==u->animationRate && target->animationBlendTime==u->animationBlendTime && target->animationIndex==u->animationIndex && target->animation==u->animation && target->animationProperties==u->animationProperties && target->animationQueue==u->animationQueue && target->scriptAnimationProperties==u->scriptAnimationProperties,"Restored unit animations differ");require(target->lookAt.size()==3 && target->lookAt.at("head").target==units.at(other.bits) && target->lookAt.at("head").offset==u->lookAt.at("head").offset && target->lookAt.at("chest").target==units.at(removed.bits) && target->lookAt.at("self").target==units.at(hero.bits),"Restored look-at targets differ");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:destructableMap)if(current==id)return old;return 0u;};require(restored->encodeUnitCore(reverse)==core && restored->encodeUnitVisuals(reverse)==visuals && restored->encodeUnitMovement(reverse)==movement && restored->encodeUnitCombatOrders(reverse)==combat && restored->encodeQueuedPlayerOrders(reverse)==queuedOrders && restored->encodeUnitAnimations(reverse)==animations && restored->encodeItems(reverse)==items && restored->encodeUnitCooldowns(reverse)==cooldowns,"Unit core or inventory did not round trip");rejects([&]{restored->startMain();},"Unit state recovery is incomplete");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during unit core recovery");
    });
    test("unit_auras_restore_membership_and_visuals",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type lightning extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native UnitAddAbility takes unit u, integer id returns boolean
 native Location takes real x, real y returns location
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"aura.j",source,"aura recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](const char* type,float x){auto unit=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(-512)),a.real(real(0))});a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});return unit;};auto paladin=spawn("Hpal",-512),chieftain=spawn("Otch",-400),soldier=spawn("hfoo",-256);require(a.invoke("UnitAddAbility",std::array{paladin,a.integer(int(ObjectData::code("AHad")))}).bits && a.invoke("UnitAddAbility",std::array{chieftain,a.integer(int(ObjectData::code("AOae")))}).bits,"Aura fixture abilities missing");original->advance(1./32);auto target=original->units().at(soldier.bits);require(target->aura.armor>0 && target->aura.movement>0 && target->auras.size()>=2,"Aura membership missing");a.invoke("RemoveUnit",std::array{paladin});require(std::any_of(target->auras.begin(),target->auras.end(),[&](auto& entry){return entry.second.source==paladin.bits;}),"Removed aura source did not remain during grace period");auto before=original->unitCombatDisplay(soldier.bits);require(bool(before),"Aura combat display missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto auras=original->encodeUnitAuras(identity),effects=original->encodeEffects(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decodeWidget=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decodeWidget);auto effectMap=restored->rebuildEffects(effects,decodeWidget);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="effect"){auto it=effectMap.find(id);return it==effectMap.end()?0u:it->second;}return decodeWidget(type,id);};auto damaged=auras;damaged.back()^=1;rejects([&]{restored->restoreUnitAuras(damaged,decode);},"digest");SnapshotWriter passiveWriter(16u*1024u*1024u);writePassiveSnapshot(passiveWriter,*target->auras.begin()->second.definition);auto passiveDigest=sha256(passiveWriter.finish());Bytes invalid(auras.begin(),auras.end()-64);auto digestAt=std::search(invalid.begin(),invalid.end(),passiveDigest.begin(),passiveDigest.end());require(digestAt!=invalid.end(),"Aura definition digest missing");*digestAt=*digestAt=='0'?'1':'0';invalid=sealSnapshot(std::move(invalid),64u*1024u*1024u);rejects([&]{restored->restoreUnitAuras(invalid,decode);},"Aura definition differs");auto wrong=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==paladin.bits?units.at(chieftain.bits):decode(type,id);};rejects([&]{restored->restoreUnitAuras(auras,wrong);},"aura handle mapping");require(restored->units().at(units.at(soldier.bits))->auras.empty(),"Invalid aura restore changed unit");restored->restoreUnitAuras(auras,decode);auto after=restored->units().at(units.at(soldier.bits));auto display=restored->unitCombatDisplay(units.at(soldier.bits));require(display && std::abs(display->armor-before->armor)<.001f && after->aura.movement==target->aura.movement && std::any_of(after->auras.begin(),after->auras.end(),[&](auto& entry){return entry.second.source==units.at(paladin.bits);}),"Restored aura or armor differs");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;if(type=="effect")for(auto [old,current]:effectMap)if(current==id)return old;return 0u;};require(restored->encodeUnitAuras(reverse)==auras,"Aura snapshot did not round trip");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during aura recovery");
    });
    test("unit_buffs_restore_spirit_link_and_shield",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type lightning extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native PauseUnit takes unit u, boolean flag returns nothing
 native SetPlayerTechResearched takes player p, integer tech, integer level returns nothing
 native UnitAddAbility takes unit u, integer id returns boolean
 native FogEnable takes boolean enabled returns nothing
 native Location takes real x, real y returns location
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"buff.j",source,"buff recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make(),bundled=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](int owner,const char* type,float x,float y){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(y)),a.real(real(0))});};auto caster=spawn(0,"Hpal",-512,-512),host=spawn(0,"hfoo",-256,-512),peer=spawn(0,"hfoo",-200,-512),enemy=spawn(1,"hfoo",-700,-700);for(auto unit:{caster,host,peer,enemy}){a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});original->units().at(unit.bits)->acquireRange={};}for(auto unit:{host,peer,enemy})a.invoke("PauseUnit",std::array{unit,a.boolean(true)});a.invoke("FogEnable",std::array{a.boolean(false)});for(auto tech:{"Rost","Rovs"})a.invoke("SetPlayerTechResearched",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code(tech))),a.integer(2)});auto actor=original->units().at(caster.bits),subject=original->units().at(host.bits),other=original->units().at(peer.bits);actor->mana=actor->maxMana=real(10000);auto has=[](const UnitState& unit,BuffKind kind){return std::any_of(unit.buffs.begin(),unit.buffs.end(),[&](auto& entry){return entry.second.kind==kind;});};auto cast=[&](const char* id,BuffKind kind){original->stopUnit(caster.bits);require(a.invoke("UnitAddAbility",std::array{caster,a.integer(int(ObjectData::code(id)))}).bits && original->castSpell(caster.bits,ObjectData::code(id),host.bits),"Buff cast rejected");for(int i=0;i<160 && !has(*subject,kind);++i)original->advance(1./32);require(has(*subject,kind),"Buff was not applied");};cast("Alsh",BuffKind::LightningShield);cast("Aspl",BuffKind::SpiritLink);require(has(*other,BuffKind::SpiritLink),"Spirit link did not reach peer");auto immolator=spawn(0,"Edem",800,800),blademaster=spawn(0,"Obla",900,800),dragon=spawn(0,"efdr",1000,800),enemyMage=spawn(1,"Edem",1020,800);for(auto unit:{immolator,blademaster,dragon,enemyMage}){a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});auto state=original->units().at(unit.bits);state->mana=state->maxMana=real(10000);state->acquireRange={};}for(auto [unit,ability]:{std::pair{immolator,"AEim"},std::pair{blademaster,"AOww"},std::pair{dragon,"Amfl"}}){a.invoke("UnitAddAbility",std::array{unit,a.integer(int(ObjectData::code(ability)))});require(original->castSpell(unit.bits,ObjectData::code(ability)),"Active buff actor cast rejected");}for(int i=0;i<160 && (!has(*original->units().at(immolator.bits),BuffKind::Immolation) || !has(*original->units().at(blademaster.bits),BuffKind::Bladestorm) || !has(*original->units().at(dragon.bits),BuffKind::ManaFlare));++i)original->advance(1./32);require(has(*original->units().at(immolator.bits),BuffKind::Immolation) && has(*original->units().at(blademaster.bits),BuffKind::Bladestorm) && has(*original->units().at(dragon.bits),BuffKind::ManaFlare),"Active buff actors missing");a.invoke("UnitAddAbility",std::array{enemyMage,a.integer(int(ObjectData::code("AEim")))});actor->criticalFailures[ObjectData::code("AOcr")]=7;actor->pillageBalances[ObjectData::code("Asal")]={real(1.25f),real(2.5f)};subject->corrosiveDoses[{ObjectData::code("Acor"),enemy.bits}]={enemy.bits,1,subject->deathRevision,6,3.5,.25};auto retired=spawn(1,"hfoo",-750,-700);a.invoke("RemoveUnit",std::array{retired});subject->corrosiveDoses[{ObjectData::code("ACcb"),retired.bits}]={retired.bits,1,subject->deathRevision,4,2,.75};auto identity=[](std::string_view,std::uint32_t id){return id;};auto recoveryBundle=original->encodeRecoveryBundle(),attackPassives=original->encodeAttackPassiveState(identity),casts=original->encodeUnitCasts(identity),abilities=original->encodeAbilityIdentities(identity),lightnings=original->encodeLightnings(identity),buffs=original->encodeUnitBuffs(identity),effects=original->encodeEffects(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decodeWidget=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decodeWidget);auto effectMap=restored->rebuildEffects(effects,decodeWidget),abilityMap=restored->rebuildAbilityIdentities(abilities,unitMap),lightningMap=restored->rebuildLightnings(lightnings,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="ability")return abilityMap.contains(id)?abilityMap.at(id):0u;if(type=="lightning")return lightningMap.contains(id)?lightningMap.at(id):0u;if(type=="effect"){auto it=effectMap.find(id);return it==effectMap.end()?0u:it->second;}return decodeWidget(type,id);};auto damaged=buffs;damaged.back()^=1;rejects([&]{restored->restoreUnitBuffs(damaged,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==host.bits?units.at(peer.bits):decode(type,id);};rejects([&]{restored->restoreUnitBuffs(buffs,wrong);},"buff handle mapping");require(restored->units().at(units.at(host.bits))->buffs.empty(),"Invalid buff restore changed unit");restored->restoreUnitBuffs(buffs,decode);auto corruptAttack=attackPassives;corruptAttack.back()^=1;rejects([&]{restored->restoreAttackPassiveState(corruptAttack,decode);},"digest");auto opened=openSnapshot(attackPassives,32u*1024u*1024u);Bytes invalidAttack(opened.begin(),opened.end());Binary scan(invalidAttack);scan.expect(tag("SAPV"));scan.u32();snapshotText(scan,64);snapshotU64(scan);auto attackUnitCount=scan.u32();bool changed=false;for(unsigned i=0;i<attackUnitCount;++i){auto unit=scan.u32();auto failures=scan.u32();scan.take(size_t(failures)*8);auto balances=scan.u32();scan.take(size_t(balances)*12);auto doses=scan.u32();for(unsigned j=0;j<doses;++j){scan.take(32);auto offset=invalidAttack.size()-scan.left();if(unit==host.bits && !changed){auto bits=std::bit_cast<std::uint64_t>(1e300);for(unsigned n=0;n<8;++n)invalidAttack[offset+n]=std::uint8_t(bits>>(n*8));changed=true;}scan.take(8);}}require(changed,"Corrosive dose fixture missing");auto invalidPeriod=sealSnapshot(std::move(invalidAttack),32u*1024u*1024u);rejects([&]{restored->restoreAttackPassiveState(invalidPeriod,decode);},"corrosive dose");auto wrongAttack=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==retired.bits?units.at(enemy.bits):decode(type,id);};rejects([&]{restored->restoreAttackPassiveState(attackPassives,wrongAttack);},"mapping");require(restored->units().at(units.at(caster.bits))->criticalFailures.empty() && restored->units().at(units.at(host.bits))->corrosiveDoses.empty(),"Rejected attack passive restore changed unit state");restored->restoreAttackPassiveState(attackPassives,decode);restored->restoreUnitCasts(casts,decode);b.invoke("FogEnable",std::array{b.boolean(false)});auto target=restored->units().at(units.at(host.bits)),targetPeer=restored->units().at(units.at(peer.bits));require(has(*target,BuffKind::LightningShield) && has(*target,BuffKind::SpiritLink) && has(*targetPeer,BuffKind::SpiritLink),"Restored buffs missing");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;if(type=="effect")for(auto [old,current]:effectMap)if(current==id)return old;return 0u;};require(restored->encodeUnitBuffs(reverse)==buffs,"Buff snapshot did not round trip");auto bundledIds=bundled->restoreRecoveryBundle(recoveryBundle);auto bundledReverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:bundledIds)if(current==id)return old;return 0u;};require(bundled->encodeAttackPassiveState(bundledReverse)==attackPassives,"Recovery bundle lost attack passive state");require(restored->encodeAttackPassiveState(reverse)==attackPassives && restored->units().at(units.at(caster.bits))->criticalFailures.at(ObjectData::code("AOcr"))==7 && restored->units().at(units.at(host.bits))->corrosiveDoses.contains({ObjectData::code("Acor"),units.at(enemy.bits)}) && restored->units().at(units.at(host.bits))->corrosiveDoses.contains({ObjectData::code("ACcb"),units.at(retired.bits)}),"Attack passive state did not round trip");auto sourceMissiles=original->spellMissiles().size(),targetMissiles=restored->spellMissiles().size();require(original->castSpell(enemyMage.bits,ObjectData::code("AEim")) && restored->castSpell(units.at(enemyMage.bits),ObjectData::code("AEim")) && original->spellMissiles().size()==sourceMissiles+1 && restored->spellMissiles().size()==targetMissiles+1,"Restored Mana Flare did not react to a paid enemy spell");auto number=[](jass::Real v){return std::bit_cast<float>(v.bits());};auto peerLife=number(other->life),restoredLife=number(targetPeer->life);original->damageUnit(enemy.bits,host.bits,100,0,14);restored->damageUnit(units.at(enemy.bits),units.at(host.bits),100,0,14);require(number(other->life)<peerLife && std::abs((peerLife-number(other->life))-(restoredLife-number(targetPeer->life)))<.01f && std::abs(number(subject->life)-number(target->life))<.01f,"Restored spirit link damage differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during buff recovery");
    });
    test("unit_casts_restore_spell_and_references",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type lightning extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native PauseUnit takes unit u, boolean flag returns nothing
 native UnitAddAbility takes unit u, integer id returns boolean
 native FogEnable takes boolean enabled returns nothing
 native AddSpecialEffect takes string model, real x, real y returns effect
 native AddLightningEx takes string typ, boolean visible, real x1, real y1, real z1, real x2, real y2, real z2 returns lightning
 native Location takes real x, real y returns location
 native IssueImmediateOrder takes unit u, string order returns boolean
 native SetPlayerTechResearched takes player p, integer id, integer level returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"cast.j",source,"cast recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](int owner,const char* type,float x,float y){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(y)),a.real(real(0))});};auto caster=spawn(0,"Hmkg",-512,-512),victim=spawn(1,"hfoo",-256,-512);for(auto unit:{caster,victim})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("PauseUnit",std::array{victim,a.boolean(true)});a.invoke("FogEnable",std::array{a.boolean(false)});auto archer=spawn(0,"earc",-900,-512),rival=spawn(0,"earc",-850,-512),mount=spawn(0,"ehip",-100,-512);for(auto unit:{archer,rival,mount})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("UnitAddAbility",std::array{archer,a.integer(int(ObjectData::code("Acoa")))});a.invoke("UnitAddAbility",std::array{rival,a.integer(int(ObjectData::code("Acoa")))});a.invoke("SetPlayerTechResearched",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("Reht"))),a.integer(1)});auto firstCouple=original->castSpell(archer.bits,ObjectData::code("Acoa"),mount.bits);require(firstCouple && !original->castSpell(rival.bits,ObjectData::code("Acoa"),mount.bits),"Coupling target was not reserved");require(a.invoke("UnitAddAbility",std::array{caster,a.integer(int(ObjectData::code("AHtb")))}).bits && original->castSpell(caster.bits,ObjectData::code("AHtb"),victim.bits),"Cast order rejected");auto actor=original->units().at(caster.bits);for(int i=0;i<32 && actor->cast && actor->cast->phase==CastOrder::Phase::Approach;++i)original->advance(1./32);require(actor->cast && actor->cast->phase==CastOrder::Phase::Windup && actor->cast->abilityHandle,"Cast windup missing");auto visual=a.invoke("AddSpecialEffect",std::array{a.string("cast.mdl"),a.real(real(0)),a.real(real(0))});auto lightning=a.invoke("AddLightningEx",std::array{a.string("CLPB"),a.boolean(true),a.real(real(0)),a.real(real(0)),a.real(real(0)),a.real(real(50)),a.real(real(0)),a.real(real(0))});auto& cast=*actor->cast;cast.visuals.push_back(visual.bits);cast.lightnings.push_back(lightning.bits);cast.drainMarks.emplace_back(victim.bits,ObjectData::code("Bfoo"));cast.controlClaim=victim.bits;CombatOrder resume;resume.target=victim.bits;resume.attackMove=WorldPoint{real(500),real(600)};resume.revision=37;cast.resume=resume;cast.resumeOrder=851983;cast.resumeHolding=true;auto identity=[](std::string_view,std::uint32_t id){return id;};auto casts=original->encodeUnitCasts(identity),abilities=original->encodeAbilityIdentities(identity),effects=original->encodeEffects(identity),lightnings=original->encodeLightnings(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decodeWidget=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decodeWidget);auto abilityMap=restored->rebuildAbilityIdentities(abilities,unitMap),effectMap=restored->rebuildEffects(effects,decodeWidget),lightningMap=restored->rebuildLightnings(lightnings,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="ability"){auto it=abilityMap.find(id);return it==abilityMap.end()?0u:it->second;}if(type=="effect"){auto it=effectMap.find(id);return it==effectMap.end()?0u:it->second;}if(type=="lightning"){auto it=lightningMap.find(id);return it==lightningMap.end()?0u:it->second;}return decodeWidget(type,id);};auto damaged=casts;damaged.back()^=1;rejects([&]{restored->restoreUnitCasts(damaged,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return type=="effect" && id==visual.bits?0u:decode(type,id);};rejects([&]{restored->restoreUnitCasts(casts,wrong);},"cast handle mapping");require(!restored->units().at(units.at(caster.bits))->cast,"Invalid cast restore changed unit");restored->restoreUnitCasts(casts,decode);b.invoke("FogEnable",std::array{b.boolean(false)});require(!restored->castSpell(units.at(rival.bits),ObjectData::code("Acoa"),units.at(mount.bits)),"Restored coupling target lost its reservation");auto target=restored->units().at(units.at(caster.bits));require(target->cast && target->cast->phase==cast.phase && target->castRevision==actor->castRevision && target->cast->target==units.at(victim.bits) && target->cast->abilityHandle==abilityMap.at(cast.abilityHandle) && target->cast->visuals.back()==effectMap.at(visual.bits) && target->cast->lightnings.back()==lightningMap.at(lightning.bits) && target->cast->resume && target->cast->resume->target==units.at(victim.bits) && target->cast->drainMarks.back().first==units.at(victim.bits),"Restored cast differs");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;if(type=="ability")for(auto [old,current]:abilityMap)if(current==id)return old;if(type=="effect")for(auto [old,current]:effectMap)if(current==id)return old;if(type=="lightning")for(auto [old,current]:lightningMap)if(current==id)return old;return 0u;};require(restored->encodeUnitCasts(reverse)==casts,"Cast snapshot did not round trip");require(b.invoke("IssueImmediateOrder",std::array{b.handle("unit",units.at(archer.bits)),b.string("stop")}).bits && restored->castSpell(units.at(rival.bits),ObjectData::code("Acoa"),units.at(mount.bits)),"Stopping restored coupling did not release reservation");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during cast recovery");
    });
    test("lightnings_rebuild_following_and_retired_handles",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type lightning extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native PauseUnit takes unit u, boolean flag returns nothing
 native UnitAddAbility takes unit u, integer id returns boolean
 native FogEnable takes boolean enabled returns nothing
 native AddLightningEx takes string typ, boolean visible, real x1, real y1, real z1, real x2, real y2, real z2 returns lightning
 native DestroyLightning takes lightning l returns boolean
 native SetLightningColor takes lightning l, real r, real g, real b, real a returns boolean
 native Location takes real x, real y returns location
 globals
 lightning live=null
 lightning retired=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set live=AddLightningEx("CLPB",true,0.,0.,20.,100.,0.,40.)
 set retired=AddLightningEx("CLSB",false,0.,0.,20.,100.,0.,40.)
 call DestroyLightning(retired)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"lightning.j",source,"lightning recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](int owner,const char* type,float x,float y){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(y)),a.real(real(0))});};auto caster=spawn(0,"Ofar",-512,-512),victim=spawn(1,"hfoo",-256,-512);for(auto unit:{caster,victim})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("PauseUnit",std::array{victim,a.boolean(true)});a.invoke("FogEnable",std::array{a.boolean(false)});require(a.invoke("UnitAddAbility",std::array{caster,a.integer(int(ObjectData::code("AOcl")))}).bits && original->castSpell(caster.bits,ObjectData::code("AOcl"),victim.bits),"Chain Lightning order rejected");std::uint32_t following=0;for(int i=0;i<160 && !following;++i){original->advance(1./32);for(auto& [id,l]:original->lightnings())if(l->fromUnit==caster.bits && l->toUnit==victim.bits)following=id;}require(following,"Following spell lightning missing");a.invoke("RemoveUnit",std::array{victim});auto live=a.global("live"),retired=a.global("retired");require(a.invoke("SetLightningColor",std::array{live,a.real(real(.25f)),a.real(real(.5f)),a.real(real(.75f)),a.real(real(1))}).bits,"Lightning color setup failed");auto state=original->lightnings().at(live.bits);state->fromSurface=PathMovement::Ground;state->toSurface=PathMovement::Amphibious;state->fromHeight=12;state->toHeight=24;auto identity=[](std::string_view,std::uint32_t id){return id;};auto bolts=original->encodeLightnings(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity),globals=a.encodeGlobals(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decode);auto damaged=bolts;damaged.back()^=1;rejects([&]{restored->rebuildLightnings(damaged,decode);},"digest");Bytes invalid(bolts.begin(),bolts.end()-64);Binary reader(invalid);reader.expect(tag("SLGT"));reader.u32();snapshotText(reader,64);snapshotU64(reader);reader.u32();reader.u32();require(reader.u32()==1,"Lightning fixture active identity missing");reader.u32();reader.u32();snapshotText(reader,65536);snapshotText(reader,65536);auto offset=invalid.size()-reader.left();for(unsigned i=0;i<4;++i)invalid.at(offset+i)=0;invalid=sealSnapshot(std::move(invalid),32u*1024u*1024u);rejects([&]{restored->rebuildLightnings(invalid,decode);},"lightning source");auto wrong=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==victim.bits?units.at(caster.bits):decode(type,id);};rejects([&]{restored->rebuildLightnings(bolts,wrong);},"lightning unit mapping");require(restored->lightnings().empty(),"Invalid lightning restore changed state");auto map=restored->rebuildLightnings(bolts,decode);auto follow=restored->lightnings().at(map.at(following));require(follow->fromUnit==units.at(caster.bits) && follow->toUnit==units.at(victim.bits) && follow->expires && !restored->lightnings().contains(map.at(retired.bits)),"Lightning references or lifetime differ");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="lightning")for(auto [old,current]:map)if(current==id)return old;if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;return 0u;};require(restored->encodeLightnings(reverse)==bolts,"Lightning snapshot did not round trip");auto decodeGlobal=[&](std::string_view type,std::uint32_t id){if(type=="lightning"){auto it=map.find(id);return it==map.end()?0u:it->second;}return decode(type,id);};b.restoreGlobals(globals,decodeGlobal);require(b.global("live").bits==map.at(live.bits) && b.global("retired").bits==map.at(retired.bits),"Lightning globals did not retain identities");require(b.invoke("DestroyLightning",std::array{b.global("live")}).bits && !b.invoke("DestroyLightning",std::array{b.global("retired")}).bits,"Restored lightning destruction differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during lightning recovery");
    });
    test("effects_rebuild_active_retiring_and_removed_targets",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native AddSpecialEffect takes string model, real x, real y returns effect
 native AddSpecialEffectTarget takes string model, widget target, string attach returns effect
 native DestroyEffect takes effect e returns nothing
 native Location takes real x, real y returns location
 globals
 unit removed=null
 unit host=null
 effect finished=null
 effect attached=null
 effect live=null
 effect retiring=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set removed=CreateUnit(Player(0),'hfoo',-512.,-512.,0.)
 set finished=AddSpecialEffect("old.mdl",0.,0.)
 call DestroyEffect(finished)
 endfunction
 function makeEffects takes nothing returns nothing
 set attached=AddSpecialEffectTarget("attached.mdl",removed,"origin")
 call RemoveUnit(removed)
 set host=CreateUnit(Player(0),'hfoo',-256.,-512.,0.)
 set live=AddSpecialEffectTarget("live.mdl",host,"head")
 set retiring=AddSpecialEffect("retiring.mdl",0.,0.)
 call DestroyEffect(retiring)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"effects.j",source,"effect recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();original->advance(17);auto& a=original->runtime();auto& b=restored->runtime();a.invoke("makeEffects");auto removed=a.global("removed"),host=a.global("host"),finished=a.global("finished"),attached=a.global("attached"),live=a.global("live"),retiring=a.global("retiring");auto liveState=original->effects().at(live.bits);liveState->texture="texture.blp";liveState->sequenceSuffix="alternate";liveState->replacement=1;liveState->teamColor=3u;liveState->tint=0x12345678;liveState->z=18;liveState->facing=.5f;liveState->scale=1.25f;liveState->moonWellWaterHeight=42.f;liveState->groundAnchor=true;liveState->hideWhenDead=true;require(!original->effects().contains(finished.bits) && original->effects().contains(retiring.bits) && original->effects().at(retiring.bits)->destroyed && original->effects().at(attached.bits)->target==removed.bits,"Effect lifetime fixture differs");auto identity=[](std::string_view,std::uint32_t id){return id;};auto effects=original->encodeEffects(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity),globals=a.encodeGlobals(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decode);auto damaged=effects;damaged.back()^=1;rejects([&]{restored->rebuildEffects(damaged,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==removed.bits?units.at(host.bits):decode(type,id);};rejects([&]{restored->rebuildEffects(effects,wrong);},"effect target mapping");require(restored->effects().empty(),"Invalid effect restore changed state");auto map=restored->rebuildEffects(effects,decode);require(!restored->effects().contains(map.at(finished.bits)) && restored->effects().at(map.at(attached.bits))->target==units.at(removed.bits) && restored->effects().at(map.at(live.bits))->target==units.at(host.bits) && restored->effects().at(map.at(retiring.bits))->destroyed,"Effect lifetime restore differs");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="effect")for(auto [old,current]:map)if(current==id)return old;if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;return 0u;};require(restored->encodeEffects(reverse)==effects,"Effect snapshot did not round trip");auto decodeGlobal=[&](std::string_view type,std::uint32_t id){if(type=="effect"){auto it=map.find(id);return it==map.end()?0u:it->second;}return decode(type,id);};b.restoreGlobals(globals,decodeGlobal);require(b.global("finished").bits==map.at(finished.bits) && b.global("attached").bits==map.at(attached.bits) && b.global("retiring").bits==map.at(retiring.bits),"Effect globals did not retain identities");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during effect recovery");
    });
    test("spell_missiles_restore_flight_and_removed_handles",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native PauseUnit takes unit u, boolean flag returns nothing
 native UnitAddAbility takes unit u, integer ability returns boolean
 native FogEnable takes boolean enabled returns nothing
 native Location takes real x, real y returns location
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"spell-missile.j",source,"spell missile recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](int owner,const char* type,float x,float y){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(y)),a.real(real(0))});};a.invoke("FogEnable",std::array{a.boolean(false)});auto caster=spawn(0,"Hmkg",-512,-512),victim=spawn(1,"hfoo",-256,-512);for(auto unit:{caster,victim})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("PauseUnit",std::array{victim,a.boolean(true)});require(a.invoke("UnitAddAbility",std::array{caster,a.integer(int(ObjectData::code("AHtb")))}).bits,"Storm Bolt fixture missing");require(original->castSpell(caster.bits,ObjectData::code("AHtb"),victim.bits),"Storm Bolt order rejected");for(int i=0;i<160 && original->spellMissiles().empty();++i)original->advance(1./32);require(!original->spellMissiles().empty(),"Storm Bolt missile missing");a.invoke("RemoveUnit",std::array{caster});a.invoke("RemoveUnit",std::array{victim});auto identity=[](std::string_view,std::uint32_t id){return id;};auto missiles=original->encodeSpellMissiles(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decode);auto wrong=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==victim.bits?units.at(caster.bits):decode(type,id);};rejects([&]{restored->restoreSpellMissiles(missiles,wrong);},"spell missile handle mapping");require(restored->spellMissiles().empty(),"Invalid spell missile mapping changed state");auto damaged=missiles;damaged.back()^=1;rejects([&]{restored->restoreSpellMissiles(damaged,decode);},"digest");restored->restoreSpellMissiles(missiles,decode);require(restored->spellMissiles().size()==original->spellMissiles().size(),"Spell missile count differs");for(auto& [id,m]:original->spellMissiles()){auto& copy=restored->spellMissiles().at(id);require(copy.source==units.at(m.source) && copy.target==units.at(m.target) && copy.position.x.bits()==m.position.x.bits() && copy.position.y.bits()==m.position.y.bits() && copy.spell.ability==m.spell.ability && copy.spell.kind==m.spell.kind && copy.spell.speed==m.spell.speed && copy.amount==m.amount,"Restored spell missile differs");}auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;return 0u;};require(restored->encodeSpellMissiles(reverse)==missiles,"Spell missile snapshot did not round trip");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during spell missile recovery");
    });
    test("ability_identities_rebuild_active_and_retired",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type location extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type playerunitevent extends handle
 type boolexpr extends handle
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code c returns triggeraction
 native TriggerRegisterPlayerUnitEvent takes trigger t, player p, playerunitevent e, boolexpr f returns event
 native ConvertPlayerUnitEvent takes integer n returns playerunitevent
 native GetSpellAbility takes nothing returns ability
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native PauseUnit takes unit u, boolean flag returns nothing
 native UnitAddAbility takes unit u, integer ability returns boolean
 native FogEnable takes boolean enabled returns nothing
 native Location takes real x, real y returns location
 globals
 ability saved=null
 ability retired=null
 endglobals
 function capture takes nothing returns nothing
 set retired=saved
 set saved=GetSpellAbility()
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 local trigger t=CreateTrigger()
 call TriggerRegisterPlayerUnitEvent(t,Player(0),ConvertPlayerUnitEvent(272),null)
 call TriggerAddAction(t,function capture)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"spell-missile.j",source,"spell missile recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](int owner,const char* type,float x,float y){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(y)),a.real(real(0))});};a.invoke("FogEnable",std::array{a.boolean(false)});auto caster=spawn(0,"Hmkg",-512,-512),victim=spawn(1,"hfoo",-256,-512);for(auto unit:{caster,victim})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("PauseUnit",std::array{victim,a.boolean(true)});require(a.invoke("UnitAddAbility",std::array{caster,a.integer(int(ObjectData::code("AHtb")))}).bits,"Storm Bolt fixture missing");require(original->castSpell(caster.bits,ObjectData::code("AHtb"),victim.bits),"Storm Bolt order rejected");for(int i=0;i<160 && original->spellMissiles().empty();++i)original->advance(1./32);require(!original->spellMissiles().empty(),"Storm Bolt missile missing");auto retiredAbility=a.global("saved");require(retiredAbility.bits,"Spell event did not capture ability");a.invoke("RemoveUnit",std::array{caster});a.invoke("RemoveUnit",std::array{victim});auto nextCaster=spawn(0,"Hmkg",-512,-650),nextVictim=spawn(1,"hfoo",-256,-650);for(auto unit:{nextCaster,nextVictim})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("PauseUnit",std::array{nextVictim,a.boolean(true)});require(a.invoke("UnitAddAbility",std::array{nextCaster,a.integer(int(ObjectData::code("AHtb")))}).bits && original->castSpell(nextCaster.bits,ObjectData::code("AHtb"),nextVictim.bits),"Second Storm Bolt order rejected");for(int i=0;i<32 && a.global("saved").bits==retiredAbility.bits;++i)original->advance(1./32);auto activeAbility=a.global("saved");require(activeAbility.bits && activeAbility.bits!=retiredAbility.bits,"Second ability handle missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto globals=a.encodeGlobals(identity),abilityBytes=original->encodeAbilityIdentities(identity),unitBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decode);auto badAbility=abilityBytes;badAbility.back()^=1;rejects([&]{restored->rebuildAbilityIdentities(badAbility,unitMap);},"digest");auto wrongAbilityUnit=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==nextCaster.bits?units.at(nextVictim.bits):unitMap(type,id);};rejects([&]{restored->rebuildAbilityIdentities(abilityBytes,wrongAbilityUnit);},"ability unit mapping");auto abilities=restored->rebuildAbilityIdentities(abilityBytes,unitMap);require(abilities.contains(retiredAbility.bits) && abilities.contains(activeAbility.bits) && abilities.at(retiredAbility.bits)!=abilities.at(activeAbility.bits),"Ability handles missing");auto reverseAbility=[&](std::string_view type,std::uint32_t id){if(type=="ability")for(auto [old,current]:abilities)if(current==id)return old;if(type=="unit")for(auto [old,current]:units)if(current==id)return old;return 0u;};require(restored->encodeAbilityIdentities(reverseAbility)==abilityBytes,"Ability identities did not round trip");auto decodeGlobal=[&](std::string_view type,std::uint32_t id){if(type=="ability"){auto it=abilities.find(id);return it==abilities.end()?0u:it->second;}return decode(type,id);};b.restoreGlobals(globals,decodeGlobal);require(b.global("saved").bits==abilities.at(activeAbility.bits) && b.global("retired").bits==abilities.at(retiredAbility.bits),"Ability globals did not retain their identities");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during ability identity recovery");
    });
    test("attack_projectiles_restore_flight_and_removed_handles",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type item extends widget
 type player extends handle
 type effect extends handle
 type ability extends handle
 type sound extends handle
 type location extends handle
 native Player takes integer id returns player
 native CreateUnit takes player p, integer id, real x, real y, real facing returns unit
 native RemoveUnit takes unit u returns nothing
 native SetUnitPathing takes unit u, boolean enabled returns nothing
 native PauseUnit takes unit u, boolean flag returns nothing
 native UnitAddAbility takes unit u, integer ability returns boolean
 native FogEnable takes boolean enabled returns nothing
 native Location takes real x, real y returns location
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"projectile.j",source,"projectile recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),restored=make();original->startMain();auto& a=original->runtime();auto& b=restored->runtime();auto spawn=[&](int owner,const char* type,float x,float y){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(x)),a.real(real(y)),a.real(real(0))});};a.invoke("FogEnable",std::array{a.boolean(false)});auto archer=spawn(0,"earc",-512,-512),enemy=spawn(1,"hfoo",-384,-512),removedArcher=spawn(0,"earc",-512,-650),removedEnemy=spawn(1,"hfoo",-384,-650);for(auto unit:{archer,enemy,removedArcher,removedEnemy})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});for(auto unit:{enemy,removedEnemy})a.invoke("PauseUnit",std::array{unit,a.boolean(true)});require(a.invoke("UnitAddAbility",std::array{archer,a.integer(int(ObjectData::code("Apoi")))}).bits,"Projectile poison fixture missing");require(original->attackUnit(archer.bits,enemy.bits,true) && original->attackUnit(removedArcher.bits,removedEnemy.bits,true),"Projectile attack orders rejected");bool both=false,seenFirst=false,seenSecond=false,seenWindup=false;for(int i=0;i<96 && !both;++i){original->advance(1./32);seenWindup=seenWindup || bool(original->units().at(archer.bits)->combat.windup);bool first=false,second=false;for(auto& [id,p]:original->projectiles()){first=first || p.source==archer.bits;second=second || p.source==removedArcher.bits;}seenFirst=seenFirst || first;seenSecond=seenSecond || second;both=first && second;}require(both,("Projectile fixture did not launch both missiles: "+std::to_string(seenFirst)+","+std::to_string(seenSecond)+",windup="+std::to_string(seenWindup)+",target="+std::to_string(original->units().at(archer.bits)->combat.target)).c_str());a.invoke("RemoveUnit",std::array{removedArcher});a.invoke("RemoveUnit",std::array{removedEnemy});bool hadProc=false;for(auto& [id,p]:original->projectiles())if(p.source==archer.bits)for(auto& proc:p.procs)hadProc=hadProc || proc.ability==ObjectData::code("Apoi");require(hadProc,"Projectile did not capture poison passive");auto identity=[](std::string_view,std::uint32_t id){return id;};auto shots=original->encodeAttackProjectiles(identity),unitsBytes=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),items=original->encodeItems(identity),destructables=original->encodeDestructables(identity);restored->restoreSimulationClock(original->encodeSimulationClock());restored->restorePlayerTechnology(original->encodePlayerTechnology());auto desMap=restored->rebuildDestructables(destructables);b.invoke("Location",std::array{b.real(real(0)),b.real(real(0))});auto units=restored->rebuildUnitIdentities(unitsBytes);auto unitMap=[&](std::string_view type,std::uint32_t id){auto it=units.find(id);return type=="unit" && it!=units.end()?it->second:0u;};restored->prepareUnitCore(core,unitMap);auto itemMap=restored->rebuildItems(items,unitMap);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unitMap(type,id);if(type=="item"){auto it=itemMap.find(id);return it==itemMap.end()?0u:it->second;}if(type=="destructable"){auto it=desMap.find(id);return it==desMap.end()?0u:it->second;}return 0u;};restored->finishUnitCore(core,decode);auto bad=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==enemy.bits?units.at(archer.bits):decode(type,id);};rejects([&]{restored->restoreAttackProjectiles(shots,bad);},"projectile handle mapping");require(restored->projectiles().empty(),"Invalid projectile mapping changed state");auto damaged=shots;damaged.back()^=1;rejects([&]{restored->restoreAttackProjectiles(damaged,decode);},"digest");restored->restoreAttackProjectiles(shots,decode);require(restored->projectiles().size()==original->projectiles().size(),"Projectile count differs");for(auto& [id,p]:original->projectiles()){auto& q=restored->projectiles().at(id);require(q.source==units.at(p.source) && q.target==units.at(p.target) && q.position.x.bits()==p.position.x.bits() && q.position.y.bits()==p.position.y.bits() && q.definition.speed==p.definition.speed && q.definition.kind==p.definition.kind && q.damage==p.damage && q.procs.size()==p.procs.size(),"Restored projectile differs");for(size_t i=0;i<p.procs.size();++i)require(q.procs[i].ability==p.procs[i].ability && q.procs[i].kind==p.procs[i].kind && q.procs[i].duration==p.procs[i].duration && q.procs[i].amount==p.procs[i].amount,"Restored projectile passive differs");}auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="item")for(auto [old,current]:itemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:desMap)if(current==id)return old;return 0u;};require(restored->encodeAttackProjectiles(reverse)==shots,"Projectile snapshot did not round trip");
        original->stopUnit(archer.bits);auto spider=spawn(0,"ucry",-512,-900),victim=spawn(1,"hfoo",-256,-900);for(auto unit:{spider,victim})a.invoke("SetUnitPathing",std::array{unit,a.boolean(false)});a.invoke("PauseUnit",std::array{victim,a.boolean(true)});require(original->attackUnit(spider.bits,victim.bits,true),"Spider attack order rejected");bool launched=false;for(int i=0;i<160 && !launched;++i){original->advance(1./32);for(auto& [id,p]:original->projectiles())launched=launched || p.source==spider.bits;}require(launched,"Spider projectile missing");original->stopUnit(spider.bits);for(int i=0;i<160 && original->visualProjectiles().empty();++i)original->advance(1./32);require(!original->visualProjectiles().empty(),"Spider return projectile missing");auto visualShots=original->encodeAttackProjectiles(identity),visualUnits=original->encodeUnitIdentities(identity),visualCore=original->encodeUnitCore(identity),visualItems=original->encodeItems(identity),visualDestructables=original->encodeDestructables(identity);auto visualRestored=make();auto& c=visualRestored->runtime();visualRestored->restoreSimulationClock(original->encodeSimulationClock());visualRestored->restorePlayerTechnology(original->encodePlayerTechnology());auto visualDesMap=visualRestored->rebuildDestructables(visualDestructables);c.invoke("Location",std::array{c.real(real(0)),c.real(real(0))});auto visualUnitMap=visualRestored->rebuildUnitIdentities(visualUnits);auto decodeVisualUnit=[&](std::string_view type,std::uint32_t id){auto it=visualUnitMap.find(id);return type=="unit" && it!=visualUnitMap.end()?it->second:0u;};visualRestored->prepareUnitCore(visualCore,decodeVisualUnit);auto visualItemMap=visualRestored->rebuildItems(visualItems,decodeVisualUnit);auto decodeVisual=[&](std::string_view type,std::uint32_t id){if(type=="unit")return decodeVisualUnit(type,id);if(type=="item"){auto it=visualItemMap.find(id);return it==visualItemMap.end()?0u:it->second;}if(type=="destructable"){auto it=visualDesMap.find(id);return it==visualDesMap.end()?0u:it->second;}return 0u;};visualRestored->finishUnitCore(visualCore,decodeVisual);visualRestored->restoreAttackProjectiles(visualShots,decodeVisual);require(visualRestored->visualProjectiles().size()==original->visualProjectiles().size(),"Spider return projectile count differs");auto reverseVisual=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:visualUnitMap)if(current==id)return old;if(type=="item")for(auto [old,current]:visualItemMap)if(current==id)return old;if(type=="destructable")for(auto [old,current]:visualDesMap)if(current==id)return old;return 0u;};require(visualRestored->encodeAttackProjectiles(reverseVisual)==visualShots,"Spider return projectile did not round trip");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during projectile recovery");
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
 type effect extends handle
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
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"collections.j",source,"authored collection persistence test"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=create(),restored=create();auto& a=original->runtime();auto& b=restored->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto legacyCurrent=original->encodeCollections(identity);auto legacyContent=openSnapshot(legacyCurrent,32u*1024u*1024u);Bytes legacy(legacyContent.begin(),legacyContent.end());auto invalidLife=legacy;invalidLife[invalidLife.size()-8]=2;auto invalidLifeSnapshot=sealSnapshot(std::move(invalidLife),32u*1024u*1024u);auto invalidTarget=create();rejects([&]{invalidTarget->rebuildCollections(invalidLifeSnapshot,{});},"lifecycle");require(invalidTarget->liveObjects(NativeKind::Group)==1,"Invalid lifecycle changed target");legacy.erase(legacy.end()-8,legacy.end()-4);for(auto version:{1,2}){legacy[4]=std::uint8_t(version);auto legacySnapshot=sealSnapshot(legacy,32u*1024u*1024u);auto legacyTarget=create();require(legacyTarget->rebuildCollections(legacySnapshot,{}).size()==1,"Legacy collection snapshot failed");}original->startMain();a.invoke("createUnits");a.invoke("setup");auto live=a.global("living"),first=a.global("firstUnit"),group=a.global("members");require(a.invoke("FirstOfGroup",std::array{group}).bits==first.bits && a.invoke("IsUnitInGroup",std::array{first,group}).bits,"First group member was not retained by fixture");auto collections=original->encodeCollections(identity),globals=a.encodeGlobals(identity);auto invalidContent=openSnapshot(collections,32u*1024u*1024u);Bytes invalidVersion(invalidContent.begin(),invalidContent.end());invalidVersion[4]=1;auto invalidLegacy=sealSnapshot(std::move(invalidVersion),32u*1024u*1024u);b.invoke("CreateTimer");b.invoke("createUnits");auto targetLive=b.global("living"),targetDead=b.global("firstUnit"),oldBaseline=b.global("baseline");auto decodeUnit=[&](std::string_view type,std::uint32_t id){if(type!="unit")return 0u;return id==live.bits?targetLive.bits:id==first.bits?targetDead.bits:0u;};rejects([&]{restored->rebuildCollections(invalidLegacy,decodeUnit);},"");auto bad=collections;bad.back()^=1;rejects([&]{restored->rebuildCollections(bad,decodeUnit);},"digest");rejects([&]{restored->rebuildCollections(collections,[&](std::string_view,std::uint32_t){return targetLive.bits;});},"unit mapping");require(b.global("baseline").bits==oldBaseline.bits && restored->liveObjects(NativeKind::Group)==1,"Rejected collection restore changed initial group");auto mapping=restored->rebuildCollections(collections,decodeUnit);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return decodeUnit(type,id);auto found=mapping.find({std::string(type),id});return found==mapping.end()?0u:found->second;};b.restoreGlobals(globals,decode);auto g=b.global("members"),f=b.global("team"),loc=b.global("point"),rect=b.global("bounds");require(b.global("baseline").bits!=oldBaseline.bits && b.invoke("FirstOfGroup",std::array{g}).bits==targetDead.bits && b.invoke("IsUnitInGroup",std::array{targetDead,g}).bits && b.invoke("IsUnitInGroup",std::array{targetLive,g}).bits,"Group order, membership or global mapping changed");require(b.invoke("GetLocationX",std::array{loc}).bits==a.invoke("GetLocationX",std::array{a.global("point")}).bits && b.invoke("GetLocationY",std::array{loc}).bits==a.invoke("GetLocationY",std::array{a.global("point")}).bits && b.invoke("GetRectMinX",std::array{rect}).bits==a.invoke("GetRectMinX",std::array{a.global("bounds")}).bits && b.invoke("GetRectMaxY",std::array{rect}).bits==a.invoke("GetRectMaxY",std::array{a.global("bounds")}).bits,"Geometry values changed");auto area=b.global("area");auto inRegion=[&](float x,float y){return b.invoke("IsPointInRegion",std::array{area,b.real(real(x)),b.real(real(y))}).bits!=0;};require(inRegion(50,0) && !inRegion(0,0) && !inRegion(200,0),"Region membership changed");auto player0=b.invoke("Player",std::array{b.integer(0)}),player1=b.invoke("Player",std::array{b.integer(1)}),player2=b.invoke("Player",std::array{b.integer(2)});require(b.invoke("IsPlayerInForce",std::array{player0,f}).bits && !b.invoke("IsPlayerInForce",std::array{player1,f}).bits && b.invoke("IsPlayerInForce",std::array{player2,f}).bits,"Force membership changed");b.invoke("enumerate");require(b.global("enumerated").bits==1,"Group iteration did not visit the expected member");auto inverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")return id==targetLive.bits?live.bits:id==targetDead.bits?first.bits:0u;for(auto& [key,value]:mapping)if(key.first==type && value==id)return key.second;return 0u;};require(restored->encodeCollections(inverse)==collections,"Collection snapshot did not round-trip");b.invoke("RemoveUnit",std::array{targetDead});require(b.invoke("FirstOfGroup",std::array{g}).bits==targetLive.bits && !b.invoke("IsUnitInGroup",std::array{targetDead,g}).bits,"Removed unit remained in restored group");
    });
    test("collections_preserve_retired_handles_and_legacy_versions",[&]{
        std::string source=R"jass(type destructable extends handle
 type group extends handle
 type force extends handle
 type location extends handle
 type rect extends handle
 type region extends handle
 native CreateGroup takes nothing returns group
 native DestroyGroup takes group g returns nothing
 native CreateForce takes nothing returns force
 native DestroyForce takes force f returns nothing
 native Location takes real x, real y returns location
 native RemoveLocation takes location p returns nothing
 native Rect takes real x, real y, real x2, real y2 returns rect
 native RemoveRect takes rect r returns nothing
 native CreateRegion takes nothing returns region
 native RemoveRegion takes region r returns nothing
 globals
 group g=null
 force f=null
 location p=null
 rect r=null
 region area=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set g=CreateGroup()
 set f=CreateForce()
 set p=Location(1.,2.)
 set r=Rect(0.,0.,3.,4.)
 set area=CreateRegion()
 call DestroyGroup(g)
 call DestroyForce(f)
 call RemoveLocation(p)
 call RemoveRect(r)
 call RemoveRegion(area)
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"retired-collections.j",source,"collection lifecycle"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto& b=target->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto saved=original->encodeCollections(identity),globals=a.encodeGlobals(identity);auto bad=saved;bad.back()^=1;rejects([&]{target->rebuildCollections(bad,{});},"digest");auto mapping=target->rebuildCollections(saved,{});require(mapping.size()==5,"Retired collection identities missing");auto decode=[&](std::string_view type,std::uint32_t id){auto it=mapping.find({std::string(type),id});return it==mapping.end()?0u:it->second;};b.restoreGlobals(globals,decode);for(auto [type,name]:std::initializer_list<std::pair<const char*,const char*>>{{"group","g"},{"force","f"},{"location","p"},{"rect","r"},{"region","area"}})require(b.global(name).bits==mapping.at({type,a.global(name).bits}),"Retired global identity differs");auto inverse=[&](std::string_view type,std::uint32_t id){for(auto& [key,value]:mapping)if(key.first==type && value==id)return key.second;return 0u;};require(target->encodeCollections(inverse)==saved,"Retired collections did not round trip");rejects([&]{target->rebuildCollections(saved,{});},"");
    });
    test("recovery_bundle_rebuilds_component_graph_but_blocks_main",[&]{
        wchar_t previous[32768]{};auto previousLength=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);if(previousLength>=32768)throw std::runtime_error("User directory environment too long");struct RestoreUserDir{std::wstring value;bool present;~RestoreUserDir(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",present?value.c_str():nullptr);}}restoreUserDir{previous,previousLength!=0};auto scratch=output/(L"checkpoint-"+std::to_wstring(GetCurrentProcessId()));require(SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",scratch.c_str())!=0,"Checkpoint scratch directory unavailable");
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 type ability extends handle
 type effect extends handle
 type unitstate extends handle
 native Checkpoint takes string name returns nothing
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native CreateTimer takes nothing returns timer
 native TimerStart takes timer t, real timeout, boolean periodic, code handler returns nothing
 native SetUnitState takes unit u, unitstate state, real value returns nothing
 native UnitIgnoreAlarm takes unit u, boolean value returns boolean
 native UnitAddAbility takes unit u, integer ability returns boolean
 native SetPlayerTechResearched takes player p, integer tech, integer level returns nothing
 native CreateDestructable takes integer t, real x, real y, real facing, real scale, integer variation returns destructable
 native WaygateSetDestination takes unit u, real x, real y returns nothing
 native WaygateActivate takes unit u, boolean active returns nothing
 native SelectUnit takes unit u, boolean flag returns nothing
 native UnitSetUsesAltIcon takes unit u, boolean flag returns nothing
 globals
 unit actor=null
 unit gate=null
 unit caster=null
 unit shade=null
 unit town=null
 unit worker=null
 unit worker2=null
 unit ancient=null
 unit ancient2=null
 unit bear=null
 unit bear2=null
 timer clock=null
 integer pulses=0
 integer checkpointResult=0
 endglobals
 function checkpoint takes nothing returns nothing
 local integer saved=41
 call Checkpoint("slot")
 set checkpointResult=saved+1
 endfunction
 function pulse takes nothing returns nothing
 set pulses=pulses+1
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set actor=CreateUnit(Player(0),'hfoo',0.,0.,0.)
 set gate=CreateUnit(Player(0),'nwgt',256.,0.,0.)
 set caster=CreateUnit(Player(0),'Hamg',0.,0.,0.)
 set shade=CreateUnit(Player(1),'ushd',1024.,0.,0.)
 set town=CreateUnit(Player(0),'htow',1800.,0.,0.)
 set worker=CreateUnit(Player(0),'hpea',1500.,0.,0.)
 set worker2=CreateUnit(Player(0),'hpea',1750.,0.,0.)
 call SetPlayerTechResearched(Player(0),'Redc',2)
 call SetPlayerTechResearched(Player(0),'Redt',2)
 set bear=CreateUnit(Player(0),'edoc',-512.,512.,0.)
 set bear2=CreateUnit(Player(0),'edoc',-512.,768.,0.)
 set ancient=CreateUnit(Player(0),'eaom',-1024.,0.,0.)
 set ancient2=CreateUnit(Player(0),'eaom',-1536.,0.,0.)
 call UnitIgnoreAlarm(worker,true)
 call WaygateSetDestination(gate,512.,128.)
 call WaygateActivate(gate,false)
 set clock=CreateTimer()
 call TimerStart(clock,1.,true,function pulse)
 call SelectUnit(actor,true)
 call UnitSetUsesAltIcon(actor,true)
 endfunction
 )jass";unsigned checkpointCalls=0;jass::ExternalWaitToken checkpointToken=0;auto make=[&](bool start,bool changed=false){auto script=source;if(changed)script+="\n// changed\n";auto module=Module::compile(Program::parse({{"bundle-snapshot.j",script,"recovery bundle"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->runtime().bind("Checkpoint",[&](auto& vm,auto args){if(!args[0].text || *args[0].text!="slot")throw std::runtime_error("Checkpoint name differs");++checkpointCalls;checkpointToken=vm.prepareExternalWait();vm.waitExternal(checkpointToken);return vm.nothing();});result->runtime().markNativeCompletedOnResume("Checkpoint");result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false),disk=make(false);original->advance(.375);auto& fixture=original->runtime();auto caster=fixture.global("caster"),shade=fixture.global("shade"),player=fixture.invoke("Player",std::array{fixture.integer(0)});fixture.invoke("SetPlayerTechResearched",std::array{player,fixture.integer(int(ObjectData::code("Rhse"))),fixture.integer(1)});require(fixture.invoke("UnitAddAbility",std::array{caster,fixture.integer(int(ObjectData::code("AHta")))}).bits,"Reveal ability fixture missing");require(!original->unitDetected(shade.bits,0),"Reveal target already detected");require(original->castSpellAt(caster.bits,ObjectData::code("AHta"),{real(1024),real(0)}),"Reveal order rejected");original->advance(1);require(original->unitDetected(shade.bits,0),"Reveal did not detect target");fixture.invoke("SetPlayerTechResearched",std::array{player,fixture.integer(int(ObjectData::code("Resc"))),fixture.integer(1)});require(fixture.invoke("UnitAddAbility",std::array{caster,fixture.integer(int(ObjectData::code("Aesr")))}).bits,"Sentinel ability fixture missing");auto tree=fixture.invoke("CreateDestructable",std::array{fixture.integer(int(ObjectData::code("LTlt"))),fixture.real(real(128)),fixture.real(real(0)),fixture.real(real(0)),fixture.real(real(1)),fixture.integer(0)});require(tree.bits && original->castSpell(caster.bits,ObjectData::code("Aesr"),tree.bits),"Sentinel order rejected");original->advance(1);auto same=[](std::string_view,std::uint32_t id){return id;};auto vision=original->encodeRevealState(same);Binary visionData(openSnapshot(vision,16u*1024u*1024u));visionData.expect(tag("SRVL"));require(visionData.u32()==2,"Reveal snapshot version mismatch");snapshotText(visionData,64);snapshotU64(visionData);snapshotU64(visionData);require(visionData.count(64,4096)>0,"Sentinel was not created");auto bear=fixture.global("bear"),bear2=fixture.global("bear2");original->units().at(bear.bits)->sourceSummoned=true;fixture.invoke("SetUnitState",std::array{bear,fixture.handle("unitstate",2),fixture.real(real(200))});fixture.invoke("SetUnitState",std::array{bear2,fixture.handle("unitstate",2),fixture.real(real(200))});require(original->castSpell(bear.bits,ObjectData::code("Abrf")),"Bear form order rejected");original->advance(3);require(original->units().at(bear.bits)->unitForm && original->units().at(bear.bits)->unitForm->active && original->units().at(bear.bits)->sourceSummoned && original->units().at(bear.bits)->type==ObjectData::code("edcm"),"Active bear fixture missing");auto ancient=fixture.global("ancient"),ancient2=fixture.global("ancient2");require(original->castSpell(ancient.bits,ObjectData::code("Aro1")),"Ancient unroot rejected");original->advance(4);require(original->units().at(ancient.bits)->mobileBuilding() && original->units().at(ancient.bits)->footprint.empty(),"Uprooted ancient fixture missing");require(original->castSpell(ancient2.bits,ObjectData::code("Aro1")),"Second ancient unroot rejected");original->advance(1.5);require(original->units().at(ancient2.bits)->rootTransition.has_value(),"Ancient transition fixture missing");require(original->castSpell(bear2.bits,ObjectData::code("Abrf")),"Second bear form order rejected");original->advance(1);require(original->units().at(bear2.bits)->formTransition.has_value(),"Bear transition fixture missing");auto town=fixture.global("town"),worker=fixture.global("worker"),worker2=fixture.global("worker2");require(fixture.invoke("UnitAddAbility",std::array{town,fixture.integer(int(ObjectData::code("Amic")))}).bits,"Town bell ability fixture missing");require(original->castSpell(town.bits,ObjectData::code("Amic")),"Town bell order rejected");original->advance(.125);require(original->units().at(worker.bits)->militia && original->units().at(town.bits)->militiaBell,"Militia order fixture missing");require(original->units().at(worker2.bits)->militia && original->units().at(worker2.bits)->militia->phase==MilitiaState::Phase::None && original->units().at(worker2.bits)->type==ObjectData::code("hmil"),"Active militia fixture missing");auto actor=original->runtime().global("actor").bits,gate=original->runtime().global("gate").bits;require(original->units().at(gate)->waygate.has_value(),"Waygate fixture missing");auto actorState=original->units().at(actor);actorState->burrowed=true;actorState->spiritEthereal=true;actorState->structureTarget=true;actorState->formHealthRegen=1.25f;original->units().at(gate)->waygate->inside.insert(actor);original->units().at(gate)->waygate->retryAfter[actor]=1.25;fixture.start("checkpoint");require(checkpointCalls==1 && !fixture.global("checkpointResult").bits,"Checkpoint fixture did not suspend");auto bundle=original->encodeRecoveryBundle();original->saveRecoveryCheckpoint("nested\\slot.w3z");require(fs::is_regular_file(scratch/L"Saves"/L"nested"/L"slot.w3z"),"Checkpoint file missing");std::stop_source canceled;canceled.request_stop();rejects([&]{sha256(std::span<const std::uint8_t>(bundle),canceled.get_token());},"Operation canceled");rejects([&]{sha256(fixtureArchives.mapPath(),canceled.get_token());},"Operation canceled");rejects([&]{openSnapshot(bundle,256u*1024u*1024u,canceled.get_token());},"Operation canceled");rejects([&]{ScriptSession::inspectRecoveryCheckpoint(fixtureArchives.root(),"nested\\slot.w3z",canceled.get_token());},"Operation canceled");rejects([&]{ScriptSession::inspectAndResolveRecoveryCheckpoint(fixtureArchives.root(),"nested\\slot.w3z",{},canceled.get_token());},"Operation canceled");auto checkpointInfo=ScriptSession::inspectRecoveryCheckpoint(fixtureArchives.root(),"nested\\slot.w3z");require(checkpointInfo.mapPath==utf8(fixtureArchives.mapPath().wstring()) && checkpointInfo.mapDigest==fixtureArchives.mapDigest() && checkpointInfo.expansion && checkpointInfo.version==1 && checkpointInfo.defaultDifficulty==1,"Checkpoint map identity differs");require(ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\slot.w3z")==fs::canonical(fixtureArchives.mapPath()),"Checkpoint map resolution differs");auto writeHint=[&](const char* name,const std::string& digest,const std::string& hint=std::string{}){SnapshotWriter writer(257u*1024u*1024u-64);writer.u32(tag("WSAV"));writer.u32(1);writer.text(hint.empty()?utf8(fixtureArchives.mapPath().filename().wstring()):hint,65536);writer.text(digest,64);writer.size(bundle.size());writer.raw(bundle);auto bytes=sealSnapshot(writer.finish(),257u*1024u*1024u);std::ofstream file(scratch/L"Saves"/L"nested"/wide(name),std::ios::binary);file.write(reinterpret_cast<const char*>(bytes.data()),std::streamsize(bytes.size()));require(bool(file),"Cannot write checkpoint map fixture");};writeHint("relative.w3z",fixtureArchives.mapDigest());require(ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\relative.w3z")==fs::canonical(fixtureArchives.mapPath()),"Relative checkpoint map resolution differs");writeHint("wrong-map.w3z",std::string(64,'0'));try{ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\wrong-map.w3z");throw std::runtime_error("Checkpoint map mismatch accepted");}catch(const RecoveryMapNotFound& error){require(error.mapPath==utf8(fixtureArchives.mapPath().filename().wstring()),"Missing checkpoint map path differs");}auto movedHint=fs::path(L"Z:\\_mengine_missing_old_install_\\MaPs")/fixtureArchives.mapPath().filename();writeHint("moved.w3z",fixtureArchives.mapDigest(),utf8(movedHint.wstring()));require(ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\moved.w3z")==fs::canonical(fixtureArchives.mapPath()),"Moved installation map was not resolved");writeHint("moved-wrong.w3z",std::string(64,'0'),utf8(movedHint.wstring()));rejects([&]{ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\moved-wrong.w3z");},"Checkpoint map differs");auto otherMapHint=fs::path(L"Z:\\_mengine_missing_old_install_\\Maps\\FrozenThrone\\(2)Amazonia.w3x");writeHint("moved-different.w3z",fixtureArchives.mapDigest(),utf8(otherMapHint.wstring()));rejects([&]{ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\moved-different.w3z");},"matching identity");auto external=scratch/L"external";fs::create_directories(external);auto externalMap=external/L"outside.w3m";fs::copy_file(fixtureArchives.mapPath(),externalMap,fs::copy_options::overwrite_existing);writeHint("external.w3z",fixtureArchives.mapDigest(),utf8(externalMap.wstring()));rejects([&]{ScriptSession::resolveRecoveryCheckpointMap(fixtureArchives.root(),"nested\\external.w3z");},"matching identity");auto externalResult=ScriptSession::inspectAndResolveRecoveryCheckpoint(fixtureArchives.root(),"nested\\external.w3z",{}, {},true);require(externalResult.second==fs::canonical(externalMap),"Exact external checkpoint map was not resolved");{std::fstream file(externalMap,std::ios::in|std::ios::out|std::ios::binary);require(bool(file),"Cannot modify external fixture");file.seekg(-1,std::ios::end);char byte=0;file.read(&byte,1);require(bool(file),"Cannot read external fixture");byte^=1;file.seekp(-1,std::ios::end);file.write(&byte,1);require(bool(file),"Cannot change external fixture");}rejects([&]{ScriptSession::inspectAndResolveRecoveryCheckpoint(fixtureArchives.root(),"nested\\external.w3z",{}, {},true);},"matching identity");auto otherRoot=scratch/L"different-install";fs::create_directories(otherRoot/L"Maps");rejects([&]{ScriptSession::resolveRecoveryCheckpointMap(otherRoot,"nested\\slot.w3z");},"matching identity");auto corruptPath=scratch/L"Saves"/L"nested"/L"corrupt.w3z";fs::copy_file(scratch/L"Saves"/L"nested"/L"slot.w3z",corruptPath,fs::copy_options::overwrite_existing);{std::fstream file(corruptPath,std::ios::in|std::ios::out|std::ios::binary);require(bool(file),"Cannot corrupt checkpoint fixture");file.seekg(-1,std::ios::end);char value=0;file.read(&value,1);require(bool(file),"Cannot read checkpoint fixture");value^=1;file.seekp(-1,std::ios::end);file.write(&value,1);require(bool(file),"Cannot write checkpoint fixture");}rejects([&]{ScriptSession::inspectRecoveryCheckpoint(fixtureArchives.root(),"nested\\corrupt.w3z");},"digest");rejects([&]{disk->restoreRecoveryCheckpoint("nested\\corrupt.w3z");},"digest");rejects([&]{disk->restoreRecoveryCheckpoint("..\\escape.w3z");},"Invalid checkpoint source");require(disk->units().empty(),"Rejected checkpoint modified target");auto diskMapping=disk->restoreRecoveryCheckpoint("nested\\slot.w3z");require(disk->units().at(diskMapping.at(bear.bits))->sourceSummoned,"Disk checkpoint lost unit state");auto bad=bundle;bad.back()^=1;rejects([&]{target->restoreRecoveryBundle(bad);},"digest");auto content=openSnapshot(bundle,256u*1024u*1024u);Bytes altered(content.begin(),content.end());auto found=std::search(altered.begin(),altered.end(),std::begin("UnitCore"),std::end("UnitCore")-1);require(found!=altered.end(),"Recovery section fixture missing");*found='X';auto missing=sealSnapshot(std::move(altered),256u*1024u*1024u);rejects([&]{target->restoreRecoveryBundle(missing);},"component");require(target->simulationTime()==0 && target->units().empty(),"Rejected recovery bundle modified target");auto different=make(false,true);rejects([&]{different->restoreRecoveryBundle(bundle);},"source");require(!different->configured(),"Partially restored session remained usable");auto mapping=target->restoreRecoveryBundle(bundle);auto& a=original->runtime();auto& b=target->runtime();auto unit=a.global("actor").bits,timer=a.global("clock").bits;require(b.global("actor").bits==mapping.at(unit) && b.global("clock").bits==mapping.at(timer) && target->simulationTime()==original->simulationTime() && target->units().at(mapping.at(unit))->selected && target->units().at(mapping.at(unit))->usesAltMinimapIcon,"Bundle did not restore handles or unit state");auto restoredActor=target->units().at(mapping.at(actor));require(restoredActor->burrowed && restoredActor->spiritEthereal && restoredActor->structureTarget && restoredActor->formHealthRegen==1.25f && restoredActor->ethereal() && target->unitInvisible(mapping.at(actor)),"Form properties did not restore");auto restoredBear=target->units().at(mapping.at(bear.bits)),restoredBear2=target->units().at(mapping.at(bear2.bits));require(restoredBear->unitForm && restoredBear->unitForm->active && restoredBear->sourceSummoned && restoredBear2->formTransition && restoredBear2->formTransition->ticket==original->units().at(bear2.bits)->formTransition->ticket,"Bear form or transition missing");auto restoredAncient=target->units().at(mapping.at(ancient.bits)),restoredAncient2=target->units().at(mapping.at(ancient2.bits));require(restoredAncient->mobileBuilding() && restoredAncient->footprint.empty() && restoredAncient2->rootTransition && restoredAncient2->rootTransition->ticket==original->units().at(ancient2.bits)->rootTransition->ticket,"Ancient form or transition missing");auto restoredWorker=target->units().at(mapping.at(worker.bits)),restoredTown=target->units().at(mapping.at(town.bits));require(restoredTown->militiaBell && restoredWorker->ignoreAlarm && restoredWorker->militia && restoredWorker->militia->hall==mapping.at(town.bits) && restoredWorker->militia->phase==MilitiaState::Phase::ToMilitia,"Militia order state or reference missing");auto restoredMilitia=target->units().at(mapping.at(worker2.bits));require(restoredMilitia->type==ObjectData::code("hmil") && restoredMilitia->militia && restoredMilitia->militia->phase==MilitiaState::Phase::None && restoredMilitia->militia->remaining==original->units().at(worker2.bits)->militia->remaining,"Active militia timer missing");require(target->unitDetected(mapping.at(shade.bits),0),"Restored reveal did not detect target");auto& restoredGate=*target->units().at(mapping.at(gate))->waygate;require(!restoredGate.active && restoredGate.configured && restoredGate.destination.x.bits()==real(512).bits() && restoredGate.destination.y.bits()==real(128).bits() && restoredGate.inside.contains(mapping.at(actor)) && restoredGate.retryAfter.at(mapping.at(actor))==1.25,"Waygate state or references were not restored");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};auto identity=[](std::string_view,std::uint32_t id){return id;};require(original->encodeTimers(identity)==target->encodeTimers(reverse) && original->encodeUnitCore(identity)==target->encodeUnitCore(reverse) && original->encodeSelection(identity)==target->encodeSelection(reverse) && original->encodeWaygates(identity)==target->encodeWaygates(reverse) && original->encodeRevealState(identity)==target->encodeRevealState(reverse) && original->encodeMilitia(identity)==target->encodeMilitia(reverse) && original->encodeUnitForms(identity)==target->encodeUnitForms(reverse) && original->encodeUnitSummons(identity)==target->encodeUnitSummons(reverse),"Bundle components differ after restore");require(original->runtime().wakeExternal(checkpointToken),"Checkpoint wake failed");original->runtime().advanceThreads(original->simulationTime());target->runtime().advanceThreads(target->simulationTime());disk->runtime().advanceThreads(disk->simulationTime());require(checkpointCalls==1 && original->runtime().global("checkpointResult").bits==42 && target->runtime().global("checkpointResult").bits==42 && disk->runtime().global("checkpointResult").bits==42,"Restored checkpoint replayed or lost its script continuation");rejects([&]{target->startMain();},"recovery is incomplete");rejects([&]{target->restoreRecoveryBundle(bundle);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("save_game_writes_checkpoint_and_preserves_caller",[&]{
        wchar_t previous[32768]{};auto previousLength=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);if(previousLength>=32768)throw std::runtime_error("User directory environment too long");struct RestoreUserDir{std::wstring value;bool present;~RestoreUserDir(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",present?value.c_str():nullptr);}}restoreUserDir{previous,previousLength!=0};auto scratch=output/(L"save-game-"+std::to_wstring(GetCurrentProcessId()));require(SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",scratch.c_str())!=0,"SaveGame scratch directory unavailable");std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type player extends handle
 type trigger extends handle
 type triggeraction extends handle
 type event extends handle
 type gameevent extends handle
 type mapflag extends handle
 native CreateTrigger takes nothing returns trigger
 native TriggerAddAction takes trigger t, code action returns triggeraction
 native TriggerRegisterGameEvent takes trigger t, gameevent e returns event
 native ConvertGameEvent takes integer id returns gameevent
 native ConvertMapFlag takes integer id returns mapflag
 native IsMapFlagSet takes mapflag flag returns boolean
 native GetSaveBasicFilename takes nothing returns string
 native SaveGame takes string name returns nothing
 native LoadGame takes string name, boolean scores returns nothing
 globals
 integer completed=0
 integer saveEvents=0
 integer loadEvents=0
 boolean reloaded=false
 string savedName=null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function savedEvent takes nothing returns nothing
 set saveEvents=saveEvents+1
 set savedName=GetSaveBasicFilename()
 endfunction
 function loadedEvent takes nothing returns nothing
 set loadEvents=loadEvents+1
 set reloaded=IsMapFlagSet(ConvertMapFlag(524288))
 endfunction
 function main takes nothing returns nothing
 local trigger t=CreateTrigger()
 local trigger loaded=CreateTrigger()
 call TriggerAddAction(loaded,function loadedEvent)
 call TriggerRegisterGameEvent(loaded,ConvertGameEvent(256))
 call TriggerAddAction(t,function savedEvent)
 call TriggerRegisterGameEvent(t,ConvertGameEvent(259))
 endfunction
 function load takes nothing returns nothing
 call LoadGame("slot.w3z",false)
 set completed=99
 endfunction
 function loadMissing takes nothing returns nothing
 call LoadGame("missing.w3z",false)
 endfunction
 function work takes nothing returns nothing
 local integer value=41
 call SaveGame("slot.w3z")
 set completed=value+1
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"save-game.j",source,"save game checkpoint"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);if(start)session->startMain();return session;};auto manual=make(true),manualRestored=make(false);rejects([&]{manualRestored->saveLocalGame("early.w3z");},"active local session");manual->saveLocalGame("manual.w3z");require(fs::is_regular_file(scratch/L"Saves"/L"manual.w3z") && manual->runtime().global("saveEvents").bits==1 && manual->runtime().global("savedName").text && *manual->runtime().global("savedName").text=="manual","Local save did not publish and notify");rejects([&]{manual->saveLocalGame("manual.w3z");},"publish checkpoint");require(manual->runtime().global("saveEvents").bits==1,"Unconfirmed overwrite notified event");auto manualDigest=ScriptSession::inspectRecoveryCheckpoint(fixtureArchives.root(),"manual.w3z").fileDigest;manualRestored->restoreRecoveryCheckpoint("manual.w3z",manualDigest);require(!manualRestored->runtime().global("saveEvents").bits,"Local save captured post-save event state");manualRestored->notifyGameLoaded();manualRestored->activateRecoveredSession();require(manualRestored->mainStarted(),"Local save did not restore");rejects([&]{manual->saveLocalGame("..\\escape.w3z");},"Invalid checkpoint destination");require(manual->runtime().global("saveEvents").bits==1,"Failed local save notified event");auto manualLoader=make(true);rejects([&]{manualLoader->requestLocalLoad("missing.w3z");},"Cannot open checkpoint");require(manualLoader->exitRequest()==SessionExit::None && manualLoader->nextCheckpoint().empty(),"Failed local load changed active session");manualLoader->requestLocalLoad("manual.w3z");require(manualLoader->exitRequest()==SessionExit::ChangeLevel && manualLoader->nextCheckpoint()=="manual.w3z" && fs::canonical(fs::path(wide(manualLoader->nextLevel())))==fs::canonical(fixtureArchives.mapPath()),"Local load did not request checkpoint map");manual->saveLocalGame("manual.w3z",true);auto changedManual=make(false);rejects([&]{changedManual->restoreRecoveryCheckpoint("manual.w3z",manualDigest);},"Checkpoint changed after selection");require(changedManual->units().empty(),"Changed checkpoint modified target session");auto currentDigest=ScriptSession::inspectRecoveryCheckpoint(fixtureArchives.root(),"manual.w3z").fileDigest;require(currentDigest!=manualDigest,"Manual checkpoint replacement did not change digest");changedManual->restoreRecoveryCheckpoint("manual.w3z",currentDigest);manual->saveLocalGame("Manual\\delete.w3z");auto deletePath=scratch/L"Saves"/L"Manual"/L"delete.w3z";{auto canceled=ManualSaveDeletion::prepare(fixtureArchives.root(),L"delete");require(fs::exists(deletePath),"Preparing deletion removed file");rejects([&]{manual->saveLocalGame("Manual\\delete.w3z",true);},"publish checkpoint");}require(fs::exists(deletePath),"Canceled deletion removed file");rejects([&]{ManualSaveDeletion::prepare(fixtureArchives.root(),L"..\\delete");},"Invalid manual save name");auto deletion=ManualSaveDeletion::prepare(fixtureArchives.root(),L"delete");deletion->remove();require(!fs::exists(deletePath),"Confirmed deletion retained file");rejects([&]{deletion->remove();},"no longer available");auto original=make(true),restored=make(false);auto& vm=original->runtime();vm.start("work");require(vm.threadCount()==1 && !vm.global("completed").bits && !fs::exists(scratch/L"Saves"/L"slot.w3z"),"SaveGame did not wait for checkpoint publication");original->advance(1./32);require(fs::is_regular_file(scratch/L"Saves"/L"slot.w3z") && vm.global("completed").bits==42 && vm.global("saveEvents").bits==1 && vm.global("savedName").text && *vm.global("savedName").text=="slot" && !vm.threadCount(),"SaveGame did not publish, notify and resume");auto loading=make(true);loading->runtime().start("load");require(loading->exitRequest()==SessionExit::ChangeLevel && loading->nextCheckpoint()=="slot.w3z" && !loading->runtime().global("completed").bits && loading->runtime().threadCount()==1 && fs::canonical(fs::path(wide(loading->nextLevel())))==fs::canonical(fixtureArchives.mapPath()),"LoadGame did not request the checkpoint map");auto missing=make(true);rejects([&]{missing->runtime().start("loadMissing");},"Cannot open checkpoint");require(missing->exitRequest()==SessionExit::None,"Missing LoadGame changed the session exit");restored->restoreRecoveryCheckpoint("slot.w3z");require(!restored->runtime().global("completed").bits && !restored->runtime().global("saveEvents").bits && restored->runtime().threadCount()==1,"Saved caller did not restore");rejects([&]{restored->activateRecoveredSession();},"not ready");restored->notifyGameLoaded();require(restored->runtime().global("loadEvents").bits==1 && restored->runtime().global("reloaded").bits,"Game load notification or map flag missing");rejects([&]{restored->notifyGameLoaded();},"recovered local session");rejects([&]{restored->startMain();},"recovery is incomplete");restored->activateRecoveredSession();rejects([&]{restored->activateRecoveredSession();},"not ready");restored->advance(1./32);require(restored->runtime().global("completed").bits==42 && !restored->runtime().threadCount() && restored->mainStarted() && restored->mainCompleted(),"Saved caller did not continue");auto paused=make(true);paused->pause(true);paused->runtime().start("work");paused->advance(0);require(paused->paused() && paused->runtime().threadCount()==1 && !paused->runtime().global("completed").bits && paused->runtime().global("saveEvents").bits==1,"Paused SaveGame did not publish while keeping the caller suspended");paused->pause(false);paused->advance(1./32);require(paused->runtime().global("completed").bits==42 && !paused->runtime().threadCount(),"Paused SaveGame caller did not resume");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("transition_save_discards_only_transition_caller",[&]{
        wchar_t previous[32768]{};auto previousLength=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);if(previousLength>=32768)throw std::runtime_error("User directory environment too long");struct RestoreUserDir{std::wstring value;bool present;~RestoreUserDir(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",present?value.c_str():nullptr);}}restoreUserDir{previous,previousLength!=0};auto scratch=output/(L"transition-save-"+std::to_wstring(GetCurrentProcessId()));require(SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",scratch.c_str())!=0,"Transition scratch directory unavailable");std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type player extends handle
 native TriggerSleepAction takes real duration returns nothing
 native SaveGame takes string name returns nothing
 native ChangeLevel takes string name, boolean scores returns nothing
 native LoadGame takes string name, boolean scores returns nothing
 globals
 integer delayed=0
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 function sleeper takes nothing returns nothing
 call TriggerSleepAction(0.50)
 set delayed=1
 endfunction
 function SaveAndChangeLevelBJ takes string saveName, string mapName, boolean scores returns nothing
 call SaveGame(saveName)
 call ChangeLevel(mapName,scores)
 endfunction
 function SaveAndLoadGameBJ takes string saveName, string loadName, boolean scores returns nothing
 call SaveGame(saveName)
 call LoadGame(loadName,scores)
 endfunction
 function reloadTransition takes nothing returns nothing
 call SaveAndLoadGameBJ("zone-return.w3z","zone.w3z",false)
 endfunction
 function transition takes nothing returns nothing
 call SaveAndChangeLevelBJ("zone.w3z","Maps\\next.w3x",false)
 endfunction
 )jass";unsigned loadCalls=0;auto make=[&](bool start){auto module=Module::compile(Program::parse({{"transition-save.j",source,"transition save"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->runtime().bind("LoadGame",[&](auto& vm,auto){++loadCalls;return vm.nothing();});session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);if(start)session->startMain();return session;};auto original=make(true),restored=make(false);original->runtime().start("sleeper");original->runtime().start("transition");require(original->runtime().threadCount()==2,"Transition save fixture did not suspend");original->advance(0);require(fs::is_regular_file(scratch/L"Saves"/L"zone.w3z"),"Transition checkpoint missing");restored->restoreRecoveryCheckpoint("zone.w3z");require(restored->runtime().threadCount()==1,"Transition caller or unrelated sleeper restored incorrectly");restored->runtime().advanceThreads(.5);require(restored->runtime().global("delayed").bits==1 && restored->exitRequest()==SessionExit::None && !restored->runtime().threadCount(),"Restored transition repeated or sleeper was lost");original->runtime().advanceThreads(0);require(original->exitRequest()==SessionExit::ChangeLevel,"Live transition did not continue");auto returnSource=make(true),returnTarget=make(false);returnSource->runtime().start("sleeper");returnSource->runtime().start("reloadTransition");returnSource->advance(0);returnTarget->restoreRecoveryCheckpoint("zone-return.w3z");require(returnTarget->runtime().threadCount()==1,"Load transition caller or unrelated sleeper restored incorrectly");returnSource->runtime().advanceThreads(0);returnTarget->runtime().advanceThreads(.5);require(loadCalls==1 && returnTarget->runtime().global("delayed").bits==1 && !returnTarget->runtime().threadCount(),"Load transition repeated or sleeper was lost");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("tree_actions_bundle_preserves_claims_and_club",[&]{
        std::string source=R"jass(type widget extends handle
 type destructable extends widget
 type unit extends widget
 type player extends handle
 type ability extends handle
 type effect extends handle
 type unitstate extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native CreateDestructable takes integer t, real x, real y, real f, real scale, integer variation returns destructable
 native UnitAddAbility takes unit u, integer ability returns boolean
 native SetUnitState takes unit u, unitstate state, real value returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"tree-recovery.j",source,"tree recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& vm=original->runtime();auto owner=vm.invoke("Player",std::array{vm.integer(0)});auto unit=[&](const char* type,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code(type))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto tree=[&](int x){return vm.invoke("CreateDestructable",std::array{vm.integer(int(ObjectData::code("LTlt"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0)),vm.real(real(1)),vm.integer(0)});};auto eater=unit("eaom",0),giant=unit("emtg",512),giant2=unit("emtg",1024),first=tree(128),second=tree(640),third=tree(1152);vm.invoke("SetUnitState",std::array{eater,vm.handle("unitstate",0),vm.real(real(100))});for(auto g:{giant,giant2})if(!original->units().at(g.bits)->abilities.contains(ObjectData::code("Agra")))require(vm.invoke("UnitAddAbility",std::array{g,vm.integer(int(ObjectData::code("Agra")))}).bits,"Grab Tree fixture ability missing");require(original->castSpell(giant.bits,ObjectData::code("Agra"),second.bits),"Grab Tree fixture rejected");original->advance(2);require(original->units().at(giant.bits)->warClub.has_value(),"Held club fixture missing");require(original->castSpell(eater.bits,ObjectData::code("Aeat"),first.bits) && original->castSpell(giant2.bits,ObjectData::code("Agra"),third.bits),"Active tree actions rejected");original->advance(.8);require(original->units().at(eater.bits)->eatTree.has_value(),"Eat Tree fixture already finished");require(original->units().at(giant2.bits)->grabTree.has_value(),"Grab Tree fixture not active");auto bundle=original->encodeRecoveryBundle();auto ids=target->restoreRecoveryBundle(bundle);auto a=target->units().at(ids.at(eater.bits)),b=target->units().at(ids.at(giant.bits)),c=target->units().at(ids.at(giant2.bits));require(a->eatTree && a->eatTree->tree==ids.at(first.bits) && b->warClub && b->warClub->attacks==original->units().at(giant.bits)->warClub->attacks && b->warClub->visual==ids.at(original->units().at(giant.bits)->warClub->visual) && c->grabTree && c->grabTree->tree==ids.at(third.bits),"Restored tree actions differ");auto identity=[](std::string_view,std::uint32_t id){return id;};auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(original->encodeTreeActions(identity)==target->encodeTreeActions(reverse),"Tree action states or claims differ");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("selection_snapshot_restores_local_remote_and_controls",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native RemoveUnit takes unit u returns nothing
 native SelectUnit takes unit u, boolean flag returns nothing
 native IsUnitSelected takes unit u, player p returns boolean
 native EnableUserControl takes boolean flag returns nothing
 native EnableUserUI takes boolean flag returns nothing
 native EnableSelect takes boolean state, boolean ui returns nothing
 native EnableDragSelect takes boolean state, boolean ui returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start,bool local){auto module=Module::compile(Program::parse({{"selection-snapshot.j",source,"selection recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());if(local)require(setup.control(0,SlotControl::Local),"Local player fixture unavailable");result->applySetup(setup);if(start)result->startMain();return result;};for(bool local:{false,true}){auto original=make(true,local),target=make(false,local);auto& a=original->runtime();auto spawn=[&](int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto first=spawn(0),second=spawn(128),retired=spawn(256);a.invoke("SelectUnit",std::array{first,a.boolean(true)});require(original->setPlayerUnitSelected(1,second.bits,true) && original->setPlayerUnitSelected(1,second.bits,false) && original->setPlayerUnitSelected(1,second.bits,true) && original->setPlayerUnitSelected(1,retired.bits,true),"Remote selection fixture failed");a.invoke("RemoveUnit",std::array{retired});a.invoke("EnableUserControl",std::array{a.boolean(false)});a.invoke("EnableUserUI",std::array{a.boolean(false)});a.invoke("EnableSelect",std::array{a.boolean(false),a.boolean(true)});a.invoke("EnableDragSelect",std::array{a.boolean(true),a.boolean(false)});auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeSelection(identity);auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto bad=saved;bad.back()^=1;rejects([&]{target->restoreSelection(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==second.bits?mapping.at(first.bits):decode(type,id);};rejects([&]{target->restoreSelection(saved,wrong);},"mapping");require(!target->units().at(mapping.at(first.bits))->selected,"Rejected selection snapshot changed target");target->restoreSelection(saved,decode);require(target->units().at(mapping.at(first.bits))->selected && target->playerSelection(1).contains(mapping.at(second.bits)) && !target->userControl() && !target->userUI() && !target->selectionEnabled() && target->selectionUI() && target->dragSelectionEnabled() && !target->dragSelectionUI(),"Selected units or UI controls differ");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeSelection(reverse)==saved,"Selection snapshot did not round trip");require(target->setPlayerUnitSelected(1,mapping.at(second.bits),false) && !target->playerSelection(1).contains(mapping.at(second.bits)),"Restored remote selection could not be changed");rejects([&]{target->restoreSelection(saved,decode);},"");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("unit_stealth_snapshot_restores_invisibility_and_minimap_flag",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native UnitAddAbility takes unit u, integer ability returns boolean
 native UnitSetUsesAltIcon takes unit u, boolean flag returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"stealth-snapshot.j",source,"unit stealth recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto spawn=[&](int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto actor=spawn(0),sleeper=spawn(128);auto ability=ObjectData::code("Apiv");require(a.invoke("UnitAddAbility",std::array{actor,a.integer(int(ability))}).bits,"Permanent invisibility fixture rejected");auto delay=original->passiveInfo(ability,1).duration;require(delay>0 && delay<59,"Unexpected invisibility fade fixture");original->advance(double(delay)+.125);require(original->unitInvisible(actor.bits),"Permanent invisibility did not fade in");a.invoke("UnitSetUsesAltIcon",std::array{actor,a.boolean(true)});auto sleeping=original->units().at(sleeper.bits);sleeping->shadowNight=true;sleeping->naturalSleep=true;sleeping->naturalSleepWoken=true;sleeping->naturalSleepDisabled=true;sleeping->shadowMeld=ShadowMeldState{ObjectData::code("Ashm"),1,0,1.5,true,true};auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeUnitStealth(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);require(!target->unitInvisible(mapping.at(actor.bits)),"Rebuilt unit unexpectedly retained invisibility timing");auto bad=saved;bad.back()^=1;rejects([&]{target->restoreUnitStealth(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==actor.bits?mapping.at(sleeper.bits):decode(type,id);};rejects([&]{target->restoreUnitStealth(saved,wrong);},"mapping");target->restoreUnitStealth(saved,decode);auto restored=target->units().at(mapping.at(sleeper.bits));require(target->unitInvisible(mapping.at(actor.bits)) && target->units().at(mapping.at(actor.bits))->usesAltMinimapIcon && restored->shadowNight && restored->naturalSleep && restored->naturalSleepWoken && restored->naturalSleepDisabled && restored->shadowMeld && restored->shadowMeld->remaining==1.5 && restored->shadowMeld->manual,"Restored stealth, sleep or minimap state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeUnitStealth(reverse)==saved,"Unit stealth snapshot did not round trip");rejects([&]{target->restoreUnitStealth(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("future_movement_phase_survives_rebuilt_handle_offsets",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type timer extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native CreateTimer takes nothing returns timer
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"movement-phase.j",source,"future movement scheduling"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto& b=target->runtime();for(int i=0;i<3;++i)a.invoke("CreateTimer");b.invoke("CreateTimer");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeFutureMovementPhase();target->rebuildUnitIdentities(ids);target->prepareUnitCore(core,{});target->finishUnitCore(core,{});auto bad=saved;bad.back()^=1;rejects([&]{target->restoreFutureMovementPhase(bad);},"digest");auto content=openSnapshot(saved,1024);Bytes invalid(content.begin(),content.end());invalid[invalid.size()-4]=8;auto invalidPhase=sealSnapshot(std::move(invalid),1024);rejects([&]{target->restoreFutureMovementPhase(invalidPhase);},"phase");target->restoreFutureMovementPhase(saved);require(target->encodeFutureMovementPhase()==saved,"Future phase did not round trip");auto spawn=[](jass::Runtime& vm,int x){return vm.invoke("CreateUnit",std::array{vm.invoke("Player",std::array{vm.integer(0)}),vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};for(int i=0;i<4;++i){if(i%2){a.invoke("CreateTimer");b.invoke("CreateTimer");}auto before=spawn(a,i*128),after=spawn(b,i*128);require(before.bits!=after.bits && original->units().at(before.bits)->routeRetryPhase==target->units().at(after.bits)->routeRetryPhase,"New unit movement phase differs");}require(target->encodeFutureMovementPhase()==original->encodeFutureMovementPhase(),"Future phase changed after matching allocations");rejects([&]{target->restoreFutureMovementPhase(saved);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("ambient_snapshot_restores_passive_clock_and_visual_references",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type effect extends handle
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native UnitAddAbility takes unit u, integer ability returns boolean
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"ambient-snapshot.j",source,"ambient passive recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto spawn=[&](int owner,int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto actor=spawn(0,0),victim=spawn(1,64);require(a.invoke("UnitAddAbility",std::array{actor,a.integer(int(ObjectData::code("Apig")))}).bits,"Permanent immolation fixture rejected");original->advance(.25);require(!original->effects().empty(),"Ambient visual fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),effects=original->encodeEffects(identity),buffs=original->encodeUnitBuffs(identity),saved=original->encodeAmbientPassives(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto units=target->rebuildUnitIdentities(ids);auto unit=[&](std::string_view type,std::uint32_t id){return type=="unit" && units.contains(id)?units.at(id):0u;};target->prepareUnitCore(core,unit);target->finishUnitCore(core,unit);auto visuals=target->rebuildEffects(effects,unit);auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit")return unit(type,id);if(type=="effect" && visuals.contains(id))return visuals.at(id);return 0u;};target->restoreUnitBuffs(buffs,decode);auto bad=saved;bad.back()^=1;rejects([&]{target->restoreAmbientPassives(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==actor.bits?units.at(victim.bits):decode(type,id);};rejects([&]{target->restoreAmbientPassives(saved,wrong);},"mapping");target->restoreAmbientPassives(saved,decode);auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;if(type=="effect")for(auto [old,current]:visuals)if(current==id)return old;return 0u;};require(target->encodeAmbientPassives(reverse)==saved,"Ambient passive snapshot did not round trip");rejects([&]{target->restoreAmbientPassives(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("corpse_snapshot_restores_decay_and_graveyard_references",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native KillUnit takes unit u returns nothing
 native RemoveUnit takes unit u returns nothing
 native UnitSuspendDecay takes unit u, boolean flag returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"corpse-snapshot.j",source,"corpse recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto spawn=[&](int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto dead=spawn(0),living=spawn(128),retired=spawn(256);a.invoke("KillUnit",std::array{dead});a.invoke("RemoveUnit",std::array{retired});original->advance(1);a.invoke("UnitSuspendDecay",std::array{dead,a.boolean(true)});auto body=original->units().at(dead.bits);require(body->corpse && body->decaySuspended,"Dead unit fixture missing corpse");auto keeper=original->units().at(living.bits);keeper->graveyard=GraveyardState{ObjectData::code("Agyd"),1,2,.25,{dead.bits,retired.bits}};keeper->exhume=ExhumeState{ObjectData::code("Aexh"),1,.5};auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeCorpses(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto damaged=saved;damaged.back()^=1;rejects([&]{target->restoreCorpses(damaged,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==retired.bits?mapping.at(living.bits):decode(type,id);};rejects([&]{target->restoreCorpses(saved,wrong);},"mapping");require(!target->units().at(mapping.at(dead.bits))->corpse,"Rejected corpse snapshot changed target");target->restoreCorpses(saved,decode);auto restored=target->units().at(mapping.at(dead.bits)),other=target->units().at(mapping.at(living.bits));require(restored->corpse && restored->decaySuspended && restored->corpse->elapsed==body->corpse->elapsed && restored->corpse->phase==body->corpse->phase && other->graveyard && other->graveyard->bodies==std::vector<std::uint32_t>{mapping.at(dead.bits),mapping.at(retired.bits)} && other->exhume && other->exhume->elapsed==.5,"Corpse or graveyard state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeCorpses(reverse)==saved,"Corpse snapshot did not round trip");target->runtime().invoke("RemoveUnit",std::array{target->runtime().handle("unit",mapping.at(dead.bits))});require(!target->units().contains(mapping.at(dead.bits)),"Restored corpse could not be removed");rejects([&]{target->restoreCorpses(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("construction_snapshot_restores_paid_work_and_upgrade",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type playerstate extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native SetPlayerState takes player p, playerstate s, integer v returns nothing
 native SetUnitPosition takes unit u, real x, real y returns nothing
 native SetWidgetLife takes widget w, real life returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"construction-snapshot.j",source,"construction recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto player=a.invoke("Player",std::array{a.integer(0)});for(auto [key,value]:std::initializer_list<std::pair<unsigned,int>>{{1,10000},{2,10000},{4,100},{6,100}})a.invoke("SetPlayerState",std::array{player,a.handle("playerstate",key),a.integer(value)});auto spawn=[&](const char* type,int x){return a.invoke("CreateUnit",std::array{player,a.integer(int(ObjectData::code(type))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto worker=spawn("hpea",0),town=spawn("htow",1024),repairer=spawn("hpea",-1024),damaged=spawn("hhou",-768);a.invoke("SetWidgetLife",std::array{damaged,a.real(real(50))});require(original->repair(repairer.bits,damaged.bits),"Repair fixture rejected");require(original->upgradeBuilding(town.bits,ObjectData::code("hkee")),"Upgrade fixture rejected");auto& terrain=original->world()->data().terrain;std::optional<WorldPoint> site;std::string reason;auto farmType=ObjectData::code("hhou");for(unsigned y=8;y+8<(terrain.height-1)*4 && !site;y+=4)for(unsigned x=8;x+8<(terrain.width-1)*4 && !site;x+=4)site=original->buildSite(worker.bits,farmType,{real(terrain.origin[0]+float(x)*32),real(terrain.origin[1]+float(y)*32)},reason);require(site.has_value(),"No construction fixture site");auto size=original->buildingSize(farmType);a.invoke("SetUnitPosition",std::array{worker,a.real(real(std::bit_cast<float>(site->x.bits())-size[0]/2-24)),a.real(site->y)});require(original->build(worker.bits,farmType,*site),"Build fixture rejected");std::uint32_t farm=0;for(int i=0;i<320 && !farm;++i){original->advance(.03125);for(auto& [id,u]:original->units())if(u->type==farmType && u->construction)farm=id;}require(farm && original->units().at(worker.bits)->workingOn==farm && original->units().at(repairer.bits)->repair,"Construction or repair did not start");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),production=original->encodeProduction(identity),saved=original->encodeConstruction(identity);target->restoreSimulationClock(original->encodeSimulationClock());target->restorePlayerStates(original->encodePlayerStates());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);rejects([&]{target->restoreConstruction(saved,decode);},"production");target->restoreProduction(production,decode);auto bad=saved;bad.back()^=1;rejects([&]{target->restoreConstruction(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==worker.bits?mapping.at(town.bits):decode(type,id);};rejects([&]{target->restoreConstruction(saved,wrong);},"mapping");require(!target->units().at(mapping.at(farm))->construction,"Rejected construction snapshot changed target");target->restoreConstruction(saved,decode);auto restored=target->units().at(mapping.at(farm)),builder=target->units().at(mapping.at(worker.bits)),upgrade=target->units().at(mapping.at(town.bits));require(restored->construction && restored->construction->builder==mapping.at(worker.bits) && builder->workingOn==mapping.at(farm) && upgrade->buildingUpgrade && upgrade->buildingUpgrade->type==ObjectData::code("hkee") && target->units().at(mapping.at(repairer.bits))->repair && target->units().at(mapping.at(repairer.bits))->repair->target==mapping.at(damaged.bits),"Construction, upgrade or repair state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeConstruction(reverse)==saved,"Construction snapshot did not round trip");auto gold=target->config().players[0].states.at(1);require(target->cancelConstruction(mapping.at(farm)) && !builder->workingOn && target->config().players[0].states.at(1)>gold,"Restored construction cancellation or refund differs");gold=target->config().players[0].states.at(1);require(target->cancelBuildingUpgrade(mapping.at(town.bits)) && target->config().players[0].states.at(1)>gold,"Restored upgrade refund differs");rejects([&]{target->restoreConstruction(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("harvest_snapshot_restores_mine_worker_and_hidden_state",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native RemoveUnit takes unit u returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"harvest-snapshot.j",source,"harvest recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto spawn=[&](const char* type,int owner,int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto mine=spawn("ngol",15,0),worker=spawn("hpea",0,128);require(original->harvest(worker.bits,mine.bits),"Mine order rejected");for(int i=0;i<320 && original->units().at(worker.bits)->gather.phase!=GatherOrder::Phase::Mine;++i)original->advance(.03125);auto sourceWorker=original->units().at(worker.bits);require(sourceWorker->gather.phase==GatherOrder::Phase::Mine && sourceWorker->gather.inside && sourceWorker->hidden(),"Worker did not enter mine");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeHarvest(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto bad=saved;bad.back()^=1;rejects([&]{target->restoreHarvest(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==mine.bits?mapping.at(worker.bits):decode(type,id);};rejects([&]{target->restoreHarvest(saved,wrong);},"mapping");require(target->units().at(mapping.at(worker.bits))->gather.phase==GatherOrder::Phase::None,"Rejected harvest snapshot changed target");target->restoreHarvest(saved,decode);auto restored=target->units().at(mapping.at(worker.bits));require(restored->gather.phase==GatherOrder::Phase::Mine && restored->gather.inside && restored->hidden() && restored->gather.mine==mapping.at(mine.bits) && restored->gather.due==sourceWorker->gather.due,"Mine worker state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeHarvest(reverse)==saved,"Harvest snapshot did not round trip");target->runtime().invoke("RemoveUnit",std::array{target->runtime().handle("unit",mapping.at(worker.bits))});require(!target->units().contains(mapping.at(worker.bits)) && target->units().contains(mapping.at(mine.bits)),"Restored mine worker removal damaged mine");rejects([&]{target->restoreHarvest(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("harvest_snapshot_preserves_entangled_mine_link",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native SetResourceAmount takes unit u, integer amount returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"mine-link-snapshot.j",source,"mine link recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto spawn=[&](const char* type,int owner,int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(owner)}),a.integer(int(ObjectData::code(type))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto mine=spawn("ngol",15,0),tree=spawn("etol",0,512);require(original->entangleMine(tree.bits,mine.bits,true),"Entangled mine fixture failed");auto cover=original->units().at(mine.bits)->mineCover;require(cover && original->units().at(mine.bits)->hidden(),"Mine cover fixture missing");a.invoke("SetResourceAmount",std::array{a.handle("unit",cover),a.integer(1234)});auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeHarvest(identity);auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);target->restoreHarvest(saved,decode);auto base=target->units().at(mapping.at(mine.bits)),wrapped=target->units().at(mapping.at(cover)),parent=target->units().at(mapping.at(tree.bits));require(base->mineCover==mapping.at(cover) && base->hidden() && wrapped->mineSource==mapping.at(mine.bits) && wrapped->mineParent==mapping.at(tree.bits) && parent->mineChild==mapping.at(cover) && target->remainingResources(mapping.at(cover))==1234,"Entangled mine identity or resource state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeHarvest(reverse)==saved,"Entangled mine snapshot did not round trip");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("cargo_snapshot_restores_loaded_unit_and_unload",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native IsUnitLoaded takes unit u returns boolean
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"cargo-snapshot.j",source,"cargo recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto spawn=[&](const char* type,int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code(type))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto carrier=spawn("nzep",0),passenger=spawn("hfoo",32);require(original->boardUnit(passenger.bits,carrier.bits),"Boarding order rejected");for(int i=0;i<32 && !original->units().at(passenger.bits)->transport;++i)original->advance(.125);require(original->units().at(passenger.bits)->transport==carrier.bits && a.invoke("IsUnitLoaded",std::array{passenger}).bits,"Passenger did not board");auto ship=original->units().at(carrier.bits),rider=original->units().at(passenger.bits);ship->cargoDrop=CargoDropOrder{WorldPoint{real(128),real(64)},original->simulationTime()+3,852048,WorldPoint{real(256),real(128)}};CargoReturnOrder previous;previous.owner=rider->owner;previous.ownerRevision=rider->ownerRevision;previous.deathRevision=rider->deathRevision;previous.target=carrier.bits;previous.point=WorldPoint{real(64),real(32)};rider->cargoReturn=previous;rider->digestion=DigestionState{ObjectData::code("Adev"),0,0,.5};auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeCargo(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto bad=saved;bad.back()^=1;rejects([&]{target->restoreCargo(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==passenger.bits?mapping.at(carrier.bits):decode(type,id);};rejects([&]{target->restoreCargo(saved,wrong);},"mapping");require(!target->units().at(mapping.at(passenger.bits))->transport,"Rejected cargo snapshot changed target");target->restoreCargo(saved,decode);auto& b=target->runtime();auto restored=b.handle("unit",mapping.at(passenger.bits));require(b.invoke("IsUnitLoaded",std::array{restored}).bits && target->units().at(mapping.at(carrier.bits))->cargo==std::vector<std::uint32_t>{restored.bits},"Cargo membership or hidden state differs");auto restoredShip=target->units().at(mapping.at(carrier.bits)),restoredRider=target->units().at(restored.bits);require(restoredShip->cargoDrop && restoredShip->cargoDrop->groundGoal && restoredShip->cargoDrop->due==ship->cargoDrop->due && restoredRider->cargoReturn && restoredRider->cargoReturn->target==mapping.at(carrier.bits) && restoredRider->cargoReturn->point && restoredRider->digestion && restoredRider->digestion->elapsed==.5,"Cargo drop, return or digestion state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeCargo(reverse)==saved,"Cargo snapshot did not round trip");require(target->unloadUnit(mapping.at(carrier.bits),restored.bits) && !b.invoke("IsUnitLoaded",std::array{restored}).bits && target->units().at(mapping.at(carrier.bits))->cargo.empty(),"Restored passenger could not unload");rejects([&]{target->restoreCargo(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("production_snapshot_restores_paid_queue_rally_and_tickets",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type playerstate extends handle
 native SetPlayerState takes player p, playerstate s, integer v returns nothing
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"production-snapshot.j",source,"production recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();for(auto [key,value]:std::initializer_list<std::pair<unsigned,int>>{{1,10000},{2,10000},{4,100},{5,0},{6,100}})a.invoke("SetPlayerState",std::array{a.invoke("Player",std::array{a.integer(0)}),a.handle("playerstate",key),a.integer(value)});auto spawn=[&](const char* type,int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code(type))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto barracks=spawn("hbar",0),rally=spawn("hfoo",256);require(original->setRally(barracks.bits,WorldPoint{real(100),real(40)},rally.bits),"Rally fixture failed");require(original->train(barracks.bits,ObjectData::code("hfoo")) && original->train(barracks.bits,ObjectData::code("hfoo")),"Training fixture failed");original->advance(1);auto queue=original->units().at(barracks.bits);require(queue->production.size()==2 && queue->production.front().started && queue->production.front().reserved && queue->production.front().elapsed>0,"Paid queue fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),saved=original->encodeProduction(identity);target->restoreSimulationClock(original->encodeSimulationClock());target->restorePlayerStates(original->encodePlayerStates());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto bad=saved;bad.back()^=1;rejects([&]{target->restoreProduction(bad,decode);},"digest");auto wrong=[&](std::string_view type,std::uint32_t id){return id==rally.bits?mapping.at(barracks.bits):decode(type,id);};rejects([&]{target->restoreProduction(saved,wrong);},"mapping");require(target->units().at(mapping.at(barracks.bits))->production.empty(),"Rejected production snapshot changed target");target->restoreProduction(saved,decode);auto restored=target->units().at(mapping.at(barracks.bits));require(restored->production.size()==2 && restored->production.front().started && restored->production.front().reserved && restored->production.front().elapsed==queue->production.front().elapsed && restored->rallyTarget==mapping.at(rally.bits) && restored->rally && restored->rally->x.bits()==queue->rally->x.bits(),"Production queue, food reservation or rally differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeProduction(reverse)==saved,"Production snapshot did not round trip");auto goldBefore=target->config().players[0].states.at(1),foodBefore=target->config().players[0].states.at(5),refund=restored->production[1].gold;require(target->cancelProduction(mapping.at(barracks.bits),1) && target->config().players[0].states.at(1)==goldBefore+refund && target->config().players[0].states.at(5)==foodBefore && restored->production.size()==1,"Restored queued job refund or reserved food differs");rejects([&]{target->restoreProduction(saved,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("summon_snapshot_restores_timed_life_and_retired_sources",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 type unittype extends handle
 native IsUnitType takes unit u, unittype t returns boolean
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native RemoveUnit takes unit u returns nothing
 native KillUnit takes unit u returns nothing
 native UnitAddAbility takes unit u, integer id returns boolean
 native UnitApplyTimedLife takes unit u, integer buff, real duration returns nothing
 native UnitPauseTimedLife takes unit u, boolean flag returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"summon-snapshot.j",source,"summon recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto create=[&](int x){return a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(float(x))),a.real(real(0)),a.real(real(0))});};auto parent=create(0),child=create(128),paused=create(256),classified=create(512);original->units().at(classified.bits)->sourceSummoned=true;a.invoke("UnitApplyTimedLife",std::array{child,a.integer(0),a.real(real(10))});a.invoke("UnitApplyTimedLife",std::array{paused,a.integer(0),a.real(real(20))});a.invoke("UnitApplyTimedLife",std::array{paused,a.integer(int(ObjectData::code("BUan"))),a.real(real(40))});a.invoke("UnitPauseTimedLife",std::array{paused,a.boolean(true)});auto state=original->units().at(child.bits);a.invoke("RemoveUnit",std::array{parent});state->summoner=parent.bits;state->illusionOriginal=parent.bits;state->summonAbility=ObjectData::code("AOsp");state->diesWithSummoner=true;state->swarmAgent=true;state->collision=0;original->units().at(paused.bits)->plagueWard=true;original->units().at(paused.bits)->collision=0;state->damageDealt=.25f;state->damageTaken=2.f;original->advance(1);auto plagueSource=create(384);require(a.invoke("UnitAddAbility",std::array{plagueSource,a.integer(int(ObjectData::code("Aap3")))}).bits,"Plague source ability missing");a.invoke("KillUnit",std::array{plagueSource});std::uint32_t ward=0;for(auto& [id,unit]:original->units())if(unit->plagueWard && unit->summoner==plagueSource.bits)ward=id;require(ward && original->units().at(ward)->collision==0 && original->units().at(ward)->timedLife,"Natural plague ward missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),summons=original->encodeUnitSummons(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto damaged=summons;damaged.back()^=1;rejects([&]{target->restoreUnitSummons(damaged,decode);},"digest");auto content=openSnapshot(summons,16u*1024u*1024u);Bytes legacy(content.begin(),content.end());legacy[4]=3;rejects([&]{target->restoreUnitSummons(sealSnapshot(std::move(legacy),16u*1024u*1024u),decode);},"source classification");Bytes invalid(content.begin(),content.end());auto digestLength=std::uint32_t(invalid.at(8)) | (std::uint32_t(invalid.at(9))<<8) | (std::uint32_t(invalid.at(10))<<16) | (std::uint32_t(invalid.at(11))<<24);auto flagOffset=size_t(12+digestLength+8+4+32);auto invalidFlag=invalid;invalidFlag.at(flagOffset)=2;rejects([&]{target->restoreUnitSummons(sealSnapshot(std::move(invalidFlag),16u*1024u*1024u),decode);},"Invalid summon state");auto remainingOffset=size_t(12+digestLength+8+4+48+4+8);std::uint64_t infinity=0x7ff0000000000000ull;for(unsigned i=0;i<8;++i)invalid.at(remainingOffset+i)=std::uint8_t(infinity>>(8*i));auto invalidLife=sealSnapshot(std::move(invalid),16u*1024u*1024u);rejects([&]{target->restoreUnitSummons(invalidLife,decode);},"timed life");auto wrong=[&](std::string_view type,std::uint32_t id){return id==parent.bits?mapping.at(child.bits):decode(type,id);};rejects([&]{target->restoreUnitSummons(summons,wrong);},"mapping");require(!target->units().at(mapping.at(child.bits))->timedLife,"Rejected summon snapshot changed target");target->restoreUnitSummons(summons,decode);auto restored=target->units().at(mapping.at(child.bits)),other=target->units().at(mapping.at(paused.bits));require(restored->summoner==mapping.at(parent.bits) && restored->illusionOriginal==mapping.at(parent.bits) && restored->summonAbility==state->summonAbility && restored->diesWithSummoner && restored->swarmAgent && restored->collision==0 && other->plagueWard && other->collision==0 && other->sourceSummoned && restored->damageDealt==.25f && restored->damageTaken==2.f && restored->timedLife && restored->timedLife->remaining==9 && !restored->timedLife->paused && other->timedLife && other->timedLife->remaining==40 && other->timedLife->paused && other->earlierTimedLives.size()==1 && other->earlierTimedLives[0].remaining==20 && other->earlierTimedLives[0].paused,"Summon or timed life state differs");auto v4=Bytes(content.begin(),content.end());v4[4]=4;auto word=[&](size_t at){return std::uint32_t(v4.at(at)) | (std::uint32_t(v4.at(at+1))<<8) | (std::uint32_t(v4.at(at+2))<<16) | (std::uint32_t(v4.at(at+3))<<24);};size_t offset=12+digestLength+8;auto units=word(offset);offset+=4;for(unsigned i=0;i<units;++i){auto hasLife=word(offset+44);offset+=48+(hasLife?24:0);auto earlier=word(offset);v4.erase(v4.begin()+offset,v4.begin()+offset+4+24*earlier);}auto legacyTarget=make(false);legacyTarget->restoreSimulationClock(original->encodeSimulationClock());auto legacyMapping=legacyTarget->rebuildUnitIdentities(ids);auto legacyDecode=[&](std::string_view type,std::uint32_t id){return type=="unit" && legacyMapping.contains(id)?legacyMapping.at(id):0u;};legacyTarget->prepareUnitCore(core,legacyDecode);legacyTarget->finishUnitCore(core,legacyDecode);legacyTarget->restoreUnitSummons(sealSnapshot(std::move(v4),16u*1024u*1024u),legacyDecode);auto legacyPaused=legacyTarget->units().at(legacyMapping.at(paused.bits));require(legacyPaused->timedLife && legacyPaused->timedLife->remaining==40 && legacyPaused->timedLife->paused && legacyPaused->earlierTimedLives.empty(),"Legacy summon timed life differs");auto classifiedUnit=target->runtime().handle("unit",mapping.at(classified.bits));require(target->units().at(classifiedUnit.bits)->sourceSummoned && target->runtime().invoke("IsUnitType",std::array{classifiedUnit,target->runtime().handle("unittype",10)}).bits,"Source summon classification did not restore");auto restoredWard=target->units().at(mapping.at(ward));require(restoredWard->plagueWard && restoredWard->collision==0 && restoredWard->summoner==mapping.at(plagueSource.bits) && restoredWard->timedLife,"Natural plague ward state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeUnitSummons(reverse)==summons,"Summon snapshot did not round trip");rejects([&]{target->restoreUnitSummons(summons,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("summon_snapshot_preserves_corpse_summon_index",[&]{
        std::string source=R"jass(type widget extends handle
 type ability extends handle
 type destructable extends widget
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native CreateCorpse takes player p, integer t, real x, real y, real f returns unit
 native RemoveUnit takes unit u returns nothing
 native UnitAddAbility takes unit u, integer id returns boolean
 native FogEnable takes boolean enabled returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto result=std::make_unique<ScriptSession>(Module::compile(Program::parse({{"corpse-summon-snapshot.j",source,"corpse summon recovery"}})),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("Ucrl"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto corpse=vm.invoke("CreateCorpse",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(96)),vm.real(real(0)),vm.real(real(0))});require(caster.bits && corpse.bits,"Corpse summon fixture missing");vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AUcb")))});auto actor=original->units().at(caster.bits);actor->mana=actor->maxMana=real(1000);require(original->castSpell(caster.bits,ObjectData::code("AUcb")),"Carrion Beetles order rejected");std::uint32_t summoned=0;for(int i=0;i<160 && !summoned;++i){original->advance(1./32);for(auto& [id,unit]:original->units())if(unit->summoner==caster.bits && unit->summonAbility==ObjectData::code("AUcb"))summoned=id;}require(summoned,"Carrion Beetles did not create an indexed summon");original->units().at(summoned)->diesWithSummoner=true;auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),summons=original->encodeUnitSummons(identity);target->restoreSimulationClock(original->encodeSimulationClock());auto mapping=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && mapping.contains(id)?mapping.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);target->restoreUnitSummons(summons,decode);auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->encodeUnitSummons(reverse)==summons,"Corpse summon index did not round trip");auto restoredSummon=target->units().at(mapping.at(summoned));target->runtime().invoke("RemoveUnit",std::array{target->runtime().handle("unit",mapping.at(caster.bits))});require(std::bit_cast<float>(restoredSummon->life.bits())<=0,"Restored summon survived summoner removal");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("shop_stock_snapshot_restores_inventory_and_global_rules",[&]{
        std::string source=R"jass(type destructable extends handle
 type widget extends handle
 type unit extends widget
 type player extends handle
 native Player takes integer i returns player
 native CreateUnit takes player p, integer t, real x, real y, real f returns unit
 native SetAllItemTypeSlots takes integer n returns nothing
 native AddItemToAllStock takes integer itemId, integer current, integer maximum returns nothing
 native RemoveUnitFromAllStock takes integer unitId returns nothing
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 endfunction
 )jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"stock-snapshot.j",source,"shop stock snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto unit=a.invoke("CreateUnit",std::array{a.invoke("Player",std::array{a.integer(0)}),a.integer(int(ObjectData::code("hfoo"))),a.real(real(0)),a.real(real(0)),a.real(real(0))});auto state=original->units().at(unit.bits);a.invoke("SetAllItemTypeSlots",std::array{a.integer(4)});a.invoke("AddItemToAllStock",std::array{a.integer(int(ObjectData::code("phea"))),a.integer(1),a.integer(3)});a.invoke("RemoveUnitFromAllStock",std::array{a.integer(int(ObjectData::code("hfoo")))});state->stock={{ObjectData::code("phea"),true,1,3,10,17.25},{0,false,0,0,0,0}};state->unitStockSlots=2;state->itemStockSlots=5;auto identity=[](std::string_view,std::uint32_t id){return id;};auto ids=original->encodeUnitIdentities(identity),core=original->encodeUnitCore(identity),stock=original->encodeShopStock(identity);auto units=target->rebuildUnitIdentities(ids);auto decode=[&](std::string_view type,std::uint32_t id){return type=="unit" && units.contains(id)?units.at(id):0u;};target->prepareUnitCore(core,decode);target->finishUnitCore(core,decode);auto damaged=stock;damaged.back()^=1;rejects([&]{target->restoreShopStock(damaged,decode);},"digest");rejects([&]{target->restoreShopStock(stock,[](std::string_view,std::uint32_t){return 0u;});},"mapping");require(target->units().at(units.at(unit.bits))->stock.empty(),"Rejected stock snapshot modified unit");target->restoreShopStock(stock,decode);auto restored=target->units().at(units.at(unit.bits));require(restored->stock.size()==2 && restored->stock[0].current==1 && restored->stock[0].due==17.25 && restored->unitStockSlots==2 && restored->itemStockSlots==5,"Shop stock state differs");auto reverse=[&](std::string_view,std::uint32_t id){return id==units.at(unit.bits)?unit.bits:0u;};require(target->encodeShopStock(reverse)==stock,"Shop stock did not round trip");rejects([&]{target->restoreShopStock(stock,decode);},"");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
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
    test("boolean_snapshot_restores_handles_and_expression_behavior",[&]{
        std::string source=R"jass(type destructable extends handle
 type boolexpr extends handle
 type conditionfunc extends boolexpr
 type trigger extends handle
 type triggercondition extends handle
 native Condition takes code c returns conditionfunc
 native And takes boolexpr a, boolexpr b returns boolexpr
 native Or takes boolexpr a, boolexpr b returns boolexpr
 native Not takes boolexpr a returns boolexpr
 native DestroyBoolExpr takes boolexpr b returns nothing
 native CreateTrigger takes nothing returns trigger
 native TriggerAddCondition takes trigger t, boolexpr b returns triggercondition
 native TriggerEvaluate takes trigger t returns boolean
 globals
 boolexpr initial=null
 boolexpr shared=null
 boolexpr composite=null
 boolexpr retired=null
 endglobals
 function yes takes nothing returns boolean
 return true
 endfunction
 function no takes nothing returns boolean
 return false
 endfunction
 function config takes nothing returns nothing
 set initial=Condition(function yes)
 endfunction
 function main takes nothing returns nothing
 set shared=Condition(function no)
 set composite=And(Or(initial,shared),Not(shared))
 set retired=Condition(function no)
 call DestroyBoolExpr(retired)
 endfunction
 )jass";auto make=[&](bool start,bool changed=false){auto script=source;if(changed)script+="\n// changed\n";auto module=Module::compile(Program::parse({{"boolean-snapshot.j",script,"boolean snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto original=make(true),target=make(false);auto& a=original->runtime();auto& b=target->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto bytes=original->encodeBooleanExpressions(identity),globals=a.encodeGlobals(identity);auto oldInitial=b.global("initial").bits;auto damaged=bytes;damaged.back()^=1;rejects([&]{target->rebuildBooleanExpressions(damaged);},"digest");auto different=make(false,true);rejects([&]{different->rebuildBooleanExpressions(bytes);},"source differs");Bytes forged(bytes.begin(),bytes.end()-64);size_t pos=8;auto read=[&](){auto value=std::uint32_t(forged.at(pos)) | (std::uint32_t(forged.at(pos+1))<<8) | (std::uint32_t(forged.at(pos+2))<<16) | (std::uint32_t(forged.at(pos+3))<<24);pos+=4;return value;};auto skipText=[&](){auto length=read();pos+=length;};skipText();pos+=8;auto sources=read();for(unsigned i=0;i<sources;++i){skipText();skipText();}auto handles=read();pos+=8*handles;auto nodes=read();bool changed=false;for(unsigned i=0;i<nodes;++i){auto node=pos;auto operation=read();pos+=12;if(operation!=0){auto self=i+1;for(unsigned j=0;j<4;++j)forged[node+8+j]=std::uint8_t(self>>(8*j));changed=true;break;}}require(changed,"Compound boolean fixture missing");auto cycle=sealSnapshot(std::move(forged),32u*1024u*1024u);rejects([&]{target->rebuildBooleanExpressions(cycle);},"cycle");require(target->liveObjects(NativeKind::Boolean)==1,"Rejected boolean snapshot changed target");auto mapping=target->rebuildBooleanExpressions(bytes);auto decode=[&](std::string_view type,std::uint32_t id){return type=="boolexpr" && mapping.contains(id)?mapping.at(id):0u;};b.restoreGlobals(globals,decode);require(b.global("initial").bits!=oldInitial && b.global("retired").bits==mapping.at(a.global("retired").bits),"Boolean identity or retired reference differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [oldId,newId]:mapping)if(newId==id)return oldId;return 0u;};require(target->encodeBooleanExpressions(reverse)==bytes,"Boolean expression snapshot did not round trip");auto trigger=b.invoke("CreateTrigger");b.invoke("TriggerAddCondition",std::array{trigger,b.global("composite")});require(b.invoke("TriggerEvaluate",std::array{trigger}).bits,"Restored compound expression evaluated incorrectly");rejects([&]{target->rebuildBooleanExpressions(bytes);},"");
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
    test("timers_preserve_retired_handles_and_legacy_format",[&]{
        std::string source=R"jass(type destructable extends handle
type timer extends handle
native CreateTimer takes nothing returns timer
native DestroyTimer takes timer t returns nothing
native TimerStart takes timer t, real timeout, boolean periodic, code callback returns nothing
native GetExpiredTimer takes nothing returns timer
globals
 timer baseline=CreateTimer()
 timer gone=null
 timer active=null
 integer fired=0
endglobals
function tick takes nothing returns nothing
 if GetExpiredTimer()==active then
  set fired=fired+1
 endif
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
function setup takes nothing returns nothing
 set gone=CreateTimer()
 call DestroyTimer(gone)
 set active=CreateTimer()
 call TimerStart(active,0.25,false,function tick)
endfunction
)jass";auto create=[&](bool start){auto module=Module::compile(Program::parse({{"timer-retired.j",source,"timer retired snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto first=create(true),second=create(false),third=create(false),legacy=create(false);auto& a=first->runtime();auto& b=second->runtime();auto& c=third->runtime();a.invoke("setup");first->advance(.125);auto gone=a.global("gone"),active=a.global("active"),baseline=a.global("baseline");auto identity=[](std::string_view,std::uint32_t id){return id;};auto clock=first->encodeSimulationClock(),timers=first->encodeTimers(identity),globals=a.encodeGlobals(identity);second->restoreSimulationClock(clock);third->restoreSimulationClock(clock);legacy->restoreSimulationClock(clock);auto baseline2=b.global("baseline"),gone2=b.invoke("CreateTimer");b.invoke("DestroyTimer",std::array{gone2});auto active2=b.invoke("CreateTimer");auto direct=[&](std::string_view type,std::uint32_t id){if(type!="timer")return std::uint32_t(0);return id==gone.bits?gone2.bits:id==active.bits?active2.bits:id==baseline.bits?baseline2.bits:0u;};second->restoreTimers(timers,direct);b.restoreGlobals(globals,direct);auto map=third->rebuildTimers(timers);auto decode=[&](std::string_view type,std::uint32_t id){return type=="timer" && map.contains(id)?map.at(id):0u;};c.restoreGlobals(globals,decode);require(b.global("gone").bits==gone2.bits && c.global("gone").bits==map.at(gone.bits) && c.global("gone").bits!=c.global("active").bits,"Retired timer global identity lost");auto reverse=[&](std::string_view type,std::uint32_t id){for(auto [oldId,newId]:map)if(type=="timer" && newId==id)return oldId;return std::uint32_t(0);};require(third->encodeTimers(reverse)==timers,"Timer lifetimes did not round-trip");second->startMain();third->startMain();first->advance(.125);second->advance(.125);third->advance(.125);require(a.global("fired").bits==1 && b.global("fired").bits==1 && c.global("fired").bits==1,"Live timer continuation changed");a.invoke("DestroyTimer",std::array{active});c.invoke("DestroyTimer",std::array{c.global("active")});require(first->encodeTimers(identity)==third->encodeTimers(reverse),"Retired timer ordering changed after restore");
        Binary in(openSnapshot(timers,16u*1024u*1024u));in.expect(tag("STMR"));require(in.u32()==2,"Timer snapshot version differs");auto time=snapshotU64(in);auto sources=in.u32();SnapshotWriter old(16u*1024u*1024u);old.u32(tag("STMR"));old.u32(1);old.u64(time);old.u32(sources);for(unsigned i=0;i<sources;++i){old.text(snapshotText(in,65536),65536);old.text(snapshotText(in,64),64);}auto count=in.u32();std::vector<std::pair<std::uint32_t,Bytes>> live;for(unsigned i=0;i<count;++i){auto id=in.u32(),state=in.u32();if(state){auto data=in.take(44);live.emplace_back(id,Bytes(data.begin(),data.end()));}}in.finish();old.size(live.size());for(auto& [id,data]:live){old.u32(id);old.raw(data);}auto oldBytes=sealSnapshot(old.finish(),16u*1024u*1024u);auto oldMap=legacy->rebuildTimers(oldBytes);require(oldMap.contains(active.bits) && oldMap.contains(baseline.bits) && !oldMap.contains(gone.bits),"Legacy timer snapshot could not be rebuilt");auto legacyDirect=create(false);legacyDirect->restoreSimulationClock(clock);auto& d=legacyDirect->runtime();auto d0=d.global("baseline"),d1=d.invoke("CreateTimer");auto oldDecode=[&](std::string_view type,std::uint32_t id){return type!="timer"?0u:id==baseline.bits?d0.bits:id==active.bits?d1.bits:0u;};legacyDirect->restoreTimers(oldBytes,oldDecode);require(legacyDirect->liveObjects(NativeKind::Timer)==2,"Legacy timer snapshot could not restore existing timers");
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
    test("shared_session_sleep_context_roundtrip",[&]{
        std::string source=R"jass(globals
 unit actor=null
 trigger watcher=null
 integer observed=0
 integer completed=0
 endglobals
 function eventAction takes nothing returns nothing
 call TriggerSleepAction(0.125)
 set observed=GetHandleId(GetTriggerUnit())
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set watcher=CreateTrigger()
 set actor=CreateUnit(Player(0),'hfoo',0.,0.,0.)
 call TriggerRegisterUnitEvent(watcher,actor,EVENT_UNIT_SELECTED)
 call TriggerAddAction(watcher,function eventAction)
 endfunction
 function work takes nothing returns nothing
 call TriggerSleepAction(0.125)
 set completed=completed+1
 endfunction
 )jass";auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");auto compileSource=[&]{return Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"shared-session.j",source,"shared context"}}));};auto make=[&](bool offset){auto result=std::make_unique<ScriptSession>(compileSource(),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(offset)result->runtime().invoke("CreateTimer");result->startMain();return result;};auto original=make(false),target=make(true);Runtime peer(compileSource()),restoredPeer(compileSource());peer.inheritNatives(original->runtime());peer.shareThreads(original->runtime());peer.initialize();restoredPeer.inheritNatives(target->runtime());restoredPeer.shareThreads(target->runtime());restoredPeer.initialize();original->runtime().start("work");peer.start("work");auto actor=original->runtime().global("actor").bits;original->selectUnit(actor,true);auto identity=[](std::string_view,std::uint32_t id){return id;};std::array<Runtime*,2> src{&original->runtime(),&peer},dst{&target->runtime(),&restoredPeer};auto snapshot=original->snapshotSharedSleepingScripts(src,identity);require(snapshot.threads.size()==3,"Shared session contexts missing");auto wire=original->encodeSharedSleepingScripts(src,snapshot);auto damaged=wire;damaged.back()^=1;rejects([&]{target->decodeSharedSleepingScripts(dst,damaged);},"digest");auto decoded=target->decodeSharedSleepingScripts(dst,wire);auto targetActor=target->runtime().global("actor").bits,watcher=original->runtime().global("watcher").bits,targetWatcher=target->runtime().global("watcher").bits;require(actor!=targetActor && watcher!=targetWatcher,"Shared handle remapping fixture did not shift identities");auto decode=[&](std::string_view,std::uint32_t id){if(id==actor)return targetActor;if(id==watcher)return targetWatcher;return id;};auto reverse=[&](std::string_view,std::uint32_t id){if(id==targetActor)return actor;if(id==targetWatcher)return watcher;return id;};auto wrong=[&](std::string_view type,std::uint32_t id){return id==watcher?0u:decode(type,id);};rejects([&]{target->restoreSharedSleepingScripts(dst,decoded,wrong);},"mapping");require(!target->runtime().threadCount(),"Rejected shared context retained threads");auto ids=target->restoreSharedSleepingScripts(dst,decoded,decode);require(ids.size()==3 && target->encodeSharedSleepingScripts(dst,target->snapshotSharedSleepingScripts(dst,reverse))==wire,"Shared session context did not round trip");original->advance(.125);target->advance(.125);require(original->runtime().global("completed").bits==1 && peer.global("completed").bits==1 && target->runtime().global("completed").bits==1 && restoredPeer.global("completed").bits==1 && original->runtime().global("observed").bits==actor && target->runtime().global("observed").bits==target->runtime().global("actor").bits,"Shared session continuations diverged");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_locust_swarm",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),enemy=spawn(p1,250);auto source=original->units().at(caster.bits),victim=original->units().at(enemy.bits);source->mana=source->maxMana=real(1000);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AUls")))}).bits && original->castSpell(caster.bits,ObjectData::code("AUls")),"Locust Swarm order rejected");std::uint32_t locust=0;for(int i=0;i<256 && !locust;++i){original->advance(1./32);for(auto& [id,u]:original->units())if(u->swarmAgent && u->summoner==caster.bits){locust=id;break;}}require(locust,"Locust fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeLocustState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeLocustState(reverse)==snapshot && target->units().contains(ids.at(locust)) && target->units().at(ids.at(locust))->summoner==ids.at(caster.bits),"Locust state or identity differs");original->advance(8);require(std::bit_cast<float>(victim->life.bits())<5000,"Locust did not damage target");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_healing_spray",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto spawn=[&](int x){return vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(0),ally=spawn(400);auto source=original->units().at(caster.bits),patient=original->units().at(ally.bits);source->mana=source->maxMana=real(1000);patient->life=real(100);patient->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANhs")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("ANhs"),{real(400),real(0)}),"Healing Spray order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto waves=[&]{auto bytes=original->encodeHealingSprays(identity);Binary in(openSnapshot(bytes,32u*1024u*1024u));in.expect(tag("SHSP"));in.u32();snapshotText(in,64);snapshotU64(in);return in.u32();};for(int i=0;i<256 && !waves();++i)original->advance(1./32);require(waves()>0,"Healing Spray flight missing");auto snapshot=original->encodeHealingSprays(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeHealingSprays(reverse)==snapshot,"Healing Spray flight restore differs");original->advance(3);require(std::bit_cast<float>(patient->life.bits())>100,"Healing Spray did not heal patient");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_volcano_rocks",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),enemy=spawn(p1,400);auto source=original->units().at(caster.bits),victim=original->units().at(enemy.bits);source->mana=source->maxMana=real(1000);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANvc")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("ANvc"),{real(400),real(0)}),"Volcano order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto rocks=[&]{auto bytes=original->encodeFirelordFlights(identity);Binary in(openSnapshot(bytes,32u*1024u*1024u));in.expect(tag("SFLD"));in.u32();snapshotText(in,64);snapshotU64(in);require(in.u32()==0,"Unexpected Incinerate fixture");return in.u32();};for(int i=0;i<256 && !rocks();++i)original->advance(1./32);require(rocks()>0,"Volcano rock flight missing");auto snapshot=original->encodeFirelordFlights(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeFirelordFlights(reverse)==snapshot,"Volcano flight restore differs");original->advance(3);require(std::bit_cast<float>(victim->life.bits())<5000,"Volcano did not damage target");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_stampede",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto unit=original->units().at(caster.bits);unit->mana=unit->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANst")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("ANst"),{real(400),real(0)}),"Stampede order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto beasts=[&]{auto bytes=original->encodeStampedeState(identity);Binary in(openSnapshot(bytes,32u*1024u*1024u));in.expect(tag("SSTP"));in.u32();snapshotText(in,64);snapshotU64(in);snapshotU64(in);return in.u32();};for(int i=0;i<256 && !beasts();++i)original->advance(1./32);require(beasts()>0,"Stampede beast missing");auto snapshot=original->encodeStampedeState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeStampedeState(reverse)==snapshot,"Stampede restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_area_wave",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),enemy=spawn(p1,400);auto source=original->units().at(caster.bits),victim=original->units().at(enemy.bits);source->mana=source->maxMana=real(1000);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AOsh")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("AOsh"),{real(400),real(0)}),"Area spell order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};for(int i=0;i<256 && !(!original->spellWaves().empty());++i)original->advance(1./32);require(!original->spellWaves().empty(),"Area spell fixture missing");auto snapshot=original->encodeAreaSpellState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeAreaSpellState(reverse)==snapshot,"Area spell restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_area_ground",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),enemy=spawn(p1,400);auto source=original->units().at(caster.bits),victim=original->units().at(enemy.bits);source->mana=source->maxMana=real(1000);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AHfs")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("AHfs"),{real(400),real(0)}),"Area spell order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};for(int i=0;i<256 && !(!original->groundSpells().empty());++i)original->advance(1./32);require(!original->groundSpells().empty(),"Area spell fixture missing");auto snapshot=original->encodeAreaSpellState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeAreaSpellState(reverse)==snapshot,"Area spell restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_area_delayed",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),enemy=spawn(p1,400);auto source=original->units().at(caster.bits),victim=original->units().at(enemy.bits);source->mana=source->maxMana=real(1000);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AUin")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("AUin"),{real(400),real(0)}),"Area spell order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto delayed=[&]{auto bytes=original->encodeAreaSpellState(identity);Binary in(openSnapshot(bytes,64u*1024u*1024u));in.expect(tag("SASP"));in.u32();snapshotText(in,64);snapshotU64(in);require(in.u32()==0,"Unexpected wave fixture");return in.u32()>0;};for(int i=0;i<256 && !(delayed());++i)original->advance(1./32);require(delayed(),"Area spell fixture missing");auto snapshot=original->encodeAreaSpellState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeAreaSpellState(reverse)==snapshot,"Area spell restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_item_blight_growth",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto unit=original->units().at(caster.bits);unit->mana=unit->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AInv")))}).bits,"Inventory ability missing");auto item=vm.invoke("UnitAddItemById",std::array{caster,vm.integer(int(ObjectData::code("skul")))});require(item.bits && original->useItemAt(caster.bits,item.bits,{real(300),real(0)}),"Sacrificial Skull order rejected");auto growth=[&]{auto bytes=original->encodeItemBlightGrowth();Binary in(openSnapshot(bytes,1024u*1024u));in.expect(tag("SIBG"));in.u32();snapshotText(in,64);snapshotU64(in);return in.u32();};for(int i=0;i<256 && !growth();++i)original->advance(1./32);require(growth()>0,"Item blight growth missing");auto snapshot=original->encodeItemBlightGrowth(),blight=original->world()->encodeBlightState();target->restoreRecoveryBundle(original->encodeRecoveryBundle());require(target->encodeItemBlightGrowth()==snapshot && target->world()->encodeBlightState()==blight,"Item blight growth restore differs");original->advance(1);require(original->world()->encodeBlightState()!=blight,"Item blight did not continue growing");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_siege_fire",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerTechResearched",std::array{p0,vm.integer(int(ObjectData::code("Robf"))),vm.integer(1)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,const char* type,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code(type))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto attacker=spawn(p0,"ocat",0),enemy=spawn(p1,"hfoo",500);auto a=original->units().at(attacker.bits),victim=original->units().at(enemy.bits);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{attacker,vm.boolean(false)});vm.invoke("SetUnitPathing",std::array{enemy,vm.boolean(false)});if(!a->abilities.contains(ObjectData::code("Abof")))require(vm.invoke("UnitAddAbility",std::array{attacker,vm.integer(int(ObjectData::code("Abof")))}).bits,"Combat effect ability missing");require(original->attackUnit(attacker.bits,enemy.bits,true),"Combat effect attack rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto active=[&]{auto bytes=original->encodeCombatEffects(identity);Binary in(openSnapshot(bytes,32u*1024u*1024u));in.expect(tag("SCFX"));in.u32();snapshotText(in,64);snapshotU64(in);snapshotU64(in);auto fires=in.u32();return fires>0;};for(int i=0;i<512 && !active();++i)original->advance(1./32);require(active(),"Combat effect fixture missing");auto snapshot=original->encodeCombatEffects(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeCombatEffects(reverse)==snapshot,"Combat effect restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_attack_lightning",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerTechResearched",std::array{p0,vm.integer(int(ObjectData::code("Robf"))),vm.integer(1)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,const char* type,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code(type))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto attacker=spawn(p0,"hrif",0),enemy=spawn(p1,"hfoo",500);auto a=original->units().at(attacker.bits),victim=original->units().at(enemy.bits);victim->life=victim->maxLife=real(5000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{attacker,vm.boolean(false)});vm.invoke("SetUnitPathing",std::array{enemy,vm.boolean(false)});if(!a->abilities.contains(ObjectData::code("Alit")))require(vm.invoke("UnitAddAbility",std::array{attacker,vm.integer(int(ObjectData::code("Alit")))}).bits,"Combat effect ability missing");require(original->attackUnit(attacker.bits,enemy.bits,true),"Combat effect attack rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto active=[&]{auto bytes=original->encodeCombatEffects(identity);Binary in(openSnapshot(bytes,32u*1024u*1024u));in.expect(tag("SCFX"));in.u32();snapshotText(in,64);snapshotU64(in);snapshotU64(in);auto fires=in.u32();require(!fires,"Unexpected fire fixture");return in.u32()>0;};for(int i=0;i<512 && !active();++i)original->advance(1./32);require(active(),"Combat effect fixture missing");auto snapshot=original->encodeCombatEffects(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeCombatEffects(reverse)==snapshot,"Combat effect restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_images_and_ubersplats",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto makeImage=[&]{return vm.invoke("CreateImage",std::array{vm.string("ReplaceableTextures\\Splats\\DirtUberSplat.blp"),vm.real(real(200)),vm.real(real(160)),vm.real(real(0)),vm.real(real(10)),vm.real(real(20)),vm.real(real(0)),vm.real(real(5)),vm.real(real(6)),vm.real(real(0)),vm.integer(2)});};auto image=makeImage(),retiredImage=makeImage();require(image.bits && retiredImage.bits,"Image fixture missing");vm.invoke("ShowImage",std::array{image,vm.boolean(true)});vm.invoke("SetImageColor",std::array{image,vm.integer(50),vm.integer(100),vm.integer(150),vm.integer(200)});vm.invoke("SetImageAboveWater",std::array{image,vm.boolean(true),vm.boolean(true)});vm.invoke("DestroyImage",std::array{retiredImage});auto splat=[&]{return vm.invoke("CreateUbersplat",std::array{vm.real(real(200)),vm.real(real(100)),vm.string("LSDS"),vm.integer(180),vm.integer(200),vm.integer(220),vm.integer(240),vm.boolean(false),vm.boolean(false)});};auto mark=splat(),retiredMark=splat();require(mark.bits && retiredMark.bits,"Ubersplat fixture missing");vm.invoke("DestroyUbersplat",std::array{retiredMark});original->advance(.25);auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeImages(identity);auto& pre=target->runtime();auto createPreImage=[&]{return pre.invoke("CreateImage",std::array{pre.string("ReplaceableTextures\\Splats\\DirtUberSplat.blp"),pre.real(real(40)),pre.real(real(40)),pre.real(real(0)),pre.real(real(1)),pre.real(real(2)),pre.real(real(0)),pre.real(real(0)),pre.real(real(0)),pre.real(real(0)),pre.integer(0)});};auto provisional=createPreImage(),retired=createPreImage();pre.invoke("DestroyImage",std::array{retired});auto provisionalSplat=pre.invoke("CreateUbersplat",std::array{pre.real(real(30)),pre.real(real(40)),pre.string("LSDS"),pre.integer(255),pre.integer(255),pre.integer(255),pre.integer(255),pre.boolean(false),pre.boolean(false)});require(provisional.bits && provisionalSplat.bits && target->images().size()==2,"Provisional images missing");auto bad=snapshot;bad.back()^=1;rejects([&]{target->rebuildImages(bad);},"digest");require(target->images().contains(provisional.bits) && target->images().contains(provisionalSplat.bits),"Rejected image restore changed provisional state");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeImages(reverse)==snapshot && target->images().contains(ids.at(image.bits)) && target->images().contains(ids.at(mark.bits)),"Image or ubersplat restore differs");require(!target->images().contains(provisional.bits) && !target->images().contains(provisionalSplat.bits) && target->images().size()==2,"Provisional images were not replaced");auto& restored=target->runtime();restored.invoke("ShowImage",std::array{restored.handle("image",ids.at(image.bits)),restored.boolean(false)});restored.invoke("FinishUbersplat",std::array{restored.handle("ubersplat",ids.at(mark.bits))});require(!target->images().at(ids.at(image.bits))->visible,"Restored image native did not update state");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_replaces_global_images",[&]{
        const std::string source=R"jass(
 globals
 image pic = CreateImage("ReplaceableTextures\\Splats\\DirtUberSplat.blp", 100., 100., 0., 0., 0., 0., 0., 0., 0., 1)
 ubersplat mark = CreateUbersplat(0., 0., "LSDS", 255, 255, 255, 255, false, false)
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 call ShowImage(pic, true)
 endfunction
 )jass";auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");auto make=[&](bool start){auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"image-init.j",source,"image globals"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);if(start)session->startMain();return session;};auto original=make(true),target=make(false);auto sourceImage=original->runtime().global("pic"),sourceSplat=original->runtime().global("mark"),oldImage=target->runtime().global("pic"),oldSplat=target->runtime().global("mark");require(sourceImage.bits && sourceSplat.bits && oldImage.bits && oldSplat.bits && target->images().size()==2,"Global image fixtures missing");original->advance(.25);auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeImages(identity);auto mapping=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:mapping)if(current==id)return old;return 0u;};require(target->runtime().global("pic").bits==mapping.at(sourceImage.bits) && target->runtime().global("mark").bits==mapping.at(sourceSplat.bits) && !target->images().contains(oldImage.bits) && !target->images().contains(oldSplat.bits) && target->encodeImages(reverse)==snapshot,"Global image mappings differ");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_terrain_deformations",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto crater=vm.invoke("TerrainDeformCrater",std::array{vm.real(real(0)),vm.real(real(0)),vm.real(real(500)),vm.real(real(90)),vm.integer(1000),vm.boolean(true)});require(crater.bits,"Permanent crater fixture missing");original->advance(2);auto ripple=vm.invoke("TerrainDeformRipple",std::array{vm.real(real(0)),vm.real(real(0)),vm.real(real(500)),vm.real(real(40)),vm.integer(10000),vm.integer(1),vm.real(real(1)),vm.real(real(2)),vm.real(real(1)),vm.boolean(false)});auto wave=vm.invoke("TerrainDeformWave",std::array{vm.real(real(0)),vm.real(real(0)),vm.real(real(1)),vm.real(real(0)),vm.real(real(500)),vm.real(real(200)),vm.real(real(300)),vm.real(real(50)),vm.integer(1000),vm.integer(1)});auto noise=vm.invoke("TerrainDeformRandom",std::array{vm.real(real(0)),vm.real(real(0)),vm.real(real(500)),vm.real(real(-15)),vm.real(real(15)),vm.integer(10000),vm.integer(100)});require(ripple.bits && wave.bits && noise.bits,"Active deformation fixture missing");original->advance(.25);auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeDeformations(identity);auto height=original->world()->deformation(0,0);auto& pre=target->runtime();auto provisional=pre.invoke("TerrainDeformCrater",std::array{pre.real(real(0)),pre.real(real(0)),pre.real(real(128)),pre.real(real(5)),pre.integer(1000),pre.boolean(false)});require(provisional.bits,"Provisional deformation missing");auto bad=snapshot;bad.back()^=1;rejects([&]{target->rebuildDeformations(bad);},"digest");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeDeformations(reverse)==snapshot && target->world()->deformation(0,0)==height,"Deformation restore differs");auto& dst=target->runtime();vm.invoke("TerrainDeformStop",std::array{wave,vm.integer(500)});dst.invoke("TerrainDeformStop",std::array{dst.handle("terraindeformation",ids.at(wave.bits)),dst.integer(500)});require(target->encodeDeformations(reverse)==original->encodeDeformations(identity),"Restored deformation handle differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_match_state",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make(),ended=make(),wrong=make();wrong->campaignContext(true,1);original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(1)});auto hero=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("Hamg"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});require(hero.bits && original->units().at(hero.bits)->hero,"Match hero fixture missing");vm.invoke("CachePlayerHeroData",std::array{player});auto heroes=original->heroSummaries()[1].size();require(heroes>0,"Hero summary fixture missing");vm.invoke("RemoveUnit",std::array{hero});vm.invoke("RemovePlayer",std::array{player,vm.handle("playergameresult",1)});vm.invoke("SetGameDifficulty",std::array{vm.handle("gamedifficulty",3)});vm.invoke("SetDefaultDifficulty",std::array{vm.handle("gamedifficulty",0)});vm.invoke("ForceCampaignSelectScreen");vm.invoke("DoNotSaveReplay");vm.invoke("PlayModelCinematic",std::array{vm.string("Movies\\Intro.mdx")});auto snapshot=original->encodeMatchState();auto bundle=original->encodeRecoveryBundle();rejects([&]{wrong->restoreRecoveryBundle(bundle);},"context");target->restoreRecoveryBundle(bundle);auto& restored=target->runtime();require(target->encodeMatchState()==snapshot && target->results()[1] && *target->results()[1]==1 && target->heroSummaries()[1].size()==heroes && target->forceCampaignSelection() && target->replaySavingDisabled() && restored.invoke("GetGameDifficulty").bits==3 && restored.invoke("GetDefaultDifficulty").bits==0,"Match state restore differs");auto sourceCine=original->takeCinematic(),targetCine=target->takeCinematic();require(sourceCine && targetCine && *sourceCine==*targetCine,"Cinematic request differs");vm.invoke("PlayCinematic",std::array{vm.string("Movies\\End.avi")});vm.invoke("ChangeLevel",std::array{vm.string("Maps\\Campaign\\Orc02.w3m"),vm.boolean(true)});require(original->exitRequest()==SessionExit::ChangeLevel && original->paused(),"ChangeLevel fixture missing");auto finalState=original->encodeMatchState();ended->restoreRecoveryBundle(original->encodeRecoveryBundle());require(ended->encodeMatchState()==finalState && ended->exitRequest()==SessionExit::ChangeLevel && ended->nextLevel()==original->nextLevel() && ended->showScores() && ended->paused(),"Campaign transition restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_doodad_animation_and_slots",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();size_t mapDoodad=SIZE_MAX;for(size_t i=0;i<50000;++i)if(auto d=original->doodad(i);d && !d->handle){mapDoodad=i;break;}require(mapDoodad!=SIZE_MAX,"Map doodad fixture missing");vm.invoke("SetDoodadAnimation",std::array{vm.real(real(0)),vm.real(real(0)),vm.real(real(100000)),vm.integer(0),vm.boolean(false),vm.string("stand"),vm.boolean(true)});require(original->doodad(mapDoodad)->animation=="stand","Map doodad animation missing");auto spawn=[&](jass::Runtime& v,int x){return v.invoke("CreateDestructable",std::array{v.integer(int(ObjectData::code("LTlt"))),v.real(real(float(x))),v.real(real(0)),v.real(real(0)),v.real(real(1)),v.integer(0)});};auto a=spawn(vm,100),b=spawn(vm,300),c=spawn(vm,500);require(a.bits && b.bits && c.bits,"Doodad destructable fixtures missing");auto freeIndex=original->destructables().at(a.bits)->doodadIndex;vm.invoke("RemoveDestructable",std::array{a});vm.invoke("RemoveDestructable",std::array{b});auto d=spawn(vm,700);require(d.bits,"Reused doodad fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeDoodads(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeDoodads(reverse)==snapshot && target->doodad(mapDoodad) && target->doodad(mapDoodad)->animation=="stand" && target->destructables().at(ids.at(d.bits))->doodadIndex==original->destructables().at(d.bits)->doodadIndex,"Doodad restoration differs");auto sourceNext=spawn(vm,900);auto& dest=target->runtime();auto targetNext=spawn(dest,900);require(sourceNext.bits && targetNext.bits && original->destructables().at(sourceNext.bits)->doodadIndex==freeIndex && target->destructables().at(targetNext.bits)->doodadIndex==freeIndex,"Doodad free slot order differs");auto reverseNext=[&](std::string_view type,std::uint32_t id){return type=="destructable" && id==targetNext.bits?sourceNext.bits:reverse(type,id);};require(target->encodeDoodads(reverseNext)==original->encodeDoodads(identity),"Doodad state differs after slot reuse");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_indicators",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto spawn=[&](float x){return vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(x)),vm.real(real(0)),vm.real(real(0))});};auto unit=spawn(0),removed=spawn(100);auto item=vm.invoke("CreateItem",std::array{vm.integer(int(ObjectData::code("ratf"))),vm.real(real(200)),vm.real(real(0))});auto tree=vm.invoke("CreateDestructable",std::array{vm.integer(int(ObjectData::code("LTlt"))),vm.real(real(300)),vm.real(real(0)),vm.real(real(0)),vm.real(real(1)),vm.integer(0)});auto add=[&](jass::Runtime& v,jass::Value object,int red){v.invoke("AddIndicator",std::array{object,v.integer(red),v.integer(20),v.integer(30),v.integer(255)});};require(unit.bits && removed.bits && item.bits && tree.bits,"Indicator fixture missing");for(int i=0;i<9;++i)add(vm,unit,i);add(vm,item,30);add(vm,tree,40);add(vm,removed,50);vm.invoke("RemoveUnit",std::array{removed});auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeIndicators(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeIndicators(reverse)==snapshot && target->indicatorColor(ids.at(unit.bits),0xffffffff)==original->indicatorColor(unit.bits,0xffffffff) && target->indicatorColor(ids.at(item.bits),0xffffffff)==original->indicatorColor(item.bits,0xffffffff) && target->indicatorColor(ids.at(tree.bits),0xffffffff)==original->indicatorColor(tree.bits,0xffffffff),"Indicator recovery differs");auto& dst=target->runtime();add(vm,unit,90);add(dst,dst.handle("unit",ids.at(unit.bits)),90);require(target->encodeIndicators(reverse)==original->encodeIndicators(identity),"Indicator ring order differs after restore");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_point_damage",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make(),retired=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto spawn=[&](float x){return vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(x)),vm.real(real(0)),vm.real(real(0))});};auto source=spawn(0),removed=spawn(100);auto schedule=[&](jass::Value unit,float delay,float amount){return vm.invoke("UnitDamagePoint",std::array{unit,vm.real(real(delay)),vm.real(real(200)),vm.real(real(400)),vm.real(real(0)),vm.real(real(amount)),vm.boolean(false),vm.boolean(true),vm.handle("attacktype",0),vm.handle("damagetype",26),vm.handle("weapontype",0)}).bits;};require(schedule(source,2,10) && schedule(source,2,20) && schedule(removed,1,30),"Point damage fixture rejected");vm.invoke("RemoveUnit",std::array{removed});auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodePointDamage(identity);auto bundle=original->encodeRecoveryBundle();auto ids=target->restoreRecoveryBundle(bundle);auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodePointDamage(reverse)==snapshot,"Delayed point damage queue or retired source differs");auto bad=bundle;bad.back()^=1;rejects([&]{retired->restoreRecoveryBundle(bad);},"digest");auto other=retired->restoreRecoveryBundle(bundle);require(other.contains(removed.bits),"Retired source identity missing");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_ui_requests",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make(),retired=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AInv")))}).bits,"Inventory fixture missing");auto item=vm.invoke("UnitAddItemById",std::array{caster,vm.integer(int(ObjectData::code("sbok")))});auto unit=original->units().at(caster.bits);require(item.bits && !unit->spellBooks.empty(),"Spell book fixture missing");auto ability=unit->spellBooks.front().ability;require(original->openSpellBook(caster.bits,ability),"Spell book request rejected");vm.invoke("ForceUIKey",std::array{vm.string("a")});vm.invoke("ForceUIKey",std::array{vm.string("5")});vm.invoke("ForceUICancel");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeUIRequests(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeUIRequests(reverse)==snapshot,"UI request restore differs");auto book=target->takeSpellBookRequest();require(book && book->first==ids.at(caster.bits) && book->second==ability && target->takeForcedUIKey()==unsigned('A') && target->takeForcedUIKey()==unsigned('5') && target->takeForcedUIKey()==512u && !target->takeForcedUIKey(),"UI request order differs");vm.invoke("RemoveUnit",std::array{caster});auto retiredIds=retired->restoreRecoveryBundle(original->encodeRecoveryBundle());auto retiredBook=retired->takeSpellBookRequest();require(retiredBook && retiredBook->first==retiredIds.at(caster.bits) && retiredBook->second==ability,"Retired spell book request identity lost");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_music",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();vm.invoke("PlayMusic",std::array{vm.string("Sound\\Music\\mp3Music\\Human3.mp3")});vm.invoke("SetMusicPlayPosition",std::array{vm.integer(500)});vm.invoke("PlayThematicMusic",std::array{vm.string("Sound\\Music\\mp3Music\\Orc1.mp3")});require(original->music() && original->music()->paused(),"Thematic music fixture missing");target->restoreRecoveryBundle(original->encodeRecoveryBundle());require(target->music() && target->music()->paused() && target->music()->currentFile()==original->music()->currentFile(),"Map music restoration differs");auto& restored=target->runtime();vm.invoke("EndThematicMusic");restored.invoke("EndThematicMusic");require(original->music()->voice() && target->music()->voice() && original->music()->voice()->playing() && target->music()->voice()->playing(),"Thematic completion did not resume map music");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_sound_requests",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();original->takeSpellSounds();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto unit=original->units().at(caster.bits);unit->mana=unit->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("AOsh")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("AOsh"),{real(400),real(0)}),"Sound request spell rejected");auto count=[&]{auto bytes=original->encodeSoundRequests();Binary in(openSnapshot(bytes,16u*1024u*1024u));in.expect(tag("SSRQ"));in.u32();snapshotText(in,64);snapshotU64(in);return in.u32();};for(int i=0;i<256 && !count();++i)original->advance(1./32);require(count()>0,"Sound request fixture missing");auto snapshot=original->encodeSoundRequests();target->restoreRecoveryBundle(original->encodeRecoveryBundle());require(target->encodeSoundRequests()==snapshot,"Sound request restore differs");auto a=original->takeSpellSounds(),b=target->takeSpellSounds();require(a.size()==b.size() && !a.empty(),"Sound request count differs");for(size_t i=0;i<a.size();++i)require(a[i].ability==b[i].ability && a[i].label==b[i].label && a[i].position.x.bits()==b[i].position.x.bits() && a[i].position.y.bits()==b[i].position.y.bits(),"Sound request order differs");require(target->takeSpellSounds().empty(),"Sound request consumed twice");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_stasis_ward",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerTechResearched",std::array{p0,vm.integer(int(ObjectData::code("Rowd"))),vm.integer(1)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),enemy=spawn(p1,750);auto source=original->units().at(caster.bits),victim=original->units().at(enemy.bits);source->mana=source->maxMana=real(1000);victim->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("Asta")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("Asta"),{real(600),real(0)}),"Stasis ward order rejected");std::uint32_t ward=0;for(int i=0;i<256 && !ward;++i){original->advance(1./32);for(auto& [id,u]:original->units())if(u->summoner==caster.bits && u->summonAbility==ObjectData::code("Asta")){ward=id;break;}}require(ward,"Stasis ward fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeWardState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeWardState(reverse)==snapshot && target->units().contains(ids.at(ward)),"Stasis ward restore differs");original->advance(11);require(victim->stunned(),"Stasis ward did not stun target");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_tinker_rockets",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto unit=original->units().at(caster.bits);unit->mana=unit->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANcs")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("ANcs"),{real(600),real(0)}),"Cluster rockets order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto volleys=[&]{auto bytes=original->encodeTinkerState(identity);Binary in(openSnapshot(bytes,64u*1024u*1024u));in.expect(tag("STNK"));in.u32();snapshotText(in,64);snapshotU64(in);require(in.u32()==0,"Unexpected engineering fixture");return in.u32();};for(int i=0;i<256 && !volleys();++i)original->advance(1./32);require(volleys()>0,"Cluster rocket flight missing");auto snapshot=original->encodeTinkerState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeTinkerState(reverse)==snapshot,"Cluster rocket flight restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_tinker_explosion",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto bomber=spawn(p0,0),victim=spawn(p1,100);auto victimUnit=original->units().at(victim.bits);victimUnit->life=victimUnit->maxLife=real(5000);victimUnit->paused=true;require(vm.invoke("UnitAddAbility",std::array{bomber,vm.integer(int(ObjectData::code("Asds")))}).bits,"Self destruct ability missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto before=original->encodeTinkerState(identity);vm.invoke("KillUnit",std::array{bomber});auto snapshot=original->encodeTinkerState(identity);require(snapshot!=before,"Delayed explosion fixture missing");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodeTinkerState(reverse)==snapshot,"Delayed explosion restore differs");original->advance(.25);require(std::bit_cast<float>(victimUnit->life.bits())<5000,"Delayed explosion did not damage target");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_tinker_factory",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),flight=make(),factoryTarget=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto source=original->units().at(caster.bits);source->mana=source->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANsy")))}).bits && original->castSpellAt(caster.bits,ObjectData::code("ANsy"),{real(600),real(0)}),"Pocket factory order rejected");auto identity=[](std::string_view,std::uint32_t id){return id;};auto volleys=[&]{auto bytes=original->encodeTinkerState(identity);Binary in(openSnapshot(bytes,64u*1024u*1024u));in.expect(tag("STNK"));require(in.u32()==1,"Tinker snapshot version differs");snapshotText(in,64);snapshotU64(in);require(in.u32()==0,"Unexpected engineering fixture");return in.u32();};for(int i=0;i<256 && !volleys();++i)original->advance(1./32);require(volleys()>0,"Pocket factory flight fixture missing");auto verify=[&](ScriptSession& target){auto snapshot=original->encodeTinkerState(identity);auto ids=target.restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target.encodeTinkerState(reverse)==snapshot,"Tinker state differs");return ids;};verify(*flight);original->advance(10);std::uint32_t factory=0;for(auto& [id,u]:original->units())if(u->summoner==caster.bits && u->summonAbility==ObjectData::code("ANsy"))factory=id;require(factory,"Pocket factory not delivered");size_t children=0;for(auto& [id,u]:original->units())if(u->summoner==factory)++children;require(children>0,"Clockwerk fixture missing");require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANeg")))}).bits && source->engineering,"Engineering fixture missing");auto ids=verify(*factoryTarget);auto rebuilt=factoryTarget->units().at(ids.at(caster.bits));require(rebuilt->engineering && rebuilt->engineering->replacements==source->engineering->replacements,"Engineering replacements differ");auto& restoredVm=factoryTarget->runtime();restoredVm.invoke("UnitRemoveAbility",std::array{restoredVm.handle("unit",rebuilt->handle),restoredVm.integer(int(ObjectData::code("ANeg")))});require(!rebuilt->engineering && rebuilt->abilities.contains(ObjectData::code("ANsy")),"Restored engineering did not revert");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_concoction_flight",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto spawn=[&](jass::Value owner,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code(x==0?"hfoo":"hgry"))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn(p0,0),victim=spawn(p1,200);auto source=original->units().at(caster.bits),other=original->units().at(victim.bits);source->mana=source->maxMana=real(1000);other->life=other->maxLife=real(5000);other->paused=true;vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("Auco")))}).bits && original->castSpell(caster.bits,ObjectData::code("Auco"),victim.bits),"Concoction order rejected");for(int i=0;i<256 && !source->concoction;++i)original->advance(1./32);require(source->concoction && source->hidden(),"Concoction flight fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeConcoctions(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto restored=target->units().at(ids.at(caster.bits));require(target->encodeConcoctions(reverse)==snapshot && restored->concoction && restored->hidden(),"Concoction flight restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_rescue_membership",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(
 globals
 unit rescueTarget
 unit rescuer
 integer rescueCount=0
 endglobals
 function onRescue takes nothing returns nothing
 set rescueCount=rescueCount+1
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 local trigger t=CreateTrigger()
 set rescueTarget=CreateUnit(Player(1),'hfoo',0.,0.,0.)
 set rescuer=CreateUnit(Player(0),'hfoo',100.,0.,0.)
 call SetUnitRescuable(rescueTarget,Player(0),true)
 call SetUnitRescuable(rescueTarget,Player(2),false)
 call SetUnitRescueRange(rescueTarget,400.)
 call TriggerRegisterUnitEvent(t,rescueTarget,EVENT_UNIT_RESCUED)
 call TriggerAddAction(t,function onRescue)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"rescue.j",source,"rescue recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->audioSimulationClock();result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=make(),target=make();original->startMain();original->advance(.25);auto actor=original->runtime().global("rescueTarget").bits,rescuer=original->runtime().global("rescuer").bits;require(original->runtime().global("rescueCount").bits==1 && original->units().at(actor)->rescueNearby.contains(rescuer),"Rescue membership fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeRescueState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto rebuilt=target->units().at(ids.at(actor));require(target->encodeRescueState(reverse)==snapshot && rebuilt->rescueEnabled==1 && rebuilt->rescueDisabled==4 && rebuilt->rescueRange==400 && rebuilt->rescueNearby.contains(ids.at(rescuer)) && target->runtime().global("rescueCount").bits==1,"Rescue membership restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_partial_unsummon_refund",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto spawn=[&](const char* type,int x){return vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code(type))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto caster=spawn("uaco",0),building=spawn("uzig",200);auto worker=original->units().at(caster.bits),structure=original->units().at(building.bits);worker->paused=false;structure->paused=false;vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",1),vm.integer(1000)});vm.invoke("SetPlayerState",std::array{player,vm.handle("playerstate",2),vm.integer(1000)});if(!worker->abilities.contains(ObjectData::code("Auns")))vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("Auns")))});require(original->castSpell(caster.bits,ObjectData::code("Auns"),building.bits),"Unsummon order rejected");for(int i=0;i<32 && !structure->unsummon;++i)original->advance(.25);require(structure->unsummon.has_value(),"Unsummon fixture missing");original->advance(1);vm.invoke("KillUnit",std::array{caster});auto gold=original->config().players[0].states.at(1),lumber=original->config().players[0].states.at(2);require(gold>1000 && lumber>1000 && structure->unsummon->drained>0,"Partial unsummon refund missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeConstruction(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto rebuilt=target->units().at(ids.at(building.bits));require(target->encodeConstruction(reverse)==snapshot && rebuilt->unsummon && rebuilt->unsummon->caster==ids.at(caster.bits) && target->config().players[0].states.at(1)==gold && target->config().players[0].states.at(2)==lumber,"Partial unsummon restore differs");auto& restoredVm=target->runtime();restoredVm.invoke("SetUnitOwner",std::array{restoredVm.handle("unit",rebuilt->handle),restoredVm.invoke("Player",std::array{restoredVm.integer(1)}),restoredVm.boolean(false)});require(!rebuilt->unsummon && target->config().players[0].states.at(1)==gold && target->config().players[0].states.at(2)==lumber,"Ownership transfer did not cancel restored unsummon");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_lava_spawns",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),flight=make(),mature=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto caster=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});require(caster.bits && original->units().contains(caster.bits),"Lava spawn caster missing");auto source=original->units().at(caster.bits);source->mana=source->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{caster,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{caster,vm.integer(int(ObjectData::code("ANlm")))}).bits && original->castSpell(caster.bits,ObjectData::code("ANlm")),"Lava spawn order rejected");std::uint32_t lava=0;for(int i=0;i<128 && !lava;++i){original->advance(1./32);for(auto& [id,u]:original->units())if(u->lavaSpawn && u->summoner==caster.bits){lava=id;break;}}require(lava && original->units().at(lava)->lavaSpawn->emerging,"Lava spawn flight fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto verify=[&](ScriptSession& target,bool emerging){auto snapshot=original->encodeLavaSpawns(identity);auto ids=target.restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto unit=target.units().at(ids.at(lava));require(target.encodeLavaSpawns(reverse)==snapshot && unit->lavaSpawn && unit->lavaSpawn->definition && unit->lavaSpawn->emerging==emerging,"Lava spawn state differs");};verify(*flight,true);original->advance(2);auto unit=original->units().at(lava);require(unit->lavaSpawn && !unit->lavaSpawn->emerging,"Lava spawn landed fixture missing");auto& state=*unit->lavaSpawn;state.attacks=state.definition->splitAttacks;state.born=std::max(0.,original->simulationTime()-double(state.definition->splitDelay));state.nextTry=original->simulationTime();verify(*mature,false);require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_phoenix_fire",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);for(auto& [id,u]:original->units())u->paused=true;auto& vm=original->runtime();auto p0=vm.invoke("Player",std::array{vm.integer(0)}),p1=vm.invoke("Player",std::array{vm.integer(1)});vm.invoke("SetPlayerAlliance",std::array{p0,p1,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{p1,p0,vm.handle("alliancetype",0),vm.boolean(false)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});auto create=[&](jass::Value owner,const char* type,int x){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code(type))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto bird=create(p0,"hphx",0),victim=create(p1,"hfoo",200);require(original->units().contains(bird.bits) && original->units().contains(victim.bits),"Phoenix fire fixture missing");auto victimUnit=original->units().at(victim.bits);victimUnit->life=victimUnit->maxLife=real(5000);auto identity=[](std::string_view,std::uint32_t id){return id;};auto burns=[&]{auto bytes=original->encodePhoenixFire(identity);Binary in(openSnapshot(bytes,16u*1024u*1024u));in.expect(tag("SPHX"));require(in.u32()==1,"Phoenix fire version differs");snapshotText(in,64);snapshotU64(in);snapshotU64(in);auto clocks=in.count(16,65536);for(unsigned i=0;i<clocks;++i){in.u32();in.u32();snapshotU64(in);}auto count=in.u32();for(unsigned i=0;i<count;++i){auto source=in.u32();in.u32();auto target=in.u32();in.u32();for(int j=0;j<4;++j)in.u32();for(int j=0;j<4;++j)snapshotU64(in);auto visuals=in.u32();for(unsigned j=0;j<visuals;++j){in.u32();in.u32();}if(source==bird.bits && target==victim.bits)return true;}return false;};for(int i=0;i<40 && !burns();++i)original->advance(.25);require(burns(),"Phoenix fire burn fixture missing");auto snapshot=original->encodePhoenixFire(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};require(target->encodePhoenixFire(reverse)==snapshot && target->units().at(ids.at(victim.bits))->life.bits()==victimUnit->life.bits(),"Phoenix fire restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_death_restarts",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto create=[&](const char* type,int x){return vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code(type))),vm.real(real(float(x))),vm.real(real(0)),vm.real(real(0))});};auto hero=create("hfoo",0),bird=create("hphx",300);require(original->units().contains(hero.bits) && original->units().contains(bird.bits),"Death restart fixture missing");require(vm.invoke("UnitAddAbility",std::array{hero,vm.integer(int(ObjectData::code("AOre")))}).bits,"Reincarnation ability missing");vm.invoke("KillUnit",std::array{hero});vm.invoke("KillUnit",std::array{bird});auto u=original->units().at(hero.bits),p=original->units().at(bird.bits);require(u->rebirth && p->phoenixCycle && p->type==ObjectData::code("hpxe"),"Death restart fixture did not start");original->advance(.5);std::uint32_t leveled=0;for(auto& [id,unit]:original->units())if(unit->hero && unit->level>1){leveled=id;break;}require(leveled!=0,"Leveled hero fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeDeathRestarts(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto restored=target->units().at(ids.at(hero.bits)),egg=target->units().at(ids.at(bird.bits));require(target->units().at(ids.at(leveled))->level==original->units().at(leveled)->level && target->units().at(ids.at(leveled))->appliedHeroStats==original->units().at(leveled)->appliedHeroStats,"Leveled hero attributes differ");require(target->encodeDeathRestarts(reverse)==snapshot && restored->rebirth && egg->phoenixCycle && egg->type==ObjectData::code("hpxe") && restored->rebirth->remaining==u->rebirth->remaining && egg->phoenixCycle->remaining==p->phoenixCycle->remaining,"Death restart restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_spirit_split",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),flight=make(),emerged=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto hero=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});require(hero.bits && original->units().contains(hero.bits),"Spirit split fixture unit missing");auto unit=original->units().at(hero.bits);unit->mana=unit->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{hero,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{hero,vm.integer(int(ObjectData::code("ANef")))}).bits && original->castSpell(hero.bits,ObjectData::code("ANef")),"Spirit split order rejected");for(int i=0;i<64 && !unit->spiritSplit;++i)original->advance(1./32);require(unit->spiritSplit && !unit->spiritSplit->emerged && unit->hidden(),"Spirit split flight fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto verify=[&](ScriptSession& target,bool active){auto snapshot=original->encodeSpiritSplits(identity);auto ids=target.restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto parent=target.units().at(ids.at(hero.bits));require(target.encodeSpiritSplits(reverse)==snapshot && parent->spiritSplit && parent->hidden() && parent->spiritSplit->emerged==active,"Spirit split state differs");if(active){size_t children=0;for(auto& member:parent->spiritSplit->members)if(member.unit && target.units().contains(member.unit)){auto child=target.units().at(member.unit);require(child->spiritParent==parent->handle && child->spiritTicket==parent->spiritSplit->ticket,"Spirit split child relation differs");++children;}size_t originalChildren=0;for(auto& member:unit->spiritSplit->members)if(member.unit && original->units().contains(member.unit))++originalChildren;require(originalChildren>0 && children==originalChildren,"Spirit split children differ");}};verify(*flight,false);original->advance(2);require(unit->spiritSplit && unit->spiritSplit->emerged,"Spirit split emerged fixture missing");verify(*emerged,true);require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_mirror_image_delay",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});auto hero=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});require(hero.bits && original->units().contains(hero.bits),"Mirror fixture unit missing");auto unit=original->units().at(hero.bits);unit->mana=unit->maxMana=real(1000);vm.invoke("SetUnitPathing",std::array{hero,vm.boolean(false)});require(vm.invoke("UnitAddAbility",std::array{hero,vm.integer(int(ObjectData::code("AOmi")))}).bits && vm.invoke("IssueImmediateOrder",std::array{hero,vm.string("mirrorimage")}).bits,"Mirror order rejected");for(int i=0;i<32 && !unit->mirrorImage;++i)original->advance(1./32);require(unit->mirrorImage && unit->hidden() && unit->cast,"Mirror delay fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeMirrorImages(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto restored=target->units().at(ids.at(hero.bits));require(target->encodeMirrorImages(reverse)==snapshot && restored->mirrorImage && restored->hidden() && restored->cast && restored->mirrorImage->ticket==restored->cast->ticket,"Mirror delay restore differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_soul_gem_capture",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Orc08.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Orc08 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Orc08.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(false,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<560;++i)original->advance(.25);auto& vm=original->runtime();auto hero=vm.global("udg_Thrall"),grom=vm.global("udg_Grom");require(original->units().contains(hero.bits) && original->units().contains(grom.bits),"Campaign heroes missing");auto h=original->units().at(hero.bits),g=original->units().at(grom.bits);for(auto& [id,u]:original->units())if(id!=hero.bits)u->paused=true;g->paused=false;h->paused=false;h->mana=h->maxMana=real(1000);vm.invoke("SetUnitInvulnerable",std::array{hero,vm.boolean(true)});vm.invoke("SetUnitInvulnerable",std::array{grom,vm.boolean(false)});vm.invoke("SetPlayerAlliance",std::array{vm.handle("player",0x100000),vm.handle("player",0x100000+g->owner),vm.handle("alliancetype",0),vm.boolean(false)});auto r=[&](float v){return vm.real(real(v));};vm.invoke("SetUnitPosition",std::array{hero,r(0),r(0)});vm.invoke("SetUnitPosition",std::array{grom,r(100),r(0)});vm.invoke("FogEnable",std::array{vm.boolean(false)});vm.invoke("FogMaskEnable",std::array{vm.boolean(false)});std::uint32_t gem=0;for(auto id:h->inventory)if(id && original->items().contains(id) && original->items().at(id)->type==ObjectData::code("gsou"))gem=id;require(gem && original->useItem(hero.bits,gem,grom.bits),"Soul gem use failed");for(int i=0;i<16;++i)original->advance(.25);require(h->soulVictim==grom.bits && g->soulCaptor==hero.bits && g->hidden(),"Soul capture fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeSoulCaptures(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t id){for(auto [old,current]:ids)if(current==id)return old;return 0u;};auto restoredHero=target->units().at(ids.at(hero.bits)),restoredGrom=target->units().at(ids.at(grom.bits));require(target->encodeSoulCaptures(reverse)==snapshot && restoredHero->soulVictim==restoredGrom->handle && restoredGrom->soulCaptor==restoredHero->handle && restoredGrom->hidden() && restoredGrom->paused,"Soul capture restore differs");auto& restoredVm=target->runtime();restoredVm.invoke("UnitRemoveAbility",std::array{restoredVm.handle("unit",restoredGrom->handle),restoredVm.integer(int(ObjectData::code("Asou")))});require(!restoredHero->soulVictim && !restoredGrom->soulCaptor && !restoredGrom->hidden() && !restoredGrom->paused && !restoredGrom->abilities.contains(ObjectData::code("Asou")),"Restored soul was not released");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_presentation",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\HumanX01.w3x"},ArchiveScope::Common);require(bool(mapBytes),"HumanX01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"HumanX01.w3x");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);auto& vm=original->runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)});vm.invoke("EnableUserControl",std::array{vm.boolean(false)});vm.invoke("EnableSelect",std::array{vm.boolean(false),vm.boolean(true)});vm.invoke("ShowInterface",std::array{vm.boolean(false),vm.real(real(8))});vm.invoke("SetCineFilterTexture",std::array{vm.string("ReplaceableTextures\\CameraMasks\\Black_mask.blp")});vm.invoke("SetCineFilterDuration",std::array{vm.real(real(6))});vm.invoke("DisplayCineFilter",std::array{vm.boolean(true)});vm.invoke("ForceCinematicSubtitles",std::array{vm.boolean(true)});vm.invoke("SetCinematicScene",std::array{vm.integer(0),vm.handle("playercolor",0),vm.string("Kael"),vm.string("Continue"),vm.real(real(8)),vm.real(real(5))});vm.invoke("DisplayTimedTextToPlayer",std::array{player,vm.real(real(0)),vm.real(real(0)),vm.real(real(20)),vm.string("Quest message")});vm.invoke("PingMinimapEx",std::array{vm.real(real(128)),vm.real(real(64)),vm.real(real(20)),vm.integer(100),vm.integer(150),vm.integer(200),vm.boolean(false)});original->advance(.25);auto snapshot=original->encodePresentation();auto corrupt=snapshot;corrupt.back()^=1;rejects([&]{target->restorePresentation(corrupt);},"digest");target->restoreRecoveryBundle(original->encodeRecoveryBundle());require(target->encodePresentation()==snapshot,"Presentation snapshot differs");require(!target->userControl() && !target->selectionEnabled() && target->selectionUI() && target->forceCinematicSubtitles() && target->cineFilter().displayed && target->cinematicScene() && target->cinematicScene()->dialogue=="Continue" && target->interfaceAmount()==original->interfaceAmount(),"Restored cinematic controls differ");require(!target->texts().empty() && target->texts().back().text=="Quest message" && !target->minimapPings().empty(),"Restored HUD messages differ");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_text_tags",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\HumanX03.w3x"},ArchiveScope::Common);require(bool(mapBytes),"HumanX03 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"HumanX03.w3x");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<600;++i)original->advance(.25);auto& vm=original->runtime();auto tag=vm.invoke("CreateTextTag"),dead=vm.invoke("CreateTextTag");vm.invoke("SetTextTagText",std::array{tag,vm.string("Recovery"),vm.real(real(.03f))});vm.invoke("SetTextTagPos",std::array{tag,vm.real(real(128)),vm.real(real(-64)),vm.real(real(30))});vm.invoke("SetTextTagVelocity",std::array{tag,vm.real(real(.01f)),vm.real(real(.02f))});vm.invoke("SetTextTagColor",std::array{tag,vm.integer(12),vm.integer(34),vm.integer(56),vm.integer(78)});vm.invoke("SetTextTagPermanent",std::array{tag,vm.boolean(false)});vm.invoke("SetTextTagLifespan",std::array{tag,vm.real(real(10))});vm.invoke("SetTextTagAge",std::array{tag,vm.real(real(2))});vm.invoke("DestroyTextTag",std::array{dead});auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeTextTags(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeTextTags(reverse)==snapshot && ids.contains(dead.bits) && target->textTags().contains(ids.at(tag.bits)) && !target->textTags().contains(ids.at(dead.bits)),"Text tag snapshot differs");auto restored=target->textTags().at(ids.at(tag.bits));require(restored->text=="Recovery" && restored->age==2 && restored->lifespan==10 && restored->color[3]==78 && !restored->permanent,"Restored text tag properties differ");auto& restoredVm=target->runtime();restoredVm.invoke("DestroyTextTag",std::array{restoredVm.handle("texttag",ids.at(tag.bits))});require(!target->textTags().contains(ids.at(tag.bits)),"Restored text tag was not destroyed");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_unit_shared_vision",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\NightElf06.w3m"},ArchiveScope::Common);require(bool(mapBytes),"NightElf06 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"NightElf06.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<600;++i)original->advance(.25);std::uint32_t sharedUnit=0;unsigned viewer=0;for(auto& [id,unit]:original->units())if(!unit->visionPlayers.empty()){sharedUnit=id;viewer=*unit->visionPlayers.begin();break;}require(sharedUnit!=0,"Original shared vision fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto reveal=original->encodeRevealState(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeRevealState(reverse)==reveal && target->units().at(ids.at(sharedUnit))->visionPlayers.contains(viewer),"Shared vision snapshot differs");auto& vm=target->runtime();auto unit=vm.handle("unit",ids.at(sharedUnit)),player=vm.invoke("Player",std::array{vm.integer(viewer)});vm.invoke("UnitShareVision",std::array{unit,player,vm.boolean(false)});require(!target->units().at(unit.bits)->visionPlayers.contains(viewer),"Restored shared vision did not turn off");vm.invoke("UnitShareVision",std::array{unit,player,vm.boolean(true)});require(target->units().at(unit.bits)->visionPlayers.contains(viewer),"Restored shared vision did not turn on");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_blight_growth",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Undead07.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Undead07 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Undead07.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<600;++i)original->advance(.25);size_t count=0;for(auto& [id,unit]:original->units())if(unit->blightAbility)++count;require(count>0,"Original blight growth fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto ambient=original->encodeAmbientPassives(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeAmbientPassives(reverse)==ambient,"Blight growth snapshot differs");for(auto& [id,unit]:original->units())if(unit->blightAbility){auto restored=target->units().at(ids.at(id));require(restored->blightAbility==unit->blightAbility && restored->blightLevel==unit->blightLevel && restored->blightRadius==unit->blightRadius && restored->blightDue==unit->blightDue,"Blight growth state differs");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_spider_attack_visuals",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Undead05.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Undead05 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Undead05.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<840;++i)original->advance(.25);size_t spiderCount=0;for(auto& [id,effect]:original->effects())if(id&0x80000000u)++spiderCount;require(spiderCount>0,"Original spider visual fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto visual=original->encodeSpiderVisuals(identity),effects=original->encodeEffects(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeSpiderVisuals(reverse)==visual && target->encodeEffects(reverse)==effects,"Spider visual snapshot differs");size_t rebuilt=0;for(auto& [id,effect]:target->effects())if(id&0x80000000u)++rebuilt;require(rebuilt==spiderCount,"Spider visual count differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_equipment_visual_ownership",[&]{
        Archives archives(argv[1]);auto mapBytes=archives.readCandidates({"Maps\\Campaign\\Undead01.w3m"},ArchiveScope::Common);require(bool(mapBytes),"Undead01 map missing");archives.mountMap(std::make_shared<const Bytes>(mapBytes->bytes),"Undead01.w3m");auto make=[&]{auto scene=World::read(archives);auto info=scene->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(Module::compile(Program::read(archives)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(scene));session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();for(int i=0;i<120;++i)original->advance(.25);std::uint32_t weaponUnit=0,weaponAbility=0,weaponEffect=0;for(auto& [id,unit]:original->units())for(auto& [ability,visuals]:unit->weaponVisuals)if(!visuals.empty() && !weaponEffect){weaponUnit=id;weaponAbility=ability;weaponEffect=visuals.front();}require(weaponEffect && original->effects().contains(weaponEffect),"Original equipment visual fixture missing");auto& a=original->runtime();auto owner=a.invoke("Player",std::array{a.integer(0)});auto actor=a.invoke("CreateUnit",std::array{owner,a.integer(int(ObjectData::code("hfoo"))),a.real(real(0)),a.real(real(0)),a.real(real(0))});auto water=a.invoke("AddSpecialEffectTarget",std::array{a.string("Abilities\\Spells\\Items\\AIfb\\AIfbTarget.mdl"),actor,a.string("origin")});require(actor.bits && water.bits && original->effects().contains(water.bits),"Restoration visual fixture missing");auto waterVisual=original->effects().at(water.bits);waterVisual->groundAnchor=true;waterVisual->moonWellWaterHeight=12.f;original->units().at(actor.bits)->moonWellWaterEffect=water.bits;auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeEffects(identity);auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto restoredUnit=target->units().at(ids.at(weaponUnit)),restoredActor=target->units().at(ids.at(actor.bits));require(restoredUnit->weaponEffectMask==original->units().at(weaponUnit)->weaponEffectMask && restoredUnit->weaponVisuals.contains(weaponAbility) && restoredUnit->weaponVisuals.at(weaponAbility).front()==ids.at(weaponEffect) && target->effects().contains(ids.at(weaponEffect)),"Equipment visual ownership differs");require(restoredActor->moonWellWaterEffect==ids.at(water.bits) && target->effects().at(ids.at(water.bits))->moonWellWaterHeight==std::optional<float>(12.f),"Restoration visual ownership differs");auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeEffects(reverse)==snapshot,"Equipment visual snapshot differs");auto effect=target->effects().at(ids.at(weaponEffect));target->runtime().invoke("RemoveUnit",std::array{target->runtime().handle("unit",ids.at(weaponUnit))});require(effect->destroyed.has_value() && restoredUnit->weaponVisuals.empty(),"Recovered equipment visual was not retired");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_weather",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 rect area = Rect(-500., -400., 500., 400.)
 weathereffect initial = AddWeatherEffect(area, 'SNls')
 weathereffect other = null
 weathereffect retired = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 call EnableWeatherEffect(initial, true)
 set other = AddWeatherEffect(area, 'SNls')
 set retired = AddWeatherEffect(area, 'SNls')
 call RemoveWeatherEffect(retired)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"weather.j",source,"weather recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();auto& a=original->runtime();auto& b=target->runtime();auto initialTarget=b.global("initial").bits;require(target->weatherEffects().contains(initialTarget),"Weather global initializer missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeWeather(identity),damaged=snapshot;damaged.back()^=1;rejects([&]{target->rebuildWeather(damaged);},"digest");require(target->weatherEffects().contains(initialTarget),"Rejected weather changed target");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto initial=b.global("initial").bits,other=b.global("other").bits;require(initial==ids.at(a.global("initial").bits) && initial!=initialTarget && b.global("retired").bits==ids.at(a.global("retired").bits),"Weather identities differ");auto active=target->weatherEffects().at(initial),inactive=target->weatherEffects().at(other);require(active->type==ObjectData::code("SNls") && active->enabled && !inactive->enabled && active->region.minX.bits()==real(-500).bits() && active->region.minY.bits()==real(-400).bits() && active->region.maxX.bits()==real(500).bits() && active->region.maxY.bits()==real(400).bits() && active->definition==original->weatherEffects().at(a.global("initial").bits)->definition,"Weather state differs");auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeWeather(reverse)==snapshot,"Weather snapshot differs");b.invoke("EnableWeatherEffect",std::array{b.global("other"),b.boolean(true)});require(target->weatherEffects().at(other)->enabled,"Recovered weather did not accept updates");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_preserves_retired_spatial_and_sound_references",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 unit actor = null
 unit rangeTarget = null
 region area = null
 rect bounds = null
 trigger regionTrigger = null
 trigger rangeTrigger = null
 event regionEvent = null
 event rangeEvent = null
 sound clip = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set actor = CreateUnit(Player(0), 'hfoo', 0., 0., 0.)
 set rangeTarget = CreateUnit(Player(0), 'hfoo', 300., 0., 0.)
 set area = CreateRegion()
 set bounds = Rect(-200., -200., 200., 200.)
 call RegionAddRect(area, bounds)
 set regionTrigger = CreateTrigger()
 set rangeTrigger = CreateTrigger()
 set regionEvent = TriggerRegisterLeaveRegion(regionTrigger, area, null)
 set rangeEvent = TriggerRegisterUnitInRange(rangeTrigger, rangeTarget, 200., null)
 set clip = CreateSound("Sound\\Interface\\QuestCompleted.wav", false, false, false, 0, 0, "")
 call AttachSoundToUnit(clip, actor)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"retired-references.j",source,"retired references recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->audioSimulationClock();session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();original->advance(1./32);auto& a=original->runtime();a.invoke("RemoveRegion",std::array{a.global("area")});a.invoke("RemoveUnit",std::array{a.global("actor")});a.invoke("RemoveUnit",std::array{a.global("rangeTarget")});auto identity=[](std::string_view,std::uint32_t id){return id;};auto spatial=original->encodeSpatialEvents(identity),sounds=original->encodeSounds(identity);target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& b=target->runtime();require(b.global("area").bits==ids.at(a.global("area").bits) && b.global("actor").bits==ids.at(a.global("actor").bits) && b.global("regionEvent").bits==ids.at(a.global("regionEvent").bits) && b.global("rangeEvent").bits==ids.at(a.global("rangeEvent").bits),"Retired reference identities differ");auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeSpatialEvents(reverse)==spatial && target->encodeSounds(reverse)==sounds,"Retired spatial or sound references differ");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_trackables",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 trackable marker = null
 trackable other = null
 trackable seen = null
 trigger hitTrigger = null
 trigger trackTrigger = null
 event hitEvent = null
 event trackEvent = null
 hashtable table = null
 integer hitCount = 0
 integer trackCount = 0
 endglobals
 function onHit takes nothing returns nothing
 set hitCount = hitCount + 1
 set seen = GetTriggeringTrackable()
 endfunction
 function onTrack takes nothing returns nothing
 set trackCount = trackCount + 1
 set seen = GetTriggeringTrackable()
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set marker = CreateTrackable("marker.mdx", 123., -456., 90.)
 set other = CreateTrackable("other.mdx", -30., 40., 180.)
 set hitTrigger = CreateTrigger()
 set trackTrigger = CreateTrigger()
 set hitEvent = TriggerRegisterTrackableHitEvent(hitTrigger, marker)
 set trackEvent = TriggerRegisterTrackableTrackEvent(trackTrigger, marker)
 call TriggerAddAction(hitTrigger, function onHit)
 call TriggerAddAction(trackTrigger, function onTrack)
 set table = InitHashtable()
 call SaveTrackableHandle(table, 0, 1, marker)
 call SaveTriggerEventHandle(table, 0, 2, hitEvent)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"trackable.j",source,"trackable recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();auto& a=original->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeTrackables(identity),damaged=snapshot;damaged.back()^=1;rejects([&]{target->rebuildTrackables(damaged);},"digest");require(target->trackables().empty(),"Rejected trackable changed target");target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& b=target->runtime();auto marker=b.global("marker").bits;require(marker==ids.at(a.global("marker").bits) && marker!=a.global("marker").bits && b.global("hitEvent").bits==ids.at(a.global("hitEvent").bits) && b.global("trackEvent").bits==ids.at(a.global("trackEvent").bits),"Trackable identities differ");auto state=target->trackables().at(marker);require(state->model=="marker.mdx" && state->x==123.f && state->y==-456.f && state->facing==90.f,"Trackable state differs");auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeTrackables(reverse)==snapshot,"Trackable snapshot differs");auto table=b.global("table");require(b.invoke("LoadTrackableHandle",std::array{table,b.integer(0),b.integer(1)}).bits==marker && b.invoke("LoadTriggerEventHandle",std::array{table,b.integer(0),b.integer(2)}).bits==b.global("hitEvent").bits,"Trackable table references differ");for(auto* session:{original.get(),target.get()}){auto& vm=session->runtime();session->trackableEvent(vm.global("other").bits,true);require(!vm.global("hitCount").bits,"Unregistered trackable fired");session->trackableEvent(vm.global("marker").bits,true);session->trackableEvent(vm.global("marker").bits,false);require(vm.global("hitCount").bits==1 && vm.global("trackCount").bits==1 && vm.global("seen").bits==vm.global("marker").bits,"Trackable event context differs");vm.invoke("DestroyTrigger",std::array{vm.global("hitTrigger")});session->trackableEvent(vm.global("marker").bits,true);require(vm.global("hitCount").bits==1,"Destroyed trackable trigger fired");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_multiboards",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 multiboard board = null
 multiboard retired = null
 multiboarditem cell = null
 multiboarditem alias = null
 multiboarditem stale = null
 multiboarditem released = null
 multiboarditem retiredCell = null
 hashtable table = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set board = CreateMultiboard()
 call MultiboardSetRowCount(board, 2)
 call MultiboardSetColumnCount(board, 2)
 call MultiboardSetTitleText(board, "Score")
 call MultiboardSetTitleTextColor(board, 1, 2, 3, 4)
 call MultiboardSetItemsValue(board, "Default")
 call MultiboardSetItemsWidth(board, 0.25)
 call MultiboardSetItemsIcon(board, "icon.blp")
 set cell = MultiboardGetItem(board, 0, 0)
 set alias = MultiboardGetItem(board, 0, 0)
 set stale = MultiboardGetItem(board, 1, 1)
 set released = MultiboardGetItem(board, 0, 1)
 call MultiboardSetItemValue(cell, "First")
 call MultiboardSetItemStyle(cell, true, true)
 call MultiboardSetItemValueColor(cell, 5, 6, 7, 8)
 call MultiboardReleaseItem(released)
 call MultiboardSetRowCount(board, 1)
 call MultiboardDisplay(board, true)
 call MultiboardMinimize(board, true)
 call MultiboardSuppressDisplay(true)
 set retired = CreateMultiboard()
 call MultiboardSetRowCount(retired, 1)
 call MultiboardSetColumnCount(retired, 1)
 set retiredCell = MultiboardGetItem(retired, 0, 0)
 call DestroyMultiboard(retired)
 set table = InitHashtable()
 call SaveMultiboardHandle(table, 0, 1, board)
 call SaveMultiboardItemHandle(table, 0, 2, stale)
 call SaveMultiboardItemHandle(table, 0, 3, released)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"multiboard.j",source,"multiboard recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();auto& a=original->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeMultiboards(identity),damaged=snapshot;damaged.back()^=1;rejects([&]{target->rebuildMultiboards(damaged);},"digest");require(target->multiboards().empty() && !target->multiboardsSuppressed(),"Rejected multiboard changed target");target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& b=target->runtime();auto boardId=b.global("board").bits;require(boardId==ids.at(a.global("board").bits) && boardId!=a.global("board").bits && b.global("retiredCell").bits==ids.at(a.global("retiredCell").bits),"Multiboard identities differ");auto board=target->multiboards().at(boardId);require(target->multiboardsSuppressed() && board->visible && board->minimized && board->minimizeRevision==1 && board->title=="Score" && board->titleColor==0x04010203u && board->rows==1 && board->columns==2 && board->cells.size()==2 && board->handles.size()==3,"Multiboard presentation differs");require(board->defaults.value=="Default" && board->defaults.width==.25f && board->defaults.icon=="icon.blp" && board->cells[0]->value=="First" && board->cells[0]->showIcon && board->cells[0]->color==0x08050607u && board->cells[1]->value=="Default","Multiboard cells differ");auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeMultiboards(reverse)==snapshot,"Multiboard snapshot differs");auto table=b.global("table");require(b.invoke("LoadMultiboardHandle",std::array{table,b.integer(0),b.integer(1)}).bits==boardId && b.invoke("LoadMultiboardItemHandle",std::array{table,b.integer(0),b.integer(2)}).bits==b.global("stale").bits && b.invoke("LoadMultiboardItemHandle",std::array{table,b.integer(0),b.integer(3)}).bits==b.global("released").bits,"Multiboard table references differ");b.invoke("MultiboardSetItemValue",std::array{b.global("alias"),b.string("Changed")});b.invoke("MultiboardSetItemValue",std::array{b.global("stale"),b.string("Invalid")});require(board->cells[0]->value=="Changed" && board->cells[1]->value=="Default","Recovered multiboard item aliases differ");b.invoke("MultiboardReleaseItem",std::array{b.global("cell")});require(board->handles.size()==2,"Multiboard item release failed");b.invoke("DestroyMultiboard",std::array{b.global("board")});require(target->multiboards().empty() && !target->liveObjects(NativeKind::MultiboardItem),"Multiboard destruction retained items");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_leaderboards",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 leaderboard board = null
 leaderboard retired = null
 hashtable table = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set board = CreateLeaderboard()
 call LeaderboardSetLabel(board, "Status")
 call LeaderboardSetLabelColor(board, 1, 2, 3, 4)
 call LeaderboardSetValueColor(board, 5, 6, 7, 8)
 call LeaderboardSetStyle(board, true, true, false, true)
 call LeaderboardSetSizeByItemCount(board, 3)
 call LeaderboardAddItem(board, "Alpha", -3, Player(0))
 call LeaderboardAddItem(board, "Beta", 8, Player(1))
 call LeaderboardSetItemStyle(board, 0, true, false, true)
 call LeaderboardSetItemValueColor(board, 1, 9, 10, 11, 12)
 call LeaderboardDisplay(board, true)
 call PlayerSetLeaderboard(Player(0), board)
 call PlayerSetLeaderboard(Player(1), board)
 set retired = CreateLeaderboard()
 call DestroyLeaderboard(retired)
 set table = InitHashtable()
 call SaveLeaderboardHandle(table, 0, 1, board)
 call SaveLeaderboardHandle(table, 0, 2, retired)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"leaderboard.j",source,"leaderboard recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();auto& a=original->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeLeaderboards(identity),damaged=snapshot;damaged.back()^=1;rejects([&]{target->rebuildLeaderboards(damaged);},"digest");require(!target->leaderboard(0) && !target->liveObjects(NativeKind::Leaderboard),"Rejected leaderboard changed target");target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& b=target->runtime();auto id=b.global("board").bits;require(id==ids.at(a.global("board").bits) && id!=a.global("board").bits && b.global("retired").bits==ids.at(a.global("retired").bits),"Leaderboard identities differ");auto board=target->leaderboard(0);require(board && board==target->leaderboard(1) && board->visible && board->label=="Status" && board->labelColor==0x04010203u && board->valueColor==0x08050607u && board->showLabel && board->showNames && !board->showValues && board->showIcons && board->sizeCount==3 && board->items.size()==2,"Leaderboard display state differs");require(board->items[0].label=="Alpha" && board->items[0].value==-3 && board->items[0].player==0 && !board->items[0].showValue && board->items[1].label=="Beta" && board->items[1].value==8 && board->items[1].valueColor==0x0c090a0bu,"Leaderboard rows differ");auto reverse=[&](std::string_view,std::uint32_t value){for(auto [from,to]:ids)if(to==value)return from;return 0u;};require(target->encodeLeaderboards(reverse)==snapshot,"Leaderboard snapshot differs");auto table=b.global("table");require(b.invoke("LoadLeaderboardHandle",std::array{table,b.integer(0),b.integer(1)}).bits==id && b.invoke("LoadLeaderboardHandle",std::array{table,b.integer(0),b.integer(2)}).bits==b.global("retired").bits,"Leaderboard table references differ");b.invoke("LeaderboardSetItemValue",std::array{b.global("board"),b.integer(0),b.integer(12)});require(target->leaderboard(0)->items[0].value==12,"Recovered leaderboard did not accept updates");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_script_dialogs",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 dialog window = null
 dialog retired = null
 button choice = null
 button quitButton = null
 button oldButton = null
 defeatcondition defeat = null
 trigger dialogTrigger = null
 trigger buttonTrigger = null
 event dialogEvent = null
 event buttonEvent = null
 event retiredEvent = null
 hashtable table = null
 integer hits = 0
 dialog clickedDialog = null
 button clickedButton = null
 player clickedPlayer = null
 endglobals
 function dialogAction takes nothing returns nothing
 set hits = hits + 1
 set clickedDialog = GetClickedDialog()
 set clickedButton = GetClickedButton()
 set clickedPlayer = GetTriggerPlayer()
 endfunction
 function buttonAction takes nothing returns nothing
 set hits = hits + 10
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set window = DialogCreate()
 call DialogSetMessage(window, "Choose")
 set choice = DialogAddButton(window, "Continue", 67)
 set quitButton = DialogAddQuitButton(window, true, "Quit", 81)
 call DialogDisplay(Player(0), window, true)
 set dialogTrigger = CreateTrigger()
 set buttonTrigger = CreateTrigger()
 set retired = DialogCreate()
 set oldButton = DialogAddButton(retired, "Old", 0)
 set retiredEvent = TriggerRegisterDialogButtonEvent(buttonTrigger, oldButton)
 call DialogDestroy(retired)
 set defeat = CreateDefeatCondition()
 call DefeatConditionSetDescription(defeat, "Protect the base")
 set dialogEvent = TriggerRegisterDialogEvent(dialogTrigger, window)
 set buttonEvent = TriggerRegisterDialogButtonEvent(buttonTrigger, choice)
 call TriggerAddAction(dialogTrigger, function dialogAction)
 call TriggerAddAction(buttonTrigger, function buttonAction)
 set table = InitHashtable()
 call SaveDialogHandle(table, 0, 1, window)
 call SaveButtonHandle(table, 0, 2, choice)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"script-dialog.j",source,"dialog recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();auto& a=original->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto snapshot=original->encodeScriptDialogs(identity),damaged=snapshot;damaged.back()^=1;rejects([&]{target->rebuildScriptDialogs(damaged);},"digest");require(target->dialogs().empty() && target->buttons().empty(),"Rejected dialog snapshot changed target");target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& b=target->runtime();auto window=b.global("window").bits,choice=b.global("choice").bits;require(window!=a.global("window").bits && window==ids.at(a.global("window").bits) && b.global("oldButton").bits==ids.at(a.global("oldButton").bits) && b.global("retiredEvent").bits==ids.at(a.global("retiredEvent").bits),"Dialog identities differ");auto dialog=target->dialogs().at(window);require(dialog->message=="Choose" && dialog->owners==1 && dialog->buttons.size()==2 && dialog->buttons[0]==choice && target->buttons().at(choice)->text=="Continue" && target->buttons().at(dialog->buttons[1])->quit && target->buttons().at(dialog->buttons[1])->scores && target->defeatConditions().at(b.global("defeat").bits)->description=="Protect the base","Dialog state differs");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [from,to]:ids)if(to==id)return from;return 0u;};require(target->encodeScriptDialogs(reverse)==snapshot,"Dialog snapshot differs");require(b.invoke("LoadDialogHandle",std::array{b.global("table"),b.integer(0),b.integer(1)}).bits==window && b.invoke("LoadButtonHandle",std::array{b.global("table"),b.integer(0),b.integer(2)}).bits==choice,"Dialog table references differ");for(auto* session:{original.get(),target.get()}){auto& vm=session->runtime();require(session->clickDialog(0,vm.global("choice").bits),"Dialog click rejected");require(vm.global("hits").bits==11 && vm.global("clickedDialog").bits==vm.global("window").bits && vm.global("clickedButton").bits==vm.global("choice").bits && vm.global("clickedPlayer").bits==vm.invoke("Player",std::array{vm.integer(0)}).bits,"Dialog event context differs");require(!session->clickDialog(0,vm.global("choice").bits),"Hidden dialog accepted click");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_chat_events",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 trigger exactTrigger = null
 trigger containsTrigger = null
 event exactEvent = null
 event containsEvent = null
 hashtable table = null
 integer exactHits = 0
 integer containsHits = 0
 string lastMessage = null
 string lastMatch = null
 player lastPlayer = null
 endglobals
 function exactAction takes nothing returns nothing
 set exactHits = exactHits + 1
 endfunction
 function containsAction takes nothing returns nothing
 set containsHits = containsHits + 1
 set lastMessage = GetEventPlayerChatString()
 set lastMatch = GetEventPlayerChatStringMatched()
 set lastPlayer = GetTriggerPlayer()
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set exactTrigger = CreateTrigger()
 set containsTrigger = CreateTrigger()
 set exactEvent = TriggerRegisterPlayerChatEvent(exactTrigger, Player(0), "-go", true)
 set containsEvent = TriggerRegisterPlayerChatEvent(containsTrigger, Player(0), "go", false)
 call TriggerAddAction(exactTrigger, function exactAction)
 call TriggerAddAction(containsTrigger, function containsAction)
 set table = InitHashtable()
 call SaveTriggerEventHandle(table, 0, 1, exactEvent)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"chat-event.j",source,"chat event recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& a=original->runtime();auto& b=target->runtime();require(b.global("exactEvent").bits==ids.at(a.global("exactEvent").bits) && b.global("containsEvent").bits==ids.at(a.global("containsEvent").bits),"Chat event identity differs");require(b.invoke("LoadTriggerEventHandle",std::array{b.global("table"),b.integer(0),b.integer(1)}).bits==b.global("exactEvent").bits,"Chat event table reference differs");for(auto* session:{original.get(),target.get()}){auto& vm=session->runtime();session->chat(1,"-go");require(!vm.global("exactHits").bits && !vm.global("containsHits").bits,"Chat event ignored player");session->chat(0,"-go");require(vm.global("exactHits").bits==1 && vm.global("containsHits").bits==1,"Chat event did not fire");require(*vm.global("lastMessage").text=="-go" && *vm.global("lastMatch").text=="go" && vm.global("lastPlayer").bits==vm.invoke("Player",std::array{vm.integer(0)}).bits,"Chat context differs");session->chat(0,"let go");require(vm.global("exactHits").bits==1 && vm.global("containsHits").bits==2,"Chat match mode differs");vm.invoke("DestroyTrigger",std::array{vm.global("containsTrigger")});session->chat(0,"go");require(vm.global("containsHits").bits==2,"Destroyed chat trigger still fired");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_variable_events",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 real watched = 0.
 integer hits = 0
 trigger first = null
 trigger second = null
 event firstEvent = null
 event secondEvent = null
 endglobals
 function hit takes nothing returns nothing
 set hits = hits + 1
 endfunction
 function setWatched takes real value returns nothing
 set watched = value
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set first = CreateTrigger()
 set second = CreateTrigger()
 set firstEvent = TriggerRegisterVariableEvent(first, "watched", GREATER_THAN, 1.)
 set secondEvent = TriggerRegisterVariableEvent(second, "watched", GREATER_THAN, 1.)
 call TriggerAddAction(first, function hit)
 call TriggerAddAction(second, function hit)
 call setWatched(2.)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"variable-event.j",source,"variable event recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& a=original->runtime();auto& b=target->runtime();require(b.global("hits").bits==2 && b.global("firstEvent").bits==ids.at(a.global("firstEvent").bits) && b.global("secondEvent").bits==ids.at(a.global("secondEvent").bits),"Variable event state or identity differs");for(auto* vm:{&a,&b}){vm->invoke("setWatched",std::array{vm->real(real(3))});require(vm->global("hits").bits==2,"Matched variable event fired again");vm->invoke("setWatched",std::array{vm->real(real(0))});vm->invoke("setWatched",std::array{vm->real(real(2))});require(vm->global("hits").bits==4,"Variable event did not fire after crossing");vm->invoke("DestroyTrigger",std::array{vm->global("first")});vm->invoke("setWatched",std::array{vm->real(real(0))});vm->invoke("setWatched",std::array{vm->real(real(2))});require(vm->global("hits").bits==5,"Destroyed variable trigger still fired");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_game_state_events",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 trigger clockTrigger = null
 trigger integerTrigger = null
 event clockEvent = null
 event integerEvent = null
 integer clockHits = 0
 integer integerHits = 0
 endglobals
 function clockAction takes nothing returns nothing
 set clockHits = clockHits + 1
 endfunction
 function integerAction takes nothing returns nothing
 set integerHits = integerHits + 1
 endfunction
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 call SetFloatGameState(GAME_STATE_TIME_OF_DAY, 5.)
 call SetIntegerGameState(GAME_STATE_DIVINE_INTERVENTION, 3)
 set clockTrigger = CreateTrigger()
 set clockEvent = TriggerRegisterGameStateEvent(clockTrigger, GAME_STATE_TIME_OF_DAY, GREATER_THAN_OR_EQUAL, 6.)
 call TriggerAddAction(clockTrigger, function clockAction)
 set integerTrigger = CreateTrigger()
 set integerEvent = TriggerRegisterGameStateEvent(integerTrigger, GAME_STATE_DIVINE_INTERVENTION, GREATER_THAN_OR_EQUAL, 5.)
 call TriggerAddAction(integerTrigger, function integerAction)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"game-state-event.j",source,"game state recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& a=original->runtime();auto& b=target->runtime();require(b.global("clockEvent").bits==ids.at(a.global("clockEvent").bits) && b.global("integerEvent").bits==ids.at(a.global("integerEvent").bits),"Game state event handles differ");require(b.invoke("GetIntegerGameState",std::array{b.global("GAME_STATE_DIVINE_INTERVENTION")}).bits==3,"Integer game state differs");for(auto* vm:{&a,&b}){vm->invoke("SetFloatGameState",std::array{vm->global("GAME_STATE_TIME_OF_DAY"),vm->real(real(7))});vm->invoke("SetIntegerGameState",std::array{vm->global("GAME_STATE_DIVINE_INTERVENTION"),vm->integer(6)});require(vm->global("clockHits").bits==1 && vm->global("integerHits").bits==1,"Recovered game state event did not fire");vm->invoke("SetIntegerGameState",std::array{vm->global("GAME_STATE_DIVINE_INTERVENTION"),vm->integer(7)});require(vm->global("integerHits").bits==1,"Integer state event fired twice while matched");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_random_pools",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 unitpool units = null
 itempool items = null
 unitpool retired = null
 hashtable table = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set units = CreateUnitPool()
 call UnitPoolAddUnitType(units, 'hfoo', 1.)
 call UnitPoolAddUnitType(units, 'hrif', 3.)
 call UnitPoolAddUnitType(units, 'hfoo', 0.)
 set items = CreateItemPool()
 call ItemPoolAddItemType(items, 'phea', 1.)
 call ItemPoolAddItemType(items, 'pman', 2.)
 set retired = CreateUnitPool()
 call DestroyUnitPool(retired)
 set table = InitHashtable()
 call SaveUnitPoolHandle(table, 0, 1, units)
 call SaveItemPoolHandle(table, 0, 2, items)
 call SaveUnitPoolHandle(table, 0, 3, retired)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"random-pool.j",source,"random pool recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();auto& a=original->runtime();auto identity=[](std::string_view,std::uint32_t id){return id;};auto pools=original->encodeRandomPools(identity),bad=pools;bad.back()^=1;rejects([&]{target->rebuildRandomPools(bad);},"digest");require(!target->liveObjects(NativeKind::UnitPool) && !target->liveObjects(NativeKind::ItemPool),"Rejected random pools changed target");target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());auto& b=target->runtime();auto old=a.global("units").bits;require(ids.at(old)!=old,"Pool fixture did not shift identity");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [from,to]:ids)if(to==id)return from;return 0u;};require(target->encodeRandomPools(reverse)==pools && b.global("retired").bits==ids.at(a.global("retired").bits),"Random pool snapshot differs");auto table=b.global("table");require(b.invoke("LoadUnitPoolHandle",std::array{table,b.integer(0),b.integer(1)}).bits==b.global("units").bits && b.invoke("LoadItemPoolHandle",std::array{table,b.integer(0),b.integer(2)}).bits==b.global("items").bits && b.invoke("LoadUnitPoolHandle",std::array{table,b.integer(0),b.integer(3)}).bits==b.global("retired").bits,"Random pool table references differ");for(int i=0;i<6;++i){auto unitA=a.invoke("PlaceRandomUnit",std::array{a.global("units"),a.invoke("Player",std::array{a.integer(0)}),a.real(real(float(i*256))),a.real(real(0)),a.real(real(0))});auto unitB=b.invoke("PlaceRandomUnit",std::array{b.global("units"),b.invoke("Player",std::array{b.integer(0)}),b.real(real(float(i*256))),b.real(real(0)),b.real(real(0))});require(a.invoke("GetUnitTypeId",std::array{unitA}).bits==b.invoke("GetUnitTypeId",std::array{unitB}).bits,"Random unit pool sequence differs");auto itemA=a.invoke("PlaceRandomItem",std::array{a.global("items"),a.real(real(float(i*256))),a.real(real(256))});auto itemB=b.invoke("PlaceRandomItem",std::array{b.global("items"),b.real(real(float(i*256))),b.real(real(256))});require(a.invoke("GetItemTypeId",std::array{itemA}).bits==b.invoke("GetItemTypeId",std::array{itemB}).bits,"Random item pool sequence differs");}require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_hashtable_object_references",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 timer clock = null
 timerdialog dialog = null
 trigger triggerRef = null
 event eventRef = null
 group groupRef = null
 hashtable table = null
 hashtable nested = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set clock = CreateTimer()
 set dialog = CreateTimerDialog(clock)
 set triggerRef = CreateTrigger()
 set eventRef = TriggerRegisterTimerExpireEvent(triggerRef, clock)
 set groupRef = CreateGroup()
 set table = InitHashtable()
 set nested = InitHashtable()
 call SaveTimerHandle(table, 1, 1, clock)
 call SaveTimerDialogHandle(table, 1, 2, dialog)
 call SaveTriggerHandle(table, 1, 3, triggerRef)
 call SaveTriggerEventHandle(table, 1, 4, eventRef)
 call SaveGroupHandle(table, 1, 5, groupRef)
 call SaveHashtableHandle(table, 1, 6, nested)
 call SaveHashtableHandle(nested, 1, 1, table)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"bundle-hashtable.j",source,"bundle hashtable references"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(original->encodeRecoveryBundle());require(ids.at(original->runtime().global("clock").bits)!=original->runtime().global("clock").bits,"Hashtable fixture did not shift timer identity");auto& vm=target->runtime();auto table=vm.global("table");const char* load[]={"LoadTimerHandle","LoadTimerDialogHandle","LoadTriggerHandle","LoadTriggerEventHandle","LoadGroupHandle","LoadHashtableHandle"};const char* globals[]={"clock","dialog","triggerRef","eventRef","groupRef","nested"};for(unsigned i=0;i<6;++i){auto old=original->runtime().global(globals[i]).bits;require(ids.contains(old) && vm.invoke(load[i],std::array{table,vm.integer(1),vm.integer(int(i+1))}).bits==ids.at(old),"Restored hashtable object reference differs");}require(vm.invoke("LoadHashtableHandle",std::array{vm.global("nested"),vm.integer(1),vm.integer(1)}).bits==table.bits,"Restored hashtable cycle differs");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_timer_dialogs",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(globals
 timer clock = null
 timerdialog display = null
 timerdialog removed = null
 endglobals
 function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 set clock = CreateTimer()
 call TimerStart(clock, 100., false, null)
 set display = CreateTimerDialog(clock)
 call TimerDialogSetTitle(display, "Remaining")
 call TimerDialogSetTitleColor(display, 1, 2, 3, 4)
 call TimerDialogSetTimeColor(display, 5, 6, 7, 8)
 call TimerDialogSetSpeed(display, 2.)
 call TimerDialogDisplay(display, true)
 set removed = CreateTimerDialog(clock)
 call DestroyTimerDialog(removed)
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"timer-dialog.j",source,"timer dialog recovery"}}));auto session=std::make_unique<ScriptSession>(std::move(module),map().info);session->attachWorld(world());session->audioMuted(true);session->configure();PlayerSetup setup(map().info,session->config());session->applySetup(setup);return session;};auto original=make(),target=make();original->startMain();original->advance(2);auto old=original->runtime().global("display").bits,removed=original->runtime().global("removed").bits,timer=original->runtime().global("clock").bits;auto wire=original->encodeRecoveryBundle();target->runtime().invoke("CreateTimer");auto ids=target->restoreRecoveryBundle(wire);require(ids.contains(old) && ids.contains(removed) && ids.contains(timer) && ids.at(old)!=old,"Timer dialog identities not rebuilt");auto dialog=target->timerDialogs().at(ids.at(old));require(dialog->timer==ids.at(timer) && dialog->title=="Remaining" && dialog->titleColor==std::array<std::uint8_t,4>{1,2,3,4} && dialog->timeColor==std::array<std::uint8_t,4>{5,6,7,8} && dialog->displayed && dialog->speed==2 && target->runtime().global("removed").bits==ids.at(removed),"Timer dialog state differs");require(target->timerDialogRemaining(*dialog)==original->timerDialogRemaining(*original->timerDialogs().at(old)),"Timer dialog remaining differs");auto identity=[](std::string_view,std::uint32_t id){return id;};auto reverse=[&](std::string_view,std::uint32_t id){for(auto [from,to]:ids)if(to==id)return from;return 0u;};require(original->encodeTimerDialogs(identity)==target->encodeTimerDialogs(reverse),"Timer dialog snapshot differs");auto& vm=original->runtime();vm.invoke("TimerDialogSetRealTimeRemaining",std::array{vm.global("display"),vm.real(real(30))});auto realtime=original->encodeRecoveryBundle();auto realtimeTarget=make();auto realtimeIds=realtimeTarget->restoreRecoveryBundle(realtime);auto recovered=realtimeTarget->timerDialogs().at(realtimeIds.at(old));require(recovered->realTime && realtimeTarget->timerDialogRemaining(*recovered)>59 && realtimeTarget->timerDialogRemaining(*recovered)<=60,"Timer dialog real time differs");rejects([&]{target->startMain();},"recovery is incomplete");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_preserves_ai_link_order",[&]{
        auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");std::string source=R"jass(function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 call StartMeleeAI(Player(1),"human.ai")
 call StartMeleeAI(Player(0),"orc.ai")
 endfunction
 )jass";auto make=[&]{auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"two-ai.j",source,"two AI recovery"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=make(),target=make();original->startMain();require(original->ais()[0] && original->ais()[1],"Two source AI instances missing");auto saved=original->encodeRecoveryBundle();auto ids=target->restoreRecoveryBundle(saved);require(target->ais()[0] && target->ais()[1],"Two recovered AI instances missing");auto identity=[](std::string_view,std::uint32_t id){return id;};auto reverse=[&](std::string_view type,std::uint32_t id){if(!id || id<0x100000u || (type=="player" && id<0x100010u))return id;for(auto [old,current]:ids)if(current==id)return old;return 0u;};for(unsigned owner:{0u,1u})require(original->encodeAIState(owner,identity)==target->encodeAIState(owner,reverse) && original->ais()[owner]->runtime->encodeGlobals(identity)==target->ais()[owner]->runtime->encodeGlobals(reverse),"Recovered AI state differs");std::array<Runtime*,3> src{&original->runtime(),original->ais()[1]->runtime.get(),original->ais()[0]->runtime.get()},dst{&target->runtime(),target->ais()[1]->runtime.get(),target->ais()[0]->runtime.get()};require(original->encodeSharedSleepingScripts(src,original->snapshotSharedSleepingScripts(src,identity))==target->encodeSharedSleepingScripts(dst,target->snapshotSharedSleepingScripts(dst,reverse)),"Recovered AI thread order differs");rejects([&]{target->startMain();},"recovery is incomplete");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("recovery_bundle_restores_active_ai",[&]{
        std::string source=R"jass(function config takes nothing returns nothing
 endfunction
 function main takes nothing returns nothing
 call StartMeleeAI(Player(0),"human.ai")
 endfunction
 )jass";auto common=testArchives->readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Common source missing");auto module=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"recovery-ai.j",source,"AI recovery"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.audioMuted(true);session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();require(bool(session.ais()[0]),"Source AI did not start");auto& ai=*session.ais()[0];auto& mapVm=session.runtime();auto owner=mapVm.invoke("Player",std::array{mapVm.integer(0)});auto spawn=[&](int x){return mapVm.invoke("CreateUnit",std::array{owner,mapVm.integer(int(ObjectData::code("hfoo"))),mapVm.real(real(float(x))),mapVm.real(real(0)),mapVm.real(real(0))}).bits;};auto first=spawn(0),second=spawn(256);ai.gathering=false;ai.retreating=true;ai.homeOverride=true;ai.policies[ScriptAI::HeroesBuy]=true;ai.towns={first,second};ai.harvesting[3]={2,5};ai.lumberAssignments[first]={1,17};ai.assault[ObjectData::code("hfoo")]=4;ai.defenders[ObjectData::code("hrif")]=2;ai.captain.insert(first);ai.defenderUnits.insert(second);ai.guardUnits.insert(first);ai.suicideUnits[second]=7;ai.retreatPassengers[first]={second,4,5,{real(16),real(32)},true};ai.guards[2]={ObjectData::code("hfoo"),first,{real(40),real(50)},3,true,false};ai.guardTicket=3;ai.fillGuards=true;ai.replacementCount=-1;ai.townSpot=WorldPoint{real(70),real(80)};ai.zeppelinPurchase=AIZeppelinPurchase{first,second,12.,9};ai.itemPurchase=AIItemPurchase{second,first,ObjectData::code("phea"),13.,10};AIZeppelinWave wave;wave.ticket=4;wave.destination={real(90),real(100)};wave.deadline=20;wave.departing=true;wave.passengers[first]=second;wave.carriers.insert(second);wave.pickupTickets[second]=6;wave.pickupQueued[first]=7;wave.carrierRevisions[second]=8;wave.returnPoints[second]={real(120),real(130)};ai.zeppelinWave=wave;ai.transportContinuation=AITransportContinuation{{real(90),real(100)},second,true};ai.zeppelinWaveTicket=4;ai.amphibious=true;ai.randomPaths=true;AICaptainRoute route;route.ticket=8;route.points={{real(140),real(150)},{real(160),real(170)}};route.members[first]=1;route.randomPath=true;route.target=second;ai.captainRoute=route;ai.captainRouteTicket=8;ai.commands.emplace_back(-2,9);ai.home={real(10),real(20)};ai.defenseHome={real(30),real(40)};ai.townHome={real(50),real(60)};ai.goal={real(70),real(80)};ai.stage={real(90),real(100)};ai.allianceTarget=first;ai.enemyBase=second;ai.expansion=first;ai.hero=second;ai.enemyBaseSearch=AIEnemyBaseSearch{first,second,12.f};ai.nextTick=4.5;ai.nextItems=8.25;ai.diagnostics.push_back("recovery fixture");ai.heroLevels={ai.runtime->module().typeId("code"),ai.runtime->module().functionId("main")+1,{},ai.runtime.get()};mapVm.invoke("PauseCompAI",std::array{owner,mapVm.boolean(true)});require(ai.runtime->threadsPaused(),"AI pause fixture missing");auto identity=[](std::string_view,std::uint32_t id){return id;};std::array<Runtime*,2> runtimes{&session.runtime(),ai.runtime.get()};auto batch=session.snapshotSharedSleepingScripts(runtimes,identity);require(!batch.threads.empty() && batch.threads.size()==batch.scripts.threads.size(),"Source AI did not yield a contextual thread");auto wire=session.encodeSharedSleepingScripts(runtimes,batch);auto decoded=session.decodeSharedSleepingScripts(runtimes,wire);auto globals=ai.runtime->encodeGlobals(identity);auto strategy=session.encodeAIState(0,identity);Runtime recoveredAI(Module::compile(Program::parse(ai.runtime->module().program().sources())));recoveredAI.initializeFromGlobals(globals,identity);require(decoded.threads.size()==batch.threads.size() && recoveredAI.encodeGlobals(identity)==globals,"Source AI runtime state did not round trip");auto targetModule=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"recovery-ai.j",source,"AI recovery"}}));ScriptSession target(std::move(targetModule),map().info);target.attachWorld(world());target.audioMuted(true);target.configure();PlayerSetup targetSetup(map().info,target.config());target.applySetup(targetSetup);target.restoreSimulationClock(session.encodeSimulationClock());target.restorePlayerConfiguration(session.encodePlayerConfiguration());target.restorePlayerTechnology(session.encodePlayerTechnology());target.restorePlayerStates(session.encodePlayerStates());auto unitIds=session.encodeUnitIdentities(identity),core=session.encodeUnitCore(identity);target.runtime().invoke("CreateTimer");auto units=target.rebuildUnitIdentities(unitIds);require(units.at(first)!=first && units.at(second)!=second,"AI unit mapping fixture did not shift identities");auto decode=[&](std::string_view type,std::uint32_t id){if(type=="unit" && units.contains(id))return units.at(id);return id;};target.prepareUnitCore(core,decode);target.finishUnitCore(core,decode);target.runtime().restoreGlobals(session.runtime().encodeGlobals(identity),decode);auto badGlobals=globals;badGlobals.back()^=1;rejects([&]{target.prepareAIRecovery(0,"human.ai",false,badGlobals,decode);},"digest");require(!target.ais()[0] && !target.runtime().threadCount(),"Rejected AI recovery changed target");auto before=target.runtime().invoke("CreateTimer");target.prepareAIRecovery(0,"human.ai",false,globals,decode);auto after=target.runtime().invoke("CreateTimer");require(after.bits==before.bits+1 && target.ais()[0] && !target.runtime().threadCount(),"AI recovery ran initializer or main");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit")for(auto [old,current]:units)if(current==id)return old;return id;};require(target.ais()[0]->runtime->encodeGlobals(reverse)==globals,"Rebuilt AI global state differs");auto badStrategy=strategy;badStrategy.back()^=1;rejects([&]{target.restoreAIState(0,badStrategy,decode);},"digest");auto wrongAI=[&](std::string_view type,std::uint32_t id){return type=="unit" && id==first?units.at(second):decode(type,id);};rejects([&]{target.restoreAIState(0,strategy,wrongAI);},"mapping");require(target.ais()[0]->towns.empty(),"Rejected AI state changed target");target.restoreAIState(0,strategy,decode);require(target.ais()[0]->heroLevels.codeOwner==target.ais()[0]->runtime.get() && target.encodeAIState(0,reverse)==strategy,"Rebuilt AI strategy state differs");rejects([&]{target.restoreAIState(0,strategy,decode);},"");std::array<Runtime*,2> targetRuntimes{&target.runtime(),target.ais()[0]->runtime.get()};auto restored=target.decodeSharedSleepingScripts(targetRuntimes,wire);target.restoreSharedSleepingScripts(targetRuntimes,restored,decode);require(target.ais()[0]->runtime->threadsPaused(),"Restored AI pause missing");require(target.encodeSharedSleepingScripts(targetRuntimes,target.snapshotSharedSleepingScripts(targetRuntimes,reverse))==wire,"Rebuilt AI sleeping threads differ");target.runtime().invoke("PauseCompAI",std::array{target.runtime().handle("player",owner.bits),target.runtime().boolean(false)});require(!target.ais()[0]->runtime->threadsPaused(),"Restored AI pause depth did not resume");rejects([&]{target.startMain();},"recovery is incomplete");auto full=session.encodeRecoveryBundle();auto integratedModule=Module::compile(Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"recovery-ai.j",source,"AI recovery"}}));ScriptSession integrated(std::move(integratedModule),map().info);integrated.attachWorld(world());integrated.audioMuted(true);integrated.configure();PlayerSetup integratedSetup(map().info,integrated.config());integrated.applySetup(integratedSetup);auto content=openSnapshot(full,256u*1024u*1024u);Bytes broken(content.begin(),content.end());Binary sections(content);sections.expect(tag("SRBF"));sections.u32();snapshotText(sections,64);sections.u32();auto sectionCount=sections.u32();bool changed=false;for(unsigned i=0;i<sectionCount;++i){auto name=snapshotText(sections,64);auto size=sections.u32();auto offset=content.size()-sections.left();if(name=="AIStates"){require(size>64,"AI component fixture missing");broken[offset]^=1;changed=true;}sections.take(size);}require(changed,"AI component not found");auto badBundle=sealSnapshot(std::move(broken),256u*1024u*1024u);rejects([&]{integrated.restoreRecoveryBundle(badBundle);},"digest");require(integrated.configured() && integrated.simulationTime()==0 && integrated.units().empty() && !integrated.ais()[0],"Rejected AI component changed session");auto allIds=integrated.restoreRecoveryBundle(full);require(integrated.ais()[0] && integrated.ais()[0]->runtime->threadsPaused(),"Integrated AI instance or pause missing");auto allReverse=[&](std::string_view type,std::uint32_t id){if(!id || id<0x100000u || (type=="player" && id<0x100010u))return id;for(auto [old,current]:allIds)if(current==id)return old;return 0u;};require(integrated.encodeAIState(0,allReverse)==strategy && integrated.ais()[0]->runtime->encodeGlobals(allReverse)==globals,"Integrated AI state or globals differ");std::array<Runtime*,2> integratedRuntimes{&integrated.runtime(),integrated.ais()[0]->runtime.get()};require(integrated.encodeSharedSleepingScripts(integratedRuntimes,integrated.snapshotSharedSleepingScripts(integratedRuntimes,allReverse))==wire,"Integrated AI threads differ");rejects([&]{integrated.startMain();},"recovery is incomplete");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
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
)jass";auto create=[&]{auto module=Module::compile(Program::parse({{"simulation-clock.j",source,"authored persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create();original->startMain();original->world()->clock().time(real(8));original->world()->clock().scale(real(2));original->world()->clock().temporary(real(0),real(30));original->advance(2.015625);original->gameSpeed(3);original->runtime().bind("Probe",[&](auto& vm,auto){rejects([&]{original->encodeSimulationClock();},"quiescent");return vm.nothing();});original->runtime().invoke("check");original->runtime().start("wait");require(original->runtime().threadCount()==1,"Script did not sleep");original->pause(true);auto clock=original->encodeSimulationClock(),scripts=original->encodeSleepingScripts(original->snapshotSleepingScripts({}));Binary clockData(openSnapshot(clock,192));clockData.expect(tag("SCLK"));require(clockData.u32()==3,"Simulation clock version differs");snapshotU64(clockData);snapshotU64(clockData);clockData.u32();clockData.u32();clockData.take(clockData.u32());auto nextNeutral=std::bit_cast<double>(snapshotU64(clockData));clockData.finish();require(nextNeutral>original->simulationTime() && nextNeutral<=original->simulationTime()+1,"Neutral combat schedule was not sampled");auto neutralContent=openSnapshot(clock,192);Bytes badNeutral(neutralContent.begin(),neutralContent.end());auto invalidDue=std::bit_cast<std::uint64_t>(std::numeric_limits<double>::quiet_NaN());for(unsigned i=0;i<8;++i)badNeutral[badNeutral.size()-8+i]=std::uint8_t(invalidDue>>(8*i));rejects([&]{restored->restoreSimulationClock(sealSnapshot(badNeutral,192));},"Invalid simulation clock");require(restored->simulationTime()==0,"Rejected neutral schedule changed target");auto damaged=clock;damaged.back()^=1;rejects([&]{restored->restoreSimulationClock(damaged);},"digest");auto invalid=[&](double time,double remainder,unsigned paused,unsigned speed){SnapshotWriter out(96);out.u32(tag("SCLK"));out.u32(1);out.u64(std::bit_cast<std::uint64_t>(time));out.u64(std::bit_cast<std::uint64_t>(remainder));out.u32(paused);out.u32(speed);auto bytes=sealSnapshot(out.finish(),96);rejects([&]{restored->restoreSimulationClock(bytes);},"Invalid simulation clock");};invalid(2.1,0,0,2);invalid(2.,1./32,0,2);invalid(2.,0,2,2);invalid(2.,0,0,5);invalid(INFINITY,0,0,2);require(restored->simulationTime()==0 && restored->presentationTime()==0 && !restored->paused(),"Rejected clock changed target");auto malformed=clock;malformed[44]^=1;auto digest=sha256(std::span<const std::uint8_t>(malformed.data(),malformed.size()-64));std::copy(digest.begin(),digest.end(),malformed.end()-64);auto beforeWorld=restored->world()->clock().encodeState();rejects([&]{restored->restoreSimulationClock(malformed);},"rules differ");require(restored->world()->clock().encodeState()==beforeWorld && restored->simulationTime()==0,"Rejected world clock changed session");SnapshotWriter old(96);old.u32(tag("SCLK"));old.u32(1);old.u64(std::bit_cast<std::uint64_t>(2.));old.u64(std::bit_cast<std::uint64_t>(0.));old.u32(0);old.u32(2);auto legacy=create();legacy->restoreSimulationClock(sealSnapshot(old.finish(),96));require(legacy->simulationTime()==2 && legacy->world()->clock().time().bits()==0,"Legacy simulation clock restore differs");auto legacyContent=openSnapshot(clock,192);Bytes previous(legacyContent.begin(),legacyContent.end()-8);previous[4]=2;auto legacy2=create();legacy2->restoreSimulationClock(sealSnapshot(std::move(previous),192));require(legacy2->simulationTime()==original->simulationTime() && legacy2->world()->clock().encodeState()==original->world()->clock().encodeState(),"Version 2 simulation clock restore differs");auto dirty=create();auto& dirtyVm=dirty->runtime();auto dirtyTimer=dirtyVm.invoke("CreateTimer");dirtyVm.invoke("TimerStart",std::array{dirtyTimer,dirtyVm.real(real(1)),dirtyVm.boolean(false),Value{dirtyVm.module().typeId("code"),0}});rejects([&]{dirty->restoreSimulationClock(clock);},"fresh quiescent");require(dirty->simulationTime()==0 && !dirty->paused(),"Timer guard changed target");auto dirtyEvent=create();auto& eventVm=dirtyEvent->runtime();auto eventTimer=eventVm.invoke("CreateTimer"),eventTrigger=eventVm.invoke("CreateTrigger");eventVm.invoke("TriggerRegisterTimerExpireEvent",std::array{eventTrigger,eventTimer});rejects([&]{dirtyEvent->restoreSimulationClock(clock);},"fresh quiescent");restored->restoreSimulationClock(clock);require(restored->encodeSimulationClock()==clock,"Neutral combat schedule did not round trip");require(restored->simulationTime()==2 && restored->presentationTime()==2.015625 && restored->paused() && restored->gameSpeed()==3 && restored->world()->clock().encodeState()==original->world()->clock().encodeState(),"Simulation or world clock did not restore");restored->startMain();restored->restoreSleepingScripts(restored->decodeSleepingScripts(scripts),{});original->advance(1);restored->advance(1);require(original->simulationTime()==2 && restored->simulationTime()==2 && original->runtime().global("completed").bits==0 && restored->runtime().global("completed").bits==0,"Paused restored clock advanced");original->pause(false);restored->pause(false);original->advance(.015625);restored->advance(.015625);require(original->simulationTime()==restored->simulationTime() && original->runtime().global("completed").bits==0 && restored->runtime().global("completed").bits==0,"Clock remainder or early sleep wake differs");original->advance(.09375);restored->advance(.09375);require(original->simulationTime()==restored->simulationTime() && original->world()->clock().encodeState()==restored->world()->clock().encodeState() && original->runtime().global("completed").bits==1 && restored->runtime().global("completed").bits==1,"Restored simulation, world clock and sleeping script diverged");rejects([&]{restored->restoreSimulationClock(clock);},"fresh quiescent");
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
    test("hashtable_snapshot_restores_cross_references_and_handles",[&]{
        auto source=R"jass(type destructable extends handle
type widget extends handle
type unit extends widget
type player extends handle
type hashtable extends handle
native InitHashtable takes nothing returns hashtable
native SaveInteger takes hashtable h, integer p, integer c, integer n returns nothing
native LoadInteger takes hashtable h, integer p, integer c returns integer
native SaveReal takes hashtable h, integer p, integer c, real n returns nothing
native LoadReal takes hashtable h, integer p, integer c returns real
native SaveBoolean takes hashtable h, integer p, integer c, boolean n returns nothing
native LoadBoolean takes hashtable h, integer p, integer c returns boolean
native HaveSavedHandle takes hashtable h, integer p, integer c returns boolean
native SaveStr takes hashtable h, integer p, integer c, string s returns boolean
native LoadStr takes hashtable h, integer p, integer c returns string
native SaveHashtableHandle takes hashtable h, integer p, integer c, hashtable v returns boolean
native LoadHashtableHandle takes hashtable h, integer p, integer c returns hashtable
native SaveWidgetHandle takes hashtable h, integer p, integer c, widget v returns boolean
native LoadWidgetHandle takes hashtable h, integer p, integer c returns widget
native SaveUnitHandle takes hashtable h, integer p, integer c, unit v returns boolean
native LoadUnitHandle takes hashtable h, integer p, integer c returns unit
native CreateUnit takes player p, integer id, real x, real y, real face returns unit
native RemoveUnit takes unit u returns nothing
globals
 hashtable ta=null
 hashtable tb=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
 set ta=InitHashtable()
 set tb=InitHashtable()
endfunction
)jass";auto make=[&](bool start,bool changed=false){std::string script=source;if(changed)script+="\n// changed source\n";auto module=Module::compile(Program::parse({{"table-snapshot.j",script,"hashtable snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto first=make(true),second=make(false);auto& a=first->runtime();auto& b=second->runtime();auto spawn=[&](Runtime& vm){return vm.invoke("CreateUnit",std::array{vm.handle("player",0x100000),vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});};auto live=spawn(a),dead=spawn(a),liveTarget=spawn(b),deadTarget=spawn(b);a.invoke("RemoveUnit",std::array{dead});b.invoke("RemoveUnit",std::array{deadTarget});auto ta=a.global("ta"),tb=a.global("tb"),parent=a.integer(-7);a.invoke("SaveInteger",std::array{ta,parent,a.integer(1),a.integer(42)});a.invoke("SaveReal",std::array{ta,parent,a.integer(1),a.real(real(1.25f))});a.invoke("SaveBoolean",std::array{ta,parent,a.integer(1),a.boolean(true)});require(a.invoke("SaveStr",std::array{ta,parent,a.integer(1),a.string("陈的任务")}).bits,"Hashtable string fixture failed");require(a.invoke("SaveHashtableHandle",std::array{ta,parent,a.integer(2),tb}).bits && a.invoke("SaveHashtableHandle",std::array{tb,parent,a.integer(2),ta}).bits && a.invoke("SaveHashtableHandle",std::array{ta,parent,a.integer(3),ta}).bits,"Hashtable cycle fixture failed");require(a.invoke("SaveUnitHandle",std::array{ta,parent,a.integer(4),live}).bits && a.invoke("SaveUnitHandle",std::array{ta,parent,a.integer(5),dead}).bits,"Hashtable unit fixture failed");require(a.invoke("SaveUnitHandle",std::array{ta,parent,a.integer(7),a.handle("unit",0)}).bits,"Null unit fixture failed");require(a.invoke("SaveWidgetHandle",std::array{ta,parent,a.integer(6),live}).bits,"Hashtable widget fixture failed");auto identity=[](std::string_view,std::uint32_t id){return id;};auto conflicting=[](std::string_view type,std::uint32_t id){return type=="unit"?123u:id;};rejects([&]{first->encodeHashtables(conflicting);},"mapping");auto bytes=first->encodeHashtables(identity),globals=a.encodeGlobals(identity);auto decodeUnit=[&](std::string_view type,std::uint32_t id){if(type!="unit" && type!="widget")return std::uint32_t(0);if(id==live.bits)return liveTarget.bits;if(id==dead.bits)return deadTarget.bits;return std::uint32_t(0);};auto wrong=[&](std::string_view type,std::uint32_t){return type=="unit"?liveTarget.bits:0u;};rejects([&]{second->rebuildHashtables(bytes,wrong);},"mapping");auto badKind=[](std::string_view,std::uint32_t){return 0x100000u;};rejects([&]{second->rebuildHashtables(bytes,badKind);},"widget mapping");auto different=make(false,true);rejects([&]{different->rebuildHashtables(bytes,decodeUnit);},"source differs");auto corrupt=bytes;corrupt[20]^=1;rejects([&]{second->rebuildHashtables(corrupt,decodeUnit);},"");require(!second->liveObjects(NativeKind::Hashtable),"Rejected hashtable snapshot created objects");auto mapping=second->rebuildHashtables(bytes,decodeUnit);auto decode=[&](std::string_view type,std::uint32_t id){return type=="hashtable" && mapping.contains(id)?mapping.at(id):decodeUnit(type,id);};b.restoreGlobals(globals,decode);auto ra=b.global("ta"),rb=b.global("tb"),p=b.integer(-7);require(b.invoke("LoadInteger",std::array{ra,p,b.integer(1)}).bits==42 && b.invoke("LoadReal",std::array{ra,p,b.integer(1)}).bits==real(1.25f).bits() && b.invoke("LoadBoolean",std::array{ra,p,b.integer(1)}).bits && *b.invoke("LoadStr",std::array{ra,p,b.integer(1)}).text=="陈的任务","Restored primitive values differ");require(b.invoke("LoadHashtableHandle",std::array{ra,p,b.integer(2)}).bits==rb.bits && b.invoke("LoadHashtableHandle",std::array{rb,p,b.integer(2)}).bits==ra.bits && b.invoke("LoadHashtableHandle",std::array{ra,p,b.integer(3)}).bits==ra.bits,"Restored hashtable references differ");require(b.invoke("LoadUnitHandle",std::array{ra,p,b.integer(4)}).bits==liveTarget.bits && b.invoke("LoadUnitHandle",std::array{ra,p,b.integer(5)}).bits==deadTarget.bits,"Restored live or retired unit reference differs");require(b.invoke("LoadWidgetHandle",std::array{ra,p,b.integer(6)}).bits==liveTarget.bits,"Restored widget alias differs");require(!b.invoke("LoadUnitHandle",std::array{ra,p,b.integer(7)}).bits && b.invoke("HaveSavedHandle",std::array{ra,p,b.integer(7)}).bits,"Stored null handle was lost");auto reverse=[&](std::string_view type,std::uint32_t id){if(type=="unit" || type=="widget"){if(id==liveTarget.bits)return live.bits;if(id==deadTarget.bits)return dead.bits;}for(auto [oldId,newId]:mapping)if(id==newId)return oldId;return std::uint32_t(0);};require(second->encodeHashtables(reverse)==bytes,"Hashtable snapshot did not round-trip");auto empty=make(false),emptyTarget=make(false);auto emptyBytes=empty->encodeHashtables(identity);require(emptyTarget->rebuildHashtables(emptyBytes,{}).empty(),"Empty hashtable snapshot created objects");rejects([&]{emptyTarget->rebuildHashtables(emptyBytes,{});},"");
    });
    test("gamecache_snapshot_restores_unsaved_values_and_unit",[&]{
        auto source=R"jass(type destructable extends handle
type unit extends handle
type player extends handle
type gamecache extends handle
native InitGameCache takes string n returns gamecache
native StoreInteger takes gamecache c, string m, string k, integer v returns nothing
native StoreReal takes gamecache c, string m, string k, real v returns nothing
native StoreBoolean takes gamecache c, string m, string k, boolean v returns nothing
native SyncStoredInteger takes gamecache c, string m, string k returns nothing
native StoreString takes gamecache c, string m, string k, string v returns boolean
native StoreUnit takes gamecache c, string m, string k, unit u returns boolean
native GetStoredInteger takes gamecache c, string m, string k returns integer
native GetStoredReal takes gamecache c, string m, string k returns real
native GetStoredBoolean takes gamecache c, string m, string k returns boolean
native GetStoredString takes gamecache c, string m, string k returns string
native HaveStoredUnit takes gamecache c, string m, string k returns boolean
native RestoreUnit takes gamecache c, string m, string k, player p, real x, real y, real facing returns unit
native CreateUnit takes player p, integer id, real x, real y, real face returns unit
native SetUnitUserData takes unit u, integer n returns nothing
native GetUnitUserData takes unit u returns integer
globals
 gamecache saved=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
 set saved=InitGameCache("Snapshot-Test.w3v")
endfunction
)jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"cache-snapshot.j",source,"gamecache snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto first=make(true),second=make(false);auto& a=first->runtime();auto& b=second->runtime();auto c=a.global("saved"),mission=a.string("任务"),key=a.string("value");require(c.bits,"Gamecache fixture missing");a.invoke("StoreInteger",std::array{c,mission,key,a.integer(42)});a.invoke("StoreReal",std::array{c,mission,a.string("real"),a.real(real(1.25f))});a.invoke("StoreBoolean",std::array{c,mission,a.string("flag"),a.boolean(true)});require(a.invoke("StoreString",std::array{c,mission,a.string("text"),a.string("酒桶")}).bits,"Gamecache string fixture failed");auto hero=a.invoke("CreateUnit",std::array{a.handle("player",0x100000),a.integer(int(ObjectData::code("Hpal"))),a.real(real(0)),a.real(real(0)),a.real(real(0))});a.invoke("SetUnitUserData",std::array{hero,a.integer(2468)});require(a.invoke("StoreUnit",std::array{c,mission,a.string("hero"),hero}).bits,"Gamecache unit fixture failed");auto identity=[](std::string_view,std::uint32_t id){return id;};auto bytes=first->encodeGameCaches(identity),globals=a.encodeGlobals(identity);auto corrupt=bytes;corrupt[20]^=1;rejects([&]{second->rebuildGameCaches(corrupt);},"");auto truncated=bytes;truncated.pop_back();rejects([&]{second->rebuildGameCaches(truncated);},"");Bytes malformed(bytes.begin(),bytes.end()-64);auto payload=12+first->world()->resources().mapDigest().size()+8+4+4+4+std::string("snapshot-test.w3v").size()+4;malformed[payload]^=1;malformed=sealSnapshot(std::move(malformed),64u*1024u*1024u);rejects([&]{second->rebuildGameCaches(malformed);},"");require(!second->liveObjects(NativeKind::Cache),"Rejected cache snapshot created objects");auto mapping=second->rebuildGameCaches(bytes);auto decode=[&](std::string_view type,std::uint32_t id){return type=="gamecache" && mapping.contains(id)?mapping.at(id):std::uint32_t(0);};b.restoreGlobals(globals,decode);auto restored=b.global("saved"),m=b.string("任务");require(restored.bits==mapping.at(c.bits) && b.invoke("InitGameCache",std::array{b.string("SNAPSHOT-TEST.W3V")}).bits==restored.bits,"Gamecache handle or name identity differs");require(b.invoke("GetStoredInteger",std::array{restored,m,b.string("value")}).bits==42 && *b.invoke("GetStoredString",std::array{restored,m,b.string("text")}).text=="酒桶" && b.invoke("GetStoredReal",std::array{restored,m,b.string("real")}).bits==real(1.25f).bits() && b.invoke("GetStoredBoolean",std::array{restored,m,b.string("flag")}).bits && b.invoke("HaveStoredUnit",std::array{restored,m,b.string("hero")}).bits,"Unsaved gamecache values were lost");auto unit=b.invoke("RestoreUnit",std::array{restored,m,b.string("hero"),b.handle("player",0x100000),b.real(real(0)),b.real(real(0)),b.real(real(0))});require(unit.bits && b.invoke("GetUnitUserData",std::array{unit}).bits==2468,"Cached hero was not restored");auto reverse=[&](std::string_view,std::uint32_t id){for(auto [oldId,newId]:mapping)if(newId==id)return oldId;return std::uint32_t(0);};require(second->encodeGameCaches(reverse)==bytes,"Gamecache snapshot did not round-trip");a.invoke("SyncStoredInteger",std::array{c,mission,key});rejects([&]{first->encodeGameCaches(identity);},"pending synchronization");first->advance(1./32);first->encodeGameCaches(identity);auto empty=make(false),emptyTarget=make(false);auto emptyBytes=empty->encodeGameCaches(identity);require(emptyTarget->rebuildGameCaches(emptyBytes).empty(),"Empty gamecache snapshot created handles");rejects([&]{emptyTarget->rebuildGameCaches(emptyBytes);},"");
    });
    test("fog_snapshot_restores_exploration_and_modifier_handles",[&]{
        auto source=R"jass(type destructable extends handle
type player extends handle
type fogstate extends handle
type fogmodifier extends handle
native SetFogStateRadius takes player p, fogstate s, real x, real y, real r, boolean shared returns nothing
native CreateFogModifierRadius takes player p, fogstate s, real x, real y, real r, boolean shared, boolean after returns fogmodifier
native FogModifierStart takes fogmodifier f returns nothing
native FogModifierStop takes fogmodifier f returns nothing
native DestroyFogModifier takes fogmodifier f returns nothing
native IsVisibleToPlayer takes real x, real y, player p returns boolean
native IsFoggedToPlayer takes real x, real y, player p returns boolean
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
)jass";auto make=[&](bool start){auto module=Module::compile(Program::parse({{"fog-snapshot.j",source,"fog snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto first=make(true),second=make(false);auto& a=first->runtime();auto& b=second->runtime();auto bounds=first->world()->bounds();auto x=bounds.minX.add(bounds.maxX).divide(Real::fromInteger(2)),y=bounds.minY.add(bounds.maxY).divide(Real::fromInteger(2)),other=x.add(real(640));auto p=a.handle("player",0x100000),p2=a.handle("player",0x100001);a.invoke("SetFogStateRadius",std::array{p2,a.handle("fogstate",2),a.real(x),a.real(y),a.real(real(192)),a.boolean(false)});a.invoke("SetFogStateRadius",std::array{p,a.handle("fogstate",2),a.real(x),a.real(y),a.real(real(192)),a.boolean(false)});auto live=a.invoke("CreateFogModifierRadius",std::array{p,a.handle("fogstate",4),a.real(other),a.real(y),a.real(real(192)),a.boolean(false),a.boolean(false)});auto dead=a.invoke("CreateFogModifierRadius",std::array{p,a.handle("fogstate",4),a.real(x),a.real(y),a.real(real(64)),a.boolean(false),a.boolean(true)});a.invoke("FogModifierStart",std::array{live});a.invoke("DestroyFogModifier",std::array{dead});require(a.invoke("IsFoggedToPlayer",std::array{a.real(x),a.real(y),p}).bits && a.invoke("IsVisibleToPlayer",std::array{a.real(other),a.real(y),p}).bits,"Source fog fixture differs");auto identity=[](std::string_view,std::uint32_t id){return id;};rejects([&]{first->encodeFogState([](std::string_view,std::uint32_t){return 1u;});},"");auto bytes=first->encodeFogState(identity);auto corrupt=bytes;corrupt[20]^=1;rejects([&]{second->rebuildFogState(corrupt);},"");auto forged=[&](size_t offset,std::uint32_t value){Bytes content(bytes.begin(),bytes.end()-64);for(unsigned i=0;i<4;++i)content[offset+i]=std::uint8_t(value>>(8*i));return sealSnapshot(std::move(content),24u*1024u*1024u);};auto offset=12+first->world()->resources().mapDigest().size();auto badTick=forged(offset+8,1),badFlags=forged(offset+16,8);rejects([&]{second->rebuildFogState(badTick);},"");rejects([&]{second->rebuildFogState(badFlags);},"");require(!second->liveObjects(NativeKind::Fog),"Rejected fog snapshot created objects");auto mapping=second->rebuildFogState(bytes);auto encode=[&](std::string_view,std::uint32_t id){for(auto [oldId,newId]:mapping)if(id==newId)return oldId;return std::uint32_t(0);};require(second->encodeFogState(encode)==bytes,"Fog snapshot did not round-trip");auto q=b.handle("player",0x100000);require(b.invoke("IsFoggedToPlayer",std::array{b.real(x),b.real(y),q}).bits && b.invoke("IsVisibleToPlayer",std::array{b.real(other),b.real(y),q}).bits,"Restored fog state differs");require(b.invoke("IsFoggedToPlayer",std::array{b.real(x),b.real(y),b.handle("player",0x100001)}).bits,"Stale explored grid was not restored");b.invoke("FogModifierStart",std::array{b.handle("fogmodifier",mapping.at(dead.bits))});b.invoke("FogModifierStop",std::array{b.handle("fogmodifier",mapping.at(live.bits))});require(b.invoke("IsFoggedToPlayer",std::array{b.real(other),b.real(y),q}).bits,"Restored fog modifier did not stop");auto empty=make(true),emptyTarget=make(false);auto emptyBytes=empty->encodeFogState(identity);require(emptyTarget->rebuildFogState(emptyBytes).empty(),"Empty fog snapshot created handles");rejects([&]{emptyTarget->rebuildFogState(emptyBytes);},"");
    });
    test("player_configuration_restores_diplomacy_and_creation",[&]{
        auto source=R"jass(type destructable extends handle
type unit extends handle
type player extends handle
type playerstate extends handle
type alliancetype extends handle
native SetPlayerAlliance takes player a, player b, alliancetype k, boolean flag returns nothing
native GetPlayerAlliance takes player a, player b, alliancetype k returns boolean
native SetPlayerTaxRate takes player a, player b, playerstate k, integer n returns nothing
native GetPlayerTaxRate takes player a, player b, playerstate k returns integer
native SetPlayerHandicap takes player p, real n returns nothing
native SetPlayerName takes player p, string n returns nothing
native GetPlayerName takes player p returns string
native CreateUnit takes player p, integer id, real x, real y, real face returns unit
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
)jass";auto create=[&](bool start){auto module=Module::compile(Program::parse({{"diplomacy.j",source,"player configuration snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);if(start)result->startMain();return result;};auto first=create(true),second=create(false);auto& a=first->runtime();auto& b=second->runtime();auto player=a.handle("player",0x100000),other=a.handle("player",0x100001);a.invoke("SetPlayerAlliance",std::array{player,other,a.handle("alliancetype",0),a.boolean(true)});a.invoke("SetPlayerAlliance",std::array{other,player,a.handle("alliancetype",6),a.boolean(true)});a.invoke("SetPlayerTaxRate",std::array{player,other,a.handle("playerstate",1),a.integer(35)});a.invoke("SetPlayerHandicap",std::array{player,a.real(real(.5f))});a.invoke("SetPlayerName",std::array{player,a.string("Rexxar 测试")});auto bytes=first->encodePlayerConfiguration();second->restorePlayerConfiguration(bytes);require(second->encodePlayerConfiguration()==bytes,"Player configuration did not round-trip");auto restored=b.handle("player",0x100000),restoredOther=b.handle("player",0x100001);require(b.invoke("GetPlayerAlliance",std::array{restored,restoredOther,b.handle("alliancetype",0)}).bits && b.invoke("GetPlayerAlliance",std::array{restoredOther,restored,b.handle("alliancetype",6)}).bits && b.invoke("GetPlayerTaxRate",std::array{restored,restoredOther,b.handle("playerstate",1)}).bits==35 && *b.invoke("GetPlayerName",std::array{restored}).text=="Rexxar 测试","Restored player settings differ");auto corrupt=bytes;corrupt[25]^=1;rejects([&]{second->restorePlayerConfiguration(corrupt);},"");require(second->encodePlayerConfiguration()==bytes,"Corrupt player configuration changed session");auto forged=[&](size_t offset,std::uint32_t value){Bytes content(bytes.begin(),bytes.end()-64);for(unsigned i=0;i<4;++i)content[offset+i]=std::uint8_t(value>>(8*i));return sealSnapshot(std::move(content),256*1024);};auto wrongLocal=forged(8,15),badTeam=forged(20+std::string("Rexxar 测试").size(),16);rejects([&]{second->restorePlayerConfiguration(wrongLocal);},"");rejects([&]{second->restorePlayerConfiguration(badTeam);},"");require(second->encodePlayerConfiguration()==bytes,"Invalid player configuration changed session");auto unit=[&](Runtime& vm,Value owner){return vm.invoke("CreateUnit",std::array{owner,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});};auto u=unit(a,player),v=unit(b,restored);require(first->units().at(u.bits)->maxLife.bits()==second->units().at(v.bits)->maxLife.bits(),"Restored handicap did not affect new unit");
    });
    test("player_statistics_snapshot_preserves_real_scores",[&]{
        auto source=R"jass(type destructable extends handle
type unit extends handle
type item extends handle
type player extends handle
native CreateUnit takes player p, integer id, real x, real y, real face returns unit
native CreateItem takes integer id, real x, real y returns item
native UnitAddItem takes unit u, item i returns boolean
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
)jass";auto create=[&]{auto module=Module::compile(Program::parse({{"statistics.j",source,"statistics snapshot"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->audioMuted(true);result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);result->startMain();return result;};auto first=create(),second=create();auto& vm=first->runtime();auto player=vm.handle("player",0x100000),enemy=vm.handle("player",0x100001);auto hero=vm.invoke("CreateUnit",std::array{player,vm.integer(int(ObjectData::code("Hpal"))),vm.real(real(0)),vm.real(real(0)),vm.real(real(0))});auto target=vm.invoke("CreateUnit",std::array{enemy,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(64)),vm.real(real(0)),vm.real(real(0))});auto item=vm.invoke("CreateItem",std::array{vm.integer(int(ObjectData::code("rat6"))),vm.real(real(0)),vm.real(real(0))});require(vm.invoke("UnitAddItem",std::array{hero,item}).bits,"Statistics item pickup failed");require(first->damageUnit(hero.bits,target.bits,10000,0,0,true),"Statistics damage failed");require(first->statistics()[0].items==1 && first->statistics()[0].killed==1 && !first->statistics()[0].typeScores.empty(),"Real statistics did not update");auto bytes=first->encodePlayerStatistics();second->restorePlayerStatistics(bytes);require(second->encodePlayerStatistics()==bytes && second->statistics()[0].items==1 && second->statistics()[0].killed==1,"Player statistics did not round-trip");auto corrupt=bytes;corrupt[20]^=1;rejects([&]{second->restorePlayerStatistics(corrupt);},"");require(second->encodePlayerStatistics()==bytes,"Corrupt statistics changed session");auto truncated=bytes;truncated.pop_back();rejects([&]{second->restorePlayerStatistics(truncated);},"");require(second->encodePlayerStatistics()==bytes,"Truncated statistics changed session");auto forged=[&](size_t offset,std::uint32_t value){Bytes content(bytes.begin(),bytes.end()-64);for(unsigned i=0;i<4;++i)content[offset+i]=std::uint8_t(value>>(8*i));return sealSnapshot(std::move(content),1024*1024);};auto negative=forged(12,0xffffffffu),oversized=forged(92,65537);rejects([&]{second->restorePlayerStatistics(negative);},"");rejects([&]{second->restorePlayerStatistics(oversized);},"");require(second->encodePlayerStatistics()==bytes,"Invalid statistics changed session");
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
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into clock checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed || !passed?1:0;
}
