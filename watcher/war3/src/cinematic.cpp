// Author: MiYu. DirectShow playback of original BLZ0 AVI files without registration or extraction.
#include "cinematic.h"
#include "renderer.h"
#include <dshow.h>
#include <algorithm>
#include <cctype>
#include <cmath>

namespace war3 {
namespace {
constexpr GUID decoderClass{0x307a6c42,0,0x10,{0x80,0,0,0xaa,0,0x38,0x9b,0x71}};
void check(HRESULT result,const char* action){if(FAILED(result))throw std::runtime_error(std::string(action)+" (HRESULT "+std::to_string(static_cast<unsigned long>(result))+")");}
struct Apartment {bool initialized=false;Apartment(){auto hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);check(hr,"Initialize cinematic COM");initialized=true;}~Apartment(){if(initialized)CoUninitialize();}};
Com<IPin> pin(IBaseFilter* filter,PIN_DIRECTION direction){Com<IEnumPins> pins;check(filter->EnumPins(&pins),"Enumerate cinematic pins");Com<IPin> item;while(pins->Next(1,&item,nullptr)==S_OK){PIN_DIRECTION current;check(item->QueryDirection(&current),"Query cinematic pin");if(current==direction){Com<IPin> connected;if(item->ConnectedTo(&connected)==VFW_E_NOT_CONNECTED)return item;}item.Reset();}throw std::runtime_error("Missing cinematic filter pin");}
GUID majorType(IPin* pin){Com<IEnumMediaTypes> types;check(pin->EnumMediaTypes(&types),"Enumerate cinematic stream types");AM_MEDIA_TYPE* type=nullptr;if(types->Next(1,&type,nullptr)!=S_OK || !type)throw std::runtime_error("Missing cinematic stream type");auto major=type->majortype;if(type->cbFormat)CoTaskMemFree(type->pbFormat);if(type->pUnk)type->pUnk->Release();CoTaskMemFree(type);return major;}
fs::path moviePath(const fs::path& root,const std::string& name){if(name.empty() || name.size()>128 || !std::all_of(name.begin(),name.end(),[](unsigned char c){return std::isalnum(c) || c=='_';}))throw std::runtime_error("Invalid cinematic name");auto directory=fs::canonical(root/L"Movies"),path=fs::canonical(directory/(wide(name)+L".mpq"));if(path.parent_path()!=directory || !fs::is_regular_file(path))throw std::runtime_error("Cinematic outside movie directory");return path;}
}
struct Cinematic::Data {
    Apartment apartment;
    Library decoder;
    Com<IGraphBuilder> graph;
    Com<IMediaControl> control;
    Com<IMediaEvent> events;
    Com<IVideoWindow> video;
    Com<IBasicVideo> basic;
    HWND owner;
    Data(const fs::path& root,const std::string& name,HWND window,bool muted,float soundGain) : decoder(root/L"blizzard.ax","a52741551312d81198d713e75e08740b115e5a74988dcec4dafd931d0841ece5"),owner(window) {
        if(!std::isfinite(soundGain) || soundGain<0 || soundGain>1)throw std::runtime_error("Invalid cinematic sound gain");muted=muted || soundGain==0;
        auto path=moviePath(root,name);check(CoCreateInstance(CLSID_FilterGraph,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&graph)),"Create cinematic graph");
        Com<IBaseFilter> source,splitter,codec;check(CoCreateInstance(CLSID_AsyncReader,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&source)),"Create cinematic source");check(graph->AddFilter(source.Get(),L"Original movie"),"Add cinematic source");Com<IFileSourceFilter> file;check(source.As(&file),"Query cinematic source");AM_MEDIA_TYPE media{};media.majortype=MEDIATYPE_Stream;media.subtype=MEDIASUBTYPE_Avi;check(file->Load(path.c_str(),&media),"Open original cinematic");
        check(CoCreateInstance(CLSID_AviSplitter,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&splitter)),"Create AVI splitter");check(graph->AddFilter(splitter.Get(),L"AVI splitter"),"Add AVI splitter");check(graph->ConnectDirect(pin(source.Get(),PINDIR_OUTPUT).Get(),pin(splitter.Get(),PINDIR_INPUT).Get(),nullptr),"Connect AVI source");
        using GetClassObject=HRESULT (STDAPICALLTYPE*)(REFCLSID,REFIID,void**);auto getClass=decoder.symbol<GetClassObject>("DllGetClassObject");Com<IClassFactory> factory;check(getClass(decoderClass,IID_PPV_ARGS(&factory)),"Get Blizzard decoder factory");check(factory->CreateInstance(nullptr,IID_PPV_ARGS(&codec)),"Create Blizzard decoder");check(graph->AddFilter(codec.Get(),L"Blizzard video decoder"),"Add Blizzard decoder");
        Com<IEnumPins> pins;check(splitter->EnumPins(&pins),"Enumerate AVI streams");Com<IPin> stream;bool foundVideo=false,foundAudio=false;while(pins->Next(1,&stream,nullptr)==S_OK){PIN_DIRECTION direction;check(stream->QueryDirection(&direction),"Query AVI stream");if(direction==PINDIR_OUTPUT){auto major=majorType(stream.Get());if(major==MEDIATYPE_Video){if(foundVideo)throw std::runtime_error("Multiple cinematic video streams");check(graph->ConnectDirect(stream.Get(),pin(codec.Get(),PINDIR_INPUT).Get(),nullptr),"Connect Blizzard decoder");check(graph->Render(pin(codec.Get(),PINDIR_OUTPUT).Get()),"Render cinematic video");foundVideo=true;}else if(major==MEDIATYPE_Audio && !muted){check(graph->Render(stream.Get()),"Render cinematic audio");foundAudio=true;}}stream.Reset();}if(!foundVideo || (!muted && !foundAudio))throw std::runtime_error("Cinematic video or audio stream missing");
        if(!muted){Com<IBasicAudio> audio;check(graph.As(&audio),"Query cinematic audio");long volume=soundGain<=0?-10000:std::max(-10000l,std::lround(2000*std::log10(soundGain)));check(audio->put_Volume(volume),"Set cinematic audio volume");}check(graph.As(&control),"Query cinematic control");check(graph.As(&events),"Query cinematic events");check(graph.As(&video),"Query cinematic video window");check(graph.As(&basic),"Query cinematic video dimensions");check(video->put_Owner(reinterpret_cast<OAHWND>(window)),"Set cinematic owner");check(video->put_WindowStyle(WS_CHILD|WS_CLIPSIBLINGS|WS_CLIPCHILDREN),"Set cinematic window style");check(video->put_MessageDrain(reinterpret_cast<OAHWND>(window)),"Set cinematic input owner");check(video->put_Visible(OATRUE),"Show cinematic");check(control->Run(),"Start cinematic");
    }
    ~Data(){if(control)control->Stop();if(video){video->put_Visible(OAFALSE);video->put_Owner(0);}}
};
Cinematic::Cinematic(const fs::path& root,const std::string& name,HWND owner,bool muted,float soundGain) : data_(std::make_unique<Data>(root,name,owner,muted,soundGain)) {}
Cinematic::~Cinematic()=default;
bool Cinematic::update(unsigned width,unsigned height){long w=0,h=0;check(data_->basic->GetVideoSize(&w,&h),"Get cinematic dimensions");if(w<=0 || h<=0)throw std::runtime_error("Invalid cinematic dimensions");auto scale=std::min(double(width)/w,double(height)/h);auto drawWidth=long(w*scale),drawHeight=long(h*scale);check(data_->video->SetWindowPosition((long(width)-drawWidth)/2,(long(height)-drawHeight)/2,drawWidth,drawHeight),"Size cinematic");long code;LONG_PTR first,second;while(data_->events->GetEvent(&code,&first,&second,0)==S_OK){data_->events->FreeEventParams(code,first,second);if(code==EC_COMPLETE)return false;if(code==EC_ERRORABORT || code==EC_USERABORT)throw std::runtime_error("Cinematic playback failed");}return true;}
}
