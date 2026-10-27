// Author: MiYu. Unit inventory slots, carried item lifetime and pickup/drop event consumers.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
unsigned ScriptSession::inventorySize(const UnitState& u) {unsigned size=0;for(auto& [ability,level]:u.abilities)if(level>0){auto code=definitions().field(ability,"AbilityData","code");if(code=="AInv" || ObjectData::name(ability)=="AInv"){auto count=definitions().number(ability,"AbilityData",("DataA"+std::to_string(level)),6);size=std::max(size,unsigned(std::clamp(count,0.f,6.f)));}}return size;}
bool ScriptSession::giveItem(std::uint32_t unitId,std::uint32_t itemId,std::optional<unsigned> slot) {
    auto unitHandle=runtime_.handle("unit",unitId),itemHandle=runtime_.handle("item",itemId);auto& u=unit(unitHandle);auto& state=item(itemHandle);if(u.removing || u.illusion || state.holder==unitId)return false;if(definitions().number(state.type,"ItemData","powerup")!=0){if(state.holder || u.hidden() || u.paused || u.abilitiesDisabled() || std::bit_cast<float>(u.life.bits())<=0)return false;auto held=items_.at(itemId);auto owner=u.owner;bool success=false;struct Release {std::shared_ptr<ItemState> item;std::uint32_t unit=0,owner=0;WorldPoint point;bool& success;~Release(){if(item->holder==unit){item->holder=0;if(!success){item->owner=owner;item->x=point.x;item->y=point.y;}}}}release{held,unitId,held->owner,{held->x,held->y},success};held->holder=unitId;held->owner=owner;held->x=u.x;held->y=u.y;recordStat(owner,&PlayerStatistics::items);ScriptContext context;context.manipulatedItem=itemId;unitEvent(unitId,49,86,context);if(!alive(itemId,NativeKind::Item))return success=true;if(!alive(unitId,NativeKind::Unit))return false;success=useItem(unitId,itemId);return success;}auto count=inventorySize(u);if(count==0)return false;unsigned target=count;if(slot){if(*slot>=count || u.inventory[*slot])return false;target=*slot;}else for(unsigned i=0;i<count;++i)if(!u.inventory[i]){target=i;break;}if(target>=count)return false;
    if(state.holder)dropItem(state.holder,itemId);if(!alive(unitId,NativeKind::Unit) || !alive(itemId,NativeKind::Item))return false;auto owner=unit(unitHandle).owner;auto& held=item(itemHandle);if(unit(unitHandle).removing || target>=inventorySize(unit(unitHandle)) || unit(unitHandle).inventory[target] || held.holder)return false;held.holder=unitId;held.owner=owner;held.x=unit(unitHandle).x;held.y=unit(unitHandle).y;unit(unitHandle).inventory[target]=itemId;++fogRevision_;recordStat(owner,&PlayerStatistics::items);ScriptContext context;context.manipulatedItem=itemId;unitEvent(unitId,49,86,context);return true;
}
void ScriptSession::dropItem(std::uint32_t unitId,std::uint32_t itemId) {auto& u=unit(runtime_.handle("unit",unitId));auto& state=item(runtime_.handle("item",itemId));auto found=std::find(u.inventory.begin(),u.inventory.end(),itemId);if(found==u.inventory.end() || state.holder!=unitId)return;*found=0;state.holder=0;++fogRevision_;state.x=u.x;state.y=u.y;ScriptContext context;context.manipulatedItem=itemId;unitEvent(unitId,48,85,context);}
void ScriptSession::bindInventoryNatives() {
    bind("UnitUseItem","boolean",{"unit","item"},[this](auto& vm,auto a){return vm.boolean(useItem(a[0].bits,a[1].bits));});
    bind("UnitUseItemTarget","boolean",{"unit","item","widget"},[this](auto& vm,auto a){return vm.boolean(useItem(a[0].bits,a[1].bits,a[2].bits));});
    bind("UnitUseItemPoint","boolean",{"unit","item","real","real"},[this](auto& vm,auto a){return vm.boolean(useItemAt(a[0].bits,a[1].bits,{jass::Real::fromBits(a[2].bits),jass::Real::fromBits(a[3].bits)}));});


    bind("GetItemType","itemtype",{"item"},[this](auto& vm,auto a){auto& state=item(a[0]);auto value=definitions().field(state.type,"ItemData","class");constexpr const char* classes[]={"Permanent","Charged","PowerUp","Artifact","Purchasable","Campaign","Miscellaneous"};for(unsigned i=0;i<7;++i)if(value==classes[i])return vm.handle("itemtype",i);throw std::runtime_error("Unknown source item class: "+value);});
    bind("UnitAddItem","boolean",{"unit","item"},[this](auto& vm,auto a){return vm.boolean(a[1].bits && giveItem(a[0].bits,a[1].bits));});
    bind("UnitAddItemById","item",{"unit","integer"},[this](auto&,auto a){auto& u=unit(a[0]);auto handle=createItem(a[1].bits,u.x,u.y);giveItem(a[0].bits,handle.bits);return handle;});
    bind("UnitAddItemToSlotById","boolean",{"unit","integer","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);auto slot=a[2].bits;if(slot>=inventorySize(u) || u.inventory[slot])return vm.boolean(false);auto handle=createItem(a[1].bits,u.x,u.y);return vm.boolean(giveItem(a[0].bits,handle.bits,slot));});
    bind("UnitRemoveItem","nothing",{"unit","item"},[this](auto& vm,auto a){if(a[1].bits)dropItem(a[0].bits,a[1].bits);return vm.nothing();});
    bind("UnitRemoveItemFromSlot","item",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);auto id=a[1].bits<u.inventory.size()?u.inventory[a[1].bits]:0;if(id)dropItem(a[0].bits,id);return vm.handle("item",id);});
    bind("UnitItemInSlot","item",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);return vm.handle("item",a[1].bits<u.inventory.size()?u.inventory[a[1].bits]:0);});
    bind("UnitInventorySize","integer",{"unit"},[this](auto& vm,auto a){return vm.integer(int(inventorySize(unit(a[0]))));});
    bind("UnitHasItem","boolean",{"unit","item"},[this](auto& vm,auto a){auto& u=unit(a[0]);return vm.boolean(a[1].bits && std::find(u.inventory.begin(),u.inventory.end(),a[1].bits)!=u.inventory.end());});
    bind("IsItemOwned","boolean",{"item"},[this](auto& vm,auto a){return vm.boolean(item(a[0]).holder!=0);});
    bind("GetManipulatingUnit","unit",{},[this](auto& vm,auto){return vm.handle("unit",contexts_.empty() || !contexts_.back().manipulatedItem?0:contexts_.back().triggerUnit);});
    bind("GetManipulatedItem","item",{},[this](auto& vm,auto){return vm.handle("item",contexts_.empty()?0:contexts_.back().manipulatedItem);});
}
}
