// Author: MiYu. One source terrain/ramp surface supplies render heights, location queries and native effects.
#include "world.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
void World::buildSurface() {
    auto& t=data_.terrain;surface_.reserve(t.corners.size());for(auto& c:t.corners)surface_.push_back((float(c.ground)-8192)/4+(int(c.cliff&15)-2)*128);std::vector<bool> raised(t.corners.size());
    for(unsigned y=0;y+1<t.height;++y)for(unsigned x=0;x+1<t.width;++x){std::array<size_t,4> at{size_t(y)*t.width+x,size_t(y+1)*t.width+x,size_t(y+1)*t.width+x+1,size_t(y)*t.width+x+1};std::array<unsigned,4> level;for(unsigned i=0;i<4;++i)level[i]=t.corners[at[i]].cliff&15;bool ramp=std::all_of(at.begin(),at.end(),[&](auto i){return (t.corners[i].flags&0x10)!=0;});if(ramp && !(level[0]==level[2] && level[1]==level[3])){auto base=*std::min_element(level.begin(),level.end());for(unsigned i=0;i<4;++i)if(level[i]==base)raised[at[i]]=true;}}
    for(size_t i=0;i<raised.size();++i)if(raised[i])surface_[i]+=64;
}
float World::height(WorldPoint point) const {
    auto& t=data_.terrain;float x=std::bit_cast<float>(point.x.bits()),y=std::bit_cast<float>(point.y.bits());if(!std::isfinite(x) || !std::isfinite(y))throw std::runtime_error("Non-finite height query");x=std::clamp((x-t.origin[0])/128,0.f,float(t.width-1));y=std::clamp((y-t.origin[1])/128,0.f,float(t.height-1));auto ix=std::min(unsigned(x),t.width-2),iy=std::min(unsigned(y),t.height-2);float u=x-ix,v=y-iy;auto at=size_t(iy)*t.width+ix;return (surface_[at]*(1-u)+surface_[at+1]*u)*(1-v)+(surface_[at+t.width]*(1-u)+surface_[at+t.width+1]*u)*v;
}
}
