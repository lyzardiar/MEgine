# 人族炮塔

Author: MiYu

人族遭遇战的侦察塔可用 `C` 升级为炮塔。需要已完成的车间，追加花费170金、100木，耗时75秒；取消退还升级费用的75%，按资源分别向下取整。完成升级保留生命比例，继续应用砌石研究、维修、昼夜视野与魔法岗哨。联机协议115拒绝不认识新增单位类型的旧客户端；已有存档仍走原有版本和字段验证。

## 原版数据与战斗

`hctw` 原始总价200金／120木，生命600、城甲5、碰撞72、白天视野1600／夜晚800。单位来源为 `UnitBalance.slk`、`UnitWeapons.slk`、`UnitUI.slk`、`UnitAbilities.slk`、`HumanUnitFunc.txt` 和 `HumanUnitStrings.txt`。

两个武器均为89加1d22，即90–111攻城伤害，射程800、索敌800、出手缓冲250、间隔2.5秒、伤害点0.3秒；炮弹速度700、弧度0.35。普通武器研究不增加此伤害。

| 武器 | 目标与行为 |
| --- | --- |
| 第一武器 `artillery` | 地面炮击，飞向发射时锁定的地面位置。全伤半径50、半伤100、十分之一伤害125；碰撞半径参与分档。伤及友军、树木和附近建筑，排除发射塔自身。支持攻击地面和攻击树木。 |
| 第二武器 `missile` | 直接攻击建筑，跟踪目标，只结算目标伤害。 |

飞行中保存武器槽、原始伤害、端点、弧线和来源。发射塔死亡后已发出的炮弹继续结算；敌方快照隐藏升级进度，公开炮弹不携带私有伤害预算和武器槽。

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

Game.dll SHA-256为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。6组REA探针定位 `CArtillery` 虚表、双槽溅射字段、炮击端点和伤害分档：

- `0x6f6b4860` 返回类名，构造函数 `0x6f5566d0` 安装虚表 `0x6fa054e8`。
- `0x6f693ca0`、`0x6f694010` 读取每槽 `splashTargs/Farea/Harea`。
- `0x6f6b4de0` 装载范围和倍率；`0x6f6b8d10` 选择全伤／半伤／外圈倍率。
- `0x6f03e260` 执行碰撞圆重叠判断；`0x6f6b57d0` 查询炮击端点的地形高度。

CPU探针执行原版分档和重叠指令，覆盖21组不同碰撞半径与距离。对象句柄、位置插值和最终伤害回调由夹具提供；最外层目标枚举、完整目标掩码、非圆形建筑寻路轮廓、精确浮点边界及原游戏完整运行尚未对照。引擎沿用现有共享护甲算法；这些验证不代表整款游戏已经完成1:1复刻。

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
node scripts/test-frost-cannon-tower-client.mjs
node scripts/test-frost-cannon-tower-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-cannon-tower.mjs
node scripts/test-frostbound.mjs
```

资源摘要与无安装逐字节重建、修改保护、6组规则、3组生成客户端、真实TCP及3组原生验收通过。原生检查覆盖完整升级、源身体和炮弹、曲线、保存续飞、建筑单体攻击、友军半伤溅射；控制台错误0，专用编辑器正常退出。WebView缓存因EPERM保留。源码生成、样例与原生验收的Main.js SHA-256一致：`b18378cb0e72c5ea50599149a27598c3d230f1bc963c303ba10aff8eba71d36f`。

临时证据统一位于 `tmp/docs-artifacts/frost-cannon-tower/`，不提交运行截图或诊断JSON。

最终源码完整主回归 `node scripts/test-frostbound.mjs` 退出码0，共751条PASS记录，包含24,000帧AI验证。日志为 `tmp/docs-artifacts/frost-cannon-tower/regression-complete.log`，摘要验证为 `index-verification.json`。
