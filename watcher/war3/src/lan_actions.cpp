// Author: MiYu. Bounded classic Warcraft III action encoding and decoding.
// Format reference: blue and nagger, w3g_actions.txt v1.00 (2005-04-30),
// https://github.com/nielsAD/gowarcraft3/blob/f13251b6caed199c3347214f4591e7ccaa96c7c7/file/w3g/w3g_actions.txt
// Independently implemented from the documented fields. The original text permits use with attribution;
// Warcraft III 1.27 live network records and action semantics still require verification.
#include "lan_actions.h"
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>

namespace war3 {
namespace {
constexpr std::size_t maxBytes=256u*1024u,maxActions=4096;
bool validChat(std::string_view text){
    if(text.empty() || text.size()>1024)return false;for(size_t i=0;i<text.size();){auto a=std::uint8_t(text[i++]);if(a<32 || a==127)return false;if(a<128)continue;unsigned extra=a>=0xc2 && a<=0xdf?1:a>=0xe0 && a<=0xef?2:a>=0xf0 && a<=0xf4?3:0;if(!extra || extra>text.size()-i)return false;auto b=std::uint8_t(text[i]);if((b&0xc0)!=0x80 || (a==0xe0 && b<0xa0) || (a==0xed && b>=0xa0) || (a==0xf0 && b<0x90) || (a==0xf4 && b>=0x90))return false;for(unsigned j=0;j<extra;++j)if((std::uint8_t(text[i++])&0xc0)!=0x80)return false;}return true;
}
bool validSelectionChunk(const LanActionExperimentalSelection& value){return value.round && value.total<=4096 && value.objects.size()<=128 && value.offset<=value.total && value.objects.size()<=size_t(value.total-value.offset) && (value.total? !value.objects.empty():value.offset==0 && value.objects.empty());}
bool validUnitCommand(const LanActionExperimentalUnit& v){auto empty=[](LanObjectId id){return !id.first && !id.second;};if(v.kind>20 || (v.flags&~3u) || empty(v.actor))return false;bool item=v.kind>=4 && v.kind<=10,point=v.kind==0 || v.kind==5 || v.kind==8,target=v.kind==6 || v.kind==9 || v.kind==15 || v.kind==19 || v.kind==20,typed=v.kind<=3 || v.kind==11 || v.kind==13,toggled=v.kind==11 || v.kind==12,ticket=v.kind==16 || v.kind==18,revision=v.kind==19 || v.kind==20;if(item==empty(v.item) || target==empty(v.target) || (ticket?(!v.type && !v.slot):revision?false:(typed?!v.type:v.type!=0)) || (ticket || revision?false:v.kind==10?v.slot>=6:v.slot!=0) || (!point && (v.xBits || v.yBits)) || ((v.flags&1u) && v.kind!=0 && (v.kind<4 || v.kind>10)) || ((v.flags&2u) && !toggled))return false;return true;}
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
std::vector<LanDecodedAction> decodeLanActions(std::span<const std::uint8_t> bytes,bool experimental){
    if(bytes.size()>maxBytes)throw std::runtime_error("LAN action block exceeds byte limit");Reader reader(bytes);std::vector<LanDecodedAction> result;
    while(!reader.done()){
        if(result.size()>=maxActions)throw std::runtime_error("LAN action count exceeds limit");auto offset=reader.position();auto opcode=reader.u8();
        if(opcode==0x01)result.emplace_back(LanActionPause{});
        else if(opcode==0x02)result.emplace_back(LanActionResume{});
        else if(opcode==0x61)result.emplace_back(LanActionEscape{});
        else if(opcode>=0xf0 && opcode<=0xf2 && experimental){auto size=reader.u16();if(!size || size>1024)throw std::runtime_error("Invalid experimental LAN chat length");reader.need(size);std::string text;text.reserve(size);for(unsigned i=0;i<size;++i)text.push_back(char(reader.u8()));if(!validChat(text))throw std::runtime_error("Invalid experimental LAN chat text");result.emplace_back(LanActionExperimentalChat{std::move(text),ChatChannel(opcode-0xf0)});}
        else if(opcode==0xf3 && experimental){LanActionExperimentalSelection selection;selection.round=reader.u32();selection.total=reader.u16();selection.offset=reader.u16();auto count=reader.u16();if(count>128)throw std::runtime_error("Invalid experimental selection chunk");reader.need(size_t(count)*8);selection.objects.reserve(count);for(unsigned i=0;i<count;++i)selection.objects.push_back(reader.object());if(!validSelectionChunk(selection))throw std::runtime_error("Invalid experimental selection chunk");result.emplace_back(std::move(selection));}
        else if(opcode==0xf4 && experimental){auto shop=reader.object();auto type=reader.u32();auto item=reader.u8();if(!shop.first || shop.second!=0x4d330001u || !type || item>1)throw std::runtime_error("Invalid experimental LAN purchase");result.emplace_back(LanActionExperimentalPurchase{shop,type,item!=0});}
        else if(opcode==0xf5 && experimental){auto peer=reader.u8();if(peer<=1 || peer==255)throw std::runtime_error("Invalid experimental LAN departure");result.emplace_back(LanActionExperimentalLeave{peer});}
        else if(opcode==0xf6 && experimental){LanActionExperimentalSpell spell;spell.mode=reader.u8();spell.flags=reader.u8();spell.ability=reader.u32();if(spell.mode>2 || (spell.flags&~3u) || !spell.ability)throw std::runtime_error("Invalid experimental LAN spell");if(spell.mode==1){spell.xBits=reader.u32();spell.yBits=reader.u32();}else if(spell.mode==2)spell.target=reader.object();auto count=reader.u8();if(!count || count>128)throw std::runtime_error("Invalid experimental LAN spell actors");reader.need(size_t(count)*8);spell.actors.reserve(count);for(unsigned i=0;i<count;++i)spell.actors.push_back(reader.object());result.emplace_back(std::move(spell));}
        else if(opcode==0xf7 && experimental){LanActionExperimentalUnit unit;unit.kind=reader.u8();unit.flags=reader.u8();unit.actor=reader.object();unit.item=reader.object();unit.target=reader.object();unit.type=reader.u32();unit.slot=reader.u32();unit.xBits=reader.u32();unit.yBits=reader.u32();if(!validUnitCommand(unit))throw std::runtime_error("Invalid experimental LAN unit command");result.emplace_back(unit);}
        else if(opcode==0xf8 && experimental){LanActionExperimentalDialog dialog;dialog.dialog=reader.object();dialog.button=reader.object();dialog.signature=reader.u32();auto low=reader.u32(),high=reader.u32();dialog.generation=(std::uint64_t(high)<<32)|low;if(!dialog.dialog.first || dialog.dialog.second!=0x4d330005u || !dialog.button.first || dialog.button.second!=0x4d330006u || !dialog.generation)throw std::runtime_error("Invalid experimental LAN dialog click");result.emplace_back(dialog);}
        else if(opcode>=0x10 && opcode<=0x14)result.emplace_back(readAbility(reader,opcode));
        else if(opcode==0x17){LanActionGroupAssign group;group.group=reader.u8();auto count=reader.u16();if(group.group>=10)throw std::runtime_error("Invalid LAN control group at byte "+std::to_string(offset));reader.need(std::size_t(count)*8);group.objects.reserve(count);for(unsigned i=0;i<count;++i)group.objects.push_back(reader.object());result.emplace_back(std::move(group));}
        else if(opcode==0x18){LanActionGroupSelect group{reader.u8(),reader.u8()};if(group.group>=10)throw std::runtime_error("Invalid LAN control group at byte "+std::to_string(offset));result.emplace_back(group);}
        else if(opcode==0x1a)result.emplace_back(LanActionPreSubselection{});
        else if(opcode==0x19){LanActionSubgroup subgroup;subgroup.type=reader.u32();subgroup.first=reader.object();if(!subgroup.type || (subgroup.first.first==0xffffffffu && subgroup.first.second==0xffffffffu))throw std::runtime_error("Invalid LAN subgroup at byte "+std::to_string(offset));result.emplace_back(subgroup);}
        else if(opcode==0x1d){auto hero=reader.object();if(hero.first==0xffffffffu && hero.second==0xffffffffu)throw std::runtime_error("Invalid LAN revival cancellation at byte "+std::to_string(offset));result.emplace_back(LanActionCancelRevival{hero});}
        else if(opcode==0x1e){LanActionCancelQueue cancel;cancel.slot=reader.u8();cancel.type=reader.u32();if(cancel.slot>6 || !cancel.type)throw std::runtime_error("Invalid LAN queue cancellation at byte "+std::to_string(offset));result.emplace_back(cancel);}
        else if(opcode==0x50){LanActionAlliance alliance;alliance.slot=reader.u8();alliance.flags=reader.u32();if(alliance.slot>=12 || (alliance.flags&~0x47fu))throw std::runtime_error("Invalid LAN alliance snapshot at byte "+std::to_string(offset));result.emplace_back(alliance);}
        else if(opcode==0x51){LanActionTransfer transfer;transfer.slot=reader.u8();transfer.gold=reader.u32();transfer.lumber=reader.u32();if(transfer.slot>=12 || transfer.gold>0x7fffffffu || transfer.lumber>0x7fffffffu)throw std::runtime_error("Invalid LAN resource transfer at byte "+std::to_string(offset));result.emplace_back(transfer);}
        else if(opcode==0x64 || opcode==0x65){auto object=reader.object();if(object.first==0xffffffffu && object.second==0xffffffffu)throw std::runtime_error("Invalid LAN trackable at byte "+std::to_string(offset));result.emplace_back(LanActionTrackable{opcode==0x64,object});}
        else if(opcode==0x16){LanActionSelection selection;selection.mode=reader.u8();if(selection.mode!=1 && selection.mode!=2)throw std::runtime_error("Invalid LAN selection mode at byte "+std::to_string(offset));auto count=reader.u16();reader.need(std::size_t(count)*8);selection.objects.reserve(count);for(unsigned i=0;i<count;++i)selection.objects.push_back(reader.object());result.emplace_back(std::move(selection));}
        else throw std::runtime_error("Unsupported LAN action opcode "+std::to_string(opcode)+" at byte "+std::to_string(offset));
    }
    return result;
}
std::vector<std::uint8_t> encodeLanActions(std::span<const LanDecodedAction> actions,bool experimental){
    if(actions.size()>maxActions)throw std::runtime_error("LAN action count exceeds limit");Writer writer;
    for(const auto& action:actions)std::visit([&](const auto& value){using T=std::decay_t<decltype(value)>;
        if constexpr(std::is_same_v<T,LanActionPause>)writer.u8(0x01);
        else if constexpr(std::is_same_v<T,LanActionResume>)writer.u8(0x02);
        else if constexpr(std::is_same_v<T,LanActionEscape>)writer.u8(0x61);
        else if constexpr(std::is_same_v<T,LanActionExperimentalChat>){auto channel=unsigned(value.channel);if(!experimental || channel>2 || !validChat(value.text))throw std::runtime_error("Invalid experimental LAN chat");writer.u8(std::uint8_t(0xf0+channel));writer.u16(std::uint16_t(value.text.size()));for(unsigned char byte:value.text)writer.u8(byte);}
        else if constexpr(std::is_same_v<T,LanActionExperimentalSelection>){if(!experimental || !validSelectionChunk(value))throw std::runtime_error("Invalid experimental selection chunk");writer.u8(0xf3);writer.u32(value.round);writer.u16(value.total);writer.u16(value.offset);writer.u16(std::uint16_t(value.objects.size()));for(auto object:value.objects)writer.object(object);}
        else if constexpr(std::is_same_v<T,LanActionExperimentalPurchase>){if(!experimental || !value.type || (!value.shop.first || value.shop.second!=0x4d330001u))throw std::runtime_error("Invalid experimental LAN purchase");writer.u8(0xf4);writer.object(value.shop);writer.u32(value.type);writer.u8(value.item?1:0);}
        else if constexpr(std::is_same_v<T,LanActionExperimentalLeave>){if(!experimental || value.peer<=1 || value.peer==255)throw std::runtime_error("Invalid experimental LAN departure");writer.u8(0xf5);writer.u8(value.peer);}
        else if constexpr(std::is_same_v<T,LanActionExperimentalSpell>){if(!experimental || value.mode>2 || (value.flags&~3u) || !value.ability || value.actors.empty() || value.actors.size()>128)throw std::runtime_error("Invalid experimental LAN spell");writer.u8(0xf6);writer.u8(value.mode);writer.u8(value.flags);writer.u32(value.ability);if(value.mode==1){writer.u32(value.xBits);writer.u32(value.yBits);}else if(value.mode==2)writer.object(value.target);writer.u8(std::uint8_t(value.actors.size()));for(auto actor:value.actors)writer.object(actor);}
        else if constexpr(std::is_same_v<T,LanActionExperimentalUnit>){if(!experimental || !validUnitCommand(value))throw std::runtime_error("Invalid experimental LAN unit command");writer.u8(0xf7);writer.u8(value.kind);writer.u8(value.flags);writer.object(value.actor);writer.object(value.item);writer.object(value.target);writer.u32(value.type);writer.u32(value.slot);writer.u32(value.xBits);writer.u32(value.yBits);}
        else if constexpr(std::is_same_v<T,LanActionExperimentalDialog>){if(!experimental || !value.dialog.first || value.dialog.second!=0x4d330005u || !value.button.first || value.button.second!=0x4d330006u || !value.generation)throw std::runtime_error("Invalid experimental LAN dialog click");writer.u8(0xf8);writer.object(value.dialog);writer.object(value.button);writer.u32(value.signature);writer.u32(std::uint32_t(value.generation));writer.u32(std::uint32_t(value.generation>>32));}
        else if constexpr(std::is_same_v<T,LanActionAbility>)writeAbility(writer,value);
        else if constexpr(std::is_same_v<T,LanActionCancelQueue>){if(value.slot>6 || !value.type)throw std::runtime_error("Invalid LAN queue cancellation");writer.u8(0x1e);writer.u8(value.slot);writer.u32(value.type);}
        else if constexpr(std::is_same_v<T,LanActionCancelRevival>){if(value.hero.first==0xffffffffu && value.hero.second==0xffffffffu)throw std::runtime_error("Invalid LAN revival cancellation");writer.u8(0x1d);writer.object(value.hero);}
        else if constexpr(std::is_same_v<T,LanActionTransfer>){if(value.slot>=12 || value.gold>0x7fffffffu || value.lumber>0x7fffffffu)throw std::runtime_error("Invalid LAN resource transfer");writer.u8(0x51);writer.u8(value.slot);writer.u32(value.gold);writer.u32(value.lumber);}
        else if constexpr(std::is_same_v<T,LanActionAlliance>){if(value.slot>=12 || (value.flags&~0x47fu))throw std::runtime_error("Invalid LAN alliance snapshot");writer.u8(0x50);writer.u8(value.slot);writer.u32(value.flags);}
        else if constexpr(std::is_same_v<T,LanActionGroupAssign>){if(value.group>=10 || value.objects.size()>std::numeric_limits<std::uint16_t>::max())throw std::runtime_error("Invalid LAN control group");writer.u8(0x17);writer.u8(value.group);writer.u16(std::uint16_t(value.objects.size()));for(auto object:value.objects)writer.object(object);}
        else if constexpr(std::is_same_v<T,LanActionGroupSelect>){if(value.group>=10)throw std::runtime_error("Invalid LAN control group");writer.u8(0x18);writer.u8(value.group);writer.u8(value.flags);}
        else if constexpr(std::is_same_v<T,LanActionPreSubselection>)writer.u8(0x1a);
        else if constexpr(std::is_same_v<T,LanActionSubgroup>){if(!value.type || (value.first.first==0xffffffffu && value.first.second==0xffffffffu))throw std::runtime_error("Invalid LAN subgroup");writer.u8(0x19);writer.u32(value.type);writer.object(value.first);}
        else if constexpr(std::is_same_v<T,LanActionTrackable>){if(value.object.first==0xffffffffu && value.object.second==0xffffffffu)throw std::runtime_error("Invalid LAN trackable");writer.u8(value.hit?0x64:0x65);writer.object(value.object);}
        else {if(value.mode!=1 && value.mode!=2)throw std::runtime_error("Invalid LAN selection mode");if(value.objects.size()>std::numeric_limits<std::uint16_t>::max())throw std::runtime_error("LAN selection exceeds object limit");writer.u8(0x16);writer.u8(value.mode);writer.u16(std::uint16_t(value.objects.size()));for(auto object:value.objects)writer.object(object);}
    },action);
    return writer.finish();
}
}
