// Author: MiYu. Original skin autocast PRE2 model is drawn in canonical UI coordinates with per-button state.
#include "game_view.h"
#include "model.h"
#include <algorithm>

namespace war3 {
void GameView::drawAutocast(float x,float y,std::uint32_t unit,std::uint32_t ability) {
    auto model=data_->assets->cachedModel(data_->autocastModel);if(!model)return;auto device=renderer_.device();D3DVIEWPORT9 previous;device->GetViewport(&previous);float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);D3DVIEWPORT9 viewport{DWORD((renderer_.width()-.8f*scale)/2),DWORD((renderer_.height()-.6f*scale)/2),DWORD(.8f*scale),DWORD(.6f*scale),0,0};device->SetViewport(&viewport);auto view=sceneMatrix(DirectX::XMMatrixTranslation(0,0,-1)),projection=sceneMatrix(DirectX::XMMatrixOrthographicOffCenterRH(0,.8f,0,.6f,.01f,2)),world=sceneMatrix(DirectX::XMMatrixTranslation(x,.6f-y-.039f,0));model->sequence("Stand");auto clock=GetTickCount64();model->draw(clock,view,projection,world,true,0xffffffff,&autocastInstances_[{unit,ability}],clock);device->SetViewport(&previous);
    std::erase_if(autocastInstances_,[&](auto& entry){auto found=data_->session->units().find(entry.first.first);return entry.first.first!=unit || found==data_->session->units().end() || !found->second->autocast.contains(entry.first.second) || !found->second->autocast.at(entry.first.second);});
}
}
