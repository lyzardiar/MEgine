// Author: MiYu. Sound RNG seed packing, table rotations and multiply-high selection.
#include "audio_random.h"
#include <bit>
#include <stdexcept>

namespace war3 {
namespace {
constexpr std::uint32_t words[64]={
#include "audio_random.inc"
};
}
AudioRandom::AudioRandom(std::uint32_t seed) : value_(seed),offsets_(((seed%47)<<26)|((seed%53)<<18)|((seed%59)<<10)|((seed%61)<<2)) {}
std::uint32_t AudioRandom::next() {
    auto offset=[&](unsigned shift,int decrement,int period){int value=int((offsets_>>shift)&255)-decrement;return unsigned(value<0?value+period:value);};auto a=offset(24,4,188),b=offset(16,12,212),c=offset(8,24,236),d=offset(0,28,244);value_+=std::rotl(words[a/4],1)^std::rotl(words[b/4],2)^std::rotl(words[c/4],3)^words[d/4];offsets_=(a<<24)|(b<<16)|(c<<8)|d;return value_;
}
std::uint32_t AudioRandom::index(std::uint32_t count) {if(!count)throw std::runtime_error("Empty sound random selection");return std::uint32_t((std::uint64_t(next())*count)>>32);}
}
