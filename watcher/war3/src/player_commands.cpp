// Author: MiYu. Execute explicit ordered player commands against live session permissions and state.
#include "player_commands.h"
#include "session.h"
#include <bit>
#include <cmath>

namespace war3 {
unsigned dispatchPlayerCommand(ScriptSession& session,const PlayerCommand& command) {
    if(command.player>=16)return 0;bool ground=command.kind==PlayerCommandKind::GroundMove || command.kind==PlayerCommandKind::GroundAttack || command.kind==PlayerCommandKind::GroundPatrol;if(!ground && command.kind!=PlayerCommandKind::Stop && command.kind!=PlayerCommandKind::Hold)return 0;if(ground && (!std::isfinite(std::bit_cast<float>(command.xBits)) || !std::isfinite(std::bit_cast<float>(command.yBits))))return 0;WorldPoint point{jass::Real::fromBits(command.xBits),jass::Real::fromBits(command.yBits)};unsigned accepted=0;
    for(auto id:command.units){auto found=session.units().find(id);if(found==session.units().end() || !session.canControlUnit(command.player,*found->second))continue;auto unit=found->second;bool issued=false;switch(command.kind){case PlayerCommandKind::GroundMove:issued=unit->stationaryBuilding()?session.setRally(id,point):session.moveUnit(id,point);break;case PlayerCommandKind::GroundAttack:issued=session.attackMove(id,point);break;case PlayerCommandKind::GroundPatrol:issued=session.attackMove(id,point,true);break;case PlayerCommandKind::Stop:issued=session.stopUnit(id);break;case PlayerCommandKind::Hold:issued=session.stopUnit(id,true);break;}if(issued)++accepted;}return accepted;
}
}
