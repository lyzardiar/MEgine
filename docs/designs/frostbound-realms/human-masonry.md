# 人族石工技术与建筑基础数据

作者：MiYu。协议 103。新建人族遭遇战启用 `humanMasonryVersion=1`，旧存档缺字段保持版本 0。三级 Rhac 使用伐木场原版第 1 格、M 热键、中文名称及启用/禁用图标，复用现有三格研究队列、去重、全额研究退款、存档和 TCP 断线续接。

| 等级 | 金 / 木 | 工期 | 前置 | 累计基础生命比例 |
|---|---|---|---|---|
| 1 | 100 / 25 | 60 秒 | 无 | 10% |
| 2 | 125 / 50 | 75 秒 | 要塞 | 20% |
| 3 | 150 / 75 | 90 秒 | 城堡 | 30% |

当前已实现的人族建筑采用源 HP、基础护甲、护甲类型、造价和工期。农场为 500 HP、80/20、35 秒；祭坛为 900 HP、180/50、60 秒；神秘藏宝室为 485 HP、130/30、60 秒。哨塔为 300 HP、0 点轻甲、30/20、25 秒；防御塔为 500 HP、5 点重甲。人族 T 建造哨塔，再以 G 升级防御塔，需要完成伐木场，费用 70/50、工期 50 秒，取消退 75%（52 金、37 木）。防御塔费用由本机源总造价相减，并经[暴雪建筑资料](https://classic.battle.net/war3/human/buildings/guardtower.shtml)核对。防御塔完整武器参数仍需后续对照。

护甲增量读取各建筑 `UnitBalance.defUp`，当前已实现绑定均为每级 +1；源船坞记录为 +2，尚未接入船坞玩法。主城维修使用源累积造价，购买要塞/城堡升级继续使用源差价。施工中建筑、主城和防御塔升级共用石工等级；已付费研究在前置建筑损毁后继续执行。

## REA 证据与舍入

[REA 上游](https://github.com/morluto/rea)、固定版本、提交、许可证、安装和更新说明保留在 [工具维护入口](../../../third_party/rea/README-MENGINE.md)。本阶段使用真实 REA 6.5.0 / Rizin 0.8.1 MCP，只读分析本机 `Game.dll`；SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，分析前后相同。

- `CUpgradeHitPoints`：`0x6f698c60` 计算旧/新研究效果差值乘基础生命，传 policy 1 至 `0x6f633000`。
- `0x6f6331a2` 先取当前生命比例，再增加最大生命，最后按新最大生命恢复当前生命；存活单位至少保留 1 HP。
- `0x6f054060` 加浮点 0.5，再由 `0x6f053a90` 截去正数小数位。实现保留这些步骤的单精度浮点舍入。
- `CUpgradeArmor`：`0x6f698670 → 0x6f68c400 → 0x6f652c40`，读取单位基础护甲升级值。

每次完成研究分别舍入增量。现有 485 HP 藏宝室连续升级得到 534/583/632；本实现的新建建筑一次应用已完成的累计等级，三级新藏宝室为 631 HP。两条应用路径均有规则验收；原版进程创建建筑时究竟分级还是合并应用研究，仍待动态核对。当前不能据此声称已完成原版新旧建筑生命差异的动态等价验收。动物作战训练及人族/德鲁伊训练共用的 `CUpgradeHitPointsEx` 比例策略已接入，见[生命升级说明](hitpoint-upgrades.md)。

原始 RTTI、虚表、指令和身份记录在 `tmp/docs-artifacts/frost-human-masonry/`。不提交运行证据 JSON。

## 来源与复现

原件位于 `samples/frostbound-realms/SourceAssets/HumanMasonry/`。`human-masonry-sources.json` 记录 MPQ 查找优先级、源路径、档案名、逐文件字节数和 SHA-256，以及导入器摘要；`human-masonry.json` 保留源研究、效果元数据、17 个建筑绑定及本地化原行。资产归 Blizzard，适用原游戏条款，不属于 REA 的 MIT 许可。

```powershell
python scripts/import-frost-human-masonry.py
python scripts/import-frost-human-masonry.py --game tmp/no-warcraft-installation --output tmp/docs-artifacts/frost-human-masonry/reproduced
node scripts/probe-frost-rea-rewards.mjs --human-masonry
node scripts/build-frostbound.mjs
node scripts/test-frost-human-masonry-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-human-masonry.mjs
```

无安装导入从保留原件恢复并核对摘要；87 个原件/输出及来源清单逐字节一致。验收覆盖三级完整研究工期、付款、退款、生命比例和舍入、护甲、施工、主城/防御塔升级、研究前置损毁、共享采木研究队列、存档和真实 TCP。原生 Editor 覆盖 M/第 1 格/原版图标、三级完整工期、半程存档续跑和 G 防御塔完整升级。完整 1:1 仍需继续对照金矿进出、建筑碰撞与路径贴图、研究面板/音效、未实现建筑和原版运行时行为。

最终完整主入口退出码 0、538 条 PASS 记录；仅移除已独立通过的 24,000 帧 AI 长测导入，其余导入和主正文完整执行。实际原生运行包与暂存生成包摘要一致，控制台错误为 0。汇总记录在 `tmp/docs-artifacts/frost-human-masonry/regression-summary.json`。
