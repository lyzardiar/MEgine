// Author: MiYu. Bounded in-memory W3GS map integrity calculation with a read-only Maps boundary.
// Algorithm reference: GHost++ map.cpp d25ec63c67330308d93a4f9912c0072f0c034ebf (Apache-2.0),
// https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/map.cpp
// This implementation is independent; compatibility with Warcraft III 1.27 remains to be verified.
#include "lan_mapcheck.h"
#include <bcrypt.h>
#include <algorithm>
#include <atomic>
#include <bit>
#include <condition_variable>
#include <cwctype>
#include <limits>
#include <thread>

namespace war3 {
namespace {
bool equal(const std::wstring& a,const std::wstring& b){return CompareStringOrdinal(a.c_str(),int(a.size()),b.c_str(),int(b.size()),TRUE)==CSTR_EQUAL;}
bool within(const fs::path& root,const fs::path& path){auto parent=root.wstring(),child=path.wstring();if(parent.empty())return false;if(parent.back()!=L'\\')parent+=L'\\';return child.size()>parent.size() && CompareStringOrdinal(parent.c_str(),int(parent.size()),child.c_str(),int(parent.size()),TRUE)==CSTR_EQUAL;}
fs::path resolveMap(const fs::path& root,std::string_view advertised) {
    if(advertised.empty() || advertised.size()>1024 || advertised.find('\0')!=std::string_view::npos)throw std::runtime_error("Invalid LAN map path");
    std::wstring value;try{value=wide(advertised);}catch(const std::exception&){int n=MultiByteToWideChar(CP_ACP,MB_ERR_INVALID_CHARS,advertised.data(),int(advertised.size()),nullptr,0);if(!n)throw std::runtime_error("Invalid LAN map path encoding");value.resize(n);if(!MultiByteToWideChar(CP_ACP,MB_ERR_INVALID_CHARS,advertised.data(),int(advertised.size()),value.data(),n))throw std::runtime_error("Invalid LAN map path encoding");}
    for(auto& c:value){if(c==L'/')c=L'\\';if(c<L' ' || c==L':')throw std::runtime_error("Invalid LAN map path character");}fs::path relative(value);if(relative.empty() || relative.has_root_path())throw std::runtime_error("LAN map path must be relative");auto at=relative.begin();if(at==relative.end() || !equal(at->wstring(),L"Maps"))throw std::runtime_error("LAN map path must begin with Maps");fs::path tail;for(++at;at!=relative.end();++at){auto part=at->wstring();if(part.empty() || part==L"." || part==L".." || part.back()==L'.' || part.back()==L' ')throw std::runtime_error("Invalid LAN map component");tail/=*at;}if(tail.empty())throw std::runtime_error("LAN map path has no file");auto maps=fs::canonical(root/L"Maps"),resolved=fs::canonical(maps/tail);if(!within(maps,resolved) || !fs::is_regular_file(resolved))throw std::runtime_error("LAN map escapes Maps directory");auto ext=resolved.extension().wstring();for(auto& c:ext)c=std::towlower(c);if(ext!=L".w3m" && ext!=L".w3x")throw std::runtime_error("Unsupported LAN map extension");return resolved;
}
constexpr auto crcTable(){std::array<std::uint32_t,256> result{};for(unsigned i=0;i<result.size();++i){std::uint32_t value=i;for(unsigned bit=0;bit<8;++bit)value=(value>>1)^(0xedb88320u & (0u-(value&1u)));result[i]=value;}return result;}
void checkCanceled(const std::atomic_bool* canceled){if(canceled && canceled->load(std::memory_order_acquire))throw std::runtime_error("LAN map verification canceled");}
std::pair<fs::path,std::shared_ptr<const Bytes>> readSnapshotFile(fs::path path,const std::atomic_bool* canceled){
    checkCanceled(canceled);struct File {HANDLE handle=INVALID_HANDLE_VALUE;~File(){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);}} file{CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_SEQUENTIAL_SCAN|FILE_FLAG_OPEN_REPARSE_POINT,nullptr)};
    if(file.handle==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot open LAN map snapshot: "+winError());LARGE_INTEGER size{};if(!GetFileSizeEx(file.handle,&size) || size.QuadPart<=0 || size.QuadPart>256ll*1024*1024)throw std::runtime_error("Invalid LAN map snapshot size");
    BY_HANDLE_FILE_INFORMATION info{};if(!GetFileInformationByHandle(file.handle,&info) || (info.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT)))throw std::runtime_error("Invalid LAN map snapshot file");
    auto bytes=std::make_shared<Bytes>(size_t(size.QuadPart));size_t at=0;while(at<bytes->size()){checkCanceled(canceled);auto chunk=DWORD(std::min<size_t>(65536,bytes->size()-at));DWORD read=0;if(!ReadFile(file.handle,bytes->data()+at,chunk,&read,nullptr) || read!=chunk)throw std::runtime_error("Incomplete LAN map snapshot read");at+=read;}checkCanceled(canceled);return {std::move(path),std::move(bytes)};
}
std::pair<fs::path,std::shared_ptr<const Bytes>> readSnapshot(const fs::path& root,std::string_view advertised,const std::atomic_bool* canceled){return readSnapshotFile(resolveMap(root,advertised),canceled);}
void checkMemory(const std::shared_ptr<const Bytes>& bytes,std::string_view label){if(!bytes || bytes->empty() || bytes->size()>256u*1024u*1024u || label.empty() || label.size()>1024 || label.find('\0')!=std::string_view::npos)throw std::runtime_error("Invalid in-memory LAN map");}
std::uint32_t memoryCrc(std::span<const std::uint8_t> bytes,const std::atomic_bool* canceled){static constexpr auto table=crcTable();std::uint32_t crc=0xffffffffu;for(size_t at=0;at<bytes.size();){checkCanceled(canceled);auto end=at+std::min<size_t>(65536,bytes.size()-at);for(;at<end;++at)crc=(crc>>8)^table[(crc^bytes[at])&255u];}return crc^0xffffffffu;}
std::uint32_t fileCrc(const fs::path& path,std::uint32_t& size,const std::atomic_bool* canceled){static constexpr auto table=crcTable();std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("Cannot read LAN map file");std::array<char,65536> buffer{};std::uint64_t count=0;std::uint32_t crc=0xffffffffu;while(file){checkCanceled(canceled);file.read(buffer.data(),std::streamsize(buffer.size()));auto read=file.gcount();if(read<0 || count+std::uint64_t(read)>std::numeric_limits<std::uint32_t>::max())throw std::runtime_error("LAN map exceeds protocol size");count+=std::uint64_t(read);for(std::streamsize i=0;i<read;++i)crc=(crc>>8)^table[(crc^std::uint8_t(buffer[size_t(i)]))&255u];}if(file.bad() || !file.eof() || !count)throw std::runtime_error("Incomplete LAN map file read");size=std::uint32_t(count);return crc^0xffffffffu;}
std::uint32_t xorRotate(std::span<const std::uint8_t> data){std::uint32_t value=0;size_t i=0;while(data.size()-i>=4){auto word=std::uint32_t(data[i])|(std::uint32_t(data[i+1])<<8)|(std::uint32_t(data[i+2])<<16)|(std::uint32_t(data[i+3])<<24);value=std::rotl(value^word,3);i+=4;}while(i<data.size())value=std::rotl(value^data[i++],3);return value;}
class Sha1 {
    BCRYPT_ALG_HANDLE algorithm_=nullptr;BCRYPT_HASH_HANDLE hash_=nullptr;
public:
    Sha1(){if(BCryptOpenAlgorithmProvider(&algorithm_,BCRYPT_SHA1_ALGORITHM,nullptr,0)<0)throw std::runtime_error("SHA-1 unavailable");if(BCryptCreateHash(algorithm_,&hash_,nullptr,0,nullptr,0,0)<0){BCryptCloseAlgorithmProvider(algorithm_,0);algorithm_=nullptr;throw std::runtime_error("Cannot create SHA-1 state");}}
    ~Sha1(){if(hash_)BCryptDestroyHash(hash_);if(algorithm_)BCryptCloseAlgorithmProvider(algorithm_,0);}
    void update(std::span<const std::uint8_t> bytes){if(bytes.size()>std::numeric_limits<ULONG>::max() || BCryptHashData(hash_,const_cast<PUCHAR>(bytes.data()),ULONG(bytes.size()),0)<0)throw std::runtime_error("Cannot update LAN map SHA-1");}
    std::array<std::uint8_t,20> finish(){std::array<std::uint8_t,20> result{};if(BCryptFinishHash(hash_,result.data(),ULONG(result.size()),0)<0)throw std::runtime_error("Cannot finish LAN map SHA-1");return result;}
};
void calculateMembers(Archives& archives,LanMapCheck& result,const std::atomic_bool* canceled,MapInfo* info){
    checkCanceled(canceled);if(info){MapStrings strings;if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);auto w3i=archives.readCandidates({"war3map.w3i"},ArchiveScope::Map);if(!w3i)throw std::runtime_error("Missing war3map.w3i");*info=MapInfo::parse(w3i->bytes,strings);}Sha1 sha;std::uint32_t value=0;
    for(auto name:{"Scripts\\common.j","Scripts\\blizzard.j"}){checkCanceled(canceled);auto member=archives.readCandidates({name},ArchiveScope::Map);if(!member || member->bytes.empty())member=archives.readCandidates({name},ArchiveScope::Common);if(!member || member->bytes.empty())throw std::runtime_error(std::string("Missing LAN map source script: ")+name);value^=xorRotate(member->bytes);sha.update(member->bytes);}
    value=std::rotl(value,3);value=std::rotl(value^0x03f1379eu,3);constexpr std::array<std::uint8_t,4> marker{0x9e,0x37,0xf1,0x03};sha.update(marker);bool script=false;for(auto name:{"war3map.j","scripts\\war3map.j","war3map.w3e","war3map.wpm","war3map.doo","war3map.w3u","war3map.w3b","war3map.w3d","war3map.w3a","war3map.w3q"}){checkCanceled(canceled);if(script && std::string_view(name)=="scripts\\war3map.j")continue;auto member=archives.readCandidates({name},ArchiveScope::Map);if(!member || member->bytes.empty())continue;if(std::string_view(name)=="war3map.j" || std::string_view(name)=="scripts\\war3map.j")script=true;value=std::rotl(value^xorRotate(member->bytes),3);sha.update(member->bytes);}if(!script)throw std::runtime_error("LAN map script is missing");result.crc=value;result.sha1=sha.finish();checkCanceled(canceled);
}
LanMapCheck calculate(Archives& common,std::string_view advertisedPath,const std::atomic_bool* canceled,MapInfo* info=nullptr){
    checkCanceled(canceled);LanMapCheck result;result.resolvedPath=resolveMap(common.root(),advertisedPath);std::error_code ec;auto beforeSize=fs::file_size(result.resolvedPath,ec);if(ec || !beforeSize || beforeSize>std::numeric_limits<std::uint32_t>::max())throw std::runtime_error("Invalid LAN map file size");auto beforeTime=fs::last_write_time(result.resolvedPath,ec);if(ec)throw std::runtime_error("Cannot inspect LAN map timestamp");result.info=fileCrc(result.resolvedPath,result.size,canceled);if(result.size!=beforeSize)throw std::runtime_error("LAN map changed during reading");checkCanceled(canceled);auto archives=common.fork();archives->mountMap(result.resolvedPath);calculateMembers(*archives,result,canceled,info);auto afterSize=fs::file_size(result.resolvedPath,ec);if(ec || afterSize!=beforeSize)throw std::runtime_error("LAN map changed during verification");auto afterTime=fs::last_write_time(result.resolvedPath,ec);if(ec || afterTime!=beforeTime)throw std::runtime_error("LAN map changed during verification");return result;
}
LanMapCheck calculateMemory(Archives& common,std::shared_ptr<const Bytes> bytes,std::string_view label,const std::atomic_bool* canceled,MapInfo* info=nullptr){
    checkMemory(bytes,label);checkCanceled(canceled);LanMapCheck result;result.size=std::uint32_t(bytes->size());result.info=memoryCrc(*bytes,canceled);auto archives=common.fork();archives->mountMap(std::move(bytes),label);calculateMembers(*archives,result,canceled,info);return result;
}
}
LanMapCheck calculateLanMapCheck(Archives& common,std::string_view advertisedPath){return calculate(common,advertisedPath,nullptr);}
LanMapCheck calculateLanMapCheck(Archives& common,std::shared_ptr<const Bytes> bytes,std::string_view label){return calculateMemory(common,std::move(bytes),label,nullptr);}
struct LanMapCheckTaskState {
    std::atomic_bool canceled=false;
    std::mutex mutex;
    std::optional<LanMapCheckOutcome> outcome;
};
namespace {
struct MapJob {std::unique_ptr<Archives> archives;std::string path,expectedSha256;fs::path replaySidecar;std::shared_ptr<const Bytes> bytes;std::shared_ptr<LanMapCheckTaskState> state;bool includeMapInfo=false,includeSnapshot=false;};
class MapWorker {
    std::mutex mutex_;std::condition_variable changed_;std::unique_ptr<MapJob> job_;std::shared_ptr<LanMapCheckTaskState> active_;bool occupied_=false,stopping_=false;std::thread thread_;
    void run(){
        for(;;){std::unique_ptr<MapJob> job;{std::unique_lock lock(mutex_);changed_.wait(lock,[this]{return stopping_ || job_;});if(!job_ && stopping_)return;job=std::move(job_);}LanMapCheckOutcome outcome;try{if(!job->state->canceled.load(std::memory_order_acquire)){MapInfo info;auto outInfo=job->includeMapInfo?&info:nullptr;if(job->includeSnapshot){auto snapshot=job->replaySidecar.empty()?readSnapshot(job->archives->root(),job->path,&job->state->canceled):readSnapshotFile(job->replaySidecar,&job->state->canceled);if(!job->expectedSha256.empty() && sha256(*snapshot.second)!=job->expectedSha256)throw std::runtime_error("Replay map SHA-256 mismatch");outcome.value=calculateMemory(*job->archives,snapshot.second,utf8(snapshot.first.wstring()),&job->state->canceled,outInfo);outcome.value->resolvedPath=std::move(snapshot.first);outcome.snapshot=std::move(snapshot.second);}else if(job->bytes){if(job->includeMapInfo)outcome.memorySha256=sha256(*job->bytes);checkCanceled(&job->state->canceled);outcome.value=calculateMemory(*job->archives,std::move(job->bytes),job->path,&job->state->canceled,outInfo);}else outcome.value=calculate(*job->archives,job->path,&job->state->canceled,outInfo);if(job->includeMapInfo)outcome.mapInfo=std::move(info);}}catch(const std::exception& e){outcome.error=e.what();}catch(...){outcome.error="LAN map verification failed";}{std::lock_guard lock(mutex_);occupied_=false;active_.reset();}{std::lock_guard lock(job->state->mutex);if(!job->state->canceled.load(std::memory_order_acquire))job->state->outcome=std::move(outcome);}}
    }
public:
    MapWorker() : thread_([this]{run();}) {}
    ~MapWorker(){{std::lock_guard lock(mutex_);stopping_=true;if(active_)active_->canceled.store(true,std::memory_order_release);}changed_.notify_one();if(thread_.joinable())thread_.join();}
    bool submit(std::unique_ptr<MapJob> job){std::lock_guard lock(mutex_);if(stopping_ || occupied_)return false;occupied_=true;active_=job->state;job_=std::move(job);changed_.notify_one();return true;}
};
MapWorker& mapWorker(){static MapWorker worker;return worker;}
}
LanMapCheckTask::LanMapCheckTask(Archives& common,std::string advertisedPath,bool includeMapInfo,bool includeSnapshot,std::string expectedSha256) : state_(std::make_shared<LanMapCheckTaskState>()) {
    if(!expectedSha256.empty() && (!includeSnapshot || expectedSha256.size()!=64))throw std::runtime_error("Invalid LAN map snapshot digest");auto job=std::make_unique<MapJob>();job->archives=common.fork();job->path=std::move(advertisedPath);job->expectedSha256=std::move(expectedSha256);job->state=state_;job->includeMapInfo=includeMapInfo;job->includeSnapshot=includeSnapshot;if(!mapWorker().submit(std::move(job)))throw LanMapCheckBusy();
}
LanMapCheckTask::LanMapCheckTask(Archives& common,std::shared_ptr<const Bytes> bytes,std::string label,bool includeMapInfo) : state_(std::make_shared<LanMapCheckTaskState>()) {
    checkMemory(bytes,label);auto job=std::make_unique<MapJob>();job->archives=common.fork();job->path=std::move(label);job->bytes=std::move(bytes);job->state=state_;job->includeMapInfo=includeMapInfo;if(!mapWorker().submit(std::move(job)))throw LanMapCheckBusy();
}
LanMapCheckTask::LanMapCheckTask(Archives& common,const fs::path& sidecar,std::string digest) : state_(std::make_shared<LanMapCheckTaskState>()) {
    if(digest.size()!=64 || !std::all_of(digest.begin(),digest.end(),[](char c){return (c>='0' && c<='9') || (c>='a' && c<='f');}))throw std::runtime_error("Invalid replay map digest");validateWar3UserDirectory(common.root());auto root=fs::canonical(war3UserDirectory()/L"Replays"),parent=fs::canonical(sidecar.parent_path());if(!equal(root.wstring(),parent.wstring()) && !within(root,parent))throw std::runtime_error("Replay map is outside user directory");auto path=parent/sidecar.filename();if(path.filename().empty())throw std::runtime_error("Invalid replay map path");auto job=std::make_unique<MapJob>();job->archives=common.fork();job->replaySidecar=std::move(path);job->expectedSha256=std::move(digest);job->state=state_;job->includeMapInfo=job->includeSnapshot=true;if(!mapWorker().submit(std::move(job)))throw LanMapCheckBusy();
}
LanMapCheckTask::~LanMapCheckTask(){cancel();}
std::optional<LanMapCheckOutcome> LanMapCheckTask::poll() const {if(!state_ || state_->canceled.load(std::memory_order_acquire))return {};std::lock_guard lock(state_->mutex);if(state_->canceled.load(std::memory_order_acquire))return {};return state_->outcome;}
void LanMapCheckTask::cancel() noexcept {if(state_)state_->canceled.store(true,std::memory_order_release);}
}
