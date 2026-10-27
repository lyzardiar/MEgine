# 影遁、Ghost与主动显形

Ashm/Sshm/Ahid、Agho、AIta/AHta、AIrv和AItb已连接实际会话、源字段与现有命令/库存/视野消费者。实现、最小运行检查及原版一致性分别记录；完整潜行、客户端和阶段测试队列仍开放。

## 实际玩法

- Ashm按昼夜、空闲和行动转换进入或退出影遁；Sshm复用Ashm原型，Ahid允许白天隐藏。DataA/B/C分别用于手动淡入、昼夜转换和行动后恢复。原ambush订单、按钮/热键、魔法/冷却、施法事件接入原能力流程。手动隐藏及其淡入期间停止自动索敌；明确移动、攻击、施法、工作取消隐藏。暂停冻结淡入，死亡/移除/隐藏/技能禁用或失效不继续提供隐形。
- Agho提供实际永久隐形，DataA参与自动索敌。DataB的变形免疫、DataC的建筑占地规则尚未连接对应完整玩法；二者不作为魔法免疫消费。原Shade同时保留自身真实视域，敌方仍需要视野与侦测才能看见它。
- AIta水晶球与AHta显形在目标位置提供有时限的地形视野和侦测，按源Area、Dur、DataA及玩家共享视野消费；AIrv提供有时限的全图视野和侦测。区域独立于施法单位移动，超时回收；显形状态不会把单位变成全局可见。
- AItb显形之尘对源目标关系/范围内单位应用Bdet。侦测跟随命中单位移动，各施放玩家计时独立，按普通/英雄源持续时间结束；死亡/状态移除释放对应视觉和侦测。源invulnerable目标与魔免目标不因通用法术筛选被排除。
- 物品接入原crys/dust/全图显形、真实次数、冷却、魔法和使用事件。crys的源uses=0表示无限使用，perishable字段不会独立造成拒绝或删除；有次数的dust仍逐次扣减，归零按源定义删除。无点使用水晶球、超距、冷却和失效持有者在扣费前拒绝。
- 新UnitUseItemPoint使用同一真实消费者。水晶球可选地面或小地图位置，右键/Esc及原取消控件结束目标模式，失去物品/持有者/控制权时清理目标状态。选取、模型/附件、小地图、攻击、施法和AI继续消费统一玩家可见性。

## 原件依据

源AbilityData、AbilityMetaData、Profile、ItemData、UnitAbilities和字段标签的归档来源/SHA256及行保存在根tmp/docs-artifacts/war3/stealth-reveal/source.json。原Shade包含Atru/Agho，原Archer包含Ashm；crys的uses=0/perishable=1，dust的uses=2。AIta源10秒/60秒冷却/900范围，AHta源15秒/180秒冷却/900范围并要求Rhse，AItb源20秒/20秒冷却/1000范围，AIrv源5秒全图。

REA已定位独立CAbilityShadowMeld、CAbilityGhost/CAbilityGhostVisible、CAbilityDetectAoe、CAbilityItemDetectAoe及CAbilityItemDetectByBuff类字符串；有限观察保存为同目录rea-evidence.jsonl。Game.dll SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，仅用于开发分析。Reveal/Dust缺少Profile Order时当前使用已注册detectaoe；该映射和原版底层GetOrder/时序尚未完成精确对照。

原件只读、归档直接读取，临时fixture与输出统一在根tmp；不生成地图解包工程，不提交原资源或原始验证产物。

## 检查与阶段队列

必要Win32 Release产品及新增消费者编译通过。flow最终1组通过/0失败，无Game.dll；初次前置断言把未探索遮罩当作已探索迷雾，已修正夹具断言并复测同条流程。原始记录为本地build.log、delivery-build.log、consumer-build.log、fixture-build.log、flow-masked-prerequisite.log及flow.log。flow只检查白天拒绝、夜间空闲/移动/恢复/白天解除、原Ghost、水晶球有点使用/侦测/地形视野/无限使用/冷却/到期和无Game.dll，不代表完整原版、UI、GPU或性能验收。

~~~powershell
cmake --build --preset release --target war3 war3_stealth_tests --parallel 8
python tests/generate-stealth-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_stealth_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m" flow
~~~

dust/meld/tower模式随实现编译，阶段合并执行：显形之尘移动/次数/到期、手动隐藏/自动索敌/明确行动、Ahid与技能移除、AHta研究/持续/冷却。继续合并多玩家/共享/暂停/死亡转让/回调重入、w3a/英雄/可用性/驱散、全图显形、真实窗口/鼠标/小地图/热键/特效/声音、三图长局/CPU/GPU/内存与切图释放。

风步增量见[机动与镜像](mobility.md)。潜地、中立Andt付费显形、完整变形/建筑阻挡、状态栏和声音仍待实现。DataB/C转换调度、Ahid条件、侦测类型/计数/范围边缘、订单/淡入/破隐/半透明材质和原版数值/事件精度保持待验收。
