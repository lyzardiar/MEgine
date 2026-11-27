// Author: MiYu. Focused local transport check for ordered departures and checksum backpressure.
#include <winsock2.h>
#include "lan_actions.h"
#include "lan_address.h"
#include "lan_discovery.h"
#include "lan_handshake.h"
#include "lan_host.h"
#include "lan_join.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <functional>
#include <iostream>
#include <memory>
#include <span>
#include <stdexcept>
#include <string_view>
#include <thread>
#include <vector>
using namespace war3;
namespace {
void requireJoin(bool ok,const char* text){if(!ok)throw std::runtime_error(text);}
void discoveryAddress(){
    auto loopback=parseLanDiscoveryAddress("127.0.0.1");
    auto privateAddress=parseLanDiscoveryAddress("192.168.1.10");
    requireJoin(loopback && *loopback==htonl(INADDR_LOOPBACK) && privateAddress && *privateAddress==htonl(0xc0a8010a),"Valid LAN address did not parse in network byte order");
    constexpr std::array invalid{"","0.0.0.0","0.1.2.3","127.0.0.256","224.0.0.1","240.0.0.1","255.255.255.255",
                                 "localhost","::1","127.0.0.1:6112","127.0.0.1/8","127.0.0,1","127.0.0.1."," 127.0.0.1"};
    for(auto candidate:invalid)requireJoin(!parseLanDiscoveryAddress(candidate),"Invalid LAN address accepted");
    requireJoin(!parseLanDiscoveryAddress(std::string_view("127.0.0.1\0x",11)),"A LAN address with an embedded NUL was accepted");
}
struct TestSocket {
    SOCKET handle;
    ~TestSocket(){if(handle!=INVALID_SOCKET)closesocket(handle);}
};
void joinBeforeClose(std::span<const std::uint8_t> suffix,LanJoinState expected,unsigned precedingPings=0,LanHandshakeFailure expectedHandshake=LanHandshakeFailure::None){
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
    if(expectedHandshake!=LanHandshakeFailure::None)requireJoin(join.enableExperimentalHandshake(),"Cannot enable verification for join test");
    fd_set readable;FD_ZERO(&readable);FD_SET(listener.handle,&readable);timeval timeout{3,0};
    requireJoin(select(0,&readable,nullptr,nullptr,&timeout)==1,"Client did not connect to rejection listener");
    TestSocket peer{accept(listener.handle,nullptr,nullptr)};
    requireJoin(peer.handle!=INVALID_SOCKET,"Cannot accept rejection test client");
    if(!suffix.empty()){
        constexpr std::array<std::uint8_t,8> ping{0xf7,0x01,8,0,0,0,0,0};
        std::vector<std::uint8_t> stream;
        for(unsigned i=0;i<precedingPings;++i)stream.insert(stream.end(),ping.begin(),ping.end());
        stream.insert(stream.end(),suffix.begin(),suffix.end());
        requireJoin(send(peer.handle,reinterpret_cast<const char*>(stream.data()),int(stream.size()),0)==int(stream.size()),"Cannot send join test packets");
    }
    const bool waitForTimeout=expectedHandshake==LanHandshakeFailure::TimedOut;
    if(!waitForTimeout)requireJoin(shutdown(peer.handle,SD_SEND)==0,"Cannot close rejection test write stream");
    const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(waitForTimeout?18:3);
    while(join.state()==LanJoinState::Connecting || join.state()==LanJoinState::Joining){
        requireJoin(std::chrono::steady_clock::now()<deadline,"Join did not observe TCP close");
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        join.poll();
    }
    requireJoin(join.state()==expected,"Unexpected join state after TCP close");
    requireJoin(join.handshakeFailure()==expectedHandshake,"Unexpected LAN verification failure");
    if(expected==LanJoinState::Rejected)requireJoin(join.rejectionCode()==9,"Join rejection code was lost before TCP close");
    if(expected==LanJoinState::Error && expectedHandshake==LanHandshakeFailure::None)requireJoin(join.error()=="Invalid LAN packet header","Invalid final header was not reported");
    if(expectedHandshake!=LanHandshakeFailure::None)requireJoin(!join.localPlayerId() && !join.mapCheck().received,"Verification failure assigned a seat or announced a map");
}
void discoveryCapacity(){
    LanHostSettings settings;settings.loopbackOnly=true;
    settings.gameName="CapacityTest";settings.playerName="Host";settings.mapPath="Maps\\test.w3x";
    settings.width=64;settings.height=64;settings.map.size=1;settings.slots.resize(4);
    for(unsigned i=0;i<settings.slots.size();++i){settings.slots[i].team=std::uint8_t(i);settings.slots[i].color=std::uint8_t(i);settings.slots[i].race=1;settings.slots[i].handicap=100;}
    settings.slots[2].status=2;settings.slots[2].computer=1;settings.slots[3].status=1;
    LanHost host(settings);
    TestSocket request{socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP)};
    requireJoin(request.handle!=INVALID_SOCKET,"Cannot create discovery test socket");
    sockaddr_in destination{};destination.sin_family=AF_INET;destination.sin_addr.s_addr=htonl(INADDR_LOOPBACK);destination.sin_port=htons(6112);
    auto expect=[&](unsigned used,unsigned capacity){
        constexpr std::array<std::uint8_t,16> search{0xf7,0x2f,16,0,'P','X','3','W',27,0,0,0,0,0,0,0};
        requireJoin(sendto(request.handle,reinterpret_cast<const char*>(search.data()),int(search.size()),0,reinterpret_cast<const sockaddr*>(&destination),sizeof(destination))==int(search.size()),"Cannot send discovery request");
        const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
        for(;;){
            host.poll();fd_set readable;FD_ZERO(&readable);FD_SET(request.handle,&readable);timeval timeout{0,10000};
            const auto result=select(0,&readable,nullptr,nullptr,&timeout);
            requireJoin(result>=0 && std::chrono::steady_clock::now()<deadline,"Discovery response did not arrive");
            if(result==1)break;
        }
        std::array<std::uint8_t,4096> packet{};const auto size=recv(request.handle,reinterpret_cast<char*>(packet.data()),int(packet.size()),0);
        requireJoin(size>=22,"Discovery response is truncated");
        auto field=[&](int offset){const auto* data=packet.data()+size-22+offset;return std::uint32_t(data[0])|std::uint32_t(data[1])<<8|std::uint32_t(data[2])<<16|std::uint32_t(data[3])<<24;};
        requireJoin(field(0)==4 && field(8)==used && field(12)==capacity,"Discovery wire counts do not match occupied human seats and capacity");
        auto game=parseLanGameInfo(std::span(packet).first(std::size_t(size)),"127.0.0.1");
        requireJoin(game && game->slotsTotal==4 && game->slotsAvailable==capacity,"Discovery did not retain the advertised slot count");
        return *game;
    };
    const auto open=expect(1,2);
    auto closed=settings.slots[1];closed.status=1;
    requireJoin(host.setSlot(1,closed),"Cannot close discovery test slot");expect(1,1);
    requireJoin(host.setSlot(1,settings.slots[1]),"Cannot reopen discovery test slot");
    LanJoin guest(open,"Guest");const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
    while(guest.state()!=LanJoinState::Lobby){
        requireJoin((guest.state()==LanJoinState::Connecting || guest.state()==LanJoinState::Joining) && std::chrono::steady_clock::now()<deadline,"Discovery guest did not join");
        host.poll();guest.poll();std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    expect(2,2);
}
void joinRejectionReasons(bool sameBuild,std::string expectedCommonDigest={}){
    LanHostSettings settings;settings.gameName="JoinRejectionTest";settings.playerName="Host";settings.mapPath="Maps\\test.w3x";settings.map.size=1;settings.width=64;settings.height=64;settings.loopbackOnly=true;settings.experimentalHandshake=sameBuild;settings.slots.resize(2);
    settings.commonDigest=std::move(expectedCommonDigest);
    for(unsigned i=0;i<settings.slots.size();++i){settings.slots[i].team=std::uint8_t(i);settings.slots[i].color=std::uint8_t(i);settings.slots[i].race=1;settings.slots[i].handicap=100;}
    LanHost host(settings);LanDiscovery discovery(true,LanDiscovery::defaultVersion,"127.0.0.1");discovery.refresh();
    auto wait=[&](auto done,const char* failure){
        auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
        while(!done()){requireJoin(std::chrono::steady_clock::now()<deadline,failure);host.poll();std::this_thread::sleep_for(std::chrono::milliseconds(1));}
    };
    wait([&]{discovery.poll();return !discovery.games().empty();},"Join rejection test room was not discovered");
    auto room=discovery.games().front();requireJoin(room.name==settings.gameName,"Unexpected join rejection test room");
    auto connect=[&](const char* name,LanJoinState expected,std::optional<std::string> commonDigest={}){
        auto peer=std::make_unique<LanJoin>(room,name);
        if(sameBuild)requireJoin(peer->enableExperimentalHandshake(commonDigest.value_or(settings.commonDigest)),"Cannot start join rejection test handshake");
        wait([&]{peer->poll();return peer->state()!=LanJoinState::Connecting && peer->state()!=LanJoinState::Joining;},"Join rejection test connection did not finish");
        requireJoin(peer->state()==expected,"Join rejection test reached an unexpected state");return peer;
    };
    if(!settings.commonDigest.empty()){
        auto different=connect("Different",LanJoinState::Error,std::string(64,'b'));
        requireJoin(different->handshakeFailure()==LanHandshakeFailure::ResourcesMismatch && !different->localPlayerId() && !different->mapCheck().received,"Resource mismatch was not refused before joining");
        requireJoin(host.players().size()==1,"Resource mismatch reserved a seat");
        auto unchecked=connect("Unchecked",LanJoinState::Rejected,std::string{});
        requireJoin(!unchecked->localPlayerId() && !unchecked->mapCheck().received && host.players().size()==1,"Skipping the resource exchange bypassed the host gate");
    }
    auto duplicate=connect("hOsT",LanJoinState::Rejected);
    requireJoin(duplicate->rejectionCode()==(sameBuild?lanRejectNameInUse:9) && host.players().size()==1,"Duplicate name rejection or seat allocation differs");
    auto renamed=connect("Renamed",LanJoinState::Lobby);
    requireJoin(host.players().size()==2,"Renamed player did not take the seat");
    auto full=connect("Waiting",LanJoinState::Rejected);
    requireJoin(full->rejectionCode()==(sameBuild?lanRejectRoomFull:9) && host.players().size()==2,"Full room rejection or seat allocation differs");
    renamed->cancel();wait([&]{return host.players().size()==1;},"Departing player did not release the seat");
    auto retry=connect("Waiting",LanJoinState::Lobby);
    requireJoin(host.players().size()==2,"Retry did not take the released seat");
}
struct CountdownRoom {
    static LanHostSettings settings(bool sameBuild,bool fixedTeams){
        LanHostSettings settings;settings.gameName="CountdownTest";settings.playerName="Host";settings.mapPath="Maps\\test.w3x";settings.map.size=1;settings.width=64;settings.height=64;settings.loopbackOnly=true;settings.experimentalHandshake=sameBuild;settings.slots.resize(fixedTeams?4:3);
        if(fixedTeams)settings.mapOptions=0x40;
        if(sameBuild)settings.commonDigest=std::string(64,'a');
        for(unsigned i=0;i<settings.slots.size();++i){settings.slots[i].team=std::uint8_t(i);settings.slots[i].color=std::uint8_t(i);settings.slots[i].race=1;settings.slots[i].handicap=100;}
        return settings;
    }
    LanHost host;
    LanDiscovery discovery{true,LanDiscovery::defaultVersion,"127.0.0.1"};
    LanGame game;
    std::vector<std::unique_ptr<LanJoin>> guests;

