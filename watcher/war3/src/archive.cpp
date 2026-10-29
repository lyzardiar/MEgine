// Author: MiYu. Map precedence, strict read errors and in-memory MPQ ownership.
#include "archive.h"
#include <StormLib.h>
#include <bcrypt.h>
#include <algorithm>
#include <array>
#include <cctype>
#include <cstring>
#include <map>
#include <mutex>

namespace war3 {
Archive::Archive(const fs::path& path) : path_(path) {
    if (!SFileOpenArchive(path.c_str(), 0, MPQ_OPEN_READ_ONLY, &handle_)) throw std::runtime_error("Cannot mount " + utf8(path.wstring()) + ": " + winError());
}
// StormLib's map provider opens a named pagefile section and retains its own view.
// The section is page-rounded; validate transferred length and hashes before mounting.
Archive::Archive(std::shared_ptr<const Bytes> bytes,std::string_view label) {
    if(!bytes || bytes->empty() || bytes->size()>256u*1024u*1024u || label.empty() || label.size()>1024 || label.find('\0')!=std::string_view::npos)throw std::runtime_error("Invalid in-memory map archive");
    path_=fs::path(wide(label));
    std::array<unsigned char,16> random{};if(BCryptGenRandom(nullptr,random.data(),ULONG(random.size()),BCRYPT_USE_SYSTEM_PREFERRED_RNG)<0)throw std::runtime_error("Cannot create in-memory archive identifier");
    constexpr wchar_t hex[]=L"0123456789abcdef";std::wstring name=L"Local\\War3Map-";for(auto byte:random){name+=hex[byte>>4];name+=hex[byte&15];}name+=L".w3x";
    struct Handle {HANDLE value;~Handle(){if(value)CloseHandle(value);}} mapping{CreateFileMappingW(INVALID_HANDLE_VALUE,nullptr,PAGE_READWRITE,0,DWORD(bytes->size()),name.c_str())};
    if(!mapping.value)throw std::runtime_error("Cannot create in-memory map section: "+winError());if(GetLastError()==ERROR_ALREADY_EXISTS)throw std::runtime_error("In-memory map section name collision");
    struct View {void* value;~View(){if(value)UnmapViewOfFile(value);}} view{MapViewOfFile(mapping.value,FILE_MAP_WRITE,0,0,bytes->size())};
    if(!view.value)throw std::runtime_error("Cannot map in-memory archive: "+winError());std::memcpy(view.value,bytes->data(),bytes->size());
    auto source=L"map://"+name;if(!SFileOpenArchive(source.c_str(),0,MPQ_OPEN_READ_ONLY,&handle_))throw std::runtime_error("Cannot mount in-memory map "+std::string(label)+": "+winError());
}
Archive::~Archive() { if (handle_) SFileCloseArchive(handle_); }
std::optional<Bytes> Archive::read(const std::string& name) const {
    HANDLE handle = nullptr;
    if (!SFileOpenFileEx(handle_, name.c_str(), SFILE_OPEN_FROM_MPQ, &handle)) {
        auto error = GetLastError();
        if (error == ERROR_FILE_NOT_FOUND) return std::nullopt;
        throw std::runtime_error("Cannot open " + name + " in " + utf8(path_.wstring()) + ": " + winError(error));
    }
    struct Close { HANDLE handle; ~Close() { SFileCloseFile(handle); } } close{handle};
    DWORD high = 0;
    SetLastError(ERROR_SUCCESS);
    DWORD low = SFileGetFileSize(handle, &high);
    if ((low == SFILE_INVALID_SIZE && GetLastError() != ERROR_SUCCESS) || high || low > 128 * 1024 * 1024) throw std::runtime_error("Archive member size exceeds limit: " + name);
    Bytes bytes(low);
    DWORD read = 0;
    if (low && (!SFileReadFile(handle, bytes.data(), low, &read, nullptr) || read != low)) throw std::runtime_error("Cannot read archive member " + name + ": " + winError());
    return bytes;
}
namespace {
std::optional<Bytes> completePcmWavPrefix(Bytes bytes,DWORD originalSize) {
    auto u16=[&](size_t p){return unsigned(bytes[p])|(unsigned(bytes[p+1])<<8);};
    auto u32=[&](size_t p){return std::uint32_t(bytes[p])|(std::uint32_t(bytes[p+1])<<8)|(std::uint32_t(bytes[p+2])<<16)|(std::uint32_t(bytes[p+3])<<24);};
    if(bytes.size()<44 || std::memcmp(bytes.data(),"RIFF",4) || std::memcmp(bytes.data()+8,"WAVE",4) || std::uint64_t(u32(4))+8!=originalSize)return {};
    bool format=false;unsigned alignment=0;size_t pos=12;
    while(pos+8<=bytes.size()) {
        auto length=u32(pos+4);auto end=std::uint64_t(pos)+8+length;auto padded=end+(length&1u);if(padded>bytes.size())return {};
        if(!std::memcmp(bytes.data()+pos,"fmt ",4)){if(format || length<16 || u16(pos+8)!=1)return {};auto channels=u16(pos+10),rate=u32(pos+12),byteRate=u32(pos+16),bits=u16(pos+22);alignment=u16(pos+20);if(!channels || channels>2 || !rate || rate>192000 || (bits!=8 && bits!=16) || alignment!=channels*bits/8 || std::uint64_t(rate)*alignment!=byteRate)return {};format=true;}
        if(!std::memcmp(bytes.data()+pos,"data",4)){if(!format || !length || !alignment || length%alignment || originalSize-padded>128)return {};bytes.resize(size_t(padded));auto size=std::uint32_t(bytes.size()-8);for(unsigned i=0;i<4;++i)bytes[4+i]=std::uint8_t(size>>(i*8));return bytes;}
        pos=size_t(padded);
    }
    return {};
}
}
std::optional<Bytes> Archive::readWavForAudio(const std::string& name,std::string& diagnostic) const {
    diagnostic.clear();HANDLE file=nullptr;if(!SFileOpenFileEx(handle_,name.c_str(),SFILE_OPEN_FROM_MPQ,&file)){auto error=GetLastError();if(error==ERROR_FILE_NOT_FOUND)return {};throw std::runtime_error("Cannot open "+name+" in "+utf8(path_.wstring())+": "+winError(error));}
    struct Close {HANDLE handle;~Close(){SFileCloseFile(handle);}} close{file};DWORD high=0;SetLastError(ERROR_SUCCESS);DWORD size=SFileGetFileSize(file,&high);if((size==SFILE_INVALID_SIZE && GetLastError()!=ERROR_SUCCESS) || high || size>128*1024*1024)throw std::runtime_error("Archive member size exceeds limit: "+name);Bytes bytes(size);DWORD read=0;
    if(!size || (SFileReadFile(file,bytes.data(),size,&read,nullptr) && read==size))return bytes;
    auto original=GetLastError();auto error="Cannot read archive member "+name+": "+winError(original);DWORD sector=0,returned=0;
    if(original!=ERROR_FILE_CORRUPT || !SFileGetFileInfo(handle_,SFileMpqSectorSize,&sector,sizeof(sector),&returned) || !sector || sector>1024*1024)throw std::runtime_error(error);
    DWORD tail=size%sector;if(!tail || tail>16 || size<=tail)throw std::runtime_error(error);DWORD prefix=size-tail;SetLastError(ERROR_SUCCESS);if(SFileSetFilePointer(file,0,nullptr,FILE_BEGIN)==SFILE_INVALID_POS && GetLastError()!=ERROR_SUCCESS)throw std::runtime_error(error);read=0;if(!SFileReadFile(file,bytes.data(),prefix,&read,nullptr) || read!=prefix)throw std::runtime_error(error);
    read=0;SetLastError(ERROR_SUCCESS);if(SFileReadFile(file,bytes.data()+prefix,tail,&read,nullptr) || GetLastError()!=original)throw std::runtime_error(error);bytes.resize(prefix);auto recovered=completePcmWavPrefix(std::move(bytes),size);if(!recovered)throw std::runtime_error(error);diagnostic=error+"; complete PCM data recovered in memory, trailing "+std::to_string(size-recovered->size())+" bytes omitted";return recovered;
}
struct Archives::Store {
    fs::path root;
    std::vector<std::unique_ptr<Archive>> archives;
    std::mutex mutex;
    std::unordered_map<std::string,Cached> cache;
    size_t bytes=0,budget=0;
    std::uint64_t stamp=0;
};
std::vector<std::string> Archive::members(const std::string& pattern) const {SFILE_FIND_DATA found{};auto search=SFileFindFirstFile(handle_,pattern.c_str(),&found,nullptr);if(!search || search==INVALID_HANDLE_VALUE){auto error=GetLastError();if(error==ERROR_NO_MORE_FILES || error==ERROR_FILE_NOT_FOUND)return {};throw std::runtime_error("Cannot enumerate archive members: "+winError(error));}struct Close {HANDLE value;~Close(){SFileFindClose(value);}}close{search};std::vector<std::string> result;do{if(result.size()>=65536)throw std::runtime_error("Archive enumeration exceeds budget");result.emplace_back(found.cFileName);}while(SFileFindNextFile(search,&found));auto error=GetLastError();if(error!=ERROR_NO_MORE_FILES && error!=ERROR_SUCCESS)throw std::runtime_error("Archive enumeration failed: "+winError(error));return result;}
std::vector<std::string> Archives::members(const std::string& pattern,ArchiveScope scope) const {if(pattern.empty() || pattern.front()=='/' || pattern.front()=='\\' || pattern.find(':')!=std::string::npos || pattern.find("..")!=std::string::npos)throw std::runtime_error("Invalid archive enumeration pattern");std::map<std::string,std::string> unique;auto scan=[&](Store& store){std::lock_guard lock(store.mutex);for(auto& archive:store.archives)for(auto& member:archive->members(pattern)){auto key=member;for(auto& c:key){if(c=='/')c='\\';c=char(std::tolower(static_cast<unsigned char>(c)));}unique.try_emplace(std::move(key),std::move(member));if(unique.size()>65536)throw std::runtime_error("Archive enumeration exceeds shared budget");}};if(map_ && scope!=ArchiveScope::Common)scan(*map_);if(scope!=ArchiveScope::Map)scan(*common_);std::vector<std::string> result;for(auto& [key,name]:unique)result.push_back(std::move(name));return result;}
Archives::Archives(const fs::path& root) {
    struct Less {bool operator()(const fs::path& a,const fs::path& b) const {return CompareStringOrdinal(a.c_str(),-1,b.c_str(),-1,TRUE)==CSTR_LESS_THAN;}};
    static std::mutex mutex;static std::map<fs::path,std::weak_ptr<Store>,Less> roots;auto key=fs::canonical(root);std::lock_guard lock(mutex);
    for(auto it=roots.begin();it!=roots.end();)if(it->second.expired())it=roots.erase(it);else ++it;
    if(auto found=roots.find(key);found!=roots.end())if((common_=found->second.lock()))return;
    auto store=std::make_shared<Store>();store->root=key;store->budget=64*1024*1024;
    for (auto name : {L"War3Patch.mpq", L"War3xLocal.mpq", L"War3x.mpq", L"war3.mpq"}) {
        auto path = key / name;
        if (fs::exists(path)) store->archives.push_back(std::make_unique<Archive>(path));
    }
    if (!fs::exists(key / L"war3.mpq")) throw std::runtime_error("Missing base war3.mpq");
    common_=std::move(store);roots[key]=common_;
}
std::unique_ptr<Archives> Archives::fork() const {return std::unique_ptr<Archives>(new Archives(common_,map_));}
const fs::path& Archives::root() const {return common_->root;}
fs::path Archives::mapPath() const {return map_?map_->archives.front()->path():fs::path{};}
size_t Archives::commonCount() const {return common_->archives.size();}
size_t Archives::cachedBytes() const {if(map_){std::scoped_lock lock(common_->mutex,map_->mutex);return common_->bytes+map_->bytes;}std::lock_guard lock(common_->mutex);return common_->bytes;}
void Archives::mountMap(const fs::path& path) {
    auto next=std::make_shared<Store>();next->budget=16*1024*1024;next->archives.push_back(std::make_unique<Archive>(path));
    map_ = std::move(next);
}
void Archives::mountMap(std::shared_ptr<const Bytes> bytes,std::string_view label) {
    auto next=std::make_shared<Store>();next->budget=16*1024*1024;next->archives.push_back(std::make_unique<Archive>(std::move(bytes),label));map_=std::move(next);
}
void Archives::unmountMap() {map_.reset();}
std::shared_ptr<const Member> Archives::readStore(Store& store,const std::vector<std::string>& names,bool wavAudio) {
    std::lock_guard lock(store.mutex);
    for(size_t i=0;i<store.archives.size();++i)for(auto& name:names){
        auto base=std::to_string(i)+":"+name;auto key=wavAudio?"wav:"+base:base;if(auto found=store.cache.find(key);found!=store.cache.end()){found->second.stamp=++store.stamp;return found->second.member;}if(wavAudio)if(auto found=store.cache.find(base);found!=store.cache.end()){found->second.stamp=++store.stamp;return found->second.member;}
        auto& archive=*store.archives[i];std::string diagnostic;auto bytes=wavAudio?archive.readWavForAudio(name,diagnostic):archive.read(name);if(bytes){
            auto source=utf8(archive.path().wstring());if(!diagnostic.empty()){auto warning="WAV recovery in "+source+": "+diagnostic;OutputDebugStringA((warning+"\n").c_str());source+=" ["+diagnostic+"]";}else key=base;auto member=std::make_shared<Member>(Member{std::move(*bytes),std::move(source)});if(member->bytes.size()>store.budget)return member;
            while(store.bytes>store.budget-member->bytes.size()){auto oldest=store.cache.end();std::uint64_t stamp=UINT64_MAX;for(auto it=store.cache.begin();it!=store.cache.end();++it)if(it->second.stamp<stamp){oldest=it;stamp=it->second.stamp;}if(oldest==store.cache.end())break;store.bytes-=oldest->second.member->bytes.size();store.cache.erase(oldest);}
            store.bytes+=member->bytes.size();store.cache.emplace(std::move(key),Cached{member,++store.stamp});return member;
        }
    }
    return {};
}
std::shared_ptr<const Member> Archives::read(std::string name) {
    return readCandidates({std::move(name)});
}
std::shared_ptr<const Member> Archives::readWavForAudio(std::string name) {
    if(name.empty() || name.front()=='/' || name.front()=='\\' || name.find(':')!=std::string::npos || name.find("..")!=std::string::npos)throw std::runtime_error("Invalid archive path");for(auto& c:name){if(c=='/')c='\\';c=char(std::tolower(static_cast<unsigned char>(c)));}if(!name.ends_with(".wav"))throw std::runtime_error("WAV audio read requires a WAV path");std::vector<std::string> names{std::move(name)};if(map_)if(auto member=readStore(*map_,names,true))return member;return readStore(*common_,names,true);
}
std::shared_ptr<const Member> Archives::readTexture(std::string name) {
    auto other = name; auto dot = other.find_last_of('.');
    if (dot == std::string::npos) return read(name);
    auto ext = other.substr(dot); for (auto& c : ext) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    if (ext != ".blp" && ext != ".tga") return read(name);
    other.replace(dot, std::string::npos, ext == ".tga" ? ".blp" : ".tga");
    return readCandidates({std::move(name), std::move(other)});
}
std::shared_ptr<const Member> Archives::readCandidates(std::vector<std::string> names,ArchiveScope scope) {
    for (auto& name : names) {
        if (name.empty() || name.front() == '/' || name.front() == '\\' || name.find(':') != std::string::npos || name.find("..") != std::string::npos) throw std::runtime_error("Invalid archive path");
        for (auto& c : name) { if (c == '/') c = '\\'; c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); }
    }
    if (map_ && scope!=ArchiveScope::Common) {
        if(auto member=readStore(*map_,names))return member;
    }
    if(scope!=ArchiveScope::Map)return readStore(*common_,names);
    return {};
}
}
