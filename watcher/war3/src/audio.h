// Author: MiYu. Shared pinned Miles device and archive-backed digital/XMIDI voices.
#pragma once
#include "archive.h"

namespace war3 {
class AudioVoice;
class MilesDevice : public std::enable_shared_from_this<MilesDevice> {
    friend class AudioVoice;
    struct Impl;
    std::unique_ptr<Impl> impl_;
    explicit MilesDevice(const fs::path& root);
public:
    static std::shared_ptr<MilesDevice> open(const fs::path& root);
    ~MilesDevice();
    std::unique_ptr<AudioVoice> digital(std::shared_ptr<const Member> bytes,const std::string& extension);
    std::unique_ptr<AudioVoice> midi(std::shared_ptr<const Member> sequence,std::shared_ptr<const Member> bank);
    size_t voices() const;
    size_t banks() const;
};
class AudioVoice {
    friend class MilesDevice;
    struct Impl;
    std::unique_ptr<Impl> impl_;
    explicit AudioVoice(std::unique_ptr<Impl> impl);
public:
    ~AudioVoice();
    void start(bool loop);
    void pause();
    void resume();
    void stop();
    void volume(int level);
    void position(unsigned milliseconds);
    unsigned status() const;
    std::pair<unsigned,unsigned> milliseconds() const;
};
class Music {
    std::unique_ptr<AudioVoice> voice_;
public:
    Music(const fs::path& dataRoot,std::shared_ptr<const Member> music,int volume=127);
    ~Music();
    Music(const Music&)=delete;
    Music& operator=(const Music&)=delete;
};
}
