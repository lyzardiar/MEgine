// Author: MiYu. Runtime FDF frame ownership and inherited visibility.
#pragma once
#include "fdf.h"
#include <array>
#include <memory>
#include <span>

namespace war3 {
struct MapFramePoint {std::uint32_t point=0;float x=0,y=0;};
struct MapFrameRect {float x=0,y=0,w=0,h=0;};
MapFrameRect solveMapFramePoints(float width,float height,std::span<const MapFramePoint> points);
MapFrameRect solveSimpleFrameAnchor(MapFrameRect parent,float width,float height,std::string_view point,float x,float y);
MapFrameRect commandButtonRect(int row,int column);
MapFrameRect intersectMapFrameRects(MapFrameRect a,MapFrameRect b);
std::uint64_t mapFrameAnimationTime(std::uint64_t elapsed,std::uint64_t duration,bool loop,float offset);
std::uint32_t modulateMapFrameAlpha(std::uint32_t color,std::uint8_t alpha);
class MapFrames {
public:
    struct Anchor {std::uint32_t point=0,target=0,targetPoint=0;float x=0,y=0;};
    struct Node {std::uint32_t id=0,parent=0,context=0;FrameDefinition definition;bool visible=true;std::vector<std::uint32_t> children;std::map<std::uint32_t,Anchor> anchors;std::optional<float> width,height;std::optional<std::uint32_t> textColor;std::optional<std::uint8_t> alpha;size_t dynamicTextBytes=0,dynamicTextureBytes=0;bool standardInfo=false,anchorsCleared=false;std::int32_t level=0;bool enabled=true,model2=false,viewport=false;std::string model;std::optional<unsigned> modelTeamColor;std::optional<std::array<float,3>> cameraSource,cameraTarget;std::optional<double> animationStart;bool animationLoop=false;float animationOffset=0,modelSize=1;std::array<float,9> modelMatrix{1,0,0,0,1,0,0,0,1};std::array<float,3> modelOffset{};std::map<std::uint32_t,std::string> modelTextures;};
private:
    std::shared_ptr<FrameDefinitions> definitions_;
    std::map<std::uint32_t,Node> nodes_;
    std::map<std::pair<std::uint32_t,std::string>,std::vector<std::uint32_t>> names_;
    std::array<std::uint32_t,12> commandButtons_{};
    std::array<std::uint32_t,6> itemButtons_{};
    std::array<std::uint32_t,8> infoPanels_{};
    std::uint32_t portrait_=0;
    std::uint32_t next_=2;
    std::uint64_t revision_=0;
    size_t textBytes_=0,textureBytes_=0;
    std::uint32_t add(FrameDefinition definition,std::uint32_t parent,std::uint32_t context,unsigned depth);
    void requireMutable(std::uint32_t id) const;
    bool supportedStandardInfo(const Node& frame) const;
    void multiplyModelMatrix(std::uint32_t id,const std::array<float,9>& value);
public:
    explicit MapFrames(std::shared_ptr<FrameDefinitions> definitions);
    std::uint32_t root() const {return 1;}
    const std::shared_ptr<FrameDefinitions>& definitions() const {return definitions_;}
    const Node& node(std::uint32_t id) const;
    bool contains(std::uint32_t id) const {return nodes_.contains(id);}
    std::uint32_t resolveReference(std::uint32_t source,const std::string& name) const;
    std::uint32_t findSimple(const std::string& name,std::uint32_t context,std::string_view type) const;
    std::uint32_t commandButton(unsigned row,unsigned column);
    std::uint32_t existingCommandButton(unsigned row,unsigned column) const;
    bool isCommandButton(std::uint32_t id) const;
    std::uint32_t itemButton(unsigned slot);
    std::uint32_t existingItemButton(unsigned slot) const;
    std::uint32_t portrait();
    bool portraitVisible() const;
    bool isItemButton(std::uint32_t id) const;
    void installStandardInfo();
    std::uint32_t standardInfo(unsigned context,const std::string& name) const;
    std::optional<MapFrameRect> standardInfoRect(std::uint32_t id,MapFrameRect fallback) const;
    std::uint32_t create(const std::string& name,std::uint32_t parent,std::uint32_t context=0);
    std::uint32_t createSimple(const std::string& name,std::uint32_t parent,std::uint32_t context=0);
    std::uint32_t createByType(const std::string& type,const std::string& name,std::uint32_t parent,const std::string& inherits,std::uint32_t context=0);
    void destroy(std::uint32_t id);
    void destroySimple(std::uint32_t id);
    void setPoint(std::uint32_t id,std::uint32_t point,std::uint32_t target,std::uint32_t targetPoint,float x,float y);
    void clearPoints(std::uint32_t id);
    void setSize(std::uint32_t id,std::optional<float> width,std::optional<float> height);
    void setText(std::uint32_t id,std::string text);
    void setTexture(std::uint32_t id,std::string name,bool tiled);
    std::string text(std::uint32_t id) const;
    void setTextColor(std::uint32_t id,std::uint32_t color);
    std::uint32_t textColor(std::uint32_t id) const;
    void setAlpha(std::uint32_t id,std::uint8_t alpha);
    std::uint8_t alpha(std::uint32_t id) const;
    void setLevel(std::uint32_t id,std::int32_t level);
    std::vector<std::uint32_t> orderedChildren(std::uint32_t id) const;
    void enable(std::uint32_t id,bool value);
    bool enabled(std::uint32_t id) const;
    void setModel(std::uint32_t id,std::string_view path);
    std::uint32_t addModel(std::uint32_t parent);
    void setModel2(std::uint32_t id,std::string_view path,unsigned teamColor);
    void setModelCamera(std::uint32_t id,bool source,std::array<float,3> position);
    void setAnimation(std::uint32_t id,std::uint32_t animation,bool loop,double now);
    void setAnimationOffset(std::uint32_t id,float offset);
    void setModelSize(std::uint32_t id,float value);
    void setModelScale(std::uint32_t id,std::array<float,3> value);
    void rotateModel(std::uint32_t id,unsigned axis,float degrees);
    void setModelOffset(std::uint32_t id,float x,float y);
    void setModelOffsetAxis(std::uint32_t id,unsigned axis,float value);
    void setModelTexture(std::uint32_t id,std::uint32_t replacement,std::string_view path);
    void setViewport(std::uint32_t id,bool enabled);
    void visible(std::uint32_t id,bool value);
    bool visible(std::uint32_t id) const;
    size_t size() const {return nodes_.size();}
    std::uint64_t revision() const {return revision_;}
};
}
