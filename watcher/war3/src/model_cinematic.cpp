// Author: MiYu. Play model sequences with source cameras and scene-specific sound labels.
#include "model_cinematic.h"
namespace war3 {
namespace {
std::string mdxPath(std::string path){auto extension=fs::path(wide(path)).extension().wstring();if(extension==L".mdl" || extension==L".MDL")path.replace(path.size()-4,4,".mdx");else if(extension!=L".mdx" && extension!=L".MDX")throw std::runtime_error("Invalid model cinematic source");return path;}
}
ModelCinematic::ModelCinematic(Archives& archives,Images& images,Renderer& renderer,Log& log,const std::string& source,bool muted) : model_(archives,images,&renderer,mdxPath(source).c_str(),log),sound_(archives) {
    auto count=model_.sequenceCount();if(!count || count!=model_.cameraCount() || count>4096)throw std::runtime_error("Model cinematic requires one camera for each sequence");SourceSettings config;config.load(archives,"UI\\MiscData.txt");auto section=utf8(fs::path(wide(source)).stem().wstring())+"Sounds";sound_.muted(muted);for(size_t i=0;i<count;++i){if(!model_.sequenceIndex(unsigned(i)))throw std::runtime_error("Missing cinematic sequence");auto duration=model_.sequenceDuration();if(!duration)throw std::runtime_error("Empty cinematic sequence");durations_.push_back(duration);labels_.push_back(config.value(section,"Scene"+std::to_string(i)));prepared_.push_back(labels_.back().empty()?nullptr:sound_.fromLabel(labels_.back(),false,false,false,0,0));}start_=GetTickCount64();select(0);log.write("model_cinematic_scenes="+std::to_string(count));
}
void ModelCinematic::select(size_t index){if(!model_.sequenceIndex(unsigned(index)) || !model_.cameraIndex(unsigned(index)))throw std::runtime_error("Missing model cinematic scene");scene_=index;if(prepared_[index]){if(playing_)sound_.stop(playing_,true,false);playing_=prepared_[index];sound_.start(playing_);}}
bool ModelCinematic::draw(float aspect){auto elapsed=GetTickCount64()-start_;while(elapsed-sceneStart_>=durations_[scene_]){sceneStart_+=durations_[scene_];if(scene_+1>=durations_.size())return false;select(scene_+1);}sound_.update();model_.draw(elapsed-sceneStart_,aspect,true,elapsed);return true;}
}
