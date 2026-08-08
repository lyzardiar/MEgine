#include "Effekseer.h"

#include <algorithm>
#include <cmath>
#include <codecvt>
#include <cstdint>
#include <cstring>
#include <iterator>
#include <locale>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace
{
struct RawVertex
{
    float position[3];
    float uv[2];
    float color[4];
};

struct RawTriangle
{
    RawVertex vertices[3];
    int32_t blend;
    int32_t depthTest;
    const char* texture;
    int32_t textureLength;
    const char* maskTexture;
    int32_t maskTextureLength;
    const char* effect;
    int32_t effectLength;
};

struct RawModelInstance
{
    float origin[3];
    float axisX[3];
    float axisY[3];
    float axisZ[3];
    float color[4];
    int32_t time;
    float magnification;
    int32_t blend;
    int32_t depthTest;
    const char* texture;
    int32_t textureLength;
    const char* maskTexture;
    int32_t maskTextureLength;
    const char* model;
    int32_t modelLength;
    const char* effect;
    int32_t effectLength;
};

std::string utf8(const char16_t* value);

struct Vertex
{
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
    float u = 0.0f;
    float v = 0.0f;
    Effekseer::Color color{255, 255, 255, 255};
};

struct Triangle
{
    Vertex vertices[3];
    int32_t blend = 1;
    int32_t depthTest = 0;
    std::string_view texture;
    std::string_view maskTexture;
    std::string_view effect;
};

struct ModelInstance
{
    float origin[3]{};
    float axisX[3]{};
    float axisY[3]{};
    float axisZ[3]{};
    Effekseer::Color color{255, 255, 255, 255};
    int32_t time = 0;
    float magnification = 1.0f;
    int32_t blend = 1;
    int32_t depthTest = 0;
    std::string_view texture;
    std::string_view maskTexture;
    std::string_view model;
    std::string_view effect;
};

struct State
{
    Effekseer::ManagerRef manager;
    std::unordered_map<uint64_t, Effekseer::EffectRef> effects;
    std::unordered_map<const Effekseer::Effect*, std::string> references;
    std::unordered_set<std::string> strings;
    std::unordered_map<const char16_t*, std::string_view> paths;
    std::vector<Triangle> triangles;
    std::vector<ModelInstance> models;
    float cameraRight[3]{1.0f, 0.0f, 0.0f};
    float cameraUp[3]{0.0f, 1.0f, 0.0f};
    float cameraFront[3]{0.0f, 0.0f, -1.0f};
    float cameraPosition[3]{0.0f, 0.0f, 0.0f};
    uint64_t nextEffect = 1;

    std::string_view intern(std::string value)
    {
        return *strings.emplace(std::move(value)).first;
    }

    std::string_view path(const char16_t* value)
    {
        if (value == nullptr)
        {
            return {};
        }
        const auto found = paths.find(value);
        if (found != paths.end())
        {
            return found->second;
        }
        const auto resolved = intern(utf8(value));
        paths.emplace(value, resolved);
        return resolved;
    }
};

Effekseer::EffectRef findEffect(State* state, uint64_t id)
{
    if (state == nullptr)
    {
        return nullptr;
    }
    const auto found = state->effects.find(id);
    return found == state->effects.end() ? nullptr : found->second;
}

std::string utf8(const char16_t* value)
{
    if (value == nullptr)
    {
        return {};
    }
    std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
    return converter.to_bytes(value);
}

const char16_t* dependencyPath(const Effekseer::EffectRef& effect, int kind, int index)
{
    if (effect == nullptr || index < 0)
    {
        return nullptr;
    }
    switch (kind)
    {
    case 0: return effect->GetColorImagePath(index);
    case 1: return effect->GetNormalImagePath(index);
    case 2: return effect->GetDistortionImagePath(index);
    case 3: return effect->GetModelPath(index);
    case 4: return effect->GetMaterialPath(index);
    case 5: return effect->GetWavePath(index);
    case 6: return effect->GetCurvePath(index);
    default: return nullptr;
    }
}

std::string_view effectReference(State* state, Effekseer::Effect* effect)
{
    const auto found = state->references.find(effect);
    return found == state->references.end() ? std::string_view{} : found->second;
}

struct Style
{
    int32_t blend = 1;
    int32_t depthTest = 0;
    std::string_view texture;
    std::string_view maskTexture;
    std::string_view effect;
};

Style styleFor(State* state, Effekseer::Effect* effect, bool depthTest, Effekseer::NodeRendererBasicParameter* basic)
{
    Style style;
    style.depthTest = depthTest ? 1 : 0;
    style.effect = effectReference(state, effect);
    if (basic != nullptr)
    {
        style.blend = static_cast<int32_t>(basic->AlphaBlend);
        const auto colorIndex = basic->TextureIndexes[static_cast<size_t>(Effekseer::RendererTextureType::Color)];
        const auto alphaIndex = basic->TextureIndexes[static_cast<size_t>(Effekseer::RendererTextureType::Alpha)];
        if (effect != nullptr && colorIndex >= 0)
        {
            style.texture = state->path(effect->GetColorImagePath(colorIndex));
        }
        if (effect != nullptr && alphaIndex >= 0)
        {
            const auto alphaTexture = state->path(effect->GetColorImagePath(alphaIndex));
            if (style.texture.empty())
            {
                // Effekseer permits an alpha-only particle. Sampling that image
                // directly preserves its silhouette instead of drawing a solid quad.
                style.texture = alphaTexture;
            }
            else
            {
                style.maskTexture = alphaTexture;
            }
        }
        if (
            style.texture.empty() &&
            effect != nullptr &&
            basic->MaterialType == Effekseer::RendererMaterialType::File &&
            basic->MaterialRenderDataPtr != nullptr)
        {
            // Effekseer materials commonly put motion/dissolve noise first and
            // the visible silhouette second. Preserve that silhouette as the
            // deterministic fallback until the generic material graph is
            // compiled natively. Treating motion noise as an alpha mask makes
            // effects such as the official lightning samples nearly invisible.
            const auto& textures = basic->MaterialRenderDataPtr->MaterialTextures;
            const auto first = std::find_if(textures.begin(), textures.end(), [](const auto& texture) {
                return texture.Type == 0 && texture.Index >= 0;
            });
            if (first != textures.end())
            {
                const auto second = std::find_if(std::next(first), textures.end(), [](const auto& texture) {
                    return texture.Type == 0 && texture.Index >= 0;
                });
                if (second != textures.end())
                {
                    style.texture = state->path(effect->GetColorImagePath(second->Index));
                }
                else
                {
                    style.texture = state->path(effect->GetColorImagePath(first->Index));
                }
            }
        }
    }
    return style;
}

void copyColor(const Effekseer::Color& color, float output[4])
{
    output[0] = color.R / 255.0f;
    output[1] = color.G / 255.0f;
    output[2] = color.B / 255.0f;
    output[3] = color.A / 255.0f;
}

Effekseer::SIMD::Vec3f normalize(Effekseer::SIMD::Vec3f value, Effekseer::SIMD::Vec3f fallback)
{
    return value.GetSquaredLength() > 0.0000001f ? value.GetNormal() : fallback;
}

Effekseer::SIMD::Vec3f cameraVector(const float value[3])
{
    return {value[0], value[1], value[2]};
}

Effekseer::SIMD::Vec3f transformPoint(
    State* state,
    const Effekseer::SIMD::Mat43f& matrix,
    Effekseer::BillboardType billboard,
    const Effekseer::SIMD::Vec3f& direction,
    float x,
    float y,
    float z)
{
    if (billboard == Effekseer::BillboardType::Fixed)
    {
        return Effekseer::SIMD::Vec3f::Transform({x, y, z}, matrix);
    }

    Effekseer::SIMD::Vec3f scale;
    Effekseer::SIMD::Mat43f rotation;
    Effekseer::SIMD::Vec3f translation;
    matrix.GetSRT(scale, rotation, translation);
    auto right = cameraVector(state->cameraRight);
    auto up = cameraVector(state->cameraUp);
    auto front = -cameraVector(state->cameraFront);
    if (billboard == Effekseer::BillboardType::RotatedBillboard)
    {
        const float projectedLength = std::sqrt(std::max(
            0.0f,
            Effekseer::SIMD::Vec3f::Dot(rotation.Y, rotation.Y) -
                rotation.Y.GetZ() * rotation.Y.GetZ()));
        const float sine = projectedLength > 0.001f ? rotation.Y.GetX() / projectedLength : 0.0f;
        const float cosine = projectedLength > 0.001f ? rotation.Y.GetY() / projectedLength : 1.0f;
        const auto baseRight = right;
        const auto baseUp = up;
        right = baseRight * cosine + baseUp * sine;
        up = baseUp * cosine - baseRight * sine;
    }
    else if (billboard == Effekseer::BillboardType::YAxisFixed)
    {
        auto matrixUp = Effekseer::SIMD::Vec3f(matrix.X.GetY(), matrix.Y.GetY(), matrix.Z.GetY());
        up = normalize(matrixUp, up);
        right = normalize(Effekseer::SIMD::Vec3f::Cross(up, cameraVector(state->cameraFront)), right);
        front = normalize(Effekseer::SIMD::Vec3f::Cross(right, up), front);
    }
    else if (billboard == Effekseer::BillboardType::DirectionalBillboard)
    {
        up = normalize(direction, up);
        right = normalize(Effekseer::SIMD::Vec3f::Cross(up, cameraVector(state->cameraFront)), right);
        front = normalize(Effekseer::SIMD::Vec3f::Cross(right, up), front);
    }
    return translation + right * (x * scale.GetX()) + up * (y * scale.GetY()) + front * (z * scale.GetZ());
}

Vertex makeVertex(const Effekseer::SIMD::Vec3f& position, float u, float v, Effekseer::Color color)
{
    return {position.GetX(), position.GetY(), position.GetZ(), u, v, color};
}

void emitTriangle(State* state, const Vertex& a, const Vertex& b, const Vertex& c, const Style& style)
{
    Triangle triangle;
    triangle.vertices[0] = a;
    triangle.vertices[1] = b;
    triangle.vertices[2] = c;
    triangle.blend = style.blend;
    triangle.depthTest = style.depthTest;
    triangle.texture = style.texture;
    triangle.maskTexture = style.maskTexture;
    triangle.effect = style.effect;
    state->triangles.push_back(std::move(triangle));
}

void emitQuad(State* state, const Vertex& a, const Vertex& b, const Vertex& c, const Vertex& d, const Style& style)
{
    emitTriangle(state, a, b, c, style);
    emitTriangle(state, a, c, d, style);
}

class SpriteCapture final : public Effekseer::SpriteRenderer
{
    State* state_;

public:
    explicit SpriteCapture(State* state) : state_(state) {}

    void Rendering(const NodeParameter& parameter, const InstanceParameter& instance, void*) override
    {
        const auto style = styleFor(state_, parameter.EffectPointer, parameter.ZTest, parameter.BasicParameterPtr);
        Vertex vertices[4];
        for (int i = 0; i < 4; i++)
        {
            const auto position = transformPoint(
                state_, instance.SRTMatrix43, parameter.Billboard,
                instance.Direction,
                instance.Positions[i].GetX(), instance.Positions[i].GetY(), 0.0f);
            const bool right = i == 1 || i == 3;
            const bool upper = i >= 2;
            vertices[i] = makeVertex(
                position,
                instance.UV.X + (right ? instance.UV.Width : 0.0f),
                instance.UV.Y + (upper ? 0.0f : instance.UV.Height),
                instance.Colors[i]);
        }
        emitTriangle(state_, vertices[0], vertices[1], vertices[2], style);
        emitTriangle(state_, vertices[2], vertices[1], vertices[3], style);
    }
};

class RibbonCapture final : public Effekseer::RibbonRenderer
{
    State* state_;
    std::vector<InstanceParameter> instances_;

    std::pair<Effekseer::SIMD::Vec3f, Effekseer::SIMD::Vec3f> crossSection(
        const NodeParameter& parameter,
        const InstanceParameter& instance,
        const Effekseer::SIMD::Vec3f& trailDirection) const
    {
        if (!parameter.ViewpointDependent)
        {
            return {
                Effekseer::SIMD::Vec3f::Transform({instance.Positions[0], 0.0f, 0.0f}, instance.SRTMatrix43),
                Effekseer::SIMD::Vec3f::Transform({instance.Positions[1], 0.0f, 0.0f}, instance.SRTMatrix43)};
        }
        const auto center = instance.SRTMatrix43.GetTranslation();
        const auto scale = instance.SRTMatrix43.GetScale();
        const auto right = normalize(
            Effekseer::SIMD::Vec3f::Cross(trailDirection, cameraVector(state_->cameraFront)),
            cameraVector(state_->cameraRight));
        return {
            center - right * (instance.Positions[0] * scale.GetX()),
            center - right * (instance.Positions[1] * scale.GetX())};
    }

public:
    explicit RibbonCapture(State* state) : state_(state) {}

    void BeginRenderingGroup(const NodeParameter&, int32_t count, void*) override
    {
        instances_.clear();
        instances_.reserve(std::max(count, 0));
    }

    void Rendering(const NodeParameter&, const InstanceParameter& instance, void*) override
    {
        instances_.push_back(instance);
    }

    void EndRenderingGroup(const NodeParameter& parameter, int32_t, void*) override
    {
        if (instances_.size() < 2)
        {
            return;
        }
        const auto style = styleFor(state_, parameter.EffectPointer, parameter.ZTest, parameter.BasicParameterPtr);
        for (size_t i = 0; i + 1 < instances_.size(); i++)
        {
            const auto& current = instances_[i];
            const auto& next = instances_[i + 1];
            const auto direction = normalize(
                next.SRTMatrix43.GetTranslation() - current.SRTMatrix43.GetTranslation(),
                cameraVector(state_->cameraUp));
            const auto a = crossSection(parameter, current, direction);
            const auto b = crossSection(parameter, next, direction);
            const float v0 = i / static_cast<float>(instances_.size() - 1);
            const float v1 = (i + 1) / static_cast<float>(instances_.size() - 1);
            emitQuad(
                state_,
                makeVertex(a.first, current.UV.X, current.UV.Y + current.UV.Height * v0, current.Colors[0]),
                makeVertex(a.second, current.UV.X + current.UV.Width, current.UV.Y + current.UV.Height * v0, current.Colors[1]),
                makeVertex(b.second, next.UV.X + next.UV.Width, next.UV.Y + next.UV.Height * v1, next.Colors[3]),
                makeVertex(b.first, next.UV.X, next.UV.Y + next.UV.Height * v1, next.Colors[2]),
                style);
        }
    }
};

class RingCapture final : public Effekseer::RingRenderer
{
    State* state_;

public:
    explicit RingCapture(State* state) : state_(state) {}

    void Rendering(const NodeParameter& parameter, const InstanceParameter& instance, void*) override
    {
        const auto style = styleFor(state_, parameter.EffectPointer, parameter.ZTest, parameter.BasicParameterPtr);
        const int count = std::max(parameter.VertexCount, 3);
        const float outerRadius = instance.OuterLocation.GetX();
        const float innerRadius = instance.InnerLocation.GetX();
        const float centerRadius = innerRadius + (outerRadius - innerRadius) * instance.CenterRatio;
        const float outerHeight = instance.OuterLocation.GetY();
        const float innerHeight = instance.InnerLocation.GetY();
        const float centerHeight = innerHeight + (outerHeight - innerHeight) * instance.CenterRatio;
        const float start = (instance.ViewingAngleStart + 90.0f) * 3.14159265358979323846f / 180.0f;
        const float span = (instance.ViewingAngleEnd - instance.ViewingAngleStart) * 3.14159265358979323846f / 180.0f;
        for (int i = 0; i < count; i++)
        {
            const float t0 = i / static_cast<float>(count);
            const float t1 = (i + 1) / static_cast<float>(count);
            const float a0 = start + span * t0;
            const float a1 = start + span * t1;
            const auto point = [&](float angle, float radius, float height) {
                return transformPoint(
                    state_, instance.SRTMatrix43, parameter.Billboard,
                    instance.Direction,
                    std::cos(angle) * radius, std::sin(angle) * radius, height);
            };
            const float u0 = instance.UV.X + instance.UV.Width * t0;
            const float u1 = instance.UV.X + instance.UV.Width * t1;
            const float vOuter = instance.UV.Y;
            const float vCenter = instance.UV.Y + instance.UV.Height * instance.CenterRatio;
            const float vInner = instance.UV.Y + instance.UV.Height;
            emitQuad(
                state_,
                makeVertex(point(a0, outerRadius, outerHeight), u0, vOuter, instance.OuterColor),
                makeVertex(point(a1, outerRadius, outerHeight), u1, vOuter, instance.OuterColor),
                makeVertex(point(a1, centerRadius, centerHeight), u1, vCenter, instance.CenterColor),
                makeVertex(point(a0, centerRadius, centerHeight), u0, vCenter, instance.CenterColor),
                style);
            emitQuad(
                state_,
                makeVertex(point(a0, centerRadius, centerHeight), u0, vCenter, instance.CenterColor),
                makeVertex(point(a1, centerRadius, centerHeight), u1, vCenter, instance.CenterColor),
                makeVertex(point(a1, innerRadius, innerHeight), u1, vInner, instance.InnerColor),
                makeVertex(point(a0, innerRadius, innerHeight), u0, vInner, instance.InnerColor),
                style);
        }
    }
};

class TrackCapture final : public Effekseer::TrackRenderer
{
    State* state_;
    std::vector<InstanceParameter> instances_;

    float width(const InstanceParameter& instance) const
    {
        const float t = instance.InstanceCount > 1
            ? instance.InstanceIndex / static_cast<float>(instance.InstanceCount - 1)
            : 0.0f;
        return t < 0.5f
            ? instance.SizeFor + (instance.SizeMiddle - instance.SizeFor) * (t * 2.0f)
            : instance.SizeMiddle + (instance.SizeBack - instance.SizeMiddle) * ((t - 0.5f) * 2.0f);
    }

public:
    explicit TrackCapture(State* state) : state_(state) {}

    void BeginRenderingGroup(const NodeParameter&, int32_t count, void*) override
    {
        instances_.clear();
        instances_.reserve(std::max(count, 0));
    }

    void Rendering(const NodeParameter&, const InstanceParameter& instance, void*) override
    {
        instances_.push_back(instance);
    }

    void EndRenderingGroup(const NodeParameter& parameter, int32_t, void*) override
    {
        if (instances_.size() < 2)
        {
            return;
        }
        const auto style = styleFor(state_, parameter.EffectPointer, parameter.ZTest, parameter.BasicParameterPtr);
        for (size_t i = 0; i + 1 < instances_.size(); i++)
        {
            const auto& a = instances_[i];
            const auto& b = instances_[i + 1];
            const auto centerA = a.SRTMatrix43.GetTranslation();
            const auto centerB = b.SRTMatrix43.GetTranslation();
            const auto direction = normalize(centerB - centerA, cameraVector(state_->cameraUp));
            const auto right = normalize(
                Effekseer::SIMD::Vec3f::Cross(direction, cameraVector(state_->cameraFront)),
                cameraVector(state_->cameraRight));
            const float halfA = width(a) * a.SRTMatrix43.GetScale().GetX() * 0.5f;
            const float halfB = width(b) * b.SRTMatrix43.GetScale().GetX() * 0.5f;
            const auto leftA = centerA - right * halfA;
            const auto leftB = centerB - right * halfB;
            const auto rightA = centerA + right * halfA;
            const auto rightB = centerB + right * halfB;
            const float v0 = i / static_cast<float>(instances_.size() - 1);
            const float v1 = (i + 1) / static_cast<float>(instances_.size() - 1);
            emitQuad(
                state_,
                makeVertex(leftA, a.UV.X, a.UV.Y + a.UV.Height * v0, a.ColorLeft),
                makeVertex(centerA, a.UV.X + a.UV.Width * 0.5f, a.UV.Y + a.UV.Height * v0, a.ColorCenter),
                makeVertex(centerB, b.UV.X + b.UV.Width * 0.5f, b.UV.Y + b.UV.Height * v1, b.ColorCenter),
                makeVertex(leftB, b.UV.X, b.UV.Y + b.UV.Height * v1, b.ColorLeft),
                style);
            emitQuad(
                state_,
                makeVertex(centerA, a.UV.X + a.UV.Width * 0.5f, a.UV.Y + a.UV.Height * v0, a.ColorCenter),
                makeVertex(rightA, a.UV.X + a.UV.Width, a.UV.Y + a.UV.Height * v0, a.ColorRight),
                makeVertex(rightB, b.UV.X + b.UV.Width, b.UV.Y + b.UV.Height * v1, b.ColorRight),
                makeVertex(centerB, b.UV.X + b.UV.Width * 0.5f, b.UV.Y + b.UV.Height * v1, b.ColorCenter),
                style);
        }
    }
};

class ModelCapture final : public Effekseer::ModelRenderer
{
    State* state_;

public:
    explicit ModelCapture(State* state) : state_(state) {}

    void Rendering(const NodeParameter& parameter, const InstanceParameter& instance, void*) override
    {
        if (parameter.EffectPointer == nullptr || parameter.ModelIndex < 0)
        {
            return;
        }
        const auto style = styleFor(state_, parameter.EffectPointer, parameter.ZTest, parameter.BasicParameterPtr);
        ModelInstance model;
        const auto origin = transformPoint(state_, instance.SRTMatrix43, parameter.Billboard, instance.Direction, 0.0f, 0.0f, 0.0f);
        const auto x = transformPoint(state_, instance.SRTMatrix43, parameter.Billboard, instance.Direction, 1.0f, 0.0f, 0.0f);
        const auto y = transformPoint(state_, instance.SRTMatrix43, parameter.Billboard, instance.Direction, 0.0f, 1.0f, 0.0f);
        const auto z = transformPoint(state_, instance.SRTMatrix43, parameter.Billboard, instance.Direction, 0.0f, 0.0f, 1.0f);
        const auto store = [](const Effekseer::SIMD::Vec3f& value, float output[3]) {
            output[0] = value.GetX();
            output[1] = value.GetY();
            output[2] = value.GetZ();
        };
        store(origin, model.origin);
        store(x - origin, model.axisX);
        store(y - origin, model.axisY);
        store(z - origin, model.axisZ);
        model.color = instance.AllColor;
        model.time = instance.Time;
        model.magnification = parameter.Magnification * parameter.Maginification;
        model.blend = style.blend;
        model.depthTest = style.depthTest;
        model.texture = style.texture;
        model.maskTexture = style.maskTexture;
        model.model = state_->path(parameter.EffectPointer->GetModelPath(parameter.ModelIndex));
        model.effect = style.effect;
        state_->models.push_back(std::move(model));
    }
};

void copyVertex(const Vertex& input, RawVertex& output)
{
    output.position[0] = input.x;
    output.position[1] = input.y;
    output.position[2] = input.z;
    output.uv[0] = input.u;
    output.uv[1] = input.v;
    copyColor(input.color, output.color);
}

void copyTriangle(const Triangle& input, RawTriangle& output)
{
    for (int i = 0; i < 3; i++)
    {
        copyVertex(input.vertices[i], output.vertices[i]);
    }
    output.blend = input.blend;
    output.depthTest = input.depthTest;
    output.texture = input.texture.data();
    output.textureLength = static_cast<int32_t>(input.texture.size());
    output.maskTexture = input.maskTexture.data();
    output.maskTextureLength = static_cast<int32_t>(input.maskTexture.size());
    output.effect = input.effect.data();
    output.effectLength = static_cast<int32_t>(input.effect.size());
}

void copyModel(const ModelInstance& input, RawModelInstance& output)
{
    std::memcpy(output.origin, input.origin, sizeof(input.origin));
    std::memcpy(output.axisX, input.axisX, sizeof(input.axisX));
    std::memcpy(output.axisY, input.axisY, sizeof(input.axisY));
    std::memcpy(output.axisZ, input.axisZ, sizeof(input.axisZ));
    copyColor(input.color, output.color);
    output.time = input.time;
    output.magnification = input.magnification;
    output.blend = input.blend;
    output.depthTest = input.depthTest;
    output.texture = input.texture.data();
    output.textureLength = static_cast<int32_t>(input.texture.size());
    output.maskTexture = input.maskTexture.data();
    output.maskTextureLength = static_cast<int32_t>(input.maskTexture.size());
    output.model = input.model.data();
    output.modelLength = static_cast<int32_t>(input.model.size());
    output.effect = input.effect.data();
    output.effectLength = static_cast<int32_t>(input.effect.size());
}
} // namespace

