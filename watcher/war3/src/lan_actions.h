// Author: MiYu. Documented classic action records and their wire fields.
#pragma once
#include <array>
#include <cstdint>
#include <span>
#include <variant>
#include <vector>

namespace war3 {
struct LanObjectId {std::uint32_t first=0,second=0;bool operator==(const LanObjectId&) const=default;};
struct LanActionPause {bool operator==(const LanActionPause&) const=default;};
struct LanActionResume {bool operator==(const LanActionResume&) const=default;};
struct LanActionCancelQueue {std::uint8_t slot=0;std::uint32_t type=0;bool operator==(const LanActionCancelQueue&) const=default;};
struct LanActionSelection {
    std::uint8_t mode=0;
    std::vector<LanObjectId> objects;
    bool operator==(const LanActionSelection&) const=default;
};
struct LanActionAbility {
    std::uint8_t opcode=0;
    std::uint16_t flags=0;
    std::uint32_t order=0,unknownA=0,unknownB=0;
    std::uint32_t xBits=0,yBits=0;
    LanObjectId target,item;
    std::uint32_t secondaryOrder=0;
    std::array<std::uint8_t,9> unknown{};
    std::uint32_t secondaryXBits=0,secondaryYBits=0;
    bool operator==(const LanActionAbility&) const=default;
};
using LanDecodedAction=std::variant<LanActionPause,LanActionResume,LanActionSelection,LanActionAbility,LanActionCancelQueue>;

// Classic 1.13+ action layout, bounded to 256 KiB and 4096 actions per block.
// A malformed or unsupported opcode fails the entire block; IDs are original wire pairs.
std::vector<LanDecodedAction> decodeLanActions(std::span<const std::uint8_t> bytes);
std::vector<std::uint8_t> encodeLanActions(std::span<const LanDecodedAction> actions);
}
