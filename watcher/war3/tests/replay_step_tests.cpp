// Author: MiYu. CPU regression checks for stepping complete replay time slots while paused.
#include "replay_runtime.h"
#include "replay_writer.h"
#include "replay_solo.h"
#include "jass_module.h"
#include <array>
#include <iostream>
#include <stdexcept>

using namespace war3;
using namespace std::chrono_literals;

namespace {
constexpr auto start=ReplayRuntime::Clock::time_point{};
constexpr std::array<std::uint8_t,7> chat{0x20,0,0,0,0,'a',0};

void require(bool condition,const char* message){if(!condition)throw std::runtime_error(message);}

ReplayWriter fixture(){
    ReplayGame game;
    game.name="Replay Step Test";
    game.mapPath="Maps\\ReplayStep.w3x";
    game.hostName="Host";
    game.host={1,"Host"};
    game.playerCount=2;
    game.width=20;
    game.height=20;
    ReplaySetup setup{{{1,100,2,0,0,0,1,1,100},{2,100,2,0,1,1,1,1,100}},1,0,2};
    return ReplayWriter({27,0x57335850u,0,52240,false},game,{{2,"Peer"}},setup);
}

struct Playback {
    std::vector<LanTimeSlot> slots;
    std::vector<ReplayRecordKind> events;
    std::vector<std::uint8_t> chatSenders;
    bool rejectSlot=false,rejectChat=false;
    ReplayRuntime runtime;

    explicit Playback(const ReplayWriter& writer):runtime(Replay::read(writer.serialize()),[this](const LanTimeSlot& slot)->std::optional<std::string>{
        slots.push_back(slot);
        events.push_back(ReplayRecordKind::TimeSlot);
        if(rejectSlot)return "slot veto";
        return {};
    },[this](const ReplayRecord& record)->std::optional<std::string>{
        if(record.kind==ReplayRecordKind::Chat){
            chatSenders.push_back(record.playerId);
            events.push_back(record.kind);
            if(rejectChat)return "chat veto";
        }
        return {};
    }){}
};

void stepsOneSlotAtATime(){
    auto writer=fixture();
    writer.appendTimeSlot({40,{{1,{0x11}}}});
    writer.appendChat(1,chat);
    writer.appendTimeSlot({0,{{1,{0x22}}}});
    writer.appendTimeSlot({0,{{2,{0x33}}}});
    writer.appendTimeSlot({60,{}});
    writer.appendChat(1,chat);
    writer.appendChat(2,chat);

    Playback playback(writer);
    auto& replay=playback.runtime;
    replay.requestStep();
    replay.pause(true,start);
    replay.tick(start+1h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==0 && playback.events.empty(),"Playing request or ordinary paused tick delivered a slot");
    require(replay.totalMs()==100,"Unexpected replay duration");

    replay.requestStep();
    replay.requestStep();
    require(playback.events.empty(),"Request delivered replay records synchronously");
    replay.tick(start+1h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==40 && playback.slots.size()==1 && playback.chatSenders.empty(),"First step crossed a completed slot");
    require(playback.slots.back().actions.size()==1 && playback.slots.back().actions.front().bytes==std::vector<std::uint8_t>{0x11},"First step changed the action bytes");
    replay.tick(start+2h);
    require(replay.elapsedMs()==40 && playback.slots.size()==1 && playback.chatSenders.empty(),"Duplicate request or paused wall time advanced the replay");

    replay.requestStep();
    replay.tick(start+2h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==40 && playback.slots.size()==2 && playback.slots.back().elapsedMs==0,"Zero-duration slot did not end the step");
    require(playback.events==std::vector<ReplayRecordKind>{ReplayRecordKind::TimeSlot,ReplayRecordKind::Chat,ReplayRecordKind::TimeSlot},"Metadata and time slots were delivered out of order");

    replay.requestStep();
    replay.tick(start+2h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==40 && playback.slots.size()==3 && playback.slots.back().elapsedMs==0,"Consecutive zero-duration slot needed its own step");

    replay.requestStep();
    replay.tick(start+2h);
    require(replay.state()==ReplayRuntimeState::Finished && replay.elapsedMs()==100 && playback.slots.size()==4,"Final step did not finish replay when the tail fit in the same tick");
    require(playback.chatSenders==std::vector<std::uint8_t>{1,1,2},"Final step skipped or reordered trailing chat");
    require(playback.events.size()==7 && playback.events[4]==ReplayRecordKind::TimeSlot && playback.events[5]==ReplayRecordKind::Chat && playback.events[6]==ReplayRecordKind::Chat,"Trailing chat was delivered before the final slot");
    replay.requestStep();
    replay.tick(start+3h);
    require(replay.state()==ReplayRuntimeState::Finished && playback.events.size()==7,"Finished replay accepted another step");
}

void stepsAcrossRawRecordLimit(){
    auto writer=fixture();
    writer.appendTimeSlot({20,{}});
    for(unsigned i=0;i<255;++i)writer.appendChat(1,chat);
    LanTimeSlot fragmented{50,{{1,std::vector<std::uint8_t>(65530,0x11)},{2,{0x22,0x33}}}};
    writer.appendTimeSlot(fragmented);
    writer.appendTimeSlot({70,{}});

    Playback playback(writer);
    auto& replay=playback.runtime;
    require(replay.totalMs()==140,"Fragment changed total replay duration");
    replay.pause(true,start);
    replay.requestStep();
    replay.tick(start);
    require(replay.elapsedMs()==20 && playback.slots.size()==1 && playback.chatSenders.empty(),"Setup step did not stop at the first slot");

    replay.requestStep();
    replay.tick(start);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==20 && playback.slots.size()==1 && playback.chatSenders.size()==255,"Tick exceeded 256 raw records or delivered an incomplete slot");
    replay.tick(start);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==70 && playback.slots.size()==2 && playback.chatSenders.size()==255,"Pending step did not complete on the next tick");
    const auto& applied=playback.slots.back();
    require(applied.elapsedMs==50 && applied.actions.size()==2,"Fragments were not merged into one slot");
    require(applied.actions[0].playerId==1 && applied.actions[0].bytes==fragmented.actions[0].bytes && applied.actions[1].playerId==2 && applied.actions[1].bytes==fragmented.actions[1].bytes,"Merged actions changed order or bytes");

    replay.tick(start+1h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==70 && playback.slots.size()==2,"Completed step advanced the following slot");
}

