// Author: MiYu. Preserve source target tokens while adding original aliases for consumers.
#pragma once
#include <initializer_list>
#include <set>
#include <string>
#include <utility>

namespace war3 {
inline constexpr auto targetAliases=std::initializer_list<std::pair<const char*,const char*>>{{"grou","ground"},{"stru","structure"},{"debr","debris"},{"deco","decoration"},{"tote","ward"},{"totem","ward"},{"enem","enemy"},{"alli","allies"},{"ally","allies"},{"frie","friend"},{"neut","neutral"},{"nonh","nonhero"},{"orga","organic"},{"mech","mechanical"},{"aliv","alive"},{"vuln","vulnerable"},{"invu","invulnerable"},{"play","player"},{"nots","notself"}};
inline void addTargetAliases(std::set<std::string>& values) {for(auto [alias,canonical]:targetAliases)if(values.contains(alias))values.insert(canonical);}
inline void compactTargetAliases(std::set<std::string>& values,size_t limit) {for(auto [alias,canonical]:targetAliases)if(values.size()>limit && values.contains(alias))values.erase(canonical);}
}
