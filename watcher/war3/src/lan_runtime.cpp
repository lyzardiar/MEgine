// Author: MiYu. Keep host and peer transport, game commands, ordered simulation and checksum callbacks together.
#include "lan_runtime.h"
#include <limits>
#include <stdexcept>
#include <utility>

namespace war3 {
struct LanRuntime::Bridge {
    ScriptSession* session=nullptr;
    LanHost* host=nullptr;
    LanJoin* join=nullptr;
    std::uint8_t peer=0;
    bool active=true;
    bool experimental=false;
    LanWireObjectResolver wire;
    AbilityFields fields;
    bool send(std::span<const std::uint8_t> bytes) const {return active && (host?host->submitHostAction(bytes):join && join->sendAction(bytes));}
};
void LanRuntime::attach(std::uint8_t peer,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,AbilityFields fields,bool experimental) {
    if(&game_.session()!=&session_ || !peer || !resolve || !wire || !fields || !checksum_ || !session_.mainStarted() || session_.networkPlayer(peer)!=session_.localPlayer() || !session_.localPlayer())throw std::runtime_error("LAN runtime requires configured providers and local session");
    auto bridge=std::make_shared<Bridge>();bridge->session=&session_;bridge->host=host_.get();bridge->join=join_.get();bridge->peer=peer;bridge->experimental=experimental;bridge->wire=wire;bridge->fields=std::move(fields);
    auto selection=[bridge](std::span<const std::uint8_t> bytes){return bridge->send(bytes);};
    auto submit=[bridge,experimental](const PlayerCommand& command)->unsigned{if(!bridge->active)return 0;if(command.kind==PlayerCommandKind::Chat){if(!experimental || bridge->session->networkPlayer(bridge->peer)!=std::optional<unsigned>{command.player})return 0;std::array<LanDecodedAction,1> actions{LanActionExperimentalChat{command.text,command.chatChannel}};auto bytes=encodeLanActions(actions,true);return bridge->send(bytes)?1u:0u;}auto fields=bridge->fields(command);if(!fields)return 0;auto bytes=encodeLanPlayerCommand(*bridge->session,bridge->peer,command,*fields,bridge->wire);return bridge->send(bytes)?1u:0u;};
    if(!game_.enableLan(peer,std::move(resolve),std::move(wire),std::move(selection),std::move(submit),experimental))throw std::runtime_error("Cannot attach LAN runtime to game view");bridge_=std::move(bridge);
}
LanRuntime::LanRuntime(GameView& game,ScriptSession& session,std::unique_ptr<LanHost> host,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,AbilityFields fields,Checksum checksum,std::uint16_t intervalMs,bool experimental) : game_(game),session_(session),host_(std::move(host)),checksum_(std::move(checksum)),interval_(intervalMs) {
    if(!host_ || !interval_ || interval_>1000 || !host_->running() || host_->loadPhase()!=LanLoadPhase::Ready || !host_->enableTimeSlotProtocol())throw std::runtime_error("LAN host is not ready for simulation");attach(1,std::move(resolve),std::move(wire),std::move(fields),experimental);
}
LanRuntime::LanRuntime(GameView& game,ScriptSession& session,std::unique_ptr<LanJoin> join,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,AbilityFields fields,Checksum checksum,bool experimental) : game_(game),session_(session),join_(std::move(join)),checksum_(std::move(checksum)),interval_(0) {
    if(!join_ || join_->state()!=LanJoinState::Lobby || join_->loadPhase()!=LanLoadPhase::Ready || !join_->enableTimeSlotProtocol())throw std::runtime_error("LAN peer is not ready for simulation");attach(join_->localPlayerId(),std::move(resolve),std::move(wire),std::move(fields),experimental);
}
LanRuntime::~LanRuntime(){if(bridge_)bridge_->active=false;}
bool LanRuntime::fail(std::string message){failed_=true;if(bridge_)bridge_->active=false;error_=std::move(message);return false;}
bool LanRuntime::observeSlots(SlotObserver observer){if(started_ || failed_ || !observer || slotObserver_ || !observerError_.empty())return false;slotObserver_=std::move(observer);return true;}
void LanRuntime::flushSelectionSync(){if(!bridge_ || !bridge_->active || !bridge_->experimental)return;for(unsigned count=0;count<32;++count){auto pending=session_.pendingSelectionSync();if(!pending)break;std::array<LanDecodedAction,1> actions{*pending};auto bytes=encodeLanActions(actions,true);if(!bridge_->send(bytes))break;session_.popSelectionSync();}}
bool LanRuntime::pump(std::uint64_t now) {
    if(failed_)return false;if(started_ && now<lastClock_)return fail("LAN clock moved backwards");lastClock_=now;
    try{
        if(host_){host_->poll();if(!host_->running() || host_->loadPhase()!=LanLoadPhase::Ready)return fail("LAN host disconnected");if(host_->checksumMismatch())return fail("LAN simulation checksum mismatch");if(!started_){if(now>std::numeric_limits<std::uint64_t>::max()-interval_)return fail("LAN clock exceeds limit");nextFrame_=now+interval_;started_=true;}for(unsigned count=0;count<8 && now>=nextFrame_;++count){if(!host_->emitTimeSlot(interval_))break;if(nextFrame_>std::numeric_limits<std::uint64_t>::max()-interval_)return fail("LAN clock exceeds limit");nextFrame_+=interval_;}}
        else{join_->poll();if(join_->state()!=LanJoinState::Lobby || join_->loadPhase()!=LanLoadPhase::Ready)return fail(join_->error().empty()?"LAN host disconnected":join_->error());started_=true;}
        for(unsigned count=0;count<256;++count){auto slot=host_?host_->takeTimeSlot():join_->takeTimeSlot();if(!slot)break;auto simulation=game_.lanSimulation();if(!simulation)return fail("LAN simulation unavailable");auto result=game_.consumeLanSlot(simulation->nextSequence(),*slot);if(!result || *result!=LanStepResult::Applied)return fail("LAN time slot application failed");if(slotObserver_){try{slotObserver_(*slot);}catch(const std::exception& e){observerError_=e.what();if(observerError_.empty())observerError_="Replay slot observer failed";slotObserver_={};}catch(...){observerError_="Replay slot observer failed";slotObserver_={};}}auto value=checksum_(session_);if(!value || !(host_?host_->submitHostChecksum(*value):join_->sendChecksum(*value)))return fail("LAN checksum unavailable or could not be sent");if(host_ && host_->checksumMismatch())return fail("LAN simulation checksum mismatch");}
        flushSelectionSync();return true;
    }catch(const std::exception& e){return fail(e.what());}
}
}
