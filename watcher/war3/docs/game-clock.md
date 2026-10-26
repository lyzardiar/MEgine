# 游戏时间与昼夜控制

阶段A接续新增1/32秒会话步进、时刻回绕、计时器和阈值通知；原main直接设置时刻同样通知事件。BootyBay原main/250ms推进及bj_gameStarted回调通过，见 `script-events.md`。下述3,295次数值对照只覆盖同步变量层，不证明新增步进、调度顺序、跨日/多日或源RNG一致性；这些进入阶段验证。

`World` 持有独立 `GameClock`。地图世界在globals之前建立，从 `Units\MiscData.txt` 读取 `[Misc]` 的 `DayLength`、`DayHours`、`Dawn` 和 `Dusk`，再应用本地图 `war3mapMisc.txt` 的逐字段覆盖。公共归档/地图仍直接读入内存，不写配置副本或解包目录；切图创建新的时钟状态。

固定1.27原件默认值为480秒、24小时、黎明6、黄昏18。底层变量初值为0，倍率为1；`Blizzard.j` 的 `MeleeStartingVisibility` 才设置近战起始8点。菜单停留、资源读取和机器时间都不会推进此状态。

绑定5个真实会话接口：`GetFloatGameState`、`SetFloatGameState`、`GetTimeOfDayScale`、`SetTimeOfDayScale`、`SuspendTimeOfDay`。浮点状态仅2有效，其他编号读0且不写入；倍率保留正、零、负值，暂停只改变控制标记，保留当前时刻和倍率。潜在推进速率按原件的 `scale * DayHours / DayLength` 顺序，用已验证的JASS Real运算计算。昼间区间为 `Dawn <= time < Dusk`。

变量赋值遵循原件的先求当前值、计算请求差值、加回当前值再夹取的顺序；读取保留原件零速率求值对正负零/非规格化值的归一化，不能直接回传原始存储位。时刻变量的夹取范围为0至DayHours，倍率变量为正负最大有限Real。源配置采用有符号十进制Real，非有限值与非正周期明确失败。

本项覆盖同步globals/config/main期间的变量与控制状态，**尚未驱动模拟时间**。原件通过跨日事件 `0x80262` 在DayHours处重置0；当前变量层只做夹取，尚未派发该回绕或昼夜/脚本事件。模拟tick、累计时间单位、反向推进、边界事件顺序和时间触发器必须在后续调度实现中完成，不能以当前数值检查代替完整昼夜验收。界面/地图渲染也尚未消费时钟。

REA依据来自固定 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`：

| 行为 | 原件入口 |
| --- | --- |
| CGameState注册，时刻0/倍率1 | `0x6f266320`，Real引用vtable `0x6f96fd60` |
| 惰性建立与时刻上下界 | `0x6f1c3200` → `0x6f268720` |
| 时间状态读/写 | `0x6f1e2500` / `0x6f1f4da0` |
| 引用、求值、赋值与夹取 | `0x6f2676d0`、`0x6f03adf0`、`0x6f03afb0`、`0x6f10e2c0` |
| 暂停/恢复，倍率，推进速率和跨日事件 | `0x6f1f8870`、`0x6f1f7060`、`0x6f1e5a50`、`0x6f26dea0`、`0x6f26df20`、`0x6f26df90`、`0x6f26b550` |

Win32 Release产品/clock目标构建通过，无警告；6项定向检查通过，涵盖初值/暂停/倍率/昼夜端点、源地图覆盖、globals/main/新会话状态、无效状态/缺失世界诊断及原版BootyBay世界。Unicorn逐位对照3,288组变量赋值和7组原件速率计算，0失败。对照替换了引用解析、零模拟时差和时间戳存储3个边界函数；变量没有订阅者，**不证明事件或运行时间推进一致**。

BootyBay真实main已通过原GetFloatGameState停止点，创建两个真实MIDI声音后在 `Scripts\Blizzard.j:2482:14` 的StartSound非零fade-in明确失败，`main_completed=false`、无Game.dll。DotA本项未重复运行，三图联动及受影响选图范围保留合并验证。

```powershell
# watcher/war3
cmake --build --preset release --target war3 war3_clock_tests --parallel 8
./build/windows-x86/bin/Release/war3_clock_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/clock/tests"
python tools/verify_clock_cpu.py
```

原始REA、夹具、日志与摘要保留 `tmp/docs-artifacts/war3/clock/`：`clock-*-rea.json`、`build.log`、`tests.log`、`tests/clock-native.json`、`clock-cpu.json`、`main-bootybay.log`、`receipt.json`。不提交原件、截图或运行快照。
