// Author: MiYu. Map precedence, strict read errors and in-memory MPQ ownership.
#include "archive.h"
#include <StormLib.h>
#include <algorithm>
#include <cctype>

namespace war3 {
Archive::Archive(const fs::path& path) : path_(path) {
    if (!SFileOpenArchive(path.c_str(), 0, MPQ_OPEN_READ_ONLY, &handle_)) throw std::runtime_error("Cannot mount " + utf8(path.wstring()) + ": " + winError());
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
Archives::Archives(const fs::path& root) {
    for (auto name : {L"War3Patch.mpq", L"War3xLocal.mpq", L"War3x.mpq", L"war3.mpq"}) {
        auto path = root / name;
        if (fs::exists(path)) common_.push_back(std::make_unique<Archive>(path));
    }
    if (!fs::exists(root / L"war3.mpq")) throw std::runtime_error("Missing base war3.mpq");
}
void Archives::mountMap(const fs::path& path) {
    auto next = std::make_unique<Archive>(path);
    unmountMap();
    map_ = std::move(next);
}
void Archives::unmountMap() {
    map_.reset();
    for (const auto& [name, entry] : mapCache_) cacheBytes_ -= entry.member->bytes.size();
    mapCache_.clear();
}
std::shared_ptr<const Member> Archives::cache(std::unordered_map<std::string, Cached>& entries, std::string name, Bytes bytes, const fs::path& source) {
    auto member = std::make_shared<Member>(Member{std::move(bytes), utf8(source.wstring())});
    if (member->bytes.size() > budget) return member;
    while (cacheBytes_ > budget - member->bytes.size()) {
        auto* oldest = &commonCache_;
        auto item = oldest->end();
        std::uint64_t stamp = UINT64_MAX;
        for (auto* table : {&commonCache_, &mapCache_}) {
            for (auto it = table->begin(); it != table->end(); ++it) if (it->second.stamp < stamp) { oldest = table; item = it; stamp = it->second.stamp; }
        }
        if (stamp == UINT64_MAX) break;
        cacheBytes_ -= item->second.member->bytes.size();
        oldest->erase(item);
    }
    cacheBytes_ += member->bytes.size();
    entries.emplace(std::move(name), Cached{member, ++stamp_});
    return member;
}
std::shared_ptr<const Member> Archives::read(std::string name) {
    if (name.empty() || name.front() == '/' || name.front() == '\\' || name.find(':') != std::string::npos || name.find("..") != std::string::npos) throw std::runtime_error("Invalid archive path");
    for (auto& c : name) { if (c == '/') c = '\\'; c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); }
    if (map_) {
        if (auto found = mapCache_.find(name); found != mapCache_.end()) { found->second.stamp = ++stamp_; return found->second.member; }
        if (auto bytes = map_->read(name)) return cache(mapCache_, name, std::move(*bytes), map_->path());
    }
    if (auto found = commonCache_.find(name); found != commonCache_.end()) { found->second.stamp = ++stamp_; return found->second.member; }
    for (const auto& archive : common_) if (auto bytes = archive->read(name)) return cache(commonCache_, name, std::move(*bytes), archive->path());
    return {};
}
}
