# 通灵塔的两条防御升级分支

Author: MiYu

单机与联机遭遇战中，选择已完成的不死族通灵塔，可升级为幽魂之塔（T）或蛛网怪塔（N）。工人的防御建筑菜单使用通灵塔升级路径。升级期间保留 10 人口，完成时保留实体 ID 和受损生命比例。取消按钮或 Escape 取消升级，退还 75% 金币与木材，分别向下取整；Escape 取消升级时不暂停比赛。

| 升级 | 金币／木材 | 时间 | 完成生命 | 攻击基数 | 攻击类型 |
|---|---:|---:|---:|---:|---|
| 幽魂之塔 | 145／40 | 35 秒 | 550 | 29.5 | 穿刺 |
| 蛛网怪塔 | 100／20 | 30 秒 | 550 | 9.5 | 普通 |

两塔可攻击地面及空中目标。幽魂之塔使用暗影弹；蛛网怪塔使用冰冻弹，命中移动单位后施加 5 秒冰冻，本实现的移动倍率为 0.5，攻击冷却恢复倍率为 0.75。再次命中刷新冰冻，Purge 与英雄重生清除效果。修理成本包含原供给建筑和升级的投入；两条分支均继续提供 10 人口。AI 会选择已完成通灵塔升级，编辑器可放置完成后的两种塔。

升级时间、费用、完成生命、攻击类型与攻击均值参照 Blizzard 的 [Spirit Tower](https://classic.battle.net/war3/undead/buildings/spirittower.shtml)、[Nerubian Tower](https://classic.battle.net/war3/undead/buildings/nerubiantower.shtml)；来源页面 SHA-256 记录在 [验证报告](ziggurat-upgrade-validation.json)。当前通灵塔沿用供给建筑的基础数值；墓地前置、原版数值护甲、射程换算与随机伤害尚未完成，冰冻倍率尚未通过独立原版数据核对。现有 `RevenantTower` 几何用于两条分支，分别使用绿色与蓝色材质调色，尚未制作原版独立模型。

联网协议为 31，服务器与客户端共用 `Frost.PROTOCOL`，拒绝协议 30 客户端。升级进度对所属玩家可见，敌方公开状态隐藏尚未完成的升级；完成后的建筑种类及可见冰冻效果同步。升级中的存档、取消与重连不重复扣费。

验证入口：`node scripts/test-frost-ziggurat.mjs`、`node scripts/test-frost-ziggurat-network.mjs`、`node scripts/test-frostbound.mjs`、`node scripts/qa-frost-ziggurat.mjs`。规则、完整回归、实际 TCP 与原生 QuickJS 验证通过。规则测试使用完整 30／35 秒计时；TCP 测试保留原始升级进度检查，完成阶段缩短隔离服务器夹具的剩余时间。原生验证通过真实按钮、热键和完整计时完成两分支，验证取消不暂停、受损生命比例、人口、模型／材质绑定、空中目标冰冻、升级中存档与完成后恢复，shader 拒绝数为 0。

运行包 757 个文件的大小及 SHA-256 全部验证，Player 启动 30 秒正常响应、日志无 ERROR。证据：[原生报告](ziggurat-upgrade-native-qa.json)、[包检查](ziggurat-upgrade-player-smoke.json)、[升级选择](ziggurat-upgrade-choices.png)、[升级中](ziggurat-upgrade-progress.png)、[蛛网怪塔](ziggurat-upgrade-nerubian.png)、[幽魂之塔](ziggurat-upgrade-spirit.png)。地图、地形、场景实体及源资产清单保持既有内容；本阶段没有新增下载资产。

完整 Warcraft III 复刻仍未完成。物理输入、音频、跨机器联机及稳定 Player 帧率未在本阶段验收。
