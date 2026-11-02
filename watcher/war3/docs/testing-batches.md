# 独立客户端测试队列

### 单位碰撞与创建批次结果

范围：`4940cfe`、`e2b1d90`、`05cdbda`。Win32 Release 客户端、commerce、map、corpse 与人族战役测试目标构建通过，日志未发现警告；commerce 输出 1 条 PASS，`campaign_elevator_surface`、corpse `flow` 和人族 `victory` 各 **1 通过、0 失败**，未加载 Game.dll。覆盖脚本定位避让活动单位、无寻路单位、失效类型／玩家创建、人口开关、尸体消费与复活，以及人族第六至第九章隔离链；日志位于 `tmp/docs-artifacts/war3/script-unit-collision-batch/`。密集单位性能、空地碰撞分类、原版最近点与事件时序、自然战斗及真实窗口仍待验证；下一功能批次从 0/3 计数。


### 无效单位人口开关（待功能批次验证，3/3）

路径：`src/session_food.cpp`、`tests/commerce_tests.cpp`。`SetUnitUseFood` 对空、已移除和类型不匹配的单位句柄无操作；有效单位继续更新人口和相关状态。原版 1.27 的 `0x6f1f7b40` 在单位解析失败后直接返回。合批运行 `war3_commerce_tests <data-root> <fixture>`，核对无效句柄不改变人口、有效英雄关停／恢复及正常训练；原版动态事件时序及其他单位状态待对照。本次未执行功能测试。


### 未知单位类型创建（待功能批次验证，2/3）

路径：`src/session_entities.cpp`、`src/session_corpses.cpp`、`tests/commerce_tests.cpp`。`CreateUnit`、`CreateUnitAtLoc` 和 `CreateCorpse` 对不存在的单位类型返回空句柄，尸体创建还校验玩家句柄，保持地图单位列表不变；有效类型沿用创建流程。原版 1.27 `CreateUnit` 经 `0x6f630f20` 调用对象创建，数据查找失败返回零；`CreateUnitAtLoc` 调用同一入口，`CreateCorpse` 的 `0x6f1ddab0` 在玩家或创建结果无效时返回零。合批运行 `war3_commerce_tests <data-root> <fixture>`，检查零／未知类型、无效玩家及有效训练流程，并回归尸体创建和战役脚本定位；自定义缺失基类和原版动态事件仍待对照。本次未执行功能测试。


### 脚本位置的单位碰撞（待功能批次验证，1/3）

路径：`src/session_entities.cpp`、`src/world.h`、`src/world_path.cpp`、`tests/map_tests.cpp`。启用寻路的单位通过脚本设置位置时，附近活动单位与地形、建筑占地一起参与落点选择；地面／空中单位按现有落点规则分别处理，无寻路单位继续使用脚本坐标。合批运行 `war3_map_tests <data-root> <scratch-directory> campaign_elevator_surface`，覆盖原图电梯附近的单位重叠、阻挡和无寻路行为，并回归战役传送；单位挤压顺序、密集群体、空地分类及原版动态时序仍待对照。本次未执行功能测试。


### 位置挤出与创建缩放批次结果

范围：`e58792a`、`31e7307`、`c015a92`，测试补充 `97c06ae`。Win32 Release 客户端、可破坏物、地图和人族战役测试目标构建通过，日志未发现警告。可破坏物 `invalid-handles` 输出 1 条 PASS、完整流程输出 2 条 PASS；原图 `campaign_elevator_surface` 与 `campaign_walkable_stairs` 各 **1 通过、0 失败**；`war3_human_campaign_chain_tests <data-root> <new-user-dir> victory` **1 通过、0 失败**，未加载 Game.dll。覆盖缩放上下限、电梯阻挡格中的单位／物品挤出、无寻路单位坐标、重叠占地排除、楼梯及人族第六至第九章隔离链。日志位于 `tmp/docs-artifacts/war3/elevator-nudge-batch/`。动态单位与物品相互碰撞、真实建筑移动、邻近点选择的原版精度、自然战斗、窗口和完整战役仍待验证；下一功能批次从 0/3 计数。


### 脚本移动单位的地形阻挡修正（待功能批次验证，3/3）

路径：`src/session_entities.cpp`、`src/world.h`、`src/world_path.cpp`、`tests/map_tests.cpp`。启用寻路的单位通过 `SetUnitPosition`／`SetUnitPositionLoc` 移动到阻挡位置时寻找附近可通行坐标，查询排除单位自身的建筑占地；禁用寻路的单位保留脚本指定坐标。原图电梯墙体调用 `NudgeObjectsInRect` 时，单位可离开新阻挡格。合批执行 `war3_map_tests <data-root> <scratch-directory> campaign_elevator_surface`、可破坏物及战役移动回归；单位之间碰撞、建筑重叠、极大障碍和原版动态时序仍待验证。


### 脚本移动物品的地形阻挡修正（待功能批次验证，2/3）

路径：`src/session_entities.cpp`、`tests/map_tests.cpp`。脚本设置物品位置时，目标被地形或静态占地阻挡则使用附近可通行位置；原图电梯墙体使用 `NudgeObjectsInRect` 重新设置物品坐标，避免物品留在墙中。原版 1.27 `SetItemPosition` 经 `0x6f63cc10` 进入位置处理；必要复现检查：Win32 Release 核心构建通过，原图阻挡格诊断中物品从 `(640,2176)` 移至 `(624,2160)`；日志 `tmp/docs-artifacts/war3/elevator-motion-probe/nudge-item-fixed.log`。单位位置修正尚待实现。合批运行 `war3_map_tests <data-root> <scratch-directory> campaign_elevator_surface` 并回归物品拖放；动态单位／物品碰撞、邻近位置选择和原版时序仍待对照。


### 可破坏物脚本创建缩放（待功能批次验证，1/3）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`。四个动态创建可破坏物的脚本入口将有限缩放限制在 0.1 至 10，有效范围内保持原值；地图预放置对象沿用来源数据。原版 1.27 `0x6f6a3833` 至 `0x6f6a3869` 对动态创建缩放执行同样的上下限处理。合批运行 `war3_destructable_tests <data-root> <fixture> invalid-handles`，覆盖负值、零、常规值和超上限；自定义对象、非有限数与实际画面待验证。本次未执行功能测试。


### 可破坏物与电梯批次结果

范围：`c647b4d`、`2ca0d0c`、`e4c70bf` 及测试补充 `7f69b86`。Win32 Release 客户端、可破坏物和地图测试目标构建通过；使用当前生成器生成隔离夹具后，可破坏物 `invalid-handles` 输出 1 条 PASS，完整流程输出 2 条 PASS；原图 `campaign_elevator_surface` 输出 **1 通过、0 失败**。覆盖失效查询、未知类型、变体索引、有效创建／事件／路径占用／采木和电梯动态表面；日志及夹具位于 `tmp/docs-artifacts/war3/destructable-elevator-batch/`。原版动态边界、自定义对象、单位实际上下电梯、真实窗口与完整战役仍待验证；下一功能批次从 0/3 计数。


### 可破坏物变体索引（待功能批次验证，3/3）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`。脚本动态创建可破坏物时，将超出来源变体数量的索引限制到最后一个变体；有效索引保持原值。原版 1.27 的 `0x6f6a3871` 读取变体数，`0x6f6a387f` 至 `0x6f6a3887` 以无符号比较限制索引。合批运行 `war3_destructable_tests <data-root> <fixture> invalid-handles`，覆盖负值、大索引及有效对象，同时执行原图电梯回归；零变体自定义对象和原版动态画面仍待对照。本次未执行功能测试。


### 未知可破坏物类型创建（待功能批次验证，2/3）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`。四个动态创建可破坏物的脚本接口在对象类型不存在时返回空句柄，不创建地图对象；已定义类型继续按原路径创建。原版 1.27 创建入口汇入 `0x6f6a3650`，查不到对象类型时在 `0x6f6a3ae8` 返回零。合批运行 `war3_destructable_tests <data-root> <fixture> invalid-handles`，检查普通／指定高度和存活／死亡四种创建方式以及有效对象回归；自定义对象覆盖与原版动态行为待验证。本次未执行功能测试。


### 无效可破坏物遮挡高度查询（待功能批次验证，1/3）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`、`tests/map_tests.cpp`。`GetDestructableOccluderHeight` 对空、已移除或类型不匹配句柄返回零，有效对象读取当前高度。原版 1.27 `0x6f1e2010` 在解析失败时返回零；原图 UndeadX07c 进行静音开场模拟时曾在该调用处中断。必要复现检查：Win32 Release 客户端构建通过，修复后原图隔离静音模拟完成开场并推进 600 秒，日志 `tmp/docs-artifacts/war3/UndeadX07c-fixed/session.log`。合批运行 `war3_destructable_tests <data-root> <fixture> invalid-handles` 和 `war3_map_tests <data-root> <scratch-directory> campaign_elevator_surface`，验证失效／有效对象、原图电梯动态高度及站立单位；实际单位上下平台、窗口及完整战役仍待验证。


### 随机池选择与存档批次结果

范围：`659547b`、`a4eda12`、`f83996f`。Win32 Release 客户端及 `war3_clock_tests` 构建通过，构建日志未发现警告；`WAR3_CLOCK_FILTER=recovery_bundle_restores_random_pools` 输出 **1 通过、0 失败**，覆盖非空全零池的首项回退与随机状态、`-1` 类型回退、未知单位／物品类型、有限负权重和存档恢复。日志位于 `tmp/docs-artifacts/war3/random-pool-fidelity-batch/`。原版正负权重动态序列、浮点边界、非有限数及真实地图仍待对照；下一功能批次从 0/3 计数。


### 随机池有限负权重与存档（待功能批次验证，3/3）

路径：`src/session_game.cpp`、`tests/clock_tests.cpp`。随机池允许脚本写入有限负权重，并在存档中保留；选择沿用权重累计和首项回退规则。原版 1.27 的单位池／物品池添加实现 `0x6f209ad0`／`0x6f2098a0` 直接存储传入权重。合批运行 `WAR3_CLOCK_FILTER=recovery_bundle_restores_random_pools war3_clock_tests <data-root> <output-root>`，检查负权重保存／恢复、选择和前两项回归；原版负权重动态结果及非有限数仍待对照。本次未执行功能测试。


### 随机对象池的未知类型（待功能批次验证，2/3）

路径：`src/session_game.cpp`、`tests/clock_tests.cpp`。随机单位池或物品池选中不存在的对象类型时返回空句柄，保留已推进的随机状态；有效类型沿用创建流程。原版 1.27 的 `0x6f63a040` 与 `0x6f65a140` 在对象数据创建失败时返回空。合批运行 `WAR3_CLOCK_FILTER=recovery_bundle_restores_random_pools war3_clock_tests <data-root> <output-root>`，检查未知类型不创建实体和正常随机池恢复；原版动态随机状态、地图自定义对象覆盖待验证。本次未执行功能测试。


### 随机对象池的权重回退（待功能批次验证，1/3）

路径：`src/session_game.cpp`、`tests/clock_tests.cpp`。非空随机单位池和物品池按源权重累计选择；没有命中区间或选中 `-1` 时回退首项，全零权重也推进随机状态。原版 1.27 对应实现为 `0x6f222820`／`0x6f222910`，随机数调用位于 `0x6f8806a0`。合批执行 `WAR3_CLOCK_FILTER=recovery_bundle_restores_random_pools war3_clock_tests <data-root> <output-root>`，检查全零池、回退、随机状态及存档恢复；正权重边界和原版动态序列仍需对照。本次未执行功能测试。


### 脚本物品与随机池批次结果

范围：`529dfb7`、`e662931`、`7acb4cc`。Win32 Release 客户端、`war3_commerce_tests` 和 `war3_clock_tests` 构建通过，构建日志未发现警告；commerce 输出 1 条 PASS，clock 的 `recovery_bundle_restores_random_pools` 输出 **1 通过、0 失败**。覆盖无物品栏单位与英雄拾取金币箱、随机池失效句柄、玩家句柄、重复类型权重及恢复后的选择。日志位于 `tmp/docs-artifacts/war3/item-pool-batch/`；原版动态事件、零槽位及自定义物品栏能力、其他随机权重和真实窗口仍待对照。下一功能批次从 0/3 计数。


### 随机对象池重复类型权重（待功能批次验证，3/3）

路径：`src/session_game.cpp`、`tests/clock_tests.cpp`。向单位池或物品池重复添加同一类型时更新其权重，保留原有顺序；新增类型继续加入池尾。原版 1.27 的 `0x6f209ad0` 和 `0x6f2098a0` 查找到相同类型后直接覆盖权重。合批运行 `war3_clock_tests` 的 `recovery_bundle_restores_random_pools`，以零权重覆盖检查有效选择及存档恢复，并运行本批 commerce 回归；其他权重与原版随机序列仍需对照。本次未执行功能测试。


### 随机对象池失效句柄（待功能批次验证，2/3）

路径：`src/session_game.cpp`、`tests/clock_tests.cpp`。随机单位池与物品池的销毁、添加、移除和放置接口对空、销毁或类型不匹配的对象池安全返回；随机单位放置还检查玩家句柄。原版 1.27 对应入口在句柄解析失败后直接返回，包括 `0x6f1fb070`、`0x6f1e9980`、`0x6f1f1d00` 和 `0x6f1f1cc0`。合批运行 `war3_clock_tests` 的 `recovery_bundle_restores_random_pools`，核对失效句柄、有效随机序列和恢复；原版随机权重与动态时序仍需验证。本次未执行功能测试。


### 脚本给予物品的物品栏能力检查（待功能批次验证，1/3）

路径：`src/session_inventory.cpp`、`tests/commerce_tests.cpp`。`UnitAddItem` 要求单位具有可用的物品栏能力；没有物品栏的单位不能通过脚本直接消耗立即生效的物品。原版 1.27 的 `UnitAddItem` 和 `UnitInventorySize` 均先检查相同的单位物品栏对象（`0x6f6518d0`）。合批运行 `war3_commerce_tests <data-root> <commerce-fixture>`，检查无物品栏单位、英雄和金币箱；零槽位、自定义能力及原版动态事件仍需对照。本次未执行功能测试。


### 游戏内存档界面批次记录（窗口待验证）

范围：`59854b4`、`f8535cc`、`d52aff0`。Win32 Release 客户端编译通过，批次差异格式检查通过；构建日志 `tmp/docs-artifacts/war3/save-dialog-ui-batch/build.log`。本批没有执行功能用例，不计为功能测试通过。

实际窗口验证未执行：当前会话的 D3D9 HAL／参考设备在能力与显示模式查询时返回 `0x8876086c`，D3D9Ex／D3D9On12Ex 不可用；已有记录 `tmp/docs-artifacts/war3/human-night-probe/ui.log`、`ui-reference.log`。仍需在可用显示会话验证更换选择／编辑清理错误、删除失败后键盘焦点、列表中途读取失败，以及正常保存与读取；这些待测项保留在队列。下一功能批次从 0/3 计数。


### 存档列表读取失败时清理结果（待功能批次验证，3/3）

路径：`src/game_flow_ui.cpp`。游戏内存档列表读取中途失败时清空已收集的部分结果并显示错误，与主菜单存档列表一致；不会默认选中不完整列表中的文件。合批验证目录读取失败／超过列表上限、空列表焦点和错误显示，以及正常存档选择；本次仅差异检查，未执行窗口测试。


### 删除存档失败后的键盘焦点（待功能批次验证，2/3）

路径：`src/game_flow_ui.cpp`。游戏内删除存档失败时返回保存界面并将焦点恢复到名称输入框，保留错误提示，键盘可继续输入或取消。合批验证文件在确认前被替换／移除导致删除失败、焦点、输入与重试，以及真实窗口显示；本次仅差异检查，未执行窗口测试。


### 存档界面更新错误提示（待功能批次验证，1/3）

路径：`src/game_flow_ui.cpp`。游戏内存档／读档界面在选择另一份存档或修改存档名称时清除旧错误提示；未更改选择或名称时保留提示。合批验证坏存档后更换选择、名称错误后编辑、输入中代理对与同项重复选择，以及真实窗口文本布局；本次仅差异检查，未执行窗口测试。


### 脚本目标订单批次结果

范围：`209c250`、`9faf65c`、`e50dd7e`。Win32 Release 客户端、order queue、spell 和 commerce 程序构建通过；order queue 使用原图 Booty Bay 输出 36 项通过、0 失败，spell 消费者 1 项通过，commerce 消费者 1 项通过，共 **38 通过、0 失败**。覆盖失效目标、未知名称／零编号、地面物品换格失败时保留队列，以及已有技能、物品和实验联机订单。既有测试局部变量遮蔽警告仍存在；日志与新生成技能夹具位于 `tmp/docs-artifacts/war3/target-command-batch/`，交易夹具为 `tmp/docs-artifacts/war3/commerce-current/commerce.w3m`。

非零未知编号、有效但不适用的订单、原版动态事件时序、实际窗口和联机互通仍待验证。下一功能批次 0/3。


### 无效物品栏目标订单保留队列（待功能批次验证，3/3）

路径：`src/session_combat_orders.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。脚本物品栏目标订单在清除排队命令前检查目标物品是否持有和槽位是否有效；地面物品或无效槽位返回 false 并保留队列。原版 `UnitDropItemSlot` 在调用目标订单前检查持有与容量，直接目标订单的动态时序待对照。合批运行 order queue、物品交易及目标技能回归。本次提交前未执行功能测试。


### 未知脚本目标订单保留队列（待功能批次验证，2/3）

路径：`src/session_combat_orders.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。脚本 `IssueTargetOrder` 遇到无法解析的名称或 ById 遇到零订单时返回 false，不清除已有排队动作。原版 1.27 目标订单派发 `0x6f1e9710` 先查询订单定义，查无定义时不进入后续派发。合批运行 order queue、目标技能与物品回归；其他非零未知编号、有效但不可执行订单及原版动态时序待验证。本次未执行功能测试。


### 失效目标订单保留队列（待功能批次验证，1/3）

路径：`src/session_combat_orders.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。脚本 `IssueTargetOrder`／ById 在单位或目标句柄失效时返回 false，不清除已有排队动作；有效单位、物品与可破坏物继续走原订单逻辑。原版 1.27 的 `0x6f1e96c0` 在单位或目标解析失败时直接返回。合批运行 order queue、目标技能与物品回归；有效目标但订单失败及原版动态时序仍待验证。本次未执行功能测试。


### 物品命令验证批次结果

范围：`9e9fb42`、`078f16d`、`1dccf29`，含测试变量补充 `c87137f`。Win32 Release 客户端、order queue、commerce 和 consumption 程序构建通过；order queue 使用原图 Booty Bay 输出 35 项通过、0 失败，commerce 消费者 1 项通过，consumption `protection` 1 项通过，共 **37 通过、0 失败**。覆盖脚本物品栏目标订单、空／地面物品及非法槽位不覆盖排队命令、即时目标／点订单、物品转移和交易。构建中的既有局部变量遮蔽警告仍存在；日志 `tmp/docs-artifacts/war3/item-command-batch/`，交易夹具 `tmp/docs-artifacts/war3/commerce-current/commerce.w3m`、消耗品夹具 `tmp/docs-artifacts/war3/eat-magic/fixture.w3m`。

原版动态失败／事件时序、其他玩家持有的物品、各种物品能力组合、实际窗口和联机互通仍待验证。下一功能批次 0/3。


### 即时丢弃订单的物品归属（待功能批次验证，3/3）

路径：`src/session_inventory.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。即时点／目标丢弃订单在清除排队命令前确认物品由发令单位持有；空、地面或其他单位持有的物品返回失败并保留队列。原版即时点订单 `0x6f1e9140` 在派发前检查订单可用性，专用丢弃入口先校验物品持有关系；原版动态队列时序待对照。合批运行 order queue、物品交易及相关队列回归。本次提交前未执行功能测试。


### 无效物品操作保留排队命令（待功能批次验证，2/3）

路径：`src/session_inventory.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。脚本物品使用和丢弃入口在清空排队命令前检查单位、物品持有关系，以及丢弃槽位／目标；无效或非持有物品不破坏排队命令。原版 1.27 在 `0x6f1fb430`、`0x6f1fac20` 等入口先验证句柄和物品归属再派发订单。合批运行 order queue 与 commerce 回归，检查有效操作、空／地面物品和槽位；原版动态事件及联网待验证。本次未执行功能测试。


### 脚本物品栏目标订单（待功能批次验证，1/3）

路径：`src/session_combat_orders.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。脚本 `IssueTargetOrderById` 使用 852002–852007 和持有物品时，按槽位交给已有物品换格消费者。原版 1.27 的 `UnitDropItemSlot` 在 `0x6f1facd0` 使用同一编号并调用目标订单入口。合批运行 order queue 和物品交易回归，核对持有／地面物品、槽位、队列及事件；原版动态时序和多人待验证。本次未执行功能测试。


### 存档身份与即时物品订单批次结果

范围：`fda84b4`、`f4632e5`、`f0312f6`，含补充 `7d8eab4`、`85185bd`。Win32 Release 客户端、order queue、clock 和 commerce 程序构建通过。`war3_order_queue_tests <data-root> <BootyBay.w3m>` 输出 34 项通过、0 项失败，覆盖失效目标、不能接收物品的单位、物品目标点回退及既有队列和实验联机订单；clock 的 `save_game_writes_checkpoint_and_preserves_caller`、`recovery_bundle_restores_active_ai` 各 1 项通过，commerce 消费者 1 项通过，共 **37 通过、0 失败**。日志位于 `tmp/docs-artifacts/war3/checkpoint-item-batch/`，commerce 使用 `tmp/docs-artifacts/war3/commerce-current/commerce.w3m`。

脚本加载请求的摘要及同名文件替换拒绝在隔离会话中通过；战役窗口的异步加载交接、物品／可破坏物目标的原版接受条件、动态事件时序、实际窗口和联网行为仍待验证。下一功能批次 0/3。


### 物品目标订单的位置回退（待功能批次验证，3/3）

路径：`src/session_inventory.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。即时物品订单及 `UnitDropItemTarget` 对无法接收物品的目标尝试目标位置丢弃，物品／可破坏物使用当前位置；单位命令或生命周期回调变化后不发出过期回退。原版 1.27 `0x6f1e9285`–`0x6f1e92c9` 先检查目标订单并在不通过时检查目标位置的点订单。合批运行 order queue、存档 clock 及相关物品／命令回归；原版具体接受条件、事件时序、地图动态目标和实际窗口待验证。本次提交前未执行功能测试。


### 即时物品订单失效目标（待功能批次验证，2/3）

路径：`src/session_inventory.cpp`、`tests/order_queue_tests.cpp`、`docs/instant-orders.md`。`IssueInstantTargetOrder` 和 ById 的物品移动目标已移除或失效时按空目标使用发令单位当前位置，继续由现有物品丢弃流程处理。原版 1.27 入口 `0x6f1e91f0` 在目标句柄解析为空时读取发令单位位置；合批运行 order queue 物品及即时订单场景，核对字符串／ID、失效目标、队列与物品状态；有效非单位目标及原版动态时序待验证。本次未执行功能测试。


### 脚本加载请求固定检查点（待功能批次验证，1/3）

路径：`src/session_campaign.cpp`、`src/campaign_browser.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。脚本 `LoadGame` 与战役地图加载入口使用同一次检查结果传递地图和检查点文件摘要，复用加载阶段的摘要校验，防止准备期间同名存档变化导致加载其他内容。新增脚本加载选定后替换同名文件的拒绝用例；合批运行 clock `save_game_writes_checkpoint_and_preserves_caller`、检查点地图解析与加载切换相关回归；窗口交接、原版格式和脚本加载时序待验证。本次未执行功能测试。


### 原图人族对暗夜精灵隔离观察

在 `6e3b99f` 对应的 Win32 Release 代码上使用原图 Booty Bay，启动静音人族与暗夜精灵 AI，模拟时间约 2,460 秒人族获胜；双方在对局中完成采集、建造、训练和交战。探针与日志位于 `tmp/docs-artifacts/war3/human-night-probe/`。此观察覆盖单次隔离对局，不代表原版策略、数值或完整玩法一致。

同一机器尝试启动客户端窗口，D3D9 HAL 与参考设备均在能力／显示模式查询处返回 `0x8876086c`，D3D9Ex 与 D3D9On12Ex 不可用；本次未获得游戏画面。记录 `tmp/docs-artifacts/war3/human-night-probe/ui.log`、`ui-reference.log`。实际窗口、UI 和画面对照仍待可用显示会话验证。此观察不计入功能批次。


### AI 自动战斗撤退批次结果

范围：`e3de08c`、`643244e`、`64ebb4a`，含证据记录 `c077f41`、`edd7a96`。Win32 Release 客户端、CampaignAI、clock 和 AI 控制检查程序构建通过。CampaignAI `retreat-auto-cycle`、`retreat-auto`、`retreat-removal`、`retreat-retry`、`retreat-reentrant`、`retreat-reinforce`、`captain-home`、`armies` 各 2 项通过；`island-auto-retreat`、`island-flight-captain-home`、`island-flight-retreat-paused`、`island-flight-retreat-paused-reassign`、`island-naval-offshore-retreat`、`island-naval-enemyshore-retreat` 各 1 项通过；clock `recovery_bundle_restores_active_ai` 1 项及 AI 控制 4 项通过，共 **27 通过、0 失败**。覆盖自动索敌与目标失效、显式改派、单位移除／易主、快照和运输撤退。日志位于 `tmp/docs-artifacts/war3/ai-auto-retreat-batch/`。

原图 Booty Bay 静音双 AI 隔离对局推进到模拟时间约 2,220 秒，兽族胜利、不死族失败；之前相同隔离场景在 4,200 秒仍因自动追击导致撤退停滞。探针按原策略运行到胜负，日志 `tmp/docs-artifacts/war3/ai-auto-retreat-batch/duel.log`。这是单地图、单种族组合和单次模拟，真实窗口操作、其他地图及种族、原版时序和联机尚待验证。下一功能批次 0/3。


### AI 连续自动战斗的撤退跟踪（待功能批次验证，3/3）

路径：`src/session_combat.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。自动索敌、目标失效及守卫自动返回更新有效撤退跟踪的轮次；如果显式命令或回调已经改变轮次，不接续过期跟踪。合批运行 `retreat-auto-cycle`、`retreat-auto`、`retreat-retry`、`retreat-reentrant`、`retreat-reinforce`、`retreat-removal`、战斗及运输撤退回归，重跑 Booty Bay 双 AI 隔离对局；原版时序与联机待验证。本次提交前未执行功能测试。


### AI 自动索敌后的撤退恢复（待功能批次验证，2/3）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。撤退队员自动索敌造成单次战斗轮次变化时保留跟踪，离家超过 350 时继续回家；显式新订单仍取消跟踪。合批运行 `retreat-auto`、`retreat-retry`、`retreat-reentrant`、`retreat-reinforce`、`retreat-removal` 和运输撤退回归，并重跑原图长局定位；原图 Booty Bay 隔离探针确认远处队员与基地地面连通，队员自动索敌后撤退跟踪消失并向目标追击；证据见 `tmp/docs-artifacts/war3/ai-retreat-ground-batch/tracking.log` 和 `timeline.log`。多次连续战斗变化、复杂回调、原版时序和联机待验证。本次未执行功能测试。


### AI 队员移除与撤退跟踪清理（待功能批次验证，1/3）

路径：`src/session_food.cpp`、`src/session_ownership.cpp`、`tests/campaign_ai_tests.cpp`。单位移除时立即清除队长／防守／自杀队伍成员、撤退命令和队长路线成员引用；易主时同时清除撤退命令跟踪，避免这些地面队伍引用残留在 AI 快照中。合批运行 `retreat-removal`、`retreat-retry`、`armies`、AI 快照及所有权／载具相关回归；单位移除回调重入、运输中的移除与完整对局仍待验证。本次未执行功能测试。


### AI 地面撤退与增援批次结果

范围：`3833572`、`de4d9b5`、`59da213`，含快照补充 `67f54cf`、`07618e0`。同一版本的 Win32 Release 客户端、CampaignAI 和 clock 构建通过。CampaignAI `retreat-retry`、`retreat-reinforce`、`retreat-reentrant`、`captain-home`、`armies` 各 2 项通过；`island-auto-retreat`、`island-boarded-retreat-home`、`island-flight-captain-home`、`island-flight-retreat-paused`、`island-flight-retreat-paused-reassign`、`island-naval-offshore-retreat`、`island-naval-enemyshore-retreat` 各 1 项通过；clock `recovery_bundle_restores_active_ai` 1 项通过，共 **18 通过、0 失败**。覆盖暂停后撤退、增援归队、发令回调改派、生成的 v1 和 v2 AI 状态恢复及载具撤退。日志和新增夹具位于 `tmp/docs-artifacts/war3/ai-retreat-ground-batch/`，运输夹具为 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`，构建日志为 `tmp/docs-artifacts/war3/retreat-ground-build.log`。原版 Booty Bay 静音双 AI 隔离对局运行至模拟时间 4,200 秒仍无胜负：兽族 37 单位、13 建筑，7 名队长队员停在远离基地的区域，撤退状态仍阻塞进攻脚本；探针在终点采集信息时执行了扩张及生产查询，不能据此判定完整对局行为。日志 `tmp/docs-artifacts/war3/ai-retreat-ground-batch/duel.log`。跨区域撤退、原版分类与动态时序、真实历史 v1 快照和联机仍待验证。下一功能批次 0/3。


### AI 撤退发令回调改派（待功能批次验证，3/3）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`、`docs/ai.md`。群体撤退发令前记录队员命令轮次，单个队员的发令回调若改派其他队员，不覆盖其新命令。重生成 CampaignAI 夹具，合批运行 `retreat-reentrant`、`retreat-reinforce`、`retreat-retry`、`captain-home`、`armies`、AI 快照及运输撤退回归；同时检查嵌套队长命令和成员生命周期。原版动态时序与实际长局待验证。本次提交前未执行功能测试。


### AI 撤退增援归队（待功能批次验证，2/3）

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。撤退期间新加入且空闲的队长队员向家移动并跟踪命令轮次，保留已有订单；重试及回调保护与原队员一致。合批运行 `retreat-reinforce`、`retreat-retry`、`armies`、`captain-home` 和运输撤退回归；实际对局、跨区域、编组重入与原版时序待验证。本次未执行功能测试。


### AI 地面撤退恢复（待功能批次验证，1/3）

路径：`src/ai.h`、`src/session_ai.cpp`、`src/session_ai_snapshot.cpp`、`tests/campaign_ai_tests.cpp`、`tests/clock_tests.cpp`、`docs/ai.md`。AI 快照 v2 保存撤退跟踪并兼容 v1，新增生成旧版快照的恢复用例；撤退时跟踪有效地面队员的命令轮次，对暂停恢复或寻路暂时失败且仍空闲的队员重试回家，保留后续新命令。合批编译客户端和 CampaignAI，运行 `retreat-retry`、`captain-home`、`armies`、AI 状态快照及运输撤退回归；核对回调改派、失效成员、寻路和不可连通区域。原版动态时序与跨岛撤退待验证。本次未执行功能测试。


### 英雄令牌清理与 AI 时间批次结果

范围：`e345dcf`、`2d10f9f`、`8276901`，含测试补充 `7aa9390`、`73590df`、`3d5313e`。Win32 Release 客户端、CampaignAI、revival、commerce 和 clock 构建通过。CampaignAI `hero-cost`、`hero-token`、`hero-token-cleanup`、`produce-zero`、`produce-many`、`produce-owner`、`produce-replacement`、`produce-builder` 各 2 项通过，`startup` 1 项；revival 4 项、commerce 1 项、clock 生产快照 1 项通过，共 **23 通过、0 失败**。覆盖祭坛死亡／移除返还与防重复、价格查询不写入缺省状态、已有英雄复活时间、生成的 v1 队列恢复及 v2 令牌退款。日志位于 `tmp/docs-artifacts/war3/hero-token-cleanup-batch/`。

首轮构建发现测试夹具试图修改只读配置，修正后构建及功能测试通过；测试局部变量遮蔽警告修正后仅重新编译 clock 目标，语义不变的通过结果复用。历史真实 v1 文件、英雄令牌转让归属、原版死亡／移除及查询时序、实际窗口和联机仍待验证。下一功能批次 0/3。


### AI 英雄生产时间查询（待合批验证，3/3）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。`GetUnitBuildTime` 对己方已有英雄返回按等级和源参数计算的复活时间；未持有英雄或未知单位返回零，普通单位沿用源训练时间。原版 1.27 的 `0x6f890700` 将英雄查询交给 `0x6f89ba40`，后者按类型查玩家英雄，调用使用 `ReviveTimeFactor` 的 `0x6f40f5f0`，未找到返回零。合批运行 `hero-cost`、`hero-token-cleanup`、`hero-token`、clock 生产快照及生产／复活回归；多个同类型英雄、原版动态精度和联机待验证。本次提交前未执行功能测试。


### 英雄令牌价格只读查询（待功能批次验证，2/3）

路径：`src/session_ai_natives.cpp`、`src/session_commerce.cpp`、`src/session_production.cpp`、`tests/campaign_ai_tests.cpp`。AI 费用及命令按钮读取未设置的英雄令牌时不创建玩家状态；普通训练、购买和队列取消不再因读取令牌写入默认值。合批运行 `hero-cost`、`hero-token`、生产与商店回归，核对状态缺省、显示和费用；真实窗口及多人同步待验证。本次未执行功能测试。


### 生产队列旧版快照回归（待功能批次验证）

路径：`tests/clock_tests.cpp`。在同一生产队列夹具生成 v1 格式并恢复，检查普通队列与未记录的令牌标记默认值；合批执行 clock `production_snapshot_restores_paid_queue_rally_and_tickets`，并回归 v2 令牌退款。此测试补充不单独计入功能任务，本次未执行。

### 祭坛死亡与移除返还英雄令牌（待功能批次验证，1/3）

路径：`src/session_callbacks.cpp`、`src/session_food.cpp`、`tests/campaign_ai_tests.cpp`。生产建筑死亡或被移除时，清理队列并返还已预留的英雄令牌；死亡后再移除不重复返还。状态先完成更新，资源事件若重入并修改令牌则不再发出过时通知。合批运行 CampaignAI `hero-token-cleanup`、`hero-token`、生产／复活与状态回调回归；原版销毁／移除和转让动态时序、完整对局及联机仍待验证。本次未执行功能测试。


### 免费英雄令牌批次结果

范围：`1f70769`、`e671ce3`、`41e505c`。Win32 Release 客户端、CampaignAI、revival、commerce 和 clock 目标构建通过。CampaignAI `hero-cost`、`hero-token`、`produce-zero`、`produce-many`、`produce-owner`、`produce-replacement`、`produce-builder` 各 2 项通过，`startup` 1 项通过；revival 4 项、clock 的 `production_snapshot_restores_paid_queue_rally_and_tickets` 1 项及 commerce 消费者 1 项通过，共 **21 通过、0 失败**。覆盖令牌费用查询、祭坛训练／取消、商店购买／按钮和队列快照恢复；原图 Booty Bay 静音隔离会话在 900 秒存在先知和牛头人酋长，未发生胜负。日志在 `tmp/docs-artifacts/war3/hero-token-batch/`。

已知缺口：建筑死亡或移除时直接清空生产队列，目前不会返还队列中的英雄令牌；建筑转让后的令牌归属与退款、v1 快照兼容、商店事件重入、原版事件时序、实际窗口和联机还需检查。复活英雄继续使用单独费用；本批不代表完整英雄生命周期通过。下一功能批次 0/3。


### 免费英雄购买与命令价格（待合批验证，3/3）

路径：`src/session_commerce.cpp`、`tests/campaign_ai_tests.cpp`。祭坛训练和单位商店的英雄按钮按拥有者令牌显示零金币／木材并使用相同费用检查；购买新英雄时扣除令牌，不扣金币／木材。死亡英雄复活使用既有独立费用。固定版 1.27 `0x6f5683a6` 按状态 3 产生零费用与令牌标记，`0x6f58b8ff` 消费标记。合批运行 CampaignAI `hero-token`／`hero-cost`、commerce、revival 和生产快照；原版实际窗口、商店事件重入、建筑死亡／转让和局域网仍待对照。本次提交前未执行功能测试。


### 祭坛免费英雄训练（待功能批次验证，2/3）

路径：`src/commerce.h`、`src/session_production.cpp`、`src/session_network_identity.cpp`、`tests/campaign_ai_tests.cpp`、`tests/clock_tests.cpp`。祭坛训练新英雄时预留英雄令牌并免除金币／木材费用，取消退还；队列快照 v2 保存令牌标记并保留 v1 读取，联机校验包含标记。原版 1.27 `0x6f3dc221` 检查状态 3 并生成零费用及令牌标记，`0x6f3eefd1` 扣除，`0x6f3dd9d6` 按标记返还。合批运行 CampaignAI `hero-token`／`hero-cost`、clock 生产快照和英雄复活回归；命令按钮费用、商店英雄、建筑死亡／转让、原版动态时序及实际对局仍待验证或接入。本次未执行功能测试。


### AI 免费英雄费用查询（待功能批次验证，1/3）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。玩家英雄令牌大于零时，AI 查询大写首字节英雄 ID 的金币与木材价格返回零，查询不消费令牌；其他单位按源价格，未知单位价格返回零。原版 1.27 `0x6f890800`／`0x6f890860` 检查英雄 ID 与玩家状态槽 `+0x70`；`GetPlayerState` 的状态 3 映射至该槽。合批运行 CampaignAI `hero-cost` 和相关生产回归；令牌在实际训练、取消与购买中的完整消费尚未接入，原版动态时序及实际对局待验证。本次未执行功能测试。


### 经济拥堵批次结果

范围：`8335349`（补充 `4bc3c32`）、`64a0998`、`98a3c4f`。Win32 Release 客户端、movement avoidance 和 harvest 目标构建通过。原 Booty Bay 地图的 `worker-march`、`worker-return`、`workers`、`march`、`yield`、`compact`、`retreat`、`chase`、`approach`、`sealed` 各 1 项通过；采集夹具的 `depot-stuck`、`depot-route`、`stunned`、`mine-paused` 和默认流程各 1 项通过，共 **15 通过、0 失败**。覆盖采集／进军混合让行、创建顺序、携资源优先、受阻回收入口重选、订单和资源保留，以及相关移动与采集回归。日志位于 `tmp/docs-artifacts/war3/economy-congestion-batch/`。

Booty Bay 兽族对不死族静音隔离对局运行至 4,200 秒仍未结束；兽族金币在 1,500／1,800 秒分别为 854／2,643，原基地金矿在最终快照已耗尽。先前探针在 3,000–4,200 秒金币停留 381 且原矿尚有 2,640；两次对局因路径变化而分叉，不能把结果归因于某一项修改。当前对局在 3,000–4,200 秒资源与部队数量再次不变，未能验证完整对局。实际窗口、原版让行／入口时序、密集单位性能及联机同步仍待验证；下一功能批次 0/3。


### 受阻返还路线重选入口（待合批验证，3/3）

路径：`src/session.h`、`src/session_harvest.cpp`、`tests/harvest_tests.cpp`。携资源返回建筑的工人持续停滞 8 秒后，按单位与时间选择其他入口并重新规划；无有效路线时保留原路线，保留订单、资源和回收建筑。合批运行 harvest `depot-stuck`、`depot-route` 与采集回归、movement 避让批次和原图经济探针；入口选择、动态阻挡、反复拥堵、大规模性能及原版时序待验证。本次提交前未执行功能测试。


### 携资源工人的拥堵优先级（待功能批次验证，2/3）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。两个采集工人相互停滞时，携资源返回的工人优先于正在前往采集的工人；同阶段继续以句柄确定让行方。让行仍保留原订单、路线和资源，受保护单位不参与。合批运行 `worker-return`、`worker-march`、`workers`、`yield` 和经济探针；金币／木材交付、双向密集拥堵、原版让行及联机待验证。本次未执行功能测试。


### 采集工人与进军单位的拥堵让行（待功能批次验证，1/3）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。采集途中受阻时，符合既有限制且持续停滞的同属进军单位可让出短距离，保留双方原订单和路线；敌方、暂停、保持位置及其他受保护状态继续按既有规则处理。Booty Bay 4,200 秒隔离诊断发现多名携金工人与停滞进军单位相互拥堵，金矿仍剩 2,640；日志 `tmp/docs-artifacts/war3/ai-production-next-batch/congestion.log`。合批运行 movement `worker-march`（两种创建顺序）、`workers`、`march`、`yield` 等相关回归，并重跑原图经济探针检查金币入账和后续对局；原版让行、复杂拥堵和联机仍待验证。本次未执行功能测试。


### AI 生产回调批次结果

范围：`80cb2be`、`fa7b24d`、`5d80461`。Win32 Release 客户端、CampaignAI 和 revival 程序构建通过。重新生成战役 AI 夹具后，`produce-owner`、`produce-replacement`、`produce-builder`、`produce-zero`、`produce-many`、`convert-empty`、`merge-empty`、`armies`、`harvest`、`reachable` 各 2 项通过，`startup` 1 项通过；原 Booty Bay 的 `melee-build` 1 项通过；复活夹具 4 项通过，共 **26 通过、0 失败**。覆盖生产开始时转移建筑、新建替代生产者、工人取消施法时转移，以及生产、采集、建造和复活回归。日志与夹具位于 `tmp/docs-artifacts/war3/ai-producer-callback-batch/`。

原版事件时序、建造／复活其他重入场景、大量生产者时的性能、窗口和完整对局仍待验证。单次生产调用的工作量上限继续保留；下一功能批次 0/3。


### AI 建造位置搜索的回调中断（待合批验证，3/3）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`。建造尝试被施法结束回调改派或转移工人时，停止使用该工人尝试其他位置；位置无效且工人状态未改变时继续搜索。合批重新生成夹具并运行 CampaignAI `produce-builder`、`produce-owner`、`produce-replacement`、生产回归及 revival；原版取消时序、工人销毁／其他回调与实际对局待验证。本次提交前未执行功能测试。


### AI 多项生产刷新候选（待功能批次验证，2/3）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`。多项生产每次请求重新收集现有生产者，使事件中新建或转入的生产者能够接收后续请求；保留逐次归属检查和既有单次调用工作量上限。原版 `SetProduce` 在 `0x6f894963` 循环调用单项生产。合批重新生成夹具，运行 `produce-replacement`、`produce-owner`、`produce-many` 与复活回归；批量创建超过工作量上限、回调销毁／转移和原版时序仍待验证。本次未执行功能测试。


### AI 生产回调后的生产者归属（待功能批次验证，1/3）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`。AI 多项生产逐次检查生产者归属、移除、生命及指定城镇，生产开始事件转移建筑后不再向其派发后续请求；复活和建造候选同样检查。合批生成 CampaignAI 夹具并运行 `produce-owner`、`produce-many` 和 revival 回归，核对训练开始时转移、队列、资源及既有生产；建筑／复活回调、嵌套重入、原版时序和完整对局待验证。本次未执行功能测试。


### AI 生产与转换批次结果

范围：`9e35827`、`c2a643c`、`5f67e97`。Win32 Release 客户端、CampaignAI 和 revival 程序构建通过。原战役夹具执行 `produce-zero`、`produce-many`、`convert-empty`、`merge-empty`、`armies`、`harvest`、`reachable` 各 2 项通过，`startup` 1 项通过；原 Booty Bay 执行 `melee-build` 1 项通过；复活夹具 4 项通过，共 **20 通过、0 失败**。覆盖负数量部分排队、受限训练命令提交后无扣费与入队、限制解除后生产、非正转换及相关回归。首次执行使用了错误的测试程序路径，修正路径后上述命令通过。日志位于 `tmp/docs-artifacts/war3/ai-production-next-batch/`。

原 Booty Bay 兽族对不死族静音隔离探针中，900 秒兽族已有 1 辆投石车在途或存活，受限狂战士请求返回成功并允许后续生产；对局在 4,200 秒仍未结束，双方无法选择剩余野怪营地，不能视作完整对局通过。探针不渲染窗口；原版生产者选择与命令拒绝、无资源、队列事件及联机时序仍待对照。下一功能批次 0/3。


### AI 训练命令提交结果（待合批验证，3/3）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`。AI 选到可用训练者后以命令提交为成功，训练限制导致的拒绝不扣费、不入队，后续建造计划可继续；没有可用生产者或队列空间仍返回失败。原版 1.27 `0x6f8a067d` 向选中的生产者提交命令，随后 `0x6f8a06a0` 返回成功。合批运行 CampaignAI `produce-many`、`produce-zero`、`convert-empty`、`merge-empty`、`melee-build` 与复活相关回归；检查受限训练及放开后生产、队列满和非正数量。原版候选筛选、限制／资源／事件时序、实际窗口及完整对局仍待对照。本次提交前未执行功能测试。


### AI 非正数量转换（待功能批次验证，2/3）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`。电脑拥有存活单位时，`ConvertUnits` 的非正数量直接成功，不检查类型或下达命令；正数量不再由固定 1024 限制截断。原版 1.27 `0x6f899adb` 在遍历到单位后，`0x6f899ae3` 对非正剩余数量返回成功。合批运行 CampaignAI `convert-empty` 与转换相关回归，检查空请求和无效类型；原版空单位链、候选顺序、末个候选及回调时序仍待对照。本次未执行功能测试。


### AI 负数量生产（待功能批次验证，1/3）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。`SetProduce` 的负数量按 32 位计数逐项尝试，失败时保留已排队项目；零数量仍立即成功。原版 1.27 `0x6f894959` 对非零计数进入生产循环，每次成功后递减，失败返回零。合批运行 CampaignAI `produce-many`、`produce-zero` 和生产回归，核对负数量的部分队列、资源与容量；生产回调重入、原版动态极值及完整对局仍待验证。本次未执行功能测试。


### AI 生产和空合并批次（基础验证完成）

范围：`b8cfb00`、`a5ba3d2`（补充 `253eecb`）和 `70cd3fc`。Win32 Release 客户端、CampaignAI 和 revival 测试程序编译通过。`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `produce-zero`、`produce-many`、`merge-empty`、`armies`、`harvest`、`reachable` 各 2 项通过，`startup` 1 项通过；`melee-build` 以原版 Booty Bay 运行 1 项通过；`war3_revival_tests <data-root> <fixture>` 4 项通过，共 **18 通过、0 失败**。覆盖零数量无副作用、33 项排队、容量不足时保留部分队列、非正数量合并及英雄复活。`melee-build` 首次误用战役夹具失败，改用原图后通过。日志位于 `tmp/docs-artifacts/war3/ai-production-count-batch/`；战役 AI 夹具为 `tmp/docs-artifacts/war3/campaign-ai/fixture.w3m`，复活夹具为 `tmp/docs-artifacts/war3/hero-revival/fixture.w3m`。正数量合并、生产回调重入、原版极值及完整对局仍待验证。Booty Bay 自然对局在 4,200 秒未结束，受限 `otbk` 项目阻塞后续建造的原版生产者筛选语义尚未确定，诊断见 `docs/ai.md`。


### 电脑营地与跨区域攻击批次（基础验证完成）

范围：`9a73ee8`（补充 `ff9e7a8`）、`ea439a8`（说明 `e5825a5`）和 `cece24c`。Win32 Release 客户端、CampaignAI 与 world 测试程序编译通过。`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `reachable`、`fog-attack`、`enemy-base` 各 2 项通过，`island-nearby`、`island-ranged`、`island-auto`、`island-auto-multiwave-script`、`island-auto-point`、`island-naval` 各 1 项通过；`war3_world_tests <data-root> <clamp-fixture.json> world_region` 5 项通过，共 **17 通过、0 失败**。覆盖重叠营地、近距离隔水上船与送达、射程内远程单位不登船、隔水炮兵直接攻击、区域查询 512／900／上限、已有飞行与船舶多波运输。两个隔离最小复现均在修复前失败、修复后通过；日志位于 `tmp/docs-artifacts/war3/ai-attack-reach-batch/`，AI 夹具为 `tmp/docs-artifacts/war3/campaign-ai/fixture.w3m`，world 夹具为 `tmp/docs-artifacts/war3/world/world-clamp-rea.json`。超过 4096 的非当前射程返回未知；大地图性能、动态障碍、原版运输与攻击时序、自然对局和联机仍待验证。


### 野怪营地筛选与存档提示批次（逻辑验证完成）

范围：`7578f77`、`3fa19bf`、`b45da0b` 及测试补充 `7887adf`。Win32 Release 客户端与 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> reachable`、`enemy-base`、`fog-attack` 各 2 项通过，`island-auto-multiwave-script` 1 项通过，共 **7 通过、0 失败**。`reachable` 补充检查了隐藏、无敌、未侦测隐身、侦测和显形的野怪选择及等级分组；测试补充后只重跑受影响的 `reachable`，其他结果复用。日志位于 `tmp/docs-artifacts/war3/ai-creep-visibility-batch/`，夹具为 `tmp/docs-artifacts/war3/campaign-ai/fixture.w3m`。原版营地分组及侦测时序、自然对局与联机仍待对照；图形设备不可用，存档错误换行的长路径、多语言布局和实际窗口交互仍待验收。


### 存档确认与错误提示批次（逻辑验证完成，窗口待验收）

范围：`de00802`、`39f970a`、`3e01534` 及测试补充 `58ae831`。Win32 Release 客户端、clock 和 save-exists 测试程序编译通过；`WAR3_CLOCK_FILTER=recovery_bundle_rebuilds_component_graph_but_blocks_main war3_clock_tests <data-root> <output-root>` 与 `war3_save_exists_tests <data-root> <OrcX01.w3x> <scratch-root>` 各 1 通过，共 **2 通过、0 失败**，目录链接创建因环境条件跳过。检查点用例首次将内部摘要错误当作地图缺失，修正夹具后重测通过；覆盖缺失／错误身份、损坏摘要及记录的地图路径。只读原安装的 `UI/FrameDef/GlobalStrings.fdf` 确认五个使用的文本键存在，三个文件名／地图模板各含一个 `%s`。日志及源字符串摘录位于 `tmp/docs-artifacts/war3/save-localization-batch/`。图形设备不可用，确认框布局、多语言显示、长名称、异步预览切换及实际窗口的保存／加载操作仍待验证。


### 刀阵、范围控制和兽王战吼物品批次（基础验证完成）

范围：`6a0a3ba`、`8128596`、`987e667`。Win32 Release 客户端及 control、spell、caster 测试目标编译通过。复合夹具执行 control 的 `item-combined-fan`、`item-area-control`、`item-battle-roar`、`item-combined-roar`、`item-howl`、`item-combined-silence`、`item-combined-windwalk`、`item-combined`，各 1 项通过；caster 的 `battle-roar` 4 项通过，共 **12 通过、0 失败**。spell 默认技能流程通过，包含普通刀阵、雷霆一击及战争践踏；该程序未输出分项计数。复现为各测试程序 `<data-root> <fixture> <mode>`，spell 默认流程省略 mode；夹具和日志位于 `tmp/docs-artifacts/war3/combined-area-batch/`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`，caster 使用 `tmp/docs-artifacts/war3/caster-spells/fixture.w3m`。`ACtc` 变体、拾取型使用、刀阵伤害上限及延迟、事件回调、原版时序、联机与实际画面仍待验证。


### 疾风步、范围沉默与恐惧嚎叫物品批次（基础验证完成）

范围：`ff02683`、`00b0337`、`155697d` 及补充修复 `a964a8e`。Win32 Release 客户端、control、mobility 和 caster 测试目标编译通过。复合夹具执行 control 的 `item-combined-windwalk`、`item-combined-silence`、`item-howl`、`item-combined-roar`、`item-combined`、`item-combined-blink`、`item-combined-summons`，各 1 项通过；mobility 的 `windwalk` 1 项通过，caster 的 `battle-roar` 4 项通过，最终共 **12 通过、0 失败**。`item-howl` 首次因单能力施法入口过滤失败，修复后该项及受影响的 `item-combined-roar` 重测通过；其余结果复用修复前的同批结果。命令为各测试程序 `<data-root> <fixture> <mode>`；夹具和日志位于 `tmp/docs-artifacts/war3/combined-status-batch/`，普通疾风步使用 `tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m`，战吼使用 `tmp/docs-artifacts/war3/caster-spells/fixture.w3m`。普通沉默／恐惧嚎叫回归、拾取型恐惧嚎叫、效果回调、原版复合施法时序、联机及实际画面仍待验证。


### 复合守卫、召唤和目标区域侦察批次（基础验证完成）

范围：`4b0047c`、`41371d0`、`d05a46a`，涉及 `src/session_item_use.cpp`、复合夹具、control 测试和物品召唤说明。Win32 Release 客户端及 control 测试程序编译通过；使用生成的复合夹具执行 `war3_control_tests <data-root> <fixture> <mode>`，其中 `item-combined-wards`、`item-combined-summons`、`item-combined-reveal-point`、`item-combined-blink`、`item-combined-flare`、`item-combined`、`item-combined-dispel` 各 1 通过、0 失败，共 **7 通过、0 失败**。夹具和日志位于 `tmp/docs-artifacts/war3/combined-summon-batch/`。三类守卫的点目标、三种召唤的数量／类型／归属／限时生命、区域侦测和物品消耗已覆盖。守卫单位目标／拾取、召唤零数量／多组事件回调／混合目标、普通守卫与召唤回归、原版复合施法时序、联机与实际画面尚未验证，继续保留待测。


### 范围效果与复合点目标合批结果

范围：`e6ff50b`（含补充 `76f8cdb`）、`88d7ee8`、`c1aa66d`，以及本次点选单位与混合点目标断言。Win32 Release 客户端及 control、mobility、stealth、spell、corpse 测试目标构建通过；control 的 `item-combined-blink`、`item-combined-flare`、`area-impact-dead-caster`、`area-damage-reentry`、`spell-damage-reentry`、`item-combined`、`item-combined-dispel`，mobility 的 `blink`、`blink-item`，stealth 的 `flow`、`dust`，corpse 的 `creep-spells` 各 1 项通过，合计 **12 通过、0 失败**。spell 默认完整技能流程另行通过，该流程未输出分项计数。扩展用例覆盖点选单位闪烁，以及闪烁、照明弹和资源效果使用同一目标点；日志及复合夹具在 `tmp/docs-artifacts/war3/combined-point-batch/`，普通机动与显形使用 `tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`，corpse 使用 `tmp/docs-artifacts/war3/corpses/fixture.w3m`。施法者被移除／复活／易主、霜冻新星自定义弹道、复合施法前摇及原版动态时序、多人和实际窗口仍待验证。


### 复合物品的点目标闪烁（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/blink-items.md`。复合物品支持 `AEbl` 闪烁与其他已支持即时效果共同结算，点选位置或单位后使用现有合法落点、最大／最小距离和特效；界面单位面板可将单位作为闪烁目标。Win32 Release 客户端与 control 测试目标构建、生成器语法检查通过；合批生成复合夹具并运行 `war3_control_tests <data-root> <fixture> item-combined-blink`、`item-combined-flare` 及普通闪烁和复合物品回归。新增用例尚未执行；单位目标、混合点目标、回调后落点变化、原版复合施法时序、多人及窗口仍待对照。


### 复合物品的点目标照明弹（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/flare.md`。复合物品支持点目标 `AIfa` 与其他已支持即时效果组合，选点后复用显形区域的源范围、延迟、持续时间与侦测类型，并共同结算物品费用、次数、冷却和使用事件。Win32 Release 客户端和 control 测试目标构建、生成器语法检查通过；合批生成复合夹具并运行 `war3_control_tests <data-root> <fixture> item-combined-flare` 与普通照明弹、复合物品及显形回归。新增用例尚未执行；复合施法前摇／弹道、混合点目标、回调重入、原版时序、多人和窗口待对照。


### 施法者死亡后的地狱火召唤（同一任务补充，待功能批次验证）

路径：`src/session_summons.cpp`、`tests/control_tests.cpp`。已发出地狱火落地时，允许施法者仍以死亡状态存在的情况下创建地狱火；结算期间施法者状态、死亡轮次、归属或命令轮次变化仍会终止后续召唤。扩展地狱火最小复现检查伤害、眩晕、召唤类型和归属：修复前因召唤缺失失败，修复后 1 通过、0 失败。Win32 Release 客户端及 control 测试目标构建通过，日志在 `tmp/docs-artifacts/war3/inferno-dead-caster/`；合批运行 `war3_control_tests <data-root> <fixture> area-impact-dead-caster`、普通地狱火和召唤回归。施法者被移除、复活或易主、召唤事件回调、原版时序及实际窗口仍待对照。


### 施法者死亡后的已发出范围效果（待功能批次验证）

路径：`src/session_area_spells.cpp`、`src/session_spell_effects.cpp`、`tests/control_tests.cpp`。范围效果开始结算时允许已死亡但句柄仍有效的施法者；处理过程中仍以死亡和归属轮次检测后续变化。地狱火的隔离最小复现中，施法支付后、落地前击杀施法者，伤害与眩晕正常落地，1 通过、0 失败；Win32 Release 客户端和 control 测试目标构建通过，夹具为 `tmp/docs-artifacts/war3/wave-target-lifecycle/fixture.w3m`，构建日志在 `tmp/docs-artifacts/war3/area-dead-caster/`。合批运行 `war3_control_tests <data-root> <fixture> area-impact-dead-caster`、`area-damage-reentry`、`spell-damage-reentry` 和普通范围技能回归；霜冻新星的带弹道地图覆盖、施法者被移除／复活／易主、召唤结果、原版时序和实际窗口仍待对照。


### 事件注册句柄合批结果

范围：`ccb3ec3`、`07308f5`、`99bf819`。Win32 Release 客户端及 control、session、clock 测试目标构建通过；control 的 `event-registration-handles`、`player-region-registration-handles`、`flow` 各 1 项通过，session 26 项通过，clock 按 `events` 筛选 9 项通过，合计 **38 通过、0 失败**。覆盖单位／玩家／区域／计时器／游戏／变量事件的失效和有效注册，以及已有事件、过滤、回调和恢复流程。日志在 `tmp/docs-artifacts/war3/event-registration-batch/`，control 使用 `tmp/docs-artifacts/war3/wave-target-lifecycle/fixture.w3m`，session 使用 `tmp/docs-artifacts/war3/jass/session-enums-native.json`。过滤器失效、枚举和参数边界、真实地图、多人及原版动态事件顺序仍待验证。


### 游戏、计时与变量事件注册句柄（待功能批次验证）

路径：`src/session_callbacks.cpp`、`tests/session_tests.cpp`。游戏事件、定时事件和变量事件注册在解析参数与建立观察前检查触发器；失效句柄返回空事件，有效注册继续沿用原有调度及变量观察。固定版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 的对应入口 `0x6f1f9570`、`0x6f1f9d60`、`0x6f1fa350` 均在触发器解析失败时返回。Win32 Release 客户端和 session 测试目标构建通过；合批运行 session、clock、control 事件回归及两个事件句柄专项。新增用例尚未执行；变量名称／类型、事件类别、回调顺序和原版动态行为仍待对照。


### 玩家与区域事件注册句柄（待功能批次验证）

路径：`src/session_callbacks.cpp`、`src/session_spatial_events.cpp`、`tests/control_tests.cpp`。玩家事件、联盟、玩家状态、玩家单位、聊天及进入／离开区域事件注册先检查触发器及相应玩家／区域；失效句柄返回空事件，有效输入沿用现有事件索引、过滤和回调。固定版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 中入口分别为 `0x6f1f9a20`、`0x6f1f9880`、`0x6f1f9b40`、`0x6f1f9c60`、`0x6f1f9950`、`0x6f1f9390`、`0x6f1f97a0`，均有触发器及玩家或区域解析失败返回分支。Win32 Release 客户端和 control 测试目标构建通过；合批运行 `war3_control_tests <data-root> <fixture> player-region-registration-handles`、`event-registration-handles` 及现有玩家／区域事件回归。新增用例尚未执行；过滤器失效、脚本重入和原版事件时序待验证。


### 单位与计时器事件注册句柄（待功能批次验证）

路径：`src/session_callbacks.cpp`、`src/session_spatial_events.cpp`、`tests/control_tests.cpp`。注册单位事件、筛选单位事件、单位状态事件、单位距离事件与计时器到期事件时，失效触发器或目标返回空事件；单位状态编号超出范围也返回空事件。有效事件保持既有索引、状态和回调流程。固定版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 的注册入口分别为 `0x6f1fa060`、`0x6f1f9470`、`0x6f1fa260`、`0x6f1fa170`、`0x6f1f9e20`，均检查触发器及目标句柄；单位状态入口先检查状态范围。Win32 Release 客户端与 control 目标构建通过；合批运行 `war3_control_tests <data-root> <fixture> event-registration-handles`，并回归事件、距离、计时器及原图脚本。新增用例尚未执行；过滤器失效、回调重入、原版事件顺序与实际地图仍待验证。


### 触发器与界面文字合批结果

范围：`12bcd57`、`b411985`、`4508711`，以及本次 FDF 源字段和地图覆盖检查。Win32 Release 客户端、session、JASS thread 和 native 测试目标构建通过；session 25 通过、thread 35 通过、native 15 通过，合计 **75 通过、0 失败**。覆盖触发器失效句柄、既有线程调度及原版生产／资源字段与地图 FDF 覆盖读取；日志位于 `tmp/docs-artifacts/war3/trigger-ui-batch/`。FDF 检查不验证面板实际绘制；本机先前无法创建 D3D9 设备，本批未取得窗口画面。不同语言窗口布局、真实地图生产／采集及原版时序仍待验证。


### 资源与生产取消文字（待功能批次验证）

路径：`src/game_loading.h`、`src/game_loading.cpp`、`src/game_commands.cpp`。单位携带的黄金／木材、金矿剩余量及生产队列取消提示使用源界面字段 `COLON_GOLD`、`COLON_LUMBER` 和 `CANCEL`，字段缺失时使用可读默认文字。Win32 Release 客户端构建和差异检查通过；黄金字段来自 `InfoPanelStrings.fdf`，其余字段来自 `GlobalStrings.fdf`，均已核对本机原资源。本次未运行界面测试；合批检查多语言／地图覆盖、采集和金矿／生产队列状态及窗口布局，原版数字、图标与排版仍待对照。


### 建筑与生产状态文字（待功能批次验证）

路径：`src/game_loading.h`、`src/game_loading.cpp`、`src/game_commands.cpp`。建造、训练、研发和英雄复活状态文字读取 `UI/FrameDef/GlobalStrings.fdf` 的 `CONSTRUCTING`、`TRAINING`、`RESEARCHING`、`REVIVING`；缺少对应字段时沿用可读默认值。状态百分比和生产队列沿用当前绘制与输入流程。Win32 Release 客户端构建及差异检查通过；源安装的四个字段已核对。本次未运行界面测试；合批验证不同语言和地图资源覆盖下的建筑、训练、研发和复活文字及窗口布局，原版字号／位置、升级／反召唤及人口不足文字仍待对照。


### 触发器执行与回调的失效句柄（待功能批次验证）

路径：`src/session_callbacks.cpp`、`src/session_threads.cpp`、`tests/session_tests.cpp`。触发器执行／等待执行、条件求值、重置、动作和条件的添加／移除／清空先校验各自句柄；失效触发器的求值或添加返回零，其余操作不执行。有效触发器及回调仍走既有调度、清理和所有权检查。固定版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，注册入口 `0x6f1f90e0`、`0x6f1f9100`、`0x6f1f9120`、`0x6f1f3140`、`0x6f1f90a0`、`0x6f1f90c0`、`0x6f1f9010`、`0x6f1f9050`、`0x6f1fa420`、`0x6f1fa450` 对无效触发器先返回，移除入口也检查动作或条件句柄。Win32 Release 客户端及 session 测试目标构建通过；合批运行 `war3_session_tests tmp/docs-artifacts/war3/jass/session-enums-native.json` 和线程／回调回归，新增用例尚未执行。回调属于其他触发器、空代码／表达式和原版运行时细节仍待对照。


### 波形和脚本句柄合批结果

范围：`834cec4`、`6796669`、`a7b196a`。Win32 Release 客户端及 session、clock、control、spell 测试目标构建通过。session 25 通过、0 失败，包含新增计时器与触发器空／失效／异类型句柄及有效状态检查；clock 按 `timer` 筛选 4 通过、0 失败；control 的 `wave-target-reentry`、`area-damage-reentry` 各 1 通过，spell 的 `frost-breath` 1 通过，合计 32 项通过、0 失败。spell 默认完整技能流程也通过，该流程未输出分项计数。日志在 `tmp/docs-artifacts/war3/script-wave-batch/`；control 使用 `tmp/docs-artifacts/war3/wave-target-lifecycle/fixture.w3m`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`，session 使用 `tmp/docs-artifacts/war3/jass/session-enums-native.json`。火焰呼吸伤害回调易主、多目标／不同模拟步、原版动态时序、多人及实际窗口仍待验证。


### 计时器失效句柄（待功能批次验证）

路径：`src/session.cpp`、`src/session_callbacks.cpp`、`tests/session_tests.cpp`。计时器启动、暂停、恢复及超时／已过／剩余时间查询校验句柄，失效计时器不产生操作或返回零；有效计时器沿用原有调度。固定版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，入口 `0x6f1f8fe0`、`0x6f1f1b00`、`0x6f1f32e0`、`0x6f1f8fb0`、`0x6f1f8f50`、`0x6f1f8f80` 均在计时器解析失败时直接返回。Win32 Release 客户端及 session 测试目标构建通过；合批运行 `war3_session_tests tmp/docs-artifacts/war3/jass/session-enums-native.json` 和计时器调度回归，新增用例尚未执行，真实地图和原版运行时行为待验证。


### 触发器失效句柄（待功能批次验证）

路径：`src/session.cpp`、`tests/session_tests.cpp`。触发器销毁、启停、等待选项及启用状态／等待选项／执行与条件计数查询先校验句柄；空、销毁、其他类型及未知句柄分别不产生操作或返回零，有效触发器继续执行原有行为。固定版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；注册入口 `0x6f1df7d0`、`0x6f1e0010`、`0x6f1dfc50`、`0x6f1e84b0`、`0x6f1fa4f0`、`0x6f1e84d0`、`0x6f1e5d50`、`0x6f1e5dd0` 的指令均在句柄解析失败时直接返回。Win32 Release 客户端及 session 测试目标构建通过；合批运行 `war3_session_tests tmp/docs-artifacts/war3/jass/session-enums-native.json`，检查失效句柄、正常状态与既有触发器生命周期；新增用例尚未执行，原版运行时和实际地图待验证。


### 波形技能的目标生命周期（待功能批次验证）

路径：`src/session_area_spells.cpp`、`src/session_neutral_spells.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`。波形同一模拟步内预选目标时记录死亡和归属轮次，逐个命中前复核；火焰呼吸伤害回调后复核目标归属轮次，再决定是否附加灼烧。Win32 Release 客户端及 control 测试目标构建、生成器语法检查通过；`wave-target-reentry` 最小复现 1 项通过、0 失败，检查冲击波前序伤害回调使同批预选英雄复活；夹具和构建日志位于 `tmp/docs-artifacts/war3/wave-target-lifecycle/`。合批运行该模式与 spell 默认流程、`frost-breath`，并覆盖火焰呼吸伤害回调易主、多目标、穿刺和不同模拟步；原版动态回调时序、多人及实际窗口仍待对照。


### 技能目标生命周期合批结果

范围：`7a56119`、`20f6b7a`、`5db095f`。Win32 Release 客户端及 control、spell、corpse 测试目标构建通过。control 的 `spell-damage-reentry`、`unit-area-heal-reentry`、`area-damage-reentry`、`flow`、`item-normal-target-reentry`，spell 的 `unit-area-heal`、`hidden-immediate`、`spell-shield`、默认完整技能流程，以及 corpse 的 `creep-spells`，共 10 个测试流程通过、0 失败。默认技能流程首次因旧断言要求扩展魔法筛选移除不属于魔法分类的眩晕而失败；断言改为检查筛选保留眩晕及按 Buff ID 移除后通过。流程涵盖普通雷霆一击、战争践踏、刀阵、地狱火召唤与眩晕。日志在 `tmp/docs-artifacts/war3/spell-lifecycle-batch/`，control 使用 `tmp/docs-artifacts/war3/spell-impact-reentry/fixture.w3m`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`，corpse 使用 `tmp/docs-artifacts/war3/corpses/fixture.w3m`。多目标回调中目标易主和施法者死亡／易主、地狱火回调、原版动态时序、多人及实际窗口仍待验证。


### 范围伤害技能的目标生命周期（待功能批次验证）

路径：`src/session_area_spells.cpp`、`tests/control_tests.cpp`。雷霆一击、战争践踏与地狱火落地的范围结算保留预选目标的死亡和归属轮次，在伤害前后复核目标；施法者死亡或易主后停止后续目标。刀阵投射物沿用同一预选目标检查。Win32 Release 客户端和 control 测试目标构建通过；复用 `tmp/docs-artifacts/war3/spell-impact-reentry/fixture.w3m` 的死亡回调复活最小复现 1 项通过、0 失败，覆盖雷霆一击和战争践踏；构建日志在 `tmp/docs-artifacts/war3/area-damage-reentry/`。合批运行 `war3_control_tests <data-root> <fixture> area-damage-reentry` 和相关范围技能回归，核对地狱火、刀阵、多目标及目标易主；原版回调时序、施法者生命周期变化后的范围结算、多人及窗口仍待对照。


### 单位范围治疗的目标生命周期（待功能批次验证）

路径：`src/session_area_spells.cpp`、`tests/control_tests.cpp`。单位施放 AIha 范围治疗时记录目标死亡及归属轮次，在每个目标结算前复核，避免前序治疗回调让目标复活或易主后继续沿用旧目标。Win32 Release 客户端及 control 测试目标构建通过；复用 `tmp/docs-artifacts/war3/spell-impact-reentry/fixture.w3m` 的回调最小复现 1 项通过、0 失败，构建日志位于 `tmp/docs-artifacts/war3/area-heal-reentry/`。合批运行 `war3_control_tests <data-root> <fixture> unit-area-heal-reentry` 和 `war3_spell_tests <data-root> <fixture> unit-area-heal`，覆盖目标复活／易主、施法者中断和普通治疗；原版动态回调时序、多人及实际窗口仍待对照。


### 技能伤害回调中的目标生命周期（待功能批次验证）

路径：`src/session_spell_effects.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`。风暴之锤与霜冻新星伤害后检查目标死亡和归属轮次，避免对回调中复活或易主的目标施加旧状态；霜冻新星逐个结算时还检查预选目标和施法者生命周期，施法者死亡或易主后停止后续目标。Win32 Release 客户端及 control 测试目标构建通过，生成器语法检查通过；死亡事件内复活的最小复现 1 项通过、0 失败，覆盖两种技能，夹具与构建日志位于 `tmp/docs-artifacts/war3/spell-impact-reentry/`。合批运行 `war3_control_tests <data-root> <fixture> spell-damage-reentry`、相关技能和控制回归，并检查易主及范围内多目标；回调中的原版动态时序、施法者生命周期变化后的范围结算、多人及实际窗口仍待对照。


### 复合目标法术合批结果

范围：`be2b8dd`、`0bd5924`、`ea64497`。Win32 Release 客户端、control、spell、caster 测试目标构建通过，control 目标有既有变量遮蔽警告。复合夹具的 `item-combined-control-family`、`item-combined-caster-family`、`item-combined-mind-rot`、`item-combined-caster`、`item-combined-spirit-target`、`item-combined`、`item-combined-target-reentry` 各 1 项通过；spell 的 `mind-rot`、`spell-shield`、`unit-area-heal` 各 1 项通过，caster 的 `targets` 6 项通过，control 的 `flow` 1 项通过，合计 17 通过、0 失败。`mind-rot` 首次使用不含所需物品的夹具失败，改用专用夹具后通过。日志及复合夹具在 `tmp/docs-artifacts/war3/combined-spell-batch/`；spell 分别使用 `tmp/docs-artifacts/war3/mind-rot/fixture.w3m` 和 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`，caster 使用 `tmp/docs-artifacts/war3/caster-spells/targets-fixture.w3m`。其他目标技能与混合目标、复合施法前摇／弹道、原版时序、多人和实际窗口仍待验证。


### 复合物品的单位目标控制（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。目标型复合物品接入诱捕、蛛网、睡眠、净化、虚无、妖术、变羊和龙卷风，复用现有目标条件、法术护盾与控制状态；命令界面识别对应复合物品的单位目标。合批生成复合夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-control-family`、`item-combined-caster-family`、`item-combined-mind-rot` 及普通控制回归；树木净化、复合技能前摇／弹道、原版时序、多人和窗口待验证。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的单位目标施法族（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。目标型复合物品接入现有治疗、减速、内在之火、嗜血、回春、狂热、诅咒、驱魔、反魔法护盾、隐身、冰霜护甲和寄生施法效果，复用目标条件、法术护盾与状态生命周期；命令界面识别这些复合物品的单位目标。合批生成复合夹具并运行 `war3_control_tests <data-root> <fixture> item-combined-caster-family`、`item-combined-mind-rot` 和已有施法回归；覆盖以外的技能、混合目标、原版前摇／弹道、多人和窗口待验证。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的心灵腐烂（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。目标型复合物品支持 ANmr 心灵腐烂，沿用已有目标、法术护盾和魔法持续消耗状态，并与其他效果共同结算物品。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-mind-rot`、`item-combined-caster` 及普通 `mind-rot`；复合施法前摇／弹道、原版时序、多人和窗口待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的单位施法合批结果

范围：`4a55308`、`e848604`、`f34f53f`，以及本次分摊与护盾断言。Win32 Release 客户端、control、spell、clock 测试目标构建通过，control 目标有既有变量遮蔽警告。control 的 `item-combined-spirit-rune`、`item-combined-spirit-target`、`item-combined-caster`、`item-combined`、`item-combined-support`、`item-combined-dispel` 各 1 项通过；spell 的 `spirit-rune`、`spell-shield` 各 1 项通过；clock 的 `unit_buffs_restore_spirit_link_and_shield` 1 项通过，合计 9 通过、0 失败。额外断言确认复合锁链伤害分摊和目标法术护盾拦截。日志与复合夹具在 `tmp/docs-artifacts/war3/combined-caster-batch/`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`。复合技能前摇／弹道与原版时序、多人与实际窗口仍待验证。


### 复合物品的单位施法状态（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。目标型复合物品支持 Alsh 闪电护盾、Afae 精灵之火和 Acri 衰减，复用目标筛选、法术护盾与现有状态效果，共同结算物品费用、次数、冷却和使用事件。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-caster`、目标／拾取型灵魂锁链和已有复合回归，验证普通施法及锁链分摊；复合施法前摇／弹道、原版时序、多人与窗口待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的目标型灵魂锁链（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。非拾取型复合物品支持指定单位施放 Aspl，校验实际目标和射程，应用前复查目标死亡与归属轮次，并复用原锁链状态；物品与其他效果统一结算。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-spirit-target`、`item-combined-spirit-rune` 及锁链回归；复合技能施法前摇／弹道、原版时序、多人和窗口待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合拾取物品的灵魂锁链（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。拾取型复合物品支持 Aspl 灵魂锁链，复用已有目标选择、锁链状态和伤害分摊，并与其他效果共用次数、费用、冷却及使用事件。合批生成复合物品夹具并运行 `war3_control_tests <data-root> <fixture> item-combined-spirit-rune`、`item-combined`，回归普通 `spirit-rune` 及锁链伤害；非拾取型目标技能组合、原版复合时序、多人和窗口待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 消耗品目标生命周期合批结果

范围：`638141b`、`ab33f46`、`d7f2c90`。Win32 Release 客户端及 control、spell、consumption 测试目标构建通过，control 目标有既有变量遮蔽警告。control 的 `item-normal-target-reentry`、`item-protection-reentry`、`item-combined-target-reentry`、`item-combined`、`item-combined-area`、`item-combined-dispel`、`item-combined-support`、`item-combined-status` 各 1 项通过；spell 的 `unit-area-heal`、`shield-rune`、`rebirth-rune`、`chain-dispel` 各 1 项通过；consumption 的 `protection`、`moon` 各 1 项通过，合计 14 通过、0 失败。新夹具和日志在 `tmp/docs-artifacts/war3/consumable-reentry-batch/`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`。Spirit Link 的独立目标处理、原版动态回调时序、多人同步和实际窗口仍待验证。


### 普通范围消耗品的目标重入（待功能批次验证）

路径：`src/session_consumables.cpp`、`tests/control_tests.cpp`。普通消耗品在施法前记录预选目标的死亡与归属轮次；逐个执行时检查使用者状态及目标轮次，避免回调后对已易主或复活的目标继续执行旧效果。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；`item-normal-target-reentry` 最小复现 1 通过、0 失败，覆盖范围护甲卷轴的目标易主与复活。合批回归普通恢复／防护／驱散及复合目标重入；Spirit Link 的独立目标处理、原版时序、多人和窗口待对照。日志与夹具：`tmp/docs-artifacts/war3/consumable-reentry/`。


### 消耗品治疗回调的目标生命周期（待功能批次验证）

路径：`src/session_consumables.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`。普通及复合消耗品的恢复／护甲效果在治疗回调后重新检查使用者和目标的死亡、归属与移除状态，避免把剩余魔法恢复或护甲状态施加到已复活或易主的目标。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；`item-protection-reentry` 最小复现 1 通过、0 失败，覆盖普通／复合护甲卷轴和复合恢复卷轴的复活回调。合批回归 `item-combined-target-reentry`、`item-combined`、`item-combined-area`、普通 `protection` 和治疗卷轴；原版时序、多人及窗口待对照。日志与夹具：`tmp/docs-artifacts/war3/consumable-reentry/`。


### 复合物品目标的死亡与归属重入（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`。复合消耗品预选目标时记录死亡和归属轮次；较早效果触发回调后，已死亡复活或易主的目标不再接收旧批次范围效果，使用者易主后停止消费该批目标。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-target-reentry` 和 `item-combined`、`item-combined-area`、`item-combined-dispel`；原版回调时序、能力内部重入、多人及窗口待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；已执行 `item-combined-target-reentry` 最小复现，1 通过、0 失败，日志与夹具在 `tmp/docs-artifacts/war3/combined-target-reentry/`。


### 复合物品的昼夜、驱散与重生合批结果

范围：`c149c66`、`d689f02`、`873db2c`，以及本次边界断言。Win32 Release 客户端、control、spell、clock 和 consumption 目标构建通过；control 目标有既有局部变量遮蔽警告。复合物品夹具的 `item-combined-rebirth`、`item-combined-dispel`、`item-combined-moon`、`item-combined`、`item-combined-area`、`item-combined-support` 各 1 项通过；普通 `moon`、`purge`、`rebirth-rune`、`chain-dispel` 各 1 项通过，合计 10 通过、0 失败。额外边界复测覆盖无效重生来源及超出施法距离；月亮石检查临时时间及恢复。日志和复合夹具在 `tmp/docs-artifacts/war3/combined-world-batch/`，法术回归使用 `tmp/docs-artifacts/war3/mind-rot/fixture.w3m`。原版复合效果时序、复杂回调、空落点、多人及实际窗口仍待验证。


### 复合物品的重生神符（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合主动效果支持 AIrb，读取物品掉落单位类型，使用现有落点和单位创建流程，并与其他效果共同结算次数、费用、冷却及使用事件。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-rebirth`、`item-combined-dispel`、`item-combined-moon` 及普通 `rebirth-rune`；原版复合时序、无落点／无效类型、回调重入和窗口待对照。Win32 Release 客户端与 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的地点驱散（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合主动效果支持 AIdi 的地点／范围驱散，复用原消耗品的距离、目标筛选、状态移除、召唤伤害和视觉；与其他效果共用物品结算。合批生成复合物品夹具并运行 `war3_control_tests <data-root> <fixture> item-combined-dispel`、`item-combined-moon`、`item-combined` 及普通驱散场景；原版复合时序、地图目标覆盖、回调重入与窗口待对照。Win32 Release 客户端与 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的临时昼夜（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合主动效果支持 AIct 临时昼夜，复用原时钟与变化事件、到期恢复和施法视觉，并与其他效果共同结算次数、费用、冷却和使用事件。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-moon`、`item-combined` 及原月亮石专项；原版复合效果时序、事件重入、真实窗口和多人待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品恢复与防护合批结果

范围：`b4b40cd`、`63f0b3e`、`829015c`，以及本次夹具和断言修正。Win32 Release 客户端、control、spell、consumption 测试目标构建通过，control 目标有既有变量遮蔽警告。复合物品夹具的 `item-combined-support`、`item-combined-status`、`item-combined-area`、`item-combined-area-mana`、`item-combined-speed-area`、`item-combined`、`item-combined-dust`、`item-combined-roar` 各 1 项通过；普通消耗品的 `unit-area-heal`、`shield-rune`、`acid-speed` 和 `protection` 各 1 项通过，合计 12 通过、0 失败。初次两项失败分别因夹具选择了无需目标的能力及断言读取基础速度；改用目标型 AIrl、独立使用者和实际速度倍率后复测通过。日志及复合夹具在 `tmp/docs-artifacts/war3/combined-support-batch/`，spell 使用 `tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m`。原版复合时序、全部状态与目标重入、多人同步及实际窗口仍待验证。


### 复合物品的恢复和防护状态（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合效果支持 AIrg 持续恢复、AIda 护甲保护和 ANse 法术护盾；单目标恢复校验目标与距离，范围效果使用现有筛选和状态生命周期。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-support`、`item-combined-status`、`item-combined-area`、`item-combined` 及普通消耗品回归；原版复合时序、目标重入、多人和窗口待对照。Win32 Release 客户端及 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的无敌与加速（待功能批次验证）

路径：`src/session.h`、`src/session_consumables.cpp`、`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合主动效果支持 AIvu、AIsp 和 AIsa，复用普通消耗品的目标筛选及状态创建，按物品统一处理费用、次数、冷却和使用事件。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-status`、`item-combined-area`、`item-combined` 及普通消耗品恢复／无敌／加速用例；范围与目标变化、原版复合时序及窗口待验证。Win32 Release 客户端和 control 测试目标构建通过，测试目标有既有变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的范围恢复（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合即时效果支持 AIha、AImr 和 AIra 的范围生命／魔法恢复，复用消耗品目标筛选与治疗计算，合并处理物品次数、费用、冷却和使用事件。合批生成复合物品夹具，运行 `war3_control_tests <data-root> <fixture> item-combined-area`、`item-combined`、`item-combined-dust` 与 consumable 的恢复卷轴场景；原版复合效果时序、目标变化重入及实际窗口待对照。Win32 Release 客户端和 control 测试目标构建通过，测试目标有原有局部变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 机械小动物与复合物品合批结果

范围：`e153299`、`32dd601`、`e6c2551`。Win32 Release 客户端及 passive、control、stealth、caster、clock 目标构建通过；control 目标有既有局部变量遮蔽警告。生成复合物品、stealth 和 caster 夹具后，passive 的 `critter-timer-overlap`、`buff-timed-critter`、`buff-permanent-critter`、`mechanical-critter-real`、`timed-life-multiple` 各 1 通过；control 的 `item-combined-dust`、`item-combined-roar`、`item-combined` 各 1 通过；stealth 的 `dust` 1 通过，caster 的 `battle-roar` 4 通过；clock 的 `unit_buffs_restore_spirit_link_and_shield` 1 通过，合计 14 通过、0 失败。日志及新夹具在 `tmp/docs-artifacts/war3/critter-item-batch/`，passive 使用 `tmp/docs-artifacts/war3/timed-critters-batch/passive.w3m`。普通 Buff 快照通过不代表旧机械小动物快照已覆盖；旧存档、定制地图、原版动态时序与实际窗口仍待验证。


### 复合物品的咆哮（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合主动效果支持 Aroa 咆哮，复用现有范围目标、状态与属性效果，共同结算物品次数、冷却和使用事件。合批生成复合物品夹具并运行 `war3_control_tests <data-root> <fixture> item-combined-roar`、`item-combined` 与 caster 的 `battle-roar`；原版复合物品时序、目标筛选和实际窗口待对照。Win32 Release 客户端和 control 测试目标构建通过，测试目标有原有局部变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 复合物品的显影之尘（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`、`docs/consumables.md`。复合主动效果支持 AItb 显影，与资源等已支持效果共同结算次数、冷却和使用事件，并复用目标上的显影状态。合批生成 `generate-combined-item-fixture.py --data-root <data-root> --output <fixture>`，运行 `war3_control_tests <data-root> <fixture> item-combined-dust`、`item-combined` 和 stealth 的 `dust`；原版多能力支付／施法时序、界面及其他主动能力待对照。Win32 Release 客户端和 control 测试目标构建通过，测试目标存在原有局部变量遮蔽警告；生成器语法检查通过。本次未执行功能测试。


### 机械小动物与同编号计时器（待功能批次验证）

路径：`src/session_summons.cpp`、`src/session_entities.cpp`、`src/session_spell_natives.cpp`、`src/session_buff_snapshot.cpp`、`src/game_buff_panel.cpp`、`tests/passive_tests.cpp`。机械小动物状态保存来源技能的召唤时限，区分关联计时器与独立同编号状态；按编号移除时保留其余状态，扩展筛选分别计数和清理，状态栏保留独立状态的图标。旧 Buff 快照通过来源技能恢复时限。合批运行 `war3_passive_tests <data-root> <fixture> critter-timer-overlap`、`buff-timed-critter`、`buff-permanent-critter`、`mechanical-critter-real` 及 Buff 快照恢复；定制地图、旧存档、原版动态与窗口显示待验证。Win32 Release 客户端及测试目标构建通过；本次未执行功能测试。

### 旧版召唤快照恢复检查

`tests/clock_tests.cpp` 在召唤快照测试中构造 SUMM v4 字节流并恢复单位；`WAR3_CLOCK_FILTER=summon_snapshot_restores_timed_life_and_retired_sources` 构建并执行通过 1 项、失败 0 项。此检查覆盖单计时器及暂停状态，原版存档格式互通仍未实现。日志：`tmp/docs-artifacts/war3/multiple-timed-life/clock-v4.log`。


### 限时生命、死亡与恢复合批结果

范围：`e14a290`、`433e206`、`dafdc55`，以及本次英雄等级恢复顺序修复。Win32 Release 客户端、passive 和 clock 测试目标构建通过。`war3_passive_tests` 的 `timed-life-death`、`timed-life-rebirth`、`timed-life-multiple`、`timed-life-buff-id`、`timed-life-summoned`、`buff-timed-life`、`buff-timed-critter`、`buff-permanent-critter`、`mechanical-critter-real`、`buff-filter-semantics` 共 10 项通过；`WAR3_CLOCK_FILTER` 指定召唤快照及死亡重生恢复各 1 项通过。死亡重生快照初次因英雄等级恢复顺序失败，修复后两项相关快照复测通过；额外断言高等级英雄属性恢复通过。日志及夹具位于 `tmp/docs-artifacts/war3/multiple-timed-life/` 和 `tmp/docs-artifacts/war3/timed-critters-batch/`。原版动态时序与特殊 Buff、熔岩分裂交互及实际窗口显示仍待验证；完整原版玩法仍未完成。


### 单位死亡时的限时状态清理（待功能批次验证）

路径：`src/session_callbacks.cpp`、`tests/passive_tests.cpp`。普通死亡进入尸体流程时清除未到期的全部限时状态及其能力，英雄复活后不再沿用死亡前计时；重生技能的死亡处理沿用现有分支。合批运行 `war3_passive_tests <data-root> <fixture> timed-life-death`，覆盖不同编号的计时器、死亡和英雄复活；原版死亡时特殊 Buff、重生与事件重入仍需动态对照。Win32 Release 客户端及测试目标构建通过；本次未执行功能测试。


### 限时死亡与重生状态（待功能批次验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`src/session_illusion.cpp`、`src/session_rebirth.cpp`、`tests/passive_tests.cpp`。限时状态到期触发死亡时将到期原因传入死亡处理，保留凤凰周期清理并跳过重生；普通死亡继续按已有规则处理。合批运行 `war3_passive_tests <data-root> <fixture> timed-life-rebirth` 和已有重生、限时状态用例，覆盖较早计时器先到期和普通死亡对照；原版动态行为与复杂死亡事件重入待对照。Win32 Release 客户端和 passive 测试目标构建通过；本次未执行功能测试。


### 多个限时生命状态（待功能批次验证）

路径：`src/entities.h`、`src/session_illusion.cpp`、`src/session_entities.cpp`、`src/session_spell_natives.cpp`、`src/game_buff_panel.cpp`、`tests/passive_tests.cpp`、`tests/clock_tests.cpp`。重复施加产生独立计时器，暂停作用于全部，按编号移除单个状态，扩展 Buff 清除移除所有匹配状态，任一计时器到期触发单位死亡；状态栏合并同编号图标。`SUMM` 第 5 版保存额外计时器，并读取旧版。原版 1.27 `0x6f46e1f0` 创建新状态并经 `0x6f46e090` 加入单位，`UnitPauseTimedLife` 遍历状态。Win32 Release 客户端及两个测试目标构建通过；本次针对性运行 `war3_passive_tests <data-root> <fixture> timed-life-multiple` 和 `WAR3_CLOCK_FILTER=summon_snapshot_restores_timed_life_and_retired_sources`，各 1 通过、0 失败，覆盖多个计时器的暂停、移除、到期、清除和新版快照恢复。合批回归 `timed-life-buff-id`、限时／机械状态及旧版快照；原版动态、特殊 Buff 效果、熔岩分裂交互和窗口显示待验证。构建日志位于 `tmp/docs-artifacts/war3/multiple-timed-life/`。


### 限时生命与机械小动物合批结果

范围：`909a816`、`eb15cfd`、`891e770`。Win32 Release 客户端、passive 和 control 目标构建通过，无编译警告。生成 passive 夹具后，`buff-permanent-critter`、`timed-life-buff-id`、`timed-life-summoned`、`mechanical-critter-real`、`buff-timed-life`、`buff-timed-critter`、`buff-filter-semantics` 及 control 的 `purge` 各 1 通过、0 失败；passive 主程序退出 0 并输出 PASS。真实原版 `mcri` 物品完成机械小动物召唤，检查伪装与状态清除。日志与夹具位于 `tmp/docs-artifacts/war3/timed-critters-batch/`。原版重复施加限时生命的入口会创建并加入新状态，当前仅保存一个计时器；多个状态的叠加、暂停、移除、存档及动态原版对照仍需实现和验证。特殊 Buff 的专属效果、人口统计与窗口也待验证。


### 限时生命与召唤单位分类（待功能批次验证）

路径：`src/session_illusion.cpp`、`tests/passive_tests.cpp`。对普通单位施加限时生命时设置召唤单位分类，并覆盖此前的类型移除；移除限时能力后分类保留，脚本仍可显式移除或再次施加。原版 1.27 `CBuffTimedLife` 的 `0x6f513003` 设置单位类型位 `4`，`IsUnitType` 的类型映射将该位用于 `UNIT_TYPE_SUMMONED`。合批运行 `war3_passive_tests <data-root> <fixture> timed-life-summoned`，回归限时生命、净化召唤伤害及类型开关；原版动态行为与人口统计待验证。本次未执行功能测试。


### 限时生命的原版 Buff 类型（待功能批次验证）

路径：`src/session_illusion.cpp`、`tests/passive_tests.cpp`。`UnitApplyTimedLife` 为七种原版特殊 Buff 选择对应编号，其他编号使用通用 `BTLF`；替换时清理旧的限时能力。原版 1.27 `0x6f46e1f0` 比较七个内置编号，其他输入使用 `0x6f511fa0` 返回的 `BTLF`。合批运行 `war3_passive_tests <data-root> <fixture> timed-life-buff-id` 和 `mechanical-critter-real`，核对编号、替换、实际物品召唤及状态清除；各特殊 Buff 的专属行为、原版动态和窗口仍待验证。本次未执行功能测试。


### 无倒计时机械小动物状态（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。没有倒计时的机械小动物标记仍按限时状态筛选，普通 Buff 清除不会误移除伪装；显式包含限时状态的清除可移除标记。原版 1.27 `CBuffMechanicalCritter` 的限时状态虚函数返回真；原 `Amec` 的持续时间为零。合批运行 `war3_passive_tests <data-root> <fixture> buff-permanent-critter`，回归带计时器的机械标记、普通限时生命和真实召唤；原版动态与界面待验证。本次未执行功能测试。


### 状态面板与召唤状态合批结果

范围：`242498c`、`41f0a6b`、`3a480e6`。Win32 Release 客户端、passive、control 目标构建通过，日志无编译警告。复用夹具运行 `buff-timed-life`、`buff-timed-critter`、`buff-filter-semantics`、`buff-auto-filter`、`buff-control-types`、`wander` 和 control 的 `purge`，各 1 通过、0 失败；passive 主程序退出 0 并输出 PASS。检查覆盖限时状态、关联标记、筛选、动物游荡及驱散回归；这些检查不执行状态面板绘制，也不证明敌我视角的实际 UI。日志位于 `tmp/docs-artifacts/war3/status-panel-batch/`。此前本机 Direct3D 9 设备创建失败，本批未重新启动窗口；有／无图标、敌我伪装、状态条布局、实际原版显示和窗口视觉仍待验证。


### 机械小动物敌方状态面板（待功能批次验证）

路径：`src/game_buff_panel.cpp`、`src/game_commands.cpp`、`docs/mechanical-critters.md`。敌方视角下机械小动物保持伪装，不显示自身机械标记或限时生命条；友方和其他 Buff 继续显示。合批检查自定义图标与限时生命、敌我及联盟变化、移除标记后的面板；实际原版窗口与视觉仍待验证。本次仅做差异检查，未执行功能测试。


### 无图标状态与限时生命条（待功能批次验证）

路径：`src/game_view.h`、`src/game_buff_panel.cpp`、`docs/buff-panel.md`。状态栏只统计源图标非空的状态；没有图标的状态不显示空标题，也不缩短限时生命条，带图标路径但尚未加载的状态保留位置。合批检查有／无图标召唤 Buff、混合状态、资源加载和移除后的状态栏与生命条；实际原版窗口、资源异常和布局待验证。本次仅做差异检查，未执行功能测试。


### 召唤状态的界面图标（待功能批次验证）

路径：`src/game_buff_panel.cpp`、`docs/buff-panel.md`。单位限时生命中的非零 Buff ID 加入状态图标集合，复用源图标、说明和同编号去重；移除时随状态消失。原资源的水元素 `BHwe` 提供召唤状态图标。合批运行客户端并检查水元素、无图标 Buff、自定义 Buff、重复编号、移除和到期的状态栏及提示；实际原版显示条件、布局和窗口仍待验证。本次仅做差异检查，未执行功能测试。


### Buff 分类与放逐合批结果

范围：`d89700e`、`b570286`、`504dbe8`。Win32 Release 客户端、passive 和 control 目标构建通过；control 测试文件既有变量遮蔽产生一条 C4456 警告。生成 passive 夹具后，`buff-auto-filter`、`buff-control-types`、`buff-filter-semantics`、`buff-timed-life`、`buff-timed-critter`、`buff-script-remove`、`buff-invalid-unit` 及 control 的 `banish-polarity`、`purge`、`flow` 各 1 通过、0 失败；passive 主程序退出 0 并输出 PASS。覆盖自动筛选、控制状态、真实放逐与联盟变化、净化及光环回归。日志和夹具位于 `tmp/docs-artifacts/war3/buff-classification-batch/`。其他特殊或自定义状态分类、复杂联盟关系、原版动态行为与实际窗口仍待验证。


### 控制状态的物理筛选（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。眩晕、冰冻吐息和相位转移在 Buff 扩展接口中不因战斗控制标记而匹配物理筛选；魔法和自动驱散分类沿用已核实结果。原版 1.27 的 `CBuffStun`、`CBuffFreezingBreath` 和 `CBuffPhaseShift` 对物理类型虚函数返回零。合批运行 `war3_passive_tests <data-root> <fixture> buff-control-types`，并回归真实控制效果和 Buff 自动筛选；其他特殊状态与原版动态行为待验证。本次未执行功能测试。


### 放逐状态的动态正负分类（待功能批次验证）

路径：`src/session.h`、`src/session_spell_natives.cpp`、`src/session_caster_spells.cpp`、`tests/control_tests.cpp`。放逐状态根据目标玩家对施法玩家的当前联盟关系确定正负分类，脚本 Buff 查询／清除与净化目标判断使用同一结果。原版 1.27 `CBuffBanish` 的 `0x6f5ccbd0` 查询玩家联盟，`0x6f4bf180` 返回相反分类。合批运行 `war3_control_tests <data-root> <fixture> banish-polarity`，回归净化与 Buff 筛选；联盟变动时序、复杂驱散、原版动态与窗口待验证。本次未执行功能测试。


### Buff 自动驱散筛选（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。自动驱散筛选同时作用于查询、计数和清除，已核实的眩晕、末日、相位、护盾及持续施法状态按原版魔法分类处理；放逐在脚本接口的空施法来源下不匹配自动驱散。原版 1.27 的状态虚函数 `0x6f3dcd20` 使用魔法分类，`CBuffBanish` 使用 `0x6f49f660` 单独判断来源。合批运行 `war3_passive_tests <data-root> <fixture> buff-auto-filter`，并回归扩展筛选、光环和普通驱散；未逐一核实的自定义和特殊状态分类、原版动态行为待验证。本次未执行功能测试。


### 特殊 Buff 状态合批结果

范围：`0938b89`、`3d006bc`、`ce45bb6`。Win32 Release 客户端、passive、control 和 spell 目标构建通过，无编译警告；首次构建命令误用了不存在的 `war3_summon_tests` 目标，随后构建了实际的 spell 目标。生成 passive 夹具后，`buff-timed-life`、`buff-timed-critter`、`buff-filter-semantics`、`buff-invalid-unit`、`buff-script-remove`、`attribute-item-signed` 以及 control 的 `flow`、`purge`、`item-control` 各 1 通过、0 失败；passive 主程序退出 0 并输出 PASS，覆盖真实多光环筛选、清除和重新施加。机械小动物测试构造了与召唤相同的关联状态，实际召唤链路未在本批执行；spell 目标仅构建。日志和夹具位于 `tmp/docs-artifacts/war3/buff-special-batch/`。特殊限时 Buff、原版动态事件及实际窗口仍待验证。


### 光环状态的扩展筛选（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。光环按非魔法、非物理且不符合自动驱散筛选的状态处理；开启光环筛选并关闭不兼容条件时仍可查询和移除，存活光环来源继续重新施加。原版 1.27 `CBuffAuraDevotion` 的相应虚函数报告光环标记，以及魔法、物理和自动驱散筛选为假。合批运行 `war3_passive_tests <data-root> <fixture>`，覆盖多光环查询、筛选、移除及重新施加；其他特殊光环和原版动态行为待验证。本次未执行功能测试。


### 机械小动物的限时状态（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`src/session_entities.cpp`、`tests/passive_tests.cpp`。机械小动物共享同一 Buff 编号的标记与限时生命按一个限时状态查询和清除；通过扩展清除接口或 `UnitRemoveAbility` 移除时同步释放关联状态。原版 1.27 `CBuffMechanicalCritter` 虚函数将其识别为正面限时状态。合批运行 `war3_passive_tests <data-root> <fixture> buff-timed-critter`，回归限时生命、实际机械小动物召唤和驱散；原版动态事件与视觉待验证。本次未执行功能测试。


### 限时生命状态的扩展筛选（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。限时生命作为正面、非魔法、非物理状态参与扩展 Buff 接口；负面、魔法、物理或自动驱散筛选不会错误匹配，关闭限时生命筛选时也不匹配。原版 1.27 `CBuffTimedLife` 的虚函数分别报告正面状态、非魔法、非物理与限时生命；自动筛选函数返回其魔法分类。合批运行 `war3_passive_tests <data-root> <fixture> buff-timed-life`，回归召唤时限、Buff 筛选与移除；特殊限时 Buff、事件和原版动态行为待验证。本次未执行功能测试。


### Buff 脚本接口合批结果

范围：`825098b`、`769c15b`、`c5d90d0`。Win32 Release 客户端、passive、control 目标构建通过，日志无编译警告。生成 passive 夹具后，`buff-invalid-unit`、`buff-script-remove`、`buff-filter-semantics`、`attribute-item-signed` 及 control 的 `flow`、`purge` 各 1 通过、0 失败；passive 主程序退出 0 并输出 PASS。覆盖失效句柄、脚本清除、正负与魔法／物理筛选、属性物品、光环及控制驱散回归。日志与夹具位于 `tmp/docs-artifacts/war3/buff-native-batch/`。同时具有魔法和物理属性的状态、自动驱散筛选、特殊状态生命周期、原版动态行为及实际窗口仍待验证。


### 扩展 Buff 接口筛选（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。扩展接口的魔法和物理参数分别作为筛选条件；查询在正负参数相同时包含两类状态，清除仍按正负参数选择。普通 `UnitRemoveBuffs` 不施加魔法或物理筛选。原版 1.27 的 `0x6f46e6c0`、`0x6f46e708` 处理查询筛选，`0x6f471448`、`0x6f4714a4` 处理清除筛选。合批运行 `war3_passive_tests <data-root> <fixture> buff-filter-semantics` 及失效句柄、脚本清除、光环回归；同时具有魔法和物理属性的状态、自动驱散及原版动态行为待验证。本次未执行功能测试。


### 脚本清除不可驱散状态（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。`UnitRemoveBuffs` 和未启用自动驱散筛选的 `UnitRemoveBuffsEx` 移除符合条件的状态，即使状态不可被普通驱散；正负选择继续生效。原版 1.27 的清除流程 `0x6f4714cc` 仅在启用自动驱散筛选时调用能力筛选虚函数，脚本入口在 `0x6f1fb10f` 和 `0x6f1fb13f` 允许清除匹配状态。合批运行 `war3_passive_tests <data-root> <fixture> buff-script-remove`，回归普通驱散与光环；自动驱散筛选细节、特殊状态生命周期和原版动态行为待验证。本次未执行功能测试。


### Buff 扩展接口的失效单位（待功能批次验证）

路径：`src/session_spell_natives.cpp`、`tests/passive_tests.cpp`。`UnitRemoveBuffsEx`、`UnitHasBuffsEx` 和 `UnitCountBuffsEx` 对空、已移除或类型不匹配的单位安全返回，查询结果为零；有效单位继续按所选条件查询与移除。原版 1.27 入口 `0x6f1fb130`、`0x6f1fad50`、`0x6f1faa40` 对解析失败的单位直接返回。合批生成 passive 夹具并运行 `war3_passive_tests <data-root> <fixture> buff-invalid-unit`，回归已有 Buff 与光环场景；原版动态行为和全部筛选条件待验证。本次未执行功能测试。


### 属性物品与经验边界合批结果

范围：`e1b236c`、`5e130c6`、`76bcab6` 及本批修复 `754c64a`。Win32 Release 客户端、revival、passive、control、commerce 目标构建通过，日志无编译警告。生成 passive 和复合物品夹具后，`attribute-item-signed`、`attribute-item-resource`、`hero-xp-delta-overflow`、`hero-xp`、`hero-level-negative-xp`、`hero-level-tome`、`hero-attribute-growth`、`hero-attribute-resource`、`item-combined` 各 1 通过、0 失败；passive 和 commerce 回归程序均退出 0 并输出 PASS。负属性书首次运行被使用入口拦截，修复普通及复合物品校验后通过；复合物品测试首次使用旧夹具失败，按当前脚本重建后通过。夹具和日志位于 `tmp/docs-artifacts/war3/signed-item-xp-batch/`。原版动态数值、生命魔法下降边界、更多地图与实际窗口仍待验证。


### 有符号属性物品使用校验（本批修复）

路径：`src/session_item_use.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`。普通及复合永久属性物品允许有符号属性字段，其他物品数值、魔法消耗和冷却沿用原校验。合批首次运行 `attribute-item-signed` 时普通负属性书在使用入口被拒绝；修复后重测该场景，并覆盖带资源效果的复合属性书与普通物品回归。


### 英雄经验差值的整数边界（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。`SetHeroXP` 和 `SetHeroLevel` 使用 32 位有符号差值判断经验增加，极端负经验与目标经验相减回绕为非正数时不更新，正常正差值继续生效。原版 1.27 分别在 `0x6f1f5947` 和 `0x6f1f5859` 执行 32 位减法并检查有符号结果。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-xp-delta-overflow`，回归普通英雄经验和等级设置；原版动态与极值转换精度待验证。本次未执行功能测试。


### 属性书的生命与魔法比例（待功能批次验证）

路径：`src/session_equipment.cpp`、`tests/passive_tests.cpp`。消耗永久属性物品调整力量或智力后保留已有生命和魔法比例，零魔法上限按零比例处理。原版 1.27 `CAbilityAttributeBonus` 的 `0x6f53f6d1` 至 `0x6f53f6f9` 以比例模式应用三项属性，分别进入属性更新流程。合批生成 passive 夹具并运行 `war3_passive_tests <data-root> <fixture> attribute-item-resource`，核对力量书和智力书；负属性书、零上限、复合物品、原版动态和窗口待验证。本次未执行功能测试。


### 物品与技能的有符号属性加成（待功能批次验证）

路径：`src/session_equipment.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`。装备和属性技能的三项加成按单个能力向零截取整数后叠加；永久属性物品接受负值，按有符号整数更新基础属性。原版 1.27 `CAbilityAttributeMod` 与 `CAbilityAttributeBonus` 的 `0x6f53f710`、`0x6f53f5f0` 分别把各字段经 `0x6f052f30` 转为整数。合批生成 passive 夹具并运行 `war3_passive_tests <data-root> <fixture> attribute-item-signed`，回归普通属性书、装备、技能等级及实际地图；原版动态和界面待验证。本次未执行功能测试。


### 英雄成长与资源合批结果

范围：`9e41ebb`、`91466d1`、`2476f2e`。Win32 Release 客户端、revival、control、passive 和 research 目标构建通过；control 测试文件既有变量遮蔽产生一条 C4456 警告。复用夹具运行 `hero-attribute-growth`、`hero-attribute-resource`、`hero-attribute-zero-mana`、`hero-attribute-base`、`hero-attribute-negative`、`hero-level-negative-xp`、`hero-level-tome`、`hero-skill-availability`，各 1 通过、0 失败；`hero-attribute-handles` 1 通过、0 失败，passive 与 research 程序均退出 0 并输出 PASS。覆盖正负基础属性与小数成长、资源比例、零魔法上限以及装备被动与科技回归。日志位于 `tmp/docs-artifacts/war3/hero-growth-resource-batch/`；真实装备与负属性叠加、资源下降和死亡、自定义小数基础值、原版动态和实际面板仍待验证。


### 零魔法上限的英雄属性变化（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。最大魔法为零时，非永久提高智力会产生新的魔法上限，当前魔法保持为零。原版 1.27 的 `0x6f6530ca` 通过 `0x6f399060` 获取魔法比例，该函数对零上限返回零。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-attribute-zero-mana` 并回归属性资源比例；原版动态与实际窗口待验证。本次未执行功能测试。


### 英雄属性变化的生命与魔法（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。`SetHeroStr`／`SetHeroInt` 的非永久设置在上限变化时保留当前生命／魔法比例；永久设置沿用增加或扣除上限差值的处理。原版 1.27 `0x6f50d08e` 将布尔参数映射为资源更新模式，`0x6f6331a2` 按原比例计算新资源，`0x6f6330c2` 处理差值模式。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-attribute-resource`，回归装备和属性设置；资源下降、死亡、零魔法及原版动态行为待验证。本次未执行功能测试。


### 英雄属性的小数成长（待功能批次验证）

路径：`src/entities.h`、`src/session_hero.cpp`、`src/session_research.cpp`、`src/game_commands.cpp`、`tests/revival_tests.cpp`。基础属性按整数基础值加累计成长的整数部分计算，设置负值及后续升级时保留成长余量；脚本查询、战斗属性和面板共享计算结果。原版 1.27 `0x6f668ff0` 将基础整数与累计成长转换后的整数相加。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-attribute-growth`，回归英雄属性、升级和装备；自定义小数基础值、极值、原版动态和实际面板仍待验证。Win32 Release 客户端与 revival 测试目标编译通过，日志 `tmp/docs-artifacts/war3/hero-growth/build.log`；本次未执行功能测试。


### 英雄经验与属性合批结果

范围：`c279409`、`434d9fb`、`8569ff4`。Win32 Release 客户端、revival、control、commerce、passive 目标构建通过；control 测试文件既有局部变量遮蔽产生一条 C4456 警告。复用夹具运行 `hero-level-negative-xp`、`hero-attribute-base`、`hero-attribute-negative`、`hero-xp`、`hero-skill-cap`、`hero-skill-modify`、`hero-level-tome`，各 1 通过、0 失败；`hero-attribute-handles` 1 通过、0 失败，commerce 和 passive 程序均退出 0 并输出 PASS。覆盖当前等级经验恢复、三属性及加成、负属性、英雄句柄、技能点、升级之书、商店与装备被动回归。日志位于 `tmp/docs-artifacts/war3/hero-attributes-batch/`，夹具分别来自 `hero-class-batch/`、`control-spells/` 和 `cast-buff-aura-batch/`。真实装备与负属性叠加、资源更新、极值、原版动态行为与窗口仍待验证。


### 英雄负属性查询与恢复（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。英雄属性设置接受支持范围内的负值，基础及含加成查询返回有符号结果，再设置正值可恢复；战斗衍生属性沿用现有下限。原版 1.27 的 `SetHeroStr` 调用 `0x6f67c090` 将目标差值加入属性，`GetHeroStr` 的 `0x6f668ff0` 返回有符号计算结果。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-attribute-negative`，覆盖三属性负值、加成和恢复；极值、资源变化及原版动态行为待验证。本次未执行功能测试。


### 英雄属性设置与额外加成（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。`SetHeroStr`／`Agi`／`Int` 的两种布尔参数均调整基础属性并保留额外加成，基础属性的小数成长余量继续保留。原版 1.27 的力量设置 `0x6f67c090` 用目标值减当前基础值，`0x6f50a080` 将差值加入基础属性；另外两项及参数对资源更新的细节仍需动态对照。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-attribute-base`，并回归英雄属性及装备；属性负值、生命魔法效果和实际界面待验证。本次未执行功能测试。


### 当前等级的英雄经验门槛（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。`SetHeroLevel` 对当前等级恢复低于等级门槛的经验，不重复升级或发放技能点；低于当前等级的目标仍不改变英雄。原版 1.27 `0x6f1f5835` 至 `0x6f1f585d` 检查目标等级不低于当前等级并按经验差执行。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-level-negative-xp`，回归 `hero-xp` 和负经验场景；暂停经验、等级事件和原版动态行为待验证。本次未执行功能测试。


### 英雄技能学习合批结果

范围：`3afa446`、`06b7fb5`、`e430852`。Win32 Release 客户端与 revival 测试目标构建通过。复用英雄复活夹具运行 `hero-skill-availability`、`hero-skill-command-state`、`hero-illusion-learning`、`hero-skill-cap`、`hero-skill-modify`、`hero-learn-tooltip`、`hero-xp`，各 1 通过、0 失败；复活主流程 4 通过、0 失败。覆盖玩家技能禁用与恢复、暂停与恢复、幻象标记下的学习按钮、技能点、说明和复活回归。构建及测试日志位于 `tmp/docs-artifacts/war3/hero-learning-batch/`，夹具位于 `tmp/docs-artifacts/war3/hero-class-batch/hero.w3m`。AI 学习、实际幻象创建、其他单位状态、原版动态行为与窗口显示仍待验证。


### 英雄幻象的学习按钮（待功能批次验证）

路径：`src/session_ability_commands.cpp`、`tests/revival_tests.cpp`。英雄幻象的技能学习按钮与学习入口一致，显示为不可用；真实英雄仍按技能点与等级判断。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-illusion-learning`，检查幻象标记下按钮和学习入口以及恢复真实英雄状态；实际幻象创建、原版界面和窗口显示待验证。本次未执行功能测试。


### 英雄学习命令的单位状态（待功能批次验证）

路径：`src/player_commands.cpp`、`tests/revival_tests.cpp`。玩家学习命令执行时复用学习按钮的单位状态与等级检查，暂停、隐藏、死亡或变形等状态不能通过过期命令绕过界面；脚本学习入口保留独立逻辑。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-skill-command-state`，检查暂停、恢复和学习；其他单位状态及原版动态命令时序待验证。本次未执行功能测试。


### 英雄技能禁用与学习（待功能批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。玩家禁用的英雄技能不能通过玩家命令、`SelectHeroSkill` 或 AI 学习，重新启用后可以学习。原版 1.27 的 `SetPlayerAbilityAvailable` 与学习检查分别在 `0x6f229900`、`0x6f2097e0` 写入和读取同一状态位。合批运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-skill-availability`，核对按钮、玩家命令、脚本入口和重新启用；AI、原版动态行为及实际窗口仍待验证。本次未执行功能测试。


### 英雄分类与命令说明合批结果

范围：`2dedda4`、`219efa9`、`eccfbf9`。Win32 Release 客户端、revival、research、commerce、AI 目标构建通过，日志未发现编译警告。重新生成夹具后，revival 的 `repair-command-tooltip`、`harvest-command-tooltip`、`shop-item-tooltip`、`hero-names` 各 1/1；research、commerce 和原版 BootyBay 人族 AI 30 秒初始化各输出 1 条 PASS。覆盖跨大小写自定义单位、未知英雄 ID、真实英雄幻象、工人说明和基础 AI 发展。修理说明首次运行因夹具覆盖原型 `Arep` 而非农民实际使用的派生能力 `Ahrp` 失败；调整夹具并重建后通过。日志和夹具位于 `tmp/docs-artifacts/war3/hero-class-batch/`，构建日志为 `tmp/docs-artifacts/war3/hero-class-batch-build.log`。跨大小写自定义英雄训练与 AI 完整流程、其他地图、原版动态及实际窗口仍待验证。

### 自定义单位英雄类型（待批次验证）

路径：`src/session_entities.cpp`、`src/session_game.cpp`、`src/session_ai_economy.cpp`、`src/session_commerce.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。英雄创建、训练和 AI 类型判定使用实际单位 ID 首字节，`IsHeroUnitId` 同样对未知 ID 按字节判断。1.27 `Game.dll` 的 `IsHeroUnitId` `0x6f1e7b50`、`IsUnitIdType` `0x6f1e8703` 和创建入口 `0x6f66d2fb` 均检查实际 ID。待生成研究夹具并运行 `war3_research_tests <data-root> <fixture>`，检查跨大小写继承、未知 ID、实例及类型查询，并回归训练、AI 和原版动态；本次未执行测试。

### 英雄幻象的类型判定（待批次验证）

路径：`src/session_entities.cpp`、`tests/commerce_tests.cpp`。`IsUnitType` 对英雄幻象的 `UNIT_TYPE_HERO` 返回 false；真实英雄和 `IsUnitIdType` 的原类型判定保持各自行为。1.27 `Game.dll` 的 `IsUnitType` 跳表将类型 0 交给 `0x6f1e7af0`，该函数检查英雄类型并排除幻象标志 `0x40000000`。待生成 commerce 夹具并运行 `war3_commerce_tests <data-root> <fixture>`，检查法杖生成的真实幻象、原英雄及类型 ID，并回归地图过滤、战斗与原版窗口；本次未执行测试。

### 工人与中立命令说明（待批次验证）

路径：`src/session_commerce.cpp`、`tests/generate-revival-fixture.py`、`tests/revival_tests.cpp`。修理、缠绕金矿、侦察及商店选购者按钮按能力等级读取完整说明，并解析地图字符串和对象字段；采集与返还使用同一读取流程。待生成复活夹具并运行 `war3_revival_tests <data-root> <hero-revival-fixture> repair-command-tooltip`，回归采集、商店和原版窗口；本次未执行测试。

### 命令提示文本合批结果

范围：`ebdebff`、`15bd525`、`fde1c3c`。Win32 Release 客户端、revival、research、commerce、harvest 目标构建通过，日志未发现编译警告。重新生成夹具后，revival 的 `harvest-command-tooltip`、`shop-item-tooltip`、`custom-ability-tooltip`、`hero-learn-tooltip` 各 1/1；research、commerce、harvest 各输出 1 条 PASS。覆盖对象字段中的 WTS 文本及百分比、商店与库存提示、亡灵采集／返还按钮源说明和对应玩法回归。夹具和日志位于 `tmp/docs-artifacts/war3/command-tooltip-batch/`，构建日志为 `tmp/docs-artifacts/war3/command-tooltip-batch-build.log`。其他种族、复杂地图覆盖、原版动态及实际窗口仍待验证。

### 采集与返还资源说明（待批次验证）

路径：`src/session_commerce.cpp`、`tests/revival_tests.cpp`。采集与返还资源按钮分别读取能力的 `Ubertip` 和 `Unubertip`，并解析地图字符串和对象字段；源说明为空时使用按钮标题。固定版 `War3Patch.mpq` 的亡灵采集能力 `Aaha` 提供两条独立说明。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> harvest-command-tooltip`，并回归各族采集、地图覆盖、资源返还和实际窗口；本次未执行测试。

### 商店物品说明字段（待批次验证）

路径：`src/session_commerce.cpp`、`tests/revival_tests.cpp`。商店商品说明复用库存物品说明的对象字段和 WTS 展开；单位生产与建筑按钮同样使用该商品数据。固定版 `War3Patch.mpq` 的召回权杖 `amrc/Ubertip` 包含 `<AIrt,DataA1>`。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> shop-item-tooltip`，比较商店商品和库存提示，并回归商店、地图覆盖和实际窗口；本次未执行测试。

### 提示字段中的 WTS 引用（待批次验证）

路径：`src/session_ability_commands.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。技能、研究、物品和状态提示展开对象字段时，继续解析字段值中的地图 WTS 引用，再执行百分比转换。待生成研究夹具并运行 `war3_research_tests <data-root> <fixture>`，核对字段引用中的 WTS、逗号、数值与未找到的引用，并回归技能和状态提示及实际窗口；本次未执行测试。

### 技能与研究分级文本合批结果

范围：`5e6e94a`、`0d7ba4f`、`401a036`。Win32 Release 客户端、revival、research、spell 目标构建通过，日志未发现编译警告。重新生成夹具后，revival 的 `custom-ability-tooltip`、`custom-ability-title`、`ability-tooltip`、`hero-learn-tooltip`、`hero-names`、`hero-level-tome` 各 1/1；research 和 spell 各输出 1 条 PASS。覆盖分级自定义名称／说明中的逗号、字段展开、科技图标／热键、父级覆盖继承、原版技能说明及研究队列。夹具和日志位于 `tmp/docs-artifacts/war3/profile-level-batch/`，构建日志为 `tmp/docs-artifacts/war3/profile-level-batch-build.log`。WTS 多级组合、实际窗口和原版动态对照仍待验证。

### 研究按钮的分级文本（待批次验证）

路径：`src/object_data.h/.cpp`、`src/session_research.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。科技按钮按等级读取自定义名称、说明、图标和热键，保留文本逗号并展开说明中的对象字段；未覆盖等级继承源数据。待生成研究夹具并运行 `war3_research_tests <data-root> <fixture>`，回归研究队列、分级数据、WTS、地图继承和实际窗口；本次未执行测试。

### 自定义技能的分级标题（待批次验证）

路径：`src/object_data.cpp`、`src/session_ability_commands.cpp`、`tests/generate-revival-fixture.py`、`tests/revival_tests.cpp`。技能按钮标题按等级读取自定义完整文本并保留逗号，未覆盖等级从源 Profile 获取；学习标题使用其共享字段。待生成复活夹具并运行 `war3_revival_tests <data-root> <hero-revival-fixture> custom-ability-title`，回归技能说明、其他等级标题、WTS 和实际窗口；本次未执行测试。

### 自定义技能的分级说明（待批次验证）

路径：`src/object_data.h/.cpp`、`src/session_ability_commands.cpp`、`tests/generate-revival-fixture.py`、`tests/revival_tests.cpp`。技能按钮按等级读取自定义说明的完整文本，并从原始 Profile 解析未覆盖等级；说明内普通逗号和对象字段引用不参与等级切分。待生成复活夹具并运行 `war3_revival_tests <data-root> <hero-revival-fixture> custom-ability-tooltip`，回归源数据、继承、WTS、多级文本和实际窗口；本次未执行测试。

### 英雄姓名与技能说明合批结果

范围：`63e6c51`、`de68272`、`5954b8b`。Win32 Release 客户端、revival、spell、clock 目标构建通过，日志未发现编译警告。revival 的 `hero-names`、`hero-learn-tooltip`、`ability-tooltip`、`hero-level-event`、`hero-negative-xp`、`hero-level-tome` 各 1/1，spell 消费者 1 条 PASS；clock 的玩家状态快照、单位身份重建、恢复包随机池各 1/1。姓名池首次测试误将圣骑士 15 个分配槽视为 15 个不同文本；实际安装的源列表为 14 项，原版按列表长度取模。校正夹具后通过，并补查旧版玩家状态、损坏数据拒绝和恢复后的姓名选择。夹具及日志位于 `tmp/docs-artifacts/war3/hero-name-tooltip-batch/`，构建日志为 `tmp/docs-artifacts/war3/hero-name-tooltip-batch-build.log`。自定义技能文本、战役及联机随机流、原版动态和实际窗口仍待验证。

### 施法说明中的逗号（待批次验证）

路径：`src/object_data.h/.cpp`、`src/session_ability_commands.cpp`、`tests/revival_tests.cpp`。读取原始 Profile 字段的引号结构，单条带引号的施法说明完整保留逗号；多条等级说明继续按等级选择。固定版 `War3Patch.mpq` 中 `Apg2/Ubertip` 包含普通逗号和后续说明。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> ability-tooltip`，并回归多级暴风雪说明、地图覆盖、WTS、完整面板和原版窗口。本次未执行测试。

### 英雄学习说明中的逗号（待批次验证）

路径：`src/session_ability_commands.cpp`、`tests/revival_tests.cpp`。单条英雄学习说明完整保留普通逗号，继续展开对象字段；带引号的多等级列表及 WTS 引用沿用等级选择。固定版 `War3Patch.mpq` 的暗影猎手妖术 `AOhx/Researchubertip` 为一条含普通逗号和多个等级说明的文本。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-learn-tooltip`，并核对自定义多等级文本、WTS、完整面板及原版窗口。本次未执行测试。

### 英雄姓名池（待批次验证）

路径：`src/session.h`、`src/session_entities.cpp`、`src/session_hero.cpp`、`src/session_game.cpp`、`src/session_network_identity.cpp`、`tests/revival_tests.cpp`。按英雄类型的源 `nameCount` 选择姓名：在使用次数最少的名字中从随机起点顺序选择，复用时追加次数；移除英雄不清除历史。玩家状态快照版本 2 保存姓名历史并读取版本 1，重建单位时不再次分配姓名；会话摘要包含该历史。1.27 `Game.dll` 的 `0x6f26c800` 至 `0x6f26c8e3` 维护按类型的计数和随机选择，`0x6f50b550` 读取姓名并在重复时追加序号。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-names` 及相关 clock 恢复检查；核对战役、自定义姓名和数量、旧快照、存档、联机随机流及原版动态／窗口。本次未执行测试。

### 英雄幻象与经验物品合批结果

范围：`568bb39`、`6b6b724`（含补充 `c2a0dc6`）、`0761720`。Win32 Release 客户端、revival、commerce、game-flow 目标构建通过；game-flow 目标有两条既有 C4389 有符号／无符号比较警告。重新生成夹具后，revival 的 `hero-level-tome`、`hero-negative-xp`、`hero-level-event`、`hero-xp`、`hero-strip-skills` 各 1/1，commerce 1 条 PASS，game-flow 的 `cache-sync-unit` 1 条 PASS。覆盖真实幻象接口、经验书暂停、升级之书保留进度、负经验与后续加经验，以及负经验英雄的游戏缓存写盘／新会话读取和实验同步；缓存写入使用隔离用户目录。日志和夹具位于 `tmp/docs-artifacts/war3/hero-native-batch/`，构建日志为 `tmp/docs-artifacts/war3/hero-native-batch-build.log`。自定义多等级书、经验数值极限、原版动态对照、窗口和完整地图仍待验证。

### 升级之书经验进度（待批次验证）

路径：`src/session_equipment.cpp`、`tests/revival_tests.cpp`。升级之书按原版经验阈值和实数运算转移当前等级内的经验进度；英雄暂停经验时升级之书和经验之书不增加经验。1.27 `Game.dll` 的 `CAbilityLevelMod` 虚函数 `0x6f5309c0` 使用当前经验和相邻阈值计算目标经验，再进入 `0x6f50a9d0`；经验之书使用相同结算入口，其暂停检查位于 `0x6f50aa13`。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-level-tome`，并核对多等级、自定义阈值、满级、负经验、物品消耗、原版动态及窗口。本次未执行测试。

### 英雄负经验（待批次验证）

路径：`src/session_hero.cpp`、`src/session_cache.cpp`、`tests/revival_tests.cpp`。`AddHeroXP` 的负值按原版实数运算和取整调整经验，不降低英雄等级；后续正经验可逐步抵消负经验，不足当前等级阈值时也不派发升级事件。满级经验仍限制在最高等级阈值，缓存允许保存负经验。1.27 `Game.dll` 的 `0x6f1d9da0` 将有符号数传入经验结算，`0x6f50ac2a` 加入经验，随后仅处理升级；`0x6f054060` 加 0.5 后由 `0x6f052f30` 截断。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-negative-xp`，并验证缓存往返、数值极限、原版动态及窗口；本次未运行测试。

### 英雄幻象的成长接口（待批次验证）

路径：`src/session_hero.cpp`、`tests/commerce_tests.cpp`。英雄幻象不接受英雄经验、等级、属性、技能点、技能学习及暂停经验接口的修改；对应查询返回零、空名称或暂停状态。1.27 `Game.dll` 的 `IsUnitIllusion` 使用单位标志 `0x40000000`，上述英雄接口入口均检查该标志。待生成 commerce 夹具并运行 `war3_commerce_tests <data-root> <fixture>`，通过幻象法杖生成的真实单位核对查询和修改，并回归普通英雄；技能表现、地图脚本、原版动态和窗口仍待验证。本次未执行测试。

### 英雄技能点与降级合批结果

范围：`2fb320d`、`4ae8be8`、`8d5f3a2`。Win32 Release 客户端、revival、clock 目标构建通过，构建日志未发现编译警告。生成复活夹具后，revival 的 `hero-skill-cap`、`hero-skill-modify`、`hero-strip-skills`、`hero-level-event`、`hero-level-visual`、`hero-xp`、`awaken` 及 clock 的 `player_resource_natives_follow_original_bounds` 各 1 通过、0 失败，未加载 Game.dll。前两项首次运行因夹具错误假定新英雄初始技能点为零而失败，显式设置测试初始条件后重建并通过；其他场景未改变，复用原结果。日志和夹具位于 `tmp/docs-artifacts/war3/hero-skills-batch/`，构建日志为 `tmp/docs-artifacts/war3/hero-skills-batch-build.log`。多技能降级并列、技能书借用、被动状态、极值与原版动态对照、实际窗口及完整地图仍待验证。

### 英雄降级技能调整（待批次验证）

路径：`src/session.h`、`src/session_hero.cpp`、`tests/revival_tests.cpp`。`UnitStripHeroLevel` 按等级逐步降低英雄属性和经验，先移除不满足新等级的技能等级；没有强制移除时扣除未分配技能点，点数不足时降低已学等级最高的技能。原版 1.27 `Game.dll` 的 `0x6f50dd30` 至 `0x6f50df40` 包含技能要求、点数及最高等级技能处理；`0x6f50df50` 逐级调用。待执行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-strip-skills`，并检查多技能、并列、技能书借用、被动状态、超大次数、原版动态及窗口。本次未执行测试。

### 英雄技能点增减边界（待批次验证）

路径：`src/session.h`、`src/session_hero.cpp`、`tests/revival_tests.cpp`。`UnitModifySkillPoints` 将扣除量限制到已有点数，将单次增加量限制为前五个英雄技能剩余可学等级；零变更返回 false。1.27 `Game.dll` 的 `0x6f50c280` 至 `0x6f50c31f` 包含上述限制及返回分支。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-skill-modify`，并回归 `hero-skill-cap` 与 `hero-xp`；负数溢出、原版动态行为和自定义技能组合待验证。本次未执行测试。

### 英雄升级技能点上限（待批次验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`。英雄升级后，未分配技能点限制为前五个英雄技能尚可学习的等级总数；英雄没有可学技能时上限为零。原版 1.27 `Game.dll` 在 `0x6f50ad5b` 遍历五个技能槽，按最大等级减去已学等级累加，并在 `0x6f50ada2` 限制技能点。待运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-skill-cap`，并验证多技能、重训、额外技能点、地图覆盖和升级事件观察值；原版动态对照和窗口待验。本次未执行测试。

### 尸体与英雄成长合批结果

范围：`806c444`、`77aaa4b`、`13c7cdd`。Win32 Release 客户端及 corpse、revival、clock 测试目标构建通过，构建日志未发现编译警告。重新生成夹具后，corpse 的 `animation-lifecycle`、`decay`、`flow`，revival 的 `hero-level-visual`、`hero-level-event`、`hero-xp`、`awaken`，以及 clock 的 `player_resource_natives_follow_original_bounds` 各 1 通过、0 失败。clock 首次运行因精简测试脚本缺少 `effect` 类型失败，补充类型后重建并通过。日志与夹具位于 `tmp/docs-artifacts/war3/hero-level-batch/`，构建日志为 `tmp/docs-artifacts/war3/hero-level-batch-build.log`。本批未加载 Game.dll；原版动态事件／经验书／自定义视觉、英雄特殊尸体、实际窗口和完整地图仍待验证。

### 英雄跨级事件（待批次验证）

路径：`src/session_hero.cpp`、`tests/generate-revival-fixture.py`、`tests/revival_tests.cpp`。一次经验变更先完成跨级与属性更新，再派发一次升级事件；事件回调可继续升级或移除英雄。原版 1.27 `Game.dll` 在 `0x6f50ac3f` 升级循环后经 `0x6f50adca` 进入事件 `0x8024e`。待重新生成复活夹具并运行 `war3_revival_tests <data-root> <hero-revival-fixture> hero-level-event`，覆盖跨级、未跨级、回调重入和移除；另核对玩家事件、击杀、经验书和原版窗口事件时序。本次未执行测试。

### 英雄升级效果（待批次验证）

路径：`src/session.h`、`src/session_hero.cpp`、`tests/revival_tests.cpp`。英雄升级使用源 `AHer` 的施法者效果；脚本经验和等级接口按 `showEyeCandy` 控制，一次跨越多个等级创建一次效果。1.27 `Game.dll` 的 `0x6f50ac3f` 至 `0x6f50ad35` 显示升级循环结束后按参数触发一次表现，三个脚本入口传入该参数。待执行 Win32 Release 客户端及 `war3_revival_tests <data-root> <hero-revival-fixture> hero-level-visual`；核对真假参数、未升级、跨多级、暂停、击杀和经验书、回调重入、效果生命周期及原版窗口表现。本次未运行测试；事件时序和自定义效果列表仍待核对。

### 陷阱守卫状态恢复（待阶段验证）

路径：`src/session.h`、`src/session_wards_roar.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 97/97 通过；原版 Orc01 会话人工设置科技并施放静止陷阱，激活前隔离恢复，临时绕过启动保护续行 11 秒后目标眩晕，71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/ward-recovery/`。怪物诱饵、实际读档、自然对局、原版时序与窗口画面待阶段验证。

### 修补匠技能恢复（待阶段验证）

路径：`src/session.h`、`src/session_tinker.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 96/96 通过；原版 Orc01 会话人工施法后的工厂、火箭与自爆隔离恢复，临时绕过启动保护续行，三种情况各为 71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/tinker-recovery/`。实际读档、自然对局、原版时序与窗口画面待阶段验证。

### 不稳定化合物飞行恢复（待阶段验证）

路径：`src/session.h`、`src/session_concoction.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 93/93 通过；原版 Orc01 会话人工施法后隔离恢复，临时绕过启动保护续行 2 秒，命中和目标失效两种情况均为 71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/concoction-recovery/`。实际读档、自然对局、原版时序与窗口画面待阶段验证。

### 救援范围与成员恢复（待阶段验证）

路径：`src/session.h`、`src/session_ownership.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 92/92 通过；基于原版地图资源的隔离脚本恢复后临时绕过启动保护，检查原地不重复触发、离开再进入再次触发，71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/rescue-recovery/`。实际读档、战役事件时序与窗口画面待阶段验证。

### 反召唤部分退款恢复检查（待阶段验证）

路径：`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 91/91 通过；原版 Orc01 会话人工创建建筑并启动反召唤，在部分退款、工人死亡后隔离恢复；临时绕过启动保护续行 12 秒，建筑移除、累计返还 75 金和 25 木，70/70 项状态一致。日志位于 `tmp/docs-artifacts/war3/unsummon-recovery/`。实际读档、自然对局、原版时序和窗口画面待阶段验证。

### 熔岩之子恢复（待阶段验证）

路径：`src/firelord.h`、`src/session.h`、`src/session_lava_spawn.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 90/90 通过；原版 Orc01 会话人工施法并设置分裂条件后隔离恢复，临时绕过启动保护续行 1 秒，生成第二个单位且 71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/lava-spawn-recovery/`。实际读档、自然命中累计、原版规则与窗口画面待阶段验证。

### 凤凰火焰恢复（待阶段验证）

路径：`src/session.h`、`src/session_phoenix_fire.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 89/89 通过；原版 Orc01 会话人工创建凤凰和敌人，确认目标燃烧后隔离恢复，临时绕过启动保护续行 3 秒，71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/phoenix-fire-recovery/`。实际读档、自然战斗、伤害时序与窗口画面待阶段验证。

### 重生与凤凰蛋恢复（待阶段验证）

路径：`src/session.h`、`src/session_rebirth.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 88/88 通过；原版 Orc01 会话人工触发重生和变蛋后隔离恢复，临时绕过启动保护续行 12 秒，71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/death-restart-recovery/`。实际读档、凤凰火焰、事件时序与窗口画面待阶段验证。

### 元素分身恢复（待阶段验证）

路径：`src/session.h`、`src/session_spirit_split.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 87/87 通过；原版 Orc01 会话人工施法后隔离恢复，临时绕过启动保护续行 2 秒和 65 秒，均为 71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/spirit-split-recovery/`。实际读档、自然战斗、成员全灭与窗口画面待阶段验证。

### 镜像分身变身恢复（待阶段验证）

路径：`src/session.h`、`src/session_mobility.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 86/86 通过；原版 Orc01 会话人工施法后隔离恢复，临时绕过启动保护续行 1 秒，生成镜像且 71/71 项状态一致，日志位于 `tmp/docs-artifacts/war3/mirror-image-recovery/`。实际读档、自然战斗与窗口画面待阶段验证。

### 灵魂宝石捕获恢复（待阶段验证）

路径：`src/session.h`、`src/session_soul.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 85/85 通过；原版 Orc08 捕获格罗姆后恢复并检查释放，隔离诊断临时绕过启动保护续行 60 秒，81/81 项状态一致，日志位于 `tmp/docs-artifacts/war3/soul-capture-recovery/`。实际读档、完整战斗与窗口画面待阶段验证。

### 过场与界面状态恢复（待阶段验证）

路径：`src/session.h`、`src/session_text.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 84/84 通过；原版 HumanX01 的隔离恢复诊断临时绕过启动保护后续行 60 秒，72/72 项状态一致，日志位于 `tmp/docs-artifacts/war3/presentation-recovery/`。实际读档、过场画面与完整战役待阶段验证。

### 浮动文字恢复（待阶段验证）

路径：`src/session.h`、`src/session_text_tag.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 83/83 通过；原版 HumanX03 的隔离恢复诊断临时绕过启动保护后续行 60 秒，69/69 项状态一致，并覆盖人工加入的移动文字，日志位于 `tmp/docs-artifacts/war3/text-tag-recovery/`。实际读档、文字画面与完整战役待阶段验证。

### 单位共享视野恢复（待阶段验证）

路径：`src/session_stealth_reveal.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 82/82 通过；原版 NightElf06 的隔离恢复诊断临时绕过启动保护后续行 60 秒，76/76 项状态一致，日志位于 `tmp/docs-artifacts/war3/shared-vision-recovery/`。实际读档、窗口视觉与完整战役待阶段验证。

### 荒芜生长状态恢复（待阶段验证）

路径：`src/session_ambient_passives.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 81/81 通过；原版 Undead07 的隔离恢复诊断临时绕过启动保护后续行 60 秒，74/74 项状态一致，日志位于 `tmp/docs-artifacts/war3/blight-growth-recovery/`。实际读档、窗口视觉与完整战役待阶段验证。

### 蛛网攻击视觉恢复（待阶段验证）

路径：`src/session.h`、`src/session_effect_snapshot.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；范围见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 构建及 clock 80/80 通过；原版 Undead05 的两个采样点在隔离诊断中各续行 60 秒，74/74 项状态一致，日志位于 `tmp/docs-artifacts/war3/spider-visual-recovery/`。诊断临时绕过启动保护；实际游戏读档、视觉表现及完整战役待阶段验证。

### 默认单动作触发器续执行（待阶段验证）

路径：`src/jass_runtime.h/.cpp`、`src/session_callbacks.cpp`、`tests/session_tests.cpp`、`tests/session_thread_tests.cpp`、`tests/live_world_tests.cpp`；范围见 [脚本等待与协作线程](script-threads.md)及[战役存档状态](save-runtime-foundation.md)。Win32 Release 客户端和四个相关检查目标编译通过；会话检查 21/21、会话线程检查 6/6、JASS 线程定向检查 2/2、序章原图队列触发器检查 1/1 通过，均未加载 Game.dll。序章检查在同一会话的 120 秒静音模拟后重置队列、启动原触发器，睡眠中编码／恢复并观察队列从 1 变为 0；DotA 原图完成初始化及 2 秒静音模拟，日志在 `tmp/docs-artifacts/war3/single-serial-trigger/`。恢复期间触发器销毁、更多事件／回调与原版时序、跨运行时动作、多动作队列及完整存档仍待阶段核对。

### 睡眠脚本状态字节组件（待阶段验证）

路径：`src/snapshot_codec.h`、`src/jass_runtime.h/.cpp`、`src/session.h`、`src/session_threads.cpp`、`tests/jass_thread_tests.cpp`、`tests/session_tests.cpp`；范围见 [战役存档的脚本执行状态](save-runtime-foundation.md)。Win32 Release 客户端及两个测试目标编译通过；会话检查 20/20、线程定向检查 2/2 通过，未加载 Game.dll。隔离会话将两条睡眠动作编码、写入并读取 `tmp/docs-artifacts/war3/session-sleep-codec/sleeping-threads.bin` 后恢复执行；另检查事件字段、选择视图的编码往返、空字符串／null、函数和句柄映射、数据截断／篡改、源码不匹配及带有效摘要的超限长度。恢复选择视图的实际脚本、其他上下文字段、跨进程对象恢复、资源预算边界、实际地图和原版格式待阶段验证；该组件未连接游戏保存或读取入口。

### JASS 并行睡眠线程恢复（待阶段验证）

路径：`src/jass_runtime.h/.cpp`、`src/session.h`、`src/session_threads.cpp`、`tests/jass_thread_tests.cpp`、`tests/session_tests.cpp`；范围见 [战役存档的脚本执行状态](save-runtime-foundation.md)。Win32 Release 客户端和两个测试目标编译通过；线程检查 24/24、会话检查 20/20 通过，未加载 Game.dll。隔离运行时检查不同及相同到期时间的线程顺序，损坏批次在部分调度后完全清理；含父子等待的批次被拒绝且原线程继续执行。隔离会话的两个游戏事件动作恢复到另一会话并使用重新映射的触发器；其中一个损坏时不保留部分线程。大量线程、选择视图、更多上下文、资源预算边界与实际地图待阶段验证；线程间等待、对象图和存档文件仍未实现。

### 会话睡眠线程事件上下文（待阶段验证）

路径：`src/jass_runtime.h/.cpp`、`src/session.h`、`src/session_threads.cpp`、`tests/session_tests.cpp`、`tests/jass_thread_tests.cpp`；边界见 [战役存档的脚本执行状态](save-runtime-foundation.md)。Win32 Release 客户端及两个测试目标编译通过；会话检查 20/20、线程定向检查 4/4，未加载 Game.dll。隔离会话通过真实游戏事件启动触发器动作，睡眠后映射触发器句柄并恢复到另一会话；恢复后事件类型与目标会话触发器正确，兼容静态类型的映射冲突被拒绝，上下文恢复回调失败后线程清理及重试通过。选择视图、所有上下文字段及对象生命周期、实际地图与原版行为待阶段验证；对象图、多线程、存档文件和完整战役切区仍未实现。

### JASS 睡眠续执行的引用映射（待阶段验证）

路径：`src/jass_runtime.h/.cpp`、`tests/jass_thread_tests.cpp`；边界见 [战役存档的脚本执行状态](save-runtime-foundation.md)。Win32 Release 客户端与线程测试目标编译通过；线程测试 21/21，引用映射相关定向检查 4/4 通过。隔离 JASS 线程将重复的本地单位句柄映射到稳定编号，再映射为另一运行时的不同句柄；恢复后读取该对象并调用目标运行时的脚本函数。缺少映射、零值和相同静态类型编号冲突会拒绝恢复。游戏会话对象恢复、跨静态类型身份一致性、事件上下文、多个线程及持久化仍待实现；该检查不代表可保存战役或兼容原版存档。

### JASS 睡眠续执行基础（待阶段验证）

路径：`src/jass_runtime.*`、`src/jass_threads.*`、`src/session_threads.cpp`、`src/session_ai_natives.cpp`、`tests/jass_thread_tests.cpp`；限制见 [战役存档的脚本执行状态](save-runtime-foundation.md)。Win32 Release 客户端和线程测试目标编译通过；线程回归 18/18，随后针对扩充后的睡眠恢复／活动句柄／线程上下文检查 3/3 通过。原版 Prologue01 在更新睡眠 native 后完成 20 秒静音模拟，未加载 Game.dll，日志 `tmp/docs-artifacts/war3/prologue-continuation/sleep-continuation.log`。阶段核对持续等待、取消、不同源码与损坏数据、会话回调、多个线程和 AI；真实会话上下文与句柄、文件持久化及完整存档恢复仍未实现。

### 载入画面动画计时（待阶段验证）

路径：`src/loading_screen.h/.cpp`、`src/main.cpp`。每个载入画面从首次绘制建立独立时钟，背景动画和其声音事件使用该画面的经过时间；进度条动画继续由上传进度控制。Win32 Release 客户端增量编译通过。待游戏内 Agent 核对人族战役及普通对战从菜单停留不同时间后进入的动画、音效和切图重置，并验证实验局域网和回放载入；当前 Direct3D 9 设备创建失败，尚无本次画面或声音验收。

### 原战役载入背景（待阶段验证）

路径：`src/map_ui.h/.cpp`、`src/loading_screen.cpp`、`tests/world_tests.cpp`、`tests/live_world_tests.cpp`；来源与行为见 [原生地图与选图流程](map-loading.md)。地图 W3I 背景编号读取公共 `WorldEditData.txt` 对应模型和序列，地图显式指定的载入模型优先；普通对战沿用玩家种族模型。Win32 Release 客户端、world 和 live-world 检查程序编译通过；`war3_world_tests <data-root> <unused-output> world_loading_backdrops` 1/1，检查人族前两章、BootyBay 和自定义模型优先级；`war3_live_world_tests <data-root> <Human01.w3m> <log> loading-background` 1/1，在 CPU 路径读取原 Lordaeron 模型并选中 Human01 序列，未加载 Game.dll。游戏启动检查在创建 D3D9 设备时失败，日志位于 `tmp/docs-artifacts/war3/loading-backgrounds/client.log`；尚无本版窗口截图。其他战役序列、地图覆盖、原版时间／音效／面板和窗口比例、W3I 序章画面待阶段验证或实现。

资料片原图 CPU 检查：`war3_live_world_tests <data-root> <OrcX02.w3x> <log> loading-background OrcXQuest02` 和对应 `OrcX03a.w3x`、`OrcXAct03MissionA` 各通过 1/1，未加载 Game.dll。检查读取原模型并选择 W3I 编号对应的动画序列；实际载入画面、脚本和过场仍待阶段验证。

### 经典单位雾脚本接口（待阶段验证）

路径：`src/session_world.cpp`、`tests/world_tests.cpp`；说明见 [世界雾与计时器](world-fog-timers.md)。固定版 1.27 的 `SetUnitFog` 和旧 `SetTerrainFog` 入口均为直接返回，REA 证据 `ev_9e2ec214902ef5d8c1cb280003322eb37b40e43b98f579e41de9604a804f43b3`。客户端现允许地图调用两者并保留已有雾状态；`SetTerrainFogEx`／`ResetTerrainFog` 继续管理实际雾效。Win32 Release 客户端和 world 测试目标编译通过；`war3_world_tests <data-root> <unused-clamp-output> world_legacy_fog_natives` 在 BootyBay 原地图上下文 1/1 通过、未加载 Game.dll。开发时简化夹具因没有归档资源和完整脚本句柄类型失败，改用原地图上下文后通过。其他版本、自定义地图及真实画面仍待阶段核对。

### DotA 魅惑魔女目标与限时生命（待阶段验证）

路径：`tests/dota_heroes_tests.cpp`。DotA_v6.83d 原图隔离会话中购买魅惑魔女并学习 `A0DX`：普通敌方单位转归施法玩家，获得约 80 秒限时生命并在到期后死亡；敌方英雄不转归，受到减速并在恢复运行后到期解除。Win32 Release 测试目标编译通过；`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> enchantress-enchant` 通过，未加载 Game.dll。测试手动设置等级、位置、魔法和敌对关系，英雄目标在观察减速后解除暂停；不代表自然对局、原版数值与时序、地图自定义目标或窗口操作已验收。

### 命令子菜单游戏事件（待阶段验证）

路径：`src/session.h`、`src/session_match.cpp`、`src/game_commands.cpp`、`src/lan_simulation.cpp`、`tests/session_tests.cpp`、`tests/live_world_tests.cpp`、`tests/generate-live-world-fixture.py`；说明见 [回放命令菜单](replay-command-menus.md)。单机打开技能和建造菜单时派发各自的游戏事件；联网与实验回放在消费相应菜单动作时派发，关闭菜单不产生事件。回调执行使用注册快照并遵守触发器禁用及销毁；事件不设置玩家上下文。固定版 Game.dll 中两个游戏事件包装分别使用 `0x80209`／`0x8020a` 和空对象参数，REA 证据 `ev_56a7dc987929b385b1e1aaab0b836d5983c1c3868770008d21b22bf6b92acebb`；包装与实际按键／网络动作的完整调用时序仍待对照。Win32 Release 客户端、session、live-world 和 order-queue 测试目标编译通过，order-queue 编译有既有变量遮蔽警告；`war3_session_tests <tmp-enum-fixture>` 19/19，覆盖事件类型、顺序、禁用、销毁及上下文；在原 BootyBay 的临时脚本夹具执行 `war3_live_world_tests <data-root> <fixture> <log> menu-events` 1/1，覆盖技能、建造、Esc、关闭及重新打开的时间片，未加载 Game.dll。夹具位于 `tmp/docs-artifacts/war3/menu-events/`。实际窗口输入、双客户端同步、强制 UI 按键、地图回调重入、原版时间顺序和回放播放仍待阶段验证。

### 单位及命令编号转字符串空值（待阶段验证）

路径：`src/session_match.cpp`、`src/session_spell_natives.cpp`、`tests/session_tests.cpp`、`tests/live_world_tests.cpp`。`UnitId2String` 和 `OrderId2String` 对没有名称的编号返回 JASS null；有效名称沿用现有源表与命令表。固定版 `Game.dll` 的两个入口在结果指针为空或首字节为零时返回零，REA 证据 `ev_88674c6a02c00ab21d687ccbe555a007e17f5398332fdbaf87a140a02129ac7d`、`ev_45efccb9b7453510848ca8e78ff91847702aeed25acb4fba0b4d7c459284e196`。Win32 Release 客户端及 session／live-world 检查程序编译通过；`war3_session_tests <tmp-enum-fixture>` 18/18 通过，JASS 中核对零编号与 null 比较及 move 命令；`war3_live_world_tests <data-root> <live-world-fixture> <log>` 通过，核对未知单位编号和源步兵名称，未加载 Game.dll。枚举夹具与地图日志在 `tmp/docs-artifacts/war3/id-string-null/`。自定义单位名称、其他命令和原版实际地图边界待阶段验证；现有名称映射完整性未由本次检查证明。

### 失效脚本事件索引清理（待阶段验证）

路径：`src/session.h`、`src/session.cpp`、`src/session_tick.cpp`、`src/session_callbacks.cpp`、`tests/session_tests.cpp`、`tests/live_world_tests.cpp`。触发器事件销毁后计数，模拟步开始时按数量和占比压缩全局事件句柄索引；变量写入时移除其观察列表中的失效事件，存活事件保持登记顺序，回调使用既有派发快照。Win32 Release 客户端、session 和 live-world 测试目标编译通过；`war3_session_tests <tmp-enum-fixture>` 17/17 通过，其中变量事件场景额外创建并销毁 300 个临时触发器；`war3_live_world_tests <data-root> <live-world-fixture> <log>` 通过，在 4,096 个计时事件销毁和一次模拟步后检查空间事件注册、销毁与重新进入。测试未加载 Game.dll；枚举夹具及地图日志在 `tmp/docs-artifacts/war3/event-index-compaction/`。其他事件索引、长局对象句柄上限、运行内存与帧耗时、不同地图及重入组合仍待验证；未做性能基准。

### 触发器所属对象销毁（待阶段验证）

路径：`src/script_state.h`、`src/session.h`、`src/session.cpp`、`src/session_callbacks.cpp`、`src/session_destructables.cpp`、`src/session_script_dialogs.cpp`、`src/session_spatial_events.cpp`、`src/session_trackable.cpp`、`tests/session_tests.cpp`。事件注册时记录所属触发器；销毁触发器时直接清理其事件、动作及条件，避免遍历会话创建过的全部对象。Win32 Release 客户端、session、live-world 和 DotA 英雄测试目标编译通过；`war3_session_tests <tmp-enum-fixture>` 17/17 通过，覆盖移除／清空回调、事件派发中销毁自身和另一触发器继续执行；`war3_live_world_tests <data-root> <live-world-fixture> <log>` 及 `war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> storm-spells` 通过，未加载 Game.dll。live-world 日志及枚举夹具在 `tmp/docs-artifacts/war3/trigger-owned-cleanup/`，空间夹具在 `tmp/docs-artifacts/war3/spatial-index-registration/`。对话框、可破坏物和 trackable 事件销毁、复杂重入、大量短命触发器的长期内存／帧耗时及原版语义待阶段验证；未执行性能基准，不能据此量化帧率提升。事件索引和会话句柄记录的长期增长仍需单独处理。

### 空间事件登记索引（待阶段验证）

路径：`src/session.h`、`src/session_spatial_events.cpp`、`tests/generate-live-world-fixture.py`、`tests/live_world_tests.cpp`。区域进入／离开和单位距离事件在注册时加入独立索引；空间更新只读取这一索引并清理已销毁事件，保持注册顺序与当前轮事件快照。Win32 Release 客户端、live-world 和 DotA 英雄测试编译通过；原 BootyBay 夹具在 80 个额外单位场景覆盖事件中心被前一回调移动、离开再进入、销毁并重新注册，未发生重复；DotA 原图 `lich-spells` 与 `storm-spells` 通过，均未加载 Game.dll。夹具及日志在 `tmp/docs-artifacts/war3/spatial-index-registration/`。复杂回调重入、大量触发器长期创建／销毁、真实地图帧时间及内存仍待验证；未执行性能基准。

### DotA 巫妖技能连续流程（待阶段验证）

路径：`tests/dota_heroes_tests.cpp`。原图隔离会话酒馆购买巫妖后设置等级、坐标、生命／魔法与目标；冰霜新星造成 125 点伤害并减速，冰霜护甲提高友军护甲、令近战攻击者减速且分别到期恢复，黑暗仪式牺牲友军并恢复魔法，连环霜冻伤及两个敌人。Win32 Release 测试目标编译通过；`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> lich-spells` 通过，未加载 Game.dll。测试手动重置冷却并暂停其他单位；多等级、目标类别、完整弹射与技能时序、真实对局、窗口、音效和原版数值待阶段核对。

### 单位距离事件空间索引（待阶段验证）

路径：`src/session_spatial_events.cpp`、`tests/generate-live-world-fixture.py`、`tests/live_world_tests.cpp`。多个单位距离事件共享本次空间更新的单位网格，候选通过原距离判定和句柄排序；单个事件、网格范围大于直接扫描成本的事件及非有限中心坐标使用直接扫描。每次事件派发后使网格失效，后续事件重新读取回调后的单位位置与生命周期；区域事件继续扫描现有区域成员。Win32 Release 客户端及两个测试目标编译通过；原 BootyBay 脚本夹具生成 80 个额外单位，检查前一个距离事件移动后一个事件的中心、静止不重复和离开后重新进入，通过；`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> storm-spells` 通过，均未加载 Game.dll。夹具由 `python tests/generate-live-world-fixture.py --data-root <data-root> --output <tmp-fixture>` 生成，记录在 `tmp/docs-artifacts/war3/spatial-index/`。真实地图大量事件、边界坐标、复杂回调及帧时间／内存仍待阶段验证；未做性能基准，不能据此给出帧率提升。

### 风暴之灵超负荷与球形闪电（待阶段验证）

路径：`tests/dota_heroes_tests.cpp`。DotA_v6.83d 原图隔离会话中，酒馆购买英雄后设置等级／位置／魔法并重置冷却；学习技能后施放残影并攻击，超负荷对附近敌人造成 30 点伤害与减速，未伤及友军，第二次普通攻击不再触发范围伤害。球形闪电产生位移、伤害和魔法消耗，随后恢复寻路及可受伤状态；魔法不足时没有移动，也未留下隐藏或无敌状态。Win32 Release 测试目标编译通过，`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> storm-spells` 通过且未加载 Game.dll。英雄数值和目标由测试设置，其他单位暂停；技能等级、距离／魔法边界、移动过程中的目标及中断、事件重入、自然对局、多人和实际窗口待阶段验证。

### 单位距离事件与风暴之灵残影（待阶段验证）

路径：`src/session_spatial_events.cpp`、`tests/dota_heroes_tests.cpp`。新注册的单位距离事件在下一次空间更新时处理当时已在范围内的单位，此后按进入／离开状态追踪；事件过滤与触发器执行沿用现有链路。DotA_v6.83d 原图的残影脚本在生成残影后注册距离事件，修复前已在范围内的静止目标没有受伤；修复后隔离会话中，已有目标与随后进入的目标各受到 140 点伤害。风暴之灵从酒馆购买后通过脚本设置等级／位置／魔法并重置冷却；电子涡流把目标从 x=200 拉至 x=100，球形闪电产生位移并恢复寻路及可受伤状态。Win32 Release 客户端及 DotA 测试目标编译通过；`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> storm-spells`、`bristle-spells`、`luna-spells` 均通过，未加载 Game.dll。初始单位处理属于为地图实际消费补齐的行为，原版回调时机、注册／销毁重入、离开再进入、多个目标和自然对局、联机及窗口仍待核对。

### 地图被动目标 none 与钢背兽战意（待阶段验证）

路径：`src/session_passive_info.cpp`、`tests/dota_heroes_tests.cpp`。被动目标集合只有 `none` 时不匹配任何单位；其他目标集合继续使用已有单位类别和关系筛选。DotA_v6.83d 的战意辅助光环 `A0EF` 在无叠层时使用 `none`，此前与辅助单位重合的英雄仍获得该光环状态；隔离会话修复后不再获得，施法叠层后英雄移动光环由 0 增至 0.03、敌方未获得，到期后移速加成和光环状态清除。测试手动移动、设置等级并重置冷却，未加载 Game.dll；满血背部减伤问题仍见后续记录。Win32 Release 客户端、DotA 英雄及 passive 测试目标编译通过；`bristle-spells` 通过，原生命／魔法之泉 `fountain` 1/1 通过，新生成夹具 `tmp/docs-artifacts/war3/warpath-aura/fixture.w3m` 的 `player-aura` 3/3 通过。旧夹具缺少 `A0PL`，该检查报能力添加失败；使用当前生成器产生的夹具后通过。`none` 与其他目标标志组合、其他地图、原版时序和实际窗口待阶段核对。

### DotA 钢背兽被动与受伤事件（继续跟进）

路径：`tests/dota_heroes_tests.cpp`、`src/session_damage.cpp`、`src/session_callbacks.cpp`。Win32 Release 测试目标增量编译通过；`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> bristle-spells` 通过，隔离会话在学习战意后核对施法加攻与到期恢复，学习刚背兽后以 1500／2000 生命模拟 100 点伤害，正面／侧面／背面实际损失 100／92／84，未加载 Game.dll。相同背面伤害在满血时损失 100：当前伤害事件在扣血前执行，地图脚本的补血被 `unitLife` 上限截断。该现象已复现，但原版生命值截断、受伤事件次序及满血实际效果尚未经对照；不能据此更改通用伤害时序或判定原图缺陷。继续核对原版、致死／递归伤害与多个触发器，并完成自然对局和窗口验证。补充同一隔离流程：三次背面命中达到地图脚本的累计伤害条件后，额外刺针扫射使攻击者生命下降；重新编译并执行 `bristle-spells` 通过。固定版 `Game.dll` 的 `SetUnitState` 入口 `0x6f1f7a80` 调用 `0x6f67c2b0`，状态 0 通过对象虚表 `+0x124` 写入；已识别的 CUnit 虚表对应 `0x6f67b310`，再进入包含上下界比较的 `0x6f03afb0`。REA 证据 `ev_1a33715d1917cde71f5ff4e9807d70286cc254581713cb0c56470ae456b5962b`、`ev_78b7ee91b5f2876fc3c30352e332e4af81a9e422e413d542d63bcaed2c311cbe`、`ev_16ca0c66a43641672533720033c0a464f33cdeac3fa575c5ba9df85050a69bcb`；静态证据尚不能确定动态对象、这些界限的语义及受伤事件扣血顺序。

### DotA 钢背兽和月之女祭司技能（待阶段验证）

路径：`src/session_spells.cpp`、`tests/dota_heroes_tests.cpp`、`tests/spell_tests.cpp`，实现说明见 [炼金术士](alchemist.md)。酸性炸弹派生技能按目标关系筛选；只列关系而未列空中／地面的目标集合可进入移动类别筛选。Win32 Release 客户端和两个测试目标增量编译通过。`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> bristle-spells` 与 `luna-spells` 各通过；隔离会话手动设置等级、状态及重置冷却，钢背兽鼻液叠至 4 层并到期恢复，月光和月蚀分别造成 75、300 伤害，未加载 Game.dll。`war3_spell_tests <data-root> <acid-speed-fixture.w3m> acid-speed` 通过，覆盖敌方酸性炸弹拒绝友军、隐藏施法者及正负速度效果。自然对局、其他目标类别及关系、免疫与面积影响、原版时序和画面待阶段验证。

### 英雄信息与物品栏布局（待阶段验证）

路径：`src/game_commands.cpp`、`src/game_inventory_layout.h`。经验条缩进并收窄；物品图标、冷却及交互共用槽位坐标；攻击范围和攻防加成的正负号独立绘制，数值按可用宽度缩放。Win32 Release 客户端增量编译和差异检查通过。游戏内置 Agent 在 1264×921 的人族圣骑士画面核对六件物品、经验条及 `24-34 +36` 攻击数值；拖拽后前两格物品句柄交换。证据位于 `tmp/docs-artifacts/war3/agent-info/layout-recheck-1031/` 和 `layout-recheck-drag-1031/`。单件物品、护甲正负加成、冷却、不同窗口尺寸、四族皮肤和原版布局对照待阶段验证。

### 单位状态与命令的无效句柄（待阶段验证）

路径：`src/session_entities.cpp`、`src/session_illusion.cpp`、`tests/control_tests.cpp`。当前命令、用户数据、人口、等级和幻象查询对空、已移除或错误类型句柄返回零／false；用户数据设置对这些句柄无操作，有效单位继续读写实时状态。固定版 Game.dll 的入口与无效分支证据为 `ev_1535bfc14e39709ed72c58329afa4c251793450312e104c08a7ba3419d3246f4`、`ev_e14dad146645c7161997e1163c72f28cd8c0023c1b2359141d60c46de0dcc9ae`、`ev_282673e194901cc002b3e3a9ade6fc241f49bf9cb9e4510a33ef320340b7c772`。Win32 Release 客户端及控制／商店测试程序编译通过；`war3_control_tests <data-root> <control-fixture> unit-state-handles` 1 通过、0 失败，覆盖空、已移除、错误类型与正常状态及实际保持命令；`war3_commerce_tests <data-root> <commerce-fixture-stationary.w3m>` 通过，覆盖正常商店、英雄及幻象脚本事件。未加载 Game.dll；实际自定义地图、死亡与复活、负人口和原版细节仍待阶段验证。


### 英雄属性与名称的无效单位（待阶段验证）

路径：`src/session_hero.cpp`、`tests/control_tests.cpp`。英雄力量／敏捷／智力查询对空、已移除、错误类型和非英雄返回零，设置对这些对象无操作；英雄专有名称查询返回 null。有效英雄继续使用当前属性刷新和名称状态。固定版 Game.dll 的三个查询入口分别为 `0x6f1e29d0`、`0x6f1e27b0`、`0x6f1e2810`，三个设置入口分别为 `0x6f1f5890`、`0x6f1f5720`、`0x6f1f5780`，名称入口为 `0x6f1e28d0`；只读指令证据 `ev_8bc0926bdbd705c918df9ae95fcd33978e5743c37cb4f97c665496f1ce2196b1`、`ev_cb44d2c6d407f4c327939e4a46c3c914a972e84f8a6a32f4f0ba31173c61eb7d`、`ev_04c3fbb6f93a2cde5a714f45e784981671aad8c46d5193da5159c6a2541dc7d9`、`ev_0107466becf55a80744d1045ab9f249e239faedef0a55c3bd16994fc802f041d`。Win32 Release 客户端和控制测试编译通过；`war3_control_tests <data-root> <control-fixture> hero-attribute-handles` 1 通过、0 失败，未加载 Game.dll。阶段验证实际地图、不同属性／临时加成及极值、英雄死亡／复活／变形、事件重入与原版语义；名称 null 与空字符串的地图脚本消费也需对照。


### 按类型创建物品并加入背包（待阶段验证）

路径：`src/session_inventory.cpp`、`tests/control_tests.cpp`。`UnitAddItemById` 对无法加入背包的物品返回空句柄；`UnitAddItemToSlotById` 在指定槽位无法接收时返回失败。两者先在单位位置创建物品，未加入的物品保留在地面。固定版 `Game.dll` 的对应入口及创建／失败分支证据为 `ev_efad0295cc2918cdf7c64236f452c8392b89876e285d382d7c4f42f631aedab1`、`ev_fdeed7a158306a774b8b53cf756dd479bebd62fb9092ec06eefe25fdf6d1cc82`；物品落点、拾取回调重入和立即消耗的完整原版语义仍需对照。Win32 Release 客户端及控制测试编译通过；`war3_control_tests <data-root> <control-fixture> item-add-native` 1 通过、0 失败，覆盖没有背包、满背包、占用槽位、无效类型、普通拾取和金币立即消耗，不加载 Game.dll。阶段检查剩余槽位、地图自定义物品、地面枚举／拾取事件、单位及物品在事件中移除、原版和真实窗口。

`war3_commerce_tests` 的原夹具在荒芜恢复检查中失败：侍僧自动追击并离开荒芜地，一秒内生命从 100 增至 100.625；改动前后均可复现。夹具关闭该侍僧的自动寻敌并重新生成后，`war3_commerce_tests <data-root> tmp/docs-artifacts/war3/item-add-fix/commerce-fixture-stationary.w3m` 通过，覆盖荒芜地恢复、清除荒芜后停止恢复，以及商店和金币／木材拾取。原始失败记录为 `tmp/docs-artifacts/war3/item-add-fix/baseline-check.log`；真实对局、原版恢复精度和移动中的边界仍待阶段验证。


### 人族战役第九章结局与解锁（待阶段验证）

路径：`tests/human_campaign_chain_tests.cpp`、`docs/campaign-flow.md`。原版战役上下文下，隔离会话从第六章连续推进到第九章：通过守护者事件触发霜之哀伤剧情，核对替换后英雄等级与物品句柄，再击杀玛尔加尼斯和目标建筑，核对胜利、结尾影片请求、返回战役选择及亡灵战役／首章和人族结尾解锁。Win32 Release 测试目标编译通过；`war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> victory` 和 `defeat` 各 1 通过、0 失败，未加载 Game.dll。测试通过移动、无敌和直接击杀加速，未覆盖自然战斗、原版缓存格式、真实画面、影片播放或窗口自动切关，留待阶段验证。


### 随机进攻路径的成员回退（待阶段验证）

路径：`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [AI](ai.md)。各成员确认实际绕行终点，不完整路线改为直接进攻，回退前校验命令修订与队长归属。Win32 Release 客户端和测试程序编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> ai-random-pathing`、`ai-random-partial` 各 1/1，`amphibious-reinforce` 2/2，未加载 Game.dll。前者开启两名成员的地形碰撞并覆盖补员；后者为混合碰撞的隔岛成员，覆盖部分路径回退。动态地形、可移动障碍、订单回调、单位目标变化、真实对局性能、双端同步和原版行为仍待核对。

### AI 随机进攻路线（待阶段验证）

路径：`src/ai.h`、`src/session_ai_natives.cpp`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [AI](ai.md)。`SetRandomPaths` 连接开关及队长进攻的侧向路径、原目标衔接和回退。Win32 Release 客户端和 CampaignAI 程序编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> ai-random-paths` 1/1，`amphibious-reinforce`、`fog-attack` 各 2/2，未加载 Game.dll；随机路径检查关闭了单位路径碰撞。阶段检查真实障碍和岛屿、不同移动类型／补员、路径失败／目标变化／回调重入、跨岛运输、双端确定性与原版随机策略。

### 灵魂保存 AI 施法（待阶段验证）

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`、`docs/soul-preservation.md`。AI 对可见、非敌对、符合技能目标规则且在射程内的单位选择最近目标，发起实际技能订单。Win32 Release 客户端和 CampaignAI 程序编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> ai-soul-preservation` 1 通过、0 失败，覆盖友方目标、敌方、错误类型和已有状态；原图 `human06-ai-soul-preservation` 和 `human06-ai-conversion` 各 1 通过、0 失败，分别在 333.5 秒观察到自然施法与移除、356.5 秒观察到转换与计数，不加载 Game.dll。阶段检查原图 AI 自然决策、技能优先级、单位生命／威胁、移动／攻击冲突、目标失效、双端同步及原版表现。

### 灵魂保存能力（待阶段验证）

路径：`src/spells.h`、`src/entities.h`、`src/session_spell_info.cpp`、`src/session_control_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_spells.cpp`、`tests/control_tests.cpp`、`docs/soul-preservation.md`。ANsl 接入源单位类型／施法和 Buff 时限、目标控制及到期移除。Win32 Release 客户端及控制测试目标编译通过；`war3_control_tests.exe <data-root> <control-fixture> soul-preservation` 1 通过、0 失败，未加载 Game.dll，覆盖错误类型拒绝、施法状态、施法者移除和目标到期移除。原版目标与精确时序、死亡和驱散事件、动画／音效、AI、真实窗口与战役仍待对照。

### 单位脚本等比缩放（待阶段验证）

路径：`src/session_visual.cpp`、`tests/game_flow_tests.cpp`、`docs/live-world.md`。`SetUnitScale` 按原版首参数对三个轴统一缩放；脚本其余参数不参与模型或范围检查。1.27 `Game.dll` 注册入口 `0x6f1f7a40` 的静态指令只读取首个实数并向模型传递一个缩放值，取证脚本 `tmp/docs-artifacts/war3/ui-report-current/scale-source.py`。Win32 Release 客户端和测试程序增量编译通过，测试程序有既有 signed/unsigned 警告。阶段执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`，核对三个参数不同、零及极值、阴影、选中圈、变形、存取与真实窗口和原版画面；负数及超限数值的原版行为尚未核对。

### 无效单位外观接口（待阶段验证）

路径：`src/session_visual.cpp`、`tests/game_flow_tests.cpp`、`docs/live-world.md`。颜色、缩放、飞行高度及动画设置在单位无效时返回；飞行高度查询返回零。固定版 Game.dll 的十个接口入口及空对象分支已静态核对，原始脚本位于 `tmp/docs-artifacts/war3/ui-report-current/visual-disasm.py`。Win32 Release 客户端及 game-flow 测试程序编译通过，测试目标出现既有 signed/unsigned 警告。阶段执行 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`；检查空、已移除、错误类型与有效单位、实际地图脚本和原版行为。本次未运行专项及客户端画面。

### 人族第六章结局与后续战役（待阶段验证）

路径：`CMakeLists.txt`、`tests/human_campaign_chain_tests.cpp`；说明见 [战役流程](campaign-flow.md)。Win32 Release 定向目标编译通过；`war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> victory` 与 `defeat` 各 1 通过、0 失败，未加载 Game.dll。胜利场景由测试创建并击杀 100 个僵尸，检查原图计数、胜利对话、过场跳过、Human07 启动及阿尔萨斯等级／用户数据继承；测试将英雄移入相遇区域并消灭第七章目标建筑，检查 Human08 两位英雄的等级和用户数据继承；再消灭第八章五艘目标船只，检查原图胜利及 Human09 双英雄继承；失败场景调用地图动作预置 99 次，再实际完成最后一次转换并检查失败对话及重开。使用新建隔离用户目录；阶段核对自然完整对局、第七章基地攻防、第八章船只战斗、双方进度竞争、正常播放过场、输入与 UI、存档物品及原版一致性。

### AI 黑暗转换（待阶段验证）

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [黑暗转换](dark-conversion.md)。AI 使用源能力的目标规则寻找附近可见且未受转换的村民，并沿既有施法流程执行。Win32 Release 客户端及 CampaignAI 测试编译通过；`war3_campaign_ai_tests <data-root> <fixture.w3m> ai-conversion` 和 `war3_campaign_ai_tests <data-root> human06-ai-conversion` 各 1 通过、0 失败，未加载 Game.dll。夹具覆盖非村民、已有转换状态及友方村民，原图在 384.5 秒观察到玛尔加尼斯来源僵尸及任务计数增长。阶段核对原版决策优先级、施法被打断、敌我及自定义目标、目标易主／死亡、多人同步与完整胜负流程。

### 黑暗转换召唤事件（待阶段验证）

路径：`src/session_spell_effects.cpp`、`tests/generate-control-fixture.py`、`tests/control_tests.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [黑暗转换](dark-conversion.md)。黑暗转换产物记录施法来源及能力，并通过召唤事件进入地图脚本。Win32 Release 客户端与两个测试目标编译通过；`war3_control_tests <data-root> <fixture.w3m> conversion` 和 `war3_campaign_ai_tests <data-root> human06-conversion` 各 1 通过、0 失败，未加载 Game.dll。原图 314.75 秒检查隐藏施法者被地图脚本移除、僵尸转归玩家 2；夹具覆盖召唤上下文、回调移除／转移和施法者提前移除。阶段核对原版事件与死亡时序、来源死亡／易主、回调重入、自定义对象、联机及完整战役；玛尔加尼斯主动转换及任务计数的定向检查见“AI 黑暗转换”。

### 目标追击接近点（待阶段验证）

路径：`src/session_combat_orders.cpp`、`tests/movement_avoidance_tests.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [战斗](combat.md)。直线接近点不可用时检查目标周围可站立位置，并以实际路线终点验证接近距离；找不到合适位置沿用现有路线结果。Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> human06-approach` 1 通过、0 失败，原图受阻建筑约在 452.75 秒被锁定并摧毁；`war3_movement_avoidance_tests <data-root> <fixture.w3m> approach|sealed|chase` 各 1 通过、0 失败，覆盖绕障、封闭与开放以及移动目标和单位避让；`war3_campaign_ai_tests <data-root> <fixture.w3m> island-wave` 1 通过、0 失败，覆盖地面接近与载具登乘，未加载 Game.dll。阶段核对大型地图密集单位的不可达目标搜索成本、不同碰撞／移动类型、动态障碍、施法／物品／运输等共享追击消费者、完整战役及原版寻路。

### 战役队长地点进攻（待阶段验证）

路径：`src/ai.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`src/session_ai_control.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [AI](ai.md)。地点进攻在队长传送及单位目标清理后保留，单位目标清理和重设阶段分别处理。Win32 Release 客户端与 CampaignAI 测试编译通过；`war3_campaign_ai_tests <data-root> human06` 原图 1 通过、0 失败，`war3_campaign_ai_tests <data-root> <fixture.w3m> armies` 和 `amphibious-reinforce` 各 2 通过、0 失败，未加载 Game.dll。原图静音隔离会话中首栋建筑在约 345.5 秒被玛尔加尼斯锁定并摧毁，受阻建筑的后续进展见“目标追击接近点”，任务未完成；日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/roc-human06-captain-after.log`。阶段核对转换计数、其他战役、混编／目标失效／传送阻塞、命令回调、联机和原版动态语义。

### 战役 AI 命令栈（待阶段验证）

路径：`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [AI 命令](ai.md)。`CommandAI` 及 AI 读取／弹出按原版 12 项栈、满栈忽略和空栈返回 -1 执行。Win32 Release 客户端及 CampaignAI 测试编译通过，`war3_campaign_ai_tests <data-root> <fixture.w3m> command-stack` 1 通过、0 失败；人族第六章原图隔离会话的玛尔加尼斯传送到指定区域，后续攻击建筑的验证见“战役队长地点进攻”。阶段核对其他战役脚本、命令同帧／跨帧次序、AI 重启／失效、联机同步及完整任务推进。

### 锁镣派生能力的可选光束（待阶段验证）

路径：`src/session_human_channels.cpp`、`tests/dota_heroes_tests.cpp`、`docs/human-casters.md`。无光束配置的锁镣派生能力保留真实持续施法和控制；有源光束时创建并按施法生命周期释放。Win32 Release 客户端和定向程序编译通过，`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>` 4 通过、0 失败，覆盖屠夫肢解的控制／伤害／回血／取消及源 `Amls` 光束与控制的创建／释放。阶段核对多来源、目标死亡／移除／魔免、打断与回调、空值／地图覆盖、目标和施法动画、原版时序、实际 GPU 与完整对局。

### 弹射武器目标关系（待阶段验证）

路径：`src/session_projectiles.cpp`、`tests/dota_heroes_tests.cpp`、`docs/weapon-effects.md`。目标配置未指定阵营时，后续弹射单位默认限敌方；显式阵营配置继续进入原有目标筛选。Win32 Release 客户端及定向检查编译通过，`war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>` 3 通过、0 失败；月刃场景覆盖主目标、近处友军和另一敌人。阶段核对显式友军／中立／自身、自定义目标、地面物品／可破坏物、弹射衰减和次数、联盟变化、死亡／反弹事件、联机及原版行为。

### 视野科技与月之祝福（待阶段验证）

路径：`src/commerce.h`、`src/session_research.cpp`、`src/session_fog.cpp`、`tests/dota_heroes_tests.cpp`；说明见 [科技研究](research.md)。`rsig` 按科技等级累加到单位视野，变更时刷新迷雾；原图月之女祭司的学习事件设置 `R00I`。Win32 Release 客户端与 `war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>` 编译通过，隔离检查 3 通过、0 失败；月之女祭司覆盖学习后夜间视野扩大及所有权转移后的失效／恢复。阶段核对多级／负值／多个科技和装备组合、昼夜与夜视、科技转移／撤销、原版视野上限、迷雾边界、多人同步及实际窗口。

### DotA 莉娜与狙击手技能（待阶段验证）

路径：`tests/dota_heroes_tests.cpp`、`CMakeLists.txt`。原图隔离会话通过酒馆购买莉娜和狙击手，验证三个一级主动技能的目标伤害、炽魂三层攻速与移速增益及消退、四级瞄准射程和一级暗杀伤害。Win32 Release 定向程序 `war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>` 2 通过、0 失败；测试设定等级、位置和魔法，暂停其他单位，并为连续施法重置冷却。阶段验证自然升级与对战、目标类型、反魔法及伤害类型、技能中断、真实移动／攻击、视觉音频和原版时序；该检查不代表完整 DotA 对局。

### 库存失效句柄（待阶段验证）

路径：`src/session_inventory.cpp`、`tests/undead_finale_tests.cpp`、`docs/campaign-undead08-inventory.md`。库存查询和 `UnitRemoveItem` 对空、已移除与不兼容句柄按接口返回默认值或跳过；有效物品继续执行掉落。Win32 Release 客户端与 `war3_undead_finale_tests <data-root> <Undead08.w3m> <new-absolute-user-dir>` 编译并执行，1 通过、0 失败；覆盖失效句柄、有效查询与掉落，并以缩短计时器推进原图胜利。阶段核对物品转移／移除回调、单位死亡／变形、库存能力变化、联机和原版事件时序。

### 状态提示框高度（待阶段验证）

路径：`src/game_buff_panel.cpp`、`docs/buff-panel.md`。标题和说明按实际换行计算高度，说明上限 30 行；Win32 Release 客户端编译通过。本次启动未能创建 Direct3D 9 设备，日志 `tmp/docs-artifacts/war3/buff-tooltip-auto-current.log`，没有实际画面。阶段通过游戏内 Agent 检查短／多行／超长描述、空标题、不同分辨率及四族与地图覆盖，对照原版布局和裁剪；超过行数上限的滚动尚未实现。

### 存档目录重命名（待阶段验证）

路径：`src/session_campaign.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`RenameSaveDirectoryBJ` 操作独立用户目录中的真实目录，拒绝已有目标、无效源、目录移入自身和越界路径；Win32 Release 客户端与 `war3_save_exists_tests <data-root> <OrcX01.w3x> <scratch-root>` 编译并执行，1 通过、0 失败，符号链接创建失败而跳过对应场景。阶段核对接合点／符号链接、占用与跨进程竞争、失败后的空父目录、原版目标覆盖及名称规则，并在完整世界保存恢复实现后验证实际存档。

### 亡灵最终章物品槽与计时胜利（待阶段验证）

路径：`src/session_inventory.cpp`、`tests/undead_finale_tests.cpp`、`CMakeLists.txt`；说明见 [战役物品槽](campaign-undead08-inventory.md)。Win32 Release 客户端和 `war3_undead_finale_tests <data-root> <Undead08.w3m> <new-absolute-user-dir>` 编译并执行，1 通过、0 失败；使用新用户目录，检查空／失效单位、有效／空／越界槽，并将原图召唤计时器缩短至五秒验证胜利事件。阶段核对前关缓存及六格物品转移、物品掉落事件与回调重入、30 分钟防守、实际窗口和原版行为。

### 兽族第八章灵魂宝石（待阶段验证）

路径：`src/entities.h`、`src/session_soul.cpp`、`src/session_entities.cpp`、`src/session_spells.cpp`、`src/session_item_use.cpp`、`src/session_inventory.cpp`、`src/session_network_identity.cpp`、`tests/control_tests.cpp`、`tests/orc_soul_campaign_tests.cpp`、`CMakeLists.txt`；说明见 [灵魂宝石](soul-gem.md)。Win32 Release 客户端与两个定向目标编译通过；`war3_control_tests <data-root> <fixture> item-soul` 及 `war3_orc_soul_campaign_tests <data-root> <Orc08.w3m> <new-absolute-user-dir>` 各 1 通过、0 失败。原图检查调整单位与位置并暂停其他单位；阶段检查实际交战、自然目标选择、死亡／复活、事件重入、无脚本地图、联机和原版视觉及能力语义。

### 兽族战役第六至第八章跨关（定向检查通过）

路径：`tests/orc_campaign_chain_tests.cpp`、`CMakeLists.txt`、`docs/campaign-flow.md`。执行 `war3_orc_campaign_chain_tests.exe <data-root> <Orc06.w3m> <Orc07.w3m> <Orc08.w3m> <new-absolute-user-dir>`：直接完成第六章目标，第七章执行揭示剧情、交还地图宝石并进入先知区域，检查两个胜利跳转和两个英雄的等级及自定义数据在第七、八章恢复。Win32 Release 1 通过、0 失败，无 Game.dll；实际移动、战斗、完整剧情／窗口、跨进程启动及原版缓存互通待阶段验证。隔离用户目录位于 `tmp/docs-artifacts/war3/orc-campaign-chain-current/`。

### 兽族第五章矩形移动（待阶段验证）

路径：`src/session_world.cpp`、`tests/spatial_handle_tests.cpp`、`CMakeLists.txt`、`docs/campaign-rect-movement.md`。`MoveRectToLoc` 忽略无效矩形或地点；Win32 Release 构建通过，`war3_spatial_handle_tests.exe <data-root> <Orc05.w3m>` 1 通过、0 失败，原图静音 `--main-check --simulate-ms 400000` 推进至 400 秒。阶段核对有效／无效及跨类型句柄、战役目标组清空与重新建造、真实窗口和原版行为；本次未验证完整关卡。证据位于 `tmp/docs-artifacts/war3/orc05-runtime-400*.log`。

### 影魔灵魂与魂之挽歌连续流程（定向检查通过）

路径：`CMakeLists.txt`、`tests/dota_soul_tests.cpp`。使用用户提供的 DotA_v6.83d 原图，通过酒馆购买影魔并学习支配死灵与魂之挽歌；测试调整等级、魔法、位置和目标并暂停其他单位。五次实际攻击击杀后，灵魂等级由 1 增至 6、攻击加成由 0 增至 10；按自身积累的灵魂施法后，目标生命由 5000 降至 4920。通过伤害 native 令英雄死亡后灵魂等级变为 4，死亡释放使目标生命由 4920 降至 4840；调用 ReviveHero 后等级为 4、攻击加成为 6。`war3_dota_soul_tests.exe <data-root> <dota-map>` 实际 1/1 通过，未加载 Game.dll。检查使用会话命令及 native，未覆盖实际窗口、自然等级成长、不同灵魂数量、目标密集情况、事件重入与完整对局；这些继续留待阶段验证。

### 单位范围治疗与魂之挽歌（待阶段验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`tests/spell_tests.cpp`、`docs/area-spells.md`。单位可按源 AIha 的订单、治疗量、范围和施法时间使用范围治疗；治疗量为零时仍触发实际施法事件。Win32 Release 客户端及专项程序编译通过；`war3_spell_tests.exe <data-root> <fixture> unit-area-heal` 1/1 通过，检查 AIha 对自身和友军治疗、敌军不受益，以及治疗卷轴仍可正常使用。DotA_v6.83d 原图隔离会话从酒馆购买影魔、学习 A29J；探针设置十个灵魂、等级、魔法、位置和敌方目标，暂停其他单位。技能按钮可用，施法半秒内无伤害，之后地图脚本使目标生命由 5000 降至 4920 并进入冷却。会话未加载 Game.dll；证据位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-sf-requiem-effect.*`。固定版 Game.dll 摘要 e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a：REA 记录 `ev_f274fa477ad92e558babd7ac6af14557d9f3b70a93a3c46e3153fc79feed84da` 中能力方法表将 AIha 原型与返回 852273 的方法关联；完整按钮和下单路径仍待原版对照。阶段核对治疗目标／范围／满血、施法中断及重入、技能等级、魂数与死亡释放、网络、实际窗口和完整对局。

### 零召唤末日与英雄目标（待阶段验证）

路径：`src/session_neutral_spells.cpp`、`src/session_spells.cpp`、`docs/neutral-heroes.md`。零召唤末日保留状态、事件和配置的正持续时间，不创建召唤物或消耗尸体；其他末日保留原有持续与召唤流程。目标类别由技能标记决定，原版 nonhero 仍排除英雄。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买末日使者并学习 A0MU，调整英雄等级、魔法、位置及目标，暂停其他单位；对敌方英雄施法后五秒生命由 5000 降至 4920，状态存在，到期后状态移除且额外三秒不再受到地图脚本伤害。隔离地图中原版 ANdo 拒绝英雄并使普通敌人死亡后生成一个 120 秒召唤物；探针将召唤数改为零后确认普通敌人死亡不新增召唤物、不消费尸体。未加载 Game.dll；探针与日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-doom-duration.*`、`source-doom-zero-summon.*`。零召唤正时长的原版语义、等级、魔免／驱散、状态重入、召唤生命周期、实际窗口及对局待阶段对照。

### 无图标睡眠与地图连环霜冻（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_spell_effects.cpp`、`docs/control-spells.md`。睡眠技能没有配置 Buff 时，使用无图标的内部睡眠状态承载持续时间、保护与清理，保留施法事件；已配置 Buff 的睡眠继续要求保护 Buff。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买巫妖、学习 A05T，调整等级、魔法、位置及目标并暂停其他单位后，地图脚本使两个目标生命从 10000 分别降至 8320 和 8600；目标未暂停，短暂睡眠正常结束。隔离地图定向检查原版 AUsl 的 Buff 睡眠及移除，随后将技能配置调整为无 Buff、0.5 秒睡眠，确认状态生效并到期清理；会话未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-lich-chain-frost-effect.*` 和 `source-sleep-unmarked.*`。原版无 Buff 状态语义、0.01 秒与固定步进、弹射次数与伤害、友军／魔免、实际窗口和对局待阶段对照。

### 焚灰死亡爆炸半径与腐尸毒（待阶段验证）

路径：`src/session_firelord.cpp`、`docs/firelord.md`。焚灰允许全伤和半伤半径分别配置，死亡爆炸按两者的最大半径查找目标并保留全伤／半伤判断；敌友筛选识别 enemy/enemies 和 friend/allies。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买尸王，生成五个学习按钮并学习 A0FA；调整等级、位置、生命和目标并暂停其他单位后，攻击击杀敌人触发死亡爆炸，使附近中立敌人生命从 5000 降至 4910，范围外敌人与友军保持 5000。隔离地图探针调整技能的两个半径与伤害数值，分别验证全伤半径 400／半伤半径 0 与全伤半径 100／半伤半径 400 时近处敌人受到 90 和 45 点伤害，远处敌人和友军无伤。未加载 Game.dll；探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-undying-incinerate-effect.*` 与 `incinerate-radius-boundary.*`。阶段核对原版半径边缘、类别和免疫、技能叠层与尸体处理、不同等级、事件重入、实际窗口及对局。

### 地图脚本创建的群蛇守卫（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_spells.cpp`、`docs/area-spells.md`。蛇棒技能允许原生数量为零，保留施法与脚本事件，且零原生召唤不要求找到召唤落点。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话从酒馆购买暗影萨满，显示五个技能学习按钮，设置等级、魔法和施法位置后，地图 A00H 脚本创建十个 osp4 蛇棒并赋予定时生命；探针暂停了其他单位。隔离地图原版 AOsw 经过实际施法流程，生成一个具有 40 秒定时生命的 osp1。会话未加载 Game.dll；探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-shadow-shaman-wards.*`、`dota-shadow-shaman-wards-after.log` 和 `source-serpent-ward.*`。阶段核对不同技能等级、原版零数量语义、蛇棒攻击与死亡、技能事件时序、地图地形、实际窗口及完整对局。

### 隐藏单位的脚本无目标施法（待阶段验证）

路径：`src/session.h`、`src/session_entities.cpp`、`src/session_orders.cpp`、`src/session_spells.cpp`、`tests/spell_tests.cpp`。脚本的字符串与整数无目标订单将脚本状态传入技能施法，显式隐藏的施法者可执行原版战争践踏；战争践踏的玩家订单及运输状态下的脚本订单仍受限制。Win32 Release 客户端和专项程序编译通过；`war3_spell_tests.exe <data-root> <fixture> hidden-immediate` 1/1 通过，确认两种脚本订单均造成伤害与眩晕，玩家订单及运输状态被拒绝，未加载 Game.dll。探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/hidden-immediate-stomp*`。其他无目标能力、自动施法与特殊订单、隐藏变化、事件重入、实际地图和原版行为待阶段验证。

### 隐藏单位的脚本点目标引导（待阶段验证）

路径：`src/session.h`、`src/session_orders.cpp`、`src/session_spells.cpp`、`src/session_channels.cpp`、`docs/area-spells.md`。脚本点目标订单在下单和持续波次中保留显式隐藏单位的施法资格；运输等内部隐藏状态及玩家对隐藏单位的订单仍受限制。只配置 organic 且未指定空地的技能按有机目标筛选。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话中从酒馆购买深渊领主、学习 A01I，设置位置、等级、魔法和目标并暂停其他单位后，火焰风暴令目标生命从 5000 降至 4900。隔离地图验证 IssuePointOrder 和 IssuePointOrderByIdLoc 驱动隐藏施法者产生持续伤害，玩家命令及运输状态被拒绝，友军和设为机械类别的敌人未受伤；探针修改了目标标记用于边界检查。上述会话未加载 Game.dll，证据位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-underlord-firestorm-fixed.log` 和 `hidden-rainfire-boundary.*`。原版空地／有机组合、不同隐藏状态、所有持续施法类型、事件时序、完整波次、画面及实际对局待阶段验证。

### 零效果火焰范围变体（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_neutral_spells.cpp`、`src/session_area_spells.cpp`、`docs/area-spells.md`。无伤害和地面效果的零时长烈焰风暴保留施法事件；零波次火焰雨允许零间隔并正常结束施法，有波次时仍校验间隔。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买深渊领主，生成五个技能学习按钮；设置位置、等级、魔法和目标后，A0RA 由地图脚本使敌人生命从 5000 降至 4900。隔离地图原版 AHfs 和 ANrf 分别使目标生命从 5000 降至 4880 和 4900；均未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-underlord-pit-target.*`、`source-fire-spells.cpp`、`source-flamestrike.log` 和 `source-rainfire.log`。其他零值组合、事件时序、原版视觉及实际窗口待阶段验证。


### 零闪电时长的叉状闪电变体（待阶段验证）

路径：`src/session_neutral_spells.cpp`、`docs/spells.md`。叉状闪电无原生伤害和闪电效果时允许零时长，保留目标施法及地图脚本事件；零伤害不产生原生伤害事件，有伤害或闪电效果仍要求正时长。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买复仇之魂、生成五个技能学习按钮，升至 10 级学习 A0IN；对英雄施法后原图脚本将双方位置从 `(0,0)` 和 `(200,0)` 交换，技能进入冷却。隔离地图原版 ANfl 对敌人造成 85 点伤害；均未加载 Game.dll。探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-vengeful-swap.cpp`、`dota-vengeful-swap-after.log`、`source-forked-lightning.cpp` 和 `source-forked-lightning.log`。英雄等级、位置、生命、魔法和目标由探针设置，其他单位被暂停；原版零伤害事件、视觉、自定义数据、魔免、实际窗口及联机待阶段对照。


### 零效果残废与灵魂隔断（待阶段验证）

路径：`src/session_unit_casters.cpp`、`docs/unit-casters.md`。没有原生移动、攻击和伤害减幅的残废变体允许缺少 Buff，保留施法、目标、费用、冷却及地图事件；有原生减幅时仍要求 Buff。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买灵魂守卫，生成五个技能学习按钮，升至 10 级学习 A07Q 并对英雄施法；设置双方生命和暂停其他单位后，原图脚本令施法者生命由 250 变为约 810、目标由 800 变为约 257，技能进入冷却。隔离地图中原版 Acri 在满足 Rune 二级前置后仍对敌人施加 Bcri；均未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-terrorblade-sunder-isolated.*`、`source-cripple-buff.*`。英雄等级、位置、生命、魔法和目标由探针调整；真实对战、生命百分比精度、免疫、事件重入、视觉与窗口待阶段对照。


### 零距离脚本波形技能（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_area_spells.cpp`、`docs/area-spells.md`。冲击波／腐臭蜂群原型的距离为零时，仅在伤害为零且没有原生弹道时允许施法，正常触发技能事件且不创建需要距离计算的波形。Win32 Release 客户端编译通过；DotA_v6.83d 原图酒馆购买虚空假面后可生成五个学习按钮，升至 10 级学习 A0LK，发出点目标命令后由地图脚本移动约 566 距离并进入冷却。隔离地图中原版 AOsh 对目标造成 75 点伤害；上述会话未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-void-timewalk.cpp`、`dota-void-timewalk-after.log`、`source-wave-damage.cpp` 和 `source-wave-damage.log`。DotA 野性之斧 A0O1 在调整位置并暂停其他单位的隔离会话中使敌人生命由 5000 降至 4875，完整伤害和视觉尚未确认；英雄等级、魔法与施法目标由探针设置。阶段核对其他零值组合、伤害与弹道边界、回调时序、实际窗口及原版行为。


### 幻象复制与魔法免疫目标（待阶段验证）

路径：`src/session_spells.cpp`、`docs/illusions-items.md`。幻象复制类型允许选择魔法免疫单位，仍执行英雄类别、敌友、自身及其他目标规则；其他魔法技能保留免疫检查。DotA_v6.83d 原图 A0G8 的技能说明注明无视魔法免疫。Win32 Release 客户端编译通过；原图隔离会话从酒馆购买变体精灵并学习 A0G8，分别对设置为敌方和友方的魔免英雄生成幻象，回归后英雄到达幻象位置、回归能力移除且复制能力恢复；同一会话中非英雄、自身和普通风暴之锤对魔免目标均被拒绝。未加载 Game.dll，探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-magic-immunity.cpp`、`dota-morphling-magic-immunity-*.log`。英雄等级、魔法、目标、免疫和友方关系由探针设置；原版幻象魔棒的免疫规则、其他免疫类型、技能事件、伤害倍率与实际窗口待阶段对照。


### 英雄类别目标与变体精灵复制（待阶段验证）

路径：`src/session_spells.cpp`、`docs/spells.md`。技能目标指定英雄／非英雄类别而未指定空中或地面时，不再强加空地限制，仍执行类别、敌友、自身等筛选。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话通过酒馆购买变体精灵，学习 A0G8 后分别对敌方和设置为友方的英雄施法，均创建一个幻象并由地图脚本提供回归技能；施放回归后英雄到达幻象位置，非英雄与自身目标被拒绝。两项检查均未加载 Game.dll，探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-replicate.cpp` 和 `dota-morphling-replicate-return*.log`。英雄等级、魔法、目标和友方关系由探针调整；阶段核对空中／地面显式限制、其他目标掩码、魔免、幻象数值／持续、事件时序、实际窗口和原版行为。


### 地图脚本使用的零恢复能力（待阶段验证）

路径：`src/session_restoration.cpp`、`docs/restoration.md`。恢复量均为零的恢复能力允许不配置 Buff，沿用实际手动施法、自动施法开关和订单事件；有恢复量时仍要求有效 Buff。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话使用 `-ap` 和酒馆购买变体精灵，取得五个技能学习按钮；升至 10 级学习 A0KX 后，自动转换令力量／敏捷由 40／54 变为 34／60，反向转换恢复为 40／54，两次关闭后数值保持，手动转换后变为 38／56。相同会话以原版 Arpl 恢复友军生命 100 至 110；记录见 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-restoration.cpp` 和 `dota-morphling-restoration.log`，未加载 Game.dll。测试调整英雄等级与魔法，调用会话命令而非实际鼠标；阶段核对原版零值语义、低魔法／属性边界、技能等级、事件重入、双开关、实际窗口和联机。


### 永久生命上限物品的负值（待阶段验证）

路径：`src/session_item_use.cpp`、`src/session_equipment.cpp`、`docs/equipment.md`。永久生命上限能力接受有界负值，并将同一增量应用于最大生命和当前生命；最大生命下限为 1，当前生命沿用既有死亡和事件流程。Win32 Release 客户端编译通过；DotA_v6.83d 原图输入 `-ap` 并通过实际酒馆购买变体精灵 O00P，地图一次性物品 I00E 生效后英雄生命与上限均为 511；隔离会话将英雄升至 10 级、学习 A0G6，对脚本创建的敌人施法，目标位移约 145、技能进入冷却，未加载 Game.dll。探针与日志见 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-purchase.cpp`、`dota-morphling-purchase.log`。英雄升级、魔法和目标由探针设置；真实窗口、伤害归因、低生命／上限边界、复活、事件顺序及原版数值仍待阶段对照。


### 无状态的酸性炸弹地图变体（待阶段验证）

路径：`src/session_alchemist.cpp`、`docs/alchemist.md`。当移动、攻击、护甲和周期伤害均为零时，允许酸性炸弹没有 Buff；命中不产生原生状态，费用、冷却、事件和地图脚本仍沿用施法链路。Win32 Release 客户端编译通过；DotA_v6.83d 原图会话中将 A0G6 授予圣骑士，对敌方单位发出目标施法并进入冷却，未加载 Game.dll；探针及日志见 `tmp/docs-artifacts/war3/hero-ability-probe/dota-acid-script.cpp`、`dota-acid-script.log`。该检查未证明地图脚本的完整伤害及位移。原英雄 O00P 的一次性生命上限物品已接入，原图酒馆购买与技能施放已在隔离会话检查；负值边界和原版行为仍待核对。阶段验证原版酸性炸弹、非零效果缺失 Buff 的拒绝、命中事件、零伤害／短时长及窗口、联机和原版行为。


### 地图技能的原型命令（待阶段验证）

路径：`src/session_spell_info.cpp`、`docs/spells.md`。非 Channel 技能的命令字段为空时从源能力原型读取命令；非空地图命令继续按原值解析，Channel 使用自身数据字段。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话分别创建英雄并学习 A1SW、A06V、A0G2、A01F、A02A，对合法单位或地点施法，五项均进入冷却，未加载 Game.dll。探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-inherited-orders.cpp`、`dota-inherited-orders.log`；探针直接创建单位并调整等级／魔法，不证明完整技能脚本效果。A0G6 的无状态变体及原英雄初始化已进入实际施法流程；原版精度待核对。阶段核对源表缺值、显式命令覆盖、自定义原型、伤害／事件、实际窗口、联机及原版行为。


### 地图 Channel 技能的基础命令读取（待阶段验证）

路径：`src/session_spell_info.cpp`、`docs/channels.md`。Channel 能力先读取当前等级的源 `DataF` 命令，再校验和构建技能；未知命令仍明确报错。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话分别创建英雄 E002、H00V、O015、U00K，学习 A1AO、A1AT、A1AA、A06R 并发起无目标施法，四项均进入冷却，未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/`；它直接创建英雄并调整等级／魔法，不证明完整技能效果。阶段核对地图脚本的持续效果、不同目标类型、事件／中断、等级覆盖、界面与联机，并与原版对照。


### 修补匠的电脑战斗施法（待阶段验证）

路径：`src/session_ai_armies.cpp`、`docs/tinker.md`、`docs/ai.md`。电脑战斗决策在有可见敌人时可施放口袋工厂和进入机器人形态，复用真实技能、目标、资源及冷却流程；已有工厂时不重复召唤，机器人形态不自动反向切换。Win32 Release 客户端编译通过；隔离会话分别检查基础技能和一级工程升级后的技能变体，实际产生工厂并保持机器人形态，各 2 通过、0 失败，未加载 Game.dll。临时探针与夹具位于 `tmp/docs-artifacts/war3/hero-ability-probe/`、`tmp/docs-artifacts/war3/auras-passives/fixture.w3m`。阶段核对真实电脑对局、原版决策和目标选择、工厂失效／技能升级、资源与冷却、不同地图及联机。


### 夺旗附件与死亡掉落（待验证）

路径：`src/session_entities.cpp`、`src/passives.h`、`src/session_passive_info.cpp`、`src/session_weapon_effects.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`；来源和行为见[旗帜物品](flag-items.md)。Win32 Release 产品和 passive 测试目标编译通过；`flag-item` 与受影响的 `orb-purge` 各 1 通过、0 失败，未加载 Game.dll。夹具生成命令为 `python tests/generate-passive-fixture.py --data-root <data-root> --output <tmp-fixture>`；阶段核对真实夺旗地图、死亡／复活／移除／转移及事件重入、禁用与幻象、模型附件、GPU、地图覆盖和联机。

### 旧版闪电之球净化（待验证）

路径：`src/passives.h`、`src/combat.h`、`src/session.h`、`src/session_passive_info.cpp`、`src/session_spell_info.cpp`、`src/session_weapon_effects.cpp`、`tests/passive_tests.cpp`；来源和行为见[毒素攻击与物品法球](weapon-effects.md)。Win32 Release 客户端及 passive 测试程序编译通过；`orb-purge` 定向检查 1 通过、0 失败，无 Game.dll。阶段核对原版触发概率、召唤物伤害、能力独立来源和禁用、发射后丢弃／易主、多个法球／攻击技能、魔免／护盾／事件时序、自定义等级和实际窗口／联机。

### 召唤钻石与黑暗召唤（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_teleport.cpp`、`tests/control_tests.cpp`；源字段和行为见[群体传送](teleport.md)。Win32 Release 客户端及控制测试目标编译通过；`dark-summoning` 定向检查 1 通过、0 失败，无 Game.dll，覆盖原物品的地点、延迟、人数上限、阵营／距离、冷却及召回护符。阶段核对目标及落点顺序、DataC／自定义覆盖、单位类别、支付／打断／事件、实际窗口、小地图、源视觉与音效及联机同步。

### 影子权杖与目标视野（待验证）

路径：`src/session_item_use.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_unit_casters.cpp`、`src/session_fog.cpp`、`src/session_visibility.cpp`、`src/session.h`、`src/spells.h`、`tests/control_tests.cpp`；行为及源字段见[影子权杖](shadow-sight.md)。Win32 Release 产品和控制测试程序编译通过；`shadow-sight` 定向检查 1 通过、0 失败，无 Game.dll。阶段对照真实目标、隐身／魔免／无敌、目标及施法者归属变化、多玩家重复施法、时长覆盖、驱散／事件次序、窗口、声音和联机。

### 路径平滑复用通行缓存（待验证）

路径：`src/world_path.cpp`、`docs/water-pathing.md`。路径平滑和普通直线检查共用同一网格穿越与对角规则，平滑阶段复用本次搜索的通行缓存。Win32 Release 客户端及 world 测试目标编译通过；区域／部分路径、动态障碍、目标缓存和阻挡目标相关检查共 8 通过、0 失败。512×512 隔墙绕路夹具按碰撞半径 0／32／64 各执行 40 条不同路径，路径点数量和摘要一致，单次耗时由 637／695／769 毫秒变为 604／605／617 毫秒；探针位于 `tmp/docs-artifacts/war3/path-smoothing-1031/`。阶段核对多地图及移动类型、动态阻挡、路径端点与原版语义、完整战役 CPU 和实际帧时间。

### 黑暗转换最小会话检查（待阶段验证）

路径：`src/session_control_spells.cpp`、`src/session_spell_effects.cpp`、`tests/control_tests.cpp`。生成原地形夹具并编译 Win32 Release 的 `war3_control_tests` 后，执行 `war3_control_tests.exe <data-root> <fixture> conversion`，1 通过、0 失败，未加载 Game.dll；覆盖非村民拒绝、村民进入睡眠／禁令状态及到期后创建施法方僵尸。原版状态结束时序、死亡事件与尸体、驱散／伤害／重入和真实战役仍待阶段对照。

### 英雄经验条纹理裁剪（待验证）

路径：`src/game_commands.cpp`。经验填充按进度裁剪源纹理，零进度不提交填充矩形；保留经验条边框和文字。阶段使用游戏内 Agent 核对零、部分与满经验、不同窗口比例和各族皮肤，并与原版画面对照；本次环境的 D3D9 设备不可用，画面尚未验证。

### 战斗伤害表及地图常量缓存（待验证）

路径：`src/session.h`、`src/session_damage.cpp`、`src/session_hero.cpp`、`docs/combat.md`。攻击／防御、虚无伤害表和非空数字常量按地图会话惰性缓存，空字段继续使用调用方回退值。Win32 Release 客户端编译通过；`war3_fortified_tests` 原版模式 2 通过、重新生成夹具的自定义模式 2 通过，带 `war3mapMisc.txt` 伤害倍率覆盖的夹具自定义模式 2 通过；`war3_passive_tests <data-root> <fixture> ethereal-ability` 1 通过、0 失败。3 万次伤害调用单次隔离采样由 93 ms 降至 45 ms、最终生命一致，记录在 `tmp/docs-artifacts/war3/damage-factor-cache/`。阶段核对错误／空表、不同地图切换与回退值、完整伤害组合、真实对局性能及联机。

### 无过滤器的单位编组枚举（待验证）

路径：`src/session_collections.cpp`、`tests/game_flow_tests.cpp`、`docs/jass.md`。空过滤器直接遍历单位，非空过滤器保留快照与回调语义；Win32 Release 客户端和游戏流程测试通过，检查类型／玩家／范围、零与一数量限制、编组替换和单位创建／移除。2,001 单位、2,000 次范围枚举的单次隔离采样由 219 ms 降至 30 ms，结果数量与首句柄一致，见 `tmp/docs-artifacts/war3/group-enum-fast/`。阶段核对所有编组入口、过滤器嵌套与修改、原版排序、真实地图帧耗时和联网同步。

### 武器研究的被动说明（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session_ability_commands.cpp`、`tests/research_tests.cpp`、`docs/research.md`。飞行机器炸弹、穿刺剑刃、月刃和风暴战锤按对应科技前置显示源被动图标；实际武器状态继续由科技生效。Win32 Release 产品及研究测试通过，四种单位的研究前后图标和武器状态均已检查；游戏内 Agent 的飞行机器画面在 `tmp/docs-artifacts/war3/unit-ability-inventory/agent/`。执行 `python tests/generate-research-fixture.py --data-root <data-root> --output <tmp-fixture>` 和 `war3_research_tests.exe <data-root> <tmp-fixture>`。阶段核对原版显示时序、实际攻击、其余图标、自定义前置／禁用与不同窗口布局。

### 影之灵龛自然充能检查（待验证）

路径：`tests/dota_rune_tests.cpp`、`docs/dota-bottle.md`。DotA 原图 `urn-charge` 检查附近敌方英雄死亡的首次与后续充能、远处敌方及友军排除，以及自然充能后的使用；Win32 Release 1 通过、0 失败。执行 `war3_dota_rune_tests.exe <data-root> <DotA_v6.83d.w3x> urn-charge`。阶段核对多名携带者、英雄幻象、死亡与归属边界、原版及实际对局。

### 动态计数物品的技能事件与扣减（待验证）

路径：`src/session_spells.cpp`、`tests/dota_rune_tests.cpp`、`docs/dota-bottle.md`。无源使用次数且不可消耗的技能物品，先发布技能生效事件，再扣减使用前已有的正次数；已清零或移除的物品不重复扣减。Win32 Release 产品和测试目标编译通过；DotA 原图 `urn`、`wand`、`wand-charge`、`regen` 各 1 通过、0 失败。执行 `war3_dota_rune_tests.exe <data-root> <DotA_v6.83d.w3x> <模式>`。阶段核对脚本重设正次数、移除／转移及物品事件次序、普通有次数物品、原版动态次数、实际窗口和联机。

### 目标控制类物品与控制技能目标标记（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_control_spells.cpp`、`docs/dota-control-items.md`。物品的风暴之锤、妖术和变形能力进入单位目标施法；控制技能识别 `enemies`／`allies` 目标标记。Win32 Release 客户端编译通过；DotA 原图隔离会话中深渊之刃眩晕目标、邪恶镰刀变形目标，效果结束后恢复；两件物品均拒绝友军目标。记录位于 `tmp/docs-artifacts/war3/dota-i0gj/hex-stun-final.log`。阶段核对真实窗口输入、英雄与中立单位、不同目标标记、魔免／法术抵挡、消耗／冷却／施法打断、地图覆盖和原版时序。

### 暴风雪类点目标物品与纷争面纱（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`docs/dota-veil.md`。地图物品的暴风雪能力通过点目标施法流程触发原脚本，保留法力、冷却与引导过程。Win32 Release 产品编译通过；DotA 原图隔离会话中纷争面纱使目标魔法伤害由 100 提升至 125，到期后恢复为 100，证据位于 `tmp/docs-artifacts/war3/dota-i0gj/veil-runtime.log`。阶段检查点目标操作、不同目标及范围、可中断的引导、物品次数／冷却、效果叠加与驱散、原版对照及实际窗口。

### 物品栏标题与单次物品计数（待验证）

路径：`src/game_loading.*`、`src/game_view.cpp`、`docs/unit-combat-panel.md`。选中具有物品栏的单位时显示源 `INVENTORY` 标题，正次数物品显示数字并限制在格内。Win32 Release 客户端编译通过；游戏内 Agent 选择携带 1 次药水和 4 次权杖的圣骑士，1264×921 画面可见标题及计数，证据位于 `tmp/docs-artifacts/war3/agent-info/layout-inventory-title/`。阶段核对无物品栏／多个选中单位、商店买家、四族皮肤、地图覆盖、长数字、不同窗口比例及原版画面。

### 脚本计数物品与 DotA 魔杖（待验证）

路径：`src/session_teleport.cpp`、`tests/dota_rune_tests.cpp`、`docs/dota-bottle.md`。技能物品的源使用次数为零且不可消耗时，脚本计数不再在技能生效事件前扣减；源定义有限次数或可消耗物品继续扣减。Win32 Release 客户端及测试目标编译通过；`war3_dota_rune_tests <data-root> <DotA_v6.83d.w3x> wand` 1 通过、0 失败，以原图验证 5 点和 1 点能量恢复、清零与冷却；`wand-charge` 1 通过、0 失败，以原图检查附近敌方施法充能、远处敌方和友方施法不充能及随后使用；`regen` 和 `war3_spell_tests <data-root> <fixture> chain-dispel` 各 1 通过、0 失败，覆盖魔瓶回复符和有次数的中和权杖。阶段核对原版动态设置次数、消耗／非消耗物品与事件次序、战争迷雾／能量上限、完整购买及真实窗口、联机与重入。

### 战役区域存档目录清理（待验证）

路径：`src/session_campaign.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`RemoveSaveDirectory` 在独立用户目录内检查目录树与重解析点、持有目录句柄并逐项清理，错误时返回失败，可能已清除部分内容。Win32 Release 客户端和测试目标编译通过；以原版 `OrcX01.w3x` 运行 `war3_save_exists_tests <data-root> <map> <scratch-root>`，1 通过、0 失败，检查 JASS 包装、嵌套目录、旁侧备份保留和越界拒绝。测试环境未能创建符号链接，链接拒绝分支跳过。阶段核对链接／接合点、并发修改、权限与中断、原版目录语义，以及真实保存加载事件和跨区恢复。

### 战役区域存档复制（待验证）

路径：`src/session_campaign.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`CopySaveGame` 在独立用户目录中复制实际文件，创建目标目录并通过临时文件覆盖发布；名称与重解析点检查共用于存档存在性查询。Win32 Release 客户端和测试目标编译通过；`war3_save_exists_tests <data-root> <map> <scratch-root>` 对生成夹具及原版 `OrcX01.w3x` 各 1 通过、0 失败，检查 JASS 包装的实际复制、覆盖、缺失源和越界路径。阶段核对原版扩展名／覆盖规则、重解析点、并发及失败恢复、保存事件与原版文件互通；`SaveGame`、`LoadGame`、目录重命名和跨区恢复仍未实现。

### JASS 存档存在性查询（待验证）

路径：`src/session_campaign.cpp`、`src/platform.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`SaveGameExists` 查询独立用户目录 `Saves` 下实际文件，限制路径且拒绝重解析点；不解析文件内容。Win32 Release 客户端和测试目标编译通过，`war3_save_exists_tests <data-root> <map> <scratch-root>` 1 通过、0 失败，检查实际文件、缺失文件、大小写和分隔符、目录及越界路径。阶段核对原版名称／扩展名规则、异常文件及重解析点、多人／不同用户目录和真实存档互通；保存、加载及兽族跨区尚未实现。

### 隐藏关结束与兽族区域切换（待验证）

路径：`docs/campaign-flow.md`、`docs/save-runtime-foundation.md`。人族隐藏关隔离会话直接降低传送门生命后，原触发器请求间章；兽族资料片第一章将雷克萨直接移至地精洞穴入口后，原触发器在未绑定的 `SaveGame` 处停止。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03secret-goal.log` 和 `orcx01-zone.log`。阶段核对自然防守与跨区操作、世界及脚本存档恢复、后续区域重访和实际窗口。

### 资料片人族第六章至终章交接（待验证）

路径：`docs/campaign-flow.md`。第六章隔离会话人工击杀玛瑟里顿后原脚本请求终章，手动启动终章后运行至返回；日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/humanx06-goal.log` 和 `humanx06-finale.log`。阶段核对自然战斗、英雄状态及物品继承、真实窗口自动切关、终章音画和原版缓存格式。

### 派生治疗波订单与资料片人族第五章（待验证）

路径：`src/session_spell_info.cpp`、`tests/spell_tests.cpp`、`docs/spells.md`、`docs/campaign-flow.md`。治疗波派生记录未填写源订单时使用 `healingwave`；有源订单时继续解析源内容。Win32 Release 客户端和测试目标编译通过；`war3_spell_tests <data-root> ../../tmp/docs-artifacts/war3/mind-rot/fixture.w3m healing-wave-alias` 1 通过、0 失败，实际目标命令治疗友军并消耗魔法。原版第五章隔离会话人工移动英雄并缩短四座传送门计时后，胜利对话请求第六章；第六章手动启动后约 120 秒恢复控制，运行至 400 秒。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/`。阶段核对地图显式订单覆盖、跳跃／治疗边界、原版时序、实际战斗、英雄继承、窗口自动切关和音画。

### AI 空自杀进攻请求的重复计算（待验证）

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。没有新成员的自杀进攻请求不再重复处理已有队伍；定期 AI 更新仍负责目标失效和重试。Win32 Release 客户端及 CampaignAI 测试编译通过，`war3_campaign_ai_tests <data-root> <fixture> armies` 2 通过、0 失败。人族资料片第四章隔离 60 秒单次插桩采样中，304 次请求有 289 次为空，调用内处理累计墙钟时间由 19,880 ms 降至 639 ms；详情见 [AI 说明](ai.md)。阶段核对原版请求／重试时序、连续加入／空请求、停顿／目标失效／死亡／易主／回调重入、AI 暂停和多人同步，以及不同地图完整对局、实际帧耗时和内存；当前不代表原版一致性或完整性能验收。

### 资料片人族第三章至第四章交接（待验证）

路径：`docs/campaign-flow.md`。第三章隔离会话直接击杀狱卒守卫及死亡回调新增的守卫，胜利后经手动启动的间章请求第四章；第四章在独立缓存副本下恢复卡尔的等级和用户数据，瓦丝琪存在且玩家控制恢复。日志在 `tmp/docs-artifacts/war3/tft-ne4-next/`。阶段核对自然战斗与任务、瓦丝琪和库存继承、窗口自动切关、两英雄状态、音画以及第四章实际性能；160 秒空闲会话已人为结束，不作为完整对局或性能基准。

### 可行走楼梯占地方向与战役过场（待验证）

路径：`src/session_destructables.cpp`、`tests/map_tests.cpp`、`docs/cliff-level.md`、`docs/campaign-flow.md`。可行走对象的路径占地和悬崖覆盖与模型方向对齐。Win32 Release 客户端和地图测试目标编译通过；`war3_map_tests <data-root> <scratch> campaign_walkable_stairs` 1 通过、0 失败，使用人族资料片第三章原图检查楼梯区域、阻挡边界及无人工移动的原过场恢复控制。相同隔离用户缓存中的原图会话推进至 400 秒，日志 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03-walkable-fixed.log`。阶段对照原版桥／楼梯的旋转及行走规则，覆盖非零角度、碰撞半径、悬崖层与高度、创建／死亡／复活／移除、叠加、其他地图、窗口画面和性能。

### 缺失自定义单位基础与资料片跨关（待验证）

路径：`src/object_data.*`、`src/session_commerce.cpp`、`tests/map_tests.cpp`、`docs/campaign-flow.md`。缺失基础的自定义单位／物品记录保留 ID 诊断并延迟到读取或创建该对象时报错；其他对象继续加载，技能／科技／状态对象保留原有严格处理。`HumanX03.w3x` 的自定义单位 `n003` 引用源表中不存在的 `nbsh`，地图脚本和预放置单位未引用这两个 ID；Win32 Release 客户端及地图测试编译通过，`war3_map_tests <data-root> <scratch> object_missing_base_in_campaign` 1 通过、0 失败，核对有效对象与缺失对象读取诊断。资料片人族第一、二章隔离会话经人工完成目标后请求后续关卡，第三章恢复 5 级及用户数据；第三章楼梯占地方向已修正，原过场在约 120 秒恢复玩家控制，记录 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03-walkable-fixed.log`。阶段核对原版缺失对象处理、多级继承／重复 ID／实际引用、自定义地图、真实窗口与战役过场移动。

### 无效单位颜色与资料片战役交接（待验证）

路径：`src/session_visual.cpp`、`tests/passive_tests.cpp`、`docs/campaign-flow.md`。`SetUnitColor` 对空、已移除及不兼容单位句柄直接返回；有效单位照常设置颜色。Win32 Release 客户端和 passive 测试目标编译通过；`war3_passive_tests <data-root> <passive-fixture> invalid-unit` 4 通过、0 失败。暗夜精灵第八章直接完成建筑目标后请求终章，终章静音隔离会话运行至返回；人族第一章越过此前空单位颜色异常并推进至 400 秒。阶段核对真实战斗、自动切关、画面、无效颜色与原版边界、玩家队伍颜色和不同单位生命周期。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/`。

### AI 无效科技费用与资料片第八章（待验证）

路径：`src/session_ai_natives.cpp`、`tests/ai_control_tests.cpp`、`docs/ai.md`。不存在的科技 ID 在金币和木材费用查询中返回零；有效科技使用当前等级及源费用。Win32 Release 客户端与 AI 控制测试编译通过；`war3_ai_control_tests <data-root> <ai-control-fixture>` 4 通过、0 失败。`NightElfX08.w3x` 静音隔离会话越过此前 89.78 秒的费用异常，空闲推进到 400 秒，日志 `tmp/docs-artifacts/war3/tft-ne4-next/ne8-cost-fixed.log`。阶段核对原版不同 ID／等级／排队状态的返回值、真实对局、实际窗口和战役完整任务。

### 空间声音播放转移（待验证）

路径：`src/sound.cpp`、`tests/sound_tests.cpp`、`docs/script-sound.md`。空间声音在 `KillSoundWhenDone` 或带淡出的释放后，保留方向、音锥和锥外音量。Win32 Release 客户端和声音测试目标编译通过；`war3_sound_tests.exe <data-root> <scratch-root> sound_detached_spatial_cone` 1 通过、0 失败，以原 WAV 和静默时钟检查两种释放方式及监听者前后移动；初次测试因测试夹具意外打开本机音频设备失败，改为纯内存播放后通过。阶段核对真实音频输出、锥角和距离衰减、附着单位移动／删除、循环与淡出、脚本句柄生命周期和原版行为。

### 亡灵第五章至第八章跨关（待验证）

路径：`docs/campaign-flow.md`。原图隔离会话沿用同一缓存，观察第五章、间章、第六章及第七章的换关请求，第六至八章恢复阿尔萨斯的等级及用户数据，第八章人工缩短召唤计时后记录胜利；日志位于 `tmp/docs-artifacts/war3/undead05-chain/`。阶段验证完整窗口自动切关、自然战斗／寻路、30 分钟防守、两名英雄与物品继承、原版缓存格式及战役音画。

### 回复、双倍伤害及幻象符文（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_wards_roar.cpp`、`src/session_inventory.cpp`、`tests/dota_rune_tests.cpp`、`CMakeLists.txt`；说明见[魔瓶](dota-bottle.md)。自目标恢复与怒吼类一次性物品生效，单位可施放 `AIil`，零施法点且目标在射程内同步处理，脚本型一次性物品在拾取后消耗。Win32 Release 客户端和测试程序编译通过；DotA 原图 `regen`、`damage`、`illusion` 各 1 通过、0 失败，检查真实装瓶／释放、恢复、武器伤害、两个幻象及魔瓶恢复。`battle-roar` 4 通过、0 失败；`mirror`、`powerup` 各 1 通过、0 失败，均不加载 Game.dll。阶段核对自然拾取、施法点／重入／移动目标与事件顺序、原版属性和持续时间、不同英雄与技能、真实窗口和联机。

### JASS 数组边界与无效物品操作（待验证）

路径：`src/jass_runtime.cpp`、`src/session_entities.cpp`、`src/session_inventory.cpp`、`tests/jass_runtime_tests.cpp`、`tests/passive_tests.cpp`；原版入口证据及局限见 [JASS](jass.md) 和 [物品句柄](dota-bkb-item-handles.md)。越界数组读返回零值、写不生效；无效物品创建返回空值，设置函数安全返回。Win32 Release 客户端、两项测试程序编译通过；JASS 运行时 16 通过、0 失败，`invalid-item` 1 通过、0 失败。DotA 原图隔离会话完成符文装瓶与释放并恢复魔瓶；急速和赏金效果可观察，回复、幻象及双倍伤害效果已通过原图专项检查。阶段核对原版数组各类型／边界和物品回调、自然拾取及实际窗口。

### Channel 物品目标与魔瓶装符（部分实现，待验证）

路径：`src/session.h`、`src/session_control_spells.cpp`、`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_teleport.cpp`、`src/game_view.cpp`；说明见[魔瓶与物品目标](dota-bottle.md)。Channel 可选择源配置允许的地面物品，技能效果事件先于物品使用事件；DotA 原图隔离探针将急速符 `I006` 装入空瓶 `I0AM` 并生成 `I0H1`，单位及背包物品目标被拒绝。后续已修复数组越界读取及物品空句柄异常；六种符文在隔离场景均能恢复魔瓶，回复、幻象及双倍伤害效果已通过原图专项检查。客户端及 mobility 程序编译通过；`remove-item`、`reset-cooldown` 各 1 通过、0 失败，臂章和希瓦隔离探针仍观测到预期状态。记录位于 `tmp/docs-artifacts/war3/dota-bottle/`。阶段核对原版事件顺序、物品耗尽与施法回调重入、各类物品／单位目标、六种符文完整周期、图形选择和联机；继续核对自然拾取及原版表现。

### 携带物品移除事件与臂章（待验证）

路径：`src/entities.h`、`src/session_inventory.cpp`、`src/session_item_use.cpp`、`tests/generate-stealth-fixture.py`、`tests/mobility_tests.cpp`；说明见[臂章](dota-armlet.md)。移除携带物品时沿用丢弃事件及物品上下文，阻止移除回调重入；地面物品移除不产生丢弃事件。Win32 Release 客户端与 mobility 测试程序编译通过；`war3_mobility_tests.exe <data-root> <fixture> remove-item` 和 `powerup` 各 1 通过、0 失败。DotA 原图隔离探针在关闭／开启／关闭过程中观察力量 22／47／22、最大生命 518／993／518，日志 `tmp/docs-artifacts/war3/dota-armlet/final.log`。阶段核对原版移除／丢弃／消耗／出售事件时序与递归、不同持有者与拾取物品、实际购买输入、图形界面和联机。

### 主动物品施法事件与隐藏单位目标施法（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_item_use.cpp`、`tests/mobility_tests.cpp`；说明见[希瓦的守护](dota-shiva.md)。非拾取型永久属性物品接入技能事件和实际效果；脚本可令显示隐藏的单位施放目标技能。Win32 Release 客户端与 mobility 测试程序编译通过；`war3_mobility_tests.exe <data-root> <stealth-fixture> hidden-caster` 和 `powerup` 各 1 通过、0 失败。DotA 原图隔离会话 `tmp/docs-artifacts/war3/dota-shiva/after-hidden.log` 显示冰环伤害、减速与恢复；复现：`tmp/docs-artifacts/war3/dota-shiva/build/Release/dota_shiva.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对事件顺序／费用／中断、属性物品与拾取物品、隐藏与运输／死亡、实际购买／输入、范围／多个目标、窗口、原版和联机。


### 风步负淡入时间与相位鞋（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spell_effects.cpp`、`src/session_mobility.cpp`、`src/session_visibility.cpp`；说明见[相位鞋](dota-phase-boots.md)。负淡入风步保留移动及穿行状态，不进入隐形。Win32 Release 客户端及 mobility 测试程序编译通过；DotA 原图隔离会话使用 `I0GJ` 后可见且移速倍率为 1.16，效果到期恢复，记录 `tmp/docs-artifacts/war3/dota-phase/after.log`；普通风步 `war3_mobility_tests.exe <data-root> <stealth-fixture> windwalk` 1 通过、0 失败。阶段核对负值与零值原版语义、隐身叠加、穿行／索敌、使用及到期、窗口和联机。


### 亡灵第三章至第五章隔离链路（待验证）

路径：`docs/campaign-flow.md`。同版核心隔离探针使用第二章缓存，第三章击杀基地后请求第四章；第四章恢复英雄、击杀祭坛、拾取钥匙、移入出口后请求第五章；第五章恢复 5 级和用户数据 24168。日志及本地探针位于 `tmp/docs-artifacts/war3/undead03-end/`。阶段验证正常战斗、寻路、完整目标及过场、产品窗口自动换关、声音、原版存档格式与实际画面。


### 零数量召唤物品能力（待验证）

路径：`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_spell_natives.cpp`、`tests/mobility_tests.cpp`；说明见[物品召唤](item-summons-buildings.md)。零数量召唤物品能力可完成施法和发布事件，技能冷却重置保留物品冷却。Win32 Release 客户端和 mobility 测试程序编译通过；`war3_mobility_tests.exe <data-root> <stealth-fixture> reset-cooldown` 1 通过、0 失败，使用真实闪烁技能和物品验证冷却分离。DotA 原图隔离会话使用刷新球后技能冷却清零、物品及刷新球自身冷却保留，日志 `tmp/docs-artifacts/war3/dota-refresher/after-reset.log`；探针复现：`tmp/docs-artifacts/war3/dota-refresher/build/Release/dota_refresher.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对零／单／双组召唤、施法事件与费用、原版 `UnitResetCooldown` 的物品冷却范围及时序、刷新球真实购买与使用、窗口和联机。


### 镜像物品与幻影斧（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_mobility.cpp`；说明见[镜像物品](dota-manta.md)。`AOmi` 物品连接既有镜像转换及施法票据。Win32 Release 客户端和 mobility 测试程序编译通过；DotA 原图隔离会话创建英雄和 `I09F` 后产生两个幻象，记录 `tmp/docs-artifacts/war3/dota-item-probe/I09F-clones.log`；普通单位技能 `war3_mobility_tests.exe <data-root> <stealth-fixture> mirror` 1 通过、0 失败，不加载 Game.dll。阶段核对真实购买／使用、远程英雄、转换失效和事件重入、多个物品／地图覆盖、窗口、原版和联机。


### 刀阵物品与灵魂之戒（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[刀阵物品](dota-soul-ring.md)。`AEfk` 物品连接技能事件与刀阵消费者。Win32 Release 增量编译通过；DotA 原图隔离会话直接创建 `I0LL`，观察生命减少、临时魔法增加和消退、冷却内重复使用被拒绝，记录 `tmp/docs-artifacts/war3/dota-soul-ring/after-checked.log`；复现：`tmp/docs-artifacts/war3/dota-soul-ring/build/Release/dota_soul_ring.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对真实购买／使用、生命不足、魔法使用与到期、目标／伤害、多物品和地图覆盖、事件、窗口及原版和联机。


### 风步物品与洛萨之锋（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[风步物品](dota-lothar.md)。`AOwk` 物品连接已有风步施法、隐身状态和物品冷却。Win32 Release 客户端增量编译通过；DotA 原图隔离会话直接创建英雄和洛萨之锋，观察隐身、移速加成、冷却及冷却内拒绝再次使用，记录 `tmp/docs-artifacts/war3/dota-lothar/after-checked.log`；探针复现：`tmp/docs-artifacts/war3/dota-lothar/build/Release/dota_lothar.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对真实购买／使用、破隐攻击、事件与时序、多物品和地图覆盖、窗口及原版和联机。


### 跨岛进攻的目标小范围移动（待验证）

路径：`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。同一单位目标距原卸载点不超过 128 时，保留现有波次及购买后待续计划；超出范围沿用取消与重选。Win32 Release 客户端及 CampaignAI 目标编译通过。BootyBay 地形隔离检查 `island-target-small-move`、`island-target-change`、`island-flight-target-move`、`island-purchase-pending`、`island-auto-multiwave-script` 各 1 通过、0 失败，无 Game.dll。小范围场景覆盖上船前和舱内两次目标移动、重复下令、登陆和目标攻击；目标暂停／运输期间无敌，阈值不是原版证据。复现：在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_campaign_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/campaign-ai/fixture.w3m" <模式>`。阶段检查持续移动及阈值边界、飞行与登艇阶段、目的地受阻、水陆切换、多单位多载具、目标死亡／易主、脚本／玩家换令、完整对局、联机和原版策略。

### 购买中的跨岛进攻（待验证）

路径：`src/ai.h`、`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。购买尚未完成时保留进攻目的地，成功获取可用载具后继续既有运输，购买失败且没有本方运输工具，或目标失效时清理状态。Win32 Release 客户端及 CampaignAI 目标编译通过；BootyBay 地形隔离检查 `island-purchase-pending`、`island-purchase-busy`、`island-purchase-cancel`、`island-purchase-target-death`、`island-purchase-attack`、`island-auto-multiwave-script` 各 1 通过、0 失败，无 Game.dll。夹具预置资源、商店库存和部队，忙碌模式额外预置载具，买家／士兵无敌，敌方目标暂停；非完整对局。复现：在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_campaign_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/campaign-ai/fixture.w3m" <模式>`。阶段核对目标移动／替换／退却、资金或库存变化、买家换令／死亡／阻塞、船舶忙碌／不可用、多个波次与载具、四族实际策略、联机和原版行为。

### 飞艇击毁乘员状态（待验证）

路径：`src/spells.h`、`src/session_control_spells.cpp`、`src/session_transport.cpp`、`tests/transport_tests.cpp`；说明见 [运输流程](transport.md)。有 `Achd` 的载具死亡且乘员成功落地后附加 `Bchd`，按普通／英雄源时长和移动／攻击恢复字段影响真实速度；共享恢复曲线为当前近似。Win32 Release 客户端与 transport 目标增量编译通过；在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_transport_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/transport/fixture.w3m" crash`，隔离检查 1 通过、0 失败，覆盖陆地释放、普通／英雄持续时间、减速恢复及不可驱散，无 Game.dll。阶段核对无能力／禁用／移除／正常卸载、陆地／水面／阻挡与无落点、英雄／普通／召唤／魔免／无敌、自定义持续及恢复字段、召唤伤害、重入／转让／复活／状态叠加、原版计时及视听、地图和联机。

### 链式驱散（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_item_use.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [链式驱散](chain-dispel.md)。单位技能和中和权杖进入目标施法、弹道、逐次驱散和物品次数；电脑可选取有可驱散状态的目标。Win32 Release 客户端及 spell 目标编译通过；在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_spell_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/mind-rot/fixture.w3m" chain-dispel`，隔离检查 1 通过、0 失败，覆盖两条入口、友方双目标和次数，不加载 Game.dll。阶段对照原版选点／跳转／上限、敌友／魔免／无敌／幻象／召唤、源覆盖与零值、回调重入／死亡／易主、费用／冷却／护盾、电脑、真实窗口／声音、地图和联机。

### 野生动物游荡（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session_ambient_passives.cpp`、`tests/passive_tests.cpp`、`docs/mechanical-critters.md`。源 `Awan` 接入空闲游荡与实际移动；初始区域、间隔与随机流使用当前近似实现。Win32 Release 客户端和 passive 目标编译通过；`build/windows-x86/bin/Release/war3_passive_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/auras-passives/fixture.w3m" wander`（在 `watcher/war3` 下执行）隔离检查 1 通过、0 失败，覆盖原鼠单位移动、范围、保持位置和移除能力，无 Game.dll。阶段检查原地图动物／机械小动物、导航／路径障碍、订单事件、玩家命令与保持、暂停／眩晕／禁用／变形／转移／死亡／移除、原版时序与范围、随机调用顺序、多人同步和大地图性能。

### 中立魔法之泉（待验证）

路径：`src/session_passive_info.cpp`、`tests/passive_tests.cpp`、`docs/auras-passives.md`。`Aarm` 原型接入魔法光环及实际恢复，源 `nmoo/ANre` 使用百分比和范围。Win32 Release 客户端及 passive 检查目标增量编译通过；隔离会话 `build/windows-x86/bin/Release/war3_passive_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/auras-passives/fixture.w3m" fountain`（在 `watcher/war3` 下执行，夹具由 `tests/generate-passive-fixture.py` 生成） 1 通过、0 失败，检查原生命／魔法之泉对两个玩家的恢复、范围外单位及来源移除，不加载 Game.dll。阶段检查泉水地图、源数据覆盖、离开／返回、不同玩家及有机／机械／空地目标、多个来源／辉煌光环叠加、buff／视觉／声音、原版恢复速率与时序、实际窗口及联机。

### 重生神符（待验证）

路径：`src/consumables.h`、`src/session_consumables.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/rebirth-rune.md`。拾取 `rreb` 时消费物品记录的来源类型，创建拾取者所属单位；空／无效类型或无可用落点不创建单位。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/mind-rot/fixture.w3m rebirth-rune`、`shield-rune`、`mind-rot` 各 1/1。补充 `war3_spell_tests <data-root> tmp/docs-artifacts/war3/rebirth-rune/drop-fixture.w3m rebirth-drop` 1/1：死亡回调运行原 `UnitDropItem`，玩家目标命令拾取并创建单位；夹具直接击杀单位。阶段检查原地图自然战斗掉落、来源覆盖、不同玩家／单位类型、无空间、事件重入、资源释放、实际窗口、联机和原版落点／时序／归属。

### 心灵腐烂（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_caster_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_spells.cpp`、`src/session_unit_casters.cpp`、`src/session_item_use.cpp`、`src/session_ai_armies.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`；说明见 [心灵腐烂](mind-rot.md)。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/mind-rot/fixture.w3m mind-rot`、`spell-shield`、`shield-rune` 各 1/1。前者覆盖目标、源时长／耗魔、状态移除、零魔法、派生物品及护盾，夹具关闭目标自动索敌。阶段检查 AI、完整施法事件、地图覆盖、空目标分类、重复施法、魔法恢复／耗尽顺序、暂停／死亡／易主、驱散与法术偷取、实际画面、联机及原版时序。

### 群体护盾神符（待验证）

路径：`src/consumables.h`、`src/spells.h`、`src/session_consumables.cpp`、`src/session_spells.cpp`、`tests/spell_tests.cpp`、`docs/spell-shield.md`。`rsps` 拾取消费 `ANse` 的范围、目标和 `BNss`，对各友军创建可消耗的独立护盾状态；与护身符分别生效。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m shield-rune`、`spell-shield`、`acid-speed` 各 1/1。夹具覆盖神符消耗、友军／无敌友军／敌军／范围外、长时保留、单次拦截、护身符及移除；目标关闭自然生命恢复。阶段检查地图覆盖、持续时间、能力禁用与目标变化、重新拾取、驱散／法术偷取、死亡／复活、事件重入、双护盾优先级、音画、实际地图、联机与原版行为。

### 魔法护盾护身符（待验证）

路径：`src/passives.h`、`src/session.h`、`src/session_passive_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`tests/spell_tests.cpp`、`docs/spell-shield.md`。`ANss` 的原物品及单位来源消费源冷却，拦截指定敌方单体技能，施法事件、魔法和施法者冷却保留。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m spell-shield` 1/1，覆盖友方治疗、范围雷霆一击、敌方风暴之锤及冷却／移除；目标关闭自然生命恢复。同夹具 `rain-chaos`、`monsoon` 各 1/1。阶段核对其他技能、技能与物品来源／地图覆盖、事件重入、弹道和范围、死亡／转移／变形、多护盾、冷却显示、AI、真实窗口和联机；原版拦截范围与时序仍待对照。

### 视野范围加成（待验证）

路径：`src/equipment.h`、`src/passives.h`、`src/session_equipment.cpp`、`src/session_passive_info.cpp`、`src/session_fog.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`、`docs/visibility.md`。`AIsi` 的源数值及地图覆盖经单位／库存状态汇总到昼夜迷雾视野，能力可用性和科技前置参与刷新。Win32 Release 客户端及测试目标编译通过；`war3_passive_tests <data-root> <fixture> sight` 与 `weapon-ui` 各 1/1，前者覆盖两个物品的加成、能力禁用与恢复、物品和单位能力移除，以及迷雾状态变化。夹具在 `tmp/docs-artifacts/war3/sight-bonus/fixture.w3m`。阶段核对昼夜、单位移动与死亡／易主、地图覆盖与科技、幻象、共享视野、极值、多来源叠加、原版规则及实际界面；原件多来源规则尚未确认。

### 亡灵第三章开场后会话（待验证）

路径：`docs/campaign-flow.md`。使用隔离复制的第二章转场缓存、原图和无窗口静音会话推进 600 秒；150 秒检查到英雄等级 5 与用户数据 24168，120–600 秒可操作且未请求退出，日志 `tmp/docs-artifacts/war3/undead02-probe-1031/continue.log`。探针没有玩家命令、未完成任务；自然战斗和胜负、界面、自动切关与原版一致性仍待验证。

### 运输中取消与载具命令归属（待验证）

路径：`src/ai.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。波次记录载具订单轮次与上船区域；取消后当前位置不可卸载时，仍受波次控制的载具使用实际卸载技能返回上船区域。载具命令轮次变化时释放波次控制并保留新命令。Win32 Release 客户端及 CampaignAI 编译通过；BootyBay 地形 `island-flight-death`、`island-flight-retreat` 修复前复现乘员留在深水上、`island-flight-reorder` 修复前复现载具新命令被覆盖；修复后以上及 `island-flight-target-move`、`island-flight-reorder-live` 各 1/1。原公共 AI 多波、单次坐标多波、双乘员及乘员换令各 1/1。夹具预置单位与飞艇；目标消失后上船区失效、飞行中再次换令／死亡／易主、满舱多船、原版时序、实际窗口和联机待验证。

### 坐标进攻的后续运输波次（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。进攻目标有效时在波次结束后继续接运隔离队员，暂停队员恢复后可续运；目标失效、目的地改变、撤退与编队重置清除续运状态。Win32 Release 客户端及 CampaignAI 编译通过；BootyBay 地形 `island-auto-point` 修复前九人只到八人，修复后 1/1 全部登岛；`island-auto-multiwave`、`island-auto-multiwave-script`、`island-auto-resume`、`island-auto-target-death`、`island-auto-retreat`、`island-target-change`、`island-pickup-cancel` 各 1/1。夹具预置九名无敌步兵与八格飞艇，目标在出发前死亡检查；不代表完整对局或原版行为。阶段检查航行中目标消失／换令、无落点、多船、不同载具、性能、原版时序和联机。

### 隔水营地自动选择与空中运输（待验证）

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`、`docs/implementation-roadmap.md`。陆路营地优先；无陆路选择时按空闲载具、容量、乘员及空中通路回退至隔水营地；进攻时仅将隔离的地面队员加入实际运输波次。Win32 Release 客户端和 CampaignAI 编译通过；BootyBay 地形 `island-auto` 与原公共 `MinorCreepAttack` 的 `island-auto-script` 各 1/1，覆盖无／暂停／无法移动的载具、营地选择、同岛队员、组队、登艇和卸载；`reachable` 2/2，`island-wave`、`island-target-change`、`island-pickup-group`、`island-pickup-cancel` 各 1/1。夹具预置飞艇与部队，选营后将目标设为无敌。阶段核对目标变化／死亡、满载多波、多载具、陆空混编、无飞区及动态障碍、真实对局自动购买和原版策略、性能及联机。

### 运输波次与单位攻击目标（待验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。单位攻击目标与已有运输波次的目的地相同时保留波次；目标位置改变时取消旧波次。Win32 Release 客户端与 CampaignAI 测试程序编译通过；BootyBay 地形 `island-target` 修复前复现运输取消，修复后 1/1，检查重复攻击、登艇、卸载和落地后的攻击指令；`island-target-change`、`island-wave`、`island-pickup-cancel` 各 1/1。夹具预置单位、飞艇与静止无敌目标。阶段检查目标移动／死亡、途中撤退和换令、多飞艇／乘员、事件重入、原版行为、真实对局和联机；电脑自动选择跨岛目标仍待实现。

### 隔离区域的部分路径搜索（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。缓存区域可达到目标的最小网格距离，搜索确认落点及排序无法改善后结束；无区域或条件不满足时继续原搜索。Win32 Release 客户端与 world 测试程序编译通过；预建区域与未预建区域逐点对照 4/4，覆盖动态开闭、不同起点／目标／净空、共享缓存和大区域。OrcX03b 隔离静音模拟前 120 秒分别耗时 203.671 和 140.265 秒，对照后段有编译并行，日志在 `tmp/docs-artifacts/war3/orcx03b-path-current/`。阶段检查搜索预算与相同距离的代价／格号排序、动态障碍、多移动类型、密集单位、实际战役帧时间及内存。

### 路径缓存与区域通行复用（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。按有效净空及路径版本复用短成功／部分路径，成功路径保留当前精确终点；区域图为 A* 提供通行结果。Win32 Release 客户端及 world 测试程序编译通过；精确终点、缓存失效、区域变化、部分路径及替代目标等 6 项各 1/1，预建区域与逐格搜索对照 1/1。OrcX03b 无前章 gamecache 静音模拟前 40 秒从 29.219 秒到 25.219 秒，日志在 `tmp/docs-artifacts/war3/orcx03b-path-current/`；结果不是帧率。阶段核对动态阻挡、不同净空与移动类型、搜索预算、长期对局、内存和原版路径语义。

### 英雄经验与物品栏对齐（待验证）

路径：`src/game_inventory_layout.h`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。缩小经验条并在攻击行上方留出间距；物品图标、冷却和命中使用调整后的六格坐标；攻击数值与彩色增减值按完整文字纹理宽度分隔。Win32 Release 客户端增量编译与差异检查通过。游戏内 Agent 选中六物品、100 经验的圣骑士，1264×921 画面显示六个物品位于各自槽位，经验条处于信息框内，攻击基础值与绿色加成分开；证据位于 `tmp/docs-artifacts/war3/agent-info/layout-latest-agent/`。阶段核对点击／拖拽／冷却、不同经验与攻击数值、双武器、四族及不同窗口比例，并与原版画面对照。

### 失效扩张点重新选择（待验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。坐标、工人、敌人及建造入口使用同一扩张点有效性检查；目标矿井耗尽、隐藏／死亡／移除、归属变化、失去采金能力或被本方城镇占用后，重新选择可达候选。Win32 Release 客户端和 CampaignAI 测试程序编译通过；BootyBay 地形 `reachable` 在修复前保留耗尽矿井，修复后 2/2 通过，检查替代矿井、工人和敌人查询以及城镇占用后的无目标／不建造；`expansion-empty` 2/2 通过。夹具预置矿井、位置和城镇，未覆盖自然开采和建造。阶段验证矿井易主／销毁／隐藏、能力和路径变化、多个工人和城镇、事件回调、原版缓存与选择规则、实际对局、性能和联机。

### 空扩张目标坐标（待验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。没有可用扩张点时 X／Y 返回 -1，原公共 AI 的 `ExpansionAttack` 不再向坐标 (0,0) 发出进军；有效扩张点返回其坐标。Win32 Release 客户端及 CampaignAI 目标编译通过；`reachable` 在修复前的空目标断言失败，修复后 2/2 通过；`expansion-empty` 在修复前复现原 `ExpansionAttack` 向不存在目标进军，修复后 2/2 通过，检查原脚本线程结束及目标不变。固定版 Game.dll 注册入口 `0x6f88fc90`／`0x6f88fd10`、无结果分支和 -1 常量初始化见 `tmp/docs-artifacts/war3/ai-expansion-sentinel/original-rizin.txt`。夹具直接设空矿藏和部队；扩张点失效／改变、完整电脑对局、原版动态行为及联机仍待阶段验证。

### 飞艇多乘员隔水接应（待验证）

路径：`src/ai.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。按货舱容量预约隔水乘员，使用原装载订单依次接应；排队期间的新命令按单位订单轮次保留，失效目标释放接应票据并继续队列。Win32 Release 客户端和测试程序编译通过；BootyBay 地形的 `island-pickup-group` 修复前分配失败，修复后 1/1 通过，两个乘员于约 44.25 秒模拟时完成接应及交付；`island-pickup-reorder`、`island-pickup-death`、`island-pickup-capacity` 各 1/1，覆盖排队命令、首名死亡和九人对八格预约上限。既有单人接应／取消／超时及正常、慢速登艇共 5 项通过。夹具预置单位、飞艇和目标并设置无敌；容量检查只覆盖预约，未验证满舱运输。阶段验证多岛、多飞艇、满舱运输、队列移动／易主／暂停、乘员载具死亡、回调重入、原版队列与时序、自动选目标、窗口、性能及联机。

### 飞艇隔水接应（待验证）

路径：`src/ai.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。地面乘员无法步行登艇时，空闲空载飞艇使用原装载能力接近并装载乘员，再沿既有波次卸载；接应订单按施法票据处理取消和超时，避免取消已替换的命令。Win32 Release 客户端及 CampaignAI 目标编译通过；BootyBay 地形隔离夹具 `island-pickup` 在修复前无法分配，修复后 1/1 通过，模拟至 43.25 秒完成接应与交付；`island-pickup-cancel`、`island-pickup-timeout`、`island-wave`、`island-long` 各 1/1。超时夹具直接暂停载具状态；场景预置目标、部队和飞艇并设置无敌，不代表完整电脑对局。阶段验证多岛多乘员、多飞艇、移动／死亡／易主／暂停、路径和装载容量、回调重入、原版选择／时序、实际窗口、性能及联机。

### 飞艇波次等待远距离登艇（待验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。为每个成功分配的乘员根据登艇路线长度、移动速度和现有速度修正估算等待时间，取最慢值，限制为 45–600 秒；期限到达、失效和更改目标沿用现有清理。Win32 Release 客户端和 CampaignAI 测试目标编译通过；BootyBay 地形 `island-long` 在修复前无法完成登艇，修复后 1/1 通过，两名快慢乘员分别登艇并在约 76 秒模拟时卸载；`island-wave` 1/1 通过。夹具预置部队、载具和目标，将一名步兵速度设为 5 并设为无敌；并非完整 AI 对局。阶段验证多人拥堵、运输单位移动／死亡／易主、途中减速／暂停、等待上限与命令变化、混编、多载具、自动选目标、实际窗口和联机，并对照原版等待与排序。

### 物品栏说明提示（待验证）

路径：`src/game_view.*`、`src/game_inventory_drag.cpp`、`src/session.h`、`docs/inventory-interactions.md`。悬停实际物品格显示名称及原资源／地图覆盖说明，增强提示关闭时显示名称；长内容分页，拖动或界面遮挡时隐藏。Win32 Release 客户端编译通过；DotA_v6.83d 隔离会话读取到动物信使的地图覆盖中文说明和颜色标记，记录 `tmp/docs-artifacts/war3/courier-journey/tooltip.log`，尚未验证渲染。阶段检查空槽／切换选区／六槽／多选、地图覆盖与颜色和数据引用、长文本分页、增强设置、拖放和目标模式、四族皮肤、窗口比例与原版画面。当前显示环境无法创建 D3D9 设备，尚无实际画面证据。

DotA_v6.83d 隔离配送探针按 2 秒采样，信使先接近英雄、交付物品并返回基地；记录 `tmp/docs-artifacts/war3/courier-journey/before.log`。该探针预置物品并调整单位位置，不代表实际窗口和完整配送验收。

### 暂停打断持续施法（待验证）

路径：`src/session_entities.cpp`、`tests/channel_tests.cpp`、`docs/teleport.md`、`docs/spirit-split-tornado.md`。首次暂停单位时中断其当前施法、释放关联资源并发出 ENDCAST；重复暂停和恢复不重复派发。Win32 Release 客户端及测试目标编译通过；`war3_channel_tests <data-root> <channel-fixture>` 1/1 通过，覆盖持续施法暂停、重复暂停、恢复及施法完成事件内暂停。DotA_v6.83d 隔离会话中回城后英雄到达目的地、施法结束且可接收移动，记录 `tmp/docs-artifacts/war3/dota-item-flow/portal-pause-after.log`。原版 1.27 `PauseUnit` 在首次暂停时进入单位暂停动作路径，反汇编见 `tmp/docs-artifacts/war3/dota-item-flow/pause-original-rizin.txt`；是否对所有施法阶段发出相同事件仍需运行原版核对。阶段检查暂停期间及恢复的其他订单、移动／采集／生产、重复调用、施法回调重入、原版事件时序、实际窗口和联机同步。

### 地图脚本回城与地表特效（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_spirit_split.cpp`、`src/session_effects.cpp`，说明见 [龙卷风](spirit-split-tornado.md) 和 [地表特效](ubersplats.md)。Release 客户端编译通过；原版 ANto 隔离探针创建旋风并以停止命令结束。DotA_v6.83d 隔离会话购买并使用回城卷轴，原图脚本创建 SCTP 并将英雄传送至目标附近，随后移动命令可中断持续施法；记录 `tmp/docs-artifacts/war3/dota-item-flow/portal-move-after.log`。阶段需对照原版结束时机、暂停／恢复、取消、目标建筑／小地图／双击、费用与多次回城、特效画面、地图覆盖和联机同步。

### 消耗品施法事件（待验证）

路径：`src/session_consumables.cpp`，说明见 [消耗品](consumables.md)。Release 客户端及相关测试程序编译通过；`war3_consumption_tests <data-root> <fixture> protection` 1 通过、0 失败。DotA_v6.83d 隔离会话使用附加观察脚本检查魔瓶、净化药水的施法阶段、目标和回调移除物品；魔瓶三次使用及泉水补充记录在 `tmp/docs-artifacts/war3/dota-item-flow/bottle-observed-events.log`。阶段核对八类消耗品和符文的事件时序／目标、物品事件先后、费用／冷却、驱散、目标变更、施法者死亡／易主／新订单、脚本重入、原版及联机同步。

### 失效位置的点订单（待验证）

路径：`src/session_orders.cpp`、`tests/order_queue_tests.cpp`，原件入口与行为见 [点目标、范围伤害与召唤物](area-spells.md)。Release 客户端及订单测试目标编译通过；`war3_order_queue_tests <data-root> <BootyBay.w3m> invalid-location` 1 通过、0 失败，覆盖空、已移除、类型不兼容和未知位置及已有队列，并检查有效位置的两种订单。DotA_v6.83d 隔离场景在原先位置句柄异常处继续推进，记录 `tmp/docs-artifacts/war3/dota-item-flow/dust-invalid-location-apiv-after.log`。阶段检查群组位置订单、脚本重入、其他订单、完整地图及联机同步。

### 显影之尘施法事件（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`tests/stealth_tests.cpp`，说明见 [主动显形](stealth-reveal.md)。Release 客户端及专项目标编译通过；`war3_stealth_tests <data-root> <fixture> dust` 1 通过、0 失败，覆盖侦测跟随、冷却、到期和次数消耗。DotA_v6.83d 隔离会话中显影之尘对敌方隐身英雄应用 `Bdet`，并触发地图脚本添加 `A2SJ`，记录 `tmp/docs-artifacts/war3/dota-item-flow/dust-effects-after.log`。阶段检查原版事件和费用时序、目标／魔免／侦测共享、技能中断、脚本重入、最后一次消耗、实际窗口及联机同步。

### Channel 物品目标与地图事件（待验证）

路径：`src/session_item_use.cpp`、`src/session.h`、`src/session_spells.cpp`、`src/game_view.cpp`、`src/game_hero_bar.cpp`、`src/game_inventory_drag.cpp`，说明见 [持续施法与地面效果](channels.md)。Release 客户端编译通过；DotA_v6.83d 隔离会话购买侦察守卫，对地点使用生成 `o004`，对友方英雄使用产生单份 `I05G`，两条路径均消耗一次，记录位于 `tmp/docs-artifacts/war3/dota-item-flow/ward-point.log` 和 `ward-ally.log`。阶段验证真实窗口的地点／单位／英雄头像／双击、无目标与单位目标 Channel、无效目标、费用与冷却、脚本重入及联机编码；与原版对照。

### 水元素原型物品及信使（待验证）

路径：`src/session_item_use.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`，说明见 [点目标、范围伤害与召唤物](area-spells.md)。Release 客户端和控制技能测试目标编译通过；`war3_control_tests <data-root> <fixture> purge` 1 通过、0 失败，包含普通水元素召唤。DotA_v6.83d 隔离会话购买、使用动物信使物品后生成玩家信使并消耗物品，回家命令使信使从设定位置移动；记录 `tmp/docs-artifacts/war3/dota-item-flow/courier-return.log`。阶段验证物品费用、召唤事件／零数量、窗口操作、基地地面物品收集、配送／共享控制、信使死亡／升级、脚本重入和联机同步，并与原版对照。

### 吞树物品与地图脚本（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_control_spells.cpp`、`src/session_spell_info.cpp`、`src/session_area_spells.cpp`，说明见 [吞树与魔法消耗](consumption.md)。Release 客户端及吞食测试目标编译通过，`war3_consumption_tests <data-root> <fixture> eat` 1 通过、0 失败。DotA_v6.83d 隔离会话购买 I05C，树木目标后消耗一次、杀死树木并获得地图恢复能力；友方英雄目标后消耗一次并收到 I0Q6。阶段验证实际鼠标选树与分享、被遮挡和不可见目标、距离与寻路、取消／占用、最后次数和冷却、脚本重入及联机；对照零吞食时间和目标规则的原版行为。

### 单位目标物品双击（待验证）

路径：`src/game_inventory_drag.cpp`。物品目标选择期间双击原槽位，将持有者作为单位目标提交，沿用物品命令的目标校验与队列处理。Win32 Release 客户端增量编译通过；DotA_v6.83d 隔离会话购买 `I05D` 净化药水，目标为持有者时命令接受、魔法在 10 秒内从 0 恢复至约 45.2，记录见 `tmp/docs-artifacts/war3/dota-item-flow/clarity-self.log`。阶段通过游戏内 Agent 验证双击、选目标、Shift 排队、不可对自身使用的物品及联机同步；点目标物品双击规则与原版对照。当前环境创建 D3D9 设备失败，尚无本次交互画面证据。

### 中立霜冻吐息（待验证）

路径：`src/session_spell_info.cpp`、`src/session_neutral_spells.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`，说明见 [中立能力](neutral-heroes.md)。Release 客户端和专项程序编译通过；`war3_spell_tests.exe <data-root> <fixture> frost-breath` 1/1 通过，覆盖原蓝龙施法、直接伤害、`BCbf` 持续伤害以及火焰吐息对未醉酒目标不添加燃烧。阶段检查多目标锥形、总伤害上限、施法与死亡回调、地图覆盖、状态叠加／驱散、电脑决策、原版伤害分类、声音与画面。

### 静态与建筑阴影插值（待验证）

路径：`src/game_effects.cpp`、`src/game_view.h`，说明见 [单位地面阴影](unit-shadows.md)。Release 编译通过；原地形、无 SHD 和建筑定时移除的隐藏窗口截图已检查，确认阴影边缘平滑及移除后消失。阶段核对跨分块接缝、灰度／透明贴图、地图边界、静态／建筑叠加、视野及动态变化、坡面／水面、设备恢复和 Amazonia 帧耗时，并与原版像素对照。

### 小地图镜头范围（待验证）

路径：`src/game_view.cpp`；说明见 [小地图](minimap.md)。Release 编译通过；关闭迷雾的原地形夹具在隐藏窗口显示底图及视口轮廓，程序滚轮消息后轮廓尺寸变化。阶段检查实际鼠标、镜头平移／旋转／缩放、地图边缘、悬崖和水面、水平线／远平面、战役镜头、窗口比例／DPI、设备恢复、性能及原版轮廓。

### 娜迦潜水形态（待验证）

路径：`src/session_spell_info.cpp`、`src/session_entities.cpp`、`tests/unit_forms_tests.cpp`，说明见 [单位形态](unit-forms.md)。Win32 Release 客户端和专项程序编译通过；`war3_unit_forms_tests.exe <data-root> <fixture> submerge` 1/1 通过，覆盖三对原始类型的订单、显隐、速度、武器和句柄往返及直接创建潜水形态后浮出。该次未验证地面／水域限制；阶段检查真实水陆地形、科技前置、侦测、打断／死亡／复活、地图覆盖、AI、动画及原版行为。

### 中立生物死亡生成（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_neutral_spells.cpp`、`tests/corpse_tests.cpp`，说明见 [尸体与复活](corpses.md)。Win32 Release 客户端和尸体测试编译通过；`war3_corpse_tests.exe <data-root> <fixture> spawn-on-death` 1/1 通过，覆盖三种原始类型、数量与归属和直接移除。首次在另一落点只生成 1 只，改用开放位置后通过；受阻位置和原版处理仍待验证。阶段检查地图覆盖、能力禁用／移除、幻象／爆炸／复活／死亡回调重入、无位置、无期限和事件，以及实际地图与原版对照。

### 中立操纵死尸和地狱火（待验证）

路径：`src/session_spell_info.cpp`、`src/session_ai_armies.cpp`、`tests/corpse_tests.cpp`。`ACad` 和 `ANin` 接入既有技能、实际订单及电脑决策，数值取各自原始或地图覆盖字段；说明见 [尸体与复活](corpses.md)和[范围与召唤](area-spells.md)。Win32 Release 客户端和尸体测试编译通过；原地形夹具 `creep-spells` 1/1 通过，覆盖尸体消费、非无敌及 120 秒时限、地狱火实体与 360 秒时限。阶段检查中立单位自身与电脑决策、目标／距离／费用／事件／中断、地图覆盖、完整效果、实际地图和原版对照。

DotA_v6.83d 静音无操作隔离会话当前完成 main 并推进 600 秒；BootyBay 人族电脑隔离会话推进 60 秒时有 1 个城镇、5 名采集工人、1 项生产队列、3 项建造／施工。日志及结果仅覆盖这些路径，不代表真实窗口操作或完整对局；DotA 日志为 `tmp/docs-artifacts/war3/dota-600s-current.log`。

### 武器显示字段（待验证）

路径：`src/session_research.cpp`、`src/game_commands.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`，说明见 [单位战斗信息面板](unit-combat-panel.md)。Win32 Release 客户端和专项程序编译通过；生成夹具后运行 `war3_passive_tests.exe <data-root> <fixture> weapon-ui`，1/1 通过。阶段核对原版显示筛选、树木专用武器、两把可见武器、对象覆盖／变形、增益与真实面板；完整攻击和原版视觉未由该检查证明。

### 单位信息与多选位置修正（待验证）

路径：`src/game_view.cpp`、`src/game_selection_panel.cpp`、`src/game_commands.cpp`。单位／物品名称与生命、魔法及单位信息移入底部信息区；多选图标和鼠标命中共用调整后的位置；英雄经验条及其悬停区域移到头像下方。Win32 Release 编译通过；在 1258×904 隐藏窗口，用程序消息分别选中单个农民、单个圣骑士和两个农民，三次截图均显示在面板内，日志确认选中数量及正常退出，证据位于 `tmp/docs-artifacts/war3/selection-diagnostic/ui-{current,hero,multi}-selected.*`。阶段继续检查真实鼠标与命令按钮、货舱／建造／生产、地面物品、长文字、不同窗口／DPI、四族皮肤及原版画面对照；本次截图不代表完整 UI 还原。

### 单人近战默认对手（待验证）

路径：`src/setup.h/.cpp`、`src/map_browser.cpp`、`tests/setup_tests.cpp`，说明见 [地图与选图流程](map-loading.md)。Win32 Release 产品及配置测试编译通过，配置测试 6/6 通过；BootyBay 隐藏窗口 300 帧未出现无对手即时胜利对话框。阶段验证其他近战地图、队伍和电脑槽、用户修改及同图草稿、真实交互和完整对局，并对照原版默认值；自定义、固定设置和自定义势力地图不自动添加对手。

### 隐形单位侦测事件（待验证）

路径：`src/script_state.h`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_tick.cpp`、`src/session_visibility.cpp`、`tests/generate-invisibility-fixture.py`、`tests/visibility_tests.cpp`；说明见 [脚本事件](script-events.md)。Win32 Release 客户端和专项程序编译通过；生成 BootyBay 夹具后运行 `war3_visibility_tests.exe <data-root> <fixture> detected-event`，1/1 通过，覆盖首次发现、持续侦测、离开后再次发现和上下文。侦测事件目前覆盖处于视野中、由真视发现的隐形单位及其事件上下文。阶段集中对照玩家事件注册方、初次注册、普通可见单位、共享视野、检测进出、回调重入、多人及固定版时序；仅有监听时扫描，需检查大地图开销。

### 球体能力附件（待验证）

路径：`src/effects.h`、`src/game_effects.cpp`、`src/passives.h`、`src/session_game.cpp`、`src/session_passive_info.cpp`、`src/session_weapon_effects.cpp`。Win32 Release 客户端编译通过。球体能力的目标特效通过现有模型附件系统显示，能力禁用、移除及单位形态变化时刷新；单位死亡或隐藏时不绘制。原版 1.27 `War3Patch.mpq` 的 `Units\\HumanAbilityFunc.txt` 中 `Asph` 使用 BloodElfBall 模型及 sprite first／second／third 三个挂点。阶段检查实际血法师与幻象、挂点动画、死亡／复活、技能切换及地图覆盖，核对原版攻击时球体行为；当前仅接入持续附件，未实现球体发射和恢复行为。

## 寄生及蜘蛛召唤待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_caster_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_callbacks.cpp`、`src/session_neutral_spells.cpp`；说明见 `parasite.md`。尚未编译或执行玩法检查。阶段检查原版 `ANpa` 和 DotA_v6.83d `A0BH` 的字段覆盖、学习与订单、`B0E7` 查询、毒伤／减速／叠加／驱散、攻击及毒伤致死、召唤类型／数量／归属／时限和 JASS 召唤事件；对照英雄／幻象／尸体及脚本重入边界，重点检查到期 tick 致死顺序。合并验证时构建 `cmake --build --preset release --target war3 --parallel 8`，并运行地图实测及原版对照。

## 企鹅玩具待验证

路径：`src/session_consumables.cpp`；说明见 `consumables.md`。阶段检查 `stpg` 满血与受伤使用、重复使用与背包保留、音效与音量、物品事件、冷却组、自定义零恢复物品、双端和原版规则；暂未执行玩法或听感验证。

## 吸血药水待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_effects.cpp`、`src/session_attack_passives.cpp`、`src/session_item_use.cpp`、`src/session_projectiles.cpp`、`src/session_network_identity.cpp`；说明见 `vampirism-potion.md`。包含本轮信号枪和科技快照的 Win32 Release 客户端编译通过。阶段检查购买／使用／冷却、攻击加成、近远程回血、目标限制、击杀／复活／易主、驱散、光环叠加、脚本重入、联机及原版规则。

## 保存权杖基地优先级待验证

路径：`src/session_teleport.cpp`；说明见 `preservation.md`。包含本轮物品和科技快照改动的 Win32 Release 客户端编译通过。阶段检查四族不同级别、混合种族、同级及自定义 `prio`、基地死亡／施工／转让、目标所有者及原版选择行为。

## 玩家科技快照待验证

路径：`src/session.h`、`src/session_game.cpp`；说明见 `player-tech-persistence.md`。包含本轮物品改动的 Win32 Release 客户端编译通过。阶段检查所有玩家研究等级、科技上限和能力可用性往返，损坏／重复键／非法值事务拒绝、活跃会话及已有单位限制，以及与单位、资源和生产队列的完整恢复；尚未接入存档。

## 信号枪物品待验证

路径：`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_item_use.cpp`；说明见 `flare.md`。包含本轮吸血药水和科技快照的 Win32 Release 客户端编译通过。阶段检查地图与小地图选点、次数及耗尽、施法事件／取消、延迟／视野／侦测、暂停／施法者死亡、自定义覆盖、联机和原版表现。

## 保存权杖待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_item_use.cpp`、`src/session_area_spells.cpp`、`src/session_teleport.cpp`；说明见 `preservation.md`。包含攻击地面的 Win32 Release 客户端编译通过。阶段检查目标、基地筛选、传送落点、施法事件／冷却、目标或基地易主／死亡／删除、回调重入、自定义掩码、联机、性能及原版对照。

## 攻城单位攻击地面待验证

路径：`src/session_attack_ground.cpp`、`src/combat.h`、`src/session.h`、`src/session_combat.cpp`、`src/session_orders.cpp`、`src/player_commands.h/.cpp`、`src/game_loading.h/.cpp`、`src/game_view.h/.cpp`、`src/game_commands.cpp`、`src/game_waypoints.cpp`、`src/game_hero_bar.cpp`、`src/game_selection_panel.cpp`、`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`、`src/session_network_identity.cpp`；说明见 `attack-ground.md`。包含保存权杖的 Win32 Release 客户端编译通过。阶段检查 G 按钮、目标与视野、靠近／持续攻击／取消、伤害和燃烧油、排队、双端及原版资格和时序。

## 玩家基础状态快照待验证

路径：`src/session.h`、`src/session_game.cpp`、`tests/clock_tests.cpp`；说明见 `player-state-persistence.md`。Win32 Release 客户端及 `war3_clock_tests` 编译通过，行为检查待运行。阶段检查 16 名玩家资源／人口／状态位及维护费覆盖往返、损坏／重复键／截断的事务性拒绝、执行及联网限制、与单位／生产等完整恢复的一致性；尚未接入存档。

## 地面物品武器攻击待验证

路径：`src/combat.h`、`src/game_view.cpp`、`src/session.h`、`src/session_combat.cpp`、`src/session_combat_orders.cpp`、`src/session_combat_destructable.cpp`、`src/session_projectiles.cpp`；说明见 `weapon-item-attacks.md`。包含时钟快照的 Win32 Release 客户端编译通过。阶段检查四族武器、目标选择／排队、近战与弹道、范围／直线／弹跳、拾取／丢弃／销毁与回调、迷雾、联机、性能及原版表现。

## 世界昼夜时钟快照待验证

路径：`src/game_clock.h/.cpp`、`tests/clock_tests.cpp`；说明见 `world-clock-persistence.md`。Win32 Release 客户端及 `war3_clock_tests` 编译通过，行为检查待运行。阶段检查暂停／倍速与临时时间效果往返和持续推进、损坏／规则不匹配的事务性拒绝，以及与完整存档及时间事件的组合；未接入实际存档。

## 魔法吸取权杖待验证

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_resource_spells.cpp`、`src/session_item_use.cpp`；说明见 `mana-steal.md`。包含本轮直线穿透及随机流快照的 Win32 Release 客户端编译通过。阶段检查目标选择／接近、魔法不足／上限、目标类型和魔免、次数／冷却、事件与回调、固定／比例数据、地图覆盖、联机及原版行为；部分自定义字段尚不支持。

## 直线穿透伤害待验证

路径：`src/session.h`、`src/session_destructables.cpp`、`src/session_projectiles.cpp`；说明见 `destructable-weapon-attacks.md`。包含本轮魔法吸取权杖与随机流快照的 Win32 Release 客户端编译通过。阶段检查刃车及自定义直线武器的零／非零扩散距离、宽度、单位与障碍、对象半径、死亡复活、回调和联机性能，对照原版命中顺序与伤害衰减。

## 会话随机流快照待验证

路径：`src/audio_random.h/.cpp`、`src/session.h`、`src/session_game.cpp`；说明见 `session-random-persistence.md`。包含本轮玩法改动的 Win32 Release 客户端编译通过。阶段检查主流和 45 条辅助流往返、后续序列、损坏／截断／非法状态的事务性拒绝、活动脚本与联机限制，以及和未来完整会话恢复的组合；尚未接入存档。

## 范围及弹跳武器伤害可破坏物待验证

路径：`src/combat.h`、`src/session.h`、`src/session_combat_destructable.cpp`、`src/session_projectiles.cpp`；说明见 `destructable-weapon-attacks.md`。包含本轮 JASS 快照及骰面处理的 Win32 Release 客户端编译通过。阶段检查炮击各范围与系数、单位和障碍混合命中、月刃弹跳目标／数量／衰减、死亡复活、伤害回调、地图覆盖、联机、性能及原版规则；直线扩散、武器被动和目标关系仍待完善。

## JASS 基础全局快照待验证

路径：`src/jass_runtime.h/.cpp`、`tests/jass_runtime_tests.cpp`；说明见 `jass-global-persistence.md`。客户端及新增测试目标编译通过；全局快照检查待运行。阶段执行 `war3_jass_runtime_tests`，检查基础类型、稀疏数组及 null／空字符串往返，损坏／截断／声明不匹配的事务性拒绝，非默认句柄报告和活动线程限制；接口尚未接入存档或关卡切换。

## 科技增加零骰面武器的骰子待验证

路径：`src/session_research.cpp`；说明见 `research.md`。包含本轮 JASS 快照和武器范围伤害的 Win32 Release 客户端编译通过。阶段检查零骰面武器研究前后、取消和新建单位，对单位及可破坏物的攻击、面板数值、联机及原版边界；当前一面骰处理是暂定规则。

## 战役英雄快捷栏预留待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_hero_bar.cpp`；说明见 `hero-shortcut-reservation.md`。包含本轮可破坏物攻击和提示滚动的 Win32 Release 客户端编译通过。阶段检查不死族资料片首关、共享控制英雄、空槽、鼠标和 F1–F7、创建／死亡／易主、预留值变化、联机及原版排序和默认值。

## 可破坏物武器攻击待验证

路径：`CMakeLists.txt`、`src/combat.h`、`src/entities.h`、`src/session.h`、`src/session_combat.cpp`、`src/session_combat_orders.cpp`、`src/session_combat_destructable.cpp`、`src/session_destructables.cpp`、`src/session_projectiles.cpp`、`src/session_network_identity.cpp`；说明见 `destructable-weapon-attacks.md`。包含本轮英雄栏预留和提示滚动的 Win32 Release 客户端编译通过。阶段检查四族武器、门／障碍／树、前摇与弹道、目标失效及复活、命令取消和排队、联机、地图覆盖、原版伤害及性能；范围、弹跳、护甲及部分武器被动尚待完善。

## 提示文本滚动边界待验证

路径：`src/glue.h/.cpp`、`src/game_flow_ui.cpp`；说明见 `game-tips.md`。包含本轮英雄栏预留和可破坏物攻击的 Win32 Release 客户端编译通过。阶段检查短文本和多行文本的滚轮边界、切换提示、字体尺寸、中文与地图资源覆盖，并核对其他文本测量消费者。

## 主动攻击目标事件待验证

路径：`src/combat.h`、`src/session_combat_orders.cpp`、`src/session_combat.cpp`、`src/session_network_identity.cpp`；说明见 `combat-target-events.md`。包含本轮帮助页和可破坏物预选的 Win32 Release 客户端编译通过。阶段检查主动和自动目标、重复与切换命令、目标失效、回调取消／改派／注册、射程事件、联机及原版事件次序。

## 游戏内帮助页待验证

路径：`src/game_flow_ui.h/.cpp`；说明见 `game-help.md`。包含本轮主动攻击事件和可破坏物预选的 Win32 Release 客户端编译通过。阶段检查原版文本和中文编码、滚轮／滚动条／键盘、边界和变更、地图覆盖、窗口布局及原版对照。

## 可破坏物鼠标预选待验证

路径：`src/game_view.cpp`、`src/scene_objects.h/.cpp`；说明见 `preselection.md`。包含本轮帮助页和主动攻击事件的 Win32 Release 客户端编译通过。阶段检查树木及其他对象的显隐／破坏／移除、迷雾、镜头与鼠标移动、预选开关、大图帧耗时及原版外观。

## 游戏内提示页待验证

路径：`src/game_flow_ui.h/.cpp`；说明见 `game-tips.md`。包含本轮牺牲深渊和地面物品预选的 Win32 Release 客户端编译通过。阶段检查原版提示文本与编码、鼠标和 B／N 快捷键、首尾状态、切换与重新打开、地图资源覆盖、实际窗口及原版画面和行为。

## 地面物品鼠标预选待验证

路径：`src/game_view.cpp`；说明见 `preselection.md`。地面物品参与已有悬停采样与选择圈绘制；包含本轮牺牲深渊与提示页的 Win32 Release 客户端编译通过。阶段检查物品显隐／拾取／移除、迷雾、同时选中和悬停、鼠标／镜头移动、界面开关、大图性能及原版画面。

## 牺牲深渊与阴影待验证

路径：`CMakeLists.txt`、`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_sacrifice_pit.cpp`、`src/commerce.h`、`src/entities.h`、`src/session_production.cpp`、`src/session_food.cpp`、`src/session_callbacks.cpp`、`src/session_ownership.cpp`、`src/session_network_identity.cpp`；说明见 `sacrificial-pit.md`。包含本轮提示页和地面物品预选的 Win32 Release 客户端编译通过。阶段检查双方命令、接近与目标限制、生产及集结、多侍僧竞争、死亡／转让／禁用、人口不足、取消、无可用落点、脚本重入、联机和原版行为；自定义目标规则及原版事件时序尚未完成。

## 战役重开限制待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/game_flow_ui.cpp`；说明见 `restart-mission.md`。地图脚本开关控制 Esc 菜单重开动作；阶段检查开关、动态切换、鼠标／快捷键／焦点、脚本重开、切图、实际战役及原版行为。

## 加强型地洞科技视觉待验证

路径：`src/session_auras.cpp`；说明见 `research.md`。研究 Rorb 后显示源 Arbr 建筑模型，建筑失效及科技／能力变化时释放；阶段检查研究前后、地洞与箭塔、建筑完成／死亡／重生、转移、技能启停、自定义覆盖、实际窗口和原版模型表现。

## 女猎手哨兵待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_control_spells.cpp`、`src/session_area_spells.cpp`、`src/session_stealth_reveal.cpp`、`src/session_fog.cpp`、`src/session_visibility.cpp`、`src/game_view.cpp`、`src/lan_spell_orders.h`、`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`；说明见 `sentinel.md`。树木目标、飞行／盘旋视野与隐形侦测及树木销毁清理已接入；自研联机动作接入照明弹及哨兵树目标，包含模型镜头的 Win32 Release 客户端编译通过；阶段检查科技、冷却、施法事件、移动与模型、树木存活／摧毁／恢复、多哨兵、共享视野、地图覆盖、切图、联机、性能和原版一致性；数量限制及完整表现仍待实现。

## 地图脚本模型镜头待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/model.h/.cpp`、`src/model_pose.cpp`、`src/scene_streaming.h/.cpp`、`src/game_view.cpp`；说明见 `cinematic-camera-model.md`。脚本指定模型镜头使用后台可选加载和场景相机，重置后恢复；包含哨兵改动的 Win32 Release 客户端编译通过。阶段检查纯镜头模型、缺失／损坏、视锥与锚点、声音监听、重置、镜头脚本查询、切图、联机及原版画面；原版时序和部分脚本查询仍待完善。

## 迫击炮照明弹待验证

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_stealth_reveal.cpp`、`src/session_fog.cpp`、`src/session_visibility.cpp`；说明见 `flare.md`。`Afla` 点目标及科技前置接入现有施法，按源延迟产生视野与侦测；包含哨兵和模型镜头的 Win32 Release 客户端编译通过。阶段检查时间、冷却、地形边缘、重叠、共享视野、暂停、施法者死亡、地图覆盖、双端、实际画面及原版行为；闪烁与飞行画面尚未实现。

## 地图脚本界面按键待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_view.cpp`；说明见 `script-forced-ui.md`。`ForceUIKey` 和 `ForceUICancel` 通过有界队列进入已有界面与命令消费者；包含自动施法映射的 Win32 Release 客户端编译通过。阶段检查所有键值、重入、队列、焦点／暂停／菜单／过场、建造与技能模式、取消、实际教程、自定义地图、双端与回放；当前后续帧处理与原版同步调用时序不同。

## 默认自动施法原型映射待验证

路径：`src/session_entities.cpp`、`src/session_unit_forms.cpp`；说明见 `autocast-source.md`。单位默认自动施法匹配唯一同原型衍生能力，变形时继承唯一替换能力的开关；包含脚本界面按键改动的 Win32 Release 客户端编译通过。阶段检查 Reec 研究前后风暴之鸦、中立蛛网及亡者复生、开关／变形／撤销、脚本增删、自定义重复原型、技能可用性与联网，以及原版行为和性能；实际对局尚未执行。

## AI 对战减益施法待验证

路径：`src/session_ai_armies.cpp`；说明见 `ai.md`。电脑单位对当前合法战斗目标施放减速、诅咒和精灵之火，复用既有施法与命令恢复；实际对局、相同状态、自动施法、施法回调、目标脱离、联机、原版策略及大图性能待阶段验证。

## 鼠标预选待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/game_view.h/.cpp`；说明见 `preselection.md`。地图脚本控制单位悬停预选及反馈，复用绘制遍历和 50 毫秒采样，包含玩家暴露改动的 Win32 Release 客户端编译通过。阶段检查参数组合、单位移除／移动／显隐、镜头与窗口、选中事件、原版外观及大地图性能；物品和可破坏物预选尚未实现，实际窗口尚未执行。

## 对战玩家暴露视野待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/session_fog.cpp`；说明见 `player-exposure.md`。地图脚本记录玩家组快照并通过迷雾更新暴露玩家单位的视野，包含预选改动的 Win32 Release 客户端编译通过。阶段检查基地失守／重建、玩家组修改及销毁、重复开启与清除、单位创建／移动／死亡／转移、隐形、联盟、切图和联机，对照原版时序及范围；实际运行尚未执行。

## 脚本水面形变待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/terrain_layout.cpp`、`src/terrain_scene.h/.cpp`；说明见 `water-deformation.md`。`SetWaterDeforms` 控制水面顶点随地形形变及关闭后恢复，水面高度查询与网格共用角点，Win32 Release 客户端编译通过。阶段检查默认值、形变和恢复、开关切换、可见性、边缘、切图、GPU、性能及原版公式；水面交互及原版规则未完成。

## 过场强制字幕待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_cinematic_panel.cpp`；说明见 `game-options.md`。地图脚本可强制显示过场对话字幕并恢复用户设置，Win32 Release 客户端编译通过。阶段检查字幕选项开／关、强制开／关切换、过场进行中切换、切图复位、静音和真实战役，比较原版；实际运行尚未执行。

## 地图脚本框选控制待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_view.cpp`；说明见 `drag-selection.md`。脚本框选输入及选择框显示开关已接入单机和实验联机，Win32 Release 客户端编译通过。阶段检查四种参数组合、拖动阈值、单击／技能目标、选区切换、禁用期间拖动和恢复、菜单、切图及双端同步，并对照原版；实际窗口和原版行为尚未验证。

## 可行走模型后台预解析待验证

路径：`src/session.h`、`src/session_walkable_surface.cpp`、`src/game_loading.cpp`；说明见 `cliff-level.md`。后台载入阶段预解析最多 64 个不同的已放置可行走模型，运行查询复用会话缓存；失败记录日志并保留原按需路径。Win32 Release 客户端编译通过。阶段检查 BridgeTooNear 和无桥地图、重复／缺失／异常模型、超过 64 种、载入取消／重试、动态对象、切图释放及加载时间、首帧和内存；专项及性能测量尚未执行。

## 可行走模型共享表面高度待验证

路径：`src/walkable_geometry.h/.cpp`、`src/session_walkable_surface.cpp`、`src/session_destructables.cpp`、`src/session_world.cpp`、`src/terrain_scene.h`、`src/game_view.cpp`；说明见 `cliff-level.md`。会话按需读取模型并以动画三角面求高，`GetLocationZ` 与地面／两栖单位及部分跟随显示共享模型表面；覆盖构建消费已有模型表面。Win32 Release 客户端编译通过。阶段检查 BridgeTooNear、脚本与画面一致性、可见／隐藏／死亡／复活、动画和随机相位、旋转／缩放、桥面与地形／水面过渡、选择圈／特效／弹道、叠放对象变更、临时对象、模型缺失／切图释放、透明面及大图性能，并与原版对照。依赖对象后续变化的覆盖刷新和动态桥寻路尚未实现；专项及实际窗口尚未执行。

## 即时订单的物品目标待验证

路径：`src/session_inventory.cpp`；说明见 `instant-orders.md`。四个即时订单 native 已接入 `dropitem` 的点目标与单位目标，复用物品移动和转交，Win32 Release 客户端编译通过；其他即时订单仍待实现。阶段检查字符串／整数订单、点／单位／空及无效目标、物品权限和持有状态、路径、事件／回调、排队取消、自定义地图和原版时序；专项及实际地图尚未执行。

## 战斗目标事件待验证

路径：`src/combat.h`、`src/script_state.h`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_combat.cpp`、`src/session_combat_orders.cpp`；说明见 `combat-target-events.md`。自动索敌和进入武器射程时分发单位目标事件及 `GetEventTargetUnit`，Win32 Release 客户端编译通过。阶段检查自动／主动攻击、目标进入／离开／重入、不同射程和目标、条件／过滤器、事件禁用／销毁、回调移除／变更命令、战斗与联机顺序、原版行为及大图性能；专项和实际地图尚未执行。

## 地形悬崖层级查询待验证

路径：`src/world.h`、`src/world_blight.cpp`、`src/session_blight.cpp`、`src/entities.h`、`src/session_destructables.cpp`；说明见 `cliff-level.md`。`GetTerrainCliffLevel` 已接入 W3E 地形及可行走可破坏物的稀疏覆盖层，Win32 Release 客户端编译通过；叠放表面高度、桥面寻路和原版细节仍待实现。阶段检查不同层级、网格边界、越界、坡道、异常坐标、纹理零格、桥梁生死／重叠／旋转、实际地图脚本、切图释放和原版动态覆盖；专项和原版运行对照尚未执行。

## 单机选择与地图交互输入入口待验证

路径：`src/player_commands.h/.cpp`、`src/game_view.h/.cpp`、`src/game_hero_bar.cpp`、`src/game_selection_panel.cpp`、`src/game_trackable.cpp`；说明见 `player-commands.md`。单机用户选择和交互模型事件接入玩家命令分发，脚本内部事件及联机时间片路径保持独立；Win32 Release 客户端编译通过。阶段验证普通／Shift／框选／编组／英雄及空闲工人、选择回调中移除或变更单位、交互模型进入／点击和对话／暂停、单机与联机顺序和实际窗口；原版操作及性能待对照。单机回放仍未实现。

## 地面物品与交互模型离屏附件待验证

路径：`src/game_view.cpp`、`src/game_trackable.cpp`；说明见 `effects.md`。地面物品与可交互模型在视口外推进已加载附件的可见性和子动画时钟，释放粒子并在重入视口时复用时钟；Win32 Release 客户端编译通过。阶段验证多层附件、出生／循环、视口边界、拾取／丢弃、删除、异步加载、暂停、切图释放和大量实例性能，比较原版画面。专项及实际窗口尚未执行。

## 幽灵变形免疫与建筑选址待验证

路径：`src/session.h`、`src/session_visibility.cpp`、`src/session_control_spells.cpp`、`src/session_morph_spells.cpp`、`src/session_construction.cpp`；说明见 `stealth-reveal.md`。Agho 的 DataB 接入变形目标及效果检查，DataC 接入建筑选址；Win32 Release 客户端编译通过。阶段验证字段覆盖、能力启停、弹道途中状态变化、建筑与地形阻挡、真实操作及原版行为；专项和运行对照尚未执行。

## 实验单位缓存同步分片待验证

路径：`src/lan_actions.h/.cpp`、`src/session_cache.cpp`、`src/lan_simulation.h/.cpp`、`src/lan_time_driver.h`、`src/lan_runtime.cpp`、`src/game_view.cpp`、`src/main.cpp`、`tests/game_flow_tests.cpp`；说明见 `cache-sync.md`。自研大快照分片接入发送、时间片预校验、有界重组和完整提交；Win32 Release 客户端及检查目标编译通过，两个定向模式通过，覆盖跨槽、多发送方、重复／乱序／缺片、超时和退出。阶段核对真实双端、回放、带宽、断线及缓存摘要；原版 `0x6e` 格式和互通仍待实现。

## 风步动态碰撞待验证

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`；说明见 `mobility.md`。风步与其他非建筑单位双向穿行，建筑和静态地形仍阻挡，状态终止恢复普通碰撞；Win32 Release 客户端及定向目标编译通过，windwalk 检查通过。阶段检查实际施法、淡入／到期、重叠脱离、多人同步、建筑与地形边界及原版行为和性能。

## 实验单位缓存同步待验证

路径：`src/lan_actions.h/.cpp`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`；说明见 `cache-sync.md`。自研 `0xf9` 动作接入单位快照的发送、校验和接收，缺失项保留 `0x73` 删除；Win32 Release 客户端与检查目标编译通过，定向会话检查通过，覆盖快照隔离、编解码、接收／删除、畸形／截断数据及 1449 字节边界。阶段核对单机自动回显、真实双端时间片和回放、配置期发送、字段与顺序及大快照；自研分片已接入；原版 `0x6e` 格式及原版互通仍待实现。

## 受阻目标寻路待验证

路径：`src/world_path.cpp`、`tests/world_tests.cpp`；说明见 `water-pathing.md`。目标格受阻且首候选直线不可达时，在既有预算内搜索附近可达落点；Win32 Release 客户端与 world 检查目标编译通过，隔墙复现 1 通过、0 失败。阶段检查各移动类型、单位半径、边界和复杂障碍、动态目标、预算耗尽及大地图性能，并与原版目标选点对照。

## 结算保存回放与原 FDF 待验证

路径：`src/game_flow_ui.cpp/.h`、`src/game_view.cpp/.h`、`src/main.cpp`、`src/replay_experimental.cpp/.h`、`src/fdf.cpp`、`src/glue.cpp/.h`、`tests/browser_tests.cpp`、`tests/native_tests.cpp`；说明见 `replay-experimental.md`。实验局域网录制可通过结算面板命名保存；单机录制与原版回放互通尚未实现。Win32 Release 客户端及浏览器检查目标编译通过，原 ScoreScreen FDF 挂接与绘制定向检查 1 通过、0 失败；`fdf_adjacent_quoted_frame_type` 尚未执行。阶段核对录制、输入／重名／失败重试、取消／自动保存、部分回放、关联地图、界面、播放及原版对照，并回归共享 FDF 与皮肤高亮解析。

## 中立建筑付费显形待验证

路径：`src/commerce.h`、`src/session_commerce.cpp`、`src/session_stealth_reveal.cpp`、`src/session.h`、`src/game_commands.cpp`、`src/game_view.cpp/.h`、`src/player_commands.cpp/.h`、`src/lan_actions.cpp`、`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`；说明见 `visibility.md`。Andt 已连接发起玩家、地图／小地图点选、源费用、临时视野及侦测、脚本中立点订单和实验联机命令。Win32 Release 客户端编译通过；阶段核对交互资格、资源／回调事件顺序、多个玩家、范围与持续时间、自定义能力、双端和原版玩法；新增实验协议需两端使用支持版本。

## AI 重复启动待验证

路径：`src/session_ai.cpp`；说明见 `ai.md`。已有 AI 时保持原策略与脚本线程；Win32 Release 客户端编译通过。阶段检查相同／不同策略和模式、暂停状态、回调期间重复调用、资源失败及其他玩家线程，并对照原版边界。专项尚未运行。

## 纠缠金矿即时全部卸载待验证

路径：`src/session.h`、`src/session_harvest.cpp`、`src/session_transport.cpp`；说明见 `transport.md`。`Adri` 即时全部卸载接入采矿工人清单与合法落点；Win32 Release 客户端编译通过。阶段检查满矿、部分落点受阻、技能禁用、容量与范围覆盖、订单回调重入、单个／全部卸载、实验联机及原版时序；尚未执行真实对局或原版对照。

## 战役跳过教程提示待验证

路径：`src/campaign_profile.h`、`src/campaign_browser.h/.cpp`；说明见 `campaign-flow.md`。ROC 战役选择接入教程状态、原本地化文案与确认操作；Win32 Release 客户端编译通过。阶段核对首项／其他战役、已完成／未完成、TFT、确认／取消及键鼠交互，检查脚本 `SetTutorialCleared`、跨会话持久化、保存失败和窗口布局，并与原版验证版本门控和触发条件；尚未执行窗口与原版对照。

## 纠缠金矿矿工面板与释放待验证

路径：`src/session.h`、`src/session_harvest.cpp`、`src/session_combat_orders.cpp`、`src/player_commands.cpp`、`src/lan_action_encoder.cpp`、`src/game_transport.cpp`；说明见 `transport.md`。矿工清单与容量读取现有采集状态和源能力，肖像点击连接单个释放及实验联机命令；Win32 Release 客户端编译通过。阶段核对多人采矿、容量与对象覆盖、落点受阻、矿井／矿工死亡和易主、命令回调重入、肖像操作、双客户端同步及原版界面；`IsUnitLoaded` 与装载事件的原版语义尚未核实。

## 月亮井水位待验证

路径：`src/entities.h`、`src/effects.h`、`src/session_restoration.cpp`、`src/session_food.cpp`、`src/game_effects.cpp`；说明见 `restoration.md`。水面模型及高度连接能力配置和实时魔法量，单位移除时回收效果；Win32 Release 客户端编译通过。阶段核对空／满魔法、种族和自定义模型、建造／升级／死亡／隐藏、能力更改、回调时序、句柄与联机同步、切图释放以及原版画面；真实运行与原版对照尚未执行。

## 结算队伍汇总待验证

路径：`src/game_flow_ui.cpp`；说明见 `game-flow.md`。按会话队伍汇总成员统计和资源交换；科技百分比采用成员平均。Win32 Release 客户端编译通过。阶段检查单人、同队与多队、零分及缺失分数、排序、不同窗口尺寸、长数字及最多 12 队布局，并与原版核对队伍名称、汇总规则和显示；实际窗口与原版对照尚未执行。

## 单位地面阴影待验证

路径：`src/game_effects.cpp`、`src/game_view.cpp`、`src/game_view.h`、`src/session.h`；说明见 `unit-shadows.md`。Win32 Release 客户端编译通过。阶段检查陆地、坡面、浅水和飞行单位的阴影，动态创建、死亡、隐藏、变形、迷雾、切图资源释放与大规模场景性能，并对照原版尺寸、偏移和透明度。建筑和地图静态阴影已接入分块缓存与合成；本次 Win32 Release 客户端编译通过。阶段核对 SHD 缺失、尺寸／灰度、静态与建筑重叠、建筑增删与移动后的局部缓存更新、自定义掩码及原版精度；实际运行和性能采样尚未执行。

## 结算资源交换待验证

路径：`src/game_flow_ui.cpp`；说明见 `game-flow.md`。资源页按黄金与木材分别展示转出／实际到账，排序使用两种资源收支总数。Win32 Release 客户端编译通过。阶段检查联盟交易、税率和零交易、多玩家、极值、队伍分组、升降序、各种分辨率和长数值显示，并对照原版的列定义、排序及布局；尚未执行窗口与原版验证。

## 脚本音频文件时长待验证

路径：`src/session_sound.cpp`、`tests/sound_tests.cpp`；说明见 `script-sound.md`。Win32 Release 客户端与 sound 目标增量编译通过，专项尚未执行。阶段执行 `war3_sound_tests.exe <data-root> <scratch-root>`，核对 WAV／MP3／MIDI 时长、地图同名覆盖、空路径／缺文件／损坏格式、大小写、静音／无设备、重复查询及缓存上限；在实际过场脚本中比较等待时间，并与原版时长和失败行为对照。仅对可解析归档成员返回实际时长，格式边界和原版精度尚未验收。

## 双恢复物品待验证

路径：`src/session.h`、`src/session_item_use.cpp`、`tests/control_tests.cpp`、`tests/generate-combined-item-fixture.py`；说明见 `combined-recovery-items.md`。Win32 Release 客户端和 control 目标编译通过；`item-combined` 最小检查 1 通过／0 失败，覆盖地图字段覆盖、一次费用／次数／事件、共享冷却、满生命／魔法、使用回调删物品、生命变化回调删物品并易主、未知组合拒绝，未加载 Game.dll。阶段继续核对符文、不同顺序／费用／范围／数量、地图自定义覆盖、事件重入／易主／死亡、双端同步与真实地图，并与原版比较费用、冷却和多能力派发；其他多主动组合尚未实现。

```powershell
python tests/generate-combined-item-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' --output '../../tmp/docs-artifacts/war3/combined-item/fixture.w3m'
./build/windows-x86/bin/Release/war3_control_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/combined-item/fixture.w3m' item-combined
```

## AI 防御与疾风步待验证

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`；说明见 `ai.md`。Win32 Release 客户端增量编译通过，专项尚未运行。阶段在对战夹具及实际对局检查近／远程交战、单位防御开启／关闭、狂暴费用与冷却、英雄低生命疾风步及撤退、技能禁用／暂停、目标切换、回调重入、双端同步和大地图性能；同原版比较决策和时序。当前距离与生命阈值属于实现策略。阶段需扩展 `tests/generate-ai-control-fixture.py` 和 `war3_ai_control_tests` 覆盖上述行为；原图 AI 初始化可使用 `war3_ai_tests <data-root> <map> [race] [seconds]`。

## 灵魂宝石待验证

路径：`src/entities.h`、`src/session.h`、`src/spells.h`、`src/session_soul.cpp`、`src/session_item_use.cpp`、`src/session_inventory.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_fog.cpp`、`src/session_callbacks.cpp`、`src/session_food.cpp`、`src/session_entities.cpp`、`src/session_network_identity.cpp`、`CMakeLists.txt`、`tests/control_tests.cpp`、`tests/generate-control-fixture.py`；说明见 `soul-gem.md`。Win32 Release 客户端与 control 目标编译通过，`item-soul` 最小检查 1 通过／0 失败，覆盖目标能力移除、脚本物品独立生命周期和携带者死亡；未加载 Game.dll。阶段核对施法与失效、物品转交／销毁、释放位置与路径、暂停修改、目标易主／死亡、回调重入、战争迷雾、敌方视野与原版时序；合并真实地图、双端和资源释放验证。

```powershell
python tests/generate-control-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' --output '../../tmp/docs-artifacts/war3/soul-gem/fixture.w3m'
./build/windows-x86/bin/Release/war3_control_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/soul-gem/fixture.w3m' item-soul
```

## 结算页签与离屏附件动画待验证

路径：`src/game_flow_ui.h/.cpp`、`src/glue.cpp`、`src/model.h`、`src/model_particles.cpp`、`src/game_view.cpp`、`src/game_effects.cpp`；说明见 `game-flow.md` 和 `effects.md`。Win32 Release 客户端增量编译通过。阶段操作胜负结算，核对概况、单位／英雄／资源四页及原字符串、分数／科技计算、空英雄与多玩家、页签切换、不同窗口尺寸和原版画面；验证主菜单／选图／选项／对话框等 Glue 界面静态重复绘制与文字／位置变化后的布局，以及结算选中页签与性能；验证列头显示、鼠标和键盘排序、切换方向／页签及选中字体／同值顺序、队伍分组开关、玩家色及原版视觉指示；队伍汇总已接入并待对照，颜色筛选及单机回放录制仍待完成，资源交换列现展示黄金与木材转出／到账。核对视野内的离屏单位、特效、技能与武器弹道附件切回、模型切换、显隐、暂停、播放与声音同步、粒子重建、性能及原版画面；迷雾外与资源就绪前的历史尚未重建。窗口、GPU、声音、性能和原版对照待执行。

## 月亮石、荒芜指纹与结构化线程入口待验证

路径：`src/game_clock.h/.cpp`、`src/session_item_use.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_tick.cpp`、`src/session_network_identity.cpp`、`src/world.h/.cpp`、`src/world_blight.cpp`、`src/world_path.cpp`、`src/jass_runtime.h/.cpp`、`src/jass_threads.h/.cpp`、`src/session_callbacks.cpp`；测试目标 `war3_clock_tests`、`war3_consumption_tests`、`war3_blight_fingerprint_tests`、`war3_jass_thread_tests`。阶段核对月亮石实际消费、到期时间事件、重用、暂停、脚本设时及原版行为；核对 WPM／无 WPM 的写入、增删、地图切换和联机摘要；执行 JASS 入口、跨运行时、等待、取消及触发器回归。时间行为为实现假设，指纹有碰撞概率且不涵盖其他寻路位；Fiber、等待关系和宿主调用栈仍不可恢复存档。Win32 Release 客户端及四个相关测试目标编译通过；JASS 结构化入口、跨运行时归属、嵌套等待与取消的最小检查 4 通过、0 失败。阶段执行 `war3_blight_fingerprint_tests.exe`、`war3_jass_thread_tests.exe`；时钟命令见 `game-clock.md`，月亮石物品夹具使用 `consumption.md` 的夹具命令并将模式改为 `moon`。月亮石与荒芜专项、联机、真实对局及原版对照待执行。说明见 `moonstone.md`、`arcane-blight-items.md` 和 `save-runtime-foundation.md`。

## 抗魔、蛛网、荒芜物品及脚本执行状态待验证

路径：`session_item_use.cpp`、`session_spell_info.cpp`、`session_spells.cpp`、`session_area_spells.cpp`、`session_channels.cpp`、`spells.h`、`session_blight_items.cpp`、`session.h`、`session_tick.cpp`、`session_network_identity.cpp`、`CMakeLists.txt`、`jass_runtime.h/.cpp`、`tests/control_tests.cpp`、`tests/generate-control-fixture.py`、`tests/jass_thread_tests.cpp`；说明见 `arcane-blight-items.md` 和 `save-runtime-foundation.md`。阶段执行 control 夹具的 item-control／item-blight，核对费用、次数、目标、抗魔、蛛网、扩张／去除／覆盖／离开与联机；地表荒芜状态以增量指纹纳入实验联机摘要，需验证写入路径、碰撞限制及联机分歧；执行 JASS 线程专项，检查嵌套 native 回调、等待、取消、异常和诊断副本。Win32 Release 客户端与三个相关消费者已编译；JASS 核心改造的嵌套等待及 native 取消两项最小检查通过，0 失败。JASS 状态尚不能用于恢复存档；献祭头骨走近／中断、容量与回调重入、原版时序及真实对局尚未验证。

## 死亡与复活动画重启待验证

路径：`session_callbacks.cpp`、`session_corpses.cpp`、`session_effects.cpp`、`session_rebirth.cpp`、`session_revival.cpp`、`tests/corpse_tests.cpp`；说明见 `animation-blending.md`。Win32 Release 客户端与 corpse 消费者已编译；阶段运行尸体夹具 animation-lifecycle，验证死亡／衰变／复活、凤凰和黑暗转换、回调重入、模型切换与实际过渡；其他停止／清理及离屏历史仍待实现或验证。

## 战斗、施法和工作动画重启待验证

路径：`session_combat.cpp`、`session_combat_orders.cpp`、`session_spells.cpp`、`session_channels.cpp`、`session_war_club.cpp`、`session_control_spells.cpp`、`session_eat_tree.cpp`、`session_faerie_dragon.cpp`、`session_locust.cpp`、`session_morph_spells.cpp`、`session_roots.cpp`、`session_spell_effects.cpp`、`session_spirit_split.cpp`、`session_teleport.cpp`、`session_tinker.cpp`、`session_unit_forms.cpp`、`session_unsummon.cpp`、`session_harvest.cpp`、`session_lumber.cpp`、`session_construction.cpp`、`session_building_upgrades.cpp`、`tests/channel_tests.cpp`；说明见 `animation-blending.md`。Win32 Release 客户端及 channel 消费者已编译。阶段合并验证近远程连续攻击／追击中断、施法开始／结束／回调重入、技能形态及控制、采矿／连续砍树、建造／升级、普通循环、暂停与多个单位，并对照原版时序和 GPU 画面；死亡／复活、部分停止或状态清理及离屏历史仍待完成。专项与实际对局尚未执行。

## 默认混合与显式动画重启待验证

路径：`entities.h`、`session_orders.cpp`、`session_visual.cpp`、`session_animation.cpp`、`model.h/.cpp`、`model_data.h`、`model_pose.cpp`、`model_particles.cpp`、`game_view.cpp`、`game_effects.cpp`、`tests/game_flow_tests.cpp`；说明见 `animation-blending.md`。阶段验证 MODL 默认值、脚本覆盖／零值、显式同序列重启与普通循环、队列、暂停与倍率、多单位及挂点、全局动画轨、LookAt、混合中断和缓存一致性；验证大地图帧耗时／内存并对照原版。部分停止或状态清理及离屏历史仍待实现；Win32 Release 客户端和 game-flow 消费者已编译，专项和 GPU／原版对照尚未执行。

## 单位动画混合待验证

路径：`entities.h`、`session_visual.cpp`、`model.h`、`model_data.h`、`model_pose.cpp`、`model_particles.cpp`、`game_view.h/.cpp`、`game_morph.cpp`、`game_effects.cpp`；说明见 `animation-blending.md`。Win32 Release 客户端和 game-flow 消费者已编译；阶段验证 NightElfX01／OrcX01 实际脚本、零值与不同正值、多单位共享模型、骨骼位置／旋转／缩放、LookAt 与附件、变形／销毁、序列重入与频繁切换、暂停／倍率和性能，并与原版画面对照。部分停止或状态清理及离屏历史尚未实现；GPU、原版时序与完整战役尚未验证。

## 模型场景声音和可破坏物动画时钟待验证

路径：`scene_objects.h/.cpp`、`game_view.h/.cpp`、`game_model_sound.cpp`、`model_ui_audio.h`、`model.h`、`model_pose.cpp`、`sound.h/.cpp`、`main.cpp`、`loading_screen.h/.cpp`、`model_cinematic.h/.cpp`、`entities.h`、`session_animation.cpp`、`session_destructables.cpp`、`session_doodads.cpp`、`session_volcano.cpp`、`tests/game_flow_tests.cpp`。阶段合并验证菜单／载入／过场模型 SND、相机移动与音量／静音／场景切换、专用声音与 Scene 音轨；验证装饰物视野／离屏／隐藏／动态销毁与附件声、足迹、持续切图及大地图性能；执行 game-flow 夹具检查可破坏物动态创建、改速、冻结、恢复、动画重置与队列，并对照原版。界面 FPT 地表效果和离屏附件子动画时钟尚未实现；Win32 Release 客户端与 game-flow 消费者已编译，专项、真实音频及原版对照尚未执行。

## 菜单附件与场景附件声音待验证

路径：`main.cpp`、`loading_screen.h/.cpp`、`model_cinematic.h/.cpp`、`model.h`、`model_particles.cpp`、`game_model_sound.cpp`、`game_effects.cpp`、`game_view.cpp`；说明见 `effects.md`、`model-event-sounds.md`。Win32 Release 客户端已编译。阶段核对菜单／战役／载入／过场原模型附件、缺资源／设备恢复／生命周期和加载时间；核对单位／特效多层附件声音与脚印位置方向、多个实例、KATV、流式上传、离屏／迷雾、事件上限和切图，比较原版画面、听感与时序。界面 FPT 地表效果和离屏子动画时钟仍待实现。专项与实际窗口、声音、GPU 运行尚未执行。

## MDX 附件子模型待验证

路径：`model.h/.cpp`、`model_data.h`、`model_pose.cpp`、`model_particles.cpp`、`scene_assets.h/.cpp`；说明见 `effects.md`。阶段以 NEBirth 等原模型验证节点动画／KATV、Birth 与 Stand、多个父实例、嵌套与循环、队伍色、子粒子排空、缺失模型及纹理、异步移交／GPU 恢复／切图释放和性能，并对照原版画面。离屏子动画时钟仍待实现；Win32 Release 客户端已编译；专项及实际 GPU 画面尚未执行。

## 净化物品树木目标待验证

路径：`session.h`、`session_item_use.cpp`、`game_view.cpp`、`lan_action_encoder.cpp`、`lan_simulation.cpp`、`tests/generate-control-fixture.py`、`tests/control_tests.cpp`、`tests/order_queue_tests.cpp`；说明见 `targeted-spell-items.md`。阶段生成 control 夹具并运行 `war3_control_tests <data-root> <fixture> item-tree`，验证地图覆盖、目标筛选、技能事件和破坏物状态；合并 order-queue 验证两种报文及排队，实窗验证树与单位拾取、不可见／死亡／无效目标及双端同步。Win32 Release 客户端、control 与 order-queue 消费者已编译；专项、实际窗口和原版对照尚未执行。

## 黑暗转换及单位目标法术物品待验证

路径：`spells.h`、`entities.h`、`session_spell_info.cpp`、`session_control_spells.cpp`、`session_spell_effects.cpp`、`session_effects.cpp`、`session_unit_forms.cpp`、`session_spells.cpp`、`session_item_use.cpp`、`tests/control_tests.cpp`；说明见 `dark-conversion.md` 和 `targeted-spell-items.md`。阶段验证 ANdc／SNdc 的施法中断、种族筛选、转换时间、驱散／死亡／回调和僵尸归属；验证 thdm／schl／shtm 的目标、冷却／消耗、连续弹跳、光环、效果及联机。Win32 Release 客户端及 control 消费者已编译；专项、实际对局和原版对照尚未执行。

## 复活／操纵死尸卷轴与旋风魔杖待验证

路径：`session_spell_info.cpp`、`session_item_use.cpp`、`session_spells.cpp`、`tests/corpse_tests.cpp`、`tests/morph_tests.cpp`；说明见 `corpse-items.md`、`cyclone-wand.md`。阶段使用对应夹具验证复活保留句柄／人口、操纵死尸归属／无敌／时限／科技、范围及敌友／英雄、无尸体与物品消耗；验证旋风魔杖目标、3 次消耗、事件、持续／驱散、丢弃／死亡／中断、原版表现和多端同步。Win32 Release 客户端及 corpse／morph 消费者已编译；专项、实际对局及原版对照尚未执行。

## 保护卷轴与资源宝箱待验证

路径：`consumables.h`、`spells.h`、`session_consumables.cpp`、`session_item_use.cpp`、`tests/consumption_tests.cpp`、`tests/commerce_tests.cpp`；说明见 `protection-scroll.md`、`resource-powerups.md`。Win32 Release 客户端及两个相关消费者已编译。阶段检查 AIda／AIdb 范围、敌友／免疫、护甲叠加／驱散／到期、恢复上限、事件重入及地图覆盖；检查 AIgo／AIlu 拾取者归属、资源变化事件、物品消耗、上限／异常数值、召唤单位和多人同步；对照原版计分与资源维护费。专项、真实对局及原版对照尚未执行。

## 闪烁物品与单位头像皮肤待验证

路径：`session_item_use.cpp`、`session_spells.cpp`、`tests/mobility_tests.cpp`、`game_loading.h/.cpp`、`game_selection_panel.cpp`、`game_hero_bar.cpp`；说明见 `blink-items.md`、`selection-panel.md` 和 `hero-revival.md`。Win32 Release 客户端及 mobility 消费者已编译。阶段用 stealth 夹具及 `war3_mobility_tests <data-root> <fixture> blink-item` 验证点目标、最小／最大距离、落点、魔法／冷却／取消与使用事件；另验证 DotA 自定义跳刀、受伤后的限制、地图覆盖、原版行为及多人同步。实际窗口核对四族及地图皮肤、头像边框／高亮／英雄光效、生命与魔法比例、纹理缺失／加载、大小窗口、选择和快捷键、GPU 恢复及原版布局。上述专项、实际操作与原版对照尚未执行。

## 永久攻击伤害与达贡物品待验证

路径：`entities.h`、`script_state.h`、`session_entities.cpp`、`session_equipment.cpp`、`session_item_use.cpp`、`session_research.cpp`、`session_cache.cpp`、`spells.h`、`session_spell_info.cpp`、`session_spells.cpp`、`session_area_spells.cpp`、`session_lightning.cpp`、`tests/game_flow_tests.cpp`；说明见 `attack-damage-powerups.md`、`finger-of-death.md` 和 `campaign-gamecache.md`。Win32 Release 客户端及 game-flow 消费者已编译。为检查持久化兼容，`war3_game_flow_tests.exe <data-root> tmp/docs-artifacts/war3/game-flow/fixture.w3m cache-damage` 的隔离缓存检查通过：v4 正负值保存／重载／恢复与越界拒绝，以及无物品单位的 v1–v3 默认值；临时缓存位于 `tmp/docs-artifacts/war3/cache-damage/`。阶段验证正负 AIaa 拾取／消耗、非英雄、伤害及面板、变形／幻象、其他缓存组合；验证 ANfd 单位目标、地图自定义 Dagon 能力 ID、地图伤害事件、魔免、施法打断／回调重入、资源／次数／冷却、闪电和原版表现。DotA 实际物品操作、多人和原版对照尚未执行。

## 玩家自有单位商店待验证

路径：`session_commerce.cpp`、`tests/generate-commerce-fixture.py`、`tests/commerce_tests.cpp`，说明见 `commerce.md`。自有、具单位出售能力且不具中立交互能力的商店，按钮和实际购买在无附近买家时允许单位销售；仍检查库存、资源、科技和出生点并发出出售事件，买家为空。Win32 Release 客户端及 commerce 消费者已编译；阶段生成 commerce 夹具并检查按钮、扣费、库存、出售事件／空买家、非所有者、附带 Aneu、显式目标买家、物品与邻近买家；另实测 DotA `-sd` 选英雄、双端及原版语义。专项和实际玩家操作尚未执行。

上一提交 `e2c246c` 的 DotA 原图 main 与 600 秒静音模拟开发定位通过，无 Game.dll；日志 `tmp/docs-artifacts/war3/dota-develop-600s.log`。该检查不包含选英雄及游戏画面。

## DotA 稀疏闪电表与计分板标题待验证

路径：`session_lightning.cpp`、`game_multiboard.cpp`、`main.cpp`、`platform.cpp`，说明见 `ribbons-lightning.md`、`multiboard.md`。原图自定义闪电表的省略数值按零解析并在整表成功后发布；多列计分板标题按可见文字测量、截断、居中并绘制色码；开发模拟入口可分段推进至 600 秒。Win32 Release 客户端编译通过，DotA 原 main 及静音 180 秒模拟通过、无 Game.dll，日志 `tmp/docs-artifacts/war3/dota-sparse-lightning-180s.log`。阶段验证稀疏颜色／比例／噪声、空和损坏字段、缓存失败重试、源纹理和动画；实窗核对多段色码、颜色重置、中文／代理对、长标题截断、多个计分板及原版画面。上述专项、实际操作和原版对照尚未执行。

## DotA 计分板空英雄查询待验证

路径：`session_hero.cpp`、`session_inventory.cpp`、`tests/commerce_tests.cpp`。英雄等级／经验／技能点与物品栏空单位查询分别返回零或空物品，非零无效句柄仍报错。DotA 的计分板在玩家未选英雄时使用这些查询；Win32 Release 客户端与 commerce 消费者已编译，专项尚未执行。阶段验证空／非英雄／英雄／已销毁单位、库存变化、多人计分板和原版空句柄语义。

## ExecuteFunc 有返回值函数待验证

路径：`session_callbacks.cpp`、`tests/generate-thread-fixture.py`、`tests/session_thread_tests.cpp`，说明见 `script-threads.md`。Win32 Release 客户端与线程消费者已编译；DotA_v6.83d 的原 main 和静音 60 秒模拟通过，无 Game.dll，日志 `tmp/docs-artifacts/war3/dota-executefunc-60s.log`。阶段运行线程夹具并核对返回值丢弃、等待／唤醒、调用 VM、非法入口、回调上下文和原版时序；实际游戏、画面、玩家操作及原版对照尚未执行。

## 单位状态事件待验证

路径：script_state、session_callbacks、session_entities、session_tick、game_flow_tests、generate-game-flow-fixture、unit-state-events。单位状态阈值事件连接脚本写入、非致死生命变化与固定步补查。Win32 Release 客户端及专项程序增量编译通过；阶段先执行 `tests/generate-game-flow-fixture.py --data-root <data-root>`，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`，核对同一模拟步内跨越／恢复、死亡和触发器重入及原版时序；内部直接写入可能合并跨越，尚未实现全部即时语义。

## 脚本联盟查询待验证

路径：session_match、game_flow_tests、script-alliance。`IsPlayerAlly`／`IsPlayerEnemy` 和 `IsUnitAlly`／`IsUnitEnemy` 查询当前单向联盟状态；查询方向和无效对象分支已核对固定版原件的静态指令。Win32 Release 客户端与专项程序增量编译通过；阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行，核对非对称联盟、空对象、移除单位、事件重入及 DotA／WarChasers 实际脚本。

## 传送门拥堵与落点搜索待验证

路径：entities、session_waygate、session_summons、session_network_identity、waygate_tests、waygates。每步限制传送搜索数量，阻塞后按单位延迟重试；召唤／传送落点直接检查候选格通行，不对同一坐标执行寻路。Win32 Release 客户端与专项程序增量编译通过，专项尚未执行；阶段运行 `war3_waygate_tests.exe <data-root> <BootyBay.w3m>`，合并验证多门与高并发公平性、遮挡释放／区域离开、目标变更、回调重入、非地面移动类型、召唤能力、双端摘要和实际帧耗时。

## 地图传送门待验证

路径：session_waygate、entities、session、session_entities、session_combat_orders、session_tick、session_network_identity、waygate_tests、waygates。脚本设置目标和启用状态，单位可经真实移动或目标命令进入门并传送到合法位置；空间候选、回调重入与实验联机状态摘要已接入。Win32 Release 客户端和专项程序增量编译通过；阶段运行 `war3_waygate_tests.exe <data-root> <BootyBay.w3m>`，并验证原版 WarChasers 脚本初始化、真实右键、双向门、目标阻挡／拥挤、脚本事件重入、单位生命周期、双端与回放、实际性能及原版时序。地图 units.doo 的门目标区域编号尚未直接消费，原版运行时是否依赖该字段仍待确认。

## 脚本单位动画属性待验证

路径：entities、session_visual、game_flow_tests、campaign-cinematics。`AddUnitAnimationProperties` 修改单位的动画属性，并由场景模型、附件和动画队列选择消费；支持大小写、属性组合与源 Alternate 属性移除。Win32 Release 客户端和专项程序增量编译通过；阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行，并核对 DotA upgrade／alternate 调用、单位变形、重复添加移除、显式动画序号与原版模型画面。

## 过滤单位事件待验证

路径：session_callbacks、generate-game-flow-fixture、game_flow_tests、filtered-unit-events。TriggerRegisterFilterUnitEvent 复用单位事件派发、过滤表达式和触发上下文，专项包含允许／拒绝、事件上下文和无关单位。Win32 Release 客户端及专项程序增量编译通过；阶段先执行 `python tests/generate-game-flow-fixture.py --data-root <data-root>`，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`；合并核对事件类型、过滤器与触发器销毁／重入及原版行为。

## 单位与编组脚本入口待验证

路径：session_collections、session_entities、session_game、game_flow_tests、campaign-flow。类型及地点范围的计数枚举复用现有编组筛选；按名称创建单位、技能等级增减、默认索敌范围及物品无敌查询连接实际状态。Win32 Release 客户端与专项程序增量编译通过；新增专项未执行，阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 验证，并核对 DotA marketplace 枚举、过滤器重入、数量边界、名称／自定义 ID、能力上限和原版语义。

## 脚本技能特效与声音查询待验证

路径：session_effects、spell_tests、effects。技能 ID 和字符串查询源特效／声音配置，坐标、地点及目标形式的 AddSpellEffect 创建实际特效并由现有效果生命周期处理；索引越界和默认类型已按原件静态证据处理。Win32 Release 客户端及专项程序增量编译通过；阶段按 spells.md 的夹具及 war3_spell_tests 命令验证，并核对多项资源、地图覆盖、未知 ID／类型／索引、空字段、目标挂点、销毁及原版返回语义、实际画面和声音路径。

## 自研联机关卡切换边界待验证

路径：session_campaign、session_match、lan-experimental-flow、game-flow。实验联机和实验回放执行 ChangeLevel／RestartGame 时明确报告未支持，避免暂停共享模拟后静默丢弃切关或重开请求；单机流程沿用原有入口。Win32 Release 产品增量编译通过。待阶段验证真实双端、回放和单机流程及错误传播；多人会话重开、跨关、缓存同步与原版行为仍待实现。

## 自研联机 EndGame 待验证

路径：session_match／session、lan_simulation／lan_runtime、game_view、main、game_flow_tests 与 generate-game-flow-fixture.py。实验会话的 EndGame 记录本机离开及结算意图，不暂停共享模拟；对话框回调按触发玩家定位，GetLocalPlayer 分支按各端执行；回放丢弃本机离开意图。Win32 Release 产品和专项程序增量编译通过，夹具生成脚本语法检查通过；新增专项尚未执行。阶段先执行 `python tests/generate-game-flow-fixture.py --data-root <data-root>` 更新临时夹具，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m> lan-dialog`。合并验证原胜利／失败对话框、Skip 分支、普通／Quit 按钮回调、等待纤程、main 初始化、同时退出／先前退出／事件重入、对话框回调内非点击者本地分支、真实双端与回放、结算及原版时序。多人 RestartGame／ChangeLevel 仍待实现。

## 自研联机脚本退出按钮待验证

路径：session_script_dialogs、lan_action_encoder／lan_simulation／lan_runtime、game_flow_ui／game_view、main、game_flow_tests。QuitButton 的脚本事件在各端消费，只有点击者请求离开；等待有序离开和回放记录后按 doScoreScreen 决定显示本机结算或返回 LAN。房主离开结束房间并保存部分回放，回放播放只执行事件。Win32 Release 产品及专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_game_flow_tests.exe <data-root> <fixture.w3m> lan-dialog`。集中验证房主／非主机、有／无结算、鼠标／快捷键、回放、双端与第三方玩家继续运行、离开回显顺序、最小化／过场／断线、重复点击及与菜单退出交错、事件重入和脚本自行 EndGame，以及原版时序与界面。

## 自研联机脚本对话框待验证

路径：session／session_script_dialogs／session_network_identity、game_state、game_flow_ui／game_view、lan_actions／lan_action_encoder／lan_simulation、game_flow_tests。普通 Dialog/Button 点击按玩家和显示轮次进入实验时间片，双方通过会话事件消费者执行；本地显示与重复点击去重独立，UI 句柄使用独立对象序号。QuitButton 支持点击者离开及可选本机结算，F10 可打开对局菜单。Win32 Release 产品和专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_game_flow_tests.exe <data-root> <fixture.w3m> lan-dialog`。集中验证两端仅本地显示、快捷键／鼠标／退出入口、重复与延迟／重显／切换对话框、同步销毁／清除／触发器重入、回放、多端及原版时序。必须覆盖各端 UI 对象创建顺序或按钮热键不同的限制；不支持非同步创建的任意 UI，也不证明原版协议互通。

## 自研联机建筑取消与英雄复活待验证

路径：lan_actions、lan_action_encoder／lan_simulation、session_network_identity、game_view、revival_tests。实验对局支持选中建筑的施工取消及按升级票号取消、祭坛复活和中立酒馆唤醒；复活请求携带死亡轮次并在消费时复核，状态摘要包含死亡／归属轮次、施工状态及升级票号。Win32 Release 产品及专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_revival_tests.exe <data-root> <fixture.w3m> lan-revival`。集中验证多选与 Esc、施工完成／升级替换、祭坛与酒馆权限／资源／附近买家、英雄复活后再次死亡／易主／移除、时间片事件重入、多端／回放及原版行为与协议。

## 自研联机单位操作待验证

路径：lan_actions、lan_action_encoder／lan_local_identity／lan_simulation、order_queue_tests。实验对局中的技能与修理自动施法开关、英雄学习、资源返还和指定乘员卸载已连接明确单位身份及会话命令；训练／研究／英雄复活的队列取消按建筑身份及 64 位任务票号消费，票号与全局计数进入状态摘要，训练／研究／复活／建筑升级及反召唤在票号耗尽时不再创建新任务；Win32 Release 产品和专项程序增量编译通过。新增专项尚未执行；阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。合并验证同类型多选、热键与鼠标、启停连续输入、技能／等级／资源条件、普通与尸体货舱、消失／易主／死亡／失选／转移、脚本事件重入、队列项前移／同类型替换／重复取消、研究／复活和票号耗尽、状态摘要及多端／回放／原版协议和界面行为。

## 自研联机生产与物品身份待验证

路径：lan_actions、lan_action_encoder／lan_simulation、game_view、order_queue_tests。实验对局为生产与物品动作传递明确单位和物品身份，消费时检查选区／权限／归属；同类型多选可指定高亮单位。失效子组及已转移或移除的物品跳过，未知对象拒绝；被拒绝的本地网络命令保留对局并记录原因。Win32 Release 产品与专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。集中验证多选训练／研究／升级／建筑放置、物品即时／点／单位使用与换格／转交／丢弃、Shift、槽位替换、失选／易主／移除及回调重入、畸形报文、双端／回放与原版行为。原版队列协议仍待实现。

## 自研联机多单位技能待验证

路径：lan_actions、lan_action_encoder／lan_simulation、game_spells、order_queue_tests。实验对局将明确能力、目标、队列与首成功配置及有序候选放入单个私有时间片动作，交由实际会话施法；新增专项检查仅编译，尚未执行；阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。阶段合并验证即时／点／单位和可破坏物目标、Channel 全部／首成功、候选优先顺序、队列满与前置失败、触发器删除／易主／选区变化、畸形报文、双端及回放、断线和原版动作／语义。原版网络互通与完整技能行为仍未完成。

## 自研联机普通子组命令待验证

路径：game_flow_ui／game_view、lan_action_encoder／lan_simulation、order_queue_tests。实验联机启用子组选项，Ctrl 筛选高亮类型，将子组和普通移动／攻击／巡逻／目标／停止／保持命令写入有序时间片并由各端筛选执行；原版队列协议仍待实现。Win32 Release 产品和专项程序增量编译通过，新增专项尚未执行；阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。阶段合并验证同／异类型多选、Ctrl 鼠标／热键／小地图、Shift 排队、选区变化与共享控制、双端／回放、UI 设置持久化及原版动作和行为。

## 自研联机菜单主动离开待验证

路径：game_flow_ui／game_view、main、lan_runtime／lan_host／lan_join、lan_departure_tests／revival_tests。非主机菜单退出按序发送待发动作和离开请求，等待本地消费离开事件并记录回放后关闭；房主退出结束房间并保存部分回放。Win32 Release 增量编译通过；`war3_lan_departure_tests.exe` 和 `war3_revival_tests.exe <data-root> <fixture.w3m> lan-leave` 各 1 通过／0 失败。待阶段合并验证实际游戏菜单、房主／非主机退出、最小化／过场、离开等待期间脚本结束对局、回放与跨机器双端、多片选区同步、超时及资源释放；原版协议和主机迁移尚未完成。

## 自研联机非主机离开待验证

路径：lan_host／lan_join、lan_actions／lan_simulation、lan_setup／session_collections、revival_tests 和 lan_departure_tests。实验对局的非主机断线在主机时间片中触发一次地图玩家离开事件，剩余客户端继续；活动选区同步参与者和校验等待随离开更新。Win32 Release 产品及专项编译通过；`war3_revival_tests.exe <data-root> <fixture.w3m> lan-leave` 和 `war3_lan_departure_tests.exe` 各 1 通过／0 失败，分别覆盖地图离开事件／等待中的选区同步／伪造与重复动作，以及本机两条客户端连接、256 个未比较时间片、溢出动作 FIFO 和先前动作／离开次序。原版离开协议及主机迁移仍待实现。待合并验证真实游戏双端／多端与回放、胜负脚本、离开时多片选区同步／暂停／最小化、异常数据／连接超时、完整输入顺序、连续离开及内存资源释放；断线后被接纳动作以主机解析顺序为准，缓冲超限可能丢弃未接纳输入。

## 自研联机商店交易待验证

路径：lan_actions／lan_action_encoder／lan_runtime／lan_simulation、session_network_identity、revival_tests 与 fixture。自研对局按时间片传递商店对象、商品和类别，消费真实购买、库存、买家、资源、人口及事件；已移除商店和消费前失效的交易跳过，未知身份拒绝。Win32 Release 产品和专项编译通过；`war3_revival_tests.exe <data-root> <fixture.w3m> lan-purchase` 最小检查 1 通过／0 失败，覆盖物品／单位购买、在途改选、同片／跨片移除、未知身份与经典解析拒绝。阶段合并双端与回放、同片多玩家竞购和补货、目标／买家删除与易主、资源／人口不足、选区／触发器回调变化、无效／伪造报文与断线；原版商店协议和对象编号尚未实现或对照。

## 酒馆唤醒待验证

路径：session_revival／session_commerce、player_commands／game_commands、lan_action_encoder／lan_local_identity／lan_simulation、revival_tests。`Aawa` 四槽即时唤醒接入资源／人口／附近买家检查、原英雄恢复和中立订单；自研联机按目标身份发送。Win32 Release 产品及专项目标编译通过；复活夹具 `awaken` 模式最小检查 1 通过／0 失败，覆盖原句柄、费用／人口／恢复、回调递归阻断及价格变化退款，无 Game.dll。命令：`war3_revival_tests.exe <data-root> <fixture.w3m> awaken`。待合并验证四槽顺序与按钮布局、原版单人／多人命令、源费用舍入／自定义覆盖、队列冲突、库存、资源变化与目标订单／复活事件重入、失效退款、空间阻挡、英雄死亡／转让／物品、音效与实际窗口；真实双端／回放及原版协议互通尚未验证。

## 维护费后采金统计待验证

路径：game_state、session_harvest、session_match。采金时累计维护费后的入账值，`GetPlayerScore(PLAYER_SCORE_GOLD_MINED_UPKEEP)` 读取该统计。原版 Game.dll 1.27 的 `GetPlayerScore` 入口 `0x6f1e3d90`：类别 10 相加类别 11 和 12 对应的两个查询，类别 11 单独读取前者；两个原版查询均对内部计数除以 10；当前沿用整数采集结算后累计，分数累计精度仍待对照。原始指令保存在 `tmp/docs-artifacts/war3/player-score/get-player-score.txt`。Win32 Release 产品增量编译通过。待合并验证无维护费／低高维护费、等级变化、资源上限、多人及脚本查询，并与原版统计和结算对照；科技百分比与总分等其他类别仍待实现。

## 自研选择同步屏障待验证

路径：jass_threads／jass_runtime、session_collections／session_threads／session_tick、lan_actions／lan_simulation／lan_runtime／lan_setup／map_preparation、game_view／main／replay_preparation。实验联机分块同步全部人类玩家的选择快照，挂起当前 JASS 纤程直至同轮分片齐全；回放消费记录，单机保持原有路径。同步屏障未完成或分片待发时阻断后续本地输入，连续发送受阻 15 秒中断连接；Win32 Release 增量编译通过。操作：合并验证地图 main／触发器调用、并发／嵌套调用、子线程继承、空选区和跨多个分片、已删除单位、普通选择与脚本本地选择交错、取消／暂停、断线／缺片／超时、畸形／重叠／重复报文、队列背压、后续命令排序和预算，以及双端／回放结果一致性。原版同步协议、不同本地分支调用顺序及脚本本地选择的实时命令同步仍待完成或对照。

## 自动选区与自研联机待验证

路径：session_collections／session_transport／session_lava_spawn／session_spirit_split／session_ownership、session。登船、炎魔分裂及龙卷风接管／返还选区时，同步更新已确认的各玩家选区和本地选中标志，避免后续网络命令使用不同选区；自动变化不额外触发选择事件。Win32 Release 增量编译通过。操作：同构建双端选择本方／共享单位，登船与吞噬、炎魔分裂、龙卷风创建／结束后立即下达命令，比较选区、事件与状态；覆盖选择回调重入、死亡／移除／易主、断线、回放及多玩家选择同一单位。骑乘合体、下骑和占据成功由所有者已确认选区接续，并在各会话执行选择事件；需合并验证多输入／输出、共享玩家、回调重入和后续命令。元素分身出生、成员生成、回收及全部创建失败已接续各玩家已确认选区；合并验证出生期间改选、多个玩家分别选择成员、死亡／易主及选择事件。脚本 SelectUnit／ClearSelection 的实时命令选区跨端同步仍待完成；同步快照见上方屏障待测项，自动选择规则与原版一致性待对照。

## 自研对局聊天与回放待验证

路径：lan_actions／lan_runtime／lan_simulation／lan_match_loading、game_view、session_text／session_spatial_events。实验对局将全体聊天作为有序私有动作发送与回放，按玩家触发 JASS 聊天事件并显示给所有本地视角；经典动作解析默认拒绝私有动作。Win32 Release 增量编译通过。操作：同构建双端互发中英文、长消息、并发输入与选择确认，验证精确／子串触发、玩家身份和脚本状态；录制回放并对照时间片、触发及显示；覆盖空串／非法长度／控制字节、损坏包、失败保留输入、排队和断线。原版协议及真实双端行为尚待完成或验证。

全体／盟友／观察者频道已接入单机及实验时间片、会话接收范围和回放；Enter、Shift+Enter、Ctrl+Enter 分别打开盟友、全体、观察者输入，输入结束前处理同帧文字，聊天开启时 Esc 优先关闭聊天。消息按字面绘制，对非 UTF-8 玩家名进行本地显示替换。Win32 Release 增量编译通过。待合并验证三频道／单向联盟和变化时机／观察者、输入快捷键与中文或代理项边界、同帧 Enter／Esc／目标模式、非 UTF-8 名称、脚本回调和多端／回放一致性；频道行为和原版 UI 尚待对照。频道不提供消息保密。

## 地表特效音频隔离待验证

路径：session_effects／session_sound、session、game_view。地表特效的源声音标签进入有界本地呈现队列，音频设备或资源异常在 GameView 记录，不阻断地图脚本和特效句柄创建。操作：使用地图覆盖的非空 Sound 标签创建特效，合并检查静音／无设备／缺资源、多个同时播放、队列上限、暂停／切图及多人同步；对照声音位置、时机、声道及随机变化。Win32 Release 增量编译通过；实际运行及原版听感待功能阶段验收。

## 物品、攻击增强及持续施法音效待验证

路径：session_consumables／session_item_use／session_projectiles／session_sound、sound、game_view。直接生效物品、消耗品和攻击增强发射接入有界一次性声音队列；持续施法按能力、效果别名与 Buff 读取循环音效，在本地跟随单位，并在中断、暂停、退出或不可见时释放。Win32 Release 增量编译通过。操作：合并验证物品与技能成功／失败、重复播放、持续施法完成／打断／死亡／迷雾、移动、暂停恢复、切图、多施法者及音频异常；对照原版位置、时序、听感与联机同步。非通道持续增益和地面残留音效尚需补齐；实际运行及原版一致性待功能阶段验收。

## 自研回放生命周期与视角待验证

路径：replay_experimental、main、game_view。记录录制端 peer 并在加载时恢复；过场期间继续处理时间片，回放中禁用联盟输入；退出收尾尝试保存已记录时间片，断线／窗口关闭及录制异常的前缀使用 partial 文件名。Win32 Release 增量编译通过。操作：以主机及加入端分别录制包含 GetLocalPlayer 分支和过场的对局，比较重放状态和画面；覆盖录像资源超限、异常、窗口关闭、硬终止、无完整片、保存失败、最小化与暂停、回放后返回。原版回放编号与真实对局一致性仍待实现或验证。

## 自研局域网回放闭环待验证

路径：replay_experimental／replay_browser／replay_preparation／replay_runtime、lan_host／lan_join、game_view、main 与 CMake。自研同构建 LAN 对局记录已应用时间片，离场保存用户目录，并经单人回放界面进入地图准备和只读播放。Win32 Release 增量编译通过；未运行双端、录制或播放验收。

操作：同一构建双端选图进入对局，执行选择／编组／移动／技能／过场 Esc，正常退出及断线后检查用户回放文件，再从回放列表播放、暂停、调整镜头并退出；对照各时间片状态与随机数。合并验证文件名冲突、录制失败、退出／切图／最小化、缺图／改图、不同构建、异常记录、内存预算和资源释放。记录不含离开、结算与校验；自研聊天动作见上方待测项。网络下载地图必须在本机同路径存在；原版对象编号和回放互通尚未实现。

## AI 控制与终极技能待验证

路径：session_ai_armies。电脑玩家对合法可见敌人使用吸取、控制、末日、点金和醉酒云雾，并按战况选择已有英雄终极技能。Win32 Release 增量编译通过。操作：四族实战中构造英雄／建筑／魔免／召唤目标及受伤友军，观察费用、效果、通道取消、归属／死亡回调及战斗恢复；合并运行 AI 与施法会话检查。原版选目标规则、阈值、多人同步和长局性能待阶段验证。

## 施法一次性音效待验证

路径：session_sound／session_area_spells／session_self_spells／session_militia、game_view。常规释放、即时自身技能及警钟发出有界本地声音事件，由 GameView 播放源 Effectsound，设备或资源异常记录日志而不改变模拟。Win32 Release 增量编译通过。操作：比较可见和离屏单位、静音／无设备、坏标签、暂停、切图、同时施法及双客户端同步；核对位置、释放时序和模型音效重叠。物品、攻击增强和循环音效的新增范围见上方待测项。

## 联机与回放 Esc 动作待验证

路径：lan_actions、lan_action_encoder、lan_simulation。经典 0x61 经时间片触发对应玩家的过场结束事件，联机输入通过编码发送。Win32 Release 增量编译通过。操作：双端或回放中注册不同玩家的 Esc 事件，分别在过场、有控制权、无监听及回调嵌套时按 Esc；检查仅目标玩家触发、事件顺序和取消／退出。原版动作发送条件、联机互通及回放入口待验证。

## AI 战斗辅助技能待验证

路径：session_ai_armies。电脑单位接入范围驱散、治疗守卫、静止陷阱、吼叫、沉默、镜像和蝗虫群决策。Win32 Release 增量编译通过。操作：在四族对战中构造有益／有害增益、受伤友军及可见敌军，观察实际技能效果、资源消耗和命令恢复；合并 AI 与技能会话检查。原版目标优先级、候选阈值、事件重入、伤害／魔免、群体持续作战与性能、联机及真实对局尚待验证。

## 模型全局序列声音事件待验证

路径：model_particles、model-event-sounds。模型 SND／FPT 全局序列按实例全局时钟消费，暂停不重复触发，跨周期事件有限处理。Win32 Release 增量编译通过。操作：使用含全局序列事件的模型，检查首次激活、暂停、动画切换、跨多个周期、跳帧、姿态、离屏与切图释放；原版时序、位置及异常全局序列待对照，实际运行尚未验证。

## 经典回放／联机编组动作待验证

路径：lan_actions、lan_simulation。经典 0x17／0x18 编组动作接入编码／解码与时间片选区，Win32 Release 增量编译通过；操作：构造编组、切换及随后移动／施法，合并检查同时间片、玩家隔离、死亡／易主／迷雾、事件重入、无效报文与对象映射。原版对象 ID、附加字节语义、实际回放和原版互通尚未验证。

## 一次性模型和能力声音变化待验证

路径：sound、model-event-sounds。源 FileNames 的多声音文件及 RANDOMPITCH 接入一次性播放，本地随机状态不参与对局模拟。Win32 Release 增量编译通过。操作：播放带多文件与不同音高的模型脚步、死亡及 BlizzardWave／RainOfFireWave 能力声音，检查可选文件、音量／音高／空间距离、静音和切图回收；合并运行声音模块检查。随机分布、音高公式、设备听感和多人确定性仍需原版对照及阶段验证。

## AI 友军辅助技能待验证

路径：session_ai_armies。电脑单位为空闲或战斗状态下的合法友军选择治疗、回春、驱魔、雕像生命／魔法恢复，以及交战增益，并沿用实际施法入口及战斗恢复流程。Win32 Release 增量编译通过。集中验证敌我／可见性、技能目标和增益限制、魔法／冷却／科技／禁用、自动施法开关、战斗与移动中断、死亡／易主／回调重入、选取顺序、多单位性能、多人同步及四族原版 AI 行为。操作：加载含四族电脑的对战地图，构造受伤／被攻击的友军并观察施法、打断和资源变化；合并运行相关 AI 与技能会话检查。阈值为当前策略，实际对局与原版一致性尚未验收。

## 特效与弹道的模型声音事件待验证

路径：game_effects、game_view／game_model_sound。视野内特效、武器／技能弹道及波形按实例推进源模型声音事件，视口内外共用独立声音时间线；离开场景时释放实例。Win32 Release 产品增量编译通过。集中验证原版声源／音量／事件时序、镜头切换、动画序列变化、弹道消失、迷雾与暂停、切图清理和大量弹道性能。原版一致性与实际运行尚未验证。

## 人族农民／民兵征召阶段待验证

路径：session_militia、session_spell_info／spells／ability_commands、entities、session_orders／combat_orders／tick 和 CMake。接入源能力数据、主城警钟、前往城镇大厅转换、民兵持续时间／自动返程及普通命令中断；矿内采集单位允许参与征召。Win32 Release 产品增量编译通过；实际运行和原版一致性未验收。

大厅失效时清理征召路线及命令，警钟群体派令时遇到脚本改变主城命令或警钟状态会停止旧派令。集中验证原版主城及单位能力、UI 反向按钮和命令、45 秒计时起点／暂停／到期、无大厅／拥堵／死亡／易主／中断、采矿与携带资源、变形的生命与人口、脚本回调重入、地图能力覆盖、AI 和联机同步。开启警钟按源标签播放音效，该接入的 Win32 Release 增量编译通过，反向操作和播放时序需对照；自定义魔法、冷却及科技前置在各类命令中的语义待实现和验证。

## AI 战斗施法阶段待验证

路径：session_ai、session_ai_armies、session。电脑玩家战斗心跳选择范围内的已支持攻击技能及低生命友军治疗，并接入现有施法流程；正常完成时符合条件才恢复战斗命令，取消和中断不保证恢复。Win32 Release 产品增量编译通过，运行尚未验证。集中验证敌我和可见性、各族英雄及单位目标／点目标／范围技能、治疗优先级、无效目标、魔法／冷却／前置／禁用、攻击前摇／移动／撤退／运输和施法打断、脚本事件重入／单位销毁及归属变化、持续战斗性能及原版 AI 行为对照。无攻击目标的辅助技能和完整策略继续实现。

## 地图漂浮文字阶段待验证

路径：session_text_tag、session／script_state／session_tick、game_text_tag／game_view 与 CMake。texttag 创建／销毁、文字／单位或坐标定位、颜色／速度、可见／暂停／永久、年龄／寿命／淡出连接会话状态和 GameView 绘制，支持内联颜色与换行。Win32 Release 产品增量编译通过。

集中验证 DotA 与其他真实地图的文字显示、坐标／单位定位、颜色／字体尺寸／速度／淡出、暂停／隐藏／过期／重复销毁、地图切换释放及大量文字性能；原版单位换算、时钟、文本遮挡、战争迷雾与本地可见性仍待对照。实际画面、交互及原版一致性未验收。

## 战役镜头、字幕与装饰物阶段待验证

路径：camera_control／session_camera_setup／session_world、world／game_view 相机，session_text／game_cinematic_panel／GlueScreen 原 FDF 与阵营皮肤，world／scene_objects 动画请求，music／session_music 主题音乐。支持实际相机配置／单位跟随／震动、过场界面／肖像和字幕、矩形／圆形装饰物动画遮挡物空间块淡化／独立边界雾，以及主题音乐、原版声道音量组、区域／单位附着空间音。源 FDF 和原图启动证据位于 tmp/docs-artifacts/war3/campaign/。

序章 Prologue01 的静音最小检查已通过原图 main 初始化和前 2 秒模拟，未加载 Game.dll；界面隐藏窗口检查绘制四种皮肤。大范围对局／可见画面／肖像和听感尚未验收。功能阶段合并验证源镜头字段／时长／跟随／震动和用户控制、HUD 淡入淡出／字幕换行／声音／肖像／四族皮肤、装饰物过滤／随机相位／直接操作次序、主题音乐与游戏音乐恢复、八组一秒渐变／切换声道／多区域注册注销／镜头进出及暂停／3D 声像、退出／性能／资源释放；精确相机波形、界面渐变、空间声像／声锥、遮挡轮廓／几何与雾边界精度及其他脚本仍开放。

## MRF 披风、战役转场与脚本相机阶段待验证

路径：morph_mesh、model 事件、model_cinematic、session_campaign／main 和 world／session_world／game_view。原版六个 Morf 文件的纹理、索引、UV、帧顶点与法线按事件读入内存、线性插值并绘制；脚本独立影片／模型槽在结束转场按模型优先顺序消费。相机位置、定时平移、距离／角度／旋转／滚转／高度字段接入实际视图。原版资源格式、转场反汇编和相机字段依据在 tmp/docs-artifacts/war3/campaign/。

Win32 Release 产品编译通过；真实模型静音隐藏窗口检查加载六份 MRF，运行 19,031 ms／570 帧，首个披风在 14,031 ms 触发并绘制 90 次，正常退出。此检查不证明可见画面、材质或其余五段。

集中验证六段披风事件与坐标／纹理／灯光／透明／深度、相机角度单位／平移／输入覆盖、模型后影片及胜利／切关、退出类型、声音／GPU／窗口／资源释放、完整原版画面与性能。相机跟随控制器、CameraSetup、镜头抖动、其他模型事件及原版精确时序仍待实现或对照。

## 模型过场与地图滤镜阶段待验证

路径：model／model_pose 多相机及滚转，model_cinematic 的连续序列／源 Scene 声音，sound 标签匹配，campaign 与 main 入口；session_match、script_state、game_view／game_cine_filter 和 renderer 的脚本滤镜状态／纹理／UV／颜色／混合。原版结局模型十段与对应相机、第二段原音轨已接入；MRF 披风网格已接入，其他模型事件仍未完成；脚本 PlayModelCinematic／PlayCinematic 转场时先模型后影片。原件 REA 序列回调与 Scene 配置、模型清单保存在 tmp/docs-artifacts/war3/campaign/。

Win32 Release 编译通过；真实原模型静音最小运行 6,219 ms／185 帧，跨过首段到第二段，音频标签解析问题修复后通过。可见画面、声音听感、全场次、原版精度及滤镜玩法均待功能阶段验证。集中验证原版相机／序列边界／音轨连续性、地图脚本电影／模型排队及胜利切关／播放期间声音，滤镜九个 native／纹理／颜色及 UV 动画／六类混合与边界、覆盖层顺序、暂停／切换／异常和资源释放；合并 MRF 与其他事件验收。

## 战役影片阶段待验证

路径：cinematic、campaign_browser、main 和 CMake；从原版 Movies 的 AVI 文件直接构建 DirectShow 图、通过 blizzard.ax 解码 BLZ0、播放 MP3 并支持跳过／返回。影片与资料片模型过场属于不同流程，后者的完整表现仍待验收。Win32 产品编译通过；TutorialIn 隐藏窗口最小检查中静音和非静音均构图成功、播放时间推进，2 秒分别收到 50／49 个解码后帧，正常销毁；可见画面、声音听感及原版一致性待功能阶段验证。REA 依据和临时检查位于 tmp/docs-artifacts/war3/campaign/。

集中验证九部影片的完整播放／音画同步／可视比例、静音、跳过、窗口缩放／最小化／设备恢复、错误提示／资源释放／重复播放及只读资源目录；完成模型过场后合并对照其时序、相机、动画、事件和声音。

## 战役流程与跨地图缓存阶段待验证

路径：campaign_browser、campaign_profile、session_campaign、session_cache、map_preparation、main及相关接口。菜单、章节和难度、进度、ChangeLevel、重新开始及独立 gamecache 与单位快照已接入；完整战役、视频过场、原版 .w3v／存档／回放／局域网未完成。Win32 Release 产品编译通过；功能验证与原版一致性待阶段合并执行。

集中验证原版 ROC／TFT 菜单和章节解锁／难度、直接地图及自定义地图的切换／返回／重开、战役进度持久化、英雄及物品跨关恢复、缓存异常与写入边界、多进程和资源释放；同时验证完整剧情、UI／声音、性能及无解包增长。细节和未实现边界见[战役流程](campaign-flow.md)与[游戏缓存](campaign-gamecache.md)。旧 MEngine 待测批次保持延期。

按用户2026-10-26的要求，先按[集中实现清单](implementation-roadmap.md)覆盖可运行流程，再在功能阶段集中测试修正，源码与待测记录持续提交。必要编译和阻塞问题最小复现及时执行；原件逐项精度检查与回归后置，不运行旧MEngine全量检查。此前三项合并批次保留为历史记录。证据保存在仓库根目录 `tmp/docs-artifacts/war3/`。

| 任务 | 路径 | 验证内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W001 原生程序与归档 | CMake、platform、archive、renderer、main | x86 独立构建、MPQ 覆盖、有界缓存与引用生命周期、无 Game.dll、D3D9/9Ex 绘制与窗口恢复 | 归档错误传播、设备恢复和资源生命周期 | 基础范围通过，批次关闭 |
| W002 图像、字体和音频边界 | image、media、main、rea-boundaries | BLP1/JPEG/palette、BLP2/BC、TGA、原版中文字体、Miles 内存 MP3 | IJL 调用约定、透明平面、codec 路径与 sample 生命周期 | 基础范围通过，批次关闭；音效与听感仍待验收 |
| W003 原版 MDX 菜单场景 | model、model_pose、binary、archive、renderer、main、fdf、glue、tests | MDX800 基础场景、纹理来源、FDF 模板与字符串、真实帧、退出输入 | 不可信记录边界、FDF 预算、菜单按钮输入边界 | 基础范围通过，批次关闭；完整还原留在功能矩阵 |

## 战棍与角鹰兽骑乘阶段待验证

路径：session_war_club/session_coupling、源能力／目标／施法／命令／按钮／取消，树木占用／死亡、武器选择／攻击发射／状态tick／单位死亡移除与变身，真实新单位／人口／选择／物品／分组，持树效果骨骼／尺度／替换贴图及后台资源。Agra、Acoi/Aco2/Aco3、Acoa/Acoh、Adec和w3a派生有实际消费者。

状态：实现接入；Win32 Release产品增量编译通过、无警告，差异审查通过，新增专项、三图、原版精度、UI/GPU/声音/AI及性能统一留功能阶段验证。源表、归档摘要和REA创建／生命／战棍调用证据、构建日志在tmp/docs-artifacts/war3/warclub-coupling/。

集中验证：拔树距离／独占／中断／树死亡与占地、延迟起点／刷新／15次实际攻击／命中和弹道快照／移除／武器恢复／源树类型与贴图／骨骼和Alternate姿态；原按钮／热键／研究／命令／双向寻伴／辅助移动／竞争与取消、三单位类型／新实体／比例生命／库存／buff／定时生命／冷却接续／原事件顺序、海岸／水面／WPM／碰撞／无合法下骑点、人口／选择／所有权／死亡复活／异常回调与资源释放；三图长局、原UI/GPU/音效/AI、CPU／内存／持续切图无解包增长。英雄／建筑合成未实现，精度与搜索边界见[实现说明](warclub-coupling.md)。旧MEngine队列保持延期。

## 仙女龙与暗夜防御阶段待验证

路径：session_faerie_dragon、原能力注册／命令／按钮／施法阶段／付费事件，真实攻击／伤害／隐去／移动／视野／弹道／通道清理；session_defense_passives、原被动定义／科技和可用状态、装备夜视、武器与伤害、带符号状态汇总。Apsh／Amfl、Ault、AIdd／Aegr、Assk／Ansk、Arsk及源派生已有实际消费者。

状态：实现接入；必要Win32 Release产品编译通过、无警告，差异审查通过；新增玩法专项、三图、原版精度、UI/GPU/声音/AI和性能留在阶段集中验证。源表／Profile／摘要、REA类型证据及编译日志在tmp/docs-artifacts/war3/faerie-dragon/。

集中范围：手动／自动相位、攻击开始／在途武器／伤害、1.5秒隐去／原命令恢复与生命周期；魔力之焰30秒通道／正反按钮／停止与其他命令／12护甲、付费技能与库存／零费用区别、范围／原弹道／费用及上限／主次目标、来源／目标死亡轮次和事件重入；夜视研究／转让／昼夜／启停与共享视野，艾露恩之优雅／硬化／抗性／被动物品、概率／最低值／魔法与物理分类／叠加、负护甲与实际HUD；原版反应／DataF／减伤次序、全等级／w3a、UI/GPU/AI/声音及三图长局／性能／资源释放／无解包增长。非零被动防御速度／反弹等开放边界见[实现说明](faerie-dragon.md)。旧MEngine队列保持延期。

## 守卫、吼叫与范围净化阶段待验证

路径：session_wards_roar、spell_info/spells/area_spells/summons、陷阱登记/tick/移除、实际Buff数值/盗取/恢复及库存目标/支付/六槽/符文；caster_spells的范围驱散与自爆、派生源命令。包含治疗／岗哨／观察者／静止陷阱、吼叫／嚎叫／卷轴和自爆／消魔的连续流程。

状态：实现已接入，执行必要Win32 Release产品编译及差异检查；新增玩法专项、三图、原版精度、UI/GPU/声音/AI及性能统一留在功能阶段，不逐能力运行测试。源表、归档摘要、原行和构建日志在tmp/docs-artifacts/war3/{wards-roar,dispel-casters}/。

集中验证：原能力/研究/按钮/命令/热键与库存目标/次数/冷却/拾取符文；真实单位/寿命/恢复/侦测/共享视野，陷阱激活/范围/原时间与目标分类/空间性能，吼叫正负数值/偏好/数量/互斥/驱散/盗取，敌我驱散/魔法损失/召唤与幻象/抗性/自爆牺牲及保留玩家来源；死亡/移除/归属/暂停/复活/召唤与物品事件重入、三图长局/资源释放/无解包增长。原版精度与完整表现保持开放，见[实现与边界](wards-roar.md)。旧MEngine队列保持延期。

## 破法者与龙鹰阶段待验证

路径：session_spell_steal/human_channels/feedback，源spell_info/passive_info/spells/channel/attack/projectiles、buff出处/成员与实际状态、structures分类、自动施法/库存选目标与支付。消费Asps/Amls/Aclf、Afbk及原派生。必要产品编译无警告，差异检查通过。

状态：实现接入；只执行开发必需Win32 Release产品编译、差异和源消费者审查。新增专项、三图、原版精度、UI/GPU/声音/AI及性能待阶段集中验证。源表/Profile/优先级/单位/归档摘要、REA类依据及构建日志在tmp/docs-artifacts/war3/human-casters/。

阶段合并盗取源优先级/正负状态/实际迁移/接收者/魔免/剩余时间/模型/源/自动与候选缓存，反馈真实魔法/英雄与召唤/同次伤害/全部攻击组合，锁镣目标/控制/多来源/伤害/光束/打断/驱散/死亡重入，乌云范围/结构目标/远程攻击/重叠/退出/结束/移除和物品目标/次数/费用/冷却/六槽/事件；三图长局、完整原UI/GPU/声音/AI、CPU/内存/连续切图无解包增长。精确规则及库存Cloud独立寿命等开放边界见[破法者与龙鹰](human-casters.md)，旧MEngine队列继续延期。

## 单位护盾、链接、削弱与灵魂行者阶段待验证

路径：session_unit_casters、spell_info/spells/caster_spells/autocast、实际buff替换/释放/tick，damage的真实分摊与递归/倍率隔离，fog/visibility，entities/unit_forms的原类型和虚无，以及item_use的目标/六槽/次数/冷却/事件。消费Alsh/Aspl/Afae/Acri、Acpf和源野外/库存派生。必要Win32 Release产品编译无警告，差异检查通过。

状态：实现接入；只做开发必需Win32 Release产品编译、差异和源消费者检查。新增专项、三图、原版精度、UI/GPU/声音/AI及性能保持阶段待验证。源表/归档/字段/摘要、REA类证据及编译日志在tmp/docs-artifacts/war3/unit-casters/。

阶段合并闪电护盾源目标/范围/友伤/双buff/叠加/周期/来源消失/载体/驱散与空间边界；链接集合/选取/护甲和护盾/真实分摊/归属/失效成员/死亡重入与事件；精灵之火负甲/自动开关/昼夜和共享视野/隐形与清理；残废三类实际削弱/叠加/分类；灵魂行者源类型/虚无/过渡/取消/研究/库存、法杖目标/费用/次数/冷却/六槽和使用事件，以及三图长局/UI/GPU/AI/音效/CPU/内存/切图无解包增长。双buff、原分摊/视野/形态语义及Aspp原版行为仍待对照，详见[施法单位补齐](unit-casters.md)。旧MEngine队列继续延期。

## 地精修补匠阶段待验证

路径：tinker状态、session_engineering/tinker与源spell_info/passive_info、equipment/hero学习/原生能力级别/research/unit_forms、原Channel/施法/自动开关/攻击/集结/死亡/tick及真实模型/资源。ANsy/ANcs/ANeg/ANrg、工程派生、ANde拆毁家族与Asds自爆家族有实际消费者。必要产品编译无警告，差异检查通过。原24英雄/96能力登记核对补齐AOsw实际AOwd蛇棒原型，仅作静态入口证据，未宣称完整玩法通过。

状态：实现接入；仅执行开发必需Win32 Release产品编译和差异检查。新增行为、三图、原版精度、GPU/UI/声音/AI和性能保持待阶段验证。原表/元数据/Profile/单位/模型路径/摘要和REA类型依据、构建日志在tmp/docs-artifacts/war3/tinker/。

阶段合并四项能力完整学习/命令/按钮/冷却，工程替换的升级/降级/移除/后加能力/科技/等级/句柄与事件重入，机器人原类型/力量/护甲/拆毁/库存和变回，工厂投掷/生产/原子单位/时限/集结/约束/转让，卡布恩手动/自动/实际死亡/爆炸范围/连锁/来源消失/重生，火箭群波次/随机分布/范围伤害/上限/眩晕/建筑/取消和在途释放；三图长局/完整UI/GPU/AI/音效/CPU/内存/切图无解包增长。精确规则与表现的开放边界见[地精修补匠](tinker.md)，旧MEngine队列继续延期。

## 炼金术士与击杀奖励阶段待验证

路径：alchemist状态与session_alchemist、原spell_info/spells/channels/spell_effects/neutral状态tick、unit_forms、callbacks及玩家资源事件。ANhs/ANab/ANcr/ANtm和w3a覆盖有实际消费者；共享死亡奖励读取原玩家开关及单位奖励骰子。必要产品编译无警告，差异检查通过。

状态：真实消费者已接入；仅执行开发必需Win32 Release产品编译和差异检查。新增专项、三图、原版精度、GPU/声音/AI和性能未验收。源表/归档/字段/摘要、common.j常量及构建日志在tmp/docs-artifacts/war3/alchemist/。

集中验证医疗气雾波次/瓶轨迹/中心投递/敌我治疗/上限/取消和来源消失，酸性炸弹追踪/主次伤害/负护甲/周期/叠加刷新/驱散，化学狂暴原句柄/成长/库存/类型/武器/到期与死亡，炼金术目标/价格/击杀/普通奖励开关/尸体/重生和回调重入，真实资源事件/原随机序列及三图长局/UI/GPU/声音/AI/资源释放/性能。精确规则、时序与完整表现保持开放，见[炼金术士](alchemist.md)。旧MEngine队列继续延期。

## 火焰领主阶段待验证

路径：firelord状态、session_firelord/lava_spawn/volcano与spell_info/spells/area_spells/channels/spell_effects/orb_attacks/projectiles/passives/伤害/死亡/移除/召唤/tick消费者。ANso/ANlm/ANic/ANia/ANvc原表和w3a覆盖共用。

状态：真实消费者已接入；开发必需Win32 Release产品编译和差异检查通过。未执行新增专项、三图、GPU、原版精度或性能回归。源表/模型/摘要、REA火山登记与分派、构建日志在tmp/docs-artifacts/war3/firelord/。

集中验证灵魂燃烧持续伤害/禁法/减免/驱散，炎魔出生期间操作/分裂攻击计数/旧弹道票据/生命阈值/代数/寿命/归属及回调重入，燃灰手动/自动/被动/法球/叠层/致死爆炸/尸体/来源消失，火山波次/本体和占地/取消/自然结束/在途岩石/地形对象/眩晕；原UI/GPU/AI/声音、三图长局/资源释放/性能和无解包增长。完整原版公式/分类/择取/视觉与音效仍开放，详见[火焰领主](firelord.md)。旧MEngine队列继续延期。

## 元素分身与龙卷风阶段待验证

路径：spirit_split状态与真实成员、session_spirit_split及主施法/Channel/tick/隐藏/伤害/死亡/移除/归属/经验，ambient_passives常驻登记/附近索引/时钟/状态/视觉，passive_info/auras/attack_passives、控制/驱散/魔法消费/吞噬和Resistant native。消费ANef/Acef、ANto、Apig、Awar/ACpv、Atau/ANta、Atdg/Atsp/Atwa、Aasl和Arsk/ACrk及源覆盖。

状态：真实消费者已接入；开发必需Win32 Release产品编译和差异检查通过，初次编译缺参/局部遮蔽已修正。没有执行新增行为专项、三图、GPU或性能回归。源表/归档/MDX路径/common.j常量、REA类型入口、构建日志与产品摘要位于tmp/docs-artifacts/war3/spirit-split-tornado/。

阶段合并原英雄句柄/成长/库存/HP/MP/人口/经验、三分身出生/原技能/死亡/到期/原位置与选择、全部死亡或移除的英雄死亡及祭坛、成员与英雄的归属/删除/形态/重生/事件重入；龙卷风创建/选择/实际控制/手动与游走/取消/结束、建筑分区伤害/卷起/减速/来源消失，常驻献祭/粉碎/嘲讽、抗性native与持续时间/变形/控制/吞噬/驱散额外伤害；三图长局/完整AI/UI/GPU/声音/CPU/内存/切图无解包增长。

原件出生/回收与返回规则、Atsp的Dur=12/Btsp-Btsa双状态与DataA=22、游走RNG/路线、粉碎部分区/伤害分类、Taunt默认DataA/Prefer/Maximum及非零参数、抗性完整规则、声音与AI保持开放，详见[元素分身与龙卷风](spirit-split-tornado.md)。旧MEngine队列继续延期。

## 中立英雄法术、联动与末日阶段待验证

路径：session_neutral_spells、spell_info/area_spells/wave与原施法输入，passive_info/attack_passives的醉拳与减攻，spell_effects的独立状态/周期/死亡轮次，channels/Lightning、callbacks/尸体/召唤、item_use/teleport与真实禁用，damage可选的保留玩家来源和effects离屏兜底。消费ANbf/ANcf/ACbc、ANdh/Acdh、ANdb/Acdb、ANht/Acht、ANrf/ACrf/ACrg、ANdo、ANfl/ACfl及w3a覆盖。

状态：实现接入；只做开发必需Win32 Release产品编译、差异和源字段/消费者审查。新增玩法、原版精度、完整UI/GPU/AI/声音和性能未验收；不执行每技能专项/全库测试。来源、构建日志与产品摘要位于tmp/docs-artifacts/war3/neutral-heroes/。

集中验证云雾弹道/范围/命中/失误/移速与火焰扇域/总伤害/点燃，醉拳暴击/闪避/装备与法球、嚎叫实际减攻/时限/互斥，火焰雨波次/建筑/友伤/残留与刷新时钟，末日目标/禁法/库存/永久不可驱散/持续伤害和真实死亡/尸体消费/守卫/时限/召唤事件，叉状闪电原主次目标/扇域/并列/三光束；共用生命/归属/移除/暂停/运输/变身/重生/同步复活及事件重入，三图长局/资源释放/内存/无解包增长/原版操作与GPU/声音。

末日源DataD隐含等级、通用伤害/免疫/护盾、光束择取优先级、嚎叫Roar互斥/驱散与完整自定义字段、燃烧倍率/叠加、完整音效/技能AI待继续实现或对照，详见[中立英雄](neutral-heroes.md)。旧MEngine验证队列保持原状态。

## 兽王召唤、惊吓兽群与闪电攻击阶段待验证

路径：session_spell_info/area_spells/summons、共享学习/原订单/单位与生命周期、Afzy无目标狂热及自动施法、session_stampede/stampede空间索引/扫掠/爆炸/Channel、动画循环与特效兜底、passive_info/projectiles/session_lightning_attack/lightning真实第一武器和定时光束。消费ANsg/ANsq/ANsw/ANst/Arsq/Arsp、Afzy、Alit及w3a派生。

实现接入；本次只执行开发必需Win32 Release产品编译和差异检查。源参数/MDX序列、原行、读取脚本、构建日志及产品摘要位于tmp/docs-artifacts/war3/beastmaster/。玩法、画面和原版一致性保持待验收，没有执行专项/三图/GPU/性能回归。

阶段合并：三等级真实召唤与技能、原学习/按钮/订单/热键/自动开关/交战恢复、费用/冷却/寿命/事件/人口与落点；熊重击/闪烁、豪猪狂热与飞鹰真视/隐形/弹道；兽群速率/空间扫掠/碰撞/0.2秒延迟范围伤害、生命/归属/暂停/取消/重生/移除及事件重入；可破坏物无敌切换/死亡/重建与网格释放；即时和实际弹道伤害、独立光束延迟/寿命/高度/死亡轮次、法球/第二武器/闪避/护盾；源模型/循环/音效/离屏和无渲染清理、高密度性能、三图持续对战/切换与无解包增长。原版兽群生成域/随机/相位、闪电优先级、完整声音/AI仍待完成或对照。详情见[兽王与闪电攻击](beastmaster.md)，旧MEngine队列保持原状态。

## 霜冻箭、黑暗箭与沉默阶段待验证

路径：session_arrow_status、攻击修饰/发射等级快照、命中前标记/命中后状态、普通死亡/尸体消费/原玩家召唤、独立Silence状态/武器和施法/原UI、库存点物品/支付/事件，及共享伤害事件死亡轮次隔离。消费AHca/ANfa/ACcw、ANba/ACbk、直接ANbs和ANsi/ACsi/AIse。

必要Win32 Release产品编译无警告、差异检查和源字段/枚举核对通过；没有执行新增专项、原件指令、三图、窗口/GPU或性能回归。日志、source.json/原行、提取脚本及产品receipt位于tmp/docs-artifacts/war3/dark-arrows-silence/。实现接入，运行及原版一致性未验收。

阶段集中操作与范围：

- 原图招募黑暗游侠/娜迦海巫，学习黑暗之箭/沉默/霜冻之箭；核对原按钮、热键、单次/自动和coldarrowstarg/coldarrows/uncoldarrows、blackarrow/on/off、silence订单、魔法/冷却/前置/禁用、空地与原掩码。
- 普通/英雄/建筑/机械/无敌/魔免/虚无/幻象/闪避/护盾/零伤害、发射支付与取消前摇、在途增删/升级/变身/装备转移；霜冻普通/英雄时限、0英雄时限、实际移动/攻速、驱散/刷新和多来源。DataD完整跨法球叠加及Bcsd/Bcsi仍待实现/原件对照。
- 黑箭第一次致死、有效标记中由其他人击杀/脚本死亡、标记超时/驱散/来源死亡或移除/归属变化、源等级与奴仆数量/类型/80秒BNdm、英雄不转换、尸体消费/其他尸体玩法及真实人口/武器/事件；原版死亡/经验/召唤/衰败顺序待对照。
- 伤害/死亡/召唤/人口/取消事件中的移除、变蛋、重生、同步复活、新订单和再施加状态；旧伤害不扣新生命、旧标记/减速不跨死亡轮次，原来源为空时的事件上下文和多玩家归属。
- 标准沉默掩码8的主动/自动施法/持续施法、技能增删/解除/到期、允许普通移动/攻击/库存、现有攻击修饰与开关；自定义Melee/Ranged、失误/移动/攻速字段和在途攻击。Special位4当前明确失败，留后续实现。
- ssil/AIse原库存点输入/单位坐标/六槽脚本订单、接近/超距/取消/权限/无限与有限次数/公共冷却/使用事件、沉默中物品施放、目标圈/头顶/区域模型及完整声音/UI/GPU；直接ANbs被动能力与库存增减，经典AIob外壳仍待完成。
- 灼热箭/毁灭之球、普通武器、尸体和已接入施法/物品的受影响回归，三图长局/完整AI、原版分类/公式、性能/内存/切图释放及无派生磁盘增长。具体当前行为与缺口见[箭矢与沉默](dark-arrows-silence.md)，旧MEngine队列保持原状态。

## 灼热之箭、侦察与复仇之魂阶段待验证

路径：spell_info/spells/attackEnhancement/orb_attacks、真实攻击/武器快照，summons、cappedCorpseSummon/原按钮与自动开关、单位默认自动/真实视野侦测、死亡/移除/时限及召唤事件轮次。消费AHfa/ACsa、AEst、AEsv/Avng及w3a/单位覆盖。

必要Win32 Release产品编译无警告，差异审查及源能力/元数据/单位字段核对通过；没有运行新增专项、三图、原件指令、窗口/GPU或性能回归。日志、source.json/原行与产品receipt位于tmp/docs-artifacts/war3/night-elf-heroes/。实现接入，运行及原版一致性未验收。

阶段集中操作与范围：

- 选原图使用月之女祭司和守望者，学习灼热之箭/侦察/复仇之魂；核对原学习/按钮/位置/热键及费用/冷却/前置/禁用。脚本flamingarrowstarg、flamingarrows/unflamingarrows、scout、spiritofvengeance和vengeance/on/off/instant进入实际消费者。
- 灼热之箭10/20/30奖励、8MP、1500弹速与目标掩码；单次/自动/缺蓝/追击/取消前摇/命中、装备/科技/暴击/吸血/法球叠加、建筑/飞行/护甲/魔免/虚无/闪避/无敌/致死事件、在途增删/升级/形态及投射物快照。
- 猫头鹰nowl/now2/now3的60/90/120秒、飞行/高度/移动、1000/1500/2200昼夜视野和Adtg的900范围/掩码3，实际隐形/地下/共享视野与迷雾；无敌/魔免、暂停/到期/替换/移除/切图和完整出生/模型/声音/UI/GPU。
- AEsv真实espv和180秒/替换、原1200生命/400MP/武器/魔免、默认Avng自动与源开关；尸体独占/空间/费用/冷却、每次1个/最多6个even/50秒/无敌、天神普通死亡/到期/移除的连带、名额和索引回收。
- 共享SpiritWolf/普通召唤/亡者复生/腐尸甲虫的受影响回归；召唤/死亡/人口等回调中的删除/归属变化/新订单/变蛋/重生/同步复活、不同来源/多个施法者/派生等级、依赖召唤物自定义重生/转让、Raiu计数类型和全部原件顺序。
- Asp1原球体、Arsk完整抗性、出生弹道/过渡、AI主动策略及完整音效仍待完成；三图长局、窗口/GPU、原版数值时序/操作、高密度性能/内存/持续切图与无派生资产增长统一在功能阶段执行。来源及边界见[暗夜英雄补齐](night-elf-heroes.md)，旧MEngine队列保持原状态。

## 穿刺与蝗虫群阶段待验证

路径：session_impale/session_locust/swarm、原型/源命令/SpellWave、Impale状态/时钟/落地伤害、角色源模型承载、真实单位/武器弹道/伤害回流、Aloc目标与选择/小地图边界、会话/成员移除及共享多附件读取。消费AUim/ACmp、AUls/AOls和地图覆盖。

必要Win32 Release产品编译无警告、差异审查通过，并读取两份源MDX的附件记录；玩法、原版对照、三图、窗口/GPU和性能均待阶段执行。必要编译日志、source.json、提取脚本与产品receipt位于tmp/docs-artifacts/war3/impale-locust/。实现接入，运行和原版一致性未验收。

阶段合并以下实际操作与范围：

- 选原地图，亡灵训练地穴领主并学习穿刺/蝗虫群；核对原按钮/位置/热键、单位及地面订单、魔法/冷却/取消。脚本原impale/locustswarm订单及creep/洛克汗派生走同一消费者。
- 穿刺各级/覆盖、0.3秒600距离/宽度/碰撞边缘/无重复、50/80/110伤害、1秒空中及普通/英雄后续眩晕、零伤害/零空中时限。对照原件核定伤害时刻、总控制时长和各阶段目标/无敌/免疫/驱散/叠加语义。
- ImpaleHitTarget原Sprite First附件/按源时限播放、地刺间距/方向、头顶状态、暂停/直接删除/死亡/重生/变蛋/同步复活/伤害与取消回调、落地清理。共享Cyclone承载与BUts四编号挂点、单模型多附件及其他原技能附件纳入受影响回归。
- 蝗虫20只/每0.2秒释放、单目标最多7只、30秒800范围；AOls二级35只/每目标12只及建筑目标，w3a数量/单位类型/目标覆盖。检查原400速度/150高度/13–14伤害/1秒间隔和真实弹道、闪避/护盾/护甲/魔免/虚无/致死伤害后实际回流。
- 数据D/E的返还公式/携带上限、真实飞行返航/接触回血/多次出击/移动施法者/到期返航、无目标盘旋/单只删除/每目标分配更新；原版RNG、轨迹、攻击前摇和尾段精度待对照。
- Aloc与蜂群成员鼠标/框选/脚本选择/小地图/受击排除、原模型持续绘制、脚本单位枚举及其他Aloc特殊行为；施法者换单/暂停/运输/变形/能力增删/归属变化/死亡重启/移除/重施放和所有事件重入。
- 三图长局、完整UI/GPU/音效/AI、高密度群体的帧耗时/内存、持续切图/成员与归档释放/无派生磁盘增长。来源、当前算法和限制见[穿刺与蝗虫](impale-locust.md)。旧MEngine队列保持原状态。

## 腐尸甲虫与尖刺外壳阶段待验证

路径：session_crypt_lord、spell_info/corpse_spells、原按钮/自动开关/订单、passive_info/auras、普通伤害/武器命中和死亡/移除流程。消费AUcb、AUts/ANth/ANt2与w3a派生。原DataC类型字段按字符串读取，原Profile命令映射到已核对注册。

必要Win32 Release产品编译和差异检查通过；没有运行新增专项、三图、原件指令、窗口/GPU或性能回归。实现接入，运行及原版一致性待阶段验证。证据位于tmp/docs-artifacts/war3/carrion-spiked/implementation-build.log、source.json和implementation-receipt.json。

阶段集中执行：

- AUcb全等级/源学习按钮/原热键/手动与即时订单/右键自动、6秒冷却/30MP/前置/禁用、空闲与战斗订单恢复、超距/取消/无尸体及无空间；不得错误扣费或消耗尸体。
- 真实尸体竞争/运输/保鲜/食尸/亡者复生、双类型数量和地图覆盖、上限5/死亡补员/升级保留/多施法者、归属转换/复活重生/移除、源零时限和自定义正时限、DataF死亡连带与召唤事件重入。
- AUts/ANth/ANt2的3/5/7防御和15/25/35%返还、DataB自定义承伤、装备/科技/光环/形态叠加、伤害基数/分类与减伤精度；普通近战/远程/溅射/零伤害/闪避/魔免/虚无/护盾/幻象、致死反伤及伤害回调删除/转让/变蛋/重生/同步复活。
- 原四处附件/图标/自动指示器、技能增删/等级/变羊/隐藏/运输/死亡/移除、完整声音/UI/GPU/AI，以及三图长局、高密度性能/内存/切图释放/无解包增长。当前算法及精度边界见[甲虫与外壳](carrion-spiked.md)，旧MEngine队列保持原状态。

## 霜冻护甲、暗影突袭与透视阶段待验证

路径：session_frost_poison、源原型/caster消费者、UnitBuff/时钟/队列、普通命中/死亡轮次、自动选择与原开关、RevealArea/效果寿命及game_view小地图。消费AUfa/AUfu/ACfa/ACf2/ACfu、AEsh/ACss及AOfs和地图覆盖。

必要Win32 Release产品编译无警告、差异检查通过；独立只读审核指出的排队毒伤跨死亡轮次边界已增加复查，运行复现留本阶段。未运行新专项、三图、原件指令、GPU或性能回归；实现接入，运行及原版一致性待阶段验证。证据为tmp/docs-artifacts/war3/frost-poison-farsight/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并全级/覆盖/原学习按钮/费用/冷却/原开关，护甲45秒与受寒5秒/英雄时限、实际防御/原比例/驱散/叠加、命中快照/近战远程/闪避/0伤害/致死/重入/攻击者新生命，自动威胁/阈值/排序/范围/订单恢复；暗影突袭1200弹道、75初伤/每3秒10的一级代表值、英雄时限/15.1秒尾段、移动/攻击衰退/再施放/多源/驱散/魔免/虚无/护盾/分类、同帧多毒/Roots致死变蛋或同步复活；透视全级范围/侦测掩码/迷雾/隐形地下/联盟共享、小地图选点/超距/区域重叠/到期/原Xbdt模型和释放。完整音效/状态图标/附件/窗口/GPU/AI、原版公式/时序与三图长局/性能/内存/切图仍在集中队列，来源及当前算法见[护甲、中毒与透视](frost-poison-farsight.md)。旧MEngine队列保持原状态。

## 凤凰火焰阶段待验证

路径：phoenix_fire/session_phoenix_fire、passive_info/SpellMissile消费、装备/能力/库存/类型注册、单位创建/死亡轮次与移除、tick及原图标/模型。消费Apxf及派生参数，源0.5秒/600范围、20初伤/每秒2、10秒与英雄7秒。

必要Win32 Release产品编译无警告、差异检查通过；独立只读审核识别的命中后死亡重启边界已加死亡轮次复查，运行复现留本阶段。未运行新专项、三图、原件指令、GPU或性能回归；实现接入，运行和原版一致性待验证，证据为tmp/docs-artifacts/war3/phoenix-fire/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并原被动图标/说明、能力/库存/权限/等级/科技/类型增减和自定义覆盖、变蛋停火/孵化恢复、源计时/暂停/隐藏/变形/死亡与幻象、可见敌方地面/空中/范围/碰撞/类别/免疫、目标随机和RNG消费/在途保留/已有燃烧/叠加、真实弹道/初伤/按秒及尾段燃烧/英雄时限/伤害分类/护盾/虚无/减伤、死亡变蛋/重生/同步复活轮次、伤害回调删除/转让/重入替换、来源删除和切图、声音/UI/GPU/AI、三图长局与高密度性能/内存/无派生磁盘增长。具体算法与原版精度边界见[凤凰火焰](phoenix-fire.md)，旧MEngine队列保持原状态。

## 重生与凤凰生命周期阶段待验证

路径：rebirth/session_rebirth、UnitState与passive_info、unitLife/food/corpses/revival、统一创建/添加能力、AI复活、spell_info/area_spells/tick和game_commands被动冷却。消费AOre/ACrn/派生、AIrc/ankh、AHpx和Aphx及地图覆盖。

必要Win32 Release产品编译无警告、差异检查通过；独立只读生命周期审核未发现可证实问题，未运行新专项、三图、原件指令、GPU或性能回归。实现接入，原版死亡事件/统计和运行一致性待阶段验证；证据为tmp/docs-artifacts/war3/rebirth-phoenix/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并学习/被动冷却/自定义等级/优先级、致死伤害与KillUnit/直接生命、冷却与Ankh次数/最后删除/使用事件重入、7秒恢复/生命和魔法-1/完整容量、英雄成长/库存/句柄/人口/归属/暂停/移除/直接设置生命/ReviveHero、死亡/英雄可复活/经验/击杀统计/掉落原版顺序、食尸/复活/占尸/衰减与祭坛/AI隔离；凤凰源召唤/替换/召唤事件、负恢复及普通伤害耗尽/同句柄变蛋、直接创建蛋/蛋受伤和击杀/10秒孵化/合法落点/地面飞行/占地/视野/形态事件重入、特殊类型/运输/爆炸/幻象/定时生命及长期反复循环。Apxf已进入凤凰火焰独立阶段队列；全部变形旗帜/高度和出生过渡/进度指示/音效/窗口/GPU/AI以及三图长局/性能/资源释放继续后续实现或验收，边界见[重生与凤凰](rebirth-phoenix.md)。旧MEngine队列保持原状态。

## 剑刃风暴、地震与巫毒阶段待验证

路径：session_hero_ultimates、spell_info/spells/area_spells/channels、CastOrder标记及UnitBuff来源、entities序列/动作、ability_commands按钮、combat_orders/weapons禁攻、damage和tick。消费AOww、AOeq/SNeq、AOvd及地图覆盖。

必要Win32 Release产品编译无警告、差异检查通过，生命周期独立只读审核未发现可证实问题；没有执行新专项、三图、原件指令、GPU或性能回归。实现接入，运行及原版一致性待阶段验证；证据为tmp/docs-artifacts/war3/hero-ultimates/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并英雄学习/源按钮/快捷键/费用/冷却与地图覆盖、剑刃风暴7秒/尾帧/旋转/移动/追随/攻击移动/禁攻禁施法/物品、原伤害分类/英雄建筑与魔免/虚无/外壳/护盾、暂停/变形/运输/隐藏/能力增删/转让/死亡/复活；地震延迟/面积插值/建筑及树木碎片/单位减速、原关系与类别/友伤/魔免/周期；巫毒自身排除/其他施法者保护/进出范围/无敌与伤害、多个来源/票据/重施放/驱散/直接删除；两种Channel的控制/停止/替换/完成/删除/事件重入与附件清理。循环音效/全部模型尺度/状态图标/窗口/GPU/AI、三图长局与性能/内存/切图留阶段完成/验收；未列出的终极技能仍待实现，边界见[英雄终极技能](hero-ultimates.md)。旧MEngine队列保持原状态。

## 群体传送与传送物品阶段待验证

路径：session_teleport、spell_info/spells/area_spells/channels、CastOrder库存来源/支付、item_use/库存输入、game_view小地图目标和weapons保护。消费AHmt/AImt、AItp/stwp、AIrt/amrc与地图覆盖，保留源按钮/模型及六槽命令。

必要Win32 Release产品编译无警告、差异检查通过；未执行新专项、三图、GPU或性能回归。实现接入，运行和原版一致性待阶段验证；证据为tmp/docs-artifacts/war3/teleport/implementation-build.log及implementation-receipt.json。

阶段合并源等级/人数/延迟/冷却/聚集与地图覆盖，英雄学习/目标/库存六键及六槽脚本命令、单位/地点/小地图/主城定位、本人/盟友/中立/建筑/魔免/无敌/视野/特殊类别、消耗/公共冷却/最后删除/施法与使用事件重入、开始/支付/持续/停止/控制/死亡/移除/转让/能力变化/隐藏/暂停，源目标移动/死亡/失去联盟，传送与召回方向/人数/自身名额/距离/顺序、路线/战斗/工作/库存/人口保留、地形/空位/飞行分层/聚集/相对偏移/空间事件/占地/迷雾、回城无敌的开始结束及伤害/脚本组合、源附件/窗口/指示/音效/相机、AI和三图长局/性能/内存/切图。特殊权杖/复合物品等缺口与当前规则见[传送](teleport.md)，旧MEngine队列保持原状态。

## 恢复、保护、加速和驱散消耗品阶段待验证

路径：consumables/session_consumables、item_use目标/库存入口、UnitBuff/tick/附件、damageUnit最终伤害和moveUnits实际速度。消费AIrg/AIvu/AIsp/AIsa/AIha/AImr/AIra/AIdi及源别名与地图覆盖。

必要Win32 Release产品编译及差异检查通过；没有执行新专项、三图、GPU或性能回归。实现接入，运行与原版一致性待阶段验证，证据为tmp/docs-artifacts/war3/consumables/implementation-build.log。

阶段合并hslv/plcl/sreg/pnvu/pnvl/pspd/shas/shea/sman/sres/wneg/sneg/rdis及AP*符文、单位/地点/自身输入、源掩码/魔免/无敌/建筑/满资源标志、费用/共享冷却/次数/最后删除/拾取和使用事件重入、持续总量/英雄时限/暂停/受伤/零伤害/外壳/护盾/友伤/死亡/转让/驱散/替换、源buff及能力查询、加速/减速/光环/装备/形态/速度上限、范围驱散/召唤/幻象/空区域和符文自动生效。恢复与中断/叠加公式、所有物品/树木驱散/音效/AI、完整UI/GPU、三图长局/性能/内存/切图仍在阶段队列，见[消耗品](consumables.md)。旧MEngine队列保持原状态。

## 装备属性、永久物品与复合使用阶段待验证

路径：equipment/session_equipment、物品清单/主动选择/库存权限、拾取/交换/丢弃/移除/死亡、英雄查询/成长/学习、单位能力/科技/形态/幻象快照、武器/攻速/防御/减伤/吸血/移动/恢复/迷雾及原被动按钮。消费AIab/AIat/AIde/AIas/AIml/AImm/AIms/Arel/AIrm/AIsr/AIva/Amim/Ault及派生，永久AIam/AIim/AIsm/AIxm/AImi/AIem/AIlm与单主动+已支持被动的复合物品。

必要Win32 Release产品编译无警告，原表字段和差异检查通过；没有执行新专项、三图、GPU或性能回归。实现接入，运行和原版一致性均待阶段验证，日志为tmp/docs-artifacts/war3/equipment/implementation-build.log。

阶段合并各装备/副本/多个能力/来源/覆盖、增减与拾取/丢弃/使用事件重入、英雄基础/脚本奖金/装备/永久成长的隔离及查询、容量/资源比例/死亡、武器/光环/暴击/吸血/减伤、速度/负值/原叠加开关、恢复/昼夜/荒芜、魔免/夜视、形态/归属/科技/复活、幻象开关及原物品图标/HUD/完整窗口/GPU。gvsm主动控制+智力及书籍的资源/次数/冷却/等级/事件加入本阶段，完整物品/法球/火焰/AI/界面/原版精度/三图长局/性能/内存/切图继续对应队列。来源、当前算法与限制见[装备与永久物品](equipment.md)，旧MEngine队列保持原状态。

## 归属转换与占据阶段待验证

路径：session_ownership、共享SetUnitOwner/人口/科技/光环/视野/AI分组、源原型/目标/动态费用、独占声明/施法票据/保护/承伤/Channel、单位动作及原查询/按钮、item_use选敌/消耗。消费Apos/Aps2/ACps、ANch/ACch、Acmg、AIco/ccmd及w3a派生。

本轮只执行必要Win32 Release产品编译和差异审查，没有运行新专项、三图、GPU或性能回归；实现接入，运行和原版一致性均待阶段验证。证据为tmp/docs-artifacts/war3/control-ownership/implementation-build.log。

阶段合并源等级/目标/前置/费用、独占与保护/承伤/取消、共享native与真实捕获、全部来源/守卫/召唤/幻象、句柄/人口/预留/旧命令/库存/科技/光环/颜色/视野/AI、持续占据与女妖死亡/移除/选择、捕获/人口/死亡/施法事件的删除/再次转让/重入、物品三次/最后消耗/目标输入，以及运输/建筑/生产/复活组合、源附件/按钮/UI/声音/GPU与三图长局/性能/内存/切图。控制费用和Bcmg/寿命语义仍需原件核对，旧式占据弹道、复合物品gvsm已接入装备阶段队列，黑暗转换/灵魂流程待实现。来源、当前公式与具体边界见[控制权转换](ownership-spells.md)，旧MEngine队列保持原状态。

## 汲取、法力燃烧与牺牲阶段待验证

路径：session_resource_spells、原型/目标/施法/Channel/延迟载荷、CastOrder闪电及来源票据、共享伤害/虚无开关、buff奖励容量/衰减/释放、原按钮/附件及人口/尸体/死亡事件。消费AHdr/ANdr/ACdr/ACsm、AEmb及别名、AUdr/AUdp与w3a覆盖。

本轮只执行必要Win32 Release产品编译和差异审查，最终无警告；新增专项、三图、GPU和性能回归未运行。实现接入，运行和原版一致性均待阶段验证；证据为tmp/docs-artifacts/war3/drains/implementation-build.log。

阶段合并等级/覆盖/目标、费用/冷却/事件、逐周期资源守恒/回流/友军输送、超额上限/衰减/容量及查询、牺牲当前/最大生命与百分比/保留目标基准、死亡/人口/尸体/恢复和回调重入、烧蓝延迟/实际魔法/免疫/护盾组合、施法距离/断开距离/多人来源/驱散/隐形/运输/死亡移除/转让/能力增删/暂停，以及源图标/挂点/循环声音/窗口/GPU、AI和三图长局/性能/内存/释放。新公式尚需原件核对，物品AIdp目标流程已接入、交互与次数/冷却待测，完整AI/音效仍待实现；边界及入口见[汲取与牺牲](drains-sacrifices.md)，旧MEngine队列保持原状态。

## 自身强化与防御阶段待验证

路径：session_self_spells、源原型/施法/订单/事件/tick、UnitBuff/生命回收、共享伤害/固定攻击载荷/真实弹道、能力查询/移除、源按钮/工具提示/模型序列及item_use。消费AHav/Absk/Adef/AHds/AEim/ANms及派生w3a；物品AHds/Absk共用真实效果。

本轮只做必要Win32 Release产品编译和差异审查，不运行新增专项、三图、原件精度、GPU或性能回归。新玩法实现已接入，运行与原版一致性保持待验证；证据为tmp/docs-artifacts/war3/self-abilities/implementation-build.log。

阶段合并源等级/覆盖/费用/缓冲/开关冷却、事件和回调重入、行进/攻击中即时开关、额外生命与英雄成长/变身/死亡/复活、能力增删/转让/禁用、无敌/魔免与各种武器/脚本伤害、狂暴承伤/攻速/移速、反弹/减伤/输出、献祭周期/类别/范围/耗蓝/暂停/运输、护盾部分吸收/缺蓝/外壳组合，以及物品次数/冷却/事件。完整音效/模型/附件/按钮/窗口/GPU、AI、三图长局/性能/内存/切图仍在阶段队列；普通missile以外反弹及连续反弹规则待完成或核对。操作入口与来源见[自身强化与防御](self-abilities.md)，旧MEngine队列保持原状态。

## 吞树与毁灭者消费能力阶段待验证

路径：session_eat_tree/magic_consumption/orb_attacks、原型/施法/目标/事件/tick、树木占用/生命/路径、buff/源恢复/回流弹道、普通攻击/前摇/支付/CombatProjectile、原按钮/排序/占位/自动开关、游戏树木选择/携树挂点及consumption消费者。消费Aeat/Advm/Aabs/Afak、原订单、撕裂/吞食/恢复、驱散/友军开关/收益、资源扣除/上限和源法球范围。

必要Release产品/新消费者编译无诊断，差异检查通过；eat/devour/absorb/orb四模式最终4通过/0失败、无Game.dll。覆盖真实树木/占用取消/挂点状态/延迟恢复，驱散/友军正面例外/召唤伤害/回流与空区域，本人目标/扣除与上限，实际法球攻击/手动与自动/一次支付/快照/比例/友军排除/空魔法回退和按钮不重叠。仅重测夹具前置失败及本批变更影响的模式；没有运行旧全套/三图/GPU/性能。来源、命令及限制见[消费能力](consumption.md)，证据为tmp/docs-artifacts/war3/eat-magic/。

阶段合并全部等级/w3a/字段边界/buff与目标分类、树木竞争/取消/距离/暂停/死亡转让/移除/原生写入/回调重入，原件资源/恢复/回流/攻击时点/手动事件、法球阈值/取消/其他攻击效果/免疫/护盾/虚无/召唤与特殊范围，超过12指令/技能书/热键/提示文本/排序、原素材/动画/携树附件/声音/窗口/GPU、完整AI与三图长局/CPU/内存/切图释放。其他能力与完整客户端继续实现，原版一致性未验收；旧MEngine队列保持原状态。

## 古树扎根与拔根阶段待验证

路径：session_roots/原型/施法/tick、RootState/转换/初始化/占地、移动/追击/武器/伤害/查询、生产/研究/升级/资源返还/缠绕矿、原按钮/动态目标/建筑预览、Model序列和新roots消费者。消费Aro1/Aro2源掩码、2.5秒转换、转向/防御分类、root/unroot订单及原动画姿态。

必要Release产品/新消费者编译无诊断，差异检查通过；flow三组/models一组最终4通过/0失败、无Game.dll，覆盖真实WPM移动/占地/预留取消/原句柄/按钮与生产，守护者远近武器/防御伤害、生命之树缠绕矿释放/储量，以及原古树和雕像的CPU动画选择。命令/来源/限制见[古树扎根](ancient-roots.md)，证据为tmp/docs-artifacts/war3/ancient-roots/。

阶段合并全部古树/中立/w3a/武器/转向、原版建筑分类/碰撞/路线/角度/计时及生产限制、缺失WPM/边界/多人抢位/脚本移位/暂停/取消/死亡移除/转让/能力增删/回调重入、完整矿工返还/经济/AI，模型选择变化影响的所有原动作/模式/变体/过渡/挂点/音效/源按钮网格/GPU，以及三图长局/CPU/内存/切图释放。吞树已接入对应阶段队列，完整客户端继续实现，原版一致性未验收；旧MEngine队列保持原状态。

## 亡灵形态阶段待验证

路径：session_unit_forms/原型/施法/tick、UnitState/类型初始化/生命魔法/人口费用、visibility/detection/regeneration、原按钮/模型序列与新undead_forms消费者/复制夹具。实际消费Aave/Astn/Abur及同原型覆盖、原订单/前置/造价差/额外人口、永久及即时转换、8额外恢复与钻地侦测位2。

必要Win32 Release产品/消费者编译无诊断，Python AST及差异检查通过；本批3组与共享框架受影响的熊/鸦/恶魔3组有限回归均通过/0失败，无Game.dll。证据为tmp/docs-artifacts/war3/advanced-forms/；来源、命令与边界见[亡灵形态](undead-forms.md)。没有运行三图/旧全套/完整GPU/性能。

阶段合并全部等级/w3a/标志组合/不同种类的付费转换、源计时/石像冷却/魔法及恢复精度、资源/人口/取消/转让/能力增删/死亡移除/脚本回调重入、WPM落地/半径/路径类型、隐形/侦测/控制/运输/复活组合、原模型/按钮/音效/窗口/GPU、AI与三图长局/CPU/内存/切图释放。吞树与毁灭者能力已接入对应阶段队列，完整客户端继续实现；原件RTTI/订单观察不作为完整行为验证，旧MEngine队列保持原状态。

## 单位变身阶段待验证

路径：session_unit_forms/原型/施法/事件/tick、UnitState/死亡移除/科技/人口、源命令/反向按钮/模型序列及附件、新unit_forms消费者/复制夹具与CMake。实际消费Abrf/Arav/AEme普通和交替类型、morphFlags、源魔法/冷却/时长、飞行高度/着陆延迟和500生命奖励。

必要Win32 Release产品/新消费者编译及差异/Python AST检查通过；最小流程最终3通过/0失败，无Game.dll，覆盖熊往返/比例/人口/无魔法免费返回、乌鸦起飞/高度/速度/落地，以及恶魔成长/库存/额外生命/到期/死亡恢复。源参数与复现命令见[单位变身](unit-forms.md)，原始记录为tmp/docs-artifacts/war3/unit-forms/。

阶段合并源等级/w3a/标志组合/永久与计时/科技和原生属性写入、取消/暂停/控制/所有权/死亡移除/回调重入、落地障碍/路径类型/脚本移位/运输、英雄复活/幻象/能力增删/脚本buff移除及完整叠加、原模型动画/附件/按钮/声音/GPU、AI与三图长局/性能/内存/切图释放。付费转换和亡灵变身已接入对应阶段队列，其他变身原型继续实现；原版公式/时序/还原度未验收，完整客户端与旧MEngine队列保持开放。

## 变形与飓风阶段待验证

路径：session_morph_spells/原型/控制/施法/动作/native、UnitBuff/MorphAppearance/原单位状态、伤害/驱散/库存/被动/光环/移动/采集建造生产、game_morph/GameView/game_effects原模型与命令/图标/选取/附件、CMake及新morph消费者/复制夹具。实际消费AOhx/Aply四类源形式/最大野怪等级/100速度、Acyc的cyc1/英雄普通时长、原Bcy2载体与Sprite First Ref。

必要Win32 Release产品/新消费者编译、Python AST及差异检查通过。morph/cyclone/models三组最小模式最终3通过/0失败、无Game.dll，覆盖原句柄/类型/库存/属性写入/移动/能力/光环与飞羊、真实无敌/气旋载体/驱散/真实w3a不可驱散覆盖/到期，7个代表形态和原旋风附件CPU轨迹。lifecycle仅编译、未执行；GPU未执行。来源、命令和证据见[变形与飓风](morph-cyclone.md)，原始记录为tmp/docs-artifacts/war3/morph-cyclone/。

阶段合并四类/候选/随机次序/野怪英雄/w3a、免疫/重叠/刷新/暂停/转让/死亡移除/施法者消失/原生属性/回调重入、完整库存/能力/运输/采集生产/光环/侦测组合、飓风分类与CycloneStasis/计时/落地/可驱散语义，原模型/选取/图标/附件/过渡/声音及三图长局/CPU/GPU/内存/切图释放。其余变身、能力/native、战役/存档回放/局域网和完整客户端继续实现；旧MEngine队列保持原状态。

## 控制技能阶段待验证

路径：session_control_spells/原型/施法/弹道/自动施放、UnitBuff/动作/移动/分类/native、伤害/恢复/武器/光环/高度表现、GameView/game_effects/原按钮与树木目标、CMake及新control消费者/复制夹具。实际消费Aens/Aweb/AUsl/Aprg/AHbn、原等级/前置/物理控制/落地/睡眠保护/暂停恢复/魔法损失/虚无系数及树木生命周期/事件。

必要Win32 Release产品/新消费者编译、Python AST/差异检查通过；flow/purge/lifecycle最小模式最终3通过/0失败、无Game.dll，覆盖网的地面武器/高度、睡眠保护与伤害唤醒、净化/虚无/召唤/树木/治疗、施法者移除/显式唤醒/零高度差恢复及原移动意图。夹具真实冷却/移动距离前置修正后只重测对应失败模式。autocast仅编译、未执行；已发射攻击保护边界经静态审查/必要编译，相关专项仍待执行。来源、命令、缺口与本地产物入口见[控制技能](control-spells.md)，证据为tmp/docs-artifacts/war3/control-spells/。

阶段合并w3a/等级/前置/免疫/联盟/物理网开关、重叠/暂停/驱散/死亡转让/移除/重入、网双重分类/原近战范围/净化档位与时序、睡眠/法术及物品恢复/虚无伤害/已有和反弹溅射攻击、树木可见性/取消/失败资源、原按钮/目标/动画/透明材质/声音、AI与三图长局/CPU/GPU/内存/切图释放。妖术/变羊/飓风进入对应阶段队列；中立夜间睡眠及完整原版规则继续实现；完整客户端与旧MEngine队列保持开放。

## 绞肉车尸体货舱与挖掘阶段待验证

路径：session_corpse_cargo/transport/corpses、UnitState/死亡恢复/移除、原型/被动/命令/自动施放/右键目标、game_transport/GameView原按钮/尸体肖像、CMake与新消费者/复制夹具。实际消费Sch2/Amtc的8格/0.5秒/区域范围、Amel/Amed原装卸流程和Aexh的15秒/ugho/5具上限及Ruex前置。

必要Win32 Release产品/消费者编译、Python AST/差异检查通过。cargo/exhume两组最小检查最终2通过/0失败、无Game.dll；首次exhume夹具超出单次60秒推进上限，拆分后同模式通过。旧decay夹具的91秒调用同步拆分，旧模式未重跑。lifecycle/autocast模式仅编译、未执行；来源/限制/命令见[尸体货舱](corpse-cargo.md)，证据为tmp/docs-artifacts/war3/corpse-cargo/。

阶段合并满舱/竞争/尸体类型/装载事件与回调重入、死亡移除/舱内复活/暂停/转让/能力覆盖增删/容量研究改变、自动收集/卸载取消/合法落点、与食尸/复生/复活组合，以及原按钮/肖像/动画/声音、AI、三图长局/CPU/GPU/内存/切图释放。源邻接开关订单、精确生成/卸载时序和完整原版行为待验；完整客户端及旧MEngine队列保持开放。

## 尸体、食尸与复活阶段待验证

路径：corpses/session_corpses/corpse_spells、UnitState/死亡/恢复/祭坛/自然移除/只读查询、spells/channel/自动施法/物品与powerup拾取、原按钮/死者点选/game_corpses、CMake、新corpse消费者与复制夹具。实际消费deathType/death及源衰败时长、CreateCorpse/UnitSuspendDecay/SetUnitExploded/GetDecayingUnit、食尸占用/回复、Arai骷髅、AHre原句柄复活、AUan定时单位、Aast恢复及复活物品。

必要Win32 Release产品/消费者编译、Python AST/差异检查通过。flow/freeze两组最小检查合计2通过/0失败、无Game.dll，覆盖占用/竞争/打断/回复、真实骷髅/原句柄人口复活，晚期暂停年龄/姿态及恢复。spirit/items/decay/autocast模式仅编译，进入阶段合并队列；先祖之魂/操纵死尸/符文与库存/自然衰败事件/英雄消散/完整自动施法没有运行通过结论。源字段/死亡枚举/native声明、原件摘要与有限类名观察位于tmp/docs-artifacts/war3/corpses/，入口见[尸体玩法](corpses.md)。

合并食尸完成/剩余量/暂停/驱散/死亡/所有权/回调重入、源等级/w3a/科技/魔法人口/目标优先级/资源拒绝、召唤与原句柄/库存/物品触发及衰败后查询、原画面/选择/动画/声音和三图长局/CPU/GPU/内存/切图释放；尸体运输/挖掘进入对应阶段队列；完整亡灵AI及完整客户端继续实现，原版公式/时序/事件/视觉精度保持待验收。

## 地洞驻军与吞噬阶段待验证

路径：session_orc_cargo/transport、原型/spells/命令/武器/研究/伤害/tick、UnitBuff/真实生命周期、game_transport/原按钮、CMake、新orc_cargo消费者与复制夹具。实际消费Abun/Abtl/Sbtl/Astd、Advc/Adev/ACdv、源UnitID/临时开关、矿内/外工人和返工、驻军武器、Bdig/Bdvv及实际消化/死亡/击杀者。

必要Win32 Release产品/新消费者编译、Python AST/差异检查通过。flow最小流程1组通过/0失败、无Game.dll，覆盖4格驻军/实际开火/Stand Down、吞噬目标拒绝/货舱/双标记/消化伤害/默认不可卸载/死亡清理与击杀者。矿内征召和隐式load增量未复用为运行通过；work/release/manual模式仅编译，进入阶段合并队列。证据为tmp/docs-artifacts/war3/orc-cargo/，来源与命令见[兽族货舱玩法](orc-cargo.md)。合并临时返工/矿内/混乱农民/并发/满舱、死亡移除/状态清理/暂停/恢复/转让/重入、原冷却/伤害/魔免/等级/w3a，以及窗口/源声音特效/肖像和三图长局/CPU/GPU/内存/切图释放；完整四族/战役AI、原版规则与精度仍开放。

## 单位运输阶段待验证

路径：transport/session_transport、entities/combat/script_state、spells/原订单/目标/命令/伤害/死亡移除/恢复/tick、game_transport/GameView原命令与乘员栏、CMake、新transport消费者及复制夹具。实际消费Sch3/Acar容量、UnitData.cargoSize、Aloa/Adro/Adri、load/smart/unload/unloadall/unloadallinstant、真实清单/隐藏/坐标/事件与逐员卸载。

必要Win32 Release产品/新消费者编译、Python AST/差异检查通过。flow最小流程1组通过/0失败，无Game.dll：1+1+2格装载/搭乘、真实事件/native、移动承载、舱内命令/伤害拒绝及单独/即时全部卸载。证据为tmp/docs-artifacts/war3/transport/，来源/命令见[运输流程](transport.md)。capacity/lifecycle/orders模式仅编译、留阶段执行；合并满舱/覆盖/禁用/队列取消、载具/乘员死亡移除/转让/重入/暂停、合法落点/阻挡/联盟/原声音、真实窗口/肖像/热键与三图长局/CPU/GPU/内存/切图释放。完整原版坠毁、海军路径/其他货舱/AI仍待实现；原件仅有RTTI及局部指令观察，不作为完整行为或精度验收。

## 风步、闪烁与镜像阶段待验证

路径：session_mobility/spells/visibility/效果/tick、combat/projectiles/真实伤害、illusion/entities、CMake、新mobility消费者。实际消费源AOwk/ANwk、AEbl/ANbl、AOmi、原订单/按钮/学习/魔法/冷却，风步攻击票据与伤害、有界合法瞬移和原两端特效、延迟镜像/替换/倍率/寿命/事件及重入边界。

必要Win32 Release产品/新消费者编译与差异检查通过；windwalk/blink/mirror三个专项模式尚未执行，直接进入阶段合并队列。证据位于tmp/docs-artifacts/war3/mobility/，来源和复现入口见[机动与镜像](mobility.md)。合并现有隐形/战斗/技能/物品/幻象消费者、源等级/w3a/暂停/死亡/所有权/取消/回调重入，闪烁障碍/边界/最小最大/失败，镜像成长/替换/真实窗口/声音特效，及三图长局/CPU/GPU/内存/切图释放；动态碰撞、精确伤害/时序/随机/视觉与完整原版仍待实现或验证。REA当前缺少可用深度后端，原表/既有消费者依据照常保留，没有以查询失败代替行为证据。

## 影遁、Ghost与主动显形阶段待验证

路径：session_stealth_reveal/visibility/fog/spells/passive/item_use/inventory/tick、entities/spells、GameView原命令/物品目标、CMake、新stealth消费者与生成器。真实消费昼夜/行动淡入、Ghost、临时范围/全图视野/侦测和随单位移动的多玩家显形状态；原crys无限使用、dust次数、点物品与小地图连接同一流程。

必要Win32 Release产品/消费者编译、Python AST及差异检查通过；flow最小流程最终1组通过/0失败、无Game.dll，覆盖昼夜影遁/移动与恢复、Ghost、水晶球目标/视野/侦测/无限使用/冷却与到期；首个夹具前置断言已按未探索遮罩语义修正后复测同流程；证据位于tmp/docs-artifacts/war3/stealth-reveal/，详见[影遁与主动显形](stealth-reveal.md)。dust/meld/tower模式保留阶段执行，合并原玩家共享/暂停/死亡转让/重入、可用性/覆盖/驱散、全图/地形迷雾、真实按钮/点选/取消/特效声音及三图长局/CPU/GPU/内存/切图释放。订单映射、淡入/行动/侦测边界和原版精度未验收；完整客户端及旧MEngine队列保持开放。

## 隐形、侦测与目标可见性阶段待验证

路径：session_visibility/fog/spells/caster/被动/物品/库存/生命周期/AI、状态/原native、攻击/目标、GameView/附件/选取/小地图、order_ids、CMake及visibility消费者/生成器。实际消费Aivs/AIvi/Apiv、真实视域源范围/类型、共享视野/侦测网格、玩家与AI查询、破隐/淡入/驱散与真实操作/画面可见性。

必要Win32 Release产品和新消费者编译通过，Python语法/差异/346项订单排序和唯一性检查通过。spell模式最小流程最终1组通过/0失败，覆盖真实施法与玩家/AI查询、不可攻击、侦测进出/同帧更新、共享/撤销、移动和攻击出手破隐，无Game.dll。检查发现JASS字符串attack缺少注册，已核对REA并补齐attack/smart，只复测同条流程。证据位于tmp/docs-artifacts/war3/invisibility/，详见[隐形与侦测](visibility.md)。

passive/potion模式已编译但未执行。阶段合并旧战斗/技能/物品/AI消费者，验证源等级/持续/淡入/w3a/英雄/被动物品、驱散/死亡/所有权/重入、检测类型/范围/可用性/多玩家/共享/地形迷雾、攻击/目标丢失/在途弹道/范围伤害、状态/选择/原图标/半透明材质/附件及三图长局/CPU/GPU/内存/切图释放。Ghost/Shadow Meld/主动显形增量见本页新增队列，风步增量见本页机动队列，潜地/完整UI声音仍待实现，原版破隐/淡入/侦测边界与计数/视觉精度未记为通过；完整客户端及旧MEngine队列保持开放。

## 建筑反召唤阶段待验证

路径：session_unsummon、Auns/spells/源命令、AI指令与GetBuilding、entities/队列/经济/矿井/战斗/修理/所有权/死亡/移除、Birth及进度界面、CMake、新unsummon消费者与夹具。实际消费源Auns、已有工人施法、持续生命消退/分批退款、实际队列/人口/矿井与生命周期。

必要Win32 Release产品及新消费者编译通过，Python AST/差异检查通过。只执行新资源/生命周期最小检查1组通过、0失败，覆盖源按钮/U键、远程订单、敌方/重复拒绝、持续消退/返款、工人死亡后继续、75金/25木、10人口供给释放、非采集统计及无Game.dll。证据位于tmp/docs-artifacts/war3/unsummon/，详见[反召唤](unsummon.md)。

ai/boundaries模式已编译但尚未执行。阶段合并原UnsummonAll/缺少工人/多建筑、暂停/转让/死亡/移除/回调重入、现有生产/研究/复活/升级返还、施工取消、受损/受攻/治疗/零速率/费用及w3a、覆盖矿储量/工人清退和资源返还、真实按钮/热键/原Birth/声音/特效，及三图长局/GPU/CPU/内存/切图释放。DataB原件调度、返还舍入/损伤公式、完整目标/范围/不可取消规则与死亡事件/消失方式保持原版精度待测，不关闭完整客户端及旧MEngine队列。

## 战役AI采集与部队阶段待验证

路径：ai/session_ai_armies/control/natives/economy/guards/lumber/session、CMake、新campaign消费者及夹具生成器。实际消费5个新增AI native、原CampaignAI开局、下一心跳配额保留/补足/下降/返还、互斥编组与后续自动补员、实际队长传送及已有单位的持续出击。原件位开关/慢速数值/分派入口已有REA依据，完整规则仍待对照。

必要Win32 Release产品及新消费者编译通过，差异/Python语法检查通过。仅原CampaignAI开局最小检查1项通过/0失败：4秒时1城镇/2常驻线程/6名采集工人/2项真实生产队列，无Game.dll。首次2秒观察未覆盖下一采集/生产心跳，消费者观察窗口调整为4秒；原始日志保留于tmp/docs-artifacts/war3/campaign-ai/，详见[战役AI](campaign-ai.md)。

armies/harvest专项尚未执行。阶段合并既有AI/守卫/采集/战斗消费者，验证编组开关/补员/暂停/施法/定时生命、传送/裁界/落点与队籍、出击数量/类型/阵营/目标失效、配额下降/跨镇/-1/资源返还/矿内/忙碌/所有权/回调重入、四族慢速采集/正常恢复，以及真实战役/三图长局/GPU/CPU/内存/切图释放。原版编组优先级/精确数值顺序/阵形/时序未记为通过；完整AI/战役及旧MEngine延期队列保持开放。

## 祭坛英雄复活阶段待验证

路径：session_revival及英雄/食物/死亡/移除/转让、production/commerce/订单/状态、GameData源取消控件/命令/输入/特效、AI旧英雄分派和SetNewHeroes、CMake及复活fixture/消费者。真实费用/时间/退款、同句柄成长/技能/库存、票据/事件/人口及AI/UI都有消费者。

开发必要产品/消费者编译通过。新机制最小生命周期最终4组通过/0失败：付费复活及原对象/源状态/事件，取消/祭坛移除退款，转让/脚本复活/getter隔离，以及AI禁止新增仍复活旧英雄/开启后真实付费训练。原始证据为tmp/docs-artifacts/war3/hero-revival/，详见[英雄复活](hero-revival.md)。没有运行旧全套、三图/全族完整回归、GPU、性能或原件差分。

酒馆/英雄令牌/完整尸体/声音/英雄栏继续实现；原版人口/数值舍入/事件时序/恢复组合、并发队列/前置/阻塞/暂停、死亡移除转让/回调重入、库存/技能、真实窗口/取消/热键/特效/三图长局及资源释放按阶段合并验证。完整英雄/客户端和旧MEngine队列保持开放。

## AI暂停、守卫与部队控制阶段待验证

路径：jass_threads/runtime所属VM与暂停排队、session_ai_control/guards及状态、单位/战斗返回、实际生产/采集/选址、CMake与新增AI控制fixture/消费者。新增5个common.j和9个common.ai入口连接实际状态；未知native继续明确失败。

必要Win32 Release产品/消费者编译通过。新增2项暂停调度和3组真实会话检查通过、0失败，覆盖两个AI独立推进、嵌套/回绕暂停、剩余等待/新线程/取消、岗位/定时生命保留/跨玩家清除，以及实际扣费补员队列。亡灵原AI由BootyBay原main启动并推进2秒通过：1城镇/1生产队列/2待建施工/5线程，无Game.dll。证据为tmp/docs-artifacts/war3/ai-control/；原件计数/判断/守卫位与native调用关系见[AI控制](ai-control.md)。

阶段合并原版暂停时机/等待计时、守卫初始登记/选择/补员完成/默认次数/追击/返回、句柄销毁/转让/回调重入、定时生命筛选与部队控制、三图长局/GPU/CPU/内存/切图释放。完整四族/战役/运输/变形/全部native仍待实现；本次没有全套或性能通过结论，旧MEngine延期状态保持。

## 原AI脚本与基础对局控制阶段待验证

路径：ai/session_ai/economy/natives、Runtime共享域/代码VM所属/继承边界、ExecuteFunc、源unitClasses及分类消费者、CMake和AI原图驱动。实际消费：每玩家私有源脚本/变量、公共句柄/调度、真实付费生产/研究/建造、城镇/矿井/采集、扩张/队长/英雄/敌情/盟友目标与命令FIFO。未知native继续明确失败。

必要产品/消费者编译通过；共享域修改后VM11项、会话5组通过、0失败。BootyBay原main真实电脑槽1启动human.ai并推进2秒通过：1城镇、5订单、2队列、3采集、2待建/施工、5线程，无Game.dll。首次-1采集参数阻塞和源分类大小写问题已修正，只复测同条开局。证据为tmp/docs-artifacts/war3/ai/，见[AI说明](ai.md)。

后续阶段合并完整四族/战役脚本、持续建造/科技/采集/人口/扩张、队长和英雄策略、跨VM事件/上下文/异常与取消、分类对修理/古树/目标/被动伤害的影响、三图长局/GPU/CPU/内存和原版精度。守卫/运输/暂停/变形/全部native仍待实现；本项只关闭开发最小阻塞，完整功能和旧MEngine队列保持开放。

## 脚本等待与协作线程阶段待验证

路径：jass_threads/runtime、session_threads/callbacks/tick、main/game_view与两个新消费者/fixture。实际消费：TriggerSleepAction、ExecuteFunc、独立trigger/timer、动作串/并行、TriggerExecuteWait、每线程预算/上下文、main等待状态及取消栈展开。

开发必要产品及消费者编译通过。VM最终10项通过：首次8通过/2失败；校正检查的实际Real时间边界后仅重跑失败2项，2通过/0失败，生产调度未改。真实会话5组通过/0失败；BootyBay原main和250ms集成退出0，main_completed=true、script_threads=0、bj_gameStarted=true，无Game.dll。证据为tmp/docs-artifacts/war3/script-threads/，详见[脚本线程](script-threads.md)。

原版最小等待/量化、getter跨wait、复杂重入/销毁/事件顺序、暂停/倍率、完整AI/Sound wait、LAN确定性、持续切图/CPU/内存保留阶段验证；本次未运行三图、GPU或性能，不关闭功能阶段和旧MEngine队列。

## 施法单位状态、驱散与自动施法阶段待验证

路径：spells/entities/session_spell_info/spells/caster_spells/autocast、实际状态/战斗/移动/伤害/恢复/缩放/驱散/能力筛选、源训练前置/学习/命令/原自动施法图标与PRE2界面模型、CMake及caster生成器/消费者、effects新增单资源模式。

实际消费：医疗/减速/心灵之火/嗜血/回春/邪恶狂热/诅咒/两种驱散/反魔法外壳十种原型，Aams完全魔免与Aam2吸收300，实际源数值/状态/生命周期/召唤/伤害/科技条件；六种自动施法的字符串/ID/默认开关、空间候选/排序、自然完成后的原命令恢复、右键/Art/Unart/说明与源四PRE2 UI指示器。现有33种主动/持续加14种光环/被动。必要产品及spell/channel/passive/caster/effects编译通过，Python AST与差异审查通过。仅执行新启动资源必要CPU导入，UI-ModalButtonOn四源发射器成功消费，无Game.dll/GPU。证据为tmp/docs-artifacts/war3/caster-spells/{source.json,autocast-model.json,autocast-import*.log,build-final.log,static-checks.json}。

专项行为程序尚未执行。阶段合并caster与已有技能/被动/战斗消费者，覆盖训练前置/升级/禁用、目标/资源/冷却/事件/重入、状态叠加/时序/恢复/取消、普通与英雄/魔免/无敌/结构/外壳完整分类/溢出/驱散、召唤/幻象与魔法损失、诅咒与暴击/弹跳/范围武器、六种自动施法阈值/优先/交战/范围/移动工作命令优先/恢复/取消、满级学习菜单、原图标/右键/粒子界面深度/缩放/混合/多实例、三图/持续切图/CPU/GPU/内存。当前默认/数值顺序/行为不记为原版精度结论；完整选项/非单位状态/状态栏/声音/控制与变形/技能AI仍待实现。详见[施法单位与自动施放](caster-spells.md)，旧MEngine队列继续延期。

## 光环、被动与实际战斗修正阶段待验证

路径：passives/session_passive_info/auras/attack_passives、单位/战斗/武器命中/伤害/恢复/移动/生命周期、能力学习/命令/预加载、真实buff查询/移除、库存被动来源、CMake及passive夹具/专项程序。

实际消费：七种英雄光环、命令/战鼓/治疗守卫，共十种光环；重击/致命一击/闪避/分裂四种攻击被动。空间刷新、当前同buff最强来源/源等级/残留、自定义/持有物品来源，真实移速/攻速/护甲/伤害/恢复/命中/眩晕/吸血/反伤/次级伤害、原被动学习/按钮/说明、共享GeneralAuraTarget、实际光环查询/移除/再应用及死亡/移除清理已接通。必要Win32 Release产品、spell/channel及新passive消费者编译通过，Python AST与差异审查通过；专项程序、模型导入和GPU没有执行。证据在tmp/docs-artifacts/war3/auras-passives/，包含源字段/标签、buff资料和build-final.log。

阶段合并passive_tests与原spell/channel/相关战斗消费者，覆盖最强/降级/范围/残留/等级/覆盖/所有权/幻象/暂停、百分比/原始数值/武器掩码、物品拾取/转移/丢弃/移除、buff分类/驱散/再应用、0/100%及实际随机、Critical/Bash/Evasion/Never Miss顺序、分裂几何/护甲/敌我、吸血/反伤/过量伤害/死亡重入、源视觉共享/退役、被动学习/快捷键/按钮与三图/冷施法/切图/CPU/GPU/内存。刷新间隔/默认2秒残留、跨原型叠加、完整目标/百分比基数/伤害顺序/原版随机/物理分类尚未证明一致。浮字、完整状态栏/声音/其他被动/光环/自动施放/AI继续实现。详见[光环与攻击被动](auras-passives.md)，旧MEngine队列继续延期。

## 持续施法、地面效果与Channel阶段待验证

路径：spells/session_spell_info/spells/channels、范围/伤害/生命/buff消费者、game_spells/commands/view/loading、CMake、新channel夹具与专项程序。

实际消费：暴风雪/烈焰风暴/宁静/群星坠落/死亡凋零及Channel六种原型，持续脉冲/目标关系/百分比/建筑系数/树木生命、独立地面延迟/全伤/余火、打断/完成/重入和源效果；Channel四种目标/基本订单/Visible/范围源图/禁其他技能/选择组与视觉刷新。当前共23种原型。必要Win32 Release产品、原spell及新channel消费者编译无诊断，生成器Python AST和差异审查通过。原始证据为tmp/docs-artifacts/war3/channels/{source.json,source-models.json,build-final.log}；没有执行专项行为或GPU检查。

阶段合并channel_tests与原spell消费者，验证波数/周期/上限/敌我/免疫/建筑/树木/恢复，停止/移动/攻击/眩晕/死亡/移除/转让/能力失效、EFFECT重入停止/FINISH暂停、烈焰风暴独立存续/总时长、Channel覆盖/四种目标/选项/群组/快捷键/范围图/取消，以及源模型导入/冷首次施法/GPU/三图/暂停/长帧/驱散/叠加/切图/内存/性能。目标默认、伤害分配、Art Duration、Physical/Universal及Unique Cast的完整原版语义仍待对照；声音/全部技能/被动/光环/AI继续实现。入口及限制见[持续施法](channels.md)，旧MEngine批次保持延期。

## 条带、闪电与共享高度阶段待验证

路径：model/data/particles的RIBB记录/实例/材质、effects/session_lightning及真实句柄/hashtable、链式技能、game_lightning/view的源纹理/分段/颜色/可见性、World高度表面/terrain_layout/GetLocationZ与扩展effects/spell消费者、固定来源摘要。

实际消费：条带源字段/轨道/采样/寿命/图集/材质，15种源LightningData、十个闪电native/typed storage与主次技能闪电，渲染/查询共享坡道高度。必要产品/扩展消费者编译通过，新增11个native声明核对通过。只执行新增源格式必要导入：三份RIBB模型（3/16/4发射器）、四种闪电配置/两份纹理，以及插值/坡道两组期望高度检查通过，无Game.dll/GPU；未重复旧PRE2检查。证据为tmp/docs-artifacts/war3/ribbons-lightning/{build-final.log,source-import.log,source-import-result.log,static-checks.json}。

扩展spell的闪电端点/字段/typed storage/颜色/移动/可见性/销毁断言尚未执行。阶段合并条带多实例/轨道/图集/材质/重力/停止排空/跨类型排序，闪电原纹理/宽度/分段/扰动/滚动/寿命/跟随、脚本颜色/移动/失效句柄/可见性，高度/坡道/悬崖/边界与三图/17技能画面、持续切图/内存/CPU/GPU。当前分段扰动、滚动及持续时间等使用仍需原件证据，不记为原版精度完成。PREM/事件型效果/子附件/完整声音继续实现，旧MEngine队列保持延期。详见[条带与闪电](ribbons-lightning.md)。

## 源粒子、脚本特效与技能画面阶段待验证

路径：model/model_data/model_pose/model_particles、模型实例与骨骼附件、effects/session_effects与真实句柄/hashtable、spell/buff视觉生命周期、game_effects/view/scene_objects及后台模型准备、effect/扩展spell消费者，固定上游来源摘要及许可说明。

实际消费：PRE2字段/轨道/纯粒子、分实例发射/寿命/颜色/图集/过滤/头尾、ATTACH名字/变换/可见性；四个effect native、Caster/Target/EffectArt和buff挂点、法术MissileArt/弧度/时间/高度及波形模型，DestroyEffect/驱散/到期的销毁/排空。必要产品和两项专项程序编译通过，四个新增native签名核对通过。为接通此前被拒绝的纯粒子路径，仅执行两份纯PRE2和一份混合源模型CPU导入，3通过/0失败，无Game.dll；GPU未执行。证据在tmp/docs-artifacts/war3/effects/{build-final.log,source-import.log,source-import-result.log,static-checks.json}。

阶段合并squirt/轨道/头尾/模型空间/图集/过滤/尺寸/排序、共享模型多实例隔离、挂点/可见性/缩放、立即销毁/Death/粒子排空、buff刷新/驱散/死亡、冷首次施法/后台上传、视野/离屏重入/暂停/长帧、17技能和三图画面/切图/CPU/GPU/内存。扩展spell effect状态/typed storage/退休断言尚未执行。PREM/RIBB/闪电/事件型效果/子附件/完整灯光/环境雾/替换纹理/声音继续实现，当前原版精度未验收。详见[源粒子与特效实例](effects.md)，旧MEngine队列保持延期。

## 点目标、范围技能与召唤阶段待验证

路径：spell_info/spells/area_spells/summons、单位召唤归属、状态/弹道/生命/树木消费者、字符串及ID订单、game_commands/view与扩展spell夹具。

实际消费：点/无目标施法与输入；十种原型的范围伤害/状态、波形扫掠/上限、刀阵单独飞行，以及水元素/狼魂/蛇棒/地狱火/树人的源类型/数量、放置、SUMMON上下文、重召替换、落地延迟、树木死亡/解阻挡和定时生命。必要产品/扩展消费者编译通过；源数据/订单及Python语法/差异检查通过。REA复核四个原订单注册入口。证据在tmp/docs-artifacts/war3/area-spells/，专项程序尚未执行。

阶段合并点/无目标字符串/ID/Loc命令、类型/坐标事件、范围敌我/英雄持续时间、波形扫掠/边缘/目标排序/上限、刀阵数量/分配/速度、召唤数量/类型/落点/替换/归属/事件/重入/死亡、地狱火延迟/buff、树木选择/取消/阻塞，及真实输入/图标/模态窗口/三图/持续切图/性能。完整技能/通道/AI、源特效/粒子/声音继续实现；规则精度仍需原版对照，不能把当前分配/排序视为原件结论。入口和限制见[范围与召唤](area-spells.md)。旧MEngine队列保持延期。

## 英雄学习、主动技能与状态阶段待验证

路径：spells、session_spells/spell_effects/spell_natives/ability_commands、order_ids及生成器，单位/能力句柄与hashtable、命令/移动/战斗/采集/施工/生命周期，game_commands/view/loading、spell消费者与隔离夹具。

实际消费：原学习命令/能力数据/图标/坐标/热键、目标订单、接近/前后摇/扣蓝/冷却、单位/玩家施法事件和真实能力上下文；七种代表能力的治疗/伤害/飞行/链式选择、眩晕/缠绕/霜冻及实际查询/驱散。必要Win32 Release产品和war3_spell_tests编译通过；16项新增native签名、生成器语法、344条订单表重建和差异检查通过。原始证据为tmp/docs-artifacts/war3/spells/。专项行为程序未执行，不记录为运行通过。

阶段合并学习点/等级/覆盖、目标/射程/魔法/冷却、前后摇/取消、上下文/重入/移除/转让、弹道与多目标/衰减、英雄状态时间/暂停/驱散、工作/战斗交互、真实鼠标/热键/Esc/模态窗口、三图及持续切图/内存。全部技能/被动/光环/持续施法、源粒子/音效/弹道画面、完整免疫/反弹与原件精确时序仍待实现或对照。入口和边界见[英雄主动技能](spells.md)。保持先集中实现再阶段验证，旧MEngine队列继续延期。

## 对局结束、原菜单与脚本对话框阶段待验证

路径：game_state、session_match/script_dialogs、session/object_data、玩家/单位统计消费者、game_flow_ui/view、main重开/退出路由、音频时长与专项目标/隔离夹具。

实际消费：原Blizzard.j胜负判断、玩家结果/事件、Dialog/按钮/失败条件与真实句柄、原FDF菜单/对话框/结算模型、暂停/输入/UI/选择、继续/退出/同图重开、单位/英雄/资源观测计数。必要产品及消费者编译通过，26个字面量native声明及生成器语法检查通过。BootyBay原main与2,100ms开发最小推进退出0，实际2.09375秒、bj_gameStarted=true，玩家0胜利/1对话框/2按钮、无Game.dll。源QuestCompleted.wav有效PCM时长5,155ms和截断拒绝的最小检查通过。证据：tmp/docs-artifacts/war3/game-flow/{build-final.log,consumer-final-build.log,bootybay-before.log,bootybay-after.log,victory-wave-before.log,victory-wave.log}。

完整game_flow消费者未执行。阶段合并对话框句柄/事件/重入/多玩家/快捷键、原BJ结局与离开、类型计数/科技等价、暂停/音频逻辑/输入控制、Esc菜单/确认/重开、结算模型/页签/值及切图释放；三图完整流程、GPU/原版布局/实际操作和性能继续排队。完整总分与所有分项、选项、存档/载入、回放、战役跨关、LAN/断线及作弊状态仍待实现。命令、原件入口与限制见[对局流程](game-flow.md)，旧MEngine队列保持延期。

## 基地升级、修理与荒芜能力阶段待验证

路径：session_building_upgrades、session_repair、session_blight_growth，单位类型初始化、升级/修理状态、生命周期/人口/科技/训练/命令、game_commands/view与construction消费者/夹具。

实际消费：源Upgrade与累计造价差、句柄不变的类型/模型/属性/生产清单更新、进度/取消/事件/人口/科技等价；源修理目标/扣费/生命/自动施放、人族协作进度/费用；源荒芜扩张/驱散及World路径与渲染脏区域。必要Win32 Release产品/扩展消费者编译无警告，生成器语法与新native声明核对通过；DotA原main/250ms最小检查退出0、123单位/3,871可破坏物、bj_gameStarted=true、无Game.dll。证据为tmp/docs-artifacts/war3/construction/development-{build,consumer-build,dota-250}.log。

专项行为尚未执行，扩展现有construction消费者，按阶段合并训练/科技/采集/战斗与三图输入，核对升级价格/前置/取消/人口/句柄/状态、修理付费/自动施放/目标/重入、协作进度和荒芜生长。完整原件生命/时间/退款/舍入、升级中间模型、桥/海军修复、自动选择、荒芜交叠/移动/能力增删、GPU/性能与连续切图仍待完成或验收。命令和边界见[基地发展](base-development.md)。保持待阶段验证，不关闭旧队列。

## 建造、放置与矿井转换阶段待验证

路径：session_construction/mines/footprints、commerce/entities/script_state/session、建筑生命周期/人口/命令/采集/战斗/视野/恢复消费者、world_path、game_building/commands/view/loading、CMake和construction专项消费者/隔离夹具。

实际消费：源Builds/B菜单/图标/热键、同源放置/模型预览、四族单工人施工/隐藏/释放/取消、施工进度/Birth、事件与人口、计数占地与更新、受诅咒/缠绕矿及共享金币。必要Win32 Release产品和新消费者编译通过，无编译警告；生成器语法与5个源native声明核对通过。DotA原main/首250ms模拟通过，123单位/3,871可破坏物、bj_gameStarted=true、无Game.dll；仅为占地接入初始化的开发检查。证据：tmp/docs-artifacts/war3/construction/{build-final.log,dota-250.log}。

generate-construction-fixture.py / war3_construction_tests 已加入，行为尚未执行。阶段合并harvest/destructable/research/commerce及受影响战斗场景，覆盖放置/到达/停工/恢复、取消/退款/事件、四族工人、人口/转让、死亡/移除/重入、占地变更、矿井关联/释放/耗尽、源B菜单/快捷键/预览/进度/GPU与三图实际对局。基础repair/人族协作/升级及荒芜能力已接入；完整变形/拔起、施法冷却/魔法/特效/声音和原件生命/退款/时序仍待完成或对照。命令和边界见[建造与矿井转换](construction.md)。本项保持待阶段验证，不触发旧全套或性能遍历。

## 可破坏物与基础伐木阶段待验证

路径：`placed_definition.*`、`session_destructables.cpp`、`session_lumber.cpp`、`world_path.cpp/world.h`、`session_harvest.cpp`、`session_production.cpp`、事件/计时器列表、`scene_objects.*`、`game_view.*`、Widget/目标/hashtable/名称消费、状态头、图像TGA入口与专项消费者/夹具生成器。

必要Win32 Release产品/war3_destructable_tests编译通过；DotA加载3,871个可破坏物、原main及250ms模拟退出0，bj_gameStarted=true、无Game.dll。证据 `tmp/docs-artifacts/war3/destructables/{build-final.log,dota-final-250.log}`。本次没有专项行为、GPU、帧耗时或三图全流程通过结论。

阶段执行 generate-destructable-fixture.py / war3_destructable_tests，核对重叠阻挡和WPM保留、死亡/恢复/移除、Widget回调重入、矩形枚举/过滤、句柄存储、当前路线遇新增阻挡、工人/食尸鬼木材返还、小精灵直接收入及自动换树。合并受影响harvest/research/commerce和真实地图输入，不重复无关旧引擎/全资产检查。路径旋转/窄口/无WPM、视线遮挡、桥/门/掉落、脚本创建/移除时的GPU资源、动画/声音、小精灵附着及原版数值/时序仍待实现或验收。命令见 [可破坏物与伐木](destructables.md)。本项保持待阶段验证。

## 基础经济阶段待验证

路径：`session_harvest.cpp`、`session_combat_orders.cpp`、`session_orders.cpp`、`session_tick.cpp`、`session_entities.cpp`、`session_food.cpp`、`session_fog.cpp`、`session_weapons.cpp`、`session_commerce.cpp`、`game_commands.cpp`、`game_view.*`、状态头及采金专项消费者/夹具生成器。

必要 Win32 Release 产品与 war3_harvest_tests 编译通过，无本项行为/GPU/性能通过结论。原能力属性与模型动作已读取，证据 `tmp/docs-artifacts/war3/economy/source-abilities.json`、`build.log`。没有重复三图、全资产或旧引擎测试。

待阶段执行 generate-harvest-fixture.py / war3_harvest_tests，检查携带/停止保留/返还与累计资源、矿内占用及容量、最后一包与耗尽、亡灵/精灵采金、暂停、矿/工人删除、命令/资源事件重入及画面。原版精确速率、维护费/税收、可达性/出入口、矿内UI、建造与缠绕转换/伐木的完整规则及原版一致性仍待实现或对照。命令见 [基础经济](economy.md)。本项保持待阶段验证。

## 科技研究阶段待验证

路径：`object_data.*`、`session_research.cpp`、`session_game.cpp`、`session_production.cpp`、`session_entities.cpp`、`session_commerce.cpp`、`session_weapons.cpp`、`session_combat*`、`session_projectiles.cpp`、`session_damage.cpp`、`session_regeneration.cpp`、`game_commands.cpp`、`game_view.cpp`、状态头文件及研究消费者/夹具生成器。

必要 Win32 Release 产品/commerce/research 目标编译通过。原件静态入口确认 Set 科技只补足等级，Add 只处理正增量；未执行数值精度夹具。DotA 原 main 和首250ms模拟退出0、bj_gameStarted=true、无Game.dll，证据 `tmp/docs-artifacts/war3/research/dota-final-250.log`。本次没有GUI、实际研究或对战通过结论。

待执行 `generate-research-fixture.py` + `war3_research_tests`，检查自定义升级/等级前置、命令模型、重复研究、队列扣费退款、事件重入、当前/新建单位消费、Set较小目标不降级；再合并受影响commerce/战斗/三图检查。风险包括所有权转移、科技等价和继承、技能依赖、弹道武器快照、生命/魔法变化精度以及升级 effects 的完整覆盖。命令见 [科技研究](research.md)。本项保持待阶段验证。

## 基础战斗阶段待验证

路径：`src/combat.h`、`session_combat*`、`session_weapons.cpp`、`session_projectiles.cpp`、`session_rewards.cpp`、`session_orders.cpp`、`session_tick.cpp`、`session_entities.cpp`、`session_callbacks.cpp`、`session_damage.cpp`、`game_view.*`、`game_loading.*`、`game_commands.cpp`。

待集中验证：近战/远程/溅射/弹射/穿透、目标筛选、伤害与护甲、攻击前摇及命令重入、停止/保持/跟随/拾取/巡逻、建筑和中立守卫、经验/掉落及死亡回调、HUD与弹道显示；对照原版进行三图持续对局、资源释放及性能检查。重点风险为事件分发扫描历史句柄、弹道寿命与发射者删除后的归因、目标关系和魔免分类、随机顺序、技能和死亡时序。

本次必要 Win32 Release 产品及 commerce 测试目标编译通过；DotA 原 main 和 250ms 模拟退出 0，`bj_gameStarted=true`，`game_dll_loaded=false`，记录为 `tmp/docs-artifacts/war3/combat-final-dota-250.log`。该检查只覆盖开局阻塞路径，战斗行为、GUI、性能及原版一致性均待验证。

## W001–W003 批次结果（2026-10-25）

源版本为 `d158fc1` 加本次菜单、设备和音频实现。Win32 Release 构建通过，13 项 CPU 检查通过、0 失败：地图覆盖与共享引用生命周期、纹理别名来源优先级、归档路径与失败挂载、palette 透明度、JPEG 四原始分量、JPEG 三原始分量、BC1/2/3 固定像素、TGA 方向/RLE、图像截断与预算、二进制记录边界、原版 FDF 模板与字符串、UTF-8/UTF-16 BOM、FDF include/继承循环边界。JPEG 常量参考图每通道误差不超过 2。证据为 `foundation-final-build.log`、`foundation-final-tests.log`。

Amazonia、BootyBay、DotA_v6.83d 的归档 probe 均退出 0，无 Game.dll。它们只读取归档成员，不执行地图 JASS、地形构建或对局，不能作为玩法和地图加载性能验收。证据为 `{amazonia,bootybay,dota}-probe.log`、`map-probes.json`。PE 检查为 0x14c x86，仅导入系统 DLL；原版 IJL/Miles 按摘要动态载入。

D3D9Ex HAL 与 reference 实际绘制通过；缩放、最小化恢复、Q 退出通过，最终 1264×921 帧与固定帧逐像素一致。证据为 `foundation-{fixed,window,reference}.{log,png}`、`foundation-runtime.json`。原版菜单读取 18 个 geoset、211 个 node、49 个 texture，解码纹理 11,292,672 字节。字体来自原版 `MasterFont=Fonts\dfst-m3u.ttf`，按钮模板、中文、位置和边框来自原版 FDF；完整视觉还原尚未通过。

Miles 运行状态为 `SMP_PLAYING=4`，采样位置由 12 推进至 1237ms；产品构造/析构探针退出 0，sample、driver、Miles 及 codec 均释放，无 Game.dll。证据为 `audio/music-product-probe.log`、`audio/probe-init1-redist1.log`。尚未对音效和听感作验收。

提交前补充修复按钮按下起点与捕获取消边界，只重建并复测受影响窗口路径，沿用未受影响的 13 项 CPU 结果。此次标准 D3D9 实际运行 92 帧后由 Q 退出，缩放、最小化恢复、从按钮外拖入、取消捕获均通过；未加载 Game.dll。最终帧与同版本固定帧均为 1264×921、逐像素一致，像素 SHA-256 为 `c8a9d3684ebb9b2eb1692c51f389959de33a37a86bfdb615d9b30a1f2d09ca6a`。证据为 `delivery-build.log`、`delivery-{fixed,window}.{log,png}`、`delivery-runtime.json`。

批次仅关闭已实现的基础设施范围。完整 UI、地图会话、音效、持续切图和性能保持 [功能矩阵](acceptance.md) 中的待实现/待验收状态；旧 MEngine 161–163 GPU 批次继续延期，旧转换缓存尚不满足清理条件。

## 复现命令

在 `watcher/war3` 执行：

```powershell
cmake --preset windows-x86 -DWAR3_BUILD_TESTS=ON
cmake --build --preset release --parallel 8
./build/windows-x86/bin/Release/war3_native_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/native-tests"
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --hidden --frames 120 --time-ms 0 --window-check --log "../../tmp/docs-artifacts/war3/delivery-window.log" --capture "../../tmp/docs-artifacts/war3/delivery-window.png"
```

CPU 测试只生成临时夹具 MPQ，游戏运行不生成解包资产。无输入或相关源码变化时不重复执行已通过的检查。

## 下一批队列

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W004 原生地图定义 | map.h/map.cpp、map_tests.cpp、CMake、map-loading.md | W3I18/25、WTS、W3E11、WPM0，代表地图与畸形输入；当前层地图目录排序 | 源记录边界、缺省编辑器尾表、地图间串资源、路径尺寸 | 基础范围通过，批次关闭 |
| W005 动态 FDF 控件与文本 | glue、media、fdf、player_setup_ui | 原版控件挂接、可见性、运行时文字/图像、文本尺寸、换行/颜色/裁剪、玩家草稿与弹层 | 控件名与锚点、长地图文字、D3D 状态恢复 | 基础绘制/交互通过，批次关闭；完整还原留在功能矩阵 |
| W006 单人模式与地图目录 | main、map_browser、platform、glue、renderer、CMake、setup | S/G/A/Escape 导航，任意 w3m/w3x，选择信息/预览、滚轮、目录与错误恢复、无解包 | 菜单资源不受地图覆盖、失效目录、重复切选释放、超长描述、设备创建回退 | 基础范围通过，批次关闭；实际开局待实现 |

W004 定向命令：`build/windows-x86/bin/Release/war3_map_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/map-tests>`。原版格式参考与来源见 `map-loading.md`；CPU 测试不表示原版地图会话已能运行。

本批达到三项，提交后先运行原生地图定向检查、受影响的 FDF 检查及 `--menu-check` 原版路径。导航检查使用实际窗口按键和地图行点击，要求进入选图、读取指定地图并逐级返回；`--window-check` 覆盖窗口恢复与取消捕获。原始证据统一写 `tmp/docs-artifacts/war3/map-menu/`，不执行旧 MEngine 全量验证。

## W004–W006 批次结果（2026-10-26，未关闭）

集成范围 `eeeb747`、`643f0b7`、`c98f45d` 及本次补充修复。Win32 Release 编译通过。原有 CPU 13 项通过、0 失败；地图 CPU 10 项通过、0 失败，包含完整经典尾表、省略尾表、WTS、源角点/路径位、截断/版本、目录排序、单人/选图 FDF 定义以及三张真实地图。证据为 `map-menu/native-tests.log`、`map-tests.log`、`batch-final-build.log`。

三图元数据由独立 Python 读取器交叉核对：Amazonia 为 W3I25、97×97 角点、2 玩家、1 势力；Booty Bay 为 W3I18、193×97、2 玩家、1 势力；DotA v6.83d 中文版为 W3I25、129×129、10 玩家、2 势力，显式省略编辑器尾表。独立结果见 `independent-map-records.json`。产品三图 `--probe` 均退出 0、无 Game.dll，见 `{amazonia,bootybay,dota}-probe.log`。这些结果仅证明原生源记录读取，不表示地图初始化或对局通过。

新导航运行在创建设备时失败，未进入本批新增界面。当前执行进程属于 Windows 会话 1，`query session` 显示为 Disc；标准 D3D9 查询返回 D3DERR_INVALIDCALL，D3D9Ex 与 On12Ex 不可用。已将回退扩展到完整的能力、显示模式、深度和创建设备过程，编译通过；环境仍没有可用设备，不能沿用上一批旧帧证明新 UI 通过。证据为 `initial-device-error.log`、`amazonia-menu.log`、`display-session.log`。

已静态补齐 Maps 内指定地图的父目录导航，以及切选文件夹/错误地图时释放旧预览引用；相关交互仍随 GPU 导航等待实际验收。本批保持未关闭，恢复可用显示会话后先执行下列定向命令，再开展下一批：

```powershell
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/FrozenThrone/(2)Amazonia.w3x" --hidden --frames 240 --time-ms 0 --menu-check --log "../../tmp/docs-artifacts/war3/map-menu/amazonia-menu.log" --capture "../../tmp/docs-artifacts/war3/map-menu/amazonia-menu.png"
```

对 BootyBay、DotA_v6.83d 重复同一导航路径；检查单人/选图帧、目录双击/返回、滚轮和坏地图恢复，并复测 `--window-check`。不重复已通过且输入未变化的 CPU 项，不关闭/重启现有编辑器，不清理旧地图转换缓存。

## W005／W006 原版展示补充（2026-10-26）

本次补充保持原批次计数。按 REA 和原件配置接入运行时信息锚点、标题偏移、尺寸分类、中文地形名、列表字体、HM3W 头部名称/人数/分类，以及已接入按钮的键盘焦点。修正单行区域计算成两行导致的文字裁剪，菜单动作在完整绘制后处理。

Win32 Release 编译通过。地图专项现在 14 项通过、0 失败；新覆盖头部边界、INI 分段/引号/注释、原版展示配置、源焦点链，以及三图头部与 W3I/WTS、完整尺寸与 W3E 的一致性。原有 13 项 CPU 结果沿用。证据为 `source-ui-final-build.log`、`source-ui-tests.log`，均在 `tmp/docs-artifacts/war3/map-menu/`。

原版 CPU 对照通过 5 条锚点、40 组标题位置、64 组尺寸类别，证据为 `source-ui-cpu.json`、`source-ui-cpu.log`。配置成员和 C++ 夹具摘要写入该 JSON。原件只在 PE 读取器和 Unicorn 中作为指令数据使用；GUI/配置边界由探针提供，此检查不代替 GPU、字形测量或实际输入验收。

复现：先运行 `war3_map_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/map-tests>` 生成原生夹具，再在仓库根目录执行 `python watcher/war3/tools/verify_map_ui_cpu.py`。其他输出目录需通过 `--fixture <map-ui-native.json>` 指定；原版和输出路径可用 `--data-root`、`--output` 覆盖，默认输出在仓库根目录 tmp。

本轮重验仍显示执行会话 1 为 Disc，设备不可用，见 `continuation-menu.log`；没有新增 GPU 通过结论。增强后的 `--menu-check` 要求通过实际窗口 Enter／Space 进入单人/选图、Tab 切换列表/按钮、确认地图列表 Enter 不触发取消，再检查 S/G/A/Escape/Q 返回。恢复显示会话后完成这些检查，并人工检查 Shift+Tab、目录双击、坏地图恢复和像素；此前保持本批未关闭。

## W005／W006 玩家槽与显示恢复验证（2026-10-26）

本次仍是原批次的补充任务，不增加待测计数。路径为 `src/setup.*`、`player_setup_ui.*`、`fdf.*`、`glue.*`、`map_browser.*`、`main.cpp`、`platform.cpp`、`tests/map_tests.cpp` 和 CMake。实现源玩家 ID/势力的配置草稿、复用 PlayerSlot 实例、重复 MenuItem、上下文锚点、名称/种族/队伍/颜色/障碍下拉、固定设置约束、统一焦点与弹层输入；同图重复选择保留编辑，解析或布局失败清空部分状态。

Win32 Release 构建通过，见 `player-setup-build.log`。地图专项 **19 通过、0 失败**，新增源 popup 选项、两个独立上下文、源 ID/记录、本地槽移动、计算机控制、非法编辑、颜色交换、障碍边界、固定设置、force 掩码和文字内联颜色；三图分别核对草稿槽数与本地 ID，DotA 特别核对缺少 0/6 的稀疏 ID 和两队固定设置。基础 CPU **13 通过、0 失败**，本次因 FDF 解析/继承变更而复测，未执行旧 MEngine 全量测试。证据为 `player-setup-tests.log`、`player-setup-native-tests.log`。

原生地图 UI 规则夹具 SHA-256 仍为 `64bd263b499277b3a86cf63438c264dfde8cea886a3ff79ffba2894d722e128c`，布局/类别代码及配置未变，复用此前 5/40/64 条原版 CPU 对照；不重复执行 Unicorn。

会话 1 恢复为 console/admin/Active 后，标准 D3D9 的三图 `--menu-check` 均退出 0：Amazonia **104 帧**、BootyBay **104 帧**、DotA **108 帧**，均报告无 Game.dll。本地 ID 分别为 0、0、1。检查使用真实 HWND 消息：Enter/Space 进入单人和选图、地图行点击、滚轮、列表 Enter、Tab 到本地障碍、修改为 90%、重复选中地图保留草稿、再次展开与 Esc 关闭弹层、Tab/Space 取消以及 S/G/A/Escape/Q 返回。窗口恢复检查 **92 帧**退出 0，覆盖两次缩放、最小化恢复、从按钮外拖入与取消捕获；未停止或重启编辑器。

证据统一在 `tmp/docs-artifacts/war3/map-menu/`：`player-setup-{amazonia,bootybay,dota}.log`、同前缀的 `-single.png`／`-browser.png`／`-popup.png`，以及 `player-setup-window.{log,png}`。已查看三图选图帧和弹层输出，能确认源控件、预览和分组被绘制，不能据此宣称与原版逐像素一致。所有检查进程均已正常退出。

DotA 的 `|c00` 标题和说明色按原版 `0x6f0d8780`、`0x6f0d8948`、`0x6f029c80` 固定文字 alpha 为 255，修复后红/绿势力标题与说明颜色可见。`tools/verify_text_color_cpu.py` 的 **32 组合法颜色**与 C++ 全部一致，证据为 `text-color-parser-rea.json`、`text-color-cpu.json`／`.log`；ASCII 与 CRT strtol 为受控探针边界。文字修复后只重跑受影响的 DotA 导航，仍为 108 帧退出 0；沿用未受影响的另外两图、窗口恢复和基础 CPU 结果。

复现命令沿用上一节的三图入口，`--menu-check` 现在至少需要 `--frames 240`；步骤未完成而帧数耗尽会失败。增加 `--mute` 可跳过本批未改动的音频路径。选图、弹层和地图草稿不运行 JASS，不产生解包工程。

本批剩余待测：目录双击/Enter/Backspace 返回、坏地图与失效目录恢复、反向 Tab、玩家长列表滚动、颜色/队伍/名称的完整鼠标操作与切图释放。完整 UI 的组布局、颜色网格、字体/过渡和对局默认 AI/JASS 顺序保持待实现或对照；开始游戏仍禁用。W004–W006 保持未关闭，完成这些与已实现路径有关的检查后再开启下一批。

## W004–W006 基础批次关闭（2026-10-26）

在 `e1889bf` 上补充只读界面查询和 `tests/browser_tests.cpp`，Win32 Release 编译通过；原生 D3D9 界面检查 **11 通过、0 失败**，无 Game.dll。覆盖目录双击、Enter 与 Backspace 返回；坏归档、缺少/截断 W3I 的状态清空和选择恢复；同一失效文件替换后重试；删除/重建测试文件夹后的目录恢复；坏图选择直接释放旧预览节点的 COM 引用；弹层外部点击不进入地图列表；名称、种族、队伍、颜色交换、障碍值及本地槽移动；Tab/Shift+Tab 正反遍历；静止鼠标不覆盖键盘、滚轮切换；16 槽滚动及底部弹层向上展开；固定设置与空草稿/重绑。

夹具仅在 `tmp/docs-artifacts/war3/browser-tests/<PID>-<ticks>/` 新建目录、复制一张原地图并生成畸形 MPQ，不改动原安装。测试直接向产品 GlueScreen/MapBrowser 输入 UiInput 并实际绘制 D3D9 帧；此前 `e1889bf` 的三图产品 HWND 导航、窗口恢复、19 项地图/13 项基础 CPU 和 32 组原版颜色对照沿用，没有相关输入或行为变化时不重复执行。

证据为 `map-menu/browser-build.log`、`map-menu/browser-tests.log` 和 `browser-tests/browser-results.json`；恢复后的地图与长玩家列表帧为 `browser-recovered.png`、`setup-scrolled.png`，已查看。原始 JSON/日志/PNG 不提交。复现（`watcher/war3`）：

```powershell
./build/windows-x86/bin/Release/war3_browser_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/browser-tests"
```

本批关闭已实现的地图定义、基础动态控件与选图交互。完整 UI 像素、组间距、颜色网格、过渡、对局配置覆盖、地图初始化和实际玩法保持总矩阵待完成状态，不据此缩小独立客户端目标。下一批从原生脚本和地图会话展开。

## 原生脚本批次队列

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W007 JASS 源与语法树 | jass.*、archive.*、main/platform、CMake、jass_tests | 原公共库、三图脚本成员与来源、语法/位置/预算、入口、后续 VM 对 AST 的消费 | token 与字符串混淆、CR 源位置、公共来源覆盖、表达式绑定与语义 | 语法基础与三图装配通过，本批关闭；执行能力待实现 |
| W008 原版数值转换 | jass_numeric.*、numeric_tests、verify_jass_numeric_cpu、CMake | VM 实数位型、I2R/R2I 边界、原版 CPU 差分、后续 native 绑定消费 | 尾数截断、符号、越界、NaN/无穷、宿主浮点转换差异 | 转换与当前数值层集成通过，本批关闭 |
| W009 实数算术与字面量编译 | jass_numeric.*、jass_reciprocal.inc、jass/main、生成/验证工具 | 原版四则与倒数插值、十进制 token、AST 实数位型、三图脚本装配 | 移位/截断、系数来源、长小数回绕、零除函数与 VM 策略边界 | 数值差分、AST 实数位型与三图装配通过，本批关闭；VM 边界待实现 |

W007 为后续执行开发所需立即编译和最小集成验证，未运行旧引擎全量测试或重跑无变化的 GUI/纹理检查。Win32 Release 构建通过，`war3_jass_tests` **8 通过、0 失败**；产品 `--hidden --script-check` 直接挂载原公共 MPQ 与 DotA，退出 0、无 Game.dll，语法树含 91 类型、3,369 全局、1,160 native 声明、5,599 函数体、281,324 表达式、65,968 语句。独立文本声明计数的类型/native/函数分别为 91/1,160/5,599，与原生输出一致。

证据在 `tmp/docs-artifacts/war3/jass/`：`build.log`、`tests.log`、`dota-script.log`、`independent-declarations.json`、`source-paths-rea.json`。公共库和原地图保持只读；测试夹具另写 tests 子目录。本次只构建语法树，没有执行 global initializer、config/main 或任何 native；单次解析时间不表示冷地图载入或对局性能。

定向命令（`watcher/war3`）：

```powershell
./build/windows-x86/bin/Release/war3_jass_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/tests"
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --script-check --log "../../tmp/docs-artifacts/war3/jass/dota-script.log"
```

累计三个功能任务后合并验证三图脚本/VM接口及原生函数边界；原版表达式优先级、结合性、短路、数值/字符串语义及完整执行能力均未由本次语法树测试证明，实施 VM 时先按原件核对。未接入的 UI/世界/AI/战役等继续按完整矩阵推进。

W008 原生 Release 构建与转换边界检查通过。I2R **695 组**、R2I **3,072 组** C++ 输出与原版 native 包装/转换指令逐位一致，原件只在 Unicorn 中作为 PE 指令数据执行，没有任何代码边界替身，产品与原生检查均不加载 Game.dll。此最小差分是数值层继续开发的必要依据，未扩展到旧引擎或重复已通过的 UI/语法检查。证据在 `tmp/docs-artifacts/war3/jass/numeric-{build.log,tests.log,native.json,cpu.json,cpu.log}`，原始 REA 文件见 `jass.md`。

复现（仓库根目录）：

```powershell
./watcher/war3/build/windows-x86/bin/Release/war3_jass_numeric_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/numeric-native.json"
python watcher/war3/tools/verify_jass_numeric_cpu.py
```

W009 补齐 Real 四则、固定倒数系数和十进制 token，并把实数位型接入 AST。`jass/arithmetic-build.log`、`arithmetic-tests.log`、`arithmetic-native.json`、`arithmetic-cpu.json`／`.log` 记录 **55,296 次四则运算、2,061 个十进制 token** 与原版一致，无替代函数代码；旧 695/3,072 组转换证据保持原文件，未重复执行。生成器核对 Game.dll 固定摘要，运行时使用已提交的 4,100 字节系数，不加载原件。语法/字面量消费在后续三图集成中验证；完整 tokenizer、VM 零除/线程语义与其他执行行为未被本次差分覆盖。

本批达到 3/3。提交后合并执行受影响的 JASS 自编夹具和三张代表地图 `--script-check`，核对根/Scripts 成员、原版实数位型已在 AST 生成、声明数与无 Game.dll；复用已通过的数值函数原版差分和未变的 UI/地图源记录结果。语法/数值批次通过也不表示 VM、config/main、对局或完整 UI 一致；相应项目继续保留在总矩阵。

## W007–W009 语法与数值批次结果（2026-10-26）

集成版本 `47a1324`，原生 Release 构建通过。JASS 自编夹具 **9 通过、0 失败**，新增验证实数 AST 位型来自原版数值层、保留精度边界、相邻 then 和非法实数诊断。产品三图 `--script-check` 均退出 0、无 Game.dll：

| 地图 | native 声明 | 函数体 | 全局变量 | 预编译实数 | 位型序列校验值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Amazonia | 1,160 | 960 | 898 | 569 | 2,208,139,060 |
| Booty Bay | 1,160 | 952 | 898 | 428 | 1,822,572,789 |
| DotA_v6.83d | 1,160 | 5,599 | 3,369 | 4,687 | 626,114,605 |

三图均含 91 个扩展类型，类型/native/函数/全局数量与固定源文本的独立计数一致；前两图读取根 war3map.j，DotA 读取 Scripts\war3map.j。位型序列校验值用于定位同一脚本输入下的编译结果，不代替原版 VM 执行比较。I2R/R2I 的 695/3,072 组、四则的 55,296 次及 2,061 token 原版差分输入/实现未变，沿用已保存结果，不重复运行；不扩大到旧引擎、GPU、纹理或全库检查。

证据为 `jass/arithmetic-frontend-build.log`、`batch-jass-tests.log`、`batch-{amazonia,bootybay,dota}.log`、`batch-w007-w009.json`。数值差分和系数来源文件继续保留。该批关闭语法树、数值函数和字面量预编译范围；没有执行 globals initializer、config/main、触发器或任何地图 native。下一批为表达式绑定/类型与执行栈，随后实现 native 和地图会话；完整玩法与 UI 仍按总矩阵推进。

## W010–W012 原生链接与执行批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W010 类型与符号解析 | jass_module.*、main、CMake、jass_module_tests | 三图公共/地图符号与槽位、源位置诊断、后续执行层消费直接绑定与隐式数值转换 | handle 兼容、遮蔽、数组形状、继承环、原版类型规则与静态检查边界 | 类型/槽位基础验证通过，本批关闭 |
| W011 原版表达式与整数 token | jass.*、jass_literal.*、CMake、frontend/jass_tests、verify_jass_frontend_cpu | 三图布尔表达式、整数字面量、执行层对 AST 位型/组合的消费 | or/and 优先级与右结合、32 位回绕、语法/类型/执行的验证边界 | 原版定向对照与本批消费通过，本批关闭 |
| W012 执行栈与 native 边界 | jass_runtime.*、jass_literal/jass、main、CMake、runtime_tests、verify_jass_literals_cpu | 三图指令编译、初始化/槽位/流程/短路/code/native 的执行、失败位置与预算释放、前批消费 | 调用帧/跳转、I2R、字节与转义、未绑定函数、重入预算、原版异常策略尚未完整对照 | 13项执行检查、字面量对照及三图指令编译通过，本批关闭 |

W010 为收尾未提交源码及后续执行开发进行必要编译和最小集成：MSVC Win32 Release 的产品和 `war3_jass_module_tests` 编译通过，**9 通过、0 失败**。覆盖 handle/null 与数值赋值、非法类型图、参数/局部/全局槽位及 set 目标、前向函数和 code、数组形状与下标、初始化和常量、条件/返回/运算符、20,000 次左结合运算、移动后 AST 所有权与绑定完整性。

产品 `--hidden --script-check` 对 DotA 直接挂载原归档，类型和符号解析退出 0；91 类型、3,369 全局、1,160 native、5,599 函数体、281,324 表达式、65,968 语句，实数位型序列与既有输入一致，无 Game.dll。证据为 `tmp/docs-artifacts/war3/jass/module-{build.log,tests.log,dota.log}`。该最小产品检查用于确认新模块被真实入口消费；没有重跑旧引擎、GUI、数值差分、全量资产或性能基准。

后续累计三个功能任务后，在同一集成版本合并执行三图检查、源位置与绑定消费的相关用例。确定赋值、全部路径返回、constant 纯度及原版完整类型语义尚未核验；未执行全局初始化、config/main 或 native，未将地图标记为可玩。W010 保持待批次验证，旧 MEngine 161–163 批次继续延期。

定向命令（`watcher/war3`）：

```powershell
cmake --build --preset release --target war3 war3_jass_module_tests --parallel 8
./build/windows-x86/bin/Release/war3_jass_module_tests.exe
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --script-check --log "../../tmp/docs-artifacts/war3/jass/module-dota.log"
```

W011 为执行层开发核对原件表达式组合并修正已确认偏差。Win32 Release 编译通过，5 项 frontend 检查及受影响的9项语法检查通过、0失败。245 组表达式结构通过原版解析状态机指令对照；591 个整数 token（199 十进制／196 八进制／196 十六进制）通过原版回调及 lexer 分类、长度和位型对照。原版解析只执行移进/归约指令，语义动作记录为符号树，到 return 表达式归约停止；lexer 的 CRT memmove 由受控内存复制替代。完整类型、源文件验收、短路、编译和 VM 不在此对照范围，见 `jass.md`。

DotA 最小产品集成退出 0、无 Game.dll，仍为 91 类型、3,369 全局、1,160 native、5,599 函数体、281,324 表达式与65,968语句；此次检查未执行地图脚本。证据为 `tmp/docs-artifacts/war3/jass/frontend-{build.log,tests.log,native.json,cpu.json,cpu.log,parser-tests.log,dota.log}` 与 `frontend-{integers,parser,identifiers}-rea.json`。当前批次 **2/3**，W012 后合并三图及实际执行层消费；已通过且未变化的数值差分、GUI与旧引擎不重复运行。

W012 接入原生执行指令与显式脚本帧，产品 `--script-check` 新增指令编译，保持 `initialized=false`。开发所需 Win32 Release 构建及12项自编脚本执行检查通过；字符串构造器解码循环5组、完整Rawcode回调268组与原版指令一致。DotA 370,552 条指令编译通过，无 Game.dll；地图 native 尚未实现，不执行原图全局初始化或 config/main。原版短路/实参顺序已有发射器及参数布局路径依据，执行完整一致性仍待差分，见 `jass.md`。

证据在 `tmp/docs-artifacts/war3/jass/runtime-{build.log,tests.log,native.json,literals-cpu.json,literals-cpu.log,dota.log}` 与 `runtime-{shortcircuit,strings,call-grammar,parameters}-rea.json`。本批达到 **3/3**；提交后合并构建并执行受影响的语法、Module、frontend、Runtime 检查及三图产品编译，覆盖新增嵌套loop与共享native预算用例。无实现变化的 DotA 最小结果及数值/解析状态机差分按输入与产物摘要复用；不扩大到旧引擎、UI或全量资产。

## W010–W012 脚本基础批次结果（2026-10-26）

集成版本 `d1afdb3`（W010 `c03da05`、W011 `2e9b6de`、W012 `d1afdb3`）。MSVC Win32 Release 构建通过，无编译警告；语法9／Module9／frontend5／Runtime13，**36通过、0失败**。Runtime检查实际执行自编脚本，包含参数/槽位/数组、全局初始化次序、分支/循环/嵌套exitwhen、短路、code同步重入、整数回绕与Real转换、字符串/Rawcode、native错误位置与类型、初始化失败、共享预算和20,000次左结合表达式。

| 地图 | 表达式 | 语句 | 执行指令 | 原图初始化 |
| --- | ---: | ---: | ---: | --- |
| Amazonia | 14,864 | 3,687 | 21,086 | 未执行 |
| Booty Bay | 13,904 | 3,400 | 19,785 | 未执行 |
| DotA_v6.83d | 281,324 | 65,968 | 370,552 | 未执行 |

三图产品 `--hidden --script-check` 均退出0、无Game.dll，直接挂载原公共MPQ与地图，未创建解包工程。当前构建的产品二进制摘要与快速检查版本不同，三图在同一集成二进制重新检查；结果保留 `initialized=false`。本批frontend、Runtime字面量夹具分别与既有原件对照的摘要 `07dc0758df41c6e66a352d3ff6bb6f9e29c5cdce5f593a55fe74497571e9aa70`、`a4b1d9418681924acb17b9a5c51d2bcfb74dcf096757002e4bea2d0d2efc61f3` 一致，复用245组表达式/591个整数和5组字符串/268组Rawcode对照。此前Real数值实现及差分输入未变化，不重跑；未扩大到UI、旧引擎、纹理或全量资产。

证据为 `tmp/docs-artifacts/war3/jass/batch-runtime-{build.log,build-receipt.json,syntax.log,module.log,frontend.log,execution.log,amazonia.log,bootybay.log,dota.log}`、`batch-{frontend,runtime}-native.json`、`batch-w010-w012.json`。本批关闭已实现的类型/绑定、字面量和执行层基础；原版完整类型/VM一致性、游戏native、句柄/计时器调度、原图全局初始化与config/main、实际对局继续在总矩阵待实现。旧MEngine 161–163批次继续延期。下一批从原版公共常量、真实native状态与地图配置/会话开始。

## W013–W015 地图配置与会话批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W013 原图全局初始化/config | session.*、jass_enums.inc、main/platform、CMake、session_tests、verify_jass_enums_cpu | 三图globals/config、配置与玩家草稿/选图的消费、坏图与native失败恢复、切图释放、后续main对状态的消费 | 原版句柄分配/重用、玩家初始状态、菜单占槽与配置次序、未绑定native、范围/销毁诊断边界 | 配置基础范围合并验证通过；完整main消费及原版一致性继续待完成 |
| W014 后台选图与配置草稿 | map_preparation.*、map_browser.*、setup.*、player_setup_ui.*、session.*、main、CMake、setup_tests、browser_tests | 三图选图/config、玩家修改回写、最新选择/目录取消、配置失败与重试、同图草稿/切图释放；合并原11项界面检查及W013会话检查 | 后台归档独立所有权、旧结果覆盖、脚本耗时/退出、原版开局占槽与本地身份时序、组合种族偏好的界面表现 | 基础联动合并验证通过；持续切图性能/完整UI待验收 |
| W015 原生世界与main入口 | world.*、session_world.cpp、session.*、map_preparation、main/platform、CMake、world_tests、verify_world_cpu | 三图世界/globals/config与选图、位置/矩形生命周期、源CameraMargins、main阶段/失败、归档卸载后的世界所有权，合并W013/W014相关验证 | 完整地形/相机范围、边界数值、globals前挂接、原版异常句柄规则、未实现的世界渲染/native | 世界空间/生命周期合并验证通过；完整原图main失败保留后续队列 |

W013 为原图执行开发进行必要编译和最小产品集成：Win32 Release 构建通过、无警告；7项session检查通过、0失败。覆盖44枚举与GetHandleId位型、对象全局初始化/查询/修改/销毁、会话隔离、WTS/config状态/出生点/优先级、源玩家/势力与游戏类型、配置失败阻断及签名错误。初始化只能成功一次；未知native不会回传默认值。

原版注册签名/地址核对与CPU指令比较：44枚举native加GetHandleId，每个65组，共**2,925次逐位一致**，无替代函数。当前C++夹具摘要 `7c2d63f14c5159a09d7bb73b86641314efcadb34da9508dfc2e89a2e8f48e6ee` 未变化，补充源玩家/阶段检查后复用该对照。原版对象分配、默认状态、完整VM和config副作用一致性不由这项数字比较证明，见 `session.md`。

DotA_v6.83d 的产品 `--hidden --config-check` 退出0、无Game.dll：公共库和地图全局初始化/config已实际执行，10名额/10队伍记录，源ID1–5/7–11分别配置为队伍0/1，出生点0–9；Group3/Timer4/Trigger1对象状态保留，main=false。地图与MPQ只读，未解包。另两图和菜单会话联动留在新批次，未重跑已关闭的36项JASS、旧引擎、UI、数值或资产全量检查。

证据为 `tmp/docs-artifacts/war3/jass/session-{build.log,tests-build.log,tests.log,dota.log,enums-native.json,enums-cpu.json,enums-cpu.log,registration-rea.json,enum-conversion-rea.json,handles-rea.json,lookup-rea.json,native-catalog.json,receipt.json}`。原图main/可玩对局与完整原版一致性保持总矩阵待实现状态。

W014开发必需的Win32 Release产品、setup/browser测试目标构建通过，无警告。4项setup定向检查通过、0失败：配置覆盖和稀疏ID、种族/控制限制、UI草稿到native查询、占槽/AI/障碍、势力/组合偏好保留、阶段与会话隔离。3项新增D3D9异步检查通过、0失败：快速选择/目录取消、UI写回/同图保留/切图重建、原config未知native失败清空与恢复。旧11项界面检查已适配有界等待但本项未重跑，留到批次合并；未重跑W013七项、数值、旧引擎或全资产检查。

DotA产品最小集成实际完成原图globals/config后导航110帧退出0、无Game.dll：本地源ID1，10槽及原势力分组，障碍90%、同图保留、弹层取消、返回/再次进入菜单通过。截图已核看，原版完整UI像素、背景模型/粒子等仍属总矩阵待还原；不将导航通过写成完整UI/对局通过。证据为 `jass/setup-{build.log,tests.log,player-natives-rea.json}`、`map-menu/setup-{browser-tests.log,browser-tests/browser-results.json,dota.log,dota*.png}`。尚未执行main或可玩对局；本批当前2/3。

W015最小范围：产品和world目标Win32 Release构建通过，无警告；7项world检查通过，195组坐标夹取及77组SSE相机距离换算与原件指令逐位一致、0失败，不加载Game.dll。SourceSettings和Real原实现未变化，未重跑旧数值或全量资产。Amazonia真实main已完成相机/昼夜模型/水色写入和1个矩形创建，随后明确在AddWeatherEffect失败（退出1，main_completed=false），不记录成原图main通过。证据为 `tmp/docs-artifacts/war3/world/{build.log,product-build.log,tests.log,cpu.log,world-*.json,main-amazonia.log}`。world/CPU实现和输入未变化，合并验证复用该结果。

## W013–W015 合并结果（2026-10-26）

集成提交 `a07fcab`，包括W013 `527ad20`、W014 `f802c63` 与W015 `a07fcab`。产品/相关测试目标MSVC Win32 Release构建通过、无警告。会话7、玩家草稿4、原生D3D9界面14，**本次执行25通过、0失败**；复用同一实现/输入的world7项后，已实现范围合计**32通过、0失败**。14项界面包含原11项和新增3项异步检查，覆盖目录/坏图/重试/预览释放、焦点/弹层、全部玩家字段、长列表/固定设置、最新选择/目录取消、草稿回写/保留及config失败恢复。

同一产品二进制 SHA-256 `30b0d76f73d88277e0165f98888a33feb6761c66f6da558812a96b6714f77ae8`：Amazonia、BootyBay、DotA原图globals/config均退出0，带世界数据的产品菜单导航分别104、104、110帧通过，均无Game.dll。world源码/夹具与272次原版比较的摘要一致；新枚举夹具摘要 `7c2d63f14c5159a09d7bb73b86641314efcadb34da9508dfc2e89a2e8f48e6ee` 及元数据与2,925次原版比较报告一致，复用有效结果。没有重跑W010–W012的36项、旧引擎、全量资产或性能基准。

三次完整原图main尝试均退出1，**未通过**，保留以下实现队列：

| 原图 | 实际停止位置 | 待实现 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 原版天气定义、实例与启停、渲染消费；后续单位/触发器 |
| BootyBay | `war3map.j:789:10` NewSoundEnvironment | 真实声音环境、昼夜环境音/音乐、后续单位/触发器 |
| DotA_v6.83d | `Scripts\war3map.j:90177:6` NewSoundEnvironment | 真实声音环境、地图声音/音乐及后续初始化native |

证据为 `tmp/docs-artifacts/war3/world/batch-{build.log,session.log,setup.log,browser.log,browser-tests/,enums-native.json,config-{amazonia,bootybay,dota}.log,menu-{amazonia,bootybay,dota}.log,main-{amazonia,bootybay,dota}.log,w013-w015.json}`，复用证据见同目录world检查和 `jass/session-enums-cpu.json`。本批只关闭已实现配置/世界空间基础；原版完整客户端矩阵、UI像素、main与可玩对局继续待实现/验收，旧MEngine 161–163保持延期。下一批从W016声音环境及相关实际native开始，不用空回调越过失败项。

## W016–W018 运行资源与声音批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W016共享归档视图与世界资源寿命 | archive.*、world.*、CMake、archive_tests | 公共/地图去重与作用域、跨线程读取、地图视图隔离/最后释放、LRU和外部引用；声音/模型实际消费，三图持续切图 | 共享StormLib句柄加锁、地图视图遗留、引用与缓存预算差异、后续声音线程寿命 | 资源基础/声音消费合并验证通过；持续切图性能及模型消费待验收 |
| W017共享Miles与MIDI/DLS后端 | audio.*、media.*、CMake、profile、audio_tests | 数字声音与MIDI/DLS实际播放/控制、设备/源字节/音色库寿命，菜单共用设备，地图声音消费与切图释放 | 原stdcall ABI、转换内存分配器、DLS/XMIDI/数字设备关闭次序、重建与并发、听感/空间效果边界 | 已实现后端合并验证通过；3D/听感与完整音频待验收 |
| W018源声音表与脚本MIDI对象 | slk.*、sound.*、session_sound、session.*、main、map_browser/preparation、CMake、sound_tests | SYLK/原声音字段、地图覆盖、globals创建、实际播放控制/状态、抢占/退役/独立寿命、静音传递、原main停止位置；合并资源/Miles及选图受影响范围 | 变量/源资源/设备寿命、同步读取、未还原的渐变/3D环境/时钟、普通声音与Music尚未绑定 | 源表/MIDI对象合并验证通过；渐变/时间/环境与完整main继续待实现 |

W016开发必需编译通过、无警告；7项新归档检查通过，含8视图各128次并发读取、9MiB双成员的16MiB地图LRU、真实BootyBay世界资源视图。DotA产品导航108帧退出0、无Game.dll。没有重跑旧JASS、图像、UI14项、三图全量或性能基准；合并验证覆盖后续音频消费及必要受影响范围。证据为 `tmp/docs-artifacts/war3/audio/archive-*`，接口与预算见 `archives.md`。

W017开发必需的产品/audio目标构建通过，无警告；7项真实Miles定向检查通过、0失败，含原MP3、原MIDI+DLS双sequence共享库、PCM参考长度/定位、播放状态与时间推进、设备/声音/音色库释放及4线程各4次设备重开。检查输出音量为0，未做听感或3D混响验收。产品原菜单带音乐运行60帧退出0，无Game.dll。尚未绑定原图声音native，main停止位置保持天气/声音环境，待下一项接入后合并。没有重跑旧界面、脚本、地图全量、图像或性能基准；证据为 `tmp/docs-artifacts/war3/audio/miles-*`，ABI/来源与生命周期见 `audio.md`。

W018开发必需编译通过、无警告；6项sound检查通过、0失败，实际调用Miles且输出音量0。BootyBay/DotA原main均完成Default源环境登记和1个MIDI/DLS声音创建，随后在 `Scripts\Blizzard.j:1224:12` 的GetFloatGameState失败，退出1、main未完成，无Game.dll。非零渐变及源Pitch非1保持显式错误，3D环境属性仅登记源请求，未做效果一致性验收。证据为 `tmp/docs-artifacts/war3/audio/sound-*`，合并验证复用同一sound二进制/输入的有效结果。

## W016–W018 合并结果（2026-10-26）

集成提交 `6557119`，包含W016 `98197bd`、W017 `a3bc2f7` 和W018 `6557119`。MSVC Win32 Release产品及相关检查目标构建通过，无警告。归档7、Miles7、D3D9界面14，**本次执行28通过、0失败**；复用当前未变化的sound6项，合计**34通过、0失败**。复用前核对了sound二进制/相关源码与最后执行日志的时间及摘要。覆盖资源共享/读写边界、源资源/声音/设备寿命、实际播放/控制及受影响选图/玩家输入；声音检查音量为0，听感/3D混响和完整性能仍待验收。

同一产品二进制 SHA-256 `b15fcbe0550c357710515ff34e480429bd8e9dd73e2bae2a12e7a40520b1fb92`：三图globals/config退出0；Amazonia、BootyBay、DotA菜单导航分别104、104、108帧通过，无Game.dll。BootyBay/DotA的main证据来自同一产品二进制的W018最小集成，未重复；Amazonia本批补查。三图完整main均退出1，**未通过**：

| 原图 | 实际停止位置 | 后续实现队列 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 天气定义/实例/启停与渲染；后续单位/触发器 |
| BootyBay、DotA | `Scripts\Blizzard.j:1224:12` GetFloatGameState | 原版时间初值/变量求值/推进与事件；随后声音渐变、环境效果、Music与单位初始化 |

BootyBay/DotA在停止前各持有1个真实MIDI声音、1个DLS库和Default环境请求；尚未进入后续StartSound，不能视为原图声音播放/完整main通过。额外的非零声音渐变、3D环境应用、普通CreateSound、Music、开局/完整UI与性能保持待实现/验收。下一批W019从时间变量和声音渐变的实际原件调用继续，不填推测状态。

证据为 `tmp/docs-artifacts/war3/audio/batch-{build.log,archives.log,archive-tests/,miles.log,browser.log,browser-tests/,config-{amazonia,bootybay,dota}.log,menu-{amazonia,bootybay,dota}.log,main-amazonia.log,w016-w018.json}`，复用证据为 `sound-{tests.log,main-bootybay.log,main-dota.log}`。没有重跑旧JASS/数值/图像、全资产、旧引擎或性能基准；旧MEngine161–163批次仍延期。本批仅关闭已实现资源/声音基础，完整客户端目标继续进行。

## W019–W021：时间、MIDI与音乐初始化批次（3/3）

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W019同步初始化时间状态 | game_clock.*、world.*、session_world.cpp、CMake、clock_tests、verify_clock_cpu | 三图globals/config/main、源昼夜规则覆盖/切图隔离、与后续声音和选图的消费；后续调度需补跨日/反向/时间事件 | 当前没有模拟tick/回绕/事件派发，变量层上界只夹取；数值CPU对照替换3个系统边界且没有订阅者，不证明完整昼夜 | 已实现范围合并验证通过；完整时间模拟继续待实现 |
| W020非空间MIDI渐变 | sound_fade.*、sound.*、audio.*、session_sound/session.h、map_browser、CMake、sound_tests、verify_sound_fade_cpu | 合并Miles/选图受影响检查、三图globals/config/main、正反渐变/静音/淡出释放/跨会话资源；源定时器相位/3D保持后续范围 | 无符号步长与回绕、减到零后下一次才停止、脚本句柄退役后的播放所有权；对照替换6个链表/硬件/诊断边界 | 已实现范围合并验证通过；完整音频/玩法待完成 |
| W021脚本音乐配置/播放 | music.*、audio_random.*、session_music.cpp、session.*、map_ui.*、main、CMake、music_tests、verify_music_cpu | 合并时间/MIDI/Miles/选图、三图globals/config/main；地图skin覆盖、选曲、暂停/恢复、定位、渐变、曲终排队与释放 | 声音RNG共享消费时序、最终种族/版本上下文、ThematicMusic与调度相位尚未完成；原件CPU只覆盖RNG及渐变标量/回调边界 | 已实现范围合并验证通过；5,434次原件对照一致；完整main与后续音乐/玩法待完成 |

W019开发必需的Win32 Release产品/clock目标构建通过，无警告。6项定向检查通过、0失败；3,288组变量赋值与7组速率计算和固定原件指令逐位一致。对照范围为零模拟时差、无订阅者的变量层；引用解析、时间取样和时间戳存储共3个边界被替换，跨日/昼夜/脚本事件未验证。

BootyBay最小产品集成退出1，日志显示 `main_completed=false`，已通过GetFloatGameState并创建2个真实MIDI声音/1个DLS库，随后在 `Scripts\Blizzard.j:2482:14` StartSound非零fade-in明确失败，无Game.dll，不能记为完整main通过。产品SHA-256为 `b50a1e579ebeb2f24bb698cc9f58b203657cb83847fc52960d56e0c88d438eb8`。DotA/Amazonia、界面、旧脚本/数值/声音及性能未重复执行，纳入本批受影响范围后去重验证。原始证据为 `tmp/docs-artifacts/war3/clock/{build.log,tests.log,tests/clock-native.json,clock-cpu.json,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。

W020开发必需产品/sound目标Win32 Release构建通过、无警告；10项定向检查通过、0失败。包含真实Miles的非零速率首次播放、重复启动保持播放位置、淡出取消、100ms单脉冲、内部淡入、精确减至0后的延迟结束、kill/独立播放所有权和通道抢占；正音量查询仅在未播放声音上执行，播放时静音。原件对照2,934组步进、8组无符号速率和80组首次/重复启动共3,022组零差异，保留源算术和状态写入，替换6个链表/硬件/诊断边界，不证明物理声音、源定时器或3D分支。

BootyBay真实main已通过StartSound，在 `war3map.j:792:10` 的SetMapMusic明确失败，退出1、main_completed=false，无Game.dll。产品SHA-256为 `0e4fb69db78cbefe6351708ef8d3b4d0b90e44341a28f9178e714c31546a8291`。证据为 `tmp/docs-artifacts/war3/audio/fade-{build.log,tests.log,tests/107988-352511640/fade-native.json,cpu.json,cpu.log,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。最后的播放状态边界修改后，重新执行10项sound与BootyBay最小集成；新夹具和sound_fade源码摘要均与原件对照输入一致，复用3,022组CPU结果。没有重复旧完整Miles/界面、三图全量、旧引擎或性能基准；下一项完成后先关闭本批受影响验证。

## W019–W021 合并结果（2026-10-26）

集成提交 `e073a7d`，包括W019 `8c2f6af`、W020 `355ceb4`及W021 `e073a7d`。Win32 Release产品及相关测试目标构建通过、无警告。本批执行clock6、sound10、Miles7、world7、browser14共**44通过、0失败**；复用同一实现/输入/测试二进制刚通过的music8项，已实现范围共**52通过、0失败**。这些检查包含源时刻/地图覆盖、真实静音音频/MIDI、曲目表/skin覆盖/渐变/曲终排队、世界/资源所有权与14项选图界面消费。clock/sound的新夹具与受控源码摘要和既有CPU结果一致，分别复用3,295次和3,022次对照；音乐5,434次对照输入/源码摘要亦核对一致，不重复数值执行。

同一产品二进制SHA-256 `94277e14b1f03472babeb0740ff7593d37c0c9b4ca06ee04a320320cc8c5915a`：三图globals/config退出0；Amazonia、BootyBay、DotA菜单导航分别104、104、108帧退出0，无Game.dll。三图完整main均退出1，**未通过**：

| 地图 | 实际停止位置 | 后续队列 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 天气与后续单位/触发器 |
| BootyBay | `war3map.j:643:13` CreateUnit | 单位定义/创建与后续初始化 |
| DotA_v6.83d | `Scripts\war3map.j:90181:8` CreateSound | 普通声音创建与后续初始化 |

BootyBay的main复用同一产品二进制的W021最小复现，另两图本批执行。BootyBay/DotA均持有Music、index=−1、tracks=0的配置，未提前播放；音乐实际播放由定向原资源/JASS用例验证。完整音乐上下文/ThematicMusic、模拟tick/事件、世界渲染、实际开局、玩法/完整UI/性能仍待实现或验收。

证据为 `tmp/docs-artifacts/war3/audio/batch-w019-w021-build.log`、`batch-w019-w021.json`、`batch-w019-w021/{clock,sound,audio,world,browser}.log`及夹具/三图日志，复用music证据见 `script-music.md`。未重复旧JASS/数值、图像/资产全量、旧引擎或性能基准；MEngine161–163批次仍延期。本批关闭已实现范围，完整客户端目标保持未完成。

## 阶段A：对象初始化到可操作地图（实现中）

门槛为选图、载入、地图主函数、世界画面、单位操作和返回菜单的连续流程。源码分批提交，完整流程实现后集中验证；W022–W024达到三项不触发中断实现的回归批次。

| 任务 | 路径 | 待测内容 | 边界/风险 | 状态 |
| --- | --- | --- | --- | --- |
| W022源对象与单位/物品 | object_data.*、entities.h、session_entities.cpp、session.*、slk.*、map_ui.*、CMake | 原单位/物品表、w3u/w3t继承及类型/终止标记、Profile大小写、源属性、创建/查询/修改/分组/销毁、切图所有权 | 完整对象家族/放置、碰撞/寻路、渲染、能力/物品库存及死亡事件继续实现；未映射修改保留记录 | 源码已接入，产品编译/静态签名检查通过；功能与原版一致性待阶段验证 |
| W023天气实例状态 | session_weather.cpp、entities.h、session.* | 源Weather.slk、区域/启用状态、生命周期、原图main消费与切图释放 | 天气粒子/渲染消费者尚未接线，源行为细节待核对 | 状态实现已接入；画面与阶段验证待完成 |
| W024普通数字声音 | audio.*、sound.*、session_sound.cpp | 实际WAV/MP3、延迟声音申请、loop/pitch/时长、标签参数、自然结束/释放、源脚本初始化与MIDI兼容 | 监听器/空间混音尚未接线，空间播放明确失败；声音变体、EAX、完整原版音频待实现/核对 | 基础实现已接入，产品编译通过；Miles运行/相关回归待阶段验证 |

本批只执行必要Win32 Release产品编译（无警告）、56个字面量native签名的静态核对与差异检查，没有运行功能测试、三图回归、CPU逐位对照、全量资产或性能检查。编译证据为 `tmp/docs-artifacts/war3/implementation-build.log`。历史52项通过属于e073a7d，不能作为本批新增代码已通过运行验证的依据。详细来源和边界见 `entities.md`。

| 阶段A接续任务 | 路径 | 待阶段验证 | 当前证据/边界 |
| --- | --- | --- | --- |
| W025回调/枚举/事件/时钟核心 | script_state.h、session_callbacks/collections/tick、session.*、game_clock.*、session_world | 嵌套回调、删除/重启/禁用、短/周期计时器、阈值/回绕、事件顺序与切图 | BootyBay原main及250ms早期回调通过；线程等待、全部生产者与原版时序待完成 |
| W026原版开局资源/状态 | session_game/dialogs、session_entities、object_data、entities、sound/session_sound、slk、archive、main/platform、CMake | 源表/能力别名、声音标签、资源枚举、PLD、规则/种族/科技/相机/窗口状态、三图main与持续模拟 | BootyBay65单位/42触发器/8计时器/57事件；完整游戏RNG、规则/渲染消费者和另外两图待完成/复查 |
| W027Miles waveOut输出 | audio.cpp、CMake开发符号图 | Miles/MIDI/MP3、音量/渐变/自然结束/释放、窗口与听感回归 | Miles库内waveOut路径已在静音最小复现创建3声音/1DLS库；未做完整音频回归/听感验收 |

接续只执行开发必需编译、165项字面量native签名静态核对、BootyBay阻塞复现及新增250ms模拟入口；没有运行旧全套测试、三图遍历、逐位CPU、全资产或性能基准。最新Win32 Release产品无警告，SHA-256 `035b4a2c02f786f355fa927481a21b49aa37c815c34e02a8a5aa71793c96bbe4`。原图globals/config/main退出0，推进后bj_gameStarted=true，无Game.dll，预载缺失0。它不证明地图已经显示、单位可操作或完整玩法通过；功能/原版一致性继续在阶段A集中验证。证据与必要边界见 `script-events.md` 和 `tmp/docs-artifacts/war3/stage-a-*`。旧MEngine161–163仍延期。


## 阶段A：原图场景和基础命令（W028–W030）

| 任务 | 主要路径 | 已实现消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- | --- |
| W028原地图世界绘制 | scene_assets/math/objects、terrain_scene/layout、model/pose、renderer | 地面混合、源悬崖/坡道/动画水面；DOO及w3b/w3d、单位/物品MDX、队伍色、静态缓冲与空间裁剪 | 三图拓扑/透明材质、动画、路径贴图变换、缩放/设备恢复、预算边界、CPU/GPU内存与帧耗时；光照/迷雾/粒子/LOD继续实现 | 已接入；BootyBay画面开发复现通过，完整待阶段验证 |
| W029开局/载入/返回 | game_loading、loading_screen、map_browser、main、fdf、platform | 源PlayGameButton、现有会话转移、后台main/CPU准备、实数GPU上传进度、源Loading/ConsoleUI、取消/失败/返回和--play | 菜单鼠标/键盘开始，三图、取消/快速切换/失败重试、退出时资源释放、CPU工作取消延迟、连续切图无磁盘增长；完整源游戏内菜单待实现 | 已接入；开局/返回开发复现通过，队列未关闭 |
| W030相机/选择/基础命令 | game_view、world_path、session_orders/tick/entities、script_state | 六档源相机/有界滚轮、平移、选择/框选/Shift/源圈、同一native/UI移动与S/H、WPM八邻A*和固定步进、订单事件 | 实际移动轨迹/终点、不可达/穿角/边界/半径、删除/事件重入、缩放上下限、相机边界、选择/命令时序；动态碰撞/编队和完整类型待实现 | 已接入；选中1单位和接受移动命令、滚轮输入开发复现通过，完整待阶段验证 |

本批必要Win32 Release产品编译无警告、差异检查通过。只运行BootyBay新开局/窗口输入的最小开发复现：最新CPU准备1156ms、192纹理、177区块、2011放置物、65单位，30游戏帧退出0，无Game.dll，随后返回选图；首次地图画面另有20帧证据。未检查移动终点/全缩放边界，不作为完整玩法或性能验收。原始产物为 `tmp/docs-artifacts/war3/scene-{build.log,input.ps1,input.log,bootybay.log,bootybay.png}`。没有运行旧测试全集、三图遍历、逐位CPU对照或全资产基准。阶段A其余功能继续实现；三图及输入/还原/释放/性能集中执行后才关闭本队列。旧MEngine161–163继续延期。

阶段验证入口：使用 `--map <地图> --play` 分别进入Amazonia、BootyBay、DotA_v6.83d，合并验证上表；无GPU的初始化故障先用 `--main-check --map <地图> --simulate-ms <区间>` 缩小。只重测失败及修复影响范围；截图/采样均写 `tmp/docs-artifacts/war3/`。


## 阶段A：运行中世界消费接续

| 任务 | 主要路径 | 实际消费 | 待合并验证 | 状态 |
| --- | --- | --- | --- | --- |
| W031单位呈现和资源队列 | session_visual/entities/orders、scene_assets/streaming、model/pose、game_view | 颜色/alpha/缩放/高度速率/动画、CPU后台解码、依赖复用、GPU交付边界 | 动态GPU实例、透明材质、全部序列/队列、取消/预算/切图、设备恢复；--play返回单人界面补充路径 | 已实现；CPU交付/单位状态定向检查通过，GPU待测 |
| W032区域/聊天/物品栏 | spatial_region、session_spatial_events/inventory/text、game_view/main | 点/区域成员、进入离开/接近/聊天生产者、文字/Unicode输入、槽位/拾取丢弃事件/物品图标 | 量化和事件时序、重入删除、完整库存能力/死亡/使用、频道/布局/文本边界 | 已实现；区域进入和3次物品事件在复制原图中通过；其他待测 |
| W033视野/天空/typed storage | fog_grid/render、session_fog/cache/hashtable、world、terrain_scene | 单位昼夜/共享视野、modifier启停/优先级、模型/地形投影、源天空、基本类型/句柄和键值清理 | 原版迷雾刷新/分辨率/遮挡、shader画面/恢复、hash类型交叉与句柄寿命、字符串边界；持久w3v与同步待实现 | 已实现；CPU视野/存储检查通过，新增GPU待测 |
| W034无输出设备的显式静音 | audio_duration、audio、sound、music | 原WAV/MP3/SMF时长和逻辑voice，播放/循环/暂停/定位/渐变，取消静音回到Miles | 时长/格式错误边界、自然结束/速率/切换；有声Miles/3D/听感继续按原范围验证 | 静音原图初始化/状态通过；未验证有声输出 |

只执行开发必需Win32 Release产品/定向程序编译、源native签名校验、当前开局阻塞定位及1项新增消费者集成检查。夹具在复制BootyBay中延迟创建单位，跨API检查区域进入、3次物品事件、视野覆盖/停止、基本类型/句柄读写与清理、外观/高度状态及CPU后台解码；通过1、失败0，GPU未执行。夹具生成器保留原图只读，所有map/JSON/log仍写 `tmp/docs-artifacts/war3/`。

Amazonia原globals/config/main与250ms推进退出0：102单位、55触发器、83事件，bj_gameStarted=true，无Game.dll；显式静音device voices/DLS均为0。DotA最新到121单位/13触发器/74事件，在 `Scripts/war3map.j:91823` AddUnitToStock失败。当前Windows会话Disconnected，实际D3D9/9Ex/On12设备创建均失败；新增GPU画面/输入/恢复/释放仍排队，未关闭阶段A。已有3fc434c帧不复用为新增GPU消费者通过证据。

原始证据为 `live-world-{build.log,consumers.log,streaming.log,amazonia.log,dota.log,amazonia-render.log}`，均在 `tmp/docs-artifacts/war3/`。未运行旧全套、三图完整回归、性能或逐位原件对照。原件精度、完整交互和性能继续合并验证，旧MEngine161–163继续延期。实现细节与复现命令见live-world.md。


## 阶段A/B：商店、训练与人口（W035–W037）

| 任务 | 主要路径 | 实际消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- | --- |
| W035商店库存和购买 | session_commerce、commerce、session_entities | 源售卖清单/价格/补货，库存及中立订单native，真实扣费/单位/物品/事件 | 原件库存/买家选择/前置/出生点/售卖时序、重入、DotA商店；英雄雇佣额度及物品使用/出售另行实现 | 已接入；编译通过，运行待阶段验证 |
| W036单位生产与人口 | session_production/food/orders/tick/callbacks | 7项队列、扣费/退款、队首预留、完成单位/事件/集结点、人口生命周期/转让 | 队列/事件重入删除转让、资源溢出/人口边界、死亡/取消/出口阻塞、完整类型/原件精度 | 已接入；编译通过，专项夹具排队 |
| W037源产品命令区 | game_commands/view、object_data/session_game | 产品图标/位置/热键/价格/库存/禁用、进度/取消，流式图标、GetObjectName及能力名称表 | 真窗口鼠标/键盘/热键冲突/工具提示/源HUD排版、动态GPU、地图切换与三图回归 | 已接入；GPU及输入待测 |

只执行开发必需Win32 Release产品和新消费者程序编译、差异检查与DotA开局阻塞最小复现。编译无警告。DotA已越过AddUnitToStock和GetObjectName，当前121单位/13触发器/74事件，停在Scripts/war3map.j:8416的SetPlayerHandicapXP；main未完成。没有运行专项夹具、旧全套、三图完整回归或性能基准。新消费者生成器和运行命令见commerce.md，原始日志在tmp/docs-artifacts/war3/commerce-{build.log,dota.log}。阶段队列及旧MEngine延期状态保持开放。


## 阶段A/B：英雄成长和地图标记（W038）

| 主要路径 | 实际消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- |
| session_hero、entities/session、game_commands、session_world/game_view | 源经验阈值/公式、等级/三属性/HP/MP/技能点、经验倍率/暂停、原版能力学习/事件与HUD；Alt小地图资源/绘制 | 原件倍率适用范围/舍入/属性语义、历史规则集、升级/学习重入、完整效果、图标/输入/GPU；自定义w3a、完整战斗及经验分配未完成 | 已接入；必要编译/开局阻塞定位，专项夹具待阶段执行 |

英雄与商店共用war3_commerce_tests/复制BootyBay夹具，新增经验倍率/暂停、升级/学习上下文、属性及生命上限检查，未执行。DotA越过SetPlayerHandicapXP、SetAltMinimapIcon和GetItemType，最新123单位/1物品/67触发器/700事件，停在UnitAddItem拾取脚本的IsUnitIllusion（Scripts/war3map.j:17014）；main未完成，幻象子系统仍待实现。Win32 Release产品及扩展消费者编译无警告，字面量native签名静态核对通过。源签名与说明见heroes.md。没有扩大为旧全套、三图完整回归、性能或原件逐位检查。


## 阶段A/B：能力、幻象与物品使用（W039–W041）

| 任务 | 路径与实际消费 | 合并待测 | 状态 |
| --- | --- | --- | --- |
| W039能力覆盖 | object_data；w3a元数据/等级/Data槽/继承，能力查询/英雄学习/物品共用 | 复杂覆盖/索引/损坏文件/历史规则；自定义效果仍逐项实现 | 编译/开局读取通过，专项待测 |
| W040物品与幻象 | session_illusion/item_use/inventory、game_view/commands；魔棒实例、药水、次数/魔法/冷却、事件/定时生命/人口、输入/蓝色外观 | 原件复制/倍率/时序、重入删除、输入/目标/失败/GPU、释放/性能 | 已接入，消费者夹具未执行 |
| W041基础脚本伤害 | session_damage/callbacks；源分类/基础护甲/幻象倍率、伤害/来源/死亡/击杀者 | 完整防御/护盾/魔免/自动战斗/经验尚未实现；原件公式/边界/重入 | 已接入，数值/事件夹具未执行 |

开发必需Release产品/扩展消费者编译通过；22个字面量native声明和生成器语法检查通过。DotA原main已完成，123单位/1物品/205触发器/1,303事件，无Game.dll；250ms推进仍在延迟CreateQuest失败，完整开局未通过。专项夹具复用war3_commerce_tests，增加w3a/w3t覆盖、召唤/真假、伤害倍率、药水/冷却和定时生命/人口断言，保持待阶段执行。REA确认原版IsUnitIllusion注册和单位标志，细节见illusions-items.md。新GPU、专项夹具、三图完整玩法和性能未执行。


## 阶段A/C：任务窗口与开局查询（W042–W043）

| 任务 | 实际消费 | 合并待测与缺口 | 状态 |
| --- | --- | --- | --- |
| W042任务状态/窗口 | session_quest、quest_dialog、game_view、glue；真实句柄/目标/发现/完成/失败/通知，原QuestDialog FDF/纹理/字体/勾选/F9/焦点/文字翻页 | GPU/源锚点/皮肤/长文/真实输入/增删/释放；完整滚动条和未发现任务展示、暂停规则待完成/对照 | 已接入；编译通过，窗口/专项夹具待测 |
| W043空槽与源分类 | session_entities/main；空物品槽查询、武器启用位/类型/目标和召唤分类、任务数量日志 | 非零失效句柄/边界、完整类型、原件分类精度及重入；未知状态分类仍明确失败 | 原件空槽依据及DotA阻塞复现通过；完整待测 |

必要Release产品及扩展消费者编译无警告，8个字面量任务native声明核对通过，实际DotA模块绑定/创建任务通过。DotA原main完成：123单位/1物品/205触发器/1,303事件；250ms推进创建6任务后在Scripts/war3map.j:32750的IsPointBlighted失败，无Game.dll，完整开局未通过。任务/目标/通知、空槽和近战源分类断言加入既有消费者，尚未执行。原始证据为tmp/docs-artifacts/war3/quests-{build,dota}.log、quest-item-*-rea.json。没有运行专项夹具、三图完整玩法、GPU或性能；旧MEngine延期状态保持。


## 阶段A/B：荒芜、地表查询和持续恢复（W044–W045）

| 任务 | 实际消费 | 合并待测与缺口 | 状态 |
| --- | --- | --- | --- |
| W044动态荒芜/地表查询 | world_blight/session_blight、terrain_blight/scene/layout；原WPM/顶点、范围写入、同源查询、16×16可见区域失效/掩码/VB更新、源地表/变体 | 原件边界/归属/量化、缺失WPM、初始/动态GPU/切图/预算；金矿和完整地形/路径写入另行实现 | 已接入；编译/开局路径通过，GPU/专项待测 |
| W045持续恢复 | session_regeneration/entities/tick；源HP/MP/类型、昼夜/荒芜和英雄属性、实际生命/魔法/死亡 | 精度/负恢复/暂停/重入、全族/英雄/幻象、性能和资源释放 | 已接入；编译通过，数值夹具待测 |

必要Release产品/扩展消费者编译无警告，7个字面量native声明及生成器语法检查通过。DotA原main及250ms、2,000ms模拟均退出0，bj_gameStarted=true，无Game.dll；只定位开局后的首批定时器路径，不代表完整玩法通过。原始记录在tmp/docs-artifacts/war3/blight-{build,dota,dota-2000ms}.log；REA/源统计及边界见blight-regeneration.md。消费者增加荒芜/幂等/恢复开关断言，尚未执行。新增GPU、专项夹具、三图完整回归和性能仍排队；当前会话1为Disconnected，旧MEngine延期状态保持。MSVC核心/客户端已启用并核对8路编译，不改变运行时结论。

## 攻城兵种攻击能力阶段待验证

路径：session_siege_attacks、passives／combat／spells／session、被动源定义／前置／登记／调度、攻击发射与命中、buff伤害／修理、源资源流。Aflk／Afsh／Abof／Aliq／Aroc及w3a派生有真实消费者。

状态：实现接入；Win32 Release产品增量编译通过、无警告，差异检查通过；不执行新增专项、三图、GPU、原版精度或性能回归。集中验证三档范围／固定伤害／主目标排除／中甲与无甲、原武器载荷／miss／防御／多能力、火场时序／持续／叠加／空间查询／孤立来源、液体炸弹禁修理／恢复／重复刷新／清理，弹幕第二武器／多目标／预算／对地并行／命令与时钟、研究／可用开关／w3a／形态／库存／回调死亡移除易主、UI／GPU／音效／AI／三图长局和内存释放。证据与构建日志在tmp/docs-artifacts/war3/siege-attacks/；原版精度边界见[实现说明](siege-attacks.md)。旧MEngine队列保持延期。

## 疾病云雾与瘟疫投掷阶段待验证

路径：session_plague、passives／entities／spells／session、被动源定义／前置／登记与空间调度、攻击载荷／落弹、死亡／限时生命、buff周期伤害和damageUnit疾病光环魔免分支。Aapl／Aap1–Aap4、Apts及原地图覆盖有真实消费者。

状态：实现接入；必要Win32 Release产品编译通过、无警告，差异审查通过。未执行新增专项、三图／原版精度、UI／GPU／音效／AI和性能回归，均留功能阶段合并。集中验证源感染时限／秒脉冲／多源与重复、离开范围／来源死亡移除易主／归因、亡灵／目标与魔免／驱散／虚无分类、checkDep／研究／开关／变形／幻象、真实云雾死亡和落弹生成／数量／原事件／原模型／不可选取与人口路径、脚本枚举／归属／限时清理／复活重入、地形对象攻击和三图长局／内存／切图释放。证据与构建日志在tmp/docs-artifacts/war3/plague/；原版边界见[实现说明](plague.md)。旧MEngine队列继续延期。

## 不稳定化合物、霜冻攻击与掠夺阶段待验证

路径：session_concoction／session_frost_pillage、spells／passives／entities／session、施法目标／命令／支付／释放、独立tick与死亡／移除／形态、攻击发射／命中、效果呈现／颜色／资源、冻结生产／研究／建造／升级／修理／矿井与资源返还、掠夺余量生命周期。Auco／Afrb／Afrz／Asal及原地图覆盖有真实消费者。

状态：实现接入；必要Win32 Release产品增量编译通过、无警告，差异审查通过。未执行新增专项、三图、原件精度、UI／GPU／音效／AI或性能回归，留功能阶段合并。集中验证原手动输入与自动开关依据、飞行／原载体／目标失效／死亡消耗与人口／回调清理、源主次伤害／分类／免疫与叠加、原弹道与霜冻目标／冻结全部建筑消费者及恢复、掠夺实际伤害／费用／两种小数余量／阈值／原舍入／统计和税收／资源事件／删除易主重入；完整UI／GPU／音效／AI、三图长局和内存／切图释放。证据与构建日志在tmp/docs-artifacts/war3/concoction-frost/；边界见[实现说明](concoction-frost-pillage.md)。旧MEngine队列保持延期。

## 毒素攻击、物品法球与腐蚀喷吐阶段待验证

路径：session_weapon_effects、combat／entities／passives／spells／session、被动定义、装备与库存、能力可用开关、武器启用／发射／命中、周期伤害／非致死回调和单位移除。Apoi／Apo2／Aven／Aspo／Acor／Afra、AIfb／AIob／AIcb／AIpb／AIlb／AIsb及派生有实际消费者。

状态：实现接入，必要Win32 Release产品增量编译通过；未执行玩法、三图／原件精度、UI／GPU／声音／AI或性能回归，保持阶段待验证。集中验证毒剂叠加身份／四位标志／时钟／暂停／驱散与免疫／来源死亡移除易主／归因、非致死与伤害事件／护盾／灵魂链接／复活重入；法球库存优先级／主动箭矢冲突／多件加成／首次减甲／火焰范围／英雄及召唤物概率／净化缓慢和死亡奴仆；科技与可用开关／物品增减／形态／幻象／原附件清理、第二武器对空及完整表现。已知实现缺口：Hpal／Obla等缺少源弹道速度时当前即时结算，原缺省飞行尚未还原；Acor DataA持续伤害尚未接入。原始证据与构建记录在tmp/docs-artifacts/war3/weapon-effects/，边界见[实现说明](weapon-effects.md)。旧MEngine队列继续延期。

## 雕像恢复与月亮井补给阶段待验证

路径：session_restoration、spells／entities／combat／session、原能力定义、手动／自动施法和释放、smart／follow／取消、装备／能力／科技／归属刷新与昼夜再生。Arpl／Arpm／Arpb／Ambt及Amb2的原型／地图覆盖接入真实生命、魔法、费用和源按钮模型。

状态：必要Win32 Release产品增量编译通过、无编译警告，差异检查通过；未执行玩法夹具、三图、UI／GPU／音频／AI或性能回归。集中验证0／1／5／6及更多目标／最低缺损／受影响与计费上限／最低费用／低魔法和空放、多源／同源短状态／幻象／魔免／驱散／虚无与恢复上限、原自动双开／门槛／选择顺序及冷却；月亮井双资源均分／余量／不足与单项系数／原精度、手动远目标／右键多单位／接近／取消／供给忙碌／失效清理、夜间与研究／能力可用开关／类型／归属／地图覆盖、重入修改命令／死亡／复活／资源及费用事件精度。已知表现缺口：DataD水位及实际魔法量联动的原单位动画；当前自动门槛及最大预扣后返还的计费事件顺序待对照。完整原版窗口／音效／AI／三图长局、性能与切图释放保持阶段待验证。原始证据在tmp/docs-artifacts/war3/restoration/，边界见[实现说明](restoration.md)。旧MEngine队列继续延期。

## 法术书与遗忘之书阶段待验证

路径：session_spellbooks、spells／entities／session、定义／原订单表、库存与装备、借用与自身等级、原命令区／输入／层级／取消、普通／即时／相位／箭矢施法与共享冷却、英雄学习／技能点／句柄、脚本增删改级／科技／单位变身／工程替换。Aspb／Aret与原sbok／tret及对应地图覆盖有真实消费者。

状态：必要Win32 Release产品增量编译通过，无编译警告；差异及347项订单名严格排序检查通过；未执行玩法夹具、三图、UI／GPU、AI／音频或性能回归。集中验证原sbok三种子技能实际输入与支付／状态／目标、开关与反复打开／持久选择、共享冷却和普通／即时／相位／箭矢／多本及嵌套／同订单合并、科技／脚本等级／增删／变身／工程／来源回收与重入；遗忘之书普通／终极／被动／工程／额外技能点／库存使用事件／次数／重训期间状态实体与冷却及重新学习；真实命令面板／文本／皮肤／热键／返回／选择切换、完整三图／DotA长局、音效／AI、帧耗时／内存与切图释放。原随机、共享／物品事件精确语义、幻象及完整组合仍待对照，11技能／256候选／256活动书／16层边界与循环失败须合并验证。原始证据在tmp/docs-artifacts/war3/spellbooks/，范围及限制见[书籍玩法](spellbooks-retraining.md)。旧MEngine队列继续延期。

## 召唤道具与迷你建筑阶段待验证

路径：session_item_summons、item_use／spell_info／spells／area_spells／session、玩家种族解析、原建筑物理放置、GameView建筑预览／模型流式加载。AIfs／AIsh／ANwm／AIrd／AUin／AIbl及原版派生与地图覆盖连接真实消费者。

状态：实现接入，必要Win32 Release产品增量编译通过、无编译警告，差异检查通过；未运行新增玩法夹具、三图／原件精度、UI／GPU／AI／声音或性能回归。集中验证两组／重复／数量与预算／落点不足、尸体与地狱火延迟／伤害／事件，六槽／次数／共享冷却／取消／库存及回调清理；玩家种族与英雄种族不同／原列表／单条及5条／源时长／0时限、预览模型／网格／物理放置／远距接近／免费自动施工／人口／受伤／暂停冻结／完成取消／易主销毁。原布局、随机、事件次序、施工及位移精度／完整表现待对照。机械小动物／地雷／诱饵见后续功能记录。证据与构建记录在tmp/docs-artifacts/war3/item-summons/，边界见[实现说明](item-summons-buildings.md)。旧MEngine队列保持延期。

## 地雷与怪物诱饵阶段待验证

路径：spells／passives／spirit_split／combat定义、session_item_summons／item_use／spell_info／spells／area_spells／summons、活跃被动注册与空间检索、隐形／侦测、守卫时钟／引诱命令、战斗目标／返航和Adda死亡爆炸。AIpm／Amin／Adda／AImo及原派生和地图覆盖有真实消费者。

状态：实现接入，必要Win32 Release产品增量编译通过、无编译警告，差异检查通过。未运行新增玩法夹具、三图／原版精度、UI／GPU／AI／声音或性能回归。集中验证原激活／隐形／侦测／暂停／禁用／复活／易主、触发分类／范围边界、击杀与触发死亡后的延迟／双区域／魔免建筑／地形对象／多能力和回调归因，诱饵原数量／周期／目标／多人来源／无视野命令／守卫距离／失效返航与取消，以及库存／UI／音效／三图长局／帧耗时／内存释放。触发精度、伤害类型／多源顺序、诱饵选怪／睡眠和周期语义保持原版待对照；机械小动物见后续功能记录。源表／原字段名／摘要／脚本及构建日志在tmp/docs-artifacts/war3/item-summons/，消费和边界见[实现说明](mines-lure.md)。旧MEngine队列保持延期。

## 机械小动物阶段待验证

路径：object_data单位枚举／地图覆盖、spell_info源动物地形池、库存施法／召唤／状态、自动攻击过滤、敌方中立外观／库存隐藏、现有移动／驱散与反馈。Amec／Bmec及地图派生有实际消费者。

状态：实现接入，必要Win32 Release产品编译与差异检查通过、无编译警告；未运行新增玩法夹具、三图／原件精度、UI／GPU／AI／声音或性能回归。集中验证地形池／通配／回退／源特殊和战役标志／飞行水上／自定义动物／原随机顺序、碰撞落点与多数量；6槽／持续标记／召唤／驱散／反馈／回调／移除／易主／死亡复活、敌我普通自动攻击／自动施法／凤凰火焰与强制攻击／侦测／原中立外观／控制／声音及完整UI，三图长局／帧耗时／内存／切图释放。原候选序、标记移除和敌方伪装精度未对照。原表／摘要／REA和产品构建证据在tmp/docs-artifacts/war3/item-summons/，边界见[实现说明](mechanical-critters.md)。旧MEngine队列保持延期。

## 战役提示、目标朝向与跳过阶段待验证

路径：session_text／session_indicators／game_indicators／session_match、实体／模型姿态、场景与 GameView、小地图资源流。必要 Win32 Release 产品编译与差异检查通过；Prologue01 原 main 初始化通过，静音模拟越过原 PingMinimap 阻塞，随后遇到未绑定的 TriggerWaitForSound，未完成 20 秒模拟。证据：tmp/docs-artifacts/war3/campaign/prologue-next-integrated.log。

集中验证 Ping 动画／大小／颜色／声音／重叠和 GPU 状态；单位／物品／可破坏物指示的叠色／透明度／时序；LookAt 的骨骼轴、目标生命周期／附件／插值；Esc 在不同控制、界面和触发器状态下的事件与原版行为。完整战役画面、声音、性能与三图继续留功能阶段；旧 MEngine 队列保持延期。

## 战役声音等待阶段待验证

路径：session_sound／sound／audio、脚本线程及离线 main-check 时钟。Win32 Release 产品编译通过，序章静音模拟越过 TriggerWaitForSound，随后在 SetUnitFacingTimed 未绑定处停止；日志 tmp/docs-artifacts/war3/campaign/prologue-sound-wait.log。

集中验证原声音自然结束／正负偏移／空与未播放／提前停止／淡出／销毁与独立播放、循环／重复启动／seek／变速／暂停、多个等待线程和上下文；比较真实 Miles 与静音离线时钟的行为以及完整战役声音和画面。原版唤醒条件及空声音／负偏移语义尚未确认。旧 MEngine 队列继续延期。

## 战役单位定时转向阶段待验证

路径：entities／session_entities／session_orders／session_combat／session_spells／session_concoction／session_roots。Win32 Release 产品编译与差异检查通过；Prologue01 原 main 和 20 秒静音模拟通过，1 个脚本线程继续运行，未加载 Game.dll；日志 tmp/docs-artifacts/war3/campaign/prologue-facing.log。

集中验证正负／跨 0 与 180 度、0／极短／长时长、重复和即时覆盖、暂停／死亡／隐藏／移动／战斗／施法与扎根的优先级及原版画面和插值；完整序章、音频与三图性能继续阶段验证。旧 MEngine 队列继续延期。

## 战役教程镜头与选择阶段待验证

路径：session_world／session_collections／session。GetCameraTargetPositionLoc 为镜头目标生成独立 location，SyncSelections 与 GroupEnumUnitsSelected 连接单机选择快照。Win32 Release 产品编译与差异检查通过；之前版本的 Prologue01 原 main 和 60 秒静音模拟通过，未执行本次教程交互或三图回归，证据 tmp/docs-artifacts/war3/campaign/prologue-60-next.log。

集中验证 SmartCameraPanBJ 在静止／手动平移／跟随／镜头过渡时的目标查询与位置句柄生命周期；本地选择／取消／隐藏移除／过滤回调／连续同步、多人选择交换和等待，及教程实际救援／编组完整输入。SetItemDropID 及独立快照见后续物品来源记录；原版画面／声音／性能及旧 MEngine 待测项保持原状态。

## 模型动态光源阶段待验证

路径：model／model_data／model_pose。Win32 Release 产品编译通过；原 ArthasIllidanFight 模型解析 5 个灯光并完成 19 秒隐藏窗口绘制，日志 tmp/docs-artifacts/war3/campaign/model-probe/。

集中验证法线／骨骼／非均匀缩放、点／方向／环境灯、所有源动画／多光混合／Unshaded、材质／滤色／环境光与原版画面，以及跨模型／昼夜光、性能和资源释放。当前仅模型自身灯光，基础环境为近似值；旧 MEngine 队列保持延期。

## 空间声像与声锥阶段待验证

路径：audio／sound／session_sound／session／game_view。普通空间声音按监听方向与声源位置设置原版 Miles sample pan，声锥参数改变实际音量；Win32 Release 产品编译通过，实际听感尚未验证。

集中验证左右／正前／正后／垂直位置、转向／滚转／跟随、音量与范围／声锥内外／淡变、位置与朝向改变、静音／释放／抢占及原版 Miles 混音。当前声像及衰减公式为近似，区域堆叠声像见后续记录；原版精度、音频设备与性能留阶段验证。旧 MEngine 待测队列保持延期。

## 物品掉落来源与缓存版本阶段待验证

路径：entities／script_state／session_entities／session_cache。SetItemDropID 保存物品来源 rawcode，独立 gamecache v2 读写该值并兼容 v1；Win32 Release 产品编译通过，定向检查 v2 保存／读取／恢复与 v1 默认值通过，未加载 Game.dll，产物 tmp/docs-artifacts/war3/drop-cache-probe/。

集中验证空／销毁句柄、原序章死亡掉落及后续商店／拾取、跨关卡和所有物品格、损坏与旧格式迁移、存档／回放字段、原版 StoreUnit 及其他潜在来源字段消费者。原版普通存档保留该字段，但原版 gamecache 是否保留仍待对照；独立缓存格式不是原版格式。旧 MEngine 队列保持延期。

## 战役编组、区域与物品枚举阶段待验证

路径：session_collections／session_world／session_fog／session_inventory／session_research／script_state。Win32 Release 产品编译与差异检查通过；Prologue02 原 main 和 60 秒静音模拟通过，仍有 1 个脚本线程，未加载 Game.dll，日志 tmp/docs-artifacts/war3/campaign/prologue02-next.log；该运行不代表这些玩家交互路径已覆盖。

集中验证编组即时／点／目标命令和 ID 变体、空组／部分失败／回调修改成员、选中玩家和多人同步；移动区域尺寸／边界、地点明暗视野、物品过滤／持有／隐藏／销毁／嵌套上下文及研究开始／取消／完成事件。序章教程计数板见后续记录；三图、GPU／音频和性能留功能阶段。旧 MEngine 队列继续延期。

## 区域堆叠声定位阶段待验证

路径：sound。区域堆叠播放选择当前最大增益区域，以区域内最靠近监听点的位置计算左右声像；同增益时选择最近区域。Win32 Release 产品编译与差异检查通过，未执行实际听感检查。

集中验证进入／退出／重叠区域、相同增益及距离、监听方向旋转／高度、范围与声道抢占／静音，以及多声源和原版听感与性能。区域择选和声像公式仍待原版对照。旧 MEngine 待测队列保持延期。

## 战役计数板阶段待验证

路径：session_leaderboard／session／script_state／session_hashtable／game_leaderboard／game_view。Win32 Release 产品编译通过；Prologue02 环境的脚本创建、玩家关联、增项、显示及销毁与原 FDF／皮肤底板隐藏窗口绘制通过，未加载 Game.dll；探针位于 tmp/docs-artifacts/war3/leaderboard-probe/，未运行完整教程交互。

集中验证多玩家关联／更换／销毁、同玩家多项、增删／索引／空列表／排序、颜色覆盖／显示选项／长文本／透明度／hashtable，Prologue02 真实教学计数与事件、原版屏幕锚点／行距／图标／肤色及窗口比例。当前动态行布局和图标是近似实现；三图、GPU／音效／性能与旧 MEngine 队列保持阶段待验证。

## 多列计分板阶段待验证

路径：session_multiboard／session／script_state／session_hashtable／game_multiboard／game_view。Win32 Release 产品编译和差异检查通过；真实 Prologue02 脚本环境下的状态／尺寸／句柄和原 FDF／默认图标隐藏窗口探针通过，未加载 Game.dll，记录在 tmp/docs-artifacts/war3/multiboard-probe/；未覆盖实际 GameView 点击或 DotA。

集中验证行列扩缩／失效句柄／重复释放／销毁／hashtable、所有批量与单项样式／颜色／宽度／UTF-8 和颜色标记、地图覆盖图标／缺图／异步加载、最小化按钮／输入拦截／遮挡／多板、最大尺寸与裁切、多客户端独立显示和原版视觉。原版屏幕锚点／行距／图标边框、清理与样式语义尚待对照；原版性能、三图、GPU、音频及旧 MEngine 队列继续阶段验证。

## 玩家让分生命值阶段待验证

路径：session／session_entities／session_ownership／session_building_upgrades。Win32 Release 产品编译通过；BootyBay 定向检查新旧单位倍率、生命比例和易主通过，未加载 Game.dll；日志 tmp/docs-artifacts/war3/terrain-handicap-timer-probe/result.log。

集中验证菜单／脚本倍率、极值／精度／取整、英雄生命／力量／装备／研究、建造升级／变形／幻象／易主／复活／跨关恢复、原版数值和事件顺序。完整对战与旧 MEngine 队列按阶段验证。

## 地形雾与计时窗口阶段待验证

路径：world／session_world／terrain_fog_render／session_dialogs／game_timer_dialog／game_view。Win32 Release 产品编译通过；会话定向检查雾设置／重置、计时倍率／覆盖清除及原 TimerDialog.fdf 隐藏窗口绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/terrain-handicap-timer-probe/result.log 与 timer-dialog-probe/。未覆盖实际 GameView。

集中验证 W3I／地图覆盖／Reset、线性／指数雾／范围／颜色、硬件能力／深度／透明模型／天空／水和玩家视野遮罩；计时器启动／暂停／重置／销毁／周期、实时覆盖／速度／颜色／多个窗口与计分板并存、字号／布局和原版准确性。完整战役、三图、性能及旧 MEngine 队列保持阶段待验证。

## 腐蚀喷吐持续伤害阶段待验证

路径：entities／spells／session_weapon_effects／session_spell_effects。Win32 Release 产品增量编译、差异检查通过，未运行玩法测试。

集中验证 Recb 前置、建筑命中与持续伤害、刷新／多来源叠加、非整秒时限、暂停／死亡／易主／来源移除、免疫和护甲、事件顺序及原版画面；法球缺省飞行速度仍待实现。

## 人口维护费阶段待验证

路径：session／session_food／session_callbacks／game_view。Win32 Release 产品增量编译、差异检查通过，未执行玩法测试。

集中验证 ROC／TFT 阈值边界、地图配置覆盖与短列表、脚本修改维护率、人口预留／取消／易主及状态事件重入、金币／木材入账与取整、原版顶栏文字与布局。跨玩家资源转移及其交易税已接入并另列阶段待测；三图、完整对局与性能按阶段验证。

## 盟友资源转移阶段待验证

路径：session／session_match／game_state／game_view／game_alliance_dialog。Win32 Release 产品编译通过；BootyBay 会话最小检查转账余额、余额不足原子拒绝及税率边界通过；原版 FDF 隐藏窗口构造及绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/、alliance-probe/。

集中验证真实窗口输入／金额多玩家转移、资源不足／取消／关闭、联盟变化与离场、余额上限、转账中的脚本状态事件及重入、金币／木材税率方向／取整、统计和原版行为；联盟关系设置、共享控制及局域网同步仍待实现。

## 联盟与共享视野设置阶段待验证

路径：game_alliance_dialog／game_view／session_match。Win32 Release 产品编译通过；BootyBay 最小会话验证联盟五个状态、共享视野及地图锁标志通过，未加载 Game.dll。

集中验证面板接受／取消与脚本重入、玩家离开、联盟变化事件和共享视野生效、原版强制联盟／地图锁／隐藏规则及视觉一致性；共享单位控制基础消费已接入并另列阶段待测；共同胜利开关已接入并另列阶段待测；局域网同步尚待实现。

## 共享单位控制阶段待验证

路径：session_match／session_ability_commands／session_commerce／game_view／game_commands／game_spells／game_transport／game_alliance_dialog。Win32 Release 编译通过；BootyBay 会话最小检查权限方向、撤销、高级控制和按单位拥有者检查建造资金通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实面板勾选／取消、框选／多单位下令、施法／建造／生产／研究／修理／货舱、授权撤销时目标和队列、原版普通／高级共享对英雄／物品／商店的权限和费用，及多客户端同步。

## 共同胜利阶段待验证

路径：game_alliance_dialog／game_view／session_match。Win32 Release 产品编译通过；BootyBay 最小会话检查状态开关通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实面板接受／取消、原版状态初值／W3I 势力与锁定、脚本事件重入及近战胜负判定、多客户端同步。

## 玩家地面命令入口阶段待验证

路径：player_commands／game_view／game_commands。Win32 Release 产品编译通过；BootyBay 最小会话检查共享单位保持命令及无权限命令拒绝通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实鼠标／热键、移动／攻击移动／巡逻／建筑集结／停止／保持、多选顺序、重入移除与授权撤销、事件顺序及与原先单机行为一致性；其他命令、网络锁步与跨客户端同步待实现。

## 玩家目标命令与施法入口阶段待验证

路径：player_commands／game_view／game_spells。Win32 Release 产品编译通过；BootyBay 最小会话检查目标订单、空目标拒绝、共享单位无目标施法通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证实际鼠标／技能输入、单位／物品／可破坏物目标、点目标／即时施法、多单位 Channel、权限撤销与脚本重入、原版事件顺序和单机行为；跨客户端命令队列及网络仍待实现。

## 局域网房间发现阶段待验证

路径：lan_discovery／lan_browser／main。Win32 Release 产品编译通过；本机模拟 UDP 主机的搜索及响应、有效／截断 GAMEINFO、主菜单局域网按钮及原 FDF 隐藏窗口绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/lan-probe/。

集中验证实际 1.27 主机、多网卡／广播／端口占用、房间上线变化／过期、错误恢复、中文名称与键盘鼠标、原版界面；加入大厅及本地地图字段比较已接入并另列待测；创建大厅已另列待测；地图就绪及双客户端对局同步尚未实现。

## 局域网加入大厅与地图核对阶段待验证

路径：lan_join／lan_lobby／lan_mapcheck／lan_browser。Win32 Release 产品编译通过；本机模拟 TCP 主机检查加入请求、槽位分片、玩家／PING／地图声明、PONG 与退出；BootyBay 大小／CRC32、非法路径与后台校验以及大厅和槽位 FDF 隐藏绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/lan-join-probe/result.log。

集中验证真实 1.27 互通、槽位更新／拒绝／断线／超时、名字与多字节、路径安全和异步取消、实际游戏地图字段对照、完整大厅交互与重复进出资源释放。加入确认后尚未发送地图就绪，创建大厅与地图传输已另列待测；对局同步待实现。

## 玩家建造与生产命令阶段待验证

路径：player_commands／game_commands／game_view。Win32 Release 产品编译通过；BootyBay 最小检查共享单位训练按拥有者扣款及取消生产通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实界面建造落点、训练／研究／升级／复活／英雄学习、队列索引与取消退款、资源归属、权限撤销、重入和原版时序；网络锁步与剩余输入仍待实现。

## 玩家物品与货舱命令阶段待验证

路径：player_commands／game_view／game_transport。Win32 Release 产品编译通过；BootyBay 最小会话检查高级共享丢弃、普通共享拒绝库存操作通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证即时／点／单位物品使用、热键／鼠标丢弃、权限撤销及物品移除重入、普通／高级共享拾取和库存权限、货舱乘员卸载、原版事件与多客户端同步。

## 局域网大厅聊天阶段待验证

路径：lan_join／lan_lobby／lan_browser。Win32 Release 产品编译通过；本机模拟 TCP 主机检查 0x28／0x0F 收发、UTF-8、发收方、长度限制、过滤和畸形包，原版 FDF 隐藏窗口绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/lan-join-probe/chat-result.log。

集中验证原版 1.27 主机、真实窗口中文与长消息、焦点／滚动／断线、恶意网络字符串显示、消息顺序及地图未就绪超时；自研对局聊天见上方待测项，原版对局聊天协议仍待实现。

## 玩家商店、联盟与聊天命令阶段待验证

路径：player_commands／game_commands／game_alliance_dialog／game_view。Win32 Release 产品编译通过；BootyBay 最小会话检查统一入口资源转移和共同胜利状态通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实商店／购买者与费用、游戏聊天事件、联盟变更／取消及资源转移的重入和时序、原版权限、网络身份与同步；其他未迁移的输入和锁步仍待实现。

## 局域网创建房间和主机大厅阶段待验证

路径：lan_host／lan_host_ui／lan_browser／lan_mapcheck／CMakeLists。创建页浏览地图、后台读取地图元数据和校验字段，主机处理搜索、加入、槽位显示、聊天及断线；Win32 Release 产品编译通过；本机探针覆盖 UDP 搜索、两客户端加入、地图声明、槽位广播、双向聊天、断线释放和主机关闭，证据 tmp/docs-artifacts/war3/lan-host-probe/result.log。

集中验证原版 1.27 双向互通、真实创建页及大厅操作、多网卡／端口占用、地图字段／编码、多人加入／拒绝／断线与恶意报文、资源释放；基础槽位设置与地图传输已另列待测；自动就绪、开始及对局同步尚未实现。

## 局域网槽位设置阶段待验证

路径：lan_host、lan_host_ui、lan_join、lan_lobby。房主可设置开放／关闭／电脑难度和自身及电脑槽位；加入方请求自身队伍、颜色、种族及让分，主机按地图选项约束并广播。

Win32 Release 产品编译通过；本机定向双端探针覆盖四类请求、颜色交换、固定设置、自定义队伍迁移和电脑专用槽保护，证据 tmp/docs-artifacts/war3/lan-host-probe/slot-probe/result.log。集中验证原版 1.27 双向互通、真实鼠标键盘和弹出菜单、固定选项与队伍迁移、远端广播／断线重入、全部地图和完整对局；地图传输已另列待测；自动 ready 和同步尚未实现。

## 局域网地图就绪协议阶段待验证

路径：lan_host、lan_join。加入端增加四字段匹配后的就绪声明发送能力；主机解析状态并显示声明，界面仍不自动发送，未启用开始。

本机双端定向探针检查匹配／失配与状态广播、断线清理，证据 tmp/docs-artifacts/war3/lan-host-probe/ready-probe/result.log。集中验证畸形报文、重复宣告、原版 1.27 互通及下载／加载／锁步；远端声明不等于服务端验证地图。

## 内存地图归档及字段校验阶段待验证

路径：archive、lan_mapcheck。页面文件映射可在内存挂载地图，单 worker 支持内存地图字段计算与取消；网络下载已接入，会话尚未接入。Win32 Release 编译通过；BootyBay／DotA 实际地图成员、枚举、fork／卸载、并发读取和坏数据失败清理，以及 BootyBay 文件／内存四项字段、异步元数据与取消探针通过。证据 tmp/docs-artifacts/war3/archive-memory-probe/result.log、memory-mapcheck-probe/result.log。

集中验证网络接收与会话所有权、页对齐零填充下畸形／截断文件边界、原版字段和报文、大地图内存峰值、长期切图释放及系统级磁盘活动；校验期间输入须保持不可变。

## 局域网地图内存传输阶段待验证

路径：lan_host、lan_host_ui、lan_join、lan_lobby、lan_mapcheck。建房读取不可变地图快照并从同一快照计算声明；缺图／不匹配时请求地图，按块验证和确认并在内存重算字段，匹配后保留快照。自动就绪、开始和会话接入尚未实现。

Win32 Release 产品编译通过；本机两客户端并发接收真实 BootyBay，逐字节与主机快照一致并核对四项字段，未加载 Game.dll；快照及取消检查通过；模拟主机的错误 CRC、错误偏移与中途取消检查通过。证据 tmp/docs-artifacts/war3/lan-transfer-probe/result.log、lan-snapshot-probe/result.log、client-transfer-invalid-probe/result.log。集中验证 1.27 原版双向互通、缺图／错误块／断线／超时、UI 进度、慢网／大地图与内存、声明变更、系统磁盘活动及会话所有权。当前不支持续传或重试。

## 玩家自动施法命令阶段待验证

路径：player_commands、game_commands。技能及修理自动施法经统一玩家命令入口执行并检查控制权限；Win32 Release 集成版本编译通过，待集中验证真实右键、启停与订单事件、权限撤销和原版行为。网络动作编码及锁步尚未接入。

## 内存地图会话准备阶段待验证

路径：map_preparation。已校验的内存地图可后台准备配置完成的会话；World 保留地图视图。Win32 Release 集成版本编译通过，BootyBay 内存准备、线程退出／源缓冲释放后资源读取、玩家设置和 main 启动探针通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/memory-session-probe/result.log。集中验证 LAN 会话所有权与退出重开、随机种子／槽位、本地玩家、完整界面及多人同步；大厅尚未触发此入口。

## 局域网加载屏障阶段待验证

路径：lan_host、lan_join。显式倒计时与开始加载、玩家加载完成广播和全部参与者屏障已接入；加载状态冻结槽位并处理断线与超时。Win32 Release 集成版本编译通过，本机双客户端探针覆盖就绪前拒绝、等待最后玩家、断线与未启用拒绝，证据 tmp/docs-artifacts/war3/lan-loading-probe/result.log。集中验证 1.27 互通、真实加载时序／超时／断线以及与会话和模拟锁步的衔接；大厅尚未启用开始。

## 玩家对话框及过场命令阶段待验证

路径：player_commands、game_flow_ui、game_view。对话框点击和过场跳过进入玩家命令入口，Win32 Release 集成版本编译通过；BootyBay 最小会话探针覆盖权限、隐藏／重复点击及过场事件归属，未加载 Game.dll，证据 tmp/docs-artifacts/war3/ui-event-command-probe/result.log。集中验证真实输入、回调销毁／重入、原版事件时序和后续网络身份；玩家选择及暂停／退出等仍待同步设计。

## 局域网动作与时间片传输阶段待验证

路径：lan_host、lan_join。显式启用后传输有界 W3GS 动作、时间片分片和逐玩家逐轮校验；动作字节尚不连接游戏模拟。Win32 Release 集成版本编译通过，本机三端探针覆盖空帧、跨分片动作顺序、逐轮校验一致及不一致后停止，模拟主机的错误 CRC 与不完整时间片拒绝通过；证据 tmp/docs-artifacts/war3/lan-timeslot-probe/result.log、lan-timeslot-invalid-probe/result.log。集中验证原版 1.27 互通、其他异常报文及延迟／断线、原版动作编码与对象映射、校验语义和网络时间驱动；失步分组恢复、锁步对局和大厅启用仍未实现。

## 局域网会话配置与动作时间驱动阶段待验证

路径：lan_host、lan_join、lan_setup、session、map_preparation、lan_actions、lan_time_driver、lan_simulation、CMakeLists。SLOTINFO 种子可传到会话初始化；显式槽位映射应用玩家配置。按文档字段编解码部分经典动作，时间驱动器整帧先验证并按网络毫秒推进；模拟桥当前仅消费暂停／恢复，其他动作明确拒绝。大厅和 GameView 尚未使用该链路。

Win32 Release 编译通过。本机 seed 从主机传给双客户端、双会话映射及项目 RNG 序列一致、BootyBay 时间驱动和暂停／恢复／未知动作拒绝、编码边界与截断检查通过；证据 tmp/docs-artifacts/war3/lan-seed-probe/result.log、lan-setup-probe/result.log、lan-time-driver-probe/result-integrated.log、lan-simulation-probe/result.log、lan-action-codec-probe/result.log。

集中验证 1.27 动作字节与事件／时间边界、原版随机与校验、网络 peer 到地图玩家和对象 ID 映射、真实游戏输入、多端模拟／断线、会话生命周期及真实界面。当前尚不能启动联网对局；现有 RNG 一致性仅针对本实现。

## 玩家选择与局域网限定动作阶段待验证

路径：session、session_callbacks、session_collections、session_entities、session_food、session_orders、lan_simulation。会话保存每个玩家的选区，LAN 动作在显式对象映射下消费选择及部分基础订单；真实大厅与对象编号映射尚未接入。

Win32 Release 产品编译通过；BootyBay 探针覆盖本地／远端同单位选择、JASS 查询、事件玩家、回调重入与移除清理，同一时间片选择后保持及无效映射／排队标志整帧拒绝，证据 tmp/docs-artifacts/war3/player-selection-probe/result.log、lan-selection-actions-probe/result.log。

集中验证原版 1.27 对象 ID 及动作编码、选区顺序／事件归属、地图物品／技能／排队、动态创建和销毁、变形／货舱自动选中、真实多人同步与界面。现有解析器必须由调用方提供可靠映射；没有原版映射时不能开始联机。

## 局域网输入编码与游戏视图接口阶段待验证

路径：lan_action_encoder、lan_simulation、game_view、game_flow_ui、game_commands、game_spells、game_transport、game_alliance_dialog、CMakeLists。新增有界选择和基础订单编码，要求调用方提供对象双向映射及原始动作字段；游戏视图可显式接收时间片并将玩家命令交给外部提交器，网络模式不按本地帧推进模拟。未知命令和排队标志明确拒绝；网络模式的选择、脚本对话框与部分菜单操作暂不可用。

Win32 Release 产品编译已执行；功能与原版一致性尚未验证。集中验证编码／解码边界、选区和命令的时序及重入、单机行为、原版 1.27 对象编号与动作字段、双端同步和相机／UI 状态。大厅、对象编号来源、网络提交器、选择同步、完整命令、校验与断线处理仍待实现；目前不能启动联网对局。

## 排队动画模拟时钟阶段待验证

路径：model_sequence、model、scene_assets、session_animation、session_doodads、session_orders、session_destructables、session_volcano、session_world、world、game_view、scene_objects、CMakeLists。单位及可破坏物动画队列按模拟步进及源 MDX 序列时长推进，渲染和模拟共享序列匹配；常规队列出队不再由场景绘制推进；区域装饰物动画目标选择和状态变更已移入会话，需集中验证最近目标、随机相位、动态对象创建／删除／复用及动画命令先后。真实地图、隐藏／离屏、暂停／倍速、形态和死亡切换、模型缺失、多客户端与原版时序待集中验证，见[单位动画](animation-simulation.md)。

## 脚本物件伤害与死亡轮次阶段待验证

路径：session_damage、session_tick、session_destructables、session、entities。UnitDamageTarget 消费可破坏物和物品生命、无敌及死亡事件；widget 死亡事件检查对象和生命轮次。集中验证单位／物品／可破坏物有效及空句柄、无敌／死亡与返回值、各种伤害类型／幻象倍率、触发器回调删除／复活／再次致死、物品持有／装备清理、重叠路径占用，以及原版伤害与事件时序。UnitDamagePoint 已接即时／延迟和范围伤害，集中验证负／零／正延迟、暂停与多次同刻顺序、大小碰撞、单位／可破坏物／物品、己方／来源、移除／复活／移动重入、来源移除、无限大／非法参数、三图、DotA 高频范围伤害的帧耗时和原版目标筛选及时序；见[脚本物件伤害](widget-damage.md)。

## 游戏内选项与鼠标边缘滚动阶段待验证

路径：game_flow_ui、game_view、game_preferences、platform、CMakeLists。原 FDF 导航、游戏性复选框和鼠标／键盘速度滑块已接入；确认后改变本地相机移动并写入独立用户目录。集中验证真实窗口布局／字体／焦点、键盘与鼠标点击及拖入拖出、确定／取消／Esc、选中施工或升级建筑时菜单按 Esc 不取消施工、各速度档、对角／相反方向和边缘与键盘同时输入、原版速度映射及边缘滚动关闭时的控件行为、暂停／局域网、旧版相机设置升级、切图／重启后的设置、只读安装边界、不可写／损坏／未来版本设置、遗留临时文件和多进程写入。其他选项与原版还原度待继续实现，见[游戏内选项](game-options.md)。

## 游戏内声音选项阶段待验证

路径：game_flow_ui、game_view、game_preferences、map_preparation、game_loading、sound、music、session_sound、session_music、main、cinematic、model_cinematic。原声音页的音效／音乐开关和滑块接入本地音量与设置文件。集中验证鼠标拖动／键盘焦点、确认／取消／Esc、已有与新建音效／堆叠声音、地图／主题／主菜单音乐、AVI 与模型过场、脚本音量组和淡入淡出叠加、--mute、不支持的音频设备、切图／重启及异常设置文件。原版音量曲线／控件外观和细分声音选项仍待对照或实现，见[游戏内选项](game-options.md)。

## 局域网地图快照与会话配置待验证

路径：lan_lobby、lan_mapcheck、lan_host、lan_host_ui、lan_setup。集中验证本地匹配与下载地图的校验、元数据和保留字节一致，校验后原文件替换、声明变更、断线与取消时的资源生命周期；验证自建主机混合人类／电脑、非连续与乱序玩家 ID、固定队伍及槽位变更，种子与槽位映射在 main 前应用，并比较真实双客户端状态、异常报文及大地图内存。原版主机的槽位顺序尚未确认，大厅对局启动与实际网络同步尚未接入。

## 联机选区输入与回显待验证

路径：game_view、lan_action_encoder、lan_simulation、lan_time_driver。集中验证单击、拖选、Shift 交替选中／取消、空地清空与超过上限、原有隐藏选区、选择回调删除／重入，提交前后 JASS 选中状态和事件顺序；测试同帧相同玩家其他命令、多玩家 FIFO、回显前连续输入、重复时间片、拒绝发送、断线／失败、无效或冲突对象映射以及非本机伪造相同动作。检查实际窗口与多客户端一致性；原版字节、对象编号、混合权限命令及网络大厅启动仍待完成或对照。

## AI 合并与转换待验证

路径：session_ai_natives、session_ai_economy、session_coupling、session_unit_forms、session_spells。集中验证原 common.ai 对骑乘单位和毁灭者的需求、已有和在途数量、多次调用、来源不足、停止／移动／占用／死亡／易主、多个 AI 与自定义能力；检查骑乘位置与人口，变形科技／资源／人口费用、取消和事件重入，数量边界和 native 返回值与原版对照。执行暗夜及亡灵实际长局并观察单位形成、原版画面及性能。

## AI 飞艇购买待验证

路径：session_ai_transport、session_ai_natives、session_ai、session_ai_armies、session_ai_economy、session_ai_guards、session_commerce。集中验证原 AI 的购买请求，地精实验室库存／资源／人口／售卖事件、附近与远程购买者、单位行走与采集恢复、多商店／路线阻塞、暂停／超时／取消／死亡／易主和交易回调；比较原版候选与购买行为并执行实际对局。运输波次与原版行为见后续专项。

## AI 运输波次待验证

路径：session_ai_transport、session_ai_natives、session_ai、session_transport、session_combat_orders、session_spells。集中验证原 common.ai 的 LoadZepWave 与 AttackMoveXY 连续调用，多载具／容量和乘员体积、满舱／无载具／无法登船、移动中的载具、暂停／死亡／易主／命令回调、登船等待／飞行／卸载／陆路继续、目标变更／撤退／超时，以及战役或海岛地图与原版目标选择／时序对照；覆盖实时画面、长局和多人同步。

## 水面与两栖路径待验证

路径：world、world_path、session_orders、session_combat_orders、session_production、session_summons、session_coupling、session_mobility、session_teleport、session_transport、session_unit_forms。集中验证不同 WPM 位组合与地图边界、陆地／水面／两栖／飞行路径和目标修正、净空／对角／动态阻挡与重算；在海岛地图验证船厂训练、购买、召唤、移动／追击／卸载／传送和水陆交界，覆盖对象覆盖及多客户端同步，比较原版语义、画面和长局性能。

## 水面单位与弹道显示待验证

路径：terrain_scene、terrain_layout、game_view、game_morph、game_effects、scene_objects、combat、spells、session_projectiles、session_spell_effects、session_siege_attacks、session_self_spells。集中验证 W3E 干／湿格、非平坦水位、地形与水面交界、源水位偏移、海军／两栖／飞行单位模型与选择圈、点击／相机／遮挡，武器与法术弹道发射者死亡、追踪目标变形、反弹和多目标；覆盖多个地形集、实际 GPU 帧、透明水面与原版对照及长局性能。水面闪电见后续专项，水面粒子仍待对照或实现。

## 水面闪电端点待验证

路径：game_lightning、session_lightning、session_lightning_attack、effects、stampede、terrain_scene。集中验证船只／两栖与陆空单位的闪电链、锁镣、资源汲取、攻击延迟，端点跨岸／变形／死亡与回退、显式 AddLightningEx／MoveLightningEx 的绝对坐标、解除跟随、脚本移动、可见性及多个地形集；对照原版 GPU 画面和长局性能。

## 生命条显示与游戏性选项待验证

路径：game_preferences、game_flow_ui、game_view。游戏性选项设置生命条常显，按住 Alt 临时显示，绘制遵循单位存活、可选取、显隐与本地视野；设置写入独立用户目录，兼容原有相机设置。Win32 Release 产品增量编译通过，运行尚未验证。集中验证真实窗口的键盘／鼠标、勾选／取消／Esc 与重启、旧版与损坏设置、不同单位和水面高度、生命变化及边缘裁剪、隐形／战争迷雾／共享视野、大量单位性能，比较原版颜色／纹理／位置及 Alt 行为。仅为基础显示，原版外观与完整行为未验收。

## AI 治疗与召唤阶段待验证

路径：session_ai_armies。电脑英雄在空闲或保持位置时也可治疗，战斗中通过既有施法入口使用水元素、幽灵狼、蛇棒、树人、地狱火、灰熊、豪猪和炎魔；Win32 Release 产品增量编译及差异检查通过。集中验证无敌人目标、医疗目标分类／范围／资源、采集／建造／移动和事件重入，召唤单位存活／失效／易主／多英雄、地狱火延迟、树木与落点、技能冷却及目标消失，实际战斗与原版策略、长局性能；新功能尚未进行运行或原版验收。

## 自动施法失败后的战斗恢复待验证

路径：spells、session_spells、session_channels。自动施法的目标失效、不可到达与条件／资源变化进入显式恢复路径；结束事件之后校验施法与战斗修订、生命和归属轮次，重置攻击前摇并恢复战斗状态。普通主动取消与新订单保持原语义。Win32 Release 产品增量编译通过。集中验证目标死亡／不可见／无效、路径失败、施法条件变化、战斗目标与攻击移动恢复、冷却和动画，结束回调中下达新命令／重施法／死亡复活／易主转回／移除、单位自动施法及 AI 和多人时序；控制打断及特定持续施法的失败路径仍待实现或核对，原版行为和实际对局尚未验收。

## AI 英雄自保与强化待验证

路径：session_ai。电脑英雄根据战斗与生命条件启用圣盾／天神下凡／魔法护盾／献祭／狂暴，献祭在无范围目标时按能力配置关闭；Win32 Release 产品增量编译通过。集中验证低血逃跑与群体撤退、受控／移动／前摇／正在施法、魔法／冷却／禁用、目标可见性和多敌人、技能持续／开关／耗蓝／死亡、施法事件重入与新命令、战斗恢复、多个英雄和长局性能，并与原版策略及视觉对照；运行和原版一致性尚未验收。

## 网络技能动作待验证

路径：lan_spell_orders、lan_action_encoder、lan_simulation、player_commands。单单位选区的代表性即时／点／单位技能连接编码、时间片预检及真实施法入口；Win32 Release 产品增量编译通过。集中验证全部列示订单、原始字节和坐标、映射／选区及同订单冲突、目标失效、权限／费用／冷却、同帧选择和施法、选择／订单回调重入、无效动作与部分帧处理、双客户端状态及原版 1.27 对照。多选和更多技能、原版对象编号与锁步、大厅开始仍未完成；此项尚未进行运行验收。

## 网络建造、生产和选区预检待验证

路径：lan_production_orders、lan_action_encoder、lan_simulation。建造、训练、研究及升级的单单位动作接入真实生产消费；预检增量投影每个玩家的选区并在实际执行时检查预期单位，技能订单检查覆盖开关冲突。Win32 Release 产品增量编译通过。集中验证四族生产、资源／人口／取消、地图覆盖及冲突 ID、权限／死亡／易主、同帧选区变化及回调替换、错误对象与报文、大小时间片性能、双客户端同步及原版动作字节；多选施法／生产、队列取消与大厅对局仍待实现，实际运行和原版一致性尚未验收。

## 网络生产与施工取消待验证

路径：lan_actions、lan_action_encoder、lan_simulation。单单位选区的普通单位队列取消接入 0x1E 槽位／类型及原退款、人口与队列；施工和升级取消接入原取消订单。Win32 Release 产品增量编译通过。集中验证所有队列位置、同类型／不同类型替换、完成与取消竞态、资源／人口、地图自定义对象、权限与选择回调重入、合法／截断／无效报文、双客户端及原版 1.27 字节与时序。英雄复活／研究队列取消、多选和实际联机尚未实现或验收。

## 网络英雄复活与取消待验证

路径：lan_actions、lan_action_encoder、lan_simulation。祭坛目标复活、0x1D 英雄复活取消连接实际复活队列、票据、费用、权限和事件。Win32 Release 产品增量编译通过。集中验证同一时间片发起／取消、多个英雄与祭坛、队列位置、对象 ID 映射、取消后重排／复活／死亡／易主、共享控制／伪造来源、事件重入、退款／人口与 UI，以及双端同步、原版 1.27 报文与动作次序。动作字段不包含队列票据，不能区分同一英雄旧任务与新任务；真实网络和原版行为尚未验收。

## 局域网资源交易待验证

路径：lan_setup、session、lan_actions、lan_action_encoder、lan_simulation。0x51 交易经显式槽位映射、时间片和实际资源交易消费，不依赖选区。Win32 Release 产品增量编译通过。集中验证非连续／乱序地图玩家 ID、真人与电脑槽、不同方向、零／最大／非法金额、余额不足、税率／联盟／权限变更、多个提交和回显前重复输入、资源事件重入、断线与重开、完整双客户端和原版 1.27 报文对照。联盟快照及大厅启动仍未完成；运行和原版一致性尚未验收。

## 局域网联盟快照待验证

路径：lan_actions、lan_action_encoder、lan_simulation、session_match、player_commands、game_view、game_alliance_dialog。0x50 与显式槽位映射接入实际联盟／视野／共享控制及共同胜利；界面合并草稿并等待本机回显后允许后续编辑。Win32 Release 产品增量编译通过。集中验证部分低位／高位保留、self／电脑／关闭槽、地图联盟锁、同目标多次编辑、全局胜利、联盟后资源交易、FIFO／合包／重复／异常／中途失败／断线、回调修改与重入、真实界面和双客户端及原版 1.27 报文与事件顺序。网络提交器须有序且不重入；运行与原版一致性尚未验收。

## 网络子组命令待验证

路径：lan_actions、lan_action_encoder、lan_simulation。混合类型选区中，唯一类型单位的已支持技能及建造／训练／研究／升级可编码预子选和子组、在时间片中核对并执行而不改变选区；Win32 Release 产品增量编译通过。集中验证多玩家跨时间片、子组切换／取消选中、单位删除／易主／变形、重入与异步回显、相同类型拒绝、控制权限、原始字段／畸形数据与 1.27 双端对照，以及大选区性能。原版同类型调度、其他标志和完整联网尚未实现或验收。


## 游戏界面子组切换待验证

路径：`game_view.cpp`、`game_view.h`。Tab／Shift+Tab 按当前选区中类型的首次出现顺序切换界面主单位；肖像、命令面板、物品栏、技能／建造目标及取消操作使用该单位，群体命令与完整选区保持原序。切换或选区变化清理旧菜单和目标，联机选区尚未回显时不切换。Win32 Release 产品增量编译通过，尚未执行运行验证。

集中验证真实窗口的单类型／混合类型、多单位同类型、正反切换、选区变化、死亡／变形／控制权和可见性变化；菜单、技能书、目标模式、物品快捷键及群体命令；聊天、菜单、任务／联盟、脚本对话框与隐藏选区时的按键屏蔽；联机异步选区及唯一类型子组的发送／回显。原版子组排序、代表单位、Shift+Tab 和网络行为需与 1.27 对照，完整多人流程仍待实现。


## 单机游戏速度待验证

路径：`session.h`、`session_game.cpp`、`game_view.cpp`、`game_flow_ui.*`。单机选项接入五档速度草稿和确认／取消，脚本速度与主循环的实际时间换算共用会话状态；固定模拟步进保持 1/32 秒。网络选项禁止本地修改速度，网络时间片速度同步尚未实现。Win32 Release 产品编译通过，玩法及原版对照尚未运行。

阶段集中验证原版五档倍率／文本及鼠标拖动、方向键、Home／End、确认／取消／Esc、暂停、切图及默认值；核对 SetGameSpeed／GetGameSpeed、地图初始化后变更、计时器／单位移动／技能／动画的实际时间与事件顺序、相机速度、低帧率及速度切换。联机脚本更改、主机控制、时间片与原版互通需后续实现并对照。


## 联机加载与首个时间片衔接待验证

路径：`lan_join.cpp`、`lan_join.h`。显式授权可在倒计时／加载时准备时间片，只有 Ready 后接收；若最后的加载完成通知和首帧同批到达且尚未授权，首帧保留到调用方启用后的下一次 poll。相同地图声明保留既有就绪并重新发送就绪，声明变化清除就绪和加载授权。Win32 Release 产品增量编译通过，联机运行尚未验证。

阶段集中验证分片与合包、授权前／后首帧、顺序与重复 poll、多玩家最后就绪、本地最后就绪、提前发帧拒绝、缓冲上限／断线／超时；核对相同／变化地图声明、下载中变化及重新校验，随后联同大厅到对局的真实双端流程和 1.27 对照执行。大厅接线、原版对象 ID 和校验算法仍未完成。


## 加入端会话准备交接待验证

路径：`lan_lobby.*`、`lan_browser.*`、`map_preparation.*`、`lan_setup.*`。显式启用后，已校验地图才报告就绪，Loading 时一次性交接连接、地图和冻结的玩家配置；后台从不可变地图和相同种子准备会话，在 main 前应用调用方明确提供的槽位映射。Win32 Release 产品编译通过；默认界面未启用该入口，实际联网未验证。

集中验证本地／下载地图与声明变化、重复声明、取消／断线／加载超时、槽位与随机种子快照、加载报文合包、交接仅一次、异步取消与旧请求失效、非法／重复／缺失映射、准备失败释放连接和源地图、Main 前配置及资源只读；随后联同主机启动、加载屏障、真实时间片和双客户端／原版互通验证。对象 ID、校验与实际对局消费仍待实现。


## 主机交接与对局驱动待验证

路径：`lan_host_ui.*`、`lan_browser.*`、`lan_runtime.*`、`game_view.h`、`CMakeLists.txt`。显式启用后主机等待真人就绪、冻结槽位／地图／种子、倒计时并转移连接；Ready 后对局驱动消费真实时间片、发送已编码动作和调用方提供的状态校验。Win32 Release 产品增量编译通过，默认界面尚未接通，原版对象编号／订单字段／校验提供方尚未完成；实际联机尚未验证。

阶段合并验证多玩家地图准备／倒计时／离开／取消／超时、同帧槽位变更、冻结配置与线程所有权、连接交接仅一次、加载屏障、逐帧顺序／分片／首帧、延迟／背压／追帧／断线／时钟回退、校验不一致及会话对象销毁；再核对主机与加入端实际窗口、聊天／物品／对话框、原版帧节拍／编号／字段／校验及三图长局。原版互通和完整客户端仍未完成。


## 联机地图加载生命周期待验证

路径：`lan_match_loading.*`、`lan_host.*`、`lan_runtime.*`、`CMakeLists.txt`。加载协调器持有活连接，准备内存地图并应用冻结配置，执行 main、按帧上传、报告加载和等待所有参与者，再一次性交给对应 GameView 和时间片驱动。主机允许在 Loading 时预先启用协议，避免最后加载包与首动作同次处理时拒绝。Win32 Release 产品编译通过；默认界面和实际联机仍未启用或验证。

阶段集中验证主机／加入端、加载快慢不同／最后就绪的先后与 TCP 合包、资源上传失败、地图损坏／取消／超时／断线、后台旧请求失效、所有权转移与销毁、原版载入界面回调、重复取出／错误 GameView、防止提前发送、早到帧队列与运行驱动接续；完整原版对象池／校验和真实双客户端流程仍待实现并对照。


## 玩家数字控制组待验证

路径：`game_view.*`、`glue.h`、`main.cpp`。Ctrl+数字保存选区，Shift+数字追加，数字召回，连续按相同数字聚焦；单机走选择事件，联机走原有选区动作并等待回显。Win32 Release 产品增量编译通过，真实窗口／原版对照和联机尚未执行。

阶段集中验证 0–9／空组／12 单位上限／混合选区、Ctrl／Shift组合、按住自动重复与快速双击、相同选区无重复事件、丢失控制权／死亡／复活／隐藏／运输／移除及脚本选择重入；聊天／菜单／任务／联盟／脚本对话遮挡、镜头边界／跟随、多人选区回显／失败／同步。原版分组添加、英雄死亡保留、选择排序和定位间隔待对照；见[玩家控制组](control-groups.md)。


## 联机物品栏使用待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.*`；即时、点目标和单位目标物品订单通过六个源栏位 ID 接入真实物品支付、冷却和效果，并在时间片执行前复核持有者、栏位与控制权限。混合选区仅支持发令者类型唯一的子组。Win32 Release war3_core 增量编译通过，实际联机尚未验证。

阶段合并验证六栏／三种目标／库存与共享控制、同帧选择／子组、目标或物品销毁／换槽／转让／消耗、重入与多玩家竞争、队列失败与资源计费；原版 flags／对象 ID／报文字节、真实双端互通和 UI 待对照。地面丢弃与转交网络动作已接入后续条目，交换报文仍待实现。


## 英雄快捷栏待验证

路径：`game_hero_bar.cpp`、`game_view.*`、`CMakeLists.txt`。本地英雄头像与生命、F1–F7／点击选择和连续定位已接入现有选区事件与联机回显；单位目标模式复用技能／物品／命令消费者，点目标保持等待。Win32 Release 产品增量编译通过，实际窗口和多人尚未验证。

阶段集中核对三图及自定义英雄数量／顺序／图标／死亡灰态与复活、幻象／易主／隐藏／运输、头像拖入拖出、连续按键／自动重复、相同选区事件、镜头边界、技能／物品／攻击与建造和点目标、聊天／任务／菜单／脚本对话遮挡、回调移除及联机异步回显；对照原版边框、布局、快捷键和脚本接口，性能与切图释放合并验证。


## 物品拖放、转交和订单待验证

路径：`session_inventory.cpp`、`session_combat.cpp`、`session_combat_orders.cpp`、`session_orders.cpp`、`combat.h`、`session.h`、`player_commands.*`、`game_inventory_drag.cpp`、`game_view.*`、`lan_action_encoder.cpp`、`lan_simulation.cpp`、`CMakeLists.txt`。地面放置／友方转交／栏位交换进入真实订单与模拟步进，原 native 和 getitem 连接实际消费者，UI 拖拽使用统一玩家命令。Win32 Release 产品增量编译通过；玩法和原版对照未执行。

阶段合并验证六栏、空槽与交换、单位行走／不可达／移动目标／中断、物品不可丢弃／死亡／隐藏／转移／背包满、共享控制／友敌、掉落／拾取事件和回调移除／换槽／易主／重新下令、三个 JASS native 的订单／返回值／时序、拖拽中 Esc／右键／遮挡／失焦和头像／场景命中；原版位置与事件时序、声音和视觉、双客户端同步及三图长局保持待验。联机地面放置／转交已接入后续条目，换格尚未实现，详见[物品栏移动与转交](inventory-interactions.md)。


## 联机物品放置与转交待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.*`、`session_inventory.cpp`、`session.h`。地面／单位目标通过 `0x13` 和 `852001` 携带物品对象，连接真实移动、掉落和转交订单；同帧重入时核对物品持有／选区／权限。补强取消施法回调期间物品移除、回调更改物品位置／所有者，以及不可达路径的清理。Win32 Release 产品增量编译通过，行为尚未执行。

阶段集中验证地面／目标双字和空目标、选区与唯一类型子组、物品换槽／消耗／转让、回调移动物品或移除单位／中断施法、被阻挡的回退路径／目标移动、控制权变化、报文畸形／重复／多个动作同帧、真实双客户端及原版 1.27 flags／对象编号和时间片顺序。联机换格报文尚未实现。


## 空闲工人入口待验证

路径：`session.h`、`session_orders.cpp`、`game_loading.*`、`game_hero_bar.cpp`、`game_view.*`。依据单位源 Peon 分类及实时工作状态筛选本地单位，F8／界面按钮循环选择并定位，单机通过选区事件、联机通过选区动作回显；四族图标从原资源读取。Win32 Release 产品增量编译通过；功能和原版一致性尚未运行验证。

阶段集中验证四族及自定义 Peon、数量与循环顺序、保持位置／暂停／采集／建造／修理／移动／施法／战斗／运输／死亡／复活／隐藏／易主与脚本重入、UI 遮挡和目标模式、快捷键重复／按钮按下拖出、镜头及联机回显／失败，核对原版判定、定位行为、按钮坐标／边框／提示／音效和三图性能。按钮位置暂按现有 HUD 布局放置，尚无原版坐标证据。


## 多单位地面命令编队待验证

路径：`player_commands.*`、`session.h`、`session_orders.cpp`、`session_combat_orders.cpp`、`lan_simulation.cpp`。玩家多选移动、攻击移动和巡逻在会话内按单位句柄稳定分配网格目标；脚本订单事件保留玩家点击位置，单单位与建筑集结沿用原入口。联机同步选区使用同一分配并逐单位复核控制权。Win32 Release 产品增量编译通过，玩法及原版一致性尚未运行验证。

阶段集中验证单选、多选、混合建筑与单位、不同碰撞半径／移动类型、目标在地图边界或受阻、回调移除／易主／改变订单、攻击索敌／返回与巡逻两端、JASS 事件目标与次序、共享控制、联机同帧选择／命令与失败中止；核对原版编队形状与排序、地图窄路、动态单位碰撞和长局确定性。当前地面单位动态避让与受阻回退后的落点去重尚未实现；不可据此视为原版寻路完成。


## 编队落点与单位局部避让待验证

路径：`player_commands.cpp`、`world.h`、`world_path.cpp`、`session_orders.cpp`。多选地面命令在实际发令时按单位碰撞半径、运动类型、地形和已接受的终点预约落点；候选有界，无法分配的单位不下发错误目标。固定步进按需建立局部空间网格，以确定性的邻居次序检查移动段，使用短距离地形通行检查及有界侧移；不把移动单位写入静态建筑路径网格。 Win32 Release 产品编译通过。BootyBay 最小会话检查 4/4 通过：相向侧移与无关单位移动、重叠脱离、pathing=false、地空分层；不加载 Game.dll。测试目标 `war3_movement_avoidance_tests`，运行参数为原安装目录和 `Maps/(2)BootyBay.w3m`。

阶段集中验证地图边界、障碍与窄路、可达／不可达点、大小不同的碰撞半径、飞行／水行／地面与 pathing 关闭、静止和相向单位、重叠脱离、拥堵、命令回调改变障碍或单位、攻击追击／采集／施工／运输与 JASS 事件；核对源版碰撞、穿越、队形与优先级，以及大地图密集单位帧耗时和双端确定性。局部避让尚无长时间拥堵重规划，可能等待或绕圈，原版精度和真实运行尚未验证。


## 动态障碍重寻路与邻居查询待验证

路径：`entities.h`、`session.h`、`session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。静态障碍变化后重寻路失败时保留原路线和命令，通过模拟时间退避与每步有界轮转预算重试；单位在等待时继续执行短段地形校验。极端脚本坐标下限制侧移距离及邻居网格查询范围；同一运动尝试复用邻居候选。 Win32 Release 产品编译通过，BootyBay 最小运动会话 6/6 通过，覆盖相向侧移、重叠脱离、关闭路径／地空分层、障碍阻塞后恢复、80 单位重试预算／轮转、未获预算单位继续移动及极端地图外坐标；未加载 Game.dll。测试目标 `war3_movement_avoidance_tests`，参数为原安装目录和 `Maps/(2)BootyBay.w3m`。

阶段集中验证大量单位跨多个障碍版本、障碍新增／移除、命令取消／替换、传送／隐藏／死亡与追击／采集／建造周期更新、路径角落及失效坐标；核对原版行为、密集单位固定步进耗时和真实联机确定性。当前局部避让仍可能在拥堵中绕圈或等待，不代表完整单位寻路已完成。


## 玩家行动排队待验证

路径：`main.cpp`、`game_view.*`、`player_commands.*`、`entities.h`、`session*.cpp`、`session.h`、`lan_action_encoder.cpp`、`tests/order_queue_tests.cpp`。鼠标事件保存 Shift 快照，单机支持移动／攻击移动／巡逻及目标命令排队；空闲首条立即执行，后续由固定步进消费并重新核查控制权。多选队列保留单位目标和原点击位置，非排队玩家／脚本命令、死亡和易主清理队列；联机排队编码明确拒绝。 Win32 Release 产品编译通过；BootyBay 最小队列会话 7/7 通过，覆盖顺序、多选队形、即时替换、死亡、易主、失效目标和联机拒绝；不加载 Game.dll。测试目标 `war3_order_queue_tests`，运行参数为原安装目录与 `Maps/(2)BootyBay.w3m`。

阶段集中验证原版 Shift 按键时序／目标／队列数量、混合多选与不同单位结束时间、跨时刻动态落点、采集／施工／追击／巡逻／停止、暂停／隐藏／运输／死亡／复活／易主、控制权变动及订单回调重入、无效目标与中断；核对 JASS 点击坐标、原版事件时序和真实窗口输入。技能／物品／建造排队与队列目标标记见后续条目，联机排队仍未实现；无效的覆盖命令目前会清除队列，原版行为待核实。


## 技能、物品与建造排队待验证

路径：`player_commands.cpp`、`game_commands.cpp`、`game_hero_bar.cpp`、`game_spells.cpp`、`game_view.*`、`tests/order_queue_tests.cpp`。单机技能的即时／单位／位置目标、物品使用及建造放置接入 Shift 行动队列；入队不提前扣除魔法、物品次数或建造费用，实际执行时重验能力、目标、资源、库存和权限。按钮／快捷键及目标点击保留 Shift 意图；联机排队仍明确拒绝。

Win32 Release 产品增量编译通过，BootyBay 最小队列会话 12/12 通过，新增治疗技能延迟扣魔与目标失效、药水延迟消耗与转移、两座农场依次施工和扣费；测试目标 `war3_order_queue_tests`，参数为原安装目录和 `Maps/(2)BootyBay.w3m`，未加载 Game.dll。阶段集中验证点／单位／无目标技能与物品、技能冷却／资源不足／沉默／目标失效、不同种族建造与工人状态、队列重入／取消／易主／死亡、鼠标和热键 Shift 时序、预览、多人和原版表现。当前执行失败的队列项会跳过；目标模式对沉默和能力禁用的限制、资源不足时的原版行为、Shift 两阶段语义及联机协议尚需完成或核对。


## 行动队列目标标记、物品移动与卸载待验证

路径：`game_waypoints.cpp`、`game_view.*`、`game_loading.*`、`game_inventory_drag.cpp`、`player_commands.cpp`、`session_inventory.cpp`、`session_transport.cpp`、`session_spells.cpp`、`tests/order_queue_tests.cpp`。按住 Shift 时对本地受控选区的待执行目标绘制原版四族 WaypointIndicator 模型，按需从 MPQ 后台读取并过滤失效／不可见目标；物品地面放置、转交和换格可单机排队；脚本物品命令替换旧队列，卸载结束清除自身已完成订单并保留回调中的新状态。

Win32 Release 产品增量编译通过，BootyBay 最小队列会话 20/20 通过，涵盖物品延迟放置／转交／换格、脚本物品命令替换队列以及单体／即时全部卸载后继续移动；测试目标 `war3_order_queue_tests`，参数为原安装目录和 `Maps/(2)BootyBay.w3m`，未加载 Game.dll。阶段集中验证实际窗口按键／拖放、四族模型／颜色／动画、原版队列显隐与目标类型、动态目标及迷雾、模型释放、脚本回调重入、物品转移／失效／不可丢弃与槽位变化、卸载失败／连续卸载；核对原版失败订单清队列与 Shift 物品拖放语义，联机排队仍未实现。原安装 `UI\war3skins.txt` 的 SHA-256 为 `53cedda87d59c6d27ad2d30680d37faa410d37e9917c00b21d473cce9eed70c7`。


## 人族伐木升级待验证

路径：`commerce.h`、`session_research.cpp`、`session_lumber.cpp`、`tests/destructable_tests.cpp`。源科技效果 `rlum` 随已研究等级重建携木容量增量，实际 Ahar／Ahrl 采集读取该增量；研究完成、创建和易主复用科技刷新，已携木材不截断。小精灵直接收入和 AI 慢速采集逻辑保持原有消费路径。

Win32 Release 产品增量编译通过，BootyBay 派生的最小会话检查通过，覆盖原版 Rhlh 一级实际研究、一级／二级容量、已有与新农民、二级重复设置及携木易主；`war3_destructable_tests` 使用 `tmp/docs-artifacts/war3/destructables/fixture.w3m`，通过 `python watcher/war3/tests/generate-destructable-fixture.py --data-root <原安装目录>` 生成，不加载 Game.dll。阶段集中核对 w3q 自定义 rlum／多科技叠加、升级和移除时已有采集流程、不同等级／背包余量、AI 慢速采集及原版时序。


## 科技防御类型增量待验证

路径：`commerce.h`、`session.h`、`session_research.cpp`、`session_damage.cpp`、`session_siege_attacks.cpp`、`session_corpse_spells.cpp`、`tests/fortified_tests.cpp`、`tests/generate-fortified-fixture.py`。原版 Rorb 与有界 rart 效果连接研究刷新及实际防御类型；研究变更按新旧浮点效果差值向零截断并逐次处理边界，碎片攻击只匹配防御类型 1 和 7。新增单位、易主、变形和建筑升级按当前科技重建，幻象和复活路径保留对应状态。

原安装 Game.dll 的 SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 REA/Rizin 证据：`0x6f6ac913` 识别 rart，`0x6f6986a0` 和 `0x6f0528b0` 计算新旧等级效果差值；`0x6f689b40` 的零级为零、正等级为 base+(level−1)×mod；`0x6f052f30` 向零截断，结果小于 0 时置 0、大于 8 时置 7、等于 8 时保留；`0x6f573a9f` 的碎片攻击只匹配类型 1 和 7。普通伤害对索引 8 的语义尚未确认。

本次 Win32 Release 客户端增量编译通过。此前原版 Rorb 的三个建筑实际研究和伤害倍率、新建筑及易主检查通过；BootyBay 派生的整数 w3q 会话检查通过两级／双科技、伤害倍率、新单位和易主。本次新增分数、研究顺序和生命周期夹具尚待阶段执行：测试目标 `war3_fortified_tests`，原版夹具 `tmp/docs-artifacts/war3/destructables/fixture.w3m`，自定义夹具 `tmp/docs-artifacts/war3/fortified/custom-fixture.w3m`，生成命令见对应 `tests/generate-*-fixture.py`；不加载 Game.dll。阶段集中核对分数及饱和、不同研究顺序、升降级、创建／易主／变形／幻象／复活、古树拔起优先级及碎片攻击的实际行为和原版一致性。超范围数值在研究前拒绝，索引 8 的普通伤害消费仍明确失败；生命周期重建和多个效果移除的顺序尚无原版证据。
## JASS 随机单位池与物品池待验证

路径：`session.h`、`session.cpp`、`session_game.cpp`、`session_hashtable.cpp`、`docs/random-pools.md`。单位池和物品池的创建、增删、销毁与加权随机放置已连接会话随机数和真实单位／物品创建，池句柄支持 hashtable 存取。空池、零／负权重、重复条目、随机数消耗与销毁后的行为以现有实现为限，原版 1.27 规则待对照。

Win32 Release 客户端增量编译通过。阶段集中验证 common.j 调用、地图初始化及触发器、权重组合／重复条目／删除／空池／无效类型、玩家与坐标、固定种子和多客户端同步、句柄存取与释放、对象预算。完整客户端、三图和原版一致性仍未验收。

## 联机 Shift 命令队列待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.cpp`、`lan_simulation.h`、`player_commands.cpp`、`player_commands.h`、`tests/order_queue_tests.cpp`。受支持的移动、攻击、巡逻、目标命令、技能、建造和物品操作通过 0x0001 标志传递排队状态，并由时间片消费到实际玩家行动队列；唯一类型子组技能保留选区校验，不支持排队的命令拒绝。参考 w3g_actions.txt 固定版本；原版网络格式及同类型子组仍待核对，物品换格未接入。

Win32 Release 客户端和 `war3_order_queue_tests` 增量编译通过。阶段执行该目标并合并联机动作、锁步和玩家命令验证，覆盖鼠标／键盘 Shift、队列与立即命令交错、地面／单位／技能／建造／物品、同帧选区与子组、权限变更、无效报文、命令取消及回调重入，双客户端同步及 1.27 原版对照。新增测试尚未执行，不代表实际对局通过。

## 玩家单位批量移交待验证

路径：`session_entities.cpp`。`SetPlayerUnitsOwner` 通过既有单位归属变更处理人口、科技、玩家颜色和事件；调用时快照原拥有者的单位及归属轮次，回调期间已移除或已变更归属的单位不会被旧操作覆盖，回调中新建单位不在本次快照内。目标玩家索引超出范围明确失败。

Win32 Release 客户端增量编译通过。阶段核对玩家离场／中立单位／建筑／英雄／尸体／幻象／运输、人口／资源／科技／选择／订单及颜色、触发事件与回调重入、同一玩家及非法索引；上述顺序和颜色等细节尚未证明与原版一致。

## 原物品属性与中立商店查询待验证

路径：`session_entities.cpp`。物品创建从 ItemData `Level`、`droppable`、`pawnable` 和物编覆盖初始化等级与实例权限；`IsItemPowerup`／`IsItemSellable`／`IsItemPawnable` 与对应 `IsItemId*` 连接源类型与实例状态。原版 Blizzard.j 的市场刷新消费类型级可售查询，显式商店库存保留现有消费方式。

Win32 Release 客户端增量编译通过。阶段检查原资源与 w3t 覆盖、等级、符文／不可售／不可典当／不可丢弃物品、实例开关与类型查询隔离、空或无效句柄、商店库存刷新及脚本触发器，和原版比较边界与事件；当前实现和原版一致性尚未验证。

## 联机背包换格待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.cpp`、`session.h`、`tests/order_queue_tests.cpp`、`docs/lan.md`、`docs/inventory-interactions.md`。单选和唯一类型子组支持普通及 Shift 排队换格，编码为暂定 0x12 目标物品及 852002–852007 目标槽；执行前复核物品持有、控制权及可用栏位。

Win32 Release 客户端及 `war3_order_queue_tests` 增量编译通过。阶段运行该目标并核对源槽／目标槽变化、物品转移／销毁／丢弃、背包缩减、权限和事件回调、畸形报文、双方动作同步及原版 1.27 的 opcode／对象和坐标；测试与原版互通尚未执行。

## 随机中立单位与物品待验证

路径：`object_data.h/.cpp`、`session_game.cpp`、`docs/random-choices.md`。四个 ChooseRandom native 按源单位／物品表、地图覆盖及相关分类、等级和地形集构建候选，使用会话 RNG 返回类型；候选为空返回 0。筛选标志与原版 RNG、顺序的细节仍待对照。

Win32 Release 客户端增量编译通过。阶段核对常见地形集和玩家数量、原版及自定义对象筛选、随机建筑／野怪／物品分类与等级、空结果、地图掉落／中立商店脚本、候选缓存和固定随机种子的双客户端同步；运行与原版一致性未验证。

## 战役单位救援待验证

路径：`entities.h`、`script_state.h`、`session.h`、`session.cpp`、`session_tick.cpp`、`session_ownership.cpp`、`docs/rescue.md`。单位／玩家救援资格、距离与救援事件连接 `GetRescuer`，原版 BJ 利用现有归属转移完成救援；源地图玩家类型 4 映射为 Rescuable。

Win32 Release 客户端增量编译通过。阶段核对 Rescuable 玩家、显式开关／每玩家资格／进入范围、事件及默认 BJ 提示音效／易主／人口／科技、死亡复活／隐藏／暂停／回调重入和多个玩家争抢，并对照原版默认距离、中心距离、事件时序和长局性能。当前范围和筛选边界尚未证实，实际战役未验收。

## DotA 单位点数查询待验证

路径：`session_entities.cpp`。`GetUnitPointValue` 与 `GetUnitPointValueByType` 使用源 `UnitData/points` 和 upoi 对象覆盖，实例读取当前单位类型；空／失效单位及未知类型返回 0。原件 1.27 入口 `0x6f1e6370`／`0x6f1e6390` 的查找与空对象返回行为经静态核对，DotA 脚本分别存在 31／4 处调用。

Win32 Release 客户端增量编译通过。阶段检查 DotA 实际调用和对象查表、英雄／建筑／变形类型、w3u 覆盖、零／负点数和无效句柄；无原版实机或完整对局通过结论。

## 视频粒子选项与联机排队入口待验证

路径：`game_flow_ui.*`、`game_preferences.*`、`game_view.*`、`glue.h`、`renderer.h`、`model_particles.cpp`、`docs/game-options.md`。原视频页面粒子三级选项连接 PRE2 发射率和独立用户设置，确认应用、取消恢复；联机界面将已支持的 Shift 排队交给已有编码器，未支持命令仍由底层拒绝。

Win32 Release 客户端增量编译通过。阶段核对原 FDF 键鼠／弹出菜单／Esc、确认取消和持久化／坏文件／切图／设备恢复、PRE2 粒子在低中高档的实际 GPU 画面与性能、原版比例；联机真实窗口与双端时间片、技能／建造／物品队列和权限变化仍待测试。当前粒子比例是实现值，非原版验证结论。

## 单位转向与推进角待验证

路径：`entities.h`、`session.h`、`session_entities.cpp`、`session_orders.cpp`、`session_combat.cpp`、`session_unit_forms.cpp`、`session_building_upgrades.cpp`、`docs/unit-turning.md`。源转速及推进角、自定义覆盖、脚本设置／查询、移动路径与攻击方向、幻象和类型变化已接入；原版转向速度公式、角度边界和生命周期规则待对照。

Win32 Release 客户端增量编译通过。阶段核对四族与自定义地图的直行／拐角／避障、脚本属性、极端窗口、攻击前摇与移动施法、暂停／幻象／变形／复活、同步及长局性能；当前无玩法或原版一致性通过结论。

## 地图脚本实体状态查询待验证

路径：`session_game.cpp`。`IsHeroUnitId` 读取单位类型继承与英雄分类，`IsItemVisible` 消费物品显示状态，`IsUnitInRange`／`XY`／`Loc` 以当前实体坐标与碰撞半径进行距离判断。

Win32 Release 客户端增量编译通过。阶段验证 DotA 脚本调用、物编继承、空句柄、隐藏物品及位置变化、边界／零／负／无效距离和原版碰撞半径规则；当前算法为实现值，未证明原版精度。

## 视频遮挡设置待验证

路径：`game_flow_ui.cpp`、`game_preferences.*`、`game_view.cpp`、`scene_objects.*`、`docs/game-options.md`。原视频控件连接实际场景遮挡渐隐和脚本 EnableOcclusion，保存至独立用户目录并兼容此前设置格式。

Win32 Release 客户端增量编译通过。阶段核对原 FDF 输入／弹窗／确定取消、旧设置迁移／损坏文件、EnableOcclusion 联合规则、画面恢复／GPU／性能、设备恢复和切图；实际运行及原版一致性尚未验收。

## 自定义地图图像待验证

路径：`effects.h`、`session.h/.cpp`、`session_effects.cpp`、`session_hashtable.cpp`、`game_view.h/.cpp`、`game_effects.cpp`、`terrain_scene.h/.cpp`、`terrain_layout.cpp`、`docs/map-images.md`。图像 native、句柄存取及纹理内存流式加载连接实际世界绘制，消费显示／位置／颜色／高度／水面／迷雾与类型排序。

Win32 Release 客户端增量编译通过。阶段检查 DotA 动态图像、对象／纹理创建销毁及 hashtable、绘制状态隔离、视口及水面／坡面／恒高／雾效、不同类型／透明度／大尺寸、GPU 恢复与高密度性能；图像尺寸 Z 和原版混合／排序仍未完整还原，原版画面尚未验收。

## 地形路径脚本控制待验证

路径：`world.h`、`world_path.cpp`、`session_world.cpp`、`docs/terrain-pathability.md`。八种类别可读写会话 WPM，变化进入寻路和建筑放置；动态足迹保留，路径阻挡触发路线重试。REA 静态核对掩码及布尔方向，采木 PEONHARVEST 位、荒芜外观及原版边界仍待完成或验证。

Win32 Release 客户端增量编译通过。阶段核对原版类型/位置/障碍、WPM 与动态足迹重叠、进行中寻路/放置、建筑/古树、地图切换和局域网；无完整运行或原版一致性结论。

## 单位分类变化待验证

路径：`entities.h`、`session_entities.cpp`及相关战斗／施法／修理／运输／AI／经验消费者，见 `docs/unit-classifications.md`。UnitAddType／UnitRemoveType 对原版支持的九类更新实例，分类进入实际目标与行为；其他类型按原版静态入口返回 false。

Win32 Release 客户端增量编译通过。阶段核对类型增删/重复/无效、召唤／机械／古树等实际目标和伤害、修理/运输/AI、幻象/变形/死亡/易主、地图覆盖及回调重入；gamecache 保存和原版行为仍待完成或验证。

## 地表特效 Ubersplat 待验证

路径：`effects.h`、`session.h/.cpp`、`session_effects.cpp`、`session_hashtable.cpp`、`session_tick.cpp`、`game_effects.cpp`、`docs/ubersplats.md`。源表驱动地表特效的句柄、RGBA 时钟、纹理与五类混合绘制，并支持显示/完成/重置和迷雾控制。

Win32 Release 客户端增量编译通过。阶段核对 DotA 与战役特效、声音／暂停／完成／重置、哈希句柄、纹理加载／透明／雾／地形、GPU状态与切图、高密度性能及原版播放时序/混合/尺寸；原版一致性尚未验收。

## 单位替代小地图图标待验证

路径：`entities.h`、`session_entities.cpp`、`game_view.cpp`、`docs/heroes.md`。UnitSetUsesAltIcon 保存单位图标开关，小地图读取 SetAltMinimapIcon 的流式纹理，不再由键盘 Alt 状态为所有单位切换；原件 1.27 的 native 入口 `0x6f1fb310` 设置单位偏移 0x280 的 0x200 位，`0x6f3bdb33` 消费该位，REA 证据 `ev_3aa460d02faad8c26a1bd1a5acbb7bc2047b26e1dfa825e8139cf6ea54f519db`、`ev_aa8124b93fe2ccb66b20873526ac5734998e46314e3981e50b5750881e319a3a`。

Win32 Release 客户端增量编译通过。阶段验证 DotA 的 GetLocalPlayer 分支、单单位启停、空／透明／缺失及地图覆盖纹理、颜色和图标尺寸、可见性／共享视野、地图切换和 GPU；当前空或未加载纹理不画默认标记，原版默认纹理与时序尚未核对。

## 动态地表类型待验证

路径：`world.h/.cpp`、`world_blight.cpp`、`session_world.cpp`、`terrain_scene.h/.cpp`、`terrain_blight.cpp`、`docs/terrain-type-mutation.md`。SetTerrainType 修改会话地表角点和变体，地表查询与可见脏区的局部混合纹理／GPU 网格使用新值；仅支持地图已声明的地表材质。

Win32 Release 客户端增量编译通过。阶段验证 DotA 修改、地图边界与各面积形状、随机变体和联机同步、原／混合／荒芜／水面／悬崖、连续修改性能和设备恢复。非地图原材质和悬崖几何尚未实现，面积及原版纹理表现未验收。

## 高级工具提示设置待验证

路径：`game_flow_ui.cpp`、`game_preferences.*`、`game_commands.cpp`、`docs/enhanced-tooltips.md`。原 FDF 开关控制命令面板扩展描述，基本信息和不可执行原因保留；确定/取消及 camera.bin 旧版兼容已接入。

Win32 Release 客户端增量编译通过。阶段核对输入/界面布局、单位与物品/商店/建筑的提示、草稿取消/持久化/旧版本/损坏文件、原版默认值与呈现范围。其他界面提示与原版一致性未验收。

## 扩展动态地表材质待验证

路径：`world.*`、`world_blight.cpp`、`terrain_layout.cpp`、`terrain_scene.*`、`terrain_blight.cpp`、`game_view.cpp`、`docs/terrain-type-mutation.md`。动态地表类型使用独立会话索引，支持地图原始槽位外最多 256 种源材质；运行期贴图接入 SceneStreaming，未加载时保留原块。

Win32 Release 客户端增量编译通过。阶段检查满 16 原始槽的地图、原版/地图覆盖材质、开局与运行期更新、混合边界/重复变更、资源丢失/切图/设备恢复/多端同步与性能；悬崖处理和原版精度尚待完成或验证。

## 原版命令工具提示待验证

路径：`game_commands.cpp`、`game_view.h`、`glue.*`、`docs/command-tooltips.md`。命令提示使用原皮肤背景/边框/资源图标、源文本颜色和换行，支持高级说明开关及长内容分页；相同悬停内容的行数结果缓存。

Win32 Release 客户端增量编译通过。阶段验证技能/商店/建造/学习/禁用、鼠标悬停和多分辨率、长文本滚动和开关、字体/皮肤/资源释放/设备恢复及原版视觉/交互；当前布局与分页行为未证实原版一致。

## 地图 Trackable 待验证

路径：`session_trackable.cpp`、`game_trackable.cpp`、`session.*`、`script_state.h`、`session_hashtable.cpp`、`game_view.*`、`CMakeLists.txt`、`docs/trackable.md`。地图可创建模型并注册鼠标命中/跟踪事件，单机拾取和触发器上下文连接实际会话；句柄可用 hashtable 保存。

Win32 Release 客户端增量编译通过。阶段核对资源加载/大小/鼠标遮挡/范围/雾与 UI 优先级、跟踪/命中时序、触发器销毁/回调重入、模型消失与切图/GPU、原版操作与视觉；局域网事件同步尚未实现。

## 编队移动选项待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_view.cpp`、`player_commands.*`、`docs/game-options.md`。游戏性选项控制单机多选移动／攻击移动／巡逻目标分配，排队命令保存提交时状态；设置保存至 camera.bin 并兼容旧版本。联机暂固定开启。

阶段核对 FDF 控件／标签输入、游戏中 Alt+F 与聊天／菜单隔离、重复键抑制、确认取消／Esc、旧版迁移／损坏设置／跨会话保存、单多选与 Shift 队列／拥挤障碍，以及原版编队速度、默认值和联机同步。原版行为、实际窗口和对局尚未验收。

## AI 尸体技能待验证

路径：`session_ai_armies.cpp`、`docs/ai.md`。电脑单位依据真实尸体和能力状态使用复活、操纵死尸、先祖之魂、亡者复生、腐尸甲虫、复仇之魂及食尸；施法与尸体效果走已有会话生命周期。

功能阶段核对各族电脑空闲／战斗和攻击移动、有效／不可见／被占用／不可复活尸体、资源和冷却／召唤上限、目标消失与事件重入、取消和战斗恢复、多人同步及长局性能；两具尸体／70%生命／600距离的策略与原版一致性尚未证实。Win32 Release 产品增量编译通过；未执行实际对局或专项运行。

## 可破坏物遮挡高度待验证

路径：`session_destructables.cpp`、`scene_objects.cpp`、`docs/destructables.md`。脚本修改和查询使用会话状态，场景遮挡渐隐读取当前高度；战争迷雾视线遮挡仍未实现。

阶段核对原地图／动态创建、实时修改与查询、零／负／极值、缩放、隐藏／死亡／恢复／移除、视角及遮挡设置、设备恢复和原版一致性；Win32 Release 产品增量编译通过，尚未运行或验收。

## 模型动画声音待验证

路径：`model.h`、`model_particles.cpp`、`sound.h/.cpp`、`session.h`、`session_sound.cpp`、`game_view.h/.cpp`、`game_effects.cpp`、`game_model_sound.cpp`、`docs/model-event-sounds.md`。可见单位和特效的 `SNDx` 动画帧经原始 AnimLookups 和声音表进入会话空间声音。

阶段检查实际声音设备及静音、原始死亡／施法特效、同时实例、暂停／速度／跳帧／循环／动画切换／模型切换、切图资源释放、频道和空间距离／音量、覆盖及缺失音效、窗口与长局性能。Win32 Release 产品增量编译通过；原版事件节点位置、离屏声音、随机文件和脚步事件仍待实现或对照。

## Trackable 联机动作待验证

路径：`lan_actions.*`、`lan_simulation.*`、`game_trackable.cpp`、`docs/trackable.md`。指针跟踪及命中经 0x65／0x64 双字段动作编码、时间片校验与会话触发，调用方提供的对象双向映射需覆盖 Trackable。默认主程序尚未接入 LAN 对局或原版对象编号；该连接不能作为完整联机可运行结论。

阶段核对动作截断和无效 ID、稳定映射／创建顺序、同帧多个事件、触发回调／删除、发送队列与断线、双端同步、鼠标/UI 优先级和原版抓包；Win32 Release 产品增量编译通过，未执行运行或互通验证。

## 模型脚印与水花待验证

路径：`model.h/.cpp`、`model_particles.cpp`、`game_model_sound.cpp`、`game_view.h/.cpp`、`game_effects.cpp`、`docs/model-event-sounds.md`。FPT 动画节点驱动源 SplatData 图集、地面脚印和水面水花／音效；地表 footprints 控制陆地脚印。

阶段核对左右脚／骨骼动画／多模型实例、地表标志与地图覆盖、深浅水／岸边、纹理异步读取与切图释放、透明图集／旋转／坡面／迷雾／暂停／动画跳帧、声音设备与大量单位性能；离屏／全局事件、原版视觉和精确行为仍待实现或验证。Win32 Release 产品增量编译通过，未运行或验收。

## 自研客户端局域网实验流程待验证

路径：`lan_browser.*`、`lan_host_ui.*`、`lan_lobby.*`、`lan_match_loading.*`、`lan_local_identity.*`、`session_network_identity.cpp`、`session.*`、`main.cpp`、`platform.*`、`docs/lan-experimental-flow.md`、`docs/lan-local-identity.md`。显式实验模式连接大厅、地图加载和时间片对局；内部编号与部分状态摘要只供相同版本自研客户端使用。

阶段核对双端建房／查找／加入、地图传输与加载屏障、选区／移动／技能／Trackable、退出／断线／失败／取消、最小化和过场、对象创建销毁／本地分支、状态分歧、长期同步与大图性能。房间前缀无法验证对端身份，原版对象编号、状态校验及互通均未实现；Win32 Release 产品增量编译通过，未执行双端运行。

## 回放读取基础待验证

路径：`replay.*`、`CMakeLists.txt`、`docs/replay.md`。经典 W3G 容器、元数据和记录保留，时间片可由调用方交现有模拟器；原版对象映射、录制、选择界面和实际播放仍未实现。

阶段核对公开样本及本机 1.27 回放、头／块 CRC／截断／压缩上限、记录类型／片段次序、玩家和地图初始化、模拟动作／离开／聊天及长回放内存；当前 C++ 实现尚未运行。

## 维护费损失统计待验证

路径：`game_state.h`、`session_harvest.cpp`、`session_match.cpp`、`docs/economy.md`。采集时累计实际维护费扣除，供两类 GetPlayerScore 查询。

阶段核对两资源不同费率、整数舍入、直接和返还采集、玩家状态回调重入、统计上限、地图覆盖及原版累计范围；当前未运行或对照。

## 实验局域网握手待验证

路径：`lan_handshake.h`、`lan_host.*`、`lan_host_ui.*`、`lan_join.*`、`lan_lobby.cpp`、`docs/lan-experimental-flow.md`。实验双方先交换协议、能力版本和 EXE 摘要，通过后才能加入和占用槽位。

阶段核对两端握手及分包／合包、超时、旧版／原版拒绝、不同 EXE、断线／重连和正常大厅兼容；摘要不能验证公共资源或认证对端，原版互通仍未实现，当前未运行。

## 子组命令与选择待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_view.*`、`game_commands.cpp`、`glue.h`、`main.cpp`、`docs/subgroup-order.md`。选项、指针修饰键和单机命令范围接入当前子组；同类型选取及联机行为按说明的实际范围验证。

阶段核对 Ctrl／双击、Shift 组合、选择上限、命令热键与小地图、设置迁移／取消、死亡／易主及联机选择；实际窗口和原版精度未验收。

## 游戏内字幕设置待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_cinematic_panel.cpp`、`docs/game-options.md`。声音页面的字幕设置控制游戏内过场对话文字并保存在独立用户目录，兼容旧版音频设置。

阶段核对控件键鼠／确认取消、旧版与损坏文件、重启保存、静音及有声／无声场景、动态切换、影片字幕和原版默认值；实际窗口及原版行为尚未验收。

## 离屏单位模型音效待验证

路径：`game_view.*`、`game_model_sound.cpp`、`model.h`、`model_particles.cpp`、`sound.cpp`、`docs/model-event-sounds.md`。视野内单位离屏时仍推进模型声音事件，并按声音距离限制音频实例。

阶段核对入离视口、动画切换／重播／暂停、视野／隐身、死亡／易主、模型共享、距离／静音／水面及大地图性能；视野外单位、离屏特效和原版表现仍待完成或对照。

## 回放浏览与会话准备待验证

路径：`replay_browser.*`、`replay_preparation.*`、`CMakeLists.txt`、`docs/replay-browser.md`、`docs/replay-preparation.md`。浏览器与地图／录制槽位准备接口已实现；主菜单入口、原版对象映射和实际回放消费尚未接通。

阶段核对真实 W3G 读取、用户目录边界／删除确认／重解析点、异步切换与退出、地图校验／缺图／数据覆盖、稀疏玩家槽／随机种子、跨线程取消及原版输入画面；Win32 Release 产品增量编译通过，完整播放尚未实现。

## 声音分类设置待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_loading.cpp`、`map_preparation.cpp`、`game_view.cpp`、`session.h`、`session_sound.cpp`、`sound.*`、`docs/game-options.md`。环境、移动和单位声音选项通过本地声音通道增益生效并持久化，脚本音量组保持独立。

功能阶段核对各复选框键鼠输入、确认／取消、旧版和损坏设置迁移、重启与切图保存、播放中的普通／堆叠声音、脚本音量组和静音组合，使用真实设备对照原版通道分类及默认值；实际运行和听感尚未验收。

## 回放时间驱动待验证

路径：`replay_runtime.*`、`CMakeLists.txt`、`docs/replay-runtime.md`。回放记录的时钟、暂停、倍速、分片拼接与回调错误状态已实现；实际播放入口、对象映射和记录消费者尚未接入。

功能阶段核对真实回放、空记录／零间隔／分片和处理上限、暂停／速度切换、时钟异常与回调失败、输入隔离和实际会话同步；当前尚未运行或完成原版兼容验收。

## 回放写入基础待验证

路径：`replay_writer.*`、`lan_runtime.*`、`CMakeLists.txt`、`docs/replay-writing.md`。内存写入经典回放容器，实验局域网时间片可由显式注册的观察器接收；保存入口、单机及完整事件采集尚未接入。

功能阶段核对真实文件及读写互通、CRC／压缩／分片和容量边界、录制失败处理、完整对局保存及原版播放器兼容；当前尚未运行或验收。

## 战鼓科技待验证

路径：`commerce.h`、`passives.h`、`session_research.cpp`、`session_auras.cpp`、`docs/research.md`。`raud` 科技增量接入发出者光环、最强来源和实际攻击加成。

功能阶段核对兽族科多兽研究前后及新建单位、多个来源和同 buff、升级／归属变化／死亡、光环残留、远近程攻击及自定义地图科技／能力覆盖；原版数值、叠加和刷新时序尚未对照。

## 夜视科技待验证

路径：`commerce.h`、`session_research.cpp`、`session_fog.cpp`、`docs/research.md`。科技 `rauv` 在符合单位源科技列表时接入实际昼夜迷雾视野并失效缓存。

功能阶段核对昼夜切换、科技增减、已有和新建单位、所有权／共享视野、自定义地图覆盖及已有夜视能力叠加，并对照原版视野和时序。

## 尖刺路障科技待验证

路径：`commerce.h`、`session_research.cpp`、`session_projectiles.cpp`、`docs/research.md`。`rspi` 研究值进入所属单位的近战固定反伤，复用会话伤害和事件路径。

功能阶段核对各等级和地图覆盖、既有／新建／易主建筑、近战／远程／闪避／免疫／致命伤、多个反伤来源和回调重入，并与原版数值、护甲分类／事件时序及模型表现对照。

## 尖刺护栏表现待验证

路径：`commerce.h`、`entities.h`、`effects.h`、`session_research.cpp`、`session_auras.cpp`、`game_effects.cpp`、`docs/research.md`。源模型按建筑附件动画属性播放对应出生／待机／死亡序列，研究和单位状态控制特效生命周期。

功能阶段核对塔／兽穴／兵营／基地及地图覆盖、模型缺失／回退、建设／升级／转让／死亡／移除、迷雾／暂停、设备恢复与大量建筑性能，并对照原版附件缩放、朝向和过渡动画。

## 符文科技消费待验证

路径：`session_item_use.cpp`、`docs/research.md`。`AIgl` 逐项激活源配置科技，原夜视和强化符文复用现有自动拾取／事件／消耗路径。

功能阶段核对两种原符文及自定义能力配置、多个目标科技／次数／上限、持有者转移、拾取与使用事件重入、背包与无背包、移除及科技实际效果，并对照原版重复使用与失败行为。

## 骷髅持续时间科技待验证

路径：`commerce.h`、`session_research.cpp`、`session_corpse_spells.cpp`、`docs/research.md`。`rrai` 从召唤单位的实际科技状态进入亡者复生定时生命。

功能阶段核对研究前后召唤、现存骷髅、技能／物品及自定义类型和科技覆盖、易主／死亡／驱散／定时生命事件；实际持续时间与原版时机尚未对照。

## 科技最大数量与混乱变形待验证

路径：`session.h`、`session_research.cpp`、`session_unit_forms.cpp`、`session_entities.cpp`、`session_ownership.cpp`、`session_game.cpp`、`docs/research.md`。`rtma` 消费研究等级变化；`Acha` 能力按科技前置与目标类型变形。

功能阶段核对 `Robk`／`Rhrt`、当前与新建单位、能力增删／禁用、敌我转移、科技上限脚本、自定义升级／能力、生命人口与队列／事件重入，并对照原版初始训练上限、排队和变形时序；标准初始化来自原 `InitBlizzard` 脚本，实际执行仍待验证。

## 升级兵种训练按钮待验证

路径：`session_commerce.cpp`、`docs/research.md`。同按钮位置且由 `Acha` 关联的训练单位依据旧型科技上限选择显示。

功能阶段核对兽族兵营／人族工厂的研究前后、科技上限脚本、自定义训练表／按钮与能力、共享控制、资源不足和训练队列；原版隐藏或禁用行为及脚本／AI 命令仍待对照。

## 亡者复生科技上限待验证

路径：`session_corpse_spells.cpp`、`docs/corpses.md`、`docs/research.md`。亡者复生按玩家科技最大数量逐个检查实际生成，标准 `uske` 上限由地图调用的原版 `InitBlizzard` 设置。

功能阶段核对标准地图初始化、上限前后／零／无限／自定义、多玩家和两类召唤物、死亡／移除／复生、尸体和空间不足、事件重入以及 AI 和物品来源；尸体消耗及费用时序尚需原版对照。

## 动态能力科技等级待验证

路径：`session_entities.cpp`、`session_spellbooks.cpp`、`docs/research.md`。脚本添加能力和法术书授予能力时读取单位已有 `rlev` 科技，工程学替换按原能力 ID 映射。

功能阶段核对 `Rusm` 前后新增／移除／重加 `Arai`、原巫师和自定义单位／能力、法术书／工程学替换与共存、施法中研究／转移以及实际召唤类型；原版动态赋予等级行为与事件时序尚待对照。

## 疾病与中毒分类待验证

路径：`session_entities.cpp`、`docs/unit-classifications.md`。`IsUnitType` 查询疾病云雾、攻击毒素和暗影突袭的实际状态。

功能阶段核对施加／重叠／过期／移除、死亡／复活、暂停及事件回调，并对照原版各类毒素和疾病的分类范围；当前没有实际运行或原版时序验收。

## Gamecache 单位运行时属性待验证

路径：`script_state.h`、`session_cache.cpp`、`campaign-gamecache.md`、`unit-turning.md`、`unit-classifications.md`。独立缓存版本3保存 StoreUnit 的脚本转速、推进角和分类增删，RestoreUnit 恢复后交由移动及分类消费者使用；版本1／2条目保留目标单位默认属性。

功能阶段核对 StoreUnit / SaveGameCache / ReloadGameCachesFromDisk / RestoreUnit 跨地图往返、九类分类和零／极限转向值、旧版本与混合条目重存、损坏／越界输入，以及目标单位创建事件与拾取事件重入；对照原版 StoreUnit 的具体行为。本次未执行运行验证。

## 地面物品选择阶段待验证

路径：lan_actions、lan_simulation、game_view。单机地面物品左键选择接入图标／名称／生命及场景选中圈；实验性局域网发送单位取消选择和经典 0x1c 选择，回放／网络动作消费检查身份及已知 flag；对象被拾取、删除、隐藏或不可见时取消展示。详情见 ground-item-selection.md。

阶段验证真实窗口点击／视野／单位与物品切换、网络确认／竞争与对象生命周期、已损坏／不同 flags 的回放记录、原版 1.27 动作与对象身份、Shift／多选、原版视觉及声音；已有颜色、圈大小和 HUD 排布尚未声称一致。

地面物品补充待测：`tests/order_queue_tests.cpp` 覆盖 0x1c 编解码、同一动作序列取消单位选择、地面物品移除后的实验性局域网时隙、未知身份和未知 flag 拒绝。Win32 Release 产品及 `war3_order_queue_tests` 增量编译通过，测试尚未执行；阶段运行 `war3_order_queue_tests.exe <data-root> <BootyBay.w3m>` 并与现有 order queue 验证合并。

## 脚本建造订单待验证

路径：session_orders、construction_tests、construction。`IssueBuildOrder`／`IssueBuildOrderById` 将名称或 ID 转入真实工人建造流程和已有事件，专项构建用例分别使用两种入口。Win32 Release 客户端及专项程序增量编译通过；阶段按 construction.md 中夹具及 `war3_construction_tests` 命令执行，核对名称／自定义 ID、资源／位置失败、队列替换、重入以及完整四族和原版事件时序；专项尚未执行。

## 脚本相机旋转待验证

路径：session_world、world、game_flow_tests、campaign-cinematics。镜头围绕指定中心和 +Z 旋转，StopCamera 暂停支持的平移和字段插值；目标与朝向控制器互斥。Win32 Release 客户端及专项程序增量编译通过；阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行，核对目标／方向跟随、手动操作、停止控制器、倾斜地形及原版视觉时序。

## 单位魔法阈值即时通知待验证

路径：`session_spells.cpp`、`session_self_spells.cpp`、`session_damage.cpp`、`session_regeneration.cpp`、`docs/unit-state-events.md`。普通施法、即时自身施法、魔法盾吸收和自然恢复的魔法变化接入阈值事件及回调重入检查；其他状态写入仍按原有步末补查。

阶段按 `unit-state-events.md` 执行夹具及会话专项，并覆盖施法取消／移除／易主、魔法盾回调移除 buff 或击杀、自然恢复及同一步跨越与复位；原版事件顺序和完整消费者尚未对照。本次 Win32 Release 产品增量编译通过，专项尚未执行。

## 实验回放倍速待验证

路径：`main.cpp`、`docs/replay-experimental.md`。游戏画面的加减键切换 0.25 至 8 倍，界面显示当前速度；空格暂停／继续与 Esc 返回仍可用。

阶段使用同构建实验局域网回放验证各档时间推进、键盘主区及数字小键盘、边界、暂停调速、最小化恢复、结束及过场切换，并核对时间片顺序和旁观输入隔离；原版回放播放与原版快捷键仍未实现或对照。本次 Win32 Release 产品增量编译通过，实际播放尚未执行。

## 脚本直接设置迷雾待验证

路径：`session_fog.cpp`、`fog_grid.cpp`、`tests/generate-live-world-fixture.py`、`docs/live-world.md`。矩形、圆形和地点三个 SetFogState 接入玩家网格、查询及绘制；共享接收者使用当前共享视野联盟，视野重算重新计算可见状态。

阶段执行 `python tests/generate-live-world-fixture.py --data-root <data-root>`，再执行 `war3_live_world_tests.exe <data-root> <fixture.w3m> <log>`，并核对三种状态、重叠先后、移动与视野重算、共享联盟方向及变化、多玩家、启停迷雾、半径／矩形网格边界、越界／极值、GPU 纹理、切图释放和原版时序。Win32 Release 产品增量编译及夹具 Python 语法检查通过，实际运行和原版一致性尚未验收。

原版 1.27 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；REA 证据 `ev_cbbbda324c9a7891de147bec6ae7b849cf013107273b043d058071cd97ad0b3d`、`ev_56b27f56bec8efd912e38387ac2617dffeeb90ea21e3d1bb2a93412d7f04e9b1`、`ev_f385bebfa3568eabbb0cbe19f3b0b7a134597367073c280f816822565db2f8f0`、`ev_eed52956f1519d8865d342a15d3de269a9e392e3849d97b53e225080f309d697` 和 `ev_f88f18ba19415b8ef6df5c8a06b80de7aa1185a3641049128afa7f9d479bde60` 表明三个入口直接写入玩家位图并分别处理 1／2／4 状态；共享掩码来源及刷新后的持续性尚未确认。

脚本迷雾补充：连续设置不同玩家的状态时，保留未受影响玩家当前有效的网格版本；此前因真实视野变化而失效的网格仍重新计算。夹具增加玩家 0 可见、玩家 1 遮蔽后再次查询玩家 0 的场景。Win32 Release 产品增量编译与夹具语法检查通过；专项行为、共享接收者和多玩家纹理仍待合并验证。

## JASS Pow 待验证

路径：`session_game.cpp`、`tests/generate-live-world-fixture.py`、`docs/jass.md`。`Pow(real, real)` 返回计算所得单精度实数；DotA `Scripts/war3map.j` 使用该函数计算技能距离。

阶段执行 live-world 夹具及消费者，核对正数、负底数整数指数、小数指数、零、溢出和非法输入，并对照原版结果与 DotA 技能范围；夹具新增正整数、负整数和平方根三种情况。当前尚未运行专项或取得原版浮点精度证据。

## 相机眼睛坐标待验证

路径：`camera_control.h`、`session_world.cpp`、`game_view.cpp`、`tests/game_flow_tests.cpp`、`docs/camera-eye.md`。四个眼睛坐标 native 与绘制共享视角几何；DotA `DD5` 使用眼睛 XY 决定镜头平移。Win32 Release 产品和会话专项增量编译通过，专项未执行。

阶段按 `camera-eye.md` 的夹具和消费者命令核对字段／句柄、真实窗口的平移／旋转／缩放／跟随、噪声和原版坐标；会话水面高度、局域网本地镜头及跟随时序仍有未完成边界。

## 地形波纹阶段待验证

路径：`world.h`、`world_height.cpp`、`session.h/.cpp`、`session_world.cpp`、`session_tick.cpp`、`terrain_scene.*`、`terrain_blight.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。Ripple 和停止接口连接会话时钟、共享地形高度及地面／悬崖／荒芜顶点；不重建地形纹理。

按 `terrain-deformation.md` 运行专项并合并 DotA、波形及停止、网格边界、单位贴地、GPU 和性能验证；原版时间与坐标精度及其他变形类型仍未完成。专项尚未执行。

## 陨坑与行进波纹待验证

路径：`world.h`、`world_height.cpp`、`session_world.cpp`、`terrain_scene.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。Crater 和 Wave 连接原生句柄、时钟、共享地形高度与绘制；永久凹坑自然到期固化，StopAll 保留已固化高度。未变化顶点跳过 GPU 上传。

阶段执行现有 game-flow 夹具和消费者，核对普通／永久陨坑、自然结束／停止／交错、重叠与固化量化、Wave 方向／拖尾／循环、异常参数、脚本高度及单位贴地、GPU 设备恢复、实际画面、原版结果和性能。专项尚未执行。

## 随机地形变形待验证

路径：`world.h`、`world_height.cpp`、`session_world.cpp`、`session_tick.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。Random 连接会话随机源、按间隔缓存角点、共享地形查询／绘制和停止时钟；会话主 RNG 已接入原版双状态算法，完整采样顺序与同步仍待验证。

阶段执行 game-flow 夹具及消费者，核对固定种子／区间／边界、查询不消耗随机数、首次与重复采样、停止／超时／暂停、效果叠加、原版网格与 RNG 顺序、多客户端同步、GPU 和大范围采样性能。专项尚未执行。

## 游戏随机状态与 JASS 范围待验证

路径：`session.h/.cpp`、`session_game.cpp`、`session_network_identity.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。游戏独立实例复用原版双状态 RNG；会话构造直接初始化传入种子，脚本 SetRandomSeed 预热一次，JASS 整数／实数范围按原件边界消费随机数，实验局域网校验包含两个状态字。

阶段按 terrain-deformation.md 的 game-flow 命令执行原件 seed=17 向量、相等／逆序／全整数范围／实数 epsilon、脚本和随机地形共享状态；合并多种子、技能／随机池、随机采样顺序、真实双方同步及回放验证。原版默认和大厅初始种子流程、辅助随机组件以及完整调用顺序尚未确认；本次专项尚未执行。

## 单位睡眠权限待验证

路径：`session_control_spells.cpp`、`tests/control_tests.cpp`、`docs/control-spells.md`。四个睡眠权限 native 使用 ACsp／Asla 真实能力及现有能力生命周期；权限与当前睡眠状态分开。Win32 Release 产品和专项程序增量编译通过，专项未执行。

阶段按 control-spells.md 运行 flow 夹具，核对两种权限的新增／删除／重复／空单位、能力句柄与自定义单位、变形／死亡／易主、与魔法睡眠及唤醒交互，并对照原版；自然昼夜睡眠尚未实现。原版入口及能力证据为 `ev_070b138d97f97b6aee4ce2a89730ccadfe0d7169f94c1957e4b2568ecbdbe950`、`ev_b4815f23492ab1abeda8ce8d47808fb3f4ab36a02d322cbf01ba33ea5272769e` 和 `ev_280a65f12454e74fb1a209f0d04ce862ba47c70a56316a01448f32de873b60a2`。

## 暴击、重击辅助随机与伪随机计数待验证

路径：`audio_random.h`、`session.h/.cpp`、`session_game.cpp`、`entities.h`、`session_attack_passives.cpp`、`session_spells.cpp`、`session_equipment.cpp`、`session_network_identity.cpp`、`tests/passive_tests.cpp`、`docs/auras-passives.md`。SetRandomSeed 派生 45 条辅助流；暴击、重击和醉拳按源 PRD 表及能力计数使用第 3 条流，实验局域网校验包括流状态与计数。初始会话以主随机对象副本派生辅助流，原版开局种子／时序尚未确认。

阶段执行 passive 夹具及 `war3_passive_tests.exe`，覆盖 seed 17 的 15% 连续 8 次计数、0／100%、重击／醉拳、技能等级／移除重加／库存／变形／死亡／易主、目标门控、重入、与脚本主随机流隔离和多端同步；向量由原件核对的随机表及倒数表静态推算，尚非原件运行态结果。相同技能多物品实例目前合并计数；原版其他辅助流消费者和实例／调用顺序待实现或对照。原件证据 `ev_386c6c37e21063ff442761139eede26c7c2607ac004f74fd966205a142cc6b8f`、`ev_209c7884597b4c7bc81e563be04e4f4aae019519e59ae369f10f6d5ab884a42f`、`ev_4a630a7a9c648a176ae172259d14881961fa370d0b444ffd42fd7b671ddc4865`。专项尚未运行。

## 法球缺省弹道待验证

本次合并 Win32 Release 客户端编译通过；功能专项尚未运行。

路径：`session_weapon_effects.cpp`、`session_projectiles.cpp`、`docs/weapon-effects.md`。缺省速度的物品法球弹道采用暂定速度并进入实际飞行与命中流程；非零武器速度和法球速度仍按原参数使用。

阶段覆盖 Hpal／Obla 装备法球的移动目标、飞行期间目标死亡／移除、发射者移除、切图释放、不同距离的命中时间、近战即时攻击、非零武器及法球速度覆盖和多法球选择；对照原版速度与命中时序。玩法、画面、性能和原版精度均待验证。

## 自然昼夜睡眠待验证

本次合并 Win32 Release 客户端编译通过；功能专项尚未运行。

路径：`entities.h`、`session.h`、`session_control_spells.cpp`、`session_tick.cpp`，实现说明见 `control-spells.md`。自然睡眠接入会话时钟、实际单位状态、动画、敌人接近、伤害及脚本唤醒；当前资格、唤醒范围及当夜重睡规则为暂定行为。

功能阶段合并验证昼夜与时间跳转、暂停、两种睡眠权限、敌人靠近／伤害／脚本唤醒、魔法睡眠叠加、死亡／易主／变形、双端同步和大地图性能，并对照原版。运行和原版一致性尚未验证。

## 小地图单位颜色待验证

本次合并 Win32 Release 客户端编译通过；功能专项尚未运行。

路径：`game_view.cpp`，说明见 `minimap-colors.md`。小地图单位标记接入玩家颜色、单位颜色覆盖与机械伪装，选中和替代图标沿用对应绘制流程。

功能阶段验证多玩家、SetPlayerColor／SetUnitColor、易主、伪装、视野与中立单位、选中及替代图标、资源未就绪和切图 GPU 生命周期，并对照原版小地图颜色与表现；当前尚无实际窗口或原版一致性验收。

## 全局变量阈值事件待验证

Win32 Release 客户端与关联会话／亡灵形态消费者程序已合并编译通过；专项未执行。

路径：`jass_runtime.h/.cpp`、`script_state.h`、`session_callbacks.cpp`、`tests/session_tests.cpp`；标量 real 变量赋值通过实际 VM 存储入口派发阈值触发器，详细边界见 `script-events.md`。

阶段运行 `war3_session_tests.exe <tmp/docs-artifacts/war3/jass/session-variable-events.json>`，并验证全部比较符、赋值重入／睡眠、多个监听、启停／销毁、原值已满足、无效变量与真实自定义地图及联机同步，对照原版事件时序与边界。当前专项尚未执行。

## 钻地侦测能力待验证

Win32 Release 客户端与关联会话／亡灵形态消费者程序已合并编译通过；专项未执行。

路径：`session_passive_info.cpp`、`tests/generate-undead-forms-fixture.py`、`tests/undead_forms_tests.cpp`；Abdt 家族接入既有侦测网格及自定义覆盖，源数据与当前规则见 `burrow-detection.md`。

阶段按 undead-forms 夹具及消费者验证源零掩码和自定义位、增删能力、移动、共享视野、潜地目标及地图覆盖，并核对原版能力来源、掩码语义、界面与性能。专项及原版一致性尚未验证。

## 多选单位面板待验证

Win32 Release 客户端与关联会话／亡灵形态消费者程序已合并编译通过；专项未执行。

路径：`game_selection_panel.cpp`、`game_view.cpp/.h`、`CMakeLists.txt`，见 `selection-panel.md`。多选头像、生命、子组、选择操作及单位目标命令连接现有选区、命令和实验联机时间片。

阶段验证真实窗口的多选、Shift／Ctrl、目标与取消、选中单位被回调移除或死亡、图标加载、货舱／物品／命令区，双端确认与回放及原版排布和交互；本次专项未运行。

## 单位关系查询和地点起点待验证

Win32 Release 客户端及关联消费者程序已合并编译通过；其后 AI 购买筛选有改动，执行阶段需重新链接相关消费者。专项未执行。

路径：`session.cpp`、`session_entities.cpp`、`tests/session_tests.cpp`、`tests/live_world_tests.cpp`，见 `entities.md`。单位身份、种族和 force 查询使用实际状态；地点起点写入真实地图配置。

阶段运行 session 与 live-world 消费者，验证地点复用／销毁、边界索引、单位易主／变形、force 增删／销毁、空及失效句柄和实际自定义地图；对照原版返回值。专项尚未执行。

## AI 英雄物品待验证

Win32 Release 客户端增量编译通过；专项未执行。

路径：`ai.h`、`session_ai.cpp`、`session_ai_transport.cpp`；物品使用、购买、前往商店和订单预约接入实际消费者，规则与暂定阈值见 `ai-hero-items.md`。

阶段验证目标／使用次数／冷却、回调重入、敌人接近、商店失效／库存／资金、订单覆盖、寻路及暂停、四族长局、实验联机同步及原版策略；现有联机摘要不包含 AI 预约状态。专项未执行。

## 单位战斗信息面板待验证

Win32 Release 客户端及关联消费者程序已合并编译通过；其后 AI 购买筛选有改动，执行阶段需重新链接相关消费者。专项未执行。

路径：`combat.h`、`session.h`、`session_attack_passives.cpp`、`session_damage.cpp`、`session_research.cpp`、`game_commands.cpp`、`tests/passive_tests.cpp`；面板消费共享武器伤害和护甲计算，范围与显示边界见 `unit-combat-panel.md`。

阶段合并 passive 专项及真实窗口，验证单／多选切换、生产及货舱、四族和双武器、科技／装备／状态／光环、极值、回调移除、设备恢复和原版显示。专项尚未执行。

## 静态单位类型查询待验证

Win32 Release 客户端及相关 game-flow／research 消费者程序已合并编译通过；专项未执行。

路径：`session_entities.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`；类型分类与未支持的运行态范围见 `unit-id-classification.md`。

阶段生成 research 夹具并运行 `war3_research_tests`，验证源／自定义单位、继承、飞行、武器及类别，未知 ID、运行态类别与无创建副作用，并对照原版；专项尚未执行。

## 受攻击提醒待验证

Win32 Release 客户端及相关 game-flow／research 消费者程序已合并编译通过；专项未执行。

路径：`entities.h`、`session.h`、`session_text.cpp`、`session_damage.cpp`、`tests/game_flow_tests.cpp`；实际攻击伤害连接本地提示、原皮肤音效和小地图颜色，脚本可禁用；规则及暂定间隔见 `attack-alert.md`。

阶段合并 game-flow 夹具，验证脚本开关／无效单位、伤害／抵挡／事件回调、单位与建筑、提示去重、暂停、窗口／听感、地图皮肤覆盖、多客户端及原版差异。专项尚未执行。

## 单位 Buff 面板待验证

Win32 Release 客户端及相关 game-flow／research 消费者程序已合并编译通过；专项未执行。

路径：`game_buff_panel.cpp`、`game_view.cpp/.h`、`session.h`、`CMakeLists.txt`；显示和资源边界见 `buff-panel.md`。

阶段验证 Buff／光环增减与过期、单／多选、图标流式加载和缺失、原皮肤和地图覆盖、悬停文本、窗口／GPU 恢复和性能，核对原版布局／排序。专项尚未执行。

## 实验回放接收地图关联待验证

路径：`replay_experimental.*`、`replay_preparation.*`、`replay_browser.cpp`、`lan_mapcheck.*`、`lan_lobby.*`、`lan_match_loading.*`、`platform.*`、`main.cpp`；保存回放时按内容关联原始地图，播放优先读取安装地图，细节及清理边界见 `replay-experimental.md`。Win32 Release 客户端编译通过，实际回放未执行。

阶段验证已安装原图／接收图、后台摘要、哈希不符和文件占用、共享硬链接／复制回退、删除前内容替换及并发访问、失败后回放保留、进程异常、双端和重启播放；核对删除时的界面响应及内存开销。原版回放互通仍待实现。

## 地图 Buff 覆盖待验证

路径：`object_data.h/.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`，说明见 `buff-overrides.md`。Win32 Release 客户端及 research 消费者已合并编译。阶段生成 research 夹具并运行对应消费者，检查原 Buff 修改、自定义 Buff 继承、大小写及图标／描述／特效字段；在真实自定义地图验证画面、切图释放和原版行为。专项及实际运行尚未验证。

## 任务列表滚动条待验证

路径：`quest_dialog.h/.cpp`、`glue.h/.cpp`，说明见 `quests.md`。Win32 Release 客户端已合并编译。阶段在真实窗口验证主线／支线／目标列表及说明的显示条件、点击、拖动和滚轮，色码／长中文／空行／极长文本、任务增删与选择变化后的偏移、界面焦点、性能和原版布局。实际窗口及原版一致性尚未验证。

## 回放删除后台化待验证

路径：`replay_browser.h/.cpp`，说明见 `replay-experimental.md`。Win32 Release 客户端已合并编译。阶段在真实窗口检查大地图校验时的帧率、读取／删除错误提示、文件锁和替换、硬链接、并发、目录重解析以及关闭／取消边界；实际运行尚未验证。

## W3G 聊天记录待验证

路径：`replay.h/.cpp`、`main.cpp`、`session.h`、`session_spatial_events.cpp`、`tests/session_tests.cpp`，说明见 `replay-chat.md`。Win32 Release 客户端及会话消费者已合并编译。阶段合并会话专项与真实回放，核对各频道、私聊槽位、触发器、文本编码、记录顺序与异常输入；原版回放入口仍未开放，尚无实际播放及原版一致性验收。

## 地形变形物件高度待验证

路径：`entities.h`、`session.h`、`session_destructables.cpp`、`scene_objects.h/.cpp`、`game_view.cpp`、`game_effects.cpp`、`tests/game_flow_tests.cpp`，说明见 `terrain-deformation.md`。Win32 Release 客户端和 game-flow 消费者已合并编译。阶段合并 game-flow 夹具并验证原有和变形中创建的可破坏物、普通装饰物、波纹／永久凹坑／停止、附着特效、点选／遮挡、地形边界及远区裁剪，并对照显式 Z 的原版行为与大地图性能。专项、实际画面和原版一致性尚未验证。

## 盟友颜色过滤待验证

路径：`world.h`、`session_text.cpp`、`game_view.h/.cpp`、`tests/game_flow_tests.cpp`，说明见 `ally-color-filter.md`。Win32 Release 客户端和 game-flow 消费者已编译；阶段验证三档、小地图／单位颜色、Alt+A、观战／联盟／伪装、地图覆盖、GetLocalPlayer 和原版按钮及画面。实际窗口和原版一致性尚未验证。

## 缓存同步动作接收待验证

路径：`lan_cache_sync.h`、`lan_actions.h/.cpp`、`lan_simulation.h/.cpp`、`session.h`、`session_cache.cpp`、`tests/session_tests.cpp`，说明见 `cache-sync.md`。Win32 Release 客户端和会话消费者已编译；阶段验证编解码、实际时间片顺序／容量、两端缓存、坏数据、并发及回放。JASS 发送与唤醒、单位快照及原版互通尚未完成。

## 资源总分待验证

路径：`session_match.cpp`、`tests/harvest_tests.cpp`，说明见 `player-scores.md`。Win32 Release 客户端和采集消费者已编译；阶段验证资源返回、维护费、玩家隔离、溢出与原版结算统计。专项尚未运行。

## 对象名称查询待验证

路径：`map_ui.h/.cpp`、`object_data.h/.cpp`、`session_game.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`，说明见 `object-names.md`。阶段验证 Profile ID、单项／多项／带引号逗号、空与缺失名称、覆盖优先级、继承及 DotA 调用，并与原版对照。专项尚未运行。

## 天气区域与渲染待验证

路径：`map.cpp`、`session.cpp`、`session.h`、`session_weather.cpp`、`game_weather.cpp`、`game_view.h/.cpp`、`scene_streaming.h/.cpp`、`tests/map_tests.cpp`，说明见 `weather.md`。Amazonia 最小 main 检查通过且未加载 Game.dll；阶段验证 W3I 默认值、脚本区域启停／移除、不同源类型和图集、缺失／损坏纹理、摄像机移动、小区域、时间片、设备恢复、声音、长局和原版画面／性能。GPU 实际画面和原版一致性尚未验证。

## 缓存同步发送与小地图按钮待验证

路径：`session_cache.cpp`、`session_tick.cpp`、`session_collections.cpp`、`session.h`、`lan_runtime.h/.cpp`、`game_view.cpp`、`game_loading.h/.cpp`、`session_text.cpp`、`world.h`、`tests/session_tests.cpp`、`tests/revival_tests.cpp`、`tests/game_flow_tests.cpp`；详情见 `cache-sync.md`、`ally-color-filter.md`。Win32 Release 客户端及相关消费者已编译；`war3_revival_tests <data-root> <fixture.w3m> lan-leave` 的最小队列顺序及离开检查 1 项通过、0 失败。阶段验证单机回显、实际发送／双端和回放、堵塞／超长／离开、按钮状态／快捷键／悬停及多人本地状态。单位缓存快照和原版联机互通仍未完成。

## 天气环境音待验证

路径：`session_weather.cpp`、`session_sound.cpp`、`session.h`，说明见 `weather.md`。阶段验证原版雨／风标签、音量与环境音选项、静音切换、进入／离开区域、重叠同名和不同名区域、启停／移除、切图释放、自定义空间声与异常资源，并对照原版听感和过渡；Win32 Release 客户端编译通过，实际音频尚未验收。

## 小地图野怪营地待验证

路径：`game_loading.h/.cpp`、`game_view.h/.cpp`，说明见 `creep-camps.md`。Win32 Release 客户端已编译；阶段验证原始贴图／位置／提示、点击／Alt+R／禁用、过滤状态脚本、营地分组及等级阈值、野怪死亡／易主、迷雾、动态生成、皮肤覆盖、大小地图性能及原版对照。原模型动画尚未实现；动态重建的结果与性能尚未验证。

## 小地图底图、地形开关与迷雾待验证

路径：`game_loading.h/.cpp`、`game_view.h/.cpp`、`main.cpp`，说明见 `minimap.md`。Win32 Release 客户端编译通过；BootyBay 临时副本删除底图后的单帧对局启动通过，日志 `tmp/docs-artifacts/war3/weather-source-probe/no-minimap-play-final.log`。阶段验证 Alt+T/A/R/F、回放速度与 Alt+F4、按钮交叠及皮肤覆盖、三图和无底图地图的画面／地图方向、迷雾／战争迷雾切换、营地／单位／提示遮罩、运行时地形改变、设备恢复和帧耗时，逐项与原版对照；单帧启动不代表视觉或实际交互通过。

## 背包科技待验证

背包路径：`session.h`、`session_inventory.cpp`、`session_equipment.cpp`、`tests/research_tests.cpp`，说明见 `backpack-research.md`。阶段执行 research 夹具和消费者，核对四族科技前后、能力覆盖／前置数量、拾取、装备、易主／死亡／删除、英雄六槽和自定义建筑前置性能。 Win32 Release 客户端与 research 消费者已编译，专项和原版对照尚未执行。

## 对局分数待验证

路径：`game_state.h`、`session_match.cpp`、`session_production.cpp`、`session_construction.cpp`、`session_callbacks.cpp`、`tests/commerce_tests.cpp`，说明见 `player-scores.md`。Win32 Release 客户端及 commerce 消费者已编译。阶段执行 commerce 和 harvest 消费者，核对不同类型生产／建筑／击杀、英雄经验／归属、资源与总分；另对照原版初始单位、脚本创建、召唤／幻象、免费建造、复活、移除、变形、溢出及联机／结算。专项和原版对照尚未执行。

## 整数游戏状态待验证

路径：`script_state.h`、`session.h`、`session_callbacks.cpp`、`session_match.cpp`、`tests/session_tests.cpp`，说明见 `integer-game-state.md`。阶段执行 session 消费者，核对读写／越界、完整位型、比较符、事件上下文、注册／销毁、回调重入和时间状态隔离；另与原版对照初值、阈值换算与事件时序，并验证本地断线与联机同步。Win32 Release 客户端及 session 消费者已编译；专项和原版对照尚未执行。

## 科技百分比待验证

路径：`object_data.h/.cpp`、`session_match.cpp`、`tests/research_tests.cpp`，说明见 `player-scores.md`。阶段执行 research 消费者，核对四族与无科技种族、0／多级研究、地图自定义覆盖、`used`／`maxlevel`、错误输入和玩家隔离，并与原版比较有效科技、种族映射、随机种族时序、百分比精度及多人同步。Win32 Release 客户端与 research 消费者已编译；专项与原版对照尚未执行。

## 单位类型 ID 运行态与召唤分类待验证

路径：`session_entities.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`，说明见 `unit-id-classification.md`。阶段运行 research 夹具与消费者，核对 1、10、11–13、21–26、越界类别、未知大写 ID、自定义 summoned 与精确 token；对照原版实例召唤标记及自定义地图行为。Win32 Release 客户端与 research 消费者已编译；专项与原版对照尚未执行。

实例源召唤分类新增 `entities.h`、`session_entities.cpp`、`session_ai_armies.cpp`、`session_caster_spells.cpp`、`session_control_spells.cpp`、`session_feedback.cpp`、`session_magic_consumption.cpp`、`session_ownership.cpp`、`session_rewards.cpp`、`session_weapon_effects.cpp` 及 research 夹具检查。Win32 Release 客户端及 research 消费者已编译；阶段合并验证普通创建的源召唤类型、显式增删、驱散／控制／经验／AI／攻击效果、限时生命、变形及幻象，并对照原版动态分类和事件；新增检查尚未运行。

## 战役动画稀有度待验证

路径：`model_sequence.h/.cpp`、`model.cpp`、`session_visual.cpp`，说明见 `animation-rarity.md`。Win32 Release 客户端已编译；阶段验证 NightElfX01 实际脚本、普通／稀有序列、缺失类别回退、模型变化、动画队列、附件及多人确定性，核对原版权重与时序；专项和原版对照尚未执行。

## 安装版本与回放产品待验证

路径：`session.h/.cpp`、`session_game.cpp`、`map_preparation.h/.cpp`、`replay.h/.cpp`、`replay_preparation.h/.cpp`、`tests/session_tests.cpp`，说明见 `game-version.md`。阶段运行 session 与回放准备消费者，核对安装基础版／资料片支持位、WAR3／W3XP／未知产品、全局初始化与 config 顺序、兼容矩阵、战役和版本状态隔离；对照原版许可、资源缺失、ROC／TFT 回放、资源优先级及科技百分比；当前 ROC 回放仍使用含 TFT 的归档视图。Win32 Release 客户端及 session 消费者已编译；专项与原版对照尚未执行。

## 实验回放时间显示待验证

路径：`replay_runtime.h/.cpp`、`main.cpp`，说明见 `replay-experimental.md`。阶段验证正常及零时长记录、分片、时间片应用失败、暂停／恢复、各档倍速、最小化与过场、长时长及窗口缩放，核对实际时间片与显示；Win32 Release 客户端增量编译通过，实际播放和原版显示待验证。

### 局域网任务窗口（待验证）

路径：`game_view.cpp`、`docs/quests.md`。实验局域网允许 F9／顶部入口打开和关闭任务窗口，确认本地提示并保持对局模拟。集中验证双端不同时间打开／关闭、任务动态变化、闪烁、聊天／菜单／离开交互、键鼠和模拟同步；原版窗口与暂停规则待对照。本次仅作差异检查，运行验收未执行。

### 战役菜单环境音（待验证）

路径：`campaign_browser.h/.cpp`、`main.cpp`、`docs/campaign-flow.md`。各战役读取源 `AmbientSound` 标签，使用原声音表与内存资源循环播放；切换或离开时释放，尊重音效音量、环境音开关和静音参数。集中验证全部 ROC／TFT 战役切换、相同标签连续选择、反复进出／游戏／影片切换、缺失资源和设备错误、音量及静音设置、长时资源释放与原版听感；背景雾语义尚待研究。Win32 Release 客户端增量编译通过，实际播放尚未执行。

### 不可达目标的移动落点（待验证）

路径：`world_path.cpp`、`world.h`、`session_orders.cpp`、`session_combat_orders.cpp`、`session.h`、`tests/world_tests.cpp`，说明见 `water-pathing.md`。普通移动与攻击移动在目标格可通但不可达时按已访问的可达区域选择接近落点，限定原 A* 搜索预算；事件仍使用点击坐标。Win32 Release `war3_world_tests` 编译通过；隔墙回退及既有阻挡目标两项定向检查各 1 通过、0 失败，未加载 Game.dll。待集中验证不同地形／半径、墙体／封闭区、达到预算、目标阻挡或中途变化、多选／巡逻／队列、AI 与真实窗口；原版落点规则尚未对照。

### 盟友受攻击提醒（待验证）

路径：`session_text.cpp`、`session.h`、`docs/attack-alert.md`。盟友单位／建筑受到实际敌方攻击伤害时读取对应原皮肤声音及小地图提示，己方和盟友分别限频。本次未编译或运行；集中验证双方联盟方向／共享视野、敌方与自伤、单位／建筑、无效或完全吸收的伤害、死亡／易主回调、忽略警报、己方和盟友连续攻击／独立冷却、皮肤覆盖、静音／听感及双客户端模拟一致性，并对照原版触发和时序。

### 游戏 HUD 顶部按钮文字（待验证）

路径：`game_loading.h/.cpp`、`game_view.cpp`、`docs/game-flow.md`。验证菜单／盟友／任务按钮在不同语言与地图覆盖资源下的文字、颜色、闪烁、位置、长文边界与点击热区，并与 1.27 画面及快捷键对照；Win32 Release 编译和实际窗口待合并验证。

### 战役章节页恢复（待验证）

路径：`campaign_browser.cpp`、`docs/campaign-flow.md`。返回章节页后按最新战役进度恢复选择并重新准备可用地图；不同战役切换时选择目标首章。集中验证胜利／失败／菜单退出、相同及不同战役、章节解锁／禁用、影片条目、准备失败／取消／重复返回、后台旧请求失效与资源释放，并与原版对照实际选择及窗口行为。实际战役未执行。

2026-10-30 合并实现编译：`4ac3dd7`、`f3fe84c` 和 `4e33599` 所在 Win32 Release 集成版本执行 `cmake --build --preset release --target war3 --parallel 8` 通过；上述三项玩法、窗口与原版对照仍待验证。

### 战役脚本默认难度（待验证）

路径：`session_match.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-flow.md`。集中执行 game-flow 夹具，核对四种难度读写、默认值与当前值隔离，以及 Blizzard.j 胜利回调恢复当前难度；覆盖跨关、重开、战役资料、原版默认值／持久化、无效值和多人行为。该夹具新增断言尚未编译或执行；原版行为与实际战役待对照。

### 电脑英雄回城（待验证）

路径：`session_ai.cpp`、`docs/ai.md`。启用英雄逃跑时，危急英雄通过实际回城物品向己方主基地施法；阶段验证四族 AI、生命与敌人阈值、魔免／无敌、技能和物品优先级、卷轴次数／冷却／耗魔、敌我视野／基地有效性、打断／事件重入及多人确定性，并与原版行为对照。源码仅作差异检查，编译及实际对局未执行。

### 地图脚本回放保存控制（待验证）

路径：`session.h`、`session_game.cpp`、`main.cpp`、`docs/replay-experimental.md`。阶段验证 main 和对局中调用、多个玩家本地分支、结算保存按钮与异常退出自动保存、提前保存后的已有文件、录制器释放及下局状态重置；对照 1.27 的自动／手动保存边界。实验局域网双端、原版行为及单机录制仍待验证或实现。

2026-10-30 合并实现编译：`fbed693`、`58defa2` 和 `ae4e697` 所在 Win32 Release 集成版本执行 `cmake --build --preset release --target war3 --parallel 8` 通过；玩法、保存和原版对照仍待验证，新增测试断言尚未运行。

### 采集返还可达基地（待验证）

路径：`session_harvest.cpp`、`commerce.h`、`session.h`、`docs/economy.md`。验证隔墙最近基地／可达次近基地、超过四个不可达候选的轮转、候选增删／易主／建造／暂停、动态路径阻塞及恢复、金木双资源与事件回调、显式目标语义；检查无候选时携带资源保留、每秒重试及高密度地图性能，并与原版选点／事件时序对照。本次仅差异检查，玩法和产品编译待合并验证。

### 战役对白表格式坐标（待验证）

路径：`slk.cpp`、`sound.cpp`、`tests/sound_tests.cpp`、`docs/campaign-cinematics.md`。Win32 Release 产品及声音测试目标编译通过；格式游标及普通表各一项定向通过。Human01 原图已越过对白标签阻塞，后续在 w3u 尾字段中止；原始日志见 `tmp/docs-artifacts/war3/campaign/human01-120s-sylk-1030.log`。集中验证源表和地图覆盖的全部相关声音、实际听感、异常及截断、格式／公式与各类对象表兼容，并完成原版战役实际流程。

### 经典对象覆盖尾字段（待验证）

路径：`object_data.cpp`、`tests/map_tests.cpp`、`docs/object-overrides.md`。Win32 Release 产品与地图测试目标编译通过；原 Human01 `oC16/umdl/owar`、合成非零尾字段及截断拒绝一项定向检查通过。Human01 越过对象覆盖后在 `IssueImmediateOrder` 无效句柄处停止，证据 `tmp/docs-artifacts/war3/campaign/human01-120s-objects-1030.log`。阶段覆盖五类覆盖文件、来源继承、不同末尾字段／损坏／截断和实际地图玩法，确认尾字段与原版语义。

### 空单位即时命令（待验证）

路径：`session_entities.cpp`、`session_orders.cpp`、`docs/player-commands.md`。Win32 Release 编译通过；Human01 原图 main 越过空单位命令并完成初始化，请求 120 秒静音推进的检查返回成功，实际模拟 36.96875 秒后处于对话框／暂停，未完成整关。集中验证字符串／编号、null／无效／已销毁单位、命令事件／队列、回调重入及原版返回值；真实窗口与战役继续留待验收。日志 `tmp/docs-artifacts/war3/campaign/human01-120s-nullorder-1030.log`。

### 采木目标可达性（待验证）

路径：`commerce.h`、`session.h`、`session_destructables.cpp`、`session_lumber.cpp`、`docs/destructables.md`。集中验证树木死亡／移除、隔墙树与可达替代、四个以上候选的轮转、无候选／暂时不可达、树木复活、路径动态变化、携木返还后接续、晕眩／定身／停止／重下命令、农民／苦工／食尸鬼／小精灵及脚本事件；对照原版选择规则并测量密集树林与大量工人的 CPU 开销。当前未编译或运行，保留批次验证。

### 玩家小地图信号（待验证）

路径：`game_loading.*`、`game_view.*`、`glue.h`、`main.cpp`、`player_commands.*`、`session_text.cpp`、`session.h`、`lan_actions.*`、`lan_action_encoder.cpp`、`lan_simulation.*`、`docs/minimap.md`。阶段验证 Alt+G、按钮和 Alt+左键在地面／小地图的落点、键鼠按下与松开、取消／失焦／聊天和其他弹窗隔离、资源缺失／地图皮肤、提示音及模型；验证己方／单向与双向盟友／敌方／观察者的可见范围、改变联盟顺序、无选择发送、时间片重放、畸形／非有限坐标和长时间发送资源释放。对照原版 1.27 的按钮坐标、样式、快捷键、颜色、声音、收件人及 0x68 原始字段；实验双端和回放尚未验收。

### 开局队伍联盟（待验证）

路径：`session.h`、`session.cpp`、`lan_setup.cpp`、`tests/setup_tests.cpp`、`docs/map-loading.md`。同队已启用或地图声明的中立玩家初始化基础联盟，记录 config 阶段逐位覆盖，并消费自定义 force 视野与控制标志。Win32 Release `war3` 和 `war3_setup_tests` 合并编译通过，包含 `ed488c6`、`66fd97e`；setup 检查 5/5 通过。Human01 原图静音战役上下文最小检查推进 60 秒，阿尔萨斯与乌瑟尔未相互攻击、生命 650／1250；仅证明开场，不表示完整关卡通过，见 `tmp/docs-artifacts/war3/human01-session-probe/`。阶段验证多队／同队／开放与关闭槽、12–15 特殊玩家、force 各标志与共同胜利、对称／非对称 config 覆盖、重复应用草稿、双端同步和原版敌我／共享视野／胜负行为；force 未标记 allied 的规则尚未得到原版运行证据。

### 存活桥梁修理（待验证）

路径：`commerce.h`、`entities.h`、`session.h`、`session_combat_orders.cpp`、`session_repair.cpp`、`docs/base-development.md`。受损存活桥梁接入目标修理和原资源参数消费；Win32 Release 产品合并编译通过。阶段验证三类工人、右键／显式命令、范围与寻路、资源不足／零费用、多个工人、满血停止、目标死亡／移除、资源回调中改变归属或重新下令、自定义目标字段、桥梁自动修理、死亡桥及原版费用和时序；实际窗口、联机和原版对照尚未执行。

### 视频阴影档位（待验证）

路径：`game_effects.cpp`、`game_flow_ui.cpp/.h`、`game_preferences.cpp/.h`、`docs/game-options.md`。关闭／低／高档已接入阴影绘制、纹理请求及 video.bin V3 保存，Win32 Release 产品合并编译通过。阶段验证游戏内鼠标／键盘选择、确认／取消／Esc、即时切换、重进对局及 V1／V2 迁移和损坏输入；分别检查静态、建筑、单位和水面阴影的 GPU 画面、缓存及性能，并与原版档位含义和布局对照。主菜单尚无视频设置入口。

### 单位局部绕行（待验证）

路径：`session_orders.cpp`。近距离避让全部受阻时，限额搜索局部可通行路径并保留原目标。Win32 Release 产品编译通过；Human01 独立探针覆盖修复后的移动对象并链接同版核心库，英雄越过原停点并继续行进，见 `tmp/docs-artifacts/war3/human01-continuation-1030/human01-bfs-limited.log`。阶段验证密集单位、窄口／死路、短距离目标、动态障碍、重下命令、不同碰撞尺寸和移动类型、重寻路及原版行为；测量大量单位阻塞时 CPU 帧耗时与公平性，并在真实窗口及完整战役中验收。

### 已摧毁桥梁重建（待验证）

路径：`session_repair.cpp`、`game_view.cpp`、`tests/construction_tests.cpp`、`docs/base-development.md`。死桥可在修理模式下选中并接入工人修理；首个恢复生命步骤切换桥梁存活状态。Win32 Release 产品合并编译通过，新增消费者检查未运行。阶段验证命令输入、路径占用／通行表面、动画、费用、目标回调、同时修理、敌我和资源不足，并对照原版死桥恢复时机。

### 主菜单选项（待验证）

路径：`front_options.cpp/.h`、`main.cpp`、`CMakeLists.txt`、`docs/game-options.md`。主菜单使用原 OptionsMenu FDF 接入已实现的游戏性、声音和视频设置；Win32 Release 产品合并编译通过。阶段验证页面切换、键鼠／滑块／下拉、确认与取消、损坏文件和部分保存失败、重新进入及跨对局读取、菜单音效／音乐调整，与原版布局和行为对照；其余设置仍待实现。

### 战役任务空句柄（待验证）

路径：`session_quest.cpp`、`docs/campaign-flow.md`。任务／目标句柄失效时返回空结果或忽略修改；Win32 Release 产品合并编译通过。隔离探针通过 KillUnit 加速触发 Human01 首领组死亡，进入胜利对话框，“继续”产生 Human02 换关请求，见 `tmp/docs-artifacts/war3/human01-victory-1030/victory-continue.log`；未进行完整手动通关或加载第二关。阶段验证空／错误类型／销毁句柄、任务目标创建与修订、事件顺序、真实战役操作及换关加载，并对照原版接口。

### 模型 SPL 地表事件（待验证）

路径：`model_particles.cpp`、`game_model_sound.cpp`、`game_view.h`、`docs/model-event-sounds.md`、`third_party/warcraft-model-reference/source-info.json`。游戏模型与附件的 SPL 动画事件接入源 SplatData 贴花及纹理消费；Win32 Release 产品合并编译通过。阶段验证实际原版模型的事件及来源、全局序列／循环／跳帧、附件变换、音效、视野和离屏、水陆高度、纹理加载／释放、GPU 画面与性能；主菜单等界面场景及原版精度尚未验收。

### Human02 空位置接口（待验证）

路径：`session_entities.cpp`、`session_world.cpp`、`tests/world_tests.cpp`、`docs/campaign-flow.md`。无效单位的 GetUnitLoc 返回空位置，坐标查询返回零，移除无效位置安全返回；Win32 Release 产品合并编译通过。隔离战役探针从原 Human02 main 推进至 400 秒，55.25 秒玩家控制为关闭、60.25 秒为开启，见 `tmp/docs-artifacts/war3/human02-1030/locfixed.log`；未载入 Human01 缓存、未操作战斗或验证窗口。阶段验证空／错误类型／销毁句柄、真实位置和事件、源地图开场与完整换关、缓存继承和原版边界。

### 电脑英雄闪烁撤退（待验证）

路径：`session_ai.cpp`、`docs/ai.md`。启用英雄逃跑的低生命英雄可使用已学闪烁远离可见威胁，复用实际技能／落点及事件；Win32 Release 产品合并编译通过。阶段验证低生命、敌人靠近／消失、禁法／魔法／冷却／科技、不可达及拥堵落点、多威胁方向、死亡／易主和事件重入、施法后命令、双端同步及 CPU 开销，并与原版 AI 对照。

### 自动修理桥梁（待验证）

路径：`session_repair.cpp`、`tests/construction_tests.cpp`、`docs/base-development.md`。已开启自动修理的空闲工人通过共享空间格搜索视野内受损或死亡桥，复用原修理目标及资源流程；Win32 Release 产品合并编译通过，新增消费者断言未运行。阶段验证多工人、多个候选及等距顺序、视野／不可达／资源／目标死亡与恢复、自动开关和原版选择规则，并测量密集地图扫描和重建开销。

### 模型 SPN 发射事件（待验证）

路径：`model.h`、`model_particles.cpp`、`game_model_sound.cpp`、`game_view.*`、`game_effects.cpp`、`docs/model-event-sounds.md`、`third_party/warcraft-model-reference/source-info.json`。模型事件节点驱动源 SpawnData 模型的内存流送、变换和首段动画，Win32 Release 产品合并编译通过；已抽样读取四族基础模型中的 SPN 名称及原表，未执行实际绘制。阶段验证死亡／攻击事件、连续触发／递归、位置旋转缩放、粒子／附件／声音、同模型共享状态、首次加载迟到、迷雾／视口／暂停、窗口 GPU、切图释放及密集对局性能，对照原版画面；界面模型事件仍待实现。

### 结算盟友颜色按钮（待验证）

路径：`game_flow_ui.cpp/.h`、`docs/game-flow.md`。结算界面接入源按钮、C 键、图标／提示和本人／盟友／敌方玩家颜色；Win32 Release 产品合并编译通过。阶段验证鼠标／快捷键、初始状态、玩家及观察者／非对称联盟、地图颜色覆盖、不同统计页与排序、回放保存弹窗隔离及真实窗口画面，对照原版行为。

### 电脑工人修理目标（待验证）

路径：`session_ai.cpp`、`docs/ai.md`。SetPeonsRepair 的空闲工人按共享空间索引寻找可见受损建筑、机械单位和桥梁，复用实际修理流程；Win32 Release 产品合并编译通过。阶段验证采集／返还与携带资源、多个候选／工人、友敌与视野、死桥／无资源／不可达、单位死亡／易主及事件重入、AI 长局和双端同步，并测量密集地图开销及对照原版策略。

### 模型 UBR 地表事件（待验证）

路径：`model_particles.cpp`、`game_model_sound.cpp`、`game_effects.cpp`、`game_view.h`、`docs/model-event-sounds.md`。模型 UBR 事件接入原 UberSplatData 和出生／停留／消退贴花，Win32 Release 产品合并编译通过；原资源抽样确认多族建筑及烈焰风暴模型包含 UBR。阶段验证事件时序与重复、颜色和透明度、旋转／缩放、地形／水面／迷雾、纹理加载和释放、视口与暂停、源声音、密集场景性能及原版 GPU 画面；回归原有 FPT／SPL 的时间和图集。

### 英雄经验条（待验证）

路径：`session.h`、`session_hero.cpp`、`game_loading.cpp/.h`、`game_commands.cpp`、`docs/heroes.md`。单选英雄经验条读取源升级阈值和皮肤纹理，显示当前等级进度及悬停说明；Win32 Release 产品合并编译通过。阶段验证经验增加／降级／满级、自定义阈值与英雄、失效句柄、皮肤覆盖和缺失、单选切换／提示遮挡、真实窗口与原版坐标和显示。

### 地洞工人返工（待验证）

路径：`transport.h`、`session_orc_cargo.cpp`、`tests/orc_cargo_tests.cpp`、`docs/orc-cargo.md`。地洞征召可保存并在离舱后恢复修桥、已开工施工和途中建造；Win32 Release 产品合并编译通过，新增 work-bridge／work-build 消费者检查未运行。阶段验证命令被替换、工作对象死亡／易主／移除、资源及空间不足、工人死亡／暂停／易主、事件重入、多人同步与原版返工时序；Achd 坠毁规则仍未实现。

### 建筑占地内的施工接近（待验证）

路径：`session_construction.cpp`、`docs/construction.md`。工人位于待建建筑占地时按距离尝试四侧，路径终点必须处于占地外且在施工范围；旧核心库加修复源码的隔离探针中，Human02 实际建造兵营、两座农场并训练六名步兵后，原脚本在 281 秒完成基地目标，金币和木材已调高，见 `tmp/docs-artifacts/war3/human02-build-1031/fixed.log`。阶段验证不同建筑尺寸、地形／窄路／动态单位、四侧不可达、施工协作／修理、回调与更令、真实窗口、性能及原版路径。

### JASS 局部变量默认值（待验证）

路径：`jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`、`docs/jass.md`。局部数值／布尔／句柄提供默认值，局部字符串暂按空串；隔离构建的运行时检查 14 通过、0 失败。DotA 原图在本机玩家输入 -sd 后通过真实 PurchaseUnit 获得 U006 并推进至 120 秒，见 `tmp/docs-artifacts/war3/dota-flow-1030/purchase-heroes-final.log`。阶段验证局部／全局／数组字符串 null 与空串、参数／初始化顺序、回调／等待／嵌套帧、其他三图和原版 1.27 逐类型规则；窗口、多人及完整英雄玩法未验证。

### 库存目标物品双击（待验证）

路径：`game_inventory_drag.cpp`、`docs/teleport.md`。目标模式中双击同一库存格发出无目标物品命令，回城卷轴由原有实际传送消费者选择主城；阶段验证同格／跨格／慢双击、键盘目标模式、目标改变、物品转移／删除、无基地／冷却、Shift 排队、其他目标物品、实验联机和回放及原版输入时序。实际窗口和原版行为尚未验证。

### 女猎手哨兵次数（待验证）

路径：`entities.h`、`session_spell_info.cpp`、`session_spells.cpp`、`session_stealth_reveal.cpp`、`session_ability_commands.cpp`、`tests/stealth_tests.cpp`、`docs/sentinel.md`。源 DataD 正数限制各单位各能力的发射次数，0 为无限，取消或无效目标不消耗，耗尽禁用按钮；固定版原件指令记录在 `tmp/docs-artifacts/war3/sentinel-count-1030/original.txt`；Win32 Release 产品合并编译通过，新增消费者尚未运行。阶段验证原型 Aesn／Aesr、地图覆盖／多等级、订单／取消／目标死亡、移除与重加、死亡／复活／易主、施法事件重入、窗口及原版次数时序与联机同步；存档恢复仍待实现。

### 技能提示字段与等级（待验证）

路径：`session_ability_commands.cpp`、`tests/spell_tests.cpp`、`docs/spells.md`。技能等级文本按源引用和引号分隔，已知 `<对象ID,字段>` 与百分比由地图覆盖后的对象表展开；Win32 Release 核心库编译通过，直接调用实际解析函数的原版暴风雪一／二级最小检查通过（6／30、8／40），探针位于 `tmp/docs-artifacts/war3/spawn-table-probe/`。阶段验证所有等级／引用类别／百分比／未知字段、地图对象覆盖与 WTS、技能学习和按钮布局、长文／颜色／窗口及原版显示精度；新增完整消费者断言尚未运行。

### F12 对局消息纪录（待验证）

路径：`message_log.*`、`CMakeLists.txt`、`glue.cpp`、`game_loading.*`、`game_view.*`、`session.h`、`session_text.cpp`、`session_spatial_events.cpp`、`docs/message-log.md`。原 LogDialog 的 F12／顶部入口、滚动与本地受众消息历史已接入；Win32 Release 核心库编译通过。阶段验证键鼠滚动／焦点／对局输入隔离、长消息／128 行／清屏、单机／聊天私聊与盟友受众、回放／双端及原版布局；实际窗口和完整用户交互尚未运行。

### 空单位动画（待验证）

路径：`session_visual.cpp`、`docs/save-runtime-foundation.md`。SetUnitAnimation 对无效单位安全返回，原件入口和 OrcX01 开场实际调用已核对；Win32 Release 核心库编译通过。阶段验证空／销毁／错误类型、有效单位和动画切换／回调及原版窗口表现；OrcX01 区域存档恢复仍未实现。

### 召唤物零持续时间（待验证）

路径：`session_spell_info.cpp`、`docs/beastmaster.md`。允许源召唤技能持续时间为 0，并复用无定时生命的实际召唤流程。OrcX01 隔离探针推进至 400 秒并实际施放 Rexxar 的 Arsg，生成 900 生命且无定时生命的 ngzc；日志 `tmp/docs-artifacts/war3/orcx-saves-1031/zerolife-cast.log`。阶段验证零／正／负时长、召唤上限与替换、死亡／易主／技能取消、事件重入、战役和原版寿命语义；存档切区尚未实现。

### 英雄属性附加（待验证）

路径：`session_equipment.cpp`、`tests/passive_tests.cpp`、`docs/equipment.md`。Aamk 消费源 DataC／DataA／DataB 对应力量／敏捷／智力并沿用技能等级刷新；Win32 Release 核心库编译通过。DotA U006 以真实 LearnSkill 学习后属性从 17／18／18 变为 19／20／20 并推进至 180 秒，日志 `tmp/docs-artifacts/war3/dota-hero-1031/hero-stats.log`。阶段验证多等级／地图覆盖、移除／重加、死亡／复活、状态及事件重入、UI 和原版数值；新增专项断言尚未运行。

### 战役单位外观缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`。集中验证飞行高度及变化、缩放、染色、玩家颜色覆盖的 StoreUnit／RestoreUnit、磁盘 v1–v5 兼容、损坏输入和实验同步；原版字段语义及完整战役存档尚待实现或对照。详见 [战役单位外观缓存](campaign-unit-appearance.md)。

### 模型灯光档位（待验证）

路径：`src/front_options.cpp`、`src/game_flow_ui.*`、`src/game_preferences.*`、`src/game_view.cpp`、`src/model_pose.cpp`、`src/renderer.h`。集中验证两个选项入口、设置保存与旧版迁移、动态灯光与画面性能及原版对照；低／中／高档的原版规则尚未确认，见 [模型灯光档位](video-light-detail.md)。

### 运输目标的地面与飞行分类（待验证）

路径：`src/session_transport.cpp`、`docs/transport.md`。集中验证自定义货舱和装载能力分别允许 ground／air／两者／均不允许时的按钮、目标命令、飞行乘员装载和卸载落点、容量、目标重入、死亡、多人同步及原版行为；原版额外限制尚需对照。本次未编译或运行。

### 战役单位冷却缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`。集中验证技能／物品共享冷却的保存与恢复、相对时钟、v1–v6 兼容、损坏数据及实验同步，并对照原版跨关行为；完整存档及原版格式尚未完成，详见 [战役单位冷却](campaign-unit-cooldowns.md)。本次未编译或运行。

### 多列计分板本地折叠（待验证）

路径：`src/game_multiboard.cpp`、`src/game_view.*`、`src/session_multiboard.cpp`、`src/script_state.h`。集中验证多人各自点击、脚本覆盖、销毁与重建、回放输入和弹窗隔离，以及原版按钮与 getter 语义；具体范围见 [多列计分板本地折叠](multiboard-local-minimize.md)。本次未编译或运行。

2026-10-30 合并编译：Win32 Release 产品目标 `cmake --build --preset release --target war3 --parallel 8` 在 `9c02f3c` 的源码上通过，包含寄生、单位外观／冷却缓存、模型灯光、运输目标和计分板改动。该结果仅证明产品编译，不代表新增消费者、实际玩法、画面或原版对照通过。

### 战役哨兵次数缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-gamecache.md`。集中验证有限／无限／耗尽与未初始化能力、保存后源单位变化、移除重加、多等级与地图覆盖、恢复按钮／实际施法、v1–v7 兼容、损坏数据、实验同步和原版 StoreUnit 跨关语义；新增消费者断言尚未编译或运行。

### 被动防御弹道偏转（待验证）

路径：`src/passives.h`、`src/session.h`、`src/session_passive_info.cpp`、`src/session_defense_passives.cpp`、`src/session_damage.cpp`、`src/session_self_spells.cpp`。集中验证派生字段／概率、弹道与伤害、目标和能力失效、叠加、双端随机顺序及原版行为；速度字段和 DataI 模式仍未实现，见 [被动防御偏转](passive-defense-deflection.md)。本次未编译或运行。

### 状态提示字段展开（待验证）

路径：`src/game_buff_panel.cpp`、`src/session_ability_commands.cpp`、`src/session.h`、`tests/spell_tests.cpp`。集中验证原版及地图覆盖字段、百分比、未知引用、多等级、颜色与实际窗口，并对照原版；说明见 [状态提示字段](buff-tooltip-fields.md)。新增断言尚未编译或运行。

### 局域网与回放地面智能命令（待验证）

路径：`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`、`src/player_commands.cpp`、`tests/order_queue_tests.cpp`。集中验证 0x11／0x12、命令队列／编队／集结、事件及原版报文和双端行为；说明见 [地面智能命令](lan-smart-ground.md)。新增断言尚未编译或运行。

### JASS 字符串哈希（待验证）

路径：`src/session_text.cpp`、`tests/session_tests.cpp`、`docs/jass.md`。集中验证空值、大小写／斜杠、内嵌 NUL、1023 字节边界、不同长度和多字节编码，并覆盖地图哈希表及双端；原版 Storm 七个 ASCII 返回值与独立算法一致，客户端新增断言尚未编译或运行。

### 电脑吞噬、寄生与死亡之指（待验证）

路径：`src/session_ai_armies.cpp`；说明见 [电脑施法](ai-devour-parasite.md)。集中验证目标选择、技能条件、货舱与伤害、事件重入、长局和双端确定性，并对照原版 AI；本次未编译或运行。

### 回放技能与建造菜单（待验证）

路径：`src/lan_actions.*`、`src/lan_simulation.*`、`src/game_commands.cpp`、`src/game_view.*`、`tests/order_queue_tests.cpp`。集中验证动作编解码、每玩家菜单、选区／子组／取消、回放视角与原版界面；实验对局主动发送尚未实现，见 [回放命令菜单](replay-command-menus.md)。新增断言未编译或运行。

### 游戏提示页滚动（待验证）

路径：`src/game_flow_ui.cpp`；集中验证长文本、滚轮／键盘／滑块、条目切换、窗口尺寸、原版文字布局和焦点，见 [提示页滚动](game-tips-navigation.md)。本次未编译或运行。

### JASS 角度转换（待验证）

路径：`src/session_game.cpp`、`tests/session_tests.cpp`、`docs/jass.md`。集中验证零、正负角度、极值与特殊实数、脚本组合及多人确定性，并与固定版原函数逐位对照；新增断言尚未编译或运行。

### 玩家颜色选择菜单（待验证）

路径：`src/glue.*`、`src/player_setup_ui.cpp`；集中验证原 FDF 背景与颜色项、占用交换、键鼠／焦点、16 色及原版布局和滚动条，见 [玩家颜色菜单](map-color-selector.md)。本次未编译或运行。

### 被动防御速度字段（待验证）

路径：`src/equipment.h`、`src/entities.h`、`src/session_equipment.cpp`、`src/session_passive_info.cpp`；集中验证能力与物品来源、禁用／科技、多个来源及主动防御叠加、移动和攻击消费者、幻象与多人确定性，并对照原版 DataC／DataD；DataI 仍未实现，见 [被动防御速度](passive-defense-speed.md)。本次未编译或运行。

### 局域网命令菜单录制（待验证）

路径：`src/game_commands.cpp`、`src/game_view.h`；集中验证鼠标／热键打开、同步等待、失败提示、时间片与回放、主客双端及原版时序。关闭动作已接入实验记录，原版时序待对照，见 [菜单动作录制](lan-menu-recording.md)。本次未编译或运行。

### 实验对局命令菜单关闭（待验证）

路径：`src/lan_actions.cpp`、`src/game_commands.cpp`、`src/game_view.cpp`、`tests/order_queue_tests.cpp`。集中验证取消／右键／Esc／切换界面及建造目标模式、打开后同帧变化、网络失败、时间片顺序、双端和回放；`0xfb` 仅为实验协议，原版关闭行为仍待对照，见 [菜单动作录制](lan-menu-recording.md)。新增断言未编译或运行。

### 战役单位索敌距离缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`；集中验证运行值／默认值、实际索敌及修理、旧版与损坏数据、实验同步和原版 StoreUnit，见 [单位索敌距离](campaign-unit-acquire.md)。新增断言尚未编译或运行。

### 任务窗口键盘导航（待验证）

路径：`src/quest_dialog.cpp`、`src/quest_dialog.h`。集中验证任务行焦点、方向／翻页／首尾、任务动态变化、详情和列表滚动及原版按键行为，见 [任务键盘导航](quest-keyboard-navigation.md)。本次未编译或运行。

### 法术弹道目标高度与追踪（待验证）

路径：`src/session_spell_effects.cpp`、`tests/spell_tests.cpp`。集中验证目标高度／源对象覆盖、飞行目标移动和变形、链式弹道、多端及原版轨迹，见 [法术弹道](spell-missile-targeting.md)。新增实际消费者断言尚未编译或运行。

2026-10-30 合并编译：`c4f92c5` 的 Win32 Release 产品目标 `cmake --build --preset release --target war3 --parallel 8` 通过，覆盖自上次产品编译后的脚本、战役缓存、技能、UI 和局域网改动；此结果只证明产品编译，新增断言、实际玩法、画面和原版对照仍待验证。

### 地图密度脚本接口（待验证）

路径：`src/session.h`、`src/session.cpp`、`tests/session_tests.cpp`；集中验证资源／野怪密度配置、低八位、地图切换与局域网及原版初值，见 [地图密度](map-density.md)。自动生成消费者尚未实现；新增断言未编译或运行。

### 实验局域网过期选区（待验证）

路径：`src/lan_simulation.cpp`、`tests/order_queue_tests.cpp`。集中验证发送后单位移除／不可选、空组与混合成员、未知身份和经典协议拒绝、时序及双端回放，见 [过期选区与编组](lan-stale-selection.md)。新增消费者断言未编译或运行。

### 中立守卫战斗法术（待验证）

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`src/session_spell_info.cpp`。集中验证源能力与派生、敌我目标、施法时序、真实野怪战斗、双端随机与性能，并对照原版 AI，见 [中立守卫战斗法术](creep-combat-spells.md)。实际玩法尚未运行。

### 隐藏单位脚本移动（待验证）

路径：`src/entities.h`、`src/session.h`、`src/session_orders.cpp`。同版 Win32 Release 核心库编译通过；Human02Interlude 原图最小复现中吉安娜 25.25 秒进入目标区域，75.1875 秒脚本请求 Human03，日志 `tmp/docs-artifacts/war3/human02-interlude-1031/same-core.log`。集中验证隐藏／显示、四种点命令、运输／消化等状态、玩家命令隔离、回调与真实窗口和实际切关，见 [隐藏单位移动](campaign-hidden-orders.md)。

### 生命条 Alt 临时切换（待验证）

路径：`src/game_view.cpp`、`docs/game-options.md`。集中验证两种生命条设置下按住及释放 Alt、窗口焦点变化、隐藏单位和战争迷雾，并对照原版窗口行为。本次未编译或运行。

### 火焰箭伤害与施法（待验证）

路径：`src/session_spell_info.cpp`、`src/session_ai_armies.cpp`、`docs/fire-bolt.md`、`docs/creep-combat-spells.md`、`docs/fire-bolt-ai.md`。集中验证原版与地图覆盖的订单、伤害、弹道、眩晕、目标、冷却及 AI 施法；原版自定义状态覆盖优先级待验证，具体边界见 [火焰箭](fire-bolt.md)。本次未编译或运行。

### 战役 WTS 非声明文本（待验证）

路径：`src/map.cpp`、`tests/map_tests.cpp`、`docs/campaign-wts-text.md`。资料片 nightelfX01 原图隔离探针已越过地图读取并创建 136 单位，随后因技能参数停止；集中验证任务文本、格式边界、自定义和联网地图，见 [战役地图字符串表](campaign-wts-text.md)。新增解析断言未运行。

### 战役寄生技能零英雄时长（待验证）

路径：`src/session_spell_info.cpp`、`docs/campaign-parasite-duration.md`。nightelfX01 原图隔离探针已越过此技能参数检查，随后在句柄调用处停止；集中验证零时长实际施法、原版效果及地图派生。见 [战役寄生技能时长](campaign-parasite-duration.md)。

### 无效单位所属玩家查询（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-owner.md`。nightelfX01 原图隔离探针越过此调用并推进至 37.0938 秒，随后在另一个句柄查询处停止；集中验证空／销毁句柄、玩家归属变化和实际战役事件，见 [所属玩家查询](campaign-null-owner.md)。

### 无效可破坏物最大生命查询（待验证）

路径：`src/session_destructables.cpp`、`docs/campaign-null-destructable.md`。nightelfX01 原图隔离探针越过此调用并推进至 400 秒，40.25 秒恢复玩家控制；集中验证句柄生命周期、开场物件及真实窗口，见 [最大生命查询](campaign-null-destructable.md)。

### Human04 失效迷雾修改器（待验证）

路径：`src/session_fog.cpp`、`docs/campaign-human04-fog.md`。独立 Win32 x86 探针越过失效句柄异常，原图约 40 秒恢复控制并推进至 400 秒；集中验证有效／空／失效句柄、真实切关与视野表现，见 [Human04 迷雾句柄](campaign-human04-fog.md)。

### 战争践踏地形波纹（待验证）

路径：`src/session_spell_info.cpp`、`src/session_area_spells.cpp`、`src/world.h`。集中验证原图及派生技能的伤害、眩晕和波纹、原版字段覆盖、并发上限与同步，见 [战争践踏地形波纹](war-stomp-terrain.md)。本次未编译或运行。

### Human05 失效单位路径设置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-human05-pathing.md`。隔离原图越过村民撤退异常并推进至 380 秒；集中验证失效句柄原版语义与实际撤退和路径占地，见 [村民撤退路径](campaign-human05-pathing.md)。

### Human05 背包物品位置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-human05-items.md`。隔离原图验证空槽和持有物品的落地；集中对照原版掉落事件、不可丢弃物品和真实跨关操作，见 [物品位置](campaign-human05-items.md)。

### Human05 未启动 AI 命令（待验证）

路径：`src/session_ai.cpp`、`docs/campaign-human05-command-ai.md`。原图定向触发器不再因未启动 AI 中断；集中验证正常商队、攻击波、命令顺序及胜负流程，见 [AI 命令](campaign-human05-command-ai.md)。

### 船坞缺失商品空槽（待验证）

路径：`src/session_commerce.cpp`、`docs/campaign-shipyard-stock.md`。NightElfX02 隔离探针完成船坞库存和 main，后在未实现的 AI native 处停止；集中验证原版窗口、空槽、有效商品及动态库存，见 [商店默认单位库存](campaign-shipyard-stock.md)。

### 两栖 AI 队长共享路线（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`src/session_ai_armies.cpp`、`src/session_ai_control.cpp`。Win32 Release 核心增量编译和原图两栖／地面混组定向探针通过；集中验证真实战役、路线中断、补员、动态障碍、混编、同步及原版行为，见 [两栖 AI 路径](campaign-amphibious-ai.md)。

### Human06 脚本无值返回兼容（待验证）

路径：`src/jass_module.cpp`、`src/jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`。独立探针验证受限返回与原图开场推进；集中执行新增断言，核对原版行为及产品关卡，见 [无值返回兼容](campaign-human06-return.md)。

### AI 攻击与防御队长驻地（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_control.cpp`、`src/session_ai_economy.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。核心及测试目标编译通过，定向检查 2 项通过、0 失败；集中验证真实战役、队伍状态、同步及原版路线，见 [队长驻地](campaign-captain-home.md)。

### Human07 基础停止命令（待验证）

路径：`src/session_entities.cpp`、`src/session_orders.cpp`、`docs/campaign-human07-stop.md`。隔离原图相遇剧情已越过停止指令异常；集中验证两种命令入口、取消与事件及真实交互，见 [停止指令](campaign-human07-stop.md)。

### Human08 堆叠环境声音（待验证）

路径：`src/sound.cpp`、`docs/campaign-human08-stacked-sound.md`。静音隔离原图越过声音注册异常并推进至 400 秒；集中听验播放、重复、空间区域与资源释放，见 [堆叠环境声音](campaign-human08-stacked-sound.md)。

### Human08 胜利界面失效句柄（待验证）

路径：`src/session_leaderboard.cpp`、`src/session_dialogs.cpp`。隔离原图直接摧毁目标船后进入胜利对话；集中验证排行榜与计时窗口生命周期及实际操作，见 [胜利界面句柄](campaign-human08-ui-handles.md)。

### Human09 空位置特效（待验证）

路径：`src/session_effects.cpp`、`tests/spell_tests.cpp`。隔离原图越过异常并推进至 400 秒；集中执行新增断言并验证真实开场及画面，见 [空位置特效](campaign-human09-null-effect.md)。

### Human09 空物品槽创建（待验证）

路径：`src/session_entities.cpp`、`tests/spell_tests.cpp`。隔离探针越过剧情的空槽异常；集中执行新增断言并验证真实战斗、物品和剧情，见 [空物品槽创建](campaign-human09-empty-item.md)。

### 亡灵首关空单位编组（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-undead01-group.md`。隔离探针越过原图的空单位编组异常；集中验证句柄边界、难度和真实开局，见 [空单位编组](campaign-undead01-group.md)。

### 亡灵首关空单位动画（待验证）

路径：`src/session_visual.cpp`、`docs/campaign-undead01-animation.md`。隔离探针越过空单位动画队列异常；集中验证有效／失效单位队列、动画顺序和真实开场，见 [空单位动画](campaign-undead01-animation.md)。

### 亡灵首关空单位暂停（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-undead01-pause.md`。隔离原图越过空单位暂停并推进至 400 秒；集中验证暂停恢复、动作时序和真实开场，见 [空单位暂停](campaign-undead01-pause.md)。

### 亡灵首关隐藏单位即时命令（待验证）

路径：`src/session.h`、`src/session_orders.cpp`、`src/session_entities.cpp`。隔离原图救援计数从 0 增至 4，并检查脚本、玩家和运输隐藏边界；集中验证原版命令及完整任务，见 [隐藏单位脚本命令](campaign-undead01-hidden-orders.md)。

### 资料片第四章无效单位名称（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-name.md`。同版核心编译及最小会话检查通过，第四章隔离开场越过异常；集中验证字幕、单位选择分支和真实窗口，见 [无效单位名称](campaign-null-unit-name.md)。

### 单机暂停与速度命令入口（待验证）

路径：`src/game_flow_ui.*`、`src/game_view.cpp`、`src/player_commands.*`、`tests/game_flow_tests.cpp`。Win32 Release 产品编译通过；集中验证菜单操作、本地及网络权限、脚本交错和新增会话断言，见 [单机游戏控制命令](single-replay-controls.md)。单机回放录制和播放尚未完成。

### 资料片第五章缺失预载脚本（待验证）

路径：`src/session_game.cpp`、`docs/campaign-preloader.md`。独立原图探针越过缺失成员并推进至 400 秒；集中验证预载脚本的空值、存在／缺失、错误和切图，见 [预载脚本](campaign-preloader.md)。

### 亡灵第二关死亡对白句柄（待验证）

路径：`src/session.cpp`、`src/session_entities.cpp`。独立原图探针越过死亡对白异常；集中验证有效／失效句柄、颜色映射及真实战役表现，见 [乌瑟尔死亡对白](campaign-undead02-uther-transmission.md)。

### PREM 模型粒子（待验证）

路径：`src/model.*`、`src/model_data.h`、`src/model_particles.cpp`、`src/model_pose.cpp`、`tests/effects_tests.cpp`、`third_party/warcraft-model-reference/`。Win32 Release 产品编译通过，原版闪电箭 Death 序列隐藏窗口检查发射和退休通过；集中验证原版视觉、动画、嵌套、离屏、资源释放和性能，见 [模型粒子与特效](effects.md)。

### PREM 子模型事件（待验证）

路径：`src/model_particles.cpp`、`docs/effects.md`。Win32 Release 产品编译通过；集中验证子模型事件的动画时序、世界位置、多个粒子实例、父对象销毁、离屏与音画同步。

### 亡灵第二关重复销毁计时器（待验证）

路径：`src/session.cpp`、`docs/campaign-undead02-destroy-timer.md`。隔离原图越过结束剧情异常并进入胜利对话；集中验证有效／失效计时器、事件与回调，以及自然建造和剧情，见 [淡入淡出计时器](campaign-undead02-destroy-timer.md)。

### 资料片第六章空单位速度设置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-speed.md`。隔离原图商队暂停触发器越过空单位异常；集中验证有效／失效单位、移动速度及真实商队流程，见 [商队暂停](campaign-null-unit-speed.md)。

### 资料片第六章失效英雄经验开关（待验证）

路径：`src/session_hero.cpp`、`docs/campaign-null-hero-xp.md`。隔离原图胜利过场越过失效英雄异常；集中验证英雄经验状态、正常护送与原版过场，见 [英雄经验开关](campaign-null-hero-xp.md)。

### 资料片第六章失效单位显示（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-show.md`。人工驱动原图胜利过场越过失效单位异常；集中验证显示、路径视野及自然护送，见 [失效单位显示](campaign-null-unit-show.md)。

### 资料片第七章关闭 AI 随机路径（待验证）

路径：`src/session_ai_natives.cpp`、`docs/ai-random-paths.md`。隔离原图越过关闭路径调用并推进至 400 秒；集中验证确定性路线、实际任务和同步。开启随机路径的原版算法仍未实现，见 [AI 随机路径](ai-random-paths.md)。

### 资料片第六章空单位位置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-position.md`。独立原图探针越过空单位位置异常并推进至 400 秒；集中验证有效／失效单位与位置、商队剧情和真实窗口，见 [空单位位置](campaign-null-unit-position.md)。

### 声音归档 PCM 尾部恢复（待验证）

路径：`src/archive.cpp`、`src/archive.h`、`src/sound.cpp`、`src/session_sound.cpp`、`tests/archive_tests.cpp`。定向夹具 1 项通过，亡灵第三关静音隔离探针推进至 400 秒；集中验证产品窗口实际播放、尾部语义、原版听感、战役流程和切图资源释放，见 [PCM WAV 尾部读取恢复](audio-wav-tail-recovery.md)。

### 原版阴影选项（待验证）

路径：`src/front_options.cpp`、`src/game_flow_ui.cpp`、`src/game_flow_ui.h`、`src/game_preferences.cpp`。两处选项使用原版 OFF／ON；集中验证窗口输入、确认与取消、旧设置迁移、重启、阴影画面及性能，见[阴影选项](shadow-options.md)。

### 亡灵第四关无效单位无敌设置（待验证）

路径：`src/session_entities.cpp`。独立原图探针在无前关缓存时越过异常并推进至 400 秒；集中验证有效／失效句柄、有跨关缓存、真实窗口及完整战役流程，见[无效单位无敌设置](campaign-undead04-invulnerable.md)。

### 避难权杖（待验证）

路径：`src/entities.h`、`src/session*.cpp`、`src/session.h`、`src/spells.h`。已接入目标、施法、主基地传送、禁用状态及延迟治疗；集中验证目标筛选、伤害减免单位、治疗与驱散时序、物品消费、UI、多人同步及原版一致性，见[避难权杖](sanctuary-staff.md)。

### 避难权杖驱散（待验证）

路径：`src/session_teleport.cpp`。避难状态已接入现有魔法驱散，集中验证友敌驱散、状态释放、持续治疗和原版 1.27 行为，见[避难权杖](sanctuary-staff.md)。

### 亡灵第五关计时窗口句柄（待验证）

路径：`src/session_dialogs.cpp`。独立探针通过有效、空和已销毁窗口的定向检查，并在人工完成任务条件后进入胜利对话；自然战斗、真实窗口和跨关流程待集中验证，见[计时窗口句柄](campaign-undead05-timer-dialog.md)。

### 局域网研究与训练取消（待验证）

路径：`src/lan_action_encoder.cpp`、`src/lan_simulation.*`、`tests/order_queue_tests.cpp`。经典动作接入当前研究与训练取消及唯一子组选区；集中执行新增断言，核对任务变化、退款与事件、双客户端和原版报文，见[研究与训练取消](lan-research-cancellation.md)。

### 昼夜模型光照（待验证）

路径：`src/game_view.*`、`src/model*`、`src/renderer.h`、`src/terrain_scene.cpp`。已接入原 DNC 模型动画、世界模型与地形光照；集中验证原图昼夜、动态模型切换、迷雾、设备恢复、稠密场景 CPU 与帧耗时，并对照原版，见[昼夜模型光照](day-night-lighting.md)。

### 实验联机已移除目标（待验证）

路径：`src/lan_simulation.cpp`、`tests/order_queue_tests.cpp`。时间片中的已移除目标命令按类别跳过；集中执行新增断言，验证同片状态变化、物品／可破坏物、多人和自研回放，见[已移除目标的联机命令](lan-removed-target.md)。

### AI 关闭共享路径（待验证）

路径：`src/ai.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`。从 common.ai 调用 `DisablePathing` 后，分别检查已有路线、后续两栖队长攻击、不同 AI、重复调用和普通单位寻路；原版共享路径、混编和同步待集中对照，见[AI 关闭共享路径](ai-disable-pathing.md)。

### 昼夜光照计算复用（待验证）

路径：`src/model.cpp`、`src/model_data.h`、`src/model_pose.cpp`。静态姿态与纯方向光照计算按实际输入复用；集中对照姿态／光照切换、骨骼动画、Billboard、点光源及 Amazonia 的画面、CPU 与帧耗时，见[昼夜光照计算复用](dnc-lighting-performance.md)。

### 战役章节默认开放（待验证）

路径：`src/campaign_browser.cpp`、`src/campaign_browser.h`。章节列表按源第四字段更新进度，Win32 x86 隔离编译通过；集中验证源标记、脚本关闭后重进、战役切换、跨进程与失败恢复，见[章节默认解锁](campaign-default-missions.md)。

### 常驻献祭与火焰风衣（待验证）

路径：`src/session_passive_info.cpp`、`tests/control_tests.cpp`。源能力已接入现有持续伤害及库存生命周期；集中执行新增模式并对照叠加、免疫、物品交换、伤害事件、窗口与多人，见[常驻献祭与火焰风衣](permanent-immolation-items.md)。

### 游戏端口选项（待验证）

路径：`src/front_options.*`、`src/game_preferences.*`、`src/lan_host.*`、`src/lan_host_ui.cpp`、`src/main.cpp`。原版输入框与房主监听和公告已接入；集中验证输入、保存恢复、自定义端口、占用报错、真实客户端连接及原版互通，见[游戏端口](game-port.md)。

### 回放玩家离开记录（待验证）

路径：`src/replay.*`、`src/lan_simulation.*`、`src/game_view.*`、`src/main.cpp`。集中验证自研回放中离开事件和时间片顺序、重复及非法记录、重入、选择与缓存同步、后续动作及固定版对照；原版回放入口和对象编号映射仍待实现，见[回放玩家离开记录](replay-player-departure.md)。

### 能力名称转换 native（待验证）

路径：`src/session_spell_natives.cpp`。集中对照 1.27 的 null、空字符串、普通名称、rawcode、自定义能力和未知整数输入，以及脚本 null 比较；静态分析尚不能证明映射表恒为空，见[能力名称转换 native](ability-id-natives.md)。

### 地图空模型与变体回退（待验证）

路径：`src/model.cpp`、`src/placed_definition.*`、`src/scene_objects.cpp`、`src/session_destructables.cpp`。集中检查地图覆盖优先级、真实缺失和损坏、单位及可破坏物生命周期、模型变体与原版行为，见[地图模型缺失处理](map-optional-models.md)。

### 脚本对话框子控件（待验证）

路径：`src/glue.cpp`。IceCrown 隐藏窗口已显示胜利对话框，程序消息发送 C 后对话框消失；集中检查真实鼠标、键盘、其他脚本对话框、多玩家及原版布局。

### 游戏顶部栏（待验证）

路径：`src/game_loading.*`、`src/game_view.cpp`。集中检查四族和地图皮肤、窗口尺寸及 DPI、鼠标和 F9–F12、长文本与原版布局，见[游戏顶部栏](top-hud.md)。

### 玩家消息中的名称（待验证）

路径：`src/session_text.cpp`。集中检查 `DisplayTimedTextFromPlayer` 的名称替换、百分号、不同玩家与受众及原版语义。

### 回放列表异步双击（待验证）

路径：`src/replay_browser.*`、`docs/replay-browser.md`。集中验证冷读取与已读取回放、切换选中、删除／取消、返回、损坏文件及连续双击；原版回放播放仍待实现。

### 玩家广播文本（待验证）

路径：`src/session_text.cpp`。集中检查各玩家视角的胜负与离开消息、历史、玩家名、百分号、空名称及格式边界，与原版显示对照，见[玩家广播文本](player-broadcast-text.md)。

### 选中单位动画头像（待验证）

路径：`src/game_portrait.cpp`、`src/game_view.*`、`CMakeLists.txt`。集中检查真实单选／多选、模型和相机缺失、四族边框、DPI／窗口缩放、设备恢复、模型动画／队伍颜色、切图释放及状态块开销，见[选中单位头像](unit-portrait.md)。

### 游戏内聊天窗口与消息分类（待验证）

路径：`src/chat_dialog.*`、`src/game_view.*`、`src/player_commands.*`、`src/session_text.cpp`、`src/session_spatial_events.cpp`、`src/script_state.h`、`src/session.h`、`src/message_log.cpp`、`src/lan_actions.*`、`src/lan_runtime.cpp`、`src/lan_simulation.*`。集中验证 F12／Shift+F12、频道／私聊选择与历史、消息格式、目标离开、窗口输入隔离、发送失败、实验双端与回放、原版窗口和协议差异，见[对局聊天窗口](chat-dialog.md)。

### 顶部按钮状态与消息转义（待验证）

路径：`src/game_view.cpp`、`src/game_loading.*`。集中验证四族及地图皮肤、悬停／按下／禁用、用户控制和回放状态、鼠标点击、缩放／DPI，以及脚本文本的颜色与竖线转义，见[游戏顶部栏](top-hud.md)。

### 战役缺失声音句柄（待验证）

路径：`src/sound.cpp`。兽族 Orc01 静音探针完成 main 并推进 120 秒；集中验证缺失／损坏／正常音频、句柄、通道与时长、播放状态、堆叠、设备恢复及原版行为，见[兽族第一章缺失对白](campaign-orc01-missing-dialogue.md)。

### 战役未知科技引用（待验证）

路径：`src/session_research.cpp`。Orc04 原图隔离探针完成 main 并静音推进 60 秒；集中核对未知／已有／自定义科技的等级、单位刷新、界面与原版行为，以及真实战役流程，见[战役未知科技引用](campaign-unknown-upgrade.md)。

### 战役定时转向空单位（待验证）

路径：`src/session_entities.cpp`。OrcX03a 无前章 gamecache 的隔离探针完成初始化并静音推进 60 秒；集中验证空／失效／有效单位、时长和转向曲线、跨关存档及真实窗口，见[战役定时转向空单位](campaign-null-facing-timed.md)。

### 单位信息和多选面板位置（待验证）

路径：`src/game_view.cpp`、`src/game_portrait.cpp`、`src/game_commands.cpp`、`src/game_selection_panel.cpp`。地面物品图标在控制台纹理之前绘制并由头像框遮罩；单位名称与数值、单位状态／生产信息和多选图标移至头像区域右侧；进度条和生产图标使用收窄的区域，多选及生产图标的点击区域随图标移动。集中验证单选／多选、生产队列与点击、窗口尺寸、DPI、四族以及与原版画面的差异；货舱、状态图标及其他底部面板仍需对照。

### 货舱面板位置与内容隔离（待验证）

路径：`src/game_transport.cpp`、`src/game_commands.cpp`。货舱格、乘员提示及分页操作移至头像右侧；显示货舱时不叠加普通单位详情；建造、升级或生产时显示对应进度和取消操作。集中验证可控制／不可控制单位、运输／矿井／尸体货舱、容量与分页、卸载点击、生产与货舱共存、不同窗口及原版布局；状态图标与其他底部面板仍待对照。

### 缺失 AI 策略启动（待验证）

路径：`src/session_ai.cpp`、`docs/ai.md`。原 OrcX03a 无前章 gamecache 的静音隔离探针完成 main 并推进 600 秒；集中验证地图／公共策略覆盖、缺失／损坏文件、重复启动、脚本与 AI 调度、原版诊断和跨关流程。缺失策略不运行 AI。

### 状态栏与单位详情布局（待验证）

路径：`src/game_buff_panel.cpp`、`src/game_commands.cpp`、`docs/buff-panel.md`。单行八格依据固定版本状态栏构造；集中验证实际单选、多个状态、单位／建筑／货舱／生产切换、定时生命条、悬停、尺寸和原版屏幕位置。隐藏窗口探针中，跨进程鼠标消息的坐标被 DPI 缩放约 1.5 倍；针对单单位夹具换算坐标后，诊断版记录点击与单位投影接近，正式 Release 选中 1 个单位并生成画面。证据 `tmp/docs-artifacts/war3/selection-diagnostic/`；该检查不覆盖真实鼠标、其余地图或 DPI 配置。

### 战役毒蛇守卫订单（待验证）

路径：`src/session_spell_info.cpp`、`docs/area-spells.md`。OrcX02 隔离探针完成 main 并静音推进 120 秒；集中验证原版 ward 订单、技能施放、地图覆盖、跨关存档和实际画面。

### 对局命令栏布局（待验证）

路径：`src/game_commands.cpp`、`docs/command-card-layout.md`。按原版网格调整图标、状态和鼠标命中；单单位夹具的 Release 隐藏窗口截图显示人族命令图标位于网格内，见 `tmp/docs-artifacts/war3/selection-diagnostic/release-selected.png`。集中验证普通命令、技能／建造菜单、自动施法、冷却、快捷键、点击边界、四族、窗口尺寸及 DPI，并对照原版实际画面。

### 战役空单位状态操作（待验证）

路径：`src/session_entities.cpp`、`src/session_spell_natives.cpp`、`docs/campaign-null-unit-reset.md`。OrcX02_02 隔离探针完成 main 并静音推进 120 秒；集中验证空／失效／有效单位及玩家、效果和冷却、事件、跨关存档及真实窗口。

### 墓地尸体生成（待验证）

路径：`src/corpses.h`、`src/entities.h`、`src/session.h`、`src/session_entities.cpp`、`src/session_corpses.cpp`、`src/session_transport.cpp`、`tests/corpse_cargo_tests.cpp`、`docs/graveyard.md`。Win32 Release 产品与专项程序编译通过；`war3_corpse_cargo_tests.exe <data-root> <corpse-cargo-fixture.w3m> graveyard` 1/1 通过，覆盖间隔、可用尸体、上限及补充。集中验证初始／满额与空位计时、消耗／衰败／搬运、能力增加／删除／升级、暂停／建造／死亡／转让、地图覆盖、多墓地、落点、同步、画面音效和原版对照。

### 可见幽灵能力（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session_visibility.cpp`、`tests/stealth_tests.cpp`、`docs/stealth-reveal.md`。Win32 Release 产品与专项程序编译通过，`war3_stealth_tests.exe <data-root> <stealth-fixture.w3m> visible-ghost` 的可见性、变形及建筑占位检查 1/1 通过。集中验证源技能及地图覆盖、两项标志开关、变形目标筛选和施法重入、建筑／其他单位占位、可见性及共享视野、能力移除和原版对照。

### 建筑阴影透明度（待验证）

路径：`src/game_effects.cpp`、`docs/unit-shadows.md`。建筑阴影按贴图 alpha 和单位强度合成；本机三个原资源为二值 alpha。集中验证自定义渐变贴图、静态／动态叠加、显隐、不同尺寸与原版滤波、地图画面和性能。

### 单位攻击与护甲图标（待验证）

路径：`src/combat.h`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。攻击和护甲类型使用真实战斗状态，原版及地图皮肤图标在加载阶段读取；两把武器和护甲分别显示。Win32 Release 编译通过，人族农民及圣骑士隐藏窗口选中截图可见各栏；证据位于 `tmp/docs-artifacts/war3/selection-diagnostic/ui-combat-selected.*` 与 `ui-combat-hero-selected.*`。集中验证四族、地图皮肤覆盖及缺图、类型变化、双武器、英雄属性、长数值、窗口比例、DPI、性能和原版画面对照。

### 英雄主属性显示（待验证）

路径：`src/session.h`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。主属性图标与伤害显示共用源单位主属性，三项当前属性使用源标题；Win32 Release 编译通过，圣骑士隐藏窗口选中画面可见图标和属性，证据位于 `tmp/docs-artifacts/war3/selection-diagnostic/ui-hero-attributes-selected.*`。集中验证力量／敏捷／智力英雄、地图自定义字段与皮肤、装备／升级变化、长数值、不同尺寸及与原版布局的差异。

### 寻路搜索缓存（待验证）

路径：`src/world_path.cpp`、`docs/water-pathing.md`。Release 编译与隔墙替代／部分路径定向检查 2/2 通过；512×512 和 1028×1028 隔墙夹具优化前后路径摘要一致，实验记录位于 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证大地图／复杂单位碰撞、各移动类型、动态阻挡、不同尺寸内存、连续实际对局与帧时间及原版路径行为。

### 不可达路径重复搜索（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。失败路径按起止格、半径、移动类型、部分路径标志和路径版本有界缓存，地图阻挡改变后重新搜索。Win32 Release 编译通过；缓存失效、隔墙替代和部分路径定向检查 3/3 通过，重复严格失败夹具及 OrcX03b 前 10 秒隔离模拟见 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证追击和移动、目标跨格、地图开闭、障碍动态变化、多移动类型、地图切换及完整对局性能。

### 严格寻路连通区域（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。严格寻路按地形版本、净空与移动类型重用有界连通区域，不可用时保留原搜索；部分路径继续原搜索。Win32 Release 编译及区域／动态障碍／隔墙／部分路径定向检查 4/4 通过；隔墙夹具与 OrcX03b 前 40 秒隔离记录位于 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证四种移动类型、对角障碍、不可通起点、目标候选、地图变化、多净空缓存切换、实际战役帧时间及内存。

### 部分路径重复搜索（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。缓存有界的不可达部分路径，路径版本或查询条件改变后重新搜索。Win32 Release 编译和部分路径缓存／失败缓存／连通区域／不可达路径检查 4/4 通过；夹具与 OrcX03b 前 40 秒静音模拟证据位于 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证可达／不可达目标变化、跨格移动、动态阻挡、不同半径／移动类型、缓存碰撞及实际对局性能。

### 原版单位信息布局与 Agent 截图（待验证）

路径：`src/game_view.*`、`src/game_commands.cpp`、`src/game_buff_panel.cpp`、`src/game_loading.cpp`、`src/combat.h`、`src/session_research.cpp`、`src/agent_capture.h`、`src/platform.*`、`src/main.cpp`、`src/renderer.*`、`tools/agent-capture.ps1`、`tests/passive_tests.cpp`、`docs/unit-combat-panel.md`。Win32 Release 编译通过；攻击与护甲增减值专项 1/1 通过。游戏内部选择农民及带攻击加成的圣骑士并输出画面；对运行中的圣骑士客户端连续两次按需截图，返回游戏范围、尺寸和递增帧号。记录在 `tmp/docs-artifacts/war3/agent-info/`。阶段核对四族／英雄双武器、状态和携带资源、长文本、升级／倍率／减益及原版拆分与舍入、技能／生产／货舱、宽屏／DPI、截图错误、同目录并发、设备恢复和持续运行。Agent 当前仅支持截图与启动时单单位选择，完整 MCP 接口待实现。

### 英雄信息与物品格布局及 Agent 选择（待验证）

路径：`src/game_inventory_layout.h`、`src/game_inventory_drag.cpp`、`src/game_view.*`、`src/game_commands.cpp`、`src/game_buff_panel.cpp`、`src/agent_capture.h`、`src/main.cpp`、`tools/agent-select-unit.ps1`、`tools/agent-capture.ps1`。经验条收于信息框，攻击／护甲和属性行与经验条分开；物品显示、遮罩及命中共用槽位坐标。Agent 可选择可见单位，并在截图响应中返回同帧选择及物品状态。

Win32 Release 增量编译通过；在隔离地图中通过 Agent 选择六物品、100 经验的圣骑士，截图显示六格和部分填充经验条，选取不存在单位失败且保留选择；记录位于 `tmp/docs-artifacts/war3/agent-info/layout-six-items-xp/`。阶段验证物品点击／右键／拖拽／冷却、不同英雄与双武器、四族皮肤、窗口比例／DPI、长文本、Agent 请求失败和客户端生命周期，并对照原版；交互与四族画面尚未实测。

### 内置 Agent 游戏指针输入（待验证）

路径：`src/agent_capture.h`、`src/game_view.*`、`src/main.cpp`、`tools/agent-pointer.ps1`、`README.md`。后台单人对局可按 800×600 逻辑坐标送达左键、右键及跨帧拖拽，沿用 `GameInput` 和真实命令路径；前台、联机、回放及不可操作界面拒绝，响应仅表示输入送达。

Win32 Release 增量编译通过；隔离圣骑士六物品夹具使用 Agent 拖拽，截图状态显示第 0／1 格物品句柄交换，记录位于 `tmp/docs-artifacts/war3/agent-info/pointer-drag/`。阶段核对左／右键、地图／命令／物品目标、前台与菜单切换中断、拖拽失效、非游戏界面拒绝、DPI／窗口尺寸、连续请求与会话退出；尚未完成真实鼠标或原版输入一致性验证。

### 英雄经验条颜色（待验证）

路径：`src/game_commands.cpp`、`docs/unit-combat-panel.md`。经验进度按紫色调制源纹理；Win32 Release 编译通过，游戏内 Agent 的 100 经验截图显示紫色填充，见 `tmp/docs-artifacts/war3/agent-info/xp-purple/`。阶段对照四族、自定义皮肤、零／满经验与原版色值；颜色取自参考画面，非像素级验收。

### 吸取技能生命与目标消耗（待验证）

路径：`src/session.h`、`src/session_area_spells.cpp`、`src/session_resource_spells.cpp`、`tests/spell_tests.cpp`、`tests/generate-steal-fixture.py`、`docs/mana-steal.md`。自定义 Aste 的固定／比例生命和魔法转移与消耗目标连接现有物品施法及单位生命周期。

Win32 Release 客户端及测试目标编译通过；隔离夹具运行 `war3_spell_tests.exe <data-root> <fixture> steal` 4/4，覆盖固定／比例、资源上限及目标消耗，未加载 Game.dll。集中验证目标死亡／重生和资源事件重入、伤害免疫、极端数值、目标与魔免规则、物品冷却／次数及多人，并与原版动态行为对照。

### 施法目标关系别名与 DotA 寄生（待验证）

路径：`src/session_spells.cpp`、`tests/caster_tests.cpp`、`tests/generate-caster-fixture.py`、`docs/parasite.md`。施法单位目标筛选同时识别源对象表的 `friend`／`allies` 和 `enemy`／`enemies`，保留 `self` 与 `neutral` 规则。

Win32 Release 客户端及 `war3_caster_tests` 增量编译通过；自定义目标夹具的 `targets` 模式 6/6 通过，覆盖敌友别名、敌友拒绝及中立目标。DotA_v6.83d 隔离会话选择蜘蛛英雄、学习 `A0BH`，向创建的可见敌人施法后取得 `B0E7`，直接击杀目标后观察到一个 `n019`；探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。集中验证其他施法类型、共享视野／联盟变化、免疫／建筑／中立分类、寄生叠加／召唤／重入、多人与真实窗口，原版语义和 UI 尚未验收。

### 零间隔暴风雪与 DotA 蜘蛛网（待验证）

路径：`src/session_spell_info.cpp`、`src/session_channels.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/area-spells.md`。零间隔的暴风雪派生能力按波次执行实际范围效果，零波数无波次，施法及脚本事件沿用原流程。

Win32 Release 客户端及 `war3_spell_tests` 编译通过；`zero-blizzard` 隔离夹具 2/2 通过，检查三次即时伤害和零波数无伤害，未加载 Game.dll。DotA_v6.83d 隔离会话在 `-sd` 后学习蜘蛛网并以 A2ZX 发出点目标命令，观察到一个蜘蛛网单位；探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段检查零间隔伤害事件与回调中断、其他波数及范围、地图脚本移除能力、蜘蛛网增益与消失、真实窗口／多人和原版时序；即时波次顺序是当前实现，尚非原版验收结论。

### 光环玩家目标与 DotA 蜘蛛网（待验证）

路径：`src/session_passive_info.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`、`docs/auras-passives.md`。光环及武器被动的 `player` 目标限定为与能力来源相同的玩家，并与其他关系标志组合。

Win32 Release 客户端和 `war3_passive_tests` 编译通过；`player-aura` 隔离检查 3/3，覆盖己方、盟友与敌方及光环源易主，未加载 Game.dll。DotA 原图隔离会话放网后，英雄获得 `B01C`／隐身／穿行，附近创建的敌方单位未获光环；直接移动英雄出网后相关状态清理。探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对 `player` 与其他关系的组合、光环失效延迟／重叠／易主、网内数值、受伤切换、真实窗口与多人及原版行为。

### 隐藏法术书与自目标光环（待验证）

路径：`src/session_spellbooks.cpp`、`src/session_ability_commands.cpp`、`src/session_passive_info.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`、`docs/spellbooks-retraining.md`。禁用的法术书保留其子能力并隐藏命令入口；未声明空中／地面类别的自目标被动可作用于自身。

Win32 Release 客户端及测试目标编译通过；`hidden-book` 夹具 4/4 和受关联影响的 `player-aura` 3/3 通过，未加载 Game.dll。DotA 原图隔离会话入网后显示 `A304`／`A300`／`B0HI`，移速光环系数由 0.2 增至 0.4；直接移动英雄出网后相关书籍／能力／状态清理。探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对书籍禁用的时机、直接下令、嵌套／库存／相同技能来源、无类别自目标、地图覆盖、多人和原版行为；真实操作和原版画面未验收。

### 技能接口无效单位与 DotA 终极技能（待验证）

路径：`src/session_entities.cpp`、`tests/passive_tests.cpp`、`docs/ability-unit-handles.md`、`docs/spellbooks-retraining.md`。七个技能增删、等级与永久标记接口对无效单位返回零或失败。

Win32 Release 客户端及 `war3_passive_tests` 编译通过；`invalid-unit` 检查 4/4，覆盖空、已移除、类型不匹配和有效单位，未加载 Game.dll。DotA 隔离会话设定蜘蛛英雄等级、施放终极技能并攻击创建的目标，观察到攻击加成、吸血及约 14 秒后的脚本清理；探针和原版反汇编在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对句柄重用／回调删除、等级边界、自然升级／战斗、多人、实际窗口和原版精度。

### 零效率魔法盾与 DotA 过载（待验证）

路径：`src/session_self_spells.cpp`、`src/session_damage.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/zero-mana-shield.md`。允许零效率魔法盾开关及脚本事件，并跳过无效吸收运算。

Win32 Release 客户端及 `war3_spell_tests` 编译通过；`zero-mana-shield` 3/3，覆盖零效率、零魔法、开关及原正效率盾，未加载 Game.dll。DotA 隔离原图中选取守护精灵，学习并开关 `A28Q`，观察到脚本加成添加／移除及启用期间生命和魔法下降；探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对正比例零效率的原版语义、零魔法／伤害事件／切换重入、联结单位、多人和实际窗口。

### 连锁闪电目标与 DotA 联结（待验证）

路径：`src/session_spells.cpp`、`tests/generate-caster-fixture.py`、`tests/caster_tests.cpp`、`docs/dota-tether.md`。连锁闪电目标关系按源能力配置判断，使友方派生技能与原敌方技能分别使用各自目标。

Win32 Release 客户端和 `war3_caster_tests` 编译通过；`chain-targets` 隔离检查 4/4，覆盖友方／敌方接受和拒绝，未加载 Game.dll。DotA 原图隔离会话选取守护精灵，学习 `A1TA` 后联结创建的友军，观察到双方能力、闪电和资源共享；直接将目标移出范围后连接清理。探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对原技能／地图覆盖的关系、弹跳、免疫和伤害事件，联结移动／死亡／切换／重入、多人及真实窗口；当前未作原版精度验收。

### 战吼与 DotA 幽魂轨道（待验证）

路径：`src/session_spell_info.cpp`、`src/session_wards_roar.cpp`、`tests/generate-caster-fixture.py`、`tests/caster_tests.cpp`、`docs/wards-roar.md`。ANbr 的固定攻击加成进入武器伤害与信息面板；零效果无状态的咆哮允许正常施法并触发地图脚本。

Win32 Release 客户端及 `war3_caster_tests` 编译通过；`battle-roar` 4/4，涵盖零效果施法、Aroa 百分比、ANbr 固定加成与敌方筛选，未加载 Game.dll。DotA 隔离原图选择守护精灵并学习幽魂，观察到五个幽魂依次显示；收缩与扩张命令分别使轨道半径约 150→100→580。探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段检查战吼等级、重叠／驱散／状态移除及原版计算，幽魂接触伤害／完整周期／状态变化、多人和真实窗口。

### JASS 实数比较与 DotA 降临（待验证）

路径：`src/jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`、`docs/jass.md`。实数相等使用原版减法和容差，不等按实数位型比较，混合整数按原版转换后参与比较。

Win32 Release 客户端及 JASS 测试编译通过；运行时检查 16/16，原版相等辅助函数在 Unicorn 中 5/5。DotA_v6.83d 隔离会话学习 `A1TB` 后，施法约 3 秒传送至目标，约 12 秒后返回；同图幽魂对普通单位和英雄伤害、英雄接触后幽魂死亡已观察。探针与反汇编位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段验证实数不等及混合类型的完整原版 VM 路径、特殊值、其他比较操作、降临中断／死亡／联结目标、真实窗口与多人。

### 零目标配额蝗虫群与 DotA 自然之助（待验证）

路径：`src/session_spell_info.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/impale-locust.md`。允许每目标配额为零的自定义蝗虫群按源配置生成飞行单位并保持零目标分配。

Win32 Release 客户端及测试目标编译通过；`war3_spell_tests.exe <data-root> <fixture> zero-locust` 1/1，覆盖飞行单位生成、不攻击敌方及施法者移除清理。DotA_v6.83d 隔离原图施放 A01B 后观察到三个飞行单位、地图脚本治疗及结束后清理；探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对原版零配额行为、技能等级／持续时间／中断／死亡、治疗目标及多目标脚本、视觉和多人。

### 毒箭与 DotA 推进（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_arrow_status.cpp`、`src/session_orb_attacks.cpp`、`src/session_projectiles.cpp`、`src/session_weapons.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/poison-arrows.md`。毒箭连接手动／自动攻击、源弹道与毒伤状态；技能效果事件和攻击命中时状态接入脚本。武器及箭目标筛选支持敌友关系别名。

Win32 Release 客户端及测试目标编译通过；`war3_spell_tests.exe <data-root> <fixture> poison-arrow` 1/1，覆盖魔法消耗、技能效果与命中状态、持续伤害和自动攻击。DotA_v6.83d 隔离原图手动／自动推进均消耗魔法并造成距离加成，探针见 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段检查源毒状态与叠加、目标类型／免疫、实际窗口、完整事件／回调时序及多人和原版行为。

### 酸性炸弹速度与脚本隐藏施法（待验证）

路径：`src/session_alchemist.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_combat_orders.cpp`、`src/session.h`、`src/spells.h`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/alchemist.md`。酸性炸弹支持带符号移动／攻击速度值；脚本单位目标施法在受理后由 ShowUnit 隐藏时继续推进。

Win32 Release 客户端及测试目标编译通过；`war3_spell_tests.exe <data-root> <fixture> acid-speed` 1/1，覆盖正负速度、零伤害及脚本隐藏施法。DotA_v6.83d 隔离原图中魅惑魔女受攻击后，攻击者获得 B043 和 0.3 攻速削弱，继续攻击会刷新时限；探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段对照原版数值符号／叠加、隐藏和显示时序、施法取消／死亡／运输、其他技能类型、真实窗口与多人。

### 资源返还可达入口与采矿路线（待验证）

路径：`src/session.h`、`src/session_harvest.cpp`、`tests/harvest_tests.cpp`、`docs/economy.md`。回收建筑的默认入口不可达时搜索其他可达入口；采矿和返还不重复覆盖尚未完成的路径。

Win32 Release 客户端及测试目标编译通过；原有 `war3_harvest_tests` 检查通过，`depot-route` 定向检查 1/1，覆盖入口阻挡、替代路径及实际金币入账。BootyBay 人族电脑隔离会话中，840 至 960 秒采金工人继续移动与入账，电脑升级要塞并开始城堡升级；个别伐木工人仍观察到拥堵停滞。探针见 `tmp/docs-artifacts/war3/dota-hero-1031/bootybay-ai-economy-probe.cpp`。阶段检查入口与碰撞、动态障碍、多人拥堵、矿井／回收建筑失效、玩家操作及原版精度和寻路性能。

### 被占用中间路径点绕行（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。中间路径点被单位占据时，仅在碰撞检查允许的情况下连接后续点；保留最终目标及有界搜索预算。

Win32 Release 客户端与测试目标编译通过；BootyBay 移动定向检查 9/9 通过，覆盖单位阻挡、最终目标和地形阻挡。BootyBay 电脑隔离会话模拟至 960 秒，建筑间密集拥堵的伐木工人仍未脱困；证据 `tmp/docs-artifacts/war3/dota-hero-1031/occupied-waypoint-ai-960.log`。阶段检查移动障碍、多单位协调、地形变化、联机确定性、性能及原版路径行为。

### 空闲友军让行（待验证）

路径：`src/entities.h`、`src/session_orders.cpp`、`src/session_network_identity.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。长时间未能接近路径点时，对阻挡前方路段的空闲同属单位寻找经过碰撞检查的让行位置；拥堵状态纳入实验联机校验。

Win32 Release 客户端及测试目标编译通过；`war3_movement_avoidance_tests <data-root> <map> yield` 1/1 覆盖空闲同属单位让行、敌方／保持位置／暂停保护，既有移动检查 9/9 通过。BootyBay 原图电脑隔离会话中被跟踪工人在 600～720 秒移动并携带木材，720～960 秒在另一处活动单位拥堵停滞；证据 `tmp/docs-artifacts/war3/dota-hero-1031/yield-final-ai.log`。阶段检查脚本动画／命令、单位被移除／易主、狭路、连续让行、动态障碍、大规模性能、双端同步和原版行为；活动单位协调仍待实现。

### 采集工人协作避让与伐木路线（待验证）

路径：`src/session_orders.cpp`、`src/session_lumber.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。持续受阻的同属采集工人按单位句柄顺序暂时错位并保留原路线；有效伐木路线不被周期性重寻路覆盖。

Win32 Release 客户端及测试目标编译通过；`war3_movement_avoidance_tests <data-root> <map> workers` 1/1 验证真实采集命令、让行保留原路线和目标以及恢复砍树；既有移动检查 9/9 和空闲友军让行 1/1 通过。BootyBay 原图电脑隔离会话中跟踪的工人在 840～960 秒继续移动及采集，证据 `tmp/docs-artifacts/war3/dota-hero-1031/cooperative-final-ai.log`。阶段检查多工人环形阻塞、取消／新命令、树木移除／目标变化、受阻路径重算、其他单位任务、性能、双端同步与原版行为。

### 可达扩张与野怪营地（待验证）

路径：`src/session_ai_natives.cpp`、`src/world.h`、`src/world_path.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。AI 按相关单位路径筛选扩张矿井、工人和野怪营地；连通区域缓存仅作否定预筛，候选仍经过实际寻路。

Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> reachable` 2/2 覆盖原 CampaignAI 启动、隔水／陆路矿井和营地、工人选择及动态障碍缓存失效。BootyBay 原图电脑隔离会话在 840 秒与可达营地交战，模拟至 960 秒；日志 `tmp/docs-artifacts/war3/dota-hero-1031/reachable-final-ai.log`。同一 840 秒状态连续三次扩张查询局部单次采样 454 ms 降至 47 ms；冷缓存、大地图和实际帧率未测。阶段检查地形／建筑动态变化、多个移动层、无部队／无工人、空中混编、事件与资源变化、跨岛运输、多人、原版行为及完整战斗。

### 敌方基地搜索与电脑进攻（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。敌方基地搜索按模拟步有界推进，等待标志对应搜索状态；目标失效重查，原公共 AI 进攻脚本使用搜索结果。

Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> enemy-base` 2/2 覆盖原 CampaignAI 启动、130 个附加单位下分批搜索、暂停恢复、目标移除和原 `AnyPlayerAttack` 部队进攻。BootyBay 双电脑策略隔离模拟至 1,800 秒未触发胜负，日志 `tmp/docs-artifacts/war3/dota-hero-1031/enemy-base-duel.log`。阶段验证搜索目标及原版时序、盟友／隐形／死亡／无敌、重入与生命周期、脚本中断、局域网及完整对局。

### 行军单位协作避让（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。持续受阻的同属普通移动和攻击移动单位可有限让行，保留原路线和命令。

Win32 Release 客户端及测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> march` 通过，覆盖攻击移动及混合行军命令、避让后恢复与碰撞间距。BootyBay 双电脑隔离会话模拟至 1,200 秒，观察到部队跨地图移动，未触发胜负；证据 `tmp/docs-artifacts/war3/march-coordination/duel-mixed.log`。阶段检查密集拥堵、目标变化及战斗、命令取消、地形变化、性能、局域网一致性、原版行为和完整对局。

### 迷雾中的 AI 进攻（待验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。AI 对已知但位于战争迷雾中的目标发起攻击移动，重复同目标保留进行中的攻击和路线；新目的地仍会覆盖旧命令。

Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> fog-attack` 与 `enemy-base` 分别为 2/2，覆盖原 CampaignAI 启动、迷雾和可见目标、重复命令、不同目的地覆盖及原 `AnyPlayerAttack`；迷雾定向夹具中的进攻单位关闭了路径碰撞。BootyBay 原图双电脑隔离会话在 2,580 秒取得双方结果 0／1，后者单位和建筑为零，记录 `tmp/docs-artifacts/war3/march-coordination/duel-fog-final.log`。阶段检查原版行为、移动目标、目标隐藏／死亡／易主、脚本事件、不可达位置、完整战斗、其他地图、真实窗口和双端同步。

### 电脑采集覆盖金矿（待验证）

路径：`src/session_ai_economy.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。电脑城镇查询与金币总量使用被诅咒／被缠绕金矿关联的实际矿藏。

Win32 Release 客户端及测试编译通过；`war3_campaign_ai_tests <data-root> <BootyBay地图> melee-mines` 2/2，覆盖两种原图起始矿、AI 查询、真实采金及余额耗尽／恢复。不死族 60 秒原图隔离会话采金配额 5，底层矿余额 12,500→12,178；日志 `tmp/docs-artifacts/war3/orc-undead-duel/economy-after.log`。建造祭坛的侍僧受拥堵阻碍，完整不死族发展尚未通过；记录 `tmp/docs-artifacts/war3/orc-undead-duel/build-stall.log`。阶段检查矿井销毁／占领、多个城镇、原版语义、其他地图、实际客户端及局域网。

### 建造路径与不死族发展（待验证）

路径：`src/session_construction.cpp`、`tests/campaign_ai_tests.cpp`、`docs/economy.md`、`docs/ai.md`。保留终点仍在有效建造范围且地形阻挡版本未变的路线与避障点；终点无效或地形阻挡变化时重新寻路。

Win32 Release 客户端和测试目标编译通过；`war3_campaign_ai_tests <data-root> <BootyBay地图> melee-build` 1/1，覆盖实际建造命令、保留人工插入的绕行点、无效终点重算和祭坛完成；人工路径部分暂时关闭了工人单位碰撞。原图隔离会话不死族在 60 秒前开始祭坛建造，并继续建造墓地、训练死亡骑士；证据 `tmp/docs-artifacts/war3/orc-undead-duel/preserve-route.log`。兽族对不死族模拟至 2,100 秒，尚未产生胜负，日志 `tmp/docs-artifacts/war3/orc-undead-duel/duel-after.log`。阶段检查地形及建造位置变化、单位／建筑死亡与归属变化、取消／新命令、多人拥堵、其他种族施工、原版规则、真实客户端和局域网。

### 攻击追击路径保留（待验证）

路径：`src/session_combat.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/combat.md`。追击目标时保留通向有效攻击射程的路线和中间避障点；目标移动或地形阻挡变化使路线失效时重算。

Win32 Release 客户端及测试编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> chase` 1/1，覆盖人工绕行点保留、目标移动重算、实际攻击伤害，以及实际绕过占位单位和碰撞间距；人工绕行点部分暂时关闭了攻击者单位碰撞。兽族对不死族原图隔离对局模拟至 4,200 秒仍无胜负，日志 `tmp/docs-artifacts/war3/orc-undead-long/pursuit-final.log`。阶段检查动态单位／地形阻挡、目标死去／易主／隐藏、武器射程变化、编队及大量单位、原版事件时序、实际窗口和联机同步。

### 较弱野怪营地回退（待验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。无区间内可达营地时可回退到较弱可达营地，保留等级上限、空中筛选和现有可达性检查。

Win32 Release 客户端与测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> reachable` 2/2，检查较弱回退、区间内优先、超上限及隔水拒绝。固定版 Game.dll 对照指令记录 `tmp/docs-artifacts/war3/orc-undead-long/original-creep-camp-rizin.txt`；原版距离与过强营地筛选尚未完整实现。BootyBay 兽族对不死族隔离对局至 4,200 秒未产生胜负，剩余营地在隔离区域，见 `tmp/docs-artifacts/war3/orc-undead-long/weaker-camps.log`。阶段检查跨岛运输、混编、等级分组与移动、死亡／隐藏、距离与不可达、不同地图、实际窗口及联机。

### 登艇路径与 AI 跨水波次（待验证）

路径：`src/session_transport.cpp`、`tests/transport_tests.cpp`、`tests/campaign_ai_tests.cpp`、`docs/transport.md`、`docs/ai.md`。保留可进入载具登艇范围的有效路线和避障点；载具移动或地形变化时重算，载具失效清理命令。

Win32 Release 客户端及测试目标编译通过；`war3_transport_tests <data-root> <transport-fixture> boarding-route` 和 `flow` 各 1/1，覆盖路线保留、载具移动、装载事件、载具移除和既有装卸；路线夹具步兵关闭了路径碰撞。`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> island-wave` 1/1，在 BootyBay 地形上使用真实陆路接近、登艇、飞行和岛屿卸载；飞艇、编队和目标由测试预置，步兵设无敌。阶段检查拥堵、载具／乘员死亡易主、同时装载、多载具、目的地变化、自动购买与选目标、原版时序、实际窗口和联机。

### 飞艇购买的可达实验室（待验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。电脑购买飞艇前筛选地形可达且路线终点在交互范围内的商店和工人；不可达的部分路线不改变工人命令。

Win32 Release 客户端与测试编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> zeppelin-route` 和 `zeppelin-purchase` 各 1/1，覆盖隔水商店、可达候选、商店移除清理及通过原公共 AI 脚本购买、扣金和消耗库存。测试预置库存和资源，未验证完整对局中的人口条件或自行跨岛决策。阶段检查多商店／动态阻挡、工人原有任务、不可达与超时、库存／资源变化、原版排序、实际窗口及联机；路径查询的规模和耗时仍待性能验证。


### 远程飞艇购买等待（待验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。根据移动路线长度和当前速度估算购买预留时限，并限制在 60 至 600 秒；失效及更改命令仍释放预留。

Win32 Release 客户端和测试目标增量编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> zeppelin-long`、`zeppelin-stuck`、`zeppelin-route`、`zeppelin-purchase` 各 1/1，远程购买耗时 139 秒，停滞工人在期限内释放。长途和停滞夹具关闭工人路径碰撞，资源和库存由测试预置。阶段检查拥堵及动态路径、减速和暂停、买家死亡／易主、库存和资源变化、600 秒上限、原版时序、实际客户端与联机。


### 密集单位短距离让位（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。同属单位让位时优先尝试原有距离，受阻后尝试更短距离；各候选仍检查地形、单位碰撞和命令保护。

Win32 Release 客户端与测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> compact` 在仅允许原距离的对照构建失败、修复后通过，覆盖密集障碍中的短距离让位及持续碰撞检查；`yield`、`workers`、`march` 各通过。BootyBay 兽族对不死族隔离对局模拟至 1,800 秒未决出胜负，兽族在 1,200–1,800 秒金币和木材均未变化；更密集工人队列仍需处理，记录 `tmp/docs-artifacts/war3/ai-duel-investigation/short-yield-final.log`。阶段检查多单位互锁、连续让位、动态地形、重入与命令、性能、实际窗口及局域网一致性。


### 密集拥堵后撤恢复（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。单位受其他单位阻挡、局部绕行失败且持续停滞时，选择地形与碰撞均可通行的短距离后撤点；保留当前命令和原路径，后续继续行进。

Win32 Release 客户端和测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> retreat` 通过，覆盖受阻后保留目标、保持位置单位碰撞、障碍解除后到达原目标；`compact`、`yield`、`workers`、`march`、`chase` 各通过。隔离 BootyBay 兽族对不死族会话推进至 1,800 秒，兽族已有矿藏在 1,200–1,800 秒从 17,990 减至 17,040，未决出胜负；日志 `tmp/docs-artifacts/war3/ai-duel-investigation/retreat-final.log`。阶段检查实际采集和战斗大规模互锁、反复后撤与死路、目标或障碍变化、回调重入、CPU 开销、真实窗口、原版行为和双端同步。


### 多城镇采金配额（待验证）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。城镇采金配额只保留目标为该城镇当前矿井的工人；全局配额继续保留有效矿井任务。重分配复用采集命令和携带资源返还。

Win32 Release 客户端与测试目标编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> harvest-town` 由失败变为 2/2 通过，覆盖跨城镇任务、携带金币、保持正确订单与全局配额；夹具关闭工人路径碰撞并暂停 AI 脚本线程。`harvest` 与 `melee-mines` 各 2/2 通过。BootyBay 兽族对不死族隔离会话于 2,340 秒产生双方结果 0／1，不死族单位及建筑为零，日志 `tmp/docs-artifacts/war3/orc-undead-long/town-mine-final.log`；该会话由测试直接启动双方 AI，未覆盖实际窗口。阶段检查采集途中的城镇归属变化、多个矿井／工人、矿井移除或耗尽、金币入账事件与原版分配、实际对局和联机。

采金订单的城镇归属按当前目标矿井保留，工人经过其他城镇时不取消原任务。`harvest-town` 补充两个城镇均有配额时的边界场景，修复前该断言失败，修复后 2/2 通过；夹具直接调整工人位置、关闭其路径碰撞并暂停 AI 脚本线程。`harvest` 与 `melee-mines` 各 2/2 通过。自然跨城行走、多个工人和木材分配仍待阶段验证；本补充未重跑原图长局。


### 多城镇伐木任务归属（待验证）

路径：`src/ai.h`、`src/session_ai_economy.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。保留采集订单对应的城镇及订单轮次，工人跨越城镇边界或树木耗尽自动换树时不丢失归属；配额缩减、城镇失效、订单更改、单位失效和停止采集清理归属。

Win32 Release 客户端与测试目标编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> harvest-town` 2/2，包含跨城、两个城镇配额、缩减、销毁城镇、树木耗尽换树和停止采集；跨城通过直接调整位置，夹具关闭工人路径碰撞并暂停 AI 脚本线程。`harvest` 与 `melee-mines` 各 2/2 通过。阶段验证自然跨城移动、订单回调与易主／死亡、全局配额变化、原版语义、实际窗口、性能及联机同步。


### DotA 英雄经验目标（待验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`、`docs/dota-hero-experience.md`。`AddHeroXP` 对空、已失效和非英雄目标无操作；有效英雄的经验倍率和暂停开关沿用现有路径。

Win32 Release 客户端及测试目标编译通过；`war3_revival_tests <data-root> <hero-revival-fixture> hero-xp` 1/1，覆盖空、已移除单位及英雄、不兼容句柄、非英雄、有效英雄和暂停经验。DotA 原图隔离会话 `-sd` 购买英雄并发出攻击移动，修复前脚本报错，修复后推进 360 秒且观察到死亡和复活，记录 `tmp/docs-artifacts/war3/dota-combat-flow/after-xp-movement.log`。阶段检查真实窗口、所有玩家／英雄、脚本重入、经验倍率与数值边界、暂停／幻象、技能表现、其他地图及联机同步。


### 英雄经验与等级接口失效目标（待验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`、`docs/dota-hero-experience.md`。英雄经验、等级、技能点和经验暂停接口处理空、已移除、不兼容及非英雄目标；有效英雄沿用实际状态更新。

Win32 Release 客户端及测试目标编译通过；`war3_revival_tests <data-root> <hero-revival-fixture> hero-xp`、`awaken` 各 1/1，覆盖无效目标返回值和有效英雄经验／暂停／等级／技能点及既有酒馆复活。DotA 原图隔离会话购买育母蜘蛛、学习麻痹之咬并攻击测试敌人，观察到敌人获得 `B01D`；日志 `tmp/docs-artifacts/war3/dota-brood-attack/hero-xp-family-final.log`，该探针直接设置位置和创建目标。阶段检查英雄状态类型、幻象、生命周期／事件重入、等级及经验边界、窗口、原版经验数值和联机同步。


### 娜迦潜水地形条件（待验证）

路径：`src/session.h`、`src/session_unit_forms.cpp`、`src/session_ability_commands.cpp`、`tests/unit_forms_tests.cpp`、`docs/unit-forms.md`。潜入命令和按钮使用同一位置路径条件，浮出不受该条件限制。

Win32 Release 客户端及专项程序增量编译通过；`war3_unit_forms_tests <data-root> <naga-submerge-fixture> submerge` 1/1，覆盖三种娜迦陆地拒绝、水域按钮启用和潜入／浮出，以及形态、隐身、移动、武器和句柄。夹具关闭单位路径碰撞。阶段检查实际窗口、浅水及动态障碍、地图脚本修改通行位、技能覆盖、原版地形判断与反馈、侦测和联机同步。


### 亡灵第二章至第三章转场（待验证）

路径：`docs/campaign-flow.md`；复现入口及日志为 `tmp/docs-artifacts/war3/undead02-probe-1031/`。独立 Win32 探针依次运行第二章、间章和第三章：第二章直接完成两个任务并设置英雄属性，胜利对话框选择继续；间章请求第三章；第三章恢复英雄等级 5 和用户数据 24168。此检查跳过建造、寻路和战斗，手动启动各会话，不证明实际产品自动切关及原版 w3v 兼容。阶段验证自然完成任务、窗口与音画、间章播放、完整英雄／物品继承和实际自动切关。


### 战斗数值显示宽度（待验证）

路径：`src/game_commands.cpp`、`docs/unit-combat-panel.md`。攻击和护甲的基础值与加成共用信息列宽度，过长时等比缩小，保留独立颜色。Win32 Release 客户端增量编译通过；游戏内 Agent 的六物品圣骑士画面显示普通攻击基础值与正加成分开，证据位于 `tmp/docs-artifacts/war3/agent-info/layout-latest-agent/`。阶段核对极值与负加成、英雄双武器、各族及不同分辨率，并与原版画面对照。


### 娜迦季风（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [季风](monsoon.md)。英雄和野怪原型接入点目标持续施法、周期伤害与已有电脑施法路径。Win32 Release 客户端及专项程序编译通过；`war3_spell_tests <data-root> <BootyBay地图> monsoon` 1/1，覆盖两种原型、命令、目标范围／友军过滤、魔法消耗、持续状态与停止施法。测试暂停了已有单位和测试目标以隔离自动攻击，未覆盖实际窗口或 AI。阶段检查建筑、空中、魔免、等级、对象覆盖、波次及事件重入、施法者死亡／易主、视觉／音效、双端同步和原版雷击时序。


### 战役黑暗之门（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_summons.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [黑暗之门](dark-portal.md)。Win32 Release 客户端和专项程序编译通过；`war3_spell_tests <data-root> <BootyBay地图> dark-portal` 1/1，覆盖源单位列表、数量范围、点目标施放、生成真实单位、所有权与冷却；测试暂停地图既有单位。阶段检查地图覆盖、数量极值、不同运动类型与无空间、召唤事件重入、取消／易主／死亡、AI、机械小动物共享落点、联机、战役和原版召唤时序及视觉。


### 战役混乱之雨（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_area_spells.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [混乱之雨](rain-of-chaos.md)。Win32 Release 客户端与专项程序编译通过；`war3_spell_tests <data-root> <BootyBay地图> rain-chaos` 1/1，覆盖原版一级能力解析、点目标命令、分时创建两只地狱火、归属、限时生命和冷却。测试暂停了既有单位；落击伤害、眩晕、AI 与实际窗口未在此次运行中验证。阶段核对各等级、地图覆盖、位置合法性、被引用能力失效／替换、队列预算、死亡易主、事件重入、原版时序／随机顺序、联机及音画。

### 直线武器穿透与攻城溅射（待验证）

路径：`src/session_projectiles.cpp`、`tests/passive_tests.cpp`、`docs/destructable-weapon-attacks.md`、`docs/attack-ground.md`。mline 零扩散距离只命中主目标；aline 零扩散及攻击地面使用范围伤害；穿透从冲击点向后按距离排序并应用逐次伤害损失。

Win32 Release 客户端和测试目标编译通过；`build/windows-x86/bin/Release/war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/auras-passives/fixture.w3m line-weapon` 4/4，覆盖狮鹫、风暴之锤、刃车穿透升级和地面攻击，不加载 Game.dll。阶段对照原版损失公式、碰撞边界和目标顺序、穿透升级与地面攻击，验证物品／可破坏物、目标消失／回调重入、闪避／弹射、实际窗口及双端同步。

### 单机地图初始随机种子（待验证）

路径：`src/map_preparation.cpp`、`src/session.h`、`src/game_view.cpp`、`tests/map_seed_tests.cpp`、`tests/generate-map-seed-fixture.py`、`CMakeLists.txt`；说明见[会话随机流快照](session-random-persistence.md)。单机地图准备在脚本初始化前生成并保留初始种子，显式种子和联机同步种子保持不变。

Win32 Release 客户端与 `war3_map_seed_tests` 编译通过；`python tests/generate-map-seed-fixture.py --data-root <data-root>` 后执行 `build/windows-x86/bin/Release/war3_map_seed_tests.exe <data-root> ../../tmp/docs-artifacts/war3/map-seed/fixture.w3m`，4/4 通过，覆盖 config 内随机取值、文件与内存地图重建随机状态、显式零种子，无 Game.dll。阶段验证实际选图、取消、重开、战役、自定义地图与脚本重设种子、联机及原版随机初始化；单机回放仍未接入。

### 商店交互范围（待验证）

路径：`src/session_commerce.cpp`、`tests/passive_tests.cpp`、`tests/generate-passive-fixture.py`、`docs/commerce.md`。四族与中立商店按 `Aall`／`Aneu` 能力等级的源范围筛选买家，命令按钮和实际交易沿用相同规则。

Win32 Release 客户端及测试目标编译通过；在 `watcher/war3` 执行 `python tests/generate-passive-fixture.py --data-root <data-root> --output ../../tmp/docs-artifacts/war3/shop-range/fixture.w3m`，再执行 `build/windows-x86/bin/Release/war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/shop-range/fixture.w3m shop-range`，7/7 通过，覆盖四族商店、中立商店、酒馆及自定义 720 范围，检查边界、按钮和实际物品购买，不加载 Game.dll。阶段核对原版距离测量、单位碰撞、多买家与手动选择、空背包、技能禁用、多人／共享控制、酒馆唤醒、显形建筑及真实窗口。

### 商店指定买家（待验证）

路径：`src/session_commerce.cpp`、`src/commerce.h`、`src/session.h`、`src/game_commands.cpp`、`src/game_view.*`、`src/game_inventory_drag.cpp`、`src/player_commands.cpp`、`src/lan_actions.*`、`src/lan_action_encoder.cpp`、`src/lan_simulation.*`、`tests/passive_tests.cpp`、`tests/revival_tests.cpp`；说明见[商店](commerce.md)。商店提供源选择按钮及右键目标选择，购买命令携带买家并在消费时校验；商店物品栏当前支持显示及提示。实验联机为指定买家使用 `0xfd`，既有无买家 `0xf4` 保持读取。

Win32 Release 客户端和两个测试目标编译通过；`war3_passive_tests <data-root> ../../tmp/docs-artifacts/war3/shop-range/fixture.w3m shop-buyer` 1/1、`shop-range` 7/7；`war3_revival_tests <data-root> ../../tmp/docs-artifacts/war3/hero-revival/fixture.w3m lan-purchase-buyer`、`lan-purchase`、`awaken` 各 1/1。覆盖买家满栏／越界／移除、实际购买、动作编解码和原有交易／唤醒；未执行双进程或游戏内画面检查。阶段验证实际鼠标／热键／取消、原版按钮与库存布局、买家切换及指示、原版选择规则／共享控制、商店物品交互、同步延迟与双端／回放。

### 商店买家物品操作（待验证）

路径：`src/game_commands.cpp`、`src/game_inventory_drag.cpp`、`src/game_view.*`、`src/player_commands.*`、`src/lan_action_encoder.cpp`、`src/lan_actions.*`、`src/lan_simulation.cpp`、`tests/revival_tests.cpp`；说明见[商店](commerce.md)。商店物品栏的使用、目标选择、快捷键、拖拽与实验联机消费连接当前买家，并重新检查商店与买家关系。

Win32 Release 客户端与测试目标编译通过；执行 `build/windows-x86/bin/Release/war3_revival_tests.exe <data-root> ../../tmp/docs-artifacts/war3/hero-revival/fixture.w3m lan-shop-inventory`，1/1 通过，覆盖动作编解码、换格、买家越界／商店取消选择的旧动作及普通单位物品动作。阶段验证实际窗口的点击／目标／拖拽／快捷键、队列和买家切换、目标／物品失效、共享控制、双端同步／回放和原版操作一致性。

### 商店收购物品（待验证）

路径：`src/session.h`、`src/session_commerce.cpp`、`src/session_inventory.cpp`、`tests/passive_tests.cpp`、`tests/generate-passive-fixture.py`；说明见[商店](commerce.md)。物品交付订单可向有 `Apit` 的商店出售持有物品，使用源配置范围／比例、真实资源和出售事件。

Win32 Release 客户端与测试程序编译通过；生成 `tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m` 后运行 `war3_passive_tests.exe <data-root> <fixture> pawn-item`，1/1 通过，覆盖可出售标志、商店能力、金币／木材、事件字段及途中状态失效，不加载 Game.dll。阶段验证远距离到达、鼠标拖拽、玩家共享控制、排队及双端、商店／单位／物品失效与事件重入、自定义范围／倍率、四舍五入、原版事件次序与画面。

### DotA 迈达斯之手目标施法（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[迈达斯之手](dota-midas.md)。`ANab` 物品通过目标输入进入现有施法、冷却和地图脚本。

Win32 Release 客户端编译通过；原图隔离会话直接创建英雄、敌方步兵与 `I06D`，目标生命变为零、英雄经验增加、物品保留且进入冷却，日志 `tmp/docs-artifacts/war3/dota-midas/current.log`。阶段验证购买／合成、不同目标／距离／取消、奖励和事件时序、回调失效、联机、原版及真实窗口。

### 黑皇杖与失效物品查询（待验证）

路径：`src/session_entities.cpp`、`src/session_inventory.cpp`、`tests/passive_tests.cpp`；说明见[失效物品句柄](dota-bkb-item-handles.md)。物品所有者、数量、用户数据、等级和类别查询按原版处理无效句柄。

Win32 Release 客户端及测试目标编译通过；`python tests/generate-passive-fixture.py --data-root <data-root> --output ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m`，再执行 `war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m invalid-item` 1/1，覆盖有效、空、销毁及不兼容句柄。DotA 原图隔离会话使用 `I0FZ` 后得到 `I0G0`、免疫与冷却，推进 13 秒无脚本异常；记录 `tmp/docs-artifacts/war3/dota-bkb/bkb-after.log`。阶段验证实际购买／合成、多次使用、其他来源免疫、事件重入、联机和原版及游戏窗口。

### 紫怨与被动法术书（待验证）

路径：`src/session_equipment.cpp`、`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[紫怨](dota-orchid.md)。复合物品的被动法术书保留借用能力，由另一主动能力接收物品输入；`ANso` 支持物品目标施法。

Win32 Release 客户端编译通过；DotA 原图隔离会话直接创建紫怨与目标，观察目标沉默／恢复、装备加成及移除后清理；单独的原版法术书可打开。日志 `tmp/docs-artifacts/war3/dota-orchid/after-stats.log`、`book.log`。阶段验证实际购买／输入、随机及嵌套书籍、主动子能力与多来源、技能数值／事件、联机、原版和 GPU。

### 虚无能力与虚灵之刃（待验证）

路径：`src/entities.h`、`src/session_equipment.cpp`、`tests/passive_tests.cpp`、`tests/generate-passive-fixture.py`；说明见[虚无能力](ethereal-ability.md)。能力、书籍与物品刷新虚无状态，既有类别／攻击／伤害／治疗消费者读取该状态。

Win32 Release 客户端及测试目标编译通过；执行 `python tests/generate-passive-fixture.py --data-root <data-root> --output ../../tmp/docs-artifacts/war3/ethereal-ability/fixture.w3m`，再运行 `war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/ethereal-ability/fixture.w3m ethereal-ability`，1/1 通过。DotA 原图隔离会话使用 `I0LT`，目标在 1 秒时虚无、5 秒时恢复；记录 `tmp/docs-artifacts/war3/dota-ethereal/after.log`。阶段验证物品／派生、多个来源及生命周期、伤害／治疗倍率、地图覆盖、真实窗口／原版及联机。

### AI 波次撤退与超时登艇清理（待阶段验证）

路径：`src/session.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`；说明见 [AI](ai.md)。撤退、目标失效、超时和载具改派共用登艇清理；暂停或受控乘员不保留旧订单，停止回调的新订单不被超时回退覆盖。Win32 Release 客户端及 CampaignAI 目标编译通过；使用 `tmp/docs-artifacts/war3/ai-carrier-reentrant/fixture.w3m`，`war3_campaign_ai_tests <data-root> <fixture> island-paused-retreat`、`island-paused-timeout`、`island-timeout-reentrant` 各 1/1，超时检查人为缩短期限；载具换令、乘员换令、多乘员、多波及航行中撤退相关六种模式各 1/1，未加载 Game.dll。阶段验证死亡／易主、其他控制状态、多载具、动态地图与联机及原版时序。

### AI 载具改派时的登艇清理（待阶段验证）

路径：`src/session_ai_transport.cpp`、`tests/generate-campaign-ai-fixture.py`、`tests/campaign_ai_tests.cpp`；说明见 [AI](ai.md)。载具订单变更后解除本波次乘员预约和仍在执行的登艇订单，保护脚本回调的新命令；暂停乘员的旧订单也会清除。Win32 Release 客户端及 CampaignAI 目标编译通过；生成 `tmp/docs-artifacts/war3/ai-carrier-reentrant/fixture.w3m` 后，`war3_campaign_ai_tests <data-root> <fixture> island-carrier-reentrant`、`island-carrier-paused` 各 1/1，覆盖下一模拟步清理、停止事件换令和暂停恢复；`island-pickup-reentrant`、`island-flight-reorder-live`、`island-flight-reorder`、`island-pickup-group`、`island-auto-multiwave` 各 1/1，未加载 Game.dll。阶段验证多载具、乘员易主／死亡、嵌套事件、暂停／控制状态、真实地图、联机及原版时序。

### AI 登艇订单回调重入（待阶段验证）

路径：`src/session_ai_transport.cpp`、`tests/generate-campaign-ai-fixture.py`、`tests/campaign_ai_tests.cpp`；说明见 [AI](ai.md)。成员登艇订单回调替换命令后，AI 释放该成员预约，不再派载具接应或改用其他载具。Win32 Release 客户端与 CampaignAI 测试目标编译通过；生成 `tmp/docs-artifacts/war3/ai-board-reentrant/fixture.w3m` 后，`war3_campaign_ai_tests <data-root> <fixture> island-pickup-reentrant` 1/1，覆盖回调改为移动及后续保留；`island-pickup`、`island-pickup-group`、`island-pickup-reorder`、`island-auto-multiwave` 各 1/1。均不加载 Game.dll。阶段验证多载具、回调移除／易主／死亡、嵌套命令、实际地图、联机及原版时序。

### 脚本声音失效句柄（待阶段验证）

路径：`src/session_sound.cpp`、`tests/sound_tests.cpp`；原版入口见[脚本声音](script-sound.md)。声音解析对空、越界及不兼容对象返回空声音，有效句柄仍连接现有播放状态。Win32 Release 客户端及 sound 目标编译通过；在 `watcher/war3` 运行 `war3_sound_tests <data-root> ../../tmp/docs-artifacts/war3/sound-invalid sound_invalid_handle_preserves_playback` 和 `sound_jass_globals_queries_and_playback`，各 1/1 通过。检查使用静音会话；实际音频设备、退役和回调重入、其他声音参数、地图脚本与原版行为待阶段验证。

### 目标选择提示本地化（待阶段验证）

路径：`src/game_loading.h/.cpp`、`src/game_view.cpp`；说明见[玩家命令](player-commands.md)。普通命令、技能和物品的目标选择显示源 `SELECTTARGET`，缺少该键时使用中文回退；目标命令、取消及其他模式继续使用既有输入流程。Win32 Release 客户端增量编译通过；尚未执行实际窗口或原版画面对照。阶段核对攻击／移动／巡逻／采集／修理、技能及物品目标的文本、位置、颜色与出现时机，以及不同语言、地图覆盖、取消和联机。

### 状态栏标题本地化（待阶段验证）

路径：`src/game_loading.h/.cpp`、`src/game_buff_panel.cpp`；说明见[状态面板](buff-panel.md)。状态标题读取源 `InfoPanelStrings.fdf` 中的 `COLON_STATUS`，缺键时使用中文回退，标题绘制限制在图标左侧宽度内。Win32 Release 客户端增量编译通过；原资源文本已核对，尚未执行实际窗口或原版画面对照。阶段核对中文／英文、地图覆盖及长文本、不同窗口比例、八个状态和定时生命条布局。

### 持有物品的即时位置（待阶段验证）

路径：`src/session_entities.cpp`、`tests/passive_tests.cpp`；说明见[失效物品句柄](dota-bkb-item-handles.md)。脚本查询持有物品位置时读取持有者当前坐标，丢弃后读取地面坐标。Win32 Release 客户端及 passive 测试目标编译通过，`war3_passive_tests <data-root> ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m invalid-item` 1/1，覆盖脚本移动后不推进模拟直接查询及丢弃。阶段对照原版持有坐标规则，验证移动／传送／运输、掉落／转移、死亡／移除、回调重入、地图脚本和联机。

### 物品位置、名称和标记无效句柄（待阶段验证）

路径：`src/session_entities.cpp`、`tests/passive_tests.cpp`；原版入口见[失效物品句柄](dota-bkb-item-handles.md)。失效物品的坐标查询返回零、名称查询返回 null，位置和五项标记设置直接返回；有效物品继续使用实际状态。Win32 Release 客户端及 passive 目标编译通过；`war3_passive_tests <data-root> ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m invalid-item` 1/1 通过，覆盖空、销毁、类型不匹配及有效位置／标记操作。阶段核对真实地图回调、背包持有物品位置、地图边界、显示／掉落／收购和原版运行行为。

### 物品加入无效句柄（待阶段验证）

路径：`src/session_inventory.cpp`、`tests/passive_tests.cpp`；依据见[失效物品句柄](dota-bkb-item-handles.md)。`UnitAddItem` 校验单位及物品句柄，失败返回 false，有效目标继续进入实际背包流程。Win32 Release 客户端及 passive 目标编译通过；`war3_passive_tests <data-root> ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m invalid-item` 1/1，覆盖空、移除、不兼容句柄及后续有效拾取。阶段核对真实地图回调重入、物品／单位失效、满栏／立即消耗、事件顺序及原版运行行为。

### 玩家状态与睡眠线程采集（待阶段验证）

路径：`src/jass_runtime.h/.cpp`、`src/session_game.cpp`、`tests/clock_tests.cpp`；说明见[玩家基础状态](player-state-persistence.md)和[玩家科技状态](player-tech-persistence.md)。玩家状态和科技允许在脚本已让出执行时采集；脚本运行中及已有线程的状态恢复仍拒绝。Win32 Release 客户端及 `war3_clock_tests` 编译通过；以原 BootyBay 归档为世界、隔离脚本执行的新增联合采集／恢复用例通过，覆盖运行中拒绝、睡眠时采集及在另一会话恢复后继续线程。

执行 `war3_clock_tests <data-root> ../../tmp/docs-artifacts/war3/player-sleep-snapshot` 结果 11 通过、0 失败。测试世界使用原 BootyBay 归档，满足会话附加世界的资源要求。真实地图触发器、多个线程、世界对象、科技与人口一致性、统一事务、联机和原版存档仍待验证或实现。

### JASS 引用型全局状态（待阶段验证）

路径：`src/jass_runtime.cpp`、`src/jass_runtime.h`、`tests/jass_runtime_tests.cpp`、`tests/jass_thread_tests.cpp`；说明见 [JASS 全局快照](jass-global-persistence.md)。全局值组件包含函数与映射句柄，校验源码和内容并在完整解析后恢复；隔离线程恢复使用同一稳定句柄映射。

Win32 Release 客户端和两个测试目标编译通过；`war3_jass_runtime_tests ../../tmp/docs-artifacts/war3/jass/runtime-native.json` 17/17 通过，`war3_jass_thread_tests restore_reference_globals_and_sleeping_thread` 1/1 通过。阶段验证实际地图及对象生命周期、不同静态类型的句柄别名、全局与线程／事件／世界的统一事务、损坏和版本变更、完整保存载入与战役切区。组件未接入保存菜单或原版格式。

句柄类型补充：`src/jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`。兼容类型的别名和冲突按继承关系校验，不兼容类型的数值可独立映射。Win32 Release 客户端及运行时测试目标编译通过，运行时检查 17/17 通过，覆盖单位／父类型别名及与玩家颜色的数值重叠；实际地图与对象恢复待阶段验证。

# 人族物品栏槽位对齐

路径：`src/game_inventory_layout.h`、`docs/unit-combat-panel.md`。物品图标及其冷却和交互区域向右对齐控制台槽位。Win32 Release 客户端编译通过；游戏内 Agent 选中六物品、100 经验的圣骑士，画面显示物品、经验条和攻击加成，拖拽后第 0／1 格的物品句柄交换。证据位于 `tmp/docs-artifacts/war3/agent-info/layout-slot-aligned/`。阶段核对四族皮肤、不同窗口比例、物品点击／冷却和原版画面。

### 穴居恶魔蜘蛛攻击表现（待阶段验证）

路径：`src/combat.h`、`src/session.h`、`src/session_projectiles.cpp`、`src/session_tick.cpp`、`src/game_view.cpp`、`tests/passive_tests.cpp`；实现与证据见 [蜘蛛攻击](spider-attack.md)。Win32 Release 客户端及 passive 测试目标编译通过；`spider-attack` 1/1、受影响的 `line-weapon` 4/4 通过；隔离地图游戏内 Agent 获取实际攻击帧。原版时序、附件点和轨迹、其他目标及边界、多人、长局资源释放与真实性能待阶段验证。

蜘蛛回程追踪补充：`src/session.h`、`src/session_projectiles.cpp`、`tests/passive_tests.cpp`。Win32 Release 客户端与 passive 目标编译通过；`spider-attack` 1/1 通过，覆盖回程中攻击者移动、朝向及发射高度，原版挂点和移动画面待阶段验证。

### 战斗信息科技角标（待阶段验证）

路径：`src/combat.h`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`tests/passive_tests.cpp`；行为及局限见 [单位战斗信息面板](unit-combat-panel.md)。Win32 Release 客户端与 passive 目标编译通过；`weapon-ui` 定向检查 1/1 通过，游戏内 Agent 画面确认圣骑士无升级攻击图标，以及步兵攻击二级、护甲一级角标。阶段核对各级科技、同单位多个科技、双武器、地图覆盖、四族皮肤和原版显示。

### 两栖 AI 路线补员（待阶段验证）

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`；规则见 [战役两栖 AI 路径](campaign-amphibious-ai.md)。Win32 Release 客户端与 campaign AI 目标编译通过；`amphibious-reinforce` 2/2 通过，覆盖补员、路径点前进和取消。阶段核对实际战役、多人同步、补员死亡／易主／目标变化、寻路失败、动态障碍、回调重入、混编与原版选点。

### 多选头像的双目标物品（待阶段验证）

路径：`src/game_selection_panel.cpp`；说明见 [多选面板](selection-panel.md)。Win32 Release 客户端增量编译通过；游戏内 Agent 对照隔离地图，双目标物品通过头像选中单位并生效，纯地点物品不接受单位头像且未消耗。阶段核对真实地图、原版鼠标交互、Shift 排队、单位失效、纯单位物品和联机同步。

### 多选英雄头像光效（待阶段验证）

路径：`src/game_selection_panel.cpp`；说明见 [多选面板](selection-panel.md)。Win32 Release 增量编译通过；游戏内 Agent 截图确认两个英雄及英雄／步兵混选的头像与生命条可见，点击目标物品仍生效。阶段核对四族及自定义皮肤、12 个单位、纹理缺失／设备恢复、窗口比例、交互与原版光效。

### 单位事件索引（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`src/session_arrow_status.cpp`、`src/session_combat.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`；说明及命令见 [基础战斗](combat.md)。Win32 Release 客户端与 passive 目标编译通过；`event-index` 和 `spider-attack` 各 1/1 通过。阶段核对真实地图触发器、重复注册、禁用／销毁／重入、目标失效／易主、长局索引内存和帧耗时，以及原版事件次序与联机同步。

### 计时事件分发索引

路径：`src/session.h`、`src/session_callbacks.cpp`、`src/session_tick.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`。计时触发事件及计时器到期事件分别索引，模拟步在执行回调前快照需要派发的事件；清理已销毁的计时器和失效事件索引。

Win32 Release 客户端及 passive 测试目标编译通过；隔离地图 `timer-index`、`event-index` 各 1/1 通过，覆盖到期顺序、回调上下文、回调中销毁和注册触发器、暂停同帧计时器及既有单位事件。夹具 `tmp/docs-artifacts/war3/timer-index/fixture.w3m`；命令为 `war3_passive_tests.exe <data-root> <fixture> timer-index` 与 `event-index`。阶段核对周期计时器、重入／销毁生命周期、真实地图和联机顺序，并测量长局索引内存及帧耗时；尚无性能基准结论。

### 单位分类无效句柄

路径：`src/session_entities.cpp`、`tests/passive_tests.cpp`、`docs/unit-classifications.md`。`IsUnitType` 对空、移除、非单位和越界分类按原版入口返回 false，已死亡但尚未移除的单位保留死亡分类。Win32 Release 客户端及 passive 测试目标编译通过；`war3_passive_tests.exe <data-root> <fixture> invalid-unit` 4/4 通过，夹具 `tmp/docs-artifacts/war3/timer-index/fixture.w3m`。真实地图及原版运行时句柄生命周期、各分类与回调重入待阶段验证。

### 战斗数值符号可读性

路径：`src/game_commands.cpp`、`docs/unit-combat-panel.md`。攻击／护甲数值字号调整并保留列宽自适应，使加成正号和基础伤害范围分隔符可辨认。Win32 Release 客户端增量编译通过；游戏内 Agent 在六件攻击物品的圣骑士上取得 `24-34 +36` 画面，证据 `tmp/docs-artifacts/war3/agent-info/layout-value-font-1031/`。负值、极值、双武器、四族皮肤、不同窗口和原版画面对照待阶段验证。

### 攻击与护甲悬停说明

路径：`src/game_loading.*`、`src/game_commands.cpp`、`src/agent_capture.h`、`src/main.cpp`、`tools/agent-pointer.ps1`、`README.md`、`docs/unit-combat-panel.md`。信息图标悬停展示实时类型和原版本地化说明，遵循扩展提示开关；Agent 新增后台悬停用于游戏内核对。Win32 Release 客户端编译通过；Agent 选中六物品圣骑士，分别悬停攻击与护甲并抓取英雄类型及相应说明，证据 `tmp/docs-artifacts/war3/agent-info/layout-combat-tooltips-final-1031/`；悬停后拖拽前两格物品并核对句柄交换，证据 `tmp/docs-artifacts/war3/agent-info/pointer-hover-drag-final-1031/`。阶段核对全部攻击／护甲类型、双武器、地图覆盖、扩展提示开关、前台鼠标、Agent 前后台切换及原版位置；地图自定义伤害表可能不同于源说明。

### 英雄属性信息栏

路径：`src/session.h`、`src/session_hero.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。基础属性和实时加减值分别显示，悬停使用原版说明和当前地图的属性收益系数。Win32 Release 客户端和 passive 测试目标编译通过；`war3_passive_tests.exe <data-root> <fixture> weapon-ui` 1/1 通过。游戏内 Agent 以 `tmp/docs-artifacts/war3/agent-info/hero-attributes-custom.w3m` 验证贵族圆环、负敏捷及自定义生命／护甲／魔法系数，三张提示画面位于 `tmp/docs-artifacts/war3/agent-info/layout-hero-attributes-final2-1031/`。其余主属性、多个来源、极值／双武器、幻象、地图本地化、真实鼠标和原版布局待阶段验证。

### 攻击速度和护甲减伤提示

路径：`src/combat.h`、`src/session.h`、`src/session_combat.cpp`、`src/session_combat_destructable.cpp`、`src/session_damage.cpp`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`tests/passive_tests.cpp`、`docs/unit-combat-panel.md`。攻击提示显示实时伤害／射程／速度，护甲提示显示物理减伤；攻击计时和伤害结算复用同一计算。Win32 Release 客户端与 passive 目标编译通过；`war3_passive_tests.exe <data-root> <fixture> weapon-ui` 1/1，覆盖加速后显示间隔与真实攻击计时，以及负护甲提示与实际伤害一致。Agent 核对圣骑士正常与关闭扩展说明的提示，证据 `tmp/docs-artifacts/war3/agent-info/layout-combat-values-final-1031/` 和 `layout-combat-values-release-1031/`。原版分档边界、远程／双武器、技能及护甲组合、自定义配置和实际鼠标待阶段验证。

### AI 登艇回调中的载具改派

路径：`src/session.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。登艇同步回调改派或移除载具后立即释放该载具的预约，保留停止事件生成的乘员订单并清理暂停乘员。Win32 Release 客户端与 CampaignAI 测试目标编译通过；`war3_campaign_ai_tests.exe <data-root> <fixture> <mode>` 的 `island-carrier-reentrant`、`island-carrier-paused`、`island-pickup-reentrant`、`island-paused-retreat`、`island-paused-timeout`、`island-timeout-reentrant`、`island-flight-reorder-live`、`island-flight-reorder`、`island-pickup-group`、`island-auto-multiwave` 共 10/10 通过，夹具 `tmp/docs-artifacts/war3/ai-carrier-reentrant/fixture.w3m`。载具移除／易主、多载具同步回调、真实地图、联机和原版时序待阶段验证。

### AI 多载具续运

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。多载具波次中单艘飞艇改派时保留其他载具的运输计划，剩余成员可分波跨岛。Win32 Release 客户端及 CampaignAI 测试目标编译通过；`war3_campaign_ai_tests.exe <data-root> <fixture> <mode>` 的 `island-multicarrier-reassigned`、`island-multicarrier-reordered`、`island-flight-reorder-live`、`island-flight-reorder`、`island-carrier-reentrant`、`island-carrier-paused`、`island-auto-multiwave`、`island-auto-retreat`、`island-auto-target-death` 共 9/9 通过。前两项用两飞艇及九步兵验证剩余飞艇完成全员运输，分别覆盖改派后易主和保持新移动订单；夹具为 `tmp/docs-artifacts/war3/ai-carrier-reentrant/fixture.w3m`。舱内改派、多载具同时失效、真实地图、联机及原版调度待阶段验证。

### AI 登艇回调的备用载具

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`、`docs/ai.md`。首选飞艇被登艇回调改派后，未被脚本接管的乘员可改由其他飞艇运输；暂停或停止事件产生的新订单保持有效。Win32 Release 客户端与 CampaignAI 目标编译通过；`war3_campaign_ai_tests.exe <data-root> <fixture> <mode>` 的 `island-carrier-alternate`、`island-carrier-alternate-replacement`、`island-carrier-reentrant`、`island-carrier-paused`、`island-pickup-reentrant`、`island-multicarrier-owner`、`island-multicarrier-death`、`island-multicarrier-removed`、`island-multicarrier-reordered`、`island-auto-multiwave` 共 10/10 通过。备用飞艇完成登艇及跨岛卸载；多飞艇单艘易主、死亡或移除后完成九人续运。夹具 `tmp/docs-artifacts/war3/ai-carrier-alternate/fixture.w3m`；复杂回调、真实地图、联机与原版调度待阶段验证。

### AI 登艇回调改派多个载具

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`、`docs/ai.md`。载具候选在发令时复核订单轮次、归属和装载条件；回调改派的候选不再被本波次重新选取。Win32 Release 客户端及 CampaignAI 目标编译通过；`war3_campaign_ai_tests.exe <data-root> <fixture> <mode>` 的 `island-carrier-callback-multiple`、`island-carrier-alternate`、`island-carrier-alternate-replacement`、`island-carrier-reentrant`、`island-carrier-paused`、`island-pickup-reentrant`、`island-pickup-group`、`island-pickup-capacity`、`island-multicarrier-reordered`、`island-auto-multiwave` 共 10/10 通过。三飞艇场景中同步回调改派前两艘，第三艘完成登艇和跨岛卸载；夹具 `tmp/docs-artifacts/war3/ai-carrier-multiple/fixture.w3m`。多乘员复杂回调、真实地图、联机与原版调度待阶段验证。

### AI 水上运输船跨岛

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`、`docs/transport.md`。水上载具使用水路连通及地面接岸检查，接应并卸载被隔离的队员；空船在对岸时可驶回接应下一波。自有接应航线在撤退或超时停止，暂停时也清理，其他命令保留。Win32 Release 客户端与 CampaignAI 目标编译通过；`war3_campaign_ai_tests.exe <data-root> <fixture> <mode>` 的 `island-naval`、`island-naval-multiwave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-naval-timeout`、`island-naval-paused-timeout`、`island-naval-reorder`、`island-carrier-callback-multiple`、`island-pickup-group`、`island-auto-multiwave`、`island-flight-reorder-live` 共 11/11 通过。BootyBay 地形预置步兵及人族十格运输船，11 人分波送达的模拟时间为 69.25 秒；超时检查人工缩短期限并清除自动续运状态，暂停与换令由测试施加。夹具 `tmp/docs-artifacts/war3/ai-carrier-multiple/fixture.w3m`。岸线固定采样可能漏解；不同地图／载具、动态障碍、复杂回调、性能、真实对局、联机与原版时序待阶段验证。

### AI 水上运输的网格选岸

路径：`src/world.h`、`src/world_path.cpp`、`src/session_ai_transport.cpp`、`tests/world_tests.cpp`、`docs/ai.md`、`docs/transport.md`。选岸使用水陆连通区域与路径格搜索，按路径修订缓存结果；受阻目标选择附近可通行地面区域。Win32 Release 客户端、CampaignAI 和 world 目标编译通过；`war3_world_tests <data-root> <clamp-fixture.json> world_coastal_landing_grid_and_invalidation` 1/1，通过超过 4096 距离的单格航道、受阻目标、缓存复用、水道阻断和重新开放；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-naval`、`island-naval-multiwave`、`island-naval-retreat`、`island-naval-paused-timeout`、`island-naval-reorder`、`island-auto-multiwave`、`island-pickup-group` 共 7/7 通过。目标附近多个不连通区域、卸载落点占位、较大地图、不同载具、动态障碍、性能、真实对局、联机和原版策略待阶段验证；路径网格超过 1,048,576 格时不进行该连通搜索。

### 水运目标岸线与卸载落点

路径：`src/session_transport.cpp`、`src/transport.h`、`src/session.h`、`src/world.h`、`src/world_path.cpp`、`tests/transport_tests.cpp`、`tests/campaign_ai_tests.cpp`、`tests/world_tests.cpp`。原落点搜索失败后使用路径格兜底并检查占位；AI 水运卸载队列保留目标陆地区域，落点需与目标地面锚点连通。Win32 Release 客户端及 transport、CampaignAI、world 目标编译通过；`war3_transport_tests <data-root> <transport-fixture> <mode>` 的 `grid-drop`、`goal-drop`、`flow`、`orders`、`capacity`、`lifecycle`、`crash`、`boarding-route` 为 8/8；`goal-drop` 在两块不连通地面间直接设置测试卸载队列验证目标约束，`grid-drop` 检查唯一可通行格和单位占位。`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-naval`、`island-naval-multiwave`、`island-naval-retreat`、`island-naval-paused-timeout`、`island-naval-reorder`、`island-auto-multiwave`、`island-pickup-group` 为 7/7，实际水运落点均检查与目标地面连通。`war3_world_tests <data-root> <clamp-fixture.json> world_coastal_landing` 为 2/2，覆盖网格和地图边界。真实地图不同地形、动态占位、其他载具、原版落点策略及联机待阶段验证。

### AI 远岸船只多人接应

路径：`src/session.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`tests/generate-campaign-ai-fixture.py`、`docs/ai.md`、`docs/transport.md`。水上载具前往远岸时按容量预约其他成员，接岸范围与登艇接近距离一致；最后一名预约失效时停止本波次航线，暂停及停止回调换令由订单轮次保护。Win32 Release 客户端和 CampaignAI 测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-naval-remote-group`、`island-naval-remote-capacity`、`island-naval-remote-reorder`、`island-naval-remote-death`、`island-naval-remote-empty`、`island-naval-remote-empty-paused`、`island-naval-remote-empty-reentrant`、`island-naval`、`island-naval-multiwave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-naval-timeout`、`island-naval-paused-timeout`、`island-naval-reorder`、`island-auto-multiwave`、`island-pickup-group`、`island-carrier-callback-multiple` 共 17/17 通过。预置船和队员的 BootyBay 地形检查三名队员同船、十格满载及第十一人续运，分别于模拟时间 59 与 80.25 秒送达；死亡、暂停、换令及超时由测试施加，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`。不同地图、狭窄岸线、拥堵、混合陆地区域、多船、原版策略、联机和实际对局待阶段验证。

### 原公共 AI 水运进攻与途中重新编组

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。活跃运输波次遇到 `InitAssault` 时保留在途编组，载具中的波次成员参与编组及准备度查询，逐项恢复不同兵种需求时保留其他在途成员。Win32 Release 客户端和 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-naval-reform`、`island-naval-reform-mixed`、`island-naval-original-ai`、`island-naval-enemy-base`、`island-naval-enemy-base-multi`、`island-auto-multiwave-script`、`island-naval-remote-capacity`、`island-naval-remote-empty`、`island-naval-paused-retreat`、`island-naval-reorder`、`island-pickup-group`、`island-carrier-callback-multiple` 各 1/1，`enemy-base`、`armies`、`captain-home` 各 2/2，共 18/18。原 `AnyPlayerAttack` 场景中十格运输船分波运送 11 人，原脚本途中重新编组并最终击毁敌方建筑，模拟时间 109 秒；测试预置部队、船与目标，队员无敌、目标暂停且登陆前无敌，不代表完整对局。`MinorCreepAttack` 使用原公共脚本选择隔水营地并在登陆后击败目标。夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`；原版动态时序、其他兵种／伤亡、自然经济、真实战役、联机和完整对局待阶段验证。

### AI 水运与选岸合并批次（2026-11-01）

范围：`5ee235f`、`3d1bc9b`、`2612dc6`、`cc39828`、`686227c`。同一工作区版本的 Win32 Release 客户端及 CampaignAI、transport、world 检查程序构建通过；CampaignAI 26 种模式共 29/29、运输 8/8、世界选岸 2/2，共 39/39 通过，未加载 Game.dll。覆盖水运跨岛与分波、目标陆地区域卸载、路径格选岸与缓存失效、远岸多人接应及失效预约、原公共 AI 重编组和隔水目标、普通运输生命周期及登艇路径。AI 与运输使用各自 BootyBay 临时夹具，原公共脚本场景为预置部队与目标，不代表自然对局。

命令：`cmake --build --preset release --target war3 war3_campaign_ai_tests war3_transport_tests war3_world_tests --parallel 8`；各模式和结果见 `tmp/docs-artifacts/war3/naval-batch-20261101/`，夹具分别为 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m` 和 `tmp/docs-artifacts/war3/transport/fixture.w3m`。真实战役、多地图岸线与动态拥堵、不同兵种／伤亡、联机、性能、原版策略及窗口操作仍待阶段验证；完整原版玩法与 UI 尚未验收。

### AI 等待载具时重编组

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。跨岛进攻等待购买或可用载具时，重新初始化突击需求保留待续运目标及队长编组。Win32 Release 客户端和 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-purchase-reform`、`island-purchase-pending`、`island-purchase-cancel`、`island-purchase-target-death`、`island-purchase-busy`、`island-purchase-attack`、`island-naval-reform`、`island-naval-reform-mixed` 各 1/1，`armies` 2/2，共 10/10。新增场景在等待购买时调用重编组，之后完成购买和跨岛送达，模拟时间 27.25 秒；预置单位、商店和目标，不能代表自然对局。日志在 `tmp/docs-artifacts/war3/ai-purchase-reform/`，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`。混合兵种待购、目标／载具变化的复杂回调、真实地图、原版调度与联机待批次验证。

### AI 待运混编需求

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。待续运期间，逐项添加突击需求不会移除尚未指定需求的既有兵种；已指定的零或正数量继续约束该兵种，已预约波次的成员沿用运输生命周期。Win32 Release 客户端与 CampaignAI 检查程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-purchase-reform-mixed`、`island-purchase-reform-zero`、`island-purchase-reform`、`island-purchase-pending`、`island-purchase-cancel`、`island-purchase-target-death`、`island-purchase-busy`、`island-naval-reform`、`island-naval-reform-mixed` 各 1/1，`armies` 2/2，共 11/11。新场景在载具待购时暂停火枪手、逐项重建步兵与火枪手需求，再恢复并验证两者均跨岛到达；另一模式验证显式零需求移除后可重新入组。夹具预置单位、商店及目标；日志 `tmp/docs-artifacts/war3/ai-purchase-mixed/`，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`。复杂需求变动、死亡／易主、真实战役、联机及原版策略待批次验证。

### AI 舱内队员自动撤退

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。队伍低生命自动撤退时，在取消运输后重新获取可行动队员，向即时卸载的队员发出回家命令。Win32 Release 客户端和 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-boarded-retreat-home`、`island-wave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-auto-retreat`、`island-purchase-reform-mixed`、`island-naval-reform` 各 1/1，`armies`、`captain-home` 各 2/2，共 11/11。新增 BootyBay 场景预置飞艇和无敌步兵，登艇后测试直接降低生命触发自动撤退，验证卸载和远于 350 的回家目标；日志 `tmp/docs-artifacts/war3/ai-boarded-retreat/`，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`。飞行／海上无落点导致的延迟卸载、脚本回调改派、真实战役、联机与原版时序待批次验证。

### AI 续运、混编与撤退合并批次（2026-11-01）

范围：`106f97e`、`bb338e8`、`c7d6f51`。同一工作区版本的 Win32 Release 客户端和 CampaignAI 检查程序编译通过；21 种模式共 23/23 通过，未加载 Game.dll。覆盖待购时重编组、混合兵种与零需求、购买和目标取消、忙碌载具、已登艇后的低生命撤退、多波续运、载具回调改派和普通队长行为。各模式及原始日志在 `tmp/docs-artifacts/war3/ai-continuation-batch/`，BootyBay 夹具为 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`。检查使用预置单位、商店和目标；飞行／海上无落点的延迟卸载、复杂回调、实际战役、联机及原版行为仍待阶段验证。

### AI 远海延迟卸载撤退

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。低生命自动撤退保留延迟卸载的波次队员及撤退状态，卸载后向未被改派的队员发出回家命令；追踪建立后载具或队员订单、归属及生命周期变化会清理追踪。Win32 Release 客户端及 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-flight-retreat-home`、`island-flight-retreat-reassign`、`island-boarded-retreat-home`、`island-wave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-auto-retreat`、`island-purchase-reform-mixed`、`island-naval-reform` 各 1/1，`armies`、`captain-home` 各 2/2，共 13/13。新增飞艇场景在周围采样无可通行地面时降低队员生命，验证撤退状态持续到返航卸载、卸载点距离家超过 350 且随后步行回家；另验证载具新移动命令未被替换。测试预置载具与无敌队员，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`，日志 `tmp/docs-artifacts/war3/ai-flight-retreat/`。暂停载具、海上船只、多个乘员、死亡／易主和复杂回调、真实战役、联机与原版时序待批次验证。

### AI 暂停载具的远海撤退

路径：`src/ai.h`、`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。低生命自动撤退时，暂停或眩晕载具保留原波次接应位置，恢复且仍为空闲时重新发起返航卸载；追踪检查载具／队员订单及队长路线轮次。Win32 Release 客户端及 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-flight-retreat-paused`、`island-flight-retreat-paused-reassign`、`island-flight-retreat-home`、`island-flight-retreat-reassign`、`island-boarded-retreat-home`、`island-wave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-auto-retreat`、`island-purchase-reform-mixed` 各 1/1，`armies`、`captain-home` 各 2/2，共 14/14。最后补充队长路线轮次检查后重测前四项，各 1/1；其余结果复用。新增预置飞艇场景在远海暂停三秒后恢复，队员返航卸载并回家；另一场景恢复后立即改派飞艇，验证新命令保留。夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`，日志 `tmp/docs-artifacts/war3/ai-retreat-paused/`。眩晕、多乘员、海上船只、无法发出返航命令、取消过程重入、真实战役、联机及原版时序待批次验证。

### 队长主动回家与延迟卸载

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。`CaptainGoHome` 与低生命自动撤退共用运输收尾，重复回家时保留仍有效的返航和乘员追踪，等待卸载期间到家及到目标查询返回 false。Win32 Release 客户端与 CampaignAI 检查程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-flight-captain-home`、`island-flight-captain-home-paused`、`island-flight-retreat-paused-group`、`island-flight-retreat-paused`、`island-flight-retreat-paused-reassign`、`island-flight-retreat-home`、`island-flight-retreat-reassign`、`island-boarded-retreat-home`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-auto-retreat`、`island-wave` 各 1/1，`armies`、`captain-home` 各 2/2，共 16/16。预置飞艇远海场景验证主动及重复回家、暂停恢复、两名低生命队员同船卸载后各自回家；夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`，日志 `tmp/docs-artifacts/war3/ai-captain-delayed/`。海上船只、眩晕、载具／乘员失效、复杂回调、真实战役及原版时序待批次验证。

### AI 延迟卸载与队长撤退合并批次（2026-11-01）

范围：`b9c5c64`、`b8a7d45`、`4327160`。同一工作区版本的 Win32 Release 客户端与 CampaignAI 检查程序编译通过；22 种模式共 24/24 通过，未加载 Game.dll。覆盖远海延迟卸载、主动与自动撤退、重复命令、载具暂停恢复与改派、双乘员、普通水运、续运和队长编组。各模式日志位于 `tmp/docs-artifacts/war3/ai-retreat-batch/`，夹具为 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`；使用预置单位与载具。海上船只的远海撤退、眩晕、载具／乘员失效、复杂回调、真实战役、联机和原版时序仍待阶段验证。

### AI 水上载具远海撤退

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`src/session_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`、`docs/transport.md`。水上载具取消波次返航时按水路连通和出发地选岸；退回卸载携带出发陆地区域约束，暂停恢复时复用选岸。Win32 Release 客户端、CampaignAI 与 transport 检查程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-naval-offshore-retreat`、`island-naval-offshore-paused`、`island-naval`、`island-naval-multiwave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-naval-reorder`、`island-naval-reform-mixed`、`island-flight-captain-home`、`island-flight-retreat-paused`、`island-flight-retreat-paused-reassign`、`island-carrier-callback-multiple` 各 1/1，`armies`、`captain-home` 各 2/2；`war3_transport_tests <data-root> <fixture> <mode>` 的 `goal-drop`、`grid-drop`、`flow`、`boarding-route` 各 1/1，共 20/20。BootyBay 预置船与两名无敌队员，远海调用回家及暂停三秒后恢复，分别在模拟时间 38／41 秒左右卸至与出发地连通的陆地区域并回家；逐名在卸载后的首个观察步核对连通。`goal-drop` 在隔离场景验证卸载目标区域约束。日志 `tmp/docs-artifacts/war3/ai-naval-offshore-retreat/`，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m` 与 `tmp/docs-artifacts/war3/transport/fixture.w3m`。多个不连通候选岸、动态阻挡、多船、取消回调改派、失败重试、真实战役、原版策略与联机待批次验证。

### AI 水运取消时的即时卸载区域

路径：`src/session.h`、`src/session_transport.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`、`docs/transport.md`。水上波次取消时，即时卸载带出发侧地面连通约束；不连通时保留乘员并按已有返航流程接岸。Win32 Release 客户端、CampaignAI 与 transport 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-naval-enemyshore-retreat`、`island-naval-homeshore-retreat`、`island-naval-offshore-retreat`、`island-naval-offshore-paused`、`island-naval`、`island-naval-multiwave`、`island-naval-retreat`、`island-naval-paused-retreat`、`island-naval-reorder`、`island-naval-reform-mixed`、`island-flight-captain-home`、`island-flight-retreat-paused`、`island-carrier-callback-multiple` 各 1/1，`armies`、`captain-home` 各 2/2；`war3_transport_tests <data-root> <fixture> <mode>` 的 `goal-drop`、`grid-drop`、`flow`、`orders`、`capacity`、`lifecycle`、`crash`、`boarding-route` 各 1/1，共 25/25。BootyBay 场景预置两名无敌乘员，测试中将船分别定位到目标岸与出发岸水格再触发回家：前者返航并在各自卸载首个观察步核对出发区域连通，后者即时卸载后回家。夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`、`tmp/docs-artifacts/war3/transport/fixture.w3m`，日志 `tmp/docs-artifacts/war3/ai-naval-retreat-shore/`。动态阻挡、多个可选地面区域、回调改派、自然对局、联机与原版策略待批次验证。

### AI 返航期间队长编组查询

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。有效撤退返航中的舱内队员参与队长人数、空／满和生命／魔法准备度查询；载具或队员的订单轮次不再匹配时即时排除。Win32 Release 客户端与 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-flight-captain-home`、`island-flight-captain-home-paused`、`island-flight-retreat-reassign`、`island-flight-retreat-paused-reassign`、`island-flight-retreat-paused-group`、`island-flight-retreat-home`、`island-naval-offshore-retreat`、`island-naval-offshore-paused`、`island-naval-enemyshore-retreat`、`island-naval-homeshore-retreat`、`island-naval-reform`、`island-naval-reform-mixed`、`island-naval-retreat`、`island-auto-retreat` 各 1/1，`armies`、`captain-home` 各 2/2，共 18/18。测试在预置飞艇／双乘员水运场景核对人数、满员及生命准备度，载具改派后在下一模拟步前核对查询；夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`，日志 `tmp/docs-artifacts/war3/ai-retreat-queries/`。魔法有值混编、隐藏／死亡／易主、复杂回调、原版时序和实际对局待批次验证。

### AI 水运返航与队长查询合并批次（2026-11-01）

范围：`0e4a64b`、`ce0008d`、`bf57ef8`。同一工作区版本的 Win32 Release 客户端、CampaignAI 与 transport 检查程序编译通过；AI 22 种模式 24/24、运输 8 种模式 8/8，共 32/32 通过，未加载 Game.dll。覆盖远海与两侧岸线撤退、即时／延迟卸载、暂停恢复、队长编组查询、载具改派、航空回归及普通运输生命周期。各模式日志 `tmp/docs-artifacts/war3/ai-return-shore-batch/`，夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m` 与 `tmp/docs-artifacts/war3/transport/fixture.w3m`；水运测试预置单位并在岸线场景手动定位船只。动态阻挡、复杂岸线、眩晕／死亡／易主、复杂回调、真实战役、联机和原版策略仍待阶段验证。

### AI 返航失效后的队长位置查询

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。到家／到目标查询使用与编组查询一致的有效队员；有效舱内队员尚未到达，载具改派或易主后过期追踪不再阻塞查询。Win32 Release 客户端与 CampaignAI 检查程序编译通过；`war3_campaign_ai_tests <data-root> <fixture> <mode>` 的 `island-flight-retreat-owner`、`island-flight-retreat-reassign`、`island-flight-retreat-paused-reassign`、`island-flight-captain-home`、`island-flight-captain-home-paused`、`island-flight-retreat-paused-group`、`island-flight-retreat-home`、`island-naval-offshore-retreat`、`island-naval-offshore-paused`、`island-naval-enemyshore-retreat`、`island-naval-homeshore-retreat`、`island-naval-reform`、`island-naval-reform-mixed`、`island-auto-retreat` 各 1/1，`armies`、`captain-home` 各 2/2，共 18/18。预置飞艇场景在载具新命令或易主后、下一模拟步前核对空队伍和位置查询，随后确认追踪清理；有效返航仍验证未到达。夹具 `tmp/docs-artifacts/war3/ai-naval-remote/fixture.w3m`，日志 `tmp/docs-artifacts/war3/ai-retreat-arrival/`。混合在途／地面队员、死亡／复活、复杂回调、真实战役及原版时序待批次验证。

### 模拟时钟与睡眠线程恢复基础

路径：`src/session.h`、`src/session_game.cpp`、`tests/clock_tests.cpp`、`docs/simulation-clock-persistence.md`、`docs/save-runtime-foundation.md`、`docs/implementation-roadmap.md`。`SCLK` 记录模拟时间、固定步进余量、暂停和速度；恢复先校验后同步脚本调度时钟，仅允许尚未运行 main、创建单位、启动 AI 或登记计时器／计时事件的静止本地会话。Win32 Release 客户端及 `war3_clock_tests` 编译通过；`war3_clock_tests <data-root> <output-root>` **12/12**，未加载 Game.dll。隔离会话检查半步余量、暂停后同步继续、睡眠线程到期、损坏摘要、非法值及已有计时器拒绝；首次夹具缺少 destructable 类型导致 1 项失败，补齐后通过。日志 `tmp/docs-artifacts/war3/simulation-clock-snapshot/clock-tests-final.log`。真实地图、多个计时器与对象、脚本／世界统一事务、存档入口和原版格式待批次验证或实现。当前 D3D9 设备创建失败，未执行实际画面验收。

### 存档事件名称与脚本上下文

路径：`src/script_state.h`、`src/session.h`、`src/session_campaign.cpp`、`src/session_threads.cpp`、`tests/session_tests.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。存档事件分发保存文件名，`GetSaveBasicFilename` 在对应事件中返回无目录及末尾扩展名的名称；线程休眠上下文 `JSSC` 写版本 2 并读取版本 1。Win32 Release 客户端、session、save-exists 和 clock 检查程序编译通过；`war3_session_tests <enum-fixture>` 22/22、`war3_save_exists_tests <data-root> <OrcX01.w3x> <scratch-root>` 1/1、`war3_clock_tests <data-root> <output-root>` 12/12，均未加载 Game.dll；目录链接创建跳过。隔离测试覆盖中英文名称、三个并行睡眠事件、上下文编码恢复、非空旧版上下文和事件外 null；原图会话添加测试函数设置区域条目，手动分发事件后由原 `User Save` 脚本在隔离用户目录复制区域文件。日志及产物在 `tmp/docs-artifacts/war3/save-event-context/`。实际保存入口、事件时机、长文件名／其他编码、复杂重入、完整存档／载入及原版格式待批次验证或实现。

### 模拟与昼夜时钟统一恢复（待阶段验证）

路径：`src/session_game.cpp`、`tests/clock_tests.cpp`、`docs/simulation-clock-persistence.md`。`SCLK` 版本 2 纳入昼夜时钟及临时昼夜效果，校验地图昼夜规则后与模拟时钟一起恢复；版本 1 保持可读。Win32 Release 客户端及 clock 测试程序编译通过，`war3_clock_tests <data-root> <output-root>` 12/12，日志 `tmp/docs-artifacts/war3/combined-clock-snapshot/clock-tests.log`。隔离检查覆盖临时效果与睡眠线程续执行、旧版读取及昼夜规则损坏时拒绝且不修改目标。真实地图动态昼夜事件、完整世界对象、存档事务、保存／载入入口与原版格式待阶段验证或实现。

### 脚本计时器恢复组件（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。`STMR` 保留计时器回调、期限、状态及顺序，并通过脚本来源与稳定句柄校验；要求已恢复模拟时钟及预先创建空计时器。Win32 Release 客户端与 clock 检查程序编译通过；`war3_clock_tests <data-root> <output-root>` 13/13。隔离会话验证反序创建句柄后的全局引用、同刻执行顺序、周期及暂停恢复，并拒绝损坏、不同脚本和重复映射；日志 `tmp/docs-artifacts/war3/timer-snapshot/clock-tests-final.log`。真实地图、复杂回调、计时事件／对话框、统一对象图与实际保存／载入待阶段验证或实现。

### 触发器计时事件恢复组件（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。`STEV` 保存计时触发事件和计时器到期监听的期限、周期与登记顺序，恢复前需重建对应触发器、动作及事件并恢复计时器；脚本、模拟时间和句柄归属校验通过后恢复调度。Win32 Release 客户端和 clock 检查程序编译通过；`war3_clock_tests <data-root> <output-root>` 14/14。隔离会话反序登记事件，检查已触发的一次性事件、周期、同一计时器多个监听顺序及重新编码；拒绝损坏、重复映射与错误归属。首次测试的诊断文本预期有误，修正后通过；日志 `tmp/docs-artifacts/war3/timer-event-snapshot/clock-tests-final.log`。真实地图、完整触发器对象及动作、复杂重入、原版时序和保存／载入仍待阶段验证或实现。

### 触发器对象与回调重建（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。`STRG` 重建触发器、动作与条件句柄及表达式，恢复启用／等待设置和执行计数，并返回稳定编号映射；校验脚本来源、函数和预算。Win32 Release 客户端及 clock 检查程序编译通过；`war3_clock_tests <data-root> <output-root>` 15/15。隔离测试覆盖组合条件、回调、计数、不同句柄、字节往返、损坏拒绝，以及重建触发器后恢复计时器事件并续执行；日志 `tmp/docs-artifacts/war3/trigger-object-snapshot/clock-tests-final.log`。独立布尔表达式句柄与共享身份、跨运行时函数、真实地图、其他事件、睡眠线程和完整存档入口待阶段验证或实现。

### 计时事件对象直接重建（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。`STEV` 可在无活动事件的目标会话直接重建事件对象、触发器归属和计时器到期索引，返回事件稳定编号映射；要求目标计时器存活。Win32 Release 客户端及 clock 检查程序编译通过；`war3_clock_tests <data-root> <output-root>` 15/15。隔离测试依次恢复时钟、计时器、触发器、事件及全局引用，核对一次性／周期事件时序、回调顺序、句柄映射、归属清理及损坏／冲突拒绝；日志 `tmp/docs-artifacts/war3/timer-event-rebuild/clock-tests.log`。被销毁计时器的引用、其他事件、真实地图、复杂回调和完整存档入口待阶段验证或实现。

### 计时器对象直接重建（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。`STMR` 可在无活动计时器及事件的目标会话直接重建计时器并返回稳定编号映射，校验模拟时钟、脚本、回调和状态后再添加对象。Win32 Release 客户端与 clock 检查程序编译通过；`war3_clock_tests <data-root> <output-root>` 15/15。隔离测试验证三个一次性／周期／暂停计时器、同刻回调顺序、快照往返、损坏及不同脚本拒绝，并联合触发器、事件及全局引用恢复后续执行；日志 `tmp/docs-artifacts/war3/timer-object-rebuild/clock-tests.log`。真实地图、睡眠线程联动、其他事件与世界对象及完整存档入口待阶段验证或实现。

### 原图初始化计时器与存档组件验证（待阶段验证）

路径：`src/session_game.cpp`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`、`docs/simulation-clock-persistence.md`。允许 main 前未操作的初始化计时器存在，重建计时器后须恢复全局及其他引用；已操作计时器、计时器窗口和事件仍拒绝。Win32 Release 客户端和 clock 测试编译通过，`war3_clock_tests <data-root> <output-root>` 15/15；隔离测试检查初始化句柄替换、损坏及活动计时器及到期事件拒绝。OrcX01 原图 0／30／150 秒的时钟、计时器、触发器和计时事件组件均可重建且重编码一致，分别有 21／20／18 个计时器、1747／1749／1749 个触发器及回调句柄、各 145 个计时事件；未加载 Game.dll。日志 `tmp/docs-artifacts/war3/orcx-state-audit/audit-final.log`、`clock-tests-final.log`。0／30 秒睡眠线程未恢复；世界对象、其他事件、全部全局引用、实际存档入口和原版格式待实现或阶段验证。

### 游戏事件对象与原图用户存档触发器（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`SGEV` 重建游戏事件编号、登记顺序和触发器归属，返回事件句柄映射；支持与已重建计时事件共存。Win32 Release 客户端及 clock／save-exists 测试程序编译通过；clock 15/15、OrcX01 原图存档事件 1/1，未加载 Game.dll。隔离会话检查游戏事件顺序、与计时事件共存、销毁清理及损坏拒绝；原图测试重建触发器和游戏事件，测试函数设置区域名、目录及区域计数，手动分发保存事件后由原 `User Save` 动作复制隔离区域文件。目录链接创建跳过；日志 `tmp/docs-artifacts/war3/game-event-rebuild/clock-tests.log`、`orcx-tests-final.log`。真实保存／载入、世界对象、其他事件与跨区恢复待实现或阶段验证。

### 已恢复睡眠线程的连续快照（待阶段验证）

路径：`src/jass_runtime.cpp`、`tests/jass_thread_tests.cpp`、`docs/save-runtime-foundation.md`。已恢复且尚未唤醒的线程可再次采集；混合已恢复线程和现有运行线程时保留调用帧、待完成 native 与剩余时间。Win32 Release 客户端及 JASS 线程／session／clock 目标编译通过，检查分别 26/26、22/22、15/15；隔离检查验证二次恢复、继续执行和混合线程。OrcX01 原图开局四条睡眠线程在重建时钟、计时器和触发器后恢复，再编码内容一致；未唤醒原图线程或恢复世界。30 秒线程中的 `TriggerWaitForSound` 仍不支持采集，150 秒无活动线程。日志 `tmp/docs-artifacts/war3/orcx-state-audit/sleep-audit-final.log`、`jass-thread-tests-final.log`、`session-tests.log`、`clock-tests.log`。声音等待、native 调用栈及完整保存／载入仍待实现。

### 声音等待线程的恢复（待阶段验证）

路径：`src/jass_runtime.h/.cpp`、`src/session_sound.cpp`、`tests/jass_thread_tests.cpp`、`tests/sound_tests.cpp`、`docs/save-runtime-foundation.md`。`JSTH` 版本 2 记录 native 等待恢复模式并可读版本 1；声音等待在恢复后重新检查目标声音的播放位置，要求声音状态和句柄已恢复。Win32 Release 客户端及 JASS 线程／session／clock／sound 目标编译通过；JASS 线程 27/27、session 22/22、clock 15/15、声音定向检查 1/1。隔离测试手动创建目标声音并设置同一播放位置，核对同一模拟步结束、等待期间再次采集、重入模式不匹配拒绝及版本 1 续执行。OrcX01 30 秒三条睡眠线程已能采集，目标未重建声音对象而拒绝映射；日志 `tmp/docs-artifacts/war3/sound-wait-resume/`。真实声音对象／播放状态持久化、完整原图线程续执行、其他 native 栈和存档入口待实现或阶段验证。

### 声音通道播放状态基础（待阶段验证）

路径：`src/audio.h/.cpp`、`tests/sound_tests.cpp`、`docs/save-runtime-foundation.md`。声音通道采集播放位置、播放／暂停／停止、循环、速度、媒体类型和时长；静音模拟保留小数毫秒，实际后端使用其整数毫秒。Win32 Release 客户端及 sound 测试目标编译通过；`war3_sound_tests <data-root> <scratch> sound_playback_state_preserves_fractional_time_and_phase` 与 `sound_wait_snapshot_restarts_against_restored_playback` 各 1/1。静音 WAV／MIDI 检查覆盖变速、循环、暂停／继续和不兼容数据拒绝；等待检查沿用手动设置播放位置。`sound_playback_state_miles_roundtrip` 0/1：本机 `waveOutOpen()` 失败，未创建 Miles 输出设备；日志 `tmp/docs-artifacts/war3/audio-playback-snapshot/`。资源摘要、声音句柄、淡入淡出、场景状态、实际设备播放及完整存档待实现或阶段验证。

### 脚本声音对象与原图睡眠线程重建（待阶段验证）

路径：`src/audio.h/.cpp`、`src/sound.h/.cpp`、`src/sound_fade.h/.cpp`、`src/session.h`、`src/session_sound.cpp`、`tests/sound_tests.cpp`、`docs/save-runtime-foundation.md`。`SSND` 保存脚本声音资源摘要、句柄、播放／淡入淡出状态、参数及单位附件，校验后重建；目标初始化声音不得处于播放或暂停，后续须恢复脚本引用。脱离句柄仍播放的声音拒绝采集，环境、音量组、空间叠加、场景时钟与非脚本声音尚未纳入。Win32 Release 客户端及 sound／session／clock 目标编译通过；声音定向 3/3、session 22/22、clock 15/15。隔离测试覆盖 WAV／MIDI、已退役声音、附件映射、声音等待续执行、资源摘要变化、活动目标和脱离播放拒绝。OrcX01 静音模拟 0／30／150 秒分别重建 181 个声音及 4／3／0 条睡眠线程并重编码一致，30 秒含对白等待；未唤醒原图线程或恢复世界。日志 `tmp/docs-artifacts/war3/sound-object-snapshot/`。Miles 音频设备仍因本机 `waveOutOpen()` 失败未验收；场景音频、真实输出和完整存档待实现或阶段验证。

### 脚本集合与几何句柄重建（待阶段验证）

路径：`src/session.h`、`src/session_collections.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。`SCOL` 重建单位组、玩家组、位置和矩形，保留组成员顺序及坐标位值；单位成员依赖已恢复句柄，替换初始化对象后须恢复脚本和其他引用。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 16/16；隔离检查验证单位组成员顺序、移除清理、玩家掩码、几何值、句柄映射和损坏／映射错误拒绝。OrcX01 原图 0／30／150 秒的集合分别重建 854／869／910 个，使用 76／76／278 个普通步兵占位句柄核对引用，未恢复原单位状态；相关声音、计时器、触发器、计时事件及睡眠线程组件同时往返，日志 `tmp/docs-artifacts/war3/collection-snapshot/`。真实单位、其他对象／事件、全部全局引用与完整保存／载入待实现或阶段验证。

### 脚本区域几何重建（待阶段验证）

路径：`src/session_collections.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`、`docs/implementation-roadmap.md`。`SCOL` 版本 2 保存区域矩形并读取版本 1，重建后需恢复引用，目标须无活动事件。Win32 Release 客户端和 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 16/16，隔离检查覆盖区域内、挖空及外部判断、字节往返和旧版兼容。OrcX01 原图静音模拟 0／30／150 秒分别重建 911／926／967 个集合，各含 57 个区域；76／76／278 个普通步兵为组引用占位，声音、计时器、触发器、计时事件及睡眠线程组件重编码一致，未恢复原单位状态或唤醒线程。日志 `tmp/docs-artifacts/war3/region-snapshot/orcx.log`。区域事件与其 inside 状态、真实世界对象、完整存档和原版表现待实现或阶段验证。

### 区域及单位距离事件重建（待阶段验证）

路径：`src/session.h`、`src/session_spatial_events.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`、`docs/implementation-roadmap.md`。`SPEV` 保存区域进出和单位距离事件、过滤表达式、登记顺序与已有成员；目标需先重建触发器、区域和全部存活单位，并保持单位句柄相对顺序。失效目标或成员拒绝采集，独立布尔句柄共享身份尚未恢复。Win32 Release 客户端及 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 17/17，隔离检查覆盖首帧、进出及距离事件、过滤、销毁清理、字节往返、顺序冲突和损坏拒绝。OrcX01 原图 0／30／150 秒各重建并重编码 57 个区域事件，分别使用 239／252／455 个普通步兵占位，未恢复原单位状态或续执行原图事件及线程。日志 `tmp/docs-artifacts/war3/spatial-event-snapshot/`。完整世界、其他事件、真实加载与原版一致性待实现或阶段验证。

### 玩家与单位事件重建（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`、`docs/implementation-roadmap.md`。`SAEV` 重建玩家、玩家单位、单位、单位状态、玩家状态和联盟变化事件，保留过滤、阈值及混合登记顺序；目标需先重建触发器和相关单位，包括被引用的已移除句柄，布尔表达式按值重建。Win32 Release 客户端及 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 18/18，覆盖死亡回调顺序、过滤、单位与玩家状态阈值、联盟变化、已移除句柄和生命周期／损坏拒绝。OrcX01 原图 0／30／150 秒分别重建并重编码 129／141／141 个此类事件，使用 239／252／460 个步兵占位句柄，最后包含 5 个已移除句柄；未恢复原单位状态或续执行原图事件和线程。日志 `tmp/docs-artifacts/war3/actor-event-snapshot/`。完整世界、剩余事件、实际加载及原版一致性待实现或阶段验证。

### 相机设置与运动状态重建（待阶段验证）

路径：`src/session.h`、`src/session_camera_setup.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`、`docs/implementation-roadmap.md`。`SCAM` 重建相机设置句柄、镜头边界、目标、过场模型参数、运动与字段过渡和跟随配置；时钟须一致，单位引用须映射，调用方须恢复脚本引用。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 19/19；隔离检查覆盖移动及环绕插值、字段、跟随、映射和损坏拒绝。OrcX01 原图 0／30／150 秒各重建并重编码 95 个相机设置，使用 239／252／460 个步兵占位句柄；未恢复原单位状态或续执行原图线程。日志 `tmp/docs-artifacts/war3/camera-snapshot/`。实际存档加载、窗口画面及原版视觉一致性待实现或阶段验证。

### 失效单位位置与运动接口（待阶段验证）

路径：`src/session_entities.cpp`、`tests/clock_tests.cpp`、`docs/jass.md`、`docs/implementation-roadmap.md`。`SetUnitX/Y`、`SetUnitAcquireRange`、`SetUnitTurnSpeed`、`SetUnitPropWindow` 和 `KillUnit` 对无效单位安全返回；转向与窗口的查询对无效单位返回零。固定版 Game.dll 对应入口均先解析单位，失败直接返回，反汇编记录 `tmp/docs-artifacts/war3/unit-position-handles/`。Win32 Release 客户端与 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 20/20；隔离检查覆盖空、已移除和其他类型句柄，以及有效单位的位置与运动设置，未加载 Game.dll。真实地图相关脚本、其他版本和实际玩法待阶段验证。

### 失效单位即时命令（待阶段验证）

路径：`src/session_entities.cpp`、`src/session_orders.cpp`、`tests/clock_tests.cpp`、`docs/jass.md`、`docs/implementation-roadmap.md`。字符串与数字即时命令对空、已移除及类型不匹配单位返回 false，保留有效单位命令处理；固定版 Game.dll 的 `0x6f1e9080`／`0x6f1e90a0` 对应入口及解析失败分支见 `tmp/docs-artifacts/war3/ability-scan-current/order-full.txt`。Win32 Release 客户端和 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 21/21；隔离测试验证失败后定时触发器继续、有效单位仍可接受 stop。OrcX01 会话调用原 `Blizzard.j` `IssueImmediateOrderBJ`，有效／已移除／空单位返回值为 1／0／0，会话继续推进 0.25 秒，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/immediate-order-handles/`。自然对局、其他订单及原版时序待阶段验证。

### 失效单位创建和种族查询句柄（待阶段验证）

路径：`src/session_entities.cpp`、`tests/clock_tests.cpp`、`docs/jass.md`、`docs/implementation-roadmap.md`。四种单位创建入口在玩家或位置句柄无效时返回空单位，`GetUnitRace` 在单位失效时返回空种族；固定版 Game.dll 解析失败分支记录 `tmp/docs-artifacts/war3/ability-scan-current/create-full.txt`。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 22/22，隔离检查覆盖空、已移除、类型不匹配句柄、无额外单位及四种有效创建。OrcX01 会话调用原 `CreateUnitAtLocSaveLast`，空位置返回空且不创建，有效位置创建并更新 `bj_lastCreatedUnit`，会话继续推进 0.25 秒，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/unit-create-handles/`。真实对局、其他版本、未知单位类型和原版完整行为待阶段验证。

### 被腐蚀金矿创建的玩家校验（待阶段验证）

路径：`src/session_construction.cpp`、`tests/clock_tests.cpp`、`docs/construction.md`、`docs/implementation-roadmap.md`。`CreateBlightedGoldmine` 在创建底矿前检查玩家句柄，失败返回空且不留下中立底矿；固定版 Game.dll `0x6f1dd900` 的玩家解析分支见 `tmp/docs-artifacts/war3/blighted-mine-owner/original.txt`。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 23/23；检查覆盖空／类型不符玩家、有效矿井的共享资源和移除覆盖层。OrcX01 会话调用原 `CreateUnitAtLocSaveLast` 的 `ugol` 分支，空玩家无残留，有效玩家创建两层且共享资源，会话推进 0.25 秒，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/blighted-mine-owner/`。自然采矿、重入及原版完整时序待阶段验证。

### 金矿资源回调与耗尽（待阶段验证）

路径：`src/session_harvest.cpp`、`tests/clock_tests.cpp`、`docs/construction.md`、`docs/implementation-roadmap.md`。金矿产出回调后重新检查原底矿的存活与资源，覆盖层被移除时仍可处理耗尽，回调补充的资源不会被耗尽。Win32 Release 客户端与 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 24/24；隔离测试覆盖创建、脚本采集命令、资源入账、底矿／覆盖层共享、耗尽和回调移除／补充。OrcX01 原图会话通过原 `CreateUnitAtLocSaveLast` 创建闹鬼金矿，人工发出采集命令后 10 秒产出 18 金，矿藏从 321 降至 303；再设为 3 后耗尽两层矿井并停止侍僧采集，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/blighted-mine-harvest/`。自然建造、窗口交互、其他矿井及原版回调时序待阶段验证。

### 资源入账事件重入（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`src/session_harvest.cpp`、`tests/clock_tests.cpp`、`docs/construction.md`、`docs/implementation-roadmap.md`。资源入账后当前资源事件可能修改累计采集状态；分发累计事件前检查该玩家对应状态是否已发生变化，避免分发过期事件并保留同步脚本结果。Win32 Release 客户端和 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 25/25；隔离测试覆盖清零、清零后恢复、原值不变及修改其他资源，验证触发次数与最终状态。OrcX01 隔离会话的人工采矿、入账及矿井耗尽仍通过，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/resource-state-reentry/`。木材、其他资源操作、原版回调时序和自然对局待阶段验证。

### 人口变化与所有权转让回调重入（待阶段验证）

路径：`src/session_food.cpp`、`tests/clock_tests.cpp`、`docs/construction.md`、`docs/implementation-roadmap.md`。人口占用与上限一起变化时，回调可修改后续状态；人口开关和所有权转让按各玩家、各状态的变更情况跳过过期事件。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 26/26；隔离测试通过设置单位的人口消耗和产出，覆盖 `SetUnitUseFood`、`SetUnitOwner`、回调修改及改回、未修改时事件分发，未加载 Game.dll。日志 `tmp/docs-artifacts/war3/food-state-reentry/`。原版回调时序、其他人口操作、自然对局和界面待阶段验证。

### 玩家资源状态边界与失效句柄（待阶段验证）

路径：`src/session.cpp`、`tests/clock_tests.cpp`。`SetPlayerState` 与 `GetPlayerState` 对无效玩家及超过 25 的状态安全返回；黄金与木材设置按固定版的整数缩放及边界处理，资源变化事件使用处理后的值。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 27/27；隔离测试覆盖无效句柄、状态范围、资源边界和阈值事件。OrcX01 会话通过原 `Blizzard.j` 的 `AdjustPlayerStateSimpleBJ` 验证黄金和木材上下边界，并继续推进 0.25 秒，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/player-resource-bounds/`。其他版本、极端整数输入的完整覆盖、自然对局及 UI 显示待阶段验证。

### 采矿、资源与人口关联回归（部分通过，待阶段验证）

在 `ba38712` 的同一核心版本上重新编译 Win32 Release 采矿与建造测试，使用当前生成器生成独立地图。`war3_harvest_tests` 主检查和 `depot-route` 各通过；`war3_construction_tests` 在修正测试后通过，覆盖四族工人建造、人口与占地、矿井关联、升级、修理和荒芜。首次建造检查使用错误的兽族地洞 ID `obur`，按原 `opeo` 建造列表改为 `otrb`；字符串移动命令检查临时关闭该工人的寻路，避免被夹具中的阻挡位置影响，随后恢复。失败诊断包含建筑 ID 和拒绝原因。日志及生成地图位于 `tmp/docs-artifacts/war3/economy-batch-20261101/`。此前同一版本的 clock 27/27 和 OrcX01 资源包装检查复用。自然对局、实际窗口、原版事件时序和寻路拥堵仍待验证，不将这些隔离检查作为完整经济系统验收。

### 世界荒芜状态重建（待批次验证）

路径：`src/world.h`、`src/world_blight.cpp`、`tests/world_tests.cpp`，范围见 [战役存档状态](save-runtime-foundation.md)。`SBLT` 保存荒芜路径位与地形角点并重建查询指纹和受影响渲染区域，调用方须独立校验地图身份。Win32 Release 客户端与 world 测试目标编译通过，`war3_world_tests <data-root> <output> world_blight_snapshot` 2/2，含 BootyBay 原图、损坏拒绝及无路径网格；日志 `tmp/docs-artifacts/war3/blight-snapshot/world-tests-final.log`。待批次结合世界其他状态检查跨组件恢复、地图身份、真实渲染与存档流程；组件尚未接入保存／加载入口。

### 地表纹理状态重建（待批次验证）

路径：`src/world.h`、`src/world_blight.cpp`、`tests/world_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`STER` 保存与恢复地表纹理槽、变体和标志，并为新增类型检查资源、拒绝目标纹理槽冲突及刷新受影响区域；地图身份由调用方校验。Win32 Release 客户端与 world 测试目标编译通过，`war3_world_tests <data-root> <output> world_terrain_snapshot` 2/2、相关 `world_blight_snapshot` 2/2；BootyBay 原图检查扩展纹理、拒绝损坏及保留荒芜。日志 `tmp/docs-artifacts/war3/terrain-snapshot/`。实际画面、完整地形、跨组件事务和存档入口待批次验证或实现。

### 荒芜覆盖层使用当前地表变体（待批次验证）

路径：`src/terrain_blight.cpp`。荒芜网格重建直接读取当前地表角点的变体，使新增地表纹理仍在异步加载时覆盖层也能使用已更新的变体。Win32 Release 客户端编译通过；实际窗口与纹理流送时序待验证。

### 地表／荒芜批次回归（部分失败，保留待测）

范围 `472bdad`、`58a1ac7` 及本次覆盖层变更。Win32 Release 客户端和 world 测试目标编译通过；执行 `war3_world_tests <data-root> <output>` 得到 21 通过、4 失败。地表／荒芜快照四项均通过，原图及路径相关检查通过。四项 `world_location_global_and_destroyed_handles`、`world_rect_query_mutation_and_full_extent`、`world_main_preserves_session_and_environment`、`world_main_failure_is_terminal` 使用无资源归档的内存世界，均在 `attachWorld` 报 `World resources require archive-backed terrain`；该夹具问题已在 `campaign-rect-movement.md` 记录，尚未修复。日志 `tmp/docs-artifacts/war3/terrain-world-batch/world-tests.log`。渲染变体、动态纹理流送、实际窗口、地图身份和完整存档／跨区事务未验证，保留待测。

### 世界测试夹具恢复（批次失败项已复测）

路径：`tests/world_tests.cpp`。四项会话测试使用 BootyBay 资源归档并在测试脚本中声明可破坏物类型；矩形检查根据该图实际边界独立计算预期值。Win32 Release world 测试目标编译通过，上一批四个失败项定向复测 4 通过、0 失败；其余 21 项复用上一批结果，日志 `tmp/docs-artifacts/war3/terrain-world-batch/world_{location_global,rect_query,main_}-final.log`。渲染变体与动态纹理流送的实际窗口、地图身份及完整存档／跨区事务仍待验证或实现。

### 世界寻路状态重建（待批次验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`SPTH` 重建地图寻路位，保留荒芜和动态占地，更新路线缓存修订号；地图身份由调用方校验。Win32 Release 客户端与 world 测试目标编译通过，`war3_world_tests <data-root> <output> world_pathing_snapshot` 2/2，覆盖原图、阻挡／重开、占地、荒芜和损坏拒绝；日志 `tmp/docs-artifacts/war3/pathing-snapshot/world-tests.log`。活动单位路线、真实加载及与完整对象恢复的集成待批次验证或实现。

### 地形网格组合恢复（待批次验证）

路径：`src/world.h`、`src/world_blight.cpp`、`tests/world_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`SGRD` 将地表、荒芜、寻路状态与调用方地图摘要组合，在临时世界验证后原子提交；临时副本的内存峰值未测。Win32 Release 客户端及 world 测试目标编译通过，`war3_world_tests <data-root> <output> world_terrain_grid_transaction` 1/1，覆盖 BootyBay 原图、模拟摘要不匹配、子组件损坏回滚和动态占地保留；日志 `tmp/docs-artifacts/war3/terrain-grid-transaction/world-tests-final.log`。待批次验证真实地图摘要来源、资源峰值、实际画面、单位对象与完整保存／加载。

### 挂载地图身份与地形网格恢复（批次部分验证）

路径：`src/archive.h/.cpp`、`src/world.h`、`src/world_blight.cpp`、`tests/archive_tests.cpp`、`tests/world_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。组合恢复可使用挂载地图 SHA-256；磁盘来源核对文件身份与修改元数据，内存来源对挂载字节计算摘要。Win32 Release 客户端及测试目标编译通过；BootyBay 磁盘／内存摘要一致，OrcX01 内存地图拒绝跨图恢复，修改文件时间后拒绝身份校验。合并 `9ff47d8`、`9e3e876` 和本项回归，world 29/29、archive 9/9；日志 `tmp/docs-artifacts/war3/mounted-map-identity/`。测试覆盖地形／荒芜／寻路组合与事务、现有寻路及归档操作；大地图资源峰值／加载性能、实际存档和窗口、完整对象及跨区恢复仍待实现或验证。

### 地形恢复后的活动单位路径（待批次验证）

路径：`tests/movement_avoidance_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。Win32 Release 测试目标编译通过；`war3_movement_avoidance_tests <data-root> <map> restored-path` 在 BootyBay、Harrow 原图各通过，验证真实移动命令、恢复新障碍后的重新寻路、目标保留及每步不穿越阻挡，日志 `tmp/docs-artifacts/war3/restored-unit-path/`。测试复用当前会话单位，完整存档中的单位、队列、多人及实际窗口仍待验证或实现。

### 失效可破坏物操作（待批次验证）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`，说明见 [可破坏物与伐木](destructables.md)。击杀、移除和无敌设置对无效可破坏物安全返回。Win32 Release 客户端及测试目标编译通过，`war3_destructable_tests <data-root> <fixture> invalid-handles` 通过；检查空／已移除／错误类型句柄、原公共脚本包装与有效对象生命周期，日志及固定版指令 `tmp/docs-artifacts/war3/destructable-invalid-actions/`。待批次覆盖实际地图回调、占地重叠、树木采集和原版事件时序。

### 可破坏物对象重建（待批次验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session_destructable_snapshot.cpp`、`tests/destructable_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`SDES` 重建预置及动态可破坏物和已移除句柄，恢复生命、外观／动画与占地并提供句柄映射；应用阶段失败的目标会话须丢弃。Win32 Release 客户端及测试目标编译通过，`war3_destructable_tests <data-root> <map> snapshot` 在夹具、BootyBay、OrcX01 的 30 秒静音会话各通过，覆盖错误身份／摘要／放置索引拒绝、重编码、占地及夹具死亡事件；日志 `tmp/docs-artifacts/war3/destructable-snapshot/`。待批次合并真实地图对象图、其他 doodad 与事件、单位／全局引用、存档入口、原版表现和性能；尚未完成跨区恢复。

### Widget 死亡事件与可破坏物引用重建（待批次验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`SWEV` 恢复单位、物品和可破坏物死亡事件及目标生命周期、触发器归属与登记顺序。Win32 Release 客户端及 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 28/28；隔离检查联动可破坏物、触发器、事件和全局恢复，单位／物品由测试重建。OrcX01 30 秒的 7 个可破坏物死亡事件重建并重编码一致，未执行原图事件；日志 `tmp/docs-artifacts/war3/widget-event-snapshot/`。完整单位／物品、其他事件、原图全局与实际存档加载仍待批次验证或实现。

### 物品与背包对象重建（待批次验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session_item_snapshot.cpp`、`tests/clock_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`SITM` 重建活动／移除物品及持有者槽位，恢复书籍选择并刷新装备；应用阶段失败的会话须丢弃，单位状态和冷却由其他组件处理。Win32 Release 客户端及 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 29/29；隔离检查联动物品、触发器、死亡事件和全局，OrcX01 30 秒的 30 个物品使用 3 个持有者占位单位重编码一致。日志 `tmp/docs-artifacts/war3/item-object-snapshot/`。实际单位恢复、随机书籍、完整冷却／多人及保存加载待批次验证或实现。

前一批 `5408ff6`、`6d255b5`、`bcbfb30` 的相关回归在本版本执行：clock 29/29，可破坏物／伐木消费者两项通过；原图可破坏物和事件检查沿用各自记录。日志 `tmp/docs-artifacts/war3/item-object-snapshot/clock-tests-linked.log`、`destructable-batch.log`。实际窗口、原版事件时序及完整存档仍待验证。

### 单位技能与物品冷却状态（待批次验证）

路径：`src/session.h`、`src/session_item_snapshot.cpp`、`tests/clock_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`SUCD` 在相同地图和模拟时钟下恢复已重建单位的技能及物品冷却；错误映射或损坏数据在应用前拒绝。Win32 Release 客户端与 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 29/29；物品恢复测试覆盖技能／物品冷却重编码、无效映射与摘要损坏后的状态保留。待批次验证单位完整恢复、冷却实际使用、原版地图、保存／加载入口及多人行为。

冷却恢复补充检查：Win32 Release clock 29/29，隔离会话验证圣光术在冷却中被阻止、到期后治疗并重新冷却；HumanX01、HumanX03、UndeadX06 原图 150 秒冷却状态与剩余时间通过占位单位映射核对。复现探针 `tmp/docs-artifacts/war3/unit-state-audit/probe/`，运行参数为游戏数据目录及地图名。实际单位对象重建、物品冷却使用、完整保存／加载和窗口仍待验证。

### 串行动作睡眠线程恢复（待批次验证）

路径：`src/jass_runtime.h/.cpp`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_threads.cpp`、`tests/session_tests.cpp`，说明见 [战役存档状态](save-runtime-foundation.md)。`JSSC` 版本 3 保存等待模式触发器的剩余动作及函数身份，兼容版本 1、2；恢复需先重建触发器和动作。Win32 Release 客户端、session、clock 编译通过，session 23/23、clock 29/29。测试覆盖连续睡眠与再次恢复、错误动作映射、移除／销毁及 `TriggerExecuteWait`；OrcX01 资源和脚本附加测试触发器执行通过，探针 `tmp/docs-artifacts/war3/serial-trigger-snapshot/probe/`。待批次验证原图真实多动作线程、线程间等待、完整对象图和保存／加载。

本批合并验证范围为 `f7c20ff`、`fecb666` 和本次串行动作恢复，`d8c160b` 为同一冷却任务的补充验证。当前核心版本的 session 23/23、clock 29/29；OrcX01 30 秒的 30 个物品通过 3 名占位持有者恢复，HumanX03 和 UndeadX06 150 秒的活动技能冷却映射通过，OrcX01 追加测试触发器顺序恢复通过。探针分别位于 `tmp/docs-artifacts/war3/item-object-snapshot/probe/`、`tmp/docs-artifacts/war3/unit-state-audit/probe/` 和 `tmp/docs-artifacts/war3/serial-trigger-snapshot/probe/`。真实单位对象、原图多动作与线程间等待、物品冷却使用、完整存档和窗口仍留待后续实现或验证。

线程影响回归：`war3_jass_thread_tests` 27/27、`war3_jass_runtime_tests <literal-fixture>` 17/17；`war3_session_thread_tests <data-root> <thread-fixture>` 使用旧临时夹具时缺少 `RunExecuteValue`，按 `tests/generate-thread-fixture.py` 重建夹具后 6/6。覆盖协作调度、线程等待、脚本帧、上下文及会话生命周期。原版复杂重入、线程间等待恢复和实际战役流程仍待验证。

### 触发器等待线程恢复（待批次验证）

路径：`src/jass_threads.h/.cpp`、`src/jass_runtime.h/.cpp`、`src/session_threads.cpp`、`tests/session_tests.cpp`、`tests/jass_thread_tests.cpp`；说明见 [战役存档状态](save-runtime-foundation.md)。`JSTH` 版本 3 保存 `TriggerExecuteWait` 父子关系并校验等待图和触发器身份，读取旧版 1、2。Win32 Release 客户端与测试目标编译通过；session 23/23、clock 29/29；JASS 线程最终 27/27。隔离检查覆盖嵌套等待、连续动作、再次采集、循环／错误目标拒绝与已结束子线程；OrcX01 资源和脚本附加等待触发器检查通过，探针 `tmp/docs-artifacts/war3/thread-wait-snapshot/probe/`。真实原图等待链、其他 native、完整对象与存档入口待批次验证或实现。

### 盟友资源交易状态事件重入（待批次验证）

路径：`src/session_match.cpp`、`tests/clock_tests.cpp`，说明见[经济](economy.md)。交易黄金和木材同时变化时，回调可修改后续状态；按玩家和资源的变更版本跳过过期事件。Win32 Release 客户端及 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 30/30；隔离测试覆盖发送／接收方回调、改变后恢复、保留改变、相同值设置及其他玩家状态。原版事件时序、税率组合、联机时间片与实际界面待批次验证。

### 任务与目标对象重建（待批次验证）

路径：`src/session.h`、`src/session_quest.cpp`、`tests/clock_tests.cpp`，说明见[战役存档状态](save-runtime-foundation.md)。`SQST` 重建任务／目标及销毁句柄，恢复内容、状态、顺序和 HUD 提示，提供脚本句柄映射并刷新窗口版本。Win32 Release 客户端及 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 31/31；隔离检查覆盖全局引用、错误归属／摘要拒绝与恢复后修改，OrcX01 150 秒的 1 个任务及 1 个目标重编码一致，探针 `tmp/docs-artifacts/war3/quest-object-snapshot/probe/`。真实窗口、原图任务事件、完整世界和存档入口待批次验证或实现。

本批合并验证范围为 `8432af7`、`187ce75` 和本次任务状态恢复。相同核心版本的 clock 31/31、session 23/23、JASS 线程 27/27、会话线程 6/6；OrcX01 150 秒任务状态往返及附加触发器等待恢复分别通过，探针位于 `tmp/docs-artifacts/war3/quest-object-snapshot/probe/` 和 `tmp/docs-artifacts/war3/thread-wait-snapshot/probe/`。原图完整等待链、资源交易税率与联机、任务窗口画面、完整对象和实际存档加载仍待后续验证或实现。

### 单位句柄与类型重建（待批次验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session.cpp`、`src/session_game.cpp`、`src/session_entities.cpp`、`src/session_unit_identity.cpp`、`tests/clock_tests.cpp`，说明见[战役存档状态](save-runtime-foundation.md)。`SUID` 重建单位类型／归属／位置及已移除句柄，不恢复完整单位状态，并阻止不完整会话启动。Win32 Release 客户端和 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 32/32；隔离检查覆盖全局引用、人口、随机数、错误类型／摘要、地图外位置及变形。OrcX01 150 秒的 488 个单位句柄联动物品、任务、可破坏物和 7 个 widget 事件完成组件映射；探针 `tmp/docs-artifacts/war3/unit-identity-snapshot/probe/`。生命／能力／命令及关联状态、完整存档、自然对局与实际画面待实现或批次验证。

### 单位核心状态恢复（待批次验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session_unit_identity.cpp`、`src/session_unit_core.cpp`、`tests/clock_tests.cpp`，说明见[战役存档状态](save-runtime-foundation.md)。`SUCO` 分阶段恢复生命、魔法、英雄属性、技能、法术书和装备输入；物品重建后核对派生状态及稳定句柄，再恢复核心字段和占地。身份不匹配、数据损坏及背包映射错误会拒绝；应用阶段失败的会话须丢弃。

Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33。OrcX01 静音模拟 150 秒后重建 455 个单位（含 13 个死亡单位、4 名英雄、4 名物品持有者）、488 个单位句柄与 31 个物品句柄，核心及背包重编码一致，并联动任务和 7 个 widget 事件；未加载 Game.dll。日志及探针 `tmp/docs-artifacts/war3/unit-core-snapshot/`。单位订单、状态效果及其他对象引用、完整存档入口、续玩和实际窗口仍待实现或批次验证。

### 单位运动参数与外观恢复（本批验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session_unit_visual.cpp`、`tests/clock_tests.cpp`，说明见[战役存档状态](save-runtime-foundation.md)。`SUVS` 在核心状态恢复后恢复单位转向速度与推进角、飞行高度及其变化速度、模型缩放、顶点颜色和玩家颜色；先完整校验同图、时钟与稳定身份再应用。动画队列、朝向目标及实际读档入口尚待实现。

Win32 Release 客户端及 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33；隔离检查覆盖非默认字段、相同类型单位错误映射、损坏快照拒绝及拒绝时不改变已检查单位。OrcX01 静音模拟 150 秒的 455 个单位经单位核心、物品与外观恢复后重编码一致，含 13 个死亡单位；未加载 Game.dll。原始日志及探针 `tmp/docs-artifacts/war3/unit-visual-snapshot/`，实际窗口和恢复后持续运动尚待验证。

本批范围 `c68375f`、`86f75bc` 与本项：当前版本 clock 33/33，OrcX01 150 秒的 488 个单位句柄、455 个活动单位、31 个物品句柄、任务和 7 个 widget 事件完成组件映射及相应快照往返。完整单位订单、状态效果、动画、其他对象引用、真实存档入口及续玩仍待实现；上述组件验证不代表完整读档或画面验收。

### 人族第六章自然失败回归（验证补充）

路径：`tests/human_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release 测试目标编译通过；`war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> natural-defeat` 1 通过、0 失败。原图空闲模拟至 1947.25 秒，AI 转换 65 名村民，玩家建筑从非零降至零，失败对话与重开请求完成；未加载 Game.dll。探针及日志 `tmp/docs-artifacts/war3/human06-long/`。没有注入任务计数、击杀或移动；实际窗口、玩家操作、获胜及原版时序仍待验证。此项为既有战役任务的验证补充，不计入功能批次。

### 兽族第五章原图目标与胜利（验证补充）

路径：`tests/orc_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release 测试目标编译通过；`war3_orc_campaign_chain_tests <data-root> chapter5 <new-absolute-user-dir>` 1 通过、0 失败。原图模拟 400 秒后直接击杀塞纳留斯，原事件推进到胜利对话并请求第六章，模拟时间 471.844 秒；未加载 Game.dll。空闲原图探针运行至 2000 秒无脚本异常。证据 `tmp/docs-artifacts/war3/orc05-long/`；自然战斗、英雄继承、自动切关及窗口仍待验证。本项为验证补充，不计入功能批次。

### 兽族第五章至第八章格罗姆缓存（部分验证，引用待查）

路径：`tests/orc_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release `war3_orc_campaign_chain_tests <data-root> chapter5 <new-absolute-user-dir>` 的缓存及胜利检查 1 通过、0 失败；第五章胜利后，第八章独立会话恢复等级 7、用户数据 2468 的格罗姆，使用灵魂宝石并进入净化过场后跳过，胜利和返回请求完成。`bj_lastLoadedUnit` 指向恢复的英雄，而原图脚本通过 `GetLastCreatedUnit` 将 `udg_Grom` 指向萨满（`oshm`），测试输出 PENDING；原版客户端、引用后续影响、自然战斗和窗口仍待核查。未加载 Game.dll；日志 `tmp/docs-artifacts/war3/orc05-long/grom-skip-final.log`。本项为验证补充，不计功能批次。

### 失效单位的定时生命操作（待批次验证）

路径：`src/session_illusion.cpp`、`tests/clock_tests.cpp`，说明见[幻象与物品](illusions-items.md)。`UnitApplyTimedLife`、`UnitPauseTimedLife` 对空、已移除及错误类型的单位直接返回；有效单位继续使用既有定时生命流程。Win32 Release 客户端与 clock 测试目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33，覆盖无效单位及有效单位暂停、恢复与到期死亡；日志 `tmp/docs-artifacts/war3/timed-life-invalid/clock-tests.log`。原版 1.27 两个 native 句柄解析失败直接返回的只读反汇编证据见功能说明；原图触发器、事件顺序与实际窗口待批次验证。

### 失效玩家的英雄经验倍率（待批次验证）

路径：`src/session_hero.cpp`、`tests/clock_tests.cpp`；说明见[英雄经验](dota-hero-experience.md)。玩家经验倍率查询对无效玩家返回 1.0，设置直接返回；有效玩家倍率用于击杀经验分配。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33，覆盖空／错误类型句柄及倍率 1.25 的英雄经验；日志 `tmp/docs-artifacts/war3/xp-handicap-invalid/clock-tests.log`。原版静态入口及摘要见功能说明；原图、联机与窗口待批次验证。

### 英雄经验倍率边界（本批验证）

路径：`src/session_hero.cpp`、`tests/clock_tests.cpp`；说明见[英雄经验](dota-hero-experience.md)。有限倍率按原版静态入口限制为 0.01 至 100，失效玩家查询返回原版初始化默认值 1.0。Win32 Release 客户端与 clock 测试目标编译通过，clock 33/33；覆盖负值、零、下限、常用值、上限、超上限、失效玩家和实际英雄经验。原版非常规浮点值与动态行为仍待验证。

本批合并 `cfcf65e`、`e085e52` 和本次边界修复：同一核心版本 clock 33/33，覆盖定时生命的失效句柄、暂停／恢复／到期及经验倍率的失效玩家、边界和英雄经验；隔离原图兽族第五章目标与第八章灵魂宝石、缓存及跳过胜利检查通过，但第八章 `udg_Grom` 指向萨满的差异仍为 PENDING。日志 `tmp/docs-artifacts/war3/xp-handicap-bounds/{clock-final,orc-final}.log`。原版动态时序、自然战斗、联机和实际窗口仍待验证。

### 脚本经验与击杀经验倍率（待批次验证）

路径：`src/session_hero.cpp`、`tests/clock_tests.cpp`；说明见[英雄经验](dota-hero-experience.md)。`AddHeroXP` 使用脚本指定经验，保留暂停和范围处理；玩家倍率用于击杀经验分配。Win32 Release 客户端与 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33；隔离检查倍率 1.25 时脚本增加 100 点及倍率 1／2 的同类型目标击杀经验。原版静态调用标志、指令证据见功能说明；原版动态、经验分享／舍入、事件顺序、原图与联机待批次验证。日志 `tmp/docs-artifacts/war3/hero-script-xp/clock-tests.log`。

### 击杀经验最终取整（待批次验证）

路径：`src/session_rewards.cpp`、`tests/clock_tests.cpp`、`docs/heroes.md`；说明见[英雄经验](dota-hero-experience.md)。击杀经验最终转整数时正数四舍五入；脚本经验维持独立规则。Win32 Release 客户端与 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 最终 33/33，实际伤害击杀覆盖倍率产生的半点。首次测试夹具基础经验是偶数，未能构造半点而失败；改用精确倍率后通过。只读原版取整调用链见功能说明，日志 `tmp/docs-artifacts/war3/kill-xp-rounding/clock-final.log`。原版动态、多英雄共享／中间精度及自然对局待批次验证。

### 共享击杀经验实数精度（本批验证）

路径：`src/session_rewards.cpp`、`tests/clock_tests.cpp`；说明见[英雄经验](dota-hero-experience.md)。击杀经验分享、玩家倍率和最终取整消费原版 32 位实数层；数值超出支持范围按既有预算保护。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33；实际伤害击杀场景中，40 点基础经验由三名英雄分享、倍率 0.1875 时各得 2 点。原版静态调用路径见功能说明，经验表公式／野怪倍率中间精度及原版动态行为仍待验证。

本批合并 `eca58e3`、`7e35eae` 与本项：同一核心版本 clock 33/33，覆盖脚本经验、击杀倍率、半点取整和三英雄共享；隔离兽族第五章胜利、第八章灵魂宝石／缓存／跳过胜利回归通过，过场中 `udg_Grom` 指向萨满的问题仍为 PENDING。日志 `tmp/docs-artifacts/war3/shared-xp-real/{clock-final,orc-campaign}.log`。自然战斗、完整分享规则、原版动态、联机及实际窗口仍待验证。

### 野怪经验跨级分段（待批次验证）

路径：`src/session_rewards.cpp`、`tests/clock_tests.cpp`；说明见[英雄经验](dota-hero-experience.md)。野怪经验按等级阈值逐段应用 `HeroFactorXP`，中立玩家 12–15 使用同一规则；零系数停止后续经验。Win32 Release 客户端及 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33；实际伤害击杀覆盖同级、跨级、连续跨级及零系数、中立玩家 12–15。日志 `tmp/docs-artifacts/war3/creep-xp-levels/clock-saturation.log`。固定版静态指令见功能说明；原版动态、经验奖励加成、极大值、自然对局及联机待批次验证。

### 英雄脚本经验和满级边界（待批次验证）

路径：`src/session_hero.cpp`、`tests/clock_tests.cpp`、`docs/heroes.md`；说明见[英雄经验](dota-hero-experience.md)。脚本设置经验不降低当前经验，暂停经验阻止经验／等级设置，满级经验按源最高等级阈值限制；降级仍使用 `UnitStripHeroLevel`。Win32 Release 客户端和 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 33/33；检查降低目标、暂停设置、满级上限与野怪经验跨级，日志 `tmp/docs-artifacts/war3/hero-xp-cap/clock-tests.log`。原版静态入口与调用链见功能说明；真实地图、原版动态、事件顺序和自定义上限待批次验证。

### 英雄等级标题本地化（本批验证）

路径：`src/game_loading.h`、`src/game_loading.cpp`、`src/game_commands.cpp`，说明见[英雄经验与成长](heroes.md)。英雄经验条标题读取原版 `GlobalStrings.fdf` 的 `INFOPANEL_LEVEL_CLASS`，填入实时等级和单位类型名；缺失资源时使用英文默认格式。Win32 Release 客户端和 clock 测试目标编译通过。本批合并 `3df2feb`、`63fcdac` 和本项：隔离数据目录执行 `war3_clock_tests <data-root> <output-root>`，33 通过、0 失败，日志 `tmp/docs-artifacts/war3/hero-level-localization/clock.log`。游戏窗口检查尝试创建 D3D9 设备失败，未获得画面；日志 `tmp/docs-artifacts/war3/hero-level-localization/capture/client.log`。实际等级标题画面、悬浮提示、原版动态行为、事件顺序、自然对局及联机仍待验证。

### 兽族第八章跳过过场引用（验证补充）

路径：`tests/orc_campaign_chain_tests.cpp`，说明见[战役流程](campaign-flow.md)。原版 `Blizzard.j` 中恢复单位设置 `bj_lastLoadedUnit`，`GetLastCreatedUnit` 读取独立的 `bj_lastCreatedUnit`；Orc08 原图跳过脚本读取后者。Win32 Release 测试构建通过，在新建隔离用户目录运行 `war3_orc_campaign_chain_tests <data-root> chapter5 <new-absolute-user-dir>`，1 通过、0 失败，覆盖最近创建的萨满、恢复的格罗姆、脚本引用及胜利返回；日志 `tmp/docs-artifacts/war3/orc08-bj-reference/chapter5.log`。未加载 Game.dll；原版客户端动态表现、自然战斗和窗口仍待验证。本项是既有战役任务的验证补充，不计功能批次。

### 商店与英雄联动夹具（验证补充）

路径：`tests/generate-commerce-fixture.py`，说明见[商店](commerce.md)及[对局分数](player-scores.md)。夹具按已核实的经验规则检查倍率不影响脚本加经验、暂停期间不能设置等级及恢复后的升级。Win32 Release `war3_commerce_tests <data-root> <fixture.w3m>` 通过，覆盖商店交易／库存、训练／退款、人口、集结、英雄经验／技能／分数、物品幻象及荒芜恢复；未加载 Game.dll。首次使用旧夹具因经验预期过时失败，更新生成器并重新生成夹具后通过；日志 `tmp/docs-artifacts/war3/commerce-current/commerce-updated.log`。原版动态对照、自然对局和窗口仍待验证。本项为既有功能的验证补充，不计功能批次。

### DotA 原图英雄行动与复活（验证补充）

路径：`tests/dota_heroes_tests.cpp`，说明见[英雄经验](dota-hero-experience.md)。Win32 Release 测试目标编译通过；隔离用户目录运行 `war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x> natural-flow`，1 通过、0 失败：原图 `-sd` 购买英雄后直接下达一次攻击移动，断言英雄到达战场、死亡及复活，模拟至 360 秒；未加载 Game.dll。日志 `tmp/docs-artifacts/war3/dota-current/natural-flow.log`。真实玩家输入、技能／物品、完整对局、联机及原版动态行为仍待验证；本项为既有功能的验证补充，不计功能批次。

### 人族隐藏关无操作流程（验证补充）

路径：`tests/human_campaign_chain_tests.cpp`，说明见[战役流程](campaign-flow.md)。Win32 Release 测试目标构建通过；新建隔离用户目录运行 `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> natural-secret`，1 通过、0 失败。原图开场恢复控制后无玩家命令，在传送门生命降至 400 时出现胜利对话并请求间章，模拟时间 469.469 秒；未加载 Game.dll，日志 `tmp/docs-artifacts/war3/human-secret-natural/test.log`。原版相同条件、实际防守和窗口仍待对照；本项为既有战役功能的验证补充，不计功能批次。

### 移动期间关闭路径碰撞（待批次验证）

路径：`src/entities.h`、`src/session_combat_orders.cpp`、`src/session_entities.cpp`、`src/session_orders.cpp`、`src/session_network_identity.cpp`、`tests/human_campaign_chain_tests.cpp`、`tests/order_queue_tests.cpp`；说明见[对象定义](entities.md)。普通移动保存实际目标；单位移动时从启用切换至禁用路径碰撞，当前路线改为该目标并保留排队命令，目标参与联机会话状态摘要。命令结束或替换后不重启旧移动。Win32 Release 客户端及相关测试目标编译通过；`war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-pathing` 1 通过、0 失败，原图单位穿过路径碰撞关闭区域并到达等待区；`war3_order_queue_tests <data-root> <BootyBay.w3m> pathing-toggle` 1 通过、0 失败，覆盖路线目标、排队移动及完成后切换。日志 `tmp/docs-artifacts/war3/human-secret-natural/{pathing-fix,toggle}.log`。完整命令队列和隐藏关最终波次的后续合并验证见本文件末尾。原版动态时序、其他订单／恢复路径碰撞、联机及真实窗口留待验证。

### 阻塞目标的可达落点（待批次验证）

路径：`src/world_path.cpp`、`tests/world_tests.cpp`、`tests/human_campaign_chain_tests.cpp`；说明见[对象定义](entities.md)和[战役流程](campaign-flow.md)。目标格不可通行时，从搜索到的候选格中优先选择距离目标最近的可达格，等距离按路径成本选择；继续使用现有节点预算。Win32 Release 客户端和测试目标编译通过，`war3_world_tests <data-root> <clamp-fixture.json> world_` 30 通过、0 失败；隐藏关 `secret-pathing` 及新建隔离用户目录的 `secret-final-wave` 各 1 通过、0 失败。后者每 0.25 秒恢复传送门生命，检查第 31 波和间章请求，模拟时间 2302.78 秒；日志 `tmp/docs-artifacts/war3/human-secret-order/{world-tests,secret-leader,final-wave}.log`。正常防守、原版寻路对照、预算耗尽、拥堵、大地图性能、联机及窗口待批次验证。

### 联机治疗术订单（本批验证）

路径：`src/lan_spell_orders.h`、`tests/order_queue_tests.cpp`，说明见[联机实验入口](lan-experimental-flow.md)。单位目标治疗术订单 852063 接入现有联机编码和接收路径，排队后通过实际施法恢复目标生命；测试夹具使用连续时间片及农民的源派生修理能力 `Ahrp`。Win32 Release 客户端和相关测试目标编译通过；BootyBay `war3_order_queue_tests <data-root> <map>` 输出 32 条 PASS（含最终汇总），覆盖治疗排队、实际恢复、修理自动施法和既有命令；未加载 Game.dll。日志 `tmp/docs-artifacts/war3/lan-heal-batch/order-final.log`。真实双端、原版联机协议和时序待验证。

本批合并 `023460a`、`b415b22` 和本项：同一核心版本世界路径 `world_` 30 通过、0 失败，路径切换和隐藏关等待区各 1 通过、0 失败，隐藏关最后一波检查得分 31 后进入间章；后者每 0.25 秒人为恢复传送门生命。日志 `tmp/docs-artifacts/war3/lan-heal-batch/{world,path,toggle,wave}.log`。原版寻路对照、正常玩家防守、预算耗尽／大地图性能、真实双端及窗口仍待验证。

### 阻塞目标候选的连通区域（待批次验证）

路径：`src/world_path.cpp`、`tests/world_tests.cpp`；说明见[对象定义](entities.md)。阻塞目标的最近候选位于不可达区域时，搜索扩大后建立或复用通行区域，仅把与起点连通的候选作为最小距离边界；保留原路径节点预算及地形版本失效。Win32 Release 客户端及相关目标构建通过；`war3_world_tests <data-root> <clamp-fixture.json> world_` 31 通过、0 失败，覆盖 512×512 地图隔墙、区域复用和开墙失效；隐藏关 `secret-pathing` 1 通过、0 失败。日志 `tmp/docs-artifacts/war3/blocked-route-bounds/{world-final,campaign}.log`。独立进程的单场景三次耗时此前约 0.107–0.109 秒，修改后约 0.090–0.111 秒，样本不足以量化性能收益；高密度单位、大于区域预算的地图、动态阻挡及原版寻路仍待批次验证。

### 英雄经验提示格式（待批次验证）

路径：`src/game_commands.cpp`；说明见[英雄经验与成长](heroes.md)。经验条悬停使用原版 `%u / %u` 的数值格式，普通等级显示当前经验与下一等级阈值，满级显示当前经验与最高等级阈值。固定版 `Game.dll` 的界面格式调用及阈值上限只读指令记录在 `tmp/docs-artifacts/war3/hero-reference-render/original-xp-disassembly.txt`，未加载 Game.dll。Win32 Release 客户端构建通过；当前显示会话断开，D3D9 硬件及参考设备均未创建，未获得画面，日志 `tmp/docs-artifacts/war3/hero-reference-render/capture/client.log`。实际悬停、满级、自定义上限、排版与原版动态对照待批次验证。

### 攻击移动与巡逻的路径切换（本批验证）

路径：`src/session_combat.cpp`、`src/session_combat_orders.cpp`、`src/session_entities.cpp`、`src/session_orders.cpp`、`tests/order_queue_tests.cpp`；说明见[对象定义](entities.md)。攻击移动与巡逻保留原行程目标；关闭路径碰撞时恢复当前方向，追击敌人时保留追击并在目标失效后恢复行程，命令结束后清理目标。Win32 Release 客户端及测试目标编译通过；`war3_order_queue_tests <data-root> <BootyBay.w3m> combat-pathing-toggle` 1 通过、0 失败，覆盖攻击移动、巡逻往返方向及目标消失后恢复；日志 `tmp/docs-artifacts/war3/combat-pathing-toggle/test.log`。原版动态语义、复杂重入、多个目标和真实玩家操作仍待验证。

本批合并 `5149f71`、`e017533` 和本项：世界路径 `world_` 31 通过、0 失败；完整命令队列输出 32 条 PASS（含汇总）；隐藏关最后一波在人为持续恢复传送门生命后进入间章，1 通过、0 失败。日志 `tmp/docs-artifacts/war3/combat-pathing-batch/{world,order,wave}.log`。经验栏实际画面因当前会话 D3D9 设备创建失败而未取得，日志 `tmp/docs-artifacts/war3/combat-pathing-batch/capture/client.log`；原版画面对照、正常防守、双端、大地图性能和不同碰撞状态待验证。

### 移动中重新开启路径碰撞（待批次验证）

路径：`src/session_entities.cpp`、`tests/movement_avoidance_tests.cpp`；说明见[对象定义](entities.md)。单位移动中从关闭切换至开启路径碰撞时，活动路线进入现有分批重寻路和有界重试，不替换当前命令或排队命令。Win32 Release 客户端与测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay.w3m> reenable-pathing` 1 通过、0 失败，覆盖启用前直行、启用后绕墙、路径不穿越障碍及后续排队移动；原地形恢复检查与普通／攻击移动切换的定向检查通过。日志 `tmp/docs-artifacts/war3/reenable-pathing/{final,restored,queue,combat}.log`。大量同时切换、起点不可通行、暂时无路、追击动态目标、原版动态及真实窗口待批次验证。

### 失效单位暂停状态查询（待批次验证）

路径：`src/session_entities.cpp`、`tests/control_tests.cpp`；说明见[对象定义](entities.md)。`IsUnitPaused` 对空、已移除、错误类型及无效单位返回 false，有效单位读取实际暂停状态。固定版 Game.dll 注册入口 `0x6f1e8bc0` 的只读指令显示解析失败返回零，记录 `tmp/docs-artifacts/war3/unit-paused-handle/original.txt`；未加载 Game.dll。Win32 Release 客户端及测试目标编译通过；`war3_control_tests <data-root> <control-fixture.w3m> unit-state-handles` 1 通过、0 失败，覆盖失效句柄和有效单位暂停／恢复；日志 `tmp/docs-artifacts/war3/unit-paused-handle/final.log`。真实地图、原版动态行为与联机待批次验证。

### 失效单位与玩家的选择查询（本批验证）

路径：`src/session_collections.cpp`、`tests/control_tests.cpp`；说明见[对象定义](entities.md)。`IsUnitSelected` 对失效单位或玩家返回 false，有效单位继续使用玩家当前选择；固定版 Game.dll 注册入口 `0x6f1e8c40` 的只读指令记录于 `tmp/docs-artifacts/war3/selection-handle-batch/original.txt`。Win32 Release 客户端和测试目标编译通过；`war3_control_tests <data-root> <control-fixture.w3m> unit-state-handles` 1 通过、0 失败，覆盖空／错误类型／已移除／无效句柄及选择／取消选择，未加载 Game.dll。真实地图、原版动态行为和多人选择待验证。

本批合并 `934a859`、`f8f441e` 和本项：同一核心版本中，单位选择及暂停句柄检查、重新开启路径碰撞和攻击移动路径切换各 1 通过、0 失败；完整命令队列输出 32 条 PASS（含汇总），覆盖联机选择和排队命令。日志 `tmp/docs-artifacts/war3/selection-handle-batch/{control-final,movement,combat,order}.log`。原版寻路和选择动态语义、暂时无路、复杂重入、真实双端及窗口仍待验证。

### 人族隐藏关防御塔建造与攻击（验证补充）

路径：`tests/human_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release 测试目标编译通过；新建隔离用户目录运行 `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-build`，1 通过、0 失败。原图恢复控制后，通过玩家建造命令建造 `nbt1`，检查 100 金币实际扣费、施工完成及新塔向敌方单位发射弹道，模拟时间 138.812 秒；未加载 Game.dll，日志 `tmp/docs-artifacts/war3/human-secret-build/test.log`。测试未修改传送门生命或直接创建敌人；弹道命中伤害归因、其他塔、完整防守、原版动态和窗口待验证。本项为既有战役功能的验证补充，不计功能批次。

### 人族隐藏关防御塔伤害归因（验证补充）

路径：`tests/human_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release 编译通过；在新建隔离用户目录运行 `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-build`，1 通过、0 失败，未加载 Game.dll。原图玩家建造的 `nbt1` 完工后发射弹道，目标伤害事件的来源为该塔且伤害大于零，模拟时间 146.531 秒；未修改传送门生命或直接创建敌人。其他塔种、完整防守、原版动态和窗口待验证。本项为既有战役功能的验证补充，不计功能批次。

### 人族隐藏关其他防御塔（验证补充）

路径：`tests/human_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release 编译通过；新建独立用户目录分别运行 `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-build-net1` 和 `secret-build-nft1`，各 1 通过、0 失败，未加载 Game.dll。原图恢复控制并自然开放科技后，玩家命令建造新塔，验证实际扣费、完工、发射弹道以及来源为新塔的正数伤害。未直接生成敌人或修改传送门生命。其他塔种、完整防守、原版动态和窗口仍待验证。本项为既有战役功能的验证补充，不计功能批次。

### 人族隐藏关高级防御塔（验证补充）

路径：`tests/human_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。Win32 Release 编译通过；新建独立用户目录分别运行 `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-build-ndt1` 与 `secret-build-ntt1`，各 1 通过、0 失败，未加载 Game.dll。原图定时解锁后，验证玩家建造的塔扣费、完工、发射弹道及新塔造成正数伤害，模拟时间分别为 671.031 秒和 1036.19 秒；测试持续恢复传送门生命并将建造者设为无敌，未直接创建敌人。三种较早开放的塔回归各 1 通过。正常防守、完整波次、原版动态与窗口仍待验证。本项为既有战役功能的验证补充，不计功能批次。

### 无效单位状态编号（待批次验证）

路径：`src/session_entities.cpp`、`tests/control_tests.cpp`；说明见[对象定义](entities.md)。`GetUnitState` 对 0–3 以外的编号返回零，`SetUnitState` 忽略该设置，避免中断地图脚本；固定版 Game.dll 入口 `0x6f1e6600`、`0x6f1f7a80` 的只读指令位于 `tmp/docs-artifacts/war3/unit-state-range/original.txt`。Win32 Release 客户端和测试目标编译通过；使用独立用户目录运行 `war3_control_tests <data-root> <control-fixture.w3m> unit-state-handles`，1 通过、0 失败，覆盖有效生命／魔法值及无效编号与失效单位组合，未加载 Game.dll。实际地图、原版动态行为及联机仍待批次验证。

### 单位动画快照（待批次验证）

路径：`src/session.h`、`src/session_unit_visual.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SUAN` 保存并重建单位动画、播放时钟、队列与脚本属性，校验地图、时钟、句柄和数据后再应用。Win32 Release 客户端及 clock 测试编译通过，`war3_clock_tests <data-root> <output-root>` 33 通过、0 失败；OrcX01 150 秒隔离会话的 457 个活动单位动画快照往返一致，探针 `tmp/docs-artifacts/war3/unit-animation-snapshot/probe/`，未加载 Game.dll。朝向目标、模型混合历史、真实续播、完整世界恢复、存档菜单与原版格式仍待批次验证或实现。

### 单位注视目标快照（待批次验证）

路径：`src/session_unit_visual.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SUAN` 版本 2 保存注视骨骼、偏移及目标单位身份，包括已移除句柄；读取版本 1 并保留已有注视关系。Win32 Release 客户端和 clock 测试编译通过；隔离测试覆盖自身、活动及已移除目标、映射错误和旧版本读取，OrcX01 原图开场 29.75 秒的一条实际注视关系重建并往返一致，探针 `tmp/docs-artifacts/war3/unit-lookat-snapshot/probe/`。实际续播、窗口画面与完整存档仍待验证或实现。

本批合并 `96cfaf4`、`825eca3`、`fa0254a`：同一集成代码版本下，Win32 Release 客户端编译通过；`war3_clock_tests <data-root> <output-root>` 33 通过、0 失败，覆盖动画快照、旧版读取、注视目标映射及异常数据；`war3_control_tests <data-root> <control-fixture.w3m> unit-state-handles` 1 通过、0 失败。OrcX01 原图开场在 29.75 秒实际设置的注视关系完成恢复及快照往返，1 通过、0 失败；探针 `tmp/docs-artifacts/war3/unit-lookat-snapshot/probe/`。三项均未加载 Game.dll。原版动态行为、完整世界保存／加载、恢复后的动画续播和窗口表现仍未验证或实现。

### 单位定时转向快照（待批次验证）

路径：`src/session_unit_visual.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SUVS` 版本 2 保存进行中的转向起点、方向差、已用时间及总时长，继续读取版本 1；无效状态在应用前拒绝。Win32 Release 客户端及 clock 测试编译通过，`war3_clock_tests <data-root> <output-root>` 33 通过、0 失败；OrcX01 开场 12.9375 秒有一个实际定时转向，外观快照在 252 个活动单位重建后往返一致，探针 `tmp/docs-artifacts/war3/unit-facing-snapshot/probe/`，未加载 Game.dll。实际恢复后续转向、窗口画面和完整存档仍待验证或实现。

### 单位移动路线快照（待批次验证）

路径：`src/session_unit_movement.cpp`、`src/session.h`、`src/entities.h`、`src/session_entities.cpp`、`src/session_orders.cpp`、`src/world.h`、`src/world_path.cpp`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SMOV` 保存路线、目标、节点、订单编号、受阻观察与重寻路调度；恢复前核对地形及含重叠拥有者计数的占地指纹，并重映射单位和游标。Win32 Release 客户端及测试目标编译通过，clock 33 通过、0 失败，重新开启碰撞重寻路 1 通过、0 失败；OrcX01 原图 33.1875 秒的 5 个移动单位及 252 个活动单位的快照往返一致，探针 `tmp/docs-artifacts/war3/unit-movement-snapshot/probe/`，未加载 Game.dll。路线恢复后续行、动态障碍、其他命令与完整世界存档仍待批次验证或实现。

### 玩家排队命令快照（本批验证）

路径：`src/session_order_snapshot.cpp`、`src/session.h`、`src/session_item_snapshot.cpp`、`src/session_destructable_snapshot.cpp`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SPQO` 保存排队顺序和命令参数，重建并核对单位、物品、可破坏物及其已移除句柄；错误映射拒绝且不改变队列。Win32 Release 客户端和 clock 测试目标编译通过，clock 33 通过、0 失败；OrcX01 原图玩家移动及排队移动的队列重建往返一致，探针 `tmp/docs-artifacts/war3/queued-orders-snapshot/probe/`，未加载 Game.dll。恢复后实际续执行、其他活动订单与完整存档仍待批次验证或实现。

本批合并 `c96456a`、`1a11183`、`d847fbf`：同一集成代码版本下，Win32 Release 客户端及相关测试目标编译通过；`war3_clock_tests <data-root> <output-root>` 33 通过、0 失败，覆盖定时转向、移动路线、重寻路调度和排队命令快照；完整 `war3_order_queue_tests <data-root> <BootyBay.w3m>` 输出 32 条 PASS，进程退出码 0；`war3_movement_avoidance_tests <data-root> <BootyBay.w3m> reenable-pathing` 1 通过、0 失败。OrcX01 原图隔离会话中，脚本定时转向、5 个移动单位以及玩家排队移动分别完成快照往返；原图探针位于 `tmp/docs-artifacts/war3/{unit-facing-snapshot,unit-movement-snapshot,queued-orders-snapshot}/probe/`，批次输出位于 `tmp/docs-artifacts/war3/movement-queue-batch/`。未加载 Game.dll。完整世界恢复、加载后续执行、动态障碍、原版行为及实际窗口仍待验证或实现。

### 单位战斗订单快照（待批次验证）

路径：`src/session_combat_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCBO` 保存战斗目标、巡逻、物品移动、守卫字段、攻击前摇及索敌节拍，并核对重建后的单位、物品与可破坏物身份。Win32 Release 客户端及 clock 目标编译通过，clock 33 通过、0 失败；OrcX01 原图 34.9375 秒的一个攻击前摇及 252 个活动单位的战斗订单快照重建后往返一致，探针 `tmp/docs-artifacts/war3/unit-combat-snapshot/probe/`，未加载 Game.dll。弹道、增益和 AI 守卫调度、恢复后实际攻击及完整存档仍待批次验证或实现。

### 攻击弹道快照（待批次验证）

路径：`src/session_projectile_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SPRJ` 保存普通与视觉回程攻击弹道、发射时武器和被动定义、飞行状态及目标历史，并核对重建后的活动与失效句柄。Win32 Release 客户端及 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 34 通过、0 失败，覆盖毒性被动、移除单位、错误映射及损坏拒绝。OrcX01 原图 35.5625 秒的一枚攻击弹道快照重建后往返一致；探针 `tmp/docs-artifacts/war3/attack-projectile-snapshot/probe/`，未加载 Game.dll。法术弹道、蜘蛛附件效果和事件、完整世界及读档尚未完成；恢复后续飞行与命中、视觉回程续播、弹跳、反射、物品／可破坏物目标和窗口待批次验证或实现。

蜘蛛回程验证补充：`tests/clock_tests.cpp` 在隔离会话中让穴居恶魔实际发射并等待蜘蛛视觉回程，再重建单位身份和核心状态、恢复弹道并核对完整快照往返；Win32 Release clock 34 通过、0 失败，未加载 Game.dll。该验证不包含恢复后的实际续播或蜘蛛附件及事件恢复，不单独计入功能批次。

### 法术弹道快照（待批次验证）

路径：`src/session_spell_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SSMS` 保存法术弹道完整发射参数、飞行状态、目标历史及共享法术调度编号，并校验重建的单位身份。Win32 Release 客户端及 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 35 通过、0 失败，覆盖实际风暴之锤弹道、移除施法者及目标、错误映射、损坏拒绝与快照往返，未加载 Game.dll。其他法术状态及共享编号整合、闪电和视觉效果、完整世界和读档尚未完成；链式目标、原图、恢复后的飞行与命中、窗口及原版行为待批次验证或实现。

### 战斗与弹道快照批次（2026-11-01）

本批合并 `c095d52`、`4baff9b`、`c397a9f` 及测试补充 `e9e44ea`：同一集成代码版本下，Win32 Release 客户端、clock、passive 和 caster 目标编译通过；`war3_clock_tests <data-root> <output-root>` 35 通过、0 失败；`war3_passive_tests <data-root> <passive-fixture> spider-attack` 1/1、`line-weapon` 4/4；`war3_caster_tests <data-root> <caster-fixture> chain-targets` 4/4，均未加载 Game.dll。首次连锁闪电测试误用了旧目标夹具，因缺少自定义能力失败；使用当前 `generate-caster-fixture.py` 在 `tmp/docs-artifacts/war3/combat-snapshot-batch/` 生成夹具后通过。上述技能专项验证现有战斗行为，不代表快照恢复后续执行通过。共享法术调度编号与其他法术状态整合、链式和多目标快照、完整世界恢复、真实读档、实际命中与窗口仍待验证或实现。

### 技能句柄身份重建（待批次验证）

路径：`src/session_ability_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SABI` 重建活动和失效技能句柄、所属单位及技能索引，供脚本和后续施法状态恢复映射。Win32 Release 客户端和 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 36 通过、0 失败，覆盖真实施法事件、施法者移除、脚本全局引用、错误单位映射、损坏拒绝和快照往返，未加载 Game.dll。技能移除／重新添加和工程升级、物品技能、原图、脚本事件续执行、活动施法及完整读档仍待批次验证或实现。

### 特效对象快照（待批次验证）

路径：`src/session_effect_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SEFX` 重建特效及活动／失效句柄，保存附着目标、外观和退场时钟。Win32 Release 客户端与 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 37 通过、0 失败，覆盖活动特效、退场中与退场结束句柄、移除的附着单位、脚本全局引用、外观字段、错误映射和损坏拒绝，未加载 Game.dll。物品／可破坏物挂点、自动特效、其他状态引用与生命周期续执行、原图模型实例、粒子和窗口，以及完整读档仍待批次验证或实现。

### 闪电对象快照（待批次验证）

路径：`src/session_lightning_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SLGT` 重建闪电的活动／失效句柄、源参数、跟随单位和生命周期。Win32 Release 客户端及 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 38 通过、0 失败，覆盖真实连锁闪电跟随、移除目标、脚本颜色与销毁、全局引用、错误映射、损坏拒绝和快照往返；表面及高度字段使用测试设置，未加载 Game.dll。恢复后跟随／到期、其他状态引用、原图、模型与窗口及完整读档仍待批次验证或实现。

### 施法句柄与视觉对象快照批次（2026-11-01）

本批合并 `2caa394`、`7cd145e`、`31e24b8`：同一集成代码版本下，Win32 Release 客户端、clock、spell 和 effects 目标编译通过；`war3_clock_tests <data-root> <output-root>` 38 通过、0 失败；使用当前脚本生成的隔离夹具运行 `war3_spell_tests <data-root> <fixture>` 输出 PASS；`war3_effects_tests <data-root> <log> --ribbons` 输出 PASS，读取 3 个模型、4 种闪电数据／纹理及 2 组地形高度夹具。均未加载 Game.dll，批次夹具及日志位于 `tmp/docs-artifacts/war3/visual-identity-batch/`。技能和资源检查仅验证既有消费者；活动施法及其他系统引用的重建、恢复后的实际运行和窗口／GPU、模型粒子历史、完整读档仍待验证或实现。

### 活动施法订单快照（待批次验证）

路径：`src/session_cast_snapshot.cpp`、`src/spell_snapshot_codec.h`、`src/session_spell_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCST` 保存施法阶段、完整技能参数、句柄、持续标记、战斗恢复订单和荒芜地道具预留。Win32 Release 客户端与 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 39 通过、0 失败，覆盖真实风暴之锤前摇及构造的特效、闪电、标记、恢复订单、错误映射和损坏拒绝，未加载 Game.dll。持续施法／自动施法真实路径、预留与增长状态、增益和其他技能系统、原图、恢复后续执行、窗口及完整读档待批次验证或实现。

### 单位持续效果快照（待批次验证）

路径：`src/session_buff_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SBUF` 保存单位增益／减益、关联句柄、毒伤和持续施法来源、变形外观以及灵魂锁链／闪电护盾索引。Win32 Release 客户端和 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 40 通过、0 失败，覆盖真实闪电护盾和灵魂锁链、快照往返、错误映射／损坏拒绝及恢复后的直接伤害分摊，未加载 Game.dll。毒伤、变形、持续施法、失效来源、效果到期／移除、原图、窗口、其他单位状态和完整读档仍待批次验证或实现；共享法术调度编号由法术弹道组件恢复。

### 单位光环快照（待批次验证）

路径：`src/session_aura_snapshot.cpp`、`src/passive_snapshot_codec.h`、`src/session_projectile_snapshot.cpp`、`src/session.h`、`CMakeLists.txt`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SAUR` 保存光环成员、定义摘要、加成、发射／接收特效、尖刺外观和刷新节拍。Win32 Release 客户端与 clock 目标编译通过；`war3_clock_tests <data-root> <output-root>` 41 通过、0 失败，覆盖真实专注及耐久光环、已移除来源、护甲与移动加成、定义／映射错误和损坏拒绝，未加载 Game.dll。到期／刷新、其他光环和地图覆盖、其余状态整合、原图、窗口及完整读档仍待批次验证或实现。

### 施法、持续效果与光环快照批次（2026-11-01，存在失败项）

本批范围 `bcee799`、`aa64f1b`、`c24fd55`：同一集成代码版本下 Win32 Release 客户端、clock、passive、caster 和 channel 目标编译通过；`war3_clock_tests <data-root> <output-root>` 41 通过、0 失败；`war3_passive_tests <data-root> <passive-fixture>` 和 `war3_channel_tests <data-root> <channel-fixture>` 各输出 PASS；`war3_caster_tests <data-root> <caster-fixture> targets` 6/6。夹具由当前生成脚本写入 `tmp/docs-artifacts/war3/cast-buff-aura-batch/`，测试未加载 Game.dll。

失败项保留：完整 `war3_caster_tests <data-root> <caster-fixture>` 报 `Full curse did not cancel real weapon hits`，退出码 1。诊断显示夹具 `A0CS` 预期概率为 1，读取的实际技能概率仍为 0.33；原版 `AbilityMetaData.slk` 对应 ID 文本为三字符 `Crs`，当前加载器只收录四字符元数据 ID。尚未确认原版地图对该字段使用的四字节编号或原版处理方式，不能将失败归因于概率计算或声称完整法师测试通过。后续核实字段后修复并重跑该失败项及受影响范围。持续施法、状态到期／光环刷新、真实读档及窗口仍待验证或实现。

诅咒失败项修复补充：`src/object_data.cpp`、`tests/generate-caster-fixture.py`、`tests/caster_tests.cpp`；细节见[施法单位技能](caster-spells.md)。当元数据只有三字符 `Crs` 时兼容四字节 `Crs1`，显式 `Crs1` 优先。Win32 Release 客户端和 caster 目标编译通过；新夹具 `tmp/docs-artifacts/war3/curse-metadata/caster.w3m` 上完整 `war3_caster_tests <data-root> <fixture>` 输出 PASS、退出码 0，目标筛选 6/6；核对原诅咒 0.33、自定义概率 1.0 及实际攻击落空，未加载 Game.dll。上批对应失败项已重测通过；经典版编辑器的实际输出、多等级和原版运行行为仍待验证。本项为该批失败修复，不另计功能批次。

### 灵魂链接符文拾取（待批次验证）

路径：`src/consumables.h`、`src/session.h`、`src/session_consumables.cpp`、`src/session_item_use.cpp`、`src/session_unit_casters.cpp`、`tests/spell_tests.cpp`；说明见[施法单位技能](unit-casters.md)。`rspl` 拾取后按 `Aspp` 以拾取者为中心选取符合条件的单位，建立灵魂链接并沿用符文消耗和技能事件。Win32 Release 客户端及相关测试目标编译通过；`war3_spell_tests <data-root> <fixture> spirit-rune` 1 通过、0 失败，覆盖脚本和玩家拾取、机械拾取者、范围两侧友军、敌方／远处过滤、事件、伤害分摊与到期；受影响的 `shield-rune` 1/1 和 `war3_clock_tests <data-root> <output-root>` 41/41 通过，未加载 Game.dll。数量上限、范围边界、地图覆盖、回调重入、多人、原版时序和窗口待批次验证。

### 无能力任务 powerup 拾取（待批次验证）

路径：`src/session_inventory.cpp`、`tests/orc_campaign_chain_tests.cpp`；说明见[战役流程](campaign-flow.md)。无能力 powerup 在拾取事件后移除，支持原版非易耗任务采集物。Win32 Release 客户端与相关测试目标编译通过；`war3_orc_campaign_chain_tests <data-root> quest-powerup <new-user-dir>` 在 `OrcX01_05` 原脚本下 1 通过、0 失败，手动创建单位和物品，检查闪光草脚本拾取、蛋的玩家命令、原任务计数及重复拾取；灵魂链接符文和力量之书回归各 1/1，未加载 Game.dll。完整任务、商店物品、重入、原版时序及窗口待批次验证。

### 商店出售自动消费物品（待批次验证）

路径：`src/session.h`、`src/session_commerce.cpp`、`src/session_inventory.cpp`、`src/session_item_use.cpp`、`src/session_consumables.cpp`、`src/session_wards_roar.cpp`、`tests/orc_campaign_chain_tests.cpp`；说明见[商店](commerce.md)和[战役流程](campaign-flow.md)。交易中的自动消费物品保留到出售事件结束，避免已消费物品再次拾取或使用；脚本显式移除仍即时生效。Win32 Release 客户端及专项目标编译通过；`war3_orc_campaign_chain_tests <data-root> quest-shop <new-user-dir>` 在原版 `OrcX01` 中 1 通过、0 失败，人工创建买家、补足金币、添加库存并解除商店暂停，检查原出售触发器、库存及最终消费；完整任务、出售／拾取的原版时序、回调中显式移除／单位销毁、其他可消费物品和窗口仍待批次验证。

### 符文、任务物品与商店批次（2026-11-01）

本批为 `f53bbe4`、`b1fa68a`、`18eeceb`。同一集成源码的 Win32 Release 客户端及相关测试目标编译通过；隔离用户目录下，原图 `quest-shop`、`quest-powerup` 各 1/1，`shop-buyer` 1/1、`shop-range` 7/7、`spirit-rune` 1/1、`shield-rune` 1/1、`powerup` 1/1，均报告未加载 Game.dll；`war3_clock_tests` 41 通过、0 失败。商店夹具路径 `tmp/docs-artifacts/war3/shop-range/fixture.w3m`，符文夹具 `tmp/docs-artifacts/war3/visual-identity-batch/spell-fixture.w3m`，任务物品夹具与隔离目录在 `tmp/docs-artifacts/war3/quest-powerups/`。原图测试有人工创建单位、放置物品、补足金币、添加库存及解除商店暂停等干预。完整战役和窗口、原版时序、脚本回调中显式移除物品／买家／商店、其他自动消费物品及联机仍待验证。

商店批次补充验证：Win32 Release `war3_passive_tests <data-root> tmp/docs-artifacts/war3/shop-consumed/fixture.w3m shop-consumed` 1 通过、0 失败，覆盖购买符文和普通物品及拾取／出售回调销毁、重复拾取；同一生成夹具的 `shop-buyer` 1/1、`shop-range` 7/7，未加载 Game.dll。原版动态时序、其他消耗品及实际窗口仍待对照。此项是已有功能验证补充，不计新功能批次。

Strange Brew 原图补充验证：Win32 Release `war3_orc_campaign_chain_tests <data-root> quest-shop <new-user-dir>` 1 通过、0 失败，未加载 Game.dll。测试等待开场结束，人工触发任务发现、创建买家和两种材料、补充金币及库存、解除商店暂停并移动雷克萨；验证酒桶出售／拾取、三项排队更新、任务完成、陈加入及三件初始物品、过场结束后恢复控制。隔离目录 `tmp/docs-artifacts/war3/quest-powerups/shop-quest-1101g/`；自然探索、材料生成、战斗和真实窗口未覆盖。为既有功能补充验证，不计新功能批次。

Strange Brew 原图自然脚本路径补充：`war3_orc_campaign_chain_tests <data-root> quest-shop <new-user-dir>` 1 通过、0 失败，未加载 Game.dll。雷克萨进入陈的触发区域后由原版过场发现任务并生成商店库存、雷霆花和雷霆凤凰；玩家攻击击败凤凰后死亡事件生成蛋，购买酒桶和拾取材料通过玩家命令，随后原脚本完成任务并招募陈。测试直接移动英雄、增加金币、将凤凰设为低生命并使雷克萨无敌，未覆盖自然寻路、完整战斗、窗口画面及原版动态对照。隔离目录 `tmp/docs-artifacts/war3/quest-powerups/shop-natural-1101c/`。此项为既有功能验证补充，不计新功能批次。

### 玩家结算统计快照（待批次验证）

路径：`src/session.h`、`src/session_game.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`PSTS` 编码各玩家统计和单位类型计数，校验摘要、版本、范围及重复键后事务性恢复。Win32 Release 核心和 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 42 通过、0 失败，覆盖真实拾取／击杀、往返、损坏／截断及伪造计数拒绝，未加载 Game.dll。批次验证多玩家资源和生产、恢复后继续模拟与结算、跨组件恢复顺序；英雄摘要、胜负状态、完整保存／载入和原版格式仍未实现。产物 `tmp/docs-artifacts/war3/statistics-snapshot/output-02/`。

### 玩家配置与外交快照（待批次验证）

路径：`src/session.h`、`src/session_game.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`PCFG` 保存玩家配置、双向联盟和税率，创建单位前校验并事务性恢复。Win32 Release 核心和 clock 目标编译通过，`war3_clock_tests <data-root> <output-root>` 43 通过、0 失败；隔离脚本覆盖联盟、税率、名称、让分及恢复后的单位生命，损坏摘要、不同本地玩家和无效队伍被拒绝，未加载 Game.dll。批次验证原图联盟、共享控制／视野和地图身份、跨组件恢复顺序与继续对局；完整保存／载入和原版格式仍未实现。产物 `tmp/docs-artifacts/war3/player-config-snapshot/output-02/`。

### 迷雾与修改器快照（待批次验证）

路径：`src/fog_grid.h`、`src/session.h`、`src/session_fog.cpp`、`tests/clock_tests.cpp`、`tests/orc_campaign_chain_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SFOG` 保存探索／可见格、开关、节拍与迷雾修改器身份；检查地图、时钟和数据后重建。Win32 Release 核心、clock 和兽族战役测试目标编译通过；clock 44 通过、0 失败；隔离原版 `OrcX01` 150 秒玩家配置／统计／迷雾组合快照往返 1/1，均未加载 Game.dll。批次验证相关玩家和单位状态组合、自然对局续行、共享视野、不同地图与缓存失效；临时显形和哨兵状态、完整跨区、原版存档和窗口仍未验证或实现。产物 `tmp/docs-artifacts/war3/fog-state-snapshot/`。

### 玩家统计、外交与迷雾快照批次（2026-11-01）

本批范围 `4e826b0`、`513343e`、`988f9c1`。同一集成源码的 Win32 Release 客户端、clock、兽族战役、passive、visibility 和 commerce 目标编译通过。复用该源码上已完成的 clock 44/44 与原版 OrcX01 150 秒玩家配置／统计／迷雾组合快照 1/1；合批执行视野加成、隐身和侦测事件各 1/1，原版 Strange Brew 任务 1/1，commerce 消费者输出 PASS。除 commerce 程序仅输出 PASS 外，其余检查报告未加载 Game.dll。新增批次日志位于 `tmp/docs-artifacts/war3/player-fog-batch/`；快照夹具与隔离目录见 `tmp/docs-artifacts/war3/fog-state-snapshot/`。

原图快照检查只重建模拟时钟、玩家配置、统计与迷雾，未恢复单位、脚本全局、计时器或继续模拟；任务检查直接移动英雄、补充金币、降低凤凰生命并使英雄无敌。跨组件完整恢复、临时显形和哨兵、真实跨区／存档、原版格式、窗口和大地图性能仍待验证或实现。

### 会话内 gamecache 快照（待批次验证）

路径：`src/session.h`、`src/session_cache.cpp`、`tests/clock_tests.cpp`、`tests/orc_campaign_chain_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCAC` 保存未写盘的缓存对象、内容和脚本句柄；复用现有版本 8 编码，不写入用户缓存文件，存在待同步动作时拒绝采集。Win32 Release 核心和测试目标编译通过；clock 45/45，原版 OrcX01 玩家配置／统计／迷雾／gamecache 隔离往返 1/1，磁盘 gamecache v1–v8 保存／加载回归输出 PASS。原图检查人工加入一项缓存值，未重建完整脚本全局或续行。批次验证跨组件句柄映射、同步队列时序、缓存读写与多区域切换；完整存档、原版格式及窗口仍未实现或验收。产物 `tmp/docs-artifacts/war3/gamecache-snapshot/`。

### 脚本哈希表快照（待批次验证）

路径：`src/session.h`、`src/session_hashtable.cpp`、`tests/clock_tests.cpp`、`tests/dota_heroes_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SHTB` 保存哈希表基本值和句柄，并通过两阶段恢复循环引用；检查地图、时钟、脚本摘要、映射及数量。Win32 Release 核心和测试目标编译通过；clock 46/46；DotA 原图开局两张表的隔离重建 1/1，手动重建一个被引用单位，未加载 Game.dll。批次验证其他句柄类型、映射和对象生命周期、完整全局恢复及继续对局；真实存档／载入、跨区、原版格式和窗口仍待实现或验收。产物 `tmp/docs-artifacts/war3/hashtable-snapshot/`。

### 已销毁定时器身份（待批次验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`、`tests/orc_campaign_chain_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`STMR` 版本 2 保留已销毁定时器句柄，活动定时器按原次序恢复，继续读取版本 1。Win32 Release 核心及测试目标编译通过；clock 47/47，原版 OrcX01 的定时器身份往返 1/1，未加载 Game.dll。原图组合探针越过失效定时器后仍因布尔表达式引用无法完成；批次验证脚本对象组合、定时器事件和缓存／哈希表回归，完整世界续行、跨区、原版格式和窗口仍待实现或验收。产物 `tmp/docs-artifacts/war3/timer-retired-snapshot/`、`tmp/docs-artifacts/war3/orcx-restore-audit/`。

### gamecache、哈希表与定时器身份批次（2026-11-01，存在失败项）

本批范围 `c3e1a969e`、`6377ca9`、`790440d`。同一集成源码的 Win32 Release 客户端、clock、兽族战役、DotA 和 game-flow 目标编译通过；复用该源码上 clock 47/47 与 OrcX01 定时器身份 1/1，合批执行 OrcX01 玩家／缓存／迷雾快照 1/1、DotA 两张哈希表快照 1/1，以及 gamecache 磁盘版本兼容、同步与分片边界三个消费者，均通过并检查未加载 Game.dll。game-flow 编译出现既有测试代码的 C4389 有符号比较警告。日志 `tmp/docs-artifacts/war3/cache-table-timer-batch/`。

失败项保留：OrcX01 模拟 150 秒的组合恢复探针重建现有世界、单位、缓存、迷雾、脚本对象和事件后，已越过已销毁定时器身份；恢复脚本全局时仍缺少 `boolexpr` 句柄并失败，日志 `tmp/docs-artifacts/war3/orcx-restore-audit/audit-03.log`。该探针未完成全局恢复或继续模拟，不能视为完整存档或跨区通过。完整对象状态、布尔表达式身份、实际保存／载入、原版格式、窗口及性能仍待实现或验证。


### 独立布尔表达式身份（待批次验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SBOO` 保存活动／已销毁句柄和共享表达式图，校验地图、时钟、脚本、回调及图结构后重建；调用方需恢复全局等引用。Win32 Release 核心和 clock 目标编译通过；clock 48 通过、0 失败，覆盖组合求值、全局和失效句柄、损坏及循环拒绝。OrcX01 原图模拟 150 秒组合探针越过布尔表达式，在全局 `location` 句柄处失败；日志 `tmp/docs-artifacts/war3/boolean-snapshot-clock-02.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-04.log`。批次验证其他表达式／事件组合、原图全局映射与续行；完整对象图、实际保存／载入、跨区、原版格式及窗口仍待实现或验收。


### 已销毁集合对象身份（待批次验证）

路径：`src/session.h`、`src/session_collections.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCOL` 版本 3 保留五类集合对象的失效句柄，继续读取版本 1／2。Win32 Release 核心及 clock 目标编译通过，clock 49 通过、0 失败，覆盖全局重映射、活动状态往返、旧版本和异常数据拒绝。OrcX01 原图模拟 150 秒的组合探针完成现有组件、脚本全局及睡眠线程重建；未继续模拟或验证全部状态。日志 `tmp/docs-artifacts/war3/collection-retired-clock-02.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-05.log`。批次验证不同集合生命周期、区域事件及恢复后续行；实际保存／载入、跨区、原版格式和窗口仍待实现或验收。


### 商店库存快照（待批次验证）

路径：`src/session.h`、`src/session_commerce.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SSHP` 保存单位库存、补货时间、槽位和全局规则，完成单位核心恢复后校验并恢复。Win32 Release 核心和 clock 目标编译通过，clock 50 通过、0 失败；OrcX01 模拟 150 秒组合探针的 45 个已有组件重编码一致，此前直接比较的一个商店库存差异已消除。日志 `tmp/docs-artifacts/war3/shop-stock-clock-01.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-09.log`。批次验证商店、集合及布尔表达式消费者与原图组合；补货续行、完整对象状态、实际保存／载入、跨区与窗口仍待实现或验证。


### 布尔表达式、集合与商店库存批次（2026-11-01）

本批范围 `6e31c21`、`bac6d6c`、`3c41b3c`。同一集成源码的 Win32 Release 客户端及 clock、passive、commerce、兽族战役测试目标编译通过。复用该源码的 clock 50/50 和 OrcX01 150 秒组合恢复 45 项组件重编码一致；合批执行 `shop-range` 7/7、`shop-consumed` 1/1、原图 `quest-shop` 1/1，均报告未加载 Game.dll；commerce 消费者输出 PASS。日志与隔离目录 `tmp/docs-artifacts/war3/boolean-collection-stock-batch/`，组合探针 `tmp/docs-artifacts/war3/orcx-restore-audit/audit-09.log`。原图任务检查包含直接移动英雄、补充金币、降低凤凰生命和使英雄无敌。

组合探针未继续模拟或证明快照覆盖全部状态；恢复后补货、真实保存／载入、跨区、原版格式、自然战斗及窗口仍待实现或验收。


### 召唤与限时生命快照（待批次验证）

路径：`src/session.h`、`src/session_illusion.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SUMM` 保存限时生命、召唤者及幻象来源、伤害倍率和相关标记；单位核心恢复后校验并应用。Win32 Release 核心与 clock 目标编译通过；clock 51 通过、0 失败，覆盖已移除来源、计时／暂停、倍率、非法计时和错误映射。OrcX01 模拟 150 秒组合探针 46 个现有组件重编码一致，但没有活动限时生命；日志 `tmp/docs-artifacts/war3/summon-snapshot-clock-02.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-10.log`。批次验证召唤／幻象消费者与原图其他时点；恢复后过期、专项技能状态、实际存档和续行仍待实现或验收。


### 生产队列与集结状态快照（待批次验证）

路径：`src/session.h`、`src/session_production.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SPRD` 保存生产队列、费用和人口预留、进度、编号、集结及复活／献祭引用；调用方先恢复玩家、单位和可破坏物身份。Win32 Release 核心及 clock 目标编译通过，clock 52 通过、0 失败，覆盖真实训练队列、集结、恢复后取消退款与非法映射。OrcX01 模拟 150 秒组合探针的 47 个现有组件重编码一致，该时点没有活动队列；日志 `tmp/docs-artifacts/war3/production-snapshot-clock-02.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-11.log`。批次验证训练、研究、复活及献祭消费者；恢复后生产完成、建筑施工、完整存档和续行仍待实现或验收。


### 运输载员状态快照（待批次验证）

路径：`src/session.h`、`src/session_transport.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCGO` 保存载员关联、卸载订单、工作恢复信息和吞噬计时，在相关对象重建后校验恢复。Win32 Release 核心及 clock 目标编译通过；clock 53 通过、0 失败，覆盖实际登船、恢复后卸载及人工设置的卸载／工作／吞噬字段往返。OrcX01 模拟 150 秒组合探针的 48 个现有组件重编码一致，该时点无载员；日志 `tmp/docs-artifacts/war3/cargo-snapshot-clock-02.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-12.log`。批次验证运输、召唤与生产消费者；吞噬、尸体运输、工作恢复、实际存档与续行仍待实现或验收。


### 召唤、生产与运输状态批次（2026-11-01）

本批范围 `7b7ee24`、`8fd6555`、`5405113`。同一集成源码的 Win32 Release 客户端及 clock、transport、revival、commerce 目标编译通过；复用该版本 clock 53/53 和 OrcX01 150 秒组合探针的 48 个组件重编码一致。合批执行运输 `flow`、`orders`、`lifecycle` 各 1/1，英雄复活 4/4，commerce 训练、库存及幻象消费者输出 PASS；均检查未加载 Game.dll。日志与隔离目录 `tmp/docs-artifacts/war3/summon-production-cargo-batch/`，组合探针 `tmp/docs-artifacts/war3/orcx-restore-audit/audit-12.log`。

运输及复活消费者测试运行普通会话；clock 测试单独覆盖恢复后卸载和队列取消，尚未验证完整世界恢复后的连续模拟、生产完成、限时生命过期及吞噬／尸体运输。原图探针时点没有活动限时生命、生产队列或载员；完整状态、实际存档、跨区和窗口仍待实现或验收。


### 采集与矿体关联快照（待批次验证）

路径：`src/session.h`、`src/session_harvest.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SHAR` 保存采集阶段、携带资源、目标、计时和矿体关联，相关身份与单位核心恢复后应用。Win32 Release 核心及 clock 目标编译通过，clock 55 通过、0 失败，覆盖实际矿内工人、缠绕矿共享资源、错误映射和恢复后移除工人。OrcX01 模拟 150 秒组合探针的 49 个现有组件重编码一致，该时点无携带资源的工人；日志 `tmp/docs-artifacts/war3/harvest-snapshot-clock-03.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-13.log`。批次验证采矿、伐木和缠绕矿消费者；恢复后采集续行、建筑施工、完整存档与跨区仍待实现或验收。


### 施工、升级与修理快照（待批次验证）

路径：`src/session.h`、`src/session_construction.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCON` 保存施工、升级、工人占用、修理及反召唤状态，要求先恢复 `SPRD` 编号。Win32 Release 核心及 clock 目标编译通过，clock 56 通过、0 失败，覆盖真实施工、升级、修理、恢复后取消退款及错误映射。OrcX01 模拟 150 秒组合探针 50 个现有组件重编码一致，该时点无活动施工；日志 `tmp/docs-artifacts/war3/construction-snapshot-clock-02.log`、`tmp/docs-artifacts/war3/orcx-restore-audit/audit-14.log`。批次验证施工、采集和修理消费者；反召唤、恢复后持续施工、实际存档和跨区仍待实现或验收。


### 尸体与衰变状态快照（待批次验证）

路径：`src/session.h`、`src/session_corpses.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCOR` 保存尸体衰变、占用与索引，以及掘尸／墓地状态。Win32 Release 核心及 clock 目标编译通过，clock 57 通过、0 失败；原图 150 秒隔离重建后临时绕过启动保护，推进一帧的 51 个组件重编码一致。推进一秒按新建对象顺序映射后，移动调度和特效状态仍有两项差异；日志 `tmp/docs-artifacts/war3/corpse-snapshot-clock-01.log`、`tmp/docs-artifacts/war3/orcx-continuation-audit/audit-03.log`、`audit-06.log`。批次验证尸体、采集及施工消费者；完整恢复、续行、实际存档和跨区仍待实现或验收。


### 采集、施工与尸体状态批次（2026-11-01，存在差异项）

本批范围 `acdcd33`、`77667e9`、`d33bc54`。同一集成源码的 Win32 Release 客户端及 clock、harvest、construction、corpse、destructable 目标编译通过；复用 clock 57/57。合批执行采矿、备用投递路线、施工和伐木消费者，均输出 PASS；尸体 `decay`、`flow` 各 1/1。日志与隔离目录 `tmp/docs-artifacts/war3/harvest-construction-corpse-batch/`。这些消费者运行普通会话，不能证明完整读档续行。

原版 OrcX01 150 秒隔离恢复诊断在临时副本绕过启动保护后，推进一帧的 51 个现有组件重编码一致；推进一秒时，两侧新建 59 个同序同类型对象，按创建次序映射后移动调度及特效状态仍有差异，保留为失败项，日志 `tmp/docs-artifacts/war3/orcx-continuation-audit/audit-06.log`。诊断未证明全部状态完整；实际存档、长时间续行、跨区和窗口仍待实现或验收。


### 常驻被动技能计时快照（待批次验证）

路径：`src/session.h`、`src/session_ambient_passives.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SAMB` 保存被动技能计时、活动中心与特效引用。Win32 Release 核心及 clock 目标编译通过，clock 58 通过、0 失败；隔离恢复后的原版一秒诊断中，特效时间差消失，新建单位移动调度相位仍不同。日志 `tmp/docs-artifacts/war3/ambient-snapshot-clock-03.log`、`tmp/docs-artifacts/war3/orcx-continuation-audit/audit-08.log`。批次验证常驻伤害与徘徊消费者；完整读档续行、长时间对局和跨区仍待实现或验收。


### 新单位移动调度相位恢复（待批次验证）

路径：`src/session.h`、`src/session_entities.cpp`、`src/session_unit_movement.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SMPS` 在其他对象重建完成后校准未来单位的路线重试相位。Win32 Release 核心与 clock 目标编译通过，clock 59 通过、0 失败。OrcX01 150 秒隔离恢复诊断临时绕过启动保护后，按创建次序映射新对象，推进一秒及五秒的 53 个现有组件均重编码一致；日志 `tmp/docs-artifacts/war3/future-movement-phase-clock-02.log`、`tmp/docs-artifacts/war3/orcx-continuation-audit/audit-09.log`、`audit-10.log`。批次验证路径与常驻技能消费者；完整句柄语义、长时间恢复、实际存档与跨区仍待实现或验收。


### 单位隐身、睡眠与小地图标记快照（待批次验证）

路径：`src/session.h`、`src/session_stealth_reveal.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SHID` 保存永久隐身计时、影遁／自然睡眠和小地图替代图标标记。Win32 Release 核心及 clock 目标编译通过，clock 60 通过、0 失败；原版隔离恢复后临时绕过启动保护推进 60 秒，54 个现有组件重编码一致，隐身计时及替代图标直接比较差异消失，1 个单位选中状态仍不同。日志 `tmp/docs-artifacts/war3/unit-stealth-snapshot-clock-01.log`、`tmp/docs-artifacts/war3/orcx-continuation-audit/audit-14.log`。批次验证隐身、路径调度和常驻技能消费者；选中状态、完整读档、视野来源、窗口与跨区仍待实现或验收。


### 常驻被动、移动相位与隐身状态批次（2026-11-01）

本批范围 `7b65132`、`07942f5`、`cdec3e4`。同一集成源码的 Win32 Release 客户端及 clock、visibility、stealth、passive、control、movement-avoidance 目标编译通过；复用 clock 60/60。合批执行永久隐身、侦测事件、影遁、游荡和永久献祭各 1/1，均报告未加载 Game.dll；BootyBay 原图 `restored-path` 输出 PASS。日志与隔离目录 `tmp/docs-artifacts/war3/ambient-phase-stealth-batch/`。首次构建命令使用了不存在的 `war3_movement_tests` 目标，已改用 `war3_movement_avoidance_tests` 并成功编译和执行。

上述消费者运行普通会话；OrcX01 隔离诊断在临时副本绕过保护后推进 60 秒，按新建对象顺序映射，54 个现有组件一致，但直接比较仍发现 1 个单位选中状态不同，日志 `tmp/docs-artifacts/war3/orcx-continuation-audit/audit-14.log`。完整对象状态、实际存档、长时间恢复、窗口与跨区仍待实现或验收。


### 单位选中与选择控制快照（待批次验证）

路径：`src/session.h`、`src/session_collections.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SSEL` 保存本地选中标记、玩家选择集合／修订号及选择控制开关，不重放事件。Win32 Release 核心及 clock 目标编译通过，clock 61 通过、0 失败；OrcX01 隔离恢复并临时绕过启动保护推进 60 秒后，55 个现有组件重编码一致，已观察的选中标记差异消失。日志 `tmp/docs-artifacts/war3/selection-snapshot-clock-01.log`、`tmp/docs-artifacts/war3/orcx-continuation-audit/audit-15.log`。批次验证选择事件与消费者；联机选择同步、界面控制组、完整读档和跨区仍待实现或验收。


### 受保护的恢复组件包（待批次验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SRBF` 封装 55 个现有组件并按依赖顺序重建；结构错误在应用前拒绝，应用阶段失败的目标会话标记为失败。Win32 Release 核心及 clock 目标编译通过，clock 62 通过、0 失败；原版 OrcX01 0／30／150 秒组件包恢复后 55 项重编码一致，前两个时点睡眠线程分别 4／4、3／3。日志 `tmp/docs-artifacts/war3/recovery-bundle-clock-02.log`、`tmp/docs-artifacts/war3/orcx-bundle-audit/`。批次验证多组件错误、引用和睡眠线程；当前不开放恢复后启动，实际存档、跨区和窗口仍待实现或验收。


### 失效定时器稳定编码（待批次验证）

路径：`src/session_callbacks.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。活动定时器保留调度顺序，失效句柄按稳定编号编码。Win32 Release 核心及 clock 目标编译通过，clock 62 通过、0 失败；OrcX01 0／30／150 秒组件包恢复后，在临时副本绕过启动保护各推进 60 秒，55 个现有组件重编码一致，前两个时点的睡眠线程分别从 4／3 条推进至各 1 条。日志 `tmp/docs-artifacts/war3/timer-order-recovery-clock-01.log`、`tmp/docs-artifacts/war3/orcx-bundle-continuation/`。批次验证组件包、选择与定时器消费者；完整状态、实际存档、自然跨区和窗口仍待实现或验收。


### 选择、恢复组件包与定时器批次（2026-11-01）

本批范围 `9b8190c`、`7163139`、`cf449bc`。同一集成源码的 Win32 Release 客户端及 clock、session、session-thread、JASS-thread、兽族战役测试目标编译通过；复用 clock 62/62。合批执行 JASS 线程 27/27、会话线程 6/6、session 23/23、OrcX01 原图定时器身份 1/1；日志与隔离目录 `tmp/docs-artifacts/war3/selection-bundle-timer-batch/`。

原图 0／30／150 秒组件包恢复后，临时副本绕过保护各推进 60 秒，按新对象创建顺序映射后各时点 55 个现有组件重编码一致；日志 `tmp/docs-artifacts/war3/orcx-bundle-continuation/audit-00b.log`、`audit-30b.log`、`audit-150b.log`。该实验未覆盖完整对象状态、自然操作或实际存档入口；产品启动保护保留，跨区、原版格式及窗口仍待实现或验收。


### 传送门恢复状态（待阶段验证）

路径：`src/session.h`、`src/session_waygate.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SWGT` 保存传送门配置、占据单位和重试时间，在单位核心重建后恢复并映射句柄；`SRBF` 版本 2 纳入该组件。Win32 Release 核心与 clock 目标编译通过，clock 62/62，覆盖组件包内禁用状态、目的地、占据和重试引用往返；日志 `tmp/docs-artifacts/war3/waygate-recovery/clock-final.log`。阶段验证需覆盖恢复后的传送、双向传送门和重试、原图与实际存档入口；组件包仍禁止启动，完整状态、跨区和窗口尚未完成。


### 岗哨与临时显形恢复（待阶段验证）

路径：`src/session.h`、`src/session_stealth_reveal.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SRVL` 保存岗哨、显形区域、时序及树木／特效引用；`SRBF` 版本 3 纳入该组件。Win32 Release 核心及 clock 目标编译通过，clock 62/62；实际技能创建显形和岗哨，检查恢复后侦测及组件重编码，日志 `tmp/docs-artifacts/war3/reveal-recovery/clock-final.log`。待阶段验证恢复后的岗哨飞行、树木移除、显形到期、原图视野及实际存档；组件包启动保护保留。


### 民兵征召与警铃恢复（待阶段验证）

路径：`src/session.h`、`src/session_militia.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SMLT` 保存警铃、攻击警报设置、民兵转换及计时，并映射城镇引用；`SRBF` 版本 4 纳入该组件。Win32 Release 核心与 clock 目标编译通过，clock 62/62；实际警铃夹具覆盖前往城镇与已变身两种状态的重建和组件往返，日志 `tmp/docs-artifacts/war3/militia-recovery/clock-03.log`。待阶段验证恢复后转换完成、倒计时返工、原图与实际存档；组件包启动保护保留。


### 树人扎根与单位变形恢复（待阶段验证）

路径：`src/session.h`、`src/session_unit_forms.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SUFM` 保存扎根和变形状态、转换及调度成员，先于路径恢复重建占地；`SRBF` 版本 5 纳入该组件。Win32 Release 核心及 clock 目标编译通过，clock 62/62；实际技能夹具覆盖已拔起与拔起中的古树、已变身与变身中的熊，检查占地、路径与组件往返，日志 `tmp/docs-artifacts/war3/forms-recovery/clock-04.log`。待阶段验证转换续行、取消退款、自动变回、原图和实际存档；组件包启动保护保留。


### 吞树、拔树与战棍恢复（待阶段验证）

路径：`src/session.h`、`src/session_eat_tree.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`STRS` 保存树木动作、占用票据、战棍次数／特效及调度成员；`SRBF` 版本 6 纳入该组件。Win32 Release 核心及 clock 目标编译通过，clock 63/63；实际技能夹具覆盖吞树中、拔树中和持战棍状态，检查引用及占用表往返，日志 `tmp/docs-artifacts/war3/tree-actions-recovery/clock-03.log`。待阶段验证技能完成、取消、战棍耗尽、原图和实际存档；组件包启动保护保留。


### 中立技能调度与 AI 恢复边界（待阶段验证）

路径：`src/session_game.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCLK` 版本 3 保存中立野怪下一次技能决策时刻并兼容读取版本 1／2；`SRBF` 版本 7 拒绝包含活动 AI 运行时的会话。Win32 Release 核心及 clock 目标编译通过，clock 64/64，覆盖非零时刻往返、旧版读取和真实 `human.ai` 拒绝，日志 `tmp/docs-artifacts/war3/neutral-ai-recovery/clock-final.log`。待实现 AI 私有状态及共享线程恢复，并阶段验证中立战斗续行、实际存档和原图对局；组件包启动保护保留。


### 共享运行时睡眠线程基础（待阶段验证）

路径：`src/jass_runtime.h`、`src/jass_runtime.cpp`、`src/jass_threads.cpp`、`tests/jass_thread_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`JSHR` 保存共享调度器的运行时归属、顺序、暂停状态及跨运行时等待；保存校验脚本、等待环、句柄和预算，恢复失败清理已重建线程。Win32 Release 核心与线程目标编译通过；预算补充前 JASS 30/30、会话线程 6/6，最终受影响共享线程定向 4/4；日志 `tmp/docs-artifacts/war3/shared-runtime-recovery/`。待整合 AI 虚拟机全局、调度上下文和实际存档，阶段验证暂停／等待交错、原图 AI 续行；组件包仍拒绝活动 AI。


### 共享会话线程上下文（待阶段验证）

路径：`src/session.h`、`src/session_threads.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`JSSH` 保存共享运行时线程对应的触发器上下文、选择视图和动作序列，先由调用方恢复引用对象。Win32 Release 核心及 clock 目标编译通过，clock 65/65；隔离会话检查不同句柄的选择事件续行、错误映射拒绝及往返，并采集原版 `human.ai` 线程、上下文与私有全局，日志 `tmp/docs-artifacts/war3/shared-session-ai/clock-final.log`。待整合 AI 策略状态、实例重建和完整存档，阶段验证真实 AI 续行及复杂事件；组件包仍拒绝活动 AI。


### JASS 全局快照初始化（待阶段验证）

路径：`src/jass_runtime.h`、`src/jass_runtime.cpp`、`tests/jass_thread_tests.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。新运行时可从完整全局快照初始化，避免重放原生初始化副作用；引用对象由调用方先恢复。Win32 Release 核心及测试目标编译通过；共享运行时、句柄／代码映射和损坏拒绝定向检查 1/1，clock 65/65，原版 `human.ai` 私有全局使用恒等句柄占位往返；日志 `tmp/docs-artifacts/war3/ai-global-init/`。待整合 AI 实例、对象映射与策略状态并验证真实 AI 续行；实际存档及原版兼容未完成。


### AI 恢复实例准备（待阶段验证）

路径：`src/session.h`、`src/session_ai.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。在单位核心重建后准备指定 AI 策略并从全局快照初始化，绑定共享调度器和 AI 原生函数，不执行全局初始化或策略 main。Win32 Release 核心、clock 和战役 AI 测试目标编译通过；clock 65/65，原版 `human.ai` 实例、全局及睡眠线程在受保护会话往返，非单位句柄使用恒等占位；原战役 AI 启动模式 1/1，日志 `tmp/docs-artifacts/war3/ai-instance-recovery/`。待恢复 AI 策略状态、全部对象映射并验证真实续行；活动 AI 的实际存档仍不可用。


### AI 策略状态快照（待阶段验证）

路径：`CMakeLists.txt`、`src/session.h`、`src/session_ai_snapshot.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SAIS` 保存单个 AI 的采集、守卫、编队、购买、运输、路线、目标、暂停计数和英雄回调；单位身份及 AI 全局须先重建。Win32 Release 核心及 clock 目标编译通过，clock 65/65；原版 `human.ai` 与实际单位句柄结合人工策略数据，检查非恒等映射、暂停与恢复、回调和错误拒绝，日志 `tmp/docs-artifacts/war3/ai-strategy-recovery/clock-final.log`。待整合组件包、恢复所有对象引用并验证 AI 续行；实际存档及原图对局尚未完成。


### AI 组件包恢复（待阶段验证）

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SRBF` 版本 8 按共享调度顺序恢复 AI 实例、私有全局、策略状态及共享线程，校验暂停状态。Win32 Release 构建通过，clock 66/66，日志 `tmp/docs-artifacts/war3/ai-bundle-recovery/clock-final.log`。隔离夹具临时绕过恢复保护后续行 60 秒，25 项状态按对象映射一致；原版 Booty Bay 在全局句柄映射时失败，日志见 `tmp/docs-artifacts/war3/ai-continuation-audit/`。待修复原图引用并验证 AI 实战续行、完整状态及实际存档；恢复启动保护保留。


### 计时器对话框恢复（待阶段验证）

路径：`src/session.h`、`src/session_dialogs.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`STDL` 重建计时器对话框及计时器映射，`SRBF` 更新至版本 9。Win32 Release 构建通过，clock 67/67，日志 `tmp/docs-artifacts/war3/timer-dialog-recovery/clock-03.log`；Booty Bay 人族电脑隔离续行 60 秒时，临时绕过启动保护并按新对象顺序映射后 26 项状态一致，日志 `tmp/docs-artifacts/war3/ai-continuation-audit/audit-06.log`。待阶段验证真实存档、实时倒计时、UI 显示、玩家操作和其他地图；组件包启动保护保留。


### 恢复包哈希表引用顺序（待阶段验证）

路径：`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。哈希表在计时器、计时器对话框、集合、触发器和事件身份重建后恢复，支持这些已有对象的表项映射。Win32 Release 构建及 clock 68/68 通过，覆盖非恒等映射及表间循环，日志 `tmp/docs-artifacts/war3/hashtable-bundle/clock-final-02.log`。待阶段验证其他对象类型、真实地图和实际存档；启动保护保留。


### 随机单位池与物品池恢复（待阶段验证）

路径：`src/session.h`、`src/session_game.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SPOL` 保存池身份、销毁状态及有序权重条目，`SRBF` 版本 10 在哈希表和全局之前重建池。Win32 Release 构建和 clock 69/69 通过，检查损坏拒绝、句柄与表引用、随机单位和物品选择序列；日志 `tmp/docs-artifacts/war3/random-pool-recovery/clock-final.log`。实际存档、原图及随机序列原版一致性待阶段验证；启动保护保留。


### 游戏状态事件恢复（待阶段验证）

路径：`src/session_callbacks.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SGEV` 版本 2 恢复昼夜及整数状态事件、整数状态和修订号；`SRBF` 更新至版本 11。Win32 Release 构建及 clock 70/70 通过，检查事件身份、昼夜跨越、整数状态边沿与重复匹配；日志 `tmp/docs-artifacts/war3/game-state-recovery/clock-01.log`。Booty Bay 双 AI 隔离续行临时绕过启动保护，88 项比较一致（含重复项），日志 `tmp/docs-artifacts/war3/game-state-recovery/audit.log`。待补变量及其他事件并验证实际存档、昼夜声音和真实对局；启动保护保留。


### 变量事件恢复（待阶段验证）

路径：src/session.h、src/session_callbacks.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SGEV 版本 3 保存变量事件和匹配状态，重建全局写入监听；SRBF 更新至版本 12。Win32 Release 编译通过，clock 71/71、会话测试 23/23；clock 日志 tmp/docs-artifacts/war3/variable-event-recovery/clock.log。待验证复杂重入、真实地图与实际存档；其他事件和启动保护仍待处理。


### 聊天事件恢复（待阶段验证）

路径：src/session_callbacks.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SGEV 版本 4 保存并重建玩家聊天事件，SRBF 更新至版本 13。Win32 Release 构建及 clock 72/72 通过，覆盖玩家过滤、精确／包含匹配、上下文、事件引用和触发器销毁；日志 tmp/docs-artifacts/war3/chat-event-recovery/clock.log。待验证真实地图、实际存档及联机聊天同步；启动保护保留。


### 脚本对话框恢复（待阶段验证）

路径：src/session.h、src/session_script_dialogs.cpp、src/session_callbacks.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SDLG 重建对话框、按钮和失败条件，SGEV 版本 5 重建点击事件，SRBF 更新至版本 14。Win32 Release 构建及 clock 73/73 通过，检查显示状态、按钮顺序、事件上下文、销毁引用与损坏拒绝；日志 tmp/docs-artifacts/war3/script-dialog-recovery/clock-final.log。待验证实际存档、真实窗口画面、回调重入与联机；启动保护保留。


### 排行榜恢复（待阶段验证）

路径：src/session.h、src/session_leaderboard.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SLDB 重建排行榜、行样式、分数与玩家关联，SRBF 更新至版本 15。Win32 Release 构建及 clock 74/74 通过，日志 tmp/docs-artifacts/war3/leaderboard-recovery/clock.log。多列计分板、真实窗口、原图与实际存档待实现或阶段验证；启动保护保留。


### 多列计分板恢复（待阶段验证）

路径：src/session.h、src/session_multiboard.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SMBD 重建多列计分板、样式、网格和单元格引用，SRBF 更新至版本 16。Win32 Release 构建及 clock 75/75 通过；日志 tmp/docs-artifacts/war3/multiboard-recovery/clock.log。待验证真实窗口、原版地图、实际存档及联机；启动保护保留。


### 交互对象及事件恢复（待阶段验证）

路径：src/session.h、src/session_trackable.cpp、src/session_callbacks.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。STKB 重建交互对象，SGEV 版本 6 重建点击及悬停事件，SRBF 更新至版本 17。Win32 Release 构建及 clock 76/76 通过；日志 tmp/docs-artifacts/war3/trackable-recovery/clock.log。待验证真实拾取、实际存档和联机对象编号；启动保护保留。


### 空间事件与声音的已移除对象引用（待阶段验证）

路径：src/session_spatial_events.cpp、src/session_sound.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SPEV 和 SSND 版本 2 记录引用对象生命周期，SRBF 更新至版本 18。Win32 Release 构建通过，clock 77/77、声音等待恢复 1/1；日志 tmp/docs-artifacts/war3/retired-reference-recovery/clock.log。Human06 和 Undead01 的原版隔离诊断通过此前引用检查后，分别在天气句柄和目标预初始化特效处失败；待补齐并验证完整恢复、声音和实际存档。


### 天气对象恢复（待阶段验证）

路径：src/session.h、src/session_weather.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SWTH 保存地图及脚本天气、对象生命周期和资源定义摘要，SRBF 更新至版本 19。Win32 Release 构建及 clock 78/78 通过；原版 Human06 隔离恢复并临时绕过启动保护后续行 60 秒，69 项状态比较一致；日志 tmp/docs-artifacts/war3/weather-recovery/。待验证天气画面、环境音、实际存档及完整战役；启动保护保留。


### 装备及水面特效归属恢复（待阶段验证）

路径：src/session.h、src/session_effect_snapshot.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SEFX 版本 2 保存武器附着和水面特效归属，替换物品重建生成的临时特效；SRBF 更新至版本 20。Win32 Release 构建及 clock 79/79 通过；Undead01 和 Human06 隔离续行临时绕过启动保护后分别有 67／67 和 69／69 项比较一致。日志 tmp/docs-artifacts/war3/equipment-effect-recovery/ 及 tmp/docs-artifacts/war3/campaign-bundle-current/undead-weapon-fixed.log。待验证原版视觉、实际存档及完整战役；启动保护保留。


### 静音模拟声音时钟（待阶段验证）

路径：src/sound.h、src/sound.cpp、src/session_tick.cpp、tests/sound_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。静音模拟模式按模拟时间推进声音脉冲，声音恢复时对齐当前脉冲。Win32 Release 构建通过，脉冲和声音等待恢复各 1/1，clock 79/79；Human03 四次隔离续行比较各 67/67，临时绕过启动保护，日志 tmp/docs-artifacts/war3/simulation-audio-pulse/。待验证真实设备、音量组、原版声音时序和实际存档。

### 蝗虫群状态恢复（待阶段验证）

路径：src/swarm.h、src/session.h、src/session_locust.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SLOC 保存群体、成员、目标、计时、攻击和返航状态，SRBF 更新至版本 36。Win32 Release 编译及 clock 98/98 通过；原版 Orc01 人工布置场景验证活动蝗虫恢复和攻击，隔离续行临时绕过启动保护，盘旋 1 秒及攻击 8 秒各 71/71 项状态一致。待阶段验证多个群体、自然战斗、实际游戏读档、原版时序和窗口；日志 tmp/docs-artifacts/war3/locust-recovery/。

### 治疗喷雾波次恢复（待阶段验证）

路径：src/session.h、src/session_alchemist.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SHSP 保存治疗波次、药瓶、来源及结算计时，SRBF 更新至版本 37。Win32 Release 构建及 clock 99/99 通过；原版 Orc01 人工布置场景中检查飞行波次恢复。隔离续行临时绕过启动保护，3 秒内产生治疗且 71/71 项状态一致。待阶段验证实际游戏读档、自然战斗、多目标、来源移除、原版时序及窗口；日志 tmp/docs-artifacts/war3/healing-spray-recovery/。

### 火焰领主飞石与延迟爆炸恢复（待阶段验证）

路径：src/session.h、src/session_volcano.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SFLD 保存火山飞石和焚灰延迟爆炸，SRBF 更新至版本 38；未支持的活动范围效果在采集时拒绝。Win32 Release 构建及 clock 101/101 通过，包含活动践踏拒绝采集；原版 Orc01 人工布置场景检查飞石恢复。隔离续行临时绕过启动保护，3 秒内造成伤害且 71/71 项状态一致。待阶段验证焚灰爆炸、可破坏物目标、来源失效、实际游戏读档、自然战斗、原版时序和窗口；日志 tmp/docs-artifacts/war3/firelord-recovery/。

### 践踏野兽恢复（待阶段验证）

路径：src/stampede.h、src/session.h、src/session_stampede.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SSTP 恢复践踏野兽、特效和碰撞延迟，SRBF 更新至版本 39。Win32 Release 构建及 clock 101/101 通过；原版 Orc01 人工布置场景的飞行续行和人工设置碰撞后续行各 71/71 项状态一致，均临时绕过启动保护。待阶段验证自然碰撞、多目标同距、施法者失效、实际游戏读档、原版时序和窗口；日志 tmp/docs-artifacts/war3/stampede-recovery/。

### 范围波次、延迟与地面技能恢复（待阶段验证）

路径：src/session.h、src/session_area_spells.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SASP 保存波次命中记录、延迟效果及地面脉冲，SRBF 更新至版本 40。Win32 Release 构建及 clock 104/104 通过；原版 Orc01 人工布置场景检查冲击波、烈焰风暴及地狱火，隔离续行各 71/71 项状态一致，临时绕过启动保护。待阶段验证其他技能、来源失效、多目标同距、实际游戏读档、自然战斗、原版时序和窗口；日志 tmp/docs-artifacts/war3/area-spell-recovery/。

### 物品荒芜扩张恢复（待阶段验证）

路径：src/session.h、src/session_blight_items.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SIBG 保存物品荒芜扩张队列，SRBF 更新至版本 41。Win32 Release 构建及 clock 105/105 通过；原版 Orc01 人工使用献祭头骨，在扩张过程中恢复。隔离续行临时绕过启动保护，正常及事先移除施法者两种情况各 71/71 项状态一致。待阶段验证多重重叠扩张、实际游戏读档、原版时序和窗口；日志 tmp/docs-artifacts/war3/item-blight-recovery/。

### 燃烧油与攻击闪电恢复（待阶段验证）

路径：src/passive_snapshot_codec.h、src/stampede.h、src/session.h、src/session_projectile_snapshot.cpp、src/session_siege_attacks.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SCFX 保存燃烧油和攻击闪电活动状态，SRBF 更新至版本 42。Win32 Release 构建及 clock 107/107 通过；原版 Orc01 人工场景真实攻击后采集，隔离续行临时绕过启动保护，燃烧油及延迟闪电各 71/71 项状态一致；燃烧油来源移除后同样一致。待阶段验证自然对局、来源／目标失效组合、实际游戏读档、原版时序和窗口；日志 tmp/docs-artifacts/war3/combat-effects-recovery/。

### 脚本图片与地面贴花恢复（待阶段验证）

路径：src/session.h、src/session_effects.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SIMG 重建图片及贴花的活动／已销毁句柄与显示状态，SRBF 更新至版本 43。Win32 Release 构建及 clock 108/108 通过；原版 Orc01 人工创建图片和贴花的隔离续行临时绕过启动保护，3 秒后 71/71 项状态一致。待阶段验证更多地图、实际游戏读档、纹理资源变化及窗口；日志 tmp/docs-artifacts/war3/image-recovery/。

### 初始化图片与贴花替换（待阶段验证）

路径：src/session.h、src/session_effects.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SIMG 校验后替换目标已有对象并排除临时身份，保留恢复句柄映射；Win32 Release 构建及 clock 109/109 通过，覆盖全局初始化句柄和损坏数据拒绝。隔离续行临时绕过启动保护，预先创建图片和贴花后 71/71 项状态一致。待阶段验证更多地图、实际游戏读档及窗口；日志 tmp/docs-artifacts/war3/image-init-recovery/。

### 地形变形与永久凹坑恢复（待阶段验证）

路径：src/world.h、src/world_height.cpp、src/session.h、src/session_world.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SDFM 保存脚本句柄、活动变形与永久凹坑，SRBF 更新至版本 44。Win32 Release 构建及 clock 110/110 通过，覆盖初始化变形替换、损坏拒绝及停止命令；原版 Orc01 人工创建多种变形，隔离续行临时绕过启动保护，3 秒后高度与 71/71 项状态一致。待阶段验证更多变形组合、实际游戏读档、原版时序及窗口；日志 tmp/docs-artifacts/war3/deformation-recovery/。

### 对局结果与战役切关状态恢复（待阶段验证）

路径：src/session.h、src/session_match.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SMAT 保存玩家结果、英雄摘要、难度、切关及过场请求，SRBF 更新至版本 45。Win32 Release 构建及 clock 111/111 通过，覆盖结果、摘要、难度、过场、切关及上下文拒绝；原版 Orc01 人工设置玩家离场，隔离续行临时绕过启动保护，3 秒后 71/71 项状态一致。待阶段验证实际读档、完整战役结算和跨关切换、原版时序及窗口；日志 tmp/docs-artifacts/war3/match-state-recovery/。

### 地图装饰物动画与槽位恢复（待阶段验证）

路径：src/session.h、src/session_doodads.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SDOD 保存装饰动画、对象槽位及空间查询顺序，SRBF 更新至版本 46。Win32 Release 构建及 clock 112/112 通过，覆盖恢复后槽位复用；原版 Orc01 人工设置动画并重用动态槽位，隔离续行临时绕过启动保护，3 秒后 71/71 项状态一致。待阶段验证自然地图脚本、实际游戏读档、原版时序及窗口；日志 tmp/docs-artifacts/war3/doodad-recovery/。

### 界面请求恢复（待批次验证）

路径：src/session.h、src/session_text.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SUIQ 保存脚本按键队列和技能书请求，SRBF 更新至版本 47。批次执行 Win32 Release `war3_clock_tests <data-root> <output-root>`，核对队列顺序、技能书单位映射和单位移除后的引用；检查实际窗口请求消费与读档。状态：批次 clock 回归通过，实际窗口及读档待验收。

### 地图与主题音乐恢复（待批次验证）

路径：src/music.h、src/music.cpp、src/session.h、src/session_music.cpp、src/session_recovery_bundle.cpp、tests/music_tests.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SMUS 保存音乐播放和调度状态，SRBF 更新至版本 48。批次构建 `war3_clock_tests` 和 `war3_music_tests`，执行 `war3_clock_tests <data-root> <output-root>` 及 `war3_music_tests <data-root> <output-root>`，核对暂停位置、曲目随机序列、损坏拒绝和主题音乐结束后的地图音乐恢复；真实设备、墙钟定时及游戏读档另行验收。状态：批次静音回归通过，实际音频设备测试失败并保留待重测。

### 待播放音效请求恢复（待批次验证）

路径：src/session.h、src/session_sound.cpp、src/session_recovery_bundle.cpp、tests/clock_tests.cpp；说明见[战役存档状态](save-runtime-foundation.md)。SSRQ 保存音效请求队列，SRBF 更新至版本 49。与界面请求及音乐状态合批构建 `war3_clock_tests`、`war3_music_tests`，执行各目标 `<data-root> <output-root>`，核对技能音效顺序和单次消费；真实设备与游戏读档另行验收。状态：批次 clock 回归通过，真实设备与游戏读档待验收。

### 界面与音频恢复批次结果

范围：`d42dc02`、`4b1d355`、`bd1f6b7` 及本次测试夹具修正。Win32 Release `war3_clock_tests`、`war3_music_tests` 构建通过；clock 115 通过、0 失败，音乐 8 通过、1 失败。失败项 `music_real_seek_pause_resume_repeat_and_clear` 因本机 Miles `waveOutOpen()` 失败，保留待有可用音频设备时重测。静音音乐快照、主题音乐恢复、界面请求及音效队列用例通过；墙钟淡化／排队的跨快照边界、实际窗口、真实设备和游戏读档仍待验收。日志：`tmp/docs-artifacts/war3/ui-audio-recovery-batch/`。


### 脚本延迟范围伤害恢复（待功能批次验证）

路径：`src/session.h`、`src/session_damage.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`。SPDM 保存 `UnitDamagePoint` 的排队伤害、到期时间、同时间顺序与来源单位生命周期；恢复包版本 50 重建队列并核对地图、时钟和单位身份。批次构建并执行 `war3_clock_tests <data-root> <output-root>`，检查队列往返、移除来源、损坏拒绝，并补充真实续行的伤害顺序和触发事件、原版地图及实际存读档。实际存档入口及恢复启动保护仍待完成。本次 `cmake --build --preset release --target war3_clock_tests --parallel 4` 编译通过；未执行测试。状态：待批次验证。


### 侦测事件状态恢复（待功能批次验证）

路径：`src/session_callbacks.cpp`、`src/session_recovery_bundle.cpp`、`tests/visibility_tests.cpp`。SAEV 版本 2 保存已侦测单位、所属玩家及侦测玩家位集，保留已移除单位的待清理身份；SRBF 更新至版本 51。Win32 Release `cmake --build --preset release --target war3_visibility_tests --parallel 4` 编译通过，未运行测试。功能批次使用 `war3_visibility_tests <data-root> <invisibility-fixture> detected-recovery` 检查恢复包及事件状态往返，并补充恢复续行时持续侦测不重复触发、离开后再次触发、移除／归属变化、损坏数据和实际存读档；恢复启动保护保留。


### 单位与物件提示闪烁恢复（待功能批次验证）

路径：`src/indicator.h`、`src/session.h`、`src/session_indicators.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`。SIND 保存未结束的脚本提示闪烁、环形槽位顺序和单位／物品／可破坏物身份；SRBF 更新至版本 52。已新增提示颜色、已移除单位及环形槽位复用的恢复检查。功能批次构建并运行 `war3_clock_tests <data-root> <output-root>`，并补充闪烁时间推进、过期、重叠及真实窗口／存读档检查；启动保护保留。Win32 Release `cmake --build --preset release --target war3_clock_tests --parallel 4` 编译通过，未执行测试。状态：待批次验证。


### 可破坏物失效句柄查询与操作（待功能批次验证）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`。空、已移除及类型不匹配的可破坏物句柄用于生命／坐标／类型／名称／无敌查询时返回相应空值，生命设置和显隐请求安全返回；无效 widget 的生命设置安全返回。有效对象继续读取和修改真实状态。固定版 Game.dll 对应入口静态指令位于 `tmp/docs-artifacts/war3/destructable-null-queries/game-dll-disassembly.txt`，仅覆盖已检查入口的句柄解析失败分支。Win32 Release `cmake --build --preset release --target war3_destructable_tests --parallel 4` 编译通过；未运行测试。功能批次执行 `war3_destructable_tests <data-root> <generated-map> invalid-handles`，并覆盖地图脚本回调、对象移除与重入及窗口表现。


### 可破坏物失效句柄操作补充（待功能批次验证）

路径：`src/session_destructables.cpp`、`tests/destructable_tests.cpp`。生命恢复、最大生命／遮挡高度／动画速度及动画设置在无效可破坏物句柄时直接返回；死亡事件注册在触发器或 widget 无效时返回空事件。有效对象仍进入实际状态与事件流程。固定版 Game.dll 入口及失败分支静态指令为 `tmp/docs-artifacts/war3/destructable-null-queries/game-dll-action-disassembly.txt`。Win32 Release `cmake --build --preset release --target war3_destructable_tests --parallel 4` 编译通过，未运行测试；与上项合并执行 `war3_destructable_tests <data-root> <generated-map> invalid-handles`，覆盖空／移除／错误类型、有效操作及事件，后续检查脚本重入和原版运行行为。


### 多项即时恢复物品（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合恢复物品](combined-recovery-items.md)。自定义物品可按能力列表顺序应用多个 `AIhe`、`AIma`、`AIre` 即时恢复，使用一次收费／消耗和一次物品事件；未知主动能力仍显式拒绝。Win32 Release `cmake --build --preset release --target war3_control_tests --parallel 4` 与生成器 Python 语法检查通过，未运行功能测试。功能批次重新生成夹具并执行 `war3_control_tests <data-root> <fixture> item-combined`，覆盖三项能力、混合 `AIre`、能力顺序、事件重入和旧组合；原版收费／冷却／多事件语义、符文与真实窗口仍待对照。


### 复合物品的金币与木材效果（待功能批次验证）

路径：`src/session.h`、`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合增加 `AIgo`／`AIlu` 即时金币和木材，可与即时恢复混用，按能力次序更新实际玩家资源并发送状态事件，每项回调后检查使用者生命周期，单次支付、冷却、消耗和物品事件。Win32 Release `cmake --build --preset release --target war3_control_tests --parallel 4` 及夹具生成脚本语法检查通过，未运行功能测试。功能批次重新生成夹具并执行 `war3_control_tests <data-root> <fixture> item-combined`，同时验证资源上限、零值、归属变化／移除／重入、费用和原版事件顺序；未知主动能力保持显式拒绝。


### 复合物品的永久属性与成长（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持永久属性／生命／攻击／经验／等级能力，复用实际英雄及单位消费者；扣费前检查英雄要求和源数值范围，效果按能力顺序执行。Win32 Release `cmake --build --preset release --target war3_control_tests --parallel 4` 与夹具生成脚本语法检查通过，未运行功能测试。合批重新生成夹具并执行 `war3_control_tests <data-root> <fixture> item-combined`，覆盖永久属性与金币、非英雄拒绝及既有即时组合；永久生命／经验／等级、多个效果的极值、事件重入、原版派发及实际窗口待验证。


### 复合物品的科技符文效果（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AIgl` 的逐级科技配置，使用前检查科技定义与已支持效果，按能力次序复用玩家研究和单位刷新。Win32 Release `cmake --build --preset release --target war3_control_tests --parallel 4` 最终编译通过，夹具生成脚本语法通过，未运行功能测试。与此前复合物品合批重新生成夹具并执行 `war3_control_tests <data-root> <fixture> item-combined`，检查夜视符文两项科技与金币混合；重复／上限、科技变化回调、符文拾取及原版费用／事件顺序待验证。


### 复合即时物品与可破坏物句柄合批结果

范围：`c5b7c28`、`e94d96b`、`2f5df92`、`af99754`、`e299455`、`1e2e9e9` 及本次夹具生成修正；在 `af99754` 的同一核心版本上编译相关目标并使用隔离用户目录。重新生成 BootyBay 派生夹具后，`war3_control_tests <data-root> <fixture> item-combined` 报告 1 通过、0 失败、未加载 Game.dll，覆盖既有双恢复、回调删物品／易主、扣费与共享冷却、三项恢复、AIre 混合、金币／木材、永久属性与非英雄拒绝、双科技与金币。首轮因生成脚本将 JASS 调用插入局部变量声明之间而解析失败，调整声明与调用位置后仅重跑该项；日志在 `tmp/docs-artifacts/war3/combined-item-batch/`。

`war3_destructable_tests <data-root> <fixture> invalid-handles` 输出 PASS、进程退出 0，覆盖空／已移除／错误类型句柄的本批查询和操作，以及有效对象的读取、设置和事件注册；日志 `tmp/docs-artifacts/war3/destructable-null-queries/invalid-handles.log`。该程序在此模式未打印数值汇总。真实窗口、原版多能力费用及事件顺序、符文拾取、科技重入、伤害／永久成长边界和实际地图长局仍待验证；本批结果不覆盖存档恢复队列或完整玩法。


### 复合物品的幻象效果（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AIil`，使用前检查目标、可见性、联盟、范围与落点，执行时再次检查并复用幻象与限时生命；其余即时效果仍作用于使用者／所属玩家。Win32 Release `cmake --build --preset release --target war3_control_tests --parallel 4` 和夹具脚本语法通过，未运行功能测试。下一功能批次重新生成夹具并运行 `war3_control_tests <data-root> <fixture> item-combined`，核对幻象／金币、敌方目标拒绝与消费；目标移动／死亡／易主、回调重入、落点变化、符文及原版目标和事件规则待验证。


### 复合物品的隐身效果（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AIvi`，使用前检查持续时间、单位类型与状态标识，复用隐身状态及淡入、到期流程。合批重新生成夹具并运行 `war3_control_tests <data-root> <fixture> item-combined`，检查隐身与金币、消费和事件；补充淡入推进、到期、攻击打破隐身、效果顺序、混合目标及原版行为验证。本次未运行功能测试，待功能包集中编译验证。


### 复合物品的吸血效果（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AIpv`，扣费前检查源配置，按能力顺序复用攻击增益和吸血状态。合批重新生成夹具并运行 `war3_control_tests <data-root> <fixture> item-combined`，检查吸血与金币、消耗及事件；攻击命中回血、持续与到期、无效配置、重入及原版行为待验证。本次未运行功能测试，待功能包集中编译验证。


### 物品持续效果与抗性皮肤（待功能批次验证）

路径：`src/session_item_use.cpp`。单一及复合 `AIvi`、`AIpv` 物品对带 `Arsk` 抗性皮肤的非英雄按状态系统的英雄持续时间校验和施加，避免校验时长与实际增益不同。功能批次覆盖英雄、普通单位、抗性皮肤单位，以及普通／英雄时长不同和零时长的自定义能力；核对扣费、增益和到期及原版行为。本次未执行功能测试，待功能包集中编译验证。

抗性皮肤待测夹具为单一和复合隐身／吸血物品设置普通持续时间 3 秒、英雄持续时间 9 秒，分别验证普通步兵和添加 `ACrk` 的步兵。执行方式与复合物品合批相同；英雄、零时长、到期和原版行为仍待补充。


### 复合物品持续效果合批结果

范围：`06aa194`、`27ef78d`、`c43e8db`、`68a6017`、`fdb77b2` 及本次夹具修正。Win32 Release `war3_control_tests` 构建通过，重新生成 BootyBay 派生夹具并执行 `war3_control_tests <data-root> <fixture> item-combined`，结果 **1 通过、0 失败**，未加载 Game.dll。覆盖幻象与目标拒绝、隐身、吸血、金币混合及单一／复合物品在普通单位和 `ACrk` 抗性皮肤单位上的 3／9 秒持续时间，同时覆盖既有组合场景。首轮添加 `Arsk` 的单位未体现抗性效果；调整为中立版本 `ACrk` 后通过，前置条件及原版表现仍待核对；日志及夹具在 `tmp/docs-artifacts/war3/compound-timed-batch/`。实际攻击回血、隐身淡入／到期、英雄和零时长、真实窗口及原版目标与事件时序仍待验证。


### 复合物品的复活和操纵死尸（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AIrs`／`AIan`／`AHre`，消费前检查实际尸体并依次调用已有复活及操纵死尸流程。合批重新生成夹具并运行 `war3_control_tests <data-root> <fixture> item-combined`，检查原单位复活、尸体消费、限时召唤及金币混合；无尸体、符文、多个复活效果、回调重入、实际对局和原版事件时序待验证。本次未执行功能编译或测试。


### 复合物品的全图显形（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AIrv`，扣费前检查显形定义与区域配额，执行时复用实际视野与侦测。合批重新生成夹具并运行 `war3_control_tests <data-root> <fixture> item-combined`，检查远处隐身单位侦测及金币混合；到期、共享视野、多个显形区域、回调重入和原版行为待验证。本次未执行功能编译或测试。


### 复合物品的自身无敌与狂暴（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/generate-combined-item-fixture.py`、`tests/control_tests.cpp`；说明见[复合即时物品](combined-recovery-items.md)。多主动组合支持 `AHds`／`Absk`，复用物品自身增益及状态生命周期。合批重新生成夹具并运行 `war3_control_tests <data-root> <fixture> item-combined`，检查无敌／狂暴与金币组合；伤害免疫、攻速和伤害变化、到期、目标及原版事件时序待验证。本次未执行功能编译或测试。


### 复合物品尸体、显形与自身增益合批结果

范围：`1d9c315`、`b16622c`、`d6c9f41`。Win32 Release `war3_control_tests` 构建通过，重新生成 BootyBay 派生夹具后执行 `war3_control_tests <data-root> <fixture> item-combined`，报告 **1 通过、0 失败**，未加载 Game.dll。新增场景覆盖复活原单位、操纵尸体并建立限时单位、全图侦测隐身单位、无敌及狂暴增益和金币混合，并复核此前组合。夹具与日志在 `tmp/docs-artifacts/war3/compound-corpse-reveal-batch/`。无尸体、增益和显形到期、实际伤害效果、复杂回调、符文、真实窗口与原版时序仍待验证。


### 禁止保存录像状态恢复（待功能批次验证）

路径：`src/session_match.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SMAT` 版本 2 保存 `DoNotSaveReplay`，旧版默认允许保存；`SRBF` 更新至版本 53。功能批次构建并执行 `war3_clock_tests <data-root> <output-root>`，验证恢复包与对局状态往返；另需覆盖旧版、损坏标志、实际读档和未来单机录像消费。本次未执行功能编译或测试，恢复启动保护保留。


### 合体施法预约恢复（待功能批次验证）

路径：`src/session_cast_snapshot.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SCST` 版本 2 保存并核对 `Acoa`／`Acoh`／`Acoi` 合体目标预约，`SRBF` 更新至版本 54。合批构建并执行 `war3_clock_tests <data-root> <output-root>`，核对竞争、恢复和停止后释放；另需覆盖目标移除、重复／损坏预约、旧版及实际存读档。当前未执行功能编译或测试，恢复启动保护保留。


### 尸体召唤索引恢复（待功能批次验证）

路径：`src/session_illusion.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SUMM` 版本 2 保存尸体召唤索引并校验成员关系，`SRBF` 更新至版本 55。合批构建执行 `war3_clock_tests <data-root> <output-root>`，核对腐尸甲虫索引往返；继续覆盖召唤上限、召唤者死亡清理、死亡／移除句柄、旧版和损坏数据及实际存读档。本次未执行功能编译或测试，恢复启动保护保留。


### 存档恢复索引合批结果

范围：`e40001f`、`1d6cfe7`、`1c36149` 及本次夹具修正。Win32 Release `war3_clock_tests` 构建通过；整批首轮 **116 通过、2 失败**。失败项分别因合体夹具缺少原技能 `Reht` 科技前置、尸体召唤夹具缺少 JASS 句柄类型；修正后仅重跑两项，各 **1 通过、0 失败**。测试目标最终重新编译通过，变量遮蔽警告已消除。测试入口支持 `WAR3_CLOCK_FILTER` 按名称筛选，无匹配返回失败。原始整批日志及合体重测日志位于 `tmp/docs-artifacts/war3/recovery-index-batch/`。本批覆盖录像禁止标记、合体预约的恢复与释放、腐尸甲虫索引往返；原版时序、召唤上限与死亡续行、实际保存／读档及完整战役仍待验证，恢复启动保护保留。


### 持续技能参与者索引恢复（待功能批次验证）

路径：`src/session_buff_snapshot.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SBUF` 版本 2 保存自身技能、剑刃风暴和魔法闪耀索引，`SRBF` 更新至版本 56。合批构建并执行 `war3_clock_tests <data-root> <output-root>`，核对献祭、剑刃风暴和魔法闪耀的索引往返；继续覆盖恢复后周期伤害、敌方施法反应、取消、失效句柄及真实存读档。本次未执行功能编译或测试，恢复启动保护保留。

尸体召唤恢复检查补充：将真实腐尸甲虫召唤物设置为跟随召唤者死亡，恢复并移除召唤者后检查召唤物死亡；该夹具待功能批次执行，原技能的参数与完整续行仍需另行验证。

持续技能恢复夹具补充实际魔法闪耀反应：恢复增益、技能句柄和施法后，由附近敌方单位施放有魔法消耗的献祭，检查双方会话均排出反击弹道。该场景待功能批次执行，弹道命中伤害与完整读档仍待验证。


### 持续技能与召唤清理恢复合批结果

范围：`d6569fc`、`1e12190`、`cb17a08`。Win32 Release `war3_clock_tests` 编译通过，执行 `war3_clock_tests <data-root> <output-root>` 为 **118 通过、0 失败**，未加载 Game.dll。覆盖献祭、剑刃风暴和魔法闪耀的参与者索引往返，魔法闪耀恢复后对敌方施法产生弹道，以及指定连带死亡的尸体召唤物在恢复后随召唤者移除而死亡。日志与临时产物在 `tmp/docs-artifacts/war3/recovery-active-spells-batch/`。剑刃风暴及献祭的恢复后周期伤害、魔法闪耀弹道命中、原技能召唤参数、完整实际读档及原版行为仍待验证；恢复启动保护保留。


### 攻击被动累计状态恢复（待功能批次验证）

路径：`src/session.h`、`src/session_buff_snapshot.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。`SAPV` 保存暴击概率累计、掠夺资源余量及腐蚀持续伤害，`SRBF` 更新至版本 57。合批构建并执行 `war3_clock_tests <data-root> <output-root>`，检查三类状态的映射往返；后续覆盖失效来源、损坏数据、连续攻击／支付／跳伤、真实存读档和原版行为。本次未执行功能编译或测试，恢复启动保护保留。

攻击被动恢复夹具补充已移除的腐蚀来源，以及摘要损坏／错误句柄映射拒绝后的状态不变检查；这些场景待功能批次执行。

攻击被动状态补充腐蚀计时边界：保存和恢复均要求伤害、剩余时间符合源能力范围，周期余量小于一秒；夹具重封装异常计时检查拒绝，待功能批次执行。


### 攻击被动状态恢复合批结果

范围：`2907b6b`、`eb57ac8`、`6f77d42` 及本次完整恢复包夹具补充。Win32 Release `war3_clock_tests` 构建通过，完整测试 **118 通过、0 失败**；追加非空攻击被动状态的完整恢复包往返后，定向测试 **1 通过、0 失败**。覆盖暴击累计、掠夺余量、活动及已移除的腐蚀来源、损坏摘要、异常周期和错误映射拒绝；状态数值由夹具设置。日志及临时产物在 `tmp/docs-artifacts/war3/recovery-attack-passives-batch/`。实际攻击概率、资源入账和腐蚀跳伤的恢复续行、真实存读档及原版行为仍待验证，恢复启动保护保留。


### 召唤单位的瘟疫守卫与碰撞恢复

范围：`832cd7e`、`5f38439`；路径：`src/session_illusion.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。Win32 Release `war3_clock_tests` 编译通过，执行 `war3_clock_tests <data-root> <output-root>` 为 **118 通过、0 失败**。`SUMM` 版本 3 保存瘟疫守卫标记和实际碰撞半径，`SRBF` 为版本 58；夹具覆盖 `Aap3` 死亡云雾产生的守卫以及标记、零碰撞、召唤者和限时生命恢复。日志及临时产物在 `tmp/docs-artifacts/war3/recovery-summon-ward-batch/`。蝗虫、目标筛选、感染、伤害归属、死亡清理、旧版拒绝、实际读档和原版行为仍待验证，恢复启动保护保留。


### 召唤分类与单位形态属性恢复合批结果

范围：`a0fbbea`、`fa110eb`、`f7df638`、`f061125`；路径：`src/session_illusion.cpp`、`src/session_unit_forms.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。Win32 Release `war3_clock_tests` 编译通过，执行 `war3_clock_tests <data-root> <output-root>` 为 **118 通过、0 失败**。夹具覆盖人工设置召唤分类的 `IsUnitType`、旧 `SUMM` 与非法值拒绝，熊形态实际变形及完整恢复包往返；另覆盖人工设置的潜地、灵体、建筑目标分类和形态回血属性，以及隐身和虚体查询。日志及临时产物在 `tmp/docs-artifacts/war3/recovery-unit-form-batch/`。实际驱散和经验、真实建筑升级、目标过滤、回血续行、`SUFM` 旧版及损坏数据、实际存读档和原版规则仍待验证；恢复启动保护保留。


### 保存调用脚本续行合批结果

范围：`1443274`、`0d8f9dd` 及本次共享调度器绑定修正；路径：`src/jass_runtime.h`、`src/jass_runtime.cpp`、`tests/jass_thread_tests.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。Win32 Release 两个目标编译通过；`war3_jass_thread_tests` **33 通过、0 失败**，`war3_clock_tests <data-root> <output-root>` 首轮 **112 通过、6 失败**。六项失败均因新 AI 运行时绑定睡眠 native 时共享调度器已有线程；修正后六项定向重测各 **1 通过、0 失败**，线程套件重测 **33 通过、0 失败**，新增共享调度器定向场景 **1 通过、0 失败**。覆盖挂起 native 恢复不重放及完整恢复包脚本续行；日志位于 `tmp/docs-artifacts/war3/save-checkpoint-batch/`。保存请求、事件顺序、文件写入及实际读档仍待实现，恢复启动保护保留。


### 保存检查点等待与文件合批结果

范围：`20c7cad`、`0425d5d`、`ed22a14`；路径：`src/jass_runtime.cpp`、`src/session.h`、`src/session_campaign.cpp`、`tests/jass_thread_tests.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。Win32 Release 两个目标编译通过，`war3_jass_thread_tests` **35 通过、0 失败**，`war3_clock_tests <data-root> <output-root>` **118 通过、0 失败**。覆盖宿主外部等待期间采集、原线程唤醒、恢复后不重放，以及隔离目录真实文件写入和恢复、摘要损坏与越界路径拒绝。日志和临时文件在 `tmp/docs-artifacts/war3/save-file-batch/`。地图不匹配、并发、重写失败、游戏保存事件、地图自动定位、真实存读档与原版文件兼容仍待验证或实现；恢复启动保护保留。


### 脚本保存与地图定位合批结果

范围：`0acc603`、`691fe4c`、`3872a6b`、`4a821d5`、`c4017b7`、`2814bd7` 及本次定位夹具补充；路径：`src/session.h`、`src/session_campaign.cpp`、`src/session_tick.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。Win32 Release `war3_clock_tests` 编译通过，整批 **119 通过、0 失败**；补充相对文件名与摘要不匹配后，受影响项定向重测 **1 通过、0 失败**。覆盖脚本保存、保存事件、暂停、文件及恢复线程，以及地图身份、绝对／相对名称、摘要不匹配和不同安装目录拒绝。日志和临时文件位于 `tmp/docs-artifacts/war3/save-map-resolution-batch/`。

原版 OrcX01 另做隔离最小探针：模拟 150 秒后直接移动雷克萨至区域，生成区域检查点和保存事件备份，两者 SHA-256 一致并发出下一地图切换请求；日志及文件在 `tmp/docs-artifacts/war3/save-game-native/`。自然走位、下一地图加载、回访读档、经典战役目录和外部地图定位、重解析点、并发、失败处理、原版文件与事件时序仍待验证或实现；`LoadGame` 未接入，恢复启动保护保留。


### 检查点会话上下文与回访诊断（待功能批次验证）

路径：`src/session.h`、`src/session_campaign.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。检查点身份查询解析战役模式、游戏版本和默认难度，并核对嵌套组件摘要及地图身份。合批编译运行 `war3_clock_tests <data-root> <output-root>`；不同版本、难度、损坏组件和实际加载仍待验证。本次尚未编译或测试。原版 OrcX01 隔离检查点可重建，但临时绕过保护后一帧会重复触发原切区，见 `tmp/docs-artifacts/war3/save-game-native/orcx-checkpoint-stack.log`；恢复启动保护保留。


### 恢复会话加载事件（待功能批次验证）

路径：`src/session.h`、`src/session_campaign.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。恢复会话可设置 `MAP_RELOADED` 并分发一次 `EVENT_GAME_LOADED`。合批编译运行 `war3_clock_tests <data-root> <output-root>`，覆盖加载触发器、地图标志和重复通知拒绝；事件回调重入、原版时序、实际 `LoadGame`、区域回访及可玩续行仍待验证或实现。本次未编译或测试，恢复启动保护保留。

必要定向检查：Win32 Release `war3_clock_tests` 编译通过；保存／加载事件与检查点身份两个受影响用例各 **1 通过、0 失败**。原版 OrcX01 隔离检查点分发加载事件后，`MAP_RELOADED` 为真且雷克萨由缓存导入，日志位于 `tmp/docs-artifacts/war3/save-loaded-event/`。完整回归、原版事件时序、重复切区、游戏 `LoadGame` 及可玩续行仍待功能批次验证或实现。


### 区域切换保存线程（待功能批次验证）

路径：`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。标准区域切换包装发起的保存不在检查点重放切区调用线程，保留其他线程并调整等待索引；实时切区和普通保存保持续行。合批编译执行 `war3_clock_tests <data-root> <output-root>`，覆盖实际文件、独立睡眠线程和实时切图；`SaveAndLoadGameBJ`、等待链、原版线程语义、完整回访与 `LoadGame` 仍待验证或实现。本次未编译或执行测试，恢复启动保护保留。

必要定向检查：Win32 Release 编译通过，切区包装和普通保存各 **1 通过、0 失败**；夹具覆盖两种标准包装和独立睡眠线程，其中 `LoadGame` 使用测试替身。原版两区域隔离诊断在回访处仍因未绑定 `LoadGame` 停止；另行恢复第一地区新检查点、分发加载事件后，雷克萨已导入，临时绕过保护推进 2 秒未再次切区。日志在 `tmp/docs-artifacts/war3/transition-save-native/`。等待链、原版线程行为、真实读档和完整回归仍待验证。


### 恢复会话显式启动（待功能批次验证）

路径：`src/session.h`、`src/session.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。恢复包和加载事件完成后可显式启动原 main 已完成的本地会话，拒绝过早或重复启动，不重放 main。合批编译运行 `war3_clock_tests <data-root> <output-root>`，检查加载事件顺序、拒绝条件和正常模拟步续行；原版两区域长时运行、原 main 未完成、其他地图状态、`LoadGame` 和窗口交互仍待验证或实现。本次未编译或测试。

必要定向检查：Win32 Release `war3_clock_tests` 编译通过，保存／加载事件和恢复会话启动用例 **1 通过、0 失败**。原版 OrcX01 使用产品恢复、事件与显式启动入口，雷克萨存在且玩家控制可用，隔离模拟 60 秒未重复切区；日志位于 `tmp/docs-artifacts/war3/recovery-activation/`。完整功能批次、窗口输入、其他地图、原版行为及 `LoadGame` 入口仍待验证或实现。


### 脚本读档请求与加载流程合批结果

路径：`src/session.h`、`src/session_campaign.cpp`、`src/session_match.cpp`、`src/game_view.h`、`src/game_loading.*`、`src/map_preparation.*`、`src/campaign_browser.*`、`src/main.cpp`、`tests/clock_tests.cpp`；说明见[战役存档状态](save-runtime-foundation.md)。Win32 Release 客户端及测试目标编译通过，`war3_clock_tests <data-root> <output-root>` **120 通过、0 失败**；覆盖脚本 `LoadGame` 的有效／缺失文件和调用线程等待。原版双区域隔离探针直接移动英雄触发切区和回访，读档请求定位到原地图；产品异步地图准备后恢复检查点、分发加载事件并显式启动，雷克萨和玩家控制存在，继续模拟 60 秒。日志在 `tmp/docs-artifacts/war3/loadgame-batch/`、`tmp/docs-artifacts/war3/loadgame-handoff/`。

窗口中的真实加载器与输入、自然走位、并发及错误交互、其他战役／地图、原版存档格式和完整玩法仍待阶段验收；隔离探针没有覆盖这些场景。


### 经典战役装饰物覆盖版本 1（待功能批次验证）

路径：`src/placed_definition.cpp`、`tests/map_tests.cpp`。经典版本 1 的 W3D 按无等级／数据指针的记录读取，重复字段使用元数据的 index 定位变体；版本 2 保持扩展布局。原版 OrcX01 的独立解析探针完整读取 19 条原始对象和 15 条自定义对象。为解除已知加载阻塞，Win32 Release 编译及真实地图定向夹具 **1 通过、0 失败**；后台地图准备和加载探针恢复英雄并模拟 60 秒，结束时玩家控制可用且未再次切区。日志在 `tmp/docs-artifacts/war3/loadgame-handoff/loader-final.log`。合批执行 `war3_map_tests <data-root> <output-root>`，并覆盖版本 2、变体字段、窗口交互、其他战役及原版表现。


### 玩家主动存档接口（待功能批次验证）

路径：`src/session.h`、`src/session_campaign.cpp`、`tests/clock_tests.cpp`。本地已启动会话可在安全边界发布检查点并分发保存事件，写入失败不分发；限制重入、待处理保存、退出及联机会话。合批编译执行 `war3_clock_tests <data-root> <output-root>`，检查手动保存、事件、恢复和非法路径；菜单、存档选择与原版行为尚待接入或验证。本次未执行功能测试。


### 游戏内本地存档面板（待功能批次验证）

路径：`src/game_flow_ui.{h,cpp}`、`src/game_view.cpp`、`src/session.h`、`src/session_campaign.cpp`、`tests/clock_tests.cpp`。单人 ESC 菜单使用源 `EscMenuSaveGamePanel.fdf` 的存档、编辑和覆盖确认控件；从独立用户目录 `Saves/Manual` 列出存档，支持输入、选择和滚轮。新文件采用不覆盖发布，已有文件需确认；联机会话不开放。合批构建客户端及 `war3_clock_tests`，验证保存、中文输入、列表、覆盖／取消、暂停和恢复；窗口布局、删除、读档入口与原版时序继续待验或实现。本次未执行功能测试。


### 原版装饰物与本地存档合批结果（窗口待验）

范围：`d9e2fd3`、`881beda`、`2359471`。Win32 Release 客户端、`war3_map_tests` 和 `war3_clock_tests` 编译通过；地图套件 **24 通过、0 失败**，会话套件 **120 通过、0 失败**。覆盖 OrcX01 版本 1 装饰物读取、手动检查点发布、保存事件、恢复、非法路径和未确认覆盖拒绝。日志位于 `tmp/docs-artifacts/war3/loadgame-handoff/manual-save-{batch-build,map,clock}.log`。

窗口尝试使用隔离用户目录和隐藏客户端，D3D9 创建设备失败，未进入游戏画面；日志 `tmp/docs-artifacts/war3/manual-save-batch/ui/game.log`。存档面板实际布局、中文输入、列表选择、覆盖确认与取消、保存后恢复，以及版本 2 装饰变体和原版时序仍待验证；删除与玩家读档入口尚未接入。上述窗口项保留在本批待测队列，不标记通过。


### 游戏内本地读档（待功能批次验证）

路径：`src/session.h`、`src/session_campaign.cpp`、`src/game_flow_ui.{h,cpp}`、`tests/clock_tests.cpp`。单人 ESC 菜单复用原 `EscMenuSaveGamePanel.fdf` 的读档控件，从 `Saves/Manual` 选择存档；地图及检查点校验成功后进入既有异步地图准备与恢复流程，校验失败保留当前对局并提示。联机会话不开放。合批构建客户端和会话套件，覆盖有效／缺失检查点、恢复和地图交接；窗口选择、错误提示、不同地图与原版交互仍待验证。本次未执行功能测试。


### 单人菜单读档列表（待功能批次验证）

路径：`src/saved_game_browser.{h,cpp}`、`src/main.cpp`、`CMakeLists.txt`。单人菜单接入原 `LoadSavedGameScreen.fdf`，列出独立用户目录中的手动存档，支持选择、键盘导航、滚轮和双击，并通过地图摘要定位后进入异步恢复。地图须位于游戏 `Maps` 目录；外部地图迁移、地图预览及原版存档格式仍待实现。合批构建客户端并检查空列表、键鼠导航、错误存档、战役／普通地图恢复和返回；本次未执行功能测试。


### 游戏内删除本地存档（待功能批次验证）

路径：`src/manual_save_deletion.h`、`src/session_campaign.cpp`、`src/game_flow_ui.{h,cpp}`、`tests/clock_tests.cpp`。存档面板选择本地文件后显示原版删除确认面板；确认期间持有目录和目标文件句柄，取消释放句柄，确认删除所持文件并刷新列表。拒绝路径穿越、重解析点和非普通文件。合批编译客户端与会话套件，验证取消、锁定期间替换拒绝、确认删除、错误路径和重复操作；窗口交互、异常中断和原版视觉仍待验。本次未执行功能测试。


### 本地读档与删除合批结果（窗口待验）

范围：`02f6f53`、`6e83ad2`、`22fbb61`。Win32 Release 客户端与 `war3_clock_tests` 编译通过，会话套件 **120 通过、0 失败**。覆盖手动读档的有效／缺失检查点与地图请求，以及删除准备、取消、持有期间替换拒绝、确认删除、路径穿越和重复删除拒绝。日志为 `tmp/docs-artifacts/war3/loadgame-handoff/load-browser-batch-{build,clock}.log`。

本机 D3D9 在前一批创建设备失败，复用该诊断；本批未执行窗口交互或视觉验证。主菜单和游戏内存档列表、键盘／鼠标、错误提示、实际地图交接与删除确认仍留待窗口验证；外部地图、地图预览及原版存档格式仍待实现。


### 存读档列表导航与滚动（待功能批次验证）

路径：`src/game_flow_ui.cpp`、`src/saved_game_browser.cpp`。游戏内读档默认选择首项，支持方向键、Home／End、翻页和双击；游戏内与单人菜单列表均使用源滚动条并支持箭头及拖动，游戏内列表使用源背景和选中高亮。合批检查空列表、长列表、键盘、滚轮、滑块、双击与游戏输入隔离；原版视觉与窗口运行仍待验。本次未执行功能测试。


### 单人读档地图预览与后台校验（待功能批次验证）

路径：`src/saved_game_browser.{h,cpp}`、`src/campaign_browser.{h,cpp}`、`src/main.cpp`。选择存档时后台检查检查点和地图摘要，读取原地图名称、作者与说明；快速切换只发布最新选择，双击等待当前结果。有效结果交给地图准备，恢复时再次校验存档与地图身份。退出列表时等待正在执行的文件读取完成。合批构建客户端，验证大存档、快速切换、损坏／替换、取消、双击和战役／普通地图恢复；原版预览图及窗口视觉仍待验证。本次未执行功能测试。


### 读档预览协作取消（待功能批次验证）

路径：`src/platform.{h,cpp}`、`src/snapshot_codec.h`、`src/session.h`、`src/session_campaign.cpp`、`src/saved_game_browser.{h,cpp}`、`tests/clock_tests.cpp`。检查点读取和 SHA-256 按块响应取消，选择变化或关闭列表时取消旧请求；预览一次读取检查点后复用元数据定位地图。单次系统文件读取、地图归档读取和解析无法中断，可能延迟退出。合批构建客户端与会话套件，检查取消、摘要损坏、切换及正常恢复；窗口交互仍待验。本次未执行功能测试。


### 存档列表与后台预览合批结果（窗口待验）

范围：`d34868a`、`1464144`、`b4a21b3`。Win32 Release 客户端、`war3_clock_tests`、`war3_map_tests` 编译通过；会话套件 **120 通过、0 失败**，地图套件 **24 通过、0 失败**。会话夹具覆盖正常检查点读取、地图摘要定位、损坏摘要拒绝，以及预先取消的文件／内存哈希、快照与检查点读取；未验证读取中途取消。日志为 `tmp/docs-artifacts/war3/loadgame-handoff/preview-batch-{build,clock,map}.log`。

窗口测试复用此前 D3D9 创建设备失败的诊断，未执行；列表导航、滑块、地图预览、快速切换与实际窗口恢复仍待验证。取消为协作式，单次系统文件读取、地图归档读取和解析仍可能延迟退出；原版预览图与外部地图支持仍待实现。


### 单人读档地图信息面板（待功能批次验证）

路径：`src/saved_game_browser.{h,cpp}`。读档列表复用原 `MapInfoPane.fdf`、选图页布局与地图尺寸／地形名称；后台从地图归档读取并解码预览图，主线程上传，缺图或解码失败显示原版未知地图图像。过期选择不发布图片。合批构建客户端，验证有图／无图／损坏图、快速切换、尺寸与布局；窗口视觉及原版对照仍待验。本次未执行功能测试。


### 载具坠毁的召唤单位伤害（待功能批次验证）

路径：`src/session_transport.cpp`、`tests/generate-transport-fixture.py`、`tests/transport_tests.cpp`、`docs/transport.md`。载具死亡时读取 `Achd` 的 `DataC`，对符合目标条件的召唤乘员应用实际伤害并在回调后检查生命周期；原始数值为零，自定义夹具使用 75。合批生成 `python watcher/war3/tests/generate-transport-fixture.py --data-root <root> --crash-damage --output tmp/docs-artifacts/war3/transport/crash-damage.w3m`，编译并执行 `war3_transport_tests <root> <fixture> crash-damage`，同时复验原始 `crash`；死亡／免疫／重入、原版伤害分类及窗口仍待验证。本次未执行功能测试。


### 外部地图的手动存档恢复（待功能批次验证）

路径：`src/session.h`、`src/session_campaign.cpp`、`src/saved_game_browser.cpp`、`src/campaign_browser.{h,cpp}`、`src/main.cpp`、`tests/clock_tests.cpp`。玩家手动选择存档时，可使用存档记录的确切外部地图路径；仅在文件扩展名和完整摘要匹配后交给地图准备，恢复时再次核对。脚本读档沿用既有目录范围。合批检查相同／变更外部地图、默认范围、普通与战役切换及窗口错误提示；地图移动后的搜索和原版文件格式仍待实现。本次未执行功能测试。


### 地图预览、外部存档与载具伤害合批结果（窗口待验）

范围：`69a9f3c`、`8f8313b`、`ef8b5a0`。Win32 Release 客户端、会话和运输测试目标编译通过；会话套件 **120 通过、0 失败**，覆盖外部地图精确路径／摘要匹配、默认范围拒绝和文件修改后拒绝。运输 `crash` 与 `crash-damage` 各 **1 通过、0 失败**，覆盖原始坠毁状态，以及自定义 75 伤害下普通与召唤乘员的生命和幸存状态。日志在 `tmp/docs-artifacts/war3/loadgame-handoff/external-cargo-batch-{build,clock}.log` 和 `tmp/docs-artifacts/war3/transport/crash-{baseline,damage}-batch.log`。

地图预览只完成客户端编译；D3D9 窗口环境仍不可用，界面、鼠标键盘与实际恢复交接未执行。召唤单位伤害的死亡／免疫／回调重入、伤害来源与原版分类仍待验证；外部地图迁移搜索和原版存档格式仍待实现。


### 迁移安装目录后的地图定位（待功能批次验证）

路径：`src/session_campaign.cpp`、`tests/clock_tests.cpp`。绝对地图提示失效时，从其 `Maps` 后的相对路径在当前安装的 `Maps` 内寻找候选，仍要求地图完整摘要一致；路径包含上级目录时不形成迁移候选，外部绝对路径仅在玩家读档入口显式允许。合批执行会话套件，覆盖迁移、大小写、摘要不匹配、目录范围及外部地图；实际跨安装移动、冲突和窗口加载待验证。本次未执行功能测试。


### 坠毁回调复活载具时保留剩余乘员（待功能批次验证）

路径：`src/session_transport.cpp`、`tests/generate-transport-fixture.py`、`tests/transport_tests.cpp`、`docs/transport.md`。乘员坠毁伤害回调复活载具时，尚未处理且仍属于载具的乘员回到清单；已处理或转移的乘员不重复加入。合批使用 `--crash-revive` 生成隔离夹具并运行 `war3_transport_tests <root> <fixture> crash-revive`，同时复验 `crash-damage`；载具移除、乘员转移及原版事件时序待验证。本次未执行功能测试。


坠毁回调补充：伤害事件移除载具后，剩余乘员继续释放，当前及后续乘员不再附加失效来源的坠毁状态。使用 `--crash-remove` 生成隔离夹具并合批执行 `war3_transport_tests <root> <fixture> crash-remove`；本补充与载具复活回调计作同一任务，本次未执行功能测试。


### 玩家读档文件身份校验（待功能批次验证）

路径：`src/session.h`、`src/session_campaign.cpp`、`src/campaign_browser.{h,cpp}`、`src/game_loading.{h,cpp}`、`src/game_view.h`、`src/main.cpp`、`tests/clock_tests.cpp`。玩家选定存档时保留已校验的完整文件摘要，地图准备和实际恢复均检查该摘要；被替换的存档在恢复前拒绝。脚本读档继续使用原有路径语义。合批编译客户端、会话及运输测试，覆盖原始／被替换存档、迁移地图与坠毁回调；窗口错误交互和原版时序仍待验证。本次未执行功能测试。


### 存档身份、地图迁移与运输回调合批结果（窗口待验）

范围：`b951d93`、`a9dc893`、`1c4b924`、`3310cac`。Win32 Release 客户端、会话与运输测试目标编译通过；会话套件 **120 通过、0 失败**，覆盖旧安装 `Maps` 路径迁移、地图摘要不匹配、存档替换后恢复拒绝及当前摘要恢复。运输 `crash-revive`、`crash-remove`、`crash-damage`、`crash` 各 **1 通过、0 失败**，覆盖脚本伤害回调复活／移除载具与既有坠毁场景。日志位于 `tmp/docs-artifacts/war3/loadgame-handoff/identity-cargo-batch-{build,clock}.log` 及 `tmp/docs-artifacts/war3/transport/crash*-identity-batch.log`。

窗口交互、实际目录迁移后的客户端加载、地图准备与加载之间替换文件、乘员转移及原版事件时序仍待验证；本机 D3D9 创建设备失败的窗口诊断沿用前批结果，未重复执行。


### 单位分类的完整条目匹配（待功能批次验证）

路径：`src/entities.h`、单位／技能／运输等分类消费者、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。单位分类按逗号分隔的完整条目匹配，动态添加的分类不被相似文本掩盖；技能目标、运输、修理和状态判定共用该规则。合批生成研究夹具并运行 `war3_research_tests <root> <fixture>`，覆盖相似分类、添加／移除、运输拒绝和允许；其他技能组合、原版边界及实际对局待验证。本次未执行功能测试。


### 武器攻击目标的完整条目匹配（待功能批次验证）

路径：`src/entities.h`、`src/session_entities.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。单位类型与单位实例的对空、对地分类按武器目标列表的完整条目判定。合批生成研究夹具并运行 `war3_research_tests <root> <fixture>`，覆盖相似目标名称和原始地面目标；自定义武器与实际对局待验证。本次未执行功能测试。


### 单位建筑目标的完整条目匹配（待功能批次验证）

路径：`src/session_entities.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。单位目标类型按完整 `structure` 条目标记，建筑自身仍保留建筑目标属性。合批生成研究夹具并运行 `war3_research_tests <root> <fixture>`，覆盖相似名称、明确目标和建筑；实际技能与对局待验证。本次未执行功能测试。


### 分类与目标条目匹配合批结果

范围：`ab33462`、`1ead1d7`、`b035471`。Win32 Release 客户端、研究和运输测试目标编译通过；研究测试进程通过，覆盖相似单位分类、动态分类、武器目标与建筑目标；运输 `flow` **1 通过、0 失败**。日志位于 `tmp/docs-artifacts/war3/research/token-batch-{build,research,transport}.log`，夹具位于 `tmp/docs-artifacts/war3/research/token-batch.w3m`。其他技能组合、自定义目标边界、原版对照和实际对局仍待验证。


### 修理目标的完整条目匹配（待功能批次验证）

路径：`src/session_repair.cpp`、`tests/generate-construction-fixture.py`、`tests/construction_tests.cpp`。修理单位时按完整条目检查空中、地面、建筑及非远古限制，人工与自动修理共用判定。合批使用 `--repair-targets partial` 和 `--repair-targets positive` 分别生成施工夹具，以 `war3_construction_tests <root> <fixture> repair-partial` 和 `repair-positive` 执行，再运行原始施工场景；原版边界及实际对局待验证。本次未执行功能测试。


### 无敌树木采集目标的完整条目匹配（待功能批次验证）

路径：`src/session_lumber.cpp`、`tests/generate-harvest-fixture.py`、`tests/harvest_tests.cpp`。采集命令及持续采集按完整 `invu` 或 `invulnerable` 条目判定无敌树木。合批分别使用 `--tree-targets partial`、`invu`、`invulnerable` 生成夹具，并以对应 `tree-partial`、`tree-invu`、`tree-invulnerable` 模式运行 `war3_harvest_tests`，覆盖命令与目标状态变化；自动寻找树木及原版边界仍待验证。本次未执行功能测试。


### 战斗与建筑等路径的单位分类匹配（待功能批次验证）

路径：`src/session_{ai_economy,ai_natives,arrow_status,construction,militia,orders,sacrifice_pit,teleport,weapons}.cpp`、`tests/research_tests.cpp`。攻击、传送、黑暗之箭、祭献、建造、民兵、命令及 AI 读取单位分类时按完整条目判断。合批运行研究夹具与 `war3_research_tests <root> <fixture>`，检查攻击相似守卫分类；其他具体技能、AI 与原版对局仍待专项验证。本次未执行功能测试。


### 修理、采集及单位分类合批结果

范围：`cc3eb89`、`4c48630`、`33192ab` 及修理夹具补充。Win32 Release 客户端、施工、采集和研究测试目标编译通过。施工原始场景、修理 partial／positive、采集原始场景、树木 partial／invu／invulnerable、研究场景共 **8 个进程通过、0 失败**；修理夹具覆盖工人实际的 Ahrp 能力后，两个失败场景重测通过。日志和夹具位于 `tmp/docs-artifacts/war3/target-batch/`。自动寻找无敌树木、其他技能与 AI 分类组合、原版对照及窗口对局仍待验证。


### 自动切换允许采集的无敌树木（待功能批次验证）

路径：`src/session.h`、`src/session_destructables.cpp`、`src/session_lumber.cpp`、`tests/harvest_tests.cpp`。当前树木失效后，寻找替代目标时复用采集能力的无敌目标许可。合批编译 `war3_harvest_tests`，使用前批 `--tree-targets invu` 和 `invulnerable` 夹具运行对应模式，覆盖自动切换；其他寻路、原版行为和实际对局待验证。本次未执行功能测试。


### 武器无敌目标许可（待功能批次验证）

路径：`src/session_weapons.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`。武器目标列表包含 `invu` 时允许下达攻击无敌单位的命令；伤害仍由原有无敌判定处理。合批生成研究夹具并执行 `war3_research_tests <root> <fixture>`，覆盖允许和拒绝命令；实际伤害、原版边界及窗口对局待验证。本次未执行功能测试。


### 哨兵无敌树木目标许可（待功能批次验证）

路径：`src/session_control_spells.cpp`、`tests/generate-stealth-fixture.py`、`tests/stealth_tests.cpp`。哨兵能力目标列表同时识别 `invu` 和 `invulnerable`，按完整条目处理无敌树木。合批分别生成 `--sentinel-targets partial`、`invu`、`invulnerable` 夹具，执行对应的 `sentinel-partial`、`sentinel-invu`、`sentinel-invulnerable` 模式并复验原始哨兵；原版边界和窗口效果仍待验证。本次未执行功能测试。


### 无敌目标与替代树合批结果

范围：`7dca81d`、`0b5717e`、`60ac541` 及本批补充。Win32 Release 客户端、采集、研究和隐身测试目标编译通过；原始采集、三种树木目标、研究、原始哨兵和三种哨兵目标共 **9 个进程通过、0 失败**。首轮编译定位并修正替代树筛选条件位置；原有哨兵测试的 121／61 秒时间步调整为不超过 60 秒后重测通过。日志和本批夹具在 `tmp/docs-artifacts/war3/invu-batch/`，采集夹具复用 `tmp/docs-artifacts/war3/target-batch/`。原版目标语义、实际伤害和窗口效果仍待对照验证。


### 修理无敌单位的目标许可（待功能批次验证）

路径：`src/session_repair.cpp`、`tests/generate-construction-fixture.py`、`tests/construction_tests.cpp`。建筑或机械单位无敌时，修理能力需包含 `invu` 或 `invulnerable` 目标条目；该检查覆盖直接命令、自动修理和持续阶段。合批分别生成 `--repair-targets vulnerable`、`invu`、`invulnerable` 夹具并执行对应 `repair-*` 模式，覆盖无敌状态变化及两种许可；原版边界和实际对局待验证。本次未执行功能测试。


### 修理扣费回调的订单一致性（待功能批次验证）

路径：`src/session_repair.cpp`、`tests/generate-construction-fixture.py`、`tests/construction_tests.cpp`。单位修理扣费回调后重新核对订单序号、所有权、技能及目标生命／身份，避免失效订单继续结算。合批生成普通施工夹具并运行 `war3_construction_tests <root> <fixture> repair-callback`，覆盖脚本在扣费事件中对同一目标重新发令；其他回调、原版事件时序与实际对局待验证。本次未执行功能测试。


### 自动修理的目标视野（待功能批次验证）

路径：`src/session_repair.cpp`、`tests/construction_tests.cpp`。自动修理只选择工人可见的受损单位，与桥梁目标的视野规则一致。合批运行普通施工夹具的 `repair-visibility` 模式，覆盖战争迷雾中的友军建筑与共享视野后的选择；隐身、原版自动修理时序和实际对局待验证。本次未执行功能测试。


### 修理许可、扣费回调与视野合批结果

范围：`31214cc`、`7d76ef0`、`86763d9` 及视野夹具补充。Win32 Release 客户端与施工测试目标编译通过；无敌许可三种配置、已有目标匹配两种配置、扣费回调、自动修理视野和原始施工共 **8 个进程通过、0 失败**。视野场景首轮受寻路阻挡，隔离寻路后确认迷雾拒绝和共享视野后的选择均通过。日志及夹具位于 `tmp/docs-artifacts/war3/repair-batch/`；原版视野／回调时序、真实寻路与实际对局仍待验证。


### 自动修理的命令区状态提示（待功能批次验证）

路径：`src/game_commands.cpp`。修理自动施放开启时，按钮复用现有源自动施放特效；关闭后状态提示消失。合批编译客户端，并在可用窗口环境中右键切换人族修理、兽族修理和暗夜修复，检查图标、实际自动修理及选区切换；本机窗口设备创建限制和原版视觉对照仍待处理。本次未执行功能测试。


### 多选自动施放切换（待功能批次验证）

路径：`src/game_commands.cpp`、`src/lan_action_encoder.cpp`、`tests/order_queue_tests.cpp`。右键切换法术或修理自动施放时，对已选且拥有相同能力的可控单位共同下发；实验联机将各单位动作编码在同一同步流。合批编译客户端和订单测试，执行 `war3_order_queue_tests <root> <fixture>` 验证实验联机多单位切换；实际窗口、多选混合状态及原版联机仍待验证。本次未执行功能测试。


### 多选工人的资源返回命令（待功能批次验证）

路径：`src/game_commands.cpp`、`src/lan_action_encoder.cpp`、`tests/order_queue_tests.cpp`。命令面板的返回资源按钮向已选、携带资源的可控工人发令，实验联机在同一同步流编码各工人命令。合批编译客户端和订单测试并运行 `war3_order_queue_tests <root> <fixture>`，覆盖不同资源的两名工人；实际窗口、路径、混合选区和原版联机仍待验证。本次未执行功能测试。


### 多选命令与自动修理提示合批结果（窗口待验）

范围：`80fb375`、`786cb03`、`68309ce` 及法术自动施放测试补充。Win32 Release 客户端及订单测试目标编译通过；BootyBay 原图订单套件退出码 0，输出 32 条 PASS（含汇总），覆盖实验联机多单位修理／法术自动施放和携带不同资源工人的返回命令；日志位于 `tmp/docs-artifacts/war3/group-ui-batch/`。实际窗口中的右键、特效、混合选区、路径与原版联机行为仍待验证。


### 返回资源的排队与替换命令（待功能批次验证）

路径：`src/player_commands.cpp`、`src/game_commands.cpp`、`src/lan_actions.cpp`、`tests/order_queue_tests.cpp`。Shift 返回资源进入工人命令队列；立即返回清除旧队列；实验联机保留排队标志。合批执行 BootyBay 的 `war3_order_queue_tests <root> <map> return-queue` 及完整订单套件，覆盖单机与多工人联机动作；窗口、原版时序及实际对局待验证。本次未执行功能测试。


### 分组命令的联机身份校验（待功能批次验证）

路径：`src/lan_action_encoder.cpp`、`tests/order_queue_tests.cpp`。分组自动施放和资源返回编码要求各单位具有不同网络对象身份，并检查单次发送的载荷上限；身份冲突直接拒绝整组。合批运行 BootyBay 的 `war3_order_queue_tests <root> <map>`，覆盖冲突拒绝和有效分组；真实双端与原版协议仍待验证。本次未执行功能测试。


### 目标命令保留 Shift 排队状态（待功能批次验证）

路径：`src/game_view.{h,cpp}`、`src/game_commands.cpp`、`src/game_selection_panel.cpp`、`src/game_hero_bar.cpp`。使用 Shift 进入移动、攻击、巡逻、采集、缠绕或修理目标模式后，选目标时保留排队状态；直接右键沿用右键当时的 Shift 状态。合批编译客户端和订单测试，窗口可用时检查按钮／快捷键、单位面板／英雄栏／地图／小地图目标及 Esc／右键取消；原版行为和实际视觉仍待验证。本次未执行功能测试。


### 返回资源队列与目标命令合批结果（窗口待验）

范围：`289ca7f`、`2279c78`、`b86f1f1`。Win32 Release 客户端及订单测试目标编译通过；BootyBay `return-queue` **1 通过、0 失败**，完整订单套件退出码 0、输出 32 条 PASS（含汇总），覆盖即时返回替换队列、排队返回、多工人联机排队和重复网络身份拒绝。日志位于 `tmp/docs-artifacts/war3/return-queue-batch/`。目标模式 Shift、取消及窗口视觉、真实双端与原版时序仍待验证。


### 圣光与死亡缠绕的无敌目标（待功能批次验证）

路径：`src/session_spells.cpp`、`tests/generate-control-fixture.py`、`tests/control_tests.cpp`。圣光及死亡缠绕的治疗与伤害目标均遵守源目标表对无敌单位的许可；实际伤害仍经过无敌判定。合批使用 `--light-targets partial`、`invu`、`invulnerable` 生成控制夹具并运行对应 `light-*` 模式，覆盖友军治疗和敌军伤害目标；施法效果、原版时序及对局窗口待验证。本次未执行功能测试。

圣光／死亡缠绕补充：许可目标时推进实际施法，检查友军恢复生命和无敌敌军不受伤害；与无敌目标任务合并计数，待同批验证。


### 英雄栏目标命令的子组选择（待功能批次验证）

路径：`src/game_hero_bar.cpp`。从英雄栏选择命令目标时复用地图和单位面板的子组修饰键规则，避免向整个混合选区误发命令。合批编译客户端；图形设备可用时检查混合选区、修饰键开关、排队及实验联机，原版交互待对照。本次未执行功能测试。


### 英雄栏选择商店购买者（待功能批次验证）

路径：`src/game_hero_bar.cpp`。商店选择购买者时点击英雄栏复用商店距离和权限校验，成功后保留商店选区；显形位置选择期间点击英雄栏保留目标模式并提示选择位置。合批编译客户端；图形设备可用时检查商店距离、库存、购买者权限、显形目标和取消行为，原版视觉及交互待对照。本次未执行功能测试。


### 圣光、死亡缠绕与英雄栏合批结果（窗口待验）

范围：`f80cb98`、`de1efd2`、`f29086d`、`597ae8e`。Win32 Release 客户端和控制技能测试目标编译通过；圣光／死亡缠绕三种目标配置及原始控制／净化场景共 **5 个进程通过、0 失败**，覆盖两种许可、相似条目拒绝、治疗与无敌伤害阻挡。日志和夹具位于 `tmp/docs-artifacts/war3/light-ui-batch/`。英雄栏子组、商店购买者与显形交互未做窗口验收；原版目标语义、事件时序和实际对局仍待对照。


### 禁止选区时英雄栏的目标操作（待功能批次验证）

路径：`src/game_view.cpp`、`src/game_hero_bar.cpp`。地图禁止单位选择时，英雄栏仍可作为技能、物品、商店和目标命令的入口；普通选区切换及空闲工人选择保持禁用。合批编译客户端；窗口可用时检查脚本关闭／恢复选择、英雄栏目标、F 键、商店及面板行为，原版交互待对照。本次未执行功能测试。


### 目标命令的右键取消（待功能批次验证）

路径：`src/game_view.cpp`。移动、攻击、采集和修理等目标模式中，右键只取消当前目标选择，不再同时发出移动或商店交互命令；Esc 同时清理排队标志。合批编译客户端；窗口可用时检查地图、小地图、命令面板、商店和 Shift 排队状态，原版交互待对照。本次未执行功能测试。


### 中立商店显形目标的 Esc 取消（待功能批次验证）

路径：`src/game_view.cpp`。选择显形位置时按 Esc 会先退出目标模式，保留游戏菜单关闭状态；其他技能与商店目标的 Esc 一并屏蔽后续菜单输入。合批编译客户端；窗口可用时检查显形、商店选择、技能目标、Esc 和菜单切换，原版交互待对照。本次未执行功能测试。


### 英雄栏与目标取消合批编译（窗口待验）

范围：`cc6a24f`、`5ea842a`、`abd46c1`。Win32 Release 客户端编译通过，日志位于 `tmp/docs-artifacts/war3/target-ui-batch/build.log`。本批没有可替代实际窗口输入的功能测试；英雄栏目标、右键与 Esc 取消、显形和商店模式仍列为待测。本机先前的 D3D9 创建设备失败证据为 `tmp/docs-artifacts/war3/manual-save-batch/ui/game.log`，本次环境未变化，未重复启动窗口。


### 眩晕期间暂停采集与交付（待功能批次验证）

路径：`src/session_harvest.cpp`、`tests/harvest_tests.cpp`。工人眩晕或其他共享眩晕状态期间不继续采矿、伐木和交付，采矿／伐木周期保留剩余时间；恢复后继续原订单。合批使用普通采集夹具执行 `war3_harvest_tests <root> <fixture> stunned`，覆盖伐木暂停／恢复及金币交付；矿内、光环／变形及原版时序待验证。本次未执行功能测试。


### 眩晕期间暂停修理和开工（待功能批次验证）

路径：`src/session_repair.cpp`、`src/session_construction.cpp`、`tests/construction_tests.cpp`。工人眩晕时保留已有修理订单并暂停修复，不能启动待建建筑；状态解除后继续工作。合批运行普通施工夹具的 `stunned-work` 模式并复验原施工场景；协助建造、其他控制状态与原版时序待验证。本次未执行功能测试。


### 暂停矿井的采矿计时（待功能批次验证）

路径：`src/session_harvest.cpp`、`tests/harvest_tests.cpp`。矿井被暂停时，已进入矿井的工人暂停采矿并保留剩余周期；矿井恢复后继续采集。合批使用普通采集夹具运行 `war3_harvest_tests <root> <fixture> mine-paused` 并复验原始采矿；其他矿井类型、离开／销毁与原版时序待验证。本次未执行功能测试。


### 工人控制状态与矿井暂停合批结果

范围：`19b91ec`、`21dbe9d`、`7379031`。Win32 Release 客户端、采集和施工测试目标编译通过；原始采集、工人眩晕、矿井暂停、原始施工、眩晕施工／修理及修理回调共 **6 个进程通过、0 失败**。专项使用会话中的持续眩晕状态，覆盖暂停期间不结算、剩余周期、订单保留和恢复；日志与夹具位于 `tmp/docs-artifacts/war3/worker-control-batch/`。真实技能施加／解除、其他矿井、原版时序及窗口对局仍待验证。


### 电脑野怪目标的武器可攻击性（待功能批次验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。电脑筛选可达营地时，使用单位实际可用武器检查目标并以该武器射程判断；跨岛运输候选也要求具备可攻击目标的武器。合批执行 CampaignAI 的 `reachable` 场景，覆盖近战无法对空、弓箭手对空及既有路径选择；复杂混编、运输、原版选点与完整对局待验证。本次未执行功能测试。

电脑营地补充：同一营地内逐个考虑可攻击成员，避免首个成员不可攻击时遗漏其余目标；`reachable` 夹具增加混合空地营地检查，与营地武器任务合并计数，待同批验证。


### 混合部队选择可攻击的空中营地（待功能批次验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。地面队员能接近目标或获得运输时，混合部队允许由可对空的飞行单位判定营地可攻击；地面无法加入且无运输时仍避免仅凭飞行单位选择隔离目标。合批运行 CampaignAI `reachable`，覆盖步兵和狮鹫对空营地；实际运输、部队组合、原版选点和完整对局待验证。本次未执行功能测试。


### 电脑混合部队对不可直接攻击目标的跟进（待功能批次验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`。队长攻击目标时，不能直接攻击的队员在命令未被回调改写的前提下攻击移动至目标附近，避免混合部队原地停滞。合批运行 CampaignAI `reachable`，覆盖步兵跟进、狮鹫攻击空中目标；动态目标、运输、原版策略及完整对局待验证。本次未执行功能测试。


### 电脑营地选择与混合部队合批结果

范围：`32a1065`、`1b75eab`、`5f2347b`、`7f87f8d`、`e0fa4a8` 及路径查询缓存补充。Win32 Release 客户端与 CampaignAI 测试目标编译通过；`reachable` **2 通过、0 失败**，覆盖近战不能对空、可攻击的混合营地、狮鹫对空及步兵跟进；`island-auto`、`island-target` 各 **1 通过、0 失败**，`fog-attack` **2 通过、0 失败**。路径查询缓存调整后重编译并重测 `reachable` 2/0。日志和夹具在 `tmp/docs-artifacts/war3/ai-target-batch/`；原版选点、复杂混编、实际窗口及完整对局仍待验证。

电脑目标补充：攻击回退前复核目标仍存活、未隐藏且敌对，避免向回调中失效或转为友军的目标发出旧订单。重新编译客户端及 CampaignAI 后，`reachable`、`fog-attack`、`island-auto-target-death` 分别 **2/0、2/0、1/0**；日志位于 `tmp/docs-artifacts/war3/ai-target-batch/*-callback.log`。该补充与混合部队任务合并计数。


### 电脑攻击跟进的隐身目标（待功能批次验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`。目标对电脑隐身时，直接攻击失败不会将其当前位置用于攻击移动；解除隐身后恢复正常攻击。合批运行 CampaignAI `fog-attack`，覆盖隐身期间保留已有命令及显形后攻击，并复验迷雾和混合部队；探测、回调变化、随机路线和原版对局待验证。本次未执行功能测试。


### 电脑迷雾目标的敌我关系（待功能批次验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`。迷雾中的目标成为友军后，电脑不会再向其当前位置发出攻击移动；恢复敌对后可继续进攻。合批运行 CampaignAI `fog-attack`，覆盖联盟变化前后与现有隐身、迷雾场景；原版联盟策略及实际对局待验证。本次未执行功能测试。


### 电脑随机路线的无效目标（待功能批次验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`。建立路线或运输计划前检查目标存活、可见状态及敌我关系，隐身、隐藏、移除或友军目标不替换既有命令；可攻击目标继续进入随机路线。合批运行 CampaignAI `ai-random-paths`、`fog-attack`、`reachable` 和运输场景，覆盖随机路线、目标恢复及既有进攻；原版随机路径策略和真实对局待验证。本次未执行功能测试。


### 电脑目标状态与路线合批结果

范围：`894cebf`、`bab2a3f`、`dfc4c5a`。Win32 Release 客户端和 CampaignAI 测试目标编译通过；`fog-attack`、`ai-random-paths`、`reachable`、`island-auto`、`island-auto-target-death` 分别 **2/0、1/0、2/0、1/0、1/0**（通过／失败）。覆盖隐身及联盟变化时保留订单、恢复敌对后进攻、随机路线、混合部队与自动运输；日志和夹具位于 `tmp/docs-artifacts/war3/ai-visibility-batch/`，编译日志为 `tmp/docs-artifacts/war3/ai-visibility-batch-build.log`。目标在途中变化、探测、原版策略、真实窗口及完整对局仍待验证。


### 电脑跨岛运输途中目标状态变化（待功能批次验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`。运输波次执行前和续运时检查目标隐身及敌我关系，目标不可侦测或成为友军时取消已有运输波次并使用现有乘员释放流程。合批运行 CampaignAI `island-auto-target-invisible`、`island-auto-target-invisible-aboard`、`island-auto-target-ally` 及死亡和正常运输场景，覆盖已登船乘员释放；多波次状态、原版策略与实际对局待验证。本次未执行功能测试。


### 已有攻击目标的联盟变化（待功能批次验证）

路径：`src/session_combat.cpp`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`。电脑进攻和防守使用非强制攻击；非强制攻击在目标转为友军后停止追击与攻击；玩家显式强制攻击继续使用武器目标规则。合批运行 CampaignAI `fog-attack` 及战斗相关场景，覆盖联盟变化和强制攻击；弹道已发射、事件重入、原版时序与实际对局待验证。本次未执行功能测试。


### 跟随目标消失后的订单（待功能批次验证）

路径：`src/session_combat.cpp`、`tests/campaign_ai_tests.cpp`。普通跟随目标进入隐身、迷雾或隐藏状态后停止追踪并清理路径，避免持续获取其位置；特殊补给跟随沿用自身处理。合批运行 CampaignAI `fog-attack` 及相关移动场景，覆盖目标显隐、路径清理和既有攻击；原版最后可见位置、事件及实际窗口操作待对照。本次未执行功能测试。


### 运输目标、联盟和跟随合批结果

范围：`0e3a681`、`9ffd815`、`0346cd0`、`620b8eb`、`e2440e5` 及电脑非强制攻击补充。Win32 Release 客户端、CampaignAI 和订单队列测试目标编译通过。首次 `fog-attack` 发现电脑直接攻击沿用强制参数，修正后重编译并重跑受影响场景：`fog-attack`、`reachable` 各 **2/0**；`ai-random-paths`、`island-auto`、`island-auto-target-death`、`island-auto-target-invisible`、`island-auto-target-invisible-aboard`、`island-auto-target-ally` 各 **1/0**（通过／失败）；BootyBay `war3_order_queue_tests` 退出 0，输出 **32 条 PASS**。日志与夹具位于 `tmp/docs-artifacts/war3/ai-follow-batch/`。多波次、已发射弹道、原版时序和实际窗口对局仍待验证。


### 地图物品和可破坏物枚举上下文（待功能批次验证）

路径：`src/session_inventory.cpp`、`src/session_destructables.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。矩形枚举的动作回调保留当前过滤对象并设置枚举对象，结束后恢复外层上下文；回调前仍复核对象存活。合批生成 destructable 夹具并运行 `war3_destructable_tests <root> <fixture>`，覆盖两类对象过滤／回调；嵌套枚举、过滤时移除和原版事件上下文待对照。本次未执行功能测试。


### 组枚举过滤回调移除单位（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。组枚举过滤期间若后续回调移除已接受的单位，最终组不再保留失效句柄；仍保留其他有效成员。合批生成 destructable 夹具并执行 `war3_destructable_tests <root> <fixture>`，覆盖 `FirstOfGroup` 与成员查询；嵌套回调、已销毁组及原版时序待对照。本次未执行功能测试。


### 地面物品枚举期间的拾取（待功能批次验证）

路径：`src/session_inventory.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。矩形枚举在筛选及回调前复核物品仍位于地面，筛选回调中被收入库存的后续物品不再作为地面对象枚举。合批生成 destructable 夹具并执行 `war3_destructable_tests <root> <fixture>`，覆盖回调拾取；对象移动、嵌套枚举及原版时序待对照。本次未执行功能测试。


### 地图枚举与回调合批结果

范围：`35bc5ce`、`b738f01`、`7939e8e`。Win32 Release 客户端及 `war3_destructable_tests` 编译通过，生成独立地图后主场景、`invalid-handles` 和 `snapshot` 三个进程均退出 0，日志共 **4 条 PASS**。主场景覆盖物品／可破坏物过滤和回调上下文、过滤时移除单位、枚举时拾取后续物品及既有采木／研究；日志及夹具位于 `tmp/docs-artifacts/war3/enumeration-batch/`。嵌套枚举、对象重定位、原版回调时序及实际地图窗口仍待验证。


地图枚举上下文补充：原版静态入口确认过滤与枚举使用不同上下文槽；夹具新增物品嵌套枚举及外层上下文恢复检查，合并原枚举任务计数，待后续批次执行。


### 单位组接口的失效句柄（待功能批次验证）

路径：`src/session.cpp`、`src/session_entities.cpp`、`tests/destructable_tests.cpp`。单位组查询和修改对空、已销毁或错误类型的组／单位返回空值或无操作，正常成员操作保持可用。原版 1.27 `Game.dll` 的 `FirstOfGroup`、`IsUnitInGroup`、`GroupRemoveUnit`、`GroupClear`、`DestroyGroup` 入口分别为 `0x6f1e0850`、`0x6f1e8920`、`0x6f1e6e30`、`0x6f1e6940`、`0x6f1df640`，句柄解析失败均直接返回。合批生成 destructable 夹具并执行 `war3_destructable_tests <root> <fixture>`；嵌套组遍历及原版事件时序待对照。本次未执行功能测试。


### 失效单位组的遍历与筛选（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。失效组不会触发组遍历或枚举；矩形、地点和玩家参数失效时保留现有组，过滤回调销毁目标组后停止枚举。原版 1.27 `ForGroup` 与 `GroupEnumUnitsInRect` 入口 `0x6f1e0c50`、`0x6f1e6a50` 对组解析失败直接返回，矩形解析失败也直接返回。合批运行 `war3_destructable_tests <root> <fixture>`；销毁组的回调时序与其他枚举变体仍待原版对照。本次未执行功能测试。


### 组命令的失效组和地点（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/destructable_tests.cpp`。即时、点和目标组命令对失效组返回 false；地点版本对失效地点返回 false，不发出单位命令。原版 1.27 的 `GroupImmediateOrderById`、`GroupTargetOrderById` 和 `GroupPointOrderByIdLoc` 在 `0x6f1e6d60`、`0x6f1e6e80`、`0x6f1e6dd0` 检查句柄并在解析失败时返回零。合批生成 destructable 夹具并运行测试；多单位事件重入及完整原版组命令返回规则仍待验证。本次未执行功能测试。


### 单位组句柄与命令合批结果

范围：`c75fc74`、`8cf817f`、`776f6a4`，含 `1a6dc96` 嵌套物品枚举补充。Win32 Release 客户端、destructable 和 CampaignAI 目标编译通过；destructable 主场景、`invalid-handles`、`snapshot` 三个进程均退出 0，共 **4 条 PASS**，覆盖失效组／单位／地点、过滤回调销毁组和嵌套物品枚举。CampaignAI 的 `reachable`、`armies`、`fog-attack` 各 **2 通过、0 失败**。日志和夹具在 `tmp/docs-artifacts/war3/group-handles-batch/`。原版回调销毁时序、多单位命令返回规则与实际地图窗口仍待对照。


### 玩家组接口的失效句柄（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。玩家组增删、查询、清空、销毁、枚举及遍历在组或玩家句柄失效时返回空值或无操作；筛选回调销毁目标组后停止枚举。原版 1.27 的 `ForForce`、`DestroyForce`、`ForceClear`、`ForceEnumPlayers` 和 `ForceEnumAllies` 入口分别为 `0x6f1e0c30`、`0x6f1df620`、`0x6f1e0cf0`、`0x6f1e0d90`、`0x6f1e0d10`，句柄解析失败直接返回。合批运行 destructable 夹具；过滤器重入时序及实际原图待对照。本次未执行功能测试。


### 筛选回调中的单位组和玩家组状态（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。有过滤器的单位组和玩家组枚举在筛选前清空旧成员，并逐个发布已接受成员，供后续筛选回调读取；失效组停止执行。原版 1.27 的单位组枚举初始化 `0x6f222c60` 调用清组路径 `0x6f20be70`，筛选回调 `0x6f216391` 通过后在 `0x6f2163a1` 加入单位；玩家组枚举 `0x6f211290` 清空并逐个筛选。合批运行 destructable 夹具，覆盖旧成员清除及后续过滤器读取前序结果；同组嵌套枚举、过滤器主动修改及原版动态时序待验证。本次未执行功能测试。


### 玩家枚举的范围和联盟过滤顺序（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。玩家枚举限制在 0–11 号槽位；联盟枚举先运行筛选器，再按当前联盟关系决定是否加入玩家组。原版 1.27 `0x6f211320` 至 `0x6f2113f7` 先调用过滤表达式，随后检查联盟并在玩家编号达到 12 时结束循环。合批执行 destructable 夹具，覆盖中立玩家排除和敌方过滤回调；空槽、联盟变更重入及原版运行时仍待对照。本次未执行功能测试。


### 玩家组和筛选时序合批结果

范围：`78e209d`、`3f21418`、`ff48bcd`。Win32 Release 客户端、destructable 和 clock 测试目标编译通过；destructable 主场景及 `invalid-handles` 两个进程退出 0，输出 **3 条 PASS**，覆盖玩家组失效句柄、筛选销毁、回调可见成员、0–11 号枚举范围和联盟过滤顺序；`war3_clock_tests` **120 通过、0 失败**。日志和夹具位于 `tmp/docs-artifacts/war3/force-enumeration-batch/`。同组嵌套枚举、空槽和原版运行时、实际地图窗口仍待对照。


### 地面对象枚举的失效矩形（待功能批次验证）

路径：`src/session_destructables.cpp`、`src/session_inventory.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。物品及可破坏物枚举收到空或已移除矩形时直接返回，不触发过滤或动作回调。原版 1.27 的两个入口 `0x6f1e0140`、`0x6f1e0230` 均在矩形解析失败时跳过枚举。合批运行 destructable 夹具，覆盖空及已移除矩形；原版嵌套回调时序仍待对照。本次未执行功能测试。


### 物品和普通命令目标的 Esc 优先级（待功能批次验证）

路径：`src/game_view.cpp`。物品或普通命令处于目标选择时，Esc 优先退出目标模式并消费菜单输入，保留同一单位的法术书页面及生产／复活队列。合批编译客户端；窗口可用时检查打开法术书后选择物品目标、复活队列期间命令目标、Esc 与后续菜单输入，原版交互待对照。本次未执行功能测试。


### 商店目标选择的右键取消（待功能批次验证）

路径：`src/game_view.cpp`。商店选中且物品、技能、建造或显形目标模式激活时，右键优先交给目标取消处理，不会先把点击的单位切换为购买者。合批编译客户端；窗口可用时在商店显形及自定义商店技能／物品目标中右键可购买单位和地面，检查取消、购买者及随后普通右键行为，原版交互待对照。本次未执行功能测试。


### 界面目标取消与枚举边界合批结果

范围：`5019ed8`、`38456a2`、`da51c75`。Win32 Release 客户端与 destructable 测试目标编译通过；主场景及 `invalid-handles` 两个进程退出 0，共 **3 条 PASS**，覆盖空／已移除矩形枚举及既有对象与脚本集合场景。日志和夹具位于 `tmp/docs-artifacts/war3/ui-cancel-enumeration-batch/`。Esc、右键、法术书和商店购买者属于实际窗口输入，当前未进行窗口验收；本机先前 D3D9 设备失败记录为 `tmp/docs-artifacts/war3/manual-save-batch/ui/game.log`。原版交互和实际地图仍待对照。


### 普通命令目标模式的取消按钮（待功能批次验证）

路径：`src/game_commands.cpp`。攻击、移动、巡逻、采集和修理等普通命令等待目标时，命令面板显示取消按钮；点击后清理目标模式和排队标志。存在建造或升级状态时，目标取消优先于施工取消。合批编译客户端；窗口可用时检查各目标模式、按钮／右键／Esc、Shift 和菜单状态，并对照原版布局与行为。本次未执行功能测试。


### 右键取消目标后的输入消费（待功能批次验证）

路径：`src/game_view.h`、`src/game_view.cpp`。右键取消普通命令、技能、物品、建造、商店及菜单目标后消费该次右键，避免同帧继续触发命令面板自动施法切换；法术书和普通目标同时存在时先取消目标。合批编译客户端；窗口可用时将鼠标置于自动施法图标并在各目标模式中右键，检查模式取消且开关不变，原版输入时序待对照。本次未执行功能测试。


### 普通目标模式的命令快捷键（待功能批次验证）

路径：`src/game_view.cpp`。普通命令等待目标时不再执行隐藏的移动、停止、保持等命令快捷键，目标取消后恢复常规快捷键。合批编译客户端；窗口可用时检查攻击／移动等目标模式下按 S、M、H、Esc，确认当前目标和单位订单，再对照原版键盘行为。本次未执行功能测试。


### 普通目标命令界面合批编译（窗口待验）

范围：`1b5408a`、`615f192`、`19c48a8`。Win32 Release 客户端编译通过，日志 `tmp/docs-artifacts/war3/target-command-batch/build.log`。本批未执行窗口输入或功能测试；取消按钮、右键输入消费、目标期间快捷键及原版交互继续待验。此前 D3D9 设备创建失败的本机记录为 `tmp/docs-artifacts/war3/manual-save-batch/ui/game.log`，本次未重复启动窗口。


### 计数组枚举的零与负数上限（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/game_flow_tests.cpp`、`tests/generate-destructable-fixture.py`。计数单位组的零上限不限数量，负数按无符号上限；计数玩家组的零上限为空，负数按无符号上限。原版 1.27 的组筛选路径 `0x6f216318` 将零视为无上限，玩家组路径 `0x6f211323` 使用无符号比较。合批运行 game flow 和 destructable 夹具；不同过滤器及原版动态行为待对照。本次未执行功能测试。


玩家组计数补充：原版在 `0x6f2112ef` 初始化独立计数，筛选并通过联盟规则后由 `0x6f2113de` 增量更新；回调自行增删玩家不改变枚举计数。实现及夹具已同步，作为计数枚举任务补充，待同批验证。


### 未知单位类型的组枚举（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/game_flow_tests.cpp`。类型名称无法解析时，普通及计数组枚举不清空已有成员，也不执行过滤回调。原版 1.27 的 `GroupEnumUnitsOfType` 与计数版本入口 `0x6f1e6b50`、`0x6f1e6ba0` 在类型解析结果为 `-1` 时直接返回。合批运行 game flow 测试，覆盖未知类型及随后正常枚举；本次未执行功能测试。


### 玩家组遍历中的成员变更（待功能批次验证）

路径：`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。`ForForce` 在遍历每个玩家前读取当前成员状态；回调移除尚未访问的玩家或加入后续玩家时，后续遍历反映变更。原版 1.27 在 `0x6f212220` 每轮读取组位集，遍历范围为 0–15。合批运行 destructable 夹具，覆盖回调移除和添加；嵌套遍历、组销毁和原版动态时序仍待对照。本次未执行功能测试。


### 计数枚举与玩家组遍历合批结果

范围：`7db5dfc`、`e5b8d3b`、`2abb0f2`、`0037e17`。Win32 Release 客户端、destructable、game flow 和 CampaignAI 目标编译通过；destructable 与 game flow 两个进程均退出 0，共输出 **3 条 PASS**；CampaignAI `reachable`、`armies` 各 **2 通过、0 失败**。覆盖零／负数上限、未知类型保留已有成员、过滤回调对玩家组计数的影响、遍历中增删成员及原公共 AI。日志和夹具位于 `tmp/docs-artifacts/war3/counted-groups-batch/`。原版动态回调、更多自定义地图及实际窗口仍待对照。


### 枚举动作中的过滤上下文和空回调（待功能批次验证）

路径：`src/session_inventory.cpp`、`src/session_destructables.cpp`、`src/session_collections.cpp`、`tests/generate-destructable-fixture.py`、`tests/destructable_tests.cpp`。物品和可破坏物的动作执行时保留对应过滤对象；空动作仍执行过滤但不调用脚本，`ForGroup` 空动作无操作。原版 1.27 的物品和可破坏物回调分别在 `0x6f1e98ed`、`0x6f1df8ed` 设置过滤上下文，动作结束后在 `0x6f1e9952`、`0x6f1df952` 清理；空动作在调用前跳过。合批运行 destructable 夹具，覆盖嵌套恢复、空动作及过滤器；原版动态时序仍待对照。本次未执行功能测试。

枚举上下文最小复现：Win32 Release `war3_destructable_tests` 编译通过，重新生成夹具后主场景退出 0、输出 **2 条 PASS**，覆盖动作中的过滤对象、嵌套恢复和空动作过滤；日志及夹具位于 `tmp/docs-artifacts/war3/enum-context-correction/`。此前枚举批次的动作上下文断言已由本次原版指令证据和新夹具替代；原版实际运行时仍待对照。该最小复现不构成后续整批验证。


### 玩家联盟接口的失效玩家（待功能批次验证）

路径：`src/session.cpp`、`tests/game_flow_tests.cpp`。`SetPlayerAlliance` 在任一玩家无效时无操作，`GetPlayerAlliance` 对无效玩家返回 false；有效联盟关系和事件保持现有流程。原版 1.27 `SetPlayerAlliance` 入口 `0x6f1f6030` 在任一玩家解析失败时返回，`GetPlayerAlliance` 入口 `0x6f1e3c50` 对首个玩家解析失败返回零；第二个无效玩家的安全返回是客户端保护。合批运行 game flow 夹具，覆盖空／错误类型及有效非对称联盟；原版异常参数和事件时序仍待对照。本次未执行功能测试。


### 玩家资源税率的失效参数（待功能批次验证）

路径：`src/session.cpp`、`tests/game_flow_tests.cpp`。税率设置在玩家句柄失效时无操作，查询在玩家或资源类型无效时返回零；有效税率及原有上限规则保持。原版 1.27 的 `SetPlayerTaxRate` 入口 `0x6f1f6380` 和 `GetPlayerTaxRate` 入口 `0x6f1e4110` 检查双方玩家，查询仅处理黄金和木材。合批运行 game flow 夹具，覆盖空／错误类型玩家、无效资源及有效税率；实际资源转账与原版游戏模式仍待对照。本次未执行功能测试。


### 枚举上下文与玩家接口合批结果

范围：`8fec43c`、`51e8713`、`0e78b50`。Win32 Release 客户端、destructable 和 game flow 目标编译通过；两个测试进程退出 0，共输出 **3 条 PASS**，覆盖枚举动作上下文／空动作、失效玩家联盟和税率及有效关系。game flow 测试文件第 20 行的既有 `optional<unsigned>` 与整数比较产生两条 C4389 警告。日志及夹具位于 `tmp/docs-artifacts/war3/script-context-player-batch/`；原版动态回调、资源转账及实际地图窗口仍待对照。


### MIDI 声音音调请求（待功能批次验证）

路径：`src/sound.cpp`、`tests/sound_tests.cpp`、`docs/script-sound.md`。MIDI 源表非单位 Pitch 不阻断创建，脚本设置音调时维持序列播放速率；普通数字声音沿用现有速率处理。原版 1.27 底层 `0x6f173940` 仅对流、普通采样及 3D 采样调用播放速率接口。合批构建 `war3_sound_tests`，执行 `sound_map_table_overlay`、`sound_midi_pitch_preserves_playback` 与相关声音回归；原版 MIDI 动态行为、实际音频设备和异常值仍待验证。本次未执行功能测试。


### 静音声音切换到实际设备（待功能批次验证）

路径：`src/sound.cpp`、`tests/sound_tests.cpp`、`docs/script-sound.md`。静音播放者转为实际设备时恢复播放阶段、循环、音调与位置，设备时长不一致时限制位置；创建或恢复失败前保留旧播放者。合批构建 `war3_sound_tests` 并运行 `sound_unmute_preserves_paused_playback`、`sound_playback_state_miles_roundtrip` 及声音回归；实际设备、播放／暂停／停止、读档、时长差异和原版表现仍待验证。本次未执行功能测试。


### 声音播放位置标记（待功能批次验证）

路径：`src/session_sound.cpp`、`tests/sound_tests.cpp`、`docs/script-sound.md`。`SetSoundPlayPosition(sound, -1)` 保持当前播放位置；原版数字与 MIDI 路径分别在 `0x6f33d1fe`、`0x6f33d184` 跳过该标记。合批运行 `sound_position_minus_one_keeps_playing` 和声音回归；其他负数、实际设备和原版动态效果待验证。本次未执行功能测试。


### 声音播放状态合批结果

范围：`b91cb30`、`a1c05ed`、`84b8d32` 及本次声音测试夹具修正。Win32 Release 客户端与 sound 目标构建通过。`war3_sound_tests <data-root> <scratch-root>` 首轮 **15 通过、7 失败**；其中 4 项因 `waveOutOpen() failed` 无法打开实际音频设备：`sound_playback_state_miles_roundtrip`、`sound_unmute_preserves_paused_playback`、`sound_channel_preemption_and_owned_detach`、`sound_fade_pulses_drive_muted_miles_and_release`，保留待设备可用后重测。另 3 项为独立脚本缺少句柄声明及两处沿用物理设备计数的旧夹具；修正后分别 **1 通过、0 失败**。新 MIDI 音调、源表覆盖和位置标记用例均在首轮通过。日志位于 `tmp/docs-artifacts/war3/sound-position-batch/`，构建日志为 `tmp/docs-artifacts/war3/sound-position-batch-build.log`。实际设备状态切换及原版动态行为仍待验证。


### 玩家单位与科技计数的失效句柄（待功能批次验证）

路径：`src/session_game.cpp`、`src/session_match.cpp`、`tests/game_flow_tests.cpp`。单位数、建筑数、按名称单位数和科技数查询对空或类型不匹配玩家返回零；有效玩家沿用现有计数。原版 1.27 四个入口 `0x6f1e42a0`、`0x6f1e40e0`、`0x6f1e4230`、`0x6f1e4190` 在玩家解析失败时返回零。合批运行 `war3_game_flow_tests` 及相关地图场景，核对失效句柄、有效计数、升级和所有权变化；原版动态行为待验证。本次未执行功能测试。


### 战役对话框快捷键来源（待功能批次验证）

路径：`src/session.h`、`src/session_match.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-flow.md`。脚本 `GetLocalizedHotkey` 读取 `UI/MiscUI.txt` 的 `[Hotkeys]`，按原版单引号字节／整数形式解析，未知键返回零；独立于 FDF 显示文字。合批运行 game flow 夹具，检查原版胜负对话框键、非显示文字键和缺失键；实际窗口输入、地图覆盖和原版动态行为待验证。本次未执行功能测试。


### 脚本对话框失效句柄（待功能批次验证）

路径：`src/session_script_dialogs.cpp`、`tests/game_flow_tests.cpp`。销毁、清空、设置消息及显示对失效对话框无操作，添加按钮返回空句柄；显示时玩家失效也无操作。原版 1.27 的对应入口 `0x6f1dfb50`、`0x6f1dfa40`、`0x6f1dfbe0`、`0x6f1df9a0`、`0x6f1df9f0`、`0x6f1dfb70` 检查对象解析结果。合批运行 game flow 夹具，核对空／已销毁／类型不匹配句柄及有效对话框点击和事件；原版动态时序、实际窗口待验证。本次未执行功能测试。


### 玩家计数与脚本对话框合批结果

范围：`33c8fa7`、`06748c6`、`03b7803`。Win32 Release 客户端和 game flow 测试目标构建通过；测试文件既有 unsigned／int 比较产生两条 C4389 警告。`generate-game-flow-fixture.py` 生成正确夹具后，`war3_game_flow_tests <data-root> <fixture>` 和 `war3_game_flow_tests <data-root> <fixture> lan-dialog` 各退出 0、各输出 1 条 PASS，覆盖失效玩家计数、源快捷键、失效对话框和有效事件，以及实验联机对话框状态。首次误用 destructable 夹具导致两次 `Unknown JASS entry: ProbeDialog`，更换为 game flow 夹具后上述两项通过；日志位于 `tmp/docs-artifacts/war3/dialog-count-batch/`。原版动态行为、地图覆盖、双客户端及实际窗口输入仍待验证；本机先前 D3D9 无法创建设备，本批未重复窗口启动。


### 娜迦工人建造（待功能批次验证）

路径：`src/session.h`、`src/session_construction.cpp`、`src/game_loading.{h,cpp}`、`src/game_commands.cpp`、`tests/construction_tests.cpp`、`docs/construction.md`。娜迦工人读取源建造列表和 `CmdBuildNaga` 文本／快捷键，支持工人进入建筑并完成施工；原始命令未提供图标／位置时使用 `CmdBuild` 配置。原版 `nmpe` 含六种建造类型；Naga／Orc 建造类三个关键虚表项一致。合批用 `generate-construction-fixture.py` 生成地图并运行 `war3_construction_tests <data-root> <fixture>`，覆盖列表、施工进度和释放；取消／恢复、采集、原版时序和窗口图标仍待验证。本次未执行功能测试。


### 原版中立与娜迦单位种族（待功能批次验证）

路径：`src/session_entities.cpp`、`src/session_construction.cpp`、`tests/construction_tests.cpp`、`docs/jass.md`。娜迦、野怪、平民和小动物分别使用源种族编号 11、8、9、10；其他保持 7。建造按钮按同一娜迦编号选择。原版 1.27 种族表 `0x6fb69fb8`、单位类型写入 `0x6f64f95d` 及两个种族查询入口证明静态映射。合批运行 construction 夹具，检查原版五类单位的 `GetUnitRace`／`IsUnitRace` 和娜迦施工；地图覆盖、类型转换与原版动态行为待验证。本次未执行功能测试。


### 中立工人建造（待功能批次验证）

路径：`src/session_construction.cpp`、`src/game_loading.{h,cpp}`、`tests/construction_tests.cpp`、`docs/construction.md`。中立单位使用源 `CmdBuild` 入口和建造列表，工人进入建筑施工；原版 `ndrl` 为 `creeps` 且有四种建造类型，`CAbilityNeutralBuild` 与 `CAbilityOrcBuild` 的第 17、18、19 虚表项一致。合批运行 construction 夹具核对达拉内尔工人菜单、施工和释放；其他中立种族、取消与恢复、实际窗口及原版动态行为待验证。本次未执行功能测试。


### 娜迦与中立工人合批结果

范围：`6134260`、`e62deea`、`0fab530` 及本次取消施工检查。Win32 Release 客户端和 construction 目标构建通过；`generate-construction-fixture.py` 生成地图后运行 `war3_construction_tests <data-root> <fixture>`，退出 0、输出 1 条 PASS。该进程检查娜迦和达拉内尔工人源建造列表、进入施工、进度、完成与取消后的释放，及五类原版单位种族查询，同时覆盖既有四族施工和资源流程；夹具通过脚本设置资源与进度。新增测试局部变量更名后测试目标重新编译通过，无编译警告。日志位于 `tmp/docs-artifacts/war3/neutral-build-batch/`。实际窗口按钮及图标、自然对局、施工恢复、地图覆盖和原版动态时序仍待验证；此前 D3D9 设备不可用，本批未启动窗口。


### 鼓舞权杖的操纵死尸（待功能批次验证）

路径：`src/session_item_use.cpp`、`tests/corpse_tests.cpp`、`docs/corpses.md`。原版 `stre` 使用 `AInd`／`ACad` 复活尸体，按源参数创建限时单位并处理物品冷却；复合物品同样接受该原型。合批生成 corpse 夹具并运行 `war3_corpse_tests <data-root> <fixture> items`，核对原版权杖、来源、时限、尸体及冷却，并回归卷轴；原版时序、多个尸体、实际窗口与地图覆盖待验证。本次未执行功能测试。


### 影子风衣夜间隐身（待功能批次验证）

路径：`src/session.h`、`src/session_stealth_reveal.cpp`、`src/session_visibility.cpp`、`tests/stealth_tests.cpp`、`docs/visibility.md`。原版 `clsd` 携带 `Ashm`，装备后参与现有影遁的夜晚、移动和昼夜流程；失去物品或装备能力时隐身查询立即失效。合批生成 stealth 夹具，运行 `war3_stealth_tests <data-root> <fixture> cloak` 并回归 `flow`、`meld`；多来源叠加、禁用、地图覆盖、原版动态效果和实际窗口待验证。本次未执行功能测试。


### 传送物品的单位目标（待功能批次验证）

路径：`src/session.h`、`src/session_item_use.cpp`、`src/game_inventory_drag.cpp`、`tests/control_tests.cpp`、`docs/teleport.md`。传送权杖和回城卷轴的目标模式支持直接选中单位或建筑，保留地面／小地图位置查找和双击自动选择基地；召回护符与黑暗召唤仍为点目标。合批运行 control 夹具 `dark-summoning` 检查目标类型和指定句柄，回归点目标；实际窗口命中、双击及原版行为待验证。本次未执行功能测试。


### 物品能力与目标合批结果

范围：`904ab5c`、`b3239db`、`317f29b`。Win32 Release 客户端、corpse、stealth 和 control 目标构建通过；control 测试文件既有变量遮蔽产生一条 C4456 警告。分别生成三个夹具后，`war3_corpse_tests` 的 `items`、`scrolls`，`war3_stealth_tests` 的 `cloak`、`flow`、`meld`，以及 `war3_control_tests` 的 `dark-summoning` 各 **1 通过、0 失败**，未加载 Game.dll。覆盖原版权杖尸体／时限／冷却、影子风衣昼夜／移动／禁用／移除、传送物品目标分类与指定句柄，以及相关既有流程。日志和夹具位于 `tmp/docs-artifacts/war3/item-effects-batch/`。真实窗口中的目标命中、双击和隐身画面、原版动态时序及地图覆盖仍待验证；本机先前 D3D9 无法创建设备，本批未启动窗口。


### 自定义单位未知种族（待功能批次验证）

路径：`src/session_entities.cpp`、`tests/generate-construction-fixture.py`、`tests/construction_tests.cpp`、`docs/jass.md`。非空未知种族及 `_` 返回零，原版名称保持对应编号；缺失字段保留默认值。原版 1.27 `0x6f668de0` 匹配失败返回零，比较调用区分大小写。合批使用 `--race-overrides` 生成地图并运行 `war3_construction_tests <data-root> <fixture> race-custom`，核对自定义单位的查询与比较；空字段、类型转换和实际地图仍待对照。本次未执行功能测试。


### 施工及升级进度的失效单位（待功能批次验证）

路径：`src/session_construction.cpp`、`tests/construction_tests.cpp`、`docs/construction.md`。`UnitSetConstructionProgress` 和 `UnitSetUpgradeProgress` 对空、已移除和类型不匹配句柄无操作，有效建筑沿用原有进度及事件流程。原版 1.27 入口 `0x6f1fb290`／`0x6f1fb2d0` 在单位解析失败时返回。合批运行 construction 夹具，核对失效句柄以及有效施工／升级；真实地图与原版动态时序待验证。本次未执行功能测试。


### 尸体控制的失效单位（待功能批次验证）

路径：`src/session_corpses.cpp`、`tests/corpse_tests.cpp`、`docs/corpses.md`。尸体衰变开关和爆炸标记对失效单位无操作；有效单位沿用现有状态。原版 1.27 入口 `0x6f1fb3d0`、`0x6f1f7480` 在解析失败时返回。合批运行 corpse 夹具 `flow`，覆盖空／移除／类型不匹配单位及有效尸体衰变状态；其他状态条件、事件与原版动态行为待验证。本次未执行功能测试。


### 单位种族与生命周期接口合批结果

范围：`bd7fdbf`、`bf5b99a`、`86520e7`。Win32 Release 客户端、construction 与 corpse 测试目标构建通过，无编译警告。分别生成普通施工、`--race-overrides` 和尸体夹具后，`war3_construction_tests <data-root> <fixture>`、同程序 `race-custom` 及 `war3_corpse_tests <data-root> <fixture> flow` 均退出 0，各输出 1 条 PASS；覆盖未知／占位／大小写及娜迦种族、失效单位的施工／升级和尸体控制、有效施工与尸体回归。日志和夹具位于 `tmp/docs-artifacts/war3/unit-lifecycle-batch/`。原版动态行为、单位转换、尸体其他状态条件及实际窗口仍待验证。


### 尸体暂停与复活生命周期（待功能批次验证）

路径：`src/session_corpses.cpp`、`tests/corpse_tests.cpp`、`docs/corpses.md`。存活单位不保存衰变暂停，复活清除尸体暂停状态，后续死亡正常计时；已死亡且有尸体的单位沿用暂停与恢复。原版 1.27 的 `UnitSuspendDecay` 检查死亡标志 `0x100` 及尸体状态。合批运行 corpse 夹具 `animation-lifecycle`、`decay` 与 `flow`；英雄、特殊尸体、原版动态时序和实际窗口待验证。本次未执行功能测试。

### 战役缓存英雄经验暂停（待功能批次验证）

路径：`src/session_cache.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-gamecache.md`。恢复单位不覆盖新英雄的经验暂停状态，使原图跨关脚本能按自身流程调整英雄等级；旧缓存格式继续读取。Win32 Release 核心编译通过，`UndeadX07b` 人为击杀首领并加载 `UndeadX07c` 的定向诊断中，暂停经验的源英雄等级 4，恢复后的英雄等级 3、用户数据 2468；日志 `tmp/docs-artifacts/war3/undead-exit-probe/chain-fixed.log`。合批生成 game flow 夹具并运行 `war3_game_flow_tests <data-root> <fixture> cache-sync-unit`，覆盖暂停标志的磁盘重载及实验同步；同时回归原图跨关链。原版动态行为、创建事件重入及实际窗口待验证。

### 单位缓存的失效句柄（待功能批次验证）

路径：`src/session_cache.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-gamecache.md`。`StoreUnit`、`HaveStoredUnit`、`FlushStoredUnit` 和 `RestoreUnit` 安全处理空或类型不匹配的缓存，恢复时还检查玩家；有效缓存内容不受影响。原版 1.27 对应入口 `0x6f1f8380`、`0x6f1e71e0`、`0x6f1e0b20`、`0x6f1f3210` 在句柄解析失败时返回。合批运行 `war3_game_flow_tests <data-root> <fixture> cache-sync-unit`，覆盖无效缓存与玩家、有效缓存不变以及恢复流程；原版动态行为和实际地图仍待验证。本次未执行功能测试。

### 数值战役缓存的失效句柄（待功能批次验证）

路径：`src/session_cache.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-gamecache.md`。数值／字符串的存取、查询和清除，以及任务／缓存清空，对无效缓存返回对应默认结果或无操作。原版 1.27 整数与清空入口 `0x6f1f8280`、`0x6f1e5710`、`0x6f1e70f0`、`0x6f1e09f0`、`0x6f1e0a40`、`0x6f1e0920` 均先检查缓存；字符串读取入口 `0x6f1e57c0` 返回空句柄。合批执行 game flow 的 `cache-sync-unit`，核对四种类型的失效句柄和有效数据保留；原版动态行为与原图异常路径待验证。本次未执行功能测试。

### 战役缓存句柄与英雄恢复合批结果

范围：`9eaf6c7`、`4b812b3`、`8102e03`。Win32 Release 客户端及 game flow 测试目标构建通过；game flow 测试文件原有 `unsigned`／`int` 比较产生两条 C4389 警告。重新生成夹具后，`war3_game_flow_tests <data-root> <fixture> cache-sync-unit` 和不带模式的 game flow 检查均退出 0、各输出 1 条 PASS；覆盖四种数值类型及单位缓存的无效句柄、有效值保留、暂停状态的磁盘恢复和实验同步。亡灵原图隔离探针将英雄传送到首领区域并直接击杀首领，胜利换关后 `UndeadX07c` 的阿尔萨斯为 3 级、用户数据为 2468。日志和夹具位于 `tmp/docs-artifacts/war3/gamecache-handles-batch/`；原图探针为人为触发，不代表自然战斗。原版动态行为、创建事件重入、真实窗口及完整战役仍待验证。

### 目标地图默认技能与缓存恢复（待功能批次验证）

路径：`src/session_cache.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-gamecache.md`。恢复缓存单位时保留目标地图创建时已有能力，再合入缓存能力及等级，避免目标地图专用的默认引导能力丢失。Win32 Release 核心编译通过；`UndeadX08` 隔离探针中，恢复的阿尔萨斯含原图 `ANcl`，进入方尖碑后执行 852600 引导，观测 7 秒仍处于施法且留在区域；日志 `tmp/docs-artifacts/war3/undead-08-transfer/obelisk-channel-fixed.log`。合批运行 game flow `cache-sync-unit` 的目标默认能力和既有缓存回归，并在原图核对完整占领、打断与交接；原版动态覆盖／移除能力及窗口表现待验证。

目标地图默认技能的补充回归路径：`tests/map_tests.cpp` 新增 `campaign_restored_channel`，隔离用户目录中保存 `UndeadX07c` 英雄、由 `UndeadX08` 原图脚本恢复并在方尖碑引导，核对原图 `ANcl`、英雄身份数据和占领；合批运行 `war3_map_tests <data-root> <scratch-directory> campaign_restored_channel`。定向探针观察第二方尖碑完整 30 秒引导和占领，日志 `tmp/docs-artifacts/war3/undead-08-transfer/obelisk-channel-complete.log`；新回归尚未编译执行，原版动态及实际窗口仍待验证。此项属于 `7e776ec` 的补充，不单独计入功能批次。

### 英雄复活的失效位置（待功能批次验证）

路径：`src/session_revival.cpp`、`tests/revival_tests.cpp`、`docs/heroes.md`。`ReviveHeroLoc` 对空、已移除和错误类型的位置返回 false；原版 1.27 入口 `0x6f1f3380` 在位置解析失败时返回零。Win32 Release 核心编译通过；`UndeadX08` 隔离诊断依次传送阿尔萨斯到四处并暂停伊利丹、保护玩家建筑，修复后四处计数达到 4，胜利过场推进至 379.656 秒发出 `ArthasIllidanFight.mdl` 请求，日志 `tmp/docs-artifacts/war3/undead-08-transfer/four-obelisks-fixed.log`。合批运行 `war3_revival_tests <data-root> <fixture> invalid-revive-location`，回归有效复活和失效英雄／位置；原版动态、自然战斗和窗口过场仍待验证。

### 资料片片尾的预加载刷新（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。同步预加载立即读取资源，主脚本与预加载脚本可调用 `PreloadRefresh` 完成当前刷新步骤；原版 1.27 `0x6f1f2160` 调用资源队列处理。Win32 Release 核心编译通过；此前 `War3XBonusCredits` 在原图 `PreloadRefresh` 中断，修复后携带胜利缓存的隔离会话运行至约 566.7 秒并返回，日志 `tmp/docs-artifacts/war3/undead-08-transfer/credits-fixed.log`。合批运行 `war3_map_tests <data-root> <scratch> campaign_expansion_credits` 并回归英雄引导／复活；原版异步时序、完整模型预热、音频和窗口片尾待验证。

### 亡灵原图引导、复活与资料片片尾合批结果

范围：`7e776ec`、`17d5f29`、`dc1c93d`，含补充 `5f3407d`、`69e245d`。Win32 Release 客户端、map、game flow 和 revival 目标构建通过；game flow 测试文件原有两条 C4389 有符号／无符号比较警告，复活测试重新编译无警告。重新生成两个夹具：game flow 的 `cache-sync-unit` 输出 1 条 PASS，revival 的 `invalid-revive-location` 为 1 通过／0 失败；原图 map 检查 `campaign_restored_channel` 和 `campaign_expansion_credits` 各为 1 通过／0 失败。覆盖目标地图默认技能与磁盘恢复、空／失效复活位置、原图方尖碑引导和资料片片尾脚本返回。夹具及日志位于 `tmp/docs-artifacts/war3/campaign-credits-batch/`。单独预加载脚本、原版异步预热及能力覆盖语义、自然战斗、实际 UI 和过场画面仍待验证。

### 兽族区域回访英雄状态回归（待功能批次验证）

路径：`tests/orc_campaign_chain_tests.cpp`、`docs/save-runtime-foundation.md`。新增 `zone-return`，使用独立用户目录执行原图 OrcX01 至 OrcX01_02 再通过检查点回访，核对英雄用户数据、物品及恢复后的移动。等价临时探针已完成，日志 `tmp/docs-artifacts/war3/orcx-hero-return/result2.log`；正式回归尚未编译执行，合批命令为 `war3_orc_campaign_chain_tests <data-root> zone-return <new-absolute-user-dir>`。玩家实际操作、窗口加载、事件顺序及原版存档格式待验证；此测试补充不单独计入功能任务批次。

### 招募队友跨区域回访回归（待功能批次验证）

路径：`tests/orc_campaign_chain_tests.cpp`、`docs/save-runtime-foundation.md`。新增 `quest-shop-return` 模式，在原图 Strange Brew 任务招募陈后，经双区域切换和检查点回访核对队伍状态、用户数据及三件初始物品。等价隔离诊断通过，日志 `tmp/docs-artifacts/war3/orcx-chen-transfer/result2.log`；正式回归尚未编译执行，合批运行 `war3_orc_campaign_chain_tests <data-root> quest-shop-return <new-absolute-user-dir>`。自然行走、窗口加载、其他队员与原版存档格式待验证；此回归不单独计入功能批次。

### 预加载空字符串（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。主脚本及独立预加载脚本的 `Preload` 接受空字符串句柄并无操作；有效名称沿用同步归档读取。原版 1.27 入口 `0x6f1f2020` 对空指针或空字符串返回。合批运行 `war3_map_tests <data-root> <scratch> campaign_expansion_credits`，覆盖空句柄／空字符串及原图片尾；独立预加载脚本与资源时序待验证。本次未执行功能测试。

### 预加载结束超时（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。同步预加载的主脚本与独立预加载脚本调用 `PreloadEnd` 时不再因超时参数抛出异常；原版 1.27 入口 `0x6f1f2050` 将超时传入资源队列等待。合批运行 `war3_map_tests <data-root> <scratch> campaign_expansion_credits`，覆盖负数超时及原图片尾；独立脚本、原版等待时序与特殊浮点值行为待验证。本次未执行功能测试。

### 对局归档读取记录基础（待功能批次验证）

路径：`src/archive.h`、`src/archive.cpp`、`src/world.cpp`、`tests/archive_tests.cpp`。对局资源视图及其派生视图可记录成功读取的实际成员名，包括缓存命中和候选回退；记录去重、并发保护和溢出标记，独立对局与后台资源视图隔离。合批构建并运行 `war3_archive_tests <scratch-root> <data-root>`，覆盖缓存、候选、并发和隔离。此基础尚未绑定 `PreloadGen*` 或生成文件；原版资源打开时序、路径格式和多线程排序仍待对照。本次未执行功能测试。

### 预加载兼容及资源记录批次结果

范围：`0203e91`、`f46f034`、`b9905b0`，包含 `5620661`、`17248be` 两项既有回归补充。Win32 Release 客户端、归档、地图和兽族战役测试目标构建成功，构建日志未发现 warning/error。`war3_archive_tests` 10 通过／0 失败；`campaign_expansion_credits` 1／0；`zone-return` 和 `quest-shop-return` 各 1／0。日志与独立用户目录位于 `tmp/docs-artifacts/war3/preload-recording-batch/`，构建日志为 `tmp/docs-artifacts/war3/preload-recording-batch-build.log`。独立预加载脚本、原版异步资源时序、原版文件打开时机、实际窗口及自然战斗仍待验证；资源记录尚未接入生成器。

### 预加载脚本生成和回读（待功能批次验证）

路径：`src/session_game.cpp`、`src/session.h`、`src/platform.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。接入生成开始、清除、结束以及用户目录脚本回读，隔离读写目录并限制文件大小；合批运行 `war3_map_tests <data-root> <scratch> preload_generator_roundtrip`，核对去重、重复开始、文件生成、路径约束和实际执行回读。缓存命中与原版文件打开时机、生成文件格式边界、读写失败、原版加载优先级及完整 native 环境仍待对照。本次功能测试待批次执行。

### 预加载独立脚本公共声明（待功能批次验证）

路径：`src/jass_runtime.h`、`src/jass_runtime.cpp`、`src/session_game.cpp`、`tests/jass_runtime_tests.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。预加载独立脚本读取原版 `common.j`，按兼容类型布局继承预加载、枚举转换、字符串及数学接口，未继承的 native 保留未绑定失败语义。合批运行 `war3_jass_runtime_tests <literal-fixture.json>` 和 `war3_map_tests <data-root> <scratch> preloader_common_natives`，覆盖类型布局、受限绑定及脚本调用；其他 native、临时脚本回调生命周期、原版动态行为和独立运行环境完整性仍待实现和对照。

### 预加载脚本失败隔离（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/campaign-preloader.md`。独立预加载脚本编译或执行失败时记录调试信息并返回主脚本，原版 `0x6f1f2232` 编译失败和 `0x6f1f225c` 执行后均清理返回。合批运行 `war3_map_tests <data-root> <scratch> preloader_common_natives`，覆盖坏语法隔离、未绑定 native 明确报错及随后执行有效脚本；原版诊断、资源读取失败和预算边界仍待动态对照。

### 预加载生成和独立脚本批次结果

范围：`1c7d598`、`550e58c`、`0db06bc`，含修正 `5f3af26`。Win32 Release 客户端、map、JASS runtime、archive 目标构建成功，构建日志未发现 warning/error。`preload_generator_roundtrip`、`preloader_common_natives`、`campaign_expansion_credits` 各 1 通过／0 失败；archive 10／0；JASS runtime 首轮 17／1，新增夹具缺少参数名，修正后 18／0。修正后重测公共脚本和 JASS；生成往返及片尾在修正前已通过，修正只影响子脚本错误处理及测试夹具，复用原结果。日志位于 `tmp/docs-artifacts/war3/preloader-roundtrip-batch/`，构建日志位于同级 `preloader-roundtrip-batch-build.log` 与 `preloader-roundtrip-batch-rebuild.log`。原版异步预热、完整 native 覆盖、本地文件优先级及实际窗口仍待验证。

### 预加载脚本玩家状态（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。独立预加载脚本继承玩家句柄、名称、资源状态与版本查询接口；复用会话的玩家状态修改和事件分发。合批运行 `war3_map_tests <data-root> <scratch> preloader_player_state_event`，检查名称、资源和嵌套的主脚本玩家状态事件；异步回调、其他 native 及原版行为仍待对照。

### 预加载脚本游戏缓存（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。独立预加载脚本继承游戏缓存的基础值读取、写入、清理与持久化接口，复用当前会话缓存。合批运行 `war3_map_tests <data-root> <scratch> preloader_gamecache_persistence`，检查独立运行时销毁后的整数和字符串，以及清空后磁盘重载；单位快照、同步和原版行为仍待对照。

### 预加载脚本哈希表（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。独立预加载脚本继承哈希表基础值和玩家、哈希表句柄读写接口，其他句柄接口保持未绑定。合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，覆盖跨 native 的玩家句柄、嵌套表和字符串读取；其余句柄类型及原版行为待对照。

### 预加载脚本玩家状态、缓存与哈希表批次结果

范围：`6b7ba54`、`b24fc96`、`3965f8d`。Win32 Release 客户端与地图测试目标构建成功，构建日志未发现 warning/error。`preloader_player_state_event`、`preloader_gamecache_persistence`、`preloader_hashtable_handles`、`preloader_common_natives`、`preload_generator_roundtrip` 各 1 通过／0 失败，覆盖主脚本嵌套触发玩家状态事件、子运行时销毁后的缓存值及磁盘重载、玩家及嵌套表句柄、生成与回读。日志位于 `tmp/docs-artifacts/war3/preloader-state-batch/`，构建日志位于 `tmp/docs-artifacts/war3/preloader-state-batch-build.log`。其余 native、异步回调、原版动态对照及实际窗口仍待验证。

### 暗夜精灵末章和终章回归（待功能批次验证）

路径：`tests/map_tests.cpp`。新增 `campaign_nightelf_finale`，在隔离用户目录中以原图检查开场控制、直接清理水坝任务目标、清除敌方目标建筑、胜利切换请求及终章过场返回。等价分段诊断：末章开场推进 600 秒、胜利请求在约 288.6 秒、终章约 93.75 秒返回，水坝任务在直接击杀四个目标后完成；日志位于 `tmp/docs-artifacts/war3/nightelf-final-diagnostic/`。正式回归待合批编译执行；直接击杀和分段手动载入不代表自然战斗、自动窗口交接或视觉验收。该测试补充不单独计入功能任务批次。

### 预加载生成记录随存档恢复（待功能批次验证）

路径：`src/archive.h`、`src/archive.cpp`、`src/session.h`、`src/session_game.cpp`、`src/session_recovery_bundle.cpp`、`tests/clock_tests.cpp`、`docs/save-runtime-foundation.md`。恢复包保存并恢复资源记录及生成器计时，兼容版本 60 的既有恢复包。Win32 Release 核心及 clock 目标编译通过，必要定向检查 `preload_recording_recovery` 为 1 通过／0 失败，日志 `tmp/docs-artifacts/war3/preload-recovery/clock.log`；合批回归受影响的恢复包及已登记的 `campaign_nightelf_finale`。保存写盘、原版生成器跨存档语义及并发资源读取需进一步验证。

### 预加载记录存档文件回归（待功能批次验证）

路径：`tests/clock_tests.cpp`。扩展 `preload_recording_recovery`，在独立用户目录写入实际检查点，验证文件摘要、恢复启动、继续记录以及生成脚本保留存档前后资源；合批设置 `WAR3_CLOCK_FILTER=preload_recording_recovery` 运行 `war3_clock_tests <data-root> <output-root>`。新增文件往返断言尚未编译执行，原版文件格式和原版生成器跨存档语义仍待对照；此测试补充不单独计入功能任务批次。

### 沉默特殊攻击类别（待功能批次验证）

路径：`src/combat.h`、`src/entities.h`、`src/session_arrow_status.cpp`、`src/session_attack_ground.cpp`、`src/session_combat_destructable.cpp`、`src/session_siege_attacks.cpp`、`src/session_weapons.cpp`、`tests/generate-harvest-fixture.py`、`tests/harvest_tests.cpp`、`docs/dark-arrows-silence.md`。Special 位作用于仅以 tree、debris 或 wall 为目标的单类武器，保留普通攻击和伐木能力；合批生成 `--special-silence` 地图，运行 `war3_harvest_tests <data-root> <fixture> silence-special`，并回归普通沉默与采集。必要定向用例 1 通过／0 失败，日志 `tmp/docs-artifacts/war3/silence-special/result-final.log`；原版 1.27 动态结果、其他特殊目标、混合目标及订单取消时机仍需对照。

### 云雾自定义目标筛选（待功能批次验证）

路径：`src/session.h`、`src/session_human_channels.cpp`、`src/session_spells.cpp`、`tests/caster_tests.cpp`、`tests/generate-caster-fixture.py`、`docs/human-casters.md`。云雾区域按源目标标志筛选单位类型及敌友，原版默认建筑配置继续生效；合批重建 caster 夹具，运行 `war3_caster_tests <data-root> <fixture> cloud-targets` 并覆盖既有施法目标。原版 1.27 的特殊目标、自己／非自己、不可见、魔免和区域刷新时序仍待动态对照。

### 预加载记录、特殊沉默与云雾批次结果

范围：`28fbfd7`、`c6f159d`、`76e0a32`，包含回归补充 `e9f526a`、`b114218` 和测试修正 `2811aa2`。Win32 Release 客户端、clock、map、harvest、caster 和 control 目标构建成功；control 测试文件有 3 条既有 C4456 局部变量遮蔽警告。clock 首轮 120 通过／1 失败：英雄夹具将保留小数成长余量的内部属性误判为必须等于整数；改用脚本可见基础属性后该项重测 1／0，其余 120 项复用首轮结果。云雾自定义用例首轮将敌对中立单位误判为不匹配，修正预期后 1／0；预加载真实检查点文件往返、暗夜末章和终章、特殊沉默、复合沉默物品各 1／0，既有 caster 目标筛选 6／0；普通采集和 caster 默认流程均退出 0 并输出 PASS。日志位于 `tmp/docs-artifacts/war3/cloud-recovery-batch/`，构建日志为 `tmp/docs-artifacts/war3/cloud-recovery-batch-build.log`。原版 1.27 特殊攻击和云雾自定义目标动态行为、原版存档格式及实际窗口仍待对照。

### 预加载脚本哈希表句柄与地点（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。独立预加载脚本继承已绑定的哈希表句柄读写及地点创建、查询和移除接口；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，核对地点句柄通过哈希表读回并作用于玩家状态。其他对象创建及回调生命周期、原版动态行为仍待验证。

### 预加载脚本空间操作（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。独立预加载脚本继承地点移动及矩形创建、修改、查询、移除和世界边界接口，复用会话空间对象；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，核对地点与矩形句柄经哈希表保存、加载、移动和状态消费。地形高度、无效句柄及原版行为待阶段验证。

### 预加载脚本随机流（待功能批次验证）

路径：`src/session_game.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。独立预加载脚本的随机种子、整数与实数查询共享所在会话的实际随机流；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，核对预加载脚本生成并保存的整数及主脚本继续获取的随机数，与相同种子下的序列一致。随机实数和原版动态行为待阶段验证。

本组预加载接口增量编译：`cmake --build --preset release --target war3 war3_map_tests --parallel 8` 成功；行为回归及原版对照仍按上述待测项合批执行。

### 失效地点的移动与高度查询（待功能批次验证）

路径：`src/session_world.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。地点移动与高度查询处理空、移除或不兼容句柄，避免脚本中断；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，覆盖空和已移除地点以及之后的脚本操作。固定版 1.27 的两个 native 入口对解析失败直接返回，注册与指令见本地 `tmp/docs-artifacts/war3/location-invalid/`；有效高度、错误类型和原版动态行为待阶段验证。

### 失效矩形的创建和操作（待功能批次验证）

路径：`src/session_world.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。矩形创建和操作复核地点／矩形句柄，失效时返回空句柄或直接返回；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，覆盖重复移除、失效矩形修改／移动、失效地点创建及脚本续行。原入口指令在 `tmp/docs-artifacts/war3/location-invalid/rect-assembly.txt`；有效矩形、错误类型和原版动态行为待阶段验证。

地点与矩形句柄修正的合并增量编译：`cmake --build --preset release --target war3 war3_map_tests --parallel 8` 成功；新增行为回归尚未执行。

### 失效矩形边界与中心查询（待功能批次验证）

路径：`src/session_world.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。六项矩形边界及中心查询对失效句柄返回零；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，覆盖空、已移除及错误类型句柄，并保留有效矩形中心查询。原版 1.27 入口和零值读取见 `tmp/docs-artifacts/war3/location-invalid/rect-query-assembly.txt`；原版动态行为和所有有效边界待阶段验证。

### 失效区域的几何操作与包含查询（待功能批次验证）

路径：`src/session_spatial_events.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。失效区域及其矩形、地点、单位参数不再中断地图脚本；合批运行 `war3_map_tests <data-root> <scratch> preloader_hashtable_handles`，覆盖区域有效几何、空句柄与重复移除。区域事件重入、错误类型、实际地图和原版动态行为待阶段验证。原版 1.27 静态入口记录位于 `tmp/docs-artifacts/war3/location-invalid/region-assembly.txt`。

矩形查询及区域操作合并增量编译：`cmake --build --preset release --target war3 war3_map_tests --parallel 8` 成功；新增行为回归尚未执行。

### 区域清除边界（待功能批次验证）

路径：`src/spatial_region.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。矩形减法清除边界并保留紧邻的浮点坐标；合批运行 `war3_map_tests <data-root> <scratch> region_subtraction_boundaries`，覆盖四边、角、邻近值、完整清除及零宽清除。地图事件、区域快照与原版网格对齐行为待批次验证。

区域清除增量编译：`cmake --build --preset release --target war3 war3_map_tests --parallel 8` 成功；修正新增夹具的整数到浮点转换警告后单独重编译地图测试目标成功。新增行为回归未执行。

### 区域和距离事件的回调重入（待功能批次验证）

路径：`src/session_spatial_events.cpp`、`tests/clock_tests.cpp`、`docs/jass.md`。空间事件分发前重新检查候选成员和目标生命周期；合批设置 `WAR3_CLOCK_FILTER=region_event_rechecks_after_callback` 运行 `war3_clock_tests <data-root> <output-root>`，验证首个回调移走后续单位及其再次进入。Win32 Release 客户端和 clock 目标编译成功；最小复现首轮缺少 `destructable` 类型声明，补充后该项重测 1 通过／0 失败。距离事件、退出、过滤器重入、恢复包和原版时序待阶段验证。

### 区域格子边界（待功能批次验证）

路径：`src/spatial_region.cpp`、`tests/map_tests.cpp`、`docs/jass.md`。格子按左闭右开处理相邻边界；合批运行 `war3_map_tests <data-root> <scratch> region_subtraction_boundaries`，验证清除一格后边界归属相邻格。负坐标、地图原点、区域事件及原版网格对齐仍待验证。

### 预加载与空间对象合批结果

范围：`0a17102`、`43ab642`、`ce97edc`、`7c7ba37`、`495158f`、`8430793`、`476d13b`、`56dd780`、`32c8a9d`。在本组格子边界修改前，Win32 Release 已编译客户端、地图和 clock 目标；`preloader_hashtable_handles`、`region_subtraction_boundaries`、`preloader_common_natives`、`preload_generator_roundtrip`、`spatial_events_rebuild_members_filters_and_order`、`region_event_rechecks_after_callback` 各 1 通过／0 失败。前两项与后续格子边界相关，需在下一批重测；其他结果可复用。原版动态行为、距离事件重入、实际地图／窗口及原版网格对齐仍待验证。夹具输出目录 `tmp/docs-artifacts/war3/spatial-preloader-batch/`。

格子边界变更后，Win32 Release 客户端及地图测试目标增量编译成功；新增断言和受影响项待下一批执行。

### 持有物品的通用物件坐标（待功能批次验证）

路径：`src/session_destructables.cpp`、`tests/passive_tests.cpp`、`docs/dota-bkb-item-handles.md`。物品持有者即时移动后，`GetWidgetX/Y` 与 `GetItemX/Y` 返回同一实时坐标，丢弃后读取地面坐标；合批运行 `war3_passive_tests <data-root> <fixture> invalid-item`，覆盖已有物品句柄及新增物件查询。单位移除／转交、脚本事件重入和原版动态行为待验证；原版同一虚函数入口证据位于 `tmp/docs-artifacts/war3/widget-item-position/`。

Win32 Release 客户端与 `war3_passive_tests` 增量编译成功；新增物件查询断言待批次执行。

### 距离事件目标移动回归（待功能批次验证）

路径：`tests/clock_tests.cpp`。新增 `range_event_rechecks_after_callback`，覆盖首个进入回调移动距离事件中心，后续候选不能收到过期事件，中心返回后仍能收到有效事件；合批设置 `WAR3_CLOCK_FILTER=range_event_rechecks_after_callback` 运行 `war3_clock_tests <data-root> <output-root>`，并回归区域事件、事件销毁和过滤器重入。新增回归尚未执行，原版时序仍需对照。

### 区域离开事件回调回归（待功能批次验证）

路径：`tests/clock_tests.cpp`。新增 `region_leave_rechecks_after_callback`，覆盖首个离开回调将后续候选送回区域，撤销过期离开并允许其随后真正离开；合批设置 `WAR3_CLOCK_FILTER=region_leave_rechecks_after_callback` 运行 `war3_clock_tests <data-root> <output-root>`。新增回归尚未执行，事件销毁、过滤器重入和原版时序仍待对照。

距离事件和区域离开事件新增夹具已合并增量编译 `war3_clock_tests` 成功；两项行为回归尚未执行。

### 物品特效位置（待功能批次验证）

路径：`src/session_effects.cpp`、`src/game_effects.cpp`、`tests/passive_tests.cpp`、`docs/dota-bkb-item-handles.md`。附到物品的特效创建、状态更新和绘制读取当前地面或持有者坐标；合批运行 `war3_passive_tests <data-root> <fixture> invalid-item`，检查创建位置，并在实际窗口检查即时移动、拾取／丢弃、迷雾及附着效果。原模型附件点、空中高度、持有状态可见性与原版动态行为仍待核对。

Win32 Release 客户端和 `war3_passive_tests` 增量编译成功；功能断言与窗口画面尚未执行。

### 即用物品拾取事件内移动（待功能批次验证）

路径：`src/session_entities.cpp`、`src/session_inventory.cpp`、`tests/clock_tests.cpp`、`docs/campaign-flow.md`。拾取回调移动临时持有的即用物品后，保留物品和目标位置，不继续发放效果；合批设置 `WAR3_CLOCK_FILTER=powerup_pickup_callback_moves_item` 运行 `war3_clock_tests <data-root> <output-root>`，并回归正常金币、符文及普通背包物品。Win32 Release 客户端及 clock 测试目标编译通过；最小回归首次将玩家事件编号用于单位事件，修正为单位拾取事件编号 86 后重测 1 通过／0 失败。原版 `SetItemPosition` 先尝试从持有者移除再设置坐标，指令在 `tmp/docs-artifacts/war3/powerup-pickup-reentry/source-assembly.txt`；即用物品事件时序和商店场景仍待动态对照。

### 持有物品特效的可见性与高度（待功能批次验证）

路径：`src/game_effects.cpp`、`docs/dota-bkb-item-handles.md`。物品由单位持有时，特效绘制使用持有者可见性与当前飞行高度；地面物品沿用迷雾和地形高度。合批在实际窗口覆盖友敌、隐身／侦测、隐藏、空中高度、拾取／丢弃和原版效果；本次尚未执行窗口验证。

物品特效可见性与高度的 Win32 Release 客户端增量编译成功，实际窗口和原版表现尚未验证。

### 普通背包物品脚本定位回归（待功能批次验证）

路径：`tests/passive_tests.cpp`。扩展 `invalid-item`：重新拾取普通背包物品后调用 `SetItemPosition`，检查库存释放及物品／物件坐标一致；与即用物品拾取事件内移动、特效位置一起合批运行 `war3_passive_tests <data-root> <fixture> invalid-item`。新增断言尚未执行，掉落回调重入和原版时序仍待对照。

### 物品与空间回调批次结果

范围：`ef4780e`、`9121d9c`、`756b264`、`7c9ce95`、`780d312`、`d172c38`、`cf0b4d6`、`f32d236`，基于本批相同源码构建。Win32 Release 客户端、passive、commerce、clock、map 目标编译成功；重新生成隔离 passive／commerce 夹具。`invalid-item`、`range_event_rechecks_after_callback`、`region_leave_rechecks_after_callback`、`powerup_pickup_callback_moves_item`、`region_subtraction_boundaries`、`preloader_hashtable_handles` 各 1 通过／0 失败；commerce 消费者退出 0 并输出一条 PASS。覆盖普通与即用物品、即时移动坐标、物品特效初始状态、区域格边界及回调重入。

实际客户端用原 Footman 模型作为物品特效定位标记，分别在英雄原位置及脚本即时移动 300 单位后启动并捕获画面；两次各运行 600 游戏帧，选中英雄并可见其库存物品，标记均位于英雄处，控制图无该标记。已查看 `effect-marker.png`、`effect-marker-moved.png` 和 `control.png`；日志均记录未加载 Game.dll。本检查验证所选模型与移动场景的绘制位置，不代表原技能效果或原版视觉一致。隐身／侦测、飞行高度、掉落过程、真实鼠标操作、物品附件点及原版动态时序仍待验证。

复现入口和产物：`tmp/docs-artifacts/war3/item-spatial-batch/summary.txt`、`passive.w3m`、`commerce.w3m`、`effect-marker*.w3m`、对应 PNG 与日志；临时产物不提交。

### 游戏存档名称编辑（待功能批次验证）

路径：`src/game_flow_ui.cpp`、`src/game_flow_ui.h`。存档输入框支持左右、Home、End、Delete、退格和光标处插入；UTF-16 代理对按完整字符移动和删除，选择已有存档或点击输入框时光标移至末尾。Win32 Release 客户端增量编译通过。合批在实际客户端验证中英文与补充平面字符的插入、移动、删除、长度边界、列表选择、焦点切换、覆盖与取消，并检查光标及长名称显示；原版交互和画面一致性尚未验证。

### 结算回放名称编辑（待功能批次验证）

路径：`src/game_flow_ui.cpp`、`src/game_flow_ui.h`。回放名称与游戏存档共用 UTF-16 光标编辑逻辑，支持中间插入、移动和删除，并仅在输入框获得焦点时消费字符。Win32 Release 客户端增量编译通过；合批在实际结算画面验证输入、按钮焦点、取消与保存，以及两种输入框的长名称、代理对和原版画面一致性。

### 存档与回放名称的光标显示（待功能批次验证）

路径：`src/game_flow_ui.cpp`。名称按输入框宽度显示光标附近的完整 UTF-16 字符，绘制前转义文本标记，保存仍使用完整名称。Win32 Release 客户端增量编译通过；合批在实际界面检查光标位于 n、r 和颜色标记前时的显示，以及长名称滚动、中英文和补充平面字符的编辑与保存。

### 科技效果与有限上限（待功能批次验证）

路径：`tests/research_tests.cpp`。新增原始 `Rhrt` 的科技上限断言：无限旧单位上限变为零、零新单位上限变为无限，并覆盖原有有限上限保持不变；Win32 Release 研究测试目标增量编译通过，断言与 `war3_research_tests <data-root> <fixture>` 合批执行。静态核对原版 `CUpgradeAddTechMaxAllowed` 入口 `0x6f6985d0` 的无限／零／有限分支；原版动态对局与实际训练菜单仍待验证。

### 存档与回放名称鼠标定位（待功能批次验证）

路径：`src/game_flow_ui.cpp`。点击名称输入框按当前可见文本和字体宽度定位光标，UTF-16 代理对按一个字符处理，长名称沿用可见范围。Win32 Release 客户端增量编译通过；合批在实际窗口检查焦点切换、不同位置点击、光标闪烁、长名称和中英文／补充平面字符，原版操作一致性尚未验证。

### 手动存档界面及固定障碍恢复（部分验证，待功能批次）

路径：`src/game_flow_ui.cpp`、`src/session_destructables.cpp`、`src/scene_objects.cpp`、`src/session_unit_movement.cpp`。保存／载入面板使用存在的主菜单背景和原滚动条模板；固定装饰物阻挡在会话加载时建立，快照恢复与游戏模拟均使用同一状态。路径指纹错误区分地形与障碍。

Win32 Release 客户端增量编译通过。隔离用户目录、BootyBay 原图及隐藏实际客户端中，打开保存面板，输入 `abc中` 后执行 Home、右移、Delete、插入 `X`，画面显示 `aXc中`；确认保存后生成 `Saves/Manual/aXc中.w3z`（991918 字节），载入列表显示该文件。选中载入后客户端重新进入游戏，日志记录恢复会话的 `game_first_frame`、73 单位和未加载 Game.dll，截图时模拟时间为 12.656250 秒。操作通过自启动进程的 Windows 消息完成；截图及日志在 `tmp/docs-artifacts/war3/filename-ui-batch/`。

该验证覆盖一张地图、一个早期存档和键盘输入，不能证明完整存档恢复或原版一致。合批继续覆盖装饰物／可破坏物重叠、静态地图阻挡、动态建筑与脚本路径更改，实际鼠标定位、长名称、补充平面字符、覆盖／删除、回放面板及原版画面对照。

### 原图固定装饰物路径回归

路径：`tests/clock_tests.cpp`。在 BootyBay 原图解析非可破坏装饰物或地形装饰物，选择不与可破坏物脚印重叠的阻挡单元，清除该单元的地形阻挡后检查会话初始化已建立固定阻挡，再对恢复前后的路径指纹和阻挡状态做对照。Win32 Release `war3_clock_tests` 增量编译通过；设置 `WAR3_CLOCK_FILTER=static_doodad_pathing_recovery` 后运行，实际结果 1 通过／0 失败。其他地图、动态修改及原版寻路精度继续合批验证。

名称框鼠标定位尚未通过交互验收：后台单人 Agent 在菜单打开时拒绝指针请求；向隐藏窗口发送鼠标消息后插入字符仍出现在末尾，不能据此区分消息未送达与定位逻辑问题。Windows 窗口自动化未列出隐藏的独立测试窗口。相关实际鼠标操作和回放保存面板保留待测，日志及截图见 `tmp/docs-artifacts/war3/filename-ui-batch/`。

### 存档名称鼠标定位定向验证

路径：`src/main.cpp`、`src/game_view.cpp`、`src/game_view.h`、`src/game_flow_ui.cpp`、`src/game_flow_ui.h`、`tools/agent-pointer.ps1`。后台单人 Agent 的菜单输入仅接受保存名称框内的左键点击；其余菜单区域、联机、回放和前台窗口继续拒绝。Win32 Release 客户端编译通过。BootyBay 隐藏客户端输入 `abcd`，通过 Agent 点击首字符后方并插入 `X`，截图显示 `aXbcd`；名称框外请求返回 `ok=false`，隔离目录原存档保留。截图和响应见 `tmp/docs-artifacts/war3/filename-ui-batch/agent7/`。该检查未覆盖真实前台鼠标、中文／代理对、长名称、回放面板及原版对照。
