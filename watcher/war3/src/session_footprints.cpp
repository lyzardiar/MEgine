// Author: MiYu. Shared archive-backed footprint images and counted terrain occupancy for buildings and destructables.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
const Image* ScriptSession::footprintImage(const std::string& path) {
    if(path.empty() || path=="_" || path=="none")return nullptr;auto found=pathImages_.find(path);if(found!=pathImages_.end())return &found->second;auto member=requireWorld().resources().read(path);if(!member)throw std::runtime_error("Missing pathing texture: "+path);Image image;if(member->bytes.size()>=4 && member->bytes[0]=='B' && member->bytes[1]=='L' && member->bytes[2]=='P'){if(!pathDecoder_)pathDecoder_=std::make_unique<Images>(requireWorld().resources().root());image=pathDecoder_->decode(member->bytes);}else image=decodeTga(member->bytes);if(image.width>256 || image.height>256 || pathImages_.size()>=4096)throw std::runtime_error("Footprint texture budget exceeded");auto bytes=image.pixels.size()*4;if(bytes>64*1024*1024-pathImageBytes_)throw std::runtime_error("Pathing image budget exceeded");pathImageBytes_+=bytes;return &pathImages_.emplace(path,std::move(image)).first->second;
}
std::vector<PathCell> ScriptSession::pathFootprint(const std::string& path,WorldPoint point,float angle) {
    auto image=footprintImage(path);if(!image)return {};float cosine=std::cos(angle),sine=std::sin(angle);std::map<size_t,unsigned> cells;for(unsigned y=0;y<image->height;++y)for(unsigned x=0;x<image->width;++x){auto color=image->pixels[size_t(y)*image->width+x];unsigned mask=((color>>16)&255?2:0)|((color>>8)&255?4:0)|(color&255?8:0);if(!mask)continue;float dx=(float(x)+.5f-float(image->width)/2)*32,dy=(float(image->height)/2-float(y)-.5f)*32;auto index=requireWorld().pathCell(number(point.x)+dx*cosine-dy*sine,number(point.y)+dx*sine+dy*cosine);if(index)cells[*index]|=mask;}std::vector<PathCell> result;result.reserve(cells.size());for(auto [index,mask]:cells)result.push_back({index,std::uint8_t(mask)});return result;
}
void ScriptSession::replaceFootprint(std::vector<PathCell>& current,std::vector<PathCell> next) {
    if(current.size()==next.size() && std::equal(next.begin(),next.end(),current.begin(),[](auto a,auto b){return a.index==b.index && a.mask==b.mask;}))return;if(next.size()>8000000-(footprintCells_-current.size()))throw std::runtime_error("Live footprint budget exceeded");footprintCells_=footprintCells_-current.size()+next.size();if(!current.empty())requireWorld().footprint(current,false);if(!next.empty())requireWorld().footprint(next,true);current=std::move(next);
}
void ScriptSession::unitFootprint(UnitState& u) {auto next=u.building && u.pathing && !u.removing && std::bit_cast<float>(u.life.bits())>0?pathFootprint(definitions().field(u.type,"UnitData","pathTex"),{u.x,u.y},buildingAngle()*3.14159265359f/180):std::vector<PathCell>{};replaceFootprint(u.footprint,std::move(next));}
}
