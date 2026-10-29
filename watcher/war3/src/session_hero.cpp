// Author: MiYu. Source hero experience, growth and learned abilities update real unit state and script events.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <sstream>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
jass::Real real(float v){if(!std::isfinite(v))throw std::runtime_error("Non-finite hero value");return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}
int bounded(std::int64_t value){return int(std::clamp(value,std::int64_t(0),std::int64_t(INT_MAX)));}
std::vector<std::string> list(const std::string& text){std::stringstream source(text);std::vector<std::string> result;std::string part;while(std::getline(source,part,',')){auto first=part.find_first_not_of(" \t");if(first==std::string::npos)continue;result.push_back(part.substr(first,part.find_last_not_of(" \t")-first+1));if(result.size()>10000)throw std::runtime_error("Hero source list exceeds budget");}return result;}
}
const SourceSettings& ScriptSession::gameplay() {if(!gameplay_){SourceSettings source;source.load(requireWorld().resources(),"Units\\MiscData.txt");source.load(requireWorld().resources(),"Units\\MiscGame.txt");if(auto map=requireWorld().resources().readCandidates({"war3mapMisc.txt"},ArchiveScope::Map))source.parse(map->bytes);gameplay_=std::move(source);}return *gameplay_;}
float ScriptSession::gameplayNumber(const char* key,float fallback) {auto text=gameplay().value("Misc",key);if(text.empty())return fallback;size_t end=0;auto value=std::stof(text,&end);if(!std::isfinite(value) || end!=text.size())throw std::runtime_error("Invalid gameplay number: "+std::string(key));return value;}
const std::vector<int>& ScriptSession::heroThresholds() {
    if(!heroThresholds_.empty())return heroThresholds_;auto maximum=gameplayNumber("MaxHeroLevel",10);if(maximum<1 || maximum>10000 || maximum!=std::floor(maximum))throw std::runtime_error("Hero level budget exceeded");std::vector<int> values{0};for(auto& part:list(gameplay().value("Misc","NeedHeroXP","200"))){size_t end=0;auto n=std::stoll(part,&end);if(end!=part.size() || n<=values.back() || n>INT_MAX)throw std::runtime_error("Invalid hero experience threshold list");values.push_back(int(n));if(values.size()>=size_t(maximum))break;}
    double a=gameplayNumber("NeedHeroXPFormulaA",1),b=gameplayNumber("NeedHeroXPFormulaB",100),c=gameplayNumber("NeedHeroXPFormulaC",0);while(values.size()<size_t(maximum)){double next=a*values.back()+b*double(values.size()+1)+c;if(!std::isfinite(next) || next<=values.back() || next>INT_MAX)throw std::runtime_error("Hero experience formula exceeds supported range");values.push_back(int(next));}values.resize(size_t(maximum));heroThresholds_=std::move(values);return heroThresholds_;
}
void ScriptSession::refreshHero(UnitState& u) {
    if(!u.hero)return;std::array<int,3> stats;for(unsigned i=0;i<3;++i){double value=std::max(0.,double(u.heroAttributes[i])+u.heroBonuses[i]+u.equipment.attributes[i]);if(value>10000000)throw std::runtime_error("Hero attribute budget exceeded");stats[i]=int(value);}float hp=(stats[0]-u.appliedHeroStats[0])*gameplayNumber("StrHitPointBonus",25),mana=(stats[2]-u.appliedHeroStats[2])*gameplayNumber("IntManaBonus",15);auto oldLife=number(u.life);u.maxLife=real(std::max(1.f,number(u.maxLife)+hp));u.maxMana=real(std::max(0.f,number(u.maxMana)+mana));u.life=real(oldLife>0?std::clamp(oldLife+hp,1.f,number(u.maxLife)):0.f);u.mana=real(std::clamp(number(u.mana)+mana,0.f,number(u.maxMana)));u.appliedHeroStats=stats;
}
void ScriptSession::initializeHero(UnitState& u) {
    if(!u.hero)return;auto& data=definitions();u.level=1;for(unsigned i=0;i<3;++i){auto key=std::array<const char*,3>{"STR","AGI","INT"}[i];u.heroAttributes[i]=data.number(u.type,"UnitBalance",key);u.heroGrowth[i]=data.number(u.type,"UnitBalance",std::string(key)+"plus");}refreshHero(u);u.mana=real(std::clamp(data.number(u.type,"UnitBalance","mana0",100)/100,0.f,1.f)*number(u.maxMana));auto names=list(data.field(u.type,"Profile","Propernames",u.name));u.properName=names.empty()?u.name:mapString(names.front(),strings_);for(auto& ability:list(data.field(u.type,"UnitAbilities","heroAbilList")))if(ability.size()==4)u.learnable.push_back(ObjectData::code(ability));
}
void ScriptSession::heroExperience(std::uint32_t handle,int value) {
    if(!alive(handle,NativeKind::Unit))return;auto u=units_.at(handle);if(!u->hero)throw std::runtime_error("Hero experience requires a hero");auto& thresholds=heroThresholds();u->experience=std::max(0,value);int target=int(std::upper_bound(thresholds.begin(),thresholds.end(),u->experience)-thresholds.begin());auto revision=++u->heroRevision;
    if(target<u->level){int delta=target-u->level;for(unsigned i=0;i<3;++i)u->heroAttributes[i]+=u->heroGrowth[i]*delta;u->skillPoints=std::max(0,u->skillPoints+delta);u->level=target;refreshHero(*u);return;}
    while(u->level<target){++u->level;u->skillPoints=bounded(std::int64_t(u->skillPoints)+1);for(unsigned i=0;i<3;++i)u->heroAttributes[i]+=u->heroGrowth[i];refreshHero(*u);unitEvent(handle,41,78);if(!alive(handle,NativeKind::Unit) || u->heroRevision!=revision)return;}
}
bool ScriptSession::learnSkill(std::uint32_t handle,std::uint32_t ability) {
    if(!alive(handle,NativeKind::Unit))return false;auto u=units_.at(handle);if(!u->hero || u->removing || u->skillPoints<=0 || std::find(u->learnable.begin(),u->learnable.end(),ability)==u->learnable.end())return false;auto& data=definitions();if(!data.ability(ability))throw std::runtime_error("Custom hero ability definition is not implemented: "+ObjectData::name(ability));int level=learnedLevel(*u,ability);int maximum=int(data.number(ability,"AbilityData","levels",1)),required=int(data.number(ability,"AbilityData","reqLevel",1)),skip=int(data.number(ability,"AbilityData","levelSkip"));if(skip==0)skip=int(gameplayNumber("HeroAbilityLevelSkip",2));if(level>=maximum || u->level<required+skip*level)return false;--u->skillPoints;u->abilities[ability]=level+1;if(auto grant=u->bookGrants.find(ability);grant!=u->bookGrants.end()){grant->second.base=level+1;grant->second.granted=level+1;}refreshEquipment(*u);ScriptContext context;context.learnedSkill=ability;context.learnedLevel=level+1;unitEvent(handle,42,79,context);return true;
}
void ScriptSession::bindHeroNatives() {
    bindRevivalNatives();
    bind("SetPlayerHandicapXP","nothing",{"player","real"},[this](auto& vm,auto a){auto value=jass::Real::fromBits(a[1].bits);if(!std::isfinite(number(value)) || number(value)<0 || number(value)>1000000)throw std::runtime_error("Experience handicap outside supported range");player(a[0]).handicapXP=value;return vm.nothing();});
    bind("GetPlayerHandicapXP","real",{"player"},[this](auto& vm,auto a){return vm.real(player(a[0]).handicapXP);});
    for(auto [name,attribute]:std::initializer_list<std::pair<const char*,unsigned>>{{"GetHeroStr",0},{"GetHeroAgi",1},{"GetHeroInt",2}})bind(name,"integer",{"unit","boolean"},[this,attribute](auto& vm,auto a){auto& u=unit(a[0]);return vm.integer(u.hero?int(std::max(0.f,u.heroAttributes[attribute]+(a[1].bits?u.heroBonuses[attribute]+u.equipment.attributes[attribute]:0.f))):0);});
    for(auto [name,attribute]:std::initializer_list<std::pair<const char*,unsigned>>{{"SetHeroStr",0},{"SetHeroAgi",1},{"SetHeroInt",2}})bind(name,"nothing",{"unit","integer","boolean"},[this,attribute](auto& vm,auto a){auto& u=unit(a[0]);auto value=std::bit_cast<std::int32_t>(a[1].bits);if(!u.hero)throw std::runtime_error("Hero attributes require a hero");if(value<0 || value>10000000)throw std::runtime_error("Hero attribute outside supported range");if(a[2].bits)u.heroAttributes[attribute]=float(value);else u.heroBonuses[attribute]=float(value)-u.heroAttributes[attribute]-u.equipment.attributes[attribute];refreshHero(u);return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,int UnitState::*>>{{"GetHeroXP",&UnitState::experience},{"GetHeroLevel",&UnitState::level},{"GetHeroSkillPoints",&UnitState::skillPoints}})bind(name,"integer",{"unit"},[this,member](auto& vm,auto a){if(!a[0].bits)return vm.integer(0);auto& u=unit(a[0]);return vm.integer(u.hero?u.*member:0);});
    bind("GetHeroProperName","string",{"unit"},[this](auto& vm,auto a){return vm.string(unit(a[0]).properName);});
    bind("SetHeroXP","nothing",{"unit","integer","boolean"},[this](auto& vm,auto a){heroExperience(a[0].bits,std::bit_cast<std::int32_t>(a[1].bits));return vm.nothing();});
    bind("AddHeroXP","nothing",{"unit","integer","boolean"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(!u.experienceSuspended){double gained=double(std::bit_cast<std::int32_t>(a[1].bits))*number(config_.players[u.owner].handicapXP);heroExperience(a[0].bits,bounded(std::int64_t(std::clamp(double(u.experience)+gained,0.,double(INT_MAX)))));}return vm.nothing();});
    bind("SetHeroLevel","nothing",{"unit","integer","boolean"},[this](auto& vm,auto a){auto& levels=heroThresholds();int level=std::clamp(std::bit_cast<std::int32_t>(a[1].bits),1,int(levels.size()));if(level>unit(a[0]).level)heroExperience(a[0].bits,levels[size_t(level-1)]);return vm.nothing();});
    bind("UnitStripHeroLevel","boolean",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);auto count=std::bit_cast<std::int32_t>(a[1].bits);if(!u.hero || count<=0 || u.level<=1)return vm.boolean(false);auto& levels=heroThresholds();int target=int(std::max(std::int64_t(1),std::int64_t(u.level)-count));heroExperience(a[0].bits,levels[size_t(target-1)]);return vm.boolean(true);});
    bind("IsSuspendedXP","boolean",{"unit"},[this](auto& vm,auto a){return vm.boolean(unit(a[0]).experienceSuspended);});
    bind("SuspendHeroXP","nothing",{"unit","boolean"},[this](auto& vm,auto a){unit(a[0]).experienceSuspended=a[1].bits!=0;return vm.nothing();});
    bind("UnitModifySkillPoints","boolean",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);auto sum=std::int64_t(u.skillPoints)+std::bit_cast<std::int32_t>(a[1].bits);if(!u.hero || sum<0 || sum>INT_MAX)return vm.boolean(false);u.skillPoints=int(sum);return vm.boolean(true);});
    bind("SelectHeroSkill","nothing",{"unit","integer"},[this](auto& vm,auto a){learnSkill(a[0].bits,a[1].bits);return vm.nothing();});
    for(auto [name,event]:std::initializer_list<std::pair<const char*,unsigned>>{{"GetLevelingUnit",78},{"GetLearningUnit",79}})bind(name,"unit",{},[this,event](auto& vm,auto){return vm.handle("unit",contexts_.empty() || (contexts_.back().event!=event && contexts_.back().event!=event-37)?0:contexts_.back().triggerUnit);});
    bind("GetLearnedSkill","integer",{},[this](auto& vm,auto){return vm.integer(contexts_.empty()?0:std::bit_cast<std::int32_t>(contexts_.back().learnedSkill));});
    bind("GetLearnedSkillLevel","integer",{},[this](auto& vm,auto){return vm.integer(contexts_.empty()?0:int(contexts_.back().learnedLevel));});
}
}
