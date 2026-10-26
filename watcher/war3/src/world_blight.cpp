// Author: MiYu. Shared terrain blight mutations update query pathing and only the affected render regions.
#include "world.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value){float result=std::bit_cast<float>(value.bits());if(!std::isfinite(result))throw std::runtime_error("Non-finite blight coordinate");return result;}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
}
std::optional<size_t> World::terrainCorner(WorldPoint point) const {auto& t=data_.terrain;float x=number(point.x)-t.origin[0],y=number(point.y)-t.origin[1];if(x<0 || y<0 || x>(t.width-1)*128.f || y>(t.height-1)*128.f)return {};unsigned cx=std::min(t.width-1,unsigned(std::floor(x/128+.5f))),cy=std::min(t.height-1,unsigned(std::floor(y/128+.5f)));return size_t(cy)*t.width+cx;}
std::uint32_t World::terrainType(WorldPoint point) const {auto corner=terrainCorner(point);if(!corner)return 0;unsigned slot=data_.terrain.corners[*corner].flags&15;if(slot>=data_.terrain.groundTiles.size())throw std::runtime_error("Terrain query outside source tileset");auto raw=data_.terrain.groundTiles[slot];return ((raw&255)<<24)|((raw&0xff00)<<8)|((raw>>8)&0xff00)|(raw>>24);}
unsigned World::terrainVariation(WorldPoint point) const {auto corner=terrainCorner(point);return corner?data_.terrain.corners[*corner].variation&31:0;}
bool World::blighted(WorldPoint point) const {
    auto& terrain=data_.terrain;float x=number(point.x)-terrain.origin[0],y=number(point.y)-terrain.origin[1];unsigned width=data_.pathing?data_.pathing->width:(terrain.width-1)*4,height=data_.pathing?data_.pathing->height:(terrain.height-1)*4;if(x<0 || y<0 || x>=width*32.f || y>=height*32.f)return false;auto& cells=data_.pathing?data_.pathing->cells:blightPathing_;return (cells[size_t(std::floor(y/32))*width+size_t(std::floor(x/32))]&0x20)!=0;
}
void World::dirtyBlight(unsigned x,unsigned y) {
    auto& t=data_.terrain;unsigned columns=(t.width-2)/16+1;for(unsigned cy=y?y-1:0;cy<=std::min(y,t.height-2);++cy)for(unsigned cx=x?x-1:0;cx<=std::min(x,t.width-2);++cx)blightChunks_[size_t(cy/16)*columns+cx/16]=blightRevision_;
}
void World::changeBlight(WorldRect rectangle,std::optional<WorldPoint> center,float radius,bool add) {
    auto& t=data_.terrain;float x0=number(rectangle.minX),y0=number(rectangle.minY),x1=number(rectangle.maxX),y1=number(rectangle.maxY);if(x0>x1)std::swap(x0,x1);if(y0>y1)std::swap(y0,y1);float cx=center?number(center->x):0,cy=center?number(center->y):0;auto inside=[&](float x,float y){return x>=x0 && x<=x1 && y>=y0 && y<=y1 && (!center || (double(x)-cx)*(double(x)-cx)+(double(y)-cy)*(double(y)-cy)<=double(radius)*radius);};
    auto range=[](float first,float last,float origin,unsigned count,float step,float offset){double low=(double(first)-origin-offset)/step,high=(double(last)-origin-offset)/step;return std::pair{int(std::clamp(std::ceil(low),0.,double(count))),int(std::clamp(std::floor(high)+1,0.,double(count)))};};unsigned width=data_.pathing?data_.pathing->width:(t.width-1)*4,height=data_.pathing?data_.pathing->height:(t.height-1)*4;auto& pathing=data_.pathing?data_.pathing->cells:blightPathing_;auto [left,right]=range(x0,x1,t.origin[0],width,32,16);auto [bottom,top]=range(y0,y1,t.origin[1],height,32,16);bool changed=false;
    for(int y=bottom;y<top;++y)for(int x=left;x<right;++x)if(inside(t.origin[0]+x*32+16,t.origin[1]+y*32+16)){auto& value=pathing[size_t(y)*width+x];auto next=std::uint8_t(add?value|0x20:value&~0x20);if(next!=value){value=next;changed=true;}}
    auto [cornerLeft,cornerRight]=range(x0,x1,t.origin[0],t.width,128,0);auto [cornerBottom,cornerTop]=range(y0,y1,t.origin[1],t.height,128,0);bool revised=false;
    for(int y=cornerBottom;y<cornerTop;++y)for(int x=cornerLeft;x<cornerRight;++x)if(inside(t.origin[0]+x*128,t.origin[1]+y*128)){auto& value=t.corners[size_t(y)*t.width+x].flags;auto next=std::uint8_t(add?value|0x20:value&~0x20);if(next!=value){if(!revised){++blightRevision_;revised=true;}value=next;dirtyBlight(unsigned(x),unsigned(y));}}
    if(changed && !revised)++blightRevision_;
}
void World::blight(WorldRect rectangle,bool add) {changeBlight(rectangle,{},0,add);}
void World::blight(WorldPoint center,float radius,bool add) {if(!std::isfinite(radius) || radius<0 || radius>10000000)throw std::runtime_error("Blight radius outside supported range");float x=number(center.x),y=number(center.y);changeBlight({real(x-radius),real(y-radius),real(x+radius),real(y+radius)},center,radius,add);}
void World::blightPoint(WorldPoint point,bool add) {auto& t=data_.terrain;float x=t.origin[0]+std::floor((number(point.x)-t.origin[0])/128)*128,y=t.origin[1]+std::floor((number(point.y)-t.origin[1])/128)*128;changeBlight({real(x),real(y),real(x+128),real(y+128)},{},0,add);}
}
