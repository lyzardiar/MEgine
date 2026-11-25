// Author: MiYu. Record and replay local simulation operations in a dedicated W3G product version.
#include "replay_solo.h"
#include "lan_handshake.h"
#include "replay_experimental.h"
#include "session.h"
#include "setup.h"
#include "snapshot_codec.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
constexpr std::uint32_t formatVersion=27;
constexpr std::size_t maxActionBytes=65530;
constexpr std::uint8_t recorderId=1;
enum class Operation : std::uint32_t {Setup,Advance,Command,Leave,End,MenuOpened};

bool digestValid(const std::string& value) {
    return value.size()==64 && std::all_of(value.begin(),value.end(),[](char c){return (c>='0' && c<='9') || (c>='a' && c<='f');});
}

const World& recordingWorld(const ScriptSession& session) {
    if(!session.world() || !session.configured() || session.mainStarted() || !session.localPlayer() || !session.initialRandomSeed() || !session.units().empty() || session.runtime().threadCount())
        throw std::runtime_error("Solo replay needs an initialized local setup before map main");
    if(!session.soloReplayError().empty())throw std::runtime_error(session.soloReplayError());
    return *session.world();
}

ReplayWriter createWriter(const ScriptSession& session) {
    auto& world=recordingWorld(session);auto& archives=world.resources();auto& info=world.data().info;
    auto base=fs::canonical(archives.root()/L"Maps");auto path=fs::canonical(archives.mapPath()).lexically_relative(base);
    if(path.empty() || path.has_root_path() || *path.begin()==L".." || *path.begin()==L"." || CompareStringOrdinal(path.begin()->c_str(),-1,L"Campaign",-1,TRUE)==CSTR_EQUAL)throw std::runtime_error("Solo replay requires an installed map");
    if(info.playable[0]>65535 || info.playable[1]>65535)throw std::runtime_error("Invalid solo replay map dimensions");
    ReplayGame game;
    game.name=info.name.empty()?"单人遭遇战":info.name;
    game.mapPath=utf8((fs::path(L"Maps")/path).wstring());game.width=std::uint16_t(info.playable[0]);game.height=std::uint16_t(info.playable[1]);
    const auto local=*session.localPlayer();game.hostName=session.config().players[local].name;
    game.host={recorderId,game.hostName};game.gameType=1;
    ReplaySetup setup;setup.randomSeed=*session.initialRandomSeed();
    const auto& players=session.config().players;
    for(unsigned i=0;i<players.size();++i){
        auto& player=players[i];if(player.slotState!=1 || player.observer || (i!=local && player.controller!=1))continue;
        LanSlot slot{};slot.playerId=i==local?recorderId:0;slot.status=2;slot.computer=i!=local;slot.team=std::uint8_t(player.team);slot.color=std::uint8_t(player.color);slot.handicap=100;
        setup.slots.push_back(slot);
    }
    setup.players=std::uint8_t(setup.slots.size());game.playerCount=setup.players;
    return ReplayWriter({formatVersion,soloReplayProduct,0,0,true},game,{},setup);
}

const LanAction& onlyAction(const LanTimeSlot& slot) {
    if(slot.actions.size()!=1 || slot.actions.front().playerId!=recorderId)throw std::runtime_error("Invalid solo replay action stream");
    return slot.actions.front();
}

std::uint32_t result(const ScriptSession& session) {
    return session.results()[*session.localPlayer()].value_or(UINT32_MAX);
}
}

SoloReplaySetup readSoloReplaySetup(const Replay& replay) {
    const auto& header=replay.header();
    if(header.product!=soloReplayProduct || header.version!=formatVersion || !header.singlePlayer)throw std::runtime_error("不支持此单机回放版本。");
    const auto& records=replay.records();
    if(records.size()<6 || records[0].kind!=ReplayRecordKind::Setup || records[1].kind!=ReplayRecordKind::CountdownStart || records[2].kind!=ReplayRecordKind::CountdownEnd || records[3].kind!=ReplayRecordKind::GameStart || records[4].kind!=ReplayRecordKind::TimeSlot || records[4].fragment || records[4].slot.elapsedMs)
        throw std::runtime_error("单机回放缺少初始配置。");
    Binary in(onlyAction(records[4].slot).bytes);
    if(in.u32()!=unsigned(Operation::Setup))throw std::runtime_error("单机回放缺少初始操作。");
    if(snapshotText(in,64)!=executableDigest())throw std::runtime_error("单机回放需要录制时使用的相同程序版本。");
    SoloReplaySetup setup;
    setup.mapDigest=snapshotText(in,64);setup.commonDigest=snapshotText(in,64);setup.seed=records.front().setup.randomSeed;
    setup.version=in.u32();setup.local=in.u32();setup.difficulty={in.u32(),in.u32()};
    if(!digestValid(setup.mapDigest) || !digestValid(setup.commonDigest) || setup.version>1 || setup.local>=16 || setup.difficulty.first>3 || setup.difficulty.second>3)
        throw std::runtime_error("单机回放初始配置无效。");
    auto data=in.take(in.left());
    setup.playerConfiguration.assign(data.begin(),data.end());
    return setup;
}

void restoreSoloReplaySetup(ScriptSession& session,const SoloReplaySetup& recorded) {
    if(session.difficultyContext()!=recorded.difficulty)throw std::runtime_error("单机回放地图初始难度不同。");
    PlayerSetup setup(session.world()->data().info,session.config());
    setup.defaultMeleeOpponent();session.applySetup(setup);
    if(setup.localPlayer()!=recorded.local && !setup.control(recorded.local,SlotControl::Local))throw std::runtime_error("单机回放玩家席位不可用。");
    session.applySetup(setup);session.restorePlayerConfiguration(recorded.playerConfiguration);
}

