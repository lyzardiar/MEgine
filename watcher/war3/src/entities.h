// Author: MiYu. Persistent source-backed unit, item and weather state for native sessions.
#pragma once
#include "equipment.h"
#include "rebirth.h"
#include "world.h"
#include "object_data.h"
#include "commerce.h"
#include "combat.h"
#include "spells.h"
#include "transport.h"
#include "spirit_split.h"
#include "firelord.h"
#include "tinker.h"
#include "corpses.h"
#include "unit_forms.h"
#include <algorithm>

namespace war3 {
struct TimedLife {std::uint32_t buff=0;double duration=0,remaining=0;bool paused=false;};
struct UnsummonOrder {unsigned owner=0;std::uint32_t caster=0,ability=0;std::uint64_t ticket=0;float initialLife=0,maximumLife=0,rate=0,factor=0;double drained=0;int gold=0,lumber=0,returnedGold=0,returnedLumber=0;};
struct UnitState {
    std::uint32_t handle=0,type=0,owner=0;
    std::uint64_t deathRevision=0;
    std::string name,model,icon;
    jass::Real x,y,facing,life,maxLife,mana,maxMana,moveSpeed,defaultMoveSpeed,acquireRange;
    int resources=0,userData=0,level=1,foodUsed=0,foodMade=0;
    bool visible=true,paused=false,invulnerable=false,pathing=true,selected=false;
    std::map<std::uint32_t,int> abilities;
    std::map<std::uint32_t,bool> autocast;
    std::uint32_t currentOrder=0;
    double stealthLastAction=0;
    bool shadowNight=false;
    std::optional<ShadowMeldState> shadowMeld;
    std::optional<MirrorImageState> mirrorImage;
    std::shared_ptr<SpiritSplitState> spiritSplit;
    std::optional<LavaSpawnState> lavaSpawn;
    std::optional<EngineeringState> engineering;
    std::uint32_t spiritParent=0;
    std::uint64_t spiritTicket=0;
    std::uint32_t transport=0;
    std::vector<std::uint32_t> cargo;
    double cargoDue=0;
    std::optional<CargoDropOrder> cargoDrop;
    std::optional<CargoReturnOrder> cargoReturn;
    std::optional<DigestionState> digestion;
    std::optional<CorpseState> corpse;
    std::optional<ExhumeState> exhume;
    std::optional<EatTreeState> eatTree;
    std::optional<GrabTreeState> grabTree;
    std::optional<WarClubState> warClub;
    std::optional<RootState> roots;
    std::optional<RootTransition> rootTransition;
    std::optional<UnitFormState> unitForm;
    std::optional<UnitFormTransition> formTransition;
    std::string animationProperties;
    bool decaySuspended=false,noCorpse=false,exploded=false,plagueWard=false,concoction=false;
    std::set<unsigned> visionPlayers;
    bool holding=false,creepGuard=false,guardRemoved=false;
    std::optional<WorldPoint> guardHome;
    unsigned guardOwner=UINT_MAX;
    std::uint64_t guardPost=0;
    bool building=false,hero=false,spiritEthereal=false,structureTarget=false;
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
    std::vector<std::uint32_t> researches,upgrades,upgradeables;
    std::vector<std::uint32_t> buildables;
    std::optional<BuildOrder> buildOrder;
    std::optional<Construction> construction;
    std::optional<BuildingUpgrade> buildingUpgrade;
    std::optional<UnsummonOrder> unsummon;
    std::optional<RepairOrder> repair;
    double repairGold=0,repairLumber=0;
    std::uint32_t blightAbility=0;
    unsigned blightLevel=0;
    float blightRadius=0;
    double blightDue=0;
    std::uint32_t workingOn=0,mineSource=0,mineCover=0;
    std::uint32_t mineParent=0,mineChild=0,entangleTarget=0,entangleType=0;
    double entangleDue=0;
    bool workingInside=false;
    std::vector<PathCell> footprint;
    TechnologyStats technology;
    GatherOrder gather;
    int carriedGold=0,carriedLumber=0;
    std::vector<StockEntry> stock;
    int unitStockSlots=-1,itemStockSlots=-1;
    std::deque<ProductionOrder> production;
    std::optional<WorldPoint> rally;
    std::uint32_t rallyTarget=0;
    int experience=0,skillPoints=1;
    std::uint32_t revivalBuilding=0;
    std::uint64_t revivalTicket=0;
    bool experienceSuspended=false;
    std::array<float,3> heroAttributes{},heroGrowth{},heroBonuses{};
    std::array<int,3> appliedHeroStats{};
    EquipmentBonuses equipment,inventoryBonuses;
    std::vector<std::uint32_t> learnable;
    std::string properName;
    std::uint64_t heroRevision=0;
    bool illusion=false;
    std::uint32_t summoner=0,summonAbility=0,illusionOriginal=0;
    bool diesWithSummoner=false,swarmAgent=false;
    float damageDealt=1,damageTaken=1;
    std::optional<TimedLife> timedLife;
    std::optional<RebirthState> rebirth;
    std::optional<PhoenixCycle> phoenixCycle;
    std::map<std::string,double> itemCooldowns;
    float healthRegen=0,manaRegen=0,formHealthRegen=0;
    bool burrowed=false;
    std::string regenType;
    CombatOrder combat;
    std::optional<CastOrder> cast;
    std::uint64_t castRevision=0;
    std::map<std::uint32_t,double> spellCooldowns;
    std::map<std::uint32_t,UnitBuff> buffs;
    bool selfCasting=false;
    std::optional<PossessionClaim> possessionClaim;
    std::uint64_t ownerRevision=0;
    std::map<std::uint32_t,std::array<jass::Real,2>> pillageBalances;
    unsigned weaponEffectMask=0;
    std::map<std::uint32_t,std::vector<std::uint32_t>> weaponVisuals;
    std::map<std::uint32_t,UnitAura> auras;
    std::map<std::pair<std::string,std::string>,std::uint32_t> auraVisuals;
    AuraBonuses aura;
    std::optional<GroundingState> grounding;
    const MorphAppearance* morphAppearance() const {const UnitBuff* newest=nullptr;for(auto& [id,b]:buffs)if(b.kind==BuffKind::Morph && b.form && (!newest || b.applied>newest->applied))newest=&b;return newest?newest->form.get():nullptr;}
    bool morphed() const {return morphAppearance()!=nullptr;}
    bool cycloned() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Cyclone)return true;return false;}
    bool impaledAir() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Impale && b.lockRemaining>0)return true;return false;}
    const UnitBuff* impaleCarrier() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Impale && b.lockRemaining>0)return &b;return nullptr;}
    const UnitBuff* cyclone() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Cyclone)return &b;return nullptr;}
    const std::string& displayModel() const {auto form=morphAppearance();return form?form->model:model;}
    const std::string& displayIcon() const {auto form=morphAppearance();return form?form->icon:icon;}
    jass::Real currentMoveSpeed() const {auto form=morphAppearance();return form?form->speed:moveSpeed;}
    bool sleeping() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Sleep)return true;return false;}
    bool sleepProtected() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Sleep && b.damageGuard>0)return true;return false;}
    bool grounded() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Net && b.groundsAir)return true;return false;}
    bool airborne() const {return movementType=="fly";}
    bool groundTarget() const {return movementType!="fly" || grounded();}
    bool ethereal() const {if(spiritEthereal)return true;for(auto& [id,b]:buffs)if(b.kind==BuffKind::Banish)return true;return false;}
    float displayFlyHeight() const {return grounding?grounding->height:flyHeight;}
    bool mobileBuilding() const {return building && roots && roots->uprooted;}
    bool stationaryBuilding() const {return building && !mobileBuilding();}
    bool productionBlocked() const {return roots && (roots->uprooted || rootTransition);}
    bool formLocked() const {return rootTransition || (formTransition && (formTransition->spell.formFlags&1));}
    bool spinning() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Bladestorm && b.remaining>0)return true;return false;}
    std::uint64_t animationFrame(std::uint64_t duration) const {auto time=std::uint64_t(std::max(0.,animationTime)*1000);return cast && cast->phase==CastOrder::Phase::Channel && cast->spell.animationLooping && duration?time%duration:time;}
    std::string sequenceName(const std::string& sequence) const {if(spinning() && (sequence.starts_with("Stand") || sequence.starts_with("Walk") || sequence.starts_with("Attack")))return "Attack Walk Stand Spin";if(morphed())return sequence;auto result=sequence;if(warClub && (sequence.starts_with("Stand") || sequence.starts_with("Walk") || sequence.starts_with("Attack")) && result.find("Alternate")==std::string::npos)result+=" Alternate";if(!animationProperties.empty() && !sequence.starts_with("Morph") && sequence.find("Alternate")==std::string::npos)result+=" "+animationProperties;for(auto& [id,b]:buffs){if(b.kind==BuffKind::Avatar && result.find("Alternate")==std::string::npos)result+=" Alternate";if(b.kind==BuffKind::Defend && result.find("Defend")==std::string::npos)result+=" Defend";}return result;}
    bool stunned() const {if(formLocked() || (possessionClaim && possessionClaim->locked))return true;for(auto& [id,b]:buffs)if(b.kind==BuffKind::FreezingBreath || b.kind==BuffKind::ShacklesTarget || b.kind==BuffKind::Stun || b.kind==BuffKind::Impale || b.kind==BuffKind::Sleep || b.kind==BuffKind::Cyclone)return true;return false;}
    unsigned preventedAttacks() const {unsigned result=0;for(auto& [id,b]:buffs)if(b.kind==BuffKind::Silence || b.kind==BuffKind::DrunkenHaze || b.kind==BuffKind::SoulBurn || b.kind==BuffKind::Cloud)result|=b.disableMask;return result;}
    bool doomed() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Doom)return true;return false;}
    bool silenced() const {return doomed() || (preventedAttacks()&8)!=0;}
    bool attackPrevented(bool ranged) const {return (preventedAttacks()&(ranged?2u:1u))!=0;}
    bool abilitiesDisabled() const {return stunned() || morphed() || spinning();}
    bool rooted() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::Roots || b.kind==BuffKind::Net || (b.kind==BuffKind::Purge && b.lockRemaining>0))return true;return false;}
    float spellBonus(float UnitBuff::* field) const {if(buffs.empty())return 0;std::array<float,size_t(BuffKind::Count)> positive{},negative{};for(auto& [id,b]:buffs){auto kind=size_t(b.kind);positive[kind]=std::max(positive[kind],b.*field);negative[kind]=std::min(negative[kind],b.*field);}float value=0;for(size_t i=0;i<positive.size();++i)value+=positive[i]+negative[i];return value;}
    float displayScale() const {auto form=morphAppearance();return (form?form->scale:scale)*(1+spellBonus(&UnitBuff::scaleBonus));}
    float spellMoveFactor() const {float reduction=0;for(auto& [id,b]:buffs)reduction=std::max(reduction,b.moveReduction);return std::max(0.f,1-reduction+spellBonus(&UnitBuff::moveBonus)+(engineering && !morphed()?engineering->movement:0));}
    float spellAttackReduction() const {float reduction=0;for(auto& [id,b]:buffs)reduction=std::max(reduction,b.attackReduction);return reduction;}
    bool phaseShifted() const {for(auto& [id,b]:buffs)if(b.kind==BuffKind::PhaseShift && b.remaining>0)return true;return false;}
    bool hidden() const {return concoction || phaseShifted() || !visible || gather.inside || workingInside || mineCover!=0 || mirrorImage.has_value() || spiritSplit || (lavaSpawn && lavaSpawn->emerging) || transport!=0 || (corpse && corpse->gone);}
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
