// Author: MiYu. DzAPI (KK platform) natives bound to host input, the shared map frame tree and offline platform storage.
#include "session.h"
#include "map_frames.h"
#include "local_platform_store.h"
#include "lua_runtime.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstdio>
#include <ctime>
#include <stdexcept>

namespace war3 {
namespace {
struct DzContextPop {std::vector<ScriptContext>& stack;~DzContextPop(){stack.pop_back();}};
std::string text(const jass::Value& value){return value.text?*value.text:std::string{};}
std::int32_t integer(const jass::Value& value){return std::bit_cast<std::int32_t>(value.bits);}
float number(const jass::Value& value){return std::bit_cast<float>(value.bits);}
jass::Value realValue(jass::Runtime& vm,float value){return vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(value)));}
std::string boundedText(const jass::Value& value,size_t limit,const char* what){auto result=text(value);if(result.size()>limit || result.find('\0')!=std::string::npos)throw std::runtime_error(std::string("Invalid DzAPI ")+what);return result;}
const char* itemDataKey(std::uint32_t field){
    switch(field){
    case 1:return "Art";
    case 2:return "Tip";
    case 3:return "Ubertip";
    case 4:return "Name";
    case 5:return "Description";
    default:return nullptr;
    }
}
const char* abilityDataRealKey(std::uint32_t field){
    switch(field){
    case 101:return "Cast";
    case 102:return "Dur";
    case 103:return "HeroDur";
    case 105:return "Cool";
    case 106:return "Area";
    case 107:return "Rng";
    case 108:return "DataA";
    case 109:return "DataB";
    case 110:return "DataC";
    case 111:return "DataD";
    case 112:return "DataE";
    case 113:return "DataF";
    case 114:return "DataG";
    case 115:return "DataH";
    case 116:return "DataI";
    default:return nullptr;
    }
}
const char* abilityDataIntKey(std::uint32_t field){
    switch(field){
    case 100:return "targs";
    case 104:return "Cost";
    case 108:return "DataA";
    case 109:return "DataB";
    case 110:return "DataC";
    case 111:return "DataD";
    case 112:return "DataE";
    case 113:return "DataF";
    case 114:return "DataG";
    case 115:return "DataH";
    case 116:return "DataI";
    case 117:return "UnitID";
    default:return nullptr;
    }
}
std::string normalizeModelPath(std::string path){
    for(auto& c:path)if(c=='/')c='\\';
    auto dot=path.find_last_of('.');
    if(dot!=std::string::npos){
        auto ext=path.substr(dot);
        std::string lower(ext);for(auto& c:lower)c=char(std::tolower(static_cast<unsigned char>(c)));
        if(lower==".mdl")path.replace(dot,std::string::npos,".mdx");
    }else if(!path.empty())path+=".mdx";
    return path;
}
std::string normalizeTextureKey(std::string_view path){
    std::string out;out.reserve(path.size());
    for(char c:path){
        if(c=='/')c='\\';
        if(c=='\\' && !out.empty() && out.back()=='\\')continue;
        out+=char(std::tolower(static_cast<unsigned char>(c)));
    }
    return out;
}
Bytes encodeTga32(const Image& image){
    Bytes out(18+image.pixels.size()*4,0);
    out[2]=2;
    out[12]=std::uint8_t(image.width&0xff);out[13]=std::uint8_t((image.width>>8)&0xff);
    out[14]=std::uint8_t(image.height&0xff);out[15]=std::uint8_t((image.height>>8)&0xff);
    out[16]=32;out[17]=0x28;
    size_t at=18;
    for(auto p:image.pixels){
        out[at++]=std::uint8_t(p&0xff);
        out[at++]=std::uint8_t((p>>8)&0xff);
        out[at++]=std::uint8_t((p>>16)&0xff);
        out[at++]=std::uint8_t((p>>24)&0xff);
    }
    return out;
}
}

void ScriptSession::requireDzIdle(const char* operation) const{
    if(!runtime_.ready() || runtime_.currentThread() || !contexts_.empty() || failed_)throw std::runtime_error(std::string("DzAPI ")+operation+" requires an idle script session");
}
std::shared_ptr<MapFrames> ScriptSession::ensureMapFrames(){
    if(mapFrames_)return mapFrames_;auto& archives=requireWorld().resources();auto definitions=std::make_shared<FrameDefinitions>();definitions->load(archives,"UI\\FrameDef\\UI\\SimpleInfoPanel.fdf");if(archives.read("UI\\FrameDef\\UI\\ResourceBar.fdf"))definitions->load(archives,"UI\\FrameDef\\UI\\ResourceBar.fdf");auto frames=std::make_shared<MapFrames>(definitions);frames->installStandardInfo();frameDefinitions_=std::move(definitions);mapFrames_=std::move(frames);return mapFrames_;
}
MapFrames& ScriptSession::dzFrames(){dzActive_=true;return *ensureMapFrames();}
LocalPlatformStore& ScriptSession::dzPlatform(){
    if(!localPlayer_ || networkPlayerSlot(*localPlayer_))throw std::runtime_error("DzAPI platform archive requires a single-player session; network archive synchronization is not implemented");
    if(!dzPlatform_)dzPlatform_=std::make_shared<LocalPlatformStore>(*this);return *dzPlatform_;
}
LuaRuntime& ScriptSession::dzLua(){
    if(!dzLua_){
        auto lua=std::make_shared<LuaRuntime>();
        lua->attachArchive(requireWorld().resources(),LuaChunkFormat::Standard);
        lua->attachJass(runtime_);
        lua->attachJapi(*this);
        dzLua_=std::move(lua);
    }
    return *dzLua_;
}
std::optional<std::string> ScriptSession::japiItemDataString(std::uint32_t itemType,const std::string& field) const{
    auto found=itemDataStrings_.find({itemType,field});
    if(found==itemDataStrings_.end())return {};
    return found->second;
}
std::optional<Bytes> ScriptSession::dzTextureOverride(const std::string& path) const{
    auto found=dzTextures_.find(normalizeTextureKey(path));
    if(found==dzTextures_.end())return {};
    return found->second;
}

