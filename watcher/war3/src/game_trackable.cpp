// Author: MiYu. Streamed map trackable rendering and local pointer interaction.
#include "game_view.h"
#include "game_flow_ui.h"
#include <algorithm>
#include <cmath>

namespace war3 {
void GameView::drawTrackables(std::uint64_t elapsed,const DirectX::XMMATRIX& vp) {
    for(auto& [id,t]:data_->session->trackables()){auto model=data_->assets->cachedModel(t->model);if(!model)continue;float z=data_->terrain->visibleHeight(t->x,t->y),radius=std::max(1.f,model->radius());SceneBounds bounds;for(int sign:{-1,1})bounds.add(t->x+sign*radius,t->y+sign*radius,z+sign*radius);if(!bounds.visible(vp))continue;auto world=DirectX::XMMatrixRotationZ(t->facing*DirectX::XM_PI/180.f)*DirectX::XMMatrixTranslation(t->x,t->y,z);model->sequence("Stand");model->draw(elapsed,view_,projection_,sceneMatrix(world),true,0xffffffff,&modelInstance((1ull<<60)|id),elapsed);}
}
void GameView::trackableInput(GameInput& input) {
    auto& ui=input.ui;if(lanSimulation_ || !input.active || !data_->session->userControl() || chatOpen_ || flow_->menuOpen() || flow_->scriptDialog() || allianceOpen_ || questsOpen_ || ui.x<0 || ui.x>=.8f || ui.y<.02f || ui.y>=.424f){hoveredTrackable_=0;trackableMouseX_=trackableMouseY_=-1;return;}
    float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),px=(renderer_.width()-.8f*scale)/2+ui.x*scale,py=(renderer_.height()-.6f*scale)/2+ui.y*scale;auto unproject=[&](float z){return DirectX::XMVector3Unproject(DirectX::XMVectorSet(px,py,z,1),float(viewport_.X),float(viewport_.Y),float(viewport_.Width),float(viewport_.Height),0,1,sceneMatrix(projection_),sceneMatrix(view_),DirectX::XMMatrixIdentity());};auto start=unproject(0),end=unproject(1),direction=DirectX::XMVectorSubtract(end,start);float length=DirectX::XMVectorGetX(DirectX::XMVector3Length(direction));if(length<=0)return;direction=DirectX::XMVectorScale(direction,1/length);float nearest=length;std::uint32_t picked=0;
    for(auto& [id,t]:data_->session->trackables()){auto model=data_->assets->cachedModel(t->model);if(!model)continue;float radius=std::max(1.f,model->radius()),z=data_->terrain->visibleHeight(t->x,t->y);auto center=DirectX::XMVectorSet(t->x,t->y,z,0),offset=DirectX::XMVectorSubtract(start,center);float b=DirectX::XMVectorGetX(DirectX::XMVector3Dot(offset,direction)),c=DirectX::XMVectorGetX(DirectX::XMVector3Dot(offset,offset))-radius*radius,disc=b*b-c;if(disc<0)continue;float distance=-b-std::sqrt(disc);if(distance<0)distance=-b+std::sqrt(disc);if(distance>=0 && distance<nearest){nearest=distance;picked=id;}}
    bool moved=ui.x!=trackableMouseX_ || ui.y!=trackableMouseY_;trackableMouseX_=ui.x;trackableMouseY_=ui.y;auto previous=hoveredTrackable_;hoveredTrackable_=picked;if(picked && (moved || picked!=previous))data_->session->trackableEvent(picked,false);if(picked && ui.pressed && std::hypot(ui.x-ui.startX,ui.y-ui.startY)<=.006f){data_->session->trackableEvent(picked,true);ui.pressed=false;}
}
}
