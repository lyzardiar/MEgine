// Author: MiYu. Clocked, bounded replay record delivery to a configured session.
#include "replay_runtime.h"
#include <cmath>
#include <stdexcept>
#include <utility>

namespace war3 {
ReplayRuntime::ReplayRuntime(Replay replay,SlotConsumer consume,RecordHandler handle):replay_(std::move(replay)),consume_(std::move(consume)),handle_(std::move(handle)) {
    if(!consume_ || !handle_)throw std::invalid_argument("Replay requires slot and record consumers");
    const auto& records=replay_.records();
    for(std::size_t i=0;i<records.size();++i){const auto& record=records[i];if(record.kind==ReplayRecordKind::TimeSlot && !record.fragment){totalMs_+=record.slot.elapsedMs;lastSlotEnd_=i+1;}}
}
void ReplayRuntime::fail(std::string message) {stepRequested_=false;state_=ReplayRuntimeState::Failed;error_=std::move(message);}
bool ReplayRuntime::updateClock(Clock::time_point now) {
    if(last_ && now<*last_){fail("Replay clock moved backwards");return false;}
    if(last_ && state_==ReplayRuntimeState::Playing)budgetMs_+=std::chrono::duration<double,std::milli>(now-*last_).count()*speed_;
    last_=now;
    return true;
}
void ReplayRuntime::tick(Clock::time_point now) {
    if(running_){fail("Replay consumer reentered the runtime");return;}
    if(state_!=ReplayRuntimeState::Playing && state_!=ReplayRuntimeState::Paused)return;
    if(!updateClock(now))return;
    const auto activeState=state_;
    const bool stepping=activeState==ReplayRuntimeState::Paused;
    if(stepping && !stepRequested_)return;
    running_=true;
    try {
        auto& records=replay_.records();
        for(unsigned work=0;work<256 && state_==activeState;++work) {
            if(index_==records.size()){if(fragmentPending_)fail("Replay ended inside a time slot fragment");else{state_=ReplayRuntimeState::Finished;stepRequested_=false;}break;}
            const auto& record=records[index_];
            if(record.kind!=ReplayRecordKind::TimeSlot){if(fragmentPending_){fail("Replay record interrupts a time slot fragment");break;}if(auto error=handle_(record)){fail("Replay record: "+*error);break;}if(state_!=activeState)break;++index_;continue;}
            if(!stepping && !record.fragment && budgetMs_<record.slot.elapsedMs)break;
            std::size_t size=0;for(const auto& action:record.slot.actions){if(action.bytes.size()>262141 || size>262144-action.bytes.size()-3)throw std::runtime_error("Replay fragment budget exceeded");size+=action.bytes.size()+3;}
            if(size>262144-fragmentBytes_ || record.slot.actions.size()>4096-fragments_.size())throw std::runtime_error("Replay fragment budget exceeded");
            fragments_.insert(fragments_.end(),record.slot.actions.begin(),record.slot.actions.end());fragmentBytes_+=size;++index_;
            if(record.fragment){fragmentPending_=true;continue;}
            LanTimeSlot slot{record.slot.elapsedMs,std::move(fragments_)};fragments_.clear();fragmentBytes_=0;fragmentPending_=false;
            if(auto error=consume_(slot)){fail("Replay time slot: "+*error);break;}if(state_!=activeState)break;elapsedMs_+=slot.elapsedMs;
            if(stepping){
                if(index_==records.size()){stepRequested_=false;state_=ReplayRuntimeState::Finished;break;}
                if(index_<lastSlotEnd_){stepRequested_=false;break;}
                continue;
            }
            budgetMs_-=slot.elapsedMs;
        }
    }catch(const std::exception& error){fail(std::string("Replay playback: ")+error.what());}catch(...){fail("Replay playback: unknown callback failure");}
    running_=false;
}
bool ReplayRuntime::requestStep() {
    if(running_){fail("Replay consumer reentered the runtime");return false;}
    if(state_!=ReplayRuntimeState::Paused || stepRequested_)return false;
    stepRequested_=true;
    return true;
}
void ReplayRuntime::pause(bool paused,Clock::time_point now) {
    if(running_){fail("Replay consumer reentered the runtime");return;}
    if(state_==ReplayRuntimeState::Paused){if(updateClock(now) && !paused){stepRequested_=false;state_=ReplayRuntimeState::Playing;}return;}
    tick(now);
    if(state_==ReplayRuntimeState::Playing && paused)state_=ReplayRuntimeState::Paused;
}
void ReplayRuntime::speed(double value,Clock::time_point now) {
    if(!std::isfinite(value) || value<.25 || value>8)throw std::invalid_argument("Replay speed must be between 0.25 and 8");
    if(running_){fail("Replay consumer reentered the runtime");return;}
    if(state_==ReplayRuntimeState::Paused)updateClock(now);else tick(now);
    if(state_==ReplayRuntimeState::Playing || state_==ReplayRuntimeState::Paused)speed_=value;
}
void ReplayRuntime::stop() {if(running_){fail("Replay consumer reentered the runtime");return;}if(state_==ReplayRuntimeState::Playing || state_==ReplayRuntimeState::Paused){stepRequested_=false;state_=ReplayRuntimeState::Stopped;}}
}
