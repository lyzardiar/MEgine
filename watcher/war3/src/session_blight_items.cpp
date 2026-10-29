// Author: MiYu. Ground-targeted item blight spreads in the session without retaining the caster.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
bool ScriptSession::reserveItemBlight() {if(itemBlightGrowth_.size()+itemBlightReservations_>=4096)return false;itemBlightGrowth_.reserve(itemBlightGrowth_.size()+itemBlightReservations_+1);++itemBlightReservations_;return true;}
void ScriptSession::releaseItemBlightReservation() {if(!itemBlightReservations_)throw std::runtime_error("Missing item blight reservation");--itemBlightReservations_;}
bool ScriptSession::startItemBlight(std::uint32_t ability,WorldPoint point) {
    auto& data=definitions();float maximum=data.number(ability,"AbilityData","Area1"),step=data.number(ability,"AbilityData","DataA1",64),interval=data.number(ability,"AbilityData","Dur1",.08f),flag=data.number(ability,"AbilityData","DataB1");float x=std::bit_cast<float>(point.x.bits()),y=std::bit_cast<float>(point.y.bits());if(!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(maximum) || !std::isfinite(step) || !std::isfinite(interval) || !std::isfinite(flag) || maximum<0 || maximum>100000 || step<=0 || interval<=0 || interval>86400)throw std::runtime_error("Invalid item blight growth parameters");if(maximum==0)return true;if(itemBlightGrowth_.size()+itemBlightReservations_>=4096)return false;itemBlightGrowth_.push_back({requireWorld().clamp(point),0,maximum,step,simulationTime_+interval,interval,flag!=0});return true;
}
void ScriptSession::itemBlightTick() {
    for(auto& growth:itemBlightGrowth_){if(simulationTime_<growth.due)continue;double steps=std::floor((simulationTime_-growth.due)/growth.interval)+1;growth.due+=steps*growth.interval;growth.radius=float(std::min(double(growth.maximum),growth.radius+steps*growth.step));requireWorld().blight(growth.point,growth.radius,growth.add);}
    std::erase_if(itemBlightGrowth_,[](const auto& growth){return growth.radius>=growth.maximum;});
}
}
