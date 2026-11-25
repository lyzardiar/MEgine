// Author: MiYu. Bounded binary records for local replay player commands.
#include "replay_solo.h"
#include "snapshot_codec.h"
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <limits>

namespace war3 {
namespace {
// The enclosing solo replay version owns this payload layout and these stable tags.
using Kind=PlayerCommandKind;
constexpr std::array soloCommandKinds{
    Kind::GroundMove,Kind::GroundAttack,Kind::GroundPatrol,Kind::Stop,Kind::Hold,Kind::TargetOrder,
    Kind::SpellUnit,Kind::SpellPoint,Kind::SpellImmediate,Kind::BuildAt,Kind::Train,Kind::Research,Kind::Upgrade,
    Kind::CancelUpgrade,Kind::CancelBuild,Kind::CancelProduction,Kind::Revive,Kind::ReturnResources,Kind::LearnSkill,
    Kind::ItemImmediate,Kind::ItemUnit,Kind::ItemPoint,Kind::DropItem,Kind::UnloadUnit,Kind::PurchaseItem,Kind::PurchaseUnit,
    Kind::SetAlliance,Kind::SetAlliedVictory,Kind::TransferResources,Kind::Chat,Kind::AbilityAutocast,Kind::RepairAutocast,
    Kind::DialogClick,Kind::EndCinematic,Kind::SpellUnitOrder,Kind::SpellPointOrder,Kind::SpellImmediateOrder,
    Kind::AllianceSnapshot,Kind::DropItemAt,Kind::GiveItem,Kind::SwapItem,Kind::Awaken,Kind::NeutralReveal,
    Kind::LocalSelection,Kind::LocalTrackable,Kind::AttackGround,Kind::MinimapSignal,Kind::SetGamePause,Kind::SetGameSpeed
};
constexpr unsigned maxSoloCommandUnits=16000,maxSoloCommandText=1024;
constexpr std::size_t soloCommandFixedBytes=116;
constexpr std::size_t maxSoloCommandBytes=soloCommandFixedBytes+4u*maxSoloCommandUnits+maxSoloCommandText+4u;

std::uint32_t soloCommandTag(PlayerCommandKind kind){
    auto found=std::find(soloCommandKinds.begin(),soloCommandKinds.end(),kind);
    if(found==soloCommandKinds.end())throw std::runtime_error("Unknown solo replay command kind");
    return std::uint32_t(found-soloCommandKinds.begin());
}

bool soloCommandFlag(Binary& input){
    auto value=input.u32();
    if(value>1)throw std::runtime_error("Invalid solo replay command flag");
    return value!=0;
}

void validateSoloCommand(const PlayerCommand& command){
    if(command.player>=16 || command.otherPlayer>=16 || command.units.size()>maxSoloCommandUnits || command.text.size()>maxSoloCommandText)throw std::runtime_error("Invalid solo replay command bounds");
    if(command.queued && !playerCommandQueueable(command.kind))throw std::runtime_error("Invalid solo replay queued command");
    if(command.kind==Kind::SetGameSpeed && command.objectType>4)throw std::runtime_error("Invalid solo replay game speed");
    for(auto coordinate:{command.xBits,command.yBits,command.formationXBits,command.formationYBits})
        if(!std::isfinite(std::bit_cast<float>(coordinate)))throw std::runtime_error("Invalid solo replay command coordinate");
    if(command.hasTargetPoint && (command.kind!=Kind::TargetOrder || command.order!=851971))throw std::runtime_error("Invalid solo replay target point");
    if(command.formationGroup==std::numeric_limits<std::uint64_t>::max() || (command.formationGroup && (!command.hasFormationDestination || !command.formationMovement)))throw std::runtime_error("Invalid solo replay formation group");
    if(unsigned(command.chatChannel)>unsigned(ChatChannel::Observers) || (command.chatRecipient && (*command.chatRecipient>=16 || command.chatChannel!=ChatChannel::All)))throw std::runtime_error("Invalid solo replay chat audience");
    if(command.kind==Kind::Chat){
        if(command.text.empty() || command.text.find('\0')!=std::string::npos || !MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,command.text.data(),int(command.text.size()),nullptr,0))throw std::runtime_error("Invalid solo replay chat text");
    }
}
}

