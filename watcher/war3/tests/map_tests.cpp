// Author: MiYu. Focused classic-map records, malformed sources and real archive checks.
#include "map.h"
#include "binary.h"
#include "fdf.h"
#include "map_ui.h"
#include "setup.h"
#include "object_data.h"
#include "placed_definition.h"
#include "session.h"
#include <StormLib.h>
#include <algorithm>
#include <cmath>
#include <functional>
#include <iostream>
#include <iomanip>
#include <sstream>

using namespace war3;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
template<class F> void rejects(F run) {try{run();}catch(const std::exception&){return;}throw std::runtime_error("Malformed map accepted");}
struct Source {
    Bytes b;
    void u32(unsigned n) {for(unsigned i=0;i<4;++i)b.push_back(std::uint8_t(n>>(8*i)));}
    void f32(float n) {u32(std::bit_cast<unsigned>(n));}
    void text(std::string_view s) {b.insert(b.end(),s.begin(),s.end());b.push_back(0);}
    void zeros(unsigned count) {for(unsigned i=0;i<count;++i)u32(0);}
};
Bytes info(unsigned version,bool omitted=false) {
    Source s;s.u32(version);s.u32(7);s.u32(6059);for(auto value:{"TRIGSTR_007","Author","Description","2 players"})s.text(value);s.zeros(12);s.u32(2);s.u32(1);s.u32(0);s.b.push_back('L');s.u32(0xffffffff);if(version==25)s.text("Loading.mdx");for(auto value:{"Text","Title","Subtitle"})s.text(value);s.u32(0xffffffff);if(version==25)s.text("");for(auto value:{"Prologue","Title","Subtitle"})s.text(value);if(version==25){s.zeros(5);s.u32(0);s.text("");s.b.push_back('L');s.u32(0xffffffff);}
    s.u32(2);for(unsigned id=0;id<2;++id){s.u32(id);s.u32(1);s.u32(id+1);s.u32(1);s.text("Player");s.f32(float(id*128));s.f32(64);s.u32(0);s.u32(0);}s.u32(1);s.u32(3);s.u32(3);s.text("Team");
    if(omitted){s.b.push_back(0xff);return s.b;}
    s.u32(1);s.u32(3);s.u32(tag("Rhme"));s.u32(2);s.u32(1);s.u32(1);s.u32(3);s.u32(tag("hfoo"));
    s.u32(1);s.u32(1);s.text("Units");s.u32(2);s.u32(0);s.u32(1);s.u32(1);s.u32(100);s.u32(tag("hfoo"));s.u32(tag("hpea"));
    if(version==25){s.u32(1);s.u32(2);s.text("Items");s.u32(1);s.u32(1);s.u32(100);s.u32(tag("ratf"));}return s.b;
}
Bytes terrain() {Source s;s.u32(tag("W3E!"));s.u32(11);s.b.push_back('L');s.u32(0);s.u32(1);s.u32(tag("Ldrt"));s.u32(1);s.u32(tag("CLdi"));s.u32(3);s.u32(2);s.f32(-128);s.f32(-64);for(unsigned i=0;i<6;++i)s.b.insert(s.b.end(),{0,32,0,32,0x40,0x21,2});return s.b;}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=3 && argc!=4){std::cerr<<"Usage: war3_map_tests <data-root> <scratch-directory> [test-name]\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){if(argc==4 && std::wstring(argv[3])!=wide(name))return;try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    test("object_missing_base_in_campaign",[&]{Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\HumanX03.w3x"},ArchiveScope::Common);require(bool(map),"Missing source campaign map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"HumanX03.w3x");ObjectData data(archives);auto id=ObjectData::code("n003"),base=ObjectData::code("nbsh");require(data.missingBases().contains(id) && data.missingBases().at(id)==base && !data.contains(id),"Missing base was not retained as unresolved");require(data.contains(ObjectData::code("hfoo")),"Valid source units were lost");bool diagnostic=false;try{data.field(id,"UnitData","race");}catch(const std::exception& e){auto text=std::string(e.what());diagnostic=text.find("nbsh")!=std::string::npos && text.find("n003")!=std::string::npos;}require(diagnostic,"Using unresolved object did not report both IDs");});
    test("preload_generator_roundtrip",[&]{
        auto dir=fs::absolute(argv[2])/L"preload-generator"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();auto& resources=session.world()->resources();vm.invoke("PreloadGenClear");vm.invoke("PreloadGenStart");require(bool(resources.read("Scripts\\common.j")),"Missing common script");require(bool(resources.read("UI\\MiscData.txt")),"Missing UI data");resources.read("Scripts\\common.j");vm.invoke("PreloadGenStart");vm.invoke("PreloadGenEnd",std::array{vm.string("nested\\generated.j")});auto output=dir/L"Preload"/L"nested"/L"generated.j";require(fs::is_regular_file(output),"Preload generator did not write output");std::ifstream file(output,std::ios::binary);std::string generated((std::istreambuf_iterator<char>(file)),{});require(generated.find("function PreloadFiles takes nothing returns nothing")!=std::string::npos && generated.find("scripts\\\\common.j")!=std::string::npos && generated.find("ui\\\\miscdata.txt")!=std::string::npos && generated.find("call PreloadEnd(")!=std::string::npos,"Generated script is incomplete");vm.invoke("PreloadGenEnd",std::array{vm.string("..\\escape.j")});require(!fs::exists(dir/L"escape.j"),"Generator escaped its user directory");require(bool(resources.read("Scripts\\Blizzard.j")) && resources.recordedMembers()->size()==3,"Generator stopped recording after output");vm.invoke("PreloadGenClear");vm.invoke("PreloadGenStart");vm.invoke("Preloader",std::array{vm.string("nested\\generated.j")});auto recorded=resources.recordedMembers();require(recorded && recorded->size()==2 && (*recorded)[0]=="scripts\\common.j" && (*recorded)[1]=="ui\\miscdata.txt","Generated preload script did not read recorded resources");vm.invoke("PreloadGenClear");require(resources.recordedMembers()->empty(),"Clear did not remove generated resource history");
    });
    test("preloader_common_natives",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-common"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"common-test.j",std::ios::binary);file<<"function PreloadFiles takes nothing returns nothing\ncall Preload( \"UI\\\\MiscData.\" + StringCase(\"TXT\", false) )\nendfunction\n";require(bool(file),"Cannot create preload source");}{std::ofstream bad(dir/L"Preload"/L"bad.j",std::ios::binary);bad<<"function broken takes nothing returns nothing\ncall\nendfunction\n";require(bool(bad),"Cannot create malformed preload source");}{std::ofstream missing(dir/L"Preload"/L"missing-native.j",std::ios::binary);missing<<"function PreloadFiles takes nothing returns nothing\ncall TriggerSleepAction(1.0)\nendfunction\n";require(bool(missing),"Cannot create unsupported native source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();auto& resources=session.world()->resources();vm.invoke("PreloadGenClear");vm.invoke("PreloadGenStart");vm.invoke("Preloader",std::array{vm.string("bad.j")});bool unbound=false;try{vm.invoke("Preloader",std::array{vm.string("missing-native.j")});}catch(const std::exception& e){unbound=std::string_view(e.what()).find("Unbound JASS native: TriggerSleepAction")!=std::string_view::npos;}require(unbound,"Unsupported preload native was hidden");vm.invoke("Preloader",std::array{vm.string("common-test.j")});auto names=resources.recordedMembers();require(names && std::find(names->begin(),names->end(),"ui\\miscdata.txt")!=names->end(),"Preloader did not execute common string native");vm.invoke("PreloadGenClear");
    });
    test("preloader_player_state_event",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-player"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"player.j",std::ios::binary);file<<"function PreloadFiles takes nothing returns nothing\ncall SetPlayerName(Player(0), \"Preload Player\")\ncall SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 200)\nendfunction\n";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(globals
integer observed=0
endglobals
function onPlayerChange takes nothing returns nothing
set observed=observed+1
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 0)
call TriggerRegisterPlayerStateEvent(t, Player(0), PLAYER_STATE_RESOURCE_GOLD, GREATER_THAN, 100.0)
call TriggerAddAction(t, function onPlayerChange)
endfunction
function runPreloader takes nothing returns nothing
call Preloader("player.j")
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"player-fixture.j",script,"preloader player fixture"}})),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("runPreloader");auto player=vm.invoke("Player",std::array{vm.integer(0)});auto name=vm.invoke("GetPlayerName",std::array{player});auto gold=vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_GOLD")});require(name.text && *name.text=="Preload Player" && gold.bits==200 && vm.global("observed").bits==1,"Preloader did not update player state and dispatch its event");
    });
    test("preloader_unit_state",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-unit"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"unit.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit u=CreateUnit(Player(0), 'hfoo', 0.0, 0.0, 0.0)
local unit discarded=CreateUnit(Player(0), 'hfoo', 0.0, 0.0, 0.0)
call SetUnitUserData(u, 2468)
if UnitAddAbility(u, 'AHbz') and GetUnitAbilityLevel(u, 'AHbz') == 1 and SetUnitAbilityLevel(u, 'AHbz', 2) == 2 and IncUnitAbilityLevel(u, 'AHbz') == 3 and DecUnitAbilityLevel(u, 'AHbz') == 2 and UnitMakeAbilityPermanent(u, true, 'AHbz') and UnitAddAbility(u, 'AHwe') and UnitRemoveAbility(u, 'AHwe') and GetUnitAbilityLevel(u, 'AHwe') == 0 then
    call SetUnitUserData(u, 2469)
endif
call SetUnitState(u, UNIT_STATE_MAX_MANA, 100.0)
call SetUnitState(u, UNIT_STATE_MANA, 42.0)
call SetUnitOwner(u, Player(1), false)
call SetUnitPosition(u, 0.0, 0.0)
call SetUnitX(u, 128.0)
call SetUnitY(u, 256.0)
if GetUnitTypeId(u) == 'hfoo' and GetUnitUserData(u) == 2469 and GetOwningPlayer(u) == Player(1) and GetUnitState(u, UNIT_STATE_MAX_MANA) == 100.0 and GetUnitState(u, UNIT_STATE_MANA) == 42.0 and GetUnitX(u) == 128.0 and GetUnitY(u) == 256.0 then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 1357)
endif
call RemoveUnit(discarded)
endfunction
)jass";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();auto before=session.units().size();vm.invoke("Preloader",std::array{vm.string("unit.j")});auto player=vm.invoke("Player",std::array{vm.integer(0)});require(vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_GOLD")}).bits==1357,"Preloader could not read created unit");require(session.units().size()==before+1,"Preloader unit creation or removal did not persist");auto found=std::find_if(session.units().begin(),session.units().end(),[](auto& entry){return entry.second->userData==2469;});require(found!=session.units().end() && found->second->type==ObjectData::code("hfoo") && found->second->abilities.at(ObjectData::code("AHbz"))==2 && found->second->permanentAbilities.at(ObjectData::code("AHbz")) && !found->second->abilities.contains(ObjectData::code("AHwe")) && found->second->owner==1 && std::bit_cast<float>(found->second->maxMana.bits())==100 && std::bit_cast<float>(found->second->mana.bits())==42 && std::bit_cast<float>(found->second->x.bits())==128 && std::bit_cast<float>(found->second->y.bits())==256,"Preloader unit state did not survive child runtime");
    });
    test("preloader_item_inventory",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-items"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"items.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit hero=CreateUnit(Player(0), 'Hamg', 0.0, 0.0, 0.0)
local item held=CreateItem('ratf', 0.0, 0.0)
local item discarded=CreateItem('ratf', 0.0, 0.0)
call SetUnitUserData(hero, 4826)
call SetItemUserData(held, 1234)
call SetItemCharges(held, 3)
if UnitAddItem(hero, held) then
    call SetItemPlayer(held, Player(1), true)
endif
if UnitHasItem(hero, held) and UnitItemInSlot(hero, 0) == held and UnitInventorySize(hero) > 0 and GetItemTypeId(held) == 'ratf' and GetItemUserData(held) == 1234 and GetItemCharges(held) == 3 and GetItemPlayer(held) == Player(1) then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 2468)
endif
call RemoveItem(discarded)
endfunction
)jass";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();auto before=session.items().size();vm.invoke("Preloader",std::array{vm.string("items.j")});auto player=vm.invoke("Player",std::array{vm.integer(0)});require(vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_GOLD")}).bits==2468,"Preloader item operations did not succeed");auto found=std::find_if(session.units().begin(),session.units().end(),[](auto& entry){return entry.second->userData==4826;});require(found!=session.units().end() && session.items().size()==before+1,"Preloader hero or item lifetime did not persist");auto id=found->second->inventory[0];require(id && session.items().contains(id) && session.items().at(id)->holder==found->first && session.items().at(id)->userData==1234 && session.items().at(id)->charges==3,"Preloader inventory did not survive child runtime");
    });
    test("preloader_item_event",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-item-event"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"pickup.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit hero=GetManipulatingUnit()
local item held=GetManipulatedItem()
if hero != null and held != null and GetItemTypeId(held) == 'ratf' then
    call SetItemUserData(held, 4312)
    call SetUnitUserData(hero, 6789)
endif
endfunction
)jass";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(globals
unit hero=null
item held=null
endglobals
function onPickup takes nothing returns nothing
call Preloader("pickup.j")
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
set hero=CreateUnit(Player(0), 'Hamg', 0.0, 0.0, 0.0)
set held=CreateItem('ratf', 0.0, 0.0)
call TriggerRegisterUnitEvent(t, hero, EVENT_UNIT_PICKUP_ITEM)
call TriggerAddAction(t, function onPickup)
endfunction
function pick takes nothing returns nothing
call UnitAddItem(hero, held)
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"item-event.j",script,"preloader item event fixture"}})),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("pick");auto hero=vm.global("hero"),held=vm.global("held");require(session.units().at(hero.bits)->userData==6789 && session.items().at(held.bits)->userData==4312 && session.items().at(held.bits)->holder==hero.bits,"Preloader pickup context or inventory state was lost");
    });
    test("preloader_unit_orders",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-orders"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"orders.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit u=CreateUnit(Player(0), 'hfoo', 0.0, 0.0, 0.0)
local unit target=CreateUnit(Player(0), 'hfoo', 500.0, 0.0, 0.0)
local location p=Location(500.0, 0.0)
call SetUnitPathing(u, false)
if IssuePointOrder(u, "move", 500.0, 0.0) and GetUnitUserData(u) == 42 and GetUnitCurrentOrder(u) == OrderId("move") then
    if IssueTargetOrder(u, "smart", target) and GetUnitUserData(u) == 84 and IssueTargetOrderById(u, OrderId("smart"), target) then
        if OrderId2String(OrderId("move")) == "move" and IssueImmediateOrder(u, "stop") and IssuePointOrderById(u, OrderId("move"), 500.0, 0.0) and IssueImmediateOrderById(u, OrderId("stop")) and IssuePointOrderLoc(u, "move", p) and IssuePointOrderByIdLoc(u, OrderId("move"), p) then
            call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 3691)
        endif
    endif
