// Author: MiYu. Source ability prototypes and level fields select real unit, point, area and summon consumers.
#include "session.h"
#include "order_ids.h"
#include <algorithm>
#include <cmath>
#include <cctype>
#include <sstream>

namespace war3 {
const SpellInfo& ScriptSession::spellInfo(std::uint32_t ability,unsigned level) {
    auto key=std::pair{ability,level};if(auto found=spellInfo_.find(key);found!=spellInfo_.end())return found->second;SpellInfo s;s.ability=ability;s.level=level;auto& data=definitions();if(!level || !data.ability(ability))return spellInfo_.emplace(key,std::move(s)).first->second;
    struct Prototype {const char* code;SpellKind kind;SpellTargeting targeting;};
    constexpr Prototype prototypes[]={
        {"AHhb",SpellKind::HolyLight,SpellTargeting::Unit},{"AHtb",SpellKind::StormBolt,SpellTargeting::Unit},
        {"AUdc",SpellKind::DeathCoil,SpellTargeting::Unit},{"AUfn",SpellKind::FrostNova,SpellTargeting::Unit},
        {"AEer",SpellKind::Roots,SpellTargeting::Unit},{"AOcl",SpellKind::ChainLightning,SpellTargeting::Unit},
        {"AOhw",SpellKind::HealingWave,SpellTargeting::Unit},{"AHtc",SpellKind::ThunderClap,SpellTargeting::None},
        {"AOws",SpellKind::WarStomp,SpellTargeting::None},{"AOsh",SpellKind::Shockwave,SpellTargeting::Point},
        {"AUcs",SpellKind::CarrionSwarm,SpellTargeting::Point},{"AEfk",SpellKind::FanKnives,SpellTargeting::None},
        {"AHwe",SpellKind::WaterElemental,SpellTargeting::None},{"AOsf",SpellKind::SpiritWolf,SpellTargeting::None},
        {"AOsw",SpellKind::SerpentWard,SpellTargeting::Point},{"AUin",SpellKind::Inferno,SpellTargeting::Point},
        {"AEfn",SpellKind::Treants,SpellTargeting::Point},
        {"AHbz",SpellKind::Blizzard,SpellTargeting::Point},{"AHfs",SpellKind::FlameStrike,SpellTargeting::Point},
        {"AEtq",SpellKind::Tranquility,SpellTargeting::None},{"AEsf",SpellKind::Starfall,SpellTargeting::None},
        {"AUdd",SpellKind::DeathDecay,SpellTargeting::Point},{"ANcl",SpellKind::Channel,SpellTargeting::None},
        {"Ahea",SpellKind::Heal,SpellTargeting::Unit},{"Aslo",SpellKind::Slow,SpellTargeting::Unit},
        {"Ainf",SpellKind::InnerFire,SpellTargeting::Unit},{"Ablo",SpellKind::Bloodlust,SpellTargeting::Unit},
        {"Arej",SpellKind::Rejuvenation,SpellTargeting::Unit},{"Auhf",SpellKind::Frenzy,SpellTargeting::Unit},
        {"Acrs",SpellKind::Curse,SpellTargeting::Unit},{"Adis",SpellKind::Dispel,SpellTargeting::Point},
        {"Aadm",SpellKind::Abolish,SpellTargeting::Unit},{"Aams",SpellKind::AntiMagicShell,SpellTargeting::Unit},
        {"Auns",SpellKind::Unsummon,SpellTargeting::Unit},{"Aivs",SpellKind::Invisibility,SpellTargeting::Unit}
    };
    auto code=data.field(ability,"AbilityData","code",ObjectData::name(ability));for(auto& p:prototypes)if(code==p.code){s.kind=p.kind;s.targeting=p.targeting;break;}if(s.kind==SpellKind::Unsupported)return spellInfo_.emplace(key,std::move(s)).first->second;
    auto field=[&](const char* name,float fallback=0){return data.number(ability,"AbilityData",std::string(name)+std::to_string(level),fallback);};
    auto count=[](float value,unsigned maximum){if(value<0 || value>maximum || value!=std::floor(value))throw std::runtime_error("Ability count outside supported range");return unsigned(value);};
    s.order=orderId(data.field(ability,"Profile","Order"));if(!s.order)throw std::runtime_error("Missing source spell order: "+ObjectData::name(ability));s.mana=field("Cost");s.cooldown=field("Cool");s.range=field("Rng");s.area=field("Area");s.amount=field("DataA");s.secondary=field("DataB");s.loss=field("DataC");s.duration=field("Dur");s.heroDuration=field("HeroDur");s.speed=data.number(ability,"Profile","Missilespeed");s.missileArc=data.number(ability,"Profile","Missilearc");s.missile=data.field(ability,"Profile","Missileart");if(auto comma=s.missile.find(',');comma!=std::string::npos)s.missile.resize(comma);
    auto animation=data.field(ability,"Profile","Animnames","spell");std::replace(animation.begin(),animation.end(),',',' ');std::stringstream names(animation);std::string name;while(names>>name){for(auto& c:name)c=char(std::tolower(static_cast<unsigned char>(c)));name[0]=char(std::toupper(static_cast<unsigned char>(name[0])));if(!s.animation.empty())s.animation+=' ';s.animation+=name;}if(s.animation.empty())s.animation="Spell";
    for(auto artField:{"CasterArt","TargetArt","EffectArt","MissileArt"}){std::stringstream paths(data.field(ability,"Profile",artField));std::string path;while(std::getline(paths,path,',')){auto first=path.find_first_not_of(" \t\"");if(first!=std::string::npos)s.visualModels.push_back(path.substr(first,path.find_last_not_of(" \t\"")-first+1));}}
    auto buff=data.field(ability,"AbilityData","BuffID"+std::to_string(level));if(buff.size()>=4 && buff!="-" && buff!="_")s.buff=ObjectData::code(buff.substr(0,4));std::stringstream targets(data.field(ability,"AbilityData","targs"+std::to_string(level)));std::string part;while(std::getline(targets,part,',')){auto first=part.find_first_not_of(" \t");if(first!=std::string::npos)s.allowed.insert(part.substr(first,part.find_last_not_of(" \t")-first+1));}
    if(s.buff){std::stringstream paths(data.field(s.buff,"Profile","Targetart"));std::string path;while(std::getline(paths,path,',')){auto first=path.find_first_not_of(" \t\"");if(first!=std::string::npos && path!="_")s.visualModels.push_back(path.substr(first,path.find_last_not_of(" \t\"")-first+1));}}
    {std::stringstream required(data.field(ability,"Profile","Requires")),counts(data.field(ability,"Profile","Requiresamount"));std::string requirement,amount;while(std::getline(required,requirement,',')){auto first=requirement.find_first_not_of(" \t");if(first==std::string::npos)continue;requirement=requirement.substr(first,requirement.find_last_not_of(" \t")-first+1);if(requirement=="_" || requirement=="-")continue;if(requirement.size()!=4 || s.prerequisites.size()>=64)throw std::runtime_error("Invalid source spell prerequisite");amount.clear();std::getline(counts,amount,',');s.prerequisites.emplace_back(ObjectData::code(requirement),amount.empty()?1:count(std::stof(amount),65536));}}
    s.orderOn=orderId(data.field(ability,"Profile","Orderon"));s.orderOff=orderId(data.field(ability,"Profile","Orderoff"));s.onArt=data.field(ability,"Profile","Art");if(auto comma=s.onArt.find(',');comma!=std::string::npos)s.onArt.resize(comma);s.offArt=data.field(ability,"Profile","Unart");if(auto comma=s.offArt.find(',');comma!=std::string::npos)s.offArt.resize(comma);
    if(s.kind==SpellKind::Slow){s.moveReduction=s.amount;s.attackReduction=s.secondary;s.alwaysAuto=field("DataC")!=0;}
    if(s.kind==SpellKind::Unsummon){s.unlimitedRange=true;if(s.amount>10 || s.secondary>99999 || s.secondary!=std::floor(s.secondary))throw std::runtime_error("Unsummon refund or accumulation outside supported range");}
    if(s.kind==SpellKind::InnerFire){s.damageBonus=s.amount;s.armor=s.secondary;s.autoRange=field("DataC");s.healthRegen=field("DataD");}
    if(s.kind==SpellKind::Bloodlust){s.attackBonus=s.amount;s.moveBonus=s.secondary;s.scaleBonus=field("DataC");}
    if(s.kind==SpellKind::Frenzy)s.attackBonus=s.amount;
    if(s.kind==SpellKind::Rejuvenation){s.allowFull=count(field("DataC"),3);if(field("DataD")!=0)s.targeting=SpellTargeting::None;if(s.duration<=0 || s.heroDuration<=0)throw std::runtime_error("Rejuvenation requires positive source duration");}
    if(s.kind==SpellKind::Curse && s.amount>1)throw std::runtime_error("Curse miss probability outside supported range");
    if(s.kind==SpellKind::AntiMagicShell){s.shield=field("DataC");s.spellReduction=s.secondary;s.manaLoss=field("DataD");if(s.shield>0){auto comma=buff.find(',');if(comma!=std::string::npos && buff.size()>=comma+5)s.buff=ObjectData::code(buff.substr(comma+1,4));}if(s.spellReduction>1 || s.shield<0 || s.manaLoss<0)throw std::runtime_error("Anti-magic shell parameters outside supported range");}
    if(s.kind==SpellKind::ChainLightning || s.kind==SpellKind::HealingWave){s.targets=count(s.secondary,1024);if(!s.targets || s.loss<0 || s.loss>1)throw std::runtime_error("Source spell chain outside supported range");}
    if(s.kind==SpellKind::ThunderClap){s.moveReduction=field("DataC");s.attackReduction=field("DataD");}
    if(s.kind==SpellKind::Shockwave || s.kind==SpellKind::CarrionSwarm){s.maxDamage=field("DataB");s.distance=field("DataC");s.endRadius=field("DataD");if(s.distance<=0 || s.distance>100000 || s.speed<=0 || s.endRadius<0 || s.endRadius>100000)throw std::runtime_error("Source wave geometry outside supported range");}
    if(s.kind==SpellKind::FanKnives){s.maxDamage=field("DataB");s.targets=count(field("DataC"),1024);}
    bool summon=s.kind==SpellKind::WaterElemental || s.kind==SpellKind::SpiritWolf || s.kind==SpellKind::SerpentWard || s.kind==SpellKind::Treants || s.kind==SpellKind::Inferno;
    if(summon){auto type=data.field(ability,"AbilityData","UnitID"+std::to_string(level));if(type.size()!=4 || !data.contains(ObjectData::code(type)))throw std::runtime_error("Unknown source summoned type: "+type);s.summonType=ObjectData::code(type);s.summonCount=s.kind==SpellKind::Inferno?1:count(field(s.kind==SpellKind::SpiritWolf?"DataB":"DataA"),64);s.summonDuration=s.kind==SpellKind::Inferno?field("DataB"):s.duration;if(s.kind==SpellKind::Inferno)s.impactDelay=field("DataC");if(!s.summonCount || s.summonDuration<=0 || s.summonDuration>86400 || s.impactDelay<0 || s.impactDelay>86400)throw std::runtime_error("Source summon lifetime outside supported range");}
    if(s.kind==SpellKind::Blizzard || s.kind==SpellKind::Tranquility || s.kind==SpellKind::Starfall || s.kind==SpellKind::DeathDecay || s.kind==SpellKind::Channel){s.channelled=true;s.channelTime=s.duration;s.period=s.secondary;}
    auto alias=data.field(ability,"AbilityData","EfctID"+std::to_string(level));if(alias.size()>=4 && alias!="_" && alias!="-")s.effectAlias=ObjectData::code(alias.substr(0,4));
    if(s.kind==SpellKind::Blizzard){s.pulses=count(s.amount,1024);s.shards=count(field("DataC"),128);s.period=field("Cast");s.channelTime=s.pulses*s.period;s.amount=field("DataB");s.maxDamage=field("DataF");s.buildingFactor=field("DataD",1);s.extraDamage=field("DataE");if(s.allowed.empty() || s.allowed.contains("_"))s.allowed={"ground","structure","enemy","friend","self","neutral","tree","debris"};if(!s.pulses || s.period<=0)throw std::runtime_error("Blizzard wave schedule is invalid");}
    if(s.kind==SpellKind::FlameStrike){s.castDelay=field("Cast");s.fullTime=s.heroDuration;s.fullPeriod=field("DataB");s.extraDamage=field("DataC");s.burnPeriod=field("DataD");s.maxDamage=field("DataF");s.buildingFactor=field("DataE",1);if(s.duration<=0 || s.fullTime<0 || s.fullTime>s.duration || s.fullPeriod<=0 || s.burnPeriod<=0 || s.castDelay<0)throw std::runtime_error("Flame Strike schedule is invalid");}
    if(s.kind==SpellKind::Tranquility || s.kind==SpellKind::Starfall)s.buildingFactor=field("DataC",1);if(s.kind==SpellKind::DeathDecay)s.buildingFactor=field("DataB",1);
    if(s.kind==SpellKind::DeathDecay){s.period=1;s.allowed.insert("tree");}
    if(s.kind==SpellKind::Channel){s.channelTime=field("DataA");auto targeting=count(field("DataB"),3);constexpr SpellTargeting targetTypes[]={SpellTargeting::None,SpellTargeting::Unit,SpellTargeting::Point,SpellTargeting::Either};s.targeting=targetTypes[targeting];s.channelOptions=count(field("DataC"),31);s.artPeriod=field("DataD");s.disableOthers=field("DataE")!=0;auto order=data.field(ability,"AbilityData","DataF"+std::to_string(level));s.order=orderId(order);if(!s.order)throw std::runtime_error("Unknown Channel base order: "+order);s.period=0;if(s.allowed.empty() || s.allowed.contains("_"))s.allowed={"air","ground","structure","ward","self","friend","enemy","neutral","vuln","invu"};}
    if(s.effectAlias){for(auto artField:{"CasterArt","TargetArt","EffectArt"}){std::stringstream paths(data.field(s.effectAlias,"Profile",artField));std::string path;while(std::getline(paths,path,','))if(!path.empty() && path!="_")s.visualModels.push_back(path);}}
    if(s.kind==SpellKind::FlameStrike){std::stringstream paths(data.field(ability,"Profile","Specialart"));std::string path;while(std::getline(paths,path,','))if(!path.empty() && path!="_")s.visualModels.push_back(path);}
    if((s.period>0 && s.channelTime/s.period>262144) || (s.artPeriod>0 && s.channelTime/s.artPeriod>262144) || (s.fullPeriod>0 && s.fullTime/s.fullPeriod>262144) || (s.burnPeriod>0 && s.duration/s.burnPeriod>262144))throw std::runtime_error("Persistent spell tick budget exceeded");
    if(s.damageBonus<0 || s.armor<0 || s.attackBonus<0 || s.moveBonus<0 || s.scaleBonus<0 || s.healthRegen<0 || s.autoRange<0 || s.autoRange>100000)throw std::runtime_error("Caster modifier outside supported range");
    if(s.channelTime<0 || s.channelTime>86400 || s.artPeriod<0 || s.artPeriod>86400 || s.buildingFactor<0 || s.extraDamage<0 || (s.channelled && s.kind!=SpellKind::Channel && s.period<=0))throw std::runtime_error("Channel duration or period exceeds supported range");
    if(s.mana<0 || s.cooldown<0 || s.range<0 || s.range>100000 || s.area<0 || s.area>100000 || s.amount<0 || s.secondary<0 || s.duration<0 || s.heroDuration<0 || s.speed<0 || s.maxDamage<0 || s.moveReduction<0 || s.moveReduction>1 || s.attackReduction<0)throw std::runtime_error("Source spell parameters outside supported range");return spellInfo_.emplace(key,std::move(s)).first->second;
}
}
