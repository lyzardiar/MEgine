# 人族炮塔

Author: MiYu

人族遭遇战的侦察塔可用 `C` 升级为炮塔。需要已完成的车间，追加花费170金、100木，耗时75秒；取消退还升级费用的75%，按资源分别向下取整。完成升级保留生命比例，继续应用砌石研究、维修、昼夜视野与魔法岗哨。联机协议115拒绝不认识新增单位类型的旧客户端；已有存档仍走原有版本和字段验证。

## 原版数据与战斗

`hctw` 原始总价200金／120木，生命600、城甲5、碰撞72、白天视野1600／夜晚800。单位来源为 `UnitBalance.slk`、`UnitWeapons.slk`、`UnitUI.slk`、`UnitAbilities.slk`、`HumanUnitFunc.txt` 和 `HumanUnitStrings.txt`。

两个武器均为89加1d22，即90–111攻城伤害，射程800、索敌800、出手缓冲250、间隔2.5秒、伤害点0.3秒；炮弹速度700、弧度0.35。普通武器研究不增加此伤害。

| 武器 | 目标与行为 |
| --- | --- |
| 第一武器 `artillery` | 地面炮击，飞向发射时锁定的地面位置。全伤半径50、半伤100、十分之一伤害125；碰撞半径参与分档，内圈带原版距离平方容差，最外圈严格截断。伤及友军、树木和附近建筑，排除发射塔自身。支持攻击地面和攻击树木。 |
| 第二武器 `missile` | 直接攻击建筑，跟踪目标，只结算目标伤害。 |

飞行中保存武器槽、原始伤害、端点、弧线和来源。发射塔死亡后已发出的炮弹继续结算；敌方快照隐藏升级进度，公开炮弹不携带私有伤害预算和武器槽。

第一武器可直接攻击守卫，但原始 `splashTargs1` 不包含 `ward`。炮塔和迫击炮读取各自的 `splashTargets`：攻击地面或附近普通单位不会误伤蛇棒；直接指定的蛇棒仍结算炮击伤害，周围其他蛇棒被排除。

## 模型与来源

身体复用原版 `Buildings/Human/HumanTower/HumanTower.mdx`，选择 `upgrade,second` 动作：Attack索引6、Stand索引7。模型倍率与选择圈取原版 `UnitUI`；身体边界由原生姿态探针重新计算。炮弹使用 `Abilities/Weapons/CannonTowerMissile/CannonTowerMissile.mdx`，并保留原版可用／禁用按钮。

