// Author: MiYu. Source Orb of Annihilation modifies a real weapon attack and stores its mana-paid payload in the projectile snapshot.
#include "session.h"
#include <bit>

namespace war3 {
const SpellInfo* ScriptSession::attackOrb(const UnitState& u,const UnitState& target,std::uint32_t forced){
    if(u.illusion || u.abilitiesDisabled())return nullptr;for(auto [ability,level]:u.abilities){if(level<=0 || (forced?ability!=forced:(!u.autocast.contains(ability) || !u.autocast.at(ability))))continue;auto& s=spellInfo(ability,unsigned(level));if(s.kind!=SpellKind::OrbAnnihilation || std::bit_cast<float>(u.mana.bits())<s.mana || spellCooldown(u.handle,ability)>0 || !spellRequirements(u.owner,s))continue;auto available=config_.players[u.owner].abilityAvailable.find(ability);if(available!=config_.players[u.owner].abilityAvailable.end() && !available->second)continue;auto slot=weaponFor(u,target);if(!slot)continue;auto weapon=unitWeapon(u,*slot);orbWeapon(weapon,s);if(weaponTarget(u,target,weapon))return &s;}return nullptr;
}
void ScriptSession::orbWeapon(WeaponDefinition& w,const SpellInfo& s){w.base+=s.amount;w.kind="msplash";w.fullArea=s.fullArea;w.halfArea=s.halfArea;w.quarterArea=s.area;w.halfFactor=s.secondary;w.quarterFactor=s.loss;w.targets=s.allowed;w.splashTargets=s.allowed;w.model=s.missile;w.speed=s.speed;w.arc=s.missileArc;w.homing=true;w.range=s.range;}
}