void ScriptSession::registerDzInput(DzInputKind kind,jass::Value trigger,std::uint32_t code,std::uint32_t status,bool sync,const jass::Value& function,bool byCode){
    if(trigger.bits && !alive(trigger.bits,NativeKind::Trigger))return;
    if(kind==DzInputKind::Key && code>=256)throw std::runtime_error("Invalid DzAPI key code: "+std::to_string(code));
    if(kind==DzInputKind::Mouse && (code<1 || code>3))throw std::runtime_error("Invalid DzAPI mouse button: "+std::to_string(code));
    if((kind==DzInputKind::Key || kind==DzInputKind::Mouse) && status>1)throw std::runtime_error("Invalid DzAPI input status: "+std::to_string(status));
    if(sync && localPlayer_ && networkPlayerSlot(*localPlayer_))throw std::runtime_error("Synchronized DzAPI input events are not implemented for network sessions");
    rejectSoloReplay("单机回放不记录 DzAPI 输入事件。");
    if(dzInputHooks_.size()>=4096)throw std::runtime_error("DzAPI input registration budget exceeded");
    DzInputHook hook;hook.kind=kind;hook.trigger=trigger.bits;hook.code=code;hook.press=status!=0;hook.callback.sync=sync;
    if(byCode){if(function.bits){hook.callback.code=function;hook.callback.codeRuntime=preloadCodeOwner(function);}}
    else hook.callback.function=boundedText(function,1024,"callback name");
    if(!hook.trigger && !hook.callback.code.bits && hook.callback.function.empty())return;
    dzActive_=true;dzInputHooks_.push_back(std::move(hook));
}
void ScriptSession::runDzCallback(const DzScriptCallback& callback,ScriptContext context,std::uint32_t trigger){
    contexts_.push_back(std::move(context));DzContextPop guard{contexts_};
    if(trigger && alive(trigger,NativeKind::Trigger) && std::get<Trigger>(objects_[trigger-handleBase].state).enabled){contexts_.back().trigger=trigger;if(triggerEvaluate(trigger) && alive(trigger,NativeKind::Trigger))triggerExecute(trigger);contexts_.back().trigger=0;}
    if(callback.code.bits){if(callback.codeRuntime && std::find(preloadRunning_.begin(),preloadRunning_.end(),callback.codeRuntime)==preloadRunning_.end())preloadRunning_.push_back(callback.codeRuntime);runtime_.start(callback.code);}
    else if(!callback.function.empty()){auto id=runtime_.module().functionId(callback.function);if(id==jass::none){if(externalExecute_ && externalExecute_(callback.function))return;throw std::runtime_error("Invalid DzAPI callback function: "+callback.function);}if(!runtime_.module().functions()[id].parameters.empty())throw std::runtime_error("Invalid DzAPI callback function: "+callback.function);runtime_.startDiscard(callback.function);}
}
void ScriptSession::dispatchDzInput(DzInputKind kind,std::uint32_t code,bool press,std::int32_t wheel){
    if(dzInputHooks_.empty() || !mainCompleted_ || failed_ || !localPlayer_)return;requireDzIdle("input dispatch");
    auto hooks=dzInputHooks_;for(auto& hook:hooks){if(hook.kind!=kind)continue;if((kind==DzInputKind::Key || kind==DzInputKind::Mouse) && (hook.code!=code || hook.press!=press))continue;ScriptContext context;context.triggerPlayer=handleBase+*localPlayer_;context.dzInput=true;context.dzKey=code;context.dzWheel=wheel;runDzCallback(hook.callback,std::move(context),hook.trigger);if(failed_)return;}
}
void ScriptSession::dzKeyInput(unsigned key,bool press){if(key>=dzKeys_.size())return;bool was=dzKeys_[key];dzKeys_[key]=press;if(press && was)return;dispatchDzInput(DzInputKind::Key,key,press,0);}
void ScriptSession::dzMouseButtonInput(unsigned button,bool press){if(button<1 || button>3)throw std::runtime_error("Invalid DzAPI mouse button input");dispatchDzInput(DzInputKind::Mouse,button,press,0);}
void ScriptSession::dzMouseMoveInput(){dispatchDzInput(DzInputKind::MouseMove,0,false,0);}
void ScriptSession::dzWheelInput(std::int32_t delta){if(delta)dispatchDzInput(DzInputKind::Wheel,0,false,delta);}
void ScriptSession::dzWindow(const DzWindowState& window){
    if(window.width<0 || window.height<0)throw std::runtime_error("Invalid DzAPI window state");bool resized=dzWindow_ && (dzWindow_->width!=window.width || dzWindow_->height!=window.height);dzWindow_=window;if(resized)dispatchDzInput(DzInputKind::Resize,0,false,0);
}
void ScriptSession::dzFrameUpdate(){
    if(dzFrameUpdates_.empty() || !mainCompleted_ || failed_ || !localPlayer_)return;requireDzIdle("frame update");auto updates=dzFrameUpdates_;for(auto& callback:updates){ScriptContext context;context.triggerPlayer=handleBase+*localPlayer_;runDzCallback(callback,std::move(context),0);if(failed_)return;}
}
void ScriptSession::dispatchDzFrameEvent(std::uint32_t frame,std::uint32_t event){
    auto found=dzFrameScripts_.find({frame,event});if(found==dzFrameScripts_.end() || !mapFrames_ || !mapFrames_->contains(frame) || !localPlayer_)return;auto callback=found->second;ScriptContext context;context.triggerPlayer=handleBase+*localPlayer_;context.dzFrame=frame;runDzCallback(callback,std::move(context),0);
}
std::vector<std::uint32_t> ScriptSession::dzFrameEventTargets(){
    std::erase_if(dzFrameScripts_,[&](auto& entry){return !mapFrames_ || !mapFrames_->contains(entry.first.first);});std::vector<std::uint32_t> result;for(auto& [key,callback]:dzFrameScripts_)if(result.empty() || result.back()!=key.first)result.push_back(key.first);return result;
}
void ScriptSession::dzUpdateFramePointer(std::span<const std::uint32_t> hovered){
    if(!mapFrames_ || !mainCompleted_ || failed_)return;requireDzIdle("frame pointer dispatch");dzFrameEventTargets();std::set<std::uint32_t> next;for(auto id:hovered)if(mapFrames_->contains(id) && mapFrames_->visible(id) && mapFrames_->enabled(id))next.insert(id);auto previous=std::move(dzHoveredFrames_);dzHoveredFrames_=next;for(auto id:previous)if(!next.contains(id)){dispatchDzFrameEvent(id,3);if(failed_)return;}for(auto id:next)if(!previous.contains(id)){dispatchDzFrameEvent(id,2);if(failed_)return;}
}
bool ScriptSession::dzHasFrameClick(std::uint32_t frame){
    if(!mapFrames_ || !mapFrames_->contains(frame) || !mapFrames_->visible(frame) || (!dzFrameScripts_.contains({frame,1}) && !dzFrameScripts_.contains({frame,4})))return false;for(auto current=frame;current;current=mapFrames_->node(current).parent)if(!mapFrames_->enabled(current))return false;return true;
}
bool ScriptSession::dzClickFrame(std::uint32_t frame){
    if(!dzHasFrameClick(frame) || !mainCompleted_ || failed_)return false;requireDzIdle("frame click");
    if(dzFrameScripts_.contains({frame,1}))dispatchDzFrameEvent(frame,1);
    if(!failed_ && dzFrameScripts_.contains({frame,4}))dispatchDzFrameEvent(frame,4);
    return true;
}
void ScriptSession::dzFrameMouseButton(std::uint32_t frame,bool press){
    if(!mapFrames_ || !mainCompleted_ || failed_ || !mapFrames_->contains(frame) || !mapFrames_->visible(frame))return;
    std::uint32_t event=press?5u:4u;
    if(!dzFrameScripts_.contains({frame,event}))return;
    requireDzIdle("frame mouse button");dispatchDzFrameEvent(frame,event);
}
void ScriptSession::dzFrameWheel(std::uint32_t frame,std::int32_t delta){
    if(!delta || !mapFrames_ || !mainCompleted_ || failed_ || !mapFrames_->contains(frame) || !mapFrames_->visible(frame))return;
    if(!dzFrameScripts_.contains({frame,6}) || !localPlayer_)return;
    requireDzIdle("frame wheel");
    auto callback=dzFrameScripts_.at({frame,6});
    ScriptContext context;context.triggerPlayer=handleBase+*localPlayer_;context.dzInput=true;context.dzWheel=delta;context.dzFrame=frame;
    runDzCallback(callback,std::move(context),0);
}
void ScriptSession::pumpDzSync(){
    auto count=dzSyncPending_.size();while(count-- && !failed_){auto message=std::move(dzSyncPending_.front());dzSyncPending_.pop_front();dzSyncPendingBytes_-=message.first.size()+message.second.size();if(localPlayer_)dispatchDzSync(*localPlayer_,message.first,message.second);}
}

