# 原版AI脚本与对局控制

StartMeleeAI/StartCampaignAI从挂载归档读取策略成员，地图覆盖优先，再查Scripts路径。common.j/common.ai固定来自公共归档；每个电脑玩家拥有独立VM/globals、策略状态及命令队列，句柄/单位/经济与地图共享。资源内存直读，最多12个竞争玩家；同一玩家重复启动当前明确拒绝。

## 实际消费

- Sleep/StartThread使用会话共享fiber调度，代码值记录所属VM；触发器/计时器/过滤和延迟回调返回所属脚本的变量空间。ExecuteFunc在调用它的VM启动函数。公共类型布局和签名一致才复用native，未知native明确失败。
- GetUnitCount/Done/Town及造价/时间、科技等级/价格查询实际单位、施工/升级/待建订单和生产队列。SetProduce/SetUpgrade调用实际付费训练、建造、升级、研究及已有英雄复活；SetNewHeroes控制是否允许新增英雄，旧英雄复活保留原句柄/成长/库存，见[英雄复活](hero-revival.md)。
- 城镇以源分类及稳定大厅句柄识别；矿井/剩余金量、扩张候选、位置与工人来自实际地图，指令经过现有路径/建造接口。
- HarvestGold/Wood累计同镇配额，ClearHarvestAI清除配额，StopGathering停止当前采集；下一AI心跳统一保留、补足或释放配额，携带资源经过返还。支持-1全镇参数，详见[战役AI](campaign-ai.md)。
- 队长需求/组建、准备度/生命/魔法、目标/归家/撤退、敌基地/扩张/野怪营地、盟友目标和攻击指令消费实际部队。策略选项连接基础防守、受伤撤退、英雄拾物/治疗药品购买使用、工人修理和目标优先；英雄技能回调连接实际学习。
- CommandAI及查询/弹出使用有界FIFO；调试记录有界，脚本文本连接会话显示。

UnitMetaData中utyp的caseSens=0，原TownHall/Mechanical/Peon等字段含大写。ObjectData.unitClasses提供统一小写分类，property保留原字符串；AI城镇及现有IsUnitType、武器/技能/光环/吸血、修理和古树施工使用该分类。

## 当前证据

必要Win32 Release产品、AI驱动与线程消费者编译通过。共享域/回调所有权修改后，VM11项及会话5组检查通过、0失败，涵盖跨OS线程与取消RAII。

人族原AI由BootyBay原main的电脑槽1启动，2秒最小集成通过：1城镇、5个实际订单、2项生产队列、3名采集工人、2个待建/施工、5个活动线程，无Game.dll。此项只证明开局执行链，不代表完整对战、建造完成、资源收支或画面验收。首次HarvestGold参数阻塞及城镇分类大小写已修正，只复测同条开局。

证据在根tmp/docs-artifacts/war3/ai/：source.json、town-source.json、build-final.log、classes-build.log、delivery-build.log、vm-safety.log、session-safety.log及human-startup-final.log。没有运行三图/全族/GPU/性能回归。

common.ai来自War3Patch.mpq，SHA256为29f51929ff3c09988a77748dbefea319b72b32bf4bb1a5f6997760a621454818；human.ai来自War3x.mpq，SHA256为e89a747eb5dbb881e72850af12418677e01549cbf8dff7fc57c556c2a33170c8。其余三族摘要在本地source.json，不提交原资源。REA打开Game.dll确认x86及SHA256 e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a；REA/Rizin已补充定位玩家暂停计数/非零判断、守卫开关及Remove/Recycle调用链，见[AI控制](ai-control.md)。完整策略规则的原件精度仍待对照。

~~~powershell
cmake --build --preset release --target war3 war3_ai_tests --parallel 8
./build/windows-x86/bin/Release/war3_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m" 0 2
~~~

## 继续实现与阶段验证

完整四族/战役AI尚未完成。完整守卫自动登记、战术/施法/物品选择、舰船/飞艇/运输、合并/变形、重开AI、全部策略native和原版同步仍待实现。当前城镇归属、编组/准备度、扩张/野怪分组与配额规则不能视为原版精度结果。

阶段合并验证四族持续运行、建造/训练/研究完成、资源/前置/人口/阻塞/重试、配额再分配/下降/返还、扩张/矿井耗尽、英雄/队长和攻击。覆盖多AI独立globals、跨VM回调/上下文、类型诊断/故障取消/切图释放，以及分类修正对修理/目标/古树/被动伤害的影响。GPU、三图长局、CPU/内存/磁盘和原版对照保持待验证；完整AI和客户端验收保持开放。

SetSlowChopping、SetCaptainChanges、TeleportCaptain、SuicideUnit/Ex已接到实际伐木、互斥编组/补员、位置与持续出击。原CampaignAI的4秒开局检查通过：2常驻线程、6名工人采集、2项生产队列；专项行为与原版精度仍待阶段验证。

Unsummon已连接已有工人的Auns目标施法和建筑持续消退/返还；GetBuilding按目标玩家查实际建筑并排除反召唤中的对象，详见[反召唤](unsummon.md)。原AI完整循环待阶段验证。

UnitInvis已使用AI所属玩家的实际隐形/侦测判定，敌情查询排除无法侦测的隐形目标；实际隐形术/真实视域、native和AI之间的最小流程通过，见[隐形与侦测](visibility.md)。完整原件语义继续阶段对照。

当前common.ai专用native接续清单（未绑定，调用会明确失败）：PurchaseZeppelin、SetRandomPaths、LoadZepWave、DisablePathing、SetAmphibious。完整原版守卫自动登记/补员细节和策略行为继续实现及对照。

## AI 单位合并与转换

原 common.ai 的 MergeUnits 使用目标数量、两类来源和结果类型；ConvertUnits 使用数量与来源类型。AI 现在选取自身可用单位，通过真实骑乘／合并能力和毁灭者形态能力下达命令，复用技能前置、占用、移动、人口与变形费用和事件。已有进行中的同类命令计入本次需求，避免反复调用重复下达；候选不足时返回失败，已接受的命令继续执行。当前转换针对 Aave 原型及其派生，完整 AI 行为仍待实现。

REA 核对 Game.dll 1.27 的真实注册入口 MergeUnits `0x6f891f20` 与 ConvertUnits `0x6f88e350`：前者比较结果数量与在途数量，后者遍历来源类型并对已有动作及发出的命令计数。证据 `ev_5bf1dc3654a6e4ff9c1a59cb0ad047872eb3dd0e4ed6a51f382d6c156ca5c`、`ev_f2d525151c2b862726f6176f410a62ba46b615ad1239c5c0a6b026d694b89333`。候选优先级、零／负数边界、动作状态和返回时序尚未完整对照；实际玩法、四族和战役 AI 留待集中验证。
