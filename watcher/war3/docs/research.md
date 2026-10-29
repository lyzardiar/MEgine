# 科技研究与升级消费

2026-10-27。原版 UpgradeData/UpgradeMetaData、四族/中立/战役 UpgradeFunc/UpgradeStrings 和地图 war3map.w3q 进入同一对象定义系统；保留等级字段、继承、图标/热键/按钮位置以及逐等级前置条件。

建筑的 Researches 和单位的 upgrades 来自源定义。研究与训练共用生产队列，消费资源和时间，限制同一玩家的重复研究，支持取消退款、暂停/死亡终止以及开始/取消/完成事件；GetResearched 读取事件上下文。命令区展示下一等级、资源、不可用原因和队列进度，脚本与界面共用实际队列。

当前接入攻击骰子/基础伤害/射程/攻速、单位 defUp 护甲、生命/魔法上限及百分比、移速及百分比、生命/魔法恢复、弹射数量/衰减、穿透距离/半径、武器启用和已有能力的等级。科技变更刷新当前单位，新单位创建时应用所属玩家科技。已发射弹道保存发射时的武器定义。尚未实现的效果明确禁用或报错，不将研究状态当成完整技能效果。

自定义科技为原本零骰子、零骰面的武器增加骰子时，公共武器定义暂按一面骰计算，使单位、可破坏物攻击和伤害面板使用同一数值并避免除零；该边界的原版规则待对照。

兽族战鼓科技 `Rwdm` 的 `raud` 效果根据源升级等级和目标能力 ID 叠加到发出者的攻击光环；原 `okod` 和 `nckb` 源单位均列有该科技。光环刷新将增量带入受益者、最强来源选择和实际攻击加成，死亡、易主、新建及科技变更沿用现有状态刷新。自定义升级按源 `code` 指定能力，效果只作用于攻击伤害光环；精确数值、刷新时序及地图覆盖尚待原版对照。

夜视科技 `Rguv` 的 `rauv` 效果接入列有该科技的单位：夜间使用其白天视野，并在科技状态变化时立即失效迷雾缓存。源 `UnitBalance` 中 102 个单位列有该科技，科技与已有 `Ault` 能力、物品夜视来源可独立生效。实际视野、原版叠加和撤销行为待阶段对照。

符文能力 `AIgl` 按源能力各级的 `UnitID` 与 `DataA` 增加拾取者所属玩家的科技等级。原夜视符文 `guvi` 依次激活 `Rguv` 与 `Reuv`，强化符文 `gfor` 激活 `Rgfo`；均使用既有拾取自动使用、物品事件及次数耗尽移除流程。原件 `CAbilityGlyph` 虚函数 `0x6f5b9e00` 的能力等级循环证据为 `ev_bfda3e203df89753f87ea354426969f30e38c3ab506bcdea56ff11f99f53f3f2` 与 `ev_b418c680bd4cd50f8d2741afad635d80585adf5f49ad6b0ee27d8bef8fc51311`。重复拾取、上限、触发事件与消耗的原版细节待集中对照。

尖刺路障 `Rosp` 的 `rspi` 按源升级数值作用于列有科技的单位，近战攻击实际命中后通过既有反伤路径对敌方攻击者造成固定伤害。源列表包括兽族主要建筑、箭塔和数个中立建筑；升级等级和地图覆盖随单位研究状态更新。显示使用 `Aspi` 源 TargetArt 及建筑 Profile 的 `Attachmentanimprops` 选择原模型尺寸动画，缺少匹配动画时回退普通序列；死亡、隐藏、类型改变和移除走现有特效生命周期。原件 `CBonusBase::ShowBonusArt` 与附件属性读取的静态证据为 `ev_e30abc6bdd2a8538856588aa8d3200309c873c78618ff1a526f02b54459b6aba`、`ev_14e26a622d139f4893fbca97871c7861e9771b6b66741c2ff1ed7dd13620a3c5`；绑定细节、伤害分类、致命一击时序及原版叠加仍待对照。

骷髅持续时间科技 `Rusl` 的 `rrai` 接入亡者复生新召唤单位的定时生命，按召唤单位自身的源科技列表及当前等级叠加源数值；已存在的定时生命不重新计时。原 `uske`、`uskm` 与 `unec` 均列有该科技，原始效果为增加 15 秒。物品召唤与自定义技能使用同一亡者复生流程；已有召唤物、其他生成方式及原版精确应用时机仍待对照。