void drainsFinalRecordsAcrossTicks(){
    auto writer=fixture();
    writer.appendTimeSlot({20,{}});
    writer.appendTimeSlot({30,{}});
    for(unsigned i=0;i<260;++i)writer.appendChat(1,chat);

    Playback playback(writer);
    auto& replay=playback.runtime;
    replay.pause(true,start);
    replay.requestStep();
    replay.tick(start);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==20 && playback.chatSenders.empty(),"First step reached the final slot");

    replay.requestStep();
    replay.tick(start);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==50 && playback.slots.size()==2 && playback.chatSenders.size()==255,"Final slot and trailing chat did not share the 256-record limit");
    replay.tick(start);
    require(replay.state()==ReplayRuntimeState::Finished && replay.elapsedMs()==50 && playback.slots.size()==2 && playback.chatSenders.size()==260,"Trailing chat did not complete on the next tick without another request");
}

void resumesWithThePlaybackClock(){
    auto writer=fixture();
    writer.appendTimeSlot({40,{}});
    writer.appendTimeSlot({50,{}});
    writer.appendTimeSlot({60,{}});

    Playback playback(writer);
    auto& replay=playback.runtime;
    replay.tick(start);
    replay.pause(true,start+15ms);
    replay.requestStep();
    replay.pause(true,start+45min);
    require(playback.slots.empty(),"Pause setter consumed a queued step");
    replay.speed(8,start+1h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.speed()==8 && playback.slots.empty(),"Speed setter consumed a queued step");
    replay.tick(start+1h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==40 && playback.slots.size()==1,"Stepped slot waited for the playback clock");

    replay.speed(2,start+2h);
    replay.requestStep();
    replay.pause(false,start+2h);
    require(replay.state()==ReplayRuntimeState::Playing && replay.elapsedMs()==40 && playback.slots.size()==1,"Resume consumed a queued step");
    replay.tick(start+2h+17ms);
    require(replay.elapsedMs()==40 && playback.slots.size()==1,"Paused time or a pending step leaked into resumed playback");
    replay.tick(start+2h+18ms);
    require(replay.elapsedMs()==90 && playback.slots.size()==2,"Resumed playback lost its clock budget or speed");
    replay.pause(true,start+2h+18ms);
    replay.tick(start+3h);
    require(replay.state()==ReplayRuntimeState::Paused && replay.elapsedMs()==90 && playback.slots.size()==2,"Queued step survived resume and pause");
}

