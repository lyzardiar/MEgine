// Author: MiYu. Per-player match results, observed statistics and script dialog state owned by one native session.
#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace war3 {
enum class SessionExit {None,Return,Restart,ChangeLevel};
struct PlayerStatistics {int trained=0,killed=0,built=0,razed=0,heroesKilled=0,items=0,mercenaries=0,foodProduced=0,foodUsed=0,goldMined=0,lumberMined=0,goldLostUpkeep=0,lumberLostUpkeep=0,goldLostTax=0,lumberLostTax=0,goldGiven=0,goldReceived=0,lumberGiven=0,lumberReceived=0;};
struct HeroSummary {std::uint32_t type=0;std::string name;int level=0,experience=0;std::array<int,3> attributes{};};
struct ScriptDialog {std::string message;std::vector<std::uint32_t> buttons;unsigned owners=0;std::uint64_t revision=1;};
struct ScriptButton {std::uint32_t dialog=0;std::string text;unsigned hotkey=0;bool quit=false,scores=false;};
struct ScriptDefeatCondition {std::string description;};
}
