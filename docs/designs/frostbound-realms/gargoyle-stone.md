# 石像形态

Author: MiYu

协议 113 接入石像形态研究、施放、原模型动画、存档和联机。新遭遇战默认开启；旧存档缺少版本字段时按关闭处理。原始资料、REA 固定版本和可复现的静态证据与玩法一起维护。

## 来源与复现

REA 上游：[morluto/rea](https://github.com/morluto/rea)，固定版本 `6.5.0`，源码提交 `3b79af28e80785afce9f5998d8f03289402a1847`。安装与更新入口见 [REA 维护说明](../../../third_party/rea/README-MENGINE.md)。

源游戏目录为 `E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。导入器依次读取 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq`。`samples/frostbound-realms/gargoyle-stone-sources.json` 记录每个原件的 MPQ、内部路径、字节数和 SHA-256，以及生成器摘要、全部输出摘要和 REA 源站。

`SourceAssets/GargoyleStone/` 保留 24 份原件，包括完整单位、技能、研究表，功能定义、本地化、编辑器字段及原版 BLP。规则、原件、8 张 PNG、纹理元数据及版权说明共 42 项输出。PNG 与原 BLP 的 RGBA 像素一致；版权说明位于 `Assets/Licenses/Classic-Gargoyle-Stone.txt`。

```powershell
python scripts/import-frost-gargoyle-stone.py
python scripts/test-frost-gargoyle-stone-source.py
node scripts/probe-frost-rea-stone.mjs
```

已有 receipt 时导入器优先使用校验通过的保留原件，不依赖游戏安装。通过 `--source-sample` 和 `--output` 可在独立目录重建。目标文件被本地修改、源文件损坏或存在未归属的冲突文件时，导入器在写入前拒绝覆盖。更新原版资料时先导入到新的输出目录，再审核数据及摘要变化。

## 原始规则

| 项目 | 原始值 |
|---|---|
| 研究 `Rusf` | 75 金、150 木、40 秒；`Requires=ugrv,unp2`，即坟场及黑色城堡（三级主基地） |
| 研究按钮 | 槽位 10，S |
| 技能 `Astn` | 槽位 8，F；`stoneform` / `unstoneform` |
| 技能字段 | `Cast1=.7`、`Dur1=.5`、`Cool1=30`、`Cost1=0` |
| 变形字段 | 普通单位 `ugar`、交替单位 `ugrm`、旗帜 7、高度调整 .5、着陆延迟 .5、生命回复率 8 |
| 两种身体 | 410 HP、基础回复 2，回复类型 `blight`；护甲升级每级 +2 |
| 飞行身体 `ugar` | 护甲 3、速度 350、碰撞 8、高度 240、最低高度 90；两套武器 |
| 石像身体 `ugrm` | 护甲 15、速度 0、碰撞 32、地面目标、高度 0、无武器；技能 `Astn,ACmi` |
| 施法动画字段 | `ugar.castpt=0`、`ugrm.castpt=.5`，两者 `castbsw=.51` |
| 模型 | 两种身体使用同一 Gargoyle 模型，缩放 1；石像的附加连接属性为 `alternate` |

规则目录的距离按 100 原版单位对应 1 世界单位换算，完整原始行同时保留。各时间字段是源数据，不能仅将它们相加就声称得到了完整切换时间。

## 静态调用链

probe 绑定 `Game.dll` SHA-256：

`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`

每组调用保存 REA Evidence、原始反汇编、工具状态和输出摘要到 `tmp/docs-artifacts/frost-gargoyle-stone/`。probe 检查目标摘要、执行完成、输出未截断、文件未修改及关键指令；地址不适用于其他游戏版本。

| 地址或链路 | 已观察到的行为 |
|---|---|
| `0x6f4f5c30` → `0x6f48b6e0`，虚表 `0x6f9d1370` | Stone Form 继承通用形态切换实现，并持有独立状态与回复修改器 |
| `0x6f5009e0` / `0x6f508d90` | 返回命令号 `0xd00ee` / `0xd00ef` |
| `0x6f53fc10` | 读取变形旗帜；原始位 1、2、4 分别映射为内部 `0x200000`、`0x400000`、`0x800000` |
| `0x6f54c7e0` / `0x6f54c140` | 分别调用进入钩子 `+0x408`、退出钩子 `+0x410`，再进入共享飞行分类与计时路径 |
| `0x6f4ecf40` → `0x6f4713d0`、`0x6f46e150(1)` | 开始进入时执行魔法效果清理，并增加临时魔免计数 |
| `0x6f1fb130` → `0x6f4713d0` | 与 `common.j` 的 `UnitRemoveBuffsEx` 参数交叉核对，Stone 调用对应正面和负面魔法效果；不选择物理、限时生命和光环，也不限定自动驱散 |
| `IsUnitType` 分支 `0x6f1e8df3` | 魔免类型 26 读取 `unit+0x15c > 0`；`0x6f46e150` 增加该计数，`0x6f471600` 减少该计数 |
| `0x6f4ece60` / `0x6f4ece10` | 进入完成时创建并持有回复修改器，退出钩子释放该修改器；进入完成也释放开始阶段给予的临时魔免，稳定石像的能力表另含 `ACmi` |
| `0x6f4ece60` → `0x6f3f7590` → `0x6f4007b0` | 从等级记录 `+0x30` 取值，传给单位 `+0x98` 的修改器路径，并将引用保存在技能 `+0x1a4` |
| `0x6f045670` → `0x6f10e600` → `0x6f10e250` | 将该独立修改器的值加入时间属性的速率 `+0x7c`，支持额外 +8 回复贡献；所查链路没有地形条件 |
| `0x6f5274f0` | 根据两种身体的移动类型分派到落地 `0x6f54c420` 或起飞 `0x6f54c8a0` |
| `0x6f54c420` | 检查地面位置及 `MorphLandClosest`，执行高度目标/速度变更并安排 `0xd01dd` 事件 |
| `0x6f54c8a0` / `0x6f534ac0` | 切换身体并安排 `0xd01dc` 事件，后续调整高度 |
| `0x6f54c6c0` / `0x6f5315b0` | 共享计时组合等级记录值、技能 `+0x9c` 和有条件的高度调整字段；完成事件为 `0xd01c4` |
| `0x6f5454f0` | 根据当前身体及进入/退出标志调用身体替换和对应完成钩子 |
| `0x6f527400` → `0x6f67bb90/0x6f675e90` → `0x6f186590` | 提交 Morph 和后续 Stand；参数为序列属性及整数 flags，不传控制锁时长 |
| `0x6f180aa9` / `0x6f67f0c5` → `0x6f677d50` | Sprite 动画倍率及普通单位倍率初始化为 1.0；单位刷新沿用其当前倍率 |
| `0x6f12fb80` → `0x6f77a500` → `0x6f77a1e0` | 将倍率写入 renderer `+0x48`，实际时间增量乘该倍率；Astn 的 `0x200` 不含重置倍率的 `0x80` |
| `0x6f65330b` → `0x6f3247b0`，`0x6f6a0b10` | 比较 `modelPath`；同模型跳过重载及其强制 Stand |
| `0x6f64c6a0/0x6f64c780`，`0x6f66b7b0` | 低运动回调仅把 Walk 改回 Stand；Morph 不被覆盖。身体刷新末尾 Birth/Stand 分支受 `IsStructure` 条件控制，普通石像鬼不进入 |

JASS 参数说明复用已保留的 `SourceAssets/CombatRewards/Scripts/common.j`。驱散范围是调用参数层面的静态结论；特殊效果是否存续，仍需逐项核对其分类与运行行为。

## 切换与玩法

默认继承计时属性 `ability+0x9c=0`。REA 字段加载证明 `Cast→level+4`、`Dur→level+8`；控制锁 timer `+e4` 和高度 timer `+10c` 独立。`534800` 释放控制锁时不等待高度 timer。

| 阶段 | 行为 |
|---|---|
| 进入 t0 | 原 Morph 动画、清理现有魔法效果、临时魔免；开始下降 |
| 进入 t0～0.5s | 高度从当前值下降到地面；原飞行身体尚未替换 |
| 进入 t1.0s | 控制锁结束，替换石像身体：15 护甲、地面目标、零速度、无攻击、魔免，开始额外 +8 HP/s |
| 恢复飞行 t0 | 原 Morph Alternate 动画；立即恢复飞行身体与3护甲，停止 +8，启动30秒技能冷却 |
| 恢复飞行 t0.5s | 控制锁结束，可接受普通命令 |
| 恢复飞行 t0.7～1.2s | 独立高度状态升至原高度2.4 |

`53fc10` 将 Astn 原旗帜7映射为不可打断、立即落地动画、立即起飞动画。`3da3c0` 的通用施法流程在进入钩子置位后跳过冷却；退出钩子不置位，随后 `418d20` 安排冷却事件 `d01be`。`HeroDur` 控制的 `+f8` timer 与30秒技能冷却无关。

研究复用 Crypt 队列，校验坟场和黑色城堡，支持精确付费、取消退款、跨建筑重复研究拒绝与中途读档。技能使用原图标和 F 键；原模型的 Morph、Stand Alternate、Morph Alternate、Death Alternate 均被使用，保留原动画数据并按玩法状态采样。

运行时以 `stoneShift` 保存控制锁，`stoneFlight` 保存独立高度时钟。稳定石像仍属于单位，使用0.32碰撞，保持原朝向，禁止移动攻击；坟场护甲升级继续叠加。额外 +8 与现有荒芜之地基础 +2 分别计算。敌方公开状态保留可见姿态与高度，隐藏研究队列和技能冷却。死亡身体保存死亡时的原版单位来源：稳定石像为 `ugrm`，使用 Death Alternate 和原表1秒死亡阶段；进入尚未提交或已返飞时为 `ugar`，使用普通 Death 和2.5秒死亡阶段。转换中死亡保留实际高度。两种身体的 `deathType=0`，均不能供复活、食尸或骷髅召唤使用。尸体来源通过存档和公开快照传递，模型网格随原版交替动画切换；到期判断包含浮点误差容限，避免1秒边界多停一个模拟帧。

普通静止施放的 Morph 按原模型 2.5 秒、Morph Alternate 按 .833 秒以默认 1 倍速采样，跨过 1/.5 秒控制锁结束点继续播放。开始帧取 `stoneShift.frame`；解锁后从 `stoneMorphFrame` 和锁时长恢复相同起点。客户端使用游戏帧时钟和本地帧余量，读档或接收快照后仍对齐该起点。返飞后的有效普通命令或实际攻击清除动画尾段标记，拒绝的命令保持原动画；移动和攻击前摇优先显示自身动作。复用现有存档字段，协议仍为113。

## 验证与边界

```powershell
node scripts/test-frost-gargoyle-stone.mjs
node scripts/test-frost-gargoyle-stone-network.mjs
node scripts/build-frostbound.mjs
node scripts/test-frost-gargoyle-stone-client.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-gargoyle-stone.mjs
```

源资料验证9项、REA静态探针25组、玩法12组、生成客户端6组、实际TCP3组通过；REA/MEngine MCP集成检查3项通过。覆盖完整研究计时、独立控制锁与高度、每帧转换存档、返飞重连、敌方隐私、死亡身体，以及动画尾段的命令接管。生成客户端和原生均检查解锁后的进入动画第30帧、读档后第45帧，以及返飞第15帧和后续动画结束。原生4组通过，控制台错误0；测试副本与当前Main的SHA-256均为 `6531e4b64154f3d3db9766fd9b9660704f0b10053cd374a66d54d34c23fcbf25`。原生结果见 `tmp/docs-artifacts/frost-gargoyle-stone/native-gargoyle-stone.json`。蛛网生成客户端4组、尸体生成客户端1组相关回归通过。原始诊断、截图和测试日志仅存放在该临时目录。

默认1倍速及静止时保留动画的依据来自 renderer 时钟、同模型刷新及运动回调的静态调用链。适用条件为普通石像鬼、没有外部脚本改速、没有新的动作接管；不将此结论推广到所有 buff 或特殊运动。复现入口为上述 probe 的 `animation-command`、`animation-default-rate`、`animation-clock`、`same-model-morph`、`unit-rate-and-idle` 五组。详细临时证据见 `animation-rate-handoff.md`、`animation-body-independent-review.md` 及相邻 REA 原始结果。

原版游戏尚未进行逐帧运行测量。原版阻塞地形寻址、特殊效果的物理/魔法分类、Web/Ensnare施放门禁及变形时捕获状态的存续仍需专项实测。当前着陆复用引擎最近可站立位置搜索；完成落地会清除空中捕获状态。上述交互在本引擎已验证可保存、可重连，不代表已经证明原版全部细节一致。继承计时属性默认0已静态确认，尚未穷尽其所有运行时写入路径。

上一阶段协议相关回归脚本42个中40个通过；已有的 Crypt Lord 生成客户端粒子实体缺失、Shadow Hunter 旧实体引用测试仍失败，与前一阶段基线相同。该结果不代表全项目测试全部通过。
