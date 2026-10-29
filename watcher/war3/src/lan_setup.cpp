// Author: MiYu. Apply an explicitly mapped network lobby to a configured session before main.
#include "lan_setup.h"
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
std::vector<unsigned> lanHostSlotPlayerIds(const MapInfo& info,std::size_t slotCount) {
    std::vector<unsigned> ids;unsigned seen=0;for(const auto& player:info.players)if(player.type==1 || player.type==2){if(player.id<0 || player.id>=12 || (seen&(1u<<player.id)))throw std::runtime_error("Unsupported LAN map player");seen|=1u<<player.id;ids.push_back(unsigned(player.id));}if(ids.empty() || ids.size()!=slotCount)throw std::runtime_error("LAN host slot count does not match map players");return ids;
}
void ScriptSession::applyLanSetup(const LanSessionSetup& setup) {
    if(!configured() || !world_ || mainAttempted_)throw std::runtime_error("LAN setup requires a configured world before main");
    if(!initialRandomSeed_ || *initialRandomSeed_!=setup.randomSeed)throw std::runtime_error("LAN random seed must be provided before session initialization");
    if(setup.slots.empty() || setup.slots.size()>12 || setup.slotPlayerIds.size()!=setup.slots.size() || !setup.localPeerId || setup.localPeerId==255)throw std::runtime_error("Invalid LAN slot mapping");
    unsigned sourceMask=0;for(const auto& player:world_->data().info.players)if(player.type==1 || player.type==2){if(player.id<0 || player.id>=12 || (sourceMask&(1u<<player.id)))throw std::runtime_error("Unsupported LAN map player");sourceMask|=1u<<player.id;}
    std::map<std::uint8_t,std::string> names;for(const auto& player:setup.players){if(!player.id || player.id==255 || player.name.empty() || player.name.size()>15 || player.name.find('\0')!=std::string::npos || !names.emplace(player.id,player.name).second)throw std::runtime_error("Invalid LAN player identity");}
    auto next=config_;std::map<std::uint8_t,unsigned> peers;std::optional<unsigned> local;unsigned mapped=0;
    for(size_t i=0;i<setup.slots.size();++i){const auto& slot=setup.slots[i];auto id=setup.slotPlayerIds[i];if(id>=12 || !(sourceMask&(1u<<id)) || (mapped&(1u<<id)))throw std::runtime_error("Invalid LAN slot player mapping");mapped|=1u<<id;
        if(slot.status>2 || slot.computer>1 || (slot.status!=2 && slot.computer) || slot.team>=12 || slot.color>=12 || slot.difficulty>2 || slot.handicap<50 || slot.handicap>100 || slot.handicap%10)throw std::runtime_error("Invalid LAN slot settings");
        unsigned preference=unsigned(slot.race)&0x3fu;if(preference!=1 && preference!=2 && preference!=4 && preference!=8 && preference!=32)throw std::runtime_error("Invalid LAN slot race");
        auto& player=next.players[id];player.team=slot.team;player.color=slot.color;if(player.racePreference!=preference)player.race=0;player.racePreference=preference;player.raceSelectable=(slot.race&0x40)!=0;player.handicap=jass::Real::fromInteger(int(slot.handicap)).divide(jass::Real::fromInteger(100));player.slotState=slot.status==2?1:0;
        if(slot.status==2 && !slot.computer){auto found=names.find(slot.playerId);if(found==names.end() || !peers.emplace(slot.playerId,id).second)throw std::runtime_error("Unmapped or duplicate LAN peer");player.name=found->second;player.controller=0;if(slot.playerId==setup.localPeerId)local=id;}
        else if(slot.status==2){player.controller=1;player.difficulty=slot.difficulty;}
        else player.controller=slot.status==0?0:5;
    }
    if(mapped!=sourceMask || !local || peers.size()!=names.size())throw std::runtime_error("Incomplete LAN player mapping");
    auto slotPlayers=setup.slotPlayerIds;config_=std::move(next);localPlayer_=local;networkPlayers_=std::move(peers);experimentalSelectionSync_=setup.experimentalSelectionSync;networkSlotPlayers_=std::move(slotPlayers);setupApplied_=true;if(!world_->environment().cameraMotion.revision){auto index=config_.players[*local].start;if(index>=0 && unsigned(index)<config_.starts.size()){auto& p=config_.starts[index].position;world_->environment().cameraMotion.sync(std::bit_cast<float>(p[0].bits()),std::bit_cast<float>(p[1].bits()));}}
}
std::optional<unsigned> ScriptSession::networkPlayer(std::uint8_t peerId) const {auto found=networkPlayers_.find(peerId);return found==networkPlayers_.end()?std::nullopt:std::optional<unsigned>{found->second};}
std::optional<unsigned> ScriptSession::networkSlotPlayer(unsigned slot) const {return slot<networkSlotPlayers_.size()?std::optional<unsigned>{networkSlotPlayers_[slot]}:std::nullopt;}
std::optional<unsigned> ScriptSession::networkPlayerSlot(unsigned player) const {auto found=std::find(networkSlotPlayers_.begin(),networkSlotPlayers_.end(),player);return found==networkSlotPlayers_.end()?std::nullopt:std::optional<unsigned>{unsigned(found-networkSlotPlayers_.begin())};}
}
