# 地穴：穴居恶魔与石像鬼

协议 110。新遭遇战的 `undeadArmyVersion=1` 将两单位加入源地穴的生产名单，沿用源单位身份标记、付费队列、坟场装备和存档校验。原型版本 0 保留旧生产名单。两单位在新遭遇战中归属于其他种族时仍保留源内在属性；外族兵营不因此获得其生产权限。

| 单位 | 源 ID | 金/木/人口/秒 | HP / 护甲 | 速度 / 碰撞 / 昼夜视野 |
| --- | --- | --- | --- | --- |
| 穴居恶魔 | ucry | 215/40/3/30 | 550 / 中甲 0 | 270 / 32 / 1400、800 |
| 石像鬼 | ugar | 185/30/2/35 | 410 / 无甲 3 | 350 / 8 / 1600、800 |

源距离按 100 单位换算为一个世界单位。两者法力为 0，荒芜上每秒回复 2 HP。穴居恶魔要求坟场，卡位 1、热键 F；石像鬼要求坟场和亡者大厅，卡位 2、热键 A，二级基地即可生产。石像鬼飞行高度为 240。自动接敌采用源获取距离 700/500。

| 武器 | 目标 | 攻击 / 骰子 | 射程 | 间隔 / 前摇 / 后摇 |
| --- | --- | --- | --- | --- |
| 穴居恶魔 1 | 地面 | 穿刺 / 25+1d6 | 550 | 2 / 0.64 / 0.36 |
| 石像鬼 1 | 空中 | 普通 / 60+1d10 | 128 | 1.4 / 0.33 / 1 |
| 石像鬼 2 | 地面 | 穿刺 / 17+1d4 | 300 | 2.2 / 0.633 / 0.7 |

前摇保存武器槽，目标类别变化时取消不匹配的前摇；飞行单位采用水平攻击距离。地面弹道使用源模型、发射位置、命中高度、速度 500/900 和弧度 0.15/0。弹道独立保存源身份、武器槽、骰子结果和装备等级，来源死亡或离开单位表后仍可完成命中。恢复拒绝无标记、无效武器槽及非整数槽。

两者受坟场 Rura/Rucr 影响：攻击每级增加一个该武器的源骰子，护甲每级加 2。石像鬼对空每骰平均增加 5.5，对地为 2.5。研究完成更新现有及未来生产单位；在飞弹道保留发射结果。穴居恶魔使用原版尸体身份和死亡骑士复活身体，复活后的基础攻击同样保留原弹道模型、速度、弧度和发射/命中位置；石像鬼只保留死亡表现，不留下可消费的生物尸体。

源地穴当前生产食尸鬼、穴居恶魔和石像鬼。AI 通过现有付费建造命令补建坟场，再按合法源名单排队；完整原版 AI 计划仍需继续还原。客户端使用原图标、原身体模型和带原始相机的动态头像。

## 来源、更新与复现

- REA：<https://github.com/morluto/rea>，固定 6.5.0。GitHub 提交、源码归档、许可证、引擎 MCP 接入和更新流程见 `third_party/rea/README-MENGINE.md`。
- 原游戏：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`；Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 保留武器字段、装备处理函数和相关技能类的静态证据；不据此声称原游戏全部动态更新顺序已验证。
- `SourceAssets/CryptUnits/` 保存 MPQ 数据、原 MDX、节点转换说明和来源许可证；`crypt-units.json` 保存原行、武器、单位与生产卡；`crypt-unit-models.json`、`crypt-unit-portraits.json` 保存转换模型和源头像相机。
- `crypt-units-sources.json` 记录文件、生成器、转换工具及 `game-ready`、`remaining-ready` 原始资产集摘要。模型与数据遵守 Blizzard 原游戏条款；来源声明不构成免费再分发许可。

```powershell
node scripts/probe-frost-rea-rewards.mjs --crypt-units
$env:PYTHONUTF8='1'
python scripts/import-frost-crypt-units.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
node scripts/build-frostbound.mjs
node scripts/test-frost-crypt-units-network.mjs
node scripts/test-frost-crypt-units-generated.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-crypt-units.mjs
```

导入器保留已签名输出，检测到用户编辑后拒绝覆盖。已有保留源文件和资产库时，`--game Z:/not-installed --output <临时目录>` 已在无游戏安装条件下逐字节复现 269 个输出及回执，共 270 个文件；仍需指定匹配摘要的转换工具。运行报告、截图、REA 证据和原始日志统一保存在 `tmp/docs-artifacts/frost-crypt-units/`。

专项覆盖完整生产、费用人口、取消退款、二级基地门槛、三套武器、装备、获取距离、源死亡后的弹道、严格恢复、实际尸体复活、原型隔离及 AI 合法建造/选兵。真实 TCP 覆盖权限、私有队列、生产/前摇/弹道重连，生成客户端覆盖源卡位、热键、身体、头像和生产途中存取。

原生四项验收通过：两单位完整生产和途中读档、真实普通攻击与连续 120 秒坟场攻防研究；石像鬼保存对空前摇后正确命中；死亡骑士实际复活穴居恶魔后，源弹道及飞行途中读档均正确命中。控制台错误 0，Editor 正常退出。暂存的 Main.js 与原生验收 SHA-256 一致：`c877220b597fed88a3c661d60b4a1b887b90f3fd5c513f41a16e61b8f394bdfa`。269 个资产输出的暂存字节均与来源回执摘要一致。Windows 拒绝删除的隔离 QA runtime 缓存保留，位置与原因见 `native-crypt-units.json`。

主回归完成并记录 685 条 PASS，无断言失败或错误；其中耗时的暗夜经济 AI 入口拆开运行，24,000 帧检查通过。主回归日志为 `main-final-regression.log`，独立 AI 日志为 `ai-regression.log`。47 个修改的 JavaScript 测试/生成入口语法检查通过，暂存差异检查通过。独立复核覆盖三种外族归属的两单位源身体、生产权限隔离，以及实际复活穴居恶魔的飞行读档与命中一致性。

蛛网、钻地、石像形态的源技能名单已保留，技能行为和研究尚待接入；完整科技树、建造命令卡、原版队列限制与完整更新时序仍在继续还原。整体 1:1 复刻目标保持进行中。
