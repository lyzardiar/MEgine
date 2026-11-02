// Author: MiYu. 2SAJ uses a saved classic random state to mask each complete non-final word.
#include "jass_binary.h"
#include "audio_random.h"
#include <algorithm>
#include <stdexcept>

namespace war3 {
namespace {
std::uint32_t u32(std::span<const std::uint8_t> bytes,size_t at){return std::uint32_t(bytes[at])|(std::uint32_t(bytes[at+1])<<8)|(std::uint32_t(bytes[at+2])<<16)|(std::uint32_t(bytes[at+3])<<24);}
}
JassBinaryProgram readJass2Binary(std::span<const std::uint8_t> decoded){
    if(decoded.size()<4 || decoded.size()>16*1024*1024)throw std::runtime_error("Invalid 2SAJ program size");auto count=u32(decoded,0);if(count>65536 || count>decoded.size()-4)throw std::runtime_error("Invalid 2SAJ symbol count");JassBinaryProgram result;result.symbols.reserve(count);size_t at=4;for(std::uint32_t i=0;i<count;++i){auto begin=decoded.begin()+at,end=std::find(begin,decoded.end(),0);if(end==decoded.end() || end-begin>1024*1024)throw std::runtime_error("Invalid 2SAJ symbol");result.symbols.emplace_back(reinterpret_cast<const char*>(&*begin),size_t(end-begin));at=size_t(end-decoded.begin())+1;}auto remaining=decoded.size()-at;if(remaining%8 || remaining/8>1048576)throw std::runtime_error("Invalid 2SAJ instruction stream");result.instructions.reserve(remaining/8);for(;at<decoded.size();at+=8)result.instructions.push_back({decoded[at],decoded[at+1],decoded[at+2],decoded[at+3],u32(decoded,at+4)});return result;
}
std::vector<std::uint8_t> decodeJass2Binary(std::span<const std::uint8_t> bytes){
    if(bytes.size()<12 || bytes.size()>16*1024*1024 || !std::equal(bytes.begin(),bytes.begin()+4,"2SAJ"))throw std::runtime_error("Invalid 2SAJ script container");auto random=AudioRandom::fromState({u32(bytes,4),u32(bytes,8)});std::vector<std::uint8_t> result;result.reserve(bytes.size()-12);size_t at=12;for(;bytes.size()-at>4;at+=4){random.next();auto state=random.state();auto word=u32(bytes,at)^(state[0]+state[1]);for(unsigned shift=0;shift<32;shift+=8)result.push_back(std::uint8_t(word>>shift));}result.insert(result.end(),bytes.begin()+at,bytes.end());return result;
}
}
