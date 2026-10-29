// Author: MiYu. Drive an enabled LAN game with ordered transport slots and explicit original-protocol providers.
#pragma once
#include "game_view.h"
#include "lan_host.h"
#include <functional>
#include <memory>
#include <optional>
#include <string>

namespace war3 {
class LanRuntime {
public:
    using AbilityFields=std::function<std::optional<LanAbilityWireFields>(const PlayerCommand&)>;
    using Checksum=std::function<std::optional<std::uint32_t>(const ScriptSession&)>;
    using SlotObserver=std::function<void(const LanTimeSlot&)>;
private:
    struct Bridge;
    GameView& game_;
    ScriptSession& session_;
    std::unique_ptr<LanHost> host_;
    std::unique_ptr<LanJoin> join_;
    std::shared_ptr<Bridge> bridge_;
    Checksum checksum_;
    SlotObserver slotObserver_;
    std::string observerError_;
    std::uint16_t interval_;
    std::uint64_t nextFrame_=0,lastClock_=0;
    bool started_=false,failed_=false;
    std::string error_;
    bool fail(std::string message);
    void attach(std::uint8_t peer,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,AbilityFields fields,bool experimental);
public:
    // The GameView and its ScriptSession must outlive this runtime; call before the first draw.
    LanRuntime(GameView& game,ScriptSession& session,std::unique_ptr<LanHost> host,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,AbilityFields fields,Checksum checksum,std::uint16_t intervalMs,bool experimental=false);
    LanRuntime(GameView& game,ScriptSession& session,std::unique_ptr<LanJoin> join,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,AbilityFields fields,Checksum checksum,bool experimental=false);
    ~LanRuntime();
    LanRuntime(const LanRuntime&)=delete;
    LanRuntime& operator=(const LanRuntime&)=delete;
    // Called on the same thread as GameView with a monotonic millisecond clock.
    bool pump(std::uint64_t now);
    // Optional recorder must be attached before the first pump; errors stop recording only.
    bool observeSlots(SlotObserver observer);
    const std::string& observerError() const {return observerError_;}
    bool failed() const {return failed_;}
    const std::string& error() const {return error_;}
};
}
