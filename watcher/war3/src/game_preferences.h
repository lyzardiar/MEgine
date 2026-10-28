// Author: MiYu. Local user preferences for the native game view.
#pragma once
#include "platform.h"

namespace war3 {
struct GameCameraPreferences {
    bool edgeScroll=true;
    unsigned mouseSpeed=50,keySpeed=50;
    bool operator==(const GameCameraPreferences&) const = default;
};
struct GameAudioPreferences {
    bool sound=true,music=true;
    unsigned soundVolume=100,musicVolume=100;
    float soundGain() const {return sound?float(soundVolume)/100.f:0.f;}
    float musicGain() const {return music?float(musicVolume)/100.f:0.f;}
    bool operator==(const GameAudioPreferences&) const = default;
};
GameCameraPreferences loadCameraPreferences(const fs::path& dataRoot);
void saveCameraPreferences(const fs::path& dataRoot,const GameCameraPreferences& preferences);
GameAudioPreferences loadAudioPreferences(const fs::path& dataRoot);
void saveAudioPreferences(const fs::path& dataRoot,const GameAudioPreferences& preferences);
}
