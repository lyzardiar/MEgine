// Author: MiYu. Read map members in memory and transfer configured sessions without moving their addresses.
#include "map_preparation.h"

namespace war3 {
MapPreparation::MapPreparation(fs::path dataRoot) : dataRoot_(std::move(dataRoot)),worker_([this](std::stop_token stop){run(stop);}) {}
MapPreparation::~MapPreparation() {{std::lock_guard lock(mutex_);worker_.request_stop();}wake_.notify_one();}
std::uint64_t MapPreparation::request(fs::path path) {
    std::lock_guard lock(mutex_);auto id=++generation_;pending_=Request{id,std::move(path)};ready_.reset();wake_.notify_one();return id;
}
void MapPreparation::clear() {std::lock_guard lock(mutex_);++generation_;pending_.reset();ready_.reset();}
std::optional<PreparedMap> MapPreparation::poll() {std::lock_guard lock(mutex_);auto result=std::move(ready_);ready_.reset();return result;}
void MapPreparation::run(std::stop_token stop) {
    std::unique_ptr<Archives> archives;std::unique_ptr<Images> images;
    while(!stop.stop_requested()){
        Request request;{std::unique_lock lock(mutex_);wake_.wait(lock,[&]{return stop.stop_requested() || pending_.has_value();});if(stop.stop_requested())return;request=std::move(*pending_);pending_.reset();}
        auto stale=[&]{return stop.stop_requested() || generation_.load()!=request.id;};PreparedMap result;result.request=request.id;result.path=request.path;
        try {
            if(!archives)archives=std::make_unique<Archives>(dataRoot_);archives->mountMap(request.path);
            MapStrings strings;if(auto wts=archives->readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);
            auto w3i=archives->readCandidates({"war3map.w3i"},ArchiveScope::Map);if(!w3i)throw std::runtime_error("Missing war3map.w3i");result.info=MapInfo::parse(w3i->bytes,strings);
            if(!stale()){
                auto module=jass::Module::compile(jass::Program::read(*archives));
                if(!stale()){auto world=World::read(*archives);if(!stale()){result.session=std::make_unique<ScriptSession>(std::move(module),result.info,std::move(strings));result.session->attachWorld(std::move(world));result.session->configure();}}
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
