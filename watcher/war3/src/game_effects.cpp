// Author: MiYu. Native source effect instances, animated attachments, spell missiles and wave models consume live sessions.
#include "game_view.h"
#include <bit>
#include <cmath>
#include <algorithm>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
std::uint64_t age(std::uint64_t now,double born){auto start=std::uint64_t(std::max(0.,born)*1000);return now-std::min(now,start);}
bool visible(Model& model,const DirectX::XMMATRIX& vp,float x,float y,float z,float scale=1){SceneBounds bounds;float radius=model.radius()*scale+32;for(int sign:{-1,1})bounds.add(x+sign*radius,y+sign*radius,z+sign*radius);return bounds.visible(vp);}
}
void GameView::drawEffects(std::uint64_t elapsed,const DirectX::XMMATRIX& vp) {
    auto& session=*data_->session;auto player=session.localPlayer().value_or(0);
    for(auto& [id,p]:session.spellMissiles()){
        if(p.spell.missile.empty() || session.fog(player).state(p.position)!=4)continue;auto model=data_->assets->cachedModel(p.spell.missile);if(!model)continue;float x=number(p.position.x),y=number(p.position.y),fraction=std::clamp(p.travelled/std::max(p.distance,.001f),0.f,1.f);float ex=x,ey=y;if(session.units().contains(p.target)){ex=number(session.units().at(p.target)->x);ey=number(session.units().at(p.target)->y);}float startZ=data_->terrain->height(number(p.start.x),number(p.start.y))+p.startHeight,endZ=data_->terrain->height(ex,ey)+p.endHeight,z=startZ+(endZ-startZ)*fraction+p.spell.missileArc*p.distance*std::sin(DirectX::XM_PI*fraction);if(!visible(*model,vp,x,y,z))continue;float yaw=std::atan2(ey-y,ex-x);auto world=DirectX::XMMatrixRotationZ(yaw)*DirectX::XMMatrixTranslation(x,y,z);model->sequence("Stand");model->draw(age(elapsed,p.born),view_,projection_,sceneMatrix(world),true,0xffffffff,&modelInstance((1ull<<62)|id),elapsed);
    }
    for(auto& [id,p]:session.spellWaves()){
        if(p.spell.missile.empty())continue;float x=number(p.origin.x)+p.directionX*p.travelled,y=number(p.origin.y)+p.directionY*p.travelled,z=data_->terrain->height(x,y);WorldPoint point{jass::Real::fromBits(std::bit_cast<std::uint32_t>(x)),jass::Real::fromBits(std::bit_cast<std::uint32_t>(y))};if(session.fog(player).state(point)!=4)continue;auto model=data_->assets->cachedModel(p.spell.missile);if(!model || !visible(*model,vp,x,y,z))continue;auto world=DirectX::XMMatrixRotationZ(std::atan2(p.directionY,p.directionX))*DirectX::XMMatrixTranslation(x,y,z);model->sequence("Stand");model->draw(age(elapsed,p.born),view_,projection_,sceneMatrix(world),true,0xffffffff,&modelInstance((1ull<<61)|id),elapsed);
    }
    for(auto& [id,e]:session.effects()){
        auto model=data_->assets->cachedModel(e->model);if(!model)continue;auto presentation=effectPresentations_.find(id);if(presentation==effectPresentations_.end()){EffectPresentation info;info.birth=model->sequence("Birth");if(info.birth)info.birthTime=model->sequenceDuration();info.stand=model->sequence("Stand");if(info.stand){info.standTime=model->sequenceDuration();info.loops=model->sequenceLoops();}else if(!info.birth){model->sequenceIndex(0);info.standTime=model->sequenceDuration();info.loops=model->sequenceLoops();}info.death=model->sequence("Death");if(info.death)info.deathTime=model->sequenceDuration();presentation=effectPresentations_.emplace(id,info).first;}
        auto& info=presentation->second;auto lifetime=std::uint64_t(std::max(0.f,model->particleLifetime())*1000);auto time=age(elapsed,e->born);bool emit=true,geometry=true;std::uint64_t duration=info.birthTime+info.standTime;
        if(e->destroyed && info.death){model->sequence("Death");time=age(elapsed,*e->destroyed);if(!e->expires)session.effectExpires(id,*e->destroyed+double(info.deathTime+lifetime)/1000);}
        else {
            if(info.birth && time<info.birthTime)model->sequence("Birth");else if(info.stand){model->sequence("Stand");time-=std::min(time,info.birthTime);}else {if(info.birth)model->sequence("Birth");else model->sequenceIndex(0);}
            if((e->automatic || e->destroyed) && !e->expires){double base=e->born;auto span=duration+lifetime;if(e->destroyed && info.loops){base=*e->destroyed;span=lifetime;}session.effectExpires(id,base+double(span)/1000);}
            if(e->destroyed && info.loops){emit=false;geometry=false;}else if(e->automatic && age(elapsed,e->born)>=duration){emit=false;geometry=false;}
        }
        float x=number(e->point.x),y=number(e->point.y),z=data_->terrain->height(x,y)+e->z;auto world=DirectX::XMMatrixScaling(e->scale,e->scale,e->scale)*DirectX::XMMatrixRotationZ(e->facing)*DirectX::XMMatrixTranslation(x,y,z);
        DWORD tint=0xffffffff;if(e->target && session.units().contains(e->target)){
            auto u=session.units().at(e->target);if(!session.unitVisibleTo(e->target,player))continue;if(session.unitInvisible(e->target))tint=0x80ffffff;x=number(u->x);y=number(u->y);if(e->groundAnchor){z=data_->terrain->height(x,y)+u->flyHeight;world=DirectX::XMMatrixScaling(e->scale,e->scale,e->scale)*DirectX::XMMatrixRotationZ(e->facing)*DirectX::XMMatrixTranslation(x,y,z);}else{auto body=unitWorld(*u);if(!body)continue;world=sceneMatrix(*body);z=body->_43;}
            if(!e->groundAnchor && !e->attachment.empty()){auto host=data_->assets->cachedModel(u->displayModel());if(!host)continue;if(u->animationIndex)host->sequenceIndex(*u->animationIndex);else {auto animation=u->animation.empty()?(number(u->life)<=0?std::string("Death"):!u->rooted() && !u->stunned() && u->waypoint<u->route.size()?std::string("Walk"):std::string("Stand")):u->animation;if(!host->sequence(u->sequenceName(animation)) && !host->sequence(animation))host->sequence(u->sequenceName("Stand"));}auto attachment=host->attachment(e->attachment,sceneMatrix(world),std::uint64_t(std::max(0.,u->animationTime)*1000),view_);if(attachment)world=sceneMatrix(*attachment);else if(host->hasAttachment(e->attachment))continue;else if(e->attachment!="origin"){if(!info.missingAttachment){log_.write("effect_attachment_missing="+e->attachment+" model="+u->displayModel());info.missingAttachment=true;}continue;}}
        }else if(e->target && session.destructables().contains(e->target)){auto d=session.destructables().at(e->target);x=number(d->position.x);y=number(d->position.y);z=d->z;world=DirectX::XMMatrixScaling(d->scale[0],d->scale[1],d->scale[2])*DirectX::XMMatrixRotationZ(d->angle)*DirectX::XMMatrixTranslation(x,y,z);}else if(session.fog(player).state(e->point)!=4)continue;
        float extentScale=std::max({DirectX::XMVectorGetX(DirectX::XMVector3Length(world.r[0])),DirectX::XMVectorGetX(DirectX::XMVector3Length(world.r[1])),DirectX::XMVectorGetX(DirectX::XMVector3Length(world.r[2]))});if(!visible(*model,vp,DirectX::XMVectorGetX(world.r[3]),DirectX::XMVectorGetY(world.r[3]),DirectX::XMVectorGetZ(world.r[3]),extentScale))continue;model->draw(time,view_,projection_,sceneMatrix(world),true,tint,&modelInstance((1ull<<60)|id),elapsed,emit,geometry);
    }
    std::erase_if(effectPresentations_,[&](auto& entry){return !session.effects().contains(entry.first);});
}
}
