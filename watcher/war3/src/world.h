// Author: MiYu. Source terrain, pathing and script-owned world presentation state.
#pragma once
#include "map.h"
#include "jass_numeric.h"
#include "game_clock.h"

namespace war3 {
struct WorldPoint {jass::Real x,y;};
struct WorldRect {jass::Real minX,minY,maxX,maxY;};
struct WorldEnvironment {
    std::array<jass::Real,8> cameraBounds{};
    std::string terrainDayNight,unitDayNight;
    std::array<std::uint8_t,4> waterColor{};
    bool cameraChanged=false,dayNightChanged=false,waterChanged=false;
};
class World {
    MapData data_;
    WorldRect bounds_;
    std::array<jass::Real,4> margins_;
    WorldEnvironment environment_;
    GameClock clock_;
    std::unique_ptr<Archives> resources_;
public:
    World(MapData data,std::array<jass::Real,4> margins);
    static std::unique_ptr<World> read(Archives& archives);
    static jass::Real cameraMarginFromCells(std::int32_t cells);
    const MapData& data() const {return data_;}
    Archives& resources() const;
    const WorldRect& bounds() const {return bounds_;}
    jass::Real cameraMargin(std::uint32_t side) const;
    WorldPoint clamp(WorldPoint point) const;
    WorldRect rectangle(WorldPoint first,WorldPoint second) const;
    WorldEnvironment& environment() {return environment_;}
    const WorldEnvironment& environment() const {return environment_;}
    GameClock& clock() {return clock_;}
    const GameClock& clock() const {return clock_;}
};
}
