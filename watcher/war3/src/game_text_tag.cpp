// Author: MiYu. Project script text tags into the world viewport and render their current appearance.
#include "game_view.h"
#include "map_ui.h"
#include <algorithm>
#include <cmath>

namespace war3 {
void GameView::drawTextTags() {
    auto& session=*data_->session;float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;
    for(auto& [id,tag]:session.textTags()){
        (void)id;if(!tag->visible || tag->text.empty() || tag->height<=0)continue;auto point=project(tag->x,tag->y,tag->z);if(!point || point->first<(viewport_.X-left)/scale || point->first>(viewport_.X+viewport_.Width-left)/scale || point->second<(viewport_.Y-top)/scale || point->second>(viewport_.Y+viewport_.Height-top)/scale)continue;
        float fade=1;if(!tag->permanent && tag->age>tag->fadepoint && tag->lifespan>tag->fadepoint)fade=std::clamp((tag->lifespan-tag->age)/(tag->lifespan-tag->fadepoint),0.f,1.f);auto alpha=unsigned(std::clamp(std::lround(tag->color[3]*fade),0l,255l));DWORD base=(alpha<<24)|(DWORD(tag->color[0])<<16)|(DWORD(tag->color[1])<<8)|tag->color[2],color=base;float height=std::clamp(tag->height,.001f,.2f),x=point->first,y=point->second;std::string part;
        auto flush=[&]{if(part.empty())return;auto value=wide(part);text_.draw(value,left+x*scale,top+y*scale,height*scale,color);x+=text_.width(value,height*scale,false)/scale;part.clear();};
        for(size_t i=0;i<tag->text.size();){auto token=std::string_view(tag->text).substr(i);if(auto value=inlineTextColor(token.substr(0,std::min(size_t(10),token.size())))){flush();auto a=((*value>>24)&255)*alpha/255;color=(a<<24)|(*value&0x00ffffff);i+=10;}else if(token.starts_with("|r") || token.starts_with("|R")){flush();color=base;i+=2;}else if(token.starts_with("|n") || token.starts_with("|N") || token[0]=='\n'){flush();x=point->first;y+=height;i+=token[0]=='\n'?1:2;}else part+=tag->text[i++];}flush();
    }
}
}
