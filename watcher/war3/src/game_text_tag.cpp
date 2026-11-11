// Author: MiYu. Project script text tags into the world viewport and render their current appearance.
#include "game_view.h"
#include "map_ui.h"
#include <algorithm>
#include <cmath>

namespace war3 {
void GameView::drawTextTags() {
    auto& session=*data_->session;float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;
    if(session.textTags().empty())return;auto device=renderer_.device();DWORD enabled=0;RECT previous{};if(FAILED(device->GetRenderState(D3DRS_SCISSORTESTENABLE,&enabled)) || FAILED(device->GetScissorRect(&previous)))throw std::runtime_error("Cannot read text tag clipping");RECT clip{LONG(viewport_.X),LONG(viewport_.Y),LONG(viewport_.X+viewport_.Width),LONG(viewport_.Y+viewport_.Height)};if(enabled){clip.left=std::max(clip.left,previous.left);clip.top=std::max(clip.top,previous.top);clip.right=std::min(clip.right,previous.right);clip.bottom=std::min(clip.bottom,previous.bottom);}if(clip.right<=clip.left || clip.bottom<=clip.top)return;struct Restore{IDirect3DDevice9* device;DWORD enabled;RECT previous;~Restore(){device->SetScissorRect(&previous);device->SetRenderState(D3DRS_SCISSORTESTENABLE,enabled);}}restore{device,enabled,previous};if(FAILED(device->SetScissorRect(&clip)) || FAILED(device->SetRenderState(D3DRS_SCISSORTESTENABLE,TRUE)))throw std::runtime_error("Cannot set text tag clipping");
    for(auto& [id,tag]:session.textTags()){
        (void)id;if(!tag->visible || tag->text.empty() || tag->height<=0)continue;auto point=project(tag->x,tag->y,tag->z);if(!point)continue;point->first+=tag->screenX;point->second-=tag->screenY;
        float fade=1;if(!tag->permanent && tag->age>tag->fadepoint && tag->lifespan>tag->fadepoint)fade=std::clamp((tag->lifespan-tag->age)/(tag->lifespan-tag->fadepoint),0.f,1.f);auto alpha=unsigned(std::clamp(std::lround(tag->color[3]*fade),0l,255l));DWORD base=(alpha<<24)|(DWORD(tag->color[0])<<16)|(DWORD(tag->color[1])<<8)|tag->color[2],color=base;float height=std::clamp(tag->height,.001f,.2f),x=point->first,y=point->second;std::string part;
        auto flush=[&]{if(part.empty())return;auto value=wide(part);text_.draw(value,left+x*scale,top+y*scale,height*scale,color);x+=text_.width(value,height*scale,false)/scale;part.clear();};
        for(size_t i=0;i<tag->text.size();){auto token=std::string_view(tag->text).substr(i);if(auto value=inlineTextColor(token.substr(0,std::min(size_t(10),token.size())))){flush();auto a=((*value>>24)&255)*alpha/255;color=(a<<24)|(*value&0x00ffffff);i+=10;}else if(token.starts_with("|r") || token.starts_with("|R")){flush();color=base;i+=2;}else if(token.starts_with("|n") || token.starts_with("|N") || token[0]=='\n'){flush();x=point->first;y+=height;i+=token[0]=='\n'?1:2;}else if(token.starts_with("||")){part+='|';i+=2;}else part+=tag->text[i++];}flush();
    }
}
}
