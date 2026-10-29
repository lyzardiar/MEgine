// Author: MiYu. Bounded preflight projection for ordered gamecache synchronization actions.
#pragma once
#include <cstddef>
#include <map>
#include <string>
#include <tuple>

namespace war3 {
struct LanCacheSyncProjection {
    std::map<std::string,size_t> sizes;
    std::map<std::tuple<std::string,std::string,std::string,unsigned>,bool> entries;
};
}
