// Author: MiYu. Retain source IDs/forces and constrain local skirmish edits.
#include "setup.h"
#include "session.h"
#include <algorithm>

namespace war3 {
SetupSlot* PlayerSetup::slot(unsigned id) {auto found=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.source.id==int(id);});return found==slots_.end()?nullptr:&*found;}
const SetupSlot* PlayerSetup::find(unsigned id) const {auto found=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.source.id==int(id);});return found==slots_.end()?nullptr:&*found;}
PlayerSetup::PlayerSetup(const MapInfo& info) : forces_(info.forces),flags_(info.flags) {
    for(auto& p:info.players)if(p.type==1 || p.type==2){if(p.id<0 || p.id>=16 || slot(unsigned(p.id)))throw std::runtime_error("Invalid setup player id");SetupSlot s;s.source=p;s.control=p.type==2?SlotControl::ComputerNormal:SlotControl::Open;s.race=p.race>=1 && p.race<=4?unsigned(p.race):5;s.color=unsigned(p.id);s.team=static_cast<unsigned>(slots_.size());
        constexpr unsigned races[]={32,1,2,8,4,32};s.racePreference=races[s.race];s.computerOnly=p.type==2;
        if(customForces()){auto found=std::find_if(forces_.begin(),forces_.end(),[&](auto& f){return (f.players&(1u<<p.id))!=0;});s.team=found==forces_.end()?unsigned(forces_.size()+slots_.size()):unsigned(found-forces_.begin());}slots_.push_back(std::move(s));}
    auto local=std::find_if(slots_.begin(),slots_.end(),[](auto& s){return s.source.type==1;});if(local!=slots_.end())local->control=SlotControl::Local;
}
PlayerSetup::PlayerSetup(const MapInfo& info,const SessionConfig& config) : forces_(info.forces),flags_(info.flags) {
    std::vector<unsigned> ids;for(auto& p:info.players){if(p.id<0 || p.id>=16 || std::find(ids.begin(),ids.end(),unsigned(p.id))!=ids.end())throw std::runtime_error("Invalid setup player id");ids.push_back(unsigned(p.id));}for(unsigned id=0;id<16;++id)if(std::find(ids.begin(),ids.end(),id)==ids.end())ids.push_back(id);
    for(auto id:ids){auto& player=config.players[id];if(player.controller!=0 && player.controller!=1)continue;if(player.color>=16 || player.team>=16)throw std::runtime_error("Invalid configured setup player");SetupSlot s;auto source=std::find_if(info.players.begin(),info.players.end(),[&](auto& p){return p.id==int(id);});if(source!=info.players.end())s.source=*source;else{s.source.id=int(id);s.source.type=player.controller==1?2:1;s.source.name=player.name;}
        s.computerOnly=player.controller==1;s.control=s.computerOnly?SlotControl::ComputerNormal:SlotControl::Open;s.team=player.team;s.color=player.color;s.racePreference=player.racePreference;s.raceSelectable=player.raceSelectable;switch(player.racePreference){case 1:s.race=1;break;case 2:s.race=2;break;case 8:s.race=3;break;case 4:s.race=4;break;default:s.race=5;break;}slots_.push_back(std::move(s));}
    auto local=std::find_if(slots_.begin(),slots_.end(),[](auto& s){return !s.computerOnly;});if(local!=slots_.end())local->control=SlotControl::Local;
}
std::optional<unsigned> PlayerSetup::localPlayer() const {for(auto& s:slots_)if(s.control==SlotControl::Local)return unsigned(s.source.id);return std::nullopt;}
void PlayerSetup::defaultMeleeOpponent() {
    if(!(flags_&4) || fixedSettings() || customForces())return;auto local=std::find_if(slots_.begin(),slots_.end(),[](auto& s){return s.control==SlotControl::Local;});if(local==slots_.end())return;for(auto& s:slots_)if(s.active() && s.team!=local->team)return;auto opponent=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.control==SlotControl::Open && s.team!=local->team;});if(opponent!=slots_.end())opponent->control=SlotControl::ComputerNormal;
}
unsigned PlayerSetup::teamCount() const {unsigned count=unsigned(slots_.size());for(auto& s:slots_)if(s.team>=count)count=s.team+1;return count;}
std::vector<SlotControl> PlayerSetup::controls(unsigned id) const {auto found=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.source.id==int(id);});if(found==slots_.end())return {};if(found->control==SlotControl::Local)return {SlotControl::Local};if(found->computerOnly)return {SlotControl::ComputerEasy,SlotControl::ComputerNormal,SlotControl::ComputerInsane};return {SlotControl::Local,SlotControl::Open,SlotControl::Closed,SlotControl::ComputerEasy,SlotControl::ComputerNormal,SlotControl::ComputerInsane};}
bool PlayerSetup::control(unsigned id,SlotControl control) {auto s=slot(id);auto choices=controls(id);if(!s || std::find(choices.begin(),choices.end(),control)==choices.end())return false;if(control==SlotControl::Local)for(auto& other:slots_)if(other.control==SlotControl::Local)other.control=SlotControl::Open;s->control=control;return true;}
bool PlayerSetup::race(unsigned id,unsigned race) {auto s=slot(id);if(!s || !s->active() || fixedSettings() || !s->raceSelectable || race<1 || race>5)return false;constexpr unsigned races[]={32,1,2,8,4,32};s->race=race;s->racePreference=races[race];return true;}
bool PlayerSetup::team(unsigned id,unsigned team) {auto s=slot(id);if(!s || !s->active() || customForces() || team>=teamCount())return false;s->team=team;return true;}
bool PlayerSetup::color(unsigned id,unsigned color) {auto s=slot(id);if(!s || !s->active() || fixedSettings() || color>=16)return false;auto occupied=std::find_if(slots_.begin(),slots_.end(),[&](auto& other){return other.color==color;});if(occupied!=slots_.end())occupied->color=s->color;s->color=color;return true;}
bool PlayerSetup::handicap(unsigned id,unsigned percent) {auto s=slot(id);if(!s || !s->active() || percent<50 || percent>100 || percent%10)return false;s->handicap=percent;return true;}
}
