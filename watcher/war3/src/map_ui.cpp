// Author: MiYu. Source MiscUI/WorldEdit data; behavior references in docs/map-loading.md.
#include "map_ui.h"
#include "fdf.h"
#include <charconv>
#include <cmath>
#include <cctype>

namespace war3 {
namespace {
std::string trim(std::string value) {auto start=value.find_first_not_of(" \t\r");if(start==std::string::npos)return {};return value.substr(start,value.find_last_not_of(" \t\r")-start+1);}
std::string lower(std::string s) {for(auto& c:s)c=char(std::tolower(static_cast<unsigned char>(c)));return s;}
std::string field(const std::string& value,unsigned index) {size_t at=0;for(unsigned i=0;i<index;++i){auto comma=value.find(',',at);if(comma==std::string::npos)return {};at=comma+1;}return trim(value.substr(at,value.find(',',at)-at));}
unsigned integer(const std::string& value) {unsigned result=0;auto [end,error]=std::from_chars(value.data(),value.data()+value.size(),result);if(error!=std::errc{} || end!=value.data()+value.size())throw std::runtime_error("Invalid source UI integer");return result;}
}
void SourceSettings::parse(std::span<const std::uint8_t> bytes) {
    if(bytes.size()>4*1024*1024)throw std::runtime_error("Source settings exceed budget");auto text=sourceText(bytes);std::string section;size_t at=0,entries=0;
    while(at<text.size()) {auto end=text.find('\n',at);auto line=trim(text.substr(at,end==std::string::npos?end:end-at));at=end==std::string::npos?text.size():end+1;bool quoted=false;for(size_t i=0;i+1<line.size();++i){if(line[i]=='"' && (!i || line[i-1]!='\\'))quoted=!quoted;if(!quoted && line[i]=='/' && line[i+1]=='/' && (!i || std::isspace(static_cast<unsigned char>(line[i-1])))){line=trim(line.substr(0,i));break;}}if(line.empty() || line[0]==';')continue;
        if(line[0]=='['){if(line.back()!=']')throw std::runtime_error("Invalid source settings section");section=lower(trim(line.substr(1,line.size()-2)));continue;}
        auto equals=line.find('=');if(equals==std::string::npos)continue;auto name=lower(trim(line.substr(0,equals))),value=trim(line.substr(equals+1));if(value.size()>=2 && value.front()=='"' && value.back()=='"')value=value.substr(1,value.size()-2);if(++entries>65536 || name.size()>256 || value.size()>65536)throw std::runtime_error("Source settings entries exceed budget");sections_[section][std::move(name)]=std::move(value);
    }
}
void SourceSettings::load(Archives& archives,const std::string& member) {auto data=archives.read(member);if(!data)throw std::runtime_error("Missing source settings: "+member);parse(data->bytes);}
std::string SourceSettings::value(std::string section,std::string key,const std::string& fallback) const {auto s=sections_.find(lower(std::move(section)));if(s==sections_.end())return fallback;auto v=s->second.find(lower(std::move(key)));return v==s->second.end()?fallback:v->second;}
std::optional<std::string> SourceSettings::entry(std::string section,std::string key) const {auto s=sections_.find(lower(std::move(section)));if(s==sections_.end())return {};auto v=s->second.find(lower(std::move(key)));return v==s->second.end()?std::optional<std::string>{}:v->second;}
std::array<FrameAnchor,5> mapInfoAnchors() {return {{{"MinimapImage","TOP","MapInfoPane","TOP",0,-.0325f},{"SuggestedPlayersLabel","TOP","MinimapImageBackdrop","BOTTOM",0,.0115f},{"MapSizeLabel","TOP","SuggestedPlayersLabel","BOTTOM",0,-.002f},{"MapTilesetLabel","TOP","MapSizeLabel","BOTTOM",0,-.002f},{"MapDescLabel","TOP","MapTilesetLabel","BOTTOM",0,-.008f}}};}
float mapInfoTitleOffset(float nameWidth,float iconWidth,float authWidth,bool authenticated) {if(!std::isfinite(nameWidth) || !std::isfinite(iconWidth) || !std::isfinite(authWidth) || nameWidth<0 || iconWidth<0 || authWidth<0)throw std::runtime_error("Invalid map title dimensions");return (iconWidth+.0025f+nameWidth)*.5f+(authWidth+.0025f)*(authenticated?.5f:1.f);}
MapUiData::MapUiData(Archives& archives) {data_.load(archives,"UI\\WorldEditData.txt");strings_.load(archives,"UI\\WorldEditGameStrings.txt");ui_.load(archives,"UI\\MiscUI.txt");}
float MapUiData::fontHeight(const std::string& key,float fallback) const {auto s=ui_.value("FontHeights",key);if(s.empty())return fallback;size_t end=0;auto n=std::stof(s,&end);if(end!=s.size() || !std::isfinite(n) || n<=0 || n>.1f)throw std::runtime_error("Invalid source UI font height");return n;}
std::string MapUiData::sizeName(unsigned width,unsigned height) const {auto n=integer(data_.value("MapSizes","NumSizes","0"));if(n>128)throw std::runtime_error("Source map size table exceeds budget");for(unsigned i=0;i<n;++i){auto key="Size"+(i<10?std::string("0"):std::string{})+std::to_string(i),value=data_.value("MapSizes",key);if(std::uint64_t(width)*height<=integer(field(value,0))){auto label=field(value,1);return strings_.value("WorldEditStrings",label,label);}}return strings_.value("WorldEditStrings","WESTRING_UNKNOWN","?");}
std::string MapUiData::sizeName(const MapInfo& info) const {auto width=std::int64_t(info.playable[0])+info.complements[0]+info.complements[1],height=std::int64_t(info.playable[1])+info.complements[2]+info.complements[3];if(width<=0 || height<=0 || width>8192 || height>8192)return strings_.value("WorldEditStrings","WESTRING_UNKNOWN","?");return sizeName(unsigned(width),unsigned(height));}
std::string MapUiData::tilesetName(char tileset) const {auto key=field(data_.value("TileSets",std::string(1,tileset)),0);return strings_.value("WorldEditStrings",key,strings_.value("WorldEditStrings","WESTRING_UNKNOWN","?"));}
}
