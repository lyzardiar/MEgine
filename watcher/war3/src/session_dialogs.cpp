// Author: MiYu. Timer dialog ownership, title/visibility state and real-time presentation data.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
double ScriptSession::timerDialogRemaining(const ScriptTimerDialog& dialog) const {
    if(dialog.realTime){auto [started,seconds]=*dialog.realTime;return std::max(0.,(double(seconds)-double(GetTickCount64()-started)/1000.)*dialog.speed);}
    if(!alive(dialog.timer,NativeKind::Timer))return 0;auto& timer=std::get<Timer>(objects_[dialog.timer-handleBase].state);return std::max(0.,(double(std::bit_cast<float>(timer.timeout.bits()))-double(std::bit_cast<float>(timer.elapsed.bits())))*dialog.speed);
}
void ScriptSession::bindDialogNatives() {
    auto dialog=[this](jass::Value handle){return std::get<std::shared_ptr<ScriptTimerDialog>>(object(handle,NativeKind::TimerDialog).state);};
    bind("CreateTimerDialog","timerdialog",{"timer"},[this](auto&,auto args){if(args[0].bits)object(args[0],NativeKind::Timer);auto state=std::make_shared<ScriptTimerDialog>();state->titleColor=state->timeColor={252,211,18,255};state->timer=args[0].bits;auto handle=create(NativeKind::TimerDialog);std::get<std::shared_ptr<ScriptTimerDialog>>(object(handle,NativeKind::TimerDialog).state)=state;timerDialogs_[handle.bits]=std::move(state);return handle;});
    bind("DestroyTimerDialog","nothing",{"timerdialog"},[this](auto& vm,auto args){if(args[0].bits){object(args[0],NativeKind::TimerDialog);timerDialogs_.erase(args[0].bits);destroy(args[0],NativeKind::TimerDialog);}return vm.nothing();});
    bind("TimerDialogSetTitle","nothing",{"timerdialog","string"},[this,dialog](auto& vm,auto args){dialog(args[0])->title=args[1].text?mapString(*args[1].text,strings_):std::string{};return vm.nothing();});
    bind("TimerDialogDisplay","nothing",{"timerdialog","boolean"},[dialog](auto& vm,auto args){dialog(args[0])->displayed=args[1].bits!=0;return vm.nothing();});
    bind("IsTimerDialogDisplayed","boolean",{"timerdialog"},[dialog](auto& vm,auto args){return vm.boolean(dialog(args[0])->displayed);});
    for(auto [name,title]:std::initializer_list<std::pair<const char*,bool>>{{"TimerDialogSetTitleColor",true},{"TimerDialogSetTimeColor",false}})bind(name,"nothing",{"timerdialog","integer","integer","integer","integer"},[dialog,title](auto& vm,auto args){auto state=dialog(args[0]);auto& color=title?state->titleColor:state->timeColor;for(unsigned i=0;i<4;++i)color[i]=std::uint8_t(std::clamp(std::bit_cast<std::int32_t>(args[i+1].bits),0,255));return vm.nothing();});
    bind("TimerDialogSetSpeed","nothing",{"timerdialog","real"},[dialog](auto& vm,auto args){auto speed=std::bit_cast<float>(args[1].bits);if(!std::isfinite(speed))throw std::runtime_error("Invalid timer dialog speed");dialog(args[0])->speed=speed;return vm.nothing();});
    bind("TimerDialogSetRealTimeRemaining","nothing",{"timerdialog","real"},[dialog](auto& vm,auto args){auto value=std::bit_cast<float>(args[1].bits);if(!std::isfinite(value))throw std::runtime_error("Invalid timer dialog remaining time");if(value<=0)dialog(args[0])->realTime.reset();else dialog(args[0])->realTime=std::pair{GetTickCount64(),value};return vm.nothing();});
}
}
