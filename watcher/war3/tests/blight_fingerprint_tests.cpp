// Author: MiYu. Incremental blight fingerprint coverage for pathing and terrain state.
#include "world.h"
#include <bit>
#include <iostream>

using namespace war3;
namespace {
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
WorldPoint point(float x,float y){return {real(x),real(y)};}
WorldRect rect(float x0,float y0,float x1,float y1){return {real(x0),real(y0),real(x1),real(y1)};}
MapData map(bool pathing){MapData data;data.terrain.width=data.terrain.height=3;data.terrain.corners.resize(9);if(pathing)data.pathing=MapPathing{8,8,Bytes(64)};return data;}
World make(MapData data){return World(std::move(data),{});}
void check(bool pathing){
    auto initial=map(pathing);initial.terrain.corners[4].flags=0x20;if(pathing)initial.pathing->cells[7]=0x20;auto world=make(initial),copy=make(initial);require(world.blightFingerprint()==copy.blightFingerprint(),"Initial fingerprint differs");
    auto clean=make(map(pathing));require(world.blightFingerprint()!=clean.blightFingerprint(),"Initial blight missing from fingerprint");
    auto before=world.blightFingerprint();auto area=rect(0,0,128,128);world.blight(area,true);auto added=world.blightFingerprint();require(added!=before,"Addition missing from fingerprint");world.blight(area,true);require(world.blightFingerprint()==added,"Repeated addition changed fingerprint");world.blight(area,false);auto removed=world.blightFingerprint();world.blight(area,false);require(world.blightFingerprint()==removed,"Repeated removal changed fingerprint");
    auto a=make(map(pathing)),b=make(map(pathing));auto left=rect(0,0,128,256),right=rect(128,0,256,256);a.blight(left,true);a.blight(right,true);b.blight(right,true);b.blight(left,true);require(a.blightFingerprint()==b.blightFingerprint(),"Overlapping additions depend on order");a.blight(rect(-200,-200,400,400),false);require(a.blightFingerprint()==clean.blightFingerprint(),"Boundary clear did not restore fingerprint");
    if(pathing){world.terrainPathable(point(16,16),5,false);auto changed=world.blightFingerprint();world.terrainPathable(point(16,16),5,false);require(world.blightFingerprint()==changed,"Repeated pathing write changed fingerprint");auto rebuilt=make(world.data());require(world.blightFingerprint()==rebuilt.blightFingerprint(),"Incremental pathing or corner fingerprint differs from fresh initialization");world.terrainPathable(point(16,16),5,true);require(world.blightFingerprint()==removed,"Clearing pathing bit did not restore fingerprint");}
}
}
int main(){try{check(true);check(false);std::cout<<"PASS blight fingerprint initialization and mutation\n";return 0;}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<"\n";return 1;}}
