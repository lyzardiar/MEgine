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
 endfunction
 function reverse takes nothing returns nothing
 set e4=TriggerRegisterTimerExpireEvent(x,clock)
 set e3=TriggerRegisterTimerExpireEvent(z,clock)
 set e2=TriggerRegisterTimerEvent(y,0.25,true)
 set e1=TriggerRegisterTimerEvent(x,0.125,false)
 endfunction
 )jass";auto create=[&]{auto module=Module::compile(Program::parse({{"timer-events.j",source,"authored event persistence test"}}));auto result=std::make_unique<ScriptSession>(std::move(module),map().info);result->attachWorld(world());result->configure();PlayerSetup setup(map().info,result->config());result->applySetup(setup);return result;};auto original=create(),restored=create(),rebuilt=create();auto& a=original->runtime();auto& b=restored->runtime();auto& c=rebuilt->runtime();original->startMain();a.invoke("createClock");a.invoke("startClock");a.invoke("createTriggers");a.invoke("forward");original->advance(.125);require(a.global("sequence").bits==1,"One-shot timer event did not fire");auto ids=[](Runtime& vm){std::array<std::uint32_t,8> result{};unsigned i=0;for(auto name:{"clock","x","y","z","e1","e2","e3","e4"})result[i++]=vm.global(name).bits;return result;};auto first=ids(a);auto encode=[&](std::string_view type,std::uint32_t id){for(unsigned i=0;i<first.size();++i)if(first[i]==id && type==(i==0?"timer":i<4?"trigger":"event"))return i+1;if(type=="triggeraction")return id;return 0u;};auto clock=original->encodeSimulationClock(),timers=original->encodeTimers(encode),triggers=original->encodeTriggers(encode),events=original->encodeTimerEvents(encode),globals=a.encodeGlobals(encode);restored->restoreSimulationClock(clock);b.invoke("createClock");auto targetClock=b.global("clock").bits;restored->restoreTimers(timers,[&](std::string_view type,std::uint32_t id){return type=="timer" && id==1?targetClock:0u;});auto triggerHandles=restored->restoreTriggers(triggers);b.invoke("assignTriggers",std::array{b.handle("trigger",triggerHandles.at({"trigger",2})),b.handle("trigger",triggerHandles.at({"trigger",3})),b.handle("trigger",triggerHandles.at({"trigger",4}))});b.invoke("reverse");auto second=ids(b);auto decode=[&](std::string_view type,std::uint32_t id){if(id<1 || id>second.size() || type!=(id==1?"timer":id<5?"trigger":"event"))return 0u;return second[id-1];};auto broken=events;broken.back()^=1;rejects([&]{restored->restoreTimerEvents(broken,decode);},"digest");rejects([&]{restored->restoreTimerEvents(events,[&](std::string_view type,std::uint32_t id){return type=="event"?second[4]:decode(type,id);});},"mapping");rejects([&]{restored->restoreTimerEvents(events,[&](std::string_view type,std::uint32_t id){return type=="event" && id==5?second[5]:type=="event" && id==6?second[4]:decode(type,id);});},"registration differs");restored->restoreTimerEvents(events,decode);b.restoreGlobals(globals,decode);auto reencode=[&](std::string_view type,std::uint32_t id){for(unsigned i=0;i<second.size();++i)if(second[i]==id && type==(i==0?"timer":i<4?"trigger":"event"))return i+1;return 0u;};require(restored->encodeTimerEvents(reencode)==events,"Restored timer event ordering was not retained");rebuilt->restoreSimulationClock(clock);auto thirdTimers=rebuilt->rebuildTimers(timers);auto thirdClock=thirdTimers.at(1);auto thirdTriggers=rebuilt->restoreTriggers(triggers);auto decodeParents=[&](std::string_view type,std::uint32_t id){if(type=="timer" && id==1)return thirdClock;auto found=thirdTriggers.find({std::string(type),id});return found==thirdTriggers.end()?0u:found->second;};rejects([&]{rebuilt->rebuildTimerEvents(broken,decodeParents);},"digest");rejects([&]{rebuilt->rebuildTimerEvents(events,[&](std::string_view type,std::uint32_t id){return type=="trigger"?decodeParents(type,2):decodeParents(type,id);});},"mapping");require(rebuilt->liveObjects(NativeKind::Event)==0,"Rejected event rebuild created objects");auto thirdEvents=rebuilt->rebuildTimerEvents(events,decodeParents);auto decodeThird=[&](std::string_view type,std::uint32_t id){if(type=="event"){auto found=thirdEvents.find(id);return found==thirdEvents.end()?0u:found->second;}return decodeParents(type,id);};c.restoreGlobals(globals,decodeThird);auto third=ids(c);auto encodeThird=[&](std::string_view type,std::uint32_t id){for(unsigned i=0;i<third.size();++i)if(third[i]==id && type==(i==0?"timer":i<4?"trigger":"event"))return i+1;return 0u;};require(rebuilt->encodeTimerEvents(encodeThird)==events,"Rebuilt timer event state differs");restored->startMain();rebuilt->startMain();original->advance(.375);restored->advance(.375);rebuilt->advance(.375);require(a.global("sequence").bits==13122 && b.global("sequence").bits==13122 && c.global("sequence").bits==13122,"Restored timer events fired at a different time or order");require(original->encodeTimerEvents(encode)==restored->encodeTimerEvents(reencode) && original->encodeTimerEvents(encode)==rebuilt->encodeTimerEvents(encodeThird),"Continued timer event state differs");c.invoke("DestroyTrigger",std::array{c.global("x")});require(rebuilt->liveObjects(NativeKind::Event)==2,"Rebuilt events were not owned by trigger");rebuilt->advance(.25);require(c.global("sequence").bits==131222,"Remaining event stopped after another trigger was destroyed");
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
