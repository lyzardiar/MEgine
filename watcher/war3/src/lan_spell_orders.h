// Author: MiYu. Supported classic ability orders for LAN spell actions.
#pragma once
#include <cstdint>

namespace war3 {
enum class LanSpellTarget {None,Point,Unit};
inline bool lanSpellOrder(std::uint32_t order,LanSpellTarget target){
    switch(target){
    case LanSpellTarget::Unit:switch(order){case 852092:case 852095:case 852119:case 852171:case 852182:case 852222:case 852226:case 852501:return true;default:return false;}
    case LanSpellTarget::Point:switch(order){case 852060:case 852089:case 852125:case 852218:case 852488:return true;default:return false;}
    case LanSpellTarget::None:switch(order){case 852096:case 852097:case 852126:case 852127:case 852526:return true;default:return false;}
    }return false;
}
}
