// Author: MiYu. Documented classic action records and their wire fields.
#pragma once
#include "chat_channel.h"
#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <variant>
#include <vector>

namespace war3 {
struct LanObjectId {std::uint32_t first=0,second=0;bool operator==(const LanObjectId&) const=default;};
struct LanActionPause {bool operator==(const LanActionPause&) const=default;};
struct LanActionResume {bool operator==(const LanActionResume&) const=default;};
struct LanActionEscape {bool operator==(const LanActionEscape&) const=default;};
enum class LanCommandMenu : std::uint8_t {None,Skills,Build};
struct LanActionMenu {LanCommandMenu menu=LanCommandMenu::None;bool operator==(const LanActionMenu&) const=default;};
struct LanActionExperimentalChat {std::string text;ChatChannel channel=ChatChannel::All;std::optional<std::uint8_t> recipientSlot;bool operator==(const LanActionExperimentalChat&) const=default;};
struct LanActionExperimentalDialog {LanObjectId dialog,button;std::uint32_t signature=0;std::uint64_t generation=0;bool operator==(const LanActionExperimentalDialog&) const=default;};
struct LanActionExperimentalUnit {std::uint8_t kind=0,flags=0;LanObjectId actor,item,target;std::uint32_t type=0,slot=0,xBits=0,yBits=0;std::optional<LanObjectId> shop;bool operator==(const LanActionExperimentalUnit&) const=default;};
struct LanActionExperimentalSpell {std::uint8_t mode=0,flags=0;std::uint32_t ability=0,xBits=0,yBits=0;LanObjectId target;std::vector<LanObjectId> actors;bool operator==(const LanActionExperimentalSpell&) const=default;};
struct LanActionExperimentalLeave {std::uint8_t peer=0;bool operator==(const LanActionExperimentalLeave&) const=default;};
struct LanActionExperimentalPurchase {LanObjectId shop;std::uint32_t type=0;bool item=false;std::optional<LanObjectId> buyer;bool operator==(const LanActionExperimentalPurchase&) const=default;};
struct LanActionExperimentalSelection {std::uint32_t round=0;std::uint16_t total=0,offset=0;std::vector<LanObjectId> objects;bool operator==(const LanActionExperimentalSelection&) const=default;};
struct LanActionCancelQueue {std::uint8_t slot=0;std::uint32_t type=0;bool operator==(const LanActionCancelQueue&) const=default;};
struct LanActionCancelRevival {LanObjectId hero;bool operator==(const LanActionCancelRevival&) const=default;};
struct LanActionTransfer {std::uint8_t slot=0;std::uint32_t gold=0,lumber=0;bool operator==(const LanActionTransfer&) const=default;};
struct LanActionAlliance {std::uint8_t slot=0;std::uint32_t flags=0;bool operator==(const LanActionAlliance&) const=default;};
struct LanActionPreSubselection {bool operator==(const LanActionPreSubselection&) const=default;};
struct LanActionSubgroup {std::uint32_t type=0;LanObjectId first;bool operator==(const LanActionSubgroup&) const=default;};
struct LanActionTrackable {bool hit=false;LanObjectId object;bool operator==(const LanActionTrackable&) const=default;};
struct LanActionMinimapSignal {std::uint32_t xBits=0,yBits=0,unknown=0;bool operator==(const LanActionMinimapSignal&) const=default;};
inline constexpr std::size_t experimentalCachePartBytes=512,experimentalCacheUnitBytes=1024u*1024u;
struct LanActionCacheSync {std::uint8_t opcode=0;std::string cache,mission,key,text;std::uint32_t value=0;std::vector<std::uint8_t> unit;std::uint64_t transfer=0;std::uint32_t total=0,offset=0;bool operator==(const LanActionCacheSync&) const=default;};
struct LanActionGroundItem {std::uint8_t flags=0;LanObjectId object;bool operator==(const LanActionGroundItem&) const=default;};
struct LanActionGroupAssign {std::uint8_t group=0;std::vector<LanObjectId> objects;bool operator==(const LanActionGroupAssign&) const=default;};
struct LanActionGroupSelect {std::uint8_t group=0,flags=0;bool operator==(const LanActionGroupSelect&) const=default;};
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
using LanDecodedAction=std::variant<LanActionPause,LanActionResume,LanActionEscape,LanActionMenu,LanActionSelection,LanActionAbility,LanActionCancelQueue,LanActionCancelRevival,LanActionTransfer,LanActionAlliance,LanActionPreSubselection,LanActionSubgroup,LanActionTrackable,LanActionMinimapSignal,LanActionCacheSync,LanActionGroundItem,LanActionGroupAssign,LanActionGroupSelect,LanActionExperimentalChat,LanActionExperimentalSelection,LanActionExperimentalPurchase,LanActionExperimentalLeave,LanActionExperimentalSpell,LanActionExperimentalUnit,LanActionExperimentalDialog>;

// Classic 1.13+ action layout, bounded to 256 KiB and 4096 actions per block.
// Experimental actions require explicit opt-in; malformed or unsupported opcodes fail the block.
std::vector<LanDecodedAction> decodeLanActions(std::span<const std::uint8_t> bytes,bool experimental=false);
std::vector<std::uint8_t> encodeLanActions(std::span<const LanDecodedAction> actions,bool experimental=false);
}
