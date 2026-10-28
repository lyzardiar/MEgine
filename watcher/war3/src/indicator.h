// Author: MiYu. Transient script indicators retain a bounded set of widget colors.
#pragma once
#include <array>
#include <cstdint>

namespace war3 {
class IndicatorState {
    struct Entry {std::uint32_t widget=0,color=0;double started=0;std::uint64_t serial=0;};
    std::array<Entry,8> entries_{};
    std::uint64_t next_=0;
public:
    void add(std::uint32_t widget,std::uint32_t color,double now);
    std::uint32_t color(std::uint32_t widget,std::uint32_t base,double now) const;
};
}
