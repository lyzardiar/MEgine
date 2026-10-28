// Author: MiYu. Decode each map texture once, then upload bounded work on the render thread.
#include "scene_assets.h"
#include "model.h"
#include "model_sequence.h"
#include <algorithm>
#include <cctype>

namespace war3 {
namespace {std::string key(std::string value) {for(auto& c:value){if(c=='/')c='\\';c=char(std::tolower(static_cast<unsigned char>(c)));}return value;}}
SceneAssets::SceneAssets(Archives& resources,std::function<void()> check,std::set<std::string> externalTextures) : resources_(resources.fork()),images_(resources.root()),check_(std::move(check)),externalTextures_(std::move(externalTextures)) {}
SceneAssets::~SceneAssets()=default;
std::string SceneAssets::modelKey(std::string path) {return mdx::modelPath(std::move(path));}
void SceneAssets::prepareTexture(const std::string& path) {if(!externalTextures_.contains(key(path)))image(path);}
IDirect3DTexture9* SceneAssets::cachedTexture(const std::string& path) const {auto found=textures_.find(key(path));return found==textures_.end()?nullptr:found->second.Get();}
bool SceneAssets::hasImage(const std::string& path) const {return imagesCache_.contains(key(path));}
std::set<std::string> SceneAssets::textureNames() const {std::set<std::string> result;for(auto& [name,image]:imagesCache_)result.insert(name);return result;}
void SceneAssets::adopt(SceneAssets& incoming) {for(auto& [name,image]:incoming.imagesCache_)if(!imagesCache_.contains(name))this->image(name,std::move(image));for(auto& [name,model]:incoming.models_)if(!models_.contains(name)){if(models_.size()>=2048)throw std::runtime_error("Scene model count exceeds budget");models_.emplace(name,std::move(model));}}

const Image& SceneAssets::image(const std::string& path) {check();auto name=key(path);auto found=imagesCache_.find(name);if(found!=imagesCache_.end())return found->second;auto source=resources_->readTexture(path);if(!source)throw std::runtime_error("Missing scene texture: "+path);image(name,images_.decode(source->bytes));return imagesCache_.at(name);}
void SceneAssets::image(const std::string& name,Image image) {check();auto id=key(name);if(imagesCache_.contains(id))return;auto bytes=image.pixels.size()*sizeof(std::uint32_t);if(bytes>256*1024*1024-imageBytes_)throw std::runtime_error("Scene texture budget exceeded");imageBytes_+=bytes;imagesCache_.emplace(std::move(id),std::move(image));}
Model& SceneAssets::model(const std::string& path,Log& log) {check();auto name=modelKey(path);auto found=models_.find(name);if(found==models_.end()){if(models_.size()>=2048)throw std::runtime_error("Scene model count exceeds budget");auto model=std::make_unique<Model>(*resources_,images_,nullptr,name.c_str(),log,this);found=models_.emplace(std::move(name),std::move(model)).first;}return *found->second;}
IDirect3DTexture9* SceneAssets::texture(const std::string& path) const {auto found=textures_.find(key(path));if(found==textures_.end())throw std::runtime_error("Scene texture has not been uploaded: "+path);return found->second.Get();}
Model* SceneAssets::cachedModel(const std::string& path) const {auto name=modelKey(path);auto found=models_.find(name);return found==models_.end() || !readyModels_.contains(name)?nullptr:found->second.get();}
bool SceneAssets::uploadOne(Renderer& renderer) {for(auto& [name,image]:imagesCache_)if(!textures_.contains(name)){textures_[name]=renderer.texture(image.width,image.height,image.pixels);return true;}return false;}
void SceneAssets::ready(Renderer& renderer) {if(uploaded()!=uploadCount())throw std::runtime_error("Scene GPU upload is incomplete");for(auto& [name,model]:models_)if(!readyModels_.contains(name)){model->upload(renderer,*this);readyModels_.insert(name);}check_={};}
}
