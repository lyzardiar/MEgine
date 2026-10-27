# 建造、放置与矿井转换

2026-10-27。建筑与工人使用同一个 ScriptSession。建造订单、源命令区、放置预览、施工状态、占地、人口与矿井采集已连接实际消费者；完整四族经济和原版一致性尚未验收。

## 已接入的流程

- 工人的 Profile/Builds 提供建筑清单，原 CommandFunc/CommandStrings 和皮肤提供四族 B 菜单、返回/取消、图标、位置和热键。建筑按钮使用源价格、前置条件和禁用原因。选择建筑后显示原模型及红/绿网格，鼠标与脚本调用同一个 buildSite/build。
- 放置读取 UnitData/pathTex、UnitBalance/preventPlace/requirePlace 和源 BuildingAngle；使用64单位对齐、纹理中心偏移、32单位路径格、地图边界、荒芜、动态占地与当前单位占用。覆矿建筑对齐 canBuildOn 矿井，仅忽略底矿自身的动态占地，其余阻挡保留。
- 工人先移动到占地边缘，开始时扣费并创建未完工建筑。人族工人持续施工，并可由源修理能力协作加速；兽族和暗夜工人隐藏在施工状态中；亡灵开始召唤后恢复自由命令。暗夜 ancient 完工消耗小精灵，普通建筑释放工人。停工、继续施工、暂停、取消、死亡和移除接入同一状态。
- 施工进度显示在HUD，Birth序列按施工比例取帧；取消按钮和Esc调用实际取消/退款。未完工建筑不提供正常人口、生产、研究、攻击、采矿或持续恢复；人口预留在完工、取消、死亡、移除与转让时更新。
- 建筑与可破坏物共享归档内路径贴图及计数占地，重叠对象分别释放。SetUnitX/Y/Position、SetUnitPathing、死亡/复活/移除更新建筑占地。矿内和施工内隐藏状态同时参与绘制、选择、目标、商店与视野。
- 受诅咒/缠绕矿与普通底矿共享金币储量，native、采集与HUD读取同一份数量；覆矿期间隐藏底矿，覆矿取消/死亡/移除释放关系，耗尽统一处理底矿与覆矿。CreateBlightedGoldmine、entangle、entangleinstant 已连接实际创建及树/矿关系。
- GetConstructingStructure、GetCancelledStructure、GetConstructedStructure 与开始/取消/完工事件连接实际建筑；UnitSetConstructionProgress 修改真实施工进度，可触发完工。

资源仍从MPQ/地图直接读入内存，运行不生成解包工程。原安装只读，不加载Game.dll。

## 来源与实现边界

原版源字段、命令文本和能力记录位于 `tmp/docs-artifacts/war3/construction/source-{fields,controls}.json`。Game.dll 静态分析摘要为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；REA原始记录保存在同目录 construction_*.json，不提交原件或诊断快照。

- UnitSetConstructionProgress 注册入口0x6f1fb290，调用0x6f471810；入口按无符号参数夹取100，负整数位型也进入100。本实现保留该入口行为。
- CreateBlightedGoldmine 入口0x6f1dd900创建player15的ngol及指定玩家ugol，再关联底矿。原Blizzard.j创建亡灵初始矿时保存并恢复原矿量；暗夜初始树使用entangleinstant。
- 原订单表确认entangle=852147、entangleinstant=852148；源ConstructionRefundRate=0.75、ConstructionDamageRefundPenalty=1、ConstructionLifeDrainRate=10、BuildingAngle=270。

基础修理、人族协作、建筑升级与荒芜能力已接入，见[基地发展](base-development.md)；完整repair、建筑变形/拔起与物品建造仍待完成。施工初始生命采用上限10%，之后随进度增加90%；受损退款采用源退款率与损伤惩罚的基础计算。这些生命、退款、时间及矿井转换细节尚无完整原件精度结论，需集中对照后修正。施法魔法/冷却、覆盖资源特效/声音、矿内卸载UI、出入口拥堵与任意自定义建造能力仍待完成。

## 开发检查与阶段验证

Win32 Release产品与war3_construction_tests必要编译通过，无编译警告；生成器语法与5个原版native声明核对通过。建筑占地改变了地图初始化路径，DotA原main及首250ms模拟执行通过，bj_gameStarted=true、无Game.dll；它不证明建造操作或GPU通过。证据为同目录build-final.log、dota-250.log。

新增消费者已编译，尚未运行；与经济、生产、科技、战斗及三图实际操作合并执行：

```powershell
python watcher/war3/tests/generate-construction-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
cd watcher/war3
./build/windows-x86/bin/Release/war3_construction_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/construction/fixture.w3m'
```

阶段覆盖原建筑清单/热键冲突、合法与非法放置、工人到达/停工/恢复、四族施工方式、生命和人口、退款/事件、死亡/移除/转让重入、占地移动/重叠、覆矿/缠绕/共享储量/耗尽、源模型进度、红绿预览与实际输入。GPU画面、完整时序、三图对局、性能与连续切图仍待验证，旧MEngine队列状态保持延期。
