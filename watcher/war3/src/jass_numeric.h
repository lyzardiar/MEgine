// Author: MiYu. Original 32-bit JASS real storage and native conversion semantics.
#pragma once
#include <cstdint>

namespace war3::jass {
class Real {
    std::uint32_t bits_=0;
    explicit constexpr Real(std::uint32_t bits) : bits_(bits) {}
public:
    constexpr Real()=default;
    static constexpr Real fromBits(std::uint32_t bits) {return Real(bits);}
    static Real fromInteger(std::int32_t value);
    constexpr std::uint32_t bits() const {return bits_;}
    std::int32_t toInteger() const;
};
}
