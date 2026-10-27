// Author: MiYu. Spatial aura refresh, strongest shared buff, retained membership and shared recipient visuals.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <unordered_map>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
int cell(float v){return int(std::clamp(std::floor(double(v)/512),double(INT_MIN),double(INT_MAX)));}
std::uint64_t gridKey(int x,int y){return (std::uint64_t(std::uint32_t(x))<<32)|std::uint32_t(y);}
bool stronger(const UnitAura& a,const UnitAura& b){auto& x=*a.definition;auto& y=*b.definition;float left=std::abs(x.amount)+std::abs(x.secondary),right=std::abs(y.amount)+std::abs(y.secondary);if(left!=right)return left>right;if(x.level!=y.level)return x.level>y.level;return std::pair{a.source,x.ability}<std::pair{b.source,y.ability};}
}
void ScriptSession::aggregateAuras(UnitState& u,bool visuals) {
    AuraBonuses result;for(auto& [id,entry]:u.auras){auto& p=*entry.definition;switch(p.kind){
        case PassiveKind::Brilliance:(p.percent?result.manaPercent:result.mana)+=p.amount;break;
        case PassiveKind::Devotion:(p.percent?result.armorPercent:result.armor)+=p.amount;break;
        case PassiveKind::SlowAura:case PassiveKind::Endurance:result.movement+=p.amount;result.attackSpeed+=p.secondary;break;
        case PassiveKind::Unholy:result.movement+=p.amount;(p.percent?result.healthPercent:result.health)+=p.secondary;break;
        case PassiveKind::Regeneration:(p.percent?result.healthPercent:result.health)+=p.amount;break;
        case PassiveKind::Vampiric:result.vampiric+=p.amount;break;
        case PassiveKind::Thorns:(p.percent?result.thorns:result.thornsFlat)+=p.amount;break;
        case PassiveKind::Trueshot:case PassiveKind::Command:case PassiveKind::WarDrums:if(p.melee)(p.percent?result.meleeDamage:result.meleeFlat)+=p.amount;if(p.ranged)(p.percent?result.rangedDamage:result.rangedFlat)+=p.amount;break;
        default:throw std::runtime_error("Non-aura entered aura membership");
    }}u.aura=result;if(!visuals)return;
    std::set<std::pair<std::string,std::string>> desired;for(auto& [id,entry]:u.auras)for(auto& model:entry.definition->targetModels)desired.insert(model);for(auto it=u.auraVisuals.begin();it!=u.auraVisuals.end();)if(!desired.contains(it->first)){destroyEffect(it->second);it=u.auraVisuals.erase(it);}else ++it;for(auto& model:desired)if(!u.auraVisuals.contains(model)){auto effect=createEffect(model.first,{u.x,u.y},u.handle,model.second,false);if(effect.bits)u.auraVisuals.emplace(model,effect.bits);}
}
void ScriptSession::clearAuras(UnitState& u){for(auto& [model,id]:u.auraVisuals)destroyEffect(id);u.auraVisuals.clear();u.auras.clear();u.aura={};}
void ScriptSession::releaseAuraSource(std::uint32_t id){for(auto it=auraEmitters_.begin();it!=auraEmitters_.end();)if(it->first.first==id){for(auto effect:it->second.effects)destroyEffect(effect);it=auraEmitters_.erase(it);}else ++it;}
void ScriptSession::aurasTick(double delta) {
    for(auto& [id,u]:units_){if(u->removing || u->hidden() || number(u->life)<=0){if(!u->auras.empty())clearAuras(*u);continue;}if(u->paused)continue;bool changed=false;for(auto it=u->auras.begin();it!=u->auras.end();){it->second.remaining-=delta;if(it->second.remaining<=0){it=u->auras.erase(it);changed=true;}else ++it;}if(changed)aggregateAuras(*u);}
    if((auraTicks_++%8)!=0)return;
    std::unordered_map<std::uint64_t,std::vector<std::uint32_t>> grid;for(auto& [id,u]:units_)if(!u->removing && !u->hidden() && number(u->life)>0)grid[gridKey(cell(number(u->x)),cell(number(u->y)))].push_back(id);
    std::map<std::pair<std::uint32_t,std::uint32_t>,UnitAura> incoming;std::set<std::pair<std::uint32_t,std::uint32_t>> emitters;
    bool illusions=gameplayNumber("IllusionsBestowAuras",0)!=0,flyingHeroes=gameplayNumber("FlyingHeroesBestowAuras",0)!=0,morphed=gameplayNumber("PolymorphedUnitsBestowAuras",0)!=0;
    for(auto& [id,u]:units_){
        if(u->removing || u->hidden() || u->construction || number(u->life)<=0)continue;
        for(auto [ability,level]:passiveAbilities(*u)){
            auto& p=passiveInfo(ability,level);if(p.kind==PassiveKind::SpikedCarapace){auto source=std::pair{id,ability};emitters.insert(source);auto& visual=auraEmitters_[source];if(visual.level!=level){for(auto effect:visual.effects)destroyEffect(effect);visual.effects.clear();visual.level=level;SpellInfo art;art.ability=p.buff?p.buff:ability;visual.effects=spellVisual(art,"TargetArt",id,{u->x,u->y},false);}continue;}if(!p.aura || (u->illusion && !illusions) || (u->morphed() && !morphed) || (u->hero && (u->movementType=="fly" || u->cycloned()) && !flyingHeroes))continue;auto source=std::pair{id,ability};emitters.insert(source);auto& visual=auraEmitters_[source];if(visual.level!=level){for(auto effect:visual.effects)destroyEffect(effect);visual.effects.clear();visual.level=level;SpellInfo art;art.ability=ability;for(auto field:{"CasterArt","TargetArt"}){auto ids=spellVisual(art,field,id,{u->x,u->y},false);visual.effects.insert(visual.effects.end(),ids.begin(),ids.end());}}
            auto consider=[&](std::uint32_t target){auto to=units_.at(target);if(std::hypot(number(u->x)-number(to->x),number(u->y)-number(to->y))>p.area || !passiveTarget(*u,*to,p))return;UnitAura entry;entry.definition=&p;entry.source=id;entry.remaining=to->hero?p.heroDuration:p.duration;if(entry.remaining<=0)entry.remaining=2;entry.positive=p.amount>=0 && p.secondary>=0;auto key=std::pair{target,p.buff?p.buff:ability};auto found=incoming.find(key);if(found==incoming.end())incoming.emplace(key,std::move(entry));else if(stronger(entry,found->second))found->second=std::move(entry);};
            int left=cell(number(u->x)-p.area),right=cell(number(u->x)+p.area),bottom=cell(number(u->y)-p.area),top=cell(number(u->y)+p.area);double buckets=(double(right)-left+1)*(double(top)-bottom+1);if(buckets>double(units_.size())*2)for(auto& [target,to]:units_)consider(target);else for(std::int64_t y=bottom;y<=top;++y)for(std::int64_t x=left;x<=right;++x)if(auto bucket=grid.find(gridKey(int(x),int(y)));bucket!=grid.end())for(auto target:bucket->second)consider(target);
        }
    }
    std::set<std::uint32_t> changed;for(auto& [key,entry]:incoming){units_.at(key.first)->auras[key.second]=std::move(entry);changed.insert(key.first);}for(auto id:changed)aggregateAuras(*units_.at(id));
    for(auto it=auraEmitters_.begin();it!=auraEmitters_.end();)if(!emitters.contains(it->first)){for(auto effect:it->second.effects)destroyEffect(effect);it=auraEmitters_.erase(it);}else ++it;
}
}
