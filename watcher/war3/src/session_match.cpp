// Author: MiYu. Original map scripts drive player outcomes, observed results and session exit requests.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cctype>
#include <cmath>

namespace war3 {
std::string ScriptSession::localized(const std::string& key) {if(!localized_){FrameDefinitions d;d.load(requireWorld().resources(),"UI\\FrameDef\\GlobalStrings.fdf");localized_=std::move(d);}return localized_->string(key);}
void ScriptSession::recordStat(unsigned owner,int PlayerStatistics::* field,int amount) {auto& value=statistics_.at(owner).*field;value=int(std::clamp(std::int64_t(value)+amount,std::int64_t(0),std::int64_t(INT_MAX)));}
void ScriptSession::playerEvent(unsigned owner,unsigned type) {std::vector<std::uint32_t> events;for(auto id:eventHandles_)if(alive(id,NativeKind::Event)){auto& e=std::get<ScriptEvent>(objects_[id-handleBase].state);if(e.kind==ScriptEvent::Kind::Player && e.target==owner && e.event==type)events.push_back(id);}ScriptContext context;context.triggerPlayer=handleBase+owner;for(auto id:events)fire(id,context);}
void ScriptSession::cacheHeroes(unsigned owner) {auto& heroes=heroSummaries_.at(owner);heroSnapshotValid_[owner]=true;heroes.clear();for(auto& [id,u]:units_)if(u->owner==owner && u->hero && !u->illusion && !u->removing)heroes.push_back({u->type,u->properName.empty()?u->name:u->properName,u->level,u->experience,u->appliedHeroStats});}
void ScriptSession::removePlayer(unsigned owner,unsigned result) {if(owner>=16 || result>3)throw std::runtime_error("Invalid player result");if(results_[owner])return;results_[owner]=result;config_.players[owner].slotState=2;if(!heroSnapshotValid_[owner])cacheHeroes(owner);if(result<=1)playerEvent(owner,result==0?14:13);}
void ScriptSession::finishGame(bool scores,SessionExit action) {if(action==SessionExit::None)throw std::runtime_error("Invalid session exit action");showScores_=scores;exit_=action;simulationPaused_=true;for(unsigned owner=0;owner<16;++owner)if(!heroSnapshotValid_[owner])cacheHeroes(owner);}
bool ScriptSession::endCinematic(unsigned owner) {bool registered=false;for(auto id:eventHandles_)if(alive(id,NativeKind::Event)){auto& event=std::get<ScriptEvent>(objects_[id-handleBase].state);if(event.kind==ScriptEvent::Kind::Player && event.target==owner && event.event==17 && alive(event.owner,NativeKind::Trigger) && std::get<Trigger>(objects_[event.owner-handleBase].state).enabled){registered=true;break;}}if(registered)playerEvent(owner,17);return registered;}

bool ScriptSession::canControlUnit(unsigned viewer,const UnitState& unit) const {
    return viewer<16 && unit.owner<16 && (viewer==unit.owner || (config_.players[unit.owner].alliances[viewer]&((1u<<6)|(1u<<7)))!=0);
}
bool ScriptSession::canManageUnitInventory(unsigned viewer,const UnitState& unit) const {
    return viewer<16 && unit.owner<16 && (viewer==unit.owner || (config_.players[unit.owner].alliances[viewer]&(1u<<7))!=0);
}
bool ScriptSession::setAlliedVictory(unsigned owner,bool enabled) {
    if(owner>=12 || !setupApplied_ || exit_!=SessionExit::None || (config_.mapFlags&(1024u|2048u)) || config_.players[owner].slotState!=1)return false;auto& state=config_.players[owner].states[8];int before=state;state=enabled?1:0;playerChange(owner,8,before,state,false);return true;
}
bool ScriptSession::setAllianceOption(unsigned from,unsigned to,unsigned option,bool enabled) {
    if(from>=12 || to>=12 || from==to || !setupApplied_ || exit_!=SessionExit::None || (config_.mapFlags&(1024u|2048u)) || (option!=0 && option!=5 && option!=6))return false;auto& sender=config_.players[from];if(sender.slotState!=1 || config_.players[to].slotState!=1)return false;auto& flags=sender.alliances[to];unsigned mask=option==0?31u:1u<<option,before=flags;flags=enabled?flags|mask:flags&~mask;unsigned after=flags;if(after==before)return true;++fogRevision_;for(unsigned bit=0;bit<8;++bit)if((mask&(1u<<bit)) && ((before^after)&(1u<<bit)) && ((flags^after)&(1u<<bit))==0)playerChange(from,bit,(before&(1u<<bit))!=0,(after&(1u<<bit))!=0,true);return true;
}
bool ScriptSession::transferResources(unsigned from,unsigned to,int gold,int lumber) {
    if(from>=12 || to>=12 || from==to || gold<0 || lumber<0 || !setupApplied_ || exit_!=SessionExit::None || (config_.mapFlags&256u))return false;auto& sender=config_.players[from];auto& recipient=config_.players[to];if(sender.slotState!=1 || recipient.slotState!=1 || !(sender.alliances[to]&1))return false;
    std::array<int,2> amounts{gold,lumber},beforeSource{},beforeTarget{},afterSource{},afterTarget{},lost{},received{};for(unsigned i=0;i<2;++i){auto field=i+1;beforeSource[i]=sender.states[field];beforeTarget[i]=recipient.states[field];if(beforeSource[i]<amounts[i])return false;auto it=sender.taxes.find({to,field});auto rate=it==sender.taxes.end()?0:std::clamp(it->second,0,100);lost[i]=int(std::int64_t(amounts[i])*rate/100);received[i]=amounts[i]-lost[i];if(std::int64_t(beforeTarget[i])+received[i]>INT_MAX)return false;afterSource[i]=beforeSource[i]-amounts[i];afterTarget[i]=beforeTarget[i]+received[i];}
    for(unsigned i=0;i<2;++i){sender.states[i+1]=afterSource[i];recipient.states[i+1]=afterTarget[i];}recordStat(from,&PlayerStatistics::goldGiven,gold);recordStat(from,&PlayerStatistics::lumberGiven,lumber);recordStat(from,&PlayerStatistics::goldLostTax,lost[0]);recordStat(from,&PlayerStatistics::lumberLostTax,lost[1]);recordStat(to,&PlayerStatistics::goldReceived,received[0]);recordStat(to,&PlayerStatistics::lumberReceived,received[1]);for(unsigned i=0;i<2;++i){auto field=i+1;if(sender.states[field]==afterSource[i])playerChange(from,field,beforeSource[i],afterSource[i],false);if(recipient.states[field]==afterTarget[i])playerChange(to,field,beforeTarget[i],afterTarget[i],false);}return true;
}
void ScriptSession::leaveGame() {if(localPlayer_)playerEvent(*localPlayer_,15);if(exit_==SessionExit::None)finishGame(true);}
unsigned ScriptSession::playerUnitCount(unsigned owner,bool structures,bool incomplete,std::optional<std::uint32_t> type,bool upgrades) {
    unsigned count=0;auto matches=[&](std::uint32_t actual){return !type || (upgrades?techEquivalent(actual,*type):actual==*type);};for(auto& [id,u]:units_)if(u->owner==owner && !u->illusion && !u->removing && std::bit_cast<float>(u->life.bits())>0){if((!structures || u->building) && (incomplete || !u->construction) && matches(u->type))++count;if(incomplete)for(auto& job:u->production)if(!job.research && (!structures || definitions().property(job.type,"ubdg","0")=="1") && matches(job.type))++count;}return count;
}
void ScriptSession::bindMatchNatives() {
    bind("RemovePlayer","nothing",{"player","playergameresult"},[this](auto& vm,auto a){removePlayer(playerId(a[0]),a[1].bits);return vm.nothing();});
    bind("EndGame","nothing",{"boolean"},[this](auto& vm,auto a){finishGame(a[0].bits!=0);return vm.nothing();});
    bind("RestartGame","nothing",{"boolean"},[this](auto& vm,auto a){finishGame(a[0].bits!=0,SessionExit::Restart);return vm.nothing();});
    bind("CachePlayerHeroData","nothing",{"player"},[this](auto& vm,auto a){cacheHeroes(playerId(a[0]));return vm.nothing();});
    bind("GetIntegerGameState","integer",{"igamestate"},[](auto& vm,auto a){if(a[0].bits!=1)throw std::runtime_error("Integer game state is not implemented");return vm.integer(0);});
    for(auto name:{"IsNoVictoryCheat","IsNoDefeatCheat"})bind(name,"boolean",{},[](auto& vm,auto){return vm.boolean(false);});
    bind("EnableUserControl","nothing",{"boolean"},[this](auto& vm,auto a){userControl_=a[0].bits!=0;return vm.nothing();});
    bind("EnableUserUI","nothing",{"boolean"},[this](auto& vm,auto a){userUI_=a[0].bits!=0;return vm.nothing();});
    bind("SetCineFilterTexture","nothing",{"string"},[this](auto& vm,auto a){auto value=a[0].text?*a[0].text:std::string{};if(value.size()>1024 || value.find('\0')!=std::string::npos)throw std::runtime_error("Invalid cinematic filter texture");cineFilter_.texture=std::move(value);return vm.nothing();});
    bind("SetCineFilterBlendMode","nothing",{"blendmode"},[this](auto& vm,auto a){if(a[0].bits>5)throw std::runtime_error("Invalid cinematic filter blend mode");cineFilter_.blend=a[0].bits;return vm.nothing();});
    bind("SetCineFilterTexMapFlags","nothing",{"texmapflags"},[this](auto& vm,auto a){if(a[0].bits>3)throw std::runtime_error("Invalid cinematic filter texture flags");cineFilter_.flags=a[0].bits;return vm.nothing();});
    for(auto [name,start]:std::initializer_list<std::pair<const char*,bool>>{{"SetCineFilterStartUV",true},{"SetCineFilterEndUV",false}})bind(name,"nothing",{"real","real","real","real"},[this,start](auto& vm,auto a){std::array<float,4> values;for(unsigned i=0;i<4;++i){values[i]=std::bit_cast<float>(a[i].bits);if(!std::isfinite(values[i]))throw std::runtime_error("Invalid cinematic filter UV");}(start?cineFilter_.startUV:cineFilter_.endUV)=values;return vm.nothing();});
    for(auto [name,start]:std::initializer_list<std::pair<const char*,bool>>{{"SetCineFilterStartColor",true},{"SetCineFilterEndColor",false}})bind(name,"nothing",{"integer","integer","integer","integer"},[this,start](auto& vm,auto a){std::array<unsigned,4> values;for(unsigned i=0;i<4;++i)values[i]=unsigned(std::clamp(std::bit_cast<std::int32_t>(a[i].bits),0,255));(start?cineFilter_.startColor:cineFilter_.endColor)=values;return vm.nothing();});
    bind("SetCineFilterDuration","nothing",{"real"},[this](auto& vm,auto a){auto duration=std::bit_cast<float>(a[0].bits);if(!std::isfinite(duration))throw std::runtime_error("Invalid cinematic filter duration");cineFilter_.duration=std::max(0.f,duration);return vm.nothing();});
    bind("DisplayCineFilter","nothing",{"boolean"},[this](auto& vm,auto a){cineFilter_.displayed=a[0].bits!=0;if(cineFilter_.displayed)cineFilter_.started=simulationTime_;return vm.nothing();});
    bind("IsCineFilterDisplayed","boolean",{},[this](auto& vm,auto){return vm.boolean(cineFilter_.displayed);});
    bind("EnableSelect","nothing",{"boolean","boolean"},[this](auto& vm,auto a){selectionEnabled_=a[0].bits!=0;selectionUI_=a[1].bits!=0;return vm.nothing();});
    bind("SetGameDifficulty","nothing",{"gamedifficulty"},[this](auto& vm,auto a){if(a[0].bits>3)throw std::runtime_error("Invalid game difficulty");gameDifficulty_=a[0].bits;return vm.nothing();});
    bind("GetGameDifficulty","gamedifficulty",{},[this](auto& vm,auto){return vm.handle("gamedifficulty",gameDifficulty_);});
    bind("GetDefaultDifficulty","gamedifficulty",{},[this](auto& vm,auto){return vm.handle("gamedifficulty",defaultDifficulty_);});
    bind("UnitId","integer",{"string"},[this](auto& vm,auto a){return vm.integer(std::bit_cast<std::int32_t>(a[0].text?definitions().unitId(*a[0].text):0));});
    bind("UnitId2String","string",{"integer"},[this](auto& vm,auto a){return vm.string(definitions().contains(a[0].bits)?definitions().field(a[0].bits,"UnitUI","name"):std::string{});});
    bind("GetPlayerTypedUnitCount","integer",{"player","string","boolean","boolean"},[this](auto& vm,auto a){auto type=a[1].text?definitions().unitId(*a[1].text):0;return vm.integer(type?int(playerUnitCount(playerId(a[0]),false,a[2].bits!=0,type,a[3].bits!=0)):0);});
    bind("GetLocalizedHotkey","integer",{"string"},[this](auto& vm,auto a){if(!a[0].text)return vm.integer(0);auto value=localized(*a[0].text);for(size_t at=0;at+12<=value.size();++at)if(value[at]=='|' && std::tolower(static_cast<unsigned char>(value[at+1]))=='c'){auto end=value.find('|',at+10);auto text=value.substr(at+10,end==std::string::npos?end:end-at-10);if(text=="ESC" || text=="Esc")return vm.integer(512);if(text.size()==1 && static_cast<unsigned char>(text[0])<128)return vm.integer(std::toupper(static_cast<unsigned char>(text[0])));}return vm.integer(0);});
    bind("GetPlayerScore","integer",{"player","playerscore"},[this](auto& vm,auto a){auto& s=statistics_[playerId(a[0])];switch(a[1].bits){case 0:return vm.integer(s.trained);case 1:return vm.integer(s.killed);case 2:return vm.integer(s.built);case 3:return vm.integer(s.razed);case 5:return vm.integer(s.foodProduced);case 6:return vm.integer(s.foodUsed);case 7:return vm.integer(s.heroesKilled);case 8:return vm.integer(s.items);case 9:return vm.integer(s.mercenaries);case 10:return vm.integer(s.goldMined);case 13:return vm.integer(s.goldLostTax);case 14:return vm.integer(s.goldGiven);case 15:return vm.integer(s.goldReceived);case 16:return vm.integer(s.lumberMined);case 18:return vm.integer(s.lumberLostTax);case 19:return vm.integer(s.lumberGiven);case 20:return vm.integer(s.lumberReceived);default:throw std::runtime_error("Player score category is not implemented: "+std::to_string(a[1].bits));}});
}
}
