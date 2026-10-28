// Author: MiYu. Validate a whole W3GS slot before applying supported game actions.
#include "lan_simulation.h"
#include "session.h"
#include <utility>

namespace war3 {
LanSimulation::LanSimulation(ScriptSession& session):session_(session),driver_(session,[this](const LanAction& action){return validate(action);},[this](ScriptSession& target,const LanAction& action){return apply(target,action);}){}
bool LanSimulation::validate(const LanAction& action){
    if(!session_.networkPlayer(action.playerId))return false;auto events=decodeLanActions(action.bytes);
    for(const auto& event:events)if(!std::holds_alternative<LanActionPause>(event) && !std::holds_alternative<LanActionResume>(event))return false;
    decoded_.push_back(std::move(events));return true;
}
bool LanSimulation::apply(ScriptSession& session,const LanAction&){
    if(cursor_>=decoded_.size())return false;
    for(const auto& event:decoded_[cursor_++]){
        if(std::holds_alternative<LanActionPause>(event))session.pause(true);
        else if(std::holds_alternative<LanActionResume>(event))session.pause(false);
        else return false;
    }
    return true;
}
LanStepResult LanSimulation::consume(std::uint64_t sequence,const LanTimeSlot& slot){
    if(consuming_)return driver_.consume(sequence,slot);consuming_=true;struct Reset{bool& value;~Reset(){value=false;}}reset{consuming_};decoded_.clear();cursor_=0;auto result=driver_.consume(sequence,slot);decoded_.clear();cursor_=0;return result;
}
}
