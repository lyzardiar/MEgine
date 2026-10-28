// Author: MiYu. Classic W3GS LAN discovery reads bounded datagrams without blocking the game UI.
// Protocol reference: GHost++ gameprotocol.cpp d25ec63c67330308d93a4f9912c0072f0c034ebf (Apache-2.0),
// https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp
// Discovery response routing follows GoWarcraft3 f13251b6caed199c3347214f4591e7ccaa96c7c7 (MPL-2.0):
// https://github.com/nielsAD/gowarcraft3/blob/f13251b6caed199c3347214f4591e7ccaa96c7c7/network/lan/advertise_udp.go
// Wire format is implemented independently; native 1.27 compatibility remains to be verified.
#include <winsock2.h>
#include <ws2tcpip.h>
#include "lan_discovery.h"
#include <algorithm>
#include <array>
#include <stdexcept>
#include <utility>

namespace war3 {
namespace {
using Clock=std::chrono::steady_clock;
constexpr auto invalidSocket=~std::uintptr_t{};
std::runtime_error socketError(const char* operation,int code){return std::runtime_error(std::string(operation)+" failed (Winsock "+std::to_string(code)+")");}
std::uint16_t u16(std::span<const std::uint8_t> b,size_t p){return std::uint16_t(unsigned(b[p])|(unsigned(b[p+1])<<8));}
std::uint32_t u32(std::span<const std::uint8_t> b,size_t p){return std::uint32_t(b[p])|(std::uint32_t(b[p+1])<<8)|(std::uint32_t(b[p+2])<<16)|(std::uint32_t(b[p+3])<<24);}
bool stringAt(std::span<const std::uint8_t> data,size_t& offset,size_t maximum,std::string& out){if(offset>data.size())return false;auto begin=offset;while(offset<data.size() && data[offset] && offset-begin<=maximum)++offset;if(offset>=data.size() || offset-begin>maximum)return false;out.assign(reinterpret_cast<const char*>(data.data()+begin),offset-begin);++offset;return true;}
bool decodeStat(std::span<const std::uint8_t> encoded,std::vector<std::uint8_t>& result){if(encoded.empty() || encoded.size()>2048)return false;result.clear();result.reserve(encoded.size());for(size_t i=0;i<encoded.size();){auto mask=encoded[i++];if(!(mask&1) || i==encoded.size())return false;for(unsigned bit=1;bit<=7 && i<encoded.size();++bit){auto value=encoded[i++];if(!(value&1))return false;result.push_back(std::uint8_t((mask&(1u<<bit))?value:value-1));}}return true;}
}
std::optional<LanGame> parseLanGameInfo(std::span<const std::uint8_t> bytes,std::string address){
    if(bytes.size()<45 || bytes.size()>4096 || bytes[0]!=0xf7 || bytes[1]!=0x30 || u16(bytes,2)!=bytes.size())return {};bool expansion;if(bytes[4]=='P' && bytes[5]=='X' && bytes[6]=='3' && bytes[7]=='W')expansion=true;else if(bytes[4]=='3' && bytes[5]=='R' && bytes[6]=='A' && bytes[7]=='W')expansion=false;else return {};LanGame game;game.address=std::move(address);game.expansion=expansion;game.version=u32(bytes,8);game.hostCounter=u32(bytes,12);game.entryKey=u32(bytes,16);size_t at=20;if(!stringAt(bytes,at,127,game.name) || game.name.empty() || at>=bytes.size() || bytes[at++]!=0)return {};auto begin=at;while(at<bytes.size() && bytes[at] && at-begin<=2048)++at;if(at>=bytes.size() || at-begin>2048)return {};std::vector<std::uint8_t> stat;if(!decodeStat(bytes.subspan(begin,at-begin),stat))return {};++at;if(bytes.size()-at!=22 || stat.size()<16)return {};
    auto data=std::span<const std::uint8_t>(stat);if(data[4]>2)return {};game.mapFlags=u32(data,0);game.width=u16(data,5);game.height=u16(data,7);game.mapChecksum=u32(data,9);size_t cursor=13;if(!stringAt(data,cursor,1024,game.mapPath) || !stringAt(data,cursor,255,game.hostName) || game.mapPath.empty() || game.hostName.empty() || cursor>=data.size() || data[cursor++]!=0 || (data.size()-cursor!=0 && data.size()-cursor!=20))return {};
    game.slotsTotal=u32(bytes,at);game.gameType=u32(bytes,at+4);game.unknown=u32(bytes,at+8);game.slotsAvailable=u32(bytes,at+12);game.uptime=u32(bytes,at+16);game.port=u16(bytes,at+20);if(!game.port || !game.slotsTotal || game.slotsTotal>24 || game.slotsAvailable>game.slotsTotal)return {};game.slotsUsed=game.slotsTotal-game.slotsAvailable;return game;
}
LanDiscovery::LanDiscovery(bool expansion,std::uint32_t version):expansion_(expansion),version_(version){
    WSADATA data{};auto code=WSAStartup(MAKEWORD(2,2),&data);if(code)throw socketError("WSAStartup",code);winsock_=true;SOCKET sock=::socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);if(sock==INVALID_SOCKET){code=WSAGetLastError();WSACleanup();winsock_=false;throw socketError("UDP socket",code);}socket_=std::uintptr_t(sock);BOOL broadcast=TRUE;u_long nonblocking=1;sockaddr_in bindAddress{};bindAddress.sin_family=AF_INET;bindAddress.sin_addr.s_addr=htonl(INADDR_ANY);bindAddress.sin_port=0;
    if(setsockopt(sock,SOL_SOCKET,SO_BROADCAST,reinterpret_cast<const char*>(&broadcast),sizeof(broadcast))==SOCKET_ERROR || ioctlsocket(sock,FIONBIO,&nonblocking)==SOCKET_ERROR || bind(sock,reinterpret_cast<const sockaddr*>(&bindAddress),sizeof(bindAddress))==SOCKET_ERROR){code=WSAGetLastError();closesocket(sock);socket_=invalidSocket;WSACleanup();winsock_=false;throw socketError("UDP setup",code);}
}
LanDiscovery::~LanDiscovery(){if(socket_!=invalidSocket)closesocket(SOCKET(socket_));if(winsock_)WSACleanup();}
void LanDiscovery::refresh(){
    if(socket_==invalidSocket)throw std::runtime_error("LAN discovery is closed");std::array<std::uint8_t,16> message{0xf7,0x2f,16,0};auto product=expansion_?std::array<std::uint8_t,4>{'P','X','3','W'}:std::array<std::uint8_t,4>{'3','R','A','W'};std::copy(product.begin(),product.end(),message.begin()+4);for(unsigned i=0;i<4;++i)message[8+i]=std::uint8_t(version_>>(8*i));sockaddr_in destination{};destination.sin_family=AF_INET;destination.sin_port=htons(6112);destination.sin_addr.s_addr=htonl(INADDR_BROADCAST);auto sock=SOCKET(socket_);if(sendto(sock,reinterpret_cast<const char*>(message.data()),int(message.size()),0,reinterpret_cast<const sockaddr*>(&destination),sizeof(destination))==SOCKET_ERROR)throw socketError("LAN search broadcast",WSAGetLastError());destination.sin_addr.s_addr=htonl(INADDR_LOOPBACK);sendto(sock,reinterpret_cast<const char*>(message.data()),int(message.size()),0,reinterpret_cast<const sockaddr*>(&destination),sizeof(destination));lastSearch_=Clock::now();
}
void LanDiscovery::poll(){
    if(socket_==invalidSocket)throw std::runtime_error("LAN discovery is closed");auto now=Clock::now();if(lastSearch_.time_since_epoch().count()==0 || now-lastSearch_>=std::chrono::seconds(15))refresh();auto sock=SOCKET(socket_);for(unsigned i=0;i<128;++i){std::array<std::uint8_t,4096> buffer{};sockaddr_in source{};int sourceLength=sizeof(source);auto count=recvfrom(sock,reinterpret_cast<char*>(buffer.data()),int(buffer.size()),0,reinterpret_cast<sockaddr*>(&source),&sourceLength);if(count==SOCKET_ERROR){auto error=WSAGetLastError();if(error==WSAEWOULDBLOCK)break;if(error==WSAEMSGSIZE || error==WSAECONNRESET)continue;throw socketError("LAN search receive",error);}if(source.sin_family!=AF_INET)continue;std::array<char,INET_ADDRSTRLEN> ip{};if(!InetNtopA(AF_INET,&source.sin_addr,ip.data(),DWORD(ip.size())))continue;auto game=parseLanGameInfo(std::span<const std::uint8_t>(buffer.data(),size_t(count)),ip.data());if(!game || game->version!=version_ || game->expansion!=expansion_)continue;game->lastSeen=now;auto found=std::find_if(games_.begin(),games_.end(),[&](const LanGame& existing){return existing.address==game->address && existing.hostCounter==game->hostCounter && existing.port==game->port;});if(found!=games_.end())*found=std::move(*game);else{if(games_.size()>=128){auto oldest=std::min_element(games_.begin(),games_.end(),[](const LanGame& a,const LanGame& b){return a.lastSeen<b.lastSeen;});games_.erase(oldest);}games_.push_back(std::move(*game));}}
    std::erase_if(games_,[&](const LanGame& game){return now-game.lastSeen>std::chrono::seconds(35);});
}
}
