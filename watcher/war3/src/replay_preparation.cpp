// Author: MiYu. Resolve the recorded map and initialize the replay's player setup without unpacking assets.
#include "replay_preparation.h"
#include "replay_experimental.h"
#include "lan_setup.h"
#include <algorithm>
#include <map>
#include <stdexcept>
#include <utility>

namespace war3 {
namespace {
const ReplaySetup& initialSetup(const Replay& replay) {
    const ReplaySetup* setup=nullptr;for(const auto& record:replay.records()){if(record.kind==ReplayRecordKind::TimeSlot)break;if(record.kind==ReplayRecordKind::Setup){if(setup)throw std::runtime_error("Multiple replay initial slot records");setup=&record.setup;}}if(!setup)throw std::runtime_error("Replay initial slot record is missing");return *setup;
}
bool usableHash(const std::array<std::uint8_t,20>& hash) {return !std::all_of(hash.begin(),hash.end(),[](auto c){return c==0;}) && !std::all_of(hash.begin(),hash.end(),[](auto c){return c==0xff;});}
LanSessionSetup replaySetup(const Replay& replay,const MapInfo& info,std::uint8_t& perspective) {
    const auto& original=initialSetup(replay);LanSessionSetup setup;setup.slots=original.slots;setup.slotPlayerIds=lanHostSlotPlayerIds(info,setup.slots.size());setup.randomSeed=original.randomSeed;std::map<std::uint8_t,std::string> names;auto add=[&](const ReplayPlayer& player){if(!player.id || player.id==255 || player.name.empty() || player.name.size()>15 || player.name.find('\0')!=std::string::npos)throw std::runtime_error("Invalid recorded player");auto [it,inserted]=names.emplace(player.id,player.name);if(!inserted && it->second!=player.name)throw std::runtime_error("Conflicting recorded player IDs");};add(replay.game().host);for(const auto& record:replay.records()){if(record.kind==ReplayRecordKind::TimeSlot)break;if(record.kind==ReplayRecordKind::Player)add(record.player);}
    for(size_t i=0;i<setup.slots.size();++i){auto& slot=setup.slots[i];if(slot.status!=2){if(slot.team>=12)slot.team=std::uint8_t(i);if(slot.color>=12)slot.color=std::uint8_t(setup.slotPlayerIds[i]);if((slot.race&0x3f)!=1 && (slot.race&0x3f)!=2 && (slot.race&0x3f)!=4 && (slot.race&0x3f)!=8 && (slot.race&0x3f)!=32)slot.race=32;if(slot.handicap<50 || slot.handicap>100 || slot.handicap%10)slot.handicap=100;}if(slot.status==2 && !slot.computer){auto found=names.find(slot.playerId);if(found==names.end())throw std::runtime_error("Recorded human slot has no player record");setup.players.push_back({found->first,found->second});}}
    if(setup.players.empty())throw std::runtime_error("Replay has no active human slot");if(!perspective){auto host=std::find_if(setup.players.begin(),setup.players.end(),[&](const auto& p){return p.id==replay.game().host.id;});perspective=host==setup.players.end()?setup.players.front().id:host->id;}if(std::none_of(setup.players.begin(),setup.players.end(),[&](const auto& p){return p.id==perspective;}))throw std::runtime_error("Replay perspective player is not in an active slot");setup.localPeerId=perspective;return setup;
}
}
void PreparedReplay::startMain(){if(!session)throw std::runtime_error("Replay session already transferred");session->startMain();}
ReplayPreparation::ReplayPreparation(Archives& archives,std::shared_ptr<const Replay> replay,bool muted,std::uint8_t perspectivePeer,fs::path replayPath) : replay_(std::move(replay)),archives_(archives.fork()),preparation_(archives.root(),muted),replayPath_(std::move(replayPath)),perspectivePeer_(perspectivePeer) {
    if(!replay_)throw std::runtime_error("Missing replay");gameVersion_=replayProductVersion(replay_->header().product);initialSetup(*replay_);mapDigest_=experimentalLanReplayMapDigest(replay_->game());mapCheck_=std::make_unique<LanMapCheckTask>(archives,replay_->game().mapPath,true,true,mapDigest_.value_or(""));
}
ReplayPreparation::~ReplayPreparation(){cancel();}
bool ReplayPreparation::fail(std::string message){if(phase_==Phase::Transferred || phase_==Phase::Failed)return false;error_=std::move(message);if(mapCheck_)mapCheck_->cancel();mapCheck_.reset();preparation_.clear();prepared_.reset();phase_=Phase::Failed;return false;}
void ReplayPreparation::cancel(){if(phase_!=Phase::Transferred && phase_!=Phase::Failed)fail("Replay preparation canceled");}
bool ReplayPreparation::poll(){
    if(phase_==Phase::Failed || phase_==Phase::Transferred)return false;if(phase_==Phase::Ready)return true;try {
        if(phase_==Phase::Checking){auto result=mapCheck_->poll();if(!result)return true;auto& game=replay_->game();bool valid=result->error.empty() && result->value && result->mapInfo && result->snapshot;if(valid){auto& check=*result->value;valid=(!game.mapSha1 || !usableHash(*game.mapSha1) || *game.mapSha1==check.sha1) && (!game.mapChecksum || game.mapChecksum==0xffffffffu || game.mapChecksum==check.crc) && (!game.width || game.width==result->mapInfo->playable[0]) && (!game.height || game.height==result->mapInfo->playable[1]);}if(!valid){auto error=result->error.empty()?"Replay map does not match recorded identity":result->error;mapCheck_.reset();if(!sidecarAttempted_ && mapDigest_ && !replayPath_.empty()){sidecarAttempted_=true;mapCheck_=std::make_unique<LanMapCheckTask>(*archives_,experimentalLanReplayMapPath(replayPath_,*mapDigest_),*mapDigest_);return true;}return fail(error);}auto& check=*result->value;auto setup=replaySetup(*replay_,*result->mapInfo,perspectivePeer_);mapPath_=check.resolvedPath;request_=preparation_.requestLanMemory(std::move(result->snapshot),game.mapPath,std::move(setup),true,gameVersion_);mapCheck_.reset();phase_=Phase::Preparing;}
        if(phase_==Phase::Preparing)if(auto result=preparation_.poll();result && result->request==request_){if(!result->error.empty() || !result->session)return fail(result->error.empty()?"Replay session preparation failed":result->error);prepared_=std::move(result->session);phase_=Phase::Ready;}return true;
    }catch(const std::exception& e){return fail(e.what());}
}
std::optional<PreparedReplay> ReplayPreparation::takeReady(){if(phase_!=Phase::Ready || !prepared_)return {};PreparedReplay ready{std::move(replay_),std::move(prepared_),std::move(mapPath_),perspectivePeer_};phase_=Phase::Transferred;return ready;}
}
