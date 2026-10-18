# 四族工人手动维修

新遭遇战通过 `workerRepairVersion=1` 启用四族工人的原版手动维修定义，协议 99。要求工人基础平衡及小精灵规则启用；旧存档缺字段时保持版本 0，沿用原来的建筑维修费用、范围与目标限制。

| 工人 | 源技能 | 维修费用 | 维修时间 | 基础施法范围 | 允许古树 |
|---|---|---|---|---|---|
| 农民 hpea | Ahrp / Arep | 对应造价的 35% | 对应建造时间的 150% | 50 | 否 |
| 苦工 opeo | Arep | 35% | 150% | 50 | 否 |
| 小精灵 ewsp | Aren / Renew | 35% | 150% | 50 | 是 |
| 侍僧 uaco | Arst / Restoration | 35% | 150% | 50 | 否 |

费用和时间均按实际修复的生命比例计算。多人维修线性增加速度，最后一帧按剩余生命收费；缺任一资源则暂停，不扣另一种资源。当前范围在既有二维几何中采用目标半径、工人碰撞半径和 0.5 世界单位的施法距离，100 原版单位对应 1 世界单位。

目标支持己方完工建筑和机械单位，小精灵额外支持古树及其拔根状态。分类取自原版 `UnitBalance.slk` 的 `type`、`isbldg`，共 836 个原版定义；现有通用样例单位沿用自身建筑/机械分类。原版迫击炮小队属于有机单位，不能因其攻城伤害类型而判成机械；刃车可以维修。目标移动时工人跟随，到达范围后继续；Stop、改令、目标死亡和满血会结束当前维修，保留既有 Shift 队列与采集恢复机制。死亡机械单位同步释放维修者，允许立即存档。

客户端 R 和右键均通过同一权威命令执行。四族使用实际 MPQ 的原版图标、本地化说明及 `Buttonpos=1,1`（第 5 格）；显示工作动作时采用相同目标、范围和资源条件。敌方状态保留可见生命变化，隐藏工人的维修命令和己方资源。

## 来源与更新

原版安装：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。导入按 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq` 覆盖顺序读取。复用保留的 `AbilityData.slk`、`UnitAbilities.slk` 和 `UnitBalance.slk`，逐字节比对；补充 `SourceAssets/WorkerRepair/` 下的原版 AbilityMetaData、WorldEditStrings、Common/NightElf/Undead AbilityFunc/Strings 和 BLP 图标。原文以 UTF-8 解码。

`worker-repair.json` 记录完整四个技能行、源能力列表、函数/本地化段、维修分类及元数据字段含义；`worker-repair-sources.json` 记录 MPQ、原件路径、大小、SHA-256、生成器和输出摘要。`Rep1` / `Rep2` 元数据及原版中文字符串分别明确表示修理费用比例和修理时间比例。原件和导出贴图遵循 Blizzard 原有条款，不因提取而获得再分发授权。

[REA GitHub 源站](https://github.com/morluto/rea)固定 6.5.0，Rizin 固定 0.8.1。维护入口为 `third_party/rea/README-MENGINE.md`。真实 REA MCP 在 Game.dll 中确认 `CAbilityRepair`、`CAbilityRenew` RTTI 和相关类名：`0x6fb8f7c8`、`0x6fb8f7e8`；原 DLL SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，分析前后相同。这是只读类标识证据；费用、时间和目标分类依据实际 MPQ，未声称已完整反编译或动态验证原版维修执行函数。

```powershell
node scripts/probe-frost-rea-rewards.mjs --worker-repair
python scripts/import-frost-worker-repair.py
node scripts/build-frostbound.mjs
node scripts/test-frost-worker-repair-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-worker-repair.mjs
```

## 验证与剩余范围

规则检查覆盖四族源数据和贴图摘要、完整修复费用/时间、古树与有机目标、所有权/自我目标拒绝、多工人、资金/控制暂停、末帧小额扣费、追随移动机械单位、逐帧一致的中途存档、Shift/Stop、死亡清理和旧版隔离。真实双客户端 TCP 验证四族实际指令、源费用、越权拒绝、敌方隐私、维修中断线重连和 Stop。原生 Editor 四个场景验证原版第 5 格图标、R 与右键、机械目标、实际扣费及保存续跑，控制台错误为 0。工人武器 TCP 回归在重连握手期间冻结夹具模拟时钟，检查同一未完成前摇状态的传输，避免用握手耗时替代攻击规则断言。

证据保留在 `tmp/docs-artifacts/frost-worker-repair/`。Editor 正常退出；WebView runtime 的 EPERM 清理失败记录在报告中并保留缓存，不提交运行 JSON、日志或截图。

尚未在原版游戏运行测量维修。自动维修开关/索敌、海军额外范围、建造协助专属参数、维修音频及全部模型动作/地形距离仍需对照；本阶段覆盖手动维修路径。采木/返程和入矿、原版攻击运动缓冲与取消前摇节奏、完整战役/地图等仍在整体 1:1 清单中。

最终主入口退出码 0、515 条 PASS 记录；仅跳过已另行通过的长程 AI 导入，其余导入和正文完整执行。47 个独立 TCP 入口、24,000 帧 AI 与四族原生验收通过，汇总为 `tmp/docs-artifacts/frost-worker-repair/regression-summary.json`。
