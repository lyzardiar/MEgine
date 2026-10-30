// Author: MiYu. Original replay selection screen backed by a bounded user replay directory.
#pragma once
#include "glue.h"
#include "replay.h"
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace war3 {
struct ReplaySelection {fs::path path;std::shared_ptr<const Replay> replay;};
class ReplayBrowser {
    struct Entry {fs::path path;bool directory=false;};
    enum class Operation {Read,Remove};
    struct Request {Operation operation=Operation::Read;std::uint64_t request=0;fs::path path;std::string replayDigest,mapDigest;};
    struct Result {Operation operation=Operation::Read;std::uint64_t request=0;fs::path path;std::shared_ptr<const Replay> replay;std::string replayDigest,error;bool deleted=false,mapCleaned=true;};
    GlueScreen screen_;
    Renderer& renderer_;
    Log& log_;
    fs::path root_,directory_;
    std::vector<Entry> entries_;
    size_t selected_=0,scroll_=0;
    unsigned rows_=1;
    std::string error_;
    std::shared_ptr<const Replay> selectedReplay_;
    fs::path selectedPath_;
    bool loading_=false,confirmDelete_=false,deleting_=false,pendingPlay_=false;
    std::string selectedDigest_;
    std::uint64_t request_=0;
    std::atomic<std::uint64_t> generation_=0;
    std::mutex mutex_;
    std::condition_variable wake_;
    std::optional<Request> pending_;
    std::optional<Result> ready_;
    std::jthread worker_;
    void run(std::stop_token stop);
    void clearSelection();
    void enter(const fs::path& path);
    void choose(size_t index);
    void prepared();
    void removeSelected();
public:
    ReplayBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot);
    ~ReplayBrowser();
    std::string draw(const UiInput& input);
    std::optional<ReplaySelection> takeSelection();
    const std::string& error() const {return error_;}
};
}
