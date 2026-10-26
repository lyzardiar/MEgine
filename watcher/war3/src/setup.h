// Author: MiYu. Source player slots and editable native session draft.
#pragma once
#include "map.h"

namespace war3 {
enum class SlotControl {Open,Closed,Local,ComputerEasy,ComputerNormal,ComputerInsane};
struct SetupSlot {
    MapPlayer source;
    SlotControl control=SlotControl::Open;
    unsigned race=5,team=0,color=0,handicap=100;
    bool active() const {return control!=SlotControl::Open && control!=SlotControl::Closed;}
};
class PlayerSetup {
    std::vector<SetupSlot> slots_;
    std::vector<MapForce> forces_;
    unsigned flags_=0;
    SetupSlot* slot(unsigned id);
public:
    explicit PlayerSetup(const MapInfo& info);
    const std::vector<SetupSlot>& slots() const {return slots_;}
    const SetupSlot* find(unsigned id) const;
    const std::vector<MapForce>& forces() const {return forces_;}
    bool fixedSettings() const {return (flags_&0x20)!=0;}
    bool customForces() const {return (flags_&0x40)!=0;}
    std::vector<SlotControl> controls(unsigned id) const;
    bool control(unsigned id,SlotControl control);
    bool race(unsigned id,unsigned race);
    bool team(unsigned id,unsigned team);
    bool color(unsigned id,unsigned color);
    bool handicap(unsigned id,unsigned percent);
    std::optional<unsigned> localPlayer() const;
};
}
