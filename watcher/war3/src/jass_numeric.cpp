// Author: MiYu. Integer/real conversions matched to the pinned 1.27 native helpers.
#include "jass_numeric.h"
#include <bit>
#include <limits>

namespace war3::jass {
Real Real::fromInteger(std::int32_t value) {
    if(!value)return Real();auto raw=std::bit_cast<std::uint32_t>(value),sign=raw&0x80000000u,magnitude=sign?0u-raw:raw;unsigned exponent=31u-unsigned(std::countl_zero(magnitude));auto significand=exponent<=23?magnitude<<(23-exponent):magnitude>>(exponent-23);return Real(sign|((exponent+127)<<23)|(significand&0x7fffffu));
}
std::int32_t Real::toInteger() const {
    unsigned exponent=(bits_>>23)&0xff;bool negative=(bits_&0x80000000u)!=0;if(exponent<127)return 0;if(exponent>=158)return negative?std::numeric_limits<std::int32_t>::min():std::numeric_limits<std::int32_t>::max();auto significand=(bits_&0x7fffffu)|0x800000u;auto value=exponent<=150?significand>>(150-exponent):significand<<(exponent-150);return std::bit_cast<std::int32_t>(negative?0u-value:value);
}
}
