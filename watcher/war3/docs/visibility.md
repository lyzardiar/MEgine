# 隐形、侦测与共享视野

隐形状态、地形视野和侦测范围共同决定实际单位可见性。原IsUnitVisible已使用统一消费者，新增IsUnitInvisible、IsUnitDetected、IsUnitFogged、IsUnitMasked、UnitShareVision及AI专用UnitInvis；未知native继续明确失败。

## 已接入的玩法

- Aivs隐形术读取源魔法、冷却、范围、科技前置、Binv状态和持续时间。普通/英雄时长及DataA淡入由原字段消费；原按钮/热键/目标/施法事件连接现有能力界面，状态为可驱散正面魔法。
- AIvi隐形药水复用实际库存、使用次数、消耗、冷却与使用事件，读取AIv1/AIv2等源定义并应用同一Binv状态。参数在扣费前检查，没有免费添加物品或跳过消耗。
- Apiv永久隐形按源普通/英雄淡入时长恢复，DataA控制隐形时的自动索敌。实际攻击出手、施法生效和使用物品破除普通隐形并重置永久隐形恢复时间；移动保持隐形。
- Adet/Atru/Agyv/Adts等真实视域原型读取源等级、Rng与侦测类型，包括哨岗、阴影、飞行器和实际持有的被动物品来源。类型位1用于普通隐形；IsUnitDetected查询类型位1/2的覆盖，潜地单位玩法本身仍待实现。
- 侦测使用512单位网格、同模拟时刻的共享缓存和有界大范围候选。单位移动、能力/库存/归属/共享视野、死亡移除及技能可用性变化使当前缓存失效。索引只控制查询开销，性能尚无基准结论。
- 本玩家、明确共享的单位和共享视野玩家能看见相关单位；敌方同时满足地形可见与隐形侦测条件才显示。单单位共享视野连接实际地形视野及侦测来源，撤销后重新计算。
- 点击/框选/当前选择、小地图、单位模型与附着效果消费同一可见性；仍可见的隐形单位/附件使用半透明色。实际攻击目标/自动索敌、跟随、目标施法和物品目标也消费该判定；范围伤害和已发出弹道没有把隐形当作无敌。
- AI的UnitInvis按AI所属玩家查询，与原函数使用玩家上下文的路径对应；敌情目标排除当前无法侦测的隐形单位。

## 原件依据与检查

源表、Profile、common.j声明、归档来源与摘要在根tmp/docs-artifacts/war3/invisibility/source.json。Aivs默认50魔法/120秒，Apiv淡入2秒；阴影等Rng=900，哨岗Rng=1100，源侦测类型为3。对象覆盖继续由现有ObjectData消费，资源只读、直接进内存，不产生解包工程。

REA/Rizin定位IsUnitInvisible入口0x6f1e8aa0、IsUnitDetected入口0x6f1e8580及AI UnitInvis入口0x6f895930。前者使用类型4的可见性判断，后者调用0x6f66e3b0，分别读类型位1/2的玩家侦测计数；AI入口读取AI所属玩家。完整底层可见性语义与时序仍需原件对照。Game.dll SHA256保持e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，程序未加载该DLL。

最小检查在JASS字符串attack订单处发现已有注册缺口，已补齐attack=851983与smart=851971。原注册0x6f46a579/0x6f1c8033及smart常量0x6fa4a614已有REA指令依据；346项订单静态排序/唯一性检查通过。临时攻击诊断代码已移除，原始诊断保留在本地。

必要Win32 Release产品、新消费者编译及Python语法检查通过。只执行spell模式最小流程1组，最终1通过/0失败：实际隐形术/状态查询、玩家与AI查询、不可直接攻击、真实视域进出/同一时刻缓存、单单位视野共享/撤销、移动不破隐和实际攻击出手破隐，无Game.dll。passive/potion模式已编译但尚未执行；没有GPU、三图或性能结论。

证据位于根tmp/docs-artifacts/war3/invisibility/：source.json、rea-evidence.jsonl、fixture.w3m、static-checks.json、build.log、consumer-build.log、diagnostic.log、order-build.log、delivery-build.log、final-build.log及spell-final.log。原件资源、原始输出与夹具均不提交。

~~~powershell
cmake --build --preset release --target war3 war3_visibility_tests --parallel 8
python tests/generate-invisibility-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_visibility_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/invisibility/fixture.w3m" spell
~~~

阶段合并passive/potion模式及既有战斗/技能/物品/AI消费者，验证持续/淡入/等级/w3a/英雄/被动拾取丢弃、驱散/死亡/所有权/回调重入、技能禁用/范围/类型/多玩家及同帧更新、地形迷雾/共享视野/附着视觉/目标丢失/在途弹道/范围伤害、订单映射与三图长局/CPU/GPU/内存。Ghost、Shadow Meld及显形/水晶球/显形之尘已接入，增量及其独立待测项见[影遁与主动显形](stealth-reveal.md)。风步、潜地、中立付费显形、完整状态栏和声音仍待实现；淡入/破隐时机、侦测计数/边界、半透明材质及完整原版一致性未验收。