void stopsWithAQueuedStep(){
    auto writer=fixture();
    writer.appendTimeSlot({20,{}});
    Playback playback(writer);
    auto& replay=playback.runtime;
    replay.pause(true,start);
    replay.requestStep();
    replay.stop();
    replay.requestStep();
    replay.tick(start+1h);
    require(replay.state()==ReplayRuntimeState::Stopped && replay.elapsedMs()==0 && playback.events.empty(),"Stopped replay delivered a pending step");
}

void failsAtTheRejectedRecord(){
    auto writer=fixture();
    writer.appendTimeSlot({20,{}});
    writer.appendChat(1,chat);
    writer.appendTimeSlot({30,{}});

    Playback slotFailure(writer);
    auto& slotReplay=slotFailure.runtime;
    slotFailure.rejectSlot=true;
    slotReplay.pause(true,start);
    slotReplay.requestStep();
    slotReplay.tick(start);
    require(slotReplay.state()==ReplayRuntimeState::Failed && slotReplay.elapsedMs()==0 && slotReplay.error().find("slot veto")!=std::string::npos,"Rejected slot advanced time or hid its failure");
    slotReplay.requestStep();
    slotReplay.tick(start+1h);
    require(slotFailure.slots.size()==1 && slotFailure.chatSenders.empty(),"Failed slot was retried or subsequent records ran");

    Playback chatFailure(writer);
    auto& chatReplay=chatFailure.runtime;
    chatFailure.rejectChat=true;
    chatReplay.pause(true,start);
    chatReplay.requestStep();
    chatReplay.tick(start);
    chatReplay.requestStep();
    chatReplay.tick(start);
    require(chatReplay.state()==ReplayRuntimeState::Failed && chatReplay.elapsedMs()==20 && chatReplay.error().find("chat veto")!=std::string::npos,"Rejected metadata advanced the next slot or hid its failure");
    chatReplay.requestStep();
    chatReplay.tick(start+1h);
    require(chatFailure.slots.size()==1 && chatFailure.chatSenders.size()==1,"Failed metadata was retried or subsequent records ran");

    auto tailWriter=fixture();
    tailWriter.appendTimeSlot({20,{}});
    tailWriter.appendChat(1,chat);
    Playback tailFailure(tailWriter);
    auto& tailReplay=tailFailure.runtime;
    tailFailure.rejectChat=true;
    tailReplay.pause(true,start);
    tailReplay.requestStep();
    tailReplay.tick(start);
    require(tailReplay.state()==ReplayRuntimeState::Failed && tailReplay.elapsedMs()==20 && tailFailure.slots.size()==1 && tailFailure.chatSenders.size()==1 && tailReplay.error().find("chat veto")!=std::string::npos,"Final step lost the accepted slot or hid a trailing metadata failure");
}

template<class Function>
void soloRejects(Function&& function,std::string_view message){
    try{function();}
    catch(const std::exception& error){
        require(std::string_view(error.what()).find(message)!=std::string_view::npos,"Solo replay rejected for an unexpected reason");
        return;
    }
    throw std::runtime_error("Solo replay accepted invalid input");
}

void soloCommandsRoundTrip(){
    PlayerCommand original;
    original.player=2;original.kind=PlayerCommandKind::TargetOrder;original.units={4,8,15};
    original.xBits=0x41480000;original.yBits=0xc0400000;original.target=23;original.order=851971;original.ability=42;
    original.stopOnSuccess=true;original.objectType=63;original.queueIndex=7;original.item=255;
    original.otherPlayer=3;original.allianceOption=5;original.gold=-17;original.lumber=100;original.enabled=true;
    original.text="cursor context";original.queued=true;original.hasFormationDestination=true;
    original.formationXBits=0x40000000;original.formationYBits=0x40800000;
    original.shop=57;original.hasTargetPoint=true;original.formationGroup=0x100000005ull;
    auto bytes=encodeSoloCommand(original);
    auto decoded=decodeSoloCommand(bytes);
    require(decoded.player==original.player && decoded.kind==original.kind && decoded.units==original.units,"Solo replay lost command identity or selection");
    require(decoded.xBits==original.xBits && decoded.yBits==original.yBits && decoded.target==original.target && decoded.order==original.order && decoded.ability==original.ability && decoded.hasTargetPoint,"Solo replay lost target data");
    require(decoded.stopOnSuccess && decoded.objectType==original.objectType && decoded.queueIndex==original.queueIndex && decoded.item==original.item && decoded.shop==original.shop,"Solo replay lost command options");
    require(decoded.otherPlayer==original.otherPlayer && decoded.allianceOption==original.allianceOption && decoded.gold==-17 && decoded.lumber==100 && decoded.enabled && decoded.text==original.text,"Solo replay lost auxiliary command data");
    require(decoded.queued && decoded.hasFormationDestination && decoded.formationXBits==original.formationXBits && decoded.formationYBits==original.formationYBits && decoded.formationMovement && decoded.formationGroup==original.formationGroup,"Solo replay lost queued formation data");
    require(encodeSoloCommand(decoded)==bytes,"Solo replay command encoding is not stable");

    PlayerCommand chatCommand;
    chatCommand.player=8;chatCommand.kind=PlayerCommandKind::Chat;
    chatCommand.text="hello \xe4\xb8\x96\xe7\x95\x8c";chatCommand.chatRecipient=0;
    auto message=decodeSoloCommand(encodeSoloCommand(chatCommand));
    require(message.kind==PlayerCommandKind::Chat && message.player==8 && message.text==chatCommand.text && message.chatChannel==ChatChannel::All && message.chatRecipient==std::optional<unsigned>{0},"Solo replay lost UTF-8 private chat");
    chatCommand.chatRecipient.reset();chatCommand.chatChannel=ChatChannel::Observers;
    message=decodeSoloCommand(encodeSoloCommand(chatCommand));
    require(message.chatChannel==ChatChannel::Observers && !message.chatRecipient,"Solo replay lost observer chat audience");
}

