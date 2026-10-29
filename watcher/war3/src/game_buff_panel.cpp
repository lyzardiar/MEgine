// Author: MiYu. The selected unit's live effects provide status icons and source descriptions.
#include "game_view.h"
#include <algorithm>
#include <set>

namespace war3 {
const GameView::BuffPanelInfo& GameView::buffPanelInfo(std::uint32_t id){
    if(auto found=buffPanelInfo_.find(id);found!=buffPanelInfo_.end())return found->second;auto& session=*data_->session;BuffPanelInfo info{session.buffProfile(id,"Buffart"),session.buffProfile(id,"Bufftip"),session.buffProfile(id,"Buffubertip")};if(auto comma=info.icon.find(',');comma!=std::string::npos)info.icon.resize(comma);if(info.icon=="_")info.icon.clear();return buffPanelInfo_.emplace(id,std::move(info)).first->second;
}
std::vector<std::uint32_t> GameView::buffPanelIds(std::uint32_t handle) const {
    auto found=data_->session->units().find(handle);if(found==data_->session->units().end())return {};std::set<std::uint32_t> ids;for(auto& [id,buff]:found->second->buffs)if(id)ids.insert(id);for(auto& [id,aura]:found->second->auras)if(id && aura.remaining>0)ids.insert(id);return {ids.begin(),ids.end()};
}
void GameView::streamBuffPanel(std::vector<std::string>& textures){
    auto units=selected();if(units.size()!=1)return;for(auto id:buffPanelIds(units.front())){auto& info=buffPanelInfo(id);if(info.icon.empty() || data_->assets->hasImage(info.icon))continue;auto found=buffPanelImages_.find(info.icon);if(found==buffPanelImages_.end())found=buffPanelImages_.emplace(info.icon,bool(data_->session->world()->resources().readTexture(info.icon))).first;if(found->second)textures.push_back(info.icon);}
}
void GameView::drawBuffPanel(const GameInput& input,std::uint32_t handle){
    if(selected().size()!=1 || !data_->session->units().contains(handle))return;float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;const BuffPanelInfo* hovered=nullptr;unsigned index=0;
    for(auto id:buffPanelIds(handle)){auto& info=buffPanelInfo(id);if(info.icon.empty())continue;if(index>=12)break;float x=.16f+float(index%6)*.017f,y=.53f+float(index/6)*.018f;renderer_.rect(left+x*scale,top+y*scale,.016f*scale,.016f*scale,0xff202020);if(auto icon=data_->assets->cachedTexture(info.icon))renderer_.rect(left+x*scale,top+y*scale,.016f*scale,.016f*scale,0xffffffff,icon);if(input.ui.x>=x && input.ui.x<x+.016f && input.ui.y>=y && input.ui.y<y+.016f)hovered=&info;++index;}
    if(!hovered || (hovered->title.empty() && hovered->description.empty()))return;if(!buffTooltip_){auto& archives=data_->session->world()->resources();buffTooltip_=std::make_unique<GlueScreen>(archives,data_->assets->decoder(),renderer_,text_,"UI\\FrameDef\\UI\\EscMenuMainPanel.fdf","EscMenuMainPanel");buffTooltip_->focusEnabled(false);}float x=.47f,y=.344f,w=.32f,h=.072f;buffTooltip_->tooltipBackdrop({x,y,w,h});buffTooltip_->textAt("EscMenuMainPanelDialogTextTemplate",hovered->title,{x+.01f,y+.006f,w-.02f,.014f},true,false,true,.012f);if(!hovered->description.empty())buffTooltip_->textAt("EscMenuMainPanelDialogTextTemplate",hovered->description,{x+.01f,y+.024f,w-.02f,.04f},true,true,true,.01f);
}
}
