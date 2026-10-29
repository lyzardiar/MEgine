// Author: MiYu. Map-owned CPU assets and shared texture/model GPU upload boundaries.
#pragma once
#include "archive.h"
#include "image.h"
#include "renderer.h"
#include <map>
#include <functional>
#include <set>

namespace war3 {
class Model;
class SceneAssets {
    std::unique_ptr<Archives> resources_;
    Images images_;
    std::map<std::string,Image> imagesCache_;
    std::map<std::string,Com<IDirect3DTexture9>> textures_;
    std::map<std::string,std::unique_ptr<Model>> models_;
    size_t imageBytes_=0;
    std::function<void()> check_;
    std::set<std::string> externalTextures_,readyModels_,missingModels_;
public:
    explicit SceneAssets(Archives& resources,std::function<void()> check={},std::set<std::string> externalTextures={});
    ~SceneAssets();
    Archives& resources() {return *resources_;}
    Images& decoder() {return images_;}
    const Image& image(const std::string& path);
    void image(const std::string& key,Image image);
    void prepareTexture(const std::string& path);
    static std::string modelKey(std::string path);
    Model& model(const std::string& path,Log& log);
    Model* cachedModel(const std::string& path) const;
    IDirect3DTexture9* texture(const std::string& path) const;
    IDirect3DTexture9* cachedTexture(const std::string& path) const;
    bool hasImage(const std::string& path) const;
    std::set<std::string> textureNames() const;
    void adopt(SceneAssets& incoming);
    bool uploadOne(Renderer& renderer);
    size_t uploadCount() const {return imagesCache_.size();}
    size_t uploaded() const {return textures_.size();}
    void ready(Renderer& renderer);
    void clearCheck() {check_={};}
    void check() const {if(check_)check_();}
};
}
