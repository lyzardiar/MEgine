// Author: MiYu. Original sound-manager random stream, separate from game simulation.
#pragma once
#include <array>
#include <cstdint>

namespace war3 {
class AudioRandom {
    std::uint32_t value_=0,offsets_=0;
public:
    explicit AudioRandom(std::uint32_t seed=0);
    std::uint32_t next();
    std::uint32_t index(std::uint32_t count);
    std::array<std::uint32_t,2> state() const {return {value_,offsets_};}
};
}
