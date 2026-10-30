// Author: MiYu. Shared item-slot geometry for the console and its input.
#pragma once

namespace war3 {
struct InventorySlotRect {float x,y,size;};
inline InventorySlotRect inventorySlotRect(unsigned index) {return {.515f+float(index%2)*.0398f,.486f+float(index/2)*.0385f,.032f};}
}
