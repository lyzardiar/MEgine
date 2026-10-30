# 原单位运输流程

原飞艇的基础装载、搭乘、移动和卸载已接入。实现以Acar货舱、Aloa装载、Adro卸载及Adri即时卸载原型为入口，连接实际单位句柄/容量/坐标/命令/事件/界面。完整运输、原版坠毁规则、海军及其他货舱玩法仍开放。

## 实际消费

- Sch3的Acar原型提供8格，Sch4/Sch5继续读取各自源容量/范围/区域/间隔。乘员从UnitData.cargoSize读取格数，普通单位/英雄为1，投石车为2；源ucar覆盖沿用ObjectData。容量不足、不能运输的类型、建筑、递归货舱、敌对关系、nonsapper和无敌目标限制在装载前检查；地面与飞行乘员分别按货舱及装载能力的 ground／air 目标掩码判定，装载能力与货舱可用性参与判定。
- 载具load目标订单及原按钮进入既有接近/施法/事件流程；普通单位smart右键运输机使用搭乘订单，追踪正在移动的载具、按范围靠近，并使用同一真实装载消费者。货舱间隔限制连续进入，停止/移动/新命令取消未完成搭乘。
- 乘员保留原句柄、归属、成长、库存、人口和持续状态。装载取消其已有战斗/施法/工作/路线，进入载具清单并同步坐标；世界模型/附件/小地图/选取/攻击/施法使用隐藏状态，普通世界订单和外来伤害不会命中舱内单位。持续buff、定时生命及生命/魔法恢复继续消费实际状态。
- IsUnitLoaded、IsUnitInTransport查询实际清单关系；GetTransportUnit、GetLoadedUnit从真实装载事件上下文读取。EVENT_PLAYER_UNIT_LOADED=51、EVENT_UNIT_LOADED=88由乘员产生，GetTriggerUnit为该乘员，运输机单独保留在上下文。未知native继续明确失败。
- unload目标订单或点击乘员图标单独卸下，unloadall位置订单接近指定地面后开始逐员卸载，按源货舱间隔继续；unloadallinstant立即释放。落点检查地图边界、地形、单位半径/占位；无法放下的乘员继续留舱。移动/停止/新命令取消普通卸载队列，原订单ID及回调重入由同一会话消费。
- 乘员死亡/移除会从清单解除；载具死亡/移除、货舱失效与容量下降有对应清理/释放入口。当前载具终止时为乘员查找合法落点，无落点时进入真实死亡/人口/事件流程，不遗留指向失效载具的隐藏单位。拥有 `Achd` 的载具死亡且乘员落地后附加不可驱散的 `Bchd` 减速状态，消耗源普通／英雄持续时间及移动／攻击恢复字段；状态影响实际移速、攻速及界面，并随时间恢复。移除载具或禁用能力不会触发该状态。恢复公式和释放位置仍需原版对照，自定义召唤单位伤害字段尚未实现。
- 原Load/UnLoad图标、Profile按钮位置/热键/提示及现有取消控件进入命令面板；满舱/空舱及不可用状态禁用相应操作。信息面板显示原乘员肖像、生命、格数与容量，点击调用同一unload命令；大于12格时分页。乘员事件删除/转让/改派命令后重新核查句柄和修订，界面在回调删除当前载具后不继续访问旧选中项。
- 纠缠金矿的 `Aenc` 使用源容量和实际 `Aegm` 采矿状态提供矿工面板；点击矿工肖像或目标卸载命令可逐个停止采集、查找合法落点并释放工人。操作通过现有单机／实验联机 `UnloadUnit` 命令，订单回调后重新核查矿井和工人。当前矿工关系仍使用采集状态而非普通运输清单，`IsUnitLoaded`、装载事件与原版关联尚待确认。
- 纠缠金矿源 `egol` 的 `Adri` 即时全部卸载使用相同的矿工清单和逐人合法落点，按钮及原订单入口共享现有施法流程；释放范围读取 `Aenc` 的 `Area` 并支持对象覆盖。空间不足时未能放下的工人继续采集。释放顺序、可用状态、回调时序与原版画面留待阶段对照。

## 原件与来源

源AbilityData、AbilityMetaData、UnitAbilities、UnitData、UnitMetaData、common.j、Profile和SimpleInfoPanel/ConsoleUI FDF的归档来源、SHA256及相关行保存在根tmp/docs-artifacts/war3/transport/source.json。原nzep能力为Sch3,Achd,Aloa,Adro，Sch3源8格/160范围/250区域/0.5秒间隔，原海军Sch5为10格。原UI的SimpleInfoPanelCargoDetail包含货舱标题及0.188宽度描述区；新增肖像网格与输入仍需窗口/原版布局验证。

