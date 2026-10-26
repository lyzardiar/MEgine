# 原图 MIDI 声音与源表

固定对照为Warcraft III 1.27.0.52240。`SourceTable`读取原SYLK的继承坐标、稀疏行列、引用字符串/转义引号和分号，保留源列名/值；只消费常量，不执行表格公式。每表16MiB，最多512列、262144行、1048576个实际单元格，值限制65536字节，损坏或不支持的源数据显式报错。

`SoundScene`从当前世界的共享归档视图读取 `UI\SoundInfo\MIDISounds.slk` 和 `EnvironmentSounds.slk`，地图成员覆盖公共资源。目录中的重复分隔符归一化后，MIDI与DLS继续经归档直接读入内存。声音定义保留标签、文件、音色库、Volume、Priority、Channel、Pitch、Radius和Flags。原版LordaeronSummer/Village昼夜声音为Volume80、Priority1000、Channel15、Radius5000，共用LordaeronSummer.dls。

已绑定10个native：NewSoundEnvironment、CreateMIDISound、StartSound、StopSound、KillSoundWhenDone、GetSoundIsPlaying、GetSoundIsLoading、GetSoundDuration、SetSoundVolume、SetSoundPlayPosition。CreateMIDISound可在globals中创建真实Miles sequence和DLS资源；支持零渐变率下的循环播放、逻辑通道全抢占、停止/保留、退役、音量及位置，查询读取同一声音和实际Miles状态。当前同步读取完成后才返回，因此GetSoundIsLoading对有效已创建对象返回false。空sound按已实现查询/操作返回0、false或跳过操作。

StopSound的kill标志退役脚本声音并释放其native资源，后续查询为未播放/长度0。KillSoundWhenDone将播放所有权交给会话的独立列表，脚本对象退役后声音可继续到结束；会话清理会释放剩余播放者。循环声音不会自行结束，调用者应先停止；原版完整引用计数/句柄重用、异常对象和所有抢占规则仍待差分。源表Pitch非1及非零声音渐变在执行时明确报不支持，保留原fadeIn/fadeOut输入，未用即时音量代替渐变。

NewSoundEnvironment登记完整源环境请求，例如Default的MOUNTAINS和衰减/反射参数；3D提供器、EAX属性和原5000ms节流尚未应用。GetFloatGameState时间、音乐列表/随机选择、普通CreateSound及3D声音继续待实现。该阶段不表示地图声音或完整客户端音频已经还原。原SetAmbientDaySound/SetAmbientNightSound沿用Blizzard.j，未把它们注册成native。

`--mute`在后台会话globals/config执行前及命令行主函数检查前传入，输出音量为0，仍创建并运行真实Miles资源；保留脚本中的音量值。主函数日志分别记录脚本sound数、设备声音数、DLS库数和环境请求。原始音频和DLL始终从用户安装目录读取，不写临时解码文件。

## 验证与原件

产品/sound目标Win32 Release构建通过、无警告。6项定向检查通过、0失败：SYLK坐标/引号/分号/损坏输入、原声音与环境列、地图SLK覆盖及真实资源、JASS全局创建/查询/播放控制、通道抢占/独立播放所有权/释放、非零渐变导致main明确失败。播放输出音量为0，检查实际设备状态，不代替听感验收。

BootyBay和DotA的真实main均完成Default环境请求、1个sound和1个真实MIDI/DLS库创建；之后在 `Scripts\Blizzard.j:1224:12` 的GetFloatGameState明确失败，退出1、main_completed=false，无Game.dll。这两图尚未进入后续StartSound或单位/对战流程。Amazonia仍需天气native。

REA核对CreateMIDISound入口 `0x6f1de400`、创建封装 `0x6f21a980`，保留循环与源输入；GetSoundIsPlaying `0x6f1e4c40`、StopSound `0x6f1f8200`、KillSoundWhenDone `0x6f1efcb0` 关联实际对象。声音的普通/旧MIDI组件路径不同，当前完整渐变仍未还原。GetFloatGameState `0x6f1e2500` 只处理状态2，引用经 `0x6f2676d0` 定位并由 `0x6f03adf0` 求值/夹取；Set入口为 `0x6f1f4da0`/`0x6f03afb0`。初始时间与该变量的推进/事件机制尚未查明，保持未绑定错误。

```powershell
# watcher/war3
cmake --build --preset release --target war3 war3_sound_tests --parallel 8
./build/windows-x86/bin/Release/war3_sound_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/audio/sound-tests"
```

证据为 `tmp/docs-artifacts/war3/audio/sound-{build.log,tests.log,tests/,main-bootybay.log,main-dota.log,*-rea.json}`。原件摘要/库边界见 `audio.md` 与固定profile。W016–W018在 `6557119` 合并验证资源/Miles/界面28项并复用sound6项，已实现范围34通过、0失败；三图配置/菜单通过，完整main失败保留实现队列，见 `batch-w016-w018.json` 和测试队列。
