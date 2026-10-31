// Author: MiYu. Shared item-slot geometry for the console and its input.
#pragma once

namespace war3 {
struct InventorySlotRect {float x,y,size;};
inline InventorySlotRect inventorySlotRect(unsigned index) {return {.5145f+float(index%2)*.0375f,.487f+float(index/2)*.0375f,.032f};}
}