void soloCommandsRejectCorruption(){
    PlayerCommand command;
    auto bytes=encodeSoloCommand(command);
    auto patched=[&](std::size_t field,std::uint32_t value){
        auto copy=bytes;
        for(unsigned i=0;i<4;++i)copy.at(field+i)=std::uint8_t(value>>(8*i));
        return copy;
    };
    auto shortBytes=bytes;shortBytes.pop_back();
    auto longBytes=bytes;longBytes.push_back(0);
    soloRejects([&]{decodeSoloCommand(shortBytes);},"command length");
    soloRejects([&]{decodeSoloCommand(longBytes);},"Unconsumed binary record");
    // Fixed v1 fields before the unit array are player, kind and unit count.
    soloRejects([&]{decodeSoloCommand(patched(4,0xffffffffu));},"command kind");
    soloRejects([&]{decodeSoloCommand(patched(8,16001));},"Binary array exceeds bounds");
    soloRejects([&]{decodeSoloCommand(patched(8,1));},"command unit count");
    // With no units, the first coordinate follows the count and the flag follows five fields.
    soloRejects([&]{decodeSoloCommand(patched(12,0x7f800000u));},"command coordinate");
    soloRejects([&]{decodeSoloCommand(patched(32,2));},"command flag");
    command.kind=PlayerCommandKind::SetGameSpeed;command.objectType=5;
    soloRejects([&]{encodeSoloCommand(command);},"game speed");
    command.kind=PlayerCommandKind::Chat;command.text="\xc0\xaf";
    soloRejects([&]{encodeSoloCommand(command);},"chat text");
}

void soloScriptAuditTracksReachableFunctions(){
    auto compile=[](std::string script){
        return jass::Module::compile(jass::Program::parse({{"solo-replay.j",std::move(script),"authored replay CPU fixture"}}));
    };
    auto allowed=compile(R"jass(
native ExecuteFunc takes string name returns nothing
native GetRandomInt takes integer low, integer high returns integer
native GetCameraTargetPositionX takes nothing returns real
native QueueCallback takes code handler returns nothing
function unreachable takes nothing returns nothing
    local real x = GetCameraTargetPositionX()
endfunction
function callback takes nothing returns nothing
    local integer roll = GetRandomInt(1, 2)
endfunction
function safe takes nothing returns nothing
    call QueueCallback(function callback)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    call ExecuteFunc("safe")
endfunction
)jass");
    validateSoloReplayScript(allowed);

    auto unsafeCallback=compile(R"jass(
native ExecuteFunc takes string name returns nothing
native GetCameraTargetPositionX takes nothing returns real
native QueueCallback takes code handler returns nothing
function cameraCallback takes nothing returns nothing
    local real x = GetCameraTargetPositionX()
endfunction
function indirect takes nothing returns nothing
    if true then
        call QueueCallback(function cameraCallback)
    endif
endfunction
function config takes nothing returns nothing
    call ExecuteFunc("indirect")
endfunction
function main takes nothing returns nothing
endfunction
)jass");
    soloRejects([&]{validateSoloReplayScript(unsafeCallback);},"GetCameraTargetPositionX");

    auto dynamicTarget=compile(R"jass(
native ExecuteFunc takes string name returns nothing
globals
    string callbackName = "safe"
endglobals
function safe takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    call ExecuteFunc(callbackName)
endfunction
)jass");
    soloRejects([&]{validateSoloReplayScript(dynamicTarget);},"ExecuteFunc");
}