extern "C"
{
void* mengine_effekseer_create(int maxInstances)
{
    auto state = new State();
    state->manager = Effekseer::Manager::Create(maxInstances > 0 ? maxInstances : 8000);
    if (state->manager == nullptr)
    {
        delete state;
        return nullptr;
    }
    state->manager->SetSpriteRenderer(Effekseer::MakeRefPtr<SpriteCapture>(state));
    state->manager->SetRibbonRenderer(Effekseer::MakeRefPtr<RibbonCapture>(state));
    state->manager->SetRingRenderer(Effekseer::MakeRefPtr<RingCapture>(state));
    state->manager->SetTrackRenderer(Effekseer::MakeRefPtr<TrackCapture>(state));
    state->manager->SetModelRenderer(Effekseer::MakeRefPtr<ModelCapture>(state));
    return state;
}

void mengine_effekseer_destroy(void* raw)
{
    delete static_cast<State*>(raw);
}

uint64_t mengine_effekseer_load_effect(void* raw, const uint8_t* data, int size, const char* reference, int referenceLength)
{
    auto state = static_cast<State*>(raw);
    if (state == nullptr || data == nullptr || size <= 0)
    {
        return 0;
    }
    auto effect = Effekseer::Effect::Create(state->manager, data, size);
    if (effect == nullptr)
    {
        return 0;
    }
    const auto id = state->nextEffect++;
    state->references[effect.Get()] = reference != nullptr && referenceLength > 0
        ? std::string(reference, static_cast<size_t>(referenceLength))
        : std::string{};
    state->paths.clear();
    state->effects.emplace(id, effect);
    return id;
}

void mengine_effekseer_release_effect(void* raw, uint64_t effect)
{
    auto state = static_cast<State*>(raw);
    if (state == nullptr)
    {
        return;
    }
    const auto found = state->effects.find(effect);
    if (found != state->effects.end())
    {
        state->references.erase(found->second.Get());
        state->effects.erase(found);
        state->paths.clear();
    }
}

int mengine_effekseer_play(void* raw, uint64_t effect, float x, float y, float z, int startFrame)
{
    auto state = static_cast<State*>(raw);
    auto resolved = findEffect(state, effect);
    return resolved == nullptr
        ? -1
        : state->manager->Play(resolved, Effekseer::Vector3D{x, y, z}, startFrame > 0 ? startFrame : 0);
}

void mengine_effekseer_update(void* raw, float deltaFrames)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr)
    {
        state->manager->Update(deltaFrames);
    }
}

