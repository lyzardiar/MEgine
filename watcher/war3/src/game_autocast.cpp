// Author: MiYu. Original skin autocast PRE2 model is drawn in canonical UI coordinates with per-button state.
#include "game_view.h"
#include "game_flow_ui.h"
#include "model.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstdio>

namespace war3 {
void GameView::drawAutocast(float x,float y,std::uint32_t unit,std::uint32_t ability) {
    auto model=data_->assets->cachedModel(data_->autocastModel);if(!model)return;auto device=renderer_.device();D3DVIEWPORT9 previous;device->GetViewport(&previous);Com<IDirect3DStateBlock9> state;if(FAILED(device->CreateStateBlock(D3DSBT_ALL,&state)) || FAILED(state->Capture()))return;struct Restore{IDirect3DDevice9* device;IDirect3DStateBlock9* state;D3DVIEWPORT9 viewport;~Restore(){state->Apply();device->SetViewport(&viewport);}} restore{device,state.Get(),previous};float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);D3DVIEWPORT9 viewport{DWORD((renderer_.width()-.8f*scale)/2),DWORD((renderer_.height()-.6f*scale)/2),DWORD(.8f*scale),DWORD(.6f*scale),0,1};device->SetViewport(&viewport);auto view=sceneMatrix(DirectX::XMMatrixTranslation(0,0,-1)),projection=sceneMatrix(DirectX::XMMatrixOrthographicOffCenterRH(0,.8f,0,.6f,.01f,2)),world=sceneMatrix(DirectX::XMMatrixTranslation(x,.6f-y-.039f,0));model->sequence("Stand");auto clock=GetTickCount64();model->draw(clock,view,projection,world,true,0xffffffff,&autocastInstances_[{unit,ability}],clock);
    std::erase_if(autocastInstances_,[&](auto& entry){auto found=data_->session->units().find(entry.first.first);return entry.first.first!=unit || found==data_->session->units().end() || !found->second->autocast.contains(entry.first.second) || !found->second->autocast.at(entry.first.second);});
}
void GameView::drawCooldown(float x,float y,float size,float elapsedFraction) {
    if(data_->cooldownModel.empty())return;auto model=data_->assets->cachedModel(data_->cooldownModel);if(!model)return;auto device=renderer_.device();D3DVIEWPORT9 previous;device->GetViewport(&previous);Com<IDirect3DStateBlock9> state;if(FAILED(device->CreateStateBlock(D3DSBT_ALL,&state)) || FAILED(state->Capture()))return;struct Restore{IDirect3DDevice9* device;IDirect3DStateBlock9* state;D3DVIEWPORT9 viewport;~Restore(){state->Apply();device->SetViewport(&viewport);}} restore{device,state.Get(),previous};float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);D3DVIEWPORT9 viewport{DWORD((renderer_.width()-.8f*scale)/2),DWORD((renderer_.height()-.6f*scale)/2),DWORD(.8f*scale),DWORD(.6f*scale),0,1};device->SetViewport(&viewport);auto view=sceneMatrix(DirectX::XMMatrixTranslation(0,0,-1)),projection=sceneMatrix(DirectX::XMMatrixOrthographicOffCenterRH(0,.8f,0,.6f,.01f,2));float factor=size/.0384f;auto world=sceneMatrix(DirectX::XMMatrixScaling(factor,factor,1)*DirectX::XMMatrixTranslation(x,.6f-y-size,0));model->sequence("Stand");auto elapsed=std::uint64_t(std::clamp(elapsedFraction,0.f,1.f)*999.f);model->draw(elapsed,view,projection,world,true,0xffffffff,nullptr,elapsed);
}
void GameView::drawTimeIndicator(const GameInput& input) {
    if(!data_->timeIndicatorModel.empty())if(auto model=data_->assets->cachedModel(data_->timeIndicatorModel)){
        auto& clock=data_->session->world()->clock();float hour=std::bit_cast<float>(clock.time().bits()),dayHours=std::bit_cast<float>(clock.rules().dayHours.bits());if(dayHours<=0)dayHours=24;
        // Stand (0..60000) rotates the sun/moon sphere through the full 24-hour day (0=midnight, 30000=noon).
        float fraction=std::fmod(hour,dayHours)/dayHours;if(fraction<0)fraction+=1.f;fraction=std::clamp(fraction,0.f,1.f);
        auto device=renderer_.device();D3DVIEWPORT9 previous;device->GetViewport(&previous);Com<IDirect3DStateBlock9> state;if(FAILED(device->CreateStateBlock(D3DSBT_ALL,&state)) || FAILED(state->Capture()))return;struct Restore{IDirect3DDevice9* device;IDirect3DStateBlock9* state;D3DVIEWPORT9 viewport;~Restore(){state->Apply();device->SetViewport(&viewport);}} restore{device,state.Get(),previous};
        float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);D3DVIEWPORT9 viewport{DWORD((renderer_.width()-.8f*scale)/2),DWORD((renderer_.height()-.6f*scale)/2),DWORD(.8f*scale),DWORD(.6f*scale),0,1};device->SetViewport(&viewport);
        D3DRECT clear{LONG(viewport.X+DWORD(.33f*scale)),LONG(viewport.Y),LONG(viewport.X+DWORD(.47f*scale)),LONG(viewport.Y+DWORD(.08f*scale))};device->Clear(1,&clear,D3DCLEAR_ZBUFFER,0,1,0);
        auto view=sceneMatrix(DirectX::XMMatrixTranslation(0,0,-1)),projection=sceneMatrix(DirectX::XMMatrixOrthographicOffCenterRH(0,.8f,0,.6f,.01f,2)),world=sceneMatrix(DirectX::XMMatrixIdentity());
        model->sequence("Stand");
        auto elapsed=std::uint64_t(fraction*59999.f);model->draw(elapsed,view,projection,world,true,0xffffffff,&timeIndicatorInstance_,GetTickCount64());
    }
    if(input.active && !chatOpen_ && !flow_->menuOpen() && !flow_->scriptDialog() && !allianceOpen_ && !questsOpen_ && !logOpen_ && input.ui.x>=.365f && input.ui.x<.435f && input.ui.y>=0 && input.ui.y<.055f){
        if(!buffTooltip_){buffTooltip_=std::make_unique<GlueScreen>(data_->session->world()->resources(),data_->assets->decoder(),renderer_,text_,"UI\\FrameDef\\UI\\EscMenuMainPanel.fdf","EscMenuMainPanel");buffTooltip_->focusEnabled(false);}
        auto& clock=data_->session->world()->clock();float hour=std::bit_cast<float>(clock.time().bits());int whole=int(std::floor(hour))%24;if(whole<0)whole+=24;int minutes=int(std::floor((hour-std::floor(hour))*60.f))%60;if(minutes<0)minutes+=60;char stamp[16];std::snprintf(stamp,sizeof(stamp),"%02d:%02d",whole,minutes);
        std::string title=data_->timeOfDayTooltip;if(auto pos=title.find("%s");pos!=std::string::npos)title.replace(pos,2,stamp);
        std::string body=cameraCommitted_.enhancedTooltips?data_->timeOfDayUbertip:std::string{};
        auto& tooltip=*buffTooltip_;constexpr float width=.28f,inset=.01f,font=.011f;auto titleLines=std::clamp(tooltip.textLines("EscMenuMainPanelDialogTextTemplate",title,{0,0,width-2*inset,.12f},font).first,size_t(1),size_t(4));auto bodyLines=std::min(tooltip.textLines("EscMenuMainPanelDialogTextTemplate",body,{0,0,width-2*inset,.3f},font).first,size_t(12));float height=.018f+(titleLines+bodyLines)*font,x=.4f-width/2,y=.06f;tooltip.tooltipBackdrop({x,y,width,height});tooltip.textAt("EscMenuMainPanelDialogTextTemplate",title,{x+inset,y+.006f,width-2*inset,titleLines*font},true,false,true,font);if(bodyLines)tooltip.textAt("EscMenuMainPanelDialogTextTemplate",body,{x+inset,y+.009f+titleLines*font,width-2*inset,bodyLines*font},true,true,true,font);
    }
}
}
