// Author: MiYu. Original 32-bit JASS real storage and native conversion semantics.
#pragma once
#include <cstdint>
#include <string_view>

namespace war3::jass {
class Real {
    std::uint32_t bits_=0;
    explicit constexpr Real(std::uint32_t bits) : bits_(bits) {}
    Real reciprocal() const;
public:
    constexpr Real()=default;
    static constexpr Real fromBits(std::uint32_t bits) {return Real(bits);}
    static Real fromInteger(std::int32_t value);
    static Real fromDecimal(std::string_view token);
    constexpr std::uint32_t bits() const {return bits_;}
    std::int32_t toInteger() const;
    Real add(Real other) const;
    Real subtract(Real other) const;
    Real multiply(Real other) const;
    Real divide(Real other) const;
};
}
