// Author: MiYu. Source terrain, pathing and script-owned world presentation state.
#pragma once
#include "map.h"
#include "jass_numeric.h"
#include "game_clock.h"
#include <unordered_map>

namespace war3 {
struct WorldPoint {jass::Real x,y;};
struct WorldRect {jass::Real minX,minY,maxX,maxY;};
struct PathCell {size_t index=0;std::uint8_t mask=0;};
struct WorldEnvironment {
    std::array<jass::Real,8> cameraBounds{};
    std::string terrainDayNight,unitDayNight;
    std::string skyModel;
    std::string altMinimapIcon;
    bool creepCampFilter=true;
    std::array<std::uint8_t,4> waterColor{};
    bool cameraChanged=false,dayNightChanged=false,waterChanged=false;
    std::optional<WorldPoint> cameraTarget,quickPosition;
};
class World {
    MapData data_;
    WorldRect bounds_;
    std::array<jass::Real,4> margins_;
    WorldEnvironment environment_;
    GameClock clock_;
    std::unique_ptr<Archives> resources_;
    Bytes obstacles_;
    std::vector<float> surface_;
    void buildSurface();
    struct ObstacleOwners {std::array<std::uint32_t,3> counts{};std::uint8_t fixed=0;};
    std::unordered_map<size_t,ObstacleOwners> obstacleOwners_;
    std::uint64_t pathingRevision_=1;
    std::uint64_t blockingRevision_=1;
    Bytes blightPathing_;
    std::vector<std::uint64_t> blightChunks_;
    std::uint64_t blightRevision_=1;
    void changeBlight(WorldRect rectangle,std::optional<WorldPoint> center,float radius,bool add);
    void dirtyBlight(unsigned x,unsigned y);
    std::optional<size_t> terrainCorner(WorldPoint point) const;
public:
    World(MapData data,std::array<jass::Real,4> margins);
    static std::unique_ptr<World> read(Archives& archives);
    static jass::Real cameraMarginFromCells(std::int32_t cells);
    const MapData& data() const {return data_;}
    Archives& resources() const;
    const WorldRect& bounds() const {return bounds_;}
    jass::Real cameraMargin(std::uint32_t side) const;
    WorldPoint clamp(WorldPoint point) const;
    float height(WorldPoint point) const;
    std::span<const float> surface() const {return surface_;}
    WorldRect rectangle(WorldPoint first,WorldPoint second) const;
    bool blighted(WorldPoint point) const;
    std::uint32_t terrainType(WorldPoint point) const;
    unsigned terrainVariation(WorldPoint point) const;
    void blight(WorldRect rectangle,bool add);
    void blight(WorldPoint center,float radius,bool add);
    void blightPoint(WorldPoint point,bool add);
    std::uint64_t blightRevision() const {return blightRevision_;}
    const auto& blightChunks() const {return blightChunks_;}
    void block(float x,float y);
    std::optional<size_t> pathCell(float x,float y) const;
    unsigned pathMask(WorldPoint point,std::span<const PathCell> ignored={}) const;
    void footprint(std::span<const PathCell> cells,bool add);
    std::uint64_t pathingRevision() const {return pathingRevision_;}
    std::uint64_t blockingRevision() const {return blockingRevision_;}
    std::vector<WorldPoint> route(WorldPoint from,WorldPoint to,float radius=0,bool flying=false) const;
    WorldEnvironment& environment() {return environment_;}
    const WorldEnvironment& environment() const {return environment_;}
    GameClock& clock() {return clock_;}
    const GameClock& clock() const {return clock_;}
};
}