    explicit CountdownRoom(bool sameBuild=true,bool fixedTeams=false) : host(settings(sameBuild,fixedTeams)) {
        discovery.refresh();wait([&]{return !discovery.games().empty();},"Countdown room was not discovered");
        game=discovery.games().front();requireJoin(game.name==host.settings().gameName,"Unexpected countdown test room");
    }
    void wait(const std::function<bool()>& done,const char* failure){
        auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
        while(!done()){
            requireJoin(std::chrono::steady_clock::now()<deadline,failure);
            host.poll();discovery.poll();for(auto& guest:guests)guest->poll();std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }
    LanJoin& addGuest(const char* name){
        guests.push_back(std::make_unique<LanJoin>(game,name));auto& guest=*guests.back();
        if(host.settings().experimentalHandshake)requireJoin(guest.enableExperimentalHandshake(host.settings().commonDigest),"Cannot enable countdown test handshake");
        wait([&]{return guest.state()==LanJoinState::Lobby && guest.mapCheck().received;},"Countdown guest did not join and receive the map check");
        requireJoin(guest.reportMapReady(host.settings().map) && guest.enableLoadingProtocol(),"Countdown guest could not report readiness");
        wait([&]{return host.playerReportsMapReady(guest.localPlayerId());},"Countdown guest was not ready on the host");return guest;
    }
};
void countdownLobbyChat() {
    CountdownRoom room(true,true);auto& host=room.host;auto& first=room.addGuest("First");auto& second=room.addGuest("Second");
    const auto firstId=first.localPlayerId();
    const auto currentTeam=[&](const auto& participant){
        const auto& slots=participant.slots();
        auto found=std::find_if(slots.begin(),slots.end(),[&](const auto& slot){return slot.playerId==firstId;});
        requireJoin(found!=slots.end(),"First no longer has a slot");
        return found->team;
    };
    constexpr std::uint8_t targetTeam=3;
    const auto originalTeam=currentTeam(host);
    requireJoin(originalTeam!=targetTeam && first.requestSlotChange(0x11,targetTeam),"Could not request the open fixed-team seat");
    room.wait([&]{return currentTeam(host)==targetTeam && currentTeam(first)==targetTeam;},"Fixed-team move did not work in the normal lobby");
    requireJoin(first.requestSlotChange(0x11,originalTeam),"Could not restore the original lobby seat");
    room.wait([&]{return currentTeam(host)==originalTeam && currentTeam(first)==originalTeam;},"Original lobby seat was not restored");

    requireJoin(host.beginCountdown() && first.loadPhase()==LanLoadPhase::Lobby,"Could not stage a pre-countdown slot request");
    requireJoin(first.requestSlotChange(0x11,targetTeam),"First could not queue a slot change before receiving countdown");
    first.poll();
    const auto countingDown=[&]{return host.running() && host.loadPhase()==LanLoadPhase::Countdown
        && first.loadPhase()==LanLoadPhase::Countdown && second.loadPhase()==LanLoadPhase::Countdown;};
    room.wait(countingDown,"Countdown did not reach both guests");
    requireJoin(currentTeam(host)==originalTeam && currentTeam(first)==originalTeam && currentTeam(second)==originalTeam,
                "Late fixed-team slot request changed the countdown lineup");
    const auto preservedSlot=std::find_if(host.slots().begin(),host.slots().end(),[&](const auto& slot){return slot.team==targetTeam;});
    requireJoin(preservedSlot!=host.slots().end() && preservedSlot->status==0,
                "The target seat was no longer empty during countdown");
    std::cout<<"PASS countdown preserved the existing fixed-team slot guard\n";

    const auto received=[](const auto& participant,std::uint8_t sender,std::string_view name,std::string_view text){
        const auto& history=participant.chat();
        return std::count_if(history.begin(),history.end(),[&](const auto& entry){
            return entry.sender==sender && entry.senderName==name && entry.text==text;
        })==1;
    };
    constexpr std::string_view hostMessage="Host countdown message";
    requireJoin(host.sendChat(hostMessage),"Host chat failed to queue during countdown");
    room.wait([&]{return received(first,1,"Host",hostMessage) && received(second,1,"Host",hostMessage);},
              "Host countdown chat did not reach both guests");
    requireJoin(countingDown(),"Countdown ended before the guest sent chat");
    std::cout<<"PASS host chat reached both guests during countdown\n";

    constexpr std::string_view guestMessage="来客倒计时消息 QA-GUEST";
    requireJoin(first.sendChat(guestMessage),"Guest countdown chat unexpectedly failed to queue");
    const auto guestDelivered=[&]{return received(host,firstId,"First",guestMessage)
        && received(first,firstId,"First",guestMessage) && received(second,firstId,"First",guestMessage);};
    try{room.wait(guestDelivered,"countdown guest message not delivered on existing TCP connections");}
    catch(const std::runtime_error&){
        const auto copies=[&](const auto& participant){return std::count_if(participant.chat().begin(),participant.chat().end(),
            [&](const auto& line){return line.text==guestMessage;});};
        std::cerr<<"Guest countdown message copies: host="<<copies(host)<<" first="<<copies(first)<<" second="<<copies(second)<<"\n";
        throw;
    }
    requireJoin(countingDown() && currentTeam(host)==originalTeam,"Guest chat changed the countdown phase or lineup");
    std::cout<<"PASS guest countdown chat delivered once to host and both guests with sender attribution\n";

    requireJoin(host.cancelCountdown(),"Could not cancel the countdown after chat");
    room.wait([&]{return first.loadPhase()==LanLoadPhase::Lobby && second.loadPhase()==LanLoadPhase::Lobby;},
              "Both guests did not return to the lobby");
    constexpr std::string_view afterCancel="Guest lobby message after countdown";
    requireJoin(first.sendChat(afterCancel),"Guest could not send after countdown cancel");
    room.wait([&]{return received(host,firstId,"First",afterCancel) && received(first,firstId,"First",afterCancel)
        && received(second,firstId,"First",afterCancel);},"Guest lobby chat was lost after countdown cancel");
    requireJoin(guestDelivered(),"The guest countdown message was duplicated");
    requireJoin(host.players().size()==3 && host.playerReportsMapReady(firstId) && first.localPlayerId()==firstId
        && first.countdownCancelReason()==LanCountdownCancelReason::Manual,"Countdown cancel consumed the original connection or readiness");
    std::cout<<"PASS existing lobby connection resumed ordinary chat after cancellation\n";
}

void countdownCancellation(){
    CountdownRoom room;auto& host=room.host;auto& first=room.addGuest("First");auto& second=room.addGuest("Second");
    const auto seed=host.randomSeed();const auto firstId=first.localPlayerId(),secondId=second.localPlayerId();
    auto start=[&](LanJoin& other){
        requireJoin(host.beginCountdown(),"Host could not start countdown");
        room.wait([&]{return first.loadPhase()==LanLoadPhase::Countdown && other.loadPhase()==LanLoadPhase::Countdown;},"Guests did not receive countdown");
        requireJoin(!first.countdownCancelReason() && !other.countdownCancelReason(),"New countdown retained an old cancellation reason");
    };
    requireJoin(!host.cancelCountdown(),"Host cancelled a countdown that was not running");start(second);
    requireJoin(host.cancelCountdown(),"Host could not cancel countdown manually");
    room.wait([&]{return first.loadPhase()==LanLoadPhase::Lobby && second.loadPhase()==LanLoadPhase::Lobby;},"Manual cancellation did not return both guests to the lobby");
    requireJoin(first.countdownCancelReason()==LanCountdownCancelReason::Manual && second.countdownCancelReason()==LanCountdownCancelReason::Manual,"Guests did not receive the manual cancellation reason");
    requireJoin(host.running() && host.loadPhase()==LanLoadPhase::Lobby && host.loadPlayers().empty() && host.loadedPlayers().empty() && !host.beginLoading(),"Manual cancellation left an active loading attempt");
    requireJoin(host.players().size()==3 && host.playerReportsMapReady(firstId) && host.playerReportsMapReady(secondId) && first.randomSeed()==seed && second.randomSeed()==seed,"Manual cancellation changed the lineup, readiness or seed");
    std::cout<<"PASS countdown_manual_cancellation\n";

    start(second);second.cancel();
    room.wait([&]{return host.loadPhase()==LanLoadPhase::Lobby && first.loadPhase()==LanLoadPhase::Lobby && first.players().size()==2 && std::none_of(first.slots().begin(),first.slots().end(),[&](const LanSlot& slot){return slot.playerId==secondId;});},"Departing during countdown did not reopen the seat for the surviving guest");
    requireJoin(first.state()==LanJoinState::Lobby && first.countdownCancelReason()==LanCountdownCancelReason::Departure && first.localPlayerId()==firstId && first.randomSeed()==seed,"Departure changed the surviving connection or reported the wrong reason");
    requireJoin(host.running() && host.players().size()==2 && host.playerReportsMapReady(firstId) && !host.playerReportsMapReady(secondId) && host.loadPlayers().empty(),"Departure left stale participants on the host");
    auto& replacement=room.addGuest("Replacement");requireJoin(replacement.localPlayerId()==secondId && replacement.randomSeed()==seed,"Replacement could not reuse the original room seat and seed");
    start(replacement);
    requireJoin(host.beginLoading() && !host.cancelCountdown() && host.enableTimeSlotProtocol(),"Host did not keep the new loading attempt after the countdown boundary");
    room.wait([&]{return first.loadPhase()==LanLoadPhase::Loading && replacement.loadPhase()==LanLoadPhase::Loading;},"Guests did not reach loading after restarting");
    requireJoin(first.enableTimeSlotProtocol() && replacement.enableTimeSlotProtocol() && host.reportHostLoaded() && first.reportLocalLoaded() && replacement.reportLocalLoaded(),"Restarted guests could not enter the loading barrier");
    room.wait([&]{return host.loadPhase()==LanLoadPhase::Ready && first.loadPhase()==LanLoadPhase::Ready && replacement.loadPhase()==LanLoadPhase::Ready;},"Restarted countdown did not reach ready on all three seats");
    requireJoin(host.emitTimeSlot(32),"Restarted match did not emit its first time slot");
    std::optional<LanTimeSlot> firstFrame,replacementFrame;
    room.wait([&]{if(!firstFrame)firstFrame=first.takeTimeSlot();if(!replacementFrame)replacementFrame=replacement.takeTimeSlot();return firstFrame && replacementFrame;},"Restarted guests did not receive their first time slot");
    requireJoin(firstFrame->elapsedMs==32 && replacementFrame->elapsedMs==32,"Restarted match time slots did not agree");
    std::cout<<"PASS countdown_departure_and_restart\n";
}
void countdownHostShutdown(bool sameBuild){
    CountdownRoom room(sameBuild);auto& guest=room.addGuest("Guest");
    requireJoin(room.host.beginCountdown(),"Host could not start shutdown test countdown");
    room.wait([&]{return guest.loadPhase()==LanLoadPhase::Countdown;},"Guest did not receive shutdown test countdown");
    if(!sameBuild)requireJoin(!room.host.cancelCountdown() && room.host.loadPhase()==LanLoadPhase::Countdown,"Classic host allowed a private countdown cancellation");
    room.host.cancel();room.wait([&]{return guest.state()!=LanJoinState::Lobby;},"Host shutdown did not close guest connection");
    requireJoin(!room.host.running() && guest.loadPhase()==LanLoadPhase::Failed && !guest.countdownCancelReason(),"Host shutdown was reported as a recoverable countdown cancellation");
}
void hostPauseAdmission(){
    CountdownRoom room;auto& host=room.host;auto& guest=room.addGuest("Guest");
    requireJoin(host.beginCountdown() && host.beginLoading() && host.enableTimeSlotProtocol(true),"Could not enable the live pause policy");
    room.wait([&]{return guest.loadPhase()==LanLoadPhase::Loading;},"Pause-policy guest did not enter loading");
    requireJoin(guest.enableTimeSlotProtocol() && host.reportHostLoaded() && guest.reportLocalLoaded(),"Could not report loaded in pause-policy room");
    room.wait([&]{return host.loadPhase()==LanLoadPhase::Ready && guest.loadPhase()==LanLoadPhase::Ready;},"Pause-policy room did not enter play");
    const auto hostPause=encodeLanActions(std::array<LanDecodedAction,1>{LanActionExperimentalHostPause{true}},true);
    const auto guestControls=encodeLanActions(std::array<LanDecodedAction,3>{LanActionMenu{LanCommandMenu::Build},LanActionPause{},LanActionResume{}},true);
    LanActionCacheSync store;store.opcode=0x6b;store.cache="cache";store.mission="mission";store.key="key";store.value=0x02ff01;
    const auto ordinary=encodeLanActions(std::array<LanDecodedAction,1>{store},true);
    requireJoin(guest.sendAction(hostPause) && guest.sendAction(guestControls) && guest.sendAction(ordinary) && host.submitHostAction(hostPause),"Could not send pause-policy actions");
    unsigned hostActions=0,guestActions=0;
    room.wait([&]{
        if(!host.emitTimeSlot(0))return false;
        auto slot=host.takeTimeSlot();requireJoin(bool(slot),"Missing pause-policy slot");
        for(const auto& action:slot->actions){
            if(action.playerId==1){requireJoin(action.bytes==hostPause,"Unexpected host pause action");++hostActions;}
            else{requireJoin(action.playerId==guest.localPlayerId() && action.bytes==ordinary,"A guest pause block reached the room");++guestActions;}
        }
        return hostActions==1 && guestActions==1;
    },"Host pause and ordinary guest action did not reach the room");
    requireJoin(host.running() && guest.state()==LanJoinState::Lobby && guest.loadPhase()==LanLoadPhase::Ready,"Guest pause attempt broke the live connection");
}
}
int main(int argc,char** argv){
    try{
        if(argc==2 && std::string_view(argv[1])=="join-close"){
            constexpr std::array<std::uint8_t,8> reject{0xf7,0x05,8,0,9,0,0,0};
            constexpr std::array<std::uint8_t,5> truncated{0xf7,0x05,8,0,9};
            constexpr std::array<std::uint8_t,5> badHeader{0,0x05,8,0,9};
            joinBeforeClose({},LanJoinState::Closed);joinBeforeClose(reject,LanJoinState::Rejected);joinBeforeClose(reject,LanJoinState::Rejected,256);
            joinBeforeClose(truncated,LanJoinState::Closed,256);joinBeforeClose(badHeader,LanJoinState::Error,256);
            std::cout<<"PASS bare_close_and_join_rejection_before_close\nRESULT passed=5 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="handshake-failures"){
            constexpr std::array<std::uint8_t,8> buildRejected{0xf7,0x05,8,0,3,0x4c,0x33,0x4d},oldRejected{0xf7,0x05,8,0,9,0,0,0};
            auto differentDigest=localLanHandshake();differentDigest[lanHandshakeHeaderSize]=differentDigest[lanHandshakeHeaderSize]=='0'?'1':'0';
            auto differentHeader=localLanHandshake();differentHeader[12]^=0x80;
            joinBeforeClose(buildRejected,LanJoinState::Error,0,LanHandshakeFailure::BuildMismatch);
            joinBeforeClose(differentDigest,LanJoinState::Error,0,LanHandshakeFailure::BuildMismatch);
            joinBeforeClose(oldRejected,LanJoinState::Error,0,LanHandshakeFailure::UnexpectedReply);
            joinBeforeClose(differentHeader,LanJoinState::Error,0,LanHandshakeFailure::UnexpectedReply);
            joinBeforeClose({},LanJoinState::Closed,0,LanHandshakeFailure::Interrupted);
            joinBeforeClose({},LanJoinState::Error,0,LanHandshakeFailure::TimedOut);
            std::cout<<"PASS same_build_handshake_failures\nRESULT passed=6 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="game-info-capacity"){
            discoveryCapacity();std::cout<<"PASS discovery_packet_human_capacity\nRESULT passed=1 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="discovery-address"){
            discoveryAddress();std::cout<<"PASS numeric_ipv4_discovery_address\nRESULT passed=1 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="join-reasons"){
            joinRejectionReasons(false);std::cout<<"PASS classic_join_rejections\n";
            joinRejectionReasons(true);std::cout<<"PASS same_build_join_rejections_and_retries\nRESULT passed=2 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="common-resources"){
            joinRejectionReasons(true,std::string(64,'a'));std::cout<<"PASS common_resource_mismatch\nPASS required_common_resource_exchange\nPASS matching_common_resources_and_retries\nRESULT passed=3 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="countdown-chat"){
            countdownLobbyChat();std::cout<<"RESULT passed=1 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="countdown-cancel"){
            countdownCancellation();
            countdownHostShutdown(true);std::cout<<"PASS countdown_host_shutdown\n";
            countdownHostShutdown(false);std::cout<<"PASS countdown_classic_behavior\nRESULT passed=4 failed=0\n";return 0;
        }
        if(argc==2 && std::string_view(argv[1])=="host-pause-admission"){
            hostPauseAdmission();std::cout<<"PASS live_host_pause_admission\nRESULT passed=1 failed=0\n";return 0;
        }
        auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};LanHostSettings settings;settings.gameName="M3LeaveTest";settings.playerName="Host";settings.mapPath="Maps\\test.w3x";settings.map.size=1;settings.map.info=2;settings.map.crc=3;settings.width=64;settings.height=64;settings.experimentalHandshake=true;settings.loopbackOnly=true;settings.slots.resize(3);for(unsigned i=0;i<3;++i){settings.slots[i].team=std::uint8_t(i);settings.slots[i].color=std::uint8_t(i);settings.slots[i].race=1;settings.slots[i].handicap=100;}LanHost host(settings);LanDiscovery discovery(true,LanDiscovery::defaultVersion,"127.0.0.1");discovery.refresh();std::unique_ptr<LanJoin> first,second;
        auto tick=[&]{host.poll();discovery.poll();if(first)first->poll();if(second)second->poll();};auto wait=[&](const std::function<bool()>& done,const char* message){auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(15);while(!done()){tick();if(std::chrono::steady_clock::now()>limit)throw std::runtime_error(message);std::this_thread::sleep_for(std::chrono::milliseconds(1));}};
        auto ownGame=[&]{return std::find_if(discovery.games().begin(),discovery.games().end(),[&](const LanGame& game){return game.name==settings.gameName && game.address=="127.0.0.1";});};wait([&]{return ownGame()!=discovery.games().end();},"LAN discovery timed out");auto game=*ownGame();first=std::make_unique<LanJoin>(game,"First");second=std::make_unique<LanJoin>(game,"Second");require(first->enableExperimentalHandshake() && second->enableExperimentalHandshake(),"Cannot enable LAN handshake");wait([&]{return first->state()==LanJoinState::Lobby && second->state()==LanJoinState::Lobby && first->mapCheck().received && second->mapCheck().received;},"LAN joining timed out");auto leaving=second->localPlayerId();require(leaving>1 && first->reportMapReady(settings.map) && second->reportMapReady(settings.map) && first->enableLoadingProtocol() && second->enableLoadingProtocol(),"Cannot prepare LAN loading");wait([&]{return host.playerReportsMapReady(first->localPlayerId()) && host.playerReportsMapReady(leaving);},"LAN map readiness timed out");require(host.beginCountdown(),"Cannot start LAN countdown");wait([&]{return first->loadPhase()==LanLoadPhase::Countdown && second->loadPhase()==LanLoadPhase::Countdown;},"LAN countdown timed out");require(first->enableTimeSlotProtocol() && second->enableTimeSlotProtocol() && host.beginLoading() && host.enableTimeSlotProtocol(),"Cannot enable LAN time slots");wait([&]{return first->loadPhase()==LanLoadPhase::Loading && second->loadPhase()==LanLoadPhase::Loading;},"LAN loading did not start");require(host.reportHostLoaded() && first->reportLocalLoaded() && second->reportLocalLoaded(),"Cannot report LAN loaded");wait([&]{return host.loadPhase()==LanLoadPhase::Ready && first->loadPhase()==LanLoadPhase::Ready && second->loadPhase()==LanLoadPhase::Ready;},"LAN ready barrier timed out");
        if(argc==2 && std::string_view(argv[1])=="game-end"){
            const std::vector<std::uint8_t> firstAction(1400,0x01),secondAction(1400,0x02);
            require(host.submitHostAction(firstAction) && host.submitHostAction(secondAction) && host.emitTimeSlot(100),"Cannot emit final fragmented slot");
            require(!host.beginGameEnd(),"Host ended before applying its final slot");
            auto final=host.takeTimeSlot();require(final && final->elapsedMs==100 && final->actions.size()==2 && host.submitHostChecksum(42),"Host final slot differs");
            require(host.beginGameEnd() && host.beginGameEnd() && !host.emitTimeSlot(100),"Host did not stop at its final slot");
            auto receiveEnd=[&](LanJoin& peer){
                auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
                while(peer.state()==LanJoinState::Lobby){require(std::chrono::steady_clock::now()<deadline,"Peer did not receive final slot and FIN");host.poll();peer.poll();std::this_thread::sleep_for(std::chrono::milliseconds(1));}
                require(peer.state()==LanJoinState::Closed && peer.gameStreamClosed(),"Peer did not observe a clean game stream close");
                auto slot=peer.takeTimeSlot();require(slot && slot->elapsedMs==final->elapsedMs && slot->actions.size()==final->actions.size(),"Peer lost the final slot when its TCP stream closed");
                for(size_t i=0;i<final->actions.size();++i)require(slot->actions[i].playerId==final->actions[i].playerId && slot->actions[i].bytes==final->actions[i].bytes,"Final slot actions changed in transit");
                require(!peer.takeTimeSlot(),"Peer received a slot after the final slot");
            };
            receiveEnd(*first);host.poll();require(!host.gameEndComplete(),"Host destroyed its second connection before that peer closed");
            receiveEnd(*second);wait([&]{return host.gameEndComplete();},"Host did not complete terminal drain");
            std::cout<<"PASS final_fragmented_slot_survives_fin_on_both_peers\nRESULT passed=1 failed=0\n";return 0;
        }
        for(unsigned round=0;round<256;++round){wait([&]{return host.emitTimeSlot(32);},"LAN time slot emission timed out");require(host.takeTimeSlot().has_value() && host.submitHostChecksum(round),"Host checksum rejected");std::optional<LanTimeSlot> a,b;wait([&]{if(!a)a=first->takeTimeSlot();if(!b)b=second->takeTimeSlot();return a && b;},"LAN time slot receive timed out");require(first->sendChecksum(round),"Survivor checksum rejected");tick();}require(!host.emitTimeSlot(32),"Checksum backlog did not reach the expected limit");std::vector<std::uint8_t> largeAction(1400,0x01);for(unsigned i=0;i<50;++i){require(second->sendAction(largeAction),"Cannot queue overflow action");second->poll();host.poll();}std::array<std::uint8_t,1> action{0x01};require(second->sendAction(action) && second->requestLeave() && second->requestLeave() && !second->sendAction(action) && second->sendChecksum(999),"Leave request did not preserve output ordering or block later input");second->poll();unsigned received=0,frames=0;bool departed=false;while(!departed && frames<4){wait([&]{return host.emitTimeSlot(32);},"Departure did not unblock checksum progress");auto local=host.takeTimeSlot();require(local.has_value(),"Host departure frame missing");std::optional<LanTimeSlot> remote,leaver;wait([&]{if(!remote)remote=first->takeTimeSlot();if(!leaver)leaver=second->takeTimeSlot();return remote && leaver;},"Clients did not receive departure frame");require(remote->actions.size()==local->actions.size() && leaver->actions.size()==local->actions.size(),"Client action count differs");for(size_t i=0;i<local->actions.size();++i){auto& entry=local->actions[i];require(remote->actions[i].playerId==entry.playerId && remote->actions[i].bytes==entry.bytes && leaver->actions[i].playerId==entry.playerId && leaver->actions[i].bytes==entry.bytes,"Client action differs");if(entry.playerId==leaving){require(!departed && (entry.bytes==largeAction || entry.bytes==std::vector<std::uint8_t>{0x01}),"Pre-departure action order differs");++received;}else{auto events=decodeLanActions(entry.bytes,true);require(entry.playerId==1 && events.size()==1 && std::get<LanActionExperimentalLeave>(events[0]).peer==leaving && received==51,"Ordered departure action missing or premature");departed=true;}}++frames;}require(departed && received==51 && host.running() && first->loadPhase()==LanLoadPhase::Ready,"Overflow or survivor departure failed");second->cancel();wait([&]{return host.players().size()==2;},"Acknowledged leaver did not disconnect");wait([&]{return host.emitTimeSlot(32);},"Survivor did not continue after graceful leave");auto following=host.takeTimeSlot();require(following && following->actions.empty(),"Acknowledged leave was emitted twice");std::cout<<"PASS local_transport_graceful_departure_checksum_and_overflow\nRESULT passed=1 failed=0\n";return 0;
    }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<"\n";return 1;}
}
