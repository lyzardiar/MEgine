# 尸体、食尸与复活

亡者复生在消耗尸体前检查各召唤单位类型的玩家科技上限，并在每次生成前重新检查；没有任何类型可生成时保留尸体。原 `Blizzard.j` 的 `InitSummonableCaps` 为 `uske` 设置骷髅上限，地图调用 `InitBlizzard` 时沿现有脚本路径生效。自定义上限、法术支付／尸体消耗时序及原版的其他召唤类型边界待集中对照。

尸体生命周期、食尸、亡者复生、复活、操纵死尸、先祖之魂及复活物品已连接实际单位/命令/资源/事件。实现与运行证据分别记录；完整亡灵玩法、原件精度、UI/GPU及完整客户端仍未完成。

## 尸体生命周期

- 原UnitData.deathType的0/1/2/3分别表示无标志、可复活、会衰败、两者都有，死亡动画时长读取UnitData.death。实际死亡建立尸体记录，单位不再永久停留在Death画面；可复活状态与画面阶段分开消费。
- 原Units/MiscData提供肉体衰败2秒、骨骼保留88秒、建筑衰败30秒及英雄消散3秒。死亡动画后进入相应源序列；不可衰败但可复活的尸体保持死亡姿态。普通尸体自然结束后移除原单位，英雄消散后保留死亡英雄对象及祭坛复活入口，复活时清理尸体状态。
- CreateCorpse创建真正的死亡单位及可用尸体，不产生一次虚构的活单位死亡/训练/人口过程。UnitSuspendDecay暂停后续尸体年龄与画面推进，死亡动画仍能完成；恢复从原年龄继续。SetUnitExploded影响当前/后续尸体可用性，无尸体召唤及爆炸标记不会生成可循环利用的尸体。完整爆炸效果仍待实现。
- 自然衰败产生原EVENT_PLAYER_UNIT_DECAY=21、EVENT_UNIT_DECAY=54及GetDecayingUnit上下文，回调复活/移除单位后重新核查状态。尸体清理后常用单位类型/位置/状态、item类型和widget只读查询返回零值；未实现完整的失效句柄/全部native语义。
- 独立尸体集合只跟踪尸体候选；技能搜索不遍历所有存活单位。食尸占用使用实际施法者/票据，移动、打断、技能失效、死亡或移除释放占用。被占用尸体暂停自然衰败，不会被另一技能同时消耗。尸体消费使用真实移除/库存/句柄/选择和生命周期清理。

## 实际技能和物品

- Acan及Acn2/ACcn按源每秒10/15生命、33秒持续与800生命恢复上限进行持续食尸。按钮/原cannibalize订单选择附近尸体，按源施法距离靠近并进入Stand Channel，恢复真实生命；打断释放，恢复上限耗尽或完成持续后消费尸体。当前搜索使用单位实际索敌范围，回复上限/尸体剩余量、选择顺序、完整打断与原版时序仍需对照。
- Arai/ACrd读取源两类数量/单位字段、Brai、40秒定时生命、魔法75及冷却。消耗一具真实尸体后创建源骷髅/法师类型，产生召唤事件并保留施法者/能力来源；源自动施法开关/图标及恢复普通战斗连接现有自动施法流程。
- AHre及其源别名在范围内恢复至多源数量的友军可复活尸体，保留原单位句柄、归属、能力、库存及人口关系。Aast仅作用于符合源Tauren分类的本玩家尸体，使用源生命比例1、魔法比例0.25和Rowt等级2前置。原目标尸体点选、按钮/热键及效果资源已接入；先祖之魂缺少Profile Order时当前采用ancestralspirittarget，并支持ancestralspirit无目标入口，精确订单映射仍待原件核对。
- AUan消耗尸体并生成归属施法者的真实定时单位，按源6目标/40秒、无敌开关及科技继承开关消费；不占人口、不再留下可复用尸体，寿命结束走真实死亡清理。当前普通复活恢复全部生命/魔法，操纵死尸按开关继承原尸体科技或不继承；恢复数值、科技来源、目标优先级、选择/透明视觉和原版事件语义仍待对照。
- 中立单位的 `ACad` 接入同一尸体消费和电脑施法路径，使用自身源字段：最多 6 个、持续 120 秒、生成单位不无敌。自定义字段、真实地图和原版事件顺序仍待阶段验证。
- AIrx复活物品和APrl/APrr拾取符文共用上述尸体恢复消费者。真实库存物品验证目标后才消耗次数/魔法并设置冷却；源cosl保持可重复使用。powerup拾取不要求库存空位，先发出拾取事件再实际使用，符文按源次数/易耗性清理；临时持有关系在成功、失败或异常时释放。没有适用尸体的拾取符文仍按即用物品流程消耗，完整powerup类型和商店路径继续实现。

## 来源与检查

原AbilityData/AbilityMetaData、UnitData/UnitBalance/UnitUI、Profile、ItemData、死亡类型枚举、common.j及Units/MiscData的来源/SHA256和相关行保存在根tmp/docs-artifacts/war3/corpses/source.json。运行只读公共/地图MPQ，不生成解包工程，不提交原始资源、fixture地图或诊断输出。

REA本轮核对Game.dll为x86 PE，SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a。原件身份为同目录rea-identity.json；固定Rizin 0.8.1既有记录包含CAbilityAnimateDead、CAbilityItemResurrection等有限类名观察，保存在rea-observations.json，来源/许可证沿用third_party/rea/rizin-source.json。类名、源字段及当前程序检查不能替代原件方法/运行对照，深度分析和完整还原精度继续开放。

必要Win32 Release产品和新corpse消费者编译通过。只运行2组最小检查，最终2通过/0失败、无Game.dll：flow覆盖真实尸体、食尸回复/独占/移动释放、同尸体竞争拒绝、消费一尸生成两只真实定时骷髅，以及原句柄/人口复活；freeze覆盖晚期暂停不倒退年龄/姿态及恢复后继续推进。冻结边界在收尾审查中修正，只补做该最小复现。

~~~powershell
cmake --build --preset release --target war3 war3_corpse_tests --parallel 8
python tests/generate-corpse-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_corpse_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/corpses/fixture.w3m" flow
./build/windows-x86/bin/Release/war3_corpse_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/corpses/fixture.w3m" freeze
~~~

spirit/items/decay/autocast模式已编译、未执行，阶段合并验证先祖之魂/操纵死尸/定时消失、符文/库存/失败冷却/重入、自然衰败/事件/暂停/英雄复活、全等级/w3a/尸体类型/占用/剩余可回复生命量/目标选择、食尸打断/恢复/源序列及三图长局/声音/UI/GPU/CPU/内存/切图释放。绞肉车尸体货舱/挖掘已接入，见[尸体货舱](corpse-cargo.md)；完整阵营AI和其余能力继续实现；没有旧全套、三图、GPU、性能或原件逐函数通过结论。

本地原始记录为根tmp/docs-artifacts/war3/corpses/中的build.log、items-build.log、delivery-build.log、final-build.log、freeze-build.log、fixture-build.log、clean-build.log、flow.log和freeze.log。旧MEngine延期队列及完整客户端验收保持开放。
