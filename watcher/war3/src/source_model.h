// Author: MiYu. Preserve imported models while recognizing empty source model placeholders.
#pragma once
#include "archive.h"
#include <algorithm>
#include <cctype>

namespace war3 {
inline std::string sourceModel(std::string value,Archives& archives) {if(value=="_")return {};auto normalized=value;std::transform(normalized.begin(),normalized.end(),normalized.begin(),[](unsigned char c){return char(std::tolower(c));});if((normalized=="_.mdl" || normalized=="_.mdx") && !archives.read("_.mdx"))return {};return value;}
}
