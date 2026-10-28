// Author: MiYu. Progress the LAN map and render preparation without losing the live loading connection.
#include "lan_match_loading.h"
#include <stdexcept>
#include <utility>

namespace war3 {
std::unique_ptr<LanRuntime> LanMatchReady::start(GameView& game,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,LanRuntime::AbilityFields fields,LanRuntime::Checksum checksum,std::uint16_t hostIntervalMs) {
    if(data || bool(host)==bool(join) || !expectedSession || &game.session()!=expectedSession)throw std::runtime_error("LAN game data must be moved to its matching view before starting");
    if(host)return std::make_unique<LanRuntime>(game,game.session(),std::move(host),std::move(resolve),std::move(wire),std::move(fields),std::move(checksum),hostIntervalMs);
    return std::make_unique<LanRuntime>(game,game.session(),std::move(join),std::move(resolve),std::move(wire),std::move(fields),std::move(checksum));
}
LanMatchLoading::LanMatchLoading(const fs::path& root,bool muted,Log& log,LanHostHandoff handoff) : preparation_(root,muted),loader_(log) {
    if(!handoff.host || !handoff.host->enableTimeSlotProtocol())throw std::runtime_error("Cannot arm LAN host while loading");mapRequest_=handoff.requestPreparation(preparation_);host_=std::move(handoff.host);
}
LanMatchLoading::LanMatchLoading(const fs::path& root,bool muted,Log& log,LanLobbyHandoff handoff,std::vector<unsigned> slotPlayerIds) : preparation_(root,muted),loader_(log) {
    if(!handoff.join || !handoff.join->enableTimeSlotProtocol())throw std::runtime_error("Cannot arm LAN peer while loading");mapRequest_=handoff.requestPreparation(preparation_,std::move(slotPlayerIds));join_=std::move(handoff.join);
}
LanMatchLoading::~LanMatchLoading(){cancel();}
bool LanMatchLoading::fail(std::string message){if(phase_==LanLoadingPhase::Failed || phase_==LanLoadingPhase::Transferred)return false;error_=std::move(message);preparation_.clear();loader_.cancel();data_.reset();if(host_)host_->cancel();if(join_)join_->cancel();phase_=LanLoadingPhase::Failed;return false;}
void LanMatchLoading::cancel(){if(phase_==LanLoadingPhase::Transferred || phase_==LanLoadingPhase::Failed)return;fail("LAN loading cancelled");}
bool LanMatchLoading::pollConnection(){
    if(host_){host_->poll();if(!host_->running() || (host_->loadPhase()!=LanLoadPhase::Loading && host_->loadPhase()!=LanLoadPhase::Ready))return fail(host_->error().empty()?"LAN host disconnected while loading":host_->error());}
    else if(join_){join_->poll();if(join_->state()!=LanJoinState::Lobby || (join_->loadPhase()!=LanLoadPhase::Loading && join_->loadPhase()!=LanLoadPhase::Ready))return fail(join_->error().empty()?"LAN peer disconnected while loading":join_->error());}
    else return fail("LAN loading connection unavailable");return true;
}
bool LanMatchLoading::pump(Renderer& renderer,const Prepared& onPrepared){
    if(phase_==LanLoadingPhase::Failed || phase_==LanLoadingPhase::Transferred)return false;
    try{
        if(!pollConnection())return false;
        if(phase_==LanLoadingPhase::Preparing){if(auto result=preparation_.poll();result && result->request==mapRequest_){if(!result->error.empty() || !result->session)return fail(result->error.empty()?"LAN map preparation failed":result->error);if(onPrepared)onPrepared(*result->session);loadRequest_=loader_.request(std::move(result->session));phase_=LanLoadingPhase::Loading;}}
        if(phase_==LanLoadingPhase::Loading){if(auto result=loader_.poll();result && result->request==loadRequest_){if(!result->error.empty() || !result->data)return fail(result->error.empty()?"LAN map loading failed":result->error);data_=std::move(result->data);phase_=LanLoadingPhase::Uploading;}}
        if(phase_==LanLoadingPhase::Uploading){auto deadline=GetTickCount64()+4;while(GetTickCount64()<deadline && data_->uploadOne(renderer)){}if(data_->uploaded()==data_->uploadCount()){bool reported=host_?host_->reportHostLoaded():join_->reportLocalLoaded();if(reported)phase_=LanLoadingPhase::WaitingPlayers;}}
        if(phase_==LanLoadingPhase::WaitingPlayers && (host_?host_->loadPhase():join_->loadPhase())==LanLoadPhase::Ready)phase_=LanLoadingPhase::Ready;
        return true;
    }catch(const std::exception& e){return fail(e.what());}
}
std::optional<LanMatchReady> LanMatchLoading::takeReady(){if(phase_!=LanLoadingPhase::Ready || !data_ || bool(host_)==bool(join_))return {};LanMatchReady result;result.expectedSession=data_->session.get();result.data=std::move(data_);result.host=std::move(host_);result.join=std::move(join_);phase_=LanLoadingPhase::Transferred;return result;}
}
