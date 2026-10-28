// Author: MiYu. Explicit player-issued ground and stop commands shared by game input and simulation.
#pragma once
#include <cstdint>
#include <vector>

namespace war3 {
class ScriptSession;
enum class PlayerCommandKind : std::uint8_t {GroundMove,GroundAttack,GroundPatrol,Stop,Hold};
struct PlayerCommand {
    unsigned player=0;
    PlayerCommandKind kind=PlayerCommandKind::GroundMove;
    std::vector<std::uint32_t> units;
    std::uint32_t xBits=0,yBits=0;
};
unsigned dispatchPlayerCommand(ScriptSession& session,const PlayerCommand& command);
}
