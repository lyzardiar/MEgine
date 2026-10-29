// Author: MiYu. Archive overlay and independent texture-reference regression checks.
#include "archive.h"
#include "binary.h"
#include "image.h"
#include "fdf.h"
#include <StormLib.h>
#include <iostream>
#include <functional>

using namespace war3;
namespace {
void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
template<class F> void rejects(F operation) { try { operation(); } catch (const std::exception&) { return; } throw std::runtime_error("Malformed input was accepted"); }
void put(Bytes& b, size_t at, unsigned value) { require(at <= b.size() && b.size()-at >= 4,"Fixture write out of bounds"); std::memcpy(b.data()+at,&value,4); }
Bytes file(const fs::path& path) { std::ifstream input(path,std::ios::binary); if (!input) throw std::runtime_error("Missing JPEG fixture"); return Bytes(std::istreambuf_iterator<char>(input),{}); }
Bytes blp1(unsigned width, unsigned height, unsigned alpha, const Bytes& data, bool jpeg = false) {
    size_t start = jpeg ? 160 : 1180; Bytes b(start+data.size()); put(b,0,tag("BLP1")); put(b,4,jpeg ? 0 : 1); put(b,8,alpha); put(b,12,width); put(b,16,height); put(b,20,4); put(b,28,unsigned(start)); put(b,92,unsigned(data.size()));
    if (!jpeg) put(b,156,0x00785634); std::memcpy(b.data()+start,data.data(),data.size()); return b;
}
Bytes bc(unsigned kind, unsigned alpha, const Bytes& data) { Bytes b(148+data.size()); put(b,0,tag("BLP2")); put(b,4,1); b[8]=2; b[9]=static_cast<unsigned char>(alpha); b[10]=static_cast<unsigned char>(kind); put(b,12,4); put(b,16,4); put(b,20,148); put(b,84,unsigned(data.size())); std::memcpy(b.data()+148,data.data(),data.size()); return b; }
void mpq(const fs::path& path, const std::vector<std::pair<std::string,std::string>>& files) {
    HANDLE archive = nullptr; require(SFileCreateArchive(path.c_str(),MPQ_CREATE_ARCHIVE_V1,32,&archive),"Create fixture MPQ failed");
    struct Close { HANDLE archive; ~Close() { SFileCloseArchive(archive); } } close{archive};
    for (const auto& [name,value] : files) { HANDLE member = nullptr; require(SFileCreateFile(archive,name.c_str(),0,static_cast<DWORD>(value.size()),0,0,&member),"Create fixture member failed"); bool written = SFileWriteFile(member,value.data(),static_cast<DWORD>(value.size()),0); bool finished = SFileFinishFile(member); require(written && finished,"Write fixture member failed"); }
}
std::string text(const std::shared_ptr<const Member>& member) { require(bool(member),"Missing member"); return {member->bytes.begin(),member->bytes.end()}; }
}
int wmain(int argc, wchar_t** argv) {
    if (argc != 3) { std::cerr << "Usage: war3_native_tests <data-root> <scratch-root>\n"; return 2; }
    unsigned passed = 0, failed = 0;
    auto test = [&](const char* name, const std::function<void()>& run) { try { run(); ++passed; std::cout << "PASS " << name << '\n'; } catch (const std::exception& error) { ++failed; std::cout << "FAIL " << name << ": " << error.what() << '\n'; } };
    try {
        Images images(fs::canonical(argv[1])); auto scratch = fs::absolute(argv[2])/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64())); require(!fs::exists(scratch),"Scratch already exists"); fs::create_directories(scratch);
        mpq(scratch/L"war3.mpq",{{"value.txt","base"},{"common.txt","common"},{"skin.tga","base-tga"}}); mpq(scratch/L"War3Patch.mpq",{{"value.txt","patch"},{"skin.blp","patch-blp"}}); mpq(scratch/L"map.w3x",{{"value.txt","map"},{"skin.blp","map-blp"}});
        test("map_overlay_and_shared_lifetime",[&] { Archives a(scratch); auto common=a.read("common.txt"); require(text(a.read("value.txt"))=="patch","Patch precedence failed"); a.mountMap(scratch/L"map.w3x"); auto member=a.read("value.txt"); require(text(member)=="map","Map precedence failed"); a.unmountMap(); require(text(a.read("value.txt"))=="patch" && text(member)=="map","Unmount lifetime failed"); require(a.read("common.txt")==common,"Common member not shared"); });
        test("texture_alias_source_precedence",[&] { Archives a(scratch); require(text(a.read("skin.tga"))=="base-tga","Base fixture missing"); require(text(a.readTexture("skin.tga"))=="patch-blp","Cached base shadowed patch alias"); a.mountMap(scratch/L"map.w3x"); require(text(a.readTexture("skin.tga"))=="map-blp","Map alias failed"); a.unmountMap(); require(text(a.readTexture("skin.tga"))=="patch-blp","Map alias survived unmount"); });
        test("archive_path_and_mount_failure",[&] { Archives a(scratch); a.mountMap(scratch/L"map.w3x"); rejects([&] { a.mountMap(scratch/L"absent.w3x"); }); require(text(a.read("value.txt"))=="map","Failed mount discarded live map"); require(!a.read("missing.txt"),"Missing member returned bytes"); rejects([&] { a.read("../value.txt"); }); });
        test("palette_alpha_reference",[&] { for (unsigned depth : {0u,1u,4u,8u}) { Bytes data(4+(4*depth+7)/8); for (size_t i=4;i<data.size();++i) data[i]=0x55; auto image=images.decode(blp1(2,2,depth,data)); unsigned alpha=depth==0 || depth==1 ? 255 : 85; require(image.pixels[0]==((alpha<<24)|0x785634),"Palette/alpha mismatch"); } });
        test("jpeg_four_raw_planes",[&] { auto b=blp1(8,8,8,file(fs::path(WAR3_FIXTURES)/"blp-jpeg-four-planes.jpg"),true); auto image=images.decode(b); unsigned expected=0x3870b0e0; for (auto pixel:image.pixels) for (unsigned shift : {0u,8u,16u,24u}) require(std::abs(int((pixel>>shift)&255)-int((expected>>shift)&255))<=2,"JPEG four raw planes changed"); });
        test("jpeg_three_raw_planes",[&] { auto b=blp1(8,8,0,file(fs::path(WAR3_FIXTURES)/"blp-jpeg-three-planes.jpg"),true); auto image=images.decode(b); unsigned expected=0xff63a848; for (auto pixel:image.pixels) for (unsigned shift : {0u,8u,16u,24u}) require(std::abs(int((pixel>>shift)&255)-int((expected>>shift)&255))<=2,"JPEG three raw planes changed"); });
        test("bc1_bc2_bc3_reference",[&] { for (unsigned kind : {0u,1u,7u}) { Bytes data(kind==0 ? 8 : 16); size_t color=kind==0 ? 0 : 8; data[color]=0; data[color+1]=0xf8; data[color+2]=0xe0; data[color+3]=7; if (kind==1) data[0]=0x21; if (kind==7) { data[0]=200; data[1]=100; } auto image=images.decode(bc(kind,kind==0 ? 0 : 8,data)); require(image.pixels[0]==((kind==0 ? 255u : kind==1 ? 17u : 200u)<<24|0xff0000),"BC reference color/alpha mismatch"); } });
        test("tga_orientation_and_rle",[&] { Bytes b(18); b[2]=2; b[12]=2; b[14]=2; b[16]=24; b.insert(b.end(),{255,0,0,0,255,0,0,0,255,255,255,255}); auto image=images.decode(b); require(image.pixels==std::vector<unsigned>({0xffff0000,0xffffffff,0xff0000ff,0xff00ff00}),"TGA orientation mismatch"); b.resize(18); b[2]=10; b.insert(b.end(),{0x83,0,0,255}); image=images.decode(b); for (auto pixel:image.pixels) require(pixel==0xffff0000,"TGA RLE mismatch"); b[18]=0x84; rejects([&] { images.decode(b); }); });
        test("image_truncation_and_budget",[&] { auto b=blp1(2,2,8,{0,0,0,0,255,255,255,255}); for (size_t n : {size_t(0),size_t(4),size_t(100),b.size()-1}) rejects([&] { images.decode(std::span(b).first(n)); }); put(b,12,0xffffffff); rejects([&] { images.decode(b); }); rejects([&] { images.decode(blp1(2,2,0,{0,0,0,0}),16); }); });
        test("binary_record_bounds",[&] { Bytes data(8); put(data,0,100); Binary b(data); rejects([&] { b.record(4); }); Bytes zero{0,0,0,0}; Binary s(zero); require(s.u32()==0,"LE reader mismatch"); rejects([&] { s.u8(); }); });
        test("fdf_original_templates_and_strings",[&] {Archives a(fs::canonical(argv[1]));FrameDefinitions d;d.load(a,"UI\\FrameDef\\GlobalStrings.fdf");d.load(a,"UI\\FrameDef\\Glue\\MainMenu.fdf");auto border=d.frame("SinglePlayerBackdrop");auto button=d.frame("SinglePlayerButton");require(std::abs(border.number("Width")-.256f)<1e-6f && std::abs(button.number("Width")-.179f)<1e-6f,"Original template width mismatch");require(button.children.size()>=4 && d.frame("ExitButton").property("ControlShortcutKey")==std::vector<std::string>{"Q"},"FDF inheritance or shortcut missing");require(d.string("KEY_SINGLE_PLAYER")!="KEY_SINGLE_PLAYER","Original localization missing");require(bool(a.read(skinValue(a,"MasterFont",""))),"Original decorated font missing");});
        test("source_text_bom_and_utf16",[&] {Bytes utf8bom={0xef,0xbb,0xbf,'a','b'};Bytes utf16={0xff,0xfe,'a',0,'b',0};require(sourceText(utf8bom)=="ab" && sourceText(utf16)=="ab","Source BOM decode failed");utf16.push_back(0);rejects([&]{sourceText(utf16);});});
        test("fdf_adjacent_quoted_frame_type",[&] {mpq(scratch/L"fdf-adjacent.w3x",{{"adjacent.fdf","Frame\"FRAME\" \"Root\" {\nFrame\"TEXT\" \"Selected\" {\n Text \"value\",\n}\n}\n"}});Archives a(scratch);a.mountMap(scratch/L"fdf-adjacent.w3x");FrameDefinitions frames;frames.load(a,"adjacent.fdf");auto root=frames.frame("Root");require(root.children.size()==1 && root.children[0].name=="Selected" && root.children[0].type=="TEXT" && root.children[0].property("Text")==std::vector<std::string>{"value"},"Adjacent quoted frame token was not parsed");});
        test("fdf_cycles_and_inheritance_bounds",[&] {mpq(scratch/L"fdf.w3x",{{"a.fdf","IncludeFile \"b.fdf\",\n"},{"b.fdf","IncludeFile \"a.fdf\",\n"},{"inherit.fdf","Frame \"FRAME\" \"A\" INHERITS \"B\" {\n}\nFrame \"FRAME\" \"B\" INHERITS \"A\" {\n}\n"}});Archives a(scratch);a.mountMap(scratch/L"fdf.w3x");FrameDefinitions cyclic;rejects([&]{cyclic.load(a,"a.fdf");});FrameDefinitions inheritance;inheritance.load(a,"inherit.fdf");rejects([&]{inheritance.frame("A");});});
        require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into independent tests");
    } catch (const std::exception& error) { std::cerr << "SETUP " << error.what() << '\n'; return 2; }
    std::cout << "RESULT passed=" << passed << " failed=" << failed << '\n'; return failed ? 1 : 0;
}
