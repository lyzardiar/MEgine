# 原生 Miles 声音后端

固定对照为Warcraft III 1.27.0.52240。客户端使用原安装的mss32.dll和MP3 codec，摘要与架构按 `profiles/classic-1.27.json` 核对。音频字节由只读归档直接供给，不生成临时音频文件；未分发原DLL、音乐、MIDI或DLS资产。

## 设备、声音与寿命

`MilesDevice` 按规范化的安装根目录共享一个Miles启动状态和44100Hz/16bit/stereo数字设备。设备注册表同时管理最后释放与重新创建，避免旧设备shutdown和新startup交错；同一设备的native操作串行。调用方应持有设备用于持续的游戏声音，声音本身也持有设备，防止菜单/调用方释放设备时使仍在播放的声音失效。

`AudioVoice` 支持WAV/MP3数字声音与标准MIDI转XMIDI/DLS，提供播放/循环、暂停/恢复、结束、音量、毫秒位置/长度。数字声音通过原AIL_set_named_sample_file从内存解码。MIDI使用AIL_open_XMIDI_driver、AIL_DLS_open软件合成器、AIL_DLS_load_memory、AIL_MIDI_to_XMI和AIL_init_sequence。转换缓冲由Miles分配并在sequence释放后归还Miles；声音和DLS音色库保留源Member字节。相同Member的DLS库在多个sequence间共享，最后一个sequence释放时卸载并调用AIL_DLS_compact整理未使用的合成器内存。

每个设备最多256个声音；MIDI源限制16MiB，DLS和转换结果各限制128MiB。预算是当前客户端的资源边界，不声称与原版极限一致。现有菜单Music已使用共享数字设备，保持原MP3循环路径，支持显式初始音量。MIDI/DLS合成器按需创建，最后一个设备拥有者释放时关闭合成器、XMIDI、数字设备与Miles运行时。

声音环境的3D/EAX、空间定位、渐变、音轨选择/随机顺序和时间调度继续接入。[脚本MIDI sound](script-sound.md)已绑定10个native并保存源环境请求；非零渐变明确报错，原图main仍未完成，不能将设备检查写成地图音频和对局已经完成。

## 原版调用依据

原版SetAmbientDaySound/SetAmbientNightSound是Blizzard.j函数，创建CreateMIDISound后通过GetTimeOfDay/GetFloatGameState决定是否StartSound。原版MIDISounds.slk的LordaeronSummerDay/Night与VillageDay/Night指向 `Sound\Ambient\LordaeronSummer\LordaeronSummerDay.mid`、`LordaeronSummerNight.mid`，共用 `LordaeronSummer.dls`；源Volume为80。实测原件分别为标准MThd MIDI与RIFF DLS。

REA核对Game.dll：MIDI转换调用 `0x6f141bc5` 传入源指针/长度、输出指针/长度、flags=0，成功后通过AIL_init_sequence(...,0)初始化；另一个调用点为 `0x6f16a765`。XMIDI打开调用 `0x6f14259d` 使用配置标志0/1，当前后端为0。所有边界使用原DLL导出的stdcall签名，不调用Game.dll。MSS及codec摘要保持原固定版本。

声音环境来自 `UI\SoundInfo\EnvironmentSounds.slk`，Default为MOUNTAINS，包含衰减/反射等参数；NewSoundEnvironment入口 `0x6f1f15b0` 进入 `0x6f33afa0`，含5000ms切换节流和延迟调用。地图SetMapMusic入口 `0x6f1f5ef0` 将random转换为index=-1，再交给 `0x6f33ce60` 保存标签/索引。Music标签的实际曲目来自 `UI\war3skins.txt` 各种族Music_V0/V1列表。[脚本声音](script-sound.md)已保存环境并实现非空间MIDI渐变，[时间变量](game-clock.md)支持同步初始化，[脚本音乐](script-music.md)已接入源列表和播放控制；3D环境/节流、完整音频与模拟调度仍待实现。

源表原件仅供本地分析，保存在 `tmp/docs-artifacts/war3/audio/{EnvironmentSounds.slk,MIDISounds.slk,EAXDefs.slk,AmbienceSounds.slk,MiscData.txt}`；REA为 `audio-{native,routing,midi-calls,midi-abi}-rea.json`。这些原始资产/诊断不提交。

## 快速检查与待测

Win32 Release产品和audio目标构建通过、无警告；7项真实Miles检查通过、0失败：设备共享、PCM播放/暂停/恢复/定位/结束、原MP3及菜单共用设备、原MIDI+DLS/双sequence共享库和释放、无效输入不遗留句柄、声音持有设备及重新打开、4线程各4次设备重开。播放检查使用零音量，核对实际状态、毫秒推进和总长度；不把这些结果当成听感、三维混响或完整音频还原验收。

产品原菜单带音乐运行60帧退出0，无Game.dll。W016–W018在 `6557119` 合并验证已实现范围34项通过，其中Miles7项本批重新执行、sound6项复用；脚本MIDI资源消费和基本释放通过，声音渐变/3D环境/时间、持续切图性能及完整main继续待实现/验收。

```powershell
# watcher/war3
cmake --build --preset release --target war3 war3_audio_tests --parallel 8
./build/windows-x86/bin/Release/war3_audio_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
```

证据为 `tmp/docs-artifacts/war3/audio/miles-{build.log,tests.log,menu.log}`。旧MEngine验证与旧地图转换缓存清理的状态保持不变。

W020新增 `_AIL_sample_volume@4`/`_AIL_sequence_volume@4` 的受锁查询边界，非空间MIDI渐变由[脚本声音层](script-sound.md)按源100ms整数步长更新，Miles每次收到即时音量。10项声音定向检查和3,022次控制/算术原件对照通过；播放保持静音，正音量在未播放声音上核对。物理听感、3D和完整定时器仍未验收。
