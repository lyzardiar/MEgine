// Author: MiYu. Bounded, non-blocking classic W3GS LAN lobby host.
// Protocol references: GHost++ d25ec63c67330308d93a4f9912c0072f0c034ebf (Apache-2.0),
// https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp
// and GoWarcraft3 f13251b6caed199c3347214f4591e7ccaa96c7c7 (MPL-2.0).
// Independently implemented; original-client compatibility and actual play remain unverified.
#include <winsock2.h>
#include <ws2tcpip.h>
#include <bcrypt.h>
#include "lan_host.h"
#include "lan_handshake.h"
#include "lan_setup.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <deque>
#include <stdexcept>
#include <utility>

namespace war3 {
namespace {
using Clock=std::chrono::steady_clock;
using Bytes=std::vector<std::uint8_t>;
void u16(Bytes& b,unsigned n){b.push_back(std::uint8_t(n));b.push_back(std::uint8_t(n>>8));}
void u32(Bytes& b,std::uint32_t n){for(unsigned i=0;i<4;++i)b.push_back(std::uint8_t(n>>(8*i)));}
std::uint16_t read16(const std::uint8_t* p){return std::uint16_t(unsigned(p[0])|(unsigned(p[1])<<8));}
std::uint32_t read32(const std::uint8_t* p){return std::uint32_t(p[0])|(std::uint32_t(p[1])<<8)|(std::uint32_t(p[2])<<16)|(std::uint32_t(p[3])<<24);}
void append(Bytes& b,std::string_view s){b.insert(b.end(),s.begin(),s.end());b.push_back(0);}
Bytes packet(unsigned id){return {0xf7,std::uint8_t(id),0,0};}
void finish(Bytes& b){if(b.size()>65535)throw std::runtime_error("LAN host packet exceeds limit");b[2]=std::uint8_t(b.size());b[3]=std::uint8_t(b.size()>>8);}
bool safeText(std::string_view s,size_t max){if(s.empty() || s.size()>max)return false;for(unsigned char c:s)if(c<32 || c==127)return false;return true;}
Bytes encodeStat(const Bytes& raw){Bytes b;for(size_t i=0;i<raw.size();){auto mask=b.size();b.push_back(1);for(unsigned bit=1;bit<=7 && i<raw.size();++bit){auto x=raw[i++];if(x&1)b[mask]|=std::uint8_t(1u<<bit);else ++x;b.push_back(x);}}return b;}
constexpr auto crcTable(){std::array<std::uint32_t,256> table{};for(unsigned i=0;i<table.size();++i){auto value=std::uint32_t(i);for(unsigned bit=0;bit<8;++bit)value=(value>>1)^(0xedb88320u & (0u-(value&1u)));table[i]=value;}return table;}
std::uint32_t crc32(const std::uint8_t* data,size_t size){static constexpr auto table=crcTable();std::uint32_t value=0xffffffffu;for(size_t i=0;i<size;++i)value=(value>>8)^table[(value^data[i])&255u];return value^0xffffffffu;}
}
struct LanHost::Impl {
    struct Peer {SOCKET socket=INVALID_SOCKET;std::uint32_t address=0;std::uint16_t port=0;std::uint8_t pid=0;std::string name;Bytes input,output;size_t sent=0;Clock::time_point activity=Clock::now();bool closing=false,dead=false,mapReady=false,mapRequested=false,downloadStarted=false,downloadActive=false,handshakeVerified=false;std::uint32_t mapSent=0,mapAcked=0;std::uint64_t checksumCount=0;std::deque<std::uint32_t> checksums;};
    LanHostSettings settings;Bytes handshakePacket;SOCKET tcp=INVALID_SOCKET,udp=INVALID_SOCKET;bool winsock=false,alive=false;std::uint16_t port=0;std::uint32_t hostCounter=0,entryKey=0,randomSeed=0;Clock::time_point started=Clock::now(),nextPing=Clock::now(),loadStarted=Clock::now();std::vector<LanSlot> slots;std::vector<LanPlayer> players;std::vector<LanChatMessage> chat;std::vector<Peer> peers;std::string lastError;LanLoadPhase loadPhase=LanLoadPhase::Lobby;std::vector<std::uint8_t> loadPlayers,loadedPlayers;bool barrierFailed=false;
    bool timeSlotsEnabled=false;std::vector<LanAction> pendingActions;size_t pendingBytes=0,frameBytes=0;std::deque<LanTimeSlot> frames;std::uint64_t emittedRounds=0,comparedRounds=0,hostChecksumCount=0;std::deque<std::uint32_t> hostChecksums;std::optional<LanChecksumMismatch> mismatch;
    explicit Impl(LanHostSettings value):settings(std::move(value)) {
        if(!safeText(settings.gameName,31) || !safeText(settings.playerName,15) || !safeText(settings.mapPath,1024) || !settings.map.size || settings.slots.empty() || settings.slots.size()>12 || (settings.mapBytes && (settings.mapBytes->size()!=settings.map.size || settings.mapBytes->size()>256u*1024u*1024u)))throw std::runtime_error("Invalid LAN host settings");if(settings.experimentalHandshake)handshakePacket=localLanHandshake();
        slots=settings.slots;if(settings.computerOnly.empty())settings.computerOnly.resize(slots.size());if(settings.computerOnly.size()!=slots.size())throw std::runtime_error("Invalid LAN host slot restrictions");for(size_t i=0;i<slots.size();++i){auto& slot=slots[i];if(slot.status>2 || slot.computer>1 || (slot.status==2 && !slot.computer) || (settings.computerOnly[i] && (slot.status!=2 || !slot.computer)))throw std::runtime_error("Invalid initial LAN host slot");}auto open=std::find_if(slots.begin(),slots.end(),[](const auto& slot){return slot.status==0;});if(open==slots.end())throw std::runtime_error("No host player slot available");open->playerId=1;open->status=2;open->computer=0;open->download=100;players.push_back({1,settings.playerName});
        std::array<std::uint32_t,3> random{};if(BCryptGenRandom(nullptr,reinterpret_cast<PUCHAR>(random.data()),ULONG(sizeof(random)),BCRYPT_USE_SYSTEM_PREFERRED_RNG)<0)throw std::runtime_error("Cannot create LAN session identifiers");hostCounter=random[0]&0x0fffffffu;if(!hostCounter)hostCounter=1;entryKey=random[1];randomSeed=random[2];WSADATA data{};int rc=WSAStartup(MAKEWORD(2,2),&data);if(rc)throw std::runtime_error("Winsock startup failed: "+std::to_string(rc));winsock=true;
        try {udp=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);if(udp==INVALID_SOCKET)throw std::runtime_error("Cannot create LAN discovery socket");BOOL exclusive=TRUE;if(setsockopt(udp,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,reinterpret_cast<const char*>(&exclusive),sizeof(exclusive))==SOCKET_ERROR)throw std::runtime_error("Cannot secure LAN discovery socket");sockaddr_in addr{};addr.sin_family=AF_INET;addr.sin_addr.s_addr=htonl(INADDR_ANY);addr.sin_port=htons(6112);if(bind(udp,reinterpret_cast<sockaddr*>(&addr),sizeof(addr))==SOCKET_ERROR)throw std::runtime_error("LAN discovery port 6112 is unavailable");u_long nb=1;if(ioctlsocket(udp,FIONBIO,&nb)==SOCKET_ERROR)throw std::runtime_error("Cannot configure LAN discovery socket");tcp=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(tcp==INVALID_SOCKET)throw std::runtime_error("Cannot create LAN host socket");if(setsockopt(tcp,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,reinterpret_cast<const char*>(&exclusive),sizeof(exclusive))==SOCKET_ERROR)throw std::runtime_error("Cannot secure LAN host socket");addr.sin_port=0;if(bind(tcp,reinterpret_cast<sockaddr*>(&addr),sizeof(addr))==SOCKET_ERROR || listen(tcp,12)==SOCKET_ERROR || ioctlsocket(tcp,FIONBIO,&nb)==SOCKET_ERROR)throw std::runtime_error("Cannot listen for LAN players");int size=sizeof(addr);if(getsockname(tcp,reinterpret_cast<sockaddr*>(&addr),&size)==SOCKET_ERROR)throw std::runtime_error("Cannot determine LAN host port");port=ntohs(addr.sin_port);alive=true;}
        catch(...){stop();throw;}
    }
    ~Impl(){stop();}
    void stop(){if(loadPhase!=LanLoadPhase::Lobby)loadPhase=LanLoadPhase::Failed;for(auto& p:peers)if(p.socket!=INVALID_SOCKET)closesocket(p.socket);peers.clear();if(tcp!=INVALID_SOCKET){closesocket(tcp);tcp=INVALID_SOCKET;}if(udp!=INVALID_SOCKET){closesocket(udp);udp=INVALID_SOCKET;}if(winsock){WSACleanup();winsock=false;}settings.mapBytes.reset();pendingActions.clear();pendingBytes=0;frames.clear();frameBytes=0;hostChecksums.clear();alive=false;}
    Bytes slotInfo() const {Bytes b;b.push_back(std::uint8_t(slots.size()));for(auto s:slots)b.insert(b.end(),{s.playerId,s.download,s.status,s.computer,s.team,s.color,s.race,s.difficulty,s.handicap});u32(b,randomSeed);b.push_back(0);b.push_back(std::uint8_t(slots.size()));return b;}
    unsigned openSlots() const {return unsigned(std::count_if(slots.begin(),slots.end(),[](auto& s){return s.status==0;}));}
    Bytes gameInfo() const {Bytes stat;u32(stat,settings.mapFlags);stat.push_back(0);u16(stat,settings.width);u16(stat,settings.height);u32(stat,settings.map.crc);append(stat,settings.mapPath);append(stat,settings.playerName);stat.push_back(0);auto encoded=encodeStat(stat);auto b=packet(0x30);b.insert(b.end(),{'P','X','3','W'});u32(b,27);u32(b,hostCounter);u32(b,entryKey);append(b,settings.gameName);b.push_back(0);b.insert(b.end(),encoded.begin(),encoded.end());b.push_back(0);u32(b,std::uint32_t(slots.size()));u32(b,settings.gameType);u32(b,1);u32(b,openSlots());u32(b,std::uint32_t(std::chrono::duration_cast<std::chrono::seconds>(Clock::now()-started).count()));u16(b,port);finish(b);return b;}
    Bytes slotPacket(bool join,std::uint8_t id=0,const Peer* peer=nullptr) const {auto b=packet(join?0x04:0x09);auto info=slotInfo();u16(b,unsigned(info.size()));b.insert(b.end(),info.begin(),info.end());if(join){b.push_back(id);b.push_back(2);b.push_back(0);b.push_back(std::uint8_t(peer->port>>8));b.push_back(std::uint8_t(peer->port));auto ip=reinterpret_cast<const std::uint8_t*>(&peer->address);b.insert(b.end(),ip,ip+4);b.insert(b.end(),8,0);}finish(b);return b;}
    Bytes playerPacket(std::uint8_t id,std::string_view name,std::uint32_t address) const {auto b=packet(0x06);u32(b,2);b.push_back(id);append(b,name);b.insert(b.end(),{1,0,2,0,0,0});auto ip=reinterpret_cast<const std::uint8_t*>(&address);b.insert(b.end(),ip,ip+4);b.insert(b.end(),8,0);b.insert(b.end(),{2,0,0,0});b.insert(b.end(),ip,ip+4);b.insert(b.end(),8,0);finish(b);return b;}
    Bytes mapPacket() const {auto b=packet(0x3d);u32(b,1);append(b,settings.mapPath);u32(b,settings.map.size);u32(b,settings.map.info);u32(b,settings.map.crc);b.insert(b.end(),settings.map.sha1.begin(),settings.map.sha1.end());finish(b);return b;}
    bool enqueue(Peer& p,const Bytes& bytes){if(p.dead || p.output.size()-p.sent+bytes.size()>65536){p.dead=true;return false;}if(p.sent){p.output.erase(p.output.begin(),p.output.begin()+p.sent);p.sent=0;}p.output.insert(p.output.end(),bytes.begin(),bytes.end());return true;}
    void broadcast(const Bytes& bytes,std::uint8_t except=0){for(auto& p:peers)if(p.pid && p.pid!=except && !p.closing)enqueue(p,bytes);}
    bool canBroadcast(size_t length) const {return std::all_of(peers.begin(),peers.end(),[&](const Peer& p){return !p.pid || (!p.dead && !p.closing && p.output.size()-p.sent+length<=65536);});}
    void updateLoadPhase(){if(loadPhase==LanLoadPhase::Loading && std::all_of(loadPlayers.begin(),loadPlayers.end(),[&](auto id){return std::find(loadedPlayers.begin(),loadedPlayers.end(),id)!=loadedPlayers.end();}))loadPhase=LanLoadPhase::Ready;}
    bool markLoaded(std::uint8_t id){if(!alive || loadPhase!=LanLoadPhase::Loading || std::find(loadPlayers.begin(),loadPlayers.end(),id)==loadPlayers.end())return false;if(std::find(loadedPlayers.begin(),loadedPlayers.end(),id)!=loadedPlayers.end())return true;if(!canBroadcast(5))return false;auto b=packet(0x08);b.push_back(id);finish(b);broadcast(b);loadedPlayers.push_back(id);updateLoadPhase();return true;}
    bool beginCountdown(){if(!alive || loadPhase!=LanLoadPhase::Lobby || !canBroadcast(4))return false;std::vector<std::uint8_t> participants;for(const auto& slot:slots)if(slot.status==2 && !slot.computer){if(!slot.playerId || slot.playerId==255 || std::find(participants.begin(),participants.end(),slot.playerId)!=participants.end())return false;participants.push_back(slot.playerId);}if(std::find(participants.begin(),participants.end(),1)==participants.end())return false;for(const auto& p:peers)if(p.pid && (!p.mapReady || (settings.experimentalHandshake && !p.handshakeVerified) || std::find(participants.begin(),participants.end(),p.pid)==participants.end()))return false;for(auto id:participants)if(id!=1 && std::none_of(peers.begin(),peers.end(),[&](const Peer& p){return p.pid==id && !p.dead && !p.closing;}))return false;for(auto& p:peers)if(!p.pid)p.dead=true;auto b=packet(0x0a);finish(b);broadcast(b);loadPlayers=std::move(participants);loadedPlayers.clear();loadPhase=LanLoadPhase::Countdown;loadStarted=Clock::now();return true;}
    bool beginLoading(){if(!alive || loadPhase!=LanLoadPhase::Countdown || !canBroadcast(4))return false;auto b=packet(0x0b);finish(b);broadcast(b);loadPhase=LanLoadPhase::Loading;loadStarted=Clock::now();return true;}
    bool enableTimeSlotProtocol(){if(!alive || (loadPhase!=LanLoadPhase::Loading && loadPhase!=LanLoadPhase::Ready))return false;timeSlotsEnabled=true;return true;}
    bool queueAction(std::uint8_t id,std::span<const std::uint8_t> data){
        if(!alive || !timeSlotsEnabled || loadPhase!=LanLoadPhase::Ready || mismatch || data.size()>1449 || pendingActions.size()>=4096 || pendingBytes+3+data.size()>60u*1024u)return false;
        pendingActions.push_back({id,Bytes(data.begin(),data.end())});pendingBytes+=3+data.size();return true;
    }
    bool emitTimeSlot(std::uint16_t elapsedMs){
        if(!alive || !timeSlotsEnabled || loadPhase!=LanLoadPhase::Ready || mismatch || emittedRounds==UINT64_MAX || emittedRounds-comparedRounds>=256 || frames.size()>=256 || frameBytes+pendingBytes+6>1024u*1024u)return false;
        Bytes wire,sub;auto appendPart=[&](bool fragment){auto part=packet(fragment?0x48:0x0c);u16(part,fragment?0:elapsedMs);if(!sub.empty()){u16(part,crc32(sub.data(),sub.size())&0xffffu);part.insert(part.end(),sub.begin(),sub.end());}finish(part);wire.insert(wire.end(),part.begin(),part.end());sub.clear();};
        for(auto& action:pendingActions){if(sub.size()+3+action.bytes.size()>1452)appendPart(true);sub.push_back(action.playerId);u16(sub,unsigned(action.bytes.size()));sub.insert(sub.end(),action.bytes.begin(),action.bytes.end());}appendPart(false);
        if(!canBroadcast(wire.size()))return false;LanTimeSlot local{elapsedMs,pendingActions};frames.push_back(std::move(local));frameBytes+=pendingBytes+6;broadcast(wire);pendingActions.clear();pendingBytes=0;++emittedRounds;return true;
    }
    std::optional<LanTimeSlot> takeTimeSlot(){if(frames.empty())return {};auto result=std::move(frames.front());frames.pop_front();size_t size=6;for(auto& action:result.actions)size+=3+action.bytes.size();frameBytes-=size;return result;}
    void compareChecksums(){
        while(!hostChecksums.empty() && !mismatch){std::vector<Peer*> participants;for(auto id:loadPlayers)if(id!=1){auto p=std::find_if(peers.begin(),peers.end(),[&](const Peer& peer){return peer.pid==id && !peer.dead && !peer.closing;});if(p==peers.end() || p->checksums.empty())return;participants.push_back(&*p);}auto expected=hostChecksums.front();hostChecksums.pop_front();for(auto* p:participants){auto actual=p->checksums.front();p->checksums.pop_front();if(actual!=expected && !mismatch){mismatch=LanChecksumMismatch{comparedRounds+1,p->pid,expected,actual};lastError="LAN simulation checksum mismatch";}}++comparedRounds;}
    }
    bool submitHostChecksum(std::uint32_t value){if(!alive || !timeSlotsEnabled || loadPhase!=LanLoadPhase::Ready || mismatch || hostChecksumCount>=emittedRounds || hostChecksums.size()>=256)return false;hostChecksums.push_back(value);++hostChecksumCount;compareChecksums();return true;}
    void receiveChecksum(Peer& p,const std::uint8_t* data,size_t n){if(!timeSlotsEnabled || loadPhase!=LanLoadPhase::Ready || n!=9){p.dead=true;return;}if(mismatch)return;if(p.checksumCount>=emittedRounds || p.checksums.size()>=256){p.dead=true;return;}p.checksums.push_back(read32(data+5));++p.checksumCount;compareChecksums();}
    void reject(Peer& p,unsigned reason){auto b=packet(0x05);u32(b,reason);finish(b);enqueue(p,b);p.closing=true;}
    void announceSlots(){broadcast(slotPacket(false));}
    bool setSlot(size_t index,const LanSlot& requested){
        if(!alive || loadPhase!=LanLoadPhase::Lobby || index>=slots.size() || requested.status>2 || requested.computer>1 || requested.team>=12 || requested.color>=12 || requested.difficulty>2 || requested.handicap<50 || requested.handicap>100 || requested.handicap%10)return false;
        auto& current=slots[index];bool human=current.status==2 && !current.computer;
        if(human && (requested.status!=2 || requested.computer || requested.playerId!=current.playerId || requested.download!=current.download))return false;
        if(!human && (requested.playerId || requested.download || (requested.status==2)!=bool(requested.computer)))return false;
        if(settings.computerOnly[index] && (requested.status!=2 || !requested.computer))return false;
        if((settings.mapOptions&0x20) && (requested.color!=current.color || requested.race!=current.race || requested.handicap!=current.handicap))return false;
        if((settings.mapOptions&0x40) && requested.team!=current.team)return false;
        if((settings.mapFlags&16) && requested.race!=current.race)return false;
        auto race=unsigned(requested.race)&0x3fu;if(race!=1 && race!=2 && race!=4 && race!=8 && race!=32)return false;
        if(requested.color!=current.color){auto other=std::find_if(slots.begin(),slots.end(),[&](const LanSlot& slot){return &slot!=&current && slot.color==requested.color;});if(other!=slots.end())other->color=current.color;}
        current=requested;announceSlots();return true;
    }
    void changePlayerSlot(std::uint8_t id,unsigned kind,std::uint8_t value){
        auto found=std::find_if(slots.begin(),slots.end(),[&](const LanSlot& slot){return slot.status==2 && !slot.computer && slot.playerId==id;});if(found==slots.end())return;auto index=std::size_t(found-slots.begin());auto next=*found;
        if(kind==0x11 && (settings.mapOptions&0x40)){
            auto start=found->team==value?(index+1)%slots.size():0u;size_t destination=slots.size();for(size_t i=0;i<slots.size();++i){auto candidate=(start+i)%slots.size();if(slots[candidate].status==0 && slots[candidate].team==value && !settings.computerOnly[candidate]){destination=candidate;break;}}if(destination==slots.size())return;
            auto& target=slots[destination];if(settings.mapOptions&0x20){std::swap(found->playerId,target.playerId);std::swap(found->download,target.download);std::swap(found->status,target.status);std::swap(found->computer,target.computer);std::swap(found->difficulty,target.difficulty);}else{auto oldTeam=found->team,newTeam=target.team;std::swap(*found,target);found->team=oldTeam;target.team=newTeam;}announceSlots();return;
        }
        if(kind==0x11){if(value>=slots.size())return;next.team=value;}
        else if(kind==0x12)next.color=value;
        else if(kind==0x13){if(settings.mapFlags&16)return;if(value!=1 && value!=2 && value!=4 && value!=8 && value!=32)return;next.race=value|0x40;}
        else if(kind==0x14)next.handicap=value;
        else return;
        setSlot(index,next);
    }
    void remove(Peer& p){if(p.socket!=INVALID_SOCKET){closesocket(p.socket);p.socket=INVALID_SOCKET;}if(!p.pid)return;auto id=p.pid;p.pid=0;if(loadPhase!=LanLoadPhase::Lobby && std::find(loadPlayers.begin(),loadPlayers.end(),id)!=loadPlayers.end()){barrierFailed=true;lastError="LAN player left during loading";}for(auto& slot:slots)if(slot.playerId==id && slot.status==2 && !slot.computer){slot.playerId=0;slot.download=0;slot.status=0;break;}std::erase_if(players,[&](const LanPlayer& v){return v.id==id;});auto b=packet(0x07);b.push_back(id);u32(b,13);finish(b);broadcast(b);if(loadPhase==LanLoadPhase::Lobby)announceSlots();}
    bool chatMessage(std::uint8_t sender,const std::vector<std::uint8_t>& recipients,std::string_view message){if(!safeText(message,254) || recipients.empty() || recipients.size()>24)return false;auto b=packet(0x0f);b.push_back(std::uint8_t(recipients.size()));b.insert(b.end(),recipients.begin(),recipients.end());b.push_back(sender);b.push_back(0x10);append(b,message);finish(b);for(auto& p:peers)if(p.pid && !p.closing && std::find(recipients.begin(),recipients.end(),p.pid)!=recipients.end())enqueue(p,b);if(std::find(recipients.begin(),recipients.end(),1)!=recipients.end()){if(chat.size()>=200)chat.erase(chat.begin());chat.push_back({sender,std::string(message)});}return true;}
    void downloadStatus(const Peer& p,std::uint8_t value){for(auto& slot:slots)if(slot.playerId==p.pid && slot.status==2 && !slot.computer){if(slot.download!=value){slot.download=value;announceSlots();}return;}}
    void mapState(Peer& p,const std::uint8_t* data,size_t n){
        if(n!=13 || read32(data+4)!=1 || (data[8]!=1 && data[8]!=3)){p.dead=true;return;}auto size=read32(data+9);
        if(data[8]==1 && size==settings.map.size){p.mapReady=true;p.mapRequested=false;p.downloadActive=false;downloadStatus(p,100);return;}
        p.mapReady=false;p.mapRequested=true;if(!settings.mapBytes){downloadStatus(p,0);return;}
        if(data[8]==1){if(!p.downloadStarted){auto start=packet(0x3f);u32(start,1);start.push_back(1);finish(start);if(!enqueue(p,start))return;p.downloadStarted=true;p.mapSent=p.mapAcked=0;}downloadStatus(p,0);return;}
        if(!p.downloadStarted || size>p.mapSent){p.dead=true;return;}p.downloadActive=true;
    }
    void mapAck(Peer& p,const std::uint8_t* data,size_t n){
        if(n!=14 || data[4]!=p.pid || data[5]!=1 || read32(data+6)!=1){p.dead=true;return;}if(!p.downloadActive || !settings.mapBytes)return;auto offset=read32(data+10);
        if(offset<p.mapAcked)return;if(offset!=p.mapAcked || offset>=p.mapSent || offset>=settings.map.size){p.dead=true;return;}p.mapAcked+=std::min<std::uint32_t>(1442,settings.map.size-offset);auto percent=std::min<std::uint64_t>(99,std::uint64_t(p.mapAcked)*100/settings.map.size);downloadStatus(p,std::uint8_t(percent));
    }
    void sendMapParts(Peer& p){
        if(!p.downloadActive || p.dead || p.closing || !settings.mapBytes)return;constexpr std::uint32_t chunk=1442,window=chunk*32;
        for(unsigned pass=0;pass<8 && p.mapSent<settings.map.size && p.mapSent-p.mapAcked<window && p.output.size()-p.sent<32768;++pass){auto offset=p.mapSent;auto count=std::min<std::uint32_t>(chunk,settings.map.size-offset);auto* data=settings.mapBytes->data()+offset;auto part=packet(0x43);part.push_back(p.pid);part.push_back(1);u32(part,1);u32(part,offset);u32(part,crc32(data,count));part.insert(part.end(),data,data+count);finish(part);if(!enqueue(p,part))return;p.mapSent+=count;}
    }
    void join(Peer& p,const std::uint8_t* data,size_t n){if(n<30 || read32(data+4)!=hostCounter || read32(data+8)!=entryKey){reject(p,27);return;}size_t end=19;while(end<n && data[end] && end-19<=15)++end;if(end>=n || end-19>15 || n<end+11){reject(p,9);return;}std::string name(reinterpret_cast<const char*>(data+19),end-19);if(!safeText(name,15) || std::any_of(players.begin(),players.end(),[&](const LanPlayer& player){return _stricmp(player.name.c_str(),name.c_str())==0;})){reject(p,9);return;}auto slot=std::find_if(slots.begin(),slots.end(),[](const LanSlot& s){return s.status==0;});if(slot==slots.end()){reject(p,9);return;}std::uint8_t id=2;while(id<255 && std::any_of(players.begin(),players.end(),[&](const LanPlayer& v){return v.id==id;}))++id;if(id==255){reject(p,9);return;}p.pid=id;p.name=name;slot->playerId=id;slot->status=2;slot->computer=0;slot->download=0;players.push_back({id,name});enqueue(p,slotPacket(true,id,&p));for(auto& player:players)if(player.id!=id){std::uint32_t address=0;for(auto& q:peers)if(q.pid==player.id)address=q.address;enqueue(p,playerPacket(player.id,player.name,address));}broadcast(playerPacket(id,name,p.address),id);enqueue(p,mapPacket());announceSlots();}
    void process(Peer& p,const std::uint8_t* data,size_t n){if(!p.pid){if(loadPhase!=LanLoadPhase::Lobby){p.dead=true;return;}if(settings.experimentalHandshake && !p.handshakeVerified){if(n!=handshakePacket.size() || !std::equal(handshakePacket.begin(),handshakePacket.end(),data)){reject(p,9);return;}p.handshakeVerified=true;enqueue(p,handshakePacket);return;}if(data[1]!=0x1e){reject(p,9);return;}join(p,data,n);return;}if(loadPhase!=LanLoadPhase::Lobby && (data[1]==0x42 || data[1]==0x44 || data[1]==0x28))return;switch(data[1]){case 0x26:if(n<8 || n>1457 || !timeSlotsEnabled || loadPhase!=LanLoadPhase::Ready || read32(data+4)!=crc32(data+8,n-8)){p.dead=true;break;}if(!mismatch && !queueAction(p.pid,std::span<const std::uint8_t>(data+8,n-8)))p.dead=true;break;case 0x27:receiveChecksum(p,data,n);break;case 0x23:if(n!=4 || (loadPhase!=LanLoadPhase::Loading && loadPhase!=LanLoadPhase::Ready) || (loadPhase==LanLoadPhase::Loading && !markLoaded(p.pid)) || (loadPhase==LanLoadPhase::Ready && std::find(loadedPlayers.begin(),loadedPlayers.end(),p.pid)==loadedPlayers.end()))p.dead=true;break;case 0x21:if(n!=8)p.dead=true;else p.dead=true;break;case 0x46:if(n!=8)p.dead=true;break;case 0x42:mapState(p,data,n);break;case 0x44:mapAck(p,data,n);break;case 0x45:p.dead=true;break;case 0x28:{if(n<9){p.dead=true;break;}unsigned count=data[4];if(!count || count>24 || n<size_t(8)+count){p.dead=true;break;}auto sender=data[5+count],kind=data[6+count];if(sender!=p.pid){p.dead=true;break;}if(kind>=0x11 && kind<=0x14){if(n!=size_t(8)+count){p.dead=true;break;}changePlayerSlot(p.pid,kind,data[7+count]);break;}if(kind!=0x10)break;size_t at=7+count,end=at;while(end<n && data[end] && end-at<=254)++end;if(end>=n || end+1!=n || end-at>254){p.dead=true;break;}std::vector<std::uint8_t> targets;for(unsigned i=0;i<count;++i){auto id=data[5+i];if(std::any_of(players.begin(),players.end(),[&](const LanPlayer& v){return v.id==id;}) && std::find(targets.begin(),targets.end(),id)==targets.end())targets.push_back(id);}if(!targets.empty())chatMessage(p.pid,targets,std::string_view(reinterpret_cast<const char*>(data+at),end-at));break;}default:break;}}
    void poll(){if(!alive)return;auto now=Clock::now();if((loadPhase==LanLoadPhase::Countdown && now-loadStarted>std::chrono::seconds(30)) || (loadPhase==LanLoadPhase::Loading && now-loadStarted>std::chrono::minutes(5))){lastError="LAN loading barrier timed out";stop();return;}if(loadPhase==LanLoadPhase::Lobby)for(unsigned pass=0;pass<64;++pass){std::array<std::uint8_t,256> b{};sockaddr_in from{};int len=sizeof(from);int n=recvfrom(udp,reinterpret_cast<char*>(b.data()),int(b.size()),0,reinterpret_cast<sockaddr*>(&from),&len);if(n==SOCKET_ERROR){int err=WSAGetLastError();if(err==WSAEWOULDBLOCK)break;if(err==WSAECONNRESET || err==WSAEMSGSIZE)continue;lastError="LAN discovery receive failed: "+std::to_string(err);stop();return;}if(n!=16 || b[0]!=0xf7 || b[1]!=0x2f || read16(b.data()+2)!=16 || b[4]!='P' || b[5]!='X' || b[6]!='3' || b[7]!='W' || read32(b.data()+8)!=27)continue;auto info=gameInfo();sendto(udp,reinterpret_cast<const char*>(info.data()),int(info.size()),0,reinterpret_cast<sockaddr*>(&from),len);}
        if(loadPhase==LanLoadPhase::Lobby)for(unsigned pass=0;pass<12;++pass){sockaddr_in from{};int length=sizeof(from);SOCKET s=accept(tcp,reinterpret_cast<sockaddr*>(&from),&length);if(s==INVALID_SOCKET){auto err=WSAGetLastError();if(err==WSAEWOULDBLOCK)break;lastError="LAN host accept failed: "+std::to_string(err);stop();return;}u_long nb=1;if(peers.size()>=24 || ioctlsocket(s,FIONBIO,&nb)==SOCKET_ERROR){closesocket(s);continue;}Peer p;p.socket=s;p.address=from.sin_addr.s_addr;p.port=ntohs(from.sin_port);peers.push_back(std::move(p));}
        if(now>=nextPing){auto ping=packet(0x01);u32(ping,std::uint32_t(GetTickCount()));finish(ping);broadcast(ping);nextPing=now+std::chrono::seconds(5);}
        for(auto& p:peers){if(p.dead)continue;if(now-p.activity>(p.pid?(loadPhase==LanLoadPhase::Lobby?std::chrono::seconds(60):std::chrono::seconds(300)):std::chrono::seconds(15))){p.dead=true;continue;}for(unsigned pass=0;pass<16 && !p.closing;++pass){std::array<std::uint8_t,4096> b{};int n=recv(p.socket,reinterpret_cast<char*>(b.data()),int(b.size()),0);if(n==0){p.dead=true;break;}if(n==SOCKET_ERROR){int err=WSAGetLastError();if(err==WSAEWOULDBLOCK)break;p.dead=true;break;}p.activity=now;if(p.input.size()+size_t(n)>131072){p.dead=true;break;}p.input.insert(p.input.end(),b.begin(),b.begin()+n);}size_t offset=0;for(unsigned count=0;!p.dead && !p.closing && count<128 && p.input.size()-offset>=4;++count){auto* data=p.input.data()+offset;auto length=read16(data+2);if(data[0]!=0xf7 || length<4){p.dead=true;break;}if(p.input.size()-offset<length)break;process(p,data,length);offset+=length;}if(offset)p.input.erase(p.input.begin(),p.input.begin()+offset);sendMapParts(p);for(unsigned pass=0;!p.dead && pass<16 && p.sent<p.output.size();++pass){int n=send(p.socket,reinterpret_cast<const char*>(p.output.data()+p.sent),int(p.output.size()-p.sent),0);if(n==SOCKET_ERROR){int err=WSAGetLastError();if(err==WSAEWOULDBLOCK)break;p.dead=true;break;}if(!n)break;p.sent+=size_t(n);}if(p.sent==p.output.size()){p.output.clear();p.sent=0;if(p.closing)p.dead=true;}}
        for(;;){auto dead=std::find_if(peers.begin(),peers.end(),[](const Peer& p){return p.dead && (p.socket!=INVALID_SOCKET || p.pid);});if(dead==peers.end())break;remove(*dead);}std::erase_if(peers,[](const Peer& p){return p.dead;});if(barrierFailed)stop();
    }
};
LanHost::LanHost(LanHostSettings settings):impl_(std::make_unique<Impl>(std::move(settings))){}
LanHost::~LanHost()=default;
void LanHost::poll(){impl_->poll();}
void LanHost::cancel(){impl_->stop();}
bool LanHost::sendChat(std::string_view message){if(!impl_->alive)return false;std::vector<std::uint8_t> recipients;for(auto& p:impl_->players)recipients.push_back(p.id);return impl_->chatMessage(1,recipients,message);}
bool LanHost::setSlot(std::size_t index,const LanSlot& slot){return impl_->setSlot(index,slot);}
bool LanHost::beginCountdown(){return impl_->beginCountdown();}
bool LanHost::beginLoading(){return impl_->beginLoading();}
bool LanHost::reportHostLoaded(){return impl_->markLoaded(1);}
LanLoadPhase LanHost::loadPhase() const{return impl_->loadPhase;}
const std::vector<std::uint8_t>& LanHost::loadPlayers() const{return impl_->loadPlayers;}
const std::vector<std::uint8_t>& LanHost::loadedPlayers() const{return impl_->loadedPlayers;}
std::uint32_t LanHost::randomSeed() const{return impl_->randomSeed;}
const LanHostSettings& LanHost::settings() const{return impl_->settings;}
std::shared_ptr<const Bytes> LanHost::mapBytes() const{return impl_->settings.mapBytes;}
LanSessionSetup lanHostSessionSetup(const MapInfo& info,const LanHost& host) {
    if(!host.running() || !host.mapBytes())throw std::runtime_error("LAN host or map snapshot unavailable");LanSessionSetup setup;setup.slots=host.slots();setup.slotPlayerIds=lanHostSlotPlayerIds(info,setup.slots.size());setup.players=host.players();setup.localPeerId=1;setup.randomSeed=host.randomSeed();return setup;
}
bool LanHost::enableTimeSlotProtocol(){return impl_->enableTimeSlotProtocol();}
bool LanHost::submitHostAction(std::span<const std::uint8_t> action){return impl_->queueAction(1,action);}
bool LanHost::emitTimeSlot(std::uint16_t elapsedMs){return impl_->emitTimeSlot(elapsedMs);}
std::optional<LanTimeSlot> LanHost::takeTimeSlot(){return impl_->takeTimeSlot();}
bool LanHost::submitHostChecksum(std::uint32_t checksum){return impl_->submitHostChecksum(checksum);}
std::optional<LanChecksumMismatch> LanHost::checksumMismatch() const{return impl_->mismatch;}
bool LanHost::playerReportsMapReady(std::uint8_t id) const{if(!impl_->alive || !id)return false;if(id==1)return true;auto peer=std::find_if(impl_->peers.begin(),impl_->peers.end(),[&](const Impl::Peer& p){return p.pid==id && !p.dead && !p.closing;});return peer!=impl_->peers.end() && peer->mapReady;}
bool LanHost::playerRequestsMap(std::uint8_t id) const{if(!impl_->alive || id<=1)return false;auto peer=std::find_if(impl_->peers.begin(),impl_->peers.end(),[&](const Impl::Peer& p){return p.pid==id && !p.dead && !p.closing;});return peer!=impl_->peers.end() && peer->mapRequested;}
const std::vector<LanSlot>& LanHost::slots() const{return impl_->slots;}
const std::vector<LanPlayer>& LanHost::players() const{return impl_->players;}
const std::vector<LanChatMessage>& LanHost::chat() const{return impl_->chat;}
const std::string& LanHost::error() const{return impl_->lastError;}
bool LanHost::running() const{return impl_->alive;}
}
