// Author: MiYu. Preserve the default attribute column width when a map moves its value frame.
#pragma once
#include <algorithm>

namespace war3 {
inline float heroAttributeValueFont(float font,float textWidth,bool multipleWeapons) {float available=.503f-(multipleWeapons?.482f:.455f);return textWidth>available?font*std::max(0.f,available)/textWidth:font;}
}
