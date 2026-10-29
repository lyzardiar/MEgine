// Author: MiYu. Play model event sounds and place source terrain splats at animated event nodes.
#include "game_view.h"
#include "slk.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cctype>

namespace war3 {
namespace {
std::string upper(std::string s){for(auto& c:s)c=char(std::toupper(static_cast<unsigned char>(c)));return s;}
std::string value(const SourceTable::Row& row,const char* key,const std::string& fallback={}){auto i=row.find(key);return i==row.end() || i->second.empty() || i->second=="_"?fallback:i->second;}
float number(const SourceTable::Row& row,const std::string& key,float fallback=0){auto raw=value(row,key.c_str());if(raw.empty())return fallback;size_t end=0;auto n=std::stof(raw,&end);if(end!=raw.size() || !std::isfinite(n))throw std::runtime_error("Invalid splat field: "+key);return n;}
unsigned count(const SourceTable::Row& row,const char* key,unsigned fallback=0){float n=number(row,key,float(fallback));if(n<0 || n>65535 || std::floor(n)!=n)throw std::runtime_error("Invalid splat integer: "+std::string(key));return unsigned(n);}
}
void GameView::modelFootprint(const std::string& code,const std::array<float,3>& position,float angle,std::uint64_t clock){
    if(!footprintDataLoaded_){auto table=SourceTable::read(data_->session->world()->resources(),"Splats\\SplatData.slk");for(auto& row:table.rows()){auto name=upper(value(row,"Name")),file=value(row,"file"),dir=value(row,"Dir");if(name.size()!=4 || file.empty() || dir.empty() || name=="INIT")continue;FootprintInfo info;info.texture=dir+"\\"+file;if(file.find_last_of('.')==std::string::npos)info.texture+=".blp";info.water=upper(value(row,"Water"));info.sound=upper(value(row,"Sound"));info.scale=number(row,"Scale");info.life=number(row,"Lifespan");info.decay=number(row,"Decay");info.rows=count(row,"Rows");info.columns=count(row,"Columns");info.blend=count(row,"BlendMode");info.lifeStart=count(row,"UVLifespanStart");info.lifeEnd=count(row,"UVLifespanEnd");info.lifeRepeat=count(row,"LifespanRepeat",1);info.decayStart=count(row,"UVDecayStart");info.decayEnd=count(row,"UVDecayEnd");info.decayRepeat=count(row,"DecayRepeat",1);if(info.scale<=0 || info.scale>100000 || info.life<0 || info.decay<0 || info.life+info.decay<=0 || info.life+info.decay>3600 || !info.rows || !info.columns || info.rows>256 || info.columns>256 || info.blend>4 || info.lifeStart>=info.rows*info.columns || info.lifeEnd>=info.rows*info.columns || info.decayStart>=info.rows*info.columns || info.decayEnd>=info.rows*info.columns)continue;unsigned i=0;for(auto prefix:{"Start","Middle","End"}){unsigned j=0;for(auto channel:{"R","G","B","A"})info.colors[i][j++]=unsigned(std::clamp(number(row,std::string(prefix)+channel,255),0.f,255.f));++i;}footprintInfo_.try_emplace(name,std::move(info));}auto tiles=SourceTable::read(data_->session->world()->resources(),"TerrainArt\\Terrain.slk");for(auto& row:tiles.rows()){auto id=value(row,"tileID");if(id.size()==4)footprintTerrain_[ObjectData::code(id)]=number(row,"footprints")!=0;}footprintDataLoaded_=true;}
    auto found=footprintInfo_.find(upper(code));if(found==footprintInfo_.end())return;auto x=position[0],y=position[1];auto waterHeight=data_->terrain->waterHeight(x,y);bool water=waterHeight && *waterHeight>data_->terrain->height(x,y)+.1f;if(water){auto alt=footprintInfo_.find(found->second.water);if(alt==footprintInfo_.end())return;found=alt;}else{WorldPoint point{jass::Real::fromBits(std::bit_cast<std::uint32_t>(x)),jass::Real::fromBits(std::bit_cast<std::uint32_t>(y))};auto terrain=data_->session->world()->terrainType(point);auto it=footprintTerrain_.find(terrain);if(it!=footprintTerrain_.end() && !it->second)return;}
    if(footprints_.size()>=8192)footprints_.erase(footprints_.begin());footprints_.push_back({&found->second,x,y,angle,clock,water});if(!found->second.sound.empty() && found->second.sound!="NULL" && found->second.sound!="INIT")data_->session->animationSound(found->second.sound,{x,y,water?*waterHeight:data_->terrain->height(x,y)});
}
void GameView::modelSounds(Model& model,ModelInstance& instance,std::uint64_t elapsed,std::uint64_t clock,const D3DMATRIX& world) {
    for(auto& event:model.soundEvents(instance,elapsed,clock,world)){auto name=upper(event.name),code=name.substr(4,4);if(failedModelSounds_.contains(name))continue;try{if(name.starts_with("FPT"))modelFootprint(code,event.position,std::atan2(world._12,world._11),clock);else data_->session->animationSound(code,event.position);}catch(const std::exception& e){failedModelSounds_.insert(name);log_.write("model_event_error="+name+" "+e.what());}}
}
}
