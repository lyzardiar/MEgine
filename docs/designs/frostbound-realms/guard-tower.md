# 人族防御塔武器

作者：MiYu。协议 114。原版 `hgtw` 武器接入现有攻击前摇、伤害、弹道、显示、存档和 TCP 流程。源人族新建防御塔及哨塔升级完成时启用 `guardTowerRules=1`；旧存档中没有该标记的塔保留原有规则。塔防模式的通用塔保持原规则。客户端与服务器需使用同一协议，113 客户端会被拒绝。

## 原始数据

| 项目 | 本机原版数据 |
|---|---|
| 武器 | 一套 missile / pierce；基础22，1颗5面骰，伤害23–27 |
| 射程 / 索敌 | 700 / 700，即世界距离7 / 7 |
| 发射距离缓冲 | RngBuff1=250，即世界距离2.5；用于已开始攻击的出手检查 |
| 攻击间隔 | 0.9秒 |
| 前摇 / 后摇字段 | 0.3 / 0.3秒 |
| 目标列表 | ground、structure、debris、air、item、ward |
| 箭矢 | `Abilities/Weapons/GuardTowerMissile/GuardTowerMissile.mdl` |
| 速度 / 弧度 | 1800 / 0.15，即世界速度18 |
| 发射偏移 | `(0,0,145)`，转换后世界高度1.45 |
| 塔自身受击高度 | 120；箭矢对目标使用目标的已接入受击高度 |

`guard-tower.json` 保留完整 `UnitWeapons` 行、HumanUnitFunc 节和源穿刺护甲倍率。伤害使用现有确定性随机状态逐次掷骰；通用武器研究不加到此武器上。客户端显示“23 - 27”和穿刺类型。攻击前摇沿用共享计时；0.9秒边界使用浮点容差，避免额外等待一个模拟帧。

弹道保存武器标记、发射点和曲线进度，塔死亡后仍按发射时规则命中；读档继续相同轨迹和伤害。公开快照只发送现有的弹道位置、速度、美术和年龄字段，客户端据此显示原版采样模型。专用箭矢使用 `Assets/GuardTower/`，转换通过现有 MDX、节点及骨骼采样管线。

## 来源和 REA

原游戏：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。读取优先级为 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq`。四份原件保留在 `SourceAssets/GuardTower/`；`guard-tower-sources.json` 记录原路径、MPQ、字节数、SHA-256、转换工具及输出摘要。模型与只读 `asset-library/warcraft-iii/remaining-ready` 中的已签名原件校验一致。资产适用 Blizzard 原游戏条款。

[REA 源站](https://github.com/morluto/rea)固定6.5.0，源码提交、许可和更新步骤见[工具维护说明](../../../third_party/rea/README-MENGINE.md)。`probe-frost-rea-guard-tower.mjs` 绑定 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`：

- `weapon-fields`：验证 Missilearc、Missilespeed、dmgpt1、backSw1 以及 `0x6fa51090` 附近字段指针表。
- `unit-weapon-loader`：`0x6f693ad8` 起的装载代码读取 acquire、launchX/Y/Z、impactZ 并调用 `0x6f689500`。

- `range-buffer-source/cache/repack/install`：`RngBuff` 两个武器槽由行结构 `+0x734+slot*12` 经缓存 `+0x108+slot*4`、单位参数 `+0xa8+slot*4`、攻击初始化参数 `+0x28+slot*0x68` 安装到攻击能力的 `+0x26c+slot*8` 值字段。`0x6f6532be` 的参数基址是 `ebp-0x1b0`；`0x6f653b26` 将该数组的 `ebp+slot*4-0x108` 复制到打包结构。
- `range-buffer-release`：攻击回调 `0x6f47ce80` 调用 `0x6f476f80`；`0x6f47708c` 取当前武器距离，`0x6f4770ae` 读取对应缓冲，`0x6f4770c4` 相加后调用 `0x6f03e3a0` 做距离检查。
- `range-start-check`：开始/继续攻击检查读取正常攻击距离（`+0x258+slot*8`），与出手检查分开。
- `collision-source/install/minimum`：collision源行 `+0x3f8` 经缓存 `+0x19c` 和 `0x6f656b50` 返回；单位虚表 `0x6fa4a704 + 0x168` 指向 `0x6f656bc0`。`0x6f676e70` 读取并以1为下限，通过 `0x6f03f100` 缩放到身体 `+0x90`。
- `collision-distance/plane/boundary`：`0x6f03e3a0` 加上两个身体的 `+0x90`，调用平面距离平方函数 `0x6f053660`；`0x6f03ebf0` 将身体 `+0x78/+0x7c` 与 `+0x80/+0x84` 组合成两个平面坐标。边界在 `0x6f03e49c` 起比较，容差常量位于 `0x6fb59398`。
- `acquisition-source/distance`：acquire源行 `+0x5e4` 经缓存 `+0x194`、`0x6f64bd10` 进入攻击能力 `+0x244`。`0x6f47b720` 读取索敌距离，`0x6f480b12` 调用它后交给同一身体距离检查。


