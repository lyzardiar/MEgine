// Author: MiYu. Real map global initialization and configuration through typed native state.
#include "session.h"
#include "setup.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {
unsigned checked(std::uint32_t value,unsigned count,const char* name) {if(value>=count)throw std::runtime_error(std::string(name)+" outside supported classic range");return value;}
std::string text(const jass::Value& value) {return value.text?*value.text:std::string{};}
std::int32_t integer(const jass::Value& value) {return std::bit_cast<std::int32_t>(value.bits);}
struct EnumNative {const char* name;const char* type;std::uint32_t reference;};
constexpr EnumNative enums[]={
#include "jass_enums.inc"
};
}
ScriptSession::ScriptSession(jass::Module module,const MapInfo& info,MapStrings strings,std::optional<unsigned> gameType) : strings_(std::move(strings)),runtime_(std::move(module)) {
    config_.name=info.name;config_.description=info.description;config_.playerCount=info.playablePlayers();config_.teamCount=unsigned(info.forces.size());config_.gameType=gameType.value_or((info.flags&4)?1u:4u);config_.supportedGameTypes=config_.gameType;
    for(unsigned i=0;i<16;++i){config_.players[i].team=i;config_.players[i].color=i;config_.players[i].name="Player "+std::to_string(i+1);objects_.push_back({NativeKind::Player,true,PlayerRef{i}});}
    for(size_t i=0;i<info.players.size();++i){auto& source=info.players[i];if(source.id<0 || source.id>=16 || i>=16)throw std::runtime_error("Invalid classic source player");auto& player=config_.players[source.id];constexpr unsigned races[]={32,1,2,8,4};player.name=source.name;player.controller=source.type==1?0:source.type==2?1:source.type==3?3:5;player.racePreference=source.race>=0 && source.race<=4?races[source.race]:32;player.start=int(i);player.forcedStart=source.fixedStart!=0;config_.starts[i].defined=true;config_.starts[i].position={jass::Real::fromBits(std::bit_cast<std::uint32_t>(source.start[0])),jass::Real::fromBits(std::bit_cast<std::uint32_t>(source.start[1]))};if(info.flags&0x40)for(size_t force=0;force<info.forces.size();++force)if(info.forces[force].players&(1u<<source.id)){player.team=unsigned(force);break;}}
    bindNatives();
}
void ScriptSession::bind(const char* name,const char* result,std::initializer_list<const char*> parameters,jass::Runtime::Native native) {
    auto& module=runtime_.module();auto id=module.functionId(name);if(id==jass::none)return;auto& function=module.program().functions()[id];auto& signature=module.functions()[id];if(!function.native || module.type(signature.result).name!=result || signature.parameters.size()!=parameters.size())throw std::runtime_error("Invalid session native signature: "+std::string(name));size_t i=0;for(auto expected:parameters)if(module.type(signature.parameters[i++]).name!=expected)throw std::runtime_error("Invalid session native parameter: "+std::string(name));runtime_.bind(name,std::move(native));
}
jass::Value ScriptSession::create(NativeKind kind) {
    if(objects_.size()>=1048576)throw std::runtime_error("Session native object budget exceeded");Object object{kind};const char* type;
    switch(kind){case NativeKind::Group:type="group";object.state=Group{};break;case NativeKind::Timer:type="timer";object.state=Timer{};break;case NativeKind::Trigger:type="trigger";object.state=Trigger{};break;case NativeKind::Location:type="location";object.state=WorldPoint{};break;case NativeKind::Rect:type="rect";object.state=WorldRect{};break;default:throw std::runtime_error("Player handles are stable session objects");}
    auto id=handleBase+std::uint32_t(objects_.size());objects_.push_back(std::move(object));return runtime_.handle(type,id);
}
ScriptSession::Object& ScriptSession::object(jass::Value handle,NativeKind kind) {if(handle.bits<handleBase || handle.bits-handleBase>=objects_.size())throw std::runtime_error("Unknown session native handle");auto& value=objects_[handle.bits-handleBase];if(!value.alive || value.kind!=kind)throw std::runtime_error("Destroyed or incompatible session native handle");return value;}
unsigned ScriptSession::playerId(jass::Value handle) {return std::get<PlayerRef>(object(handle,NativeKind::Player).state).id;}
SessionPlayer& ScriptSession::player(jass::Value handle) {return config_.players[playerId(handle)];}
SessionStart& ScriptSession::start(std::uint32_t index) {return config_.starts[checked(index,16,"Start location")];}
void ScriptSession::destroy(jass::Value handle,NativeKind kind) {if(!handle.bits)return;auto& value=object(handle,kind);value.alive=false;value.state=std::monostate{};}
size_t ScriptSession::liveObjects(NativeKind kind) const {return std::count_if(objects_.begin(),objects_.end(),[&](auto& value){return value.alive && value.kind==kind;});}
void ScriptSession::initialize() {if(failed_ || runtime_.ready())throw std::runtime_error("Session initialization requires a fresh instance");try{runtime_.initialize();}catch(...){failed_=true;throw;}}
void ScriptSession::configure() {if(failed_ || configured_)throw std::runtime_error("Session configuration requires an unconfigured instance");try{if(!runtime_.ready())initialize();runtime_.invoke("config");configured_=true;}catch(...){failed_=true;throw;}}
void ScriptSession::applySetup(const PlayerSetup& setup) {
    if(!configured() || mainAttempted_)throw std::runtime_error("Player setup requires a configured session before main");auto next=config_;std::optional<unsigned> local;unsigned seen=0;
    for(auto& slot:setup.slots()){
        auto id=checked(unsigned(slot.source.id),16,"Setup player");if(seen&(1u<<id))throw std::runtime_error("Duplicate setup player");seen|=1u<<id;
        auto& player=next.players[id];player.team=checked(slot.team,16,"Setup team");player.color=checked(slot.color,16,"Setup color");player.racePreference=slot.racePreference;
        if(slot.handicap<50 || slot.handicap>100 || slot.handicap%10)throw std::runtime_error("Invalid setup handicap");player.handicap=jass::Real::fromInteger(int(slot.handicap)).divide(jass::Real::fromInteger(100));player.slotState=slot.active()?1:0;
        switch(slot.control){case SlotControl::Open:player.controller=0;break;case SlotControl::Closed:player.controller=5;break;case SlotControl::Local:if(local)throw std::runtime_error("Multiple local setup players");local=id;player.controller=0;break;case SlotControl::ComputerEasy:player.controller=1;player.difficulty=0;break;case SlotControl::ComputerNormal:player.controller=1;player.difficulty=1;break;case SlotControl::ComputerInsane:player.controller=1;player.difficulty=2;break;default:throw std::runtime_error("Invalid setup control");}
    }
    config_=std::move(next);localPlayer_=local;setupApplied_=true;
}
World& ScriptSession::requireWorld() {if(!world_)throw std::runtime_error("World native requires attached map terrain");return *world_;}
void ScriptSession::attachWorld(std::unique_ptr<World> world) {if(!world || world_ || runtime_.ready() || failed_)throw std::runtime_error("World attachment requires a fresh session and valid terrain");world_=std::move(world);}
void ScriptSession::startMain() {if(!configured() || !world_ || !setupApplied_ || mainAttempted_)throw std::runtime_error("Map main requires a configured world and player setup");mainAttempted_=true;try{runtime_.invoke("main");mainCompleted_=true;}catch(...){failed_=true;throw;}}
void ScriptSession::bindNatives() {
    bindWorldNatives();
    for(auto entry:enums)bind(entry.name,entry.type,{"integer"},[entry](auto& vm,auto args){return vm.handle(entry.type,args[0].bits);});
    bind("GetHandleId","integer",{"handle"},[](auto& vm,auto args){return vm.integer(integer(args[0]));});
    bind("Player","player",{"integer"},[this](auto& vm,auto args){return vm.handle("player",args[0].bits<16?handleBase+args[0].bits:0);});
    bind("GetPlayerId","integer",{"player"},[this](auto& vm,auto args){return vm.integer(args[0].bits?int(playerId(args[0])):0);});
    bind("GetLocalPlayer","player",{},[this](auto& vm,auto){if(!localPlayer_)throw std::runtime_error("Local player is unavailable before setup");return vm.handle("player",handleBase+*localPlayer_);});
    bind("GetAIDifficulty","aidifficulty",{"player"},[this](auto& vm,auto args){return vm.handle("aidifficulty",player(args[0]).difficulty);});
    bind("GetPlayerHandicap","real",{"player"},[this](auto& vm,auto args){return vm.real(player(args[0]).handicap);});
    bind("CreateGroup","group",{},[this](auto&,auto){return create(NativeKind::Group);});
    bind("DestroyGroup","nothing",{"group"},[this](auto& vm,auto args){destroy(args[0],NativeKind::Group);return vm.nothing();});
    bind("GroupClear","nothing",{"group"},[this](auto& vm,auto args){std::get<Group>(object(args[0],NativeKind::Group).state).units.clear();return vm.nothing();});
    bind("FirstOfGroup","unit",{"group"},[this](auto& vm,auto args){auto& units=std::get<Group>(object(args[0],NativeKind::Group).state).units;return vm.handle("unit",units.empty()?0:units.front());});
    bind("CreateTimer","timer",{},[this](auto&,auto){return create(NativeKind::Timer);});
    bind("DestroyTimer","nothing",{"timer"},[this](auto& vm,auto args){destroy(args[0],NativeKind::Timer);return vm.nothing();});
    bind("TimerGetTimeout","real",{"timer"},[this](auto& vm,auto args){return vm.real(std::get<Timer>(object(args[0],NativeKind::Timer).state).timeout);});
    bind("TimerGetElapsed","real",{"timer"},[this](auto& vm,auto args){return vm.real(std::get<Timer>(object(args[0],NativeKind::Timer).state).elapsed);});
    bind("TimerGetRemaining","real",{"timer"},[this](auto& vm,auto args){auto& timer=std::get<Timer>(object(args[0],NativeKind::Timer).state);return vm.real(timer.timeout.subtract(timer.elapsed));});
    bind("CreateTrigger","trigger",{},[this](auto&,auto){return create(NativeKind::Trigger);});
    bind("DestroyTrigger","nothing",{"trigger"},[this](auto& vm,auto args){destroy(args[0],NativeKind::Trigger);return vm.nothing();});
    bind("EnableTrigger","nothing",{"trigger"},[this](auto& vm,auto args){std::get<Trigger>(object(args[0],NativeKind::Trigger).state).enabled=true;return vm.nothing();});
    bind("DisableTrigger","nothing",{"trigger"},[this](auto& vm,auto args){std::get<Trigger>(object(args[0],NativeKind::Trigger).state).enabled=false;return vm.nothing();});
    bind("IsTriggerEnabled","boolean",{"trigger"},[this](auto& vm,auto args){return vm.boolean(std::get<Trigger>(object(args[0],NativeKind::Trigger).state).enabled);});
    bind("TriggerWaitOnSleeps","nothing",{"trigger","boolean"},[this](auto& vm,auto args){std::get<Trigger>(object(args[0],NativeKind::Trigger).state).waitOnSleeps=args[1].bits!=0;return vm.nothing();});
    bind("IsTriggerWaitOnSleeps","boolean",{"trigger"},[this](auto& vm,auto args){return vm.boolean(std::get<Trigger>(object(args[0],NativeKind::Trigger).state).waitOnSleeps);});
    bind("GetTriggerEvalCount","integer",{"trigger"},[this](auto& vm,auto args){return vm.integer(std::get<Trigger>(object(args[0],NativeKind::Trigger).state).evaluations);});
    bind("GetTriggerExecCount","integer",{"trigger"},[this](auto& vm,auto args){return vm.integer(std::get<Trigger>(object(args[0],NativeKind::Trigger).state).executions);});
    bind("SetMapName","nothing",{"string"},[this](auto& vm,auto args){config_.name=mapString(text(args[0]),strings_);return vm.nothing();});
    bind("SetMapDescription","nothing",{"string"},[this](auto& vm,auto args){config_.description=mapString(text(args[0]),strings_);return vm.nothing();});
    bind("SetPlayers","nothing",{"integer"},[this](auto& vm,auto args){config_.playerCount=checked(args[0].bits,17,"Player count");return vm.nothing();});
    bind("SetTeams","nothing",{"integer"},[this](auto& vm,auto args){config_.teamCount=checked(args[0].bits,17,"Team count");return vm.nothing();});
    bind("GetPlayers","integer",{},[this](auto& vm,auto){return vm.integer(config_.playerCount);});
    bind("GetTeams","integer",{},[this](auto& vm,auto){return vm.integer(config_.teamCount);});
    bind("SetGamePlacement","nothing",{"placement"},[this](auto& vm,auto args){config_.placement=args[0].bits;return vm.nothing();});
    bind("GetGamePlacement","placement",{},[this](auto& vm,auto){return vm.handle("placement",config_.placement);});
    bind("SetGameTypeSupported","nothing",{"gametype","boolean"},[this](auto& vm,auto args){if(args[1].bits)config_.supportedGameTypes|=args[0].bits;else config_.supportedGameTypes&=~args[0].bits;return vm.nothing();});
    bind("IsGameTypeSupported","boolean",{"gametype"},[this](auto& vm,auto args){return vm.boolean((config_.supportedGameTypes&args[0].bits)!=0);});
    bind("GetGameTypeSelected","gametype",{},[this](auto& vm,auto){return vm.handle("gametype",config_.gameType&~8u);});
    bind("DefineStartLocation","nothing",{"integer","real","real"},[this](auto& vm,auto args){auto& location=start(args[0].bits);location.defined=true;location.position={jass::Real::fromBits(args[1].bits),jass::Real::fromBits(args[2].bits)};return vm.nothing();});
    bind("GetStartLocationX","real",{"integer"},[this](auto& vm,auto args){return vm.real(start(args[0].bits).position[0]);});
    bind("GetStartLocationY","real",{"integer"},[this](auto& vm,auto args){return vm.real(start(args[0].bits).position[1]);});
    bind("SetStartLocPrioCount","nothing",{"integer","integer"},[this](auto& vm,auto args){start(args[0].bits).priorities.resize(checked(args[1].bits,17,"Start priority count"));return vm.nothing();});
    bind("SetStartLocPrio","nothing",{"integer","integer","integer","startlocprio"},[this](auto& vm,auto args){auto& priorities=start(args[0].bits).priorities;priorities.at(checked(args[1].bits,unsigned(priorities.size()),"Start priority slot"))={checked(args[2].bits,16,"Priority start"),args[3].bits};return vm.nothing();});
    bind("GetStartLocPrioSlot","integer",{"integer","integer"},[this](auto& vm,auto args){return vm.integer(start(args[0].bits).priorities.at(args[1].bits).other);});
    bind("GetStartLocPrio","startlocprio",{"integer","integer"},[this](auto& vm,auto args){return vm.handle("startlocprio",start(args[0].bits).priorities.at(args[1].bits).priority);});
    bind("SetPlayerTeam","nothing",{"player","integer"},[this](auto& vm,auto args){player(args[0]).team=checked(args[1].bits,16,"Player team");return vm.nothing();});
    bind("GetPlayerTeam","integer",{"player"},[this](auto& vm,auto args){return vm.integer(player(args[0]).team);});
    bind("SetPlayerStartLocation","nothing",{"player","integer"},[this](auto& vm,auto args){player(args[0]).start=int(checked(args[1].bits,16,"Player start"));return vm.nothing();});
    bind("ForcePlayerStartLocation","nothing",{"player","integer"},[this](auto& vm,auto args){auto& p=player(args[0]);p.start=int(checked(args[1].bits,16,"Forced player start"));p.forcedStart=true;return vm.nothing();});
    bind("GetPlayerStartLocation","integer",{"player"},[this](auto& vm,auto args){return vm.integer(player(args[0]).start);});
    bind("SetPlayerColor","nothing",{"player","playercolor"},[this](auto& vm,auto args){player(args[0]).color=checked(args[1].bits,16,"Player color");return vm.nothing();});
    bind("GetPlayerColor","playercolor",{"player"},[this](auto& vm,auto args){return vm.handle("playercolor",player(args[0]).color);});
    bind("SetPlayerRacePreference","nothing",{"player","racepreference"},[this](auto& vm,auto args){player(args[0]).racePreference=args[1].bits;return vm.nothing();});
    bind("IsPlayerRacePrefSet","boolean",{"player","racepreference"},[this](auto& vm,auto args){return vm.boolean((player(args[0]).racePreference&args[1].bits)!=0);});
    bind("SetPlayerRaceSelectable","nothing",{"player","boolean"},[this](auto& vm,auto args){player(args[0]).raceSelectable=args[1].bits!=0;return vm.nothing();});
    bind("GetPlayerSelectable","boolean",{"player"},[this](auto& vm,auto args){return vm.boolean(player(args[0]).raceSelectable);});
    bind("SetPlayerController","nothing",{"player","mapcontrol"},[this](auto& vm,auto args){player(args[0]).controller=checked(args[1].bits,6,"Player controller");return vm.nothing();});
    bind("GetPlayerController","mapcontrol",{"player"},[this](auto& vm,auto args){return vm.handle("mapcontrol",player(args[0]).controller);});
    bind("GetPlayerSlotState","playerslotstate",{"player"},[this](auto& vm,auto args){return vm.handle("playerslotstate",player(args[0]).slotState);});
    bind("SetPlayerName","nothing",{"player","string"},[this](auto& vm,auto args){player(args[0]).name=text(args[1]);return vm.nothing();});
    bind("GetPlayerName","string",{"player"},[this](auto& vm,auto args){return vm.string(player(args[0]).name);});
    bind("SetPlayerOnScoreScreen","nothing",{"player","boolean"},[this](auto& vm,auto args){player(args[0]).onScoreScreen=args[1].bits!=0;return vm.nothing();});
    bind("SetPlayerAlliance","nothing",{"player","player","alliancetype","boolean"},[this](auto& vm,auto args){auto& flags=player(args[0]).alliances[playerId(args[1])];auto mask=1u<<checked(args[2].bits,16,"Alliance type");if(args[3].bits)flags|=mask;else flags&=~mask;return vm.nothing();});
    bind("GetPlayerAlliance","boolean",{"player","player","alliancetype"},[this](auto& vm,auto args){return vm.boolean((player(args[0]).alliances[playerId(args[1])]&(1u<<checked(args[2].bits,16,"Alliance type")))!=0);});
    bind("SetPlayerState","nothing",{"player","playerstate","integer"},[this](auto& vm,auto args){player(args[0]).states[args[1].bits]=integer(args[2]);return vm.nothing();});
    bind("GetPlayerState","integer",{"player","playerstate"},[this](auto& vm,auto args){auto& states=player(args[0]).states;auto found=states.find(args[1].bits);return vm.integer(found==states.end()?0:found->second);});
    bind("SetPlayerTaxRate","nothing",{"player","player","playerstate","integer"},[this](auto& vm,auto args){player(args[0]).taxes[{playerId(args[1]),args[2].bits}]=integer(args[3]);return vm.nothing();});
    bind("GetPlayerTaxRate","integer",{"player","player","playerstate"},[this](auto& vm,auto args){auto& taxes=player(args[0]).taxes;auto found=taxes.find({playerId(args[1]),args[2].bits});return vm.integer(found==taxes.end()?0:found->second);});
}
}