Game.dll SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a。先前分析使用仓库固定Rizin 0.8.1 CLI，工具来源/版本/许可证沿用third_party/rea/rizin-source.json；后续使用REA的Rizin接口继续分析。RTTI定位CAbilityCargoHold、CAbilityCargoLoad、CAbilityCargoDrop及CAbilityCargoHoldDeath，保存13项局部指令记录；这只能证明原件类与局部调用，不能证明完整装载/死亡语义。分析摘要为同目录analysis-summary.json，原始字符串、RTTI和局部指令记录分别为rizin-strings.json、cargo-rtti.json及cargo-functions.jsonl。任务自己的分析进程已结束。

REA观察到 `CAbilityCargoHoldDeath` 的 `0x6f524220` 路径创建并附加 `Bchd` 状态，状态初始化和分发路径包含定时事件，证据 `ev_c4f3b854e1e7f8c0d1524a4843bd4d1a4ccac45f7c0e157afa4a53d94c077411`、`ev_e69afb46858de783bf466fbd2e49af3f6fb6bf09f80a1f3072f56b359e29664e`。静态观察尚不能证明载具死亡如何触发、乘员落点、伤害、生存或计时次序；继续以原版行为或调用链核对，现有基础释放规则不等于原版坠毁。 固定版只读指令进一步显示 `0x6f53a2a0` 构造 `CBuffCargoHoldDeath`，`0x6f524220` 调用其初始化 `0x6f5400e0` 并向单位附加状态；初始化中的数值变换及两组计时事件尚未完成语义识别。源表 `Achd` 的 DataA／DataB／DataC 分别标记移动升级频率、攻击升级频率和召唤单位伤害，不能直接据此推断坠毁规则。原始源表和调用链记录位于 `tmp/docs-artifacts/war3/transport/`。

原安装只读、MPQ直接读取，运行不链接或加载Game.dll；源资源、原始证据和复制夹具只保存在根tmp，不提交解包工程或派生资源。

## 必要检查与阶段合并

必要Win32 Release产品与新transport消费者编译通过。只运行flow模式最小运输流程，结果1通过/0失败、无Game.dll：原load与smart搭乘、真实事件及上下文、1+1+2格容量、原句柄随载具移动、舱内命令/伤害拒绝、单独及即时全部卸载。该流程不是完整运输、原版死亡规则、窗口或性能验收。

~~~powershell
cmake --build --preset release --target war3 war3_transport_tests --parallel 8
python tests/generate-transport-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_transport_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/transport/fixture.w3m" flow
~~~

capacity/lifecycle/orders模式已编译，尚未执行；阶段合并满舱/递归拒绝、普通卸载间隔/取消、乘员移除与载具终止、全等级/w3a/禁用/容量变化/多人联盟/所有权/事件重入/暂停/死亡/复活、阻挡/无落点/持续移动/源声音及真实窗口/鼠标/热键/肖像布局、三图长局/CPU/GPU/内存和切图释放。地洞驻军/射击和吞噬增量见[兽族货舱玩法](orc-cargo.md)。纠缠金矿需覆盖满矿、逐个释放、矿井消失／转让、能力禁用、自定义容量、订单回调重入、合法落点和实验联机回显，并与原版核对面板、事件及 IsUnitLoaded。原载具坠毁效果、海军浮航路径、驾驶员、金矿货舱与运输查询统一及完整运输AI仍待实现或核对。原版逐位/事件时序/资源释放与视觉精度不记为通过。

原始构建/流程记录位于根tmp/docs-artifacts/war3/transport/：build.log、delivery-build.log、final-build.log、queue-build.log、consumer-build.log、fixture-build.log及flow.log。完整客户端和旧MEngine延期队列保持开放。

## 登艇路径

乘员接近运输单位时，保留终点仍在当前登艇范围、地形阻挡版本未变的路线及绕行点。载具移动使终点超出范围或地形阻挡变化时重新寻路；载具失效仍取消登艇命令，进入范围后沿用真实装载与事件流程。

Win32 Release 客户端及运输测试编译通过；`boarding-route` 1/1 覆盖绕行点保留、载具移动后重算、装载事件以及载具移除时清理；该夹具的步兵关闭单位路径碰撞。`flow` 1/1 覆盖既有装载、舱内行为、移动和卸载。BootyBay 地形的 `island-wave` 1/1 使用实际地面寻路接近飞艇，随后装载、飞往隔水岛并卸载；测试预先创建飞艇、指定编队和目的地，给步兵设无敌，不验证电脑自行购买和决定跨岛进攻。实机窗口、密集阻挡、运输目标变化、原版行为和联机待阶段验证。

原版官方 [飞艇说明](https://classic.battle.net/war3/neutral/goblins.shtml) 描述击毁后乘员幸存并受移动／攻击减速；固定版 `Achd` 数据的普通／英雄持续时间分别为 60／30 秒，移动与攻击恢复字段均为 10。当前使用与驱逐状态共用的分阶段恢复公式；具体恢复比例与步进、状态对象时序、障碍及水域落点仍需原版运行核对。
