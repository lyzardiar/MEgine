// Author: MiYu. Direct archive mounting and bounded shared member cache.
#pragma once
#include "platform.h"
#include <memory>
#include <optional>
#include <unordered_map>

namespace war3 {
class Archive {
    HANDLE handle_ = nullptr;
    fs::path path_;
public:
    explicit Archive(const fs::path& path);
    ~Archive();
    Archive(const Archive&) = delete;
    Archive& operator=(const Archive&) = delete;
    std::optional<Bytes> read(const std::string& name) const;
    const fs::path& path() const { return path_; }
};
struct Member {
    Bytes bytes;
    std::string source;
};
enum class ArchiveScope {Overlay,Common,Map};
class Archives {
    std::vector<std::unique_ptr<Archive>> common_;
    std::unique_ptr<Archive> map_;
    struct Cached { std::shared_ptr<const Member> member; std::uint64_t stamp; };
    std::unordered_map<std::string, Cached> commonCache_;
    std::unordered_map<std::string, Cached> mapCache_;
    std::size_t cacheBytes_ = 0;
    std::uint64_t stamp_ = 0;
    static constexpr std::size_t budget = 64 * 1024 * 1024;
    std::shared_ptr<const Member> cache(std::unordered_map<std::string, Cached>& entries, std::string name, Bytes bytes, const fs::path& source);
public:
    explicit Archives(const fs::path& root);
    void mountMap(const fs::path& path);
    void unmountMap();
    std::shared_ptr<const Member> read(std::string name);
    std::shared_ptr<const Member> readTexture(std::string name);
    std::shared_ptr<const Member> readCandidates(std::vector<std::string> names,ArchiveScope scope=ArchiveScope::Overlay);
    std::size_t cachedBytes() const { return cacheBytes_; }
    std::size_t commonCount() const { return common_.size(); }
};
}
