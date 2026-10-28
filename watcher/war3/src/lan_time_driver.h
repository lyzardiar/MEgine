// Author: MiYu. Ordered, bounded application of W3GS time slots to a game session.
#pragma once
#include "lan_join.h"
#include <functional>
#include <string>

namespace war3 {
class ScriptSession;
enum class LanStepResult {Applied,Duplicate,OutOfOrder,Failed};

// The caller supplies monotonically increasing local sequence numbers beginning at 1
// when taking complete slots from the transport FIFO. W3GS itself carries no sequence.
// Callbacks validate every action without mutation, then apply actions in wire order.
// A failed callback or reentrant call permanently fails the driver: partial game effects
// cannot be rolled back or replayed. Unknown original actions must fail validation. Apply
// returns true for a decoded order processed normally even if gameplay rules reject it.
class LanTimeDriver {
public:
    using ValidateAction=std::function<bool(const LanAction&)>;
    using ApplyAction=std::function<bool(ScriptSession&,const LanAction&)>;
private:
    ScriptSession& session_;
    ValidateAction validate_;
    ApplyAction apply_;
    std::uint64_t next_=1,elapsedMs_=0;
    bool running_=false,failed_=false;
    std::optional<LanTimeSlot> last_;
    std::string error_;
    LanStepResult fail(std::string message);
public:
    LanTimeDriver(ScriptSession& session,ValidateAction validate,ApplyAction apply);
    LanStepResult consume(std::uint64_t sequence,const LanTimeSlot& slot);
    bool failed() const {return failed_;}
    const std::string& error() const {return error_;}
    std::uint64_t nextSequence() const {return next_;}
    // Network time includes elapsed time while the session was paused.
    std::uint64_t elapsedMilliseconds() const {return elapsedMs_;}
};
}
