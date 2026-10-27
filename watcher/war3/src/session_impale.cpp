// Author: MiYu. Source Impale wave propagation, airborne control, landing damage and post-landing stun share actual unit buffs.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
void ScriptSession::startImpale(std::uint32_t source,const CastOrder& cast,unsigned owner){
    if(!alive(source,NativeKind::Unit))return;if(spellWaves_.size()>=4096)throw std::runtime_error("Active spell wave budget exceeded");auto u=units_.at(source);SpellWave wave;wave.spell=cast.spell;wave.source=source;wave.owner=owner;wave.origin={u->x,u->y};wave.born=simulationTime_;float dx=number(cast.point.x)-number(u->x),dy=number(cast.point.y)-number(u->y),length=std::hypot(dx,dy);float angle=number(u->facing)*3.14159265359f/180;wave.directionX=length>.001f?dx/length:std::cos(angle);wave.directionY=length>.001f?dy/length:std::sin(angle);spellVisual(cast.spell,"CasterArt",source,wave.origin);spellWaves_.emplace(++spellTicket_,std::move(wave));
}
void ScriptSession::impaleWaveArt(SpellWave& wave,float next){
    constexpr float spacing=96;while(wave.nextArt<=next){WorldPoint point{real(number(wave.origin.x)+wave.directionX*wave.nextArt),real(number(wave.origin.y)+wave.directionY*wave.nextArt)};auto ids=spellVisual(wave.spell,"Specialart",0,point);for(auto id:ids)if(effects_.contains(id))effects_.at(id)->facing=std::atan2(wave.directionY,wave.directionX);wave.nextArt+=spacing;}
}
void ScriptSession::impaleHit(std::uint32_t source,std::uint32_t target,const SpellInfo& spell,unsigned owner){
    if(!alive(source,NativeKind::Unit) || !alive(target,NativeKind::Unit))return;auto u=units_.at(target);if(!spellTarget(*units_.at(source),*u,spell,false,owner))return;auto revision=u->deathRevision;auto s=spell;s.duration+=s.heightTime;s.heroDuration+=s.heightTime;applyBuff(target,source,s,BuffKind::Impale);if(!alive(target,NativeKind::Unit) || u->removing || u->deathRevision!=revision || number(u->life)<=0)return;auto found=u->buffs.find(s.buff);if(found==u->buffs.end() || found->second.kind!=BuffKind::Impale || found->second.source!=source)return;auto& buff=found->second;buff.damage=spell.amount;buff.lockRemaining=buff.total=spell.heightTime;buff.dispellable=false;buff.carrierAttachment=definitions().field(s.buff,"Profile","Effectattach","sprite,first");auto art=s;art.ability=s.buff;if(s.heightTime>0){auto ids=spellVisual(art,"Effectart",target,{u->x,u->y},false);for(auto id:ids)if(effects_.contains(id)){auto e=effects_.at(id);e->groundAnchor=true;e->attachment.clear();}buff.visuals.insert(buff.visuals.end(),ids.begin(),ids.end());}else {buff.damage=0;damageUnit(source,target,spell.amount,0,14);}
}
float ScriptSession::impaleLanding(UnitBuff& buff,double elapsed){
    if(buff.kind!=BuffKind::Impale)return 0;double before=buff.lockRemaining;buff.lockRemaining=std::max(0.,before-elapsed);if(before<=0 || buff.lockRemaining>0)return 0;for(auto it=buff.visuals.begin();it!=buff.visuals.end();){auto found=effects_.find(*it);if(found!=effects_.end() && found->second->groundAnchor){found->second->target=0;destroyEffect(*it);it=buff.visuals.erase(it);}else ++it;}float damage=buff.damage;buff.damage=0;return damage;
}
}
