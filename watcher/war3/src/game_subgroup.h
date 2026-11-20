// Author: MiYu. Inventory-bearing units form individual subgroups within a selection.
#pragma once
#include "entities.h"
#include <algorithm>

namespace war3 {
inline bool selectionHeroBefore(const UnitState& a,const UnitState& b) {if(bool(a.hero)!=bool(b.hero))return bool(a.hero);return a.hero && b.hero && a.level>b.level;}
inline bool sameSelectionSubgroup(const UnitState& a,const UnitState& b) {if(a.type!=b.type)return false;if(a.handle==b.handle)return true;auto hasItem=[](const UnitState& u){return std::any_of(u.inventory.begin(),u.inventory.end(),[](auto id){return id!=0;});};return !hasItem(a) && !hasItem(b);}
}