endif
call RemoveLocation(p)
endfunction
)jass";require(bool(file),"Cannot create preload source");}
        {std::ofstream file(dir/L"Preload"/L"point.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit u=GetOrderedUnit()
local location p=GetOrderPointLoc()
if u != null and GetIssuedOrderId() == OrderId("move") and GetOrderPointX() == 500.0 and GetOrderPointY() == 0.0 and GetLocationX(p) == 500.0 then
    call SetUnitUserData(u, 42)
endif
call RemoveLocation(p)
endfunction
)jass";require(bool(file),"Cannot create point-event source");}
        {std::ofstream file(dir/L"Preload"/L"target.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit u=GetOrderedUnit()
local unit target=GetOrderTargetUnit()
if u != null and target != null and GetIssuedOrderId() == OrderId("smart") and GetUnitTypeId(target) == 'hfoo' then
    call SetUnitUserData(u, 84)
endif
endfunction
)jass";require(bool(file),"Cannot create target-event source");}Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/L"Maps/(2)BootyBay.w3m");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(function onPoint takes nothing returns nothing
call Preloader("point.j")
endfunction
function onTarget takes nothing returns nothing
call Preloader("target.j")
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger p=CreateTrigger()
local trigger t=CreateTrigger()
call TriggerRegisterPlayerUnitEvent(p, Player(0), EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER, null)
call TriggerAddAction(p, function onPoint)
call TriggerRegisterPlayerUnitEvent(t, Player(0), EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER, null)
call TriggerAddAction(t, function onTarget)
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"order-events.j",script,"preloader order fixture"}})),info);session.attachWorld(std::move(world));session.audioMuted(true);session.audioSimulationClock();session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("Preloader",std::array{vm.string("orders.j")});auto player=vm.invoke("Player",std::array{vm.integer(0)});require(vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_GOLD")}).bits==3691,"Preloader order or nested event context failed");auto found=std::find_if(session.units().begin(),session.units().end(),[](auto& entry){return entry.second->userData==42;});require(found!=session.units().end(),"Ordered unit or final point event missing");auto unit=found->second;auto x=std::bit_cast<float>(unit->x.bits());session.advance(1);require(std::bit_cast<float>(unit->x.bits())>x+1,"Preloader order did not continue after child runtime");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("preloader_unit_event_context",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-unit-event"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"unit-event.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit u=GetTriggerUnit()
if u != null and GetTriggeringTrigger() != null and GetTriggerPlayer() == Player(0) and GetUnitState(u, UNIT_STATE_LIFE) == 50.0 then
    call SetUnitUserData(u, 2468)
endif
endfunction
)jass";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(globals
unit subject=null
integer observed=0
endglobals
function onUnitState takes nothing returns nothing
call Preloader("unit-event.j")
set observed=GetUnitUserData(GetTriggerUnit())
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
set subject=CreateUnit(Player(0), 'hfoo', 0.0, 0.0, 0.0)
call TriggerRegisterUnitStateEvent(t, subject, UNIT_STATE_LIFE, LESS_THAN, 100.0)
call TriggerAddAction(t, function onUnitState)
endfunction
function runPreloaderEvent takes nothing returns nothing
call SetUnitState(subject, UNIT_STATE_LIFE, 50.0)
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"unit-event-fixture.j",script,"preloader unit event fixture"}})),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("runPreloaderEvent");require(vm.global("observed").bits==2468,"Preloader lost main unit event context or state change");auto subject=vm.global("subject");require(session.units().at(subject.bits)->userData==2468,"Preloader event unit state did not persist");
    });
    test("preloader_nested_unit_death",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-unit-death"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"kill.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit u=GetTriggerUnit()
call KillUnit(u)
if GetTriggerUnit() == u and GetDyingUnit() == null and GetUnitUserData(u) == 9000 then
    call SetUnitUserData(u, 9001)
endif
endfunction
)jass";require(bool(file),"Cannot create kill preload source");}{std::ofstream file(dir/L"Preload"/L"death.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
if GetDyingUnit() == GetTriggerUnit() and GetDyingUnit() != null and GetKillingUnit() == null then
    call SetUnitUserData(GetDyingUnit(), 9000)
