// Author: MiYu. Configuration-to-menu-to-session state with sparse original player IDs.
#include "session.h"
#include "setup.h"
#include <functional>
#include <iostream>

using namespace war3;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
const std::string api=R"jass(type player extends handle
type mapcontrol extends handle
type playercolor extends handle
type racepreference extends handle
type playerslotstate extends handle
type aidifficulty extends handle
type alliancetype extends handle
native Player takes integer id returns player
native GetLocalPlayer takes nothing returns player
native GetAIDifficulty takes player p returns aidifficulty
native GetPlayerHandicap takes player p returns real
native GetPlayerSlotState takes player p returns playerslotstate
native ConvertMapControl takes integer value returns mapcontrol
native ConvertPlayerColor takes integer value returns playercolor
native ConvertRacePref takes integer value returns racepreference
native ConvertAllianceType takes integer value returns alliancetype
native SetPlayerAlliance takes player p, player q, alliancetype which, boolean enabled returns nothing
native SetPlayerController takes player p, mapcontrol value returns nothing
native SetPlayerTeam takes player p, integer value returns nothing
native SetPlayerColor takes player p, playercolor value returns nothing
native SetPlayerRacePreference takes player p, racepreference value returns nothing
native SetPlayerRaceSelectable takes player p, boolean value returns nothing
)jass";
jass::Module compile(const std::string& body={}) {return jass::Module::compile(jass::Program::parse({{"setup.j",api+"function config takes nothing returns nothing\n"+body+"endfunction\n","authored setup integration"}}));}
MapInfo info() {MapInfo result;result.players={{1,1,1,1,"first",{128,64},1,2},{7,1,2,0,"seven",{},0,0},{11,1,3,0,"eleven",{},0,0}};return result;}
jass::Value player(ScriptSession& session,int id) {jass::Value args[]={session.runtime().integer(id)};return session.runtime().invoke("Player",args);}
}
int main() {
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    const std::string config="call SetPlayerTeam(Player(1),14)\ncall SetPlayerColor(Player(1),ConvertPlayerColor(4))\ncall SetPlayerRacePreference(Player(1),ConvertRacePref(4))\ncall SetPlayerRaceSelectable(Player(1),false)\ncall SetPlayerController(Player(7),ConvertMapControl(1))\n";
    test("setup_consumes_executed_config",[&]{auto map=info();ScriptSession session(compile(config),map);session.configure();PlayerSetup setup(map,session.config());auto one=setup.find(1);require(setup.slots().size()==3 && setup.localPlayer()==1u && !setup.find(0),"Configured sparse IDs changed");require(one->source.start[0]==128 && one->source.allyHigh==2 && one->team==14 && setup.teamCount()==15 && one->color==4 && one->race==4 && !one->raceSelectable,"Config or original source data lost");require(!setup.race(1,2) && setup.find(7)->computerOnly && !setup.control(7,SlotControl::Local),"Configured race/controller restriction ignored");require(setup.find(7)->control==SlotControl::ComputerNormal && setup.find(11)->racePreference==8,"Configured computer/race mapping differs");});
    test("single_player_melee_default_opponent",[]{auto map=info();map.flags=4;PlayerSetup melee(map);melee.defaultMeleeOpponent();require(melee.find(7)->control==SlotControl::ComputerNormal && melee.find(11)->control==SlotControl::Open,"Melee default opponent not assigned to first opposing slot");require(melee.control(7,SlotControl::Closed),"Default opponent cannot be changed");map.flags=0;PlayerSetup custom(map);custom.defaultMeleeOpponent();require(custom.find(7)->control==SlotControl::Open,"Custom map slots were changed");map.flags=4|0x20;PlayerSetup fixed(map);fixed.defaultMeleeOpponent();require(fixed.find(7)->control==SlotControl::Open,"Fixed settings were changed");map.flags=4;map.players[1].type=2;PlayerSetup existing(map);existing.defaultMeleeOpponent();require(existing.find(7)->control==SlotControl::ComputerNormal && existing.find(11)->control==SlotControl::Open,"Existing opponent was duplicated");});
    test("setup_edits_reach_native_queries",[&]{auto map=info();ScriptSession session(compile(config),map);session.configure();PlayerSetup setup(map,session.config());session.applySetup(setup);require(session.localPlayer()==1u && session.runtime().invoke("GetLocalPlayer").bits==player(session,1).bits,"Initial local player not applied");require(setup.control(11,SlotControl::Local) && setup.control(1,SlotControl::Closed) && setup.control(7,SlotControl::ComputerEasy) && setup.handicap(11,90) && setup.race(11,2),"Valid draft edit failed");session.applySetup(setup);auto& state=session.config();require(session.localPlayer()==11u && session.runtime().invoke("GetLocalPlayer").bits==player(session,11).bits,"Moved local player not applied");require(state.players[1].controller==5 && state.players[1].slotState==0 && state.players[11].slotState==1 && state.players[11].racePreference==2,"Controller, slot state or race preference not applied");jass::Value cpu[]={player(session,7)},local[]={player(session,11)};require(session.runtime().invoke("GetAIDifficulty",cpu).bits==0 && session.runtime().invoke("GetPlayerSlotState",cpu).bits==1,"AI setup not queried from same session");require(session.runtime().invoke("GetPlayerHandicap",local).bits==jass::Real::fromInteger(90).divide(jass::Real::fromInteger(100)).bits(),"Handicap setup not queried from same session");require(state.players[1].forcedStart && state.starts[0].position[0].bits()==jass::Real::fromDecimal("128.0").bits() && session.liveObjects(NativeKind::Player)==16,"Applying setup changed starts or player objects");});
    test("setup_preserves_force_names_and_race_masks",[]{auto map=info();map.flags=0x40;map.forces={{0,(1u<<1)|(1u<<7),"First force"},{0,1u<<11,"Second force"}};ScriptSession session(compile("call SetPlayerRacePreference(Player(1),ConvertRacePref(3))\ncall SetPlayerController(Player(7),ConvertMapControl(3))\n"),map);session.configure();PlayerSetup setup(map,session.config());session.applySetup(setup);require(setup.slots().size()==2 && !setup.find(7) && setup.forces().size()==2 && setup.forces()[1].name=="Second force" && setup.find(11)->team==1,"Source forces or reserved controller changed");require(setup.find(1)->race==5 && session.config().players[1].racePreference==3 && session.config().players[7].controller==3,"Combined preference or reserved player was overwritten");});
    test("setup_team_alliances_preserve_config",[]{auto map=info();map.players[1].type=3;ScriptSession session(compile("call SetPlayerTeam(Player(1),0)\ncall SetPlayerTeam(Player(7),0)\ncall SetPlayerTeam(Player(11),0)\ncall SetPlayerAlliance(Player(1),Player(7),ConvertAllianceType(0),false)\n"),map);session.configure();PlayerSetup setup(map,session.config());session.applySetup(setup);auto& state=session.config();require((state.players[1].alliances[7]&31u)==30u && (state.players[7].alliances[1]&31u)==31u,"Config override or neutral teammate alliance lost");require((state.players[1].alliances[11]&31u)==0 && (state.players[1].alliances[12]&31u)==0,"Open or neutral special slot was allied");require(setup.control(11,SlotControl::Local) && setup.team(11,0),"Cannot update setup draft");session.applySetup(setup);require((state.players[7].alliances[1]&31u)==0 && (state.players[7].alliances[11]&31u)==31u,"Reapplied setup did not refresh team alliances");});
    test("setup_requires_successful_configuration",[]{auto map=info();ScriptSession session(compile(),map);PlayerSetup setup(map);bool rejected=false;try{session.applySetup(setup);}catch(const std::exception&){rejected=true;}require(rejected && !session.localPlayer(),"Unconfigured session accepted setup");session.configure();session.applySetup(setup);MapInfo noHumans;noHumans.players={{7,2,0,0,"cpu",{},0,0}};ScriptSession other(compile(),noHumans);other.configure();PlayerSetup cpu(noHumans,other.config());other.applySetup(cpu);require(!other.localPlayer() && other.config().players[7].slotState==1 && session.localPlayer()==1u,"Session local identity leaked");});
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into setup checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
