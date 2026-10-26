# 原生地图配置会话

固定对照为 Warcraft III 1.27.0.52240。`ScriptSession` 拥有当前地图的 JASS Runtime、配置记录和 native 对象表，源 MPQ/地图仅供读取，运行时不加载 Game.dll、不解包资源到磁盘。开始游戏、完整主函数和玩法仍按客户端总矩阵推进。

## 生命周期与配置

构造时读取 W3I/WTS 的名称、玩家 ID、控制类型、种族、固定出生点、势力和坐标，建立16个稳定玩家对象。`initialize()` 通过 Runtime 执行公共库及地图的全部全局初始化；重复初始化拒绝执行。`configure()` 在全局初始化成功后执行原地图 `config`，包括它调用的 Blizzard.j 与地图辅助函数。初始化或配置失败的会话不标记为可用，调用方应丢弃。W015增加globals前的世界挂接及应用草稿后的 `startMain()`；main只尝试一次，失败会使会话失效，实际原图main仍未完整完成，见[世界与主函数](world.md)。

配置 native 将人数/队伍数、放置方式、出生点及优先级、玩家队伍/颜色/控制/种族偏好/姓名/联盟/状态等写入会话，查询读取同一状态。SetMapName/SetMapDescription 解析地图 WTS。Player(index) 返回本会话玩家句柄；枚举保留原始整数位型，不经过对象分配。脚本中的 GetPlayerStartLocationX/Y 沿用 Blizzard.j 函数，再调用 GetStartLocationX/Y，执行原脚本实现。

公共初始化需要的 Group、Timer、Trigger 拥有实际类型与状态，创建、查询、标志修改、销毁作用于对象表。销毁后释放该对象的容器/状态，旧引用再次访问时报告脚本位置；GetHandleId 原样返回句柄位型。对象表由会话释放，无跨地图全局表。TimerStart、触发器动作/事件执行、单位枚举等尚未接入的 native 保持未绑定错误。

默认游戏类型由 W3I 的 melee 标志选择 MELEE(1) 或 USE_MAP_SETTINGS(4)，后续可由调用方提供选项；GetGameTypeSelected 按原件去掉数值8的标志位（掩码 `~8`）。16槽在配置前初始为空闲；选图完成后应用玩家草稿，配置成功不表示已经开始对局。

## 选图与玩家草稿

`MapPreparation` 的单个工作线程持有独立归档视图和解码器，直接读地图成员，执行全局初始化/config后转交 `unique_ptr<ScriptSession>`，会话地址保持不变。公共归档/缓存跨菜单、工作线程和世界共享；世界fork当前资源视图，工作线程卸载后仍可读取地图，最后一个视图释放地图缓存，见[归档寿命](archives.md)。GPU纹理和FDF更新在界面线程进行。待处理请求只保留最新一个，过期结果丢弃；进入目录、切图或失败会立即清空旧预览、草稿及会话。正在执行的单次解析/编译不能中途打断，阶段间检查过期和停止请求，退出时等待该线程释放。

玩家槽消费配置后的控制类型、队伍、颜色、种族位型和可选标志，保留稀疏源ID/出生点/势力名称。配置内的队伍数量不替代W3I势力标题。不能用单一种族表示的偏好位组合保留原值，用户选择新种族时才改写。界面种族选项仍为原有五项，组合偏好显示随机。

`applySetup()` 将草稿写回同一个会话：本地玩家/AI占用槽，开放槽为空闲用户控制，关闭槽为空闲且控制类型NONE；AI保存0/1/2难度，障碍值由原数值层转换为Real。出生点、联盟与其余脚本状态保留。配置或修改失败不提交部分状态；同图重选保留编辑。GetLocalPlayer/GetAIDifficulty/GetPlayerHandicap查询当前会话；尚未选择本地玩家时GetLocalPlayer显式报告阶段错误。原版在config前建立本地身份的顺序、空/关闭槽和默认AI策略仍需对照，当前不宣称完整开局一致性。

