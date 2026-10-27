// Author: MiYu. Public MPQ and map ability fields select actual aura and attack-passive consumers.
#include "session.h"
#include <algorithm>
#include <cmath>
#include <sstream>

namespace war3 {
const PassiveInfo& ScriptSession::passiveInfo(std::uint32_t ability,unsigned level) {
    auto key=std::pair{ability,level};if(auto found=passiveInfo_.find(key);found!=passiveInfo_.end())return found->second;PassiveInfo p;p.ability=ability;p.level=level;auto& data=definitions();if(!level || !data.ability(ability))return passiveInfo_.emplace(key,std::move(p)).first->second;
    struct Prototype {const char* code;PassiveKind kind;bool aura;};constexpr Prototype prototypes[]={
        {"AHab",PassiveKind::Brilliance,true},{"AHad",PassiveKind::Devotion,true},{"AOae",PassiveKind::Endurance,true},
        {"AUau",PassiveKind::Unholy,true},{"AUav",PassiveKind::Vampiric,true},{"AEar",PassiveKind::Trueshot,true},
        {"AEah",PassiveKind::Thorns,true},{"AOac",PassiveKind::Command,true},{"Aakb",PassiveKind::WarDrums,true},
        {"Aoar",PassiveKind::Regeneration,true},{"AHbh",PassiveKind::Bash,false},{"AOcr",PassiveKind::Critical,false},
        {"AEev",PassiveKind::Evasion,false},{"ANca",PassiveKind::Cleave,false},
        {"Apiv",PassiveKind::PermanentInvisibility,false},{"Adet",PassiveKind::Detection,false},
        {"Atru",PassiveKind::Detection,false},{"Agyv",PassiveKind::Detection,false},{"Adts",PassiveKind::Detection,false}
    };auto code=data.field(ability,"AbilityData","code",ObjectData::name(ability));for(auto& source:prototypes)if(source.code==code){p.kind=source.kind;p.aura=source.aura;break;}if(p.kind==PassiveKind::Unsupported)return passiveInfo_.emplace(key,std::move(p)).first->second;
    auto field=[&](const char* name,float fallback=0){return data.number(ability,"AbilityData",std::string(name)+std::to_string(level),fallback);};p.area=field("Area");p.amount=field("DataA");p.secondary=field("DataB");p.bonus=field("DataC");p.duration=field("Dur");p.heroDuration=field("HeroDur");
    auto split=[](const std::string& text){std::stringstream input(text);std::vector<std::string> parts;std::string part;while(std::getline(input,part,',')){auto first=part.find_first_not_of(" \t\"");if(first==std::string::npos)continue;part=part.substr(first,part.find_last_not_of(" \t\"")-first+1);if(part!="_" && part!="-")parts.push_back(part);}return parts;};for(auto& target:split(data.field(ability,"AbilityData","targs"+std::to_string(level))))p.allowed.insert(target);auto buffs=split(data.field(ability,"AbilityData","BuffID"+std::to_string(level)));if(!buffs.empty() && buffs.front().size()==4)p.buff=ObjectData::code(buffs.front());
    if(p.kind==PassiveKind::Brilliance || p.kind==PassiveKind::Devotion || p.kind==PassiveKind::Regeneration || p.kind==PassiveKind::Thorns)p.percent=p.secondary!=0;if(p.kind==PassiveKind::Unholy)p.percent=p.bonus!=0;
    if(p.kind==PassiveKind::Trueshot || p.kind==PassiveKind::Command || p.kind==PassiveKind::WarDrums){p.melee=p.secondary!=0;p.ranged=p.bonus!=0;p.percent=field("DataD")==0;}
    if(p.kind==PassiveKind::Vampiric){p.melee=true;p.ranged=false;}
    if(p.kind==PassiveKind::Bash || p.kind==PassiveKind::Critical){p.amount/=100;p.evasion=field("DataD");p.neverMiss=field("DataE")!=0;if(p.amount<0 || p.amount>1 || p.evasion<0 || p.evasion>1 || p.secondary<0 || p.bonus<0)throw std::runtime_error("Attack passive probability or multiplier outside supported range");}
    if(p.kind==PassiveKind::Evasion && (p.amount<0 || p.amount>1))throw std::runtime_error("Evasion probability outside supported range");
    if(p.kind==PassiveKind::Detection){p.area=field("Rng");if(p.amount<0 || p.amount>3 || p.amount!=std::floor(p.amount))throw std::runtime_error("Detection type outside source mask");}
    if(p.kind==PassiveKind::PermanentInvisibility && p.amount!=0 && p.amount!=1)throw std::runtime_error("Permanent invisibility acquire flag is not boolean");
    if(p.area<0 || p.area>100000 || std::abs(p.amount)>1000000 || std::abs(p.secondary)>1000000 || p.duration<0 || p.duration>86400 || p.heroDuration<0 || p.heroDuration>86400)throw std::runtime_error("Passive source field outside supported range");
    for(auto id:{ability,p.buff})if(id)for(auto artField:{"CasterArt","TargetArt","SpecialArt"})for(auto& path:split(data.field(id,"Profile",artField)))p.visualModels.push_back(path);
    if(p.buff)for(auto& path:split(data.field(p.buff,"Profile","TargetArt")))p.targetModels.emplace_back(path,data.field(p.buff,"Profile","Targetattach","origin"));
    return passiveInfo_.emplace(key,std::move(p)).first->second;
}
std::vector<std::pair<std::uint32_t,unsigned>> ScriptSession::passiveAbilities(const UnitState& unit) {
    std::map<std::uint32_t,unsigned> combined;for(auto [ability,level]:unit.abilities)if(level>0)combined[ability]=unsigned(level);
    for(auto id:unit.inventory)if(id && alive(id,NativeKind::Item) && items_.at(id)->holder==unit.handle){auto type=items_.at(id)->type;auto found=itemPassives_.find(type);if(found==itemPassives_.end()){std::vector<std::uint32_t> abilities;std::stringstream input(definitions().field(type,"ItemData","abilList"));std::string name;while(std::getline(input,name,',')){auto first=name.find_first_not_of(" \t");if(first!=std::string::npos)name=name.substr(first,name.find_last_not_of(" \t")-first+1);if(name.size()==4)abilities.push_back(ObjectData::code(name));}found=itemPassives_.emplace(type,std::move(abilities)).first;}for(auto ability:found->second)combined[ability]=std::max(1u,combined[ability]);}
    std::vector<std::pair<std::uint32_t,unsigned>> result;for(auto [ability,level]:combined)if(passiveInfo(ability,level).kind!=PassiveKind::Unsupported)result.emplace_back(ability,level);return result;
}
bool ScriptSession::passiveTarget(const UnitState& source,const UnitState& target,const PassiveInfo& p) {
    if(target.removing || target.hidden() || std::bit_cast<float>(target.life.bits())<=0)return false;auto& mask=p.allowed;auto classes=definitions().unitClasses(target.type);bool hostile=enemy(source.owner,target.owner);if(source.handle==target.handle && mask.contains("notself"))return false;
    if(target.movementType=="fly"?!mask.contains("air"):target.building?(!mask.contains("ground") && !mask.contains("structure")):!mask.contains("ground"))return false;if(classes.find("ward")!=std::string::npos && !mask.contains("ward"))return false;if(mask.contains("organic") && (target.building || classes.find("mechanical")!=std::string::npos))return false;if(mask.contains("nonancient") && classes.find("ancient")!=std::string::npos)return false;
    if((mask.contains("hero") || mask.contains("nonhero")) && !(target.hero?mask.contains("hero"):mask.contains("nonhero")))return false;if((target.invulnerable || capability(target,"Avul")) && !mask.contains("invu") && !mask.contains("invulnerable"))return false;
    bool relationships=mask.contains("friend") || mask.contains("allies") || mask.contains("enemy") || mask.contains("enemies") || mask.contains("self") || mask.contains("neutral");if(!relationships)return true;return (source.handle==target.handle && mask.contains("self")) || (source.handle!=target.handle && !hostile && (mask.contains("friend") || mask.contains("allies"))) || (hostile && (mask.contains("enemy") || mask.contains("enemies"))) || (target.owner>=12 && mask.contains("neutral"));
}
}
