// Author: MiYu. Main-menu options consume the original FDF and the game's saved preferences.
#include "front_options.h"
#include <algorithm>
#include <cmath>

namespace war3 {
FrontOptions::FrontOptions(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& root)
    :screen_(archives,images,renderer,text,"UI\\FrameDef\\Glue\\OptionsMenu.fdf","OptionsMenu"),renderer_(renderer),log_(log),root_(root) {
    try{camera_=loadCameraPreferences(root_);}catch(const std::exception& e){cameraValid_=false;log_.write(std::string("camera_preferences_load_error=")+e.what());}
    try{audio_=loadAudioPreferences(root_);}catch(const std::exception& e){audioValid_=false;log_.write(std::string("audio_preferences_load_error=")+e.what());}
    try{video_=loadVideoPreferences(root_);}catch(const std::exception& e){videoValid_=false;log_.write(std::string("video_preferences_load_error=")+e.what());}
    originalCamera_=camera_;originalAudio_=audio_;originalVideo_=video_;renderer_.lightDetail(video_.lightDetail);
    for(auto name:{"CustomKeysCheckBox","CustomKeysLabel","AutosaveReplayCheckBox","AutosaveReplayLabel","GamePortLabel","GamePortEditBox","ChatSupportLabel","ChatSupportBackdrop","ProviderLabel","ProviderBackdrop","EnviroCheckBox","EnviroLabel","PositionalCheckBox","PositionalLabel"})screen_.visible(name,false);
    page(Page::Gameplay);
}
void FrontOptions::page(Page value) {
    page_=value;sliderDrag_.clear();screen_.closePopup();screen_.visible("GameplayPanel",value==Page::Gameplay);screen_.visible("VideoPanel",value==Page::Video);screen_.visible("SoundPanel",value==Page::Sound);
    if(value==Page::Video){auto choices=[&](const char* name,std::initializer_list<const char*> keys,unsigned selected){std::vector<GlueScreen::Choice> values;for(auto key:keys)values.push_back({screen_.localized(key),{}});screen_.choices(name,std::move(values),selected,.1775f);};choices("ParticlesMenu",{"LOW","MEDIUM","HIGH"},video_.particleDetail);choices("ShadowsMenu",{"OFF","LOW","HIGH"},video_.shadowDetail);choices("LightsMenu",{"LOW","MEDIUM","HIGH"},video_.lightDetail);choices("OcclusionMenu",{"OFF","ON"},video_.occlusion?1u:0u);}
}
std::string FrontOptions::draw(const UiInput& input) {
    if(input.key==VK_ESCAPE && !screen_.popupOpen())return "CancelButton";
    std::set<std::string> enabled{"GameplayButton","VideoButton","SoundButton","OKButton","CancelButton"};
    if(page_==Page::Gameplay){for(auto name:{"MouseScrollDisableCheckBox","KeyScrollSlider","TooltipsCheckBox","SubgroupCheckBox","FormationToggleCheckBox","HealthBarsCheckBox"})enabled.insert(name);if(camera_.edgeScroll)enabled.insert("MouseScrollSlider");}
    else if(page_==Page::Sound){for(auto name:{"SoundCheckBox","MusicCheckBox","AmbientCheckBox","MovementCheckBox","SubtitlesCheckBox","UnitCheckBox"})enabled.insert(name);if(audio_.sound)enabled.insert("SoundVolumeSlider");if(audio_.music)enabled.insert("MusicVolumeSlider");}
    else for(auto name:{"ParticlesMenu","ShadowsMenu","LightsMenu","OcclusionMenu"})enabled.insert(name);
    auto action=screen_.draw("OptionsControlLayer",input,enabled,true);bool consumed=screen_.inputConsumed();auto hit=[](const GlueScreen::Rect& r,float x,float y){return x>=r.x && y>=r.y && x<r.x+r.w && y<r.y+r.h;};
    auto check=[&](const char* name,const char* label,bool& value,bool inverted=false){auto box=screen_.bounds(name),text=screen_.bounds(label);bool clicked=!consumed && input.pressed && ((hit(box,input.x,input.y) && hit(box,input.startX,input.startY)) || (hit(text,input.x,input.y) && hit(text,input.startX,input.startY)));if(clicked){screen_.focus(name);value=!value;}else if(action==name)value=!value;screen_.checkAt(name,box,inverted?!value:value);};
    auto slider=[&](const char* name,unsigned& value,bool active){auto r=screen_.bounds(name);float thumb=std::min(.016f,r.w),travel=std::max(0.f,r.w-thumb);GlueScreen::Rect area{r.x-thumb/2,r.y-.004f,r.w+thumb,r.h+.008f};if(!consumed && active && sliderDrag_.empty() && hit(area,input.startX,input.startY) && (input.down || input.pressed)){sliderDrag_=name;screen_.focus(name);}if(sliderDrag_==name){if(!consumed && active && (input.down || input.pressed) && travel>0)value=unsigned(std::clamp(std::lround((input.x-r.x-thumb/2)*100.f/travel),0l,100l));if(!input.down)sliderDrag_.clear();}if(!consumed && active && screen_.focus()==name){if(input.key==VK_LEFT || input.key==VK_DOWN)value=value?value-1:0;else if(input.key==VK_RIGHT || input.key==VK_UP)value=std::min(100u,value+1);else if(input.key==VK_HOME)value=0;else if(input.key==VK_END)value=100;}screen_.backdropAt("StandardScrollBarBackdropTemplate",r);screen_.backdropAt(active?"StandardThumbButtonBackdropTemplate":"StandardThumbButtonDisabledBackdrop",{r.x+travel*float(value)/100,r.y+(r.h-.016f)/2,thumb,.016f});};
    if(page_==Page::Gameplay){check("MouseScrollDisableCheckBox","MouseScrollDisableLabel",camera_.edgeScroll,true);check("TooltipsCheckBox","TooltipsLabel",camera_.enhancedTooltips);check("SubgroupCheckBox","SubgroupLabel",camera_.subgroupModifier);check("FormationToggleCheckBox","FormationToggleLabel",camera_.formationMovement);check("HealthBarsCheckBox","HealthBarsLabel",camera_.healthBars);slider("MouseScrollSlider",camera_.mouseSpeed,camera_.edgeScroll);slider("KeyScrollSlider",camera_.keySpeed,true);}
    else if(page_==Page::Sound){check("SoundCheckBox","SoundVolumeLabel",audio_.sound);check("MusicCheckBox","MusicVolumeLabel",audio_.music);check("AmbientCheckBox","AmbientLabel",audio_.ambient);check("MovementCheckBox","MovementLabel",audio_.movement);check("SubtitlesCheckBox","SubtitlesLabel",audio_.subtitles);check("UnitCheckBox","UnitLabel",audio_.unitSounds);slider("SoundVolumeSlider",audio_.soundVolume,audio_.sound);slider("MusicVolumeSlider",audio_.musicVolume,audio_.music);}
    else if(auto choice=screen_.takeChoice()){if(choice->frame=="ParticlesMenu" && choice->index<3)video_.particleDetail=unsigned(choice->index);else if(choice->frame=="ShadowsMenu" && choice->index<3)video_.shadowDetail=unsigned(choice->index);else if(choice->frame=="LightsMenu" && choice->index<3)video_.lightDetail=unsigned(choice->index);else if(choice->frame=="OcclusionMenu" && choice->index<2)video_.occlusion=choice->index!=0;}
    if(!error_.empty())screen_.textAt("StandardInfoTextTemplate",error_,{.025f,.55f,.48f,.03f},true,false,true,.011f);screen_.overlay();
    if(action=="GameplayButton")page(Page::Gameplay);else if(action=="VideoButton")page(Page::Video);else if(action=="SoundButton")page(Page::Sound);else if(action=="OKButton"){
        bool saved=true;auto failed=[&](const char* kind,const std::exception& e){saved=false;log_.write(std::string(kind)+"_preferences_save_error="+e.what());};
        if(camera_!=originalCamera_){if(!cameraValid_)saved=false;else try{saveCameraPreferences(root_,camera_);originalCamera_=camera_;}catch(const std::exception& e){failed("camera",e);}}
        if(audio_!=originalAudio_){if(!audioValid_)saved=false;else try{saveAudioPreferences(root_,audio_);originalAudio_=audio_;}catch(const std::exception& e){failed("audio",e);}}
        if(video_!=originalVideo_){if(!videoValid_)saved=false;else try{saveVideoPreferences(root_,video_);originalVideo_=video_;renderer_.particleDetail(video_.particleDetail);renderer_.lightDetail(video_.lightDetail);}catch(const std::exception& e){failed("video",e);}}
        if(saved)return action;error_="无法保存部分设置，请检查用户设置文件与目录。";
    }else if(action=="CancelButton")return action;
    return {};
}
}
