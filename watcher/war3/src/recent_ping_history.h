// Author: MiYu. Bounded local history for camera recall of received minimap pings.
#pragma once
#include <cstddef>
#include <cstdint>
#include <deque>
#include <optional>
#include <utility>

namespace war3 {
class RecentPingHistory {
    std::uint64_t lastId_=0;std::deque<std::pair<float,float>> points_;std::size_t next_=0;
public:
    bool add(std::uint64_t id,float x,float y) {if(id<=lastId_)return false;lastId_=id;if(points_.size()==8)points_.pop_front();points_.emplace_back(x,y);next_=0;return true;}
    std::optional<std::pair<float,float>> next() {if(points_.empty())return {};auto point=points_[points_.size()-1-next_];next_=(next_+1)%points_.size();return point;}
};
}
