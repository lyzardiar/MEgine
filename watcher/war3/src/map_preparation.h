// Author: MiYu. One background archive owner prepares the latest map selection.
#pragma once
#include "image.h"
#include "session.h"
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace war3 {
struct PreparedMap {
    std::uint64_t request=0;
    fs::path path;
    MapInfo info;
    std::optional<Image> preview;
    std::unique_ptr<ScriptSession> session;
    std::string error,previewError;
};
class MapPreparation {
    struct Request {std::uint64_t id;fs::path path;};
    fs::path dataRoot_;
    std::atomic<std::uint64_t> generation_=0;
    std::mutex mutex_;
    std::condition_variable wake_;
    std::optional<Request> pending_;
    std::optional<PreparedMap> ready_;
    std::jthread worker_;
    void run(std::stop_token stop);
public:
    explicit MapPreparation(fs::path dataRoot);
    ~MapPreparation();
    std::uint64_t request(fs::path path);
    void clear();
    std::optional<PreparedMap> poll();
};
}
