# Frostbound Realms / 霜境战纪

MEngine 原生 3D RTS 游戏工程。围绕资源采集、建造、出兵、英雄战斗与自定义地图建立可运行的基础版本，使用下载的 Quaternius、Kenney、Poly Haven、KayKit CC0 资产。当前实现尚未达到《魔兽争霸 III：冰封王座》完整复刻的内容量和玩法深度。

当前画面采用雪地/岩土贴图、柔化边缘的战争迷雾、冬季松林与岩石、模块组装防御塔、原创菜单插画和技能图标。操作面板提供对应模型的兵种头像和训练图标、生命/法力条、悬停提示；场景内显示选择圈、移动落点、建筑预览、远程弹道与伤害数字。

## 运行

先在仓库根目录执行 `node scripts/build-frostbound.mjs`，生成被 Git 忽略的 `Assets/Scripts/Main.js`，再在 MEngine 编辑器打开本目录，切到 Game 后 Play。独立播放器构建入口（先完成 CLI 和 Release runtime 构建）：

```powershell
node scripts/build-frostbound.mjs
node packages/cli/dist/cli.js build samples/frostbound-realms --runtime target/release/mengine-runtime.exe --skip-runtime-build --out samples/frostbound-realms/Builds/windows-x64 --clean
```

生成后运行 `Builds/windows-x64/Frostbound Realms.exe`。主菜单采用右侧悬链铁框、蓝底金字按钮、冰冠背景与浮雕标题。单人游戏 → 自定义游戏中选择地图、种族与英雄；载入游戏、地图编辑器、局域网、选项、制作人员和退出均有实际入口。选项保存音乐/音效音量与背景飘雪设置。保留 F1/F2/F3/F4/F8/F9 直接进入玩法的快捷键。

## 玩法

- **Skirmish**：玩家与 AI 对战。金矿、伐木、采集回库、人口、建造进度、生产队列、武器研究、战争迷雾；摧毁敌方最后一座据点获胜。四阵营各有四个兵种，共 16 个兵种定义；二级据点解锁高级兵种，三级据点解锁更高武器研究及祭坛飞行单位。二级据点可建攻城工坊，各阵营分别训练弩炮、投石车、投石机、攻城锤；四种飞行兵种共用 Dragon 动画模型并具有不同属性。普通/穿刺/魔法/攻城攻击按目标护甲结算，攻城对建筑三倍伤害；近战和攻城不能对空。圣骑士/德鲁伊治疗、萨满减速、亡灵吸血及阵营属性不同；当前共用下载的角色和建筑美术。
- **Siege of Winterfall [F9]**：预置四种攻城器械和飞龙，突破路口防御塔后摧毁敌方基地；用于直接体验攻城与空中战术。
- **Ancients of the Vale**：Dota 风格三路推塔地图，每路每 30 秒派出 3 名写实近战兵和 1 名弓手，每第 7 波追加投石车；首波在 4 秒出发，兵线与建筑由系统控制，玩家指挥英雄和召唤单位。包含防御塔、英雄经验与升级、四名英雄共 16 种技能、三件基础装备与三套合成配方、基地补给和死亡复活。己方小兵血量不高于 50% 时可手动反补；己方不获金币、经验或击杀数，对方附近存活英雄分摊折半经验，普通 MOBA 击杀经验也由附近英雄分摊。当前是一张简化的原创 MOBA 地图，尚不是原版 Dota 地图、完整英雄池或规则复刻。兵线实现及验证见 [兵线记录](../../docs/designs/frostbound-realms/moba-lanes.md)，反补规则见 [反补记录](../../docs/designs/frostbound-realms/moba-denies.md)。
- **Serpentine Watch**：十二波塔防，守卫塔、减速冰塔、范围火塔，最高三级升级、65% 金币出售返还；快速波、高生命波与每四波首领。建塔只消耗金币，最多 40 座，不能堵塞道路；漏怪扣除生命，首领漏过扣五点，清完最后一波获胜。当前为单机。
- **The Shattered Covenant [F8]**：原创 RPG，清除三名斥候、夺回遗物、击败君王、返回圣所四阶段任务；掉落装备、经验升级、技能、金币奖励、死亡复活与存档续玩。
- **World Editor**：32×32 地形网格，地形、资源、单位、玩家配置和矩形区域；区域支持选择、移动、缩放和命名。触发器支持最多 8 个条件与 8 个有序动作，全部/任一条件、前置依赖、延迟、重复次数和间隔。三槽保存加载、撤销和直接试玩；F8 载入可编辑的 Supply Road 护送示例。
- **Multiplayer**：两个原生客户端的 RTS/MOBA 房间、准备、开局、服务器权威裁决、可见性过滤、掉线保留席位 15 秒并尝试重连。空位和主动退出的阵营交给 AI。隐藏敌方经济、生产队列、集结点、命令路径、地图单位布置和触发器。

