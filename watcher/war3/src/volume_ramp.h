// Author: MiYu. Bounded wall-clock volume transition for original sound groups.
#pragma once
#include <algorithm>
#include <cstdint>
#include <cmath>
namespace war3 {
struct VolumeRamp {
    float from=1,target=1;
    std::uint32_t started=0,duration=0;
    float value(std::uint32_t now) const {auto elapsed=now-started;return duration && elapsed<duration?std::lerp(from,target,float(elapsed)/float(duration)):target;}
    void set(float value,std::uint32_t now,std::uint32_t length=1000){from=this->value(now);target=std::clamp(value,0.f,1.f);started=now;duration=length;}
    bool changing(std::uint32_t now) const {return duration && now-started<duration;}
};
}
