// Author: MiYu. Consume only supported original actions through network time slots.
#pragma once
#include "lan_actions.h"
#include "lan_time_driver.h"

namespace war3 {
// Entire slots are validated before effects. Only classic pause and resume have a
// consumer; object selection and orders require a verified original object-ID map.
class LanSimulation {
    ScriptSession& session_;
    std::vector<std::vector<LanDecodedAction>> decoded_;
    std::size_t cursor_=0;
    bool consuming_=false;
    LanTimeDriver driver_;
    bool validate(const LanAction& action);
    bool apply(ScriptSession& session,const LanAction& action);
public:
    explicit LanSimulation(ScriptSession& session);
    LanSimulation(const LanSimulation&)=delete;
    LanSimulation& operator=(const LanSimulation&)=delete;
    LanSimulation(LanSimulation&&)=delete;
    LanSimulation& operator=(LanSimulation&&)=delete;
    LanStepResult consume(std::uint64_t sequence,const LanTimeSlot& slot);
    bool failed() const{return driver_.failed();}
    const std::string& error() const{return driver_.error();}
    std::uint64_t nextSequence() const{return driver_.nextSequence();}
    std::uint64_t elapsedMilliseconds() const{return driver_.elapsedMilliseconds();}
};
}
