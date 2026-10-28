// Author: MiYu. Local user preferences for the native game view.
#pragma once
#include "platform.h"

namespace war3 {
bool loadEdgeScrollPreference(const fs::path& dataRoot);
void saveEdgeScrollPreference(const fs::path& dataRoot,bool enabled);
}
