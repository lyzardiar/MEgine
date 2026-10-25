// Author: MiYu. Render original glue definitions in Warcraft's 0.8 by 0.6 UI space.
#include "glue.h"
#include <cmath>
#include <cwctype>
#include <charconv>

namespace war3 {
namespace {
float number(const std::string& value) { size_t end=0;auto n=std::stof(value,&end);if(end<value.size() && value[end]=='f')++end;if(!std::isfinite(n) || end!=value.size())throw std::runtime_error("Invalid glue coordinate");return n; }
std::pair<float,float> point(const std::string& name) { float x=name.find("LEFT")!=std::string::npos?0.f:name.find("RIGHT")!=std::string::npos?1.f:.5f;float y=name.find("TOP")!=std::string::npos?0.f:name.find("BOTTOM")!=std::string::npos?1.f:.5f;return {x,y}; }
std::string first(const FrameDefinition& f,const std::string& key) {auto& p=f.property(key);return p.empty()?std::string{}:p.front();}
DWORD rgba(const std::vector<std::string>& values,DWORD fallback) {if(values.size()!=3 && values.size()!=4)return fallback;auto b=[&](unsigned i){return DWORD(std::clamp(number(values[i]),0.f,1.f)*255+.5f);};return ((values.size()==4?b(3):255)<<24)|(b(0)<<16)|(b(1)<<8)|b(2);}
std::string plain(std::string value) {std::string result;for(size_t i=0;i<value.size();){if(value[i]=='|' && i+1<value.size()){char c=value[i+1];if((c=='c'||c=='C') && i+10<=value.size()){unsigned n;auto [end,error]=std::from_chars(value.data()+i+2,value.data()+i+10,n,16);if(error==std::errc{} && end==value.data()+i+10){i+=10;continue;}}if(c=='r'||c=='R'){i+=2;continue;}if(c=='n'||c=='N'){result+='\n';i+=2;continue;}}result+=value[i++];}return result;}
}
GlueScreen::GlueScreen(Archives& archives,Images& images,Renderer& renderer,Text& text,const std::string& member,const std::string& root) : archives_(archives),images_(images),renderer_(renderer),text_(text) {
    definitions_.load(archives,"UI\\FrameDef\\GlobalStrings.fdf");definitions_.load(archives,member);add(definitions_.frame(root),-1);
    relayout();
}
unsigned GlueScreen::add(FrameDefinition frame,int parent) {unsigned index=static_cast<unsigned>(nodes_.size());auto children=std::move(frame.children);frame.children.clear();names_.try_emplace(frame.name,index);nodes_.push_back({std::move(frame),parent,{ },0,{ }});for(auto& child:children){auto id=add(std::move(child),int(index));nodes_[index].children.push_back(id);}return index;}
GlueScreen::Rect GlueScreen::layout(unsigned index) {
    auto& n=nodes_.at(index);if(n.mark==2)return n.rect;if(n.mark==1)throw std::runtime_error("Cyclic FDF anchors");n.mark=1;if(n.placed){n.rect=*n.placed;n.mark=2;return n.rect;}auto rect=n.parent<0?Rect{}:layout(unsigned(n.parent));
    float width=rect.w,height=rect.h;if(n.frame.type=="TEXT"){auto font=n.frame.property("FrameFont");height=font.size()>1?number(font[1]):.013f;auto value=wide(plain(n.frame.properties.contains("RuntimeText")?first(n.frame,"Text"):definitions_.string(first(n.frame,"Text"))));if(value.size()>4096)value.resize(4096);width=text_.width(value,height);}
    rect.w=n.frame.number("Width",width);rect.h=n.frame.number("Height",height);
    if(!n.frame.points.empty()) {
        auto& p=n.frame.points.front();if(p.size()!=5)throw std::runtime_error("Invalid FDF SetPoint: "+n.frame.name);auto target=names_.find(p[1]);Rect other;
        if(p[1].empty())other=n.parent<0?Rect{}:layout(unsigned(n.parent));else {if(target==names_.end())throw std::runtime_error("Missing FDF anchor: "+p[1]);other=layout(target->second);}
        auto [sx,sy]=point(p[0]);auto [tx,ty]=point(p[2]);rect.x=other.x+tx*other.w+number(p[3])-sx*rect.w;rect.y=other.y+ty*other.h-number(p[4])-sy*rect.h;
    }
    n.rect=rect;n.mark=2;return rect;
}
GlueScreen::Texture& GlueScreen::texture(const std::string& member) {auto found=textures_.find(member);if(found!=textures_.end())return found->second;auto bytes=archives_.readTexture(member);if(!bytes)throw std::runtime_error("Missing glue texture: "+member);auto image=images_.decode(bytes->bytes);return textures_.emplace(member,Texture{renderer_.texture(image.width,image.height,image.pixels),image.width,image.height}).first->second;}
void GlueScreen::quad(Rect rect,DWORD color,const std::string& member,float u0,float v0,float u1,float v1,bool tile,bool additive,bool transpose) {
    if(rect.w<=0 || rect.h<=0)return;float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);float x=(renderer_.width()-.8f*scale)/2,y=(renderer_.height()-.6f*scale)/2;
    renderer_.rect(x+rect.x*scale,y+rect.y*scale,rect.w*scale,rect.h*scale,color,member.empty()?nullptr:texture(member).gpu.Get(),u0,v0,u1,v1,tile,additive,transpose);
}
void GlueScreen::backdrop(const FrameDefinition& f,Rect r,DWORD color) {
    auto background=first(f,"BackdropBackground"),edge=first(f,"BackdropEdgeFile");auto inset=f.property("BackdropBackgroundInsets");Rect fill=r;
    if(inset.size()==4){fill.x+=number(inset[0]);fill.y+=number(inset[2]);fill.w-=number(inset[0])+number(inset[1]);fill.h-=number(inset[2])+number(inset[3]);}
    bool tile=f.properties.contains("BackdropTileBackground");float size=f.number("BackdropBackgroundSize",.032f);
    if(!background.empty())quad(fill,color,background,0,0,tile&&size>0?fill.w/size:1,tile&&size>0?fill.h/size:1,tile);
    if(!edge.empty()) {
        float c=std::min({f.number("BackdropCornerSize",.016f),r.w/2,r.h/2});auto& t=texture(edge);auto flags=first(f,"BackdropCornerFlags");
        auto segment=[&](const char* name,unsigned index,Rect part){if(flags.empty() || ("|"+flags+"|").find("|"+std::string(name)+"|")!=std::string::npos)quad(part,color,edge,(index*t.height+.5f)/t.width,.5f/t.height,((index+1)*t.height-.5f)/t.width,1-.5f/t.height,false,false,index==2 || index==3);};
        segment("L",0,{r.x,r.y+c,c,r.h-2*c});segment("R",1,{r.x+r.w-c,r.y+c,c,r.h-2*c});segment("T",2,{r.x+c,r.y,r.w-2*c,c});segment("B",3,{r.x+c,r.y+r.h-c,r.w-2*c,c});
        segment("UL",4,{r.x,r.y,c,c});segment("UR",5,{r.x+r.w-c,r.y,c,c});segment("BL",6,{r.x,r.y+r.h-c,c,c});segment("BR",7,{r.x+r.w-c,r.y+r.h-c,c,c});
    }
}
void GlueScreen::label(const FrameDefinition& f,Rect r,bool enabled,bool highlighted) {
    auto value=f.properties.contains("RuntimeText")?first(f,"Text"):definitions_.string(first(f,"Text"));if(value.empty())return;auto font=f.property("FrameFont");float height=font.size()>1?number(font[1]):.013f;if(height<=0 || r.w<=0 || r.h<=0)return;
    DWORD normal=rgba(f.property(enabled?(highlighted?"FontHighlightColor":"FontColor"):"FontDisabledColor"),enabled?0xffffcc55:0xff808080);
    std::wstring content;std::vector<DWORD> colors;DWORD color=normal;
    for(size_t i=0;i<value.size() && content.size()<4096;) {
        if(value[i]=='|' && i+1<value.size()) {char c=value[i+1];if((c=='c'||c=='C') && i+10<=value.size()){unsigned n;auto [end,error]=std::from_chars(value.data()+i+2,value.data()+i+10,n,16);if(error==std::errc{} && end==value.data()+i+10){color=enabled?n:normal;i+=10;continue;}}if(c=='r'||c=='R'){color=normal;i+=2;continue;}if(c=='n'||c=='N'){content+='\n';colors.push_back(color);i+=2;continue;}}
        size_t start=i++;while(i<value.size() && value[i]!='|')++i;auto part=wide(value.substr(start,i-start));for(auto c:part){if(content.size()>=4096)break;if(c!='\r'){content+=c;colors.push_back(color);}}
    }
    struct Line{size_t begin,end;};std::vector<Line> lines;
    for(size_t at=0;at<content.size() && lines.size()<1+size_t(r.h/height);) {auto end=content.find(L'\n',at);if(end==std::wstring::npos)end=content.size();auto part=std::wstring_view(content).substr(at,end-at);auto count=text_.fit(part,r.w,height);if(!part.empty() && !count)count=1;if(count<part.size()){auto space=part.substr(0,count).find_last_of(L' ');if(space!=std::wstring_view::npos && space)count=space;}lines.push_back({at,at+count});at+=count;if(at<content.size() && (content[at]=='\n' || content[at]==' '))++at;}
    float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);float left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;
    float h=height*scale,total=height*float(lines.size()),y=top+(r.y+(first(f,"FontJustificationV")=="JUSTIFYTOP"?0:first(f,"FontJustificationV")=="JUSTIFYBOTTOM"?r.h-total:(r.h-total)/2))*scale;
    auto shadow=f.property("FontShadowOffset");float dx=shadow.size()==2?number(shadow[0])*scale:1,dy=shadow.size()==2?-number(shadow[1])*scale:1;
    auto device=renderer_.device();DWORD oldEnabled=0;RECT oldClip{};device->GetRenderState(D3DRS_SCISSORTESTENABLE,&oldEnabled);device->GetScissorRect(&oldClip);
    RECT clip{LONG(std::clamp(left+r.x*scale-1,0.f,float(renderer_.width()))),LONG(std::clamp(top+r.y*scale-1,0.f,float(renderer_.height()))),LONG(std::clamp(left+(r.x+r.w)*scale+1,0.f,float(renderer_.width()))),LONG(std::clamp(top+(r.y+r.h)*scale+1,0.f,float(renderer_.height())))};
    device->SetScissorRect(&clip);device->SetRenderState(D3DRS_SCISSORTESTENABLE,TRUE);
    for(auto line:lines){auto text=std::wstring_view(content).substr(line.begin,line.end-line.begin);float full=text_.width(text,h),x=left+r.x*scale;auto justify=first(f,"FontJustificationH");if(justify=="JUSTIFYRIGHT")x+=r.w*scale-full;else if(justify!="JUSTIFYLEFT")x+=(r.w*scale-full)/2;text_.draw(text,x+dx,y+dy,h,rgba(f.property("FontShadowColor"),0xe6000000));for(auto at=line.begin;at<line.end;){auto end=at+1;while(end<line.end && colors[end]==colors[at])++end;auto run=std::wstring_view(content).substr(at,end-at);text_.draw(run,x,y,h,colors[at]);x+=text_.width(run,h,false);at=end;}y+=h;}
    device->SetScissorRect(&oldClip);device->SetRenderState(D3DRS_SCISSORTESTENABLE,oldEnabled);
}
std::string GlueScreen::drawNode(unsigned index,const UiInput& input,const std::set<std::string>& enabled) {
    auto& n=nodes_[index];if(n.hidden)return {};auto& f=n.frame;
    if(f.type=="BACKDROP")backdrop(f,n.rect);
    if(f.type=="TEXT")label(f,n.rect,true,false);
    if(f.type=="SPRITE" && n.image){auto r=n.rect;float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f);renderer_.rect((renderer_.width()-.8f*scale)/2+r.x*scale,(renderer_.height()-.6f*scale)/2+r.y*scale,r.w*scale,r.h*scale,0xffffffff,n.image.Get());}
    bool button=f.type=="GLUETEXTBUTTON" || f.type=="TEXTBUTTON" || f.type=="GLUEBUTTON";
    if(button) {
        bool active=enabled.contains(f.name),hover=input.x>=n.rect.x && input.y>=n.rect.y && input.x<n.rect.x+n.rect.w && input.y<n.rect.y+n.rect.h;
        bool origin=input.startX>=n.rect.x && input.startY>=n.rect.y && input.startX<n.rect.x+n.rect.w && input.startY<n.rect.y+n.rect.h;
        auto backdropName=first(f,!active?"ControlDisabledBackdrop":hover&&origin&&input.down?"ControlPushedBackdrop":"ControlBackdrop");auto labelName=first(f,"ButtonText"),highlight=first(f,"ControlMouseOverHighlight");
        for(auto child:n.children) {auto& c=nodes_[child];if(c.frame.name==backdropName)backdrop(c.frame,n.rect);if(c.frame.name==labelName)label(c.frame,n.rect,active,hover);if(active&&hover&&c.frame.name==highlight){auto file=first(c.frame,"HighlightAlphaFile");if(!file.empty())quad(n.rect,0xffffffff,file,0,0,1,1,false,first(c.frame,"HighlightAlphaMode")=="ADD");}}
        auto shortcut=first(f,"ControlShortcutKey");if(active && ((hover&&origin&&input.pressed) || (shortcut.size()==1 && input.key==unsigned(std::towupper(shortcut[0])))))return f.name;
        return {};
    }
    if(f.type=="FRAME" || f.type=="BACKDROP")for(auto child:n.children){auto action=drawNode(child,input,enabled);if(!action.empty())return action;}
    return {};
}
std::string GlueScreen::draw(const std::string& subtree,const UiInput& input,const std::set<std::string>& enabled) {auto node=names_.find(subtree);if(node==names_.end())throw std::runtime_error("Missing glue subtree: "+subtree);return drawNode(node->second,input,enabled);}
std::pair<float,float> GlueScreen::center(const std::string& name) const {auto node=names_.find(name);if(node==names_.end())throw std::runtime_error("Missing glue frame: "+name);auto& r=nodes_[node->second].rect;return {r.x+r.w/2,r.y+r.h/2};}
GlueScreen::Rect GlueScreen::bounds(const std::string& name) const {return nodes_.at(names_.at(name)).rect;}
void GlueScreen::relayout() {for(auto& n:nodes_)n.mark=0;for(unsigned i=0;i<nodes_.size();++i)layout(i);}
void GlueScreen::attach(const std::string& member,const std::string& root,const std::string& container) {definitions_.load(archives_,member);auto parent=names_.at(container);auto node=add(definitions_.frame(root),int(parent));nodes_[parent].children.push_back(node);relayout();}
void GlueScreen::visible(const std::string& name,bool visible) {nodes_.at(names_.at(name)).hidden=!visible;}
void GlueScreen::place(const std::string& name,Rect rect) {nodes_.at(names_.at(name)).placed=rect;relayout();}
void GlueScreen::setText(const std::string& name,const std::string& text) {auto& f=nodes_.at(names_.at(name)).frame;f.properties["Text"]={text};f.properties["RuntimeText"]={};relayout();}
void GlueScreen::image(const std::string& name,const std::string& member) {image(name,texture(member).gpu.Get());}
void GlueScreen::image(const std::string& name,IDirect3DTexture9* texture) {nodes_.at(names_.at(name)).image=texture;}
void GlueScreen::backdropAt(const std::string& frame,Rect rect) {backdrop(definitions_.frame(frame),rect);}
void GlueScreen::imageAt(const std::string& member,Rect rect) {quad(rect,0xffffffff,member);}
void GlueScreen::textAt(const std::string& frame,const std::string& text,Rect rect,bool enabled,bool highlight,bool left) {auto f=definitions_.frame(frame);f.properties["Text"]={text};f.properties["RuntimeText"]={};if(left)f.properties["FontJustificationH"]={"JUSTIFYLEFT"};label(f,rect,enabled,highlight);}
}
