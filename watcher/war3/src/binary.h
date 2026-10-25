// Author: MiYu. Bounded little-endian source record reader.
#pragma once
#include "platform.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstring>

namespace war3 {
constexpr std::uint32_t tag(const char* s) { return unsigned(s[0]) | (unsigned(s[1]) << 8) | (unsigned(s[2]) << 16) | (unsigned(s[3]) << 24); }
class Binary {
    std::span<const std::uint8_t> bytes_;
    size_t at_ = 0;
public:
    explicit Binary(std::span<const std::uint8_t> bytes) : bytes_(bytes) {}
    size_t left() const { return bytes_.size() - at_; }
    std::span<const std::uint8_t> take(size_t n) { if (n > left()) throw std::runtime_error("Truncated binary record"); auto result = bytes_.subspan(at_, n); at_ += n; return result; }
    std::uint32_t u32() { std::uint32_t v; auto b = take(4); std::memcpy(&v, b.data(), 4); return v; }
    std::int32_t i32() { return std::bit_cast<std::int32_t>(u32()); }
    std::uint16_t u16() { auto b = take(2); return b[0] | (unsigned(b[1]) << 8); }
    std::uint8_t u8() { return take(1)[0]; }
    float f32() { auto v = std::bit_cast<float>(u32()); if (!std::isfinite(v)) throw std::runtime_error("Non-finite binary value"); return v; }
    void expect(std::uint32_t expected) { if (u32() != expected) throw std::runtime_error("Unexpected binary tag"); }
    Binary record(unsigned minimum) { auto n = u32(); if (n < minimum || n < 4) throw std::runtime_error("Invalid inclusive record"); return Binary(take(n - 4)); }
    unsigned count(size_t stride, unsigned limit) { auto n = u32(); if (!stride || n > limit || n > left() / stride) throw std::runtime_error("Binary array exceeds bounds"); return n; }
    std::string string(size_t n) { auto b = take(n); auto end = std::find(b.begin(), b.end(), 0); return {reinterpret_cast<const char*>(b.data()), size_t(end - b.begin())}; }
    std::string cstring(size_t limit = 65536) { auto b = bytes_.subspan(at_, std::min(left(), limit)); auto end = std::find(b.begin(), b.end(), 0); if (end == b.end()) throw std::runtime_error("Unterminated string"); auto s = string(size_t(end - b.begin())); take(1); return s; }
    void finish() const { if (left()) throw std::runtime_error("Unconsumed binary record"); }
};
}
