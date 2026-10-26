// Author: MiYu. Retain source IDs/forces and constrain local skirmish edits.
#include "setup.h"
#include <algorithm>

namespace war3 {
SetupSlot* PlayerSetup::slot(unsigned id) {auto found=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.source.id==int(id);});return found==slots_.end()?nullptr:&*found;}
const SetupSlot* PlayerSetup::find(unsigned id) const {auto found=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.source.id==int(id);});return found==slots_.end()?nullptr:&*found;}
PlayerSetup::PlayerSetup(const MapInfo& info) : forces_(info.forces),flags_(info.flags) {
    for(auto& p:info.players)if(p.type==1 || p.type==2){if(p.id<0 || p.id>=16 || slot(unsigned(p.id)))throw std::runtime_error("Invalid setup player id");SetupSlot s;s.source=p;s.control=p.type==2?SlotControl::ComputerNormal:SlotControl::Open;s.race=p.race>=1 && p.race<=4?unsigned(p.race):5;s.color=unsigned(p.id);s.team=static_cast<unsigned>(slots_.size());
        if(customForces()){auto found=std::find_if(forces_.begin(),forces_.end(),[&](auto& f){return (f.players&(1u<<p.id))!=0;});s.team=found==forces_.end()?unsigned(forces_.size()+slots_.size()):unsigned(found-forces_.begin());}slots_.push_back(std::move(s));}
    auto local=std::find_if(slots_.begin(),slots_.end(),[](auto& s){return s.source.type==1;});if(local!=slots_.end())local->control=SlotControl::Local;
}
std::optional<unsigned> PlayerSetup::localPlayer() const {for(auto& s:slots_)if(s.control==SlotControl::Local)return unsigned(s.source.id);return std::nullopt;}
std::vector<SlotControl> PlayerSetup::controls(unsigned id) const {auto found=std::find_if(slots_.begin(),slots_.end(),[&](auto& s){return s.source.id==int(id);});if(found==slots_.end())return {};if(found->control==SlotControl::Local)return {SlotControl::Local};if(found->source.type==2)return {SlotControl::ComputerEasy,SlotControl::ComputerNormal,SlotControl::ComputerInsane};return {SlotControl::Local,SlotControl::Open,SlotControl::Closed,SlotControl::ComputerEasy,SlotControl::ComputerNormal,SlotControl::ComputerInsane};}
bool PlayerSetup::control(unsigned id,SlotControl control) {auto s=slot(id);auto choices=controls(id);if(!s || std::find(choices.begin(),choices.end(),control)==choices.end())return false;if(control==SlotControl::Local)for(auto& other:slots_)if(other.control==SlotControl::Local)other.control=SlotControl::Open;s->control=control;return true;}
bool PlayerSetup::race(unsigned id,unsigned race) {auto s=slot(id);if(!s || !s->active() || fixedSettings() || race<1 || race>5)return false;s->race=race;return true;}
bool PlayerSetup::team(unsigned id,unsigned team) {auto s=slot(id);if(!s || !s->active() || customForces() || team>=slots_.size())return false;s->team=team;return true;}
bool PlayerSetup::color(unsigned id,unsigned color) {auto s=slot(id);if(!s || !s->active() || fixedSettings() || color>=16)return false;auto occupied=std::find_if(slots_.begin(),slots_.end(),[&](auto& other){return other.color==color;});if(occupied!=slots_.end())occupied->color=s->color;s->color=color;return true;}
bool PlayerSetup::handicap(unsigned id,unsigned percent) {auto s=slot(id);if(!s || !s->active() || percent<50 || percent>100 || percent%10)return false;s->handicap=percent;return true;}
}