void ScriptSession::bindDzNatives(){
    auto input=[this](DzInputKind kind,bool keyed,bool byCode){return [this,kind,keyed,byCode](auto& vm,auto a){if(keyed)registerDzInput(kind,a[0],a[1].bits,a[2].bits,a[3].bits!=0,a[4],byCode);else registerDzInput(kind,a[0],0,0,a[1].bits!=0,a[2],byCode);return vm.nothing();};};
    bind("DzTriggerRegisterKeyEvent","nothing",{"trigger","integer","integer","boolean","string"},input(DzInputKind::Key,true,false));
    bind("DzTriggerRegisterKeyEventByCode","nothing",{"trigger","integer","integer","boolean","code"},input(DzInputKind::Key,true,true));
    bind("DzTriggerRegisterMouseEvent","nothing",{"trigger","integer","integer","boolean","string"},input(DzInputKind::Mouse,true,false));
    bind("DzTriggerRegisterMouseEventByCode","nothing",{"trigger","integer","integer","boolean","code"},input(DzInputKind::Mouse,true,true));
    bind("DzTriggerRegisterMouseMoveEvent","nothing",{"trigger","boolean","string"},input(DzInputKind::MouseMove,false,false));
    bind("DzTriggerRegisterMouseMoveEventByCode","nothing",{"trigger","boolean","code"},input(DzInputKind::MouseMove,false,true));
    bind("DzTriggerRegisterMouseWheelEvent","nothing",{"trigger","boolean","string"},input(DzInputKind::Wheel,false,false));
    bind("DzTriggerRegisterMouseWheelEventByCode","nothing",{"trigger","boolean","code"},input(DzInputKind::Wheel,false,true));
    bind("DzTriggerRegisterWindowResizeEvent","nothing",{"trigger","boolean","string"},input(DzInputKind::Resize,false,false));
    bind("DzTriggerRegisterWindowResizeEventByCode","nothing",{"trigger","boolean","code"},input(DzInputKind::Resize,false,true));
    auto current=[this]()->const ScriptContext*{return contexts_.empty()?nullptr:&contexts_.back();};
    bind("DzGetTriggerKey","integer",{},[current](auto& vm,auto){auto c=current();return vm.integer(c && c->dzInput?int(c->dzKey):0);});
    bind("DzGetTriggerKeyPlayer","player",{},[current](auto& vm,auto){auto c=current();return vm.handle("player",c && c->dzInput?c->triggerPlayer:0);});
    bind("DzGetWheelDelta","integer",{},[current](auto& vm,auto){auto c=current();return vm.integer(c && c->dzInput?c->dzWheel:0);});
    bind("DzIsKeyDown","boolean",{"integer"},[this](auto& vm,auto a){return vm.boolean(a[0].bits<dzKeys_.size() && dzKeys_[a[0].bits]);});
    auto window=[this]()->const DzWindowState&{dzActive_=true;if(!dzWindow_)throw std::runtime_error("DzAPI window state is unavailable without a game window host");return *dzWindow_;};
    bind("DzGetWindowWidth","integer",{},[window](auto& vm,auto){return vm.integer(window().width);});
    bind("DzGetWindowHeight","integer",{},[window](auto& vm,auto){return vm.integer(window().height);});
    bind("DzGetWindowX","integer",{},[window](auto& vm,auto){return vm.integer(window().x);});
    bind("DzGetWindowY","integer",{},[window](auto& vm,auto){return vm.integer(window().y);});
    bind("DzIsWindowActive","boolean",{},[window](auto& vm,auto){return vm.boolean(window().active);});
    bind("DzGetMouseX","integer",{},[this,window](auto& vm,auto){window();return vm.integer(dzPointer_.screenX);});
    bind("DzGetMouseY","integer",{},[this,window](auto& vm,auto){window();return vm.integer(dzPointer_.screenY);});
    bind("DzGetMouseXRelative","integer",{},[this,window](auto& vm,auto){window();return vm.integer(dzPointer_.clientX);});
    bind("DzGetMouseYRelative","integer",{},[this,window](auto& vm,auto){window();return vm.integer(dzPointer_.clientY);});
    auto terrain=[this,window](unsigned axis){window();return dzPointer_.terrain?(*dzPointer_.terrain)[axis]:0.f;};
    bind("DzGetMouseTerrainX","real",{},[terrain](auto& vm,auto){return realValue(vm,terrain(0));});
    bind("DzGetMouseTerrainY","real",{},[terrain](auto& vm,auto){return realValue(vm,terrain(1));});
    bind("DzGetMouseTerrainZ","real",{},[terrain](auto& vm,auto){return realValue(vm,terrain(2));});
    bind("DzIsMouseOverUI","boolean",{},[this,window](auto& vm,auto){window();return vm.boolean(dzPointer_.overUi);});
    bind("DzGetMouseFocus","integer",{},[this,window](auto& vm,auto){window();auto id=dzPointer_.focusFrame;return vm.integer(id && mapFrames_ && mapFrames_->contains(id)?int(id):0);});
    bind("DzGetUnitUnderMouse","unit",{},[this,window](auto& vm,auto){window();auto id=dzPointer_.unit;return vm.handle("unit",id && units_.contains(id)?id:0);});
    bind("DzSetMousePos","nothing",{"integer","integer"},[this](auto& vm,auto a){dzActive_=true;dzRequestedMousePos_=std::pair{integer(a[0]),integer(a[1])};return vm.nothing();});
    bind("DzEnableWideScreen","nothing",{"boolean"},[this](auto& vm,auto a){dzActive_=true;dzWideScreen_=a[0].bits!=0;return vm.nothing();});
    bind("DzSetCustomFovFix","nothing",{"real"},[this](auto& vm,auto a){float value=number(a[0]);if(!std::isfinite(value))throw std::runtime_error("Invalid DzAPI FOV fix");dzActive_=true;dzCustomFovFix_=value;return vm.nothing();});
    bind("DzSetUnitModel","nothing",{"unit","string"},[this](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Unit))return vm.nothing();auto path=boundedText(a[1],1024,"unit model");auto& u=unit(a[0]);u.model=normalizeModelPath(std::move(path));return vm.nothing();});
    bind("DzSetUnitID","nothing",{"unit","integer"},[this](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Unit) || !definitions().contains(a[1].bits))return vm.nothing();auto& u=unit(a[0]);u.type=a[1].bits;return vm.nothing();});
    bind("DzGetColor","integer",{"integer","integer","integer","integer"},[](auto& vm,auto a){auto c=[&](size_t i){return a[i].bits&0xffu;};return vm.integer(std::bit_cast<std::int32_t>((c(3)<<24)|(c(0)<<16)|(c(1)<<8)|c(2)));});
    bind("DzExecuteFunc","nothing",{"string"},[this](auto& vm,auto a){auto name=boundedText(a[0],1024,"function name");auto id=vm.module().functionId(name);if(id==jass::none){if(externalExecute_ && externalExecute_(name))return vm.nothing();throw std::runtime_error("Invalid DzAPI thread entry: "+name);}if(!vm.module().functions()[id].parameters.empty())throw std::runtime_error("Invalid DzAPI thread entry: "+name);vm.startDiscard(name);return vm.nothing();});
    bind("DzTriggerRegisterSyncData","nothing",{"trigger","string","boolean"},[this](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Trigger))return vm.nothing();registerDzSync(a[0].bits,boundedText(a[1],1024,"sync prefix"));return vm.nothing();});
    bind("DzSyncData","nothing",{"string","string"},[this](auto& vm,auto a){if(!localPlayer_ || networkPlayerSlot(*localPlayer_))throw std::runtime_error("DzSyncData network delivery is not implemented");auto prefix=boundedText(a[0],1024,"sync prefix"),data=boundedText(a[1],65536,"sync data");constexpr size_t budget=8u*1024u*1024u;if(dzSyncPending_.size()>=1024 || prefix.size()+data.size()>budget-dzSyncPendingBytes_)throw std::runtime_error("DzSyncData queue exceeds budget");dzSyncPendingBytes_+=prefix.size()+data.size();dzSyncPending_.emplace_back(std::move(prefix),std::move(data));dzActive_=true;return vm.nothing();});
    bind("DzGetTriggerSyncData","string",{},[this](auto& vm,auto){auto sync=currentDzSync();return sync?vm.string(sync->second):vm.string({});});
    bind("DzGetTriggerSyncPlayer","player",{},[this](auto& vm,auto){auto sync=currentDzSync();return vm.handle("player",sync?sync->first:0);});
    bindDzFrameNatives();bindDzPlatformNatives();
    // JAPI effect, damage, unit, item, ability and Lua-expression natives.
    bind("EXSetEffectXY","nothing",{"effect","real","real"},[this](auto& vm,auto a){setJapiEffectXY(a[0].bits,number(a[1]),number(a[2]));return vm.nothing();});
    bind("EXSetEffectZ","nothing",{"effect","real"},[this](auto& vm,auto a){setJapiEffectZ(a[0].bits,number(a[1]));return vm.nothing();});
    bind("EXSetEffectSize","nothing",{"effect","real"},[this](auto& vm,auto a){setJapiEffectSize(a[0].bits,number(a[1]));return vm.nothing();});
    bind("EXSetEffectSpeed","nothing",{"effect","real"},[this](auto& vm,auto a){float s=number(a[1]);if(!std::isfinite(s) || s<0)throw std::runtime_error("Invalid JAPI effect speed");if(alive(a[0].bits,NativeKind::Effect))effects_.at(a[0].bits)->speed=s;return vm.nothing();});
    bind("EXGetEffectX","real",{"effect"},[this](auto& vm,auto a){return realValue(vm,japiEffectCoordinate(a[0].bits,true));});
    bind("EXGetEffectY","real",{"effect"},[this](auto& vm,auto a){return realValue(vm,japiEffectCoordinate(a[0].bits,false));});
    bind("EXGetEffectZ","real",{"effect"},[this](auto& vm,auto a){return realValue(vm,japiEffectZ(a[0].bits));});
    bind("EXGetEffectSize","real",{"effect"},[this](auto& vm,auto a){return realValue(vm,japiEffectSize(a[0].bits));});
    for(auto [name,op]:std::initializer_list<std::pair<const char*,unsigned>>{{"EXEffectMatRotateX",0},{"EXEffectMatRotateY",1},{"EXEffectMatRotateZ",2}})bind(name,"nothing",{"effect","real"},[this,op](auto& vm,auto a){japiEffectMatrix(a[0].bits,op,{number(a[1]),0,0});return vm.nothing();});
    bind("EXEffectMatScale","nothing",{"effect","real","real","real"},[this](auto& vm,auto a){japiEffectMatrix(a[0].bits,3,{number(a[1]),number(a[2]),number(a[3])});return vm.nothing();});
    bind("EXEffectMatReset","nothing",{"effect"},[this](auto& vm,auto a){japiEffectMatrix(a[0].bits,4,{});return vm.nothing();});
    bind("EXGetEventDamageData","integer",{"integer"},[this](auto& vm,auto a){return vm.integer(std::bit_cast<std::int32_t>(japiEventDamageData(a[0].bits)));});
    bind("EXSetEventDamage","boolean",{"real"},[this](auto& vm,auto a){return vm.boolean(setJapiEventDamage(jass::Real::fromBits(a[0].bits)));});
    bind("EXGetAbilityId","integer",{"ability"},[this](auto& vm,auto a){return vm.integer(std::bit_cast<std::int32_t>(japiAbilityId(a[0].bits)));});
    bind("EXGetUnitAbilityByIndex","ability",{"unit","integer"},[this](auto& vm,auto a){return vm.handle("ability",japiUnitAbilityByIndex(a[0].bits,a[1].bits));});
    bind("EXSetUnitFacing","nothing",{"unit","real"},[this](auto& vm,auto a){setJapiVisualFacing(a[0].bits,number(a[1]));return vm.nothing();});
    bind("EXPauseUnit","nothing",{"unit","boolean"},[this](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Unit))return vm.nothing();auto u=units_.at(a[0].bits);bool pause=a[1].bits!=0;if(u->paused==pause)return vm.nothing();u->paused=pause;++fogRevision_;if(pause && u->cast)cancelCast(*u);return vm.nothing();});
    bind("EXSetUnitMoveType","nothing",{"unit","integer"},[this](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Unit))return vm.nothing();auto& u=unit(a[0]);switch(a[1].bits){case 0:u.movementType.clear();break;case 1:case 2:u.movementType="foot";break;case 4:u.movementType="fly";break;case 8:u.movementType="hover";break;case 16:u.movementType="float";break;case 32:u.movementType="amph";break;case 64:u.movementType="foot";break;default:throw std::runtime_error("Unsupported JAPI unit move type: "+std::to_string(a[1].bits));}return vm.nothing();});
    bind("EXDisplayChat","nothing",{"player","integer","string"},[this](auto& vm,auto a){if(!a[0].bits || !alive(a[0].bits,NativeKind::Player))return vm.nothing();auto id=playerId(a[0]);auto channel=integer(a[1]);auto message=boundedText(a[2],65536,"chat message");if(!localPlayer_)return vm.nothing();auto prefix=channel==1?"[盟友] ":channel==2?"[观察者] ":channel==3?"[私聊] ":"";displayText(*localPlayer_,0,0,10,std::string(prefix)+config_.players[id].name+": "+message,0xffff,true);return vm.nothing();});
    bind("EXGetItemDataString","string",{"integer","integer"},[this](auto& vm,auto a){auto key=itemDataKey(a[1].bits);if(!key || !definitions().contains(a[0].bits,true))return vm.string({});if(auto custom=japiItemDataString(a[0].bits,key))return vm.string(*custom);return vm.string(mapString(definitions().field(a[0].bits,"Profile",key),strings_));});
    bind("EXSetItemDataString","boolean",{"integer","integer","string"},[this](auto& vm,auto a){auto key=itemDataKey(a[1].bits);if(!key || !definitions().contains(a[0].bits,true))return vm.boolean(false);auto value=boundedText(a[2],65536,"item data string");itemDataStrings_[{a[0].bits,key}]=value;if(std::string_view(key)=="Name" || std::string_view(key)=="Art"){for(auto& [id,it]:items_)if(it->type==a[0].bits){if(std::string_view(key)=="Name")it->name=value;else{it->icon=value;if(auto comma=it->icon.find(',');comma!=std::string::npos)it->icon.resize(comma);}}}return vm.boolean(true);});
    bind("EXGetAbilityDataInteger","integer",{"ability","integer","integer"},[this](auto& vm,auto a){auto type=japiAbilityId(a[0].bits),level=a[1].bits,field=a[2].bits;auto key=abilityDataIntKey(field);if(!type || !key || !level || !definitions().ability(type))return vm.integer(0);if(auto found=abilityDataOverrides_.find({type,level,field});found!=abilityDataOverrides_.end()){if(auto v=std::get_if<std::int32_t>(&found->second))return vm.integer(*v);}if(field==117){auto raw=definitions().field(type,"AbilityData","UnitID"+std::to_string(level));return vm.integer(raw.size()==4?std::bit_cast<std::int32_t>(ObjectData::code(raw)):0);}return vm.integer(int(std::lround(definitions().number(type,"AbilityData",std::string(key)+std::to_string(level)))));});
    bind("EXSetAbilityDataInteger","boolean",{"ability","integer","integer","integer"},[this](auto& vm,auto a){auto type=japiAbilityId(a[0].bits),level=a[1].bits,field=a[2].bits;auto key=abilityDataIntKey(field);if(!type || !key || !level || !definitions().ability(type))return vm.boolean(false);abilityDataOverrides_[{type,level,field}]=integer(a[3]);return vm.boolean(true);});
    bind("EXGetAbilityDataReal","real",{"ability","integer","integer"},[this](auto& vm,auto a){auto type=japiAbilityId(a[0].bits),level=a[1].bits,field=a[2].bits;auto key=abilityDataRealKey(field);if(!type || !key || !level || !definitions().ability(type))return realValue(vm,0.f);if(auto found=abilityDataOverrides_.find({type,level,field});found!=abilityDataOverrides_.end()){if(auto v=std::get_if<float>(&found->second))return realValue(vm,*v);}return realValue(vm,definitions().number(type,"AbilityData",std::string(key)+std::to_string(level)));});
    bind("EXSetAbilityDataReal","boolean",{"ability","integer","integer","real"},[this](auto& vm,auto a){auto type=japiAbilityId(a[0].bits),level=a[1].bits,field=a[2].bits;auto key=abilityDataRealKey(field);float value=number(a[3]);if(!type || !key || !level || !std::isfinite(value) || !definitions().ability(type))return vm.boolean(false);abilityDataOverrides_[{type,level,field}]=value;return vm.boolean(true);});
    bind("EXSetAbilityAEmeDataA","boolean",{"ability","integer"},[this](auto& vm,auto a){auto type=japiAbilityId(a[0].bits);if(!type || !definitions().ability(type))return vm.boolean(false);abilityDataOverrides_[{type,1u,117u}]=integer(a[1]);return vm.boolean(true);});
    bind("EXBlendButtonIcon","boolean",{"string","string","string"},[this](auto& vm,auto a){
        auto overlayPath=boundedText(a[0],8192,"blend overlay texture");
        auto basePath=boundedText(a[1],8192,"blend base texture");
        auto destPath=boundedText(a[2],8192,"blend output texture");
        if(overlayPath.empty() || basePath.empty() || destPath.empty())return vm.boolean(false);
        auto loadBytes=[&](const std::string& path)->std::optional<Bytes>{
            if(auto ov=dzTextureOverride(path))return ov;
            auto& res=requireWorld().resources();
            if(auto m=res.readTexture(path))return m->bytes;
            if(auto m=res.read(path))return m->bytes;
            return {};
        };
        auto ovBytes=loadBytes(overlayPath),baseBytes=loadBytes(basePath);
        if(!ovBytes || !baseBytes)return vm.boolean(false);
        try{
            if(!dzImages_)dzImages_=std::make_unique<Images>(requireWorld().resources().root());
            auto ov=dzImages_->decode(*ovBytes);
            auto base=dzImages_->decode(*baseBytes);
            if(!ov.width || !ov.height || !base.width || !base.height || base.width>1024 || base.height>1024)return vm.boolean(false);
            Image blended=base;
            for(unsigned y=0;y<base.height;++y){
                unsigned oy=unsigned(std::uint64_t(y)*ov.height/base.height);
                for(unsigned x=0;x<base.width;++x){
                    unsigned ox=unsigned(std::uint64_t(x)*ov.width/base.width);
                    std::uint32_t bp=base.pixels[size_t(y)*base.width+x],op=ov.pixels[size_t(oy)*ov.width+ox];
                    unsigned oa=(op>>24)&255,inv=255-oa,ba=(bp>>24)&255;
                    unsigned r=(((op>>16)&255)*oa+((bp>>16)&255)*inv+127)/255;
                    unsigned g=(((op>>8)&255)*oa+((bp>>8)&255)*inv+127)/255;
                    unsigned b=((op&255)*oa+(bp&255)*inv+127)/255;
                    unsigned outA=std::min(255u,oa+(ba*inv+127)/255);
                    blended.pixels[size_t(y)*base.width+x]=(outA<<24)|(r<<16)|(g<<8)|b;
                }
            }
            auto encoded=encodeTga32(blended);
            auto key=normalizeTextureKey(destPath);
            constexpr size_t maxBytes=64u*1024u*1024u;
            size_t oldSize=dzTextures_.contains(key)?dzTextures_.at(key).size():0;
            if((!dzTextures_.contains(key) && dzTextures_.size()>=2048) || encoded.size()>maxBytes-(dzTextureBytes_-oldSize))return vm.boolean(false);
            dzTextureBytes_=dzTextureBytes_-oldSize+encoded.size();
            dzTextures_[std::move(key)]=std::move(encoded);
            ++dzTextureRevision_;
            dzActive_=true;
            return vm.boolean(true);
        }catch(const std::exception&){
            return vm.boolean(false);
        }
    });
    bind("EXExecuteScript","string",{"string"},[this](auto& vm,auto a){
        if(!a[0].text)return vm.string({});
        auto& source=*a[0].text;
        if(source.size()>1024*1024 || source.find('\0')!=std::string::npos)throw std::runtime_error("Invalid EXExecuteScript Lua input");
        auto& lua=dzLua();
        std::string expression="return ("+source+")";
        LuaResult result;
        try{
            result=lua.execute({reinterpret_cast<const std::uint8_t*>(expression.data()),expression.size()},"EXExecuteScript",10000000);
        }catch(const std::exception&){
            try{
                result=lua.execute({reinterpret_cast<const std::uint8_t*>(source.data()),source.size()},"EXExecuteScript",10000000);
            }catch(const std::exception&){
                return vm.string({});
            }
        }
        if(result.kind==LuaResult::Kind::String)return vm.string(result.text);
        if(result.kind==LuaResult::Kind::Integer)return vm.string(std::to_string(result.integer));
        if(result.kind==LuaResult::Kind::Number){char buf[64];std::snprintf(buf,sizeof(buf),"%.14g",result.number);return vm.string(buf);}
        return vm.string({});
    });
}

