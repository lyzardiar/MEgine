// Author: MiYu. Source FDF glue-screen layout, atlas borders and localized labels.
#pragma once
#include "fdf.h"
#include "media.h"
#include "image.h"
#include "map_ui.h"
#include <set>

namespace war3 {
struct UiInput { float x=0,y=0,startX=0,startY=0; bool pressed=false,down=false; unsigned key=0; int wheel=0; bool doubleClick=false,shift=false,control=false,keyRepeat=false,keyShift=false; };
class GlueScreen {
public:
    struct Rect { float x=0,y=0,w=.8f,h=.6f; };
    struct Choice {std::string text,image;};
    struct ChoiceChange {std::string frame;size_t index;};
private:
    struct Node { FrameDefinition frame; int parent=-1; Rect rect; unsigned mark=0; std::vector<unsigned> children; bool hidden=false; std::optional<Rect> placed; Com<IDirect3DTexture9> image; std::vector<Choice> choices;size_t selected=0;float menuWidth=0;bool literalChoices=false,choiceLabel=true; };
    struct Texture { Com<IDirect3DTexture9> gpu; unsigned width,height; };
    Archives& archives_;
    Images& images_;
    Renderer& renderer_;
    Text& text_;
    FrameDefinitions definitions_;
    std::vector<Node> nodes_;
    std::map<std::string,unsigned> names_;
    std::map<std::string,Texture> textures_;
    std::map<std::string,std::string> skinTextures_;
    std::optional<SourceSettings> skins_;
    std::string skinSection_="Default";
    std::string focused_;
    bool focusEnabled_=true;
    std::optional<unsigned> popup_;
    size_t popupFocus_=0;
    float popupX_=0,popupY_=0;
    std::optional<ChoiceChange> change_;
    bool consumed_=false;
    std::optional<FrameDefinition> menuTemplate_;
    unsigned add(FrameDefinition frame, int parent);
    Rect layout(unsigned index);
    Texture& texture(const std::string& member);
    void quad(Rect rect, DWORD color, const std::string& member, float u0=0,float v0=0,float u1=1,float v1=1,bool tile=false,bool additive=false,bool transpose=false);
    void backdrop(const FrameDefinition& frame, Rect rect, DWORD color=0xffffffff);
    std::string drawNode(unsigned index,const UiInput& input,const std::set<std::string>& enabled);
    void label(const FrameDefinition& frame,Rect rect,bool enabled,bool highlighted,size_t lineOffset=0);
    void relayout();
    void choiceControl(unsigned index,const UiInput& input,bool enabled);
    Rect menuBounds(unsigned index);
    const FrameDefinition& menuFrame(unsigned index);
    void popupInput(const UiInput& input);
    void openPopup(unsigned index,const UiInput& input);
public:
    GlueScreen(Archives& archives,Images& images,Renderer& renderer,Text& text,const std::string& member,const std::string& root);
    std::pair<float,float> center(const std::string& name) const;
    void focusEnabled(bool enabled) {focusEnabled_=enabled;if(!enabled)focused_.clear();}
    void skinSection(const std::string& section) {if(skinSection_!=section){skinSection_=section;skinTextures_.clear();}}
    std::string draw(const std::string& subtree,const UiInput& input,const std::set<std::string>& enabled,bool deferOverlay=false);
    Rect bounds(const std::string& name) const;
    void attach(const std::string& member,const std::string& root,const std::string& container,const std::string& context={});
    void focus(const std::string& name);
    const std::string& focus() const {return focused_;}
    bool popupOpen() const {return popup_.has_value();}
    void closePopup() {popup_.reset();}
    std::optional<Rect> popupBounds() {return popup_?std::optional<Rect>{menuBounds(*popup_)}:std::nullopt;}
    bool inputConsumed() const {return consumed_;}
    std::optional<ChoiceChange> takeChoice();
    void choices(const std::string& name,std::vector<Choice> values,size_t selected,float width=0,bool label=true);
    void overlay();
    std::string localized(const std::string& key) const {return definitions_.string(key);}
    void visible(const std::string& name,bool visible);
    void place(const std::string& name,Rect rect);
    void anchor(const std::string& name,const std::string& point,const std::string& relative,const std::string& target,float x,float y);
    void size(const std::string& name,float width,float height);
    float textWidth(const std::string& name,const std::string& text);
    void setText(const std::string& name,const std::string& text);
    void image(const std::string& name,const std::string& member);
    void image(const std::string& name,IDirect3DTexture9* texture);
    IDirect3DTexture9* image(const std::string& name) const {return nodes_.at(names_.at(name)).image.Get();}
    void backdropAt(const std::string& frame,Rect rect);
    void tooltipBackdrop(Rect rect);
    void imageAt(const std::string& member,Rect rect);
    void textAt(const std::string& frame,const std::string& text,Rect rect,bool enabled=true,bool highlight=false,bool left=false,float fontHeight=0,size_t lineOffset=0);
    void checkAt(const std::string& frame,Rect rect,bool checked);
    void highlightAt(const std::string& frame,Rect rect);
};
}