void soloScriptAuditScopesMeleeAi(){
    auto compile=[](std::string source){
        return jass::Module::compile(jass::Program::parse({{"melee-cpu.ai",std::move(source),"authored solo replay audit fixture"}}));
    };
    auto launcher=[&](std::string_view native){
        const std::string name(native);
        return compile("type player extends handle\n"
            "native Player takes integer number returns player\n"
            "native "+name+" takes player subject, string script returns nothing\n"
            "function main takes nothing returns nothing\n"
            "    call "+name+"(Player(1), \"melee-cpu.ai\")\n"
            "endfunction\n");
    };

    const auto meleeLauncher=launcher("StartMeleeAI");
    validateSoloReplayScript(meleeLauncher);
    validateSoloReplayScript(meleeLauncher,SoloReplayScriptKind::Map);
    soloRejects([&]{validateSoloReplayScript(meleeLauncher,SoloReplayScriptKind::MeleeAI);},"StartMeleeAI");

    const auto campaignLauncher=launcher("StartCampaignAI");
    soloRejects([&]{validateSoloReplayScript(campaignLauncher,SoloReplayScriptKind::Map);},"StartCampaignAI");

    auto threaded=[&](std::string_view declarations,std::string_view body){
        std::string source(declarations);
        source+="\nnative StartThread takes code handler returns nothing\n"
            "function worker takes nothing returns nothing\n";
        source+=body;
        source+="\nendfunction\n"
            "function main takes nothing returns nothing\n"
            "    call StartThread(function worker)\n"
            "endfunction\n";
        return compile(std::move(source));
    };
    const auto normal=threaded(
        "native GetRandomInt takes integer lower, integer upper returns integer\n"
        "native Sleep takes real duration returns nothing",
        "    local integer roll = GetRandomInt(1, 4)\n"
        "    call Sleep(0.25)");
    validateSoloReplayScript(normal,SoloReplayScriptKind::MeleeAI);

    const auto audio=threaded(
        "type sound extends handle\nnative TriggerWaitForSound takes sound whichSound, real offset returns nothing",
        "    call TriggerWaitForSound(null, 0.0)");
    soloRejects([&]{validateSoloReplayScript(audio,SoloReplayScriptKind::MeleeAI);},"TriggerWaitForSound");

    const auto storage=threaded(
        "type gamecache extends handle\n"
        "native InitGameCache takes string campaignFile returns gamecache",
        "    local gamecache store = InitGameCache(\"audit-cache\")");
    soloRejects([&]{validateSoloReplayScript(storage,SoloReplayScriptKind::MeleeAI);},"InitGameCache");
}

void soloScriptAuditScopesPreload(){
    auto module=jass::Module::compile(jass::Program::parse({{"preload-audit.j",R"jass(
native Preloader takes string fileName returns nothing
native Preload takes string assetName returns nothing
native PreloadGenEnd takes string outputFile returns nothing
native GetCameraBoundMinX takes nothing returns real
native GetLocalizedString takes string key returns string
function main takes nothing returns nothing
    local real mapLeft = GetCameraBoundMinX()
    local string asset = GetLocalizedString("EXAMPLE_ASSET")
    call Preloader(asset)
endfunction
function WriteToDisk takes nothing returns nothing
    call PreloadGenEnd("destination")
endfunction
function PreloadFiles takes nothing returns nothing
    call Preload("example")
    call WriteToDisk()
endfunction
)jass","authored solo replay audit fixture"}}));
    validateSoloReplayScript(module);
    soloRejects([&]{validateSoloReplayScript(module,SoloReplayScriptKind::Preload);},"PreloadGenEnd");
}
}

int main(){
    try{
        stepsOneSlotAtATime();
        stepsAcrossRawRecordLimit();
        drainsFinalRecordsAcrossTicks();
        resumesWithThePlaybackClock();
        stopsWithAQueuedStep();
        failsAtTheRejectedRecord();
        soloCommandsRoundTrip();
        soloCommandsRejectCorruption();
        soloScriptAuditTracksReachableFunctions();
        soloScriptAuditScopesMeleeAi();
        soloScriptAuditScopesPreload();
        std::cout<<"Replay step tests passed\n";
        return 0;
    }catch(const std::exception& error){
        std::cerr<<"Replay step tests failed: "<<error.what()<<'\n';
        return 1;
    }
}
