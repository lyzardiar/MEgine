# 科技研究与升级消费

2026-10-27。原版 UpgradeData/UpgradeMetaData、四族/中立/战役 UpgradeFunc/UpgradeStrings 和地图 war3map.w3q 进入同一对象定义系统；保留等级字段、继承、图标/热键/按钮位置以及逐等级前置条件。

建筑的 Researches 和单位的 upgrades 来自源定义。研究与训练共用生产队列，消费资源和时间，限制同一玩家的重复研究，支持取消退款、暂停/死亡终止以及开始/取消/完成事件；GetResearched 读取事件上下文。命令区展示下一等级、资源、不可用原因和队列进度，脚本与界面共用实际队列。

当前接入攻击骰子/基础伤害/射程/攻速、单位 defUp 护甲、生命/魔法上限及百分比、移速及百分比、生命/魔法恢复、弹射数量/衰减、穿透距离/半径、武器启用和已有能力的等级。科技变更刷新当前单位，新单位创建时应用所属玩家科技。已发射弹道保存发射时的武器定义。尚未实现的效果明确禁用或报错，不将研究状态当成完整技能效果。

兽族战鼓科技 `Rwdm` 的 `raud` 效果根据源升级等级和目标能力 ID 叠加到发出者的攻击光环；原 `okod` 和 `nckb` 源单位均列有该科技。光环刷新将增量带入受益者、最强来源选择和实际攻击加成，死亡、易主、新建及科技变更沿用现有状态刷新。自定义升级按源 `code` 指定能力，效果只作用于攻击伤害光环；精确数值、刷新时序及地图覆盖尚待原版对照。

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
