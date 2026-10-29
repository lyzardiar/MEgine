// Author: MiYu. Device-independent classic MDX surface geometry and skeletal animation.
#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <string>

namespace war3 {
class WalkableGeometry {
    struct Data;
    std::unique_ptr<Data> data_;
    explicit WalkableGeometry(std::unique_ptr<Data> data);
public:
    ~WalkableGeometry();
    WalkableGeometry(const WalkableGeometry&)=delete;
    WalkableGeometry& operator=(const WalkableGeometry&)=delete;
    static std::unique_ptr<WalkableGeometry> read(std::span<const std::uint8_t> bytes);
    std::uint64_t sequenceDuration(const std::string& sequence) const;
    std::optional<float> verticalSurface(float x,float y,const std::array<float,3>& position,const std::array<float,3>& scale,float angle,const std::string& sequence,std::uint64_t elapsed,std::uint64_t clock) const;
};
}
