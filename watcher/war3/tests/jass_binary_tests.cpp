// Author: MiYu. Fixed container vector, terminal bytes and invalid random state checks.
#include "jass_binary.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string_view>
using namespace war3;
int main(){try{
    const std::vector<std::uint8_t> input={0x32,0x53,0x41,0x4a,0xfc,0x4e,0x61,0xb9,0x08,0x7c,0xc4,0x24,0x83,0xaf,0xfc,0xe4,0xc7,0x79,0xe6,0x63,0x85,0xbe,0xc7,0x73,0xbe,0x14,0x7e,0x6e,0x44,0x67,0xa4,0x8f,0xe8,0x3d,0x58,0x6a,0x9a,0x18,0xe6,0xbc,0x3c,0x11,0x6f,0xc8,0xb7,0xdf,0x21,0xfb,0x43,0xe0,0xfd,0x6e};
    auto decoded=decodeJass2Binary(input);const std::vector<std::uint8_t> expected={0x36,0x16,0x00,0x00,'m','a','i','n',0,'a','g','e','n','t',0,'e','v','e','n','t',0,'p','l','a','y','e','r',0,'w','i','d','g','e','t',0,'u',0x43,0xe0,0xfd,0x6e};if(decoded!=expected)throw std::runtime_error("Known container vector differs");for(size_t tail=0;tail<=4;++tail){auto size=12+tail;auto value=decodeJass2Binary({input.data(),size});if(value.size()!=tail || !std::equal(value.begin(),value.end(),input.begin()+12))throw std::runtime_error("Short terminal bytes changed");}auto bad=input;bad[0]=0;bool rejected=false;try{decodeJass2Binary(bad);}catch(const std::runtime_error&){rejected=true;}if(!rejected)throw std::runtime_error("Wrong signature accepted");bad=input;bad[8]=255;rejected=false;try{decodeJass2Binary(bad);}catch(const std::runtime_error&){rejected=true;}if(!rejected)throw std::runtime_error("Invalid random state accepted");std::cout<<"PASS 2SAJ known vector, final bytes and invalid input\nRESULT passed=1 failed=0\n";return 0;
}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}}