- 原版游戏目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。
- 身体MDX SHA-256：`f1f4baa31baf2ef81545806210a371d9f4a016d88ecef7a7242f2550b8283512`。
- 炮弹MDX SHA-256：`5fab3054c4c6fddeab1322b12f28c491c433b625c080d0bd96956617fb5e5e29`。
- 原件：`samples/frostbound-realms/SourceAssets/CannonTower/`；运行资源：`Assets/CannonTower/`。
- `cannon-tower-sources.json` 记录11项源文件、32项自有产物、204项共享塔资源、6个生成器及转换工具摘要；`cannon-tower-node-sources.json` 保留节点转换收据。
- 游戏资源沿用暴雪原版条款；转换许可证随源件保留。REA上游为 [morluto/rea](https://github.com/morluto/rea)，固定版本6.5.0；安装、固定提交和更新流程见 [REA维护说明](../../../third_party/rea/README-MENGINE.md)。

导入优先使用已保留并校验的原件，使用现有 `asset-library/warcraft-iii` 的 `game-ready`、`remaining-ready` 转换资源和共享塔模型。可在无游戏安装条件下复现；修改过的自有产物或未签名同名文件会导致导入拒绝，避免覆盖本地维护内容。

## REA证据与验证

Game.dll SHA-256为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。11组REA探针定位 `CArtillery` 虚表、双槽溅射字段、炮击端点、候选筛选、目标掩码和伤害分档：

- `0x6f6b4860` 返回类名，构造函数 `0x6f5566d0` 安装虚表 `0x6fa054e8`。
- `0x6f693ca0`、`0x6f694010` 读取每槽 `splashTargs/Farea/Harea`。
- `0x6f6b4de0` 装载范围和倍率；`0x6f6b8d10` 选择全伤／半伤／外圈倍率。
- `0x6f03e260` 执行碰撞圆重叠判断；`0x6f6b57d0` 查询炮击端点的地形高度。
- `0x6f6b4be0` 选择外圈半径，经 `0x6f633a40 → 0x6f02f3c0 → 0x6f042050 → 0x6f03fc80` 枚举候选；`0x6f03fe90` 按身体半径及当前位置执行严格的距离平方比较。`0x6f6afe00` 调用资格检查及分档虚方法。
- 全伤、半伤重叠检测的原版距离平方容差为0.001（坐标除32后的内部单位），对应引擎0.0001024。最外圈不使用此容差；单位、建筑和树木共用炮塔分档函数。
- `0x6f6b0170` 对直接目标比较对象句柄，周围目标进入 `0x6f68abb0 → 0x6f691240 / 0x6f68aa30`。目标标记表将 `ground/structure/ward` 映射为2／8／16，`0x6f68c7b0` 补齐省略的类别，掩码交集决定周围目标是否接受伤害。蛇棒源 `UnitData.targType` 为 `ward`。

CPU探针执行130个原版指令用例：28个分档、84个串联外圈候选过滤与内圈分档的边界用例，以及18个炮塔／迫击炮的直接目标与周围目标资格用例。边界用例覆盖碰撞0／32／72／80、轴向和斜向偏移；资格用例实际执行原版对象分类、默认掩码、交集判断及直接目标分支。空间候选、对象句柄、位置插值、类别输入、所有者和部分运行环境查询由夹具提供。空间索引构造、所有免疫／联盟组合、飞行中目标类别切换、非圆形建筑寻路轮廓及原游戏完整运行尚未对照。JavaScript使用双精度，尚不保证所有恰好相切位置与原版单精度舍入逐位一致。引擎沿用现有共享护甲算法；这些验证不代表整款游戏已经完成1:1复刻。

```powershell
python scripts/import-frost-cannon-tower.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-cannon-tower-source.py
node scripts/probe-frost-rea-cannon-tower.mjs
python -m pip install --target tmp/docs-artifacts/frost-cannon-tower/dependencies pefile==2024.8.26 unicorn==2.1.4
python scripts/probe-frost-cannon-tower-binary.py --binary "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll" --dependencies tmp/docs-artifacts/frost-cannon-tower/dependencies
$env:MENGINE_FROST_BUILD_OUTPUT='G:/work/github/MEgine/tmp/docs-artifacts/frost-cannon-tower/build'
node scripts/build-frostbound.mjs
Copy-Item -LiteralPath tmp/docs-artifacts/frost-cannon-tower/build/Assets/Scripts/Main.js -Destination samples/frostbound-realms/Assets/Scripts/Main.js
node scripts/test-frost-cannon-tower.mjs
node scripts/test-frost-artillery-targets.mjs
node scripts/test-frost-cannon-tower-client.mjs
node scripts/test-frost-cannon-tower-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-cannon-tower.mjs
node scripts/test-frostbound.mjs
```

资源摘要与无安装逐字节重建、修改保护、7组炮塔规则、6个守卫筛选场景、5组生成客户端、3组真实TCP及12项原生检查通过。规则测试新增63个单位／建筑／树木边界和保存续飞对照；客户端、TCP和原生编辑器均检验全伤、半伤的容差边界与外圈排除。原生检查还覆盖完整升级、源身体和炮弹、曲线、保存续飞、建筑单体攻击和友军半伤溅射；控制台错误0，专用编辑器正常退出。WebView缓存因EPERM保留。源码生成、样例与原生验收的Main.js SHA-256一致：`5e57f75effd738b8bc9487ecbe1a145ad8c91692c9a5fb6cd0b05b0115fbff8a`。

REA及原生原始证据位于 `tmp/docs-artifacts/frost-cannon-tower/`，本阶段CPU、旧提交负对照、回归日志与摘要汇总位于 `tmp/docs-artifacts/frost-artillery-targets/`；独立边界阶段证据保留在 `tmp/docs-artifacts/frost-cannon-boundary/`，不提交运行截图或诊断JSON。

最终源码完整主回归 `node scripts/test-frostbound.mjs` 退出码0，共757条PASS记录，包含24,000帧AI验证。日志为 `tmp/docs-artifacts/frost-artillery-targets/regression.log`，摘要验证为 `verification.json`。
