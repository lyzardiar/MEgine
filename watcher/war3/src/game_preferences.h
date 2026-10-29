// Author: MiYu. Local user preferences for the native game view.
#pragma once
#include "platform.h"

namespace war3 {
struct GameCameraPreferences {
    bool edgeScroll=true;
    unsigned mouseSpeed=50,keySpeed=50;
    bool healthBars=false;
    bool enhancedTooltips=true;
    bool formationMovement=true;
    bool subgroupModifier=false;
    bool operator==(const GameCameraPreferences&) const = default;
};
struct GameAudioPreferences {
    bool sound=true,music=true;
    unsigned soundVolume=100,musicVolume=100;
    bool subtitles=true;
    bool ambient=true,movement=true,unitSounds=true;
    float soundGain() const {return sound?float(soundVolume)/100.f:0.f;}
    float musicGain() const {return music?float(musicVolume)/100.f:0.f;}
    bool operator==(const GameAudioPreferences&) const = default;
};
struct GameVideoPreferences {
    unsigned particleDetail=2;
    bool occlusion=true;
    unsigned shadowDetail=2;
    unsigned lightDetail=2;
    bool operator==(const GameVideoPreferences&) const = default;
};
struct GameNetworkPreferences {
    std::uint16_t gamePort=6112;
    bool operator==(const GameNetworkPreferences&) const = default;
};
GameNetworkPreferences loadNetworkPreferences(const fs::path& dataRoot);
void saveNetworkPreferences(const fs::path& dataRoot,const GameNetworkPreferences& preferences);
GameCameraPreferences loadCameraPreferences(const fs::path& dataRoot);
void saveCameraPreferences(const fs::path& dataRoot,const GameCameraPreferences& preferences);
GameAudioPreferences loadAudioPreferences(const fs::path& dataRoot);
void saveAudioPreferences(const fs::path& dataRoot,const GameAudioPreferences& preferences);
GameVideoPreferences loadVideoPreferences(const fs::path& dataRoot);
void saveVideoPreferences(const fs::path& dataRoot,const GameVideoPreferences& preferences);
}
