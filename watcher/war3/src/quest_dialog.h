// Author: MiYu. Source QuestDialog FDF consumes live session quests and objectives.
#pragma once
#include "session.h"
#include "glue.h"

namespace war3 {
class QuestDialog {
    ScriptSession& session_;
    Renderer& renderer_;
    GlueScreen screen_;
    std::array<std::vector<std::uint32_t>,2> lists_;
    std::array<size_t,2> scroll_{};
    size_t itemScroll_=0,textScroll_=0,textLines_=0,textVisible_=0;
    unsigned capacity_=3;
    std::uint32_t selected_=0,measured_=0;
    std::uint64_t revision_=UINT64_MAX;
    std::map<std::string,std::uint32_t> buttons_;
    GlueScreen::Rect descriptionBounds() const;
    void sync();
    bool navigate(unsigned key);
    bool scrollBar(const UiInput& input,GlueScreen::Rect container,size_t count,size_t visible,size_t& offset,float rightOffset=-.007f);
public:
    QuestDialog(ScriptSession& session,Images& images,Renderer& renderer,Text& text);
    bool draw(const UiInput& input);
};
}
