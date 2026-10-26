// Author: MiYu. Native world bounds and original MiscData camera margin cells.
#include "world.h"
#include "map_ui.h"
#include <bit>
#include <charconv>
#include <cmath>

namespace war3 {
namespace {
jass::Real real(float value) {if(!std::isfinite(value))throw std::runtime_error("Non-finite world coordinate");return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
float number(jass::Real value) {auto result=std::bit_cast<float>(value.bits());if(!std::isfinite(result))throw std::runtime_error("Non-finite world coordinate");return result;}
jass::Real bounded(jass::Real value,jass::Real minimum,jass::Real maximum) {auto n=number(value);return n<number(minimum)?minimum:n>number(maximum)?maximum:value;}
}
World::World(MapData data,std::array<jass::Real,4> margins) : data_(std::move(data)),margins_(margins) {
    auto& terrain=data_.terrain;if(terrain.width<2 || terrain.height<2 || std::uint64_t(terrain.width)*terrain.height>4*1024*1024 || std::uint64_t(terrain.width)*terrain.height!=terrain.corners.size())throw std::runtime_error("World terrain dimensions disagree with corners");
    bounds_={real(terrain.origin[0]),real(terrain.origin[1]),real(terrain.origin[0]).add(jass::Real::fromInteger(int((terrain.width-1)*128))),real(terrain.origin[1]).add(jass::Real::fromInteger(int((terrain.height-1)*128)))};
    for(unsigned i=0;i<8;++i)environment_.cameraBounds[i]=real(data_.info.camera[i]);auto& color=data_.info.waterColor;environment_.waterColor={color[2],color[1],color[0],color[3]};
}
std::unique_ptr<World> World::read(Archives& archives) {
    auto data=MapData::read(archives);SourceSettings settings;settings.load(archives,"UI\\MiscData.txt");if(auto overlay=archives.readCandidates({"war3mapMisc.txt"},ArchiveScope::Map))settings.parse(overlay->bytes);
    std::array<jass::Real,4> margins;unsigned i=0;for(auto key:{"left","right","top","bottom"}){auto text=settings.value("CameraMargins",key);int cells=0;auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),cells);if(error!=std::errc{} || end!=text.data()+text.size())throw std::runtime_error("Invalid source camera margin: "+std::string(key));margins[i++]=cameraMarginFromCells(cells);}
    auto result=std::make_unique<World>(std::move(data),margins);result->clock_=GameClock(DayNightRules::read(archives));result->resources_=archives.fork();return result;
}
Archives& World::resources() const {if(!resources_)throw std::runtime_error("World resources require archive-backed terrain");return *resources_;}
jass::Real World::cameraMarginFromCells(std::int32_t cells) {return jass::Real::fromBits(std::bit_cast<std::uint32_t>(static_cast<float>(cells)*128.f));}
jass::Real World::cameraMargin(std::uint32_t side) const {return side<margins_.size()?margins_[side]:jass::Real{};}
WorldPoint World::clamp(WorldPoint point) const {auto inset=jass::Real::fromInteger(32);return {bounded(point.x,bounds_.minX,bounds_.maxX.subtract(inset)),bounded(point.y,bounds_.minY,bounds_.maxY.subtract(inset))};}
WorldRect World::rectangle(WorldPoint first,WorldPoint second) const {first=clamp(first);second=clamp(second);return {number(first.x)<number(second.x)?first.x:second.x,number(first.y)<number(second.y)?first.y:second.y,number(first.x)>number(second.x)?first.x:second.x,number(first.y)>number(second.y)?first.y:second.y};}
}
