// Author: MiYu. Source timer dialog backdrop and live session timer values.
#include "game_view.h"
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace war3 {
void GameView::drawTimerDialogs() {
    auto& session=*data_->session;auto local=session.localPlayer();if(!local)return;bool any=false;for(auto& [id,dialog]:session.timerDialogs())if(dialog->displayed){any=true;break;}if(!any)return;
    if(!timerDialogPanel_){timerDialogPanel_=std::make_unique<GlueScreen>(session.world()->resources(),data_->assets->decoder(),renderer_,text_,"UI\\FrameDef\\UI\\TimerDialog.fdf","TimerDialog");timerDialogPanel_->focusEnabled(false);timerDialogPanel_->visible("TimerDialogTitle",false);timerDialogPanel_->visible("TimerDialogValue",false);}
    auto race=session.config().players[*local].race;timerDialogPanel_->skinSection(race==2?"Orc":race==3?"Undead":race==4?"NightElf":"Default");float scale=std::min(renderer_.width()/.8f,renderer_.height()/.6f),left=(renderer_.width()-.8f*scale)/2,top=(renderer_.height()-.6f*scale)/2;float y=.035f,x=.625f;if(auto board=session.leaderboard(*local);board && board->visible)x=.445f;if(!session.multiboardsSuppressed())for(auto& [id,board]:session.multiboards())if(board->visible){x=.445f;break;}
    auto packed=[](const auto& c){return (DWORD(c[3])<<24)|(DWORD(c[0])<<16)|(DWORD(c[1])<<8)|c[2];};for(auto& [id,dialog]:session.timerDialogs())if(dialog->displayed){if(y+.03f>.43f)break;auto old=timerDialogPanel_->bounds("TimerDialog");if(old.x!=x || old.y!=y || old.w!=.17f || old.h!=.03f)timerDialogPanel_->place("TimerDialog",{x,y,.17f,.03f});timerDialogPanel_->draw("TimerDialog",{},{});auto title=wide(dialog->title);if(title.size()>4096)title.resize(4096);title.resize(text_.fit(title,.092f*scale,.011f*scale));text_.draw(title,left+(x+.01f)*scale,top+(y+.009f)*scale,.011f*scale,packed(dialog->titleColor));double remaining=session.timerDialogRemaining(*dialog);auto seconds=std::uint64_t(std::min(std::floor(remaining+.5),359999.));wchar_t time[32];std::swprintf(time,32,L"%02llu:%02llu:%02llu",static_cast<unsigned long long>(seconds/3600),static_cast<unsigned long long>((seconds/60)%60),static_cast<unsigned long long>(seconds%60));auto width=text_.width(time,.011f*scale,false);text_.draw(time,left+(x+.16f)*scale-width,top+(y+.009f)*scale,.011f*scale,packed(dialog->timeColor));y+=.032f;}
}
}
