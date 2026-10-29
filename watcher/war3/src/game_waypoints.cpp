// Author: MiYu. Show source waypoint models for the local player's pending targeted orders.
#include "game_view.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <set>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
bool pointOrder(PlayerCommandKind kind){return kind==PlayerCommandKind::GroundMove || kind==PlayerCommandKind::GroundAttack || kind==PlayerCommandKind::GroundPatrol || kind==PlayerCommandKind::AttackGround || kind==PlayerCommandKind::SpellPoint || kind==PlayerCommandKind::SpellPointOrder || kind==PlayerCommandKind::ItemPoint || kind==PlayerCommandKind::BuildAt || kind==PlayerCommandKind::DropItemAt;}
bool targetOrder(PlayerCommandKind kind){return kind==PlayerCommandKind::TargetOrder || kind==PlayerCommandKind::SpellUnit || kind==PlayerCommandKind::SpellUnitOrder || kind==PlayerCommandKind::ItemUnit || kind==PlayerCommandKind::GiveItem;}
}
void GameView::drawQueuedWaypoints(std::uint64_t elapsed,const DirectX::XMMATRIX& vp) {
    if(!showQueueWaypoints_ || data_->waypointModel.empty()){waypointInstances_.clear();return;}auto model=data_->assets->cachedModel(data_->waypointModel);if(!model){waypointInstances_.clear();return;}auto& session=*data_->session;auto local=session.localPlayer().value_or(0);auto color=std::min(session.config().players[local].color,15u);auto suffix=(color<10?std::string("0"):std::string{})+std::to_string(color);model->replace(1,data_->assets->texture("ReplaceableTextures\\TeamColor\\TeamColor"+suffix+".blp"));if(!model->sequence("Stand")){waypointInstances_.clear();return;}std::set<WaypointKey> active;std::set<std::pair<std::uint32_t,std::uint32_t>> positions;
    for(auto id:selected(true)){auto found=session.units().find(id);if(found==session.units().end() || found->second->hidden() || number(found->second->life)<=0)continue;auto& queue=found->second->playerOrders;for(std::size_t i=0;i<queue.size();++i){auto& command=queue[i];if(command.player!=local)continue;std::optional<WorldPoint> point;if(pointOrder(command.kind))point=WorldPoint{jass::Real::fromBits(command.xBits),jass::Real::fromBits(command.yBits)};else if(targetOrder(command.kind)){if(auto u=session.units().find(command.target);u!=session.units().end()){if(!u->second->removing && number(u->second->life)>0 && session.unitVisibleTo(command.target,local))point=WorldPoint{u->second->x,u->second->y};}else if(auto item=session.items().find(command.target);item!=session.items().end()){if(!item->second->holder && item->second->visible && number(item->second->life)>0 && session.fog(local).state({item->second->x,item->second->y})==4)point=WorldPoint{item->second->x,item->second->y};}else if(auto d=session.destructables().find(command.target);d!=session.destructables().end()){if(!d->second->removed && d->second->visible && session.fog(local).state(d->second->position)==4)point=d->second->position;}}
        if(!point || !std::isfinite(number(point->x)) || !std::isfinite(number(point->y)))continue;*point=session.world()->clamp(*point);if(!positions.emplace(point->x.bits(),point->y.bits()).second)continue;float x=number(point->x),y=number(point->y),z=data_->terrain->height(x,y),radius=model->radius()+32;SceneBounds bounds;for(int sign:{-1,1})bounds.add(x+sign*radius,y+sign*radius,z+sign*radius);if(!bounds.visible(vp))continue;WaypointKey key{id,i,std::uint32_t(command.kind),command.target,command.xBits,command.yBits};active.insert(key);auto world=sceneMatrix(DirectX::XMMatrixTranslation(x,y,z));model->draw(elapsed,view_,projection_,world,true,0xffffffff,&waypointInstances_[key],elapsed);
    }}std::erase_if(waypointInstances_,[&](auto& entry){return !active.contains(entry.first);});
}
}
