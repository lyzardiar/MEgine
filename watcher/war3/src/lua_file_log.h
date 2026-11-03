// Author: MiYu. Map Lua logging inside the War3 user data directory.
#pragma once
#include "platform.h"
#include <string_view>

namespace war3 {
class LuaFileLog {
    fs::path dataRoot_,relative_;
    std::string path_;
public:
    explicit LuaFileLog(fs::path dataRoot);
    const std::string& path() const {return path_;}
    void setPath(std::string_view value);
    void write(std::string_view value) const;
};
}