endif
endfunction
)jass";require(bool(file),"Cannot create death preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(globals
unit subject=null
integer observed=0
endglobals
function onDeath takes nothing returns nothing
call Preloader("death.j")
endfunction
function onUnitState takes nothing returns nothing
call Preloader("kill.j")
set observed=GetUnitUserData(GetTriggerUnit())
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger stateTrigger=CreateTrigger()
local trigger deathTrigger=CreateTrigger()
set subject=CreateUnit(Player(0), 'hfoo', 0.0, 0.0, 0.0)
call TriggerRegisterUnitStateEvent(stateTrigger, subject, UNIT_STATE_LIFE, LESS_THAN, 100.0)
call TriggerAddAction(stateTrigger, function onUnitState)
call TriggerRegisterUnitEvent(deathTrigger, subject, EVENT_UNIT_DEATH)
call TriggerAddAction(deathTrigger, function onDeath)
endfunction
function runDeath takes nothing returns nothing
call SetUnitState(subject, UNIT_STATE_LIFE, 50.0)
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"unit-death-fixture.j",script,"preloader nested death fixture"}})),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("runDeath");require(vm.global("observed").bits==9001,"Nested preload death context or outer context restoration failed");auto subject=vm.global("subject");require(session.units().at(subject.bits)->userData==9001 && std::bit_cast<float>(session.units().at(subject.bits)->life.bits())==0,"Nested preload death state did not persist");
    });
    test("preloader_nested_damage",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-unit-damage"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"attack.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit target=GetTriggerUnit()
local unit source=CreateUnit(Player(1), 'hfoo', 0.0, 0.0, 0.0)
call SetUnitUserData(source, 77)
if UnitDamageTarget(source, target, 10000.0, true, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS) and GetTriggerUnit() == target and GetUnitUserData(target) == 222 then
    call SetUnitUserData(target, 333)
endif
endfunction
)jass";require(bool(file),"Cannot create attack preload source");}{std::ofstream file(dir/L"Preload"/L"damage.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
if GetTriggerUnit() != null and GetEventDamage() > 0.0 and GetUnitUserData(GetEventDamageSource()) == 77 then
    call SetUnitUserData(GetTriggerUnit(), 111)
endif
endfunction
)jass";require(bool(file),"Cannot create damage preload source");}{std::ofstream file(dir/L"Preload"/L"death.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
if GetDyingUnit() == GetTriggerUnit() and GetUnitUserData(GetDyingUnit()) == 111 and GetUnitUserData(GetKillingUnit()) == 77 then
    call SetUnitUserData(GetDyingUnit(), 222)
endif
endfunction
)jass";require(bool(file),"Cannot create death preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(globals
unit subject=null
integer observed=0
endglobals
function onDamage takes nothing returns nothing
call Preloader("damage.j")
endfunction
function onDeath takes nothing returns nothing
call Preloader("death.j")
endfunction
function onUnitState takes nothing returns nothing
call Preloader("attack.j")
set observed=GetUnitUserData(GetTriggerUnit())
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger stateTrigger=CreateTrigger()
local trigger damageTrigger=CreateTrigger()
local trigger deathTrigger=CreateTrigger()
set subject=CreateUnit(Player(0), 'hfoo', 0.0, 0.0, 0.0)
call TriggerRegisterUnitStateEvent(stateTrigger, subject, UNIT_STATE_LIFE, LESS_THAN, 100.0)
call TriggerAddAction(stateTrigger, function onUnitState)
call TriggerRegisterUnitEvent(damageTrigger, subject, EVENT_UNIT_DAMAGED)
call TriggerAddAction(damageTrigger, function onDamage)
call TriggerRegisterUnitEvent(deathTrigger, subject, EVENT_UNIT_DEATH)
call TriggerAddAction(deathTrigger, function onDeath)
endfunction
function runDamage takes nothing returns nothing
call SetUnitState(subject, UNIT_STATE_LIFE, 50.0)
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"unit-damage-fixture.j",script,"preloader nested damage fixture"}})),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("runDamage");require(vm.global("observed").bits==333,"Nested preload damage, killer, or outer context restoration failed");auto subject=vm.global("subject");require(session.units().at(subject.bits)->userData==333 && std::bit_cast<float>(session.units().at(subject.bits)->life.bits())==0,"Nested preload damage state did not persist");
    });
    test("preloader_destructable_lifecycle",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-destructable"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"tree.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local destructable target=GetOrderTargetDestructable()
local destructable other=CreateDeadDestructable('LTlt', 512.0, 0.0, 0.0, 1.0, 0)
call DestructableRestoreLife(other, 200.0, true)
call SetDestructableMaxLife(other, 300.0)
call SetDestructableLife(other, 200.0)
call SetDestructableInvulnerable(other, true)
if target != null and GetDestructableTypeId(target) == 'LTlt' and GetDestructableX(target) == 100.0 and GetDestructableY(target) == 0.0 and GetDestructableLife(other) == 200.0 and GetDestructableMaxLife(other) == 300.0 and IsDestructableInvulnerable(other) then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 301)
endif
call RemoveDestructable(other)
if GetDestructableTypeId(other) == 0 then
    call KillDestructable(target)
