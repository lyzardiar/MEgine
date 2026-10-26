// Author: MiYu. Shared archive ownership, concurrent readers and map cache release.
#include "archive.h"
#include "world.h"
#include <StormLib.h>
#include <functional>
#include <future>
#include <iostream>

using namespace war3;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
void mpq(const fs::path& path,const std::vector<std::pair<std::string,std::string>>& entries) {
    HANDLE archive=nullptr;require(SFileCreateArchive(path.c_str(),MPQ_CREATE_ARCHIVE_V1,32,&archive),"Cannot create archive fixture");struct Close {HANDLE value;~Close(){SFileCloseArchive(value);}} close{archive};
    for(auto& [name,value]:entries){HANDLE member=nullptr;require(SFileCreateFile(archive,name.c_str(),0,DWORD(value.size()),0,MPQ_FILE_COMPRESS,&member),"Cannot create archive fixture member");bool written=SFileWriteFile(member,value.data(),DWORD(value.size()),MPQ_COMPRESSION_ZLIB),finished=SFileFinishFile(member);require(written && finished,"Cannot write archive fixture member");}
}
std::string text(std::shared_ptr<const Member> member) {require(bool(member),"Missing archive member");return {member->bytes.begin(),member->bytes.end()};}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=3){std::cerr<<"Usage: war3_archive_tests <scratch-root> <data-root>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    try {
        auto scratch=fs::absolute(argv[1])/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));require(!fs::exists(scratch),"Archive scratch already exists");fs::create_directories(scratch);
        mpq(scratch/L"war3.mpq",{{"value.txt","base"},{"common.txt","common"},{"skin.tga","base-tga"},{"Scripts\\common.j","public script"}});mpq(scratch/L"War3Patch.mpq",{{"value.txt","patch"},{"skin.blp","patch-blp"}});mpq(scratch/L"one.w3x",{{"value.txt","one"},{"skin.blp","map-blp"},{"Scripts\\common.j","map script"},{"a.bin",std::string(9*1024*1024,'a')},{"b.bin",std::string(9*1024*1024,'b')}});mpq(scratch/L"two.w3x",{{"value.txt","two"}});
        test("archive_common_views_share_members",[&]{Archives a(scratch),b(scratch);auto first=a.read("common.txt");require(b.read("COMMON.TXT")==first && a.fork()->read("common.txt")==first,"Common store decoded one member more than once");require(a.commonCount()==2 && a.root()==fs::canonical(scratch) && a.mapPath().empty(),"Archive view identity differs");});
        test("archive_fork_retains_map_and_isolates_switches",[&]{Archives a(scratch);a.mountMap(scratch/L"one.w3x");auto one=a.read("value.txt");auto fork=a.fork();a.mountMap(scratch/L"two.w3x");require(text(a.read("value.txt"))=="two" && fork->read("value.txt")==one && fork->mapPath()==scratch/L"one.w3x","Changing one view changed another map");a.unmountMap();require(text(a.read("value.txt"))=="patch" && text(fork->read("value.txt"))=="one","Unmount invalidated retained map");});
        test("archive_final_map_view_releases_cache",[&]{Archives a(scratch);a.mountMap(scratch/L"one.w3x");auto fork=a.fork();std::weak_ptr<const Member> weak=a.read("value.txt");a.unmountMap();require(!weak.expired(),"Map cache released while a view remained");fork.reset();require(weak.expired(),"Map cache survived its final owning view");});
        test("archive_scope_alias_and_failed_mount",[&]{Archives a(scratch);require(text(a.readTexture("skin.tga"))=="patch-blp","Patch alias precedence differs");a.mountMap(scratch/L"one.w3x");require(text(a.readTexture("skin.tga"))=="map-blp" && text(a.readCandidates({"Scripts/common.j"},ArchiveScope::Common))=="public script" && text(a.readCandidates({"Scripts/common.j"},ArchiveScope::Map))=="map script","Source scope or map alias differs");bool rejected=false;try{a.mountMap(scratch/L"missing.w3x");}catch(const std::exception&){rejected=true;}require(rejected && text(a.read("value.txt"))=="one","Failed mount discarded current map");require(!a.readCandidates({"common.txt"},ArchiveScope::Map),"Map scope fell back to public member");});
        test("archive_concurrent_forks_share_cache",[&]{Archives a(scratch);a.mountMap(scratch/L"one.w3x");std::vector<std::future<std::pair<std::shared_ptr<const Member>,std::shared_ptr<const Member>>>> readers;for(unsigned i=0;i<8;++i)readers.push_back(std::async(std::launch::async,[view=a.fork()](){std::shared_ptr<const Member> common,map;for(unsigned n=0;n<128;++n){common=view->read("common.txt");map=view->read("value.txt");require(text(common)=="common" && text(map)=="one","Concurrent archive contents changed");}return std::make_pair(common,map);}));auto expected=readers.front().get();for(size_t i=1;i<readers.size();++i){auto result=readers[i].get();require(result==expected,"Concurrent readers decoded duplicate shared members");}});
        test("archive_map_lru_retains_external_bytes",[&]{Archives a(scratch);a.read("common.txt");auto commonBytes=a.cachedBytes();a.mountMap(scratch/L"one.w3x");auto first=a.read("a.bin");auto second=a.read("b.bin");require(a.cachedBytes()<=commonBytes+16*1024*1024 && first->bytes.front()=='a' && second->bytes.back()=='b',"Map cache budget or external member lifetime differs");auto again=a.read("a.bin");require(again!=first && again->bytes==first->bytes,"Evicted member did not reload correctly");a.unmountMap();require(a.cachedBytes()==commonBytes && first->bytes.size()==9*1024*1024,"Map cache remained after unmount or released live bytes");});
        test("archive_world_retains_source_reader",[&]{Archives source(argv[2]);auto path=fs::path(argv[2])/L"Maps/(2)BootyBay.w3m";source.mountMap(path);auto world=World::read(source);auto before=source.readCandidates({"war3map.w3e"},ArchiveScope::Map);source.unmountMap();require(world->resources().mapPath()==path && world->resources().readCandidates({"war3map.w3e"},ArchiveScope::Map)==before,"World lost its map resource view after loader unmount");require(world->resources().read("Scripts/common.j")==source.read("Scripts/common.j"),"World and source did not share public script bytes");});
    }catch(const std::exception& e){std::cerr<<"SETUP "<<e.what()<<'\n';return 2;}
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into archive checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
