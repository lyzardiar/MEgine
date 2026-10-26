// Author: MiYu. Miles stdcall ABI, common DLS banks and in-memory MIDI conversion lifetime.
#include "audio.h"
#include <algorithm>
#include <cstring>
#include <condition_variable>
#include <map>
#include <mutex>

namespace war3 {
struct MilesDevice::Impl {
    using Void=void(__stdcall*)();
    using One=void(__stdcall*)(void*);
    using Integer=void(__stdcall*)(void*,int);
    using Status=unsigned(__stdcall*)(void*);
    using Time=void(__stdcall*)(void*,int*,int*);
    Library library;
    std::recursive_mutex mutex;
    void* driver=nullptr;void* midiDriver=nullptr;void* dls=nullptr;
    bool started=false;
    size_t active=0;
    Void shutdown;
    One closeDigital,closeMidi,releaseSample,releaseSequence,endSample,endSequence,startSample,startSequence,stopSample,stopSequence,resumeSample,resumeSequence,freeMemory,compactDls;
    Integer loopSample,loopSequence,volumeSample,seekSample,seekSequence;
    void(__stdcall* volumeSequence)(void*,int,int);
    Status statusSample,statusSequence,readVolumeSample,readVolumeSequence;
    Time timeSample,timeSequence;
    void*(__stdcall* allocateSample)(void*);
    void*(__stdcall* allocateSequence)(void*);
    One initializeSample;
    int(__stdcall* namedSample)(void*,const char*,const void*,int,int);
    int(__stdcall* initializeSequence)(void*,const void*,int);
    int(__stdcall* convertMidi)(const void*,unsigned,void**,unsigned*,unsigned);
    void*(__stdcall* openMidi)(unsigned);
    void*(__stdcall* openDls)(void*,void*,const char*,unsigned,unsigned,int,int);
    void(__stdcall* closeDls)(void*,unsigned);
    void*(__stdcall* loadBank)(void*,const void*,unsigned);
    void(__stdcall* unloadBank)(void*,void*);
    const char*(__stdcall* lastError)();
    struct Bank {
        std::shared_ptr<MilesDevice> owner;
        std::shared_ptr<const Member> bytes;
        void* handle=nullptr;
        ~Bank(){if(handle){auto& api=*owner->impl_;std::lock_guard lock(api.mutex);api.unloadBank(api.dls,handle);api.compactDls(api.dls);}}
    };
    std::map<const Member*,std::weak_ptr<Bank>> banks;
    std::runtime_error failure(const char* message) const {auto detail=lastError();return std::runtime_error(std::string(message)+(detail && *detail?std::string(": ")+detail:std::string{}));}
    void close() {if(dls){closeDls(dls,0);dls=nullptr;}if(midiDriver){closeMidi(midiDriver);midiDriver=nullptr;}if(driver){closeDigital(driver);driver=nullptr;}if(started){shutdown();started=false;}}
    explicit Impl(const fs::path& root) : library(root/L"mss32.dll","1f9a83f42de0e7899a7f6772e5cbad6ed10c16cc5f15246c8d80b9f4fe25fc4a") {
        auto startup=library.symbol<int(__stdcall*)()>("_AIL_startup@0");shutdown=library.symbol<Void>("_AIL_shutdown@0");auto open=library.symbol<void*(__stdcall*)(unsigned,int,int,unsigned)>("_AIL_open_digital_driver@16");
        closeDigital=library.symbol<One>("_AIL_close_digital_driver@4");closeMidi=library.symbol<One>("_AIL_close_XMIDI_driver@4");
        releaseSample=library.symbol<One>("_AIL_release_sample_handle@4");releaseSequence=library.symbol<One>("_AIL_release_sequence_handle@4");
        endSample=library.symbol<One>("_AIL_end_sample@4");endSequence=library.symbol<One>("_AIL_end_sequence@4");startSample=library.symbol<One>("_AIL_start_sample@4");startSequence=library.symbol<One>("_AIL_start_sequence@4");stopSample=library.symbol<One>("_AIL_stop_sample@4");stopSequence=library.symbol<One>("_AIL_stop_sequence@4");resumeSample=library.symbol<One>("_AIL_resume_sample@4");resumeSequence=library.symbol<One>("_AIL_resume_sequence@4");
        loopSample=library.symbol<Integer>("_AIL_set_sample_loop_count@8");loopSequence=library.symbol<Integer>("_AIL_set_sequence_loop_count@8");volumeSample=library.symbol<Integer>("_AIL_set_sample_volume@8");volumeSequence=library.symbol<decltype(volumeSequence)>("_AIL_set_sequence_volume@12");seekSample=library.symbol<Integer>("_AIL_set_sample_ms_position@8");seekSequence=library.symbol<Integer>("_AIL_set_sequence_ms_position@8");
        statusSample=library.symbol<Status>("_AIL_sample_status@4");statusSequence=library.symbol<Status>("_AIL_sequence_status@4");timeSample=library.symbol<Time>("_AIL_sample_ms_position@12");timeSequence=library.symbol<Time>("_AIL_sequence_ms_position@12");
        readVolumeSample=library.symbol<Status>("_AIL_sample_volume@4");readVolumeSequence=library.symbol<Status>("_AIL_sequence_volume@4");
        allocateSample=library.symbol<decltype(allocateSample)>("_AIL_allocate_sample_handle@4");allocateSequence=library.symbol<decltype(allocateSequence)>("_AIL_allocate_sequence_handle@4");initializeSample=library.symbol<One>("_AIL_init_sample@4");namedSample=library.symbol<decltype(namedSample)>("_AIL_set_named_sample_file@20");initializeSequence=library.symbol<decltype(initializeSequence)>("_AIL_init_sequence@12");convertMidi=library.symbol<decltype(convertMidi)>("_AIL_MIDI_to_XMI@20");freeMemory=library.symbol<One>("_AIL_mem_free_lock@4");
        openMidi=library.symbol<decltype(openMidi)>("_AIL_open_XMIDI_driver@4");openDls=library.symbol<decltype(openDls)>("_AIL_DLS_open@28");closeDls=library.symbol<decltype(closeDls)>("_AIL_DLS_close@8");loadBank=library.symbol<decltype(loadBank)>("_AIL_DLS_load_memory@12");unloadBank=library.symbol<decltype(unloadBank)>("_AIL_DLS_unload@8");compactDls=library.symbol<One>("_AIL_DLS_compact@4");lastError=library.symbol<decltype(lastError)>("_AIL_last_error@0");
        auto codec=root/L"redist/miles/Mp3dec.asi";verifyPe32(codec);if(sha256(codec)!="45295e1aae5211d2d32dae22fcc1d328db9d15d5a37bd0af3b4eb1a9a24c275a")throw std::runtime_error("Unsupported Miles MP3 decoder version");auto directory=codec.parent_path().string();if(directory.size()>MAX_PATH-2)throw std::runtime_error("Miles codec path exceeds legacy limit");library.symbol<const char*(__stdcall*)(const char*)>("_AIL_set_redist_directory@4")(directory.c_str());
        if(!startup())throw failure("Miles startup failed");started=true;try{driver=open(44100,16,2,0);if(!driver)throw failure("Miles digital driver unavailable");}catch(...){close();throw;}
    }
    ~Impl(){close();}
    void initializeMidi() {if(!midiDriver){midiDriver=openMidi(0);if(!midiDriver)throw failure("Miles XMIDI driver unavailable");}if(!dls){dls=openDls(midiDriver,driver,nullptr,0,44100,16,2);if(!dls)throw failure("Miles software DLS unavailable");}}
};
struct AudioVoice::Impl {
    std::shared_ptr<MilesDevice> owner;
    std::shared_ptr<MilesDevice::Impl::Bank> bank;
    std::shared_ptr<const Member> bytes;
    void* handle=nullptr;void* converted=nullptr;
    bool midi=false,counted=false;
    ~Impl(){if(!owner)return;auto& api=*owner->impl_;std::lock_guard lock(api.mutex);if(handle){(midi?api.endSequence:api.endSample)(handle);(midi?api.releaseSequence:api.releaseSample)(handle);}if(converted)api.freeMemory(converted);if(counted)--api.active;}
};
MilesDevice::MilesDevice(const fs::path& root) : impl_(std::make_unique<Impl>(root)) {}
MilesDevice::~MilesDevice()=default;
std::shared_ptr<MilesDevice> MilesDevice::open(const fs::path& root) {
    struct Less {bool operator()(const fs::path& a,const fs::path& b) const {return CompareStringOrdinal(a.c_str(),-1,b.c_str(),-1,TRUE)==CSTR_LESS_THAN;}};
    struct Entry {std::weak_ptr<MilesDevice> weak;MilesDevice* live=nullptr;};
    struct Registry {std::recursive_mutex mutex;std::condition_variable_any wake;std::map<fs::path,Entry,Less> devices;};
    static Registry registry;auto key=fs::canonical(root);std::unique_lock lock(registry.mutex);
    for(;;){auto found=registry.devices.find(key);if(found==registry.devices.end())break;if(auto device=found->second.weak.lock())return device;registry.wake.wait(lock);}
    auto owned=std::unique_ptr<MilesDevice>(new MilesDevice(key));auto release=[key](MilesDevice* value){std::lock_guard lock(registry.mutex);delete value;auto found=registry.devices.find(key);if(found!=registry.devices.end() && found->second.live==value)registry.devices.erase(found);registry.wake.notify_all();};
    auto entry=registry.devices.emplace(key,Entry{{},owned.get()}).first;auto result=std::shared_ptr<MilesDevice>(owned.release(),std::move(release));entry->second.weak=result;return result;
}
std::unique_ptr<AudioVoice> MilesDevice::digital(std::shared_ptr<const Member> bytes,const std::string& extension) {
    if(!bytes || bytes->bytes.empty() || bytes->bytes.size()>INT_MAX || (extension!=".mp3" && extension!=".wav"))throw std::runtime_error("Unsupported digital sound data or format");auto voice=std::make_unique<AudioVoice::Impl>();voice->owner=shared_from_this();voice->bytes=std::move(bytes);auto& api=*impl_;std::lock_guard lock(api.mutex);if(api.active>=256)throw std::runtime_error("Miles voice budget exceeded");voice->handle=api.allocateSample(api.driver);if(!voice->handle)throw api.failure("Miles sample allocation failed");++api.active;voice->counted=true;api.initializeSample(voice->handle);if(!api.namedSample(voice->handle,extension.c_str(),voice->bytes->bytes.data(),int(voice->bytes->bytes.size()),0))throw api.failure("Miles digital sound decode failed");return std::unique_ptr<AudioVoice>(new AudioVoice(std::move(voice)));
}
std::unique_ptr<AudioVoice> MilesDevice::midi(std::shared_ptr<const Member> sequence,std::shared_ptr<const Member> bank) {
    if(!sequence || sequence->bytes.size()<14 || sequence->bytes.size()>16*1024*1024 || !bank || bank->bytes.size()<12 || bank->bytes.size()>128*1024*1024 || std::memcmp(sequence->bytes.data(),"MThd",4) || std::memcmp(bank->bytes.data(),"RIFF",4) || std::memcmp(bank->bytes.data()+8,"DLS ",4))throw std::runtime_error("Unsupported MIDI or DLS data");
    auto voice=std::make_unique<AudioVoice::Impl>();voice->owner=shared_from_this();voice->bytes=std::move(sequence);voice->midi=true;auto& api=*impl_;std::lock_guard lock(api.mutex);if(api.active>=256)throw std::runtime_error("Miles voice budget exceeded");api.initializeMidi();for(auto it=api.banks.begin();it!=api.banks.end();)if(it->second.expired())it=api.banks.erase(it);else ++it;auto found=api.banks.find(bank.get());if(found!=api.banks.end())voice->bank=found->second.lock();
    if(!voice->bank){auto loaded=std::make_shared<Impl::Bank>();loaded->owner=shared_from_this();loaded->bytes=std::move(bank);loaded->handle=api.loadBank(api.dls,loaded->bytes->bytes.data(),0);if(!loaded->handle)throw api.failure("Miles DLS bank load failed");api.banks[loaded->bytes.get()]=loaded;voice->bank=std::move(loaded);}
    unsigned size=0;if(!api.convertMidi(voice->bytes->bytes.data(),unsigned(voice->bytes->bytes.size()),&voice->converted,&size,0) || !voice->converted || !size)throw api.failure("Miles MIDI conversion failed");if(size>128*1024*1024)throw std::runtime_error("Converted MIDI exceeds budget");voice->handle=api.allocateSequence(api.midiDriver);if(!voice->handle)throw api.failure("Miles sequence allocation failed");++api.active;voice->counted=true;if(!api.initializeSequence(voice->handle,voice->converted,0))throw api.failure("Miles XMIDI initialization failed");return std::unique_ptr<AudioVoice>(new AudioVoice(std::move(voice)));
}
size_t MilesDevice::voices() const {std::lock_guard lock(impl_->mutex);return impl_->active;}
size_t MilesDevice::banks() const {std::lock_guard lock(impl_->mutex);size_t count=0;for(auto& [key,value]:impl_->banks)if(!value.expired())++count;return count;}
AudioVoice::AudioVoice(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
AudioVoice::~AudioVoice()=default;
void AudioVoice::start(bool loop) {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);(v.midi?api.loopSequence:api.loopSample)(v.handle,loop?0:1);(v.midi?api.startSequence:api.startSample)(v.handle);}
void AudioVoice::pause() {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);(v.midi?api.stopSequence:api.stopSample)(v.handle);}
void AudioVoice::resume() {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);(v.midi?api.resumeSequence:api.resumeSample)(v.handle);}
void AudioVoice::stop() {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);(v.midi?api.endSequence:api.endSample)(v.handle);}
void AudioVoice::volume(int level) {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);level=std::clamp(level,0,127);if(v.midi)api.volumeSequence(v.handle,level,0);else api.volumeSample(v.handle,level);}
int AudioVoice::volume() const {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);return int((v.midi?api.readVolumeSequence:api.readVolumeSample)(v.handle));}
void AudioVoice::position(unsigned milliseconds) {if(milliseconds>INT_MAX)throw std::runtime_error("Sound seek position exceeds range");auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);(v.midi?api.seekSequence:api.seekSample)(v.handle,int(milliseconds));}
unsigned AudioVoice::status() const {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);return (v.midi?api.statusSequence:api.statusSample)(v.handle);}
std::pair<unsigned,unsigned> AudioVoice::milliseconds() const {auto& v=*impl_;auto& api=*v.owner->impl_;std::lock_guard lock(api.mutex);int total=0,current=0;(v.midi?api.timeSequence:api.timeSample)(v.handle,&total,&current);return {unsigned(std::max(0,current)),unsigned(std::max(0,total))};}
Music::Music(const fs::path& root,std::shared_ptr<const Member> music,int volume) {voice_=MilesDevice::open(root)->digital(std::move(music),".mp3");voice_->volume(volume);voice_->start(true);}
Music::~Music()=default;
}