endif
endfunction
)jass";require(bool(file),"Cannot create tree preload source");}{std::ofstream file(dir/L"Preload"/L"death.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
if GetTriggerDestructable() != null and GetTriggerDestructable() == GetTriggerWidget() and GetDestructableTypeId(GetTriggerDestructable()) == 'LTlt' then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_LUMBER, 302)
endif
endfunction
)jass";require(bool(file),"Cannot create tree death source");}Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/L"Maps/(2)BootyBay.w3m");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script=R"jass(globals
destructable tree=null
unit worker=null
endglobals
function onOrder takes nothing returns nothing
call Preloader("tree.j")
endfunction
function onDeath takes nothing returns nothing
call Preloader("death.j")
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
local trigger orderTrigger=CreateTrigger()
local trigger deathTrigger=CreateTrigger()
set tree=CreateDestructable('LTlt', 100.0, 0.0, 0.0, 1.0, 0)
set worker=CreateUnit(Player(0), 'hpea', 0.0, 0.0, 0.0)
call SetUnitPathing(worker, false)
call TriggerRegisterPlayerUnitEvent(orderTrigger, Player(0), EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER, null)
call TriggerAddAction(orderTrigger, function onOrder)
call TriggerRegisterDeathEvent(deathTrigger, tree)
call TriggerAddAction(deathTrigger, function onDeath)
endfunction
function runTree takes nothing returns nothing
call IssueTargetOrder(worker, "harvest", tree)
endfunction
)jass";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"tree-fixture.j",script,"preloader destructable fixture"}})),info);session.attachWorld(std::move(world));session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("runTree");auto player=vm.invoke("Player",std::array{vm.integer(0)});require(vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_GOLD")}).bits==301 && vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_LUMBER")}).bits==302,"Preloader destructable lifecycle or nested death context failed");auto target=vm.global("tree");require(session.destructables().contains(target.bits) && session.destructables().at(target.bits)->life==0,"Preloader did not kill the actual tree");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    });
    test("preloader_point_damage_widget",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-point-damage"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"point.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local unit source=CreateUnit(Player(0), 'hfoo', 1024.0, 0.0, 0.0)
local unit immediate=CreateUnit(Player(1), 'hfoo', 0.0, 0.0, 0.0)
local unit delayed=CreateUnit(Player(1), 'hfoo', 512.0, 0.0, 0.0)
call SetUnitUserData(immediate, 301)
call SetUnitUserData(delayed, 302)
call SetWidgetLife(immediate, 100.0)
call SetWidgetLife(delayed, 100.0)
if GetWidgetLife(immediate) == 100.0 and GetWidgetX(delayed) == 512.0 and GetWidgetY(delayed) == 0.0 then
    call SetUnitUserData(source, 303)
endif
call UnitDamagePoint(source, 0.0, 64.0, 0.0, 0.0, 20.0, true, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
call UnitDamagePoint(source, 0.5, 64.0, 512.0, 0.0, 20.0, true, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
endfunction
)jass";require(bool(file),"Cannot create point damage preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;auto common=archives.readCandidates({"Scripts\\common.j"},ArchiveScope::Common);require(bool(common),"Missing common script");std::string script="function config takes nothing returns nothing\nendfunction\nfunction main takes nothing returns nothing\nendfunction\n";ScriptSession session(jass::Module::compile(jass::Program::parse({{"Scripts\\common.j",sourceText(common->bytes),common->source},{"point-fixture.j",script,"point damage fixture"}})),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();vm.invoke("Preloader",std::array{vm.string("point.j")});std::shared_ptr<UnitState> immediate,delayed,source;for(auto& [id,u]:session.units()){if(u->userData==301)immediate=u;else if(u->userData==302)delayed=u;else if(u->userData==303)source=u;}require(source && immediate && delayed,"Preloader widget lookup or coordinates failed");auto life=[](const auto& u){return std::bit_cast<float>(u->life.bits());};require(life(immediate)<100 && life(delayed)==100,"Immediate or delayed point damage timing differs");session.advance(.75);require(life(delayed)<100,"Delayed point damage did not survive child runtime");
    });
    test("preloader_gamecache_persistence",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-cache"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"cache.j",std::ios::binary);file<<"function PreloadFiles takes nothing returns nothing\nlocal gamecache c=InitGameCache(\"preload.w3v\")\ncall StoreInteger(c, \"mission\", \"score\", 2468)\ncall StoreString(c, \"mission\", \"name\", \"from preload\")\ncall SaveGameCache(c)\nendfunction\n";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();vm.invoke("Preloader",std::array{vm.string("cache.j")});auto cache=vm.invoke("InitGameCache",std::array{vm.string("preload.w3v")});auto mission=vm.string("mission"),score=vm.string("score"),name=vm.string("name");require(cache.bits && vm.invoke("GetStoredInteger",std::array{cache,mission,score}).bits==2468,"Preloader gamecache integer missing");auto value=vm.invoke("GetStoredString",std::array{cache,mission,name});require(value.text && *value.text=="from preload","Preloader gamecache string did not survive runtime destruction");vm.invoke("FlushGameCache",std::array{cache});require(vm.invoke("ReloadGameCachesFromDisk").bits && vm.invoke("GetStoredInteger",std::array{cache,mission,score}).bits==2468,"Preloader gamecache did not persist");value=vm.invoke("GetStoredString",std::array{cache,mission,name});require(value.text && *value.text=="from preload","Preloader gamecache string did not reload");
    });
    test("region_subtraction_boundaries",[&]{
        auto r=[](float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));};auto box=[&](float x,float y,float ex,float ey){return WorldRect{r(x),r(y),r(ex),r(ey)};};auto inside=[&](const SpatialRegion& region,float x,float y){return region.contains({r(x),r(y)});};SpatialRegion region;region.add(box(0,0,100,100));region.clear(box(25,25,75,75));for(auto [x,y]:std::initializer_list<std::pair<float,float>>{{25.f,50.f},{75.f,50.f},{50.f,25.f},{50.f,75.f},{25.f,25.f},{75.f,75.f},{50.f,50.f}})require(!inside(region,x,y),"Cleared region includes its boundary");require(inside(region,std::nextafter(25.f,0.f),50) && inside(region,std::nextafter(75.f,100.f),50) && inside(region,0,0) && inside(region,100,100),"Region subtraction lost neighboring points");region.clear(box(0,0,100,100));require(region.rectangles.empty(),"Full clear left region geometry");region.add(box(0,0,100,100));region.clear(box(50,0,50,100));require(!inside(region,50,50) && inside(region,std::nextafter(50.f,0.f),50) && inside(region,std::nextafter(50.f,100.f),50),"Degenerate clear did not remove the line");SpatialRegion cells;auto cell=[&](float x,float y){return SpatialRegion::cell({r(x),r(y)});};cells.add(cell(0,0));cells.add(cell(32,0));cells.clear(cell(0,0));require(!inside(cells,0,0) && !inside(cells,std::nextafter(32.f,0.f),0) && inside(cells,32,0) && inside(cells,63,0),"Clearing a cell changed its neighboring cell");
    });
    test("preloader_hashtable_handles",[&]{
        auto dir=fs::absolute(argv[2])/L"preloader-hashtable"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir/L"Preload"),"Cannot create preload user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set preload user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        {std::ofstream file(dir/L"Preload"/L"table.j",std::ios::binary);file<<R"jass(function PreloadFiles takes nothing returns nothing
local hashtable a=InitHashtable()
local hashtable b=InitHashtable()
call SavePlayerHandle(a, 1, 1, Player(0))
call SetRandomSeed(12345)
call StoreInteger(InitGameCache("preload-random.w3v"), "random", "value", GetRandomInt(1, 100000))
call SaveHashtableHandle(a, 1, 2, b)
call SaveLocationHandle(a, 1, 3, Location(1.0, 2.0))
call MoveLocation(LoadLocationHandle(a, 1, 3), 246.0, 135.0)
call SaveRectHandle(a, 1, 4, Rect(0.0, 0.0, 20.0, 40.0))
call MoveRectToLoc(LoadRectHandle(a, 1, 4), LoadLocationHandle(a, 1, 3))
call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, R2I(GetRectCenterX(LoadRectHandle(a, 1, 4))))
call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_LUMBER, R2I(GetRectCenterY(LoadRectHandle(a, 1, 4))))
call RemoveRect(LoadRectHandle(a, 1, 4))
if GetRectMinX(null) != 0.0 or GetRectMinY(LoadRectHandle(a, 1, 4)) != 0.0 or GetRectMaxX(null) != 0.0 or GetRectMaxY(LoadRectHandle(a, 1, 4)) != 0.0 or GetRectCenterX(null) != 0.0 or GetRectCenterY(LoadRectHandle(a, 1, 4)) != 0.0 then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, -1)
endif
call RemoveRect(LoadRectHandle(a, 1, 4))
call SetRect(LoadRectHandle(a, 1, 4), 0.0, 0.0, 1.0, 1.0)
call SetRectFromLoc(null, LoadLocationHandle(a, 1, 3), LoadLocationHandle(a, 1, 3))
call MoveRectTo(LoadRectHandle(a, 1, 4), 0.0, 0.0)
call RemoveLocation(LoadLocationHandle(a, 1, 3))
if RectFromLoc(null, LoadLocationHandle(a, 1, 3)) != null then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_LUMBER, -1)
endif
call MoveLocation(LoadLocationHandle(a, 1, 3), 50.0, 60.0)
call MoveLocation(null, 50.0, 60.0)
if GetLocationZ(LoadLocationHandle(a, 1, 3)) != 0.0 or GetLocationZ(null) != 0.0 then
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, -1)
endif
call SaveStr(b, 2, 1, "Table Player")
call SetPlayerName(LoadPlayerHandle(a, 1, 1), LoadStr(LoadHashtableHandle(a, 1, 2), 2, 1))
endfunction
)jass";require(bool(file),"Cannot create preload source");}Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing source map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();vm.invoke("Preloader",std::array{vm.string("table.j")});auto player=vm.invoke("Player",std::array{vm.integer(0)});auto zero=vm.real(jass::Real{}),edge=vm.real(jass::Real::fromBits(0x42c80000));auto region=vm.invoke("CreateRegion"),rect=vm.invoke("Rect",std::array{zero,zero,edge,edge}),point=vm.invoke("Location",std::array{zero,zero});vm.invoke("RegionAddRect",std::array{region,rect});require(vm.invoke("IsPointInRegion",std::array{region,zero,zero}).bits && vm.invoke("IsLocationInRegion",std::array{region,point}).bits,"Valid region did not contain its point");auto emptyRegion=vm.handle("region",0),emptyRect=vm.handle("rect",0),emptyLoc=vm.handle("location",0),emptyUnit=vm.handle("unit",0);for(auto native:{"RegionAddRect","RegionClearRect"}){vm.invoke(native,std::array{region,emptyRect});vm.invoke(native,std::array{emptyRegion,rect});}for(auto native:{"RegionAddCell","RegionClearCell"})vm.invoke(native,std::array{emptyRegion,zero,zero});for(auto native:{"RegionAddCellAtLoc","RegionClearCellAtLoc"}){vm.invoke(native,std::array{region,emptyLoc});vm.invoke(native,std::array{emptyRegion,point});}require(!vm.invoke("IsPointInRegion",std::array{emptyRegion,zero,zero}).bits && !vm.invoke("IsLocationInRegion",std::array{region,emptyLoc}).bits && !vm.invoke("IsUnitInRegion",std::array{region,emptyUnit}).bits && vm.invoke("IsLocationInRegion",std::array{region,point}).bits,"Invalid region inputs changed region or produced a match");vm.invoke("RemoveRegion",std::array{region});vm.invoke("RemoveRegion",std::array{region});require(!vm.invoke("IsPointInRegion",std::array{region,zero,zero}).bits,"Removed region still matched a point");vm.invoke("RemoveRect",std::array{rect});vm.invoke("RemoveLocation",std::array{point});auto name=vm.invoke("GetPlayerName",std::array{player});require(name.text && *name.text=="Table Player","Preloader hashtable lost player or nested table handle");for(auto native:{"GetRectMinX","GetRectMinY","GetRectMaxX","GetRectMaxY","GetRectCenterX","GetRectCenterY"})require(vm.invoke(native,std::array{vm.handle("rect",player.bits)}).bits==0,"Rectangle query accepted an incompatible handle");require(vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_GOLD")}).bits==246 && vm.invoke("GetPlayerState",std::array{player,vm.global("PLAYER_STATE_RESOURCE_LUMBER")}).bits==135,"Preloader hashtable lost spatial handles or movement");auto cache=vm.invoke("InitGameCache",std::array{vm.string("preload-random.w3v")});auto saved=vm.invoke("GetStoredInteger",std::array{cache,vm.string("random"),vm.string("value")});auto next=vm.invoke("GetRandomInt",std::array{vm.integer(1),vm.integer(100000)});vm.invoke("SetRandomSeed",std::array{vm.integer(12345)});auto expected=vm.invoke("GetRandomInt",std::array{vm.integer(1),vm.integer(100000)});auto expectedNext=vm.invoke("GetRandomInt",std::array{vm.integer(1),vm.integer(100000)});require(saved.bits==expected.bits && next.bits==expectedNext.bits,"Preloader did not share the session random stream");
    });
    test("campaign_nightelf_finale",[&]{
        auto dir=fs::absolute(argv[2])/L"campaign-nightelf-finale"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir),"Cannot create campaign user directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set campaign user directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}}restore{length,previous};
        auto start=[&](const char* path){Archives a(argv[1]);auto map=a.readCandidates({path},ArchiveScope::Common);require(bool(map),"Missing campaign map");a.mountMap(std::make_shared<const Bytes>(map->bytes),path);auto world=World::read(a);auto info=world->data().info;MapStrings strings;if(auto wts=a.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(jass::Module::compile(jass::Program::read(a)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(world));session->audioSimulationClock();session->audioMuted(true);session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);session->startMain();return session;};
        auto session=start("Maps\\FrozenThrone\\Campaign\\NightElfX08.w3x");auto& vm=session->runtime();auto protect=[&]{for(auto& [id,u]:session->units())if(u->owner==0 || u->owner==1 || u->owner==3)u->invulnerable=true;};for(int i=0;i<800 && session->exitRequest()==SessionExit::None;++i){protect();session->advance(.25);}require(session->userControl() && session->exitRequest()==SessionExit::None,"Final chapter did not restore player control");auto trolls=vm.global("udg_TrollVillage");std::vector<std::uint32_t> targets;for(auto& [id,u]:session->units())if(vm.invoke("IsUnitInGroup",std::array{vm.handle("unit",id),trolls}).bits)targets.push_back(id);require(!targets.empty(),"Original troll village is empty");for(auto id:targets){auto unit=vm.handle("unit",id);vm.invoke("SetUnitInvulnerable",std::array{unit,vm.boolean(false)});vm.invoke("KillUnit",std::array{unit});}for(int i=0;i<400 && session->exitRequest()==SessionExit::None;++i){protect();session->advance(.25);}auto quest=vm.global("udg_QuestDam");require(session->quests().contains(quest.bits) && session->quests().at(quest.bits)->completed,"Original dam quest did not complete");targets.clear();auto structure=vm.global("UNIT_TYPE_STRUCTURE");for(auto& [id,u]:session->units())if(u->owner==4 && vm.invoke("IsUnitType",std::array{vm.handle("unit",id),structure}).bits)targets.push_back(id);require(!targets.empty(),"Original enemy structures are missing");for(auto id:targets){auto unit=vm.handle("unit",id);vm.invoke("SetUnitInvulnerable",std::array{unit,vm.boolean(false)});vm.invoke("KillUnit",std::array{unit});}for(int i=0;i<3600 && session->exitRequest()==SessionExit::None;++i){protect();session->advance(.25);for(auto& [id,dialog]:session->dialogs())if(dialog->owners && !dialog->buttons.empty()){session->clickDialog(session->localPlayer().value_or(1),dialog->buttons.front());break;}}require(session->exitRequest()==SessionExit::ChangeLevel && session->nextLevel()=="Maps\\FrozenThrone\\Campaign\\NightElfX08Finale.w3x","Final chapter did not request its finale");session.reset();auto finale=start("Maps\\FrozenThrone\\Campaign\\NightElfX08Finale.w3x");for(int i=0;i<2400 && finale->exitRequest()==SessionExit::None;++i)finale->advance(.25);require(finale->exitRequest()==SessionExit::Return,"Original finale did not return");
    });
    test("campaign_expansion_credits",[&]{
        auto dir=fs::absolute(argv[2])/L"campaign-expansion-credits"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir),"Cannot create isolated credits directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set isolated credits directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}} restore{length,previous};
        Archives a(argv[1]);auto map=a.readCandidates({"Maps\\FrozenThrone\\Campaign\\War3XBonusCredits.w3x"},ArchiveScope::Common);require(bool(map),"Missing expansion credits map");a.mountMap(std::make_shared<const Bytes>(map->bytes),"War3XBonusCredits.w3x");auto world=World::read(a);auto info=world->data().info;MapStrings strings;if(auto wts=a.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);ScriptSession session(jass::Module::compile(jass::Program::read(a)),info,std::move(strings));session.campaignContext(true,1);session.attachWorld(std::move(world));session.audioSimulationClock();session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);auto& vm=session.runtime();auto missingBefore=session.preloadMissing().size();vm.invoke("Preload",std::array{jass::Value{vm.module().typeId("string"),0,{}}});vm.invoke("Preload",std::array{vm.string("")});require(session.preloadMissing().size()==missingBefore,"Empty preload added a missing resource");vm.invoke("PreloadEnd",std::array{vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(-1.f)))});auto cache=vm.invoke("InitGameCache",std::array{vm.string("Campaigns.w3v")});require(cache.bits,"Cannot prepare credits cache");vm.invoke("StoreBoolean",std::array{cache,vm.string("CreditsEx"),vm.string("Victory"),vm.boolean(true)});require(vm.invoke("SaveGameCache",std::array{cache}).bits,"Cannot save credits flag");session.startMain();for(int i=0;i<2400 && session.exitRequest()==SessionExit::None;++i)session.advance(.25);require(session.exitRequest()==SessionExit::Return,"Expansion credits did not return from its original script");
    });
    test("campaign_restored_channel",[&]{
        auto dir=fs::absolute(argv[2])/L"campaign-restored-channel"/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(fs::create_directories(dir),"Cannot create isolated campaign directory");wchar_t previous[32768];auto length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",previous,32768);require(length<32768 && SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",dir.c_str()),"Cannot set isolated campaign directory");struct Restore{DWORD length;wchar_t* value;~Restore(){SetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",length?value:nullptr);}} restore{length,previous};
        auto start=[&](const char* path){Archives a(argv[1]);auto map=a.readCandidates({path},ArchiveScope::Common);require(bool(map),"Missing source campaign map");a.mountMap(std::make_shared<const Bytes>(map->bytes),path);auto world=World::read(a);auto info=world->data().info;MapStrings strings;if(auto wts=a.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto session=std::make_unique<ScriptSession>(jass::Module::compile(jass::Program::read(a)),info,std::move(strings));session->campaignContext(true,1);session->attachWorld(std::move(world));session->audioSimulationClock();session->audioMuted(true);session->configure();PlayerSetup setup(info,session->config());session->applySetup(setup);session->startMain();return session;};
        {auto session=start("Maps\\FrozenThrone\\Campaign\\UndeadX07c.w3x");for(int i=0;i<80;++i)session->advance(.25);auto& vm=session->runtime();auto hero=vm.global("udg_Arthas");require(session->units().contains(hero.bits),"Source hero missing");auto channel=vm.integer(int(ObjectData::code("ANcl")));require(!vm.invoke("GetUnitAbilityLevel",std::array{hero,channel}).bits,"Source hero unexpectedly has destination ability");vm.invoke("SetUnitUserData",std::array{hero,vm.integer(2468)});auto cache=vm.invoke("InitGameCache",std::array{vm.string("Campaigns.w3v")});require(vm.invoke("StoreUnit",std::array{cache,vm.string("UndeadX08"),vm.string("Arthas"),hero}).bits && vm.invoke("SaveGameCache",std::array{cache}).bits,"Cannot store source hero");}
        auto session=start("Maps\\FrozenThrone\\Campaign\\UndeadX08.w3x");for(int i=0;i<800 && session->exitRequest()==SessionExit::None;++i)session->advance(.25);auto& vm=session->runtime();auto hero=vm.global("udg_Arthas"),rect=vm.global("gg_rct_Obelisk_01");require(session->userControl() && session->units().contains(hero.bits) && vm.invoke("GetUnitUserData",std::array{hero}).bits==2468 && vm.invoke("GetUnitAbilityLevel",std::array{hero,vm.integer(int(ObjectData::code("ANcl")))}).bits,"Restored hero lost source-map channel ability");vm.invoke("SetUnitInvulnerable",std::array{hero,vm.boolean(true)});vm.invoke("SetUnitPosition",std::array{hero,vm.invoke("GetRectCenterX",std::array{rect}),vm.invoke("GetRectCenterY",std::array{rect})});bool casting=false;for(int i=0;i<132 && session->exitRequest()==SessionExit::None;++i){session->advance(.25);auto u=session->units().at(hero.bits);if(vm.global("udg_ArthasSummoning").bits && u->cast){casting=true;require(vm.invoke("RectContainsUnit",std::array{rect,hero}).bits,"Channeling hero left the obelisk");}}require(casting && vm.global("udg_Obelisk01ArthasOwned").bits && vm.global("udg_ObeliskArthasCount").bits>=1,"Original obelisk channel did not finish");
    });
    test("campaign_walkable_stairs",[&]{Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\HumanX03.w3x"},ArchiveScope::Common);require(bool(map),"Missing source campaign map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"HumanX03.w3x");auto world=World::read(archives);auto info=world->data().info;MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info,std::move(strings));session.campaignContext(true,1);session.attachWorld(std::move(world));session.audioSimulationClock();session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();std::shared_ptr<DestructableState> stairs;for(auto& [id,d]:session.destructables())if(d->type==ObjectData::code("ZTr0") && std::bit_cast<float>(d->position.x.bits())==-3072.f && std::bit_cast<float>(d->position.y.bits())==1664.f)stairs=d;require(stairs && stairs->walkable,"Source stair not found");auto blocked=[&](float x,float y){auto index=session.world()->pathCell(x,y);if(!index)return false;for(auto c:stairs->footprint)if(c.index==*index && (c.mask&2))return true;return false;};require(!blocked(-2720,1616) && blocked(-3072,2016),"Stair footprint does not follow its model");for(int i=0;i<560;++i)session.advance(.25);require(session.userControl(),"Original intro did not restore player control");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");});
    test("campaign_elevator_surface",[&]{Archives archives(argv[1]);auto map=archives.readCandidates({"Maps\\FrozenThrone\\Campaign\\UndeadX07c.w3x"},ArchiveScope::Common);require(bool(map),"Missing source campaign map");archives.mountMap(std::make_shared<const Bytes>(map->bytes),"UndeadX07c.w3x");auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.campaignContext(true,1);session.attachWorld(std::move(world));session.audioSimulationClock();session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();std::shared_ptr<DestructableState> elevator;for(auto& [id,d]:session.destructables())if(d->type==ObjectData::code("DTrf") && d->solid && d->visible && std::bit_cast<float>(d->position.x.bits())==640.f && std::bit_cast<float>(d->position.y.bits())==2176.f)elevator=d;require(bool(elevator),"Source elevator missing");auto& vm=session.runtime();auto handle=vm.handle("destructable",elevator->handle);auto real=[](float x){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(x));};auto position=elevator->position;auto hero=vm.invoke("CreateUnit",std::array{vm.invoke("Player",std::array{vm.integer(0)}),vm.integer(int(ObjectData::code("hfoo"))),vm.real(position.x),vm.real(position.y),vm.real(real(0))});require(session.units().contains(hero.bits),"Elevator test unit missing");auto unit=session.units().at(hero.bits);unit->invulnerable=true;unit->acquireRange=real(0);vm.invoke("SetDestructableAnimation",std::array{handle,vm.string("stand")});vm.invoke("SetDestructableOccluderHeight",std::array{handle,vm.real(real(0))});auto low=session.walkableSurface(position);require(low.has_value(),"Lower platform surface missing");vm.invoke("ChangeElevatorHeight",std::array{handle,vm.integer(2)});session.advance(.5);auto moving=session.walkableSurface(position);session.advance(1.5);auto high=session.walkableSurface(position);require(moving && high && *moving>*low+10 && *high>*moving+10 && *high>*low+100,"Elevator surface did not follow the source animation");require(unit->x.bits()==position.x.bits() && unit->y.bits()==position.y.bits(),"Standing unit left the elevator");auto item=vm.invoke("CreateItem",std::array{vm.integer(int(ObjectData::code("ratf"))),vm.real(position.x),vm.real(position.y)});require(item.bits && session.items().contains(item.bits),"Elevator test item missing");session.world()->block(640,2176);auto rect=vm.invoke("Rect",std::array{vm.real(real(608)),vm.real(real(2144)),vm.real(real(672)),vm.real(real(2208))});vm.invoke("NudgeObjectsInRect",std::array{rect});require((unit->x.bits()!=position.x.bits() || unit->y.bits()!=position.y.bits()) && session.world()->pathPointFree({unit->x,unit->y},std::clamp(unit->collision,0.f,512.f),pathMovement(unit->movementType)),"Elevator wall did not nudge a unit to walkable ground");vm.invoke("SetUnitPathing",std::array{hero,vm.boolean(false)});vm.invoke("SetUnitPosition",std::array{hero,vm.real(position.x),vm.real(position.y)});require(unit->x.bits()==position.x.bits() && unit->y.bits()==position.y.bits(),"Pathing-disabled unit was displaced");auto placed=session.items().at(item.bits);require((placed->x.bits()!=position.x.bits() || placed->y.bits()!=position.y.bits()) && session.world()->pathPointFree({placed->x,placed->y},0,PathMovement::Ground),"Elevator wall did not nudge an item to walkable ground");WorldPoint itemPoint{placed->x,placed->y};auto cell=session.world()->pathCell(std::bit_cast<float>(itemPoint.x.bits()),std::bit_cast<float>(itemPoint.y.bits()));require(cell.has_value(),"Nudged item outside path grid");std::vector<PathCell> footprint{{*cell,2}};session.world()->footprint(footprint,true);session.world()->footprint(footprint,true);auto overlapped=session.world()->pathAnchor(itemPoint,0,PathMovement::Ground,footprint);require(overlapped && (overlapped->x.bits()!=itemPoint.x.bits() || overlapped->y.bits()!=itemPoint.y.bits()),"Ignoring one footprint ignored another owner");session.world()->footprint(footprint,false);auto selfOnly=session.world()->pathAnchor(itemPoint,0,PathMovement::Ground,footprint);require(selfOnly && selfOnly->x.bits()==itemPoint.x.bits() && selfOnly->y.bits()==itemPoint.y.bits(),"Own footprint blocked its position");session.world()->footprint(footprint,false);auto blocker=vm.invoke("CreateUnit",std::array{vm.invoke("Player",std::array{vm.integer(0)}),vm.integer(int(ObjectData::code("hfoo"))),vm.real(itemPoint.x),vm.real(itemPoint.y),vm.real(real(0))});require(blocker.bits && session.units().contains(blocker.bits),"Collision test unit missing");auto other=session.units().at(blocker.bits);vm.invoke("SetUnitPathing",std::array{hero,vm.boolean(true)});vm.invoke("SetUnitPosition",std::array{hero,vm.real(itemPoint.x),vm.real(itemPoint.y)});float dx=std::bit_cast<float>(unit->x.bits())-std::bit_cast<float>(other->x.bits()),dy=std::bit_cast<float>(unit->y.bits())-std::bit_cast<float>(other->y.bits());require(std::hypot(dx,dy)>=unit->collision+other->collision && session.world()->pathPointFree({unit->x,unit->y},std::clamp(unit->collision,0.f,512.f),pathMovement(unit->movementType)),"Scripted unit position overlapped another unit");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");});
    test("object_classic_legacy_marker",[&]{Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/L"Maps/Campaign/Human01.w3m");ObjectData original(archives);bool found=false;for(auto& object:original.objects())if(object.id==ObjectData::code("oC16"))for(auto& change:object.changes)if(change.field==ObjectData::code("umdl") && change.marker==ObjectData::code("owar"))found=true;require(found,"Human01 source marker was not preserved");auto scratch=fs::absolute(argv[2])/(L"legacy-marker-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));fs::create_directories(scratch);auto writeMap=[&](const fs::path& path,const Bytes& bytes){HANDLE archive=nullptr;require(SFileCreateArchive(path.c_str(),MPQ_CREATE_ARCHIVE_V1,16,&archive),"Cannot create override archive");struct Close {HANDLE value;~Close(){SFileCloseArchive(value);}}close{archive};HANDLE member=nullptr;require(SFileCreateFile(archive,"war3map.w3u",0,DWORD(bytes.size()),0,0,&member),"Cannot create override member");bool written=SFileWriteFile(member,bytes.data(),DWORD(bytes.size()),0),finished=SFileFinishFile(member);require(written && finished,"Cannot write override member");};Source source;source.u32(1);source.u32(0);source.u32(1);source.u32(tag("hfoo"));source.u32(tag("hX00"));source.u32(1);source.u32(tag("uhpm"));source.u32(0);source.u32(123);source.u32(tag("owar"));auto valid=scratch/L"valid.w3x";writeMap(valid,source.b);auto view=archives.fork();view->mountMap(valid);ObjectData custom(*view);require(custom.contains(ObjectData::code("hX00")) && custom.number(ObjectData::code("hX00"),"UnitBalance","HP")==123 && custom.objects().back().changes.back().marker==ObjectData::code("owar"),"Legacy marker prevented object value from applying");source.b.resize(source.b.size()-2);auto truncated=scratch/L"truncated.w3x";writeMap(truncated,source.b);view->mountMap(truncated);rejects([&]{ObjectData bad(*view);});});
    test("placed_classic_v1_campaign_overrides",[&]{Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/L"Maps/FrozenThrone/Campaign/OrcX01.w3x");unsigned unmapped=0;auto rows=readPlacedDefinitions(archives,"Doodads\\Doodads.slk","Doodads\\DoodadMetaData.slk","war3map.w3d",true,unmapped);require(rows.contains(ObjectData::code("D000")) && !placedString(rows.at(ObjectData::code("D000")),"file").empty(),"Classic version 1 custom doodad missing");});
    test("w3i_classic_full_tables",[]{for(unsigned v:{18u,25u}){auto m=MapInfo::parse(info(v),{{7,"Map title"}});require(m.name=="Map title" && m.playablePlayers()==2 && m.players[1].start[0]==128,"Header or players differ");require(m.forces.size()==1 && m.upgrades[0].level==2 && m.technologies[0].id==tag("hfoo"),"Rules differ");require(m.randomUnits[0].units[0].ids[1]==tag("hpea"),"Random units differ");require(v==18 || m.randomItems[0].sets[0][0].id==tag("ratf"),"Random items differ");require(!m.omittedEditorTables,"Full tail lost");}});
    test("w3i_omitted_editor_tables",[]{for(unsigned v:{18u,25u}){auto b=info(v,true);require(MapInfo::parse(b).omittedEditorTables,"Omitted tail not recorded");b.pop_back();require(MapInfo::parse(b).omittedEditorTables,"Empty tail rejected");}});
    test("wts_source_strings",[]{std::string s="\xef\xbb\xbf// table\r\nSTRING 0007\r\n{\r\nFirst line\r\n// retained text\r\n}\r\n";auto strings=mapStrings({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});require(mapString("TRIGSTR_007",strings)=="First line\n// retained text","String whitespace lost");require(mapString("TRIGSTR_008",strings)=="TRIGSTR_008","Unresolved reference changed");s+="STRING 7\n{\nx\n}\n";rejects([&]{mapStrings({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});});});
    test("wts_source_trailing_text",[]{std::string s="STRING 74\n{\nFirst quest\n}\n - stray objective\n}\nSTRING 77\n{\nSecond quest\n}\n>stray text\nSTRING 78\n{\nThird quest\n}\n";auto strings=mapStrings({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});require(strings.size()==3 && strings.at(74)=="First quest" && strings.at(77)=="Second quest" && strings.at(78)=="Third quest","Stray WTS lines interrupted declarations");s+="STRING bad\n{\nx\n}\n";rejects([&]{mapStrings({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});});});
    test("terrain_and_pathing_source_bits",[]{auto t=MapTerrain::parse(terrain());require(t.width==3 && t.height==2 && t.origin[0]==-128 && t.corners[0].ground==8192 && t.corners[0].flags==0x40 && t.corners[0].variation==0x21,"Terrain bits changed");Source p;p.u32(tag("MP3W"));p.u32(0);p.u32(8);p.u32(4);p.b.insert(p.b.end(),32,0xa5);auto w=MapPathing::parse(p.b);require(w.cells.size()==32 && w.cells[0]==0xa5,"Path flags changed");p.b.pop_back();rejects([&]{MapPathing::parse(p.b);});});
    test("map_record_truncation_and_versions",[]{auto i=info(25);for(auto n:{size_t(0),size_t(4),size_t(20),i.size()-1})rejects([&]{MapInfo::parse(std::span(i).first(n));});i[0]=31;rejects([&]{MapInfo::parse(i);});auto t=terrain();t.back()=0xff;require(MapTerrain::parse(t).corners.back().cliff==0xff,"Reserved terrain bits discarded");t.pop_back();rejects([&]{MapTerrain::parse(t);});t=terrain();t[29]=255;t[30]=255;t[31]=255;t[32]=127;rejects([&]{MapTerrain::parse(t);});});
    test("map_directory_lazy_order",[&]{auto scratch=fs::absolute(argv[2])/(L"directory-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));fs::create_directories(scratch/L"Folder");for(auto name:{L"z.w3x",L"a.W3M",L"skip.txt"}){std::ofstream f(scratch/name);f<<"not an archive";}auto entries=mapDirectory(scratch);require(entries.size()==3 && entries[0].directory && entries[1].path.filename()==L"a.W3M","Directory ordering or filtering differs");});
    test("hm3w_header_and_bounds",[]{Source s;s.u32(tag("HM3W"));s.u32(0);s.text("地图名称");s.u32(4);s.u32(2);auto h=MapHeader::parse(s.b);require(h && h->name=="地图名称" && h->players==2 && h->flags==4,"Source map header differs");for(auto n:{size_t(4),size_t(8),s.b.size()-1})rejects([&]{MapHeader::parse(std::span(s.b).first(n));});s.b.back()=1;rejects([&]{MapHeader::parse(s.b);});require(!MapHeader::parse(Bytes{'M','P','Q',0x1a}),"Unwrapped MPQ treated as HM3W");});
    test("source_ini_sections_comments_and_strings",[]{std::string s="\xef\xbb\xbf[One]\nKey=first\nKey=last // comment\nURL=https://example.test/a\nText=\"name // text\"\n[Two]\nKey=other\n";SourceSettings ini;ini.parse({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});require(ini.value("ONE","KEY")=="last" && ini.value("Two","Key")=="other","Source sections or duplicate rule differs");require(ini.value("One","URL")=="https://example.test/a" && ini.value("One","Text")=="name // text","Source string comment handling differs");});
    test("map_source_ui_values_and_native_layout",[&]{Archives a(argv[1]);MapUiData ui(a);require(std::abs(ui.fontHeight("MapListBoxItem",0)-.013f)<1e-6f && std::abs(ui.fontHeight("MapListBoxMaxPlayers",0)-.009f)<1e-6f,"Source map fonts differ");require(ui.tilesetName('L')=="洛丹伦的夏天" && ui.sizeName(64,64)=="极小型","Original localization missing");MapInfo info;info.players={{0,1,0,0,"",{},0,0},{1,2,0,0,"",{},0,0}};require(info.playablePlayers()==2 && info.humanPlayers()==1,"Human slot count includes computers");
        auto output=fs::absolute(argv[2]);fs::create_directories(output);std::ofstream file(output/L"map-ui-native.json",std::ios::binary);file<<std::setprecision(9)<<"{\"anchors\":[";bool comma=false;for(auto& v:mapInfoAnchors()){if(comma)file<<',';comma=true;file<<"{\"frame\":\""<<v.frame<<"\",\"point\":\""<<v.point<<"\",\"relative\":\""<<v.relative<<"\",\"target\":\""<<v.target<<"\",\"x\":"<<v.x<<",\"y\":"<<v.y<<'}';}file<<"],\"titles\":[";comma=false;for(float name:{0.f,.01f,.07f,.2f,.5f})for(float icon:{.01875f,.025f})for(float auth:{.01875f,.026f})for(bool known:{false,true}){if(comma)file<<',';comma=true;file<<'['<<name<<','<<icon<<','<<auth<<','<<known<<','<<mapInfoTitleOffset(name,icon,auth,known)<<']';}file<<"],\"sizes\":[";comma=false;for(auto width:{64u,96u,128u,160u,192u,224u,300u,512u})for(auto height:{64u,96u,128u,160u,192u,224u,300u,512u}){if(comma)file<<',';comma=true;file<<"["<<width<<','<<height<<",\""<<ui.sizeName(width,height)<<"\"]";}file<<"]}";require(bool(file),"Cannot save native UI comparison fixture");});
    test("source_menu_and_dynamic_control_definitions",[&]{Archives archives(argv[1]);FrameDefinitions f;for(auto file:{"UI\\FrameDef\\GlobalStrings.fdf","UI\\FrameDef\\Glue\\SinglePlayerMenu.fdf","UI\\FrameDef\\Glue\\Skirmish.fdf","UI\\FrameDef\\Glue\\MapListBox.fdf","UI\\FrameDef\\Glue\\MapInfoPane.fdf"})f.load(archives,file);require(f.frame("SkirmishButton").property("ControlShortcutKey")==std::vector<std::string>{"G"} && f.frame("CancelButton").property("ControlShortcutKey")==std::vector<std::string>{"A"},"Source navigation shortcuts differ");require(std::abs(f.frame("MapListContainer").number("Width")-.31675f)<1e-6f && f.frame("MapInfoPaneContainer").number("Height")>.28f,"Source map containers differ");require(f.frame("MapListBox").type=="CONTROL" && f.frame("MinimapImage").type=="SPRITE" && f.frame("MapDescValue").type=="TEXT","Dynamic control definitions missing");require(f.string("KEY_START_GAME")!="KEY_START_GAME","Source localization missing");});
    test("source_keyboard_focus_chain",[&]{Archives a(argv[1]);FrameDefinitions f;f.load(a,"UI\\FrameDef\\Glue\\MainMenu.fdf");f.load(a,"UI\\FrameDef\\Glue\\SinglePlayerMenu.fdf");auto collect=[&](const FrameDefinition& root,const std::set<std::string>& enabled){std::vector<FrameFocus> result;auto visit=[&](auto&& self,const FrameDefinition& frame)->void{if(frame.properties.contains("TabFocusNext") || frame.properties.contains("TabFocusDefault") || enabled.contains(frame.name)){auto& next=frame.property("TabFocusNext");result.push_back({frame.name,next.empty()?std::string{}:next.front(),enabled.contains(frame.name),frame.properties.contains("TabFocusDefault")});}for(auto& child:frame.children)self(self,child);};visit(visit,root);return result;};auto main=collect(f.frame("MainMenuFrame"),{"SinglePlayerButton","ExitButton"});require(nextFrameFocus(main,{})=="SinglePlayerButton" && nextFrameFocus(main,"SinglePlayerButton")=="ExitButton" && nextFrameFocus(main,"ExitButton",true)=="SinglePlayerButton","Source main focus chain differs");auto single=collect(f.frame("SinglePlayerMenu"),{"SkirmishButton","CancelButton"});require(nextFrameFocus(single,{})=="SkirmishButton" && nextFrameFocus(single,"SkirmishButton")=="CancelButton" && nextFrameFocus(single,"CancelButton",true)=="SkirmishButton","Disabled controls broke source single-player chain");require(nextFrameFocus({{"A","B",false,true},{"B","A",false,false}},{}).empty(),"Disabled focus cycle did not terminate");});
    test("source_player_popup_items_and_contexts",[&]{Archives a(argv[1]);FrameDefinitions f;f.load(a,"UI\\FrameDef\\Glue\\PlayerSlot.fdf");auto race=f.frame("RacePopupMenuMenu"),handicap=f.frame("HandicapPopupMenuMenu");require(race.menuItems.size()==5 && race.menuItems.front()[0]=="RANDOM" && race.menuItems.back()[0]=="NIGHT_ELF","Race menu items lost");require(handicap.menuItems.size()==6 && handicap.menuItems[1][0]=="PERCENT_90" && handicap.menuItems.back()[0]=="PERCENT_50","Handicap menu items lost");
        auto verify=[&](const std::string& prefix){auto root=frameContext(f.frame("PlayerSlot"),prefix);std::map<std::string,const FrameDefinition*> nodes;auto visit=[&](auto&& self,const FrameDefinition& n)->void{require(n.name.starts_with(prefix+"/"),"Unscoped player child");nodes.try_emplace(n.name,&n);for(auto& child:n.children)self(self,child);};visit(visit,root);require(root.name==prefix+"/PlayerSlot" && nodes.at(prefix+"/NameMenu")->points[0][1]==prefix+"/DownloadValue","Player anchor escaped context");require(nodes.at(prefix+"/RaceMenu")->property("PopupMenuFrame")[0]==prefix+"/RacePopupMenuMenu","Popup reference escaped context");require(nodes.at(prefix+"/RacePopupMenuMenu")->menuItems.size()==5,"Scoped menu items lost");};verify("player-1");verify("player-7");FrameDefinition literal;literal.name="NameMenu";literal.properties["Text"]={"NameMenu"};literal.points={{"LEFT","External","LEFT","0","0"}};auto scoped=frameContext(literal,"player-1");require(scoped.property("Text")[0]=="NameMenu" && scoped.points[0][1]=="External","Context rewrote plain text or external anchor");});
    test("source_inline_color_alpha_and_bounds",[&]{auto output=fs::absolute(argv[2]);fs::create_directories(output);std::ofstream file(output/L"text-color-native.json",std::ios::binary);file<<'[';bool comma=false;for(unsigned alpha:{0u,1u,127u,255u})for(unsigned rgb:{0xff0303u,0x20c000u,0x123456u,0xffffffu})for(char marker:{'c','C'}){std::ostringstream token;token<<'|'<<marker<<std::hex<<std::setfill('0')<<std::setw(8)<<((alpha<<24)|rgb);auto color=inlineTextColor(token.str());require(color && *color==(0xff000000u|rgb),"Inline color used source alpha as opacity");if(comma)file<<',';comma=true;file<<"{\"token\":\""<<token.str()<<"\",\"value\":"<<*color<<'}';}file<<']';require(bool(file),"Cannot save native text color fixture");for(auto token:{"|c0011223","|c001122334","|cgg112233","|c-0112233","|r00112233","c000000000"})require(!inlineTextColor(token),"Malformed color token accepted");});
    test("setup_source_ids_and_local_control",[]{MapInfo m;m.players={{1,1,4,1,"one",{128,64},3,4},{7,1,3,1,"seven",{},0,0},{11,2,0,0,"cpu",{},0,0},{15,0,0,0,"unused",{},0,0}};PlayerSetup s(m);require(s.slots().size()==3 && s.localPlayer()==1u && !s.find(0) && s.find(1)->source.name=="one" && s.find(1)->source.start[0]==128 && s.find(1)->source.allyHigh==4,"Setup lost source player data");require(s.find(11)->control==SlotControl::ComputerNormal && s.find(11)->race==5,"Computer draft differs");require(!s.control(1,SlotControl::Closed) && !s.control(11,SlotControl::Local) && !s.control(7,SlotControl(99)),"Invalid control transition accepted");require(s.control(7,SlotControl::Local) && s.localPlayer()==7u && s.find(1)->control==SlotControl::Open,"Moving local player duplicated or renumbered slots");require(s.control(1,SlotControl::ComputerInsane) && s.control(11,SlotControl::ComputerEasy) && s.control(1,SlotControl::Closed),"Valid control transition rejected");m.players.push_back(m.players[0]);rejects([&]{PlayerSetup bad(m);});});
    test("setup_edit_constraints_and_color_swap",[]{auto m=MapInfo::parse(info(25));PlayerSetup s(m);require(!s.race(1,2) && !s.handicap(1,90) && !s.color(1,4),"Inactive slot editable");require(s.control(1,SlotControl::ComputerNormal) && s.race(1,5) && s.team(1,0),"Active setup edits rejected");require(s.color(0,1) && s.find(0)->color==1 && s.find(1)->color==0 && s.color(0,15),"Occupied color not exchanged");require(s.handicap(0,90) && s.handicap(0,50) && s.handicap(0,100),"Handicap range rejected");require(!s.handicap(0,49) && !s.handicap(0,101) && !s.handicap(0,95) && !s.race(0,0) && !s.race(0,6) && !s.team(0,2) && !s.color(0,16) && !s.handicap(15,90),"Setup bounds not enforced");});
    test("setup_fixed_settings_and_source_forces",[]{MapInfo m;m.flags=0x60;m.players={{1,1,4,1,"one",{},0,0},{7,1,3,1,"seven",{},0,0},{11,2,3,1,"eleven",{},0,0}};m.forces={{3,1u<<1,"Team one"},{7,(1u<<7)|(1u<<11),"Team two"}};PlayerSetup s(m);require(s.fixedSettings() && s.customForces() && s.find(1)->team==0 && s.find(7)->team==1 && s.find(11)->team==1 && s.forces()[1].players==((1u<<7)|(1u<<11)) && s.forces()[1].flags==7,"Source force membership changed");require(!s.race(1,2) && !s.color(1,0) && !s.team(1,1) && s.handicap(1,90),"Fixed source constraints differ");m.players.push_back({14,1,1,0,"unassigned",{},0,0});PlayerSetup unmatched(m);require(unmatched.find(14)->team>=m.forces.size(),"Unassigned player merged into a source force");});
    for(auto name:{L"Maps/FrozenThrone/(2)Amazonia.w3x",L"Maps/(2)BootyBay.w3m",L"Maps/Download/DotA_v6.83d.w3x"})test(utf8(name).c_str(),[&]{Archives archives(argv[1]);auto path=fs::path(argv[1])/name;archives.mountMap(path);auto m=MapData::read(archives);if(std::wstring_view(name).find(L"Amazonia")!=std::wstring_view::npos)require(m.info.weather==0x52416c72u,"Amazonia weather FourCC differs");require(!m.info.name.empty() && !m.info.name.starts_with("TRIGSTR_"),"Map title unresolved");require(m.terrain.corners.size()==size_t(m.terrain.width)*m.terrain.height,"Corner count differs");auto header=MapHeader::read(path);require(header && header->name==m.info.name && header->players==m.info.humanPlayers(),"HM3W summary disagrees with W3I/WTS");require(std::int64_t(m.info.playable[0])+m.info.complements[0]+m.info.complements[1]+1==m.terrain.width && std::int64_t(m.info.playable[1])+m.info.complements[2]+m.info.complements[3]+1==m.terrain.height,"Full info dimensions disagree with terrain");PlayerSetup setup(m.info);require(setup.slots().size()==m.info.playablePlayers(),"Draft dropped source player slots");auto local=std::find_if(m.info.players.begin(),m.info.players.end(),[](auto& p){return p.type==1;});require(local!=m.info.players.end() && setup.localPlayer()==unsigned(local->id),"Draft local player source ID differs");if(std::wstring_view(name).find(L"DotA")!=std::wstring_view::npos){require(setup.localPlayer()==1u && !setup.find(0) && !setup.find(6) && setup.find(1)->team==0 && setup.find(7)->team==1 && setup.slots().size()==10,"DotA sparse source IDs or forces lost");require(setup.fixedSettings() && setup.customForces() && !setup.race(1,1) && !setup.color(1,0),"DotA fixed settings lost");}std::cout<<"MAP name="<<m.info.name<<" version="<<m.info.version<<" vertices="<<m.terrain.width<<'x'<<m.terrain.height<<" players="<<m.info.players.size()<<" playable="<<m.info.playablePlayers()<<" forces="<<m.info.forces.size()<<" omitted="<<m.info.omittedEditorTables<<'\n';archives.unmountMap();});
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
