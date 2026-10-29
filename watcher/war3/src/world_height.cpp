// Author: MiYu. One source terrain/ramp surface supplies render heights, location queries and native effects.
#include "world.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cfloat>

namespace war3 {
void World::buildSurface() {
    auto& t=data_.terrain;surface_.reserve(t.corners.size());for(auto& c:t.corners)surface_.push_back((float(c.ground)-8192)/4+(int(c.cliff&15)-2)*128);std::vector<bool> raised(t.corners.size());
    for(unsigned y=0;y+1<t.height;++y)for(unsigned x=0;x+1<t.width;++x){std::array<size_t,4> at{size_t(y)*t.width+x,size_t(y+1)*t.width+x,size_t(y+1)*t.width+x+1,size_t(y)*t.width+x+1};std::array<unsigned,4> level;for(unsigned i=0;i<4;++i)level[i]=t.corners[at[i]].cliff&15;bool ramp=std::all_of(at.begin(),at.end(),[&](auto i){return (t.corners[i].flags&0x10)!=0;});if(ramp && !(level[0]==level[2] && level[1]==level[3])){auto base=*std::min_element(level.begin(),level.end());for(unsigned i=0;i<4;++i)if(level[i]==base)raised[at[i]]=true;}}
    for(size_t i=0;i<raised.size();++i)if(raised[i])surface_[i]+=64;
}
float World::height(WorldPoint point) const {
    auto& t=data_.terrain;float x=std::bit_cast<float>(point.x.bits()),y=std::bit_cast<float>(point.y.bits());if(!std::isfinite(x) || !std::isfinite(y))throw std::runtime_error("Non-finite height query");float offset=deformation(x,y);x=std::clamp((x-t.origin[0])/128,0.f,float(t.width-1));y=std::clamp((y-t.origin[1])/128,0.f,float(t.height-1));auto ix=std::min(unsigned(x),t.width-2),iy=std::min(unsigned(y),t.height-2);float u=x-ix,v=y-iy;auto at=size_t(iy)*t.width+ix;return (surface_[at]*(1-u)+surface_[at+1]*u)*(1-v)+(surface_[at+t.width]*(1-u)+surface_[at+t.width+1]*u)*v+offset;
}
float World::deformation(float x,float y) const {
    if(ripples_.empty())return 0;auto& terrain=data_.terrain;double gx=std::clamp((double(x)-terrain.origin[0])/128,0.,double(terrain.width-1)),gy=std::clamp((double(y)-terrain.origin[1])/128,0.,double(terrain.height-1));unsigned ix=std::min(unsigned(gx),terrain.width-2),iy=std::min(unsigned(gy),terrain.height-2);double u=gx-ix,v=gy-iy;
    auto sample=[&](unsigned px,unsigned py){double sx=terrain.origin[0]+double(px)*128,sy=terrain.origin[1]+double(py)*128,total=0;for(auto& r:ripples_){double age=std::max(0.,deformationTime_-r.started);if(r.radius<=0)continue;double elapsed=r.duration>0?age/r.duration:1,completed=r.duration>0 && elapsed>0?std::ceil(elapsed)-1:0,cycle=elapsed-completed,progress=(completed+cycle)/r.count,dist=std::hypot(sx-r.x,sy-r.y);if(dist>double(r.radius)*(r.startRadius+(1-r.startRadius)*progress))continue;double offset=-double(r.depth)*std::sin(3.141592653589793*(double(r.spaceWaves)*std::clamp(dist/r.radius,0.,1.)+double(r.timeWaves)*cycle))*(1-progress);if(r.limitNegative)offset=std::min(0.,offset);if(r.stopping && r.stopDuration>0)offset*=std::clamp(1-(deformationTime_-r.stopStarted)/r.stopDuration,0.,1.);total+=offset;}return total;};
    return float((sample(ix,iy)*(1-u)+sample(ix+1,iy)*u)*(1-v)+(sample(ix,iy+1)*(1-u)+sample(ix+1,iy+1)*u)*v);
}
float World::deformationBound() const {double bound=0;for(auto& ripple:ripples_){double age=std::max(0.,deformationTime_-ripple.started),progress=(ripple.duration>0?age/ripple.duration:1)/ripple.count;bound+=std::abs(double(ripple.depth)*(1-progress));}return float(std::min(bound,double(FLT_MAX)/4));}
bool World::deformationIntersects(float minX,float minY,float maxX,float maxY) const {for(auto& ripple:ripples_){double age=std::max(0.,deformationTime_-ripple.started),progress=(ripple.duration>0?age/ripple.duration:1)/ripple.count,radius=std::max(0.,double(ripple.radius)*(ripple.startRadius+(1-double(ripple.startRadius))*progress))+128;if(double(ripple.x)+radius>=minX && double(ripple.x)-radius<=maxX && double(ripple.y)+radius>=minY && double(ripple.y)-radius<=maxY)return true;}return false;}
void World::addRipple(TerrainRipple ripple) {if(ripple.duration==0 && ripple.count==1)return;if(ripples_.size()>=256)throw std::runtime_error("Terrain deformation budget exceeded");ripples_.push_back(ripple);++deformationRevision_;}
void World::stopDeformation(std::uint32_t handle,double duration) {auto found=std::find_if(ripples_.begin(),ripples_.end(),[&](auto& r){return r.handle==handle;});if(found==ripples_.end())return;found->stopping=true;found->stopStarted=deformationTime_;found->stopDuration=duration;++deformationRevision_;}
void World::stopDeformations() {if(!ripples_.empty()){ripples_.clear();++deformationRevision_;}}
void World::updateDeformations(double now) {deformationTime_=now;if(ripples_.empty())return;bool changing=std::any_of(ripples_.begin(),ripples_.end(),[](auto& r){return r.duration>0 || r.stopping;});std::erase_if(ripples_,[&](auto& r){return (!r.persistent && r.duration>0 && now-r.started>r.duration*r.count) || (r.stopping && now-r.stopStarted>=r.stopDuration);});if(changing)++deformationRevision_;}
}
