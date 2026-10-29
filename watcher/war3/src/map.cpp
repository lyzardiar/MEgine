// Author: MiYu. Bounded W3I18/25, W3E11, WPM0 and WTS; format provenance in docs/map-loading.md.
#include "map.h"
#include "binary.h"
#include "fdf.h"
#include <charconv>
#include <cctype>

namespace war3 {
namespace {
std::string trim(std::string value) {auto first=value.find_first_not_of(" \t\r");if(first==std::string::npos)return {};return value.substr(first,value.find_last_not_of(" \t\r")-first+1);}
unsigned integer(std::string_view value) {unsigned result=0;auto [end,error]=std::from_chars(value.data(),value.data()+value.size(),result);if(error!=std::errc{} || end!=value.data()+value.size())throw std::runtime_error("Invalid WTS string id");return result;}
std::string text(Binary& b) {auto raw=b.cstring();return sourceText({reinterpret_cast<const std::uint8_t*>(raw.data()),raw.size()});}
std::array<float,2> point(Binary& b) {return {b.f32(),b.f32()};}
std::array<std::uint8_t,4> color(Binary& b) {auto value=b.take(4);return {value[0],value[1],value[2],value[3]};}
std::string extension(const fs::path& path) {auto ext=path.extension().wstring();for(auto& c:ext)c=wchar_t(towlower(c));return utf8(ext);}
}
std::optional<MapHeader> MapHeader::parse(std::span<const std::uint8_t> bytes) {
    if(bytes.size()<4 || std::memcmp(bytes.data(),"HM3W",4))return std::nullopt;if(bytes.size()>512)bytes=bytes.first(512);Binary b(bytes);b.expect(tag("HM3W"));MapHeader m;m.reserved=b.u32();m.name=text(b);m.flags=b.u32();m.players=b.u32();if(m.players>16)throw std::runtime_error("Invalid classic map header player count");return m;
}
std::optional<MapHeader> MapHeader::read(const fs::path& path) {std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("Cannot read map header");Bytes b(512);file.read(reinterpret_cast<char*>(b.data()),static_cast<std::streamsize>(b.size()));if(file.bad())throw std::runtime_error("Cannot read map header");b.resize(size_t(file.gcount()));return parse(b);}
MapStrings mapStrings(std::span<const std::uint8_t> bytes) {
    if(bytes.size()>16*1024*1024)throw std::runtime_error("WTS exceeds source budget");auto source=sourceText(bytes);MapStrings result;size_t at=0;int state=0;unsigned id=0;std::string value;
    while(at<source.size()) {
        auto end=source.find('\n',at);auto line=source.substr(at,end==std::string::npos?end:end-at);at=end==std::string::npos?source.size():end+1;if(!line.empty() && line.back()=='\r')line.pop_back();
        auto clean=trim(line);
        if(state==2) {if(clean=="}") {if(!value.empty())value.pop_back();if(!result.emplace(id,std::move(value)).second)throw std::runtime_error("Duplicate WTS string id");value.clear();state=0;}else {value+=line;value+='\n';}continue;}
        auto comment=clean.find("//");if(comment!=std::string::npos)clean=trim(clean.substr(0,comment));if(clean.empty())continue;
        if(state==1) {if(clean!="{")throw std::runtime_error("Expected WTS opening brace");state=2;continue;}
        if(!clean.starts_with("STRING") || clean.size()<8 || !std::isspace(static_cast<unsigned char>(clean[6])))throw std::runtime_error("Invalid WTS declaration");id=integer(trim(clean.substr(7)));if(result.size()>=100000)throw std::runtime_error("WTS string count exceeds budget");state=1;
    }
    if(state)throw std::runtime_error("Truncated WTS string table");return result;
}
std::string mapString(const std::string& value,const MapStrings& strings) {if(!value.starts_with("TRIGSTR_") || value.size()==8)return value;auto id=value.substr(8);if(!std::all_of(id.begin(),id.end(),[](unsigned char c){return c>='0' && c<='9';}))return value;auto found=strings.find(integer(id));return found==strings.end()?value:found->second;}
unsigned MapInfo::playablePlayers() const {return static_cast<unsigned>(std::count_if(players.begin(),players.end(),[](auto& p){return p.type==1 || p.type==2;}));}
unsigned MapInfo::humanPlayers() const {return static_cast<unsigned>(std::count_if(players.begin(),players.end(),[](auto& p){return p.type==1;}));}
MapInfo MapInfo::parse(std::span<const std::uint8_t> bytes,const MapStrings& strings) {
    Binary b(bytes);MapInfo m;m.version=b.u32();if(m.version!=18 && m.version!=25)throw std::runtime_error("Unsupported classic W3I version");m.saves=b.u32();m.editor=b.u32();
    auto string=[&] {return mapString(text(b),strings);};m.name=string();m.author=string();m.description=string();m.recommendedPlayers=string();
    for(auto& n:m.camera)n=b.f32();for(auto& n:m.complements)n=b.i32();for(auto& n:m.playable){n=b.u32();if(!n || n>8192)throw std::runtime_error("Invalid W3I playable dimensions");}
    m.flags=b.u32();m.tileset=char(b.u8());m.background=b.i32();if(m.version==25)m.loadingModel=text(b);m.loadingText=string();m.loadingTitle=string();m.loadingSubtitle=string();m.loadingScreen=b.i32();
    if(m.version==25)m.prologueModel=text(b);m.prologueText=string();m.prologueTitle=string();m.prologueSubtitle=string();
    if(m.version==25){m.useFog=b.i32();m.fogHeight=point(b);m.fogDensity=b.f32();m.fogColor=color(b);auto weather=b.take(4);m.weather=(unsigned(weather[0])<<24)|(unsigned(weather[1])<<16)|(unsigned(weather[2])<<8)|unsigned(weather[3]);m.soundEnvironment=text(b);m.lightEnvironment=char(b.u8());m.waterColor=color(b);}
    auto players=b.count(33,16);unsigned ids=0;for(unsigned i=0;i<players;++i) {MapPlayer p;p.id=b.i32();p.type=b.i32();p.race=b.i32();p.fixedStart=b.i32();p.name=string();p.start=point(b);p.allyLow=b.u32();p.allyHigh=b.u32();if(p.id<0 || p.id>=16 || (ids&(1u<<p.id)))throw std::runtime_error("Invalid or duplicate W3I player id");ids|=1u<<p.id;m.players.push_back(std::move(p));}
    auto forces=b.count(9,16);for(unsigned i=0;i<forces;++i){MapForce f;f.flags=b.u32();f.players=b.u32();f.name=string();m.forces.push_back(std::move(f));}
    if(!b.left() || (b.left()==1 && b.u8()==0xff)){m.omittedEditorTables=true;return m;}
    auto upgrades=b.count(16,65536);for(unsigned i=0;i<upgrades;++i)m.upgrades.push_back({b.u32(),b.u32(),b.i32(),b.i32()});
    auto technologies=b.count(8,65536);for(unsigned i=0;i<technologies;++i)m.technologies.push_back({b.u32(),b.u32()});
    auto tables=b.count(13,4096);for(unsigned i=0;i<tables;++i) {MapUnitTable t;t.id=b.i32();t.name=string();auto columns=b.count(4,256);for(unsigned j=0;j<columns;++j)t.columns.push_back(b.i32());auto units=b.count(4+4*columns,65536);for(unsigned j=0;j<units;++j){MapRandomUnit u;u.chance=b.i32();for(unsigned k=0;k<columns;++k)u.ids.push_back(b.u32());t.units.push_back(std::move(u));}m.randomUnits.push_back(std::move(t));}
    if(m.version==25){tables=b.count(9,4096);for(unsigned i=0;i<tables;++i){MapItemTable t;t.id=b.i32();t.name=string();auto sets=b.count(4,4096);for(unsigned j=0;j<sets;++j){std::vector<MapRandomItem> items;auto n=b.count(8,65536);for(unsigned k=0;k<n;++k)items.push_back({b.i32(),b.u32()});t.sets.push_back(std::move(items));}m.randomItems.push_back(std::move(t));}}
    b.finish();return m;
}
MapTerrain MapTerrain::parse(std::span<const std::uint8_t> bytes) {
    Binary b(bytes);b.expect(tag("W3E!"));b.expect(11);MapTerrain m;m.tileset=char(b.u8());m.customTileset=b.u32();auto n=b.count(4,16);for(unsigned i=0;i<n;++i)m.groundTiles.push_back(b.u32());n=b.count(4,16);for(unsigned i=0;i<n;++i)m.cliffTiles.push_back(b.u32());
    m.width=b.u32();m.height=b.u32();m.origin=point(b);auto count=std::uint64_t(m.width)*m.height;if(m.width<2 || m.height<2 || count>4*1024*1024 || count*7!=b.left())throw std::runtime_error("Invalid W3E vertex payload");
    m.corners.reserve(static_cast<size_t>(count));for(size_t i=0;i<count;++i)m.corners.push_back({std::bit_cast<std::int16_t>(b.u16()),b.u16(),b.u8(),b.u8(),b.u8()});return m;
}
MapPathing MapPathing::parse(std::span<const std::uint8_t> bytes) {Binary b(bytes);b.expect(tag("MP3W"));b.expect(0);MapPathing m;m.width=b.u32();m.height=b.u32();auto count=std::uint64_t(m.width)*m.height;if(!m.width || !m.height || count>64*1024*1024 || count!=b.left())throw std::runtime_error("Invalid WPM cell payload");auto cells=b.take(static_cast<size_t>(count));m.cells.assign(cells.begin(),cells.end());return m;}
MapData MapData::read(Archives& archives) {
    auto w3i=archives.read("war3map.w3i"),w3e=archives.read("war3map.w3e");if(!w3i || !w3e)throw std::runtime_error("Map is missing W3I or W3E");MapStrings strings;if(auto wts=archives.read("war3map.wts"))strings=mapStrings(wts->bytes);
    MapData m;m.info=MapInfo::parse(w3i->bytes,strings);m.terrain=MapTerrain::parse(w3e->bytes);if(auto wpm=archives.read("war3map.wpm")){m.pathing=MapPathing::parse(wpm->bytes);if(m.pathing->width!=(m.terrain.width-1)*4 || m.pathing->height!=(m.terrain.height-1)*4)throw std::runtime_error("WPM dimensions disagree with terrain");}return m;
}
std::vector<MapEntry> mapDirectory(const fs::path& directory) {
    std::vector<MapEntry> result;for(auto& item:fs::directory_iterator(directory,fs::directory_options::skip_permission_denied)) {if(result.size()>=10000)throw std::runtime_error("Map directory exceeds entry budget");std::error_code error;auto status=item.symlink_status(error);if(error || fs::is_symlink(status) || (GetFileAttributesW(item.path().c_str())&FILE_ATTRIBUTE_REPARSE_POINT))continue;bool folder=fs::is_directory(status);auto ext=extension(item.path());if(folder || (fs::is_regular_file(status) && (ext==".w3m" || ext==".w3x")))result.push_back({item.path(),folder});}
    std::sort(result.begin(),result.end(),[](auto& a,auto& b){if(a.directory!=b.directory)return a.directory;return CompareStringOrdinal(a.path.filename().c_str(),-1,b.path.filename().c_str(),-1,TRUE)==CSTR_LESS_THAN;});return result;
}
}
