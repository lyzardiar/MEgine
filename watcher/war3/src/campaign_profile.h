// Author: MiYu. Local campaign availability, cinematic flags and difficulty shared by menus and scripts.
#pragma once
#include "platform.h"
#include <array>
namespace war3 {
class CampaignProfile {
    std::array<std::array<std::uint8_t,5>,2> campaigns_{};
    std::array<std::array<std::array<std::uint8_t,128>,5>,2> missions_{};
    std::array<std::array<std::array<std::uint8_t,2>,5>,2> cinematics_{};
    std::uint8_t tutorial_=0,mode_=0,selected_=0,difficulty_=1;
    static fs::path path();
    void load();
    void save() const;
public:
    CampaignProfile();
    bool campaign(bool expansion,unsigned index,bool fallback) const;
    bool mission(bool expansion,unsigned campaign,unsigned index,bool fallback) const;
    bool cinematic(bool expansion,unsigned campaign,bool ending,bool fallback) const;
    void setCampaign(bool expansion,unsigned index,bool enabled);
    void setMission(bool expansion,unsigned campaign,unsigned index,bool enabled);
    void setCinematic(bool expansion,unsigned campaign,bool ending,bool enabled);
    void setTutorial(bool cleared);
    void select(bool expansion,unsigned index);
    void difficulty(unsigned value);
    unsigned difficulty() const {return difficulty_;}
    bool expansion() const {return mode_!=0;}
    unsigned selected() const {return selected_;}
};
}