int mengine_effekseer_capture(
    void* raw,
    const float* cameraRight,
    const float* cameraUp,
    const float* cameraFront,
    const float* cameraPosition,
    int cameraMask)
{
    auto state = static_cast<State*>(raw);
    if (state == nullptr)
    {
        return 0;
    }
    state->triangles.clear();
    state->models.clear();
    std::memcpy(state->cameraRight, cameraRight, sizeof(state->cameraRight));
    std::memcpy(state->cameraUp, cameraUp, sizeof(state->cameraUp));
    std::memcpy(state->cameraFront, cameraFront, sizeof(state->cameraFront));
    std::memcpy(state->cameraPosition, cameraPosition, sizeof(state->cameraPosition));
    Effekseer::Manager::DrawParameter parameter;
    parameter.CameraPosition = {cameraPosition[0], cameraPosition[1], cameraPosition[2]};
    parameter.CameraFrontDirection = {cameraFront[0], cameraFront[1], cameraFront[2]};
    parameter.CameraCullingMask = cameraMask;
    parameter.IsSortingEffectsEnabled = true;
    state->manager->Draw(parameter);
    return static_cast<int>(state->triangles.size());
}

int mengine_effekseer_triangle_count(void* raw)
{
    auto state = static_cast<State*>(raw);
    return state == nullptr ? 0 : static_cast<int>(state->triangles.size());
}

