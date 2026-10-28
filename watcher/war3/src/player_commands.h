// Author: MiYu. Explicit player-issued ground and stop commands shared by game input and simulation.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace war3 {
class ScriptSession;
enum class PlayerCommandKind : std::uint8_t {GroundMove,GroundAttack,GroundPatrol,Stop,Hold,TargetOrder,SpellUnit,SpellPoint,SpellImmediate,BuildAt,Train,Research,Upgrade,CancelUpgrade,CancelBuild,CancelProduction,Revive,ReturnResources,LearnSkill,ItemImmediate,ItemUnit,ItemPoint,DropItem,UnloadUnit,PurchaseItem,PurchaseUnit,SetAlliance,SetAlliedVictory,TransferResources,Chat,AbilityAutocast,RepairAutocast,DialogClick,EndCinematic,SpellUnitOrder,SpellPointOrder,SpellImmediateOrder};
struct PlayerCommand {
    unsigned player=0;
    PlayerCommandKind kind=PlayerCommandKind::GroundMove;
    std::vector<std::uint32_t> units;
    std::uint32_t xBits=0,yBits=0;
    std::uint32_t target=0,order=0,ability=0;
    bool stopOnSuccess=false;
    std::uint32_t objectType=0,queueIndex=0,item=0;
    unsigned otherPlayer=0,allianceOption=0;
    int gold=0,lumber=0;
    bool enabled=false;
    std::string text;
};
unsigned dispatchPlayerCommand(ScriptSession& session,const PlayerCommand& command);
}
