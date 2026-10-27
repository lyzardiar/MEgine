// Author: MiYu. Source blight growth/dispel abilities progressively update the shared terrain and render dirty regions.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
void ScriptSession::blightGrowth(double delta) {
    for(auto& [id,u]:units_){if(u->removing || u->hidden() || std::bit_cast<float>(u->life.bits())<=0)continue;auto [ability,level]=sourceAbility(*u,"Abli");if(!ability)std::tie(ability,level)=sourceAbility(*u,"Ablp");if(!ability){u->blightAbility=0;continue;}auto& data=definitions();auto suffix=std::to_string(level);float maximum=data.number(ability,"AbilityData","Area"+suffix),step=data.number(ability,"AbilityData","DataA"+suffix,64),interval=data.number(ability,"AbilityData","Dur"+suffix,.08f);bool grow=data.number(ability,"AbilityData","DataB"+suffix)!=0;if(maximum<0 || maximum>100000 || step<=0 || interval<=0 || interval>86400)throw std::runtime_error("Invalid source blight growth parameters");if(u->blightAbility!=ability || u->blightLevel!=level){u->blightAbility=ability;u->blightLevel=level;u->blightRadius=0;u->blightDue=simulationTime_+interval;}if(u->paused){u->blightDue+=delta;continue;}if(u->blightRadius>=maximum || simulationTime_<u->blightDue)continue;double steps=std::floor((simulationTime_-u->blightDue)/interval)+1;u->blightDue+=steps*interval;u->blightRadius=float(std::min(double(maximum),u->blightRadius+steps*step));requireWorld().blight({u->x,u->y},u->blightRadius,grow);}
}
}
