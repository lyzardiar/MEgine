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
 )jass";auto module=Module::compile(Program::parse({{"unit-position.j",source,"authored invalid position handle test"}}));ScriptSession session(std::move(module),map().info);session.attachWorld(world());session.configure();PlayerSetup setup(map().info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto player=vm.invoke("Player",std::array{vm.integer(0)}),zero=vm.real(real(0)),valid=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),zero,zero,zero}),removed=vm.invoke("CreateUnit",std::array{player,vm.integer(std::bit_cast<std::int32_t>(ObjectData::code("hfoo"))),zero,zero,zero}),timer=vm.invoke("CreateTimer");vm.invoke("RemoveUnit",std::array{removed});auto invalidReal=vm.real(Real::fromBits(0x7fc00000));for(auto id:{0u,removed.bits,timer.bits}){auto invalid=vm.handle("unit",id);vm.invoke("SetUnitX",std::array{invalid,invalidReal});vm.invoke("SetUnitY",std::array{invalid,invalidReal});vm.invoke("SetUnitAcquireRange",std::array{invalid,invalidReal});vm.invoke("SetUnitTurnSpeed",std::array{invalid,invalidReal});vm.invoke("SetUnitPropWindow",std::array{invalid,invalidReal});vm.invoke("KillUnit",std::array{invalid});for(auto name:{"GetUnitAcquireRange","GetUnitTurnSpeed","GetUnitDefaultTurnSpeed","GetUnitPropWindow","GetUnitDefaultPropWindow"})require(vm.invoke(name,std::array{invalid}).bits==0,"Invalid unit motion query did not return zero");require(vm.invoke("GetUnitX",std::array{invalid}).bits==0 && vm.invoke("GetUnitY",std::array{invalid}).bits==0,"Invalid unit coordinate did not return zero");}vm.invoke("SetUnitX",std::array{valid,vm.real(real(42))});vm.invoke("SetUnitY",std::array{valid,vm.real(real(-17))});require(vm.invoke("GetUnitX",std::array{valid}).bits==real(42).bits() && vm.invoke("GetUnitY",std::array{valid}).bits==real(-17).bits(),"Valid unit position did not change");vm.invoke("SetUnitAcquireRange",std::array{valid,vm.real(real(333))});vm.invoke("SetUnitTurnSpeed",std::array{valid,vm.real(real(1))});vm.invoke("SetUnitPropWindow",std::array{valid,vm.real(real(2))});require(vm.invoke("GetUnitAcquireRange",std::array{valid}).bits==real(333).bits() && vm.invoke("GetUnitTurnSpeed",std::array{valid}).bits==real(1).bits() && vm.invoke("GetUnitPropWindow",std::array{valid}).bits==real(2).bits(),"Valid motion settings did not change");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded during position fixture");
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
