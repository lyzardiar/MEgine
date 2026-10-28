// Author: MiYu. Source passive defenses consume actual attack classes, chance, damage limits and technology gates.
#include "session.h"
#include <algorithm>

namespace war3 {
float ScriptSession::defensePassiveDamage(const UnitState& unit,float damage,unsigned attackType,bool attack,bool ranged,bool spellDamage,unsigned owner){
    if(damage<=0)return damage;float block=0,minimum=0,pierce=1,magic=1,pierceAmplification=1,magicAmplification=1;
    for(auto [ability,level]:passiveAbilities(unit)){auto& p=passiveInfo(ability,level);if(p.kind==PassiveKind::MissileDefense){if(p.amount<=1)pierce=std::min(pierce,p.amount);else pierceAmplification=std::max(pierceAmplification,p.amount);if(p.magicFactor<=1)magic=std::min(magic,p.magicFactor);else magicAmplification=std::max(magicAmplification,p.magicFactor);continue;}if(p.kind!=PassiveKind::HardenedSkin || !attack || (ranged?!p.ranged:!p.melee))continue;bool hostile=owner<16 && enemy(owner,unit.owner);bool relations=p.allowed.contains("enemy") || p.allowed.contains("enemies") || p.allowed.contains("ally") || p.allowed.contains("allies") || p.allowed.contains("friend");if(relations && (hostile?(!p.allowed.contains("enemy") && !p.allowed.contains("enemies")):(!p.allowed.contains("ally") && !p.allowed.contains("allies") && !p.allowed.contains("friend"))))continue;if(!passiveChance(p.amount))continue;float result=std::min(damage,std::max(p.secondary,damage-p.bonus));if(damage-result>block){block=damage-result;minimum=p.secondary;}}
    if(attack && ranged && attackType==2)damage*=pierce*pierceAmplification;else if(spellDamage)damage*=magic*magicAmplification;if(block>0)damage=std::min(damage,std::max(minimum,damage-block));return std::max(0.f,damage);
}
}
