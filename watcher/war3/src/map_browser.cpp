// Author: MiYu. Source FDF/BLP menu controls and direct archive metadata, without conversion caches.
#include "map_browser.h"
#include <cmath>

namespace war3 {
namespace {
bool hit(GlueScreen::Rect r,float x,float y) {return x>=r.x && y>=r.y && x<r.x+r.w && y<r.y+r.h;}
bool click(GlueScreen::Rect r,const UiInput& i) {return i.pressed && hit(r,i.x,i.y) && hit(r,i.startX,i.startY);}
bool within(const fs::path& root,const fs::path& path) {auto parent=root.wstring(),child=path.wstring();if(CompareStringOrdinal(parent.c_str(),-1,child.c_str(),-1,TRUE)==CSTR_EQUAL)return true;if(parent.back()!=L'\\')parent+=L'\\';return child.size()>=parent.size() && CompareStringOrdinal(parent.c_str(),int(parent.size()),child.c_str(),int(parent.size()),TRUE)==CSTR_EQUAL;}
}
MapBrowser::MapBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot,const fs::path& preferred) : screen_(archives,images,renderer,text,"UI\\FrameDef\\Glue\\Skirmish.fdf","Skirmish"),source_(archives),players_(screen_),renderer_(renderer),images_(images),log_(log),root_(fs::canonical(dataRoot/L"Maps")) {
    itemFont_=source_.fontHeight("MapListBoxItem",.013f);playersFont_=source_.fontHeight("MapListBoxMaxPlayers",.009f);
    screen_.visible("AdvancedOptionsPanel",false);
    screen_.attach("UI\\FrameDef\\Glue\\MapListBox.fdf","MapListBox","MapListContainer");
    screen_.attach("UI\\FrameDef\\Glue\\MapInfoPane.fdf","MapInfoPane","MapInfoPaneContainer");
    screen_.focus("MapListBox");
    infoLayout();screen_.visible("MapInfoPane",false);auto initial=preferred.empty()?root_:preferred.parent_path();if(!within(root_,initial))root_=initial;enter(initial,preferred);
}
void MapBrowser::infoLayout() {
    auto pane=screen_.bounds("MapInfoPaneContainer");
    for(auto name:{"SuggestedPlayersLabel","SuggestedPlayersValue","MapSizeLabel","MapSizeValue","MapTilesetLabel","MapTilesetValue","MapDescLabel"})screen_.size(name,pane.w,screen_.bounds(name).h);
    screen_.size("MapDescValue",pane.w,.103125f);for(auto& a:mapInfoAnchors())screen_.anchor(a.frame,a.point,a.relative,a.target,a.x,a.y);
    auto icon=screen_.bounds("MaxPlayersIcon"),auth=screen_.bounds("AuthIcon");float width=std::min(info_?screen_.textWidth("MapNameValue",info_->name):0.f,pane.w-icon.w-auth.w);screen_.size("MapNameValue",width,screen_.bounds("MapNameValue").h);
    screen_.anchor("MaxPlayersIcon","TOPLEFT","MapInfoPane","TOP",-mapInfoTitleOffset(width,icon.w,auth.w,false),-.002f);screen_.visible("AuthIcon",false);
}
void MapBrowser::enter(const fs::path& path,const fs::path& preferred) {
    try {auto directory=fs::canonical(path);auto entries=mapDirectory(directory);if(directory!=root_)entries.insert(entries.begin(),{directory.parent_path(),true});directory_=std::move(directory);entries_=std::move(entries);headers_.clear();selected_=scroll_=0;info_.reset();players_.bind(nullptr);setup_.reset();error_.clear();screen_.visible("MapInfoPane",false);screen_.image("MinimapImage",nullptr);
        if(!preferred.empty()){auto found=std::find_if(entries_.begin(),entries_.end(),[&](auto& e){return !e.directory && CompareStringOrdinal(e.path.c_str(),-1,preferred.c_str(),-1,TRUE)==CSTR_EQUAL;});if(found!=entries_.end())select(size_t(found-entries_.begin()));}
        log_.write("map_directory="+utf8(directory_.wstring())+" entries="+std::to_string(entries_.size()));
    }catch(const std::exception& e){error_="无法打开地图文件夹。";log_.write(std::string("map_directory_error=")+e.what());}
}
void MapBrowser::select(size_t index) {
    if(index>=entries_.size() || (index==selected_ && info_ && error_.empty()))return;selected_=index;if(index<scroll_)scroll_=index;if(index>=scroll_+rows_)scroll_=index-rows_+1;info_.reset();players_.bind(nullptr);setup_.reset();error_.clear();screen_.visible("MapInfoPane",false);screen_.image("MinimapImage",nullptr);if(entries_[index].directory)return;
    try {Archive archive(entries_[index].path);auto w3i=archive.read("war3map.w3i");if(!w3i)throw std::runtime_error("Missing war3map.w3i");MapStrings strings;if(auto wts=archive.read("war3map.wts"))strings=mapStrings(*wts);auto info=MapInfo::parse(*w3i,strings);
        screen_.image("MinimapImage","UI\\Widgets\\Glues\\Minimap-Unknown.blp");
        try {auto bytes=archive.read("war3mapPreview.tga");if(!bytes)bytes=archive.read("war3mapMap.blp");if(bytes){auto image=images_.decode(*bytes);auto gpu=renderer_.texture(image.width,image.height,image.pixels);screen_.image("MinimapImage",gpu.Get());}}catch(const std::exception& e){log_.write(std::string("map_preview_unavailable=")+e.what());}
        screen_.setText("MapNameValue",info.name);screen_.setText("MaxPlayersValue",std::to_string(info.humanPlayers()));screen_.setText("SuggestedPlayersValue",info.recommendedPlayers);screen_.setText("MapSizeValue",source_.sizeName(info));screen_.setText("MapTilesetValue",source_.tilesetName(info.tileset));screen_.setText("MapDescValue",info.description);screen_.image("MaxPlayersIcon",info.flags&4?"UI\\Widgets\\Glues\\icon-file-melee.blp":"UI\\Widgets\\Glues\\icon-file-ums.blp");
        info_=std::move(info);infoLayout();setup_=std::make_unique<PlayerSetup>(*info_);players_.bind(setup_.get());screen_.visible("MapInfoPane",true);log_.write("map_selected="+utf8(entries_[index].path.wstring())+" name="+info_->name+" players="+std::to_string(info_->humanPlayers()));
    }catch(const std::exception& e){info_.reset();players_.bind(nullptr);setup_.reset();screen_.visible("MapInfoPane",false);screen_.image("MinimapImage",nullptr);error_="无法读取所选地图。请选择其他地图。";log_.write("map_selection_error="+utf8(entries_[index].path.wstring())+": "+e.what());}
}
fs::path MapBrowser::selectedMap() const {return info_ && selected_<entries_.size()?entries_[selected_].path:fs::path{};}
const MapHeader* MapBrowser::header(const fs::path& path) {auto found=headers_.find(path);if(found==headers_.end()){std::optional<MapHeader> h;try{h=MapHeader::read(path);}catch(const std::exception& e){log_.write("map_header_unavailable="+utf8(path.wstring())+": "+e.what());}found=headers_.emplace(path,std::move(h)).first;}return found->second?&*found->second:nullptr;}
std::pair<float,float> MapBrowser::selectedCenter() const {auto r=screen_.bounds("MapListContainer");return {r.x+r.w/2,r.y+.004f+(float(selected_)-float(scroll_)+.5f)*.01875f};}
std::string MapBrowser::draw(const UiInput& input) {
    auto r=screen_.bounds("MapListContainer");constexpr float step=.01875f;rows_=std::max(1u,unsigned((r.h-.008f)/step));auto maximum=entries_.size()>rows_?entries_.size()-rows_:0;
    if(scroll_>maximum)scroll_=maximum;
    auto choose=[&](size_t n){if(n>=entries_.size())return;select(n);if(selected_<scroll_)scroll_=selected_;if(selected_>=scroll_+rows_)scroll_=selected_-rows_+1;};
    bool blocked=screen_.popupOpen(),listFocus=screen_.focus()=="MapListBox";auto controls=input;if(listFocus && !blocked && (controls.key==VK_RETURN || controls.key==VK_SPACE))controls.key=0;
    auto track=GlueScreen::Rect{r.x+r.w-.0205f,r.y+.004f,.0165f,r.h-.008f};auto up=GlueScreen::Rect{track.x,track.y,track.w,.015f},down=GlueScreen::Rect{track.x,track.y+track.h-.015f,track.w,.015f};float travel=track.h-.04f;
    if(!blocked){players_.input(input);if(hit(r,input.x,input.y) && input.wheel)scroll_=size_t(std::clamp<long long>(static_cast<long long>(scroll_)-input.wheel*3ll,0,static_cast<long long>(maximum)));
        if(listFocus && !entries_.empty()){if(input.key==VK_UP)choose(selected_?selected_-1:0);if(input.key==VK_DOWN)choose(std::min(selected_+1,entries_.size()-1));if(input.key==VK_HOME)choose(0);if(input.key==VK_END)choose(entries_.size()-1);if(input.key==VK_PRIOR)choose(selected_>=rows_?selected_-rows_:0);if(input.key==VK_NEXT)choose(std::min(selected_+rows_,entries_.size()-1));}
        if(listFocus && input.key==VK_BACK && directory_!=root_)enter(directory_.parent_path());
        if(listFocus && input.key==VK_RETURN && selected_<entries_.size() && entries_[selected_].directory)enter(entries_[selected_].path);
        for(size_t row=0;row<rows_ && scroll_+row<entries_.size();++row){auto area=GlueScreen::Rect{r.x+.004f,r.y+.004f+float(row)*step,r.w-.0245f,step};if(click(area,input)){screen_.focus("MapListBox");size_t index=scroll_+row;auto entry=entries_[index];choose(index);if(entry.directory && input.doubleClick)enter(entry.path);break;}}
        maximum=entries_.size()>rows_?entries_.size()-rows_:0;if(scroll_>maximum)scroll_=maximum;
        if(click(up,input) && scroll_)--scroll_;if(click(down,input) && scroll_<maximum)++scroll_;
        auto trough=GlueScreen::Rect{track.x,track.y+.015f,track.w,track.h-.03f};if(maximum && input.down && hit(trough,input.startX,input.startY))scroll_=size_t(std::clamp((input.y-trough.y-.005f)/travel,0.f,1.f)*float(maximum)+.5f);
    }
    auto enabled=players_.enabled();enabled.insert("MapListBox");enabled.insert("CancelButton");auto action=screen_.draw("Skirmish",controls,enabled,true);players_.changed();
    screen_.backdropAt("MapListBoxBackdrop",r);
    float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;
    auto quad=[&](GlueScreen::Rect area,DWORD color){renderer_.rect(left+area.x*scale,top+area.y*scale,area.w*scale,area.h*scale,color);};
    for(size_t row=0;row<rows_ && scroll_+row<entries_.size();++row){size_t index=scroll_+row;auto area=GlueScreen::Rect{r.x+.004f,r.y+.004f+float(row)*step,r.w-.0245f,step};auto& entry=entries_[index];if(index==selected_)quad(area,0x9f344b6b);bool parent=entry.directory && entry.path==directory_.parent_path();auto h=entry.directory?nullptr:header(entry.path);auto name=parent?std::string(".."):h?h->name:utf8(entry.path.filename().wstring());if(info_ && index==selected_)name=info_->name;
        auto icon=GlueScreen::Rect{area.x,area.y,.01875f,.01875f};screen_.imageAt(entry.directory?(parent?"UI\\Widgets\\Glues\\icon-folder-up.blp":"UI\\Widgets\\Glues\\icon-folder.blp"):h?(h->flags&4?"UI\\Widgets\\Glues\\icon-file-melee.blp":"UI\\Widgets\\Glues\\icon-file-ums.blp"):"UI\\Widgets\\Glues\\icon-file.blp",icon);
        if(h)screen_.textAt("StandardSmallTextTemplate",std::to_string(h->players),icon,true,false,false,playersFont_);
        screen_.textAt("StandardInfoTextTemplate",name,{area.x+.022f,area.y,area.w-.022f,area.h},true,index==selected_,true,itemFont_);
    }
    screen_.backdropAt("StandardScrollBarBackdrop",track);screen_.backdropAt("StandardScrollBarIncButtonBackdrop",up);screen_.backdropAt("StandardScrollBarDecButtonBackdrop",down);
    auto thumb=GlueScreen::Rect{track.x+.00325f,track.y+.015f+(maximum?float(scroll_)/float(maximum)*travel:0),.01f,.01f};screen_.backdropAt("StandardThumbButtonBackdrop",thumb);
    auto title=directory_.lexically_relative(root_).wstring();if(title==L".")title=root_.filename().wstring();screen_.textAt("StandardSmallTextTemplate",utf8(title),{r.x,r.y+r.h+.004f,r.w,.016f},true,false,true);
    if(!error_.empty())screen_.textAt("StandardValueTextTemplate",error_,{.02f,.185f,.45f,.06f},true,false,true);
    players_.headings();screen_.overlay();return action=="CancelButton" || (input.key==VK_ESCAPE && !screen_.inputConsumed())?"CancelButton":std::string{};
}
}