骷髅法师科技 `Rusm` 通过通用 `rlev` 升级巫师的 `Arai`：源二级亡者复生各生成一名骷髅战士和骷髅法师。脚本在科技完成后新添加能力时读取该单位的现有科技等级；法术书对工程学替换能力也按原能力 ID 查询科技。已有能力、物品授予与运行中施法沿用各自的生命周期；动态增删与原版等级、事件和施法快照仍待集中对照。

`rtma` 科技效果根据源字段的目标 ID 和新旧等级差调整玩家科技最大允许数量；现有有限上限保持独立。`Acha` 能力在单位创建、获得能力、科技和归属变化后检查原 `Requires`／`checkDep` 并消费 `UnitID`，使用现有变形流程保留单位句柄；原猎头者的 `Sbsk` 由 `Robk` 解锁并变为狂战士，蒸汽机车的 `Srtt` 由 `Rhrt` 解锁并变为火箭型。REA 对照了 `CUpgradeAddTechMaxAllowed` 的等级差及上限路径（`0x6f6985d0`）和 `CAbilityChaos` 的目标单位转换路径（`0x6f4ac3b0`）。原版 `Blizzard.j` 的 `InitSummonableCaps` 按未研究状态将 `hrtt`／`otbk` 最大数量设为零；原 BootyBay 地图的 main 调用 `InitBlizzard`，后者调用该初始化函数。代码沿地图 JASS 执行这一设置，未调用 `InitBlizzard` 的自定义脚本按其自身逻辑处理。排队转换、条件变更时序与完整变形细节仍待对照；目前不能视为两项科技完整验收。

训练菜单对源表同时列出、共用按钮位置且由 `Acha` 关联的单位，在旧型上限为零时展示新型，否则展示旧型。猎头者／狂战士与蒸汽机车／火箭型均使用这一规则；按钮仍由真实科技限制和资源检查控制。该选择依据源训练列表、按钮位置和现有上限推导，原版按钮隐藏／禁用行为及脚本／AI 训练和队列行为仍待对照。

原版静态入口核对：SetPlayerTechResearched 0x6f1f6440 计算 max(目标-当前,0)，再转 AddPlayerTechResearched 0x6f1da190；后者只处理正增量。GetPlayerTechCount/GetPlayerTechResearched 入口为 0x6f1e4190/0x6f1e4200，GetResearched 为 0x6f1e46b0。REA 读取原件 SHA-256 e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，未修改原件。原始数据及入口证据位于 tmp/docs-artifacts/war3/research/。

本项仍为部分实现：资源采集/光环/视野/荆棘/变形/特殊护甲及种族技能效果、科技等价/继承、转移所有权时的队列规则、生命魔法变化及攻击效果的原版逐项精度仍待实现或对照。完整客户端玩法范围保持不变。

必要产品/commerce/research 目标编译通过；DotA 原 main 与首250ms模拟退出0，bj_gameStarted=true、无Game.dll。这只覆盖对象读取/开局阻塞路径。新增 generate-research-fixture.py 和 war3_research_tests 已编译，行为执行仍在阶段测试队列。

集中验证命令（仓库根目录生成夹具；随后在 watcher/war3 运行消费者）：

```powershell
python watcher/war3/tests/generate-research-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
cd watcher/war3
./build/windows-x86/bin/Release/war3_research_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/research/fixture.w3m'
```

测试仅在 tmp 生成隔离地图，不修改原安装。专项覆盖自定义三级升级、当前/新建单位消费、重复研究锁、扣费/退款、事件及开始回调取消；三图对战、HUD和性能随阶段统一验证。

兽族加强型护甲 `Rorb` 已接入 `Arbr` 的源 TargetArt：研究完成后，为拥有该能力的存活建筑附加模型；科技、能力可用性、建筑隐藏／死亡和移除变化沿用效果释放流程。原版 `otrb`、`owtw`、`ocbw` 的能力表均含 `Arbr` 且升级列表均含 `Rorb`。模型尺寸、升级表现和自定义科技对应关系待阶段对照。