Skirmish 建筑由工人到场启动：Kingdom 工人持续施工，可多工协作（额外工人加速并消耗材料）；Warclans 工人驻留建筑直到完工；Wildwood 的据点、兵营、工坊和塔消耗工人后自然生长，农舍与祭坛无需消耗；Revenant 召唤启动后释放工人，非据点建筑要求位于完工据点 18 格或祭坛 12 格内。工地初始生命为 10%，随施工增加；取消工地退还原价 75%，返还驻留或生长中的工人。工人可维修己方完工建筑；资源不足时暂停，材料总价按修复生命比例的原价 50% 计算。采集回到最近的完工据点。TD 保持自动建塔。

Skirmish 祭坛按类型招募英雄：每类一名，二级据点解锁第二名，三级解锁第三名，最多三名。每名占用 5 人口，训练 55 秒；没有已拥有或在训英雄时首次招募免费，后续花费 425 金币和 100 木材。阵亡英雄保留身份、等级、技能与背包，通过祭坛复活，恢复满生命和 100 魔法；复活费用与时间随等级增加。左侧三个快捷头像支持选取，阵亡头像跳转祭坛，Space 循环选择存活英雄。默认对战从主基地和闲置工人开始，首名英雄通过祭坛招募。规则、验证与剩余差距见 [英雄招募和复活记录](../../docs/designs/frostbound-realms/hero-lifecycle.md)。

四名可选英雄为 Frost Warden（冰霜控制/治疗）、Ember Sage（火焰法术/飞龙召唤）、Sylvan Ranger（远程箭术/缠绕）、Dawn Paladin（近战/神圣防护）。每名英雄有独立属性、模型、四个技能、头像和技能图标；出生带一点技能点，升级再获得一点。普通技能最多三级，分别要求英雄 1/3/5 级；终极技能一阶，要求英雄 6 级。地图 JSON 的玩家和英雄单位支持 `heroClass`（0..3），单位页选择 Hero 后可切换英雄类型。

## 操作

昼夜每 8 分钟循环一次，默认 08:00 开局，18:00–06:00 为夜间；月光和环境光随黎明、黄昏渐变。夜间普通单位视野缩至 3 格，防御塔保留 5 格，已探索区域继续保留。中立营地在夜间休眠，显示 Zzz，普通自动迎敌会略过；显式攻击造成伤害后会唤醒附近守卫。编辑器玩家页的 Start 按钮可调整开局时间，支持撤销、地图保存和试玩。时间与营地唤醒状态随存档和服务器重连保留。规则与原生截图见 [昼夜记录](../../docs/designs/frostbound-realms/daynight.md)。

| 操作 | 输入 |
| --- | --- |
| 选择 / 框选 / 追加选择 | 左键 / 拖动左键 / Shift |
| 移动 / 攻击 / 采集 | 右键点击地面、敌人或资源 |
| 指定攻击 / 攻击移动 / 停止 | A 后左键单位 / A 后左键地面 / S |
| 反补（MOBA） | 右键或 A 后左键血量不高于 50% 的己方小兵 |
| 驻守 / 巡逻 | H / P 后左键指定另一端 |
| 选中并居中英雄 | Space |
| 相机平移 / 缩放 | 方向键 / Home、End |
| 建造 | 选工人，底部按钮；C 扩张据点、F 农舍、B 兵营、T 塔、L 祭坛、J 攻城工坊，随后左键选址 |
| 施工 / 维修 | 选工人右键己方工地或受损建筑，或 R 后左键；选工地点击 Cancel 返还 75% |
| 塔防 | 工人 T 守卫塔、G 冰塔、Y 火塔；选塔点击升级或出售 |
| 出兵 / 研究 | 选建筑后点底部按钮；兵营 U 研究 |
| 集结 / 取消生产 | 选生产建筑后右键地面或点 Rally；Cancel last 取消队尾并全额退还、释放预留人口 |
| 选择英雄 | 自定义游戏选择页或联机大厅 H / 英雄按钮 |
| 学习技能 | K 切换学习页，Q/W/E/R 学习；Shift+Q/W/E/R 直接加点 |
| 技能 | Q/W/E/R，目标技能随后左键指定；自身技能立即施放 |
| 商店 | O 切换商店页；英雄回主基地附近，点击装备按钮 |
| 编队 | Ctrl+1..9 保存；1..9 选择 |
| 暂停 / 保存 / 返回菜单 | Escape / F5 / F10 |
| 编辑器页面 / RPG | V 在地形、单位、触发器、玩家、区域、高度、地表材质、地表雕刻、地形套件九页切换；RPG 地图保留 scout / keeper / boss 角色 |
| 区域与触发器 | 点击选择；按钮新建/移动/缩放；触发器面板切换 Setup / Conditions / Actions；Del 删除条目，N 编辑名称或动作公告 |
| 护送示例 | 编辑器内 F8 载入 Winterfall Supply Road；F7 试玩，带英雄抵达山口完成护送事件链 |
| 编辑器笔刷 | 数字 1..9 或底部按钮 |
| 编辑器高度 / 坡道 | V 切到高度页，选择 0–3 级高度和东/西/南/北坡道；F9 载入 Highland Pass，两层高地可通过坡道攀登 |
| 地表材质 | V 切到地表材质页，1 自动冬景、2 裸土、3 积雪、4 草地、5 裸岩；点击 Brush 循环 1×1、3×3、5×5 笔刷，绘制地面与道路，自动跳过水域 |
| 编辑器保存 / 加载 / 试玩 | F5 / F6 / F7；地形、单位或玩家页 N 切换保存槽 |
| 地图模式 / 波数 / 间隔 / 金币 | Tab / PageUp、PageDown / [、] / +、- |
| 编辑器撤销 | Ctrl+Z |

