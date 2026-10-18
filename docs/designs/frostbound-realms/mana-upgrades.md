# 原版法力训练与月井回复

作者：MiYu。协议 104，新建遭遇战使用 `manaUpgradeVersion=1`。牧师、女巫、猛禽/风暴之鸦、利爪/熊形训练及月井之春，按本机原版 `rmnx` 的策略更新现有单位：最大法力增加后，按升级前的法力比例恢复当前法力，并执行单精度“加 0.5、向下取整”。空法力保持为零，随后照常计算同帧回复；没有法力增量的研究不舍入当前法力。

| 对象 | 研究 | 基础最大法力 | 每级增量 | 等级数 |
|---|---|---:|---:|---:|
| 牧师、女巫 | Rhpt、Rhst | 200 | 100 | 各 2 |
| 猛禽德鲁伊、风暴之鸦 | Redt | 200 | 100 | 各 2 |
| 利爪德鲁伊、熊形 | Redc | 200 | 100 | 各 2 |
| 月井 | Rews | 300 | 125 | 1 |

例如已有单位的 75/200 法力，在完成一级训练时成为 113/300，此值不含随后同帧的自然回复。新训练单位按原件的 `mana0` 数据初始化：人族施法单位和猛禽/风暴之鸦为 75，利爪/熊形为 100；新月井为 100。升级不会对新单位的初始法力再做一次比例缩放。

月井之春的 `rmnr` 为回复速率的加法效果：原版表的 1.25 加 0.52，得到夜间每秒 1.77；白天不回复。`night-elf-technology.json` 的目录数据版本为 2，使用 `manaRegenBonus` 保存 0.52，`upgradedManaRegen` 保存 1.77。旧存档缺少 `manaUpgradeVersion` 时恢复为版本 0，保留研究时当前法力不变及月井旧回复规则，保证在途存档续跑。

## REA 证据与来源

[REA 源站](https://github.com/morluto/rea)、固定版本、安装及维护方式保留在[工具说明](../../../third_party/rea/README-MENGINE.md)。真实 REA 6.5.0 / Rizin 0.8.1 MCP 对本机 `Game.dll` 做只读分析，SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，分析前后相同。

- `CUpgradeManaEx`：TypeDescriptor `0x6fbb06d0`，COL `0x6fac8c1c`，虚表 `0x6fa4f380`；效果标识函数 `0x6f691c50` 返回 `rmnx`，应用方法 `0x6f698ed0`。
- `0x6f698f2c` 传入 policy 1 调用 `0x6f652fa0`。`0x6f6530c4` 取得旧法力比例、修改最大法力，再在 `0x6f653111` 后乘新上限、舍入、写回当前法力。空上限的比例由 `0x6f399060` 返回零。百分比最大法力类 `CUpgradeMana` 也使用同一 policy 1 写入。
- `CUpgradeManaRegen`：应用 `0x6f698f40`，调用 `0x6f652f60`，通过 `0x6f0529d0` 把效果差值加到 `unit+0xd4` 的回复率，再由 `0x6f67fd40` 更新回复过程。升级元数据将 `rmnr` 标为 Mana Regen；最大法力百分比使用独立的 `rman`。

研究行、单位绑定、本地化及元数据继续使用已有 `SourceAssets/HumanSanctum/`、德鲁伊来源记录和 `SourceAssets/WarcraftIII/`；摘要与档案名保留在相应来源清单。月井目录由 `scripts/import-frost-night-elf-technology.py` 生成，保留原始 Rews、rmnx/rmnr 和 Ambt 夜间限制。原游戏资产条款继续适用。

八组 REA 诊断、规则/TCP/原生运行输出保存在 `tmp/docs-artifacts/frost-mana-upgrades/`，不提交原始运行 JSON 和截图。原版进程的初始化、变形与升级继承调用顺序仍需动态对照；本阶段的静态调用链及 MEngine 验收不能替代这一项验收。

## 复现

```powershell
node scripts/probe-frost-rea-rewards.mjs --mana-upgrades
python scripts/import-frost-night-elf-technology.py
python scripts/test-frost-night-elf-technology-assets.py
node scripts/test-frost-mana-upgrades-network.mjs
node scripts/build-frostbound.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-mana-upgrades.mjs
```

规则覆盖六种施法单位形态及月井的全部研究等级，含空池、濒空、小数、半池、满池、新单位、旧存档续跑、无关研究及非法策略版本。真实 TCP 检查实际付款、完整固定步长工期、权限拒绝、研究中重连及最后一帧的比例写回。原生检查源按钮/热键、13 次逐级完整工期与半程读档，以及夜间一秒实际回复 1.77。月井目录的 102 个原件/输出及来源清单可以在无游戏安装时逐字节复现。

最终完整主入口退出码 0、568 条 PASS，仅跳过已独立通过的 24,000 帧 AI 导入，其余导入及正文完整执行。13 次原生逐级研究及 1 次夜间实际回复均通过，控制台错误为 0，Editor 正常退出；EPERM runtime 缓存保留。实际原生运行包 Main.js SHA-256 为 `b57569f0c051e60ddd141e85ede12a5e161a87cd44c3ac9919499a248ad01154`，汇总为 `tmp/docs-artifacts/frost-mana-upgrades/regression-summary.json`。
