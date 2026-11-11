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
        (void)id;if(!tag->visible || tag->text.empty())continue;tag->observeColor();if(tag->height<=0)continue;auto point=project(tag->x,tag->y,tag->z);if(!point)continue;point->first+=tag->screenX;point->second-=tag->screenY;
        auto alpha=unsigned(tag->color[3]);DWORD base=(alpha<<24)|(DWORD(tag->color[0])<<16)|(DWORD(tag->color[1])<<8)|tag->color[2];float height=std::clamp(tag->height,.001f,.2f);
        std::wstring content;std::vector<DWORD> colors;DWORD color=base;std::string part;
        auto flush=[&]{if(part.empty())return;auto value=wide(part);content+=value;colors.insert(colors.end(),value.size(),color);part.clear();};
        for(size_t i=0;i<tag->text.size();){auto token=std::string_view(tag->text).substr(i);if(auto value=inlineTextColor(token.substr(0,std::min(size_t(10),token.size())))){flush();auto a=((*value>>24)&255)*alpha/255;color=(a<<24)|(*value&0x00ffffff);i+=10;}else if(token.starts_with("|r") || token.starts_with("|R")){flush();color=base;i+=2;}else if(token.starts_with("|n") || token.starts_with("|N") || token[0]=='\n'){flush();content+=L'\n';colors.push_back(color);i+=token[0]=='\n'?1:2;}else if(token.starts_with("||")){part+='|';i+=2;}else part+=tag->text[i++];}flush();
        auto lines=wrapFontLines(content,.25f*scale,height*scale,std::max(size_t(1),size_t(.25f/height+.5f)),[&](auto value,float width,float h){return text_.fit(value,width,h);});float y=point->second;
        for(auto line:lines){float x=point->first;for(auto at=line.begin;at<line.end;){auto end=at+1;while(end<line.end && colors[end]==colors[at])++end;auto value=std::wstring_view(content).substr(at,end-at);text_.draw(value,left+(x+.0015f)*scale,top+(y+.0015f)*scale,height*scale,DWORD(tag->shadowAlpha)<<24);x+=text_.width(value,height*scale,false)/scale;at=end;}x=point->first;for(auto at=line.begin;at<line.end;){auto end=at+1;while(end<line.end && colors[end]==colors[at])++end;auto value=std::wstring_view(content).substr(at,end-at);text_.draw(value,left+x*scale,top+y*scale,height*scale,colors[at]);x+=text_.width(value,height*scale,false)/scale;at=end;}y+=height;}
    }
}
}
