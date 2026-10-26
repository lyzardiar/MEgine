// Author: MiYu. Original FDF player rows, choices and source-ID-preserving setup edits.
#include "player_setup_ui.h"
#include <array>
#include <cmath>

namespace war3 {
namespace {
std::string context(unsigned id) {return "player-"+std::to_string(id);}
std::string controlKey(SlotControl control) {switch(control){case SlotControl::Open:return "OPEN";case SlotControl::Closed:return "CLOSED";case SlotControl::Local:return "PLAYER";case SlotControl::ComputerEasy:return "COMPUTER_NEWBIE";case SlotControl::ComputerNormal:return "COMPUTER_NORMAL";case SlotControl::ComputerInsane:return "COMPUTER_INSANE";}throw std::runtime_error("Invalid player control");}
std::string colorImage(unsigned color) {return "ReplaceableTextures\\TeamColor\\TeamColor"+std::string(color<10?"0":"")+std::to_string(color)+".blp";}
}
PlayerSetupUi::PlayerSetupUi(GlueScreen& screen) : screen_(screen) {
    screen_.attach("UI\\FrameDef\\Glue\\TeamSetup.fdf","TeamSetup","TeamSetupContainer");
    for(unsigned id=0;id<16;++id){auto prefix=context(id);screen_.attach("UI\\FrameDef\\Glue\\PlayerSlot.fdf","PlayerSlot","TeamSetup",prefix);screen_.visible(prefix+"/PlayerSlot",false);}
    rowHeight_=screen_.bounds("player-0/PlayerSlot").h;if(rowHeight_<=0)throw std::runtime_error("Invalid source player row height");
}
std::string PlayerSetupUi::teamName(unsigned team) const {if(setup_ && setup_->customForces() && team<setup_->forces().size())return setup_->forces()[team].name;auto value=screen_.localized("TEAM_FORMAT");auto at=value.find("%d");if(at!=std::string::npos)value.replace(at,2,std::to_string(team+1));return value;}
void PlayerSetupUi::bind(PlayerSetup* setup) {
    setup_=setup;scroll_=0;rows_.clear();if(setup_){if(setup_->customForces()){std::map<unsigned,std::vector<unsigned>> teams;for(auto& slot:setup_->slots())teams[slot.team].push_back(unsigned(slot.source.id));for(auto& [team,players]:teams){rows_.push_back({std::nullopt,teamName(team)});for(auto id:players)rows_.push_back({id,{}});}}else for(auto& slot:setup_->slots())rows_.push_back({unsigned(slot.source.id),{}});}sync();
}
void PlayerSetupUi::sync() {
    bindings_.clear();if(setup_)for(auto& slot:setup_->slots()){
        auto id=unsigned(slot.source.id);auto prefix=context(id);std::vector<GlueScreen::Choice> names;std::vector<unsigned> controls;size_t selected=0;for(auto value:setup_->controls(id)){if(value==slot.control)selected=names.size();names.push_back({screen_.localized(controlKey(value)),{}});controls.push_back(unsigned(value));}screen_.choices(prefix+"/NameMenu",std::move(names),selected,.22f);bindings_[prefix+"/NameMenu"]={id,Field::Control,std::move(controls)};
        std::vector<GlueScreen::Choice> races;for(auto key:{"RANDOM","HUMAN","ORC","UNDEAD","NIGHT_ELF"})races.push_back({screen_.localized(key),{}});screen_.choices(prefix+"/RaceMenu",std::move(races),slot.race==5?0:slot.race,.12f);bindings_[prefix+"/RaceMenu"]={id,Field::Race,{5,1,2,3,4}};
        std::vector<GlueScreen::Choice> teams;std::vector<unsigned> teamValues;if(setup_->customForces()){teams.push_back({teamName(slot.team),{}});teamValues.push_back(slot.team);}else for(unsigned team=0;team<setup_->slots().size();++team){teams.push_back({teamName(team),{}});teamValues.push_back(team);}screen_.choices(prefix+"/TeamButton",std::move(teams),setup_->customForces()?0:slot.team,.12f);bindings_[prefix+"/TeamButton"]={id,Field::Team,std::move(teamValues)};
        std::vector<GlueScreen::Choice> colors;std::vector<unsigned> colorValues;for(unsigned color=0;color<16;++color){colors.push_back({{},colorImage(color)});colorValues.push_back(color);}screen_.choices(prefix+"/ColorButton",std::move(colors),slot.color,.08f,false);screen_.image(prefix+"/ColorButtonValue",colorImage(slot.color));bindings_[prefix+"/ColorButton"]={id,Field::Color,std::move(colorValues)};
        std::vector<GlueScreen::Choice> handicaps;for(auto percent:{100,90,80,70,60,50})handicaps.push_back({screen_.localized("PERCENT_"+std::to_string(percent)),{}});screen_.choices(prefix+"/HandicapMenu",std::move(handicaps),(100-slot.handicap)/10,.08f);bindings_[prefix+"/HandicapMenu"]={id,Field::Handicap,{100,90,80,70,60,50}};
    }layout();
}
void PlayerSetupUi::layout() {
    enabled_.clear();for(unsigned id=0;id<16;++id)screen_.visible(context(id)+"/PlayerSlot",false);if(!setup_)return;auto bounds=screen_.bounds("TeamSetupContainer");capacity_=std::max(1u,unsigned(std::floor((bounds.h-.02f)/rowHeight_)));auto maximum=rows_.size()>capacity_?rows_.size()-capacity_:0;scroll_=std::min(scroll_,maximum);
    for(size_t row=0;row<capacity_ && scroll_+row<rows_.size();++row)if(auto id=rows_[scroll_+row].player){auto& slot=*setup_->find(*id);auto prefix=context(*id);screen_.place(prefix+"/PlayerSlot",{bounds.x,bounds.y+.02f+float(row)*rowHeight_,bounds.w,rowHeight_});screen_.visible(prefix+"/PlayerSlot",true);if(setup_->controls(*id).size()>1)enabled_.insert(prefix+"/NameMenu");if(slot.active()){enabled_.insert(prefix+"/HandicapMenu");if(!setup_->fixedSettings()){enabled_.insert(prefix+"/RaceMenu");enabled_.insert(prefix+"/ColorButton");}if(!setup_->customForces())enabled_.insert(prefix+"/TeamButton");}}
}
void PlayerSetupUi::input(const UiInput& input) {
    if(!setup_ || !input.wheel || screen_.popupOpen())return;auto r=screen_.bounds("TeamSetupContainer");if(input.x<r.x || input.y<r.y || input.x>=r.x+r.w || input.y>=r.y+r.h)return;auto maximum=rows_.size()>capacity_?rows_.size()-capacity_:0;auto next=size_t(std::clamp<long long>(static_cast<long long>(scroll_)-input.wheel,0,static_cast<long long>(maximum)));if(next!=scroll_){scroll_=next;layout();}
}
void PlayerSetupUi::changed() {
    auto change=screen_.takeChoice();if(!change || !setup_)return;auto found=bindings_.find(change->frame);if(found==bindings_.end() || change->index>=found->second.values.size())return;auto& b=found->second;auto value=b.values[change->index];switch(b.field){case Field::Control:setup_->control(b.player,SlotControl(value));break;case Field::Race:setup_->race(b.player,value);break;case Field::Team:setup_->team(b.player,value);break;case Field::Color:setup_->color(b.player,value);break;case Field::Handicap:setup_->handicap(b.player,value);break;}sync();
}
void PlayerSetupUi::headings() {
    if(!setup_ || setup_->slots().empty())return;auto r=screen_.bounds("TeamSetupContainer");auto prefix=context(unsigned(setup_->slots().front().source.id));for(auto [frame,key]:std::array<std::pair<const char*,const char*>,4>{{{"NameMenu","PLAYER_NAME"},{"RaceMenu","COLON_RACE"},{"ColorButton","COLON_COLOR"},{"HandicapMenu","COLON_HANDICAP"}}}){auto cell=screen_.bounds(prefix+"/"+frame);screen_.textAt("StandardSmallTextTemplate",screen_.localized(key),{cell.x,r.y,cell.w,.02f},true,false,true,.009f);}
    for(size_t row=0;row<capacity_ && scroll_+row<rows_.size();++row){auto& item=rows_[scroll_+row];if(!item.player)screen_.textAt("StandardSmallTextTemplate",item.title,{r.x+.026f,r.y+.02f+float(row)*rowHeight_,r.w-.026f,rowHeight_},true,false,true,.011f);}
}
}
