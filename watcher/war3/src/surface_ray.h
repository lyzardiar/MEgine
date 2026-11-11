// Author: MiYu. Screen ray intersection with sampled terrain and walkable surfaces.
#pragma once
#include <algorithm>
#include <array>
#include <optional>

namespace war3 {
template<class Height> std::optional<std::array<float,3>> surfaceRay(const std::array<float,3>& a,const std::array<float,3>& b,const std::array<float,4>& bounds,Height height){
    auto point=[&](float t){return std::array<float,3>{a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t};};float begin=0,end=1;for(unsigned axis=0;axis<2;++axis){float delta=b[axis]-a[axis],minimum=bounds[axis],maximum=bounds[axis+2];if(delta==0){if(a[axis]<minimum || a[axis]>maximum)return {};continue;}float first=(minimum-a[axis])/delta,last=(maximum-a[axis])/delta;if(first>last)std::swap(first,last);begin=std::max(begin,first);end=std::min(end,last);if(begin>end)return {};}auto initial=point(begin);float initialHeight=height(initial[0],initial[1]);if(initial[2]==initialHeight)return std::array<float,3>{initial[0],initial[1],initialHeight};bool above=initial[2]>initialHeight;float previous=begin;
    for(unsigned i=1;i<=128;++i){float t=begin+(end-begin)*float(i)/128;auto p=point(t);float surface=height(p[0],p[1]);if(p[2]>surface){previous=t;above=true;continue;}if(!above)continue;float low=previous,high=t;for(unsigned step=0;step<12;++step){float mid=(low+high)/2;auto q=point(mid);if(q[2]>height(q[0],q[1]))low=mid;else high=mid;}auto q=point((low+high)/2);return std::array<float,3>{q[0],q[1],height(q[0],q[1])};}return {};
}
}
