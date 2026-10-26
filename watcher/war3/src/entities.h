// Author: MiYu. Persistent source-backed unit, item and weather state for native sessions.
#pragma once
#include "world.h"
#include "object_data.h"

namespace war3 {
struct UnitState {
    std::uint32_t type=0,owner=0;
    std::string name,model,icon;
    jass::Real x,y,facing,life,maxLife,mana,maxMana,moveSpeed,defaultMoveSpeed,acquireRange;
    int resources=0,userData=0,level=1,foodUsed=0,foodMade=0;
    bool visible=true,paused=false,invulnerable=false,pathing=true,selected=false;
    std::map<std::uint32_t,int> abilities;
    std::map<std::uint32_t,bool> autocast;
    std::uint32_t currentOrder=0;
    bool holding=false;
    bool building=false,hero=false;
    std::uint32_t race=7;
    float scale=1,collision=16,flyHeight=0;
    float selectionSize=128;
    std::string movementType;
    std::vector<WorldPoint> route;
    size_t waypoint=0;
    double animationStart=0;
    double animationTime=0;
    float animationRate=1,targetFlyHeight=0,flyRate=0;
    std::array<float,3> visualScale{1,1,1};
    std::array<std::uint8_t,4> tint{255,255,255,255};
    std::optional<unsigned> color;
    std::string animation;
    std::optional<unsigned> animationIndex;
    std::vector<std::string> animationQueue;
    std::array<std::uint32_t,6> inventory{};
    std::map<std::uint32_t,bool> permanentAbilities;
};
struct ItemState {
    std::uint32_t type=0,owner=15;
    std::string name,model,icon;
    jass::Real x,y,life,maxLife;
    int charges=0,userData=0,level=0;
    std::uint32_t holder=0;
    bool visible=true,invulnerable=false,droppable=true,pawnable=true,dropOnDeath=true;
};
struct WeatherState {std::uint32_t type=0;WorldRect region;SourceTable::Row definition;bool enabled=false;};
}
