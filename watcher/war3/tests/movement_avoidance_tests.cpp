// Author: MiYu. Focused fixed-step unit avoidance checks on an open original-map area.
#include "session.h"
#include "setup.h"
#include <bit>
#include <cmath>
#include <iostream>

using namespace war3;
namespace {
void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
WorldPoint point(float x,float y){return {real(x),real(y)};}
std::pair<float,float> openArea(ScriptSession& session){
    auto& world=*session.world();auto bounds=world.bounds();for(float y=number(bounds.minY)+256;y<number(bounds.maxY)-256;y+=128)for(float x=number(bounds.minX)+256;x<number(bounds.maxX)-256;x+=128){bool free=true;for(int dy=-160;dy<=160 && free;dy+=32)for(int dx=-192;dx<=192;dx+=32)if(!world.pathPointFree(point(x+dx,y+dy),24,PathMovement::Ground) || !world.pathPointFree(point(x+dx,y+dy),24,PathMovement::Air)){free=false;break;}if(!free)continue;for(auto& [id,u]:session.units())if(!u->removing && !u->hidden() && number(u->life)>0 && std::hypot(number(u->x)-x,number(u->y)-y)<384+std::max(0.f,u->collision)){free=false;break;}if(free)return {x,y};}throw std::runtime_error("No open test area on selected map");
}
}
int wmain(int argc,wchar_t** argv){try{
    if(argc!=3)throw std::runtime_error("Usage: war3_movement_avoidance_tests <data-root> <map>");Archives archives(argv[1]);archives.mountMap(argv[2]);auto world=World::read(archives);auto info=world->data().info;ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto& vm=session.runtime();auto invoke=[&](const char* name,std::initializer_list<jass::Value> args){return vm.invoke(name,{args.begin(),args.size()});};auto player=invoke("Player",{vm.integer(0)});auto [x,y]=openArea(session);auto spawn=[&](float px,float py){auto handle=invoke("CreateUnit",{player,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(px)),vm.real(real(py)),vm.real(real(0))});require(session.units().contains(handle.bits),"Unit creation failed");auto u=session.units().at(handle.bits);u->collision=16;u->moveSpeed=real(256);return handle;};auto route=[&](jass::Value unit,float tx,float ty){auto u=session.units().at(unit.bits);u->route={point(tx,ty)};u->waypoint=0;u->currentOrder=851986;u->pathingRevision=session.world()->blockingRevision();};auto remove=[&](jass::Value unit){invoke("RemoveUnit",{unit});};
    auto a=spawn(x-64,y),b=spawn(x+64,y),independent=spawn(x-64,y+120);route(a,x+160,y);route(b,x-160,y);route(independent,x+160,y+120);float minimum=1e9f,sideways=0;for(int i=0;i<32;++i){session.advance(1./32);auto left=session.units().at(a.bits),right=session.units().at(b.bits);minimum=std::min(minimum,std::hypot(number(left->x)-number(right->x),number(left->y)-number(right->y)));sideways=std::max({sideways,std::abs(number(left->y)-y),std::abs(number(right->y)-y)});}require(minimum>=31.95f,"Head-on units overlapped");require(sideways>1,"Head-on units did not steer around each other");require(number(session.units().at(independent.bits)->x)>x+40,"Independent movement was blocked");require(number(session.units().at(a.bits)->x)>x-40 || number(session.units().at(b.bits)->x)<x+40,"Head-on units failed to move");remove(a);remove(b);remove(independent);std::cout<<"PASS head_on_and_independent\n";
    a=spawn(x,y);b=spawn(x,y);route(a,x-120,y);route(b,x+120,y);session.advance(.125);auto left=session.units().at(a.bits),right=session.units().at(b.bits);require(number(left->x)<x-1 && number(right->x)>x+1,"Overlapping units could not separate");remove(a);remove(b);std::cout<<"PASS overlap_escape\n";
    a=spawn(x-64,y);b=spawn(x,y);session.units().at(a.bits)->pathing=false;route(a,x+120,y);session.advance(.5);require(number(session.units().at(a.bits)->x)>x+20,"Unit without pathing was blocked by another unit");remove(a);remove(b);std::cout<<"PASS pathing_disabled\n";
    a=spawn(x-64,y);b=spawn(x,y);session.units().at(a.bits)->movementType="fly";route(a,x+120,y);session.advance(.5);require(number(session.units().at(a.bits)->x)>x+20,"Air unit was blocked by ground unit");remove(a);remove(b);std::cout<<"PASS air_ground_layers\n";
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");return 0;
}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}}
