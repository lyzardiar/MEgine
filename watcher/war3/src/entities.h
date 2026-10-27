// Author: MiYu. Persistent source-backed unit, item and weather state for native sessions.
#pragma once
#include "world.h"
#include "object_data.h"
#include "commerce.h"
#include "combat.h"

namespace war3 {
struct TimedLife {std::uint32_t buff=0;double duration=0,remaining=0;bool paused=false;};
struct UnitState {
    std::uint32_t type=0,owner=0;
    std::string name,model,icon;
    jass::Real x,y,facing,life,maxLife,mana,maxMana,moveSpeed,defaultMoveSpeed,acquireRange;
    int resources=0,userData=0,level=1,foodUsed=0,foodMade=0;
    bool visible=true,paused=false,invulnerable=false,pathing=true,selected=false;
    std::map<std::uint32_t,int> abilities;
    std::map<std::uint32_t,bool> autocast;
    std::uint32_t currentOrder=0;
    bool holding=false;
    bool building=false,hero=false;
    std::uint32_t race=7;
    float scale=1,collision=16,flyHeight=0;
    float selectionSize=128;
    std::string movementType;
    std::vector<WorldPoint> route;
    size_t waypoint=0;
    std::uint64_t pathingRevision=0;
    double animationStart=0;
    double animationTime=0;
    float animationRate=1,targetFlyHeight=0,flyRate=0;
    std::array<float,3> visualScale{1,1,1};
    std::array<std::uint8_t,4> tint{255,255,255,255};
    std::optional<unsigned> color;
    std::string animation;
    std::optional<unsigned> animationIndex;
    std::vector<std::string> animationQueue;
    std::array<std::uint32_t,6> inventory{};
    std::map<std::uint32_t,bool> permanentAbilities;
    bool foodCounted=false,useFood=true,removing=false;
    std::vector<std::uint32_t> trainables;
    std::vector<std::uint32_t> researches,upgrades;
    TechnologyStats technology;
    GatherOrder gather;
    int carriedGold=0,carriedLumber=0;
    std::vector<StockEntry> stock;
    int unitStockSlots=-1,itemStockSlots=-1;
    std::deque<ProductionOrder> production;
    std::optional<WorldPoint> rally;
    std::uint32_t rallyTarget=0;
    int experience=0,skillPoints=1;
    bool experienceSuspended=false;
    std::array<float,3> heroAttributes{},heroGrowth{},heroBonuses{};
    std::array<int,3> appliedHeroStats{};
    std::vector<std::uint32_t> learnable;
    std::string properName;
    std::uint64_t heroRevision=0;
    bool illusion=false;
    std::uint32_t summoner=0,illusionOriginal=0;
    float damageDealt=1,damageTaken=1;
    std::optional<TimedLife> timedLife;
    std::map<std::string,double> itemCooldowns;
    float healthRegen=0,manaRegen=0;
    std::string regenType;
    CombatOrder combat;
};
struct DestructableState {
    std::uint32_t type=0;
    WorldPoint position;
    float z=0,angle=0,life=0,maxLife=0,occluder=0,radius=0;
    std::array<float,3> scale{1,1,1};
    int variation=0,editorId=-1;
    bool tree=false,visible=true,invulnerable=false,removed=false,solid=true,initialDead=false;
    std::string model,name,texture,alivePath,deadPath,animation;
    unsigned replacement=0;
    std::vector<PathCell> footprint;
    double animationStart=0;
    float animationRate=1;
    std::vector<std::string> animationQueue;
};
struct ItemState {
    std::uint32_t type=0,owner=15;
    std::string name,model,icon;
    jass::Real x,y,life,maxLife;
    int charges=0,userData=0,level=0;
    std::uint32_t holder=0;
    bool visible=true,invulnerable=false,droppable=true,pawnable=true,dropOnDeath=false;
};
struct WeatherState {std::uint32_t type=0;WorldRect region;SourceTable::Row definition;bool enabled=false;};
}
