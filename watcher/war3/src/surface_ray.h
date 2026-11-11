// Author: MiYu. Screen ray intersection with sampled terrain and walkable surfaces.
#pragma once
#include <array>
#include <optional>

namespace war3 {
template<class Height> std::optional<std::array<float,3>> surfaceRay(const std::array<float,3>& a,const std::array<float,3>& b,const std::array<float,4>& bounds,Height height){
    auto point=[&](float t){return std::array<float,3>{a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t};};float previous=0;
    for(unsigned i=1;i<=128;++i){float t=float(i)/128;auto p=point(t);if(p[0]<bounds[0] || p[0]>bounds[2] || p[1]<bounds[1] || p[1]>bounds[3]){previous=t;continue;}if(p[2]<=height(p[0],p[1])){float low=previous,high=t;for(unsigned step=0;step<12;++step){float mid=(low+high)/2;auto q=point(mid);if(q[2]>height(q[0],q[1]))low=mid;else high=mid;}auto q=point((low+high)/2);return std::array<float,3>{q[0],q[1],height(q[0],q[1])};}previous=t;}return {};
}
}
