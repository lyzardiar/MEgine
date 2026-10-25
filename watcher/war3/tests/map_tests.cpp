// Author: MiYu. Focused classic-map records, malformed sources and real archive checks.
#include "map.h"
#include "binary.h"
#include <functional>
#include <iostream>

using namespace war3;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
template<class F> void rejects(F run) {try{run();}catch(const std::exception&){return;}throw std::runtime_error("Malformed map accepted");}
struct Source {
    Bytes b;
    void u32(unsigned n) {for(unsigned i=0;i<4;++i)b.push_back(std::uint8_t(n>>(8*i)));}
    void f32(float n) {u32(std::bit_cast<unsigned>(n));}
    void text(std::string_view s) {b.insert(b.end(),s.begin(),s.end());b.push_back(0);}
    void zeros(unsigned count) {for(unsigned i=0;i<count;++i)u32(0);}
};
Bytes info(unsigned version,bool omitted=false) {
    Source s;s.u32(version);s.u32(7);s.u32(6059);for(auto value:{"TRIGSTR_007","Author","Description","2 players"})s.text(value);s.zeros(12);s.u32(2);s.u32(1);s.u32(0);s.b.push_back('L');s.u32(0xffffffff);if(version==25)s.text("Loading.mdx");for(auto value:{"Text","Title","Subtitle"})s.text(value);s.u32(0xffffffff);if(version==25)s.text("");for(auto value:{"Prologue","Title","Subtitle"})s.text(value);if(version==25){s.zeros(5);s.u32(0);s.text("");s.b.push_back('L');s.u32(0xffffffff);}
    s.u32(2);for(unsigned id=0;id<2;++id){s.u32(id);s.u32(1);s.u32(id+1);s.u32(1);s.text("Player");s.f32(float(id*128));s.f32(64);s.u32(0);s.u32(0);}s.u32(1);s.u32(3);s.u32(3);s.text("Team");
    if(omitted){s.b.push_back(0xff);return s.b;}
    s.u32(1);s.u32(3);s.u32(tag("Rhme"));s.u32(2);s.u32(1);s.u32(1);s.u32(3);s.u32(tag("hfoo"));
    s.u32(1);s.u32(1);s.text("Units");s.u32(2);s.u32(0);s.u32(1);s.u32(1);s.u32(100);s.u32(tag("hfoo"));s.u32(tag("hpea"));
    if(version==25){s.u32(1);s.u32(2);s.text("Items");s.u32(1);s.u32(1);s.u32(100);s.u32(tag("ratf"));}return s.b;
}
Bytes terrain() {Source s;s.u32(tag("W3E!"));s.u32(11);s.b.push_back('L');s.u32(0);s.u32(1);s.u32(tag("Ldrt"));s.u32(1);s.u32(tag("CLdi"));s.u32(3);s.u32(2);s.f32(-128);s.f32(-64);for(unsigned i=0;i<6;++i)s.b.insert(s.b.end(),{0,32,0,32,0x40,0x21,2});return s.b;}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=3){std::cerr<<"Usage: war3_map_tests <data-root> <scratch-directory>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    test("w3i_classic_full_tables",[]{for(unsigned v:{18u,25u}){auto m=MapInfo::parse(info(v),{{7,"Map title"}});require(m.name=="Map title" && m.playablePlayers()==2 && m.players[1].start[0]==128,"Header or players differ");require(m.forces.size()==1 && m.upgrades[0].level==2 && m.technologies[0].id==tag("hfoo"),"Rules differ");require(m.randomUnits[0].units[0].ids[1]==tag("hpea"),"Random units differ");require(v==18 || m.randomItems[0].sets[0][0].id==tag("ratf"),"Random items differ");require(!m.omittedEditorTables,"Full tail lost");}});
    test("w3i_omitted_editor_tables",[]{for(unsigned v:{18u,25u}){auto b=info(v,true);require(MapInfo::parse(b).omittedEditorTables,"Omitted tail not recorded");b.pop_back();require(MapInfo::parse(b).omittedEditorTables,"Empty tail rejected");}});
    test("wts_source_strings",[]{std::string s="\xef\xbb\xbf// table\r\nSTRING 0007\r\n{\r\nFirst line\r\n// retained text\r\n}\r\n";auto strings=mapStrings({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});require(mapString("TRIGSTR_007",strings)=="First line\n// retained text","String whitespace lost");require(mapString("TRIGSTR_008",strings)=="TRIGSTR_008","Unresolved reference changed");s+="STRING 7\n{\nx\n}\n";rejects([&]{mapStrings({reinterpret_cast<const std::uint8_t*>(s.data()),s.size()});});});
    test("terrain_and_pathing_source_bits",[]{auto t=MapTerrain::parse(terrain());require(t.width==3 && t.height==2 && t.origin[0]==-128 && t.corners[0].ground==8192 && t.corners[0].flags==0x40 && t.corners[0].variation==0x21,"Terrain bits changed");Source p;p.u32(tag("MP3W"));p.u32(0);p.u32(8);p.u32(4);p.b.insert(p.b.end(),32,0xa5);auto w=MapPathing::parse(p.b);require(w.cells.size()==32 && w.cells[0]==0xa5,"Path flags changed");p.b.pop_back();rejects([&]{MapPathing::parse(p.b);});});
    test("map_record_truncation_and_versions",[]{auto i=info(25);for(auto n:{size_t(0),size_t(4),size_t(20),i.size()-1})rejects([&]{MapInfo::parse(std::span(i).first(n));});i[0]=31;rejects([&]{MapInfo::parse(i);});auto t=terrain();t.back()=0xff;require(MapTerrain::parse(t).corners.back().cliff==0xff,"Reserved terrain bits discarded");t.pop_back();rejects([&]{MapTerrain::parse(t);});t=terrain();t[29]=255;t[30]=255;t[31]=255;t[32]=127;rejects([&]{MapTerrain::parse(t);});});
    test("map_directory_lazy_order",[&]{auto scratch=fs::absolute(argv[2])/(L"directory-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));fs::create_directories(scratch/L"Folder");for(auto name:{L"z.w3x",L"a.W3M",L"skip.txt"}){std::ofstream f(scratch/name);f<<"not an archive";}auto entries=mapDirectory(scratch);require(entries.size()==3 && entries[0].directory && entries[1].path.filename()==L"a.W3M","Directory ordering or filtering differs");});
    for(auto name:{L"Maps/FrozenThrone/(2)Amazonia.w3x",L"Maps/(2)BootyBay.w3m",L"Maps/Download/DotA_v6.83d.w3x"})test(utf8(name).c_str(),[&]{Archives archives(argv[1]);archives.mountMap(fs::path(argv[1])/name);auto m=MapData::read(archives);require(!m.info.name.empty() && !m.info.name.starts_with("TRIGSTR_"),"Map title unresolved");require(m.terrain.corners.size()==size_t(m.terrain.width)*m.terrain.height,"Corner count differs");std::cout<<"MAP name="<<m.info.name<<" version="<<m.info.version<<" vertices="<<m.terrain.width<<'x'<<m.terrain.height<<" players="<<m.info.players.size()<<" playable="<<m.info.playablePlayers()<<" forces="<<m.info.forces.size()<<" omitted="<<m.info.omittedEditorTables<<'\n';archives.unmountMap();});
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
