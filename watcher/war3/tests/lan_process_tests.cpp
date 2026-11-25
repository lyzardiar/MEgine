// Author: MiYu. Multi-process experimental LAN simulation checks on original maps.
#include "session.h"
#include "lan_host.h"
#include "lan_mapcheck.h"
#include "lan_discovery.h"
#include "lan_simulation.h"
#include "lan_setup.h"
#include "lan_local_identity.h"
#include "lan_long_match.h"
#include <bit>
#include <chrono>
#include <thread>
#include <iostream>
#include <fstream>
#include <memory>
#include <functional>
#include <cmath>
using namespace war3;
void need(bool x,const char* m){if(!x)throw std::runtime_error(m);}
int wmain(int argc,wchar_t** argv){try{
 need(argc>=5,"Usage: war3_lan_process_tests <host|peer|victim|guest> <data-root> <unique-id> <sync|abrupt|three|long> [match-map output-dir]");
 const std::wstring_view mode=argv[4],role=argv[1];
 const bool longMatch=mode==L"long",three=mode==L"three",abrupt=three || mode==L"abrupt",multi=three || longMatch;
 need((abrupt || longMatch || mode==L"sync") && argc==(longMatch?7:5),"Invalid mode or argument count");
 const bool hosting=role==L"host",victim=role==L"victim",guest=role==L"guest";
 need(hosting || role==L"peer" || (three && victim) || (longMatch && guest),"Invalid role");
 const wchar_t* root=argv[2];std::wstring token(argv[3]);need(!token.empty() && token.size()<=32 && std::all_of(token.begin(),token.end(),[](wchar_t c){return c>=L'0' && c<=L'9';}),"Invalid unique id");std::string gameName="M3TwoProcess";for(auto c:token)gameName+=char(c);Archives archives(root);
 const auto mapPath=longMatch?"Maps\\quartermaster.w3m":three?"Maps\\(4)LostTemple.w3m":"Maps\\(2)BootyBay.w3m";
 const auto localMap=longMatch?fs::path(argv[5]):fs::path(root)/(three?L"Maps/(4)LostTemple.w3m":L"Maps/(2)BootyBay.w3m");
 const auto check=[&]{
     if(!longMatch)return calculateLanMapCheck(archives,mapPath);
     const auto size=fs::file_size(localMap);
     need(size>0 && size<=16*1024*1024,"Invalid long match fixture size");
     auto bytes=std::make_shared<Bytes>(std::size_t(size));
     std::ifstream map(localMap,std::ios::binary);
     need(bool(map.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(size))),"Could not read the long match fixture");
     return calculateLanMapCheck(archives,bytes,mapPath);
 }();
 std::unique_ptr<LanHost> host;std::unique_ptr<LanJoin> peer;LanDiscovery disc(true,LanDiscovery::defaultVersion,"127.0.0.1");
 if(hosting){LanHostSettings s;s.gameName=gameName;s.playerName="Host";s.mapPath=mapPath;s.map=check;s.width=longMatch?20:64;s.height=s.width;s.experimentalHandshake=true;s.loopbackOnly=true;s.slots.resize(longMatch?3:three?4:2);for(unsigned i=0;i<s.slots.size();i++){s.slots[i].team=std::uint8_t(i);s.slots[i].color=std::uint8_t(i);s.slots[i].race=1;s.slots[i].handicap=100;}host=std::make_unique<LanHost>(s);}else disc.refresh();
 auto tick=[&]{if(host)host->poll();else {disc.poll();if(peer)peer->poll();}};auto wait=[&](std::function<bool()> ready,const char* msg){auto until=std::chrono::steady_clock::now()+std::chrono::seconds(40);while(!ready()){tick();if(std::chrono::steady_clock::now()>until)throw std::runtime_error(msg);std::this_thread::sleep_for(std::chrono::milliseconds(1));}};
 if(hosting){wait([&]{return host->players().size()==(multi?3u:2u) && host->playerReportsMapReady(2) && (!multi || host->playerReportsMapReady(3));},"host lobby/map timeout");need(host->beginCountdown(),"countdown");wait([&]{return host->beginLoading();},"loading timeout");need(host->enableTimeSlotProtocol(),"host slots");need(host->reportHostLoaded(),"host loaded");wait([&]{return host->loadPhase()==LanLoadPhase::Ready;},"host ready timeout");}
 else {wait([&]{auto it=std::find_if(disc.games().begin(),disc.games().end(),[&](auto& g){return g.name==gameName && g.address=="127.0.0.1";});if(it==disc.games().end())return false;peer=std::make_unique<LanJoin>(*it,victim?"Victim":guest?"Guest":"Peer");need(peer->enableExperimentalHandshake(),"handshake");return true;},"discovery timeout");wait([&]{return peer->state()==LanJoinState::Lobby && peer->mapCheck().received;},"peer lobby timeout");need(peer->localPlayerId()==((victim || guest)?3:2),"wrong peer ID");std::cout<<"JOINED id="<<unsigned(peer->localPlayerId())<<"\n"<<std::flush;need(peer->reportMapReady(check) && peer->enableLoadingProtocol(),"peer ready setup");wait([&]{return peer->loadPhase()==LanLoadPhase::Countdown || peer->loadPhase()==LanLoadPhase::Loading;},"peer countdown");need(peer->enableTimeSlotProtocol(),"peer slots");wait([&]{return peer->loadPhase()==LanLoadPhase::Loading;},"peer loading");need(peer->reportLocalLoaded(),"peer loaded");wait([&]{return peer->loadPhase()==LanLoadPhase::Ready;},"peer barrier");}
 archives.mountMap(localMap);auto world=World::read(archives);auto info=world->data().info;unsigned seed=hosting?host->randomSeed():*peer->randomSeed();auto program=jass::Program::read(archives);auto sources=program.sources();if(abrupt)sources.push_back({"probe-leave.j",R"JASS(globals
 integer probeLeaveCount=0
 integer probeLeavePlayer=-1
endglobals
function ProbeLeaveAction takes nothing returns nothing
 set probeLeaveCount=probeLeaveCount+1
 set probeLeavePlayer=GetPlayerId(GetTriggerPlayer())
endfunction
function ProbeLeaveInstall takes integer target returns nothing
 local trigger t=CreateTrigger()
 call TriggerRegisterPlayerEvent(t,Player(target),EVENT_PLAYER_LEAVE)
 call TriggerAddAction(t,function ProbeLeaveAction)
endfunction
)JASS","test observer"});ScriptSession session(jass::Module::compile(jass::Program::parse(std::move(sources))),info,{}, {},seed);session.attachWorld(std::move(world));session.audioMuted(true);session.audioSimulationClock();session.configure();LanSessionSetup setup;setup.slots=hosting?host->slots():peer->slots();setup.players=hosting?host->players():peer->players();setup.slotPlayerIds=lanHostSlotPlayerIds(info,setup.slots.size());setup.localPeerId=hosting?1:peer->localPlayerId();setup.randomSeed=seed;setup.experimentalSelectionSync=true;session.applyLanSetup(setup);session.startMain();if(abrupt)session.runtime().invoke("ProbeLeaveInstall",std::array{session.runtime().integer(three?2:1)});LanLocalIdentity identity(session);
 if(longMatch){runLanLongMatch(host.get(),peer.get(),session,identity,setup,mapPath,fs::path(argv[6])/"host.w3g");return 0;}
 LanSimulation sim(session,[&](LanObjectId id){return identity.resolve(id);},true);std::cout<<"START peer="<<unsigned(setup.localPeerId)<<" seed="<<seed<<" checksum="<<session.localNetworkChecksum()<<"\n"<<std::flush;
 std::uint32_t actor=0;for(auto& [id,u]:session.units())if(u->owner==0 && !u->building && !u->hidden() && u->life.bits() && identity.wire(id)){actor=id;break;}need(actor,"no actor");std::uint32_t peerActor=0;for(auto& [id,u]:session.units())if(u->owner==1 && !u->building && !u->hidden() && u->life.bits() && identity.wire(id)){peerActor=id;break;}need(peerActor,"no peer actor");auto peerStartX=session.units().at(peerActor)->x.bits(),peerStartY=session.units().at(peerActor)->y.bits();bool peerSelected=false,peerMoved=false;auto startX=session.units().at(actor)->x.bits();auto startY=session.units().at(actor)->y.bits();
 for(unsigned frame=0;frame<80;frame++){
 if(hosting){auto until=std::chrono::steady_clock::now()+std::chrono::milliseconds(32);while(std::chrono::steady_clock::now()<until){tick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}if(frame==0){auto obj=*identity.wire(actor);std::array<LanDecodedAction,1> a{LanActionSelection{1,{obj}}};auto payload=encodeLanActions(a,true);need(host->submitHostAction(payload),"selection send");}if(frame==1){PlayerCommand c;c.player=0;c.kind=PlayerCommandKind::GroundMove;c.units={actor};c.xBits=std::bit_cast<std::uint32_t>(std::bit_cast<float>(startX)+128.f);c.yBits=startY;auto fields=identity.fields(c);need(bool(fields),"move fields");auto payload=encodeLanPlayerCommand(session,1,c,*fields,[&](auto id){return identity.wire(id);},true);need(host->submitHostAction(payload),"move send");}wait([&]{return host->emitTimeSlot(32);},"slot emit");}
 std::optional<LanTimeSlot> slot;wait([&]{slot=hosting?host->takeTimeSlot():peer->takeTimeSlot();return bool(slot);},"slot receive");need(sim.consume(frame+1,*slot)==LanStepResult::Applied,sim.error().c_str());auto checksum=session.localNetworkChecksum();need(hosting?host->submitHostChecksum(checksum):peer->sendChecksum(checksum),"checksum send");tick();if(!hosting && !victim && frame>=5 && !peerSelected){std::array<LanDecodedAction,1> a{LanActionSelection{1,{*identity.wire(peerActor)}}};need(peer->sendAction(encodeLanActions(a,true)),"peer selection send");peerSelected=true;}else if(!hosting && !victim && peerSelected && !peerMoved && session.playerSelection(1).contains(peerActor)){PlayerCommand c;c.player=1;c.kind=PlayerCommandKind::GroundMove;c.units={peerActor};c.xBits=std::bit_cast<std::uint32_t>(std::bit_cast<float>(peerStartX)-128.f);c.yBits=peerStartY;auto fields=identity.fields(c);need(bool(fields),"peer move fields");auto payload=encodeLanPlayerCommand(session,setup.localPeerId,c,*fields,[&](auto id){return identity.wire(id);},true);need(peer->sendAction(payload),"peer move send");peerMoved=true;}if(hosting && host->checksumMismatch()){auto x=*host->checksumMismatch();std::cerr<<"MISMATCH frame="<<frame<<" round="<<x.round<<" expected="<<x.expected<<" actual="<<x.actual<<"\n";throw std::runtime_error("checksum mismatch");}std::cout<<"FRAME "<<frame<<" sum="<<checksum<<" x="<<std::bit_cast<float>(session.units().at(actor)->x.bits())<<" y="<<std::bit_cast<float>(session.units().at(actor)->y.bits())<<" peerx="<<std::bit_cast<float>(session.units().at(peerActor)->x.bits())<<"\n"<<std::flush;
 }
 need(std::abs(std::bit_cast<float>(session.units().at(actor)->x.bits())-std::bit_cast<float>(startX))>100 && std::abs(std::bit_cast<float>(session.units().at(peerActor)->x.bits())-std::bit_cast<float>(peerStartX))>100,"Both commands did not move units");need(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
 if(abrupt){
  if(!hosting && (!three || victim)){if(!victim)need(peerSelected && peerMoved,"peer commands not sent");std::cout<<"READY_TO_KILL\n"<<std::flush;for(;;)std::this_thread::sleep_for(std::chrono::seconds(1));}
  if(!hosting)need(peerSelected && peerMoved,"survivor commands not sent");unsigned leaves=0;std::uint8_t leaving=three?3:2;unsigned player=three?2:1;
  for(unsigned frame=80;frame<200;++frame){
   if(hosting){auto until=std::chrono::steady_clock::now()+std::chrono::milliseconds(32);while(std::chrono::steady_clock::now()<until){tick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}wait([&]{return host->emitTimeSlot(32);},"post-disconnect slot emit");}
   std::optional<LanTimeSlot> slot;wait([&]{slot=hosting?host->takeTimeSlot():peer->takeTimeSlot();return bool(slot);},"missing post-disconnect slot");need(sim.consume(sim.nextSequence(),*slot)==LanStepResult::Applied,sim.error().c_str());
   auto sum=session.localNetworkChecksum();need(hosting?host->submitHostChecksum(sum):peer->sendChecksum(sum),"post-disconnect checksum");tick();need(!hosting || !host->checksumMismatch(),"post-disconnect mismatch");auto count=session.runtime().global("probeLeaveCount").bits;need(count<=1,"duplicate leave event");
   std::cout<<"POST "<<frame<<" sum="<<sum<<" count="<<count<<" player="<<session.runtime().global("probeLeavePlayer").bits<<" active="<<session.networkPeerActive(leaving)<<"\n"<<std::flush;
   if(count){
    need(!session.networkPeerActive(leaving) && (!three || session.networkPeerActive(2)) && session.runtime().global("probeLeavePlayer").bits==player,"wrong leave context");
    if(++leaves==10){if(three)for(int i=0;i<500;++i){tick();need(!hosting || !host->checksumMismatch(),"final post-disconnect mismatch");std::this_thread::sleep_for(std::chrono::milliseconds(1));}std::cout<<"PASS abnormal_departure event=1 player="<<player<<" later_slots=9\n";return 0;}
   }
  }
  throw std::runtime_error("peer disconnect not dispatched");
 }
 if(!hosting)need(peerSelected && peerMoved,"peer commands not sent");if(hosting){for(int i=0;i<2000;i++){tick();if(host->checksumMismatch())throw std::runtime_error("final checksum mismatch");std::this_thread::sleep_for(std::chrono::milliseconds(1));}}else for(int i=0;i<100;i++){tick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}
 std::cout<<"PASS peer="<<unsigned(setup.localPeerId)<<"\n";return 0;
 }catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<"\n";return 1;}}
