// Author: MiYu. Archive-backed original music lists and independent playback control.
#pragma once
#include "audio.h"
#include "audio_random.h"
#include "map_ui.h"

namespace war3 {
class MusicScene {
    std::unique_ptr<Archives> resources_;
    std::optional<SourceSettings> skins_,custom_;
    AudioRandom random_;
    std::string skin_="Default",mapName_="Music",currentFile_;
    unsigned version_=1;
    std::int32_t mapIndex_=0;
    std::vector<std::string> tracks_;
    size_t selected_=0;
    std::unique_ptr<AudioVoice> voice_;
    bool muted_=false,paused_=false,loop_=false;
    std::uint32_t volume_=127,level_=127;
    struct Fade {std::uint32_t duration,next,start=0;bool out,begun=false;};
    struct Pending {std::string file;std::uint32_t due;};
    std::optional<Fade> fade_;
    std::optional<Pending> pending_;
    std::optional<std::string> lookup(const std::string& key);
    void applyVolume();
    void file(const std::string& name,unsigned offset,unsigned fade,bool loop);
    void list(const std::string& name,std::int32_t index,unsigned offset,unsigned fade);
public:
    explicit MusicScene(Archives& resources,std::uint32_t seed=GetTickCount());
    void skin(const std::string& name,unsigned version=1);
    void map(const std::string& name,bool random,int index);
    void clear();
    void play(const std::string& name,unsigned offset=0,unsigned fade=0);
    void stop(bool fade);
    void resume();
    void volume(std::uint32_t value);
    void position(unsigned value);
    void muted(bool value);
    void update(std::uint32_t now=GetTickCount());
    static unsigned fadeLevel(unsigned volume,unsigned elapsed,unsigned duration,bool out);
    const std::string& mapName() const {return mapName_;}
    int mapIndex() const {return mapIndex_;}
    const std::vector<std::string>& tracks() const {return tracks_;}
    size_t selected() const {return selected_;}
    const std::string& currentFile() const {return currentFile_;}
    unsigned volume() const {return volume_;}
    unsigned level() const {return level_;}
    const AudioVoice* voice() const {return voice_.get();}
    bool waiting() const {return bool(pending_);}
    bool paused() const {return paused_;}
};
}
