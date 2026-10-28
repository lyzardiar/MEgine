// Author: MiYu. Classic LAN map integrity fields computed from read-only in-memory archive members.
#pragma once
#include "map.h"
#include <array>
#include <string_view>

namespace war3 {
struct LanMapCheck {
    fs::path resolvedPath;
    std::uint32_t size=0,info=0,crc=0;
    std::array<std::uint8_t,20> sha1{};
};
// The advertised path must identify an existing .w3m/.w3x inside dataRoot/Maps.
// Throws on invalid paths, incomplete reads or unavailable source scripts.
LanMapCheck calculateLanMapCheck(Archives& common,std::string_view advertisedPath);
// Memory maps are bounded to 256 MiB; label is diagnostic only. Keep bytes immutable while checking.
LanMapCheck calculateLanMapCheck(Archives& common,std::shared_ptr<const Bytes> bytes,std::string_view label);
struct LanMapCheckOutcome {
    std::optional<LanMapCheck> value;
    std::string error;
    std::optional<MapInfo> mapInfo;
    // Present only for a successful file snapshot request; all fields describe these bytes.
    std::shared_ptr<const Bytes> snapshot;
};
class LanMapCheckBusy : public std::runtime_error {
public:
    LanMapCheckBusy() : std::runtime_error("LAN map verification is busy") {}
};
struct LanMapCheckTaskState;
class LanMapCheckTask {
    std::shared_ptr<LanMapCheckTaskState> state_;
public:
    // Only one map verification may run or wait at a time. Throws when busy. Snapshot requests retain at most 256 MiB.
    LanMapCheckTask(Archives& common,std::string advertisedPath,bool includeMapInfo=false,bool includeSnapshot=false);
    LanMapCheckTask(Archives& common,std::shared_ptr<const Bytes> bytes,std::string label,bool includeMapInfo=false);
    ~LanMapCheckTask();
    LanMapCheckTask(const LanMapCheckTask&)=delete;
    LanMapCheckTask& operator=(const LanMapCheckTask&)=delete;
    // Empty means pending or canceled. Ready results remain available until canceled.
    std::optional<LanMapCheckOutcome> poll() const;
    // Discards the result without blocking on archive or file reads.
    void cancel() noexcept;
};
}
