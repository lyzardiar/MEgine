// Author: MiYu. Draw map-script cinematic filters from their interpolated session state.
#include "game_view.h"
#include <algorithm>
#include <cmath>
namespace war3 {
void GameView::drawCineFilter(){
    const auto& filter=data_->session->cineFilter();if(!filter.displayed || filter.texture.empty())return;auto texture=data_->assets->cachedTexture(filter.texture);if(!texture)return;
    float progress=filter.duration>0?float(std::clamp((data_->session->simulationTime()-filter.started)/filter.duration,0.,1.)):1.f;std::array<float,4> uv{};std::array<unsigned,4> rgba{};for(unsigned i=0;i<4;++i){uv[i]=std::lerp(filter.startUV[i],filter.endUV[i],progress);rgba[i]=unsigned(std::clamp(std::lround(std::lerp(float(filter.startColor[i]),float(filter.endColor[i]),progress)),0l,255l));}DWORD color=(rgba[3]<<24)|(rgba[0]<<16)|(rgba[1]<<8)|rgba[2];float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),width=.8f*scale,height=.6f*scale;renderer_.cineFilter((renderer_.width()-width)/2,(renderer_.height()-height)/2,width,height,color,texture,uv,filter.blend,filter.flags);
}
}
