# 英雄经验与成长

2026-10-27。`session_hero.cpp` 将经验、等级、基础属性、生命/魔法上限、技能点和学习事件接到实际单位；`game_commands.cpp`显示等级/经验/三属性/技能点。完整战斗、经验分配、主动技能和道具加成尚未完成。

规则从原版 `Units/MiscData.txt`、`Units/MiscGame.txt` 及地图 `war3mapMisc.txt` 读取；单位初始属性/成长来自UnitBalance，学习列表来自UnitAbilities，能力等级要求来自AbilityData。经验阈值使用源表，超出表项后使用源公式系数；实现有等级/数值预算。

- SetHeroXP/SetHeroLevel/UnitStripHeroLevel改变经验和等级，增长/减少对应属性和技能点，升级发送玩家/单位事件。升级回调可以修改英雄或删除单位，旧升级过程通过版本号结束。
- Get/SetHeroStr/Agi/Int、GetHeroXP/Level/SkillPoints、UnitModifySkillPoints、经验暂停和专有名称提供真实状态；力量/智力变化更新当前生命/魔法及上限。
- SetPlayerHandicapXP保存每个玩家的经验倍率，AddHeroXP当前按所属玩家倍率计入经验，经验暂停会阻止该增加入口。绝对设置经验和等级使用指定值。倍率适用范围及原件舍入仍待REA/运行精确对照，不代表击杀分配已实现。
- SelectHeroSkill验证源学习列表、等级要求、已学等级和技能点，再改变实际能力等级，并发送学习事件及上下文。尚不支持自定义w3a定义，也不表示完整施法/效果已实现；遇到缺失定义明确失败。
- SetHeroLevel的下降由独立UnitStripHeroLevel入口处理，与原版Blizzard.j的SetHeroLevelBJ调用结构一致。升级视觉效果、复活完整规则、技能降级重分配、物品属性叠加、名称池随机选择及不同历史规则集仍待实现/验收。

DotA已越过SetPlayerHandicapXP、SetAltMinimapIcon和GetItemType。最新123单位/1物品/67触发器/700事件，停在UnitAddItem拾取事件调用的IsUnitIllusion（Scripts/war3map.j:17014）；幻象创建和生命周期尚未实现，没有添加固定false占位。main仍未完成。

SetAltMinimapIcon写入WorldEnvironment，地图归档资源经现有后台队列读取，Alt小地图标记使用该纹理；GetItemType从ItemData类别返回原版itemtype，拾取脚本实际消费分类。原版切换交互、标记尺寸/颜色和新增GPU均待集中验证。

必要Win32 Release产品及扩展消费者编译通过，源字面量native签名静态核对通过；只进行了开局阻塞定位，未执行专项夹具。英雄夹具与商店消费者共用复制BootyBay，检查经验倍率/暂停、升级/学习事件、技能点、成长、力量与生命上限；按用户要求保留待阶段执行。专项夹具编译不等于运行通过。

待测还包括全部数值/舍入、绝对设值/负值、增减等级/重入、技能需求与永久/附加属性语义、源规则集选择，以及真实HUD显示。原始构建和开局日志在 `tmp/docs-artifacts/war3/hero-{build.log,dota.log}`。