源防御塔的自动索敌、手动攻击起手和出手检查使用双方身体半径与平面距离。`human-masonry.json` 保留的 hgtw `collision=72` 对应0.72世界单位；目标优先使用已有源碰撞档案，人族建筑读取 `sourceBalance.collision`，缺少原版档案的目标保留现有半径。源身体最小半径为原游戏1单位。普通射程与索敌距离均为700，对穴居恶魔（32）中心距离边界为804，对石像鬼（8）为780；出手再加250缓冲。飞行高度不参与这一距离判定，目标可见性和可攻击性检查仍生效。

原版距离函数按1/32原游戏单位缩放坐标，比较平面距离平方；平方差小于0.001时接受边界。世界坐标按1/100转换，对应平方差容差0.0001024。当前实现使用现有模拟帧位置和JavaScript数值，原版移动身体插值与软浮点运算的逐位一致性仍需继续对照。

防御塔在前摇期间保留已选目标；出手时使用普通射程加源缓冲检查距离。目标可以在前摇内退远后返回；出手时仍超出缓冲则取消这一箭。新目标索敌与新一轮前摇使用普通距离，缓冲不扩大索敌范围。停止或切换攻击目标的命令清除旧前摇，死亡、不可攻击或不可见目标仍按共享目标规则取消；中途保存恢复保留同一目标和计时。该修正沿用协议114和现有存档/公开字段。

这些探针证明本机字段及上述静态调用链。原版箭矢求解器、目标优先级、移动身体插值、软浮点边界、音效和实际逐帧时序尚未运行对照；当前弧线复用引擎已有求解流程。原版列表中的物品、残骸等尚未全部具有可攻击的游戏对象，不将地空单位验收推广到全部目标类别。完整游戏复刻继续进行。

## 复现与验证

```powershell
python scripts/import-frost-guard-tower.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-guard-tower-source.py
node scripts/probe-frost-rea-guard-tower.mjs
node scripts/build-frostbound.mjs
node scripts/test-frost-guard-tower.mjs
node scripts/test-frost-guard-range.mjs
node scripts/test-frost-guard-collision.mjs
node scripts/test-frost-guard-tower-client.mjs
node scripts/test-frost-guard-tower-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-guard-tower.mjs
```

导入器支持 `--source-sample`、`--game`、`--output`、`--library`。已有来源时优先读取保留原件；无需原游戏安装，但转换仍需对应资产库和上述工具。修改过的输出会在写入前被拒绝。21项输出、4份原件及生成器摘要通过；无安装重建逐字节一致，输出被修改时验证拒绝且内容保持不变。

玩法4组、距离缓冲4组、身体距离3组、生成客户端8组、实际TCP7组、REA16组、原生8组通过。身体距离覆盖穴居恶魔、石像鬼、步兵、牧师、主城和防御塔的自动／手动攻击边界、双方半径的出手缓冲及读档逐帧一致性。原生覆盖G键付款与完整50秒升级、末帧前读档、伤害面板、地空目标的原版箭矢、在途保存恢复和实际命中；地面目标额外连续运行90帧、至少10次发射。距离用例包含前摇目标位于8.5和11.5处的发射／取消、S键取消，以及穴居恶魔8.039／8.041和石像鬼7.79的自动索敌与箭矢显示；控制台错误0。原生测试 Main.js SHA-256为 `ee7de9e73b9bab90d527192d16e8902e4df9858d0cd8b6ab7ba5c2a0db580fb6`，与测试副本一致。原生进程正常退出，runtime缓存因EPERM保留。原始证据位于 `tmp/docs-artifacts/frost-guard-tower/`。

通用命中特效池与客户端环形索引统一为24槽，生成场景增加FX8–23。增容时核验原有3784个实体内容、引用目标及相对排列未变；当前场景3800实体。特效池客户端16项、场景池、暗影猎手、地穴领主和战争古树生成客户端检查通过。

最终源码主回归 `node scripts/test-frostbound.mjs` 退出码0，735条PASS记录，含24,000帧AI验证。暂存Main与原生及生成产物摘要一致。证据为 `tmp/docs-artifacts/frost-guard-tower/collision-regression.log`、`collision-rea.log`、`collision-native.log` 和 `collision-index-verification.json`。
