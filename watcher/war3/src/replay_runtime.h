// Author: MiYu. Clocked, bounded replay record delivery to a configured session.
#pragma once
#include "replay.h"
#include <chrono>
#include <functional>

namespace war3 {
enum class ReplayRuntimeState {Playing,Paused,Finished,Stopped,Failed};
// The consumer must apply a complete slot in order and return an error on any failure.
// The record handler must explicitly handle every non-slot record; neither callback may reenter this runtime.
class ReplayRuntime {
public:
    using Clock=std::chrono::steady_clock;
    using SlotConsumer=std::function<std::optional<std::string>(const LanTimeSlot&)>;
    using RecordHandler=std::function<std::optional<std::string>(const ReplayRecord&)>;
private:
    Replay replay_;
    SlotConsumer consume_;
    RecordHandler handle_;
    std::size_t index_=0,fragmentBytes_=0;
    std::vector<LanAction> fragments_;
    bool fragmentPending_=false,running_=false;
    ReplayRuntimeState state_=ReplayRuntimeState::Playing;
    std::optional<Clock::time_point> last_;
    double budgetMs_=0,speed_=1;
    std::uint64_t elapsedMs_=0,totalMs_=0;
    std::string error_;
    void fail(std::string message);
public:
    ReplayRuntime(Replay replay,SlotConsumer consume,RecordHandler handle);
    ReplayRuntime(const ReplayRuntime&)=delete;
    ReplayRuntime& operator=(const ReplayRuntime&)=delete;
    // A maximum of 256 records is processed per call; remaining clock debt is retained.
    void tick(Clock::time_point now);
    void pause(bool paused,Clock::time_point now);
    void speed(double value,Clock::time_point now);
    void stop();
    ReplayRuntimeState state() const {return state_;}
    const std::string& error() const {return error_;}
    double speed() const {return speed_;}
    std::uint64_t elapsedMs() const {return elapsedMs_;}
    std::uint64_t totalMs() const {return totalMs_;}
    const Replay& replay() const {return replay_;}
};
}
