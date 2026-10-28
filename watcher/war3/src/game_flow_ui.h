// Author: MiYu. Source escape menus, script dialogs and observed match statistics consume one native session.
#pragma once
#include "game_loading.h"
#include "game_preferences.h"
#include "glue.h"

namespace war3 {
class GameFlowUi {
    GameData& data_;
    Renderer& renderer_;
    Text& text_;
    std::unique_ptr<GlueScreen> menu_,options_,dialog_,scores_;
    enum class Panel {Closed,Main,End,Quit,Help,Tips,Options,Gameplay,Sound};
    Panel panel_=Panel::Closed;
    std::uint32_t dialogId_=0;
    std::uint64_t dialogRevision_=0;
    size_t dialogCapacity_=0,dialogScroll_=0,helpScroll_=0;
    unsigned scoreTab_=1;
    bool appExit_=false,edgeScrollEnabled_=true,edgeScrollDraft_=true;
    GameAudioPreferences audioPreferences_{},audioDraft_{};
    std::string sliderDrag_;
    std::vector<std::string> scoreModels_;
    std::string helpText_,tipsText_;
    void menuPanel(Panel panel);
    void optionsPanel(Panel panel);
    void drawOptions(const UiInput& input);
    void prepareScores();
public:
    GameFlowUi(GameData& data,Renderer& renderer,Text& text) : data_(data),renderer_(renderer),text_(text) {}
    ~GameFlowUi();
    bool menuOpen() const {return panel_!=Panel::Closed;}
    void toggleMenu();
    bool scriptDialog() const;
    bool drawMenu(const UiInput& input,bool network=false);
    void drawDialog(const UiInput& input,bool network=false);
    bool drawScores(const UiInput& input);
    bool appExit() const {return appExit_;}
    bool edgeScrollEnabled() const {return edgeScrollEnabled_;}
    void edgeScrollEnabled(bool enabled) {edgeScrollEnabled_=edgeScrollDraft_=enabled;}
    GameAudioPreferences audioPreferences() const {return audioPreferences_;}
    void audioPreferences(GameAudioPreferences preferences) {if(preferences.soundVolume>100)preferences.soundVolume=100;if(preferences.musicVolume>100)preferences.musicVolume=100;audioPreferences_=audioDraft_=preferences;}
    const std::vector<std::string>& scoreModels();
};
}
