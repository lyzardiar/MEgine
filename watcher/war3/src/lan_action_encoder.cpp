// Author: MiYu. Encode supported player input without inventing object IDs or changing selection.
// Action fields: blue and nagger, w3g_actions.txt v1.00, as pinned in lan_actions.cpp.
// Original 1.27 network bytes, unknown fields, object mapping and event semantics remain unverified.
#include "lan_action_encoder.h"
#include "lan_spell_orders.h"
#include "lan_production_orders.h"
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <utility>

namespace war3 {
namespace {
constexpr std::size_t maxPayload=1449;
unsigned playerFor(ScriptSession& session,std::uint8_t peer){auto player=session.networkPlayer(peer);if(!session.mainStarted() || !player || session.localPlayer()!=player)throw std::runtime_error("LAN sender is not the configured local player");return *player;}
LanObjectId wireId(std::uint32_t handle,const LanWireObjectResolver& resolve){if(!handle || !resolve)throw std::runtime_error("Missing LAN object resolver");auto id=resolve(handle);if(!id || (id->first==0xffffffffu && id->second==0xffffffffu))throw std::runtime_error("Unmapped LAN object");return *id;}
bool finitePoint(std::uint32_t x,std::uint32_t y){return std::isfinite(std::bit_cast<float>(x)) && std::isfinite(std::bit_cast<float>(y));}
bool supportedTargetOrder(std::uint32_t order){return order==851971 || order==851983 || order==851986 || order==852018 || order==852024 || order==852147 || order==852148;}
std::vector<std::uint8_t> one(LanDecodedAction action){std::array<LanDecodedAction,1> actions{std::move(action)};auto bytes=encodeLanActions(actions);if(bytes.size()>maxPayload)throw std::runtime_error("LAN action exceeds transport limit");return bytes;}
}
std::vector<std::uint8_t> encodeLanSelectionChange(ScriptSession& session,std::uint8_t peer,bool add,std::span<const std::uint32_t> handles,const LanWireObjectResolver& resolve){
    playerFor(session,peer);if(handles.empty() || handles.size()>(maxPayload-4)/8)throw std::runtime_error("Invalid LAN selection size");LanActionSelection selection;selection.mode=add?1:2;selection.objects.reserve(handles.size());std::set<std::uint32_t> seenHandles;std::set<std::pair<std::uint32_t,std::uint32_t>> seenIds;
    for(auto handle:handles){if(!seenHandles.insert(handle).second || !session.units().contains(handle) || (add && !session.unitSelectable(handle)))throw std::runtime_error("Invalid LAN selection object");auto id=wireId(handle,resolve);if(!seenIds.emplace(id.first,id.second).second)throw std::runtime_error("Duplicate LAN object identity");selection.objects.push_back(id);}return one(std::move(selection));
}
std::vector<std::uint8_t> encodeLanSelectionUpdate(ScriptSession& session,std::uint8_t peer,std::span<const LanSelectionChange> changes,const LanWireObjectResolver& resolve){
    playerFor(session,peer);std::map<std::pair<std::uint32_t,std::uint32_t>,std::uint32_t> ids;std::vector<std::uint8_t> bytes;for(const auto& change:changes){for(auto handle:change.handles){auto id=wireId(handle,resolve);auto [it,inserted]=ids.emplace(std::make_pair(id.first,id.second),handle);if(!inserted && it->second!=handle)throw std::runtime_error("Duplicate LAN object identity");}auto next=encodeLanSelectionChange(session,peer,change.add,change.handles,resolve);if(next.size()>maxPayload-bytes.size())throw std::runtime_error("LAN action exceeds transport limit");bytes.insert(bytes.end(),next.begin(),next.end());}return bytes;
}
std::vector<std::uint8_t> encodeLanPlayerCommand(ScriptSession& session,std::uint8_t peer,const PlayerCommand& command,const LanAbilityWireFields& fields,const LanWireObjectResolver& resolve){
    auto player=playerFor(session,peer);bool spell=command.kind==PlayerCommandKind::SpellUnit || command.kind==PlayerCommandKind::SpellPoint || command.kind==PlayerCommandKind::SpellImmediate;bool production=command.kind==PlayerCommandKind::BuildAt || command.kind==PlayerCommandKind::Train || command.kind==PlayerCommandKind::Research || command.kind==PlayerCommandKind::Upgrade;if(command.player!=player || (command.stopOnSuccess && !spell) || !resolve || (fields.flags!=0 && fields.flags!=8))throw std::runtime_error("Unsupported LAN command context");
    if(command.units.empty() || command.units.size()>4096 || (command.ability && !spell) || (spell && (!command.ability || command.units.size()!=1)) || (production && (!command.objectType || command.units.size()!=1)) || (command.objectType && !production) || command.queueIndex || command.item || command.otherPlayer || command.allianceOption || command.gold || command.lumber || command.enabled || !command.text.empty())throw std::runtime_error("Unsupported LAN command fields");
    auto selected=session.playerSelection(player);if(selected.size()!=command.units.size() || !std::equal(selected.begin(),selected.end(),command.units.begin()))throw std::runtime_error("LAN command units must match the current selection and order");
    std::set<std::pair<std::uint32_t,std::uint32_t>> seenIds;for(auto id:command.units){auto unit=session.units().find(id);if(unit==session.units().end() || !session.canControlUnit(player,*unit->second))throw std::runtime_error("LAN command unit is unavailable or not controlled");auto wire=wireId(id,resolve);if(!seenIds.emplace(wire.first,wire.second).second)throw std::runtime_error("Duplicate LAN object identity");}
    if(production){auto unit=session.units().at(command.units.front());if(lanProductionOrder(*unit,command.objectType,command.kind==PlayerCommandKind::BuildAt)!=command.kind)throw std::runtime_error("Unsupported or ambiguous LAN production order");}
    const SpellInfo* spellInfo=nullptr;if(spell){auto unit=session.units().at(command.units.front());auto known=unit->abilities.find(command.ability);if(known==unit->abilities.end() || known->second<=0)throw std::runtime_error("LAN caster lacks ability");spellInfo=&session.spellInfo(command.ability,unsigned(known->second));auto mode=command.kind==PlayerCommandKind::SpellUnit?LanSpellTarget::Unit:command.kind==PlayerCommandKind::SpellPoint?LanSpellTarget::Point:LanSpellTarget::None;auto targeting=mode==LanSpellTarget::Unit?SpellTargeting::Unit:mode==LanSpellTarget::Point?SpellTargeting::Point:SpellTargeting::None;if(!lanSpellOrder(spellInfo->order,mode) || (spellInfo->targeting!=targeting && !(spellInfo->targeting==SpellTargeting::Either && targeting!=SpellTargeting::None)))throw std::runtime_error("Unsupported LAN spell order");for(auto [other,rank]:unit->abilities)if(other!=command.ability && rank>0){auto& candidate=session.spellInfo(other,unsigned(rank));if(candidate.order==spellInfo->order || (targeting==SpellTargeting::None && (candidate.orderOn==spellInfo->order || candidate.orderOff==spellInfo->order || candidate.unorder==spellInfo->order)))throw std::runtime_error("Ambiguous LAN spell order");}}
    LanActionAbility ability;ability.flags=fields.flags;ability.unknownA=fields.unknownA;ability.unknownB=fields.unknownB;
    switch(command.kind){
    case PlayerCommandKind::Stop:ability.opcode=0x10;ability.order=851972;break;
    case PlayerCommandKind::Hold:ability.opcode=0x10;ability.order=851993;break;
    case PlayerCommandKind::GroundMove:ability.opcode=0x11;ability.order=851986;break;
    case PlayerCommandKind::GroundAttack:ability.opcode=0x11;ability.order=851983;break;
    case PlayerCommandKind::GroundPatrol:ability.opcode=0x11;ability.order=851990;break;
    case PlayerCommandKind::BuildAt:ability.opcode=0x11;ability.order=command.objectType;break;
    case PlayerCommandKind::Train:case PlayerCommandKind::Research:case PlayerCommandKind::Upgrade:ability.opcode=0x10;ability.order=command.objectType;break;
    case PlayerCommandKind::SpellImmediate:ability.opcode=0x10;ability.order=spellInfo->order;break;
    case PlayerCommandKind::SpellPoint:ability.opcode=0x11;ability.order=spellInfo->order;break;
    case PlayerCommandKind::SpellUnit:
    case PlayerCommandKind::TargetOrder:
        if(!command.target || (spell && (command.xBits || command.yBits || (command.order && command.order!=spellInfo->order))) || (command.kind==PlayerCommandKind::TargetOrder && !supportedTargetOrder(command.order)) || !fields.targetPosition || !finitePoint((*fields.targetPosition)[0],(*fields.targetPosition)[1]))throw std::runtime_error("Invalid LAN target order");
        if((spell && !session.units().contains(command.target)) || (!session.units().contains(command.target) && !session.items().contains(command.target) && !session.destructables().contains(command.target)))throw std::runtime_error("LAN target object is unavailable");
        ability.opcode=0x12;ability.order=spell?spellInfo->order:command.order;ability.xBits=(*fields.targetPosition)[0];ability.yBits=(*fields.targetPosition)[1];ability.target=wireId(command.target,resolve);if(seenIds.contains({ability.target.first,ability.target.second}) && std::find(command.units.begin(),command.units.end(),command.target)==command.units.end())throw std::runtime_error("Duplicate LAN object identity");break;
    default:throw std::runtime_error("Unsupported LAN player command");
    }
    if(command.kind!=PlayerCommandKind::TargetOrder && command.kind!=PlayerCommandKind::SpellUnit){if(command.target || (command.order && command.order!=ability.order) || fields.targetPosition)throw std::runtime_error("Unexpected LAN command target");if(ability.opcode==0x11){if(!finitePoint(command.xBits,command.yBits))throw std::runtime_error("Invalid LAN ground position");ability.xBits=command.xBits;ability.yBits=command.yBits;}else if(command.xBits || command.yBits)throw std::runtime_error("Unexpected LAN command position");}
    return one(std::move(ability));
}
}
