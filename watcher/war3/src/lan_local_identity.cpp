// Author: MiYu. Same-build action providers; deliberately not an original Warcraft III protocol identity.
#include "lan_local_identity.h"
#include "session.h"

namespace war3 {
std::optional<std::uint32_t> LanLocalIdentity::resolve(LanObjectId id) const {return session_.localNetworkObject(id.first,id.second);}
std::optional<LanObjectId> LanLocalIdentity::wire(std::uint32_t handle) const {auto id=session_.localNetworkObject(handle);if(!id)return {};return LanObjectId{id->first,id->second};}
std::optional<std::uint32_t> LanLocalIdentity::checksum(const ScriptSession& session) const {if(&session!=&session_ || !session.mainStarted())return {};return session.localNetworkChecksum();}
std::optional<LanAbilityWireFields> LanLocalIdentity::fields(const PlayerCommand& command) const {
    std::uint32_t target=0;switch(command.kind){case PlayerCommandKind::TargetOrder:case PlayerCommandKind::SpellUnit:case PlayerCommandKind::ItemUnit:case PlayerCommandKind::GiveItem:case PlayerCommandKind::UnloadUnit:target=command.target;break;case PlayerCommandKind::Awaken:case PlayerCommandKind::Revive:target=command.objectType;break;default:break;}
    if(!target)return LanAbilityWireFields{0,0,0};if(auto found=session_.units().find(target);found!=session_.units().end())return LanAbilityWireFields{0,0,0,std::array<std::uint32_t,2>{found->second->x.bits(),found->second->y.bits()}};if(auto found=session_.items().find(target);found!=session_.items().end())return LanAbilityWireFields{0,0,0,std::array<std::uint32_t,2>{found->second->x.bits(),found->second->y.bits()}};if(auto found=session_.destructables().find(target);found!=session_.destructables().end())return LanAbilityWireFields{0,0,0,std::array<std::uint32_t,2>{found->second->position.x.bits(),found->second->position.y.bits()}};return {};
}
}
