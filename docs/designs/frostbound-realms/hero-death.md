# 四族英雄死亡、消散与祭坛复活

Author: MiYu。新遭遇战使用 `heroDeathVersion=1` 和协议 77。已接入的四族 16 位英雄受到实际致命伤害后保留原身份、经验、技能与物品，释放人口；展示状态存放在英雄自身，不进入可消耗尸体集合。Death 时长来自原版 UnitData，随后进入原版 GameplayConstants 的三秒 Dissipate。源数据与签名沿用 `corpse-rules.json` 和 `corpse-rules-sources.json`。

死亡前捕获恶魔猎手变身和山丘之王天神下凡模型。战斗状态清除后按捕获形态选择源 Death／Dissipate 动画，并把阶段进度映射到模型实际片段时长。保留原版网格可见性轨道及已接入的模型内嵌特效；恐惧魔王的 Dissipate 片段全部网格透明，客户端按源轨道隐藏它们。死亡展示复用既有 Unit 槽位，场景仍为 22,370 个实体，没有增加静态死亡节点。

死亡模型隐藏选中圈、生命条、普通状态、光环和附件。敌方只在当前可见格获得绘制所需身份、位置、朝向与死亡阶段，不获得背包、技能、法力、队列和命令；展示结束后隐藏敌方保留身份。己方保留祭坛复活入口，付费复活完成时清除死亡展示。牛头人可用的重生仍使用独立七秒流程。胜负确定后继续消散计时，单机和服务器均保持战斗 frame 停止。旧存档缺少版本标记时迁移为 0，其他玩法仍使用版本 0。

验证入口：

- `node scripts/test-frost-hero-death.mjs`：16 位英雄、原版片段与阶段时长、实际变身、严格存档、确定性续玩、隐私、重生和祭坛复活。
- `node scripts/test-frost-hero-death-generated.mjs`：生成客户端网格／特效、死亡状态隐藏、暂停、F5、迷雾、不同活单位复用槽位和复活。
- `node scripts/test-frost-hero-death-network.mjs`：真实 TCP 阶段投影、重连、隐私、迷雾、付费复活及胜利后消散。
- `node scripts/qa-frost-hero-death.mjs`：原生 Death／Dissipate、变身模型、内嵌特效时间、F5 和祭坛复活；可通过 `MENGINE_QA_ROOT` 指定有足够空间的临时工程目录。

原生报告为 [native-hero-death-qa.json](native-hero-death-qa.json)，截图见 [Death](hero-death-native-death.png)、[Dissipate](hero-death-native-dissipate.png)、[变身](hero-death-native-demon.png)、[天神下凡](hero-death-native-avatar.png) 和 [复活](hero-death-native-revived.png)。最终全量回归和生成一致性结果见 `hero-death-validation.json`。

原版可执行程序的实际阶段衔接与播放速度、物理键鼠、音频听验、独立播放器和跨机器 LAN 尚未验收。当前阶段完善遭遇战英雄死亡表现；完整四族、战役、原版 Dota／塔防地图和完整地图编辑器仍需继续实现。
