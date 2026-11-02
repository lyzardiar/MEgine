// Author: MiYu. 2SAJ uses a saved classic random state to mask each complete non-final word.
#include "jass_binary.h"
#include "audio_random.h"
#include <algorithm>
#include <stdexcept>

namespace war3 {
namespace {
std::uint32_t u32(std::span<const std::uint8_t> bytes,size_t at){return std::uint32_t(bytes[at])|(std::uint32_t(bytes[at+1])<<8)|(std::uint32_t(bytes[at+2])<<16)|(std::uint32_t(bytes[at+3])<<24);}
}
std::vector<std::uint8_t> decodeJass2Binary(std::span<const std::uint8_t> bytes){
    if(bytes.size()<12 || bytes.size()>16*1024*1024 || !std::equal(bytes.begin(),bytes.begin()+4,"2SAJ"))throw std::runtime_error("Invalid 2SAJ script container");auto random=AudioRandom::fromState({u32(bytes,4),u32(bytes,8)});std::vector<std::uint8_t> result;result.reserve(bytes.size()-12);size_t at=12;for(;bytes.size()-at>4;at+=4){random.next();auto state=random.state();auto word=u32(bytes,at)^(state[0]+state[1]);for(unsigned shift=0;shift<32;shift+=8)result.push_back(std::uint8_t(word>>shift));}result.insert(result.end(),bytes.begin()+at,bytes.end());return result;
}
}
