// Author: MiYu. Death-triggered ability snapshots preserve unit identity through reincarnation and Phoenix egg cycles.
#pragma once
#include <cstdint>
#include <vector>
namespace war3 {
enum class DeathPassiveKind {Reincarnation,ItemReincarnation,Phoenix};
struct DeathPassiveInfo {
    DeathPassiveKind kind=DeathPassiveKind::Reincarnation;
    std::uint32_t ability=0,normalType=0,eggType=0;
    unsigned level=0;
    float delay=0,cooldown=0,health=0,mana=0;
};
struct RebirthState {DeathPassiveInfo definition;double remaining=0;float manaBefore=0;std::vector<std::uint32_t> visuals;};
struct PhoenixCycle {DeathPassiveInfo definition;double remaining=0;};
}
