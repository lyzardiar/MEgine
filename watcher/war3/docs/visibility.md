# 隐形、侦测与共享视野

中立 `Andt` 付费显形接入建筑按钮、地面／小地图选点、资源扣除以及发起玩家的区域视野和侦测；按源 DataA／DataB 读取金币／木材价格，DataC 读取侦测类型，Area／Dur 决定范围和持续时间。建筑状态、玩家关系、附近可交互单位及资源在执行时重新检查，效果到期由现有区域生命周期回收；脚本 `IssueNeutralPointOrder[ById]` 使用 `neutraldetectaoe` 同一入口。自研实验联机按新增命令种类 21 传输建筑、能力和位置，需两端使用包含该协议的版本。当前派发目标点订单事件；原版施法事件、请求者资格、扣费时序与联机互通尚待核对。真实地图、UI、边界及回调重入留功能阶段验证。

隐形状态、地形视野和侦测范围共同决定实际单位可见性。原IsUnitVisible已使用统一消费者，新增IsUnitInvisible、IsUnitDetected、IsUnitFogged、IsUnitMasked、UnitShareVision及AI专用UnitInvis；未知native继续明确失败。

## 已接入的玩法

- `AIsi` 视野加成读取能力等级的 `DataA`，单位自身及可用库存来源按装备加成相加，作用于昼夜基础视野和同一迷雾网格；增减能力、拾取／移除物品及玩家能力可用性变化触发重算。原版 1.27 源数据的一级数值为 500，地图可覆盖。多来源叠加、幻象与原版边界仍待对照。
- Aivs隐形术读取源魔法、冷却、范围、科技前置、Binv状态和持续时间。普通/英雄时长及DataA淡入由原字段消费；原按钮/热键/目标/施法事件连接现有能力界面，状态为可驱散正面魔法。
- AIvi隐形药水复用实际库存、使用次数、消耗、冷却与使用事件，读取AIv1/AIv2等源定义并应用同一Binv状态。参数在扣费前检查，没有免费添加物品或跳过消耗。
- Apiv永久隐形按源普通/英雄淡入时长恢复，DataA控制隐形时的自动索敌。实际攻击出手、施法生效和使用物品破除普通隐形并重置永久隐形恢复时间；移动保持隐形。
- Adet/Atru/Agyv/Adts等真实视域原型读取源等级、Rng与侦测类型，包括哨岗、阴影、飞行器和实际持有的被动物品来源。类型位1用于普通隐形、类型位2用于钻地隐形；钻地形态及 Abdt 侦测原型见[钻地侦测](burrow-detection.md)。
- 侦测使用512单位网格、同模拟时刻的共享缓存和有界大范围候选。单位移动、能力/库存/归属/共享视野、死亡移除及技能可用性变化使当前缓存失效。索引只控制查询开销，性能尚无基准结论。
- 本玩家、明确共享的单位和共享视野玩家能看见相关单位；敌方同时满足地形可见与隐形侦测条件才显示。单单位共享视野连接实际地形视野及侦测来源，撤销后重新计算。
- 点击/框选/当前选择、小地图、单位模型与附着效果消费同一可见性；仍可见的隐形单位/附件使用半透明色。实际攻击目标/自动索敌、跟随、目标施法和物品目标也消费该判定；范围伤害和已发出弹道没有把隐形当作无敌。
- AI的UnitInvis按AI所属玩家查询，与原函数使用玩家上下文的路径对应；敌情目标排除当前无法侦测的隐形单位。

## 视野遮挡待还原

当前单位地面视野按 64 单位迷雾网格绘制无遮挡圆形；树木、可破坏物遮挡高度和高低地形尚未参与计算。该迷雾也被可见性、目标命令和 AI 消费，因此不能将现有结果视为原版视线一致。脚本显形、哨兵和飞行单位的遮挡规则需分别验证。

固定版 `SetDestructableOccluderHeight` 入口 `0x6f1f4b90` 保存高度并调用 `0x6f233bc0` 更新迷雾遮挡网格；`0x6f234710` 消费该网格与预计算节点，以两个前驱的遮挡标记及当前格高度传播玩家可见掩码，`IsVisibleToPlayer` 随后查询该掩码。`0x6f2331d0` 用整数中点圆生成行边界；默认初始化的格长为 128 世界单位，底层高度子格约 32 单位。上述为静态分析，动态更新和完整传播尚未核实，不能据此宣称算法等价。原版安装包含 `-loadfile` 字符串，是否支持隔离启动专用地图和输出脚本结果尚未验证。后续应固定观察者与目标位置，在真实原版中对比单树／树墙、高低地、树死亡及恢复、遮挡高度修改、地面／飞行观察者和脚本显形，并记录更新时间；不得直接将相机遮挡高度或当前圆形计算当作已验证的原版视野算法。

