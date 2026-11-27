// Author: MiYu. Shared scroll state for the host and guest lobby chat history.
#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <utility>
#include <vector>

namespace war3 {
class GlueScreen;
class Text;
struct LanChatMessage;
struct UiInput;

class LanLobbyChatHistory {
    using RowPosition=std::pair<std::uint64_t,std::size_t>;
    struct Row {RowPosition position;std::string text;};
    std::vector<Row> rows_;
    std::uint64_t oldest_=0,newest_=0;
    std::size_t top_=0;
    float width_=0,dragOffset_=0;
    bool follow_=true,focused_=false,dragging_=false;
    void update(Text& text,std::span<const LanChatMessage> messages,float width);
public:
    void draw(GlueScreen& screen,Text& text,std::span<const LanChatMessage> messages,const UiInput& input,bool acceptInput);
};
}
