// Author: MiYu. Transient script indicators retain a bounded set of widget colors.
#pragma once
#include <array>
#include <cstdint>
#include <utility>

namespace war3 {
class IndicatorState {
public:
    struct Entry {std::uint32_t widget=0,color=0;double started=0;std::uint64_t serial=0;};
private:
    std::array<Entry,8> entries_{};
    std::uint64_t next_=0;
public:
    const std::array<Entry,8>& entries() const {return entries_;}
    std::uint64_t sequence() const {return next_;}
    void restore(std::array<Entry,8> entries,std::uint64_t next) {entries_=std::move(entries);next_=next;}
    void add(std::uint32_t widget,std::uint32_t color,double now);
    std::uint32_t color(std::uint32_t widget,std::uint32_t base,double now) const;
};
}
