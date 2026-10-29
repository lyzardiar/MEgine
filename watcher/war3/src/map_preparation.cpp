// Author: MiYu. Read map members in memory and transfer configured sessions without moving their addresses.
#include "map_preparation.h"
#include "game_preferences.h"

namespace war3 {
namespace {bool under(const fs::path& path,const fs::path& directory){auto child=fs::weakly_canonical(path).wstring(),parent=fs::weakly_canonical(directory).wstring();if(parent.empty())return false;if(parent.back()!=L'\\')parent+=L'\\';return child.size()>=parent.size() && CompareStringOrdinal(parent.c_str(),int(parent.size()),child.c_str(),int(parent.size()),TRUE)==CSTR_EQUAL;}}
MapPreparation::MapPreparation(fs::path dataRoot,bool muted) : dataRoot_(std::move(dataRoot)),muted_(muted),worker_([this](std::stop_token stop){run(stop);}) {}
MapPreparation::~MapPreparation() {{std::lock_guard lock(mutex_);worker_.request_stop();}wake_.notify_one();}
std::uint64_t MapPreparation::request(fs::path path,std::optional<std::pair<bool,unsigned>> campaign,bool inferCampaign,std::optional<std::uint32_t> initialRandomSeed) {
    std::lock_guard lock(mutex_);auto id=++generation_;pending_=Request{id,std::move(path),{}, {},campaign,inferCampaign,initialRandomSeed,{}, {}};ready_.reset();wake_.notify_one();return id;
}
std::uint64_t MapPreparation::requestMemory(std::shared_ptr<const Bytes> bytes,std::string label,std::optional<std::uint32_t> initialRandomSeed) {
    if(!bytes || bytes->empty() || bytes->size()>256u*1024u*1024u || label.empty() || label.size()>1024 || label.find('\0')!=std::string::npos)throw std::runtime_error("Invalid in-memory map preparation request");
    std::lock_guard lock(mutex_);auto id=++generation_;pending_=Request{id,{},std::move(bytes),std::move(label),{},false,initialRandomSeed,{}, {}};ready_.reset();wake_.notify_one();return id;
}
std::uint64_t MapPreparation::requestLanMemory(std::shared_ptr<const Bytes> bytes,std::string label,LanSessionSetup setup,bool experimentalSelectionSync,std::optional<unsigned> version) {
    if(!bytes || bytes->empty() || bytes->size()>256u*1024u*1024u || label.empty() || label.size()>1024 || label.find('\0')!=std::string::npos || (version && *version>1))throw std::runtime_error("Invalid in-memory LAN map preparation request");
    auto seed=setup.randomSeed;setup.experimentalSelectionSync=experimentalSelectionSync;std::lock_guard lock(mutex_);auto id=++generation_;pending_=Request{id,{},std::move(bytes),std::move(label),{},false,seed,std::move(setup),version};ready_.reset();wake_.notify_one();return id;
}
void MapPreparation::clear() {std::lock_guard lock(mutex_);++generation_;pending_.reset();ready_.reset();}
std::optional<PreparedMap> MapPreparation::poll() {std::lock_guard lock(mutex_);auto result=std::move(ready_);ready_.reset();return result;}
void MapPreparation::run(std::stop_token stop) {
    std::unique_ptr<Archives> archives;std::unique_ptr<Images> images;
    while(!stop.stop_requested()){
        Request request;{std::unique_lock lock(mutex_);wake_.wait(lock,[&]{return stop.stop_requested() || pending_.has_value();});if(stop.stop_requested())return;request=std::move(*pending_);pending_.reset();}
        auto stale=[&]{return stop.stop_requested() || generation_.load()!=request.id;};PreparedMap result;result.request=request.id;result.path=request.path;result.memoryLabel=request.label;
        try {
            if(!archives)archives=std::make_unique<Archives>(dataRoot_);if(request.memory)archives->mountMap(std::move(request.memory),request.label);else archives->mountMap(request.path);
            MapStrings strings;if(auto wts=archives->readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);
            auto w3i=archives->readCandidates({"war3map.w3i"},ArchiveScope::Map);if(!w3i)throw std::runtime_error("Missing war3map.w3i");result.info=MapInfo::parse(w3i->bytes,strings);
            if(!stale()){
                auto module=jass::Module::compile(jass::Program::read(*archives));
                if(!stale()){auto world=World::read(*archives);if(!stale()){result.session=std::make_unique<ScriptSession>(std::move(module),result.info,std::move(strings),std::nullopt,request.initialRandomSeed);if(request.version)result.session->versionContext(*request.version);if(request.campaign)result.session->campaignContext(request.campaign->first,request.campaign->second);else if(request.inferCampaign && under(request.path,dataRoot_/L"Maps"/L"Campaign"))result.session->campaignContext(false,1);result.session->attachWorld(std::move(world));result.session->audioMuted(muted_);try{auto preferences=loadAudioPreferences(dataRoot_);result.session->localAudioGains(preferences.soundGain(),preferences.musicGain());result.session->localAudioCategories(preferences.ambient,preferences.movement,preferences.unitSounds);}catch(const std::exception&){}result.session->configure();if(request.lanSetup)result.session->applyLanSetup(*request.lanSetup);}}
            }
            if(!stale())try {
                auto bytes=archives->readCandidates({"war3mapPreview.tga","war3mapMap.blp"},ArchiveScope::Map);
                if(bytes){if(!images)images=std::make_unique<Images>(dataRoot_);result.preview=images->decode(bytes->bytes);}
            }catch(const std::exception& e){result.previewError=e.what();}
        }catch(const std::exception& e){result.error=e.what();result.session.reset();result.preview.reset();}
        if(archives)archives->unmountMap();
        std::lock_guard lock(mutex_);if(!stale())ready_=std::move(result);
    }
}
}
