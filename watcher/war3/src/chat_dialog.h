// Author: MiYu. Original in-game messaging dialog and local chat destinations.
#pragma once
#include "chat_channel.h"
#include "glue.h"
#include <optional>

namespace war3 {
class ScriptSession;
class ChatDialog {
    ScriptSession& session_;
    Renderer& renderer_;
    GlueScreen screen_;
    std::vector<unsigned> players_;
    std::string content_;
    size_t offset_=0;
    bool follow_=true;
public:
    ChatDialog(ScriptSession& session,Images& images,Renderer& renderer,Text& text);
    bool draw(const UiInput& input,ChatChannel& channel,std::optional<unsigned>& recipient);
};
}
