// Author: MiYu. Source day/night rules and session-owned game time controls.
#pragma once
#include "archive.h"
#include "jass_numeric.h"

namespace war3 {
struct DayNightRules {
    jass::Real dayLength=jass::Real::fromInteger(480),dayHours=jass::Real::fromInteger(24),dawn=jass::Real::fromInteger(6),dusk=jass::Real::fromInteger(18);
    static DayNightRules read(Archives& archives);
};
class GameClock {
    DayNightRules rules_;
    jass::Real time_,scale_=jass::Real::fromBits(0x3f800000);
    bool suspended_=false;
public:
    explicit GameClock(DayNightRules rules={});
    const DayNightRules& rules() const {return rules_;}
    jass::Real time() const {return time_.add(jass::Real{});}
    void time(jass::Real value);
    jass::Real scale() const {return scale_.add(jass::Real{});}
    void scale(jass::Real value);
    bool suspended() const {return suspended_;}
    void suspend(bool value) {suspended_=value;}
    jass::Real rate() const;
    bool daytime() const;
};
}
