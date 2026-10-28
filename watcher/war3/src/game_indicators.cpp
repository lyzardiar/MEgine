// Author: MiYu. Indicator colors alternate with the current model tint and expire without changing it.
#include "indicator.h"
#include <cmath>

namespace war3 {
void IndicatorState::add(std::uint32_t widget,std::uint32_t color,double now) {
    ++next_;entries_[(next_-1)%entries_.size()]={widget,color,now,next_};
}
std::uint32_t IndicatorState::color(std::uint32_t widget,std::uint32_t base,double now) const {
    const Entry* latest=nullptr;for(auto& entry:entries_)if(entry.widget==widget && entry.serial && now>=entry.started && now-entry.started<1.1 && (!latest || entry.serial>latest->serial))latest=&entry;
    if(!latest || (std::uint64_t(std::floor((now-latest->started)/.3))&1))return base;auto alpha=((base>>24)*(latest->color>>24)+127)/255;return (alpha<<24)|(latest->color&0x00ffffff);
}
}