固定原件注册记录中三个查询入口为 `0x6f1e3150`、`0x6f1e1500`、`0x6f1e3ce0`；REA确认后两者读取玩家字段 `+0x26c`、`+0x29c`，本地玩家入口依赖游戏状态。来源保留在 `tmp/docs-artifacts/war3/jass/setup-player-natives-rea.json`，客户端使用自有状态，不调用原件地址。该检查不证明默认字段与整个生命周期一致。

## 原版来源与验证边界

Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`src/jass_enums.inc` 保存44个 common.j 枚举 native 的名称、返回类型、原地址和摘要，仅用于开发复核；客户端回调由 C++ 实现，不调用这些地址。注册入口 `0x6f7e3710` 的参数包含签名、名称和函数地址；ConvertRace 例如对应 `0x6f1db8c0`。GetHandleId 在 `0x6f1e27a0` 跳转到 `0x6f1e6ec0`，原样返回参数。原版存在同名零返回注册表，校验以固定公共 native 的签名与明确地址关联，不以名字首个搜索命中或零返回代替实现。

`tools/verify_jass_enums_cpu.py` 核对原件摘要及注册签名，执行全部44个枚举 native 和 GetHandleId 的原版指令，每个65组整数，**2,925次逐位一致**。无替代函数代码，不加载 DLL。7项原生检查通过，覆盖枚举位型、全局对象、对象状态/销毁与新会话、配置/WTS/出生点/优先级、源玩家/势力与游戏类型、未知 native 阻断以及签名错误。

原版对象分配/引用计数、句柄数值/重用、无效引用与越界的线程策略、完整玩家初始状态尚未逐项差分。当前对象句柄从 `0x100000` 顺序分配且本会话不复用，最多1,048,576条记录；坏范围或失效对象显式报错。该规则用于当前会话状态，不据此宣称原版确定性验收。完整 VM、计时器、触发器、世界/规则、存档/回放及局域网仍未完成。

## 产品入口与证据

`--config-check` 在同一个独立EXE内直接读取地图元数据、地形/路径、源脚本并运行全局初始化/config，不创建图形设备。它与script-check/main-check/probe/render检查互斥。日志区分 `initialized=true config=true main=false`，并记录人数/队伍、有效控制槽位和native对象数量。

```powershell
# watcher/war3
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --config-check --log "../../tmp/docs-artifacts/war3/jass/session-dota.log"
./build/windows-x86/bin/Release/war3_session_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/session-enums-native.json"
# 仓库根目录
python watcher/war3/tools/verify_jass_enums_cpu.py
```

DotA_v6.83d配置保留10名额、10队伍记录、类型4、放置3；ID1–5属队伍0，7–11属队伍1；出生点0–9，前组种族偏好4、后组8，3个Group、4个Timer、1个Trigger。内部队伍数量与界面势力分组分别由对应源记录消费。W013–W015在 `a07fcab` 合并验证session7/setup4/browser14，复用world7，共32项通过；三图globals/config及产品导航104/104/110帧通过，无Game.dll。完整main均在未实现的天气/声音环境native失败，原版开局时序和可玩流程继续待实现/对照。

证据统一在 `tmp/docs-artifacts/war3/jass/`：`session-{build.log,tests-build.log,tests.log,dota.log,enums-native.json,enums-cpu.json,enums-cpu.log,registration-rea.json,enum-conversion-rea.json,handles-rea.json,lookup-rea.json,native-catalog.json,receipt.json}` 及 `setup-{build.log,tests.log,player-natives-rea.json}`；界面检查见 `map-menu/setup-{browser-tests.log,browser-tests/,dota*}`。原始数据不提交。W015已实现世界/main入口，本批3/3，三图与界面/会话合并验证结果统一记录在测试队列；创建游戏与完整运行仍在总矩阵待实现。