固定版坐标和节点的隔离指令探针补充了可复现证据：`fog-circle-x86-probe.py` 对半径 1–64 的中点圆行边界及三个行跨度下的 3×3 种子逐项对照；`fog-x86-probe.py` 对半径 2、3、4 的非种子节点、两个前驱索引和重排结果对照转录。`fog-coordinate-x86-probe.py` 在受控对象字段下对照位置获取、网格坐标夹紧、初始化和地形边界解码：常规地形记录坐标映射为 `index*128-32768`，宽高由边界跨度除以 128 取整，行跨度扩为不小于宽度的二次幂。主进程复验均退出 0，脚本位于 `tmp/docs-artifacts/war3/` 下的 `fog-circle-x86-probe.py`、`fog-x86-probe.py`、`fog-coordinate-x86-probe.py`，日志文件名分别为 `fog-circle-x86-main-verification.log`、`fog-x86-main-verification.log`、`fog-coordinate-x86-main-verification.log`；读取固定版 Game.dll 并用 Unicorn 隔离执行指令，未加载 DLL。探针模拟了部分调用和对象内存，地图地形表构建顺序、对象字段与世界位置的完整对应、原版全局初始化、动态遮挡以及单位／飞行／脚本显形行为仍待验证，不能将这些局部结果当作完整视野实现或实机验收。

固定版视野的进一步隔离执行证据：`fog-height-x86-probe.py` 将底层 4×4 子格的地形级最大值乘以 128 写入迷雾高度；BootyBay 原图 W3E 的 105 个顶点样本与客户端悬崖层字段一致。附加高度层可以提高此值，真实图层来源和生命周期仍未知。`fog-destructable-footprint-x86-probe.py` 在模拟对象中验证单格破坏物高度更新，并发现受控的 4×4 全零足迹仍更新周围四个迷雾格，不能仅按非零足迹像素推断遮挡。`fog-observer-x86-probe.py` 的普通观察者分支在存在附加层时才会将较高的中心遮挡值用于观察高度，特殊观察者分支未覆盖。

`fog-propagation-x86-probe.py` 对非边界路径的半径 2、3、4 各运行平地、单格高台和直墙，共 9 组；以 3×3 种子和两个前驱遮挡标记建立的独立模型与固定版指令结果逐节点一致，当前格可见性取决于前驱，当前格高度再传给后继。所测指令未触碰圆边界中的四个格，不能由此推断整个圆均被初始化或推断其他流程不会更新这些格。以上四个脚本由主进程以 `C:/Python313/python.exe` 复跑并均退出 0，对应日志位于 `tmp/docs-artifacts/war3/*-main-verification.log`。这些均为读取固定版 Game.dll 的 Unicorn 局部执行，包含模拟对象、内存和部分调用，不等于真实游戏运行；真实树木足迹、重叠物死亡重算、地图边界、飞行单位、脚本显形和整局传播仍需验证。

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

阶段合并passive/potion模式及既有战斗/技能/物品/AI消费者，验证持续/淡入/等级/w3a/英雄/被动拾取丢弃、驱散/死亡/所有权/回调重入、技能禁用/范围/类型/多玩家及同帧更新、地形迷雾/共享视野/附着视觉/目标丢失/在途弹道/范围伤害、订单映射与三图长局/CPU/GPU/内存。Ghost、Shadow Meld及显形/水晶球/显形之尘已接入，增量及其独立待测项见[影遁与主动显形](stealth-reveal.md)。风步增量见[机动与镜像](mobility.md)，钻地增量见[钻地侦测](burrow-detection.md)；中立付费显形、完整状态栏和声音仍待实现；淡入/破隐时机、侦测计数/边界、半透明材质及完整原版一致性未验收。

影子风衣 `clsd` 的源能力 `Ashm` 在有效装备栏中参与夜间影遁，移动、施法与昼夜切换沿用单位影遁状态；物品移除或装备能力失效后查询立即失效。多个来源的优先级、地图覆盖、原版时序和实际窗口待批次验证。

地点视野查询 IsLocationVisibleToPlayer、IsLocationFoggedToPlayer、IsLocationMaskedToPlayer 在地点或玩家句柄无效时返回 false；对应坐标查询在玩家无效时返回 false。固定版 1.27 地点入口为 `0x6f1e7de0`、`0x6f1e7d20`、`0x6f1e7da0`，对应坐标入口为 `0x6f1e8f50`、`0x6f1e7a10`、`0x6f1e7ef0`，句柄解析失败直接返回零。原版动态视野、坐标异常及单位可见性接口仍待对照。
