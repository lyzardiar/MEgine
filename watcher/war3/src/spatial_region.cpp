// Author: MiYu. Native region union/subtraction without allocating a map-wide grid for each script rectangle.
#include "spatial_region.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}}
bool SpatialRegion::contains(WorldPoint point) const {float x=number(point.x),y=number(point.y);return std::any_of(rectangles.begin(),rectangles.end(),[&](auto& r){return x>=number(r.minX) && x<=number(r.maxX) && y>=number(r.minY) && y<=number(r.maxY);});}
void SpatialRegion::add(WorldRect rect) {if(rectangles.size()>=65536)throw std::runtime_error("Region rectangle budget exceeded");rectangles.push_back(rect);}
WorldRect SpatialRegion::cell(WorldPoint point) {float x=std::floor(number(point.x)/32)*32,y=std::floor(number(point.y)/32)*32;return {real(x),real(y),real(x+32),real(y+32)};}
void SpatialRegion::clear(WorldRect rect) {
    std::vector<WorldRect> result;auto add=[&](float x,float y,float ex,float ey){if(x<ex && y<ey){if(result.size()>=65536)throw std::runtime_error("Region subtraction budget exceeded");result.push_back({real(x),real(y),real(ex),real(ey)});}};
    for(auto& source:rectangles){float x=number(source.minX),y=number(source.minY),ex=number(source.maxX),ey=number(source.maxY),left=std::max(x,number(rect.minX)),right=std::min(ex,number(rect.maxX)),bottom=std::max(y,number(rect.minY)),top=std::min(ey,number(rect.maxY));if(left>=right || bottom>=top){result.push_back(source);continue;}add(x,y,left,ey);add(right,y,ex,ey);add(left,y,right,bottom);add(left,top,right,ey);}rectangles=std::move(result);
}
}
