# 人族防御塔武器

作者：MiYu。协议 114。原版 `hgtw` 武器接入现有攻击前摇、伤害、弹道、显示、存档和 TCP 流程。源人族新建防御塔及哨塔升级完成时启用 `guardTowerRules=1`；旧存档中没有该标记的塔保留原有规则。塔防模式的通用塔保持原规则。客户端与服务器需使用同一协议，113 客户端会被拒绝。

## 原始数据

| 项目 | 本机原版数据 |
|---|---|
| 武器 | 一套 missile / pierce；基础22，1颗5面骰，伤害23–27 |
| 射程 / 索敌 | 700 / 700，即世界距离7 / 7 |
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

这些探针证明本机字段及装载依据。原版箭矢求解器、目标优先级、碰撞边界、音效和实际逐帧时序尚未运行对照；当前弧线复用引擎已有求解流程。原版列表中的物品、残骸等尚未全部具有可攻击的游戏对象，不将地空单位验收推广到全部目标类别。完整游戏复刻继续进行。

## 复现与验证

```powershell
python scripts/import-frost-guard-tower.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-guard-tower-source.py
node scripts/probe-frost-rea-guard-tower.mjs
node scripts/build-frostbound.mjs
node scripts/test-frost-guard-tower.mjs
node scripts/test-frost-guard-tower-client.mjs
node scripts/test-frost-guard-tower-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-guard-tower.mjs
```

导入器支持 `--source-sample`、`--game`、`--output`、`--library`。已有来源时优先读取保留原件；无需原游戏安装，但转换仍需对应资产库和上述工具。修改过的输出会在写入前被拒绝。21项输出、4份原件及生成器摘要通过；无安装重建逐字节一致，输出被修改时验证拒绝且内容保持不变。

玩法4组、生成客户端2组、实际TCP1组、REA2组、原生2组通过。原生覆盖G键付款与完整50秒升级、末帧前读档、伤害面板、地空目标的原版箭矢、在途保存恢复和实际命中；地面目标额外连续运行90帧、至少10次发射；控制台错误0。原生测试 Main.js SHA-256为 `4dfe9d15ee2bf2b890ad8941f00d81afbafe2faf5eea485b8a172a91e2ccfbc0`，与测试副本一致。原生进程正常退出，runtime缓存因EPERM保留。日志、截图和结果均位于 `tmp/docs-artifacts/frost-guard-tower/`。

通用命中特效池与客户端环形索引统一为24槽，生成场景增加FX8–23。相对HEAD核验原有3784个实体内容、引用目标及相对排列未变；当前场景3800实体。特效池客户端16项、场景池、暗影猎手、地穴领主和战争古树生成客户端检查通过。

主回归除已单独通过的24,000帧暗夜AI经济项外完整运行，退出码0、709条PASS记录；AI结果保留在 `ai-economy.json`。运行器与主入口的唯一差异是省略该AI导入。
