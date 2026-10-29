// Author: MiYu. Source escape menus, script dialogs and observed match statistics consume one native session.
#pragma once
#include "game_loading.h"
#include "game_preferences.h"
#include "glue.h"
#include <functional>
#include <string_view>
#include <utility>

namespace war3 {
class GameFlowUi {
    GameData& data_;
    Renderer& renderer_;
    Text& text_;
    std::unique_ptr<GlueScreen> menu_,options_,dialog_,scores_;
    enum class Panel {Closed,Main,End,Quit,Help,Tips,Options,Gameplay,Sound,Video};
    Panel panel_=Panel::Closed;
    std::uint32_t dialogId_=0;
    std::uint64_t dialogRevision_=0;
    size_t dialogCapacity_=0,dialogScroll_=0,helpScroll_=0;
    unsigned scoreTab_=0,gameSpeedDraft_=50;
    std::array<int,4> scoreSort_{{-1,-1,-1,-1}};
    std::array<bool,4> scoreAscending_{};
    bool scoreTeams_=false;
    bool scoreSavePanel_=false,scoreReplaySaved_=false;
    wchar_t scoreReplayHigh_=0;
    std::wstring scoreReplayName_;
    std::string scoreModalFocus_="SaveReplayFileEditBox";
    std::string scoreReplayMessage_;
    std::function<std::pair<bool,std::string>(const std::wstring&)> scoreReplaySaver_;
    bool appExit_=false;
    std::optional<bool> networkLeave_;
    GameCameraPreferences cameraPreferences_{},cameraDraft_{};
    GameAudioPreferences audioPreferences_{},audioDraft_{};
    GameVideoPreferences videoPreferences_{},videoDraft_{};
    std::string sliderDrag_;
    std::vector<std::string> scoreModels_;
    std::array<std::array<std::string,25>,16> scoreCache_{};
    std::string helpText_,tipsText_;
    void menuPanel(Panel panel);
    void optionsPanel(Panel panel);
    void drawOptions(const UiInput& input,bool network,bool allowNetworkSubgroup);
    void prepareScores();
public:
    GameFlowUi(GameData& data,Renderer& renderer,Text& text) : data_(data),renderer_(renderer),text_(text) {}
    ~GameFlowUi();
    bool menuOpen() const {return panel_!=Panel::Closed;}
    void toggleMenu();
    bool scriptDialog() const;
    bool drawMenu(const UiInput& input,bool network=false,bool allowNetworkLeave=false);
    std::optional<bool> takeNetworkLeave(){auto result=networkLeave_;networkLeave_.reset();return result;}
    std::uint32_t drawDialog(const UiInput& input,bool interactive=true);
    bool drawScores(const UiInput& input,std::wstring_view characters={});
    void scoreReplaySaver(std::function<std::pair<bool,std::string>(const std::wstring&)> saver);
    bool appExit() const {return appExit_;}
    GameCameraPreferences cameraPreferences() const {return cameraPreferences_;}
    void cameraPreferences(GameCameraPreferences preferences) {if(preferences.mouseSpeed>100)preferences.mouseSpeed=100;if(preferences.keySpeed>100)preferences.keySpeed=100;cameraPreferences_=cameraDraft_=preferences;}
    GameAudioPreferences audioPreferences() const {return audioPreferences_;}
    void audioPreferences(GameAudioPreferences preferences) {if(preferences.soundVolume>100)preferences.soundVolume=100;if(preferences.musicVolume>100)preferences.musicVolume=100;audioPreferences_=audioDraft_=preferences;}
    GameVideoPreferences videoPreferences() const {return videoPreferences_;}
    void videoPreferences(GameVideoPreferences preferences) {if(preferences.particleDetail>2)preferences.particleDetail=2;videoPreferences_=videoDraft_=preferences;}
    const std::vector<std::string>& scoreModels();
};
}
