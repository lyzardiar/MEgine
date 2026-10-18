# 死灵法师与萨满的原版基础规则

本阶段接入安装版 Warcraft III 的单位基础属性、普通攻击、训练增益及两座生产建筑的基础护甲。协议为 105。新遭遇战使用 `sourceCasterVersion=1`；缺字段旧存档恢复为 0，继续使用旧属性、计费、人口及回复规则。

| 项目 | 死灵法师 unec | 萨满 oshm |
| --- | --- | --- |
| 生命 / 初始法力 / 法力上限 | 305 / 75 / 200 | 335 / 75 / 200 |
| 金 / 木 / 人口 / 生产秒数 | 145 / 20 / 2 / 24 | 130 / 20 / 2 / 30 |
| 护甲 / 移速 / 碰撞半径 | 无甲 0 / 2.7 / .16 | 无甲 0 / 2.7 / .16 |
| 昼 / 夜视野 | 14 / 9 | 14 / 8 |
| 生命回复 | 荒芜之地 2/秒 | 始终 .25/秒 |
| 普通攻击 | 魔法，1d2+7，射程 6 | 魔法，1d2+7，射程 6 |
| 攻击间隔 / 前摇 / 后摇 | 1.8 / .53 / .47 | 2.1 / .43 / .74 |
| 弹道 / 速度 / 弧度 | NecromancerMissile / 9 / 0 | FarseerMissile / 12 / .15 |
| 训练研究 / 每级时间 | Rune / 30、45 秒 | Rost / 60、75 秒 |

两者基础法力回复为 .666666666666667/秒，训练每级增加 40 生命、100 法力上限和 .325/秒法力回复，专家级费用为 100 金 50 木，大师级为 100 金 150 木。源命令卡使用 N/S 生产及 E/M 研究热键。源普通攻击没有原型吸血或减速，也不叠加原型通用武器研究的 +6 伤害。

诅咒神庙 utod：1100 生命、5 城甲、155 金 140 木、60 秒；灵魂归宿 osld：800 生命、5 城甲、150 金 150 木、70 秒。昼夜视野分别为 9/6。建筑的完整路径贴图与放置尺寸属于后续对照范围。

`sourceCasterRules=1` 随单位、建筑和投射物保存；投射物在施法者死亡并从单位表移除后仍保留源速度、弧度、伤害类型和模型。Animate Dead 继续使用其独立的原版复活档案。恢复存档时验证版本、阵营来源、基础属性、训练等级及投射物标记。

生命和法力升级复用 `upgradeHitPoints`、`upgradeMana`：由 `healthUpgradeVersion`、`manaUpgradeVersion` 分别控制比例保留和原版单精度舍入。新生产单位使用完整生命与源初始法力 75。原生验证确认本引擎的完整计时、升级生效和当帧回复行为；这不等同于已证明原游戏内部所有单位更新顺序。

## 来源与维护

- REA GitHub 源站：<https://github.com/morluto/rea>，固定 6.5.0；上游提交、归档摘要、许可证与 MCP 使用方式见 `third_party/rea/README-MENGINE.md`。
- 原版目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。静态分析目标 Game.dll 的 SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `source-casters.json` 保留选中 UnitBalance、UnitWeapons、UnitUI、UnitAbilities、UpgradeData 行和单位/研究文字字段；MPQ 原件在 `SourceAssets/SourceCasters/`。原始文本保留重复字段，完整科技树及命令卡组装仍需独立运行对照。
- `source-casters-sources.json` 记录 MPQ 优先级、原件与输出摘要、转换器、模型库和复用的先知弹道目录摘要；`source-caster-node-sources.json` 记录节点转换。现有原版单位与建筑模型继续复用。
- Blizzard 游戏数据与美术遵守原始游戏条款，提取不授予额外分发许可；REA 的 MIT 许可不覆盖游戏资源。

复现命令（仓库根目录）：

```powershell
node scripts/probe-frost-rea-rewards.mjs --source-casters
$env:PYTHONUTF8='1'
python scripts/import-frost-source-casters.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
node scripts/build-frostbound.mjs
node scripts/test-frost-source-casters-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-source-casters.mjs
```

转换工具的路径按机器配置。`--source-sample` 指向已保留原件的样例，`--output` 指向独立目录，可在没有安装游戏的情况下复现；仍需本地原版模型库、节点读取器与 pose probe。导入器拒绝覆盖已编辑的签名输出。

REA 本阶段复核了源字段和 `rmnx/rhpx/rmnr` 写入路径：生命 setter `0x6f6331a2`、法力写入 `0x6f653111`、加法回复 setter `0x6f652f60`。目录参数来自 MPQ 表；没有将静态反汇编当作原游戏运行验收。

验证产物位于 `tmp/docs-artifacts/frost-source-casters/`：REA 三组真实 MCP 证据、源规则/实际 TCP 回归、独立原生生产与两级训练全时钟、途中存档、源投射物渲染及命中、主回归（582 条 PASS、进程退出码 0）和 24,000 帧 AI。签名输出和回执共 74 个文件已验证无安装逐字节复现。原生控制台错误为 0，编辑器正常退出；仍被系统占用的隔离 QA 缓存保留。

当前样例的法术流程、完整种族科技树和生产名单仍需继续逐项对照，本阶段不代表 Warcraft III 整体 1:1 复刻完成。
