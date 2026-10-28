// Author: MiYu. Local user preferences for the native game view.
#pragma once
#include "platform.h"

namespace war3 {
struct GameAudioPreferences {
    bool sound=true,music=true;
    unsigned soundVolume=100,musicVolume=100;
    float soundGain() const {return sound?float(soundVolume)/100.f:0.f;}
    float musicGain() const {return music?float(musicVolume)/100.f:0.f;}
    bool operator==(const GameAudioPreferences&) const = default;
};
bool loadEdgeScrollPreference(const fs::path& dataRoot);
void saveEdgeScrollPreference(const fs::path& dataRoot,bool enabled);
GameAudioPreferences loadAudioPreferences(const fs::path& dataRoot);
void saveAudioPreferences(const fs::path& dataRoot,const GameAudioPreferences& preferences);
}
