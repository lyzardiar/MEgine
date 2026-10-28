// Author: MiYu. Focused queued player-order lifecycle checks on an original map.
#include "session.h"
#include "setup.h"
#include "player_commands.h"
#include "lan_action_encoder.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>

using namespace war3;
namespace {
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
WorldPoint point(float x,float y){return {real(x),real(y)};}
std::pair<float,float> openArea(ScriptSession& session){
    auto& world=*session.world();auto bounds=world.bounds();for(float y=number(bounds.minY)+256;y<number(bounds.maxY)-256;y+=128)for(float x=number(bounds.minX)+256;x<number(bounds.maxX)-256;x+=128){bool free=true;for(int dy=-160;dy<=160 && free;dy+=32)for(int dx=-160;dx<=160;dx+=32)if(!world.pathPointFree(point(x+dx,y+dy),24,PathMovement::Ground)){free=false;break;}if(!free)continue;for(auto& [id,u]:session.units())if(!u->removing && !u->hidden() && number(u->life)>0 && std::hypot(number(u->x)-x,number(u->y)-y)<384+std::max(0.f,u->collision)){free=false;break;}if(free)return {x,y};}throw std::runtime_error("No open test area on selected map");
}
}
int wmain(int argc,wchar_t** argv){try{
    if(argc!=3)throw std::runtime_error("Usage: war3_order_queue_tests <data-root> <map>");Archives archives(argv[1]);archives.mountMap(argv[2]);auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto invoke=[&](const char* name,std::initializer_list<jass::Value> args){return vm.invoke(name,{args.begin(),args.size()});};auto player=invoke("Player",{vm.integer(0)});auto [x,y]=openArea(session);
    auto spawn=[&](float px,float py){auto handle=invoke("CreateUnit",{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(px)),vm.real(real(py)),vm.real(real(0))});require(session.units().contains(handle.bits),"Unit creation failed");auto u=session.units().at(handle.bits);u->collision=16;u->moveSpeed=real(256);u->acquireRange=real(0);u->pathing=false;return handle;};auto remove=[&](jass::Value unit){invoke("RemoveUnit",{unit});};auto nearPoint=[&](jass::Value unit,float px,float py){auto u=session.units().at(unit.bits);return std::hypot(number(u->x)-px,number(u->y)-py)<9;};auto move=[&](jass::Value unit,float px,float py,bool queued){PlayerCommand command;command.player=0;command.kind=PlayerCommandKind::GroundMove;command.units={unit.bits};command.xBits=real(px).bits();command.yBits=real(py).bits();command.queued=queued;return dispatchPlayerCommand(session,command);};

    auto a=spawn(x,y);require(move(a,x+96,y,true)==1,"Queued idle move was rejected");require(session.units().at(a.bits)->currentOrder==851986 && !session.units().at(a.bits)->route.empty(),"First queued move did not start immediately");require(move(a,x+96,y+96,true)==1 && move(a,x,y+96,true)==1,"Following moves were rejected");bool first=false,second=false,third=false;for(unsigned tick=0;tick<160;++tick){session.advance(1./32);if(nearPoint(a,x+96,y))first=true;if(nearPoint(a,x+96,y+96)){require(first,"Second destination reached before first");second=true;}if(nearPoint(a,x,y+96)){require(second,"Third destination reached before second");third=true;break;}}require(first && second && third,"Queued moves did not finish in order");remove(a);std::cout<<"PASS idle_and_sequential_moves\n";

    a=spawn(x-128,y-48);auto groupMate=spawn(x-128,y+48);PlayerCommand group;group.player=0;group.kind=PlayerCommandKind::GroundMove;group.units={a.bits,groupMate.bits};group.xBits=real(x-64).bits();group.yBits=real(y).bits();require(dispatchPlayerCommand(session,group)==2,"Initial group move rejected");group.xBits=real(x+96).bits();group.queued=true;require(dispatchPlayerCommand(session,group)==2,"Queued group move rejected");session.advance(3);auto left=session.units().at(a.bits),right=session.units().at(groupMate.bits);float ax=number(left->x),ay=number(left->y),bx=number(right->x),by=number(right->y);require(std::hypot(ax-(x+96),ay-y)<80 && std::hypot(bx-(x+96),by-y)<80,"Queued group did not finish around the clicked position");require(std::hypot(ax-bx,ay-by)>=31.9f,"Queued group destinations overlapped");remove(a);remove(groupMate);std::cout<<"PASS queued_group_formation\n";

    a=spawn(x,y);require(move(a,x+96,y,false)==1 && move(a,x+96,y+96,true)==1,"Override setup failed");require(move(a,x,y-96,false)==1,"Immediate replacement rejected");session.advance(2);require(nearPoint(a,x,y-96),"Immediate order did not clear queued movement");remove(a);std::cout<<"PASS immediate_order_replaces_queue\n";

    a=spawn(x,y);require(move(a,x+96,y,false)==1 && move(a,x+96,y+96,true)==1,"Death setup failed");invoke("KillUnit",{a});invoke("SetUnitState",{a,vm.handle("unitstate",0),vm.real(real(200))});session.advance(2);require(nearPoint(a,x,y),"Dead and restored unit retained a queued order");remove(a);std::cout<<"PASS death_clears_queue\n";

    a=spawn(x,y);require(move(a,x+96,y,false)==1 && move(a,x+96,y+96,true)==1,"Ownership setup failed");auto other=invoke("Player",{vm.integer(1)});for(int option:{6,7})invoke("SetPlayerAlliance",{other,player,vm.handle("alliancetype",option),vm.boolean(false)});invoke("SetUnitOwner",{a,other,vm.boolean(false)});session.advance(2);require(nearPoint(a,x+96,y),"Old player's queued order executed after ownership change");remove(a);std::cout<<"PASS ownership_change_clears_queue\n";

    a=spawn(x,y);auto target=spawn(x+120,y+120);require(move(a,x+96,y,false)==1,"Invalid target setup failed");PlayerCommand order;order.player=0;order.kind=PlayerCommandKind::TargetOrder;order.units={a.bits};order.target=target.bits;order.order=851986;order.queued=true;require(dispatchPlayerCommand(session,order)==1 && move(a,x,y+96,true)==1,"Target or subsequent queued order rejected");remove(target);session.advance(2);require(nearPoint(a,x,y+96),"Invalid queued target prevented the next order");remove(a);std::cout<<"PASS invalid_target_skipped\n";

    PlayerCommand network;network.player=0;network.kind=PlayerCommandKind::GroundMove;network.queued=true;bool rejected=false;try{encodeLanPlayerCommand(session,0,network,LanAbilityWireFields{0,0,0},{});}catch(const std::runtime_error& error){rejected=std::string(error.what())=="Queued LAN orders are not supported";}require(rejected,"Unsupported queued LAN action was not explicitly rejected");require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");std::cout<<"PASS queued_lan_rejected\n";return 0;
}catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<'\n';return 1;}}