地图与单机存档以 JSON 存放于 Windows `%LOCALAPPDATA%/MEngine/UserData/<项目标识哈希>/`：`map1.json` 至 `map3.json`、`quicksave.json`。工程清单中的稳定 `storageId` 让编辑器与打包后的同一游戏共用存档；不同游戏应使用不同标识。分享地图可复制地图槽 JSON 到另一台电脑的对应目录，再在编辑器中加载。导入时检查版本、地形长度、坐标与数量限制。

框选或控制组最多选择 40 个单位。右键移动与 A 攻击移动按行军方向和兵种射程分配位置，近战在前、远程在后，空中与地面分别编队；单个单位到达实际点击位置。目的地按可达地形、建筑和待命友军调整，地形无法到达时选择本侧空位，整组无法分配时保留原命令。行军途中保存/加载保留各单位目标。寻路只使用当前可见的敌方建筑，接近后发现目标被占用时重新选择附近落点。移动、攻击移动和巡逻支持单位动态避让；其他编队预订的终点也会留出空间，落点被待命友军占用时重新分配。建造/采集等通用指令队列仍待完善。

移动、攻击移动以及工人建造/协建/修理/采集支持左、右 Shift 追加，每单位最多8个等待任务；整组中任一队列已满则整组追加失败。按建筑热键后 Shift 左键放置可连续规划，右键资源或友方工地/损坏建筑可追加对应工作。排队建筑仅记录位置，轮到时重新检查工地、科技、领地和资源并扣费；无法执行的任务跳过并显示提示。采集中有后续任务时，交回一包资源后继续下一项，没有后续任务则持续采集。驻扎工人出建筑后继续工作；自然族转化为建筑时清掉该工人后续任务。绿色编号为移动、橙色为攻击移动、金色为建造/修理、蓝色为采集，界面显示任务缩写 M/A/B/R/G。普通改令、停止、闪现和死亡清空队列；驻守和巡逻需先取消才能排队。存档及服务器重连保留任务、路径、镜头与有效选择。

驻守 H 取消当前路线并原地攻击射程内、未被地形遮挡的敌人，不会追击；S 停止后恢复普通自动迎敌。巡逻 P 后左键指定另一端，各单位从当前位置与编队落点之间往返，遇敌战斗后继续巡逻。蓝色编号显示首个选中单位的两端位置。驻守和巡逻替换已有移动队列，巡逻中需先下达普通移动再追加 Shift 路线；单机存档和联机重连保留巡逻端点。

行军按兵种占地半径检查整段位移，地面和空军分别避让；待命、驻守及定身单位不会被其他单位推开。直线受阻时使用半格寻路并平滑路径，窄道可排队或错身通过。显式右键攻击同一目标的近战部队按体型分散到目标周围，外圈等待攻击位置；自动迎敌沿用各自接敌。旧存档中重叠的移动单位可逐步脱困，出兵位置被占时生产队列等待空位。塔防波次在入口留出间距后逐只出怪，待出怪队列随存档保留，清空队列并击败全部敌人才能判胜。

动态寻路每次最多展开 2048 个节点，路径最多保留 1024 点；密集大军仍需继续优化。当前 Node 20/40/80 人密集出发行军首帧 CPU 中位数约 8.96/14.58/21.71 ms，仅为模拟计算，不是原生渲染帧时间，尚未达到 5 ms 整体帧预算。

## 地图事件

每张地图最多 32 个矩形区域和 32 条触发器。Setup 设置前置事件、all/any、执行次数（1..99）和重复间隔（1..600 秒）；Conditions 设置玩家、数值、区域和单位类型；Actions 按列表顺序执行。条件支持开局计时、前置事件后的延迟、单位进入、击杀、金币、木材、区域单位数量、区域清空。动作支持批量增援、金币/木材、队伍公告、胜利、攻击移动和区域治疗。

增援先检查整批容量和可放置位置，失败时整条事件等待，不会发出部分奖励。公告只发给指定队伍；服务器不向客户端发布区域/触发器配置或运行计数。删除被引用的区域或前置触发器会提示先重新指定引用。旧单条件/单动作 JSON 地图可导入，新地图示例位于 `Assets/Maps/supply-road.json`。

区域和事件页按 N 打开名称或公告输入框，点击框内使用键盘/输入法编辑，再点击保存、取消或清空。编辑器复用原生 textarea 的选择、粘贴和输入法；Player 接收键盘文本与 IME 提交，支持末尾输入和退格，尚无光标移动/选区/剪贴板编辑。字符上限按 Unicode 字符计算。实际物理输入法候选选择仍待设备验收；可视化节点连线尚未实现。当前事件编辑器不等同于原作完整触发器系统。

## 联机

客户端与服务端使用协议 30，单条 JSON 消息上限 512 KiB，旧协议连接会被拒绝；更新时双方需同步。旧单机未完工建筑继续自动建造，新存档保留工人和施工状态。

