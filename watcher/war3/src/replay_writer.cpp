// Author: MiYu. Serialize classic W3G metadata and time slots without writing to disk.
// Format reference: gowarcraft3, revision f13251b6caed199c3347214f4591e7ccaa96c7c7, MPL-2.0:
// https://github.com/nielsAD/gowarcraft3/tree/f13251b6caed199c3347214f4591e7ccaa96c7c7/file/w3g
#include "replay_writer.h"
#include "../third_party/stormlib/source/src/zlib/zlib.h"
#include <algorithm>
#include <limits>
#include <stdexcept>

namespace war3 {
namespace {
using Bytes=std::vector<std::uint8_t>;
constexpr std::size_t maxRecords=64u*1024*1024,blockSize=8192;
void u8(Bytes& b,std::uint8_t v){b.push_back(v);}
void u16(Bytes& b,std::uint16_t v){u8(b,std::uint8_t(v));u8(b,std::uint8_t(v>>8));}
void u32(Bytes& b,std::uint32_t v){u16(b,std::uint16_t(v));u16(b,std::uint16_t(v>>16));}
void set32(Bytes& b,std::size_t i,std::uint32_t v){for(unsigned j=0;j<4;++j)b[i+j]=std::uint8_t(v>>(j*8));}
void str(Bytes& b,const std::string& s,std::size_t limit){if(s.size()>limit || s.find('\0')!=std::string::npos)throw std::runtime_error("Invalid replay string");b.insert(b.end(),s.begin(),s.end());u8(b,0);}
void player(Bytes& b,const ReplayPlayer& p){u8(b,p.id);str(b,p.name,1024);if(p.runtime || p.race){u8(b,8);u32(b,p.runtime);u32(b,p.race);}else{u8(b,1);u8(b,0);}}
std::uint32_t crc(std::span<const std::uint8_t> b){return std::uint32_t(crc32(0,b.data(),uInt(b.size())));}
std::uint16_t fold(std::uint32_t c){return std::uint16_t(c^(c>>16));}
void append(Bytes& target,const Bytes& source){if(source.size()>maxRecords-target.size())throw std::runtime_error("Replay recording exceeds memory budget");target.insert(target.end(),source.begin(),source.end());}
}
ReplayWriter::ReplayWriter(ReplayHeader header,const ReplayGame& game,const std::vector<ReplayPlayer>& players,const ReplaySetup& setup):header_(header){
    if(header.version<7 || header.version>=10032 || players.size()>24 || setup.slots.size()>24)throw std::runtime_error("Unsupported replay metadata");
    u8(records_,0x10);u32(records_,1);player(records_,game.host);str(records_,game.name,4096);u8(records_,0);
    Bytes settings;u32(settings,game.flags);u8(settings,0);u16(settings,game.width);u16(settings,game.height);u32(settings,game.mapChecksum);str(settings,game.mapPath,4096);str(settings,game.hostName,1024);u8(settings,0);if(game.mapSha1)settings.insert(settings.end(),game.mapSha1->begin(),game.mapSha1->end());
    if(settings.size()+(settings.size()+6)/7>4096)throw std::runtime_error("Replay settings exceed limit");for(std::size_t i=0;i<settings.size();i+=7){auto mask=records_.size();u8(records_,1);for(unsigned j=0;j<7 && i+j<settings.size();++j){auto value=settings[i+j];if(value&1)records_[mask]|=std::uint8_t(1u<<(j+1));else ++value;u8(records_,value);}}u8(records_,0);u32(records_,game.playerCount);u32(records_,game.gameType);u32(records_,game.language);
    for(const auto& p:players){u8(records_,0x16);player(records_,p);u32(records_,0);}
    u8(records_,0x19);u16(records_,std::uint16_t(7+setup.slots.size()*9));u8(records_,std::uint8_t(setup.slots.size()));for(const auto& s:setup.slots){u8(records_,s.playerId);u8(records_,s.download);u8(records_,s.status);u8(records_,s.computer);u8(records_,s.team);u8(records_,s.color);u8(records_,s.race);u8(records_,s.difficulty);u8(records_,s.handicap);}u32(records_,setup.randomSeed);u8(records_,setup.layout);u8(records_,setup.players);
    for(auto op:{0x1a,0x1b,0x1c}){u8(records_,std::uint8_t(op));u32(records_,1);}recordCount_=players.size()+4;if(records_.size()>maxRecords)throw std::runtime_error("Replay recording exceeds memory budget");
}
void ReplayWriter::appendTimeSlot(const LanTimeSlot& slot){
    if(duration_>std::numeric_limits<std::uint32_t>::max()-slot.elapsedMs || slot.actions.size()>4096)throw std::runtime_error("Replay time slot exceeds limit");Bytes pending,chunk;std::size_t total=0;
    std::size_t count=0;auto flush=[&](bool fragment){++count;u8(pending,fragment?0x1e:0x1f);u16(pending,std::uint16_t(chunk.size()+2));u16(pending,fragment?0:slot.elapsedMs);pending.insert(pending.end(),chunk.begin(),chunk.end());chunk.clear();};
    for(const auto& action:slot.actions){if(action.bytes.size()>65530 || total>262144-(action.bytes.size()+3))throw std::runtime_error("Replay action exceeds limit");total+=action.bytes.size()+3;if(chunk.size()+action.bytes.size()+3>65533)flush(true);u8(chunk,action.playerId);u16(chunk,std::uint16_t(action.bytes.size()));chunk.insert(chunk.end(),action.bytes.begin(),action.bytes.end());}flush(false);if(count>2000000-recordCount_)throw std::runtime_error("Replay record count exceeds limit");append(records_,pending);recordCount_+=count;duration_+=slot.elapsedMs;
}
void ReplayWriter::appendChat(std::uint8_t id,std::span<const std::uint8_t> payload){if(payload.size()>65535 || recordCount_>=2000000)throw std::runtime_error("Replay chat exceeds limit");Bytes b;u8(b,0x20);u8(b,id);u16(b,std::uint16_t(payload.size()));b.insert(b.end(),payload.begin(),payload.end());append(records_,b);++recordCount_;}
void ReplayWriter::appendPlayerLeft(std::uint8_t id,bool local,std::uint32_t reason,std::uint32_t counter){if(recordCount_>=2000000)throw std::runtime_error("Replay record count exceeds limit");Bytes b;u8(b,0x17);u32(b,local?0x0c:1);u8(b,id);u32(b,reason);u32(b,counter);append(records_,b);++recordCount_;}
std::vector<std::uint8_t> ReplayWriter::serialize() const {
    Bytes result;static constexpr char signature[]="Warcraft III recorded game\x1a";result.insert(result.end(),signature,signature+sizeof(signature));u32(result,68);u32(result,0);u32(result,1);u32(result,std::uint32_t(records_.size()));u32(result,std::uint32_t((records_.size()+blockSize-1)/blockSize));u32(result,header_.product);u32(result,header_.version);u16(result,header_.build);u16(result,header_.singlePlayer?0:0x8000);u32(result,duration_);u32(result,0);
    for(std::size_t offset=0;offset<records_.size();offset+=blockSize){Bytes plain(blockSize,0);auto count=std::min(blockSize,records_.size()-offset);std::copy_n(records_.begin()+offset,count,plain.begin());uLongf size=compressBound(uLong(plain.size()));Bytes compressed(size);if(compress2(compressed.data(),&size,plain.data(),uLong(plain.size()),Z_DEFAULT_COMPRESSION)!=Z_OK || size>65535)throw std::runtime_error("Cannot compress replay block");compressed.resize(size);Bytes head;u16(head,std::uint16_t(size));u16(head,std::uint16_t(plain.size()));u32(head,0);auto hc=fold(crc(head)),dc=fold(crc(compressed));head[4]=std::uint8_t(hc);head[5]=std::uint8_t(hc>>8);head[6]=std::uint8_t(dc);head[7]=std::uint8_t(dc>>8);result.insert(result.end(),head.begin(),head.end());result.insert(result.end(),compressed.begin(),compressed.end());}
    if(result.size()>std::numeric_limits<std::uint32_t>::max())throw std::runtime_error("Replay file exceeds limit");set32(result,32,std::uint32_t(result.size()));set32(result,64,crc(std::span<const std::uint8_t>(result.data(),68)));return result;
}
}
