// Author: MiYu. Bounded classic Warcraft III action encoding and decoding.
// Format reference: blue and nagger, w3g_actions.txt v1.00 (2005-04-30),
// https://github.com/nielsAD/gowarcraft3/blob/f13251b6caed199c3347214f4591e7ccaa96c7c7/file/w3g/w3g_actions.txt
// Independently implemented from the documented fields. The original text permits use with attribution;
// Warcraft III 1.27 live network records and action semantics still require verification.
#include "lan_actions.h"
#include <limits>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <utility>

namespace war3 {
namespace {
constexpr std::size_t maxBytes=256u*1024u,maxActions=4096;
class Reader {
    std::span<const std::uint8_t> bytes_;
    std::size_t position_=0;
public:
    explicit Reader(std::span<const std::uint8_t> bytes):bytes_(bytes){}
    bool done() const{return position_==bytes_.size();}
    std::size_t position() const{return position_;}
    void need(std::size_t n){if(n>bytes_.size()-position_)throw std::runtime_error("Truncated LAN action at byte "+std::to_string(position_));}
    std::uint8_t u8(){need(1);return bytes_[position_++];}
    std::uint16_t u16(){need(2);auto value=std::uint16_t(unsigned(bytes_[position_])|(unsigned(bytes_[position_+1])<<8));position_+=2;return value;}
    std::uint32_t u32(){need(4);std::uint32_t value=0;for(unsigned i=0;i<4;++i)value|=std::uint32_t(bytes_[position_++])<<(i*8);return value;}
    LanObjectId object(){return {u32(),u32()};}
};
class Writer {
    std::vector<std::uint8_t> bytes_;
    void ensure(std::size_t n){if(n>maxBytes-bytes_.size())throw std::runtime_error("LAN action block exceeds byte limit");}
public:
    void u8(std::uint8_t value){ensure(1);bytes_.push_back(value);}
    void u16(std::uint16_t value){ensure(2);for(unsigned i=0;i<2;++i)bytes_.push_back(std::uint8_t(value>>(i*8)));}
    void u32(std::uint32_t value){ensure(4);for(unsigned i=0;i<4;++i)bytes_.push_back(std::uint8_t(value>>(i*8)));}
    void object(LanObjectId value){u32(value.first);u32(value.second);}
    std::vector<std::uint8_t> finish(){return std::move(bytes_);}
};
LanActionAbility readAbility(Reader& reader,std::uint8_t opcode){
    LanActionAbility result;result.opcode=opcode;result.flags=reader.u16();result.order=reader.u32();result.unknownA=reader.u32();result.unknownB=reader.u32();
    if(opcode>=0x11){result.xBits=reader.u32();result.yBits=reader.u32();}
    if(opcode==0x12 || opcode==0x13)result.target=reader.object();
    if(opcode==0x13)result.item=reader.object();
    if(opcode==0x14){result.secondaryOrder=reader.u32();for(auto& byte:result.unknown)byte=reader.u8();result.secondaryXBits=reader.u32();result.secondaryYBits=reader.u32();}
    return result;
}
void writeAbility(Writer& writer,const LanActionAbility& value){
    if(value.opcode<0x10 || value.opcode>0x14)throw std::runtime_error("Unsupported LAN ability action");writer.u8(value.opcode);writer.u16(value.flags);writer.u32(value.order);writer.u32(value.unknownA);writer.u32(value.unknownB);
    if(value.opcode>=0x11){writer.u32(value.xBits);writer.u32(value.yBits);}
    if(value.opcode==0x12 || value.opcode==0x13)writer.object(value.target);
    if(value.opcode==0x13)writer.object(value.item);
    if(value.opcode==0x14){writer.u32(value.secondaryOrder);for(auto byte:value.unknown)writer.u8(byte);writer.u32(value.secondaryXBits);writer.u32(value.secondaryYBits);}
}
}
std::vector<LanDecodedAction> decodeLanActions(std::span<const std::uint8_t> bytes){
    if(bytes.size()>maxBytes)throw std::runtime_error("LAN action block exceeds byte limit");Reader reader(bytes);std::vector<LanDecodedAction> result;
    while(!reader.done()){
        if(result.size()>=maxActions)throw std::runtime_error("LAN action count exceeds limit");auto offset=reader.position();auto opcode=reader.u8();
        if(opcode==0x01)result.emplace_back(LanActionPause{});
        else if(opcode==0x02)result.emplace_back(LanActionResume{});
        else if(opcode>=0x10 && opcode<=0x14)result.emplace_back(readAbility(reader,opcode));
        else if(opcode==0x1e){LanActionCancelQueue cancel;cancel.slot=reader.u8();cancel.type=reader.u32();if(cancel.slot>6 || !cancel.type)throw std::runtime_error("Invalid LAN queue cancellation at byte "+std::to_string(offset));result.emplace_back(cancel);}
        else if(opcode==0x16){LanActionSelection selection;selection.mode=reader.u8();if(selection.mode!=1 && selection.mode!=2)throw std::runtime_error("Invalid LAN selection mode at byte "+std::to_string(offset));auto count=reader.u16();reader.need(std::size_t(count)*8);selection.objects.reserve(count);for(unsigned i=0;i<count;++i)selection.objects.push_back(reader.object());result.emplace_back(std::move(selection));}
        else throw std::runtime_error("Unsupported LAN action opcode "+std::to_string(opcode)+" at byte "+std::to_string(offset));
    }
    return result;
}
std::vector<std::uint8_t> encodeLanActions(std::span<const LanDecodedAction> actions){
    if(actions.size()>maxActions)throw std::runtime_error("LAN action count exceeds limit");Writer writer;
    for(const auto& action:actions)std::visit([&](const auto& value){using T=std::decay_t<decltype(value)>;
        if constexpr(std::is_same_v<T,LanActionPause>)writer.u8(0x01);
        else if constexpr(std::is_same_v<T,LanActionResume>)writer.u8(0x02);
        else if constexpr(std::is_same_v<T,LanActionAbility>)writeAbility(writer,value);
        else if constexpr(std::is_same_v<T,LanActionCancelQueue>){if(value.slot>6 || !value.type)throw std::runtime_error("Invalid LAN queue cancellation");writer.u8(0x1e);writer.u8(value.slot);writer.u32(value.type);}
        else {if(value.mode!=1 && value.mode!=2)throw std::runtime_error("Invalid LAN selection mode");if(value.objects.size()>std::numeric_limits<std::uint16_t>::max())throw std::runtime_error("LAN selection exceeds object limit");writer.u8(0x16);writer.u8(value.mode);writer.u16(std::uint16_t(value.objects.size()));for(auto object:value.objects)writer.object(object);}
    },action);
    return writer.finish();
}
}
