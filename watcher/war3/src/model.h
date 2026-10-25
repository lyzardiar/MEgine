// Author: MiYu. Classic MDX animated scene rendering.
#pragma once
#include "archive.h"
#include "image.h"
#include "renderer.h"
namespace war3 {
class Model {
    struct Data;
    std::unique_ptr<Data> data_;
public:
    Model(Archives& archives, Images& images, Renderer* renderer, const char* name, Log& log);
    ~Model();
    Model(const Model&) = delete;
    Model& operator=(const Model&) = delete;
    void draw(std::uint64_t elapsed, float aspect, bool twoSided = false);
};
}
