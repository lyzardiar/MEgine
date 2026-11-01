// Author: MiYu. Browse local manual checkpoints with the source single-player load screen.
#pragma once
#include "glue.h"
#include "session.h"
#include <condition_variable>
#include <thread>

namespace war3 {
struct SavedGameSelection {std::string name;fs::path map;RecoveryCheckpointInfo checkpoint;MapInfo info;};
class SavedGameBrowser {
    GlueScreen screen_;
    Renderer& renderer_;
    Log& log_;
    std::vector<std::wstring> files_;
    size_t selected_=0,scroll_=0;
    std::string error_,previewError_;
    std::unique_ptr<Archives> resources_;
    std::mutex mutex_;
    std::condition_variable wake_;
    std::uint64_t generation_=0;
    struct Request {std::uint64_t id=0;std::string name;std::stop_token stop;};
    std::optional<Request> pending_;
    std::stop_source cancel_;
    struct Result {std::uint64_t request=0;std::optional<SavedGameSelection> value;std::string error;};
    std::optional<Result> ready_;
    std::optional<SavedGameSelection> preview_;
    bool requested_=false,loading_=false,openWhenReady_=false;
    std::jthread worker_;
    void run(std::stop_token stop);
    void prepared();
    void select(size_t index,size_t rows);
public:
    SavedGameBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot);
    std::string draw(const UiInput& input);
    ~SavedGameBrowser();
    std::optional<SavedGameSelection> selected() const;
};
}
