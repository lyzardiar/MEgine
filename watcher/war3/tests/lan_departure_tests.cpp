// Author: MiYu. Focused local transport check for ordered departures and checksum backpressure.
#include <winsock2.h>
#include "lan_actions.h"
#include "lan_discovery.h"
#include "lan_host.h"
#include "lan_join.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string_view>
#include <thread>
using namespace war3;
namespace {
void requireJoin(bool ok,const char* text){if(!ok)throw std::runtime_error(text);}
struct TestSocket {
    SOCKET handle;
    ~TestSocket(){if(handle!=INVALID_SOCKET)closesocket(handle);}
};
void joinBeforeClose(bool reject){
    struct Winsock {
        Winsock(){WSADATA data{};requireJoin(WSAStartup(MAKEWORD(2,2),&data)==0,"Winsock startup failed");}
        ~Winsock(){WSACleanup();}
    } winsock;
    TestSocket listener{socket(AF_INET,SOCK_STREAM,IPPROTO_TCP)};
    requireJoin(listener.handle!=INVALID_SOCKET,"Cannot create rejection listener");
    sockaddr_in address{};address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    requireJoin(bind(listener.handle,reinterpret_cast<const sockaddr*>(&address),sizeof(address))==0 && listen(listener.handle,1)==0,"Cannot listen for rejection test");
    int size=sizeof(address);requireJoin(getsockname(listener.handle,reinterpret_cast<sockaddr*>(&address),&size)==0,"Cannot find rejection listener port");
    LanGame game;game.address="127.0.0.1";game.port=ntohs(address.sin_port);
    LanJoin join(game,"Test");
    fd_set readable;FD_ZERO(&readable);FD_SET(listener.handle,&readable);timeval timeout{3,0};
    requireJoin(select(0,&readable,nullptr,nullptr,&timeout)==1,"Client did not connect to rejection listener");
    TestSocket peer{accept(listener.handle,nullptr,nullptr)};
    requireJoin(peer.handle!=INVALID_SOCKET,"Cannot accept rejection test client");
    if(reject){
        constexpr std::array<std::uint8_t,8> packet{0xf7,0x05,8,0,9,0,0,0};
        requireJoin(send(peer.handle,reinterpret_cast<const char*>(packet.data()),int(packet.size()),0)==int(packet.size()),"Cannot send join rejection");
    }
    requireJoin(shutdown(peer.handle,SD_SEND)==0,"Cannot close rejection test write stream");
    const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
    while(join.state()==LanJoinState::Connecting || join.state()==LanJoinState::Joining){
        requireJoin(std::chrono::steady_clock::now()<deadline,"Join did not observe TCP close");
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        join.poll();
    }
    if(reject)requireJoin(join.state()==LanJoinState::Rejected && join.rejectionCode()==9,"Join rejection was lost before TCP close");
    else requireJoin(join.state()==LanJoinState::Closed && join.rejectionCode()==0,"Bare TCP close should report Closed");
}
}
int main(int argc,char** argv){
    try{
        if(argc==2 && std::string_view(argv[1])=="join-close"){
            joinBeforeClose(false);joinBeforeClose(true);
            std::cout<<"PASS bare_close_and_join_rejection_before_close\nRESULT passed=2 failed=0\n";return 0;
        }
        auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};LanHostSettings settings;settings.gameName="M3LeaveTest";settings.playerName="Host";settings.mapPath="Maps\\test.w3x";settings.map.size=1;settings.map.info=2;settings.map.crc=3;settings.width=64;settings.height=64;settings.experimentalHandshake=true;settings.slots.resize(3);for(unsigned i=0;i<3;++i){settings.slots[i].team=std::uint8_t(i);settings.slots[i].color=std::uint8_t(i);settings.slots[i].race=1;settings.slots[i].handicap=100;}LanHost host(settings);LanDiscovery discovery;discovery.refresh();std::unique_ptr<LanJoin> first,second;
        auto tick=[&]{host.poll();discovery.poll();if(first)first->poll();if(second)second->poll();};auto wait=[&](const std::function<bool()>& done,const char* message){auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(15);while(!done()){tick();if(std::chrono::steady_clock::now()>limit)throw std::runtime_error(message);std::this_thread::sleep_for(std::chrono::milliseconds(1));}};
        auto ownGame=[&]{return std::find_if(discovery.games().begin(),discovery.games().end(),[&](const LanGame& game){return game.name==settings.gameName && game.address=="127.0.0.1";});};wait([&]{return ownGame()!=discovery.games().end();},"LAN discovery timed out");auto game=*ownGame();first=std::make_unique<LanJoin>(game,"First");second=std::make_unique<LanJoin>(game,"Second");require(first->enableExperimentalHandshake() && second->enableExperimentalHandshake(),"Cannot enable LAN handshake");wait([&]{return first->state()==LanJoinState::Lobby && second->state()==LanJoinState::Lobby && first->mapCheck().received && second->mapCheck().received;},"LAN joining timed out");auto leaving=second->localPlayerId();require(leaving>1 && first->reportMapReady(settings.map) && second->reportMapReady(settings.map) && first->enableLoadingProtocol() && second->enableLoadingProtocol(),"Cannot prepare LAN loading");wait([&]{return host.playerReportsMapReady(first->localPlayerId()) && host.playerReportsMapReady(leaving);},"LAN map readiness timed out");require(host.beginCountdown(),"Cannot start LAN countdown");wait([&]{return first->loadPhase()==LanLoadPhase::Countdown && second->loadPhase()==LanLoadPhase::Countdown;},"LAN countdown timed out");require(first->enableTimeSlotProtocol() && second->enableTimeSlotProtocol() && host.beginLoading() && host.enableTimeSlotProtocol(),"Cannot enable LAN time slots");wait([&]{return first->loadPhase()==LanLoadPhase::Loading && second->loadPhase()==LanLoadPhase::Loading;},"LAN loading did not start");require(host.reportHostLoaded() && first->reportLocalLoaded() && second->reportLocalLoaded(),"Cannot report LAN loaded");wait([&]{return host.loadPhase()==LanLoadPhase::Ready && first->loadPhase()==LanLoadPhase::Ready && second->loadPhase()==LanLoadPhase::Ready;},"LAN ready barrier timed out");
        for(unsigned round=0;round<256;++round){wait([&]{return host.emitTimeSlot(32);},"LAN time slot emission timed out");require(host.takeTimeSlot().has_value() && host.submitHostChecksum(round),"Host checksum rejected");std::optional<LanTimeSlot> a,b;wait([&]{if(!a)a=first->takeTimeSlot();if(!b)b=second->takeTimeSlot();return a && b;},"LAN time slot receive timed out");require(first->sendChecksum(round),"Survivor checksum rejected");tick();}require(!host.emitTimeSlot(32),"Checksum backlog did not reach the expected limit");std::vector<std::uint8_t> largeAction(1400,0x01);for(unsigned i=0;i<50;++i){require(second->sendAction(largeAction),"Cannot queue overflow action");second->poll();host.poll();}std::array<std::uint8_t,1> action{0x01};require(second->sendAction(action) && second->requestLeave() && second->requestLeave() && !second->sendAction(action) && second->sendChecksum(999),"Leave request did not preserve output ordering or block later input");second->poll();unsigned received=0,frames=0;bool departed=false;while(!departed && frames<4){wait([&]{return host.emitTimeSlot(32);},"Departure did not unblock checksum progress");auto local=host.takeTimeSlot();require(local.has_value(),"Host departure frame missing");std::optional<LanTimeSlot> remote,leaver;wait([&]{if(!remote)remote=first->takeTimeSlot();if(!leaver)leaver=second->takeTimeSlot();return remote && leaver;},"Clients did not receive departure frame");require(remote->actions.size()==local->actions.size() && leaver->actions.size()==local->actions.size(),"Client action count differs");for(size_t i=0;i<local->actions.size();++i){auto& entry=local->actions[i];require(remote->actions[i].playerId==entry.playerId && remote->actions[i].bytes==entry.bytes && leaver->actions[i].playerId==entry.playerId && leaver->actions[i].bytes==entry.bytes,"Client action differs");if(entry.playerId==leaving){require(!departed && (entry.bytes==largeAction || entry.bytes==std::vector<std::uint8_t>{0x01}),"Pre-departure action order differs");++received;}else{auto events=decodeLanActions(entry.bytes,true);require(entry.playerId==1 && events.size()==1 && std::get<LanActionExperimentalLeave>(events[0]).peer==leaving && received==51,"Ordered departure action missing or premature");departed=true;}}++frames;}require(departed && received==51 && host.running() && first->loadPhase()==LanLoadPhase::Ready,"Overflow or survivor departure failed");second->cancel();wait([&]{return host.players().size()==2;},"Acknowledged leaver did not disconnect");wait([&]{return host.emitTimeSlot(32);},"Survivor did not continue after graceful leave");auto following=host.takeTimeSlot();require(following && following->actions.empty(),"Acknowledged leave was emitted twice");std::cout<<"PASS local_transport_graceful_departure_checksum_and_overflow\nRESULT passed=1 failed=0\n";return 0;
    }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<"\n";return 1;}
}
