// Author: MiYu. Apply complete ordered network time slots without wall-clock stepping.
#include "lan_time_driver.h"
#include "session.h"
#include <limits>
#include <utility>

namespace war3 {
namespace {
bool sameSlot(const LanTimeSlot& a,const LanTimeSlot& b){if(a.elapsedMs!=b.elapsedMs || a.actions.size()!=b.actions.size())return false;for(size_t i=0;i<a.actions.size();++i)if(a.actions[i].playerId!=b.actions[i].playerId || a.actions[i].bytes!=b.actions[i].bytes)return false;return true;}
}
LanTimeDriver::LanTimeDriver(ScriptSession& session,ValidateAction validate,ApplyAction apply) : session_(session),validate_(std::move(validate)),apply_(std::move(apply)) {}
LanStepResult LanTimeDriver::fail(std::string message){failed_=true;error_=std::move(message);return LanStepResult::Failed;}
LanStepResult LanTimeDriver::consume(std::uint64_t sequence,const LanTimeSlot& slot){
    if(failed_)return LanStepResult::Failed;if(running_)return fail("Reentrant LAN time slot consumption");if(sequence!=next_){if(next_>1 && sequence==next_-1 && last_){if(sameSlot(*last_,slot))return LanStepResult::Duplicate;return fail("Conflicting duplicate LAN time slot");}return LanStepResult::OutOfOrder;}
    if(next_==std::numeric_limits<std::uint64_t>::max() || elapsedMs_>std::numeric_limits<std::uint64_t>::max()-slot.elapsedMs)return fail("LAN time sequence exceeds limit");if(!validate_ || !apply_ || !session_.mainStarted())return fail("LAN time driver is not ready");
    if(slot.actions.size()>4096)return fail("LAN time slot action count exceeds limit");size_t bytes=0;for(const auto& action:slot.actions){if(!action.playerId || action.playerId==255 || action.bytes.size()>65535 || action.bytes.size()+3>262144-bytes)return fail("Invalid LAN time slot action");bytes+=action.bytes.size()+3;}
    running_=true;struct Reset{bool& value;~Reset(){value=false;}}reset{running_};
    try{
        // Keep one bounded, exact slot for duplicate detection before any effects.
        LanTimeSlot retained=slot;for(const auto& action:slot.actions){if(!validate_(action))return fail("Unsupported or invalid LAN action");if(failed_)return LanStepResult::Failed;}
        for(const auto& action:slot.actions){if(!apply_(session_,action))return fail("LAN action application failed");if(failed_)return LanStepResult::Failed;}
        // ScriptSession caps one advance at 60 seconds; preserve all transmitted time.
        double seconds=double(slot.elapsedMs)/1000.;while(seconds>60.){session_.advance(60.);if(failed_)return LanStepResult::Failed;seconds-=60.;}session_.advance(seconds);if(failed_)return LanStepResult::Failed;
        last_=std::move(retained);elapsedMs_+=slot.elapsedMs;++next_;return LanStepResult::Applied;
    }catch(const std::exception& e){return fail(std::string("LAN time slot failed: ")+e.what());}catch(...){return fail("LAN time slot failed");}
}
}
