// Author: MiYu. Original message-log dialog displays the local session history.
#pragma once
#include "session.h"
#include "glue.h"

namespace war3 {
class MessageLog {
    ScriptSession& session_;
    Renderer& renderer_;
    GlueScreen screen_;
    std::string content_;
    size_t offset_=0;
    bool follow_=true;
public:
    MessageLog(ScriptSession& session,Images& images,Renderer& renderer,Text& text);
    bool draw(const UiInput& input);
};
}
