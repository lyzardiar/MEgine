// Author: MiYu. Route inventory drags to the same item commands as the active game session.
#include "game_view.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
int inventorySlot(float x,float y){for(unsigned i=0;i<6;++i){float left=.522f+float(i%2)*.038f,top=.485f+float(i/2)*.038f;if(x>=left && x<left+.034f && y>=top && y<top+.034f)return int(i);}return -1;}
bool heroPortrait(float x,float y,unsigned index){return x>=.008f && x<.048f && y>=.04f+index*.047f && y<.08f+index*.047f;}
bool gameArea(float x,float y){return x>=0 && x<.8f && y>=.02f && y<.424f;}
}
void GameView::inventoryDragInput(GameInput& input) {
    auto& session=*data_->session;auto& ui=input.ui;if(inventoryDragBlocked_){if(!ui.down)inventoryDragBlocked_=false;ui.down=false;ui.pressed=false;return;}auto local=session.localPlayer().value_or(0);auto startSlot=inventorySlot(ui.startX,ui.startY);
    if(!replayMode_ && ui.pressed && ui.doubleClick && itemTarget_ && startSlot>=0 && inventorySlot(ui.x,ui.y)==startSlot){auto [holder,item]=*itemTarget_;auto chosen=primarySelection(selected());auto unit=session.units().find(holder);auto held=session.items().find(item);if(!chosen.empty() && chosen.front()==holder && unit!=session.units().end() && held!=session.items().end() && held->second->holder==holder && unit->second->inventory[unsigned(startSlot)]==item && session.canManageUnitInventory(local,*unit->second)){PlayerCommand command;command.player=local;command.kind=PlayerCommandKind::ItemImmediate;command.units={holder};command.item=item;command.queued=itemTargetQueued_ || ui.shift;try{if(submitPlayerCommand(command))itemTarget_.reset();else localMessage(local,0,0,2,"无法自动选择物品目标");}catch(const std::exception& e){localMessage(local,0,0,3,e.what());}ui.pressed=false;ui.down=false;ui.key=0;return;}}
    if(!inventoryDrag_ && startSlot>=0 && (ui.down || ui.pressed)){
        if(lanSimulation_ && !lanPendingSelection_.empty()){if(ui.pressed)localMessage(local,0,0,2,"等待网络确认选择");ui.down=false;ui.pressed=false;return;}
        if(itemTarget_ || spellTarget_ || buildTarget_ || orderMode_!=OrderMode::None){ui.down=false;ui.pressed=false;return;}
        auto chosen=primarySelection(selected());if(!chosen.empty()){auto unit=session.units().find(chosen.front());if(unit!=session.units().end() && session.canManageUnitInventory(local,*unit->second) && !session.mechanicalDisguised(*unit->second,local)){auto item=unit->second->inventory[unsigned(startSlot)];if(item && session.items().contains(item) && session.items().at(item)->holder==unit->first)inventoryDrag_=InventoryDrag{unit->first,item,unsigned(startSlot),false};}}
    }
    if(!inventoryDrag_)return;auto drag=*inventoryDrag_;auto owner=session.units().find(drag.holder);auto item=session.items().find(drag.item);auto chosen=primarySelection(selected());bool valid=owner!=session.units().end() && item!=session.items().end() && item->second->holder==drag.holder && drag.slot<owner->second->inventory.size() && owner->second->inventory[drag.slot]==drag.item && session.canManageUnitInventory(local,*owner->second) && !chosen.empty() && chosen.front()==drag.holder && !itemTarget_ && !spellTarget_ && !buildTarget_ && orderMode_==OrderMode::None;
    if(!valid || input.right){inventoryDrag_.reset();inventoryDragBlocked_=ui.down;ui.down=false;ui.pressed=false;if(input.right)input.right=false;return;}
    if(std::hypot(ui.x-ui.startX,ui.y-ui.startY)>.006f)inventoryDrag_->moving=true;if(ui.down){ui.down=false;ui.key=0;return;}if(!ui.pressed){inventoryDrag_.reset();return;}drag=*inventoryDrag_;inventoryDrag_.reset();if(!drag.moving)return;ui.pressed=false;ui.key=0;
    PlayerCommand command;command.player=local;command.units={drag.holder};command.item=drag.item;command.queued=ui.shift;auto slot=inventorySlot(ui.x,ui.y);if(slot>=0){if(unsigned(slot)==drag.slot)return;command.kind=PlayerCommandKind::SwapItem;command.queueIndex=unsigned(slot);}
    else{std::uint32_t target=0;for(unsigned i=0;i<heroShortcutIds_.size();++i)if(heroPortrait(ui.x,ui.y,i)){target=heroShortcutIds_[i];break;}if(!target && gameArea(ui.x,ui.y)){auto candidate=widget(ui.x,ui.y,false);if(session.units().contains(candidate))target=candidate;}if(target){if(target==drag.holder)return;command.kind=PlayerCommandKind::GiveItem;command.target=target;}else if(gameArea(ui.x,ui.y)){auto point=ground(ui.x,ui.y);if(!point)return;command.kind=PlayerCommandKind::DropItemAt;command.xBits=std::bit_cast<std::uint32_t>((*point)[0]);command.yBits=std::bit_cast<std::uint32_t>((*point)[1]);}else return;}
    try{if(!submitPlayerCommand(command))localMessage(local,0,0,2,"无法移动该物品");}catch(const std::exception& e){localMessage(local,0,0,3,e.what());}
}
void GameView::drawInventoryDrag(const GameInput& input) {
    if(!inventoryDrag_ || !inventoryDrag_->moving)return;auto item=data_->session->items().find(inventoryDrag_->item);if(item==data_->session->items().end())return;auto icon=data_->assets->cachedTexture(item->second->icon);if(!icon)return;float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;renderer_.rect(left+(input.ui.x-.017f)*scale,top+(input.ui.y-.017f)*scale,.034f*scale,.034f*scale,0xbbffffff,icon);
}
}
