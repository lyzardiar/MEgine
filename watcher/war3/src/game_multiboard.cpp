// Author: MiYu. Source multiboard frame and script-driven, streamed grid presentation.
#include "game_view.h"
#include "game_flow_ui.h"
#include <algorithm>
#include <cmath>

namespace war3 {
namespace {
struct BoardLayout {float x=0,y=0,width=0,body=0,row=.013f;};
BoardLayout layout(const ScriptMultiboard& board,float y) {float widest=0;for(unsigned r=0;r<board.rows;++r){float width=0;for(unsigned c=0;c<board.columns;++c)width+=board.cells[size_t(r)*board.columns+c]->width;widest=std::max(widest,width);}float width=std::clamp(widest+.014f,.12f,.5f);return {.79f-width,y,width,board.minimized?0.f:std::min(.39f,.01f+board.rows*.013f),.013f};}
bool contains(float x,float y,float left,float top,float width,float height) {return x>=left && x<left+width && y>=top && y<top+height;}
void coloredText(Text& text,std::string_view input,float x,float y,float width,float font,DWORD base) {
    DWORD color=base;std::string piece;auto flush=[&]{if(piece.empty() || width<=0){piece.clear();return;}auto value=wide(piece);if(value.size()>4096)value.resize(4096);value.resize(text.fit(value,width,font));if(!value.empty()){text.draw(value,x,y,font,color);auto used=text.width(value,font,false);x+=used;width=std::max(0.f,width-used);}piece.clear();};
    for(size_t i=0;i<input.size() && width>0;){auto token=input.substr(i);if(auto value=inlineTextColor(token.substr(0,std::min(size_t(10),token.size())))){flush();color=*value;i+=10;}else if(token.starts_with("|r") || token.starts_with("|R")){flush();color=base;i+=2;}else if(token.starts_with("|n") || token.starts_with("|N") || token[0]=='\n')break;else piece+=input[i++];}flush();
}
}
bool GameView::multiboardHit(float x,float y) const {
    auto& session=*data_->session;if(session.multiboardsSuppressed())return false;float top=.035f;for(auto& [id,board]:session.multiboards())if(board->visible){auto r=layout(*board,top);if(contains(x,y,r.x,r.y,r.width,.024f+r.body))return true;top+=.03f+r.body;if(top>.46f)break;}return false;
}
void GameView::drawMultiboards(const GameInput& input) {
    auto& session=*data_->session;if(session.multiboardsSuppressed())return;auto player=session.localPlayer();if(!player)return;bool any=false;for(auto& [id,board]:session.multiboards())if(board->visible){any=true;break;}if(!any)return;
    if(!multiboardPanel_){multiboardPanel_=std::make_unique<GlueScreen>(session.world()->resources(),data_->assets->decoder(),renderer_,text_,"UI\\FrameDef\\UI\\Multiboard.fdf","Multiboard");multiboardPanel_->focusEnabled(false);multiboardPanel_->visible("MultiboardTitle",false);multiboardDefaultIcon_=skinValue(session.world()->resources(),"MultiboardDefaultIcon","UI\\Widgets\\EscMenu\\Human\\observer-icon.blp");}
    auto race=session.config().players[*player].race;multiboardPanel_->skinSection(race==2?"Orc":race==3?"Undead":race==4?"NightElf":"Default");float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,topPixels=(renderer_.height()-.6f*scale)/2,top=.035f;
    auto place=[&](const char* name,GlueScreen::Rect next){auto old=multiboardPanel_->bounds(name);if(old.x!=next.x || old.y!=next.y || old.w!=next.w || old.h!=next.h)multiboardPanel_->place(name,next);};
    for(auto& [id,board]:session.multiboards())if(board->visible){auto r=layout(*board,top);float buttonX=r.x+r.width-.024f;place("Multiboard",{buttonX,r.y,.024f,.024f});place("MultiboardMinimizeButton",{buttonX,r.y,.024f,.024f});place("MultiboardTitleBackdrop",{r.x,r.y,r.width-.019f,.024f});place("MultiboardBackdrop",{r.x,r.y+.024f,r.width,std::max(.001f,r.body)});multiboardPanel_->visible("MultiboardBackdrop",!board->minimized);multiboardPanel_->visible("MultiboardListContainer",false);auto ui=flow_->menuOpen() || flow_->scriptDialog() || questsOpen_?UiInput{}:input.ui;auto action=multiboardPanel_->draw("Multiboard",ui,{"MultiboardMinimizeButton"});if(action=="MultiboardMinimizeButton")session.toggleMultiboard(id);if(board->minimized){auto image=skinValue(session.world()->resources(),"MultiboardMaximizeButtonEnabled","UI\\Widgets\\Glues\\Gluescreen-Scrollbar-DownArrow.blp");multiboardPanel_->imageAt(image,{buttonX+.005f,r.y+.005f,.014f,.014f});}auto title=wide(board->title);if(title.size()>4096)title.resize(4096);title.resize(text_.fit(title,(r.width-.03f)*scale,.011f*scale));text_.draw(title,left+(r.x+(r.width-.024f)/2)*scale,topPixels+(r.y+.006f)*scale,.011f*scale,board->titleColor,true);
        if(!board->minimized && r.body>0){for(unsigned row=0;row<board->rows && .01f+(row+1)*r.row<=r.body+.0001f;++row){float total=0;for(unsigned col=0;col<board->columns;++col)total+=board->cells[size_t(row)*board->columns+col]->width;float factor=total>r.width-.014f?(r.width-.014f)/total:1.f;float cursor=r.x+.007f,line=r.y+.029f+row*r.row;for(unsigned col=0;col<board->columns;++col){auto& cell=*board->cells[size_t(row)*board->columns+col];float width=cell.width*factor;if(width<=0)continue;float inset=0;if(cell.showIcon){float icon=std::min({.010f,width,r.row});auto texture=cell.icon.empty() || cell.icon=="_"?nullptr:data_->assets->cachedTexture(cell.icon);if(texture)renderer_.rect(left+cursor*scale,topPixels+line*scale,icon*scale,icon*scale,0xffffffff,texture);else multiboardPanel_->imageAt(multiboardDefaultIcon_,{cursor,line,icon,icon});inset=icon+.002f;}if(cell.showValue && width>inset)coloredText(text_,cell.value,left+(cursor+inset)*scale,topPixels+line*scale,(width-inset)*scale,.007f*scale,cell.color);cursor+=width;}}}
        top+=.03f+r.body;if(top>.46f)break;
    }
}
}
