# 人族采木升级 Rhlh

Author: MiYu。协议 101，新源采木遭遇战通过 `lumberTechnologyVersion=1` 启用。要求原版人族兵种和源采木规则；旧存档缺字段时保持版本 0，不添加升级效果。玩家研究等级保存在 `teams[].lumberResearch`，范围为 0..2。

| 等级 | 原版名称 | 金 / 木 | 工期 | 前置 | 农民木材容量 |
|---|---|---|---|---|---:|
| 0 | 未研究 | — | — | — | 10 |
| 1 | 改进型伐木效率 | 100 / 0 | 60 秒 | 要塞 hkee | 20 |
| 2 | 高级伐木效率 | 200 / 0 | 75 秒 | 城堡 hcas | 30 |

伐木场 `hlum` 使用原版第 0 格、L 热键、两级启用/禁用图标及本地化说明。研究复用共享生产队列、计时和取消退款，禁止重复研究；已经排入队列的研究不因前置建筑随后损毁而被撤销。完成后同时影响既有和新农民，不改写正在返程的货物或订单。苦工、食尸鬼、小精灵、侍僧及其他玩家保持各自规则。敌方快照隐藏研究等级和队列。

## 原版执行链路

[REA](https://github.com/morluto/rea)固定 6.5.0、Rizin 0.8.1，工具来源和更新方法见 `third_party/rea/README-MENGINE.md`。本阶段使用真实 REA MCP 分析用户提供的 Game.dll，SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，分析前后不变。

- `Rhlh` 的实际 MPQ 升级行为为 `rlum`，base/mod 各 10，最高两级。UnitBalance 将其绑定至农民，HumanUnitFunc 将其列入伐木场研究。
- `CUpgradeLumberJack` 的处理入口 `0x6f698dd0` 查询 HarvestBase 能力，通过虚方法 `+0x33c` 应用升级数值。农民 Harvest 虚表 `0x6f99df88` 的该槽指向 `0x6f3de1c0`。
- `0x6f3de1c0` 在已有容量非零时，对能力字段 `+0x198` 加入增量。加载路径 `0x6f3fdfba..0x6f3fdfd1` 从 `DataB` 读取并写入此字段；字符串指针 `0x6fb6a094` 指向 `0x6fa4db80` 的 `DataB`。原版元数据 Har2 对应木材容量。
- 采木路径 `0x6f41a8c9..0x6f41a8d5` 将已有货物 `+0x1c4` 与此容量比较。挥砍路径继续使用独立的 `+0x190` 数据。本实现增加容量 10/20，保持原有每击 1 点树伤、1 点货物增量及 1.1 秒间隔。

这些地址只适用于上述 DLL 摘要。静态调用链、实际 MPQ 和 MEngine 原生验收分别保留；尚未在原版进程中完成动态对照，不能据此证明全部采木行为逐指令等价。

## 来源与维护

原件来自 `E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`，保存在 `SourceAssets/LumberTechnology/`；源升级行、前置、本地化、效果元数据和农民绑定见 `lumber-technology.json`。`lumber-technology-sources.json` 记录 MPQ 优先级、导入器摘要、原件及输出 SHA-256；素材权利说明位于 `Assets/Licenses/Classic-Lumber-Technology.txt`。

```powershell
node scripts/probe-frost-rea-rewards.mjs --lumber-upgrade
python scripts/import-frost-lumber-technology.py
node scripts/build-frostbound.mjs
node scripts/test-frost-lumber-technology-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-lumber-technology.mjs
```

导入器支持 `--game` 和 `--output`，无安装时可校验并使用已保留的原件重现输出。更新原版后，先重新核对技能/升级字段与执行链路，再导入和回归；REA probe 会拒绝不匹配的 DLL 摘要。运行产物统一位于 `tmp/docs-artifacts/frost-lumber-upgrade/`。

## 验证范围

规则检查覆盖两级实际付款、完整 600/750 帧工期、前置、队列去重、退款、建筑死亡、既有/新农民、正在返程的货物、10/20/30 容量、树伤和时序、逐帧存档一致、隐私、畸形存档及旧版隔离。真实 TCP 验证越权/前置拒绝、付款、研究队列隐私、中途重连、两级完成及实际采木。

原生 Editor 两级场景验证第 0 格原版启用/禁用贴图、L、退款、完整研究工期、半程保存加载，以及实际 20/30 木材货物和独立树伤；控制台错误为 0，Editor 正常退出。WebView runtime 的 EPERM 清理结果保留在报告中，隔离缓存不重试删除。

整体 1:1 目标继续进行；人族建筑砌筑 Rhac、金矿出入/运输、原版动态时序、完整研究面板与声音仍需继续对照。

最终主入口退出码 0、530 条 PASS 记录，仅跳过已独立通过的长程 AI 导入；其余导入和正文完整执行。最终 Main.js SHA-256 为 854658c3653935a7ca30b27bfb62d59e55233b2beca269f7784dedbb514b3608，与两级原生验收运行包一致。暂存 20 个原件/输出、导入器及生成包的摘要均通过。汇总为 `tmp/docs-artifacts/frost-lumber-upgrade/regression-summary.json`。
