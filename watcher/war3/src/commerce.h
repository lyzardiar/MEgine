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
struct ProductionOrder {std::uint32_t type=0;int gold=0,lumber=0,food=0;double duration=0,elapsed=0;bool started=false,reserved=false;std::uint64_t ticket=0;bool research=false;unsigned level=0;};
struct ResearchInfo {ProductInfo product;unsigned level=1,maximum=1;std::string unsupported;};
struct GatherOrder {
    enum class Phase {None,Approach,Mine,Return,Chop};
    Phase phase=Phase::None;
    std::uint32_t mine=0,depot=0;
    std::uint32_t tree=0;
    WorldPoint treePoint;
    double due=0,repath=0,yieldRemainder=0;
    bool inside=false;
};
struct TechnologyStats {
    float dice=0,damage=0,range=0,armor=0,attackSpeed=0,health=0,mana=0,movement=0,healthRegen=0,manaRegen=0,bounces=0,spillDistance=0,spillRadius=0,damageLoss=0;
    unsigned weapons=0;
    std::map<std::uint32_t,int> abilityLevels;
};
enum class CommandAction {Train,BuyUnit,BuyItem,Research,Harvest,ReturnResources};
struct CommandButton {CommandAction action;std::uint32_t type=0;std::string icon,name,tip,hotkey,reason;int x=0,y=0,stock=-1,gold=0,lumber=0;bool enabled=false;};
}
