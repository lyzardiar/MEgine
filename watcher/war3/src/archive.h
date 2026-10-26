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
    struct Cached { std::shared_ptr<const Member> member; std::uint64_t stamp; };
    struct Store;
    std::shared_ptr<Store> common_,map_;
    Archives(std::shared_ptr<Store> common,std::shared_ptr<Store> map) : common_(std::move(common)),map_(std::move(map)) {}
    static std::shared_ptr<const Member> readStore(Store& store,const std::vector<std::string>& names);
public:
    explicit Archives(const fs::path& root);
    Archives(const Archives&)=delete;
    Archives& operator=(const Archives&)=delete;
    std::unique_ptr<Archives> fork() const;
    const fs::path& root() const;
    fs::path mapPath() const;
    void mountMap(const fs::path& path);
    void unmountMap();
    std::shared_ptr<const Member> read(std::string name);
    std::shared_ptr<const Member> readTexture(std::string name);
    std::shared_ptr<const Member> readCandidates(std::vector<std::string> names,ArchiveScope scope=ArchiveScope::Overlay);
    std::size_t cachedBytes() const;
    std::size_t commonCount() const;
};
}
