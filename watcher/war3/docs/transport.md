# 原单位运输流程

原飞艇的基础装载、搭乘、移动和卸载已接入。实现以Acar货舱、Aloa装载、Adro卸载及Adri即时卸载原型为入口，连接实际单位句柄/容量/坐标/命令/事件/界面。完整运输、原版坠毁规则、海军及其他货舱玩法仍开放。

## 实际消费

- Sch3的Acar原型提供8格，Sch4/Sch5继续读取各自源容量/范围/区域/间隔。乘员从UnitData.cargoSize读取格数，普通单位/英雄为1，投石车为2；源ucar覆盖沿用ObjectData。容量不足、不能运输的类型、建筑/飞行单位、递归货舱、敌对关系、nonsapper和无敌目标限制在装载前检查，装载能力与货舱可用性参与判定。
- 载具load目标订单及原按钮进入既有接近/施法/事件流程；普通单位smart右键运输机使用搭乘订单，追踪正在移动的载具、按范围靠近，并使用同一真实装载消费者。货舱间隔限制连续进入，停止/移动/新命令取消未完成搭乘。
- 乘员保留原句柄、归属、成长、库存、人口和持续状态。装载取消其已有战斗/施法/工作/路线，进入载具清单并同步坐标；世界模型/附件/小地图/选取/攻击/施法使用隐藏状态，普通世界订单和外来伤害不会命中舱内单位。持续buff、定时生命及生命/魔法恢复继续消费实际状态。
- IsUnitLoaded、IsUnitInTransport查询实际清单关系；GetTransportUnit、GetLoadedUnit从真实装载事件上下文读取。EVENT_PLAYER_UNIT_LOADED=51、EVENT_UNIT_LOADED=88由乘员产生，GetTriggerUnit为该乘员，运输机单独保留在上下文。未知native继续明确失败。
- unload目标订单或点击乘员图标单独卸下，unloadall位置订单接近指定地面后开始逐员卸载，按源货舱间隔继续；unloadallinstant立即释放。落点检查地图边界、地形、单位半径/占位；无法放下的乘员继续留舱。移动/停止/新命令取消普通卸载队列，原订单ID及回调重入由同一会话消费。
- 乘员死亡/移除会从清单解除；载具死亡/移除、货舱失效与容量下降有对应清理/释放入口。当前载具终止时为乘员查找合法落点，无落点时进入真实死亡/人口/事件流程，不遗留指向失效载具的隐藏单位。Achd坠毁专属状态及其原版判定/时序尚未实现，不能将这一基础释放路径记作原版坠毁验收通过。
- 原Load/UnLoad图标、Profile按钮位置/热键/提示及现有取消控件进入命令面板；满舱/空舱及不可用状态禁用相应操作。信息面板显示原乘员肖像、生命、格数与容量，点击调用同一unload命令；大于12格时分页。乘员事件删除/转让/改派命令后重新核查句柄和修订，界面在回调删除当前载具后不继续访问旧选中项。

## 原件与来源

源AbilityData、AbilityMetaData、UnitAbilities、UnitData、UnitMetaData、common.j、Profile和SimpleInfoPanel/ConsoleUI FDF的归档来源、SHA256及相关行保存在根tmp/docs-artifacts/war3/transport/source.json。原nzep能力为Sch3,Achd,Aloa,Adro，Sch3源8格/160范围/250区域/0.5秒间隔，原海军Sch5为10格。原UI的SimpleInfoPanelCargoDetail包含货舱标题及0.188宽度描述区；新增肖像网格与输入仍需窗口/原版布局验证。

Game.dll SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a。当前REA接口没有可用的原Rizin后端，复用仓库已有固定Rizin 0.8.1 CLI读取，工具来源/版本/许可证沿用third_party/rea/rizin-source.json。RTTI定位CAbilityCargoHold、CAbilityCargoLoad、CAbilityCargoDrop及CAbilityCargoHoldDeath，保存13项局部指令记录；这只能证明原件类与局部调用，不能证明完整装载/死亡语义。分析摘要为同目录analysis-summary.json，原始字符串、RTTI和局部指令记录分别为rizin-strings.json、cargo-rtti.json及cargo-functions.jsonl。任务自己的分析进程已结束。

原安装只读、MPQ直接读取，运行不链接或加载Game.dll；源资源、原始证据和复制夹具只保存在根tmp，不提交解包工程或派生资源。

## 必要检查与阶段合并

必要Win32 Release产品与新transport消费者编译通过。只运行flow模式最小运输流程，结果1通过/0失败、无Game.dll：原load与smart搭乘、真实事件及上下文、1+1+2格容量、原句柄随载具移动、舱内命令/伤害拒绝、单独及即时全部卸载。该流程不是完整运输、原版死亡规则、窗口或性能验收。

~~~powershell
cmake --build --preset release --target war3 war3_transport_tests --parallel 8
python tests/generate-transport-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_transport_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/transport/fixture.w3m" flow
~~~

capacity/lifecycle/orders模式已编译，尚未执行；阶段合并满舱/递归拒绝、普通卸载间隔/取消、乘员移除与载具终止、全等级/w3a/禁用/容量变化/多人联盟/所有权/事件重入/暂停/死亡/复活、阻挡/无落点/持续移动/源声音及真实窗口/鼠标/热键/肖像布局、三图长局/CPU/GPU/内存和切图释放。原载具坠毁效果、海军浮航路径、地洞驻军/射击、吞噬、尸体货舱、驾驶员、金矿货舱与运输查询统一及完整运输AI仍待实现或核对。原版逐位/事件时序/资源释放与视觉精度不记为通过。

原始构建/流程记录位于根tmp/docs-artifacts/war3/transport/：build.log、delivery-build.log、final-build.log、queue-build.log、consumer-build.log、fixture-build.log及flow.log。完整客户端和旧MEngine延期队列保持开放。
