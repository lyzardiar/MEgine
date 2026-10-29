// Author: MiYu. Leaderboard handles, players, items and styling for campaign script UI.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cctype>

namespace war3 {
const ScriptLeaderboard* ScriptSession::leaderboard(unsigned player) const {
    if(player>=playerLeaderboards_.size())return nullptr;auto id=playerLeaderboards_[player];if(!alive(id,NativeKind::Leaderboard))return nullptr;return std::get<std::shared_ptr<ScriptLeaderboard>>(objects_[id-handleBase].state).get();
}
void ScriptSession::bindLeaderboardNatives() {
    auto board=[this](jass::Value handle)->std::shared_ptr<ScriptLeaderboard>{if(!handle.bits)return {};return std::get<std::shared_ptr<ScriptLeaderboard>>(object(handle,NativeKind::Leaderboard).state);};
    auto integer=[](jass::Value value){return std::bit_cast<std::int32_t>(value.bits);};
    auto text=[this](jass::Value value){auto result=value.text?mapString(*value.text,strings_):std::string{};if(result.size()>65536)throw std::runtime_error("Leaderboard text exceeds budget");return result;};
    auto color=[integer](std::span<const jass::Value> values){auto channel=[&](unsigned n){return unsigned(std::clamp(integer(values[n]),0,255));};return (channel(3)<<24)|(channel(0)<<16)|(channel(1)<<8)|channel(2);};
    auto item=[integer](const std::shared_ptr<ScriptLeaderboard>& value,jass::Value index)->ScriptLeaderboardItem*{int i=integer(index);return value && i>=0 && size_t(i)<value->items.size()?&value->items[size_t(i)]:nullptr;};
    bind("CreateLeaderboard","leaderboard",{},[this](auto&,auto){if(liveObjects(NativeKind::Leaderboard)>=256)throw std::runtime_error("Leaderboard budget exceeded");return create(NativeKind::Leaderboard);});
    bind("DestroyLeaderboard","nothing",{"leaderboard"},[this](auto& vm,auto a){if(alive(a[0].bits,NativeKind::Leaderboard)){for(auto& id:playerLeaderboards_)if(id==a[0].bits)id=0;destroy(a[0],NativeKind::Leaderboard);}return vm.nothing();});
    bind("PlayerSetLeaderboard","nothing",{"player","leaderboard"},[this,board](auto& vm,auto a){auto owner=playerId(a[0]);if(a[1].bits)board(a[1]);playerLeaderboards_[owner]=a[1].bits;return vm.nothing();});
    bind("PlayerGetLeaderboard","leaderboard",{"player"},[this](auto& vm,auto a){return vm.handle("leaderboard",playerLeaderboards_[playerId(a[0])]);});
    bind("LeaderboardDisplay","nothing",{"leaderboard","boolean"},[board](auto& vm,auto a){if(auto b=board(a[0]))b->visible=a[1].bits!=0;return vm.nothing();});
    bind("IsLeaderboardDisplayed","boolean",{"leaderboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.boolean(b && b->visible);});
    bind("LeaderboardGetItemCount","integer",{"leaderboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.integer(b?int(b->items.size()):0);});
    bind("LeaderboardSetSizeByItemCount","nothing",{"leaderboard","integer"},[board,integer](auto& vm,auto a){if(auto b=board(a[0]))b->sizeCount=unsigned(std::clamp(integer(a[1]),0,256));return vm.nothing();});
    bind("LeaderboardAddItem","nothing",{"leaderboard","string","integer","player"},[this,board,text,integer](auto& vm,auto a){auto owner=playerId(a[3]);if(auto b=board(a[0])){if(b->items.size()>=256)throw std::runtime_error("Leaderboard item budget exceeded");ScriptLeaderboardItem entry;entry.label=text(a[1]);entry.value=integer(a[2]);entry.player=owner;entry.labelColor=b->labelColor;entry.valueColor=b->valueColor;b->items.push_back(std::move(entry));}return vm.nothing();});
    bind("LeaderboardRemoveItem","nothing",{"leaderboard","integer"},[board,integer](auto& vm,auto a){auto b=board(a[0]);auto index=integer(a[1]);if(b && index>=0 && size_t(index)<b->items.size())b->items.erase(b->items.begin()+index);return vm.nothing();});
    bind("LeaderboardRemovePlayerItem","nothing",{"leaderboard","player"},[this,board](auto& vm,auto a){auto b=board(a[0]);auto owner=playerId(a[1]);if(b){auto found=std::find_if(b->items.begin(),b->items.end(),[&](auto& entry){return entry.player==owner;});if(found!=b->items.end())b->items.erase(found);}return vm.nothing();});
    bind("LeaderboardClear","nothing",{"leaderboard"},[board](auto& vm,auto a){if(auto b=board(a[0]))b->items.clear();return vm.nothing();});
    for(auto [name,kind]:std::initializer_list<std::pair<const char*,unsigned>>{{"LeaderboardSortItemsByValue",0},{"LeaderboardSortItemsByPlayer",1},{"LeaderboardSortItemsByLabel",2}})bind(name,"nothing",{"leaderboard","boolean"},[board,kind](auto& vm,auto a){if(auto b=board(a[0])){bool ascending=a[1].bits!=0;std::stable_sort(b->items.begin(),b->items.end(),[&](auto& x,auto& y){int result=0;if(kind==0)result=(x.value>y.value)-(x.value<y.value);else if(kind==1)result=(x.player>y.player)-(x.player<y.player);else{auto l=x.label,r=y.label;for(auto& c:l)c=char(std::tolower(static_cast<unsigned char>(c)));for(auto& c:r)c=char(std::tolower(static_cast<unsigned char>(c)));result=l.compare(r);}return ascending?result<0:result>0;});}return vm.nothing();});
    bind("LeaderboardHasPlayerItem","boolean",{"leaderboard","player"},[this,board](auto& vm,auto a){auto b=board(a[0]);auto owner=playerId(a[1]);return vm.boolean(b && std::any_of(b->items.begin(),b->items.end(),[&](auto& entry){return entry.player==owner;}));});
    bind("LeaderboardGetPlayerIndex","integer",{"leaderboard","player"},[this,board](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Leaderboard))return vm.integer(-1);auto b=board(a[0]);auto owner=playerId(a[1]);auto found=std::find_if(b->items.begin(),b->items.end(),[&](auto& entry){return entry.player==owner;});return vm.integer(found==b->items.end()?-1:int(found-b->items.begin()));});
    bind("LeaderboardSetLabel","nothing",{"leaderboard","string"},[board,text](auto& vm,auto a){if(auto b=board(a[0]))b->label=text(a[1]);return vm.nothing();});
    bind("LeaderboardGetLabelText","string",{"leaderboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.string(b?b->label:std::string{});});
    for(auto [name,label]:std::initializer_list<std::pair<const char*,bool>>{{"LeaderboardSetLabelColor",true},{"LeaderboardSetValueColor",false}})bind(name,"nothing",{"leaderboard","integer","integer","integer","integer"},[board,color,label](auto& vm,auto a){if(auto b=board(a[0])){auto c=color(a.subspan(1));(label?b->labelColor:b->valueColor)=c;for(auto& entry:b->items)(label?entry.labelColor:entry.valueColor)=c;}return vm.nothing();});
    bind("LeaderboardSetStyle","nothing",{"leaderboard","boolean","boolean","boolean","boolean"},[board](auto& vm,auto a){if(auto b=board(a[0])){b->showLabel=a[1].bits!=0;b->showNames=a[2].bits!=0;b->showValues=a[3].bits!=0;b->showIcons=a[4].bits!=0;}return vm.nothing();});
    bind("LeaderboardSetItemValue","nothing",{"leaderboard","integer","integer"},[this,board,item,integer](auto& vm,auto a){if(alive(a[0].bits,NativeKind::Leaderboard))if(auto entry=item(board(a[0]),a[1]))entry->value=integer(a[2]);return vm.nothing();});
    bind("LeaderboardSetItemLabel","nothing",{"leaderboard","integer","string"},[board,item,text](auto& vm,auto a){if(auto entry=item(board(a[0]),a[1]))entry->label=text(a[2]);return vm.nothing();});
    bind("LeaderboardSetItemStyle","nothing",{"leaderboard","integer","boolean","boolean","boolean"},[board,item](auto& vm,auto a){if(auto entry=item(board(a[0]),a[1])){entry->showLabel=a[2].bits!=0;entry->showValue=a[3].bits!=0;entry->showIcon=a[4].bits!=0;}return vm.nothing();});
    for(auto [name,label]:std::initializer_list<std::pair<const char*,bool>>{{"LeaderboardSetItemLabelColor",true},{"LeaderboardSetItemValueColor",false}})bind(name,"nothing",{"leaderboard","integer","integer","integer","integer","integer"},[board,item,color,label](auto& vm,auto a){if(auto entry=item(board(a[0]),a[1]))(label?entry->labelColor:entry->valueColor)=color(a.subspan(2));return vm.nothing();});
}
}
