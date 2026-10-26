// Author: MiYu. Rasterize bounded visibility unions while preserving exploration between simulation updates.
#include "fog_grid.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real v){auto n=std::bit_cast<float>(v.bits());if(!std::isfinite(n))throw std::runtime_error("Non-finite fog coordinate");return n;}}
FogGrid::FogGrid(const MapTerrain& terrain) : width((terrain.width-1)*2),height((terrain.height-1)*2),origin(terrain.origin) {if(!width || !height || std::uint64_t(width)*height>4*1024*1024)throw std::runtime_error("Fog grid exceeds memory budget");explored_.resize(size_t(width)*height);visible_.resize(explored_.size());pixels.resize(explored_.size());}
void FogGrid::begin() {std::fill(visible_.begin(),visible_.end(),std::uint8_t{0});}
void FogGrid::rect(WorldRect area,unsigned state) {int left=int(std::floor((number(area.minX)-origin[0])/64)),right=int(std::floor((number(area.maxX)-origin[0])/64)),bottom=int(std::floor((number(area.minY)-origin[1])/64)),top=int(std::floor((number(area.maxY)-origin[1])/64));for(int y=std::max(0,bottom);y<=std::min(int(height)-1,top);++y)for(int x=std::max(0,left);x<=std::min(int(width)-1,right);++x){auto i=size_t(y)*width+x;if(state==1){explored_[i]=0;visible_[i]=0;}else if(state==2){explored_[i]=1;visible_[i]=0;}else{explored_[i]=visible_[i]=1;}}}
void FogGrid::circle(WorldPoint center,jass::Real radius,unsigned state) {double x=number(center.x),y=number(center.y),r=number(radius);if(r<0)throw std::runtime_error("Negative fog radius");int left=int(std::clamp(std::floor((x-r-origin[0])/64),0.,double(width))),right=int(std::clamp(std::floor((x+r-origin[0])/64),-1.,double(width)-1)),bottom=int(std::clamp(std::floor((y-r-origin[1])/64),0.,double(height))),top=int(std::clamp(std::floor((y+r-origin[1])/64),-1.,double(height)-1));for(int cy=bottom;cy<=top;++cy)for(int cx=left;cx<=right;++cx){double dx=origin[0]+(cx+.5)*64-x,dy=origin[1]+(cy+.5)*64-y;if(dx*dx+dy*dy>r*r)continue;auto i=size_t(cy)*width+cx;if(state==1){explored_[i]=0;visible_[i]=0;}else if(state==2){explored_[i]=1;visible_[i]=0;}else explored_[i]=visible_[i]=1;}}
void FogGrid::finish(bool fog,bool mask) {for(size_t i=0;i<pixels.size();++i){unsigned value=visible_[i] || (!fog && (explored_[i] || !mask))?255:explored_[i] || !mask?90:0;pixels[i]=0xff000000u|value*0x010101u;}}
unsigned FogGrid::state(WorldPoint point) const {auto px=number(point.x)-origin[0],py=number(point.y)-origin[1];if(px<0 || py<0 || px>=width*64.f || py>=height*64.f)return 1;auto x=unsigned(px/64),y=unsigned(py/64);auto value=pixels[size_t(y)*width+x]&255;return value==255?4:value?2:1;}
}
