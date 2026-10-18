# 原版采木与资源交付

Author: MiYu。协议 100，新遭遇战通过 `lumberHarvestVersion=1` 使用源工人平衡和经济规则；缺少此字段的旧存档保持版本 0。小精灵非破坏采木、缠绕金矿及侍僧金矿保留专用路径。

| 单位 | 技能 / 第二武器 | 每击树伤 / 木材 | 容量 | 间隔 | 前摇 / 后摇 | 碰撞 |
|---|---|---:|---:|---:|---|---:|
| 农民 hpea | Ahar | 1 | 10 | 1.1s | .433 / .433s | .16 |
| 苦工 opeo | Ahar | 1 | 10 | 1.1s | .5 / .5s | .16 |
| 食尸鬼 ugho | Ahrl | 2 | 20 | 1.35s | .433 / .433s | .31 |

100 源单位对应 1 世界单位。能力范围为 116，第二武器范围为 66；当前接近检测采用能力范围加树和单位碰撞。挥砍命中时增加货物并扣树生命，满载或树耗尽后等待该次后摇再返程；源树生命为 50，地图自定义资源量仍限制可采总量。树倒下沿用现有树木、视野和避障缓存更新路径。无交付建筑仍可砍至满载，并保留货物等待可用建筑。

交付对象按实际 Argl / Arlm 能力和货物类型判断：城镇大厅、兽族主城接受金与木；亡灵和暗夜主城、伐木场、磨坊、坟场接受木。仅选择己方、存活、完工且处于扎根状态的建筑。自动交付选择最近的可用建筑；E 和右键支持提前交付。交付完成后优先执行 Shift 队列，再回原采集点；Stop、改令、控制和死亡会清理挥砍状态。敌方仅获得可见工作坐标和动作相位，货物、资源索引、工作冷却和队列保持私有。

磨坊 `ofor` 为 1,000 HP、205 金、70 秒、5 城甲，建造槽 2 / M；坟场 `ugrv` 为 900 HP、215 金、80 秒、5 城甲，槽 3 / V。两者零木材，碰撞 1.44，使用原版模型、贴图、按钮及真实建造工作。亡灵商店使用源 `utom` 的 R，避免与坟场 V 冲突。采木/返送资源共用原版第 7 格图标和本地化说明，G 指定资源、E 交付；食尸鬼同样可用。

## 来源与维护

原件来自用户安装的 `E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。实际 MPQ 的 AbilityData、UnitWeapons、UnitBalance、UnitAbilities、元数据和本地化保留于现有 SourceAssets 及 `SourceAssets/WorkerLumber/`；建筑原件和转换中间件在 `SourceAssets/LumberDepots/`。来源、归档优先级、SHA-256、依赖摘要和输出清单见 `worker-lumber-sources.json` 与 `lumber-depot-sources.json`。版权素材的权利说明见 `Assets/Licenses/Classic-Worker-Lumber.txt`、`Classic-Lumber-Depots.txt`。

[REA 上游](https://github.com/morluto/rea)固定 6.5.0，Rizin 固定 0.8.1，版本/源码提交/归档摘要和更新方法保留在 `third_party/rea/README-MENGINE.md`。真实 REA MCP 确认 Game.dll 的 HarvestBase / HarvestReturn / HarvestLumber / Harvest 类标识及 RTTI；类名字符串地址为 `0x6f9a2ec4 / 0x6f9a2ed8 / 0x6f9a2ef0 / 0x6f9a2f08`。DLL SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，未修改。类标识是静态证据，未作为完整原版执行函数或原版动态验收的证明。

```powershell
node scripts/probe-frost-rea-rewards.mjs --worker-lumber
python scripts/import-frost-worker-lumber.py
python scripts/import-frost-lumber-depots.py --pose-probe 'D:/MEngineNativeQA/engine-main-sync/target/release/examples/gltf_bounds.exe' --metadata-reader 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll'
node scripts/build-frostbound.mjs
node scripts/test-frost-worker-lumber-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-worker-lumber.mjs
```

建筑导入器可使用保留原件，在无游戏安装环境重现导入结果；建筑模型经过原生 Stand 姿态边界测量。运行日志、REA 输出、截图及验收 JSON 均写入 `tmp/docs-artifacts/frost-worker-lumber/`。

## 验证与边界

规则检查覆盖三类单位命中/间隔/容量/后摇、树损耗和倒下、真实接近与返程、无基地、部分货物、Shift、Stop、控制与致死中断、交付过滤、建筑完整付款和工期、逐帧存档一致、隐私及旧版隔离。真实 TCP 验证三类单位越权拒绝、货物隐私、采木中重连、提前交付和回树。原生 Editor 五个场景验证 G/E/右键、第 7 格原版图标、实际树伤和货物、保存加载，以及磨坊/坟场源图标热键、实际扣费和完整建造；控制台错误为 0。

森林回归还覆盖视野外的耗尽信息：未知树木保留采集意图，单位前往并通过实际视野学习耗尽，再选择下一棵树。倒树和清障验收等待实际命中，保留同帧缓存更新及逐帧动画断言；生产/科技验收提供独立资源预算，有限源木材不作为生产工期的计时器。AI 开局检查实际人口供给及完成状态，识别升级后的通灵塔。

232 个暂存原件、依赖和输出通过字节数与 SHA-256 校验；建筑无安装复现与保留文件、来源清单完全一致。原生 Editor 正常退出，WebView runtime 的 EPERM 清理结果保留在验收 JSON 中，缓存留在隔离 QA 目录。

模拟仍以 .1 秒步长运行，采木计时目前不叠加攻击速度效果。原版运行时的几何距离、取消后重新挥砍节奏、金矿进出/运输、完整采集音效仍需对照。磨坊科技、坟场造尸和相关科技另行实现；该阶段完成它们作为木材交付建筑的路径。整体 1:1 目标继续进行。

最终主入口退出码 0、525 条 PASS 记录；仅跳过已独立通过的 24,000 帧长程 AI 导入，其余导入及正文完整执行。最终 Main.js SHA-256 为 11f219437dd6d565e2344b09eeb48fd50b577271f4e403fe4a0a7acc2da44f7f，与五个原生验收场景的运行包一致。汇总为 `tmp/docs-artifacts/frost-worker-lumber/regression-summary.json`。

Rhlh 两级原版采木升级已接入，农民容量提升为 20/30，树伤和间隔保持源值；来源、静态执行链路、完整工期、退款与联网/原生验收见 [人族采木升级](lumber-technology.md)。