bool mengine_effekseer_triangle(void* raw, int index, RawTriangle* output)
{
    auto state = static_cast<State*>(raw);
    if (state == nullptr || output == nullptr || index < 0 || index >= static_cast<int>(state->triangles.size()))
    {
        return false;
    }
    copyTriangle(state->triangles[static_cast<size_t>(index)], *output);
    return true;
}

int mengine_effekseer_model_count(void* raw)
{
    auto state = static_cast<State*>(raw);
    return state == nullptr ? 0 : static_cast<int>(state->models.size());
}

bool mengine_effekseer_model(void* raw, int index, RawModelInstance* output)
{
    auto state = static_cast<State*>(raw);
    if (state == nullptr || output == nullptr || index < 0 || index >= static_cast<int>(state->models.size()))
    {
        return false;
    }
    copyModel(state->models[static_cast<size_t>(index)], *output);
    return true;
}

bool mengine_effekseer_exists(void* raw, int handle)
{
    auto state = static_cast<State*>(raw);
    return state != nullptr && state->manager->Exists(handle);
}

void mengine_effekseer_stop(void* raw, int handle)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->StopEffect(handle);
}

void mengine_effekseer_set_paused(void* raw, int handle, bool paused)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->SetPaused(handle, paused);
}

void mengine_effekseer_set_speed(void* raw, int handle, float speed)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->SetSpeed(handle, speed);
}

