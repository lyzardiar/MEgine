// Author: MiYu. Classic W3GS join transport with bounded non-blocking TCP framing.
// Protocol references: GHost++ d25ec63c67330308d93a4f9912c0072f0c034ebf (Apache-2.0),
// https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp
// GoWarcraft3 f13251b6caed199c3347214f4591e7ccaa96c7c7 (MPL-2.0),
// https://github.com/nielsAD/gowarcraft3/blob/f13251b6caed199c3347214f4591e7ccaa96c7c7/protocol/w3gs/packets.go
// Independently implemented; map verification, downloads and game synchronization are not implemented.
#include <winsock2.h>
#include <ws2tcpip.h>
#include "lan_join.h"
#include <algorithm>
#include <array>
#include <stdexcept>
#include <utility>

namespace war3 {
namespace {
using Clock=std::chrono::steady_clock;
constexpr auto invalidSocket=~std::uintptr_t{};
std::uint16_t u16(const std::uint8_t* p){return std::uint16_t(unsigned(p[0])|(unsigned(p[1])<<8));}
std::uint32_t u32(const std::uint8_t* p){return std::uint32_t(p[0])|(std::uint32_t(p[1])<<8)|(std::uint32_t(p[2])<<16)|(std::uint32_t(p[3])<<24);}
void put32(std::vector<std::uint8_t>& out,std::uint32_t n){for(unsigned i=0;i<4;++i)out.push_back(std::uint8_t(n>>(i*8)));}
bool text(const std::uint8_t* data,std::size_t length,std::size_t& at,std::size_t limit,std::string& result){auto begin=at;while(at<length && data[at] && at-begin<=limit)++at;if(at>=length || at-begin>limit)return false;result.assign(reinterpret_cast<const char*>(data+begin),at-begin);++at;return true;}
}
LanJoin::LanJoin(const LanGame& game,std::string playerName):name_(std::move(playerName)),hostCounter_(game.hostCounter),entryKey_(game.entryKey){
    if(name_.empty() || name_.size()>15 || name_.find('\0')!=std::string::npos || !game.port)throw std::runtime_error("Invalid LAN join parameters");sockaddr_in remote{};remote.sin_family=AF_INET;remote.sin_port=htons(game.port);if(InetPtonA(AF_INET,game.address.c_str(),&remote.sin_addr)!=1)throw std::runtime_error("Invalid LAN host address");WSADATA data{};int code=WSAStartup(MAKEWORD(2,2),&data);if(code)throw std::runtime_error("Winsock startup failed: "+std::to_string(code));winsock_=true;SOCKET sock=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(sock==INVALID_SOCKET){code=WSAGetLastError();WSACleanup();winsock_=false;throw std::runtime_error("LAN socket failed: "+std::to_string(code));}socket_=std::uintptr_t(sock);u_long nonblocking=1;if(ioctlsocket(sock,FIONBIO,&nonblocking)==SOCKET_ERROR){code=WSAGetLastError();closeSocket();throw std::runtime_error("LAN nonblocking setup failed: "+std::to_string(code));}activity_=Clock::now();int result=connect(sock,reinterpret_cast<const sockaddr*>(&remote),sizeof(remote));if(result==0)connected();else{code=WSAGetLastError();if(code!=WSAEWOULDBLOCK && code!=WSAEINPROGRESS){closeSocket();throw std::runtime_error("LAN connect failed: "+std::to_string(code));}}
}
LanJoin::~LanJoin(){cancel();}
void LanJoin::closeSocket(){chat_.clear();if(socket_!=invalidSocket){closesocket(SOCKET(socket_));socket_=invalidSocket;}if(winsock_){WSACleanup();winsock_=false;}}
void LanJoin::fail(std::string reason){error_=std::move(reason);state_=LanJoinState::Error;closeSocket();}
void LanJoin::connected(){
    sockaddr_in local{};int length=sizeof(local);if(getsockname(SOCKET(socket_),reinterpret_cast<sockaddr*>(&local),&length)==SOCKET_ERROR){fail("Cannot read LAN local address");return;}output_={0xf7,0x1e,0,0};put32(output_,hostCounter_);put32(output_,entryKey_);output_.push_back(0);output_.push_back(0);output_.push_back(0);put32(output_,GetTickCount());output_.insert(output_.end(),name_.begin(),name_.end());output_.push_back(0);output_.push_back(1);output_.push_back(0);output_.push_back(2);output_.push_back(0);output_.push_back(0);output_.push_back(0);auto bytes=reinterpret_cast<const std::uint8_t*>(&local.sin_addr.s_addr);output_.insert(output_.end(),bytes,bytes+4);for(unsigned i=0;i<8;++i)output_.push_back(0);output_[2]=std::uint8_t(output_.size());output_[3]=std::uint8_t(output_.size()>>8);sent_=0;state_=LanJoinState::Joining;activity_=Clock::now();
}
void LanJoin::cancel(){if(socket_!=invalidSocket && state_==LanJoinState::Lobby){const std::array<std::uint8_t,8> leave{0xf7,0x21,8,0,13,0,0,0};send(SOCKET(socket_),reinterpret_cast<const char*>(leave.data()),int(leave.size()),0);}if(state_!=LanJoinState::Rejected && state_!=LanJoinState::Error)state_=LanJoinState::Closed;closeSocket();}
bool LanJoin::sendChat(std::string_view message) {
    if(state_!=LanJoinState::Lobby || socket_==invalidSocket || !localPlayerId_ || message.empty() || message.size()>254 || message.find('\0')!=std::string_view::npos)return false;for(unsigned char c:message)if(c<32 || c==127)return false;if(!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,message.data(),int(message.size()),nullptr,0))return false;std::vector<std::uint8_t> targets;for(auto& slot:slots_)if(slot.status==2 && !slot.computer && slot.playerId && slot.playerId!=255 && std::find(targets.begin(),targets.end(),slot.playerId)==targets.end())targets.push_back(slot.playerId);if(std::find(targets.begin(),targets.end(),localPlayerId_)==targets.end())targets.push_back(localPlayerId_);if(targets.size()>24)return false;size_t packetSize=8+targets.size()+message.size();if(output_.size()-sent_+packetSize>65536)return false;if(sent_){output_.erase(output_.begin(),output_.begin()+sent_);sent_=0;}output_.insert(output_.end(),{0xf7,0x28,std::uint8_t(packetSize),std::uint8_t(packetSize>>8),std::uint8_t(targets.size())});output_.insert(output_.end(),targets.begin(),targets.end());output_.push_back(localPlayerId_);output_.push_back(0x10);output_.insert(output_.end(),message.begin(),message.end());output_.push_back(0);return true;
}
void LanJoin::process(const std::uint8_t* p,std::size_t n){
    auto invalid=[&]{fail("Invalid LAN lobby packet");};switch(p[1]){
    case 0x01:if(n!=8){invalid();return;}if(output_.size()-sent_>65528){fail("LAN send queue exceeded");return;}output_.insert(output_.end(),{0xf7,0x46,8,0,p[4],p[5],p[6],p[7]});break;
    case 0x04:case 0x09:{if(n<13){invalid();return;}auto length=u16(p+4);unsigned count=p[6];if(count>24 || length!=7+count*9 || n!=std::size_t(6)+length+(p[1]==0x04?17u:0u)){invalid();return;}std::vector<LanSlot> next;next.reserve(count);for(unsigned i=0;i<count;++i){auto q=p+7+i*9;if(q[2]>2 || q[3]>1){invalid();return;}next.push_back({q[0],q[1],q[2],q[3],q[4],q[5],q[6],q[7],q[8]});}if(p[1]==0x04){if(state_!=LanJoinState::Joining){invalid();return;}auto id=p[6+length];if(!id || id==255){invalid();return;}localPlayerId_=id;state_=LanJoinState::Lobby;players_.push_back({id,name_});}else if(state_!=LanJoinState::Lobby){invalid();return;}slots_=std::move(next);break;}
    case 0x05:if(n!=8){invalid();return;}rejectionCode_=u32(p+4);state_=LanJoinState::Rejected;error_="LAN host rejected join: "+std::to_string(rejectionCode_);closeSocket();break;
    case 0x06:{if(state_!=LanJoinState::Lobby || n<44){invalid();return;}auto id=p[8];std::size_t at=9;std::string name;if(!id || id==255 || !text(p,n,at,15,name) || name.empty() || at>=n || p[at]>8 || n-at!=33u+p[at]){invalid();return;}auto found=std::find_if(players_.begin(),players_.end(),[&](const LanPlayer& v){return v.id==id;});if(found!=players_.end())found->name=std::move(name);else{if(players_.size()>=24){fail("LAN player limit exceeded");return;}players_.push_back({id,std::move(name)});}break;}
    case 0x07:if(n!=9){invalid();return;}std::erase_if(players_,[&](const LanPlayer& v){return v.id==p[4];});break;
    case 0x0f:{if(state_!=LanJoinState::Lobby || n<8){invalid();return;}auto count=p[4];if(!count || count>24 || n<std::size_t(8)+count){invalid();return;}auto sender=p[5+count],kind=p[6+count];if(kind!=0x10)break;std::size_t at=7+count;std::string message;if(!sender || sender==255 || !text(p,n,at,254,message) || at!=n){invalid();return;}if(std::find(p+5,p+5+count,localPlayerId_)==p+5+count)break;if(chat_.size()>=200)chat_.erase(chat_.begin());chat_.push_back({sender,std::move(message)});break;}
    case 0x1c:if(n!=8){invalid();return;}fail("LAN host removed this player: "+std::to_string(u32(p+4)));return;
    case 0x3d:{if(state_!=LanJoinState::Lobby || n<41 || u32(p+4)!=1){invalid();return;}std::size_t at=8;std::string path;if(!text(p,n,at,1024,path) || path.empty() || n-at!=32){invalid();return;}LanMapAnnouncement next;next.received=true;next.path=std::move(path);next.size=u32(p+at);next.info=u32(p+at+4);next.crc=u32(p+at+8);std::copy_n(p+at+12,20,next.sha1.begin());map_=std::move(next);break;}
    case 0x3f:case 0x43:fail("LAN map download is not implemented");return;
    case 0x0a:case 0x0b:fail("LAN match start is not implemented");return;
    default:break;
    }
}
void LanJoin::poll(){
    if(socket_==invalidSocket)return;auto now=Clock::now();if(now-activity_>(state_==LanJoinState::Lobby?std::chrono::seconds(60):std::chrono::seconds(15))){fail("LAN connection timed out");return;}auto sock=SOCKET(socket_);if(state_==LanJoinState::Connecting){fd_set writable,failed;FD_ZERO(&writable);FD_ZERO(&failed);FD_SET(sock,&writable);FD_SET(sock,&failed);timeval zero{};int result=select(0,nullptr,&writable,&failed,&zero);if(result==SOCKET_ERROR){fail("LAN connect poll failed: "+std::to_string(WSAGetLastError()));return;}if(result){int code=0,length=sizeof(code);if(getsockopt(sock,SOL_SOCKET,SO_ERROR,reinterpret_cast<char*>(&code),&length)==SOCKET_ERROR || code){fail("LAN connect failed: "+std::to_string(code?code:WSAGetLastError()));return;}connected();}if(state_==LanJoinState::Connecting || socket_==invalidSocket)return;}
    for(unsigned pass=0;pass<32 && sent_<output_.size();++pass){int result=send(sock,reinterpret_cast<const char*>(output_.data()+sent_),int(output_.size()-sent_),0);if(result==SOCKET_ERROR){int code=WSAGetLastError();if(code==WSAEWOULDBLOCK)break;fail("LAN send failed: "+std::to_string(code));return;}if(!result)break;sent_+=std::size_t(result);}if(sent_==output_.size()){output_.clear();sent_=0;}
    for(unsigned pass=0;pass<32;++pass){std::array<std::uint8_t,4096> bytes{};int received=recv(sock,reinterpret_cast<char*>(bytes.data()),int(bytes.size()),0);if(received==0){state_=LanJoinState::Closed;error_="LAN host closed connection";closeSocket();return;}if(received==SOCKET_ERROR){int code=WSAGetLastError();if(code==WSAEWOULDBLOCK)break;fail("LAN receive failed: "+std::to_string(code));return;}activity_=now;if(input_.size()+std::size_t(received)>262144){fail("LAN receive buffer exceeded");return;}input_.insert(input_.end(),bytes.begin(),bytes.begin()+received);}
    std::size_t offset=0;for(unsigned packets=0;packets<256 && input_.size()-offset>=4;++packets){auto* p=input_.data()+offset;auto length=u16(p+2);if(p[0]!=0xf7 || length<4){fail("Invalid LAN packet header");return;}if(input_.size()-offset<length)break;process(p,length);if(socket_==invalidSocket)return;offset+=length;}if(offset)input_.erase(input_.begin(),input_.begin()+offset);
}
}