SoloReplayRecorder::SoloReplayRecorder(const ScriptSession& session,std::stop_token stop):writer_(createWriter(session)),root_(session.world()->resources().root()) {
    validateSoloReplayScript(session.runtime().module());
    auto& archives=session.world()->resources();auto difficulty=session.difficultyContext();
    SnapshotWriter out(maxActionBytes);out.u32(unsigned(Operation::Setup));out.text(executableDigest(),64);out.text(archives.mapDigest(),64);out.text(archives.commonDigest(stop),64);
    out.u32(session.gameVersion());out.u32(*session.localPlayer());out.u32(difficulty.first);out.u32(difficulty.second);out.raw(session.encodePlayerConfiguration());
    writer_.appendTimeSlot({0,{{recorderId,out.finish()}}});
}

void SoloReplayRecorder::invalidate(std::string message) {if(error_.empty())error_=std::move(message);}
void SoloReplayRecorder::append(std::uint16_t elapsed,Bytes bytes) {
    if(sealed_ || !error_.empty())return;
    try{writer_.appendTimeSlot({elapsed,{{recorderId,std::move(bytes)}}});}catch(const std::exception& e){invalidate(e.what());}
}
void SoloReplayRecorder::advance(ScriptSession& session,double elapsed,std::uint16_t playbackMs) {
    if(!session.soloReplayError().empty())invalidate(session.soloReplayError());
    if(sealed_ || !error_.empty())return;
    if(!std::isfinite(elapsed) || elapsed<0 || elapsed>.151 || playbackMs>100){invalidate("Invalid solo replay elapsed time");return;}
    session.updateSoloReplayVisibility();
    SnapshotWriter out(12);out.u32(unsigned(Operation::Advance));out.u64(std::bit_cast<std::uint64_t>(elapsed));append(playbackMs,out.finish());
}
void SoloReplayRecorder::command(ScriptSession& session,const PlayerCommand& command,unsigned result) {
    if(sealed_ || !error_.empty())return;
    session.updateSoloReplayVisibility();
    try{SnapshotWriter out(maxActionBytes);out.u32(unsigned(Operation::Command));out.u32(result);out.raw(encodeSoloCommand(command));append(0,out.finish());}catch(const std::exception& e){invalidate(e.what());}
}
void SoloReplayRecorder::leave(ScriptSession& session) {
    if(sealed_ || !error_.empty())return;
    session.updateSoloReplayVisibility();
    SnapshotWriter out(4);out.u32(unsigned(Operation::Leave));append(0,out.finish());
}
void SoloReplayRecorder::commandMenuOpened(ScriptSession& session,bool skills) {
    if(sealed_ || !error_.empty())return;
    session.updateSoloReplayVisibility();
    SnapshotWriter out(8);out.u32(unsigned(Operation::MenuOpened));out.u32(skills);append(0,out.finish());
}
bool SoloReplayRecorder::seal(const ScriptSession& session) {
    if(!session.soloReplayError().empty())invalidate(session.soloReplayError());
    if(!sealed_ && error_.empty() && session.exitRequest()==SessionExit::Return && session.showScores() && !session.replaySavingDisabled()){
        SnapshotWriter out(20);out.u32(unsigned(Operation::End));out.u64(std::bit_cast<std::uint64_t>(session.simulationTime()));out.u32(result(session));out.u32(session.localNetworkChecksum());
        append(0,out.finish());sealed_=true;
    }
    return sealed_ && error_.empty();
}
fs::path SoloReplayRecorder::save(const std::wstring& name) const {
    if(!sealed_ || !error_.empty())throw std::runtime_error("单机回放不可用。");
    return publishNamedReplay(root_,name,writer_.serialize());
}

std::optional<std::string> SoloReplayPlayer::consume(ScriptSession& session,const LanTimeSlot& slot) {
    if(finished_)return "单机回放结束后仍有操作。";
    Binary in(onlyAction(slot).bytes);
    auto operation=Operation(in.u32());
    if(!setup_){
        if(operation!=Operation::Setup || slot.elapsedMs)return "单机回放缺少初始配置。";
        setup_=true;return {};
    }
    if(operation!=Operation::Advance && slot.elapsedMs)return "单机回放操作时间无效。";
    switch(operation){
    case Operation::Advance:{
        auto elapsed=std::bit_cast<double>(snapshotU64(in));in.finish();
        if(!std::isfinite(elapsed) || elapsed<0 || elapsed>.151 || slot.elapsedMs>100)return "单机回放推进时间无效。";
        session.advance(elapsed);break;
    }
    case Operation::Command:{
        auto expected=in.u32();auto command=decodeSoloCommand(in.take(in.left()));
        if(command.player!=session.localPlayer())return "单机回放操作的玩家席位无效。";
        if(dispatchPlayerCommand(session,command)!=expected)return "单机回放的操作结果不一致。";
        break;
    }
    case Operation::Leave:in.finish();session.leaveGame();break;
    case Operation::MenuOpened:{
        auto skills=in.u32();in.finish();
        if(skills>1)return "单机回放命令面板无效。";
        session.commandMenuOpened(skills!=0);break;
    }
    case Operation::End:{
        auto time=snapshotU64(in);auto outcome=in.u32(),checksum=in.u32();in.finish();
        if(session.exitRequest()!=SessionExit::Return || !session.showScores() || session.replaySavingDisabled() || std::bit_cast<std::uint64_t>(session.simulationTime())!=time || result(session)!=outcome || session.localNetworkChecksum()!=checksum)
            return "单机回放的结算状态不一致。";
        finished_=true;return {};
    }
    default:return "未知的单机回放操作。";
    }
    session.updateSoloReplayVisibility();
    return {};
}
}