Bytes encodeSoloCommand(const PlayerCommand& command){
    const auto kind=soloCommandTag(command.kind);
    validateSoloCommand(command);
    SnapshotWriter output(maxSoloCommandBytes);
    output.u32(command.player);
    output.u32(kind);
    output.size(command.units.size());
    for(auto unit:command.units)output.u32(unit);
    output.u32(command.xBits);
    output.u32(command.yBits);
    output.u32(command.target);
    output.u32(command.order);
    output.u32(command.ability);
    output.u32(command.stopOnSuccess);
    output.u32(command.objectType);
    output.u32(command.queueIndex);
    output.u32(command.item);
    output.u32(command.otherPlayer);
    output.u32(command.allianceOption);
    output.u32(std::bit_cast<std::uint32_t>(std::int32_t(command.gold)));
    output.u32(std::bit_cast<std::uint32_t>(std::int32_t(command.lumber)));
    output.u32(command.enabled);
    output.text(command.text,maxSoloCommandText);
    output.u32(command.queued);
    output.u32(command.hasFormationDestination);
    output.u32(command.formationXBits);
    output.u32(command.formationYBits);
    output.u32(command.formationMovement);
    output.u32(unsigned(command.chatChannel));
    output.u32(command.chatRecipient.has_value());
    if(command.chatRecipient)output.u32(*command.chatRecipient);
    output.u32(command.shop);
    output.u32(command.hasTargetPoint);
    output.u64(command.formationGroup);
    return output.finish();
}

PlayerCommand decodeSoloCommand(std::span<const std::uint8_t> bytes){
    if(bytes.size()<soloCommandFixedBytes || bytes.size()>maxSoloCommandBytes)throw std::runtime_error("Invalid solo replay command length");
    Binary input(bytes);
    PlayerCommand command;
    command.player=input.u32();
    const auto kind=input.u32();
    if(kind>=soloCommandKinds.size())throw std::runtime_error("Unknown solo replay command kind");
    command.kind=soloCommandKinds[kind];
    const auto count=input.count(4,maxSoloCommandUnits);
    if(count>(bytes.size()-soloCommandFixedBytes)/4)throw std::runtime_error("Invalid solo replay command unit count");
    command.units.reserve(count);
    for(unsigned i=0;i<count;++i)command.units.push_back(input.u32());
    command.xBits=input.u32();
    command.yBits=input.u32();
    command.target=input.u32();
    command.order=input.u32();
    command.ability=input.u32();
    command.stopOnSuccess=soloCommandFlag(input);
    command.objectType=input.u32();
    command.queueIndex=input.u32();
    command.item=input.u32();
    command.otherPlayer=input.u32();
    command.allianceOption=input.u32();
    command.gold=input.i32();
    command.lumber=input.i32();
    command.enabled=soloCommandFlag(input);
    command.text=snapshotText(input,maxSoloCommandText);
    command.queued=soloCommandFlag(input);
    command.hasFormationDestination=soloCommandFlag(input);
    command.formationXBits=input.u32();
    command.formationYBits=input.u32();
    command.formationMovement=soloCommandFlag(input);
    const auto channel=input.u32();
    if(channel>unsigned(ChatChannel::Observers))throw std::runtime_error("Invalid solo replay chat channel");
    command.chatChannel=ChatChannel(channel);
    if(soloCommandFlag(input))command.chatRecipient=input.u32();
    command.shop=input.u32();
    command.hasTargetPoint=soloCommandFlag(input);
    command.formationGroup=snapshotU64(input);
    input.finish();
    validateSoloCommand(command);
    return command;
}
}
