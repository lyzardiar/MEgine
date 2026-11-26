// Author: MiYu. Original local multiplayer browsing screen and live LAN discovery results.
#include "lan_browser.h"
#include "lan_address.h"
#include <algorithm>
#include <cmath>

namespace war3 {
namespace {
bool hit(GlueScreen::Rect r,float x,float y){return x>=r.x && y>=r.y && x<r.x+r.w && y<r.y+r.h;}
bool click(GlueScreen::Rect r,const UiInput& input){return input.pressed && hit(r,input.x,input.y) && hit(r,input.startX,input.startY);}
std::string key(const LanGame& game){return game.address+":"+std::to_string(game.port)+":"+std::to_string(game.hostCounter)+":"+std::to_string(game.entryKey);}
std::string display(std::string_view input){try{return utf8(wide(input));}catch(const std::exception&){if(input.empty())return {};int size=MultiByteToWideChar(CP_ACP,0,input.data(),int(input.size()),nullptr,0);if(size<=0)return "?";std::wstring text(size,L'\0');MultiByteToWideChar(CP_ACP,0,input.data(),int(input.size()),text.data(),size);return utf8(text);}}
constexpr std::size_t addressLimit=63;
constexpr GlueScreen::Rect addressButton{.49f,.092f,.265f,.034f};
constexpr GlueScreen::Rect roomModeButton{.49f,.165f,.265f,.034f};
constexpr GlueScreen::Rect addressBox{.18f,.195f,.44f,.209f};
constexpr GlueScreen::Rect addressEdit{.204f,.270f,.392f,.036f},addressSearch{.204f,.354f,.182f,.032f},addressCancel{.414f,.354f,.182f,.032f};
std::optional<std::wstring> pasteAddress(){
    if(!OpenClipboard(nullptr))return {};
    struct Clipboard {~Clipboard(){CloseClipboard();}} clipboard;
    auto handle=static_cast<HGLOBAL>(GetClipboardData(CF_UNICODETEXT));if(!handle)return {};
    auto data=static_cast<const wchar_t*>(GlobalLock(handle));if(!data)return {};
    struct Unlock {HGLOBAL handle;~Unlock(){GlobalUnlock(handle);}} unlock{handle};
    const auto limit=data+std::min<std::size_t>(addressLimit+1,GlobalSize(handle)/sizeof(wchar_t));
    const auto end=std::find(data,limit,L'\0');if(end==limit)return {};
    std::wstring value(data,end);
    const auto first=value.find_first_not_of(L" \t\r\n"),last=value.find_last_not_of(L" \t\r\n");
    return first==std::wstring::npos?std::wstring{}:value.substr(first,last-first+1);
}
}
LanBrowser::LanBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,std::string_view discoveryAddress,bool loopbackOnly,bool matchHandoffEnabled) : screen_(archives,images,renderer,text,"UI\\FrameDef\\Glue\\LocalMultiplayerJoin.fdf","LocalMultiplayerJoin"),archives_(archives),images_(images),renderer_(renderer),text_(text),log_(log),discoveryAddress_(discoveryAddress),matchHandoffEnabled_(matchHandoffEnabled),loopbackOnly_(loopbackOnly) {screen_.focusEnabled(false);start();}
std::optional<LanLobbyHandoff> LanBrowser::takeHandoff(){if(!lobby_)return {};auto handoff=lobby_->takeHandoff();if(handoff)lobby_.reset();return handoff;}
std::optional<LanHostHandoff> LanBrowser::takeHostHandoff(){if(!host_)return {};auto handoff=host_->takeHandoff();if(handoff)host_.reset();return handoff;}
std::string LanBrowser::pollMinimized(){if(host_)return host_->pollMinimized();if(lobby_){auto action=lobby_->pollMinimized();if(lobby_->needsDifferentPlayerName())pollDiscovery();return action;}pollDiscovery();return {};}
void LanBrowser::pollDiscovery(){
    if(discovery_)try{auto now=GetTickCount64();if(now>=nextSearch_){discovery_->refresh();nextSearch_=now+4000;}discovery_->poll();}
    catch(const std::exception& e){discovery_.reset();error_="局域网搜索中断。按 F5 重试。";log_.write(std::string("lan_discovery_failed=")+e.what());}
}
void LanBrowser::startDiscovery(std::string address){
    auto target=loopbackOnly_?std::string("127.0.0.1"):address;
    auto next=std::make_unique<LanDiscovery>(true,LanDiscovery::defaultVersion,target);next->refresh();
    discovery_=std::move(next);discoveryAddress_=std::move(address);nextSearch_=GetTickCount64()+4000;
    selection_.clear();selected_=scroll_=0;error_.clear();
    log_.write(target.empty()?"lan_discovery_started=broadcast 255.255.255.255:6112":"lan_discovery_started=unicast "+target+":6112");
}
void LanBrowser::start(){try{startDiscovery(discoveryAddress_);}catch(const std::exception& e){discovery_.reset();error_="无法搜索局域网游戏。按 F5 重试。";log_.write(std::string("lan_discovery_failed=")+e.what());}}
void LanBrowser::editAddress(const UiInput& input,std::wstring_view characters){
    if((input.key==VK_ESCAPE && !input.keyRepeat) || click(addressCancel,input)){addressOpen_=false;return;}
    auto eraseSelection=[&]{if(!addressSelected_)return false;addressDraft_.clear();addressCursor_=0;addressSelected_=false;return true;};
    auto insert=[&](wchar_t c){
        eraseSelection();
        if(addressDraft_.size()>=addressLimit)return;
        addressDraft_.insert(addressCursor_++,1,c<=126?c:L'?');
    };
    if(click(addressEdit,input)){addressSelected_=false;addressCursor_=addressDraft_.size();}
    auto previous=addressDraft_;
    bool pasteFailed=false;
    auto paste=[&]{
        if(auto value=pasteAddress()){
            addressDraft_.clear();addressCursor_=0;addressSelected_=false;
            for(wchar_t c:*value)insert(c<32?L'?':c);
        }else pasteFailed=true;
    };
    if(input.control && input.key=='A' && characters.find(wchar_t(1))==characters.npos)addressSelected_=true;
    if(input.control && input.key=='V' && characters.find(wchar_t(22))==characters.npos)paste();
    if(input.key==VK_HOME || input.key==VK_END || input.key==VK_LEFT || input.key==VK_RIGHT){
        if(input.key==VK_HOME || (addressSelected_ && input.key==VK_LEFT))addressCursor_=0;
        else if(input.key==VK_END || (addressSelected_ && input.key==VK_RIGHT))addressCursor_=addressDraft_.size();
        else if(input.key==VK_LEFT && addressCursor_)--addressCursor_;
        else if(input.key==VK_RIGHT && addressCursor_<addressDraft_.size())++addressCursor_;
        addressSelected_=false;
    }
    if(input.key==VK_DELETE && !eraseSelection() && addressCursor_<addressDraft_.size())addressDraft_.erase(addressCursor_,1);
    for(wchar_t c:characters){
        if(c==1)addressSelected_=true;
        else if(c==22)paste();
        else if(c==8){if(!eraseSelection() && addressCursor_)addressDraft_.erase(--addressCursor_,1);}
        else if(c>=32)insert(c);
    }
    if(pasteFailed){addressError_="无法粘贴地址。";return;}
    if(previous!=addressDraft_)addressError_.clear();
    if((input.key==VK_RETURN && !input.keyRepeat) || click(addressSearch,input)){
        auto address=utf8(addressDraft_);
        if(!address.empty() && !parseLanDiscoveryAddress(address))addressError_="请输入有效的 IPv4 地址。";
        else if(loopbackOnly_ && !address.empty() && address!="127.0.0.1")addressError_="回环模式只允许 127.0.0.1。";
        else try{startDiscovery(std::move(address));log_.write("lan_discovery_address="+(discoveryAddress_.empty()?std::string("default"):discoveryAddress_));addressOpen_=false;return;}
        catch(const std::exception& e){addressError_="无法发送搜索，当前搜索设置已保留。";log_.write(std::string("lan_discovery_address_failed=")+e.what());}
    }
}
void LanBrowser::drawAddress(const UiInput& input){
    auto box=addressBox,edit=addressEdit;
    renderer_.rect(0,0,float(renderer_.width()),float(renderer_.height()),0xa6000000);
    const float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;
    auto quad=[&](GlueScreen::Rect r,DWORD color){renderer_.rect(left+r.x*scale,top+r.y*scale,r.w*scale,r.h*scale,color);};
    quad(box,0xff18202b);quad({box.x,box.y,box.w,.002f},0xff7f9abc);
    screen_.textAt("StandardInfoTextTemplate","按 IP 搜索",{.204f,.209f,.392f,.026f},true,false,true,.016f);
    screen_.textAt("StandardInfoTextTemplate",loopbackOnly_?"输入房主地址。留空使用本机回环。":"输入房主的 IPv4 地址。留空恢复自动搜索。",{.204f,.241f,.392f,.022f},true,false,true,.011f);
    screen_.backdropAt("StandardEditBoxBackdropTemplate",edit);
    if(addressSelected_ && !addressDraft_.empty())quad({edit.x+.006f,edit.y+.005f,edit.w-.012f,edit.h-.010f},0xff33527c);
    auto value=addressDraft_;if(!addressSelected_)value.insert(addressCursor_,1,L'|');
    screen_.textAt("StandardEditBoxTextTemplate",utf8(value),{edit.x+.009f,edit.y,edit.w-.018f,edit.h},true,false,true,.014f);
    if(!addressError_.empty())text_.draw(wide(addressError_),left+.204f*scale,top+.316f*scale,.012f*scale,0xffff8989);
    auto button=[&](GlueScreen::Rect bounds,const char* label){
        quad(bounds,hit(bounds,input.x,input.y)?0xff45668e:0xff304762);
        screen_.textAt("StandardInfoTextTemplate",label,bounds,true,false,false,.012f);
    };
    button(addressSearch,"搜索");button(addressCancel,"取消");
}
std::string LanBrowser::draw(const UiInput& rawInput,std::wstring_view characters,bool addressShortcut,bool roomModeShortcut){
    if(host_){auto action=host_->draw(rawInput,characters);if(action=="CancelButton"){host_.reset();start();}else if(action=="PrepareGame")return action;return {};}
    if(lobby_){
        auto action=lobby_->draw(rawInput,characters);
        bool rename=lobby_->needsDifferentPlayerName();
        if(rename)pollDiscovery();
        if(action=="CancelButton"){
            lobby_.reset();
            if(rename)nameFocus_=true;
            if(!rename || !discovery_)start();
        }else if(action=="PrepareGame")return action;
        return {};
    }
    const bool opened=!addressOpen_ && (addressShortcut || (rawInput.key==VK_F3 && !rawInput.keyRepeat && !rawInput.control && !rawInput.keyAlt) || click(addressButton,rawInput));
    if(opened){addressOpen_=true;addressError_.clear();addressDraft_=wide(discoveryAddress_);addressCursor_=addressDraft_.size();addressSelected_=true;}
    const bool addressInput=addressOpen_;
    if(addressInput && !opened)editAddress(rawInput,characters);
    auto input=addressInput?UiInput{}:rawInput;
    if(!addressInput && (roomModeShortcut || click(roomModeButton,input))){
        matchHandoffEnabled_=!matchHandoffEnabled_;
        selection_.clear();selected_=scroll_=0;
        log_.write(matchHandoffEnabled_?"lan_room_mode=playable":"lan_room_mode=classic");
        input={};
    }
    if(input.keyRepeat && (input.key==VK_ESCAPE || input.key==VK_RETURN || input.key==VK_F5))input.key=0;
    if(input.key==VK_ESCAPE)return "CancelButton";if(input.key==VK_F5)start();pollDiscovery();
    std::vector<LanGame> games;if(discovery_)for(auto& game:discovery_->games())if(game.name.starts_with(experimentalLanPrefix)==matchHandoffEnabled_)games.push_back(game);auto found=std::find_if(games.begin(),games.end(),[&](auto& item){return key(item)==selection_;});if(found==games.end()){selection_.clear();selected_=0;}else selected_=size_t(found-games.begin());auto list=screen_.bounds("GameListContainer"),name=screen_.bounds("PlayerNameEditBox");constexpr float step=.01875f;auto rows=std::max(1u,unsigned(std::max(0.f,list.h-.008f)/step));auto maximum=games.size()>rows?games.size()-rows:0;scroll_=std::min(scroll_,maximum);
    auto choose=[&](size_t index){if(index>=games.size())return;selected_=index;selection_=key(games[index]);if(index<scroll_)scroll_=index;if(index>=scroll_+rows)scroll_=index-rows+1;};
    if(click(name,input))nameFocus_=true;if(click(list,input))nameFocus_=false;if(input.key==VK_TAB)nameFocus_=!nameFocus_;if(nameFocus_ && !addressInput){for(wchar_t c:characters){if(c==8){highSurrogate_=0;if(!playerName_.empty()){if(playerName_.back()>=0xdc00 && playerName_.back()<=0xdfff && playerName_.size()>1)playerName_.pop_back();playerName_.pop_back();}}else if(c>=0xd800 && c<=0xdbff)highSurrogate_=c;else if(c>=0xdc00 && c<=0xdfff){if(highSurrogate_ && playerName_.size()+2<=31){playerName_+=highSurrogate_;playerName_+=c;}highSurrogate_=0;}else {highSurrogate_=0;if(c>=32 && playerName_.size()<31)playerName_+=c;}}}else if(!games.empty()){if(input.key==VK_UP)choose(selected_?selected_-1:0);if(input.key==VK_DOWN)choose(std::min(selected_+1,games.size()-1));if(input.key==VK_HOME)choose(0);if(input.key==VK_END)choose(games.size()-1);if(input.key==VK_PRIOR)choose(selected_>=rows?selected_-rows:0);if(input.key==VK_NEXT)choose(std::min(selected_+rows,games.size()-1));}
    bool activate=false;if(hit(list,input.x,input.y) && input.wheel)scroll_=size_t(std::clamp<long long>(static_cast<long long>(scroll_)-input.wheel*3ll,0,static_cast<long long>(maximum)));for(size_t row=0;row<rows && scroll_+row<games.size();++row){auto area=GlueScreen::Rect{list.x+.004f,list.y+.004f+float(row)*step,list.w-.0245f,step};if(click(area,input)){nameFocus_=false;choose(scroll_+row);activate=input.doubleClick;break;}}
    auto track=GlueScreen::Rect{list.x+list.w-.0205f,list.y+.004f,.0165f,list.h-.008f},up=GlueScreen::Rect{track.x,track.y,track.w,.015f},down=GlueScreen::Rect{track.x,track.y+track.h-.015f,track.w,.015f};float travel=track.h-.04f;if(click(up,input) && scroll_)--scroll_;if(click(down,input) && scroll_<maximum)++scroll_;auto trough=GlueScreen::Rect{track.x,track.y+.015f,track.w,track.h-.03f};if(maximum && travel>0 && input.down && hit(trough,input.startX,input.startY))scroll_=size_t(std::clamp((input.y-trough.y-.005f)/travel,0.f,1.f)*float(maximum)+.5f);
    if(selection_.empty()){screen_.setText("GameCreatorValue","");screen_.setText("GameSpeedValue","");}else{screen_.setText("GameCreatorValue",display(games[selected_].hostName));screen_.setText("GameSpeedValue","");}auto controls=input;if(nameFocus_)controls.key=0;std::set<std::string> enabled{"CancelButton"};if(!playerName_.empty())enabled.insert("CreateButton");if(!selection_.empty() && !playerName_.empty() && (!games[selected_].name.starts_with(experimentalLanPrefix) || games[selected_].slotsAvailable))enabled.insert("JoinButton");auto action=screen_.draw("LocalMultiplayerJoin",controls,enabled,true);if(!nameFocus_ && input.key==VK_RETURN && enabled.contains("JoinButton"))activate=true;if(action=="JoinButton")activate=true;screen_.backdropAt("StandardEditBoxBackdropTemplate",name);screen_.textAt("StandardEditBoxTextTemplate",utf8(playerName_),{name.x+.005f,name.y,name.w-.01f,name.h},true,false,true,.012f);screen_.backdropAt("StandardEditBoxBackdropTemplate",list);
    float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;auto quad=[&](GlueScreen::Rect r,DWORD color){renderer_.rect(left+r.x*scale,top+r.y*scale,r.w*scale,r.h*scale,color);};if(nameFocus_){quad({name.x,name.y,name.w,.001f},0xffffcc55);quad({name.x,name.y+name.h-.001f,name.w,.001f},0xffffcc55);}
    for(size_t row=0;row<rows && scroll_+row<games.size();++row){size_t index=scroll_+row;auto area=GlueScreen::Rect{list.x+.004f,list.y+.004f+float(row)*step,list.w-.0245f,step};if(!selection_.empty() && index==selected_)quad(area,0x9f344b6b);const auto& game=games[index];auto label=display(game.name)+(game.name.starts_with(experimentalLanPrefix)?"  (空位 "+std::to_string(game.slotsAvailable)+" / ":"  (槽位 ")+std::to_string(game.slotsTotal)+")";screen_.textAt("StandardInfoTextTemplate",label,area,true,!selection_.empty() && index==selected_,true,.013f);}
    screen_.backdropAt("StandardScrollBarBackdrop",track);screen_.backdropAt("StandardScrollBarIncButtonBackdrop",up);screen_.backdropAt("StandardScrollBarDecButtonBackdrop",down);screen_.backdropAt("StandardThumbButtonBackdrop",{track.x+.00325f,track.y+.015f+(maximum?float(scroll_)/float(maximum)*travel:0),.01f,.01f});
    if(!selection_.empty()){
        auto mapPathBounds=screen_.bounds("MapInfoPaneContainer");
        const float pathTop=roomModeButton.y+roomModeButton.h+.014f;
        mapPathBounds.h=std::max(0.f,mapPathBounds.y+mapPathBounds.h-pathTop-.008f);
        mapPathBounds.y=pathTop;
        screen_.textAt("StandardInfoTextTemplate",display(games[selected_].mapPath),mapPathBounds,true,false,true,.011f);
    }else if(games.empty() && discovery_)screen_.textAt("StandardInfoTextTemplate","正在搜索局域网游戏…",{list.x+.01f,list.y+.01f,list.w-.03f,.025f},true,false,true,.011f);
    if(!error_.empty())screen_.textAt("StandardInfoTextTemplate",error_,{.025f,.46f,.42f,.025f},true,false,true,.011f);
    quad(addressButton,hit(addressButton,input.x,input.y)?0xff45668e:0xff304762);
    screen_.textAt("StandardInfoTextTemplate","按 IP 搜索 (F3)",addressButton,true,false,false,.012f);
    auto targetLabel=loopbackOnly_?"本机回环 127.0.0.1":discoveryAddress_.empty()?std::string("自动搜索"):"搜索地址 "+discoveryAddress_;
    screen_.textAt("StandardInfoTextTemplate",targetLabel,{addressButton.x,addressButton.y+addressButton.h+.006f,addressButton.w,.023f},true,false,true,.011f);
    quad(roomModeButton,hit(roomModeButton,input.x,input.y)?0xff45668e:0xff304762);
    screen_.textAt("StandardInfoTextTemplate",matchHandoffEnabled_?"同构建对局 (F4)":"经典房间 (F4)",roomModeButton,true,false,false,.012f);
    screen_.overlay();
    if(addressOpen_)drawAddress(rawInput);
    if(addressInput)return {};
    if(action=="CreateButton" && enabled.contains("CreateButton")){try{auto hostPlayerName=utf8(playerName_);if(hostPlayerName.empty() || hostPlayerName.size()>15)error_="玩家名需为 1–15 字节。";else{host_=std::make_unique<LanHostUi>(archives_,images_,renderer_,text_,log_,std::move(hostPlayerName),loopbackOnly_);if(matchHandoffEnabled_)host_->enableMatchHandoff();discovery_.reset();error_.clear();}}catch(const std::exception& e){error_="无法打开建房界面。";log_.write(std::string("lan_host_ui_failed=")+e.what());}}if(activate && enabled.contains("JoinButton")){try{auto playerName=utf8(playerName_);if(playerName.empty() || playerName.size()>15)error_="玩家名需为 1–15 字节。";else{lobby_=std::make_unique<LanLobby>(archives_,images_,renderer_,text_,games[selected_],std::move(playerName));if(matchHandoffEnabled_)lobby_->enableMatchHandoff();error_.clear();}}catch(const std::exception& e){error_="无法连接所选房间。";log_.write(std::string("lan_join_failed=")+e.what());}}return action=="CancelButton"?action:std::string{};
}
}
