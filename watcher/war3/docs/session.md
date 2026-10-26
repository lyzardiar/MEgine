# 原生地图配置会话

固定对照为 Warcraft III 1.27.0.52240。`ScriptSession` 拥有当前地图的 JASS Runtime、配置记录和 native 对象表，源 MPQ/地图仅供读取，运行时不加载 Game.dll、不解包资源到磁盘。开始游戏、完整主函数和玩法仍按客户端总矩阵推进。

## 生命周期与配置

构造时读取 W3I/WTS 的名称、玩家 ID、控制类型、种族、固定出生点、势力和坐标，建立16个稳定玩家对象。`initialize()` 通过 Runtime 执行公共库及地图的全部全局初始化；重复初始化拒绝执行。`configure()` 在全局初始化成功后执行原地图 `config`，包括它调用的 Blizzard.j 与地图辅助函数。初始化或配置失败的会话不标记为可用，调用方应丢弃；当前不提供 `main` 的启动流程。

配置 native 将人数/队伍数、放置方式、出生点及优先级、玩家队伍/颜色/控制/种族偏好/姓名/联盟/状态等写入会话，查询读取同一状态。SetMapName/SetMapDescription 解析地图 WTS。Player(index) 返回本会话玩家句柄；枚举保留原始整数位型，不经过对象分配。脚本中的 GetPlayerStartLocationX/Y 沿用 Blizzard.j 函数，再调用 GetStartLocationX/Y，执行原脚本实现。

公共初始化需要的 Group、Timer、Trigger 拥有实际类型与状态，创建、查询、标志修改、销毁作用于对象表。销毁后释放该对象的容器/状态，旧引用再次访问时报告脚本位置；GetHandleId 原样返回句柄位型。对象表由会话释放，无跨地图全局表。TimerStart、触发器动作/事件执行、单位枚举等尚未接入的 native 保持未绑定错误。

默认游戏类型由 W3I 的 melee 标志选择 MELEE(1) 或 USE_MAP_SETTINGS(4)，后续可由调用方提供选项；GetGameTypeSelected 按原件去掉数值8的标志位（掩码 `~8`）。菜单玩家草稿、占槽、本地玩家、AI 和这些默认值与原版创建对局顺序仍待集成/对照，当前16槽初始为空闲；配置成功不表示已经开始对局。

## 原版来源与验证边界

Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`src/jass_enums.inc` 保存44个 common.j 枚举 native 的名称、返回类型、原地址和摘要，仅用于开发复核；客户端回调由 C++ 实现，不调用这些地址。注册入口 `0x6f7e3710` 的参数包含签名、名称和函数地址；ConvertRace 例如对应 `0x6f1db8c0`。GetHandleId 在 `0x6f1e27a0` 跳转到 `0x6f1e6ec0`，原样返回参数。原版存在同名零返回注册表，校验以固定公共 native 的签名与明确地址关联，不以名字首个搜索命中或零返回代替实现。

`tools/verify_jass_enums_cpu.py` 核对原件摘要及注册签名，执行全部44个枚举 native 和 GetHandleId 的原版指令，每个65组整数，**2,925次逐位一致**。无替代函数代码，不加载 DLL。7项原生检查通过，覆盖枚举位型、全局对象、对象状态/销毁与新会话、配置/WTS/出生点/优先级、源玩家/势力与游戏类型、未知 native 阻断以及签名错误。

原版对象分配/引用计数、句柄数值/重用、无效引用与越界的线程策略、完整玩家初始状态尚未逐项差分。当前对象句柄从 `0x100000` 顺序分配且本会话不复用，最多1,048,576条记录；坏范围或失效对象显式报错。该规则用于当前会话状态，不据此宣称原版确定性验收。完整 VM、计时器、触发器、世界/规则、存档/回放及局域网仍未完成。

## 产品入口与证据

`--config-check` 在同一个独立 EXE 内直接读取地图元数据、源脚本并运行全局初始化/config，不创建图形设备。它与 script-check/probe/render 检查互斥。日志区分 `initialized=true config=true main=false`，并记录人数/队伍、有效控制槽位和 native 对象数量。

```powershell
# watcher/war3
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --config-check --log "../../tmp/docs-artifacts/war3/jass/session-dota.log"
./build/windows-x86/bin/Release/war3_session_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/session-enums-native.json"
# 仓库根目录
python watcher/war3/tools/verify_jass_enums_cpu.py
```

DotA_v6.83d 产品最小集成退出0，无 Game.dll：10名额、10队伍记录、类型4、放置3；ID 1–5 属队伍0，7–11 属队伍1；出生点0–9，前组种族偏好4、后组8。全局初始化保留3个Group、4个Timer、1个Trigger。这些是脚本配置结果，内部队伍数量与界面势力分组分别由对应源记录消费；完整选图/玩家草稿/会话联动待下一批。

证据统一在 `tmp/docs-artifacts/war3/jass/`：`session-{build.log,tests-build.log,tests.log,dota.log,enums-native.json,enums-cpu.json,enums-cpu.log,registration-rea.json,enum-conversion-rea.json,handles-rea.json,lookup-rea.json,native-catalog.json,receipt.json}`。原始数据不提交。W013 为新批次1/3，另外两张代表地图、错误恢复、创建游戏与切图释放等在 W013–W015 合并验证。
