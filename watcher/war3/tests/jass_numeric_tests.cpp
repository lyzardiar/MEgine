// Author: MiYu. Fixed conversion boundaries and native fixtures for original CPU comparison.
#include "jass_numeric.h"
#include "platform.h"
#include <bit>
#include <iostream>
#include <limits>
#include <set>
#include <vector>

using namespace war3;
using namespace war3::jass;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=2){std::cerr<<"Usage: war3_jass_numeric_tests <output-json>\n";return 2;}
    try {
        require(Real::fromInteger(0).bits()==0 && Real::fromInteger(1).bits()==0x3f800000 && Real::fromInteger(-1).bits()==0xbf800000,"Exact small integer conversion differs");
        require(Real::fromInteger(16777219).bits()==0x4b800001 && Real::fromInteger(-16777219).bits()==0xcb800001 && Real::fromInteger(INT32_MAX).bits()==0x4effffff,"I2R rounded rather than truncated significand");
        require(Real::fromInteger(INT32_MIN).bits()==0xcf000000 && Real::fromBits(0xbfcccccd).toInteger()==-1 && Real::fromBits(0x3fcccccd).toInteger()==1,"Signed native conversion differs");
        require(Real::fromBits(0x7f800000).toInteger()==INT32_MAX && Real::fromBits(0xff800000).toInteger()==INT32_MIN && Real::fromBits(0x7fc01234).toInteger()==INT32_MAX && Real::fromBits(0xffc01234).toInteger()==INT32_MIN,"Non-finite native saturation differs");
        require(Real::fromBits(0x80000000).toInteger()==0 && Real::fromBits(0x007fffff).toInteger()==0 && Real::fromBits(0x807fffff).toInteger()==0,"Zero/subnormal conversion differs");
        std::set<std::int32_t> integers={INT32_MIN,INT32_MAX,-16777219,16777219};for(unsigned n=0;n<31;++n)for(int offset:{-1,0,1})for(int sign:{-1,1}){auto value=((std::int64_t(1)<<n)+offset)*sign;if(value>=INT32_MIN && value<=INT32_MAX)integers.insert(std::int32_t(value));}
        std::set<std::uint32_t> reals;for(unsigned sign:{0u,0x80000000u})for(unsigned exponent=0;exponent<256;++exponent)for(unsigned fraction:{0u,1u,0x3fffffu,0x7ffffeu,0x7fffffu})reals.insert(sign|(exponent<<23)|fraction);std::uint32_t state=0x12705224;for(unsigned i=0;i<512;++i){state^=state<<13;state^=state>>17;state^=state<<5;integers.insert(std::bit_cast<std::int32_t>(state));reals.insert(state);}
        require(Real::fromBits(0x3f800000).add(Real::fromBits(0x40000000)).bits()==0x40400000 && Real::fromBits(0x3f800000).subtract(Real::fromBits(0x40000000)).bits()==0xbf800000,"Basic real addition/subtraction differs");require(Real::fromBits(0x3fc00000).multiply(Real::fromBits(0x3fc00000)).bits()==0x40100000 && Real::fromBits(0x3f800000).divide(Real::fromBits(0x40000000)).bits()==0x3f000000,"Basic real multiplication/division differs");
        std::vector<std::pair<std::uint32_t,std::uint32_t>> pairs;std::vector<std::uint32_t> edges;for(unsigned sign:{0u,0x80000000u})for(unsigned exponent:{0u,1u,2u,125u,126u,127u,128u,150u,157u,158u,254u,255u})for(unsigned fraction:{0u,1u,0x3fffffu,0x7fffffu})edges.push_back(sign|(exponent<<23)|fraction);for(auto a:edges)for(auto b:edges)pairs.emplace_back(a,b);for(unsigned index=0;index<1024;++index)for(unsigned residual:{0u,1u,4095u,8191u})pairs.emplace_back(0x3f800000u,0x3f800000u|(index<<13)|residual);for(unsigned i=0;i<512;++i){state^=state<<13;state^=state>>17;state^=state<<5;auto a=state;state^=state<<13;state^=state>>17;state^=state<<5;pairs.emplace_back(a,state);}
        std::vector<std::string> decimals={"0","1",".5","0.","0.1","1.1","3.14159","2147483647.0","2147483648.0","4294967295.0","4294967296.0","0.00000000000000000000000000000000","1.12345678901234567890123456789012"};for(unsigned n=0;n<256;++n)for(unsigned digits:{0u,1u,3u,6u,9u,10u,16u,32u}){auto whole=std::to_string(n*314159u);std::string fraction;for(unsigned i=0;i<digits;++i)fraction+=char('0'+(n+i*7)%10);decimals.push_back(whole+"."+fraction);}
        auto output=fs::absolute(argv[1]);fs::create_directories(output.parent_path());std::ofstream file(output,std::ios::binary);file<<"{\"i2r\":[";bool comma=false;for(auto value:integers){if(comma)file<<',';comma=true;file<<'['<<value<<','<<Real::fromInteger(value).bits()<<']';}file<<"],\"r2i\":[";comma=false;for(auto bits:reals){if(comma)file<<',';comma=true;file<<'['<<bits<<','<<Real::fromBits(bits).toInteger()<<']';}file<<"],\"binary\":[";comma=false;for(auto [left,right]:pairs){auto a=Real::fromBits(left),b=Real::fromBits(right);if(comma)file<<',';comma=true;file<<'['<<left<<','<<right<<','<<a.add(b).bits()<<','<<a.subtract(b).bits()<<','<<a.multiply(b).bits()<<','<<a.divide(b).bits()<<']';}file<<"],\"decimals\":[";comma=false;for(auto& token:decimals){if(comma)file<<',';comma=true;file<<"[\""<<token<<"\","<<Real::fromDecimal(token).bits()<<']';}file<<"]}";require(bool(file),"Cannot save native numeric fixture");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into numeric checks");std::cout<<"PASS conversion_boundaries\nFIXTURE i2r="<<integers.size()<<" r2i="<<reals.size()<<" binary_pairs="<<pairs.size()<<" decimals="<<decimals.size()<<" game_dll_loaded=false\n";return 0;
    }catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}
}
