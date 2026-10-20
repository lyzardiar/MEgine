# 人族奥术塔

Author: MiYu

人族遭遇战中，选择已完成的侦察塔按 `N` 升级奥术塔（原版中文名：神秘之塔）。追加70金、50木，耗时50秒，无额外建筑前置；取消退还75%的升级费用，分别向下取整。升级保留生命比例，支持砌石研究、维修、昼夜视野与魔法岗哨。

## 战斗与侦察

- `hatw`：500生命、5点重甲，白天视野1600／夜晚800；基础攻击7+1d3，即8–10穿刺，可攻击地面与空中，射程800，间隔1秒、伤害点0.3秒。普通武器研究不增加塔的攻击力。
- `Afbt`反馈：命中时燃烧普通单位24魔法、英雄12魔法，以剩余魔法为上限；燃烧伤害经过穿刺对护甲类型和护甲值的缩放。友军、建筑和魔法免疫目标不燃烧魔法。发射时对召唤目标附加20点基础伤害，已发出的弹道在塔死亡后继续结算。
- `AHta`显示：研究魔法岗哨 `Rhse` 后按 `R` 选择地面位置，无魔法消耗，半径900、持续15秒、冷却180秒；立即打开区域视野并侦测隐形单位。塔被摧毁后已释放区域持续至到期。
- 奥术塔身体使用原版 `HumanTower.mdx` 的 `upgrade,third` 动作，站立／攻击使用索引9。弹道、反馈命中和显示施法效果分别使用 `OrbOfDeathMissile`、`ArcaneTowerAttack`、`CrystalBallCaster`。

冷却、侦察区域、升级过程、反馈结果与在途弹道均支持保存恢复。联机协议为116，拒绝旧协议；敌方快照隐藏侦察区域、冷却和升级进度。旧存档缺少侦察区域字段时按空区域恢复。

## 来源与维护

原版游戏目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。

规则读取MPQ中的 `UnitBalance.slk`、`UnitWeapons.slk`、`UnitUI.slk`、`UnitAbilities.slk`、`AbilityData.slk`、`AbilityMetaData.slk`、人族单位／技能文本与 `MiscGame.txt`。归档优先级为 `War3Patch.mpq → War3xLocal.mpq → War3x.mpq → war3.mpq`。

- `samples/frostbound-realms/SourceAssets/ArcaneTower/`：保留原始规则、按钮与塔身MDX；`arcane-tower-sources.json` 记录源归档、SHA-256、自有产物、共享资源与生成器摘要。
- `SourceAssets/ArcaneTowerEffects/`：保留特效原件与节点转换资料；`arcane-tower-effects-sources.json` 记录原件及转换产物摘要。运行特效位于 `Assets/ArcaneTowerEffects/`。
- 原版游戏资源遵守暴雪原始条款，转换工具许可证保留在 `Assets/Licenses/`。
- REA源站：[morluto/rea](https://github.com/morluto/rea)，版本6.5.0，固定提交 `3b79af28e80785afce9f5998d8f03289402a1847`。本地源码与运行包在 `third_party/rea/`；更新、校验和MCP工作流见 [REA维护说明](../../../third_party/rea/README-MENGINE.md)。

REA对Game.dll的反馈调用链复核覆盖8组探针，目标SHA-256为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`CAbilityFeedback`按英雄类型选择消耗量；`0x6f57247e`后的发射路径读取召唤附加伤害并写入弹道伤害，`CMissileFeedback::DealDamage`在命中时处理魔法值，后续使用共同伤害包和护甲路径。完整原游戏运行时及所有防御技能顺序尚未逐项对照，粒子采样也不代表原版粒子求解器逐位一致。

## 复现与验证

```powershell
python scripts/import-frost-arcane-tower.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe
python scripts/import-frost-arcane-tower-effects.py --source-root samples/frostbound-realms --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-arcane-tower-source.py
node scripts/probe-frost-rea-feedback.mjs
$env:MENGINE_FROST_BUILD_OUTPUT='G:/work/github/MEgine/tmp/docs-artifacts/frost-arcane-tower/build'
node scripts/build-frostbound.mjs
Copy-Item -LiteralPath tmp/docs-artifacts/frost-arcane-tower/build/Assets/Scripts/Main.js -Destination samples/frostbound-realms/Assets/Scripts/Main.js
Copy-Item -LiteralPath tmp/docs-artifacts/frost-arcane-tower/build/Assets/Scenes/Main.mscene -Destination samples/frostbound-realms/Assets/Scenes/Main.mscene
node scripts/test-frost-arcane-tower.mjs
node scripts/test-frost-arcane-tower-client.mjs
node scripts/test-frost-arcane-tower-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-arcane-tower.mjs
node scripts/test-frostbound.mjs
```

源规则导入优先读取保留原件，支持无游戏安装逐字节重建；自有产物被修改时在写入前拒绝覆盖。运行日志、截图和JSON验证报告统一写入 `tmp/docs-artifacts/frost-arcane-tower/`，REA原始证据写入 `tmp/docs-artifacts/frost-feedback/`。

验证已通过：18项规则／图标／模型原件、33项自有产物和204项共享资源的摘要校验；9项特效原件、55项特效产物；无安装逐字节重建与修改保护；6组规则、2组生成客户端、1组真实TCP和2组原生编辑器场景。原生场景覆盖完整升级、原版塔身／弹道／反馈、8–10面板、保存续飞、显示施法及到期清除，控制台错误0。专用编辑器正常退出，受系统锁定的WebView缓存保留在临时QA目录。生成包、样例与最终原生验收Main.js SHA-256一致：`310903f4134dd2b9b996e83a6eb6d6f9e67f55862dcb9b2d15cd28820ad03d4b`。

完整回归 `node scripts/test-frostbound.mjs` 退出码0，763条PASS记录，包含24,000帧AI长跑及TCP整局流程。对应日志为 `tmp/docs-artifacts/frost-arcane-tower/regression.log`；最终摘要为同目录 `verification.json`。
