// Author: MiYu. Script regions retain rectangle unions and exact subtraction for membership/event consumers.
#pragma once
#include "world.h"

namespace war3 {
struct SpatialRegion {
    std::vector<WorldRect> rectangles;
    bool contains(WorldPoint point) const;
    void add(WorldRect rect);
    void clear(WorldRect rect);
    static WorldRect cell(WorldPoint point);
};
}
