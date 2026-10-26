// Author: MiYu. Integer/real conversions matched to the pinned 1.27 native helpers.
#include "jass_numeric.h"
#include <bit>
#include <limits>
#include <stdexcept>

namespace war3::jass {
namespace {
constexpr std::uint32_t reciprocalTable[1025]={
#include "jass_reciprocal.inc"
};
bool negativeWord(std::uint32_t word) {return (word&0x80000000u)!=0;}
}
Real Real::fromInteger(std::int32_t value) {
    if(!value)return Real();auto raw=std::bit_cast<std::uint32_t>(value),sign=raw&0x80000000u,magnitude=sign?0u-raw:raw;unsigned exponent=31u-unsigned(std::countl_zero(magnitude));auto significand=exponent<=23?magnitude<<(23-exponent):magnitude>>(exponent-23);return Real(sign|((exponent+127)<<23)|(significand&0x7fffffu));
}
std::int32_t Real::toInteger() const {
    unsigned exponent=(bits_>>23)&0xff;bool negative=(bits_&0x80000000u)!=0;if(exponent<127)return 0;if(exponent>=158)return negative?std::numeric_limits<std::int32_t>::min():std::numeric_limits<std::int32_t>::max();auto significand=(bits_&0x7fffffu)|0x800000u;auto value=exponent<=150?significand>>(150-exponent):significand<<(exponent-150);return std::bit_cast<std::int32_t>(negative?0u-value:value);
}
Real Real::add(Real other) const {
    auto aExponent=bits_&0x7f800000u,bExponent=other.bits_&0x7f800000u;if(!aExponent)return other;if(!bExponent)return *this;auto a=std::int32_t(((bits_&0x7fffffu)|0x800000u)*2),b=std::int32_t(((other.bits_&0x7fffffu)|0x800000u)*2);if(negativeWord(bits_))a=-a;if(negativeWord(other.bits_))b=-b;int distance=int(bExponent>>23)-int(aExponent>>23);if(distance>=23)return other;if(distance<=-23)return *this;auto exponent=distance>0?bExponent:aExponent;if(distance>0)a>>=distance;else b>>=-distance;auto sum=a+b;if(!sum)return Real();auto raw=std::bit_cast<std::uint32_t>(sum),sign=raw&0x80000000u,magnitude=sign?0u-raw:raw;int shift=8-std::countl_zero(magnitude);auto fraction=shift>=0?magnitude>>shift:magnitude<<-shift;return Real(sign|(exponent+((std::uint32_t(shift)-1u)<<23))|(fraction&0x7fffffu));
}
Real Real::subtract(Real other) const {return add(Real(other.bits_^0x80000000u));}
Real Real::multiply(Real other) const {
    auto sign=(bits_^other.bits_)&0x80000000u,aExponent=bits_&0x7f800000u,bExponent=other.bits_&0x7f800000u,aFraction=bits_&0x7fffffu,bFraction=other.bits_&0x7fffffu,exponent=aExponent+bExponent-0x3f800000u;if(!aFraction || !bFraction){if(!aExponent || !bExponent || negativeWord(exponent-0x800000u))return Real();return Real(sign|exponent|aFraction|bFraction);}auto a=(aFraction|0x800000u)<<8,b=(bFraction|0x800000u)<<8;auto high=std::uint32_t((std::uint64_t(a)*b)>>32),carry=high>>31;if(negativeWord(exponent-0x800000u))return Real();auto fraction=((high>>carry)>>7)&0x7fffffu;return Real(sign|(exponent+(carry<<23))|fraction);
}
Real Real::reciprocal() const {
    auto fraction=bits_&0x7fffffu,index=fraction>>13,residual=fraction<<19;auto weight=(residual>>13)|residual;weight=(weight>>13)|residual;auto difference=reciprocalTable[index]-reciprocalTable[index+1],correction=std::uint32_t((std::uint64_t(difference)*weight)>>32);auto magnitude=reciprocalTable[index]-correction-(bits_&0x7f800000u)+0x7e800000u;if(negativeWord(magnitude-0x800000u))return Real();return Real((bits_&0x80000000u)|magnitude);
}
Real Real::divide(Real other) const {return bits_==other.bits_?Real(0x3f800000u):multiply(other.reciprocal());}
Real Real::fromDecimal(std::string_view token) {
    if(token.empty())throw std::runtime_error("Empty decimal real literal");std::uint32_t whole=0,fraction=0,denominator=1;bool dot=false,digits=false;for(char c:token){if(c=='.' && !dot){dot=true;continue;}if(c<'0' || c>'9')throw std::runtime_error("Invalid classic decimal real literal");digits=true;if(dot){fraction=fraction*10+unsigned(c-'0');denominator*=10;}else whole=whole*10+unsigned(c-'0');}if(!digits)throw std::runtime_error("Missing decimal digits");auto integer=fromInteger(std::bit_cast<std::int32_t>(whole));return dot?integer.add(fromInteger(std::bit_cast<std::int32_t>(fraction)).divide(fromInteger(std::bit_cast<std::int32_t>(denominator)))):integer;
}
}