```powershell
# 同机测试
node samples/frostbound-realms/server.mjs
# 局域网主机
node samples/frostbound-realms/server.mjs --host 0.0.0.0 --port 7788
```

局域网菜单可点击创建、加入与服务器地址，房间列表可点击选择，准备按钮连接实际 TCP 对局。也可按 I 编辑服务器 `IPv4:端口`，F1 创建 RTS 房间、F2 创建 MOBA 房间、F3 浏览房间。大厅 H 更换英雄，更换后双方需要重新准备。双方 Enter 准备，房主再次 Enter 开局。协议版本为 19，客户端和服务器必须配套更新，旧协议连接会被拒绝。服务器以 10 Hz 推进模拟，客户端仅提交命令；拒绝重复序号、操作敌方单位、不可见目标与非法坐标，限制连接、请求大小和发送频率。未提供公网匹配、NAT 穿透、账户系统或加密传输；当前目标为本机与可信局域网。

## 资源与引擎扩展

骷髅弩手与骷髅法师使用 [KayKit Skeletons](https://kaylousberg.itch.io/kaykit-skeletons) 免费版 CC0 模型，源版本固定为 `15b62b9bad122f72926c10fb14d622c73819fa54`。弩、法杖挂接原骨架手部插槽，随行走/射击/施法动画运动；身体、披风和帽子的骨骼层级完整保留。8个原始文件、许可和6个派生文件哈希见 `skeleton-sources.json`，可独立运行 `scripts/import-frost-skeletons.py` 重新导入，主资产导入脚本也包含该步骤。当前共112模型。

18种移动单位模型的选中头像与训练图标由 `node scripts/render-frost-unit-icons.mjs` 使用原生Release编辑器渲染，图集和模型姿态记录见 `unit-icons.json`。`gltf_bounds` Rust示例提供原生静态/骨骼姿态的几何边界，图标据此居中缩放。射击/施法的模型朝向跟随实际攻击目标；此改动不改变战斗数值或网络协议。

`asset-sources.json` 保存官方下载地址、13 个原始文件的 SHA-256 和许可；`SourceAssets/` 保留原始 glTF 与两个 Kenney ZIP，`Licenses/` 保留许可来源。角色来自 [Quaternius RPG Character Pack](https://quaternius.com/packs/rpgcharacters.html)，建筑来自 [Ultimate Fantasy RTS](https://quaternius.com/packs/ultimatefantasyrts.html)，自然物件来自 [Kenney Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit)，粒子贴图来自 [Kenney Particle Pack](https://kenney.nl/assets/particle-pack)。四套均标注 CC0。角色原始骨架和动画保留，多个材质合成图集；生成器提供原创 24 秒循环配乐及指令、战斗、法术、胜利音效，字体沿用仓库的 Roboto 及其许可。导入器优先使用保留的原件，并在转换前核对源文件哈希。

`environment-sources.json` 记录新增 [Kenney Castle Kit](https://kenney.nl/assets/castle-kit)、[Nature Kit](https://kenney.nl/assets/nature-kit) 原始 ZIP，以及 [Poly Haven](https://polyhaven.com/license) 的 snow_02 / rocky_terrain 贴图，共 20 个源模型及两张地表贴图，含四种攻城器械。三种塔由下载的模块离线组装；加上 Dragon，目录合计 39 个来源模型和 3 个组合模型。冬季调色和积雪材质由代码适配，下载原件不改动。`font-sources.json` 保留 Cinzel、Noto Sans SC 字体及 OFL 许可校验值，许可随 Player 打包。中文字体原件位于 `SourceAssets/NotoSansSC-VF.ttf`；安装 fonttools==4.61.1 后运行 `python scripts/import-frost-font.py` 生成静态 400 字重，再运行构建脚本。

`dragon-sources.json` 记录 [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) 的 CC0 Dragon FBX 镜像、原件哈希和固定版本 FBX2glTF 转换器归档哈希。原 FBX、派生 glTF、骨架与五个动画都保留；Windows 导入器在项目 tmp 目录提取转换工具，不修改系统安装。官方 glTF 文件本次遇到 Drive 配额限制，因此使用可取得的 FBX 源模型转换。

`classic-menu-art.json` 与 `Assets/Licenses/Classic-Menu-Art.txt` 保存经典菜单三张原创素材的提示词、参考来源与 SHA-256。

`generated-art.json` 保存内置 image_gen 生成菜单背景与 4×4 技能图集的完整提示词和 SHA-256；这两张原创插画位于 `Assets/Art/`，战场由引擎实时渲染。uuu9 当前主站跳转至资讯站，旧 war3.uuu9.com 未取得可用下载或明确再分发许可，本次没有纳入该站素材。

新增 [Kenney Graveyard Kit](https://kenney.nl/assets/graveyard-kit)，复用 Castle Kit、Nature Kit 的 46 个源模块，离线组合为四阵营 32 个独立建筑模型，包含三级主基地、兵营、住房、塔、祭坛和工坊。每个建筑合并为单网格和单材质，按玩法占地缩放。`faction-sources.json` 保存模块组合配方、原始归档与 96 个派生文件哈希。新增 [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) 的 Orc、Orc_Skull、Tribal、Demon、Ghost_Skull，保留骨架及每个角色 8–14 个动画，记录于 `monster-sources.json`。这些素材均为 CC0；当前目录共 79 个模型条目。

建筑图标由实际 Release 引擎渲染成 32 格图集，建造菜单与建筑头像直接引用对应模型图标；`faction-icons.json` 保存模型引用、图集哈希和渲染程序哈希。`game/visuals.js` 统一单位、建造预览与名称，升级主基地改变轮廓；联机只公开可见主基地的外观等级，敌方全局科技仍隐藏。部分兵种仍共享模型，完整四阵营美术尚未完成。

`hero-art.json` 保存本轮四张英雄头像和 16 个技能图标的内置 image_gen 提示词、文件路径与 SHA-256；图集为原创 UI 插画，英雄场景模型来自上述免费资产包。

本次引擎补充：

- 实体修改版本与不可变快照缓存：脚本和原生 Play 复用未变化实体；编辑器逐帧传输变化实体及完整顺序，保留 Inspector、Agent 查询和场景切换状态。显式编辑触发全量校正，会话版本校验拒绝过期结果；停止仅作用于对应会话，启动编译有 30 秒超时。
- `engine.storage.load(key)` / `save(key,value)`：项目独立 JSON 持久化，256 KiB/文件、64 文件上限，原子替换与路径校验。
- `engine.setActive(entity, active)`：停用预留渲染与 UI 实体，保留数据；子节点活动状态继承，物理体相应移除/恢复。Canvas 每帧建立子节点索引，避免逐节点扫描全世界。
- GLB/glTF 骨骼姿态采样：`MeshRenderer.mesh = 'Assets/Models/Warrior.glb#pose=8:4'`，表示第 8 个动画、第 4 个 12 Hz 采样帧。CPU 蒙皮后共享姿态 GPU 网格，缓存保留至多 256 个非同时活动姿态；支持 LINEAR、STEP、四权重、节点层次及逆绑定矩阵。当前明确拒绝 CUBICSPLINE、形变权重和超过四关节影响。
- 原有 `ParticleEmitter3D` 直接使用免费 PNG 粒子纹理。

## 验证与修改

```powershell
node scripts/test-frostbound.mjs
cargo test -p mengine-script storage --lib
cargo test -p mengine-assets gltf_pose --lib
cargo test -p mengine-assets --test frost_skins
cargo test -p mengine-editor-host --test frost_sample
node scripts/qa-frostbound.mjs
```

游戏规则位于 `game/simulation.js`，原生交互位于 `game/client.js`，地形数据打包位于 `game/terrain.js`；修改后执行生成器。地表通过 64 个 `terrain4h:` 网格区块和自定义材质绘制。每格 2 世界单位，高度 0/2/4/6，坡道连接相邻高度；崖壁与坡道具有实际几何，旧地图默认平地。寻路、编队落点及逐步移动检查实际崖沿与兵种半径，建造要求整块地基平坦且干燥，施工和采集不能隔崖进行，射线在每个经过的地块边界检测地形遮挡。单位与点击坐标查询实际地表三角面高度，资源与弹道使用同一地形数据。邻块共享一格边界，使贴图与迷雾连续。免费素材可通过 `scripts/import-frost-assets.py` 重新获取和适配（需 numpy、Pillow，自动接续环境、Dragon、阵营建筑、怪物和写实资产导入；写实阶段另需 meshoptimizer 0.24.0 与 Blender 4.5.9，见写实美术记录）；仅刷新环境可执行 `scripts/import-frost-environment.py`。原生截图与验收记录输出至 `docs/designs/frostbound-realms/`。

## 当前边界

这是可扩展的基础版本。尚未实现原作战役、四族完整美术与科技树/全部兵种、完整海陆空兵种体系、完整装备合成与技能树、完整 Dota 内容、可视化触发器图与通用脚本编辑、桥梁/洞穴等重叠地形、录像、观战、大规模单位寻路与完整公网服务。模拟上限 160 个单位，单张地图 64×64 世界单位。地形路线使用网格广度优先搜索，动态避让使用有界 A*，按帧复用可见障碍集合及地形通行边；角色姿态为 12 Hz，尚需进一步优化大规模战斗表现；不应将本次测试视为这些未实现功能的验收。

本任务进展、性能数据及验收限制见 [交付证据](../../docs/designs/frostbound-realms/README.md)。

英雄背包：I 打开六格背包，按钮切换 Use / Drop / Sell 后点击物品；数字小键盘 1–6 直接使用药水。右键地面掉落物会走近拾取，物品可转交其他英雄。O 打开主城商店，合成需要部件和配方费用，出售返还含部件总价的 50%。生命药水回复 250 HP，魔法药水回复 100 MP，共享 10 秒冷却。装备变更保持生命比例；满包时任务掉落保留在地面，手动丢弃不会被自动捡回。背包、掉落、拾取路线和冷却随存档及联机重连恢复。

写实素材与重建命令：[写实美术记录](../../docs/designs/frostbound-realms/realistic-art.md)、[部落建筑记录](../../docs/designs/frostbound-realms/warclans-art.md)。人族八种建筑与环境使用 CC0 资产；部落八种建筑外观采用 Wildfire Games 的 0 A.D. 木构、茅草建筑，原件及派生资源遵循 CC-BY-SA 3.0，许可随 Player 位于 `Assets/Licenses/0ad-warclans.txt`。其余两族建筑与部分角色仍需完善。

王国步兵与工人采用 0 A.D. 的写实比例链甲和布衣模块，保留待机、行走和战斗动作；工人另有砍树、采矿、建造/修理专属动作与对应工具。66 个源文件及派生资源哈希见 `human-sources.json`，同许可署名随 Player 位于 `Assets/Licenses/0ad-humans.txt`；模型头像图集包含本次派生内容。重建及原生验收见 [角色美术记录](../../docs/designs/frostbound-realms/human-art.md)。

人族游侠使用写实链甲弓箭手，弓弦/弓臂保留独立骨骼动画；待机手持箭、射击装填箭和飞行箭矢分别使用对应挂点与模型。射击阶段由战斗冷却驱动，行走时恢复持弓动作。原生动作图与验证记录见 [弓箭手美术](../../docs/designs/frostbound-realms/archer-art.md)。

远程攻击使用服务端权威弹道，到达后结算伤害。单机暂停与快速存档保留飞行状态；联机重连恢复当前可见弹道。普通远程追踪目标，攻城弹道落在发射时的目标位置，近战与火枪仍即时命中。实现与验收见 [弹道阶段记录](../../docs/designs/frostbound-realms/projectile-combat.md)。

实体箭、短弩箭、长投射物、弩炮箭和扫描石弹分别显示；火焰、冰霜、自然、暗影与奥术使用粒子拖尾和对应命中特效。弹体按渲染帧在已收到的位置之间平滑过渡，仍由权威模拟决定命中。详见 [弹体视觉阶段](../../docs/designs/frostbound-realms/projectile-visuals.md)。

四族攻城器械采用 0 A.D. CC-BY-SA-3.0 写实木制机械，包含弩炮、扭力投石机、牵引投石机和冲车，以及装填/发射机械动画。95 个源文件、35 个派生文件哈希见 siege-sources.json；素材署名随包位于 Assets/Licenses/0ad-siege.txt。弩炮两名、牵引投石机四名操作士兵已接入同步动画；重建及原生截图见 [攻城器械美术记录](../../docs/designs/frostbound-realms/siege-art.md)。

王国二级兵营可训练写实骑士，使用 0 A.D. 棕色战马与链甲骑手，同步站立、奔跑和挥剑动作，AI 也会训练。61 个源文件与 5 个派生文件哈希见 `cavalry-sources.json`，许可位于 `Assets/Licenses/0ad-cavalry.txt`。当前共 23 个原生单位头像；详情及截图见 [骑兵美术记录](../../docs/designs/frostbound-realms/cavalry-art.md)。

王国圣骑士与黎明圣骑士英雄采用 0 A.D. 铠甲、披风、圆盾和钉锤模块，英雄具有随技能冷却同步的举锤施法动作，主菜单和选择头像同步使用实际模型。37 个源文件、10 个派生文件哈希见 `paladin-sources.json`，许可位于 `Assets/Licenses/0ad-paladins.txt`；[圣骑士美术记录](../../docs/designs/frostbound-realms/paladin-art.md) 包含动作图和实机施法存档验证。

野外守卫采用 0 A.D. 写实灰狼，RPG 终点守卫采用棕熊，包含待机、行走、攻击和死亡动画。`wildlife-sources.json` 保存 20 个来源与 10 个生成文件的哈希，许可随 Player 分发；模型与 28 格实际头像、存档和尸体表现一致。重建命令与原生验收见 [野外守卫美术记录](../../docs/designs/frostbound-realms/wildlife-art.md)。

自然族树人使用 OpenGameArt 的 Entangled Roots，具备木纹材质、待机/行走/挥爪/死亡动画和实际模型头像。模型、动画及概念分别署名 piacenti、mysterymagination、Misha，遵循 CC-BY 3.0；两份原始 Blender 文件及派生资源哈希记录于 `treant-sources.json`，署名随 Player 分发。重建与原生验收见 [树人美术记录](../../docs/designs/frostbound-realms/treant-art.md)。

部落 Raider 使用 Guillaume “GuieA_7” Englert 的带贴图兽人，保留护甲、战锤和待机/行走/攻击/死亡动画，兵营训练与地图布置共用实际模型头像。原始 Blender、PNG、XCF 及派生文件哈希记录于 `orc-sources.json`，CC-BY-SA 4.0 署名随 Player 分发；重建与原生验收见 [兽人美术记录](../../docs/designs/frostbound-realms/orc-art.md)。

冬季地表使用多尺度积雪分布和扫描高度混合，包含湿土边缘、石缝残雪及地表纹理平移混合。素材沿用 Poly Haven CC0 扫描资产；实际截图、四后端编译和独立 Player 帧耗时见 [冬季地表](../../docs/designs/frostbound-realms/snow-surface.md)。

地图作者可在第七页单独绘制裸土、积雪或自动冬景，支持三种笔刷尺寸、撤销、地图保存与试玩。当前编辑地图可直接用于多人建房，双方显示和重连保留材质；操作说明与双原生客户端验收见 [地表材质编辑](../../docs/designs/frostbound-realms/surface-editor.md)。

`SkeletonBody` 是 Gord Goodwin 的 CC0 解剖骨架基础资产，保留绑定，带烘焙骨缝贴图。原生三视图和重建记录见 [解剖骨架](../../docs/designs/frostbound-realms/anatomical-skeleton.md)。它尚未接入弩手动作和武器，现有兵种未切换。

亡灵法师选中后按 Q 消耗最近的可见非英雄尸体，召唤两名持剑盾骷髅战士；按 W 切换自动施法，默认关闭。技能耗魔 75、冷却 8 秒、召唤持续 40 秒，施法范围按本项目尺度为 6 单位。移动和巡逻优先，攻击移动允许自动施法。召唤物可独立操作、不占人口，死亡或到期不留下可再利用尸体。法力、冷却、自动施法开关及召唤寿命均支持存档和联机重连。来源、写实模型和原生验证见 [尸体复活](../../docs/designs/frostbound-realms/raise-dead.md)。

亡灵工人按 D 建造诅咒神庙，要求二级据点；亡灵法师在神庙训练。神庙 U 依次研究学徒（100 金 / 50 木 / 30 秒）与大师（100 金 / 150 木 / 45 秒，需三级据点），每级增加现有和后续法师 40 生命、100 法力上限及每秒 0.25 法力回复。法师 E 邪恶狂热、R 残废，萨满 Q 净化，随后左键选择单位；目标面板显示状态持续时间。完整规则、兼容说明及原生记录见 [法师训练与驱散](../../docs/designs/frostbound-realms/casters.md)。

萨满现使用带兽人面部、皮手套、长袍和木杖的 `RealShaman` 模型，净化时朝向目标播放施法动作，支持施法中保存与读档。该模型仍属低面数手绘风格，尚非照片级写实；来源、可复现导入、动画截图及原生战斗验收见 [兽人萨满](../../docs/designs/frostbound-realms/shaman.md)。

兽族工人 D 建造灵魂归宿，U 研究萨满学徒/大师；萨满 W 闪电盾、E 嗜血、R 自动嗜血开关，Q 净化可驱散这两种效果。闪电盾会伤及周围友军，嗜血增加 40% 攻速和 25% 移速。升级、效果和自动施法支持存档及联机重连。完整规则和验证见 [灵魂归宿与萨满法术](../../docs/designs/frostbound-realms/shaman-spells.md)。

神庙 L 研究骷髅寿命、M 研究骷髅精通：新召唤延长至 55 秒，精通后生成一名战士与一名骷髅法师。法师使用解剖骨架、木杖和完整动画，可远程穿刺攻击地面及空中单位；当前联机协议为 19。来源、重建、运行截图与验证见 [骷髅精通](../../docs/designs/frostbound-realms/skeleton-mastery.md)。

诅咒神庙使用 CC0 石质教堂外观 `RealTemple`，包含石墙、侧塔、门廊和塔内绿光，16,560 三角面及四张 2048² 贴图。建筑头像、施工预览和地图编辑器共用该模型；素材来源、可复现导入与六向实拍见 [神庙美术](../../docs/designs/frostbound-realms/temple-art.md)。其他建筑和部分单位仍需统一写实风格。

亡灵兵营使用石砌陵墓 `RealRevenantBarracks`：凹入入口、封闭拱顶、石肋、六座扶壁尖塔及带窗棂的绿光窗，4,316 三角面及四张 2048² 贴图。改编自 rubberduck 的 CC0 城堡模块，八个派生文件的哈希可重复生成；施工、头像及地图编辑器共用该模型。来源、原生实拍和验证见 [兵营美术](../../docs/designs/frostbound-realms/crypt-art.md)。

亡灵补给与防御建筑采用同源 CC0 石材的 `RealRevenantLodge`、`RealRevenantTower`，显示为 Ziggurat 和 Soul tower，具有阶梯基座、拱门、扶壁以及灯笼或上层魂火核心。两种建筑的模型、四通道贴图及许可共 14 个文件可复现；来源与原生施工、攻击、编辑器截图见 [通灵塔建筑美术](../../docs/designs/frostbound-realms/ziggurat-art.md)。目前仍使用原有补给和防御塔规则，原版两条升级分支尚待实现。

亡灵主基地的三个等级使用带石砌门洞、柱饰、阶梯基座和绿光窗的 CC0 石质建筑，升级增加塔楼和中央尖塔，保持相同占地。模型、贴图、头像及升级中存档恢复已验证；来源、重建和游戏实拍见 [亡灵主基地](../../docs/designs/frostbound-realms/revenant-fortress.md)。

亡灵工人采用带兜帽、暗色长袍和短刃的 `RealAcolyte` 人形模型，采金/修理播放仪式动作，伐木使用斧头，保留现有工人经济规则。四组模型共 208 个原生动作采样已验证；来源、动作图、存档和召唤建造验证见 [亡灵工人美术](../../docs/designs/frostbound-realms/acolyte.md)。

### 亡灵专属经济

新对局中，侍僧使用 N 召唤石质诅咒金矿，最多五人在独立矿位施法，金币直接入账；食尸鬼负责伐木并运回主城。矿位、存档、AI、联机重连和原生画面已验证。旧存档保留原有工人经济，新开对局启用新规则。见 [亡灵经济与验证](../../docs/designs/frostbound-realms/undead-economy.md)。

地穴按 C 研究吞食尸体（75 金、30 秒）。食尸鬼和憎恶按 C 寻找附近尸体，分别每秒回复 10/15 HP，最多持续 33 秒；单独选择后停止或改令可以中断。群体命令保留正在进食的单位。操作与验证见 [吞食尸体](../../docs/designs/frostbound-realms/cannibalize.md)。

### 分层 3D 地块

地形使用共享顶点的连续起伏与分层 3D 地块，包含可编辑丘陵、凹地、高地收边、岩壁起伏、土层顶沿和崖脚阴影。抬高、降低、平滑、平台笔刷及验证见 [连续地表](../../docs/designs/frostbound-realms/terrain-sculpt.md)。凸角与凹角的连续轮廓见 [悬崖转角](../../docs/designs/frostbound-realms/terrain-corners.md)。兵种半径、地表高度和窄坡道验证见 [通行轮廓](../../docs/designs/frostbound-realms/cliff-clearance.md)。几何与编辑、登坡验证见 [分层地块](../../docs/designs/frostbound-realms/terrain-tiles.md)。

地图编辑器的地表页面可选择岩石、冰壁或砌石悬崖材质，撤销、地图保存、游戏存档与联机重连保留类型。CC0 素材来源、哈希、原生截图和验证见 [悬崖材质套件](../../docs/designs/frostbound-realms/cliff-styles.md)。

水平高地使用更宽的斜切收边与连续岩面，坡口保留步兵和攻城单位的通行宽度；贴地与拾取同步使用原生顶面三角形。实际截图与验证见 [宽肩地块](../../docs/designs/frostbound-realms/cliff-shape.md)。

崖顶外沿向下折出真实肩面，内侧平台保留地图高度，与岩壁连续衔接。形状、拾取、贴地和原生验证见 [立体崖顶肩面](../../docs/designs/frostbound-realms/cliff-crown.md)。

地形拾取按地面操作计算，水域通行栅格跨 tick 复用。独立 Player 帧耗、状态一致性和原生输入验证见 [拾取与通行计算的帧耗](../../docs/designs/frostbound-realms/frame-cost.md)。

崖壁扫描纹理按世界坐标混合变体，土壤、草地与积雪延续到顶沿，冬季岩石台阶承接积雪。材质通道、实机对照和验证见 [崖壁纹理与顶沿](../../docs/designs/frostbound-realms/cliff-materials.md)。

岩石悬崖按世界坐标和高度层选择三组横纵轮廓，保持共享边界与原有行走顶面。变体、接缝和原生登坡验证见 [岩壁轮廓变体](../../docs/designs/frostbound-realms/cliff-facets.md)。

### 默认对战开局

Skirmish 开始时为 500 金币、150 木材；Kingdom / Warclan / Wildwood 各有五名闲置工人，Revenant 有三名侍僧、一名食尸鬼及诅咒金矿。主基地提供的人口分别为 12 / 10 / 10 / 10，住房为 6 / 10 / 10 / 10，总上限 100。客户端先选择工人，玩家自行下达采集、建造和祭坛招募命令。AI 会建设祭坛、住房和兵营，安排金矿/伐木并优先招募所选英雄类型。客户端和服务器使用协议 30。实际默认开局及剩余差距见 [开局验证记录](../../docs/designs/frostbound-realms/melee-opening.md)。

### 回城卷轴

首个祭坛训练完成的英雄获得一张 Town Portal Scroll，复活不会补发已消耗的卷轴。数字小键盘 1–6 或点击物品格后，在战场或小地图选择己方完工主基地；双击卷轴自动选择回城基地。施法持续 5 秒，英雄无敌并暂停行动，S 可取消；卷轴在开始施法时消耗。附近存活的己方部队会一同传送，正在采集、建造、维修的工人及受困单位留在原地。额外卷轴在主城商店购买，价格 350 金币。普通对战主基地不自动治疗英雄，回城后保留原有生命值。规则、原生实拍与验证见 [回城卷轴](../../docs/designs/frostbound-realms/town-portal.md)。图标为内置 image_gen 生成的原创素材，提示词与 SHA-256 见 `town-portal-art.json`，来源说明随 Player 分发。

地表画刷、CC0 草地扫描与 MOBA 草地/石质兵线见 [地形调色板](../../docs/designs/frostbound-realms/terrain-palette.md)。联机协议 30 支持五种地表，拒绝旧客户端；旧单机地图保留已有地表，缺少 surfaces 时补自动冬景。

地图编辑器的地形套件页面支持 Winter / Forest / Barrens，按钮或 1–3 切换。已绘制的地表和悬崖保持各自样式，旧地图缺少 tileset 时使用冬景。撤销、地图存读档、游戏存档及联机重连保留选择。当前联机协议为 30。来源与实际运行验收见 [地形套件](../../docs/designs/frostbound-realms/terrain-tilesets.md)。
