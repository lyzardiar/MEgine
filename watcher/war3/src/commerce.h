// Author: MiYu. Source product definitions, shop stock and persistent production jobs.
#pragma once
#include "world.h"
#include <deque>

namespace war3 {
struct ProductInfo {
    std::uint32_t type=0;
    bool item=false;
    std::string name,icon,tip,hotkey;
    int gold=0,lumber=0,food=0,stockMaximum=0;
    float stockInterval=0,stockDelay=0,trainTime=0;
    std::array<int,2> button{0,0};
    bool positioned=false;
    std::vector<std::pair<std::uint32_t,unsigned>> prerequisites;
};
struct StockEntry {std::uint32_t type=0;bool item=false;int current=0,maximum=0;double interval=0,due=0;};
struct ProductionOrder {std::uint32_t type=0;int gold=0,lumber=0,food=0;double duration=0,elapsed=0;bool started=false,reserved=false;std::uint64_t ticket=0;};
enum class CommandAction {Train,BuyUnit,BuyItem};
struct CommandButton {CommandAction action;std::uint32_t type=0;std::string icon,name,tip,hotkey,reason;int x=0,y=0,stock=-1,gold=0,lumber=0;bool enabled=false;};
}
