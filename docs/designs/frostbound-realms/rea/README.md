# REA 战斗奖励对照

Author: MiYu。2026-10-18。协议 96。本轮完善新建遭遇战的金币与英雄经验；旧存档和其他模式保留原有行为。

## 来源与静态证据

目标：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll`。REA 确认为 x86/PE32，SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。本次没有执行或修改魔兽程序。

使用 [REA 6.5.0](https://github.com/morluto/rea) 和 [Rizin 0.8.1](https://github.com/rizinorg/rizin/releases/tag/v0.8.1)。版本、官方来源、下载地址、校验值和许可分别保存在 `third_party/rea/README-MENGINE.md`、`third_party/rea/rizin-source.json`。项目 MCP 通过 `REA_RIZIN_COMMAND` 指定 Rizin。

真实 MCP Evidence 保存在 `rewards-mcp-identity.json`、`rewards-mcp-field-loader.json`。原版指令在 `0x6f693492`、`0x6f6934a6`、`0x6f6934ba` 读取 `bountydice`、`bountysides`、`bountyplus`，对应数据对象 `0x224`、`0x230`、`0x23c` 字段。记录包含工具身份、退出码 0、目标摘要未变化。

从实际 MPQ 覆盖顺序读取 `UnitBalance.slk`、`MiscGame.txt` 和 `common.j`，保留原件及来源归档、大小、SHA-256。836 个单位的等级、建筑分类、金币骰子写入 `samples/frostbound-realms/combat-rewards.json`。经验常量复用 `paladin-rules.json`，导入时逐项与本次原始 `MiscGame.txt` 核对。来源清单是 `combat-rewards-sources.json`，原件在 `SourceAssets/CombatRewards/`。

## 游戏行为

- 新建遭遇战启用 `combatRewardsVersion=1`，采用普通对战的玩家无单位赏金政策，玩家单位、建筑和英雄不再提供此前固定的 25/80/140 金币。没有新增自定义地图赏金开关。
- 有原版身份的中立单位按原始奖金和骰子结算，复用现有确定性 RNG。没有原版身份的原创中立单位保留 25 金币，不虚构原版 rawcode。
- 普通单位、英雄按对应原始等级表和递推公式提供经验；召唤物使用 0.5 系数，建筑不提供经验。
- 原版 1200 经验范围对应样例 12 世界单位。优先在附近英雄间分配；附近没有英雄时按 `GlobalExperience=1` 回退到存活己方英雄。镜像不参与分配。
- 野怪经验按英雄等级衰减为 80%、70%、60%、50%、0%；五级后不再从野怪获得经验。满级英雄按原版常量占用份额但不继续累加经验，每名接收者取得整数经验。
- 缺少版本字段的旧存档恢复为版本 0，保持固定奖励。非法版本和跨模式启用被拒绝，并保留此前存档错误校验顺序。MOBA、塔防和 RPG 保持版本 0。

这些规则由原版数据和接口语义指导实现。指令证据确认了赏金字段加载，并没有独立证明整个击杀函数；尚未在运行的魔兽中逐项对照经验分配和舍入边界，不宣称逐指令等价。

## 验证与交接

- 新增 12 项规则检查：源文件摘要、玩家击杀收益、五级野怪衰减边界、全局/附近分配、整数共享、满级分摊、召唤物、建筑、随机数续接、旧存档及非法版本。
- 新增真实双客户端 TCP 检查，验证协议 96、实际攻击、金币与经验、敌方资源隐私和严格存档恢复。
- 14 个定向回归入口全部通过：奖励、维护费、英雄死亡、尸体、人族单位、控制魔法的规则/网络，以及 MOBA 和塔防。见 `targeted-regression.log`。
- 原生 Editor 通过三个实际战斗场景：旧存档、敌方玩家、中立野怪。真实菜单载入和脚本推进后的金币/经验符合预期，控制台错误 0；报告及画面为 `native-combat-rewards.json`、`combat-rewards-native.png`。编辑器进程正常退出；报告列出的临时 runtime 因 Windows EPERM 保留，未强制修改权限。
- 样例生成通过，场景保持 4,461 实体、431 模型条目；当前引擎 Release 编译通过（`editor-build.log`）。原生验收使用报告中记录的独立编辑器路径和摘要。
- 全量入口在 `test-frost-human-army-client.mjs` 的既有 `/Blacksmith/` 命令栏提示断言处停止。使用 Git 原始 `Main.js` 可复现同样失败（`baseline-ui.log`）；未修改该命令栏行为，也未将全量入口记为通过。

复现命令：

```powershell
node scripts/probe-frost-rea-rewards.mjs
python scripts/import-frost-combat-rewards.py
node scripts/test-frost-combat-rewards.mjs
node scripts/test-frost-combat-rewards-network.mjs
node scripts/build-frostbound.mjs
$env:MENGINE_EDITOR_EXECUTABLE = 'D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-combat-rewards.mjs
```

Probe 地址绑定上述 Game.dll 摘要；其他版本会被拒绝，需要重新定位。原始数据遵循 Blizzard 原有条款。阶段源码和证据由 Git 独立提交追踪。
