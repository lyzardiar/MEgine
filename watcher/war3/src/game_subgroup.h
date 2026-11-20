// Author: MiYu. Inventory-bearing units form individual subgroups within a selection.
#pragma once
#include "entities.h"
#include <algorithm>
#include <cstddef>
#include <map>
#include <vector>

namespace war3 {
inline bool selectionHeroBefore(const UnitState& a,const UnitState& b) {if(bool(a.hero)!=bool(b.hero))return bool(a.hero);return a.hero && b.hero && a.level>b.level;}
inline bool selectionHasItem(const UnitState& u) {return std::any_of(u.inventory.begin(),u.inventory.end(),[](auto id){return id!=0;});}
inline bool sameSelectionSubgroup(const UnitState& a,const UnitState& b) {if(a.type!=b.type)return false;if(a.handle==b.handle)return true;return !selectionHasItem(a) && !selectionHasItem(b);}
template<class Resolve> void groupNonHeroSelection(std::vector<std::uint32_t>& ids,Resolve resolve) {auto first=std::find_if(ids.begin(),ids.end(),[&](auto id){return !resolve(id).hero;});std::map<std::pair<std::uint32_t,std::uint32_t>,std::size_t> indices;std::vector<std::vector<std::uint32_t>> groups;for(auto it=first;it!=ids.end();++it){auto& u=resolve(*it);auto key=std::pair{u.type,selectionHasItem(u)?u.handle:0u};auto [entry,inserted]=indices.emplace(key,groups.size());if(inserted)groups.emplace_back();groups[entry->second].push_back(*it);}for(auto& group:groups)for(auto id:group)*first++=id;}
}
