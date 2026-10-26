# 原生脚本音乐

对照版本为 Warcraft III 1.27.0.52240，原件摘要由 `profiles/classic-1.27.json` 固定。`MusicScene` 持有共享归档视图，经同一 Miles 设备直接播放内存成员；切图销毁会话时释放音乐、解码输入与地图视图，不写解包音频。

## 配置与播放

绑定 SetMapMusic、ClearMapMusic、PlayMusic、PlayMusicEx、StopMusic、ResumeMusic、SetMusicVolume、SetMusicPlayPosition 共8个native。SetMapMusic只保存最多259字节的原名称和有符号索引，清除展开列表；random=true保存索引−1，不加载或播放。ClearMapMusic清配置但保留正在播放的声音和已排队的延迟曲目。

PlayMusic按 `名称_V0`（ROC）或 `名称_V1`（TFT）查询：地图 `war3mapSkin.txt` 的CustomSkin优先，再查询当前皮肤与公共Default；存在但为空的值遮蔽后续fallback。没有定义时直接解释为文件名或分号列表。分隔符仅为分号，连续分号被跳过，空格与引号保留；每项最多259字节，超长项仍扫描至下个分隔符。列表有4096项预算。

负索引使用声音随机流的32位乘法高位选择首曲，单曲也消耗一次；非负索引取余。单曲循环，多曲首曲之后依次轮转，曲终等待20秒。相同正在播放的文件在offset=0时保持声音和位置，并取消现有渐变/延迟。StopMusic(false)暂停，ResumeMusic恢复；SetMusicPlayPosition交给Miles毫秒定位。PlayMusicEx接受非负且不超过INT_MAX的offset/fade，其他位型明确失败。

音乐渐变按50ms回调更新，与MIDI的100ms整数步进独立。首次回调记录墙钟，后续按单精度elapsed/duration乘目标音量并截断；elapsed等于duration仍设置音量，严格超过后淡入完成或淡出暂停。StopMusic(true)使用1000ms淡出。SetMusicVolume将保存的目标按无符号数夹至127，同时将原入参位型交给当前声音，沿用原件两处写入的区别。物理输出可用mute覆盖为0。

当前皮肤默认Default、版本默认TFT，已有显式skin接口；最终游戏种族/皮肤与ROC/TFT上下文尚未接线。4个ThematicMusic相关native、完整声音随机流共同消费时序、原版全局调度相位、完整音频/听感仍待实现或验收。尚无实际开始游戏流程，不以音乐native可调用代表可玩对局。

## 原件与验证

REA入口：SetMapMusic `0x6f1f5ef0` → `0x6f33ce60`，ClearMapMusic `0x6f1db220` → `0x6f339530`，PlayMusic/Ex `0x6f1f1dd0`/`0x6f1f1e00` → `0x6f33b540`。资源查询为 `0x6f324ad0`，实际播放为 `0x6f33b670`/`0x6f33b770`，曲终为 `0x6f33dc30`，渐变回调为 `0x6f3308e0`，转换helper为 `0x6f7712e0`。分号token由Storm ordinal504实现，静态分析入口 `0x1503b6f0`。

声音RNG独立于游戏模拟RNG：原管理器状态 `0x6fbe610c`，seed/next为 `0x6f1ae7e0`/`0x6f199400`，表为 `0x6f964e48` 的64个uint32。`audio_random.inc`保留这组格式事实，验证器按固定原件摘要逐字核对；初始化使用GetTickCount。运行游戏不加载Game.dll，Unicorn只用于开发对照。

Win32 Release产品/音乐目标构建通过、无警告，8项定向检查通过、0失败。78个seed的初始化/64步输出及packed state共5,070组、360组渐变数值、4个回调边界与原件指令一致，共5,434组、0差异。RNG指令无替换；渐变替换墙钟、声音存在、物理音量、timer注册和暂停5个边界，保留源SSE计算及转换helper。对照不证明完整调度、皮肤查表或物理听感一致。

BootyBay的产品main通过SetMapMusic后，在 `war3map.j:643:13` CreateUnit失败，退出1，main_completed=false，无Game.dll；当时配置为Music、index=−1、tracks=0，没有提前播放。原始证据为 `tmp/docs-artifacts/war3/audio/music-{tests.log,tests/,cpu.json,main-bootybay.log,*-rea.json}`。

```powershell
# watcher/war3
cmake --build --preset release --target war3 war3_music_tests --parallel 8
./build/windows-x86/bin/Release/war3_music_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/audio/music-tests"
python tools/verify_music_cpu.py
```

W019–W021达到3项，合并验证在[独立测试队列](testing-batches.md)记录；旧MEngine161–163批次继续延期。
