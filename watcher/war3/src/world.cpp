// Author: MiYu. Native world bounds and original MiscData camera margin cells.
#include "world.h"
#include "map_ui.h"
#include <bit>
#include <charconv>
#include <cmath>
#include <sstream>

namespace war3 {
namespace {
jass::Real real(float value) {if(!std::isfinite(value))throw std::runtime_error("Non-finite world coordinate");return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
float number(jass::Real value) {auto result=std::bit_cast<float>(value.bits());if(!std::isfinite(result))throw std::runtime_error("Non-finite world coordinate");return result;}
jass::Real bounded(jass::Real value,jass::Real minimum,jass::Real maximum) {auto n=number(value);return n<number(minimum)?minimum:n>number(maximum)?maximum:value;}
}
World::World(MapData data,std::array<jass::Real,4> margins) : data_(std::move(data)),margins_(margins) {
    auto& terrain=data_.terrain;if(terrain.width<2 || terrain.height<2 || std::uint64_t(terrain.width)*terrain.height>4*1024*1024 || std::uint64_t(terrain.width)*terrain.height!=terrain.corners.size())throw std::runtime_error("World terrain dimensions disagree with corners");
    buildSurface();
    bounds_={real(terrain.origin[0]),real(terrain.origin[1]),real(terrain.origin[0]).add(jass::Real::fromInteger(int((terrain.width-1)*128))),real(terrain.origin[1]).add(jass::Real::fromInteger(int((terrain.height-1)*128)))};
    if(data_.pathing)obstacles_.resize(data_.pathing->cells.size());
    else {unsigned width=(terrain.width-1)*4,height=(terrain.height-1)*4;blightPathing_.resize(size_t(width)*height);for(unsigned y=0;y<height;++y)for(unsigned x=0;x<width;++x)if(terrain.corners[size_t((y+2)/4)*terrain.width+(x+2)/4].flags&0x20)blightPathing_[size_t(y)*width+x]=0x20;}blightChunks_.assign(size_t((terrain.width-2)/16+1)*((terrain.height-2)/16+1),1);
    if(data_.info.version==25){auto& fog=data_.info;auto& target=environment_.terrainFog;target.style=fog.useFog;target.start=fog.fogHeight[0];target.end=fog.fogHeight[1];target.density=fog.fogDensity;target.color=0xff000000u|(std::uint32_t(fog.fogColor[2])<<16)|(std::uint32_t(fog.fogColor[1])<<8)|fog.fogColor[0];}
    for(unsigned i=0;i<8;++i)environment_.cameraBounds[i]=real(data_.info.camera[i]);environment_.cameraMotion.sync((number(bounds_.minX)+number(bounds_.maxX))/2,(number(bounds_.minY)+number(bounds_.maxY))/2);auto& color=data_.info.waterColor;environment_.waterColor={color[2],color[1],color[0],color[3]};
}
std::unique_ptr<World> World::read(Archives& archives) {
    auto data=MapData::read(archives);SourceSettings settings;settings.load(archives,"UI\\MiscData.txt");if(auto overlay=archives.readCandidates({"war3mapMisc.txt"},ArchiveScope::Map))settings.parse(overlay->bytes);
    std::array<jass::Real,4> margins;unsigned i=0;for(auto key:{"left","right","top","bottom"}){auto text=settings.value("CameraMargins",key);int cells=0;auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),cells);if(error!=std::errc{} || end!=text.data()+text.size())throw std::runtime_error("Invalid source camera margin: "+std::string(key));margins[i++]=cameraMarginFromCells(cells);}
    auto result=std::make_unique<World>(std::move(data),margins);auto& reset=result->environment_.terrainFogDefaults;auto parseReal=[&](const char* key,const char* fallback){auto source=settings.value("TerrainZFog",key,fallback);size_t end=0;float value=std::stof(source,&end);if(end!=source.size() || !std::isfinite(value))throw std::runtime_error(std::string("Invalid terrain fog ")+key);return value;};auto style=settings.value("TerrainZFog","Style","0");size_t parsed=0;reset.style=std::stoi(style,&parsed);if(parsed!=style.size())throw std::runtime_error("Invalid terrain fog style");reset.start=parseReal("Start","3000");reset.end=parseReal("End","5000");reset.density=parseReal("Density","0.5");std::istringstream colors(settings.value("TerrainZFog","Color","255,0,0,0"));std::array<unsigned,4> rgba{};for(unsigned channel=0;channel<4;++channel){int value=-1;colors>>value;if(!colors || value<0 || value>255)throw std::runtime_error("Invalid terrain fog color");rgba[channel]=unsigned(value);if(channel<3){char comma=0;colors>>comma;if(comma!=',')throw std::runtime_error("Invalid terrain fog color");}}colors>>std::ws;if(!colors.eof())throw std::runtime_error("Invalid terrain fog color");reset.color=(rgba[0]<<24)|(rgba[1]<<16)|(rgba[2]<<8)|rgba[3];if(result->data_.info.version!=25)result->environment_.terrainFog=reset;for(auto [index,key]:std::initializer_list<std::pair<unsigned,const char*>>{{0,"Distance"},{1,"FarZ"},{2,"AOA"},{3,"FOV"},{5,"Rotation"},{6,"Height"}}){auto text=settings.value("Camera",key);if(!text.empty()){size_t end=0;auto value=std::stof(text,&end);if(!std::isfinite(value) || !end)throw std::runtime_error("Invalid source camera field");result->environment_.cameraFields[index].sync(value);result->environment_.cameraDefaults[index]=value;}}result->clock_=GameClock(DayNightRules::read(archives));result->resources_=archives.fork();return result;
}
Archives& World::resources() const {if(!resources_)throw std::runtime_error("World resources require archive-backed terrain");return *resources_;}
jass::Real World::cameraMarginFromCells(std::int32_t cells) {return jass::Real::fromBits(std::bit_cast<std::uint32_t>(static_cast<float>(cells)*128.f));}
jass::Real World::cameraMargin(std::uint32_t side) const {return side<margins_.size()?margins_[side]:jass::Real{};}
WorldPoint World::clamp(WorldPoint point) const {auto inset=jass::Real::fromInteger(32);return {bounded(point.x,bounds_.minX,bounds_.maxX.subtract(inset)),bounded(point.y,bounds_.minY,bounds_.maxY.subtract(inset))};}
WorldRect World::rectangle(WorldPoint first,WorldPoint second) const {first=clamp(first);second=clamp(second);return {number(first.x)<number(second.x)?first.x:second.x,number(first.y)<number(second.y)?first.y:second.y,number(first.x)>number(second.x)?first.x:second.x,number(first.y)>number(second.y)?first.y:second.y};}
}
