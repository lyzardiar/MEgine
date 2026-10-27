// Author: MiYu. Original ability art, positions, hotkeys and levels drive learning and casting commands.
#include "session.h"
#include <algorithm>
#include <bit>
#include <sstream>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
std::string levelText(const std::string& source,unsigned level){std::vector<std::string> values;std::string part;bool quote=false;for(auto c:source){if(c=='"'){quote=!quote;continue;}if(c==',' && !quote){values.push_back(part);part.clear();}else part+=c;}values.push_back(part);return values[std::min<size_t>(level?level-1:0,values.size()-1)];}
}
bool ScriptSession::canLearnSkill(std::uint32_t id,std::uint32_t ability) {if(!alive(id,NativeKind::Unit))return false;auto u=units_.at(id);if(!u->hero || u->removing || u->paused || u->hidden() || number(u->life)<=0 || u->skillPoints<=0 || std::find(u->learnable.begin(),u->learnable.end(),ability)==u->learnable.end())return false;auto& data=definitions();int level=u->abilities.contains(ability)?u->abilities.at(ability):0;int skip=int(data.number(ability,"AbilityData","levelSkip"));if(!skip)skip=int(gameplayNumber("HeroAbilityLevelSkip",2));return level<int(data.number(ability,"AbilityData","levels",1)) && u->level>=int(data.number(ability,"AbilityData","reqLevel",1))+skip*level;}
std::vector<CommandButton> ScriptSession::abilityCommands(std::uint32_t id,unsigned player,bool learning) {
    std::vector<CommandButton> result;if(!alive(id,NativeKind::Unit))return result;auto u=units_.at(id);if(u->owner!=player || u->construction || u->buildingUpgrade)return result;auto& data=definitions();std::vector<std::uint32_t> abilities;if(learning)abilities=u->learnable;else for(auto [ability,level]:u->abilities)if(level>0 && (spellInfo(ability,unsigned(level)).kind!=SpellKind::Unsupported || std::find(u->learnable.begin(),u->learnable.end(),ability)!=u->learnable.end()))abilities.push_back(ability);
    for(auto ability:abilities){
        unsigned level=u->abilities.contains(ability)?unsigned(std::max(0,u->abilities.at(ability))):0;auto& s=spellInfo(ability,std::max(1u,learning?level+1:level));if(!learning && s.kind==SpellKind::Channel && !(s.channelOptions&1))continue;
        auto pos=data.field(ability,"Profile",learning?"Researchbuttonpos":"Buttonpos");auto comma=pos.find(',');if(comma==std::string::npos)continue;int x=std::stoi(pos.substr(0,comma)),y=std::stoi(pos.substr(comma+1));if(x<0 || x>3 || y<0 || y>2)throw std::runtime_error("Ability command position outside source console");
        auto source=[&](const char* field){return mapString(levelText(data.field(ability,"Profile",field),learning?level+1:level),strings_);};CommandButton b;b.action=learning?CommandAction::LearnSkill:CommandAction::CastSpell;b.type=ability;b.icon=source(learning?"ResearchArt":"Art");b.name=source(learning?"Researchtip":"Tip");b.tip=source(learning?"Researchubertip":"Ubertip");b.hotkey=source(learning?"Researchhotkey":"Hotkey");if(b.name.empty())b.name=ObjectData::name(ability);b.x=x;b.y=y;
        b.enabled=learning?canLearnSkill(id,ability):!u->paused && !u->stunned() && !u->hidden() && !u->removing && !u->illusion && number(u->life)>0 && number(u->mana)>=s.mana && spellCooldown(id,ability)<=0;b.reason=learning?"需要技能点或英雄等级":spellCooldown(id,ability)>0?"技能冷却中":number(u->mana)<s.mana?"魔法不足":"当前无法施法";
        if(!learning && u->cast && u->cast->phase==CastOrder::Phase::Channel && u->cast->spell.disableOthers && u->cast->spell.ability!=ability){b.enabled=false;b.reason="持续施法期间不可使用其他技能";}if(s.kind==SpellKind::Unsupported){b.enabled=false;b.reason="该技能效果尚未实现";}auto available=config_.players[player].abilityAvailable.find(ability);if(available!=config_.players[player].abilityAvailable.end() && !available->second){b.enabled=false;b.reason="技能已禁用";}result.push_back(std::move(b));
    }return result;
}
}
