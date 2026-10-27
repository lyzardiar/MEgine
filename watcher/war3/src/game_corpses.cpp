// Author: MiYu. Source corpse-targeted abilities pick visible dead unit models without selecting them as live units.
#include "game_view.h"
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
std::uint32_t GameView::corpseWidget(float x,float y) const {
    auto& session=*data_->session;auto local=session.localPlayer().value_or(0);float closest=.025f;std::uint32_t result=0;for(auto& [id,u]:session.units())if(session.corpseAvailable(id) && session.unitVisibleTo(id,local)){auto point=project(number(u->x),number(u->y),data_->terrain->height(number(u->x),number(u->y))+16*u->displayScale());if(!point)continue;float distance=std::hypot(point->first-x,point->second-y);if(distance<closest){closest=distance;result=id;}}return result;
}
}
