// Author: MiYu. Script multiboards retain live grid, item handles and presentation state.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
void ScriptSession::toggleMultiboard(std::uint32_t id) {auto found=multiboards_.find(id);if(found!=multiboards_.end()){found->second->minimized=!found->second->minimized;++found->second->minimizeRevision;}}
void ScriptSession::bindMultiboardNatives() {
    auto board=[this](jass::Value handle)->std::shared_ptr<ScriptMultiboard>{if(!handle.bits)return {};return std::get<std::shared_ptr<ScriptMultiboard>>(object(handle,NativeKind::Multiboard).state);};
    auto cell=[this](jass::Value handle)->std::shared_ptr<ScriptMultiboardCell>{if(!alive(handle.bits,NativeKind::MultiboardItem))return {};auto& item=std::get<ScriptMultiboardItem>(objects_[handle.bits-handleBase].state);auto owner=item.board.lock();auto result=item.cell.lock();return owner && result && result->active?result:nullptr;};
    auto integer=[](jass::Value value){return std::bit_cast<std::int32_t>(value.bits);};
    auto text=[this](jass::Value value){auto result=value.text?mapString(*value.text,strings_):std::string{};if(result.size()>65536)throw std::runtime_error("Multiboard text exceeds budget");return result;};
    auto icon=[](jass::Value value){auto result=value.text?*value.text:std::string{};if(result.size()>1024 || result.find('\0')!=std::string::npos)throw std::runtime_error("Invalid multiboard icon");return result;};
    auto color=[integer](std::span<const jass::Value> a){auto channel=[&](unsigned i){return unsigned(std::clamp(integer(a[i]),0,255));};return (channel(3)<<24)|(channel(0)<<16)|(channel(1)<<8)|channel(2);};
    auto width=[](jass::Value value){auto v=std::bit_cast<float>(value.bits);if(!std::isfinite(v) || v<0 || v>8)throw std::runtime_error("Invalid multiboard item width");return v;};
    auto resize=[](const std::shared_ptr<ScriptMultiboard>& b,unsigned rows,unsigned columns){if(rows>256 || columns>256 || std::uint64_t(rows)*columns>8192)throw std::runtime_error("Multiboard grid exceeds budget");std::vector<std::shared_ptr<ScriptMultiboardCell>> next(size_t(rows)*columns);for(unsigned r=0;r<b->rows;++r)for(unsigned c=0;c<b->columns;++c){auto value=b->cells[size_t(r)*b->columns+c];if(r<rows && c<columns)next[size_t(r)*columns+c]=std::move(value);else value->active=false;}for(auto& value:next)if(!value)value=std::make_shared<ScriptMultiboardCell>(b->defaults);b->rows=rows;b->columns=columns;b->cells=std::move(next);};
    bind("CreateMultiboard","multiboard",{},[this](auto&,auto){if(multiboards_.size()>=256)throw std::runtime_error("Multiboard budget exceeded");auto handle=create(NativeKind::Multiboard);multiboards_[handle.bits]=std::get<std::shared_ptr<ScriptMultiboard>>(object(handle,NativeKind::Multiboard).state);return handle;});
    bind("DestroyMultiboard","nothing",{"multiboard"},[this,board](auto& vm,auto a){if(auto b=board(a[0])){for(auto& c:b->cells)c->active=false;auto handles=b->handles;for(auto id:handles)if(alive(id,NativeKind::MultiboardItem))destroy(vm.handle("multiboarditem",id),NativeKind::MultiboardItem);multiboards_.erase(a[0].bits);destroy(a[0],NativeKind::Multiboard);}return vm.nothing();});
    bind("MultiboardDisplay","nothing",{"multiboard","boolean"},[board](auto& vm,auto a){if(auto b=board(a[0]))b->visible=a[1].bits!=0;return vm.nothing();});
    bind("IsMultiboardDisplayed","boolean",{"multiboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.boolean(b && b->visible);});
    bind("MultiboardMinimize","nothing",{"multiboard","boolean"},[board](auto& vm,auto a){if(auto b=board(a[0])){b->minimized=a[1].bits!=0;++b->minimizeRevision;}return vm.nothing();});
    bind("IsMultiboardMinimized","boolean",{"multiboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.boolean(b && b->minimized);});
    bind("MultiboardSuppressDisplay","nothing",{"boolean"},[this](auto& vm,auto a){multiboardsSuppressed_=a[0].bits!=0;return vm.nothing();});
    bind("MultiboardClear","nothing",{"multiboard"},[board,resize](auto& vm,auto a){if(auto b=board(a[0]))resize(b,0,0);return vm.nothing();});
    bind("MultiboardSetTitleText","nothing",{"multiboard","string"},[board,text](auto& vm,auto a){if(auto b=board(a[0]))b->title=text(a[1]);return vm.nothing();});
    bind("MultiboardGetTitleText","string",{"multiboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.string(b?b->title:std::string{});});
    bind("MultiboardSetTitleTextColor","nothing",{"multiboard","integer","integer","integer","integer"},[board,color](auto& vm,auto a){if(auto b=board(a[0]))b->titleColor=color(a.subspan(1));return vm.nothing();});
    bind("MultiboardGetRowCount","integer",{"multiboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.integer(b?int(b->rows):0);});
    bind("MultiboardGetColumnCount","integer",{"multiboard"},[board](auto& vm,auto a){auto b=board(a[0]);return vm.integer(b?int(b->columns):0);});
    for(auto [name,rows]:std::initializer_list<std::pair<const char*,bool>>{{"MultiboardSetRowCount",true},{"MultiboardSetColumnCount",false}})bind(name,"nothing",{"multiboard","integer"},[board,resize,integer,rows](auto& vm,auto a){if(auto b=board(a[0])){auto count=std::max(0,integer(a[1]));resize(b,rows?unsigned(count):b->rows,rows?b->columns:unsigned(count));}return vm.nothing();});
    bind("MultiboardGetItem","multiboarditem",{"multiboard","integer","integer"},[this,board,integer](auto& vm,auto a){auto b=board(a[0]);int r=integer(a[1]),c=integer(a[2]);if(!b || r<0 || c<0 || unsigned(r)>=b->rows || unsigned(c)>=b->columns)return vm.handle("multiboarditem",0);if(b->handles.size()>=16384)throw std::runtime_error("Multiboard item handle budget exceeded");auto selected=b->cells[size_t(r)*b->columns+unsigned(c)];auto handle=create(NativeKind::MultiboardItem);std::get<ScriptMultiboardItem>(object(handle,NativeKind::MultiboardItem).state)={b,selected};b->handles.insert(handle.bits);return handle;});
    bind("MultiboardReleaseItem","nothing",{"multiboarditem"},[this](auto& vm,auto a){if(alive(a[0].bits,NativeKind::MultiboardItem)){auto& ref=std::get<ScriptMultiboardItem>(objects_[a[0].bits-handleBase].state);if(auto b=ref.board.lock())b->handles.erase(a[0].bits);destroy(a[0],NativeKind::MultiboardItem);}return vm.nothing();});
    bind("MultiboardSetItemsStyle","nothing",{"multiboard","boolean","boolean"},[board](auto& vm,auto a){if(auto b=board(a[0])){b->defaults.showValue=a[1].bits!=0;b->defaults.showIcon=a[2].bits!=0;for(auto& c:b->cells){c->showValue=b->defaults.showValue;c->showIcon=b->defaults.showIcon;}}return vm.nothing();});
    bind("MultiboardSetItemsValue","nothing",{"multiboard","string"},[board,text](auto& vm,auto a){if(auto b=board(a[0])){b->defaults.value=text(a[1]);for(auto& c:b->cells)c->value=b->defaults.value;}return vm.nothing();});
    bind("MultiboardSetItemsValueColor","nothing",{"multiboard","integer","integer","integer","integer"},[board,color](auto& vm,auto a){if(auto b=board(a[0])){b->defaults.color=color(a.subspan(1));for(auto& c:b->cells)c->color=b->defaults.color;}return vm.nothing();});
    bind("MultiboardSetItemsWidth","nothing",{"multiboard","real"},[board,width](auto& vm,auto a){auto w=width(a[1]);if(auto b=board(a[0])){b->defaults.width=w;for(auto& c:b->cells)c->width=w;}return vm.nothing();});
    bind("MultiboardSetItemsIcon","nothing",{"multiboard","string"},[board,icon](auto& vm,auto a){if(auto b=board(a[0])){b->defaults.icon=icon(a[1]);for(auto& c:b->cells)c->icon=b->defaults.icon;}return vm.nothing();});
    bind("MultiboardSetItemStyle","nothing",{"multiboarditem","boolean","boolean"},[cell](auto& vm,auto a){if(auto c=cell(a[0])){c->showValue=a[1].bits!=0;c->showIcon=a[2].bits!=0;}return vm.nothing();});
    bind("MultiboardSetItemValue","nothing",{"multiboarditem","string"},[cell,text](auto& vm,auto a){if(auto c=cell(a[0]))c->value=text(a[1]);return vm.nothing();});
    bind("MultiboardSetItemValueColor","nothing",{"multiboarditem","integer","integer","integer","integer"},[cell,color](auto& vm,auto a){if(auto c=cell(a[0]))c->color=color(a.subspan(1));return vm.nothing();});
    bind("MultiboardSetItemWidth","nothing",{"multiboarditem","real"},[cell,width](auto& vm,auto a){auto w=width(a[1]);if(auto c=cell(a[0]))c->width=w;return vm.nothing();});
    bind("MultiboardSetItemIcon","nothing",{"multiboarditem","string"},[cell,icon](auto& vm,auto a){if(auto c=cell(a[0]))c->icon=icon(a[1]);return vm.nothing();});
}
}
