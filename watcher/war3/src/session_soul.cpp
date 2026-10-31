// Author: MiYu. Soul gems retain the target until its soul-trap ability is removed or its carrier dies.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
void ScriptSession::releaseSoul(std::uint32_t casterId) {
    if(!alive(casterId,NativeKind::Unit))return;auto caster=units_.at(casterId);auto victimId=caster->soulVictim;if(!victimId)return;caster->soulVictim=0;caster->soulVisionPlayer=UINT32_MAX;if(alive(victimId,NativeKind::Unit)){auto victim=units_.at(victimId);if(victim->soulCaptor==casterId){auto ability=ObjectData::code("Asou");releaseAbility(victimId,ability);victim->abilities.erase(ability);victim->soulCaptor=0;victim->paused=victim->soulWasPaused;victim->x=caster->x;victim->y=caster->y;victim->route.clear();victim->waypoint=0;victim->currentOrder=0;unitFootprint(*victim);}}++fogRevision_;
}
void ScriptSession::captureSoul(std::uint32_t casterId,const CastOrder& cast) {
    if(!alive(casterId,NativeKind::Unit) || !alive(cast.target,NativeKind::Unit))return;auto caster=units_.at(casterId),victim=units_.at(cast.target);if(!spellTarget(*caster,*victim,cast.spell,true,cast.owner))return;auto revision=victim->deathRevision;auto owner=victim->owner;if(!cancelCombat(*victim))return;if(!alive(casterId,NativeKind::Unit) || !alive(cast.target,NativeKind::Unit) || caster->removing || number(caster->life)<=0 || !caster->cast || caster->cast->ticket!=cast.ticket || victim->removing || victim->deathRevision!=revision || victim->owner!=owner || !spellTarget(*caster,*victim,cast.spell,true,cast.owner))return;
    caster->soulVictim=cast.target;caster->soulVisionPlayer=owner;victim->abilities[ObjectData::code("Asou")]=1;victim->soulCaptor=casterId;victim->soulWasPaused=victim->paused;victim->paused=true;victim->route.clear();victim->waypoint=0;victim->currentOrder=0;unitFootprint(*victim);++fogRevision_;spellVisual(cast.spell,"Effectart",cast.target,{victim->x,victim->y});
}
}
