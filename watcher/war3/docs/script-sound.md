# 原图 MIDI 声音与源表

固定对照为Warcraft III 1.27.0.52240。`SourceTable`读取原SYLK的继承坐标、稀疏行列、引用字符串/转义引号和分号，保留源列名/值；只消费常量，不执行表格公式。每表16MiB，最多512列、262144行、1048576个实际单元格，值限制65536字节，损坏或不支持的源数据显式报错。

`SoundScene`从当前世界的共享归档视图读取 `UI\SoundInfo\MIDISounds.slk` 和 `EnvironmentSounds.slk`，地图成员覆盖公共资源。目录中的重复分隔符归一化后，MIDI与DLS继续经归档直接读入内存。声音定义保留标签、文件、音色库、Volume、Priority、Channel、Pitch、Radius和Flags。原版LordaeronSummer/Village昼夜声音为Volume80、Priority1000、Channel15、Radius5000，共用LordaeronSummer.dls。

已绑定10个native：NewSoundEnvironment、CreateMIDISound、StartSound、StopSound、KillSoundWhenDone、GetSoundIsPlaying、GetSoundIsLoading、GetSoundDuration、SetSoundVolume、SetSoundPlayPosition。CreateMIDISound可在globals中创建真实Miles sequence和DLS资源；支持循环播放、逻辑通道全抢占、停止/保留、退役、音量及位置，查询读取同一声音和实际Miles状态。当前同步读取完成后才返回，因此GetSoundIsLoading对有效已创建对象返回false。空sound按已实现查询/操作返回0、false或跳过操作。

StopSound的kill标志退役脚本声音，后续查询为未播放/长度0；带淡出时将播放者交给会话独立列表，直到淡出完成才释放声音/DLS。KillSoundWhenDone也转移播放所有权，保留未完成的渐变；循环声音不会自然结束，会话清理负责释放剩余播放者。独立播放者继续参与静音、通道抢占和周期更新。原版完整引用计数/句柄重用、异常对象、范围外音量和所有抢占规则仍待差分，源Pitch非1明确报不支持。

NewSoundEnvironment登记完整源环境请求，例如Default的MOUNTAINS和衰减/反射参数；3D提供器、EAX属性和原5000ms节流尚未应用。[游戏时间控制](game-clock.md)已接入同步初始化；模拟推进/事件、音乐列表/随机选择、普通CreateSound及3D声音继续待实现。该阶段不表示地图声音或完整客户端音频已经还原。原SetAmbientDaySound/SetAmbientNightSound沿用Blizzard.j。

非空间MIDI渐变按声音管理器的100ms脉冲执行，参数是无符号整数步长，0归一到1，负整数保留原32位位型。淡入每次将当前音量加步长后按无符号值夹至源目标；淡出在当前值大于等于步长时相减，小于步长时结束播放，因此精确减到0后要再经过一次脉冲才停止。保留原32位加法回绕。

首次JASS StartSound直接以源目标音量启动；已播放的非空间MIDI保持当前播放位置和音量，并转为稳定播放，能够取消进行中的淡出。内部带淡入的启动路径从当前音量逐步增加。选图界面的会话更新和声音native查询/操作驱动周期更新，延迟回调只处理一次脉冲，不按停顿时间突发补帧。渐变独立于尚未实现的游戏模拟时钟，完整调度相位和3D条件继续待核验。

`--mute`在后台会话globals/config执行前及命令行主函数检查前传入，输出音量为0，仍创建并运行真实Miles资源；保留脚本中的音量值。主函数日志分别记录脚本sound数、设备声音数、DLS库数和环境请求。原始音频和DLL始终从用户安装目录读取，不写临时解码文件。

## 验证与原件

产品/sound目标Win32 Release构建通过、无警告。当前10项定向检查通过、0失败，包含源表、原图资源、JASS非零速率播放、真实Miles音量查询、静音下淡入/淡出、延迟释放、重复启动/淡出取消、独立播放者抢占和100ms更新。播放输出音量为0；正音量读写在未播放声音上检查，不代替听感验收。

BootyBay真实main已经通过时间查询及StartSound，持有2个真实MIDI声音/1个DLS库，随后在 `war3map.j:792:10` SetMapMusic明确失败，退出1、main_completed=false，无Game.dll。DotA/Amazonia和完整界面留待W019起的合并批次，Amazonia的天气尚未实现。

REA核对CreateMIDISound封装 `0x6f21a980` 经 `0x6f21a820`/`0x6f21a720` 创建 `+0x24` 组件。StartSound `0x6f222a00` → `0x6f33ba00`，StopSound `0x6f22c100` → `0x6f33d940`，速率归一化为 `0x6f31fe20`，状态转换为 `0x6f32f200`；淡入/淡出步进分别为 `0x6f3223d0`/`0x6f322810`。周期入口 `0x6f33e4c0` 在更新后以0.1秒重新挂起 `0x6f322180`，最终Miles音量调用的第三参数仍为0。

Unicorn执行原件2,934组淡入/淡出步进、8组速率归一化和80组首次/重复启动，共3,022组、0差异。输入覆盖音量0至127的端点/余量、速率0/1/20/127/超范围正数/负位型、整数回绕和相减至0后停止。对照替换6个链表/物理音频/诊断边界，保留原标量运算与控制路径；不证明物理听感、源定时器或3D分支一致。

```powershell
# watcher/war3
cmake --build --preset release --target war3 war3_sound_tests --parallel 8
./build/windows-x86/bin/Release/war3_sound_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/audio/fade-tests"
# 使用上一步打印的FADE_FIXTURE路径
python tools/verify_sound_fade_cpu.py --fixture "<FADE_FIXTURE>"
```

本项证据为 `tmp/docs-artifacts/war3/audio/fade-{build.log,tests.log,tests/,cpu.json,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。W016–W018的历史合并结果见 `batch-w016-w018.json`；W019–W020当前2/3，相关Miles/界面/三图检查待合并，不重复旧无关检查。原件摘要/库边界见 `audio.md` 与固定profile。
