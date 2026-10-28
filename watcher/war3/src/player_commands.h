// Author: MiYu. Explicit player-issued ground and stop commands shared by game input and simulation.
#pragma once
#include <cstdint>
#include <vector>

namespace war3 {
class ScriptSession;
enum class PlayerCommandKind : std::uint8_t {GroundMove,GroundAttack,GroundPatrol,Stop,Hold,TargetOrder,SpellUnit,SpellPoint,SpellImmediate};
struct PlayerCommand {
    unsigned player=0;
    PlayerCommandKind kind=PlayerCommandKind::GroundMove;
    std::vector<std::uint32_t> units;
    std::uint32_t xBits=0,yBits=0;
    std::uint32_t target=0,order=0,ability=0;
    bool stopOnSuccess=false;
};
unsigned dispatchPlayerCommand(ScriptSession& session,const PlayerCommand& command);
}
