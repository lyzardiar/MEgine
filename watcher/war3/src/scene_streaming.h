// Author: MiYu. Session-owned background decode queue for models and textures created during play.
#pragma once
#include "scene_assets.h"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>

namespace war3 {
struct StreamedScene {std::unique_ptr<SceneAssets> assets;std::string error;};
class SceneStreaming {
    struct Request {std::string path;bool model;};
    std::unique_ptr<Archives> archives_;
    Log& log_;
    std::mutex mutex_;
    std::condition_variable wake_;
    std::deque<Request> pending_;
    std::set<std::string> requested_,knownTextures_;
    std::optional<StreamedScene> ready_;
    std::jthread worker_;
    void run(std::stop_token stop);
public:
    SceneStreaming(Archives& resources,Log& log);
    ~SceneStreaming();
    void request(const std::vector<std::string>& models,const std::vector<std::string>& textures,std::set<std::string> knownTextures);
    std::optional<StreamedScene> poll();
};
}
