// Author: MiYu. Source terrain, pathing and script-owned world presentation state.
#pragma once
#include "map.h"
#include "jass_numeric.h"
#include "game_clock.h"
#include <unordered_map>
#include <algorithm>
#include <cmath>
#include <string_view>
#include <functional>

namespace war3 {
enum class PathMovement {Ground,Air,Water,Amphibious};
inline PathMovement pathMovement(std::string_view type){return type=="fly"?PathMovement::Air:type=="float"?PathMovement::Water:(type=="amph" || type=="hover")?PathMovement::Amphibious:PathMovement::Ground;}
struct WorldPoint {jass::Real x,y;};
struct WorldRect {jass::Real minX,minY,maxX,maxY;};
struct PathCell {size_t index=0;std::uint8_t mask=0;};
struct DoodadAnimation {std::uint32_t type=0;std::string animation;WorldRect rectangle{};float x=0,y=0,radius=0;double started=0;bool circular=false,nearest=false,random=false;};
struct CameraScalar {
    float from=0,to=0;double started=0,duration=0;bool overridden=false;
    float value(double now) const {return duration>0?std::lerp(from,to,float(std::clamp((now-started)/duration,0.,1.))):to;}
    void set(float target,double now,double seconds){from=value(now);to=target;started=now;duration=seconds;overridden=true;}
    void sync(float value){from=to=value;duration=0;}
};
struct CameraMotion {
    float fromX=0,fromY=0,toX=0,toY=0;double started=0,duration=0;std::uint64_t revision=0;
    std::pair<float,float> value(double now) const {float t=duration>0?float(std::clamp((now-started)/duration,0.,1.)):1.f;return {std::lerp(fromX,toX,t),std::lerp(fromY,toY,t)};}
    void set(float x,float y,double now,double seconds){auto current=value(now);fromX=current.first;fromY=current.second;toX=x;toY=y;started=now;duration=seconds;++revision;}
    void sync(float x,float y){fromX=toX=x;fromY=toY=y;duration=0;}
};
struct TerrainFog {int style=0;float start=3000,end=5000,density=.5f;std::uint32_t color=0xff000000;};
struct WorldEnvironment {
    std::array<jass::Real,8> cameraBounds{};
    std::string terrainDayNight,unitDayNight;
    std::string skyModel;
    std::string altMinimapIcon;
    bool creepCampFilter=true;
    bool fogBoundary=true;
    TerrainFog terrainFog,terrainFogDefaults;
    std::array<std::uint8_t,4> waterColor{};
    bool cameraChanged=false,dayNightChanged=false,waterChanged=false;
    std::optional<WorldPoint> cameraTarget,quickPosition;
    CameraMotion cameraMotion;
    std::array<CameraScalar,7> cameraFields{{{1650,1650},{5000,5000},{304,304},{70,70},{0,0},{90,90},{0,0}}};
    std::array<float,7> cameraDefaults{1650,5000,304,70,0,90,0};
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
    std::vector<std::uint64_t> terrainChunks_;
    std::uint64_t terrainRevision_=1;
    void changeBlight(WorldRect rectangle,std::optional<WorldPoint> center,float radius,bool add);
    void dirtyBlight(unsigned x,unsigned y);
    std::optional<size_t> terrainCorner(WorldPoint point) const;
    bool pathCellFree(int x,int y,float radius,PathMovement movement) const;
    bool pathCellsConnected(int x,int y,int endX,int endY,float radius,PathMovement movement) const;
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
    void setTerrainType(WorldPoint point,std::uint32_t type,int variation,int area,int shape,const std::function<std::uint32_t()>& random);
    const auto& terrainChunks() const {return terrainChunks_;}
    void blight(WorldRect rectangle,bool add);
    void blight(WorldPoint center,float radius,bool add);
    void blightPoint(WorldPoint point,bool add);
    std::uint64_t blightRevision() const {return blightRevision_;}
    const auto& blightChunks() const {return blightChunks_;}
    void block(float x,float y);
    std::optional<size_t> pathCell(float x,float y) const;
    bool pathPointFree(WorldPoint point,float radius,PathMovement movement) const;
    bool pathSegmentFree(WorldPoint from,WorldPoint to,float radius,PathMovement movement) const;
    unsigned pathMask(WorldPoint point,std::span<const PathCell> ignored={}) const;
    bool terrainUnpathable(WorldPoint point,unsigned type) const;
    void terrainPathable(WorldPoint point,unsigned type,bool pathable);
    void footprint(std::span<const PathCell> cells,bool add);
    std::uint64_t pathingRevision() const {return pathingRevision_;}
    std::uint64_t blockingRevision() const {return blockingRevision_;}
    std::vector<WorldPoint> route(WorldPoint from,WorldPoint to,float radius,PathMovement movement) const;
    std::vector<WorldPoint> route(WorldPoint from,WorldPoint to,float radius=0,bool flying=false) const {return route(from,to,radius,flying?PathMovement::Air:PathMovement::Ground);}
    WorldEnvironment& environment() {return environment_;}
    const WorldEnvironment& environment() const {return environment_;}
    GameClock& clock() {return clock_;}
    const GameClock& clock() const {return clock_;}
};
}
