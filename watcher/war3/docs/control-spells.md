# 诱捕、蛛网、睡眠、净化与放逐

五种源原型Aens/Aweb/AUsl/Aprg/AHbn及同code别名已连接实际单位、施法、弹道、状态、伤害/恢复、驱散、树木目标和原命令区。完整四族能力、变形/飓风、原版精度、UI/GPU/声音、AI及长局仍待完成或阶段验证。

## 控制与实际消费

- 诱捕/蛛网读取原等级、英雄时长、前置Roen/Ruwb、源订单/图标/热键及1500速度弹道。Aens默认12秒/英雄3秒，Aweb为12秒/英雄7秒。真实Net状态限制移动，空中目标按0.6秒/200高度源字段下降，并在解除后恢复原飞行高度。被网住的飞行单位保留空中受击能力，并增加地面武器/法术/光环的目标入口；IsUnitType返回对应当前状态。源近战范围DataC已读取，完整近战距离与分类位精度仍待原件对照。
- EnsnareIsMagic=0、WebIsMagic=0由源MiscGame及地图常量决定物理/魔法控制属性。物理网可作用于魔免目标，不被普通魔法驱散；魔法网沿用魔免/驱散流程。控制期间保留既有移动路径，暂停位移并显示站立，解除后继续原移动；仍可在合法范围攻击/施法。Aweb源webon/weboff、默认自动开关、目标选择/研究前置/冷却和原PRE2指示已接入；自动模式尚未执行专项。
- AUsl使用源20秒/英雄5秒及2秒初始保护。真实Sleep状态打断当前动作、阻止操作，保护期内拒绝伤害；保护结束后正伤害唤醒，持续时间结束或驱散同样清理。原BUsl/BUsp视觉与保护寿命进入真实特效生命周期；UnitIsSleeping/UnitWakeUp及UNIT_TYPE_SLEEPING/STUNNED读取实际状态。夜间中立睡眠、UnitAddSleep/Perm及完整睡眠native语义仍待实现。
- Aprg及TFT Apg2使用源全部魔法效果驱散、召唤物400伤害、敌方移动/攻击恢复档位、15秒总时长、暂停3秒/英雄1秒及魔法损失字段。友军只驱散，不附加敌方减益；物理控制保留。当前速度按源档数逐档恢复，精确原件公式/事件/免疫边界仍待对照。Purge真实树木目标共用接近/取消/施法事件，破坏树木并释放占地，GetSpellTargetDestructable保留正确上下文。
- AHbn按源移动/攻击速度减少施加真实Banish状态；目标不能发起新攻击，已发射的攻击继续处理，仍可施法。按源EtherealDamageBonus的七类映射拒绝普通物理攻击并增加魔法/法术伤害，读取EtherealDamageBonusAlly处理友军；Holy Light/Death Coil/Healing Wave、Heal、回春与宁静的法术恢复使用EtherealHealBonus=1.66，普通生命设置及基础恢复不套用该加成。UNIT_TYPE_ETHEREAL与原Banish特效已连接；原版透明材质、完整技能/物品/伤害类型组合继续实现及验收。

空中单位的基础高度不被网覆盖；独立表现过渡用于单位、选取、附件、武器/法术弹道和GetUnitFlyHeight。重叠控制、暂停、死亡/移除、驱散和native高度改写进入实际状态生命周期。原common.j枚举已逐项核对，新增11眩晕、13诱捕、23睡眠、25虚无及26魔免查询；未实现的分类/native继续明确失败，不把默认返回当作完成。

## 来源与边界

24个原MPQ成员的来源、SHA256、相关表行/Profile、元数据中文字段和native/状态枚举保存在根tmp/docs-artifacts/war3/control-spells/source.json。主要来源为AbilityData/AbilityMetaData、Orc/Undead/Human及中立AbilityFunc/Strings、UnitAbilities/UnitData/UnitBalance/UnitUI/UnitWeapons、MiscGame和common.j。对象等级/w3a及地图常量覆盖沿用现有定义读取。

复用REA已有Game.dll x86 PE身份观察，并重新核对本机原件SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，记录于同目录rea-identity.json。深度后端未配置的限制沿用corpse-cargo/rea-provider.json；没有新增原件函数行为证明，源字段与本程序检查不代表原版一致性。产品/检查程序不加载Game.dll，原安装只读，资源内存直读，无运行地图解包工程。

## 必要检查与阶段队列

Win32 Release产品/新消费者编译通过，Python AST/差异检查通过。已运行三个最小模式，最终3通过/0失败、无Game.dll：

- flow：真实诱捕/蛛网、地面武器攻击被网住的飞行单位、时长/高度恢复、睡眠禁止操作、初始保护/受击唤醒。
- purge：放逐物理免伤/魔法增伤/禁攻、净化驱散/定身/速度恢复、实际水元素400伤害、树木与施法上下文、友军放逐及Holy Light治疗加成。
- lifecycle：施法者移除后控制正常终止、显式唤醒、零高度差时释放/原生高度重写，以及既有移动路径保留。零高度差恢复和已发射攻击的源控制边界在收尾审查中修正；已发射攻击专项未执行。

初次purge夹具在上一轮净化尚有0.4375秒冷却时发出树木订单，按真实冷却等待后同模式通过；移动意图夹具依据源0.6秒施法前摇及320移速延长目标距离后同模式通过。产品冷却和施法步进未放宽。

~~~powershell
cmake --build --preset release --target war3 war3_control_tests --parallel 8
python tests/generate-control-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_control_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/control-spells/fixture.w3m" flow
./build/windows-x86/bin/Release/war3_control_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/control-spells/fixture.w3m" purge
./build/windows-x86/bin/Release/war3_control_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/control-spells/fixture.w3m" lifecycle
~~~

autocast模式仅编译、未执行。阶段合并原等级/w3a/英雄与普通/机械/守卫/魔免/无敌/联盟/物理网开关、重叠控制/驱散/死亡移除/转让/暂停/重入/高度改写、已发射/反弹/溅射攻击与放逐/伤害分类/治疗组合、完整树木可见性/取消/失败资源、原窗口/按钮/目标/动画/透明材质/声音及三图长局/CPU/GPU/内存/切图释放。原版分类位、近战范围、净化恢复公式和精确事件/模拟时序保持待验收。

本地产物为根tmp/docs-artifacts/war3/control-spells/中的source.json、rea-identity.json、fixture.w3m、build.log、check-build.log、diagnostic-build.log、fixture-build.log、final-build.log、delivery-build.log、movement-fixture-build.log、clean-build.log、flow.log、purge-first.log、purge-diagnostic.log、purge.log、lifecycle.log、lifecycle-final.log及review-notes.json；不提交原资源、地图、原始JSON或日志。旧MEngine延期队列与完整客户端范围保持开放。
