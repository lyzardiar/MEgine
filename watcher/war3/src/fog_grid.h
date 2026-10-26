// Author: MiYu. Per-player explored/visible cells shared by fog natives and world rendering.
#pragma once
#include "world.h"

namespace war3 {
struct FogModifier {unsigned owner=0,state=4;WorldRect rect;WorldPoint center;jass::Real radius;bool radial=false,shared=false,afterUnits=false,enabled=false;};
class FogGrid {
    Bytes explored_,visible_;
public:
    unsigned width,height;
    std::array<float,2> origin;
    std::uint64_t stamp=0;
    std::vector<std::uint32_t> pixels;
    explicit FogGrid(const MapTerrain& terrain);
    void begin();
    void rect(WorldRect area,unsigned state);
    void circle(WorldPoint center,jass::Real radius,unsigned state);
    void finish(bool fog,bool mask);
    unsigned state(WorldPoint point) const;
};
}
