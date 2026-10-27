# 原版AI脚本与对局控制

StartMeleeAI/StartCampaignAI从挂载归档读取策略成员，地图覆盖优先，再查Scripts路径。common.j/common.ai固定来自公共归档；每个电脑玩家拥有独立VM/globals、策略状态及命令队列，句柄/单位/经济与地图共享。资源内存直读，最多12个竞争玩家；同一玩家重复启动当前明确拒绝。

## 实际消费

- Sleep/StartThread使用会话共享fiber调度，代码值记录所属VM；触发器/计时器/过滤和延迟回调返回所属脚本的变量空间。ExecuteFunc在调用它的VM启动函数。公共类型布局和签名一致才复用native，未知native明确失败。
- GetUnitCount/Done/Town及造价/时间、科技等级/价格查询实际单位、施工/升级/待建订单和生产队列。SetProduce/SetUpgrade调用现有付费训练、建造、升级和研究，经过源前置/人口/资源与事件。
- 城镇以源分类及稳定大厅句柄识别；矿井/剩余金量、扩张候选、位置与工人来自实际地图，指令经过现有路径/建造接口。
- HarvestGold/Wood累计同镇配额，ClearHarvestAI清除配额，StopGathering停止当前采集；空闲工人执行采金/伐木。支持原版-1全镇参数。
- 队长需求/组建、准备度/生命/魔法、目标/归家/撤退、敌基地/扩张/野怪营地、盟友目标和攻击指令消费实际部队。策略选项连接基础防守、受伤撤退、英雄拾物/治疗药品购买使用、工人修理和目标优先；英雄技能回调连接实际学习。
- CommandAI及查询/弹出使用有界FIFO；调试记录有界，脚本文本连接会话显示。

UnitMetaData中utyp的caseSens=0，原TownHall/Mechanical/Peon等字段含大写。ObjectData.unitClasses提供统一小写分类，property保留原字符串；AI城镇及现有IsUnitType、武器/技能/光环/吸血、修理和古树施工使用该分类。

## 当前证据

必要Win32 Release产品、AI驱动与线程消费者编译通过。共享域/回调所有权修改后，VM11项及会话5组检查通过、0失败，涵盖跨OS线程与取消RAII。

人族原AI由BootyBay原main的电脑槽1启动，2秒最小集成通过：1城镇、5个实际订单、2项生产队列、3名采集工人、2个待建/施工、5个活动线程，无Game.dll。此项只证明开局执行链，不代表完整对战、建造完成、资源收支或画面验收。首次HarvestGold参数阻塞及城镇分类大小写已修正，只复测同条开局。

证据在根tmp/docs-artifacts/war3/ai/：source.json、town-source.json、build-final.log、classes-build.log、delivery-build.log、vm-safety.log、session-safety.log及human-startup-final.log。没有运行三图/全族/GPU/性能回归。

common.ai来自War3Patch.mpq，SHA256为29f51929ff3c09988a77748dbefea319b72b32bf4bb1a5f6997760a621454818；human.ai来自War3x.mpq，SHA256为e89a747eb5dbb881e72850af12418677e01549cbf8dff7fc57c556c2a33170c8。其余三族摘要在本地source.json，不提交原资源。REA打开Game.dll确认x86及SHA256 e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a；深度查询因本次服务未配置Ghidra/IDA不可用，没有新增反编译行为证据。本实现依据原AI源声明/调用及现有状态消费者，原件精度待对照。

~~~powershell
cmake --build --preset release --target war3 war3_ai_tests --parallel 8
./build/windows-x86/bin/Release/war3_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m" 0 2
~~~

## 继续实现与阶段验证

完整四族/战役AI尚未完成。守卫位置/回收、PauseCompAI、完整战术/施法/物品选择、舰船/飞艇/运输、合并/变形、重开AI、全部策略native和原版同步仍待实现。当前城镇归属、编组/准备度、扩张/野怪分组与配额规则不能视为原版精度结果。

阶段合并验证四族持续运行、建造/训练/研究完成、资源/前置/人口/阻塞/重试、配额再分配/下降/返还、扩张/矿井耗尽、英雄/队长和攻击。覆盖多AI独立globals、跨VM回调/上下文、类型诊断/故障取消/切图释放，以及分类修正对修理/目标/古树/被动伤害的影响。GPU、三图长局、CPU/内存/磁盘和原版对照保持待验证；完整AI和客户端验收保持开放。

当前common.ai专用native接续清单（未绑定，调用会明确失败）：Unsummon、SetNewHeroes、PurchaseZeppelin、MergeUnits、ConvertUnits、SetRandomPaths、SetSlowChopping、SetCaptainChanges、SetReplacementCount、GroupTimedLife、LoadZepWave、AddGuardPost、FillGuardPosts、ReturnGuardPosts、ResetCaptainLocs、ShiftTownSpot、TeleportCaptain、ClearCaptainTargets、SuicideUnit、SuicideUnitEx、UnitInvis、IgnoredUnits、DisablePathing、SetAmphibious。common.j中的守卫与AI暂停接口另行实现。
