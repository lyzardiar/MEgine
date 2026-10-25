// Author: MiYu. Source FDF glue-screen layout, atlas borders and localized labels.
#pragma once
#include "fdf.h"
#include "media.h"
#include "image.h"
#include <set>

namespace war3 {
struct UiInput { float x=0,y=0,startX=0,startY=0; bool pressed=false,down=false; unsigned key=0; int wheel=0; bool doubleClick=false; };
class GlueScreen {
public:
    struct Rect { float x=0,y=0,w=.8f,h=.6f; };
private:
    struct Node { FrameDefinition frame; int parent=-1; Rect rect; unsigned mark=0; std::vector<unsigned> children; bool hidden=false; std::optional<Rect> placed; Com<IDirect3DTexture9> image; };
    struct Texture { Com<IDirect3DTexture9> gpu; unsigned width,height; };
    Archives& archives_;
    Images& images_;
    Renderer& renderer_;
    Text& text_;
    FrameDefinitions definitions_;
    std::vector<Node> nodes_;
    std::map<std::string,unsigned> names_;
    std::map<std::string,Texture> textures_;
    unsigned add(FrameDefinition frame, int parent);
    Rect layout(unsigned index);
    Texture& texture(const std::string& member);
    void quad(Rect rect, DWORD color, const std::string& member, float u0=0,float v0=0,float u1=1,float v1=1,bool tile=false,bool additive=false,bool transpose=false);
    void backdrop(const FrameDefinition& frame, Rect rect, DWORD color=0xffffffff);
    std::string drawNode(unsigned index,const UiInput& input,const std::set<std::string>& enabled);
    void label(const FrameDefinition& frame,Rect rect,bool enabled,bool highlighted);
    void relayout();
public:
    GlueScreen(Archives& archives,Images& images,Renderer& renderer,Text& text,const std::string& member,const std::string& root);
    std::pair<float,float> center(const std::string& name) const;
    std::string draw(const std::string& subtree,const UiInput& input,const std::set<std::string>& enabled);
    Rect bounds(const std::string& name) const;
    void attach(const std::string& member,const std::string& root,const std::string& container);
    void visible(const std::string& name,bool visible);
    void place(const std::string& name,Rect rect);
    void setText(const std::string& name,const std::string& text);
    void image(const std::string& name,const std::string& member);
    void image(const std::string& name,IDirect3DTexture9* texture);
    void backdropAt(const std::string& frame,Rect rect);
    void imageAt(const std::string& member,Rect rect);
    void textAt(const std::string& frame,const std::string& text,Rect rect,bool enabled=true,bool highlight=false,bool left=false);
};
}