void mengine_effekseer_set_location(void* raw, int handle, float x, float y, float z)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->SetLocation(handle, x, y, z);
}

void mengine_effekseer_set_rotation(void* raw, int handle, float x, float y, float z)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->SetRotation(handle, x, y, z);
}

void mengine_effekseer_set_scale(void* raw, int handle, float x, float y, float z)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->SetScale(handle, x, y, z);
}

void mengine_effekseer_set_layer(void* raw, int handle, int layer)
{
    auto state = static_cast<State*>(raw);
    if (state != nullptr) state->manager->SetLayer(handle, layer);
}

int mengine_effekseer_dependency_count(void* raw, uint64_t effect, int kind)
{
    auto resolved = findEffect(static_cast<State*>(raw), effect);
    if (resolved == nullptr) return 0;
    switch (kind)
    {
    case 0: return resolved->GetColorImageCount();
    case 1: return resolved->GetNormalImageCount();
    case 2: return resolved->GetDistortionImageCount();
    case 3: return resolved->GetModelCount();
    case 4: return resolved->GetMaterialCount();
    case 5: return resolved->GetWaveCount();
    case 6: return resolved->GetCurveCount();
    default: return 0;
    }
}

int mengine_effekseer_dependency_path(void* raw, uint64_t effect, int kind, int index, char* output, int capacity)
{
    const auto path = dependencyPath(findEffect(static_cast<State*>(raw), effect), kind, index);
    if (path == nullptr) return -1;
    const auto value = utf8(path);
    const auto required = static_cast<int>(value.size());
    if (output != nullptr && capacity > required)
    {
        std::memcpy(output, value.data(), value.size());
        output[required] = '\0';
    }
    return required;
}
}