void ScriptSession::bindDzFrameNatives(){
    auto frames=[this]()->MapFrames&{return dzFrames();};
    auto frameScript=[this](std::uint32_t frame,std::uint32_t event,DzScriptCallback callback){
        auto& map=dzFrames();auto& node=map.node(frame);if(node.standardInfo)throw std::runtime_error("Standard information frame events are not implemented");
        if(event<1 || event>13)throw std::runtime_error("Unsupported DzAPI frame event: "+std::to_string(event));
        if(callback.sync && localPlayer_ && networkPlayerSlot(*localPlayer_))throw std::runtime_error("Synchronized DzAPI frame events are not implemented for network sessions");
        rejectSoloReplay("单机回放不记录 DzAPI 界面事件。");
        auto key=std::pair{frame,event};if(!callback.code.bits && callback.function.empty()){dzFrameScripts_.erase(key);return;}
        if(!dzFrameScripts_.contains(key) && dzFrameScripts_.size()>=4096)throw std::runtime_error("DzAPI frame event budget exceeded");dzFrameScripts_.insert_or_assign(key,std::move(callback));};
    bind("DzLoadToc","nothing",{"string"},[this,frames](auto& vm,auto a){frames();auto path=boundedText(a[0],8192,"TOC name");if(path.empty())throw std::runtime_error("Invalid DzAPI TOC name");frameDefinitions_->loadToc(requireWorld().resources(),path,{});return vm.nothing();});
    bind("DzGetGameUI","integer",{},[frames](auto& vm,auto){return vm.integer(int(frames().root()));});
    bind("DzFrameHideInterface","nothing",{},[this](auto& vm,auto){dzActive_=true;dzInterfaceHidden_=true;if(!dzBlackBorders_)dzBlackBorders_=std::pair{0.f,0.f};return vm.nothing();});
    bind("DzFrameEditBlackBorders","nothing",{"real","real"},[this](auto& vm,auto a){float upper=number(a[0]),bottom=number(a[1]);if(!std::isfinite(upper) || !std::isfinite(bottom) || upper<0 || bottom<0 || upper+bottom>.6f)throw std::runtime_error("Invalid DzAPI black borders");dzActive_=true;dzBlackBorders_=std::pair{upper,bottom};return vm.nothing();});
    bind("DzCreateFrame","integer",{"string","integer","integer"},[frames](auto& vm,auto a){auto name=boundedText(a[0],8192,"frame name");return vm.integer(int(frames().create(name,a[1].bits,a[2].bits)));});
    bind("DzCreateSimpleFrame","integer",{"string","integer","integer"},[frames](auto& vm,auto a){auto name=boundedText(a[0],8192,"frame name");return vm.integer(int(frames().createSimple(name,a[1].bits,a[2].bits)));});
    bind("DzCreateFrameByTagName","integer",{"string","string","integer","string","integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().createByType(boundedText(a[0],64,"frame type"),boundedText(a[1],8192,"frame name"),a[2].bits,boundedText(a[3],8192,"frame template"),a[4].bits)));});
    bind("DzDestroyFrame","nothing",{"integer"},[this,frames](auto& vm,auto a){if(dzCagedFrame_==a[0].bits)dzCagedFrame_=0;frames().destroy(a[0].bits);dzFrameEventTargets();std::erase_if(dzHoveredFrames_,[&](auto id){return !mapFrames_->contains(id);});return vm.nothing();});
    bind("DzFrameFindByName","integer",{"string","integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().find(boundedText(a[0],8192,"frame name"),a[1].bits)));});
    for(auto [name,type]:std::initializer_list<std::pair<const char*,const char*>>{{"DzSimpleFrameFindByName","SIMPLEFRAME"},{"DzSimpleTextureFindByName","TEXTURE"},{"DzSimpleFontStringFindByName","STRING"}})bind(name,"integer",{"string","integer"},[frames,type](auto& vm,auto a){return vm.integer(int(frames().findSimple(boundedText(a[0],8192,"frame name"),a[1].bits,type)));});
    bind("DzFrameSetParent","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setParent(a[0].bits,a[1].bits);return vm.nothing();});
    bind("DzFrameSetPoint","nothing",{"integer","integer","integer","integer","real","real"},[frames](auto& vm,auto a){frames().setPoint(a[0].bits,a[1].bits,a[2].bits,a[3].bits,number(a[4]),number(a[5]),true);return vm.nothing();});
    bind("DzFrameSetAbsolutePoint","nothing",{"integer","integer","real","real"},[frames](auto& vm,auto a){auto& map=frames();map.setPoint(a[0].bits,a[1].bits,map.root(),6,number(a[2]),number(a[3]),true);return vm.nothing();});
    bind("DzFrameSetAllPoints","boolean",{"integer","integer"},[frames](auto& vm,auto a){auto& map=frames();map.setPoint(a[0].bits,0,a[1].bits,0,0,0,true);map.setPoint(a[0].bits,8,a[1].bits,8,0,0,true);return vm.boolean(true);});
    bind("DzFrameClearAllPoints","nothing",{"integer"},[frames](auto& vm,auto a){frames().clearPoints(a[0].bits,true);return vm.nothing();});
    bind("DzFrameSetSize","nothing",{"integer","real","real"},[frames](auto& vm,auto a){frames().setSize(a[0].bits,number(a[1]),number(a[2]),true);return vm.nothing();});
    bind("DzFrameSetScale","nothing",{"integer","real"},[frames](auto& vm,auto a){frames().setScale(a[0].bits,number(a[1]));return vm.nothing();});
    bind("DzFrameSetText","nothing",{"integer","string"},[frames](auto& vm,auto a){frames().setText(a[0].bits,boundedText(a[1],65536,"frame text"));return vm.nothing();});
    bind("DzFrameGetText","string",{"integer"},[frames](auto& vm,auto a){return vm.string(frames().text(a[0].bits));});
    bind("DzFrameSetTextAlignment","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setTextAlignment(a[0].bits,a[1].bits);return vm.nothing();});
    bind("DzFrameSetTextSizeLimit","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setTextSizeLimit(a[0].bits,a[1].bits);return vm.nothing();});
    bind("DzFrameGetTextSizeLimit","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().textSizeLimit(a[0].bits)));});
    bind("DzFrameSetTexture","nothing",{"integer","string","integer"},[frames](auto& vm,auto a){if(a[2].bits>1)throw std::runtime_error("Invalid DzAPI frame texture flag");frames().setTexture(a[0].bits,boundedText(a[1],8192,"frame texture"),a[2].bits!=0);return vm.nothing();});
    bind("DzFrameSetTextColor","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setTextColor(a[0].bits,a[1].bits);return vm.nothing();});
    bind("DzFrameSetVertexColor","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setVertexColor(a[0].bits,a[1].bits);return vm.nothing();});
    bind("DzFrameSetAlpha","nothing",{"integer","integer"},[frames](auto& vm,auto a){if(a[1].bits>255)throw std::runtime_error("Invalid DzAPI frame alpha");frames().setAlpha(a[0].bits,std::uint8_t(a[1].bits),true);return vm.nothing();});
    bind("DzFrameGetAlpha","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(frames().alpha(a[0].bits));});
    bind("DzFrameSetEnable","nothing",{"integer","boolean"},[frames](auto& vm,auto a){frames().enable(a[0].bits,a[1].bits!=0,true);return vm.nothing();});
    bind("DzFrameGetEnable","boolean",{"integer"},[frames](auto& vm,auto a){return vm.boolean(frames().enabled(a[0].bits));});
    bind("DzFrameShow","nothing",{"integer","boolean"},[frames](auto& vm,auto a){frames().visible(a[0].bits,a[1].bits!=0,true);return vm.nothing();});
    bind("DzFrameSetPriority","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setLevel(a[0].bits,integer(a[1]),true);return vm.nothing();});
    bind("DzFrameGetParent","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().node(a[0].bits).parent));});
    bind("DzFrameSetFont","nothing",{"integer","string","real","integer"},[frames](auto& vm,auto a){frames().setFont(a[0].bits,boundedText(a[1],8192,"font file"),number(a[2]),a[3].bits);return vm.nothing();});
    bind("DzFrameSetValue","nothing",{"integer","real"},[frames](auto& vm,auto a){frames().setValue(a[0].bits,number(a[1]));return vm.nothing();});
    bind("DzFrameGetValue","real",{"integer"},[frames](auto& vm,auto a){return realValue(vm,frames().value(a[0].bits));});
    bind("DzFrameSetMinMaxValue","nothing",{"integer","real","real"},[frames](auto& vm,auto a){frames().setMinMaxValue(a[0].bits,number(a[1]),number(a[2]));return vm.nothing();});
    bind("DzFrameSetStepValue","nothing",{"integer","real"},[frames](auto& vm,auto a){frames().setStepValue(a[0].bits,number(a[1]));return vm.nothing();});
    bind("DzFrameSetTooltip","nothing",{"integer","integer"},[frames](auto& vm,auto a){frames().setTooltip(a[0].bits,a[1].bits);return vm.nothing();});
    bind("DzFrameSetFocus","boolean",{"integer","boolean"},[frames](auto& vm,auto a){return vm.boolean(frames().setFocus(a[0].bits,a[1].bits!=0));});
    bind("DzFrameCageMouse","nothing",{"integer","boolean"},[this,frames](auto& vm,auto a){frames().node(a[0].bits);dzCagedFrame_=a[1].bits?a[0].bits:0;return vm.nothing();});
    bind("DzFrameSetModel","nothing",{"integer","string","integer","integer"},[frames](auto& vm,auto a){if(a[2].bits || a[3].bits)throw std::runtime_error("Unsupported DzAPI frame model options");frames().setModel(a[0].bits,boundedText(a[1],8192,"frame model"));return vm.nothing();});
    bind("DzFrameSetAnimate","nothing",{"integer","integer","boolean"},[this,frames](auto& vm,auto a){frames().setAnimation(a[0].bits,a[1].bits,a[2].bits!=0,simulationTime_);return vm.nothing();});
    bind("DzFrameSetAnimateOffset","nothing",{"integer","real"},[frames](auto& vm,auto a){frames().setAnimationOffset(a[0].bits,number(a[1]));return vm.nothing();});
    bind("DzFrameGetPortrait","integer",{},[frames](auto& vm,auto){return vm.integer(int(frames().portrait()));});
    bind("DzFrameGetMinimap","integer",{},[frames](auto& vm,auto){return vm.integer(int(frames().minimap()));});
    bind("DzFrameGetMinimapButton","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().minimapButton(a[0].bits)));});
    bind("DzFrameGetHeroBarButton","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().heroBarButton(a[0].bits)));});
    bind("DzFrameGetHeroHPBar","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().heroHpBar(a[0].bits)));});
    bind("DzFrameGetHeroManaBar","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().heroManaBar(a[0].bits)));});
    bind("DzFrameGetTooltip","integer",{},[frames](auto& vm,auto){return vm.integer(int(frames().tooltip()));});
    bind("DzFrameGetCommandBarButton","integer",{"integer","integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().commandButton(a[0].bits,a[1].bits)));});
    bind("DzFrameGetItemBarButton","integer",{"integer"},[frames](auto& vm,auto a){return vm.integer(int(frames().itemButton(a[0].bits)));});
    bind("DzFrameSetScript","nothing",{"integer","integer","string","boolean"},[frameScript](auto& vm,auto a){DzScriptCallback callback;callback.function=boundedText(a[2],1024,"frame callback");callback.sync=a[3].bits!=0;frameScript(a[0].bits,a[1].bits,std::move(callback));return vm.nothing();});
    bind("DzFrameSetScriptByCode","nothing",{"integer","integer","code","boolean"},[this,frameScript](auto& vm,auto a){DzScriptCallback callback;if(a[2].bits){callback.code=a[2];callback.codeRuntime=preloadCodeOwner(a[2]);}callback.sync=a[3].bits!=0;frameScript(a[0].bits,a[1].bits,std::move(callback));return vm.nothing();});
    auto update=[this](DzScriptCallback callback){if(!callback.code.bits && callback.function.empty())return;rejectSoloReplay("单机回放不记录 DzAPI 帧回调。");if(dzFrameUpdates_.size()>=256)throw std::runtime_error("DzAPI frame update budget exceeded");dzActive_=true;dzFrameUpdates_.push_back(std::move(callback));};
    bind("DzFrameSetUpdateCallback","nothing",{"string"},[update](auto& vm,auto a){DzScriptCallback callback;callback.function=boundedText(a[0],1024,"update callback");update(std::move(callback));return vm.nothing();});
    bind("DzFrameSetUpdateCallbackByCode","nothing",{"code"},[this,update](auto& vm,auto a){DzScriptCallback callback;if(a[0].bits){callback.code=a[0];callback.codeRuntime=preloadCodeOwner(a[0]);}update(std::move(callback));return vm.nothing();});
    bind("DzGetTriggerUIEventFrame","integer",{},[this](auto& vm,auto){return vm.integer(contexts_.empty()?0:int(contexts_.back().dzFrame));});
    bind("DzGetTriggerUIEventPlayer","player",{},[this](auto& vm,auto){return vm.handle("player",!contexts_.empty() && contexts_.back().dzFrame?contexts_.back().triggerPlayer:0);});
    bind("DzClickFrame","nothing",{"integer"},[this](auto& vm,auto a){if(dzHasFrameClick(a[0].bits)){auto found=dzFrameScripts_.find({a[0].bits,1});if(found==dzFrameScripts_.end())found=dzFrameScripts_.find({a[0].bits,4});if(found!=dzFrameScripts_.end()){ScriptContext context=contexts_.empty()?ScriptContext{}:contexts_.back();context.triggerPlayer=localPlayer_?handleBase+*localPlayer_:0;context.dzFrame=a[0].bits;runDzCallback(found->second,std::move(context),0);}}return vm.nothing();});
}

void ScriptSession::bindDzPlatformNatives(){
    auto player=[this](const jass::Value& value){if(!value.bits)throw std::runtime_error("DzAPI platform call requires a player");return playerId(value);};
    auto archiveKey=[](const jass::Value& value){auto key=boundedText(value,1024,"archive key");if(key.empty())throw std::runtime_error("Invalid DzAPI archive key");return key;};
    bind("DzAPI_Map_GetServerValue","string",{"player","string"},[this,player,archiveKey](auto& vm,auto a){auto id=player(a[0]);return vm.string(dzPlatform().read(id,archiveKey(a[1])).value_or(std::string{}));});
    bind("DzAPI_Map_SaveServerValue","boolean",{"player","string","string"},[this,player,archiveKey](auto& vm,auto a){auto id=player(a[0]);auto key=archiveKey(a[1]);return vm.boolean(dzPlatform().save(id,key,boundedText(a[2],65536,"archive value")));});
    bind("DzAPI_Map_GetServerValueErrorCode","integer",{"player"},[this,player](auto& vm,auto a){player(a[0]);dzPlatform();return vm.integer(0);});
    bind("DzAPI_Map_GetPublicArchive","string",{"player","string"},[this,player,archiveKey](auto& vm,auto a){auto id=player(a[0]);return vm.string(dzPlatform().read(id,"public/"+archiveKey(a[1])).value_or(std::string{}));});
    bind("DzAPI_Map_SavePublicArchive","boolean",{"player","string","string"},[this,player,archiveKey](auto& vm,auto a){auto id=player(a[0]);auto key="public/"+archiveKey(a[1]);return vm.boolean(dzPlatform().save(id,key,boundedText(a[2],65536,"archive value")));});
    // Offline accounts own no platform entitlements: no VIP, guild, ladder rank, mall items or server drops.
    for(auto name:{"DzAPI_Map_GetPlatformVIP","DzAPI_Map_GetGuildRole","DzAPI_Map_GetLadderLevel","DzAPI_Map_GetLadderRank","DzAPI_Map_GetMapLevelRank"})bind(name,"integer",{"player"},[player](auto& vm,auto a){player(a[0]);return vm.integer(0);});
    bind("DzAPI_Map_GetMapLevel","integer",{"player"},[player](auto& vm,auto a){player(a[0]);return vm.integer(1);});
    for(auto name:{"DzAPI_Map_IsBlueVIP","DzAPI_Map_IsRedVIP"})bind(name,"boolean",{"player"},[player](auto& vm,auto a){player(a[0]);return vm.boolean(false);});
    bind("DzAPI_Map_GetGuildName","string",{"player"},[player](auto& vm,auto a){player(a[0]);return vm.string({});});
    bind("DzAPI_Map_HasMallItem","boolean",{"player","string"},[player](auto& vm,auto a){player(a[0]);return vm.boolean(false);});
    bind("DzAPI_Map_GetServerArchiveDrop","string",{"player","string"},[player](auto& vm,auto a){player(a[0]);return vm.string({});});
    bind("DzAPI_Map_GetServerArchiveEquip","integer",{"player","string"},[player](auto& vm,auto a){player(a[0]);return vm.integer(0);});
    for(auto name:{"DzAPI_Map_IsRPGLadder","DzAPI_Map_IsRPGLobby"})bind(name,"boolean",{},[](auto& vm,auto){return vm.boolean(false);});
    bind("DzAPI_Map_GetMatchType","integer",{},[](auto& vm,auto){return vm.integer(0);});
    bind("DzAPI_Map_GetGameStartTime","integer",{},[this](auto& vm,auto){if(!dzGameStartTime_)dzGameStartTime_=std::int64_t(std::time(nullptr));return vm.integer(std::int32_t(dzGameStartTime_));});
    bind("DzAPI_Map_GetMapConfig","string",{"string"},[](auto& vm,auto a){boundedText(a[0],1024,"map config key");return vm.string({});});
    bind("DzAPI_Map_GetActivityData","string",{},[](auto& vm,auto){return vm.string({});});
    // Platform reports are recorded in the local archive under a report namespace instead of being uploaded.
    auto report=[this,player](const char* kind){return [this,player,kind](auto& vm,auto a){auto id=player(a[0]);auto key=std::string(kind)+"/"+boundedText(a[1],1024,"report key");dzPlatform().save(id,key,boundedText(a[2],65536,"report value"));return vm.nothing();};};
    bind("DzAPI_Map_Stat_SetStat","nothing",{"player","string","string"},report("stat"));
    bind("DzAPI_Map_Ladder_SetStat","nothing",{"player","string","string"},report("ladder"));
    bind("DzAPI_Map_Ladder_SetPlayerStat","nothing",{"player","string","string"},report("ladder-player"));
    bind("DzAPI_Map_MissionComplete","nothing",{"player","string","string"},report("mission"));
    bind("DzAPI_Map_OrpgTrigger","nothing",{"player","string"},[this,player](auto& vm,auto a){auto id=player(a[0]);dzPlatform().save(id,"orpg/"+boundedText(a[1],1024,"report key"),"1");return vm.nothing();});
    bind("DzAPI_Map_UseConsumablesItem","nothing",{"player","string"},[player](auto&,auto a)->jass::Value{player(a[0]);throw std::runtime_error("DzAPI consumable mall item is not owned by the offline account: "+boundedText(a[1],1024,"mall key"));});
    auto extraPlayer=[this](const jass::Value& value)->std::optional<unsigned>{if(!value.bits)return {};return playerId(value);};
    auto extra=[this,extraPlayer](std::uint32_t type,jass::Value who,const jass::Value& first,const jass::Value& second,std::int32_t option)->std::variant<bool,std::int32_t,std::string>{
        auto id=extraPlayer(who);auto requirePlayer=[&]{if(!id)throw std::runtime_error("DzAPI extra data "+std::to_string(type)+" requires a player");return *id;};
        switch(type){
        case 34:{auto p=requirePlayer();dzPlatform().save(p,"statistics/"+boundedText(first,1024,"statistics key"),std::to_string(option));return true;}
        case 36:return dzPlatform().readShared(boundedText(first,1024,"global key")).value_or(std::string{});
        case 37:dzPlatform().saveShared(boundedText(first,1024,"global key"),boundedText(second,65536,"global value"));return std::string{};
        case 38:{auto p=requirePlayer();return dzPlatform().read(p,"archive/"+boundedText(first,1024,"archive key")).value_or(std::string{});}
        case 39:{auto p=requirePlayer();auto key="archive/"+boundedText(first,1024,"archive key");return dzPlatform().save(p,key,boundedText(second,65536,"archive value"));}
        case 69:{auto p=requirePlayer();auto key="result/"+boundedText(first,1024,"result key");dzPlatform().save(p,key,boundedText(second,65536,"result value"));return std::int32_t(0);}
        case 55:{auto p=requirePlayer();auto& slot=config_.players[p];return slot.controller==0 && slot.slotState==1;}
        case 77:requirePlayer();return true; // the offline mall item list is complete (and empty) as soon as the game starts
        case 40:case 42:case 43:case 44:case 48:case 49:case 50:case 53:case 60:case 61:case 62:case 63:case 64:case 66:case 72:case 73:if(type!=40)requirePlayer();return false;
        case 41:case 45:case 46:case 47:case 51:case 52:case 54:case 56:case 57:case 58:case 59:case 65:case 68:case 70:if(type!=51)requirePlayer();return std::int32_t(0);
        default:throw std::runtime_error("Unsupported DzAPI extra data request: "+std::to_string(type));
        }};
    auto request=[extra](const char* expected){return [extra,expected](auto& vm,auto a)->jass::Value{auto value=extra(a[0].bits,a[1],a[2],a[3],integer(a[5]));std::string_view kind=expected;if(kind=="boolean"){if(auto b=std::get_if<bool>(&value))return vm.boolean(*b);}else if(kind=="integer"){if(auto i=std::get_if<std::int32_t>(&value))return vm.integer(*i);}else if(kind=="string"){if(auto s=std::get_if<std::string>(&value))return vm.string(*s);}throw std::runtime_error("DzAPI extra data "+std::to_string(a[0].bits)+" returns another type than "+std::string(kind));};};
    bind("RequestExtraBooleanData","boolean",{"integer","player","string","string","boolean","integer","integer","integer"},request("boolean"));
    bind("RequestExtraIntegerData","integer",{"integer","player","string","string","boolean","integer","integer","integer"},request("integer"));
    bind("RequestExtraStringData","string",{"integer","player","string","string","boolean","integer","integer","integer"},request("string"));
}
}
