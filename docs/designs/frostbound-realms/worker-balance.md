# 原版工人基础平衡

Author: MiYu。2026-10-18，协议 97。新建遭遇战使用安装目录原版数据定义农民、苦工和侍僧的基础生命、移动速度、护甲、人口、费用、训练时间和回血条件。

| 单位 | 生命 | 移速（原版单位/秒） | 护甲 | 金币/木材 | 人口 | 训练秒 | 回血 |
|---|---:|---:|---|---|---:|---:|---|
| 农民 hpea | 220 | 190 | 0，中甲 | 75/0 | 1 | 15 | 始终 0.25 HP/秒 |
| 苦工 opeo | 250 | 190 | 0，中甲 | 75/0 | 1 | 15 | 始终 0.25 HP/秒 |
| 侍僧 uaco | 220 | 220 | 0，中甲 | 75/0 | 1 | 15 | 腐地上 2 HP/秒 |

三者法力为 0，取消通用阵营生命和移动倍率。侍僧的原版回血与既有腐地通用回血互斥，避免重复结算。小精灵继续使用已有独立规则。场景与菜单通过同一个单位定义取得名称、费用和工期；训练仍经过实际付款、人口和共享队列。

## 来源与维护

安装目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。按 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq` 顺序查找，本次实际读取 `War3Patch.mpq` 内 `Units/UnitBalance.slk`。原件复用 `SourceAssets/CombatRewards/Units/UnitBalance.slk`，SHA-256 为 `ab1a8cfbebcb2abe68535b170117730726249c5fafef15c13695400d4b0a3327`。

`worker-balance.json` 保留三个完整源行和换算后的运行值；`worker-balance-sources.json` 保留安装路径、原始归档、大小、摘要和生成入口。世界坐标沿用 100 原版单位对应 1 世界单位。原始数据适用 Blizzard 原有条款。

[REA 上游](https://github.com/morluto/rea)固定 6.5.0，Rizin 固定 0.8.1，维护说明在 `third_party/rea/README-MENGINE.md`。真实 MCP Evidence 确认 Game.dll 中的 `goldcost`、`bldtm`、`regenType`、`defType`、`minSpd` 字段字符串，退出码为 0，DLL 前后摘要相同。该证据证明字段存在；运行数值来自实际 MPQ，未声称字段字符串证明完整原版执行过程。

## 保存与模式

新遭遇战设置 `workerBalanceVersion=1`，每个工人记录源身份。恢复时校验版本、种族、生命上限、移动速度、护甲和法力；亡者复生继续使用自己的源单位规则。缺少世界版本的旧存档按 0 恢复，维持原有单位与四秒训练；MOBA、塔防和 RPG 使用 0。协议升级使旧客户端不会静默接收新单位定义。

## 验证

- 四族 28 项原版基础值对照无差异，包含未改动的小精灵。
- 三族完整 150 tick 付费生产、全额取消退款、准确人口、逐帧一致的中途存档续跑、条件回血、满血封顶、死亡不回血与损坏状态拒绝通过。
- 真实双客户端 TCP 验证训练付款和完成、敌方队列/资源隐私、越权拒绝及中途断线恢复。
- 原生 Editor 三族分别通过原版生命、零法力、实际训练按钮名称/75 金费用、完整训练和中途保存加载；控制台错误为 0。Editor 正常退出，测试缓存的清理结果单独保存在报告中。
- 全量主入口分段验证：24,000 帧付费 AI 经济独立通过；仅跳过该已通过导入的相同主入口得到 496 条 PASS 记录，退出码 0。另行并发执行的 45 个真实 TCP 入口无失败。汇总为 `tmp/docs-artifacts/frost-worker-balance/regression-summary.json`。
- 视觉检查包含 5,808 个源文件摘要和 7,968 个动画采样，测试目录加载现有牧师/女巫/奥术圣殿模型，按当前延迟分配的头像网格验证场景。

原始日志、REA Evidence、截图与运行报告统一在 `tmp/docs-artifacts/frost-worker-balance/`，不提交到 docs。复现入口：

```powershell
node scripts/probe-frost-rea-rewards.mjs --worker-fields
python scripts/import-frost-worker-balance.py
python scripts/audit-frost-worker-parity.py
node scripts/test-frost-worker-balance.mjs
node scripts/test-frost-worker-balance-network.mjs
node scripts/build-frostbound.mjs
$env:MENGINE_EDITOR_EXECUTABLE = 'D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-worker-balance.mjs
```

## 继续对照的范围

本阶段覆盖基础平衡和生产路径。第一武器的源骰子、前摇/后摇、射程、碰撞和索敌已在后续 [工人武器阶段](worker-weapons.md) 接入。运动缓冲、采集/维修/建造机制、升级与完整视野仍需逐项对照。原版 Game.dll 未被修改，未在运行的魔兽中观测这些行为。完整战役、地图和游戏复刻进度见 [复刻验收清单](replica-parity.md)。
