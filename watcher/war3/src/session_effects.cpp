// Author: MiYu. Script and spell effects share live source models, widget attachment, lifetime and native ownership.
#include "session.h"
#include <bit>
#include <cmath>

namespace war3 {
jass::Value ScriptSession::createEffect(const std::string& model,WorldPoint point,std::uint32_t target,const std::string& attachment,bool automatic) {
    if(model.empty() || model=="_")return runtime_.handle("effect",0);if(model.size()>1024 || effects_.size()>=8192)throw std::runtime_error("Effect definition or instance budget exceeded");if(target && !alive(target,NativeKind::Unit) && !alive(target,NativeKind::Item) && !alive(target,NativeKind::Destructable))return runtime_.handle("effect",0);auto h=create(NativeKind::Effect);auto e=std::make_shared<ScriptEffect>();e->id=h.bits;e->model=model;e->point=requireWorld().clamp(point);e->target=target;e->attachment=attachment;e->automatic=automatic;e->born=simulationTime_;std::get<std::shared_ptr<ScriptEffect>>(object(h,NativeKind::Effect).state)=e;effects_[h.bits]=std::move(e);return h;
}
void ScriptSession::destroyEffect(std::uint32_t id) {if(!id || !alive(id,NativeKind::Effect))return;auto e=std::get<std::shared_ptr<ScriptEffect>>(objects_[id-handleBase].state);e->destroyed=simulationTime_;e->expires.reset();destroy(runtime_.handle("effect",id),NativeKind::Effect);}
void ScriptSession::effectExpires(std::uint32_t id,double time) {if(!std::isfinite(time) || time<0 || time>simulationTime_+86400)throw std::runtime_error("Effect retirement exceeds supported range");auto found=effects_.find(id);if(found!=effects_.end())found->second->expires=time;}
void ScriptSession::effectsTick() {
    for(auto it=effects_.begin();it!=effects_.end();){auto e=it->second;if(e->target){if(alive(e->target,NativeKind::Unit)){auto u=units_.at(e->target);e->point={u->x,u->y};e->z=u->flyHeight;}else if(alive(e->target,NativeKind::Item)){auto item=items_.at(e->target);e->point={item->x,item->y};}else if(alive(e->target,NativeKind::Destructable)){auto d=destructables_.at(e->target);e->point=d->position;}else{e->target=0;if(!e->destroyed)destroyEffect(e->id);}}if(e->expires && *e->expires<=simulationTime_ && (e->destroyed || e->automatic)){if(alive(e->id,NativeKind::Effect))destroy(runtime_.handle("effect",e->id),NativeKind::Effect);it=effects_.erase(it);}else ++it;}
}
std::vector<std::uint32_t> ScriptSession::spellVisual(const SpellInfo& spell,const char* field,std::uint32_t target,WorldPoint point,bool automatic) {std::vector<std::uint32_t> created;auto paths=definitions().field(spell.ability,"Profile",field);size_t at=0;while(at<paths.size()){auto end=paths.find(',',at);auto model=paths.substr(at,end==std::string::npos?end:end-at);auto first=model.find_first_not_of(" \t\"");if(first!=std::string::npos){model=model.substr(first,model.find_last_not_of(" \t\"")-first+1);auto attachment=definitions().field(spell.ability,"Profile",std::string(field)=="CasterArt"?"Casterattach":std::string(field)=="Specialart"?"Specialattach":"Targetattach","origin");auto h=createEffect(model,point,target,attachment,automatic);if(h.bits)created.push_back(h.bits);}at=end==std::string::npos?paths.size():end+1;}return created;}
void ScriptSession::releaseBuff(UnitBuff& buff) {if(buff.kind==BuffKind::Morph && alive(buff.target,NativeKind::Unit)){auto u=units_.at(buff.target);if(!u->removing && std::bit_cast<float>(u->life.bits())>0){SpellInfo art;art.ability=buff.id;spellVisual(art,"Effectart",buff.target,{u->x,u->y});}}for(auto id:buff.visuals){auto found=effects_.find(id);if(found!=effects_.end() && found->second->groundAnchor){auto e=found->second;if(alive(e->target,NativeKind::Unit)){auto u=units_.at(e->target);e->point={u->x,u->y};e->z=u->flyHeight;}e->target=0;}destroyEffect(id);}buff.visuals.clear();}
void ScriptSession::bindEffectNatives() {
    auto text=[](const jass::Value& v){return v.text?*v.text:std::string{};};
    bind("AddSpecialEffect","effect",{"string","real","real"},[this,text](auto&,auto a){return createEffect(text(a[0]),{jass::Real::fromBits(a[1].bits),jass::Real::fromBits(a[2].bits)});});
    bind("AddSpecialEffectLoc","effect",{"string","location"},[this,text](auto&,auto a){return createEffect(text(a[0]),std::get<WorldPoint>(object(a[1],NativeKind::Location).state));});
    bind("AddSpecialEffectTarget","effect",{"string","widget","string"},[this,text](auto&,auto a){return createEffect(text(a[0]),{},a[1].bits,text(a[2]));});
    bind("DestroyEffect","nothing",{"effect"},[this](auto& vm,auto a){destroyEffect(a[0].bits);return vm.nothing();});
}
}
