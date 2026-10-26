// Author: MiYu. Persistent source-backed unit, item and weather state for native sessions.
#pragma once
#include "world.h"
#include "object_data.h"

namespace war3 {
struct UnitState {
    std::uint32_t type=0,owner=0;
    std::string name,model;
    jass::Real x,y,facing,life,maxLife,mana,maxMana,moveSpeed,defaultMoveSpeed,acquireRange;
    int resources=0,userData=0,level=1,foodUsed=0,foodMade=0;
    bool visible=true,paused=false,invulnerable=false,pathing=true,selected=false;
};
struct ItemState {
    std::uint32_t type=0,owner=15;
    std::string name,model;
    jass::Real x,y,life,maxLife;
    int charges=0,userData=0,level=0;
    bool visible=true,invulnerable=false,droppable=true,pawnable=true,dropOnDeath=true;
};
struct WeatherState {std::uint32_t type=0;WorldRect region;SourceTable::Row definition;bool enabled=false;};
}
