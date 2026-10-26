// Author: MiYu. Decode bounded resource batches off the window thread; transfer CPU assets before GPU upload.
#include "scene_streaming.h"

namespace war3 {
SceneStreaming::SceneStreaming(Archives& resources,Log& log) : archives_(resources.fork()),log_(log),worker_([this](std::stop_token stop){run(stop);}) {}
SceneStreaming::~SceneStreaming() {{std::lock_guard lock(mutex_);worker_.request_stop();}wake_.notify_one();}
void SceneStreaming::request(const std::vector<std::string>& models,const std::vector<std::string>& textures,std::set<std::string> knownTextures) {
    std::lock_guard lock(mutex_);knownTextures_=std::move(knownTextures);auto add=[&](const std::string& path,bool model){if(path.empty() || path=="_")return;auto key=(model?"model:":"texture:")+(model?SceneAssets::modelKey(path):path);if(requested_.contains(key))return;if(requested_.size()>=8192 || pending_.size()>=2048)throw std::runtime_error("Scene streaming queue exceeds budget");requested_.insert(std::move(key));pending_.push_back({path,model});};for(auto& path:models)add(path,true);for(auto& path:textures)add(path,false);wake_.notify_one();
}
std::optional<StreamedScene> SceneStreaming::poll() {std::lock_guard lock(mutex_);auto result=std::move(ready_);ready_.reset();wake_.notify_one();return result;}
void SceneStreaming::run(std::stop_token stop) {
    while(!stop.stop_requested()){std::vector<Request> batch;std::set<std::string> known;{std::unique_lock lock(mutex_);wake_.wait(lock,[&]{return stop.stop_requested() || (!pending_.empty() && !ready_);});if(stop.stop_requested())return;while(!pending_.empty() && batch.size()<8){batch.push_back(std::move(pending_.front()));pending_.pop_front();}known=knownTextures_;}StreamedScene result;
        try{auto assets=std::make_unique<SceneAssets>(*archives_,[&]{if(stop.stop_requested())throw std::runtime_error("Scene streaming canceled");},std::move(known));for(auto& request:batch){assets->check();if(request.model)assets->model(request.path,log_);else assets->prepareTexture(request.path);}assets->clearCheck();log_.write("scene_stream_cpu_ready requests="+std::to_string(batch.size())+" textures="+std::to_string(assets->uploadCount()));result.assets=std::move(assets);}catch(const std::exception& e){result.error=e.what();}std::lock_guard lock(mutex_);if(!stop.stop_requested())ready_=std::move(result);
    }
}
}
