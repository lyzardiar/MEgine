// Author: MiYu. Script configuration, typed object lifetime and enum native evidence.
#include "session.h"
#include <bit>
#include <iostream>

using namespace war3;
using namespace war3::jass;
namespace {
struct EnumNative {const char* name;const char* type;std::uint32_t entry;};
constexpr EnumNative enums[]={
#include "jass_enums.inc"
};
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
Module compile(std::string text) {return Module::compile(Program::parse({{"session.j",std::move(text),"authored native session test"}}));}
template<class F> void rejects(F run,std::string_view message) {try{run();}catch(const std::exception& e){require(std::string_view(e.what()).find(message)!=std::string_view::npos,"Unexpected session diagnostic");return;}throw std::runtime_error("Invalid session operation accepted");}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=2){std::cerr<<"Usage: war3_session_tests <enum-fixture.json>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    std::vector<std::uint32_t> values={0,1,2,7,12,31,32,63,64,128,255,256,1024,0x80000000,0x7fffffff,0xffffffff,0x100000};std::uint32_t state=0x12705224;for(unsigned i=0;i<48;++i){state=state*1664525u+1013904223u;values.push_back(state);}
    std::vector<std::pair<std::string,std::vector<std::uint32_t>>> converted;
    test("session_original_enum_native_bits",[&]{std::string source;for(auto entry:enums)source+="type "+std::string(entry.type)+" extends handle\n";for(auto entry:enums)source+="native "+std::string(entry.name)+" takes integer value returns "+entry.type+"\n";source+="native GetHandleId takes handle value returns integer\n";ScriptSession session(compile(source),{});session.initialize();for(auto entry:enums){std::vector<std::uint32_t> results;for(auto bits:values){Value args[]={session.runtime().integer(std::bit_cast<std::int32_t>(bits))};auto result=session.runtime().invoke(entry.name,args);require(result.type==session.runtime().module().typeId(entry.type) && result.bits==bits,"Enum conversion changed type or bits");results.push_back(result.bits);}converted.emplace_back(entry.name,std::move(results));}std::vector<std::uint32_t> results;for(auto bits:values){Value args[]={session.runtime().handle("handle",bits)};auto result=session.runtime().invoke("GetHandleId",args);require(result.bits==bits,"GetHandleId changed raw bits");results.push_back(result.bits);}converted.emplace_back("GetHandleId",std::move(results));});
    const std::string objectSource=R"jass(type group extends handle
type timer extends handle
type trigger extends handle
type unit extends handle
native CreateGroup takes nothing returns group
native DestroyGroup takes group g returns nothing
native FirstOfGroup takes group g returns unit
native CreateTimer takes nothing returns timer
native DestroyTimer takes timer t returns nothing
native TimerGetTimeout takes timer t returns real
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native DisableTrigger takes trigger t returns nothing
native IsTriggerEnabled takes trigger t returns boolean
globals
group g=CreateGroup()
timer clock=CreateTimer()
trigger t=CreateTrigger()
endglobals
function inspect takes nothing returns boolean
return FirstOfGroup(g)==null and TimerGetTimeout(clock)==0.0 and IsTriggerEnabled(t)
endfunction
function disable takes nothing returns boolean
call DisableTrigger(t)
return IsTriggerEnabled(t)
endfunction
function release takes nothing returns nothing
call DestroyGroup(g)
call DestroyTimer(clock)
call DestroyTrigger(t)
endfunction
)jass";
    test("session_global_objects_have_persistent_state",[&]{ScriptSession session(compile(objectSource),{});require(session.liveObjects(NativeKind::Group)==0,"Constructor executed JASS globals");session.initialize();require(session.liveObjects(NativeKind::Group)==1 && session.liveObjects(NativeKind::Timer)==1 && session.liveObjects(NativeKind::Trigger)==1,"Creation did not retain native objects");auto& vm=session.runtime();require(vm.global("g").bits && vm.global("clock").bits!=vm.global("g").bits && vm.invoke("inspect").bits,"Initial object state differs");require(!vm.invoke("disable").bits,"Trigger flag update not retained");rejects([&]{session.initialize();},"fresh instance");require(session.initialized(),"Repeated initialize poisoned the ready session");});
    test("session_native_destruction_and_fresh_lifetime",[&]{ScriptSession session(compile(objectSource),{});session.initialize();session.runtime().invoke("release");require(session.liveObjects(NativeKind::Group)==0 && session.liveObjects(NativeKind::Timer)==0 && session.liveObjects(NativeKind::Trigger)==0,"Destroy did not release native state");rejects([&]{session.runtime().invoke("inspect");},"Destroyed or incompatible");ScriptSession next(compile(objectSource),{});next.initialize();require(next.runtime().invoke("inspect").bits && next.liveObjects(NativeKind::Trigger)==1,"Native state leaked into fresh session");});
    test("session_variable_event_crossing_and_destruction",[]{auto module=compile(R"jass(type trigger extends handle
type triggeraction extends handle
type event extends handle
type eventid extends handle
type limitop extends handle
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native TriggerAddAction takes trigger t, code action returns triggeraction
native TriggerRegisterVariableEvent takes trigger t, string name, limitop op, real limit returns event
native ConvertLimitOp takes integer value returns limitop
native GetTriggerEventId takes nothing returns eventid
native GetHandleId takes handle value returns integer
globals
real watched=0.
integer hits=0
integer eventKind=0
trigger t=null
endglobals
function onLimit takes nothing returns nothing
set hits=hits+1
set eventKind=GetHandleId(GetTriggerEventId())
endfunction
function setup takes nothing returns nothing
set t=CreateTrigger()
call TriggerAddAction(t,function onLimit)
call TriggerRegisterVariableEvent(t,"watched",ConvertLimitOp(4),1.)
endfunction
function cross takes nothing returns nothing
set watched=2.
set watched=3.
set watched=0.
set watched=2.
endfunction
function release takes nothing returns nothing
call DestroyTrigger(t)
set watched=0.
set watched=2.
endfunction
)jass");ScriptSession session(std::move(module),{});session.initialize();auto& vm=session.runtime();vm.invoke("setup");vm.invoke("cross");require(vm.global("hits").bits==2 && vm.global("eventKind").bits==2,"Variable threshold crossing or event context differs");vm.invoke("release");require(vm.global("hits").bits==2,"Destroyed trigger still receives variable events");});
    test("session_config_updates_metadata_slots_and_priorities",[]{auto module=compile(R"jass(type player extends handle
type playercolor extends handle
type mapcontrol extends handle
type startlocprio extends handle
native Player takes integer i returns player
native GetPlayerId takes player p returns integer
native ConvertPlayerColor takes integer i returns playercolor
native ConvertMapControl takes integer i returns mapcontrol
native ConvertStartLocPrio takes integer i returns startlocprio
native SetMapName takes string s returns nothing
native SetPlayers takes integer n returns nothing
native SetTeams takes integer n returns nothing
native DefineStartLocation takes integer i, real x, real y returns nothing
native ForcePlayerStartLocation takes player p, integer i returns nothing
native SetPlayerTeam takes player p, integer i returns nothing
native SetPlayerColor takes player p, playercolor c returns nothing
native SetPlayerController takes player p, mapcontrol c returns nothing
native SetStartLocPrioCount takes integer i, integer n returns nothing
native SetStartLocPrio takes integer i, integer n, integer other, startlocprio priority returns nothing
function config takes nothing returns nothing
call SetMapName("TRIGSTR_001")
call SetPlayers(2)
call SetTeams(2)
call DefineStartLocation(0,3328.0,-3072.0)
call ForcePlayerStartLocation(Player(3),0)
call SetPlayerTeam(Player(3),1)
call SetPlayerColor(Player(3),ConvertPlayerColor(7))
call SetPlayerController(Player(3),ConvertMapControl(1))
call SetStartLocPrioCount(0,1)
call SetStartLocPrio(0,0,1,ConvertStartLocPrio(2))
endfunction
)jass");ScriptSession session(std::move(module),{},{{1,"Authored map"}});session.configure();auto& c=session.config();require(session.configured() && c.name=="Authored map" && c.playerCount==2 && c.teamCount==2,"Metadata not updated by config");require(c.players[3].start==0 && c.players[3].forcedStart && c.players[3].team==1 && c.players[3].color==7 && c.players[3].controller==1,"Player config was not retained");require(c.starts[0].defined && c.starts[0].position[0].bits()==Real::fromDecimal("3328.0").bits() && c.starts[0].position[1].bits()==(Real::fromDecimal("3072.0").bits()^0x80000000) && c.starts[0].priorities[0].other==1 && c.starts[0].priorities[0].priority==2,"Start definition or priority differs");rejects([&]{session.configure();},"unconfigured instance");});
    test("session_selected_game_type_and_source_metadata",[]{auto source=std::string("type gametype extends handle\nnative GetGameTypeSelected takes nothing returns gametype\nfunction config takes nothing returns nothing\nendfunction\n");MapInfo info;info.flags=4;info.name="Source map";info.players.push_back({3,2,3,1,"Source slot",{100.0f,-200.0f},0,0});info.forces.push_back({0,1u<<3,"Source force"});ScriptSession melee(compile(source),info);melee.configure();require(melee.config().gameType==1 && melee.runtime().invoke("GetGameTypeSelected").bits==1 && melee.config().name=="Source map","Melee source game type differs");require(melee.config().players[3].controller==1 && melee.config().players[3].racePreference==8 && melee.config().players[3].forcedStart && melee.config().players[3].start==0,"Source player defaults lost");info.flags=0x40;ScriptSession custom(compile(source),info);custom.configure();require(custom.runtime().invoke("GetGameTypeSelected").bits==4 && custom.config().players[3].team==0,"Custom source game type or force differs");ScriptSession flags(compile(source),info,{},9);flags.configure();require(flags.runtime().invoke("GetGameTypeSelected").bits==1,"Original selected game type mask differs");});
    test("session_unknown_native_prevents_configured_state",[]{ScriptSession session(compile("native Missing takes nothing returns nothing\nfunction config takes nothing returns nothing\ncall Missing()\nendfunction\n"),{});rejects([&]{session.configure();},"session.j:3:6: Unbound JASS native: Missing");require(!session.configured() && !session.initialized(),"Failed config was accepted");rejects([&]{session.configure();},"unconfigured instance");});
    test("session_rejects_mismatched_native_signature",[]{rejects([]{ScriptSession session(compile("native ConvertRace takes integer i returns integer\n"),{});},"Invalid session native signature: ConvertRace");});
    if(!failed){auto output=fs::absolute(argv[1]);fs::create_directories(output.parent_path());std::ofstream file(output,std::ios::binary);require(bool(file),"Cannot write enum fixture");file<<"{\"values\":[";bool first=true;for(auto value:values){if(!first)file<<',';first=false;file<<value;}file<<"],\"natives\":[";first=true;for(size_t i=0;i<converted.size();++i){if(!first)file<<',';first=false;auto entry=i<std::size(enums)?enums[i].entry:0x6f1e27a0u;file<<"{\"name\":\""<<converted[i].first<<"\",\"entry\":"<<entry<<",\"results\":[";bool next=false;for(auto bits:converted[i].second){if(next)file<<',';next=true;file<<bits;}file<<"]}";}file<<"]}\n";file.close();require(bool(file),"Cannot complete enum fixture");}
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into session tests");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
