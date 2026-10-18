# 原版生命升级策略

作者：MiYu。协议 104。新建遭遇战使用 `healthUpgradeVersion=1`，为已接入原版数据的人族和德鲁伊研究应用 `rhpx` 的生命比例策略。旧存档缺字段保持版本 0，继续原有的当前生命增加方式；已经采用比例策略的 Rhac 存档保持原有行为。

| 单位 | 研究 | 基础生命 | 每级生命增量 | 等级数 |
|---|---|---:|---:|---:|
| 骑士 | Rhan | 835 | 150 | 1 |
| 牧师 | Rhpt | 290 | 40 | 2 |
| 女巫 | Rhst | 325 | 40 | 2 |
| 猛禽德鲁伊、人形 / 风暴之鸦 | Redt | 300 | 40 | 2 |
| 利爪德鲁伊、人形 | Redc | 430 | 75 | 2 |
| 熊形 | Redc | 810 | 75 | 2 |

完成研究时，先记录当前生命与最大生命之比，增加最大生命，再按原比例恢复当前生命；生命增量和写回生命都按单精度“加 0.5、向下取整”处理。存活单位至少保留 1 HP，死亡单位保持死亡。200/835 HP 的骑士升级时成为 236/985 HP，此数值不包含随后同帧的自然回血。新训练的满血单位直接拥有研究后的满血值。无生命增量的科技不会额外舍入当前生命的小数。

三条研究完成路径与 Rhac 共用生命写入函数。研究费用、前置、时间、队列和退款沿用各自的原版规则；不改变这些参数。研究状态和策略标记随存档、权威 TCP 快照和重连续接保留。

## REA 证据与来源

[REA 上游源站](https://github.com/morluto/rea)、固定版本、安装和维护流程保留在[工具说明](../../../third_party/rea/README-MENGINE.md)。本阶段通过真实 REA 6.5.0 / Rizin 0.8.1 MCP，只读分析本机 `Game.dll`，SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，分析前后相同。

- `0x6f690190` 返回效果标识 `rhpx`，与升级元数据和已保留的研究行一致。
- `CUpgradeHitPointsEx` 的应用方法 `0x6f698cf0` 由虚表单元 `0x6fa4f118` 引用；`0x6f698d42` 向生命修改函数 `0x6f633000` 传入 policy 1。
- `0x6f6331a2` 获取旧生命比例，增加最大生命，再按该比例恢复生命；`0x6f054060 → 0x6f053a90` 执行浮点舍入，常量 `0x6fb593ec` 为 0.5。
- `0x6f689b40` 提供研究等级效果值，应用方法计算新旧效果差值。

研究行、单位绑定和元数据原件已保存在 `SourceAssets/HumanTechnology/`、`SourceAssets/HumanSanctum/`、德鲁伊来源记录和 `SourceAssets/HumanMasonry/Units/`，继续使用各自来源清单及原游戏资产条款。当前修正使用现有数据，不引入额外第三方依赖或重复资产。四组 REA 运行证据放在 `tmp/docs-artifacts/frost-hitpoint-upgrades/`。

## 验证

```powershell
node scripts/probe-frost-rea-rewards.mjs --hitpoint-upgrades
node scripts/test-frost-hitpoint-upgrades-network.mjs
node scripts/build-frostbound.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-hitpoint-upgrades.mjs
```

规则覆盖七种单位形态的全部 13 个研究等级应用，包括小数、濒死、半血、满血、新训练单位、死亡、无关研究、旧版在途存档续跑及非法版本。真实 TCP 覆盖同样七种形态的全部研究等级、实际付款、完整固定步长工期、权限拒绝、研究中重连和精确生命比例。原生验收逐一检查原版按钮/热键、实际付款、完整工期、半程保存加载，以及最后一帧的生命比例和自然回血。

完整 1:1 仍需继续核对原版进程的创建/变形和升级继承路径、其余 `rhpx` 单位绑定、通用亡灵/兽人施法单位的源基础数据及训练规则、其他法力升级绑定、金矿进出、完整建筑武器/碰撞/路径贴图与研究界面/音效。这里的静态调用链和 MEngine 原生验证不等于完成原版进程动态对照。

最终主回归退出码 0、553 条 PASS 记录，仅跳过已独立通过的 24,000 帧 AI 导入，其余导入及正文完整执行。七种形态的 13 次逐级原生完整工期与存档续跑均通过，控制台错误为 0，Editor 正常退出；EPERM runtime 缓存保留。实际原生运行包 Main.js SHA-256 为 `89a7d79e2e3f360f6ef4fb32ba43e00fb546ec253c71bd1622a98b171a46ea08`。汇总保留于 `tmp/docs-artifacts/frost-hitpoint-upgrades/regression-summary.json`。

人族/德鲁伊训练及月井的当前法力比例与回复规则见[法力升级说明](mana-upgrades.md)。
