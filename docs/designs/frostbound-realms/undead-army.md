# 食尸鬼、憎恶及生产建筑

协议 110。新遭遇战默认 `undeadArmyVersion=1`，不死族启用源档案；缺字段旧存档恢复为 0。单位和建筑保存 `undeadArmyRules=1`，恢复时验证来源、阵营、基础属性及装备等级。

| 单位 | 生产建筑 | 金/木/人口/秒 | HP / 重甲 | 普攻骰子 / 间隔 / 前摇 |
| --- | --- | --- | --- | --- |
| 食尸鬼 ugho | 地穴 usep | 120/0/2/18 | 340 / 0 | 10+2d2 / 1.3 / 0.39 |
| 憎恶 uabo | 屠宰场 uslh | 240/70/4/40 | 1175 / 2 | 32+1d7 / 1.9 / 0.5 |

两单位速度 270、昼夜视野 1400/800、法力 0，荒芜上每秒回复 2 HP；源坐标按 100 单位换算为一个世界单位。源普攻使用普通伤害和完整攻击前摇，食尸鬼不带原型通用吸血。坟场 Rume 每级增加一个源攻击骰子，Ruar 每级加 2 护甲，立即更新现有及未来生产的单位。死亡骑士 Animate Dead 按既有复活档案还原基础身体并清理军队/装备标记。

地穴为 200 金/50 木/1300 HP，屠宰场为 140 金/135 木/1200 HP，均为 5 城甲、60 秒施工。完整施工从侍僧到达开始计 600 帧，途中存档保留进度，取消退回 75% 实付资源。屠宰场要求已完成亡者大厅和坟场，憎恶训练要求黑色城堡。建筑源表 `regenHP=0, regenType=none`。地穴当前生产食尸鬼、穴居恶魔和石像鬼，屠宰场当前生产憎恶，源名单完整留在 `sourceFunc`。

生产卡采用源图标、卡位与 G/A 热键，显示源价格、人口、时钟及前置条件。源地穴隐藏原型 Weapons +6；源生产路由不再提供原型骨弓、冲车或地穴训练憎恶。联机使用权威队列，敌方不能操作且看不到私有队列；断线重连保留已付款生产。

## 来源与维护

- REA 上游：<https://github.com/morluto/rea>，固定 6.5.0。GitHub 提交、源码归档、许可证、MCP 接入及更新方法见 `third_party/rea/README-MENGINE.md`。
- 原目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`；Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 检查字段与武器装载路径，静态证据不证明原游戏全部更新顺序。
- `SourceAssets/UndeadArmy/` 保存 MPQ 原件；`undead-army.json` 保存源行、本地化、命令卡、属性和伤害表；`undead-army-sources.json` 保存来源、生成器、输出及复用模型目录摘要。模型沿用 `RealGhoul`、`RealAbomination`、`RevenantBarracks`、`RevenantWorkshop`，遵守 Blizzard 原游戏条款。

```powershell
node scripts/probe-frost-rea-rewards.mjs --undead-army
$env:PYTHONUTF8='1'
python scripts/import-frost-undead-army.py
node scripts/build-frostbound.mjs
node scripts/test-frost-undead-army-network.mjs
node scripts/test-frost-undead-army-generated.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-undead-army.mjs
```

导入器支持 `--source-sample`、`--output` 和 `--game`，已签名来源被编辑后拒绝覆盖。无游戏安装时可从保留原件逐字节重建 25 个输出及回执，共 26 个文件。运行证据统一保存在 `tmp/docs-artifacts/frost-undead-army/`。

规则和真实 TCP 检查覆盖完整建造/生产时钟、费用、人口、取消、前置、装备、前摇、存档和重连。生成客户端检查源卡位、图标、热键、生产名单及模型。完整主回归记录 655 条 PASS，以 exit 0 结束；24,000 帧 AI 单独通过。额外生成客户端检查通过憎恶 T2 禁用图标、卡位与 A 键拒绝且不扣费。原生两项通过完整 18/40 秒生产、途中读档、源模型、真实攻击及连续 120 秒坟场攻防研究，控制台错误 0，Editor 正常退出。暂存 Main.js 原始字节 SHA-256 与原生报告一致：`7906418f2a0982d340cb048054dd9ce3cac9958085d7cf3c0bf19016cd0d0fb4`。独立复核确认源地穴拒绝伪造亡灵巫师队列，旧版历史队列仍可恢复。系统占用的 QA 缓存保留在隔离目录。

绞肉车、雕像等完整生产名单、食尸鬼狂热、疾病云雾、原版建造菜单卡位/快捷键和全部队列限制仍需继续还原。整体 1:1 复刻保持进行中。

穴居恶魔和石像鬼的双武器、模型/头像、坟场生物装备、二级基地生产与 AI 前置维护入口见 [地穴单位说明](crypt-units.md)。
