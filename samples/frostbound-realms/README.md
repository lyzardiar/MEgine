# Frostbound Realms / 霜境战纪

MEngine 原生 3D RTS 游戏工程。围绕资源采集、建造、出兵、英雄战斗与自定义地图建立可运行的基础版本，使用下载的 Quaternius、Kenney、Poly Haven CC0 资产。当前实现尚未达到《魔兽争霸 III：冰封王座》完整复刻的内容量和玩法深度。

当前画面采用雪地/岩土贴图、柔化边缘的战争迷雾、冬季松林与岩石、模块组装防御塔、原创菜单插画和技能图标。操作面板提供头像、生命/法力条、悬停提示；场景内显示选择圈、移动落点、建筑预览、远程弹道与伤害数字。

## 运行

先在仓库根目录执行 `node scripts/build-frostbound.mjs`，生成被 Git 忽略的 `Assets/Scripts/Main.js`，再在 MEngine 编辑器打开本目录，切到 Game 后 Play。独立播放器构建入口（先完成 CLI 和 Release runtime 构建）：

```powershell
node scripts/build-frostbound.mjs
node packages/cli/dist/cli.js build samples/frostbound-realms --runtime target/release/mengine-runtime.exe --skip-runtime-build --out samples/frostbound-realms/Builds/windows-x64 --clean
```

生成后运行 `Builds/windows-x64/Frostbound Realms.exe`。菜单支持鼠标点击和 F1/F2/F3/F4/F8/F9 快捷键。

## 玩法

- **Skirmish**：玩家与 AI 对战。金矿、伐木、采集回库、人口、建造进度、生产队列、武器研究、战争迷雾；摧毁敌方最后一座据点获胜。四阵营各有四个兵种，共 16 个兵种定义；二级据点解锁高级兵种，三级据点解锁更高武器研究及祭坛飞行单位。二级据点可建攻城工坊，各阵营分别训练弩炮、投石车、投石机、攻城锤；四种飞行兵种共用 Dragon 动画模型并具有不同属性。普通/穿刺/魔法/攻城攻击按目标护甲结算，攻城对建筑三倍伤害；近战和攻城不能对空。圣骑士/德鲁伊治疗、萨满减速、亡灵吸血及阵营属性不同；当前共用下载的角色和建筑美术。
- **Siege of Winterfall [F9]**：预置四种攻城器械和飞龙，突破路口防御塔后摧毁敌方基地；用于直接体验攻城与空中战术。
- **Ancients of the Vale**：Dota 风格三路推塔地图，自动刷兵、防御塔、英雄经验与升级、四名英雄共 16 种技能、三件基础装备与三套合成配方、基地补给和死亡复活。当前是一张简化的原创 MOBA 地图，尚不是原版 Dota 地图、完整英雄池或规则复刻。
- **Serpentine Watch**：十二波塔防，守卫塔、减速冰塔、范围火塔，最高三级升级、65% 金币出售返还；快速波、高生命波与每四波首领。建塔只消耗金币，最多 40 座，不能堵塞道路；漏怪扣除生命，首领漏过扣五点，清完最后一波获胜。当前为单机。
- **The Shattered Covenant [F8]**：原创 RPG，清除三名斥候、夺回遗物、击败君王、返回圣所四阶段任务；掉落装备、经验升级、技能、金币奖励、死亡复活与存档续玩。
- **World Editor**：32×32 地形网格，草地/水域/道路、树木/金矿/野怪、双方出生点；初始金币、刷怪间隔与波次数；按 V 切换地形、单位、触发器、玩家配置；摆放单位与 RPG 任务角色，配置两个玩家的阵营与 AI，添加进入区域/定时/击杀条件，执行增援/奖励/消息/胜利。触发器一次性执行，JSON 的 after 支持依赖前置触发器。撤销、三个保存槽、加载和直接试玩。
- **Multiplayer**：两个原生客户端的 RTS/MOBA 房间、准备、开局、服务器权威裁决、可见性过滤、掉线保留席位 15 秒并尝试重连。空位和主动退出的阵营交给 AI。隐藏敌方经济、生产队列、集结点、命令路径、地图单位布置和触发器。

Skirmish 建筑由工人到场启动：Kingdom 工人持续施工，可多工协作（额外工人加速并消耗材料）；Warclans 工人驻留建筑直到完工；Wildwood 的据点、兵营、工坊和塔消耗工人后自然生长，农舍与祭坛无需消耗；Revenant 召唤启动后释放工人，非据点建筑要求位于完工据点 18 格或祭坛 12 格内。工地初始生命为 10%，随施工增加；取消工地退还原价 75%，返还驻留或生长中的工人。工人可维修己方完工建筑；资源不足时暂停，材料总价按修复生命比例的原价 50% 计算。采集回到最近的完工据点。TD 保持自动建塔。

四名可选英雄为 Frost Warden（冰霜控制/治疗）、Ember Sage（火焰法术/飞龙召唤）、Sylvan Ranger（远程箭术/缠绕）、Dawn Paladin（近战/神圣防护）。每名英雄有独立属性、模型、四个技能、头像和技能图标；出生带一点技能点，升级再获得一点。普通技能最多三级，分别要求英雄 1/3/5 级；终极技能一阶，要求英雄 6 级。地图 JSON 的玩家和英雄单位支持 `heroClass`（0..3），单位页选择 Hero 后可切换英雄类型。

## 操作

| 操作 | 输入 |
| --- | --- |
| 选择 / 框选 / 追加选择 | 左键 / 拖动左键 / Shift |
| 移动 / 攻击 / 采集 | 右键点击地面、敌人或资源 |
| 攻击移动 / 停止 | A 后左键 / S |
| 选中并居中英雄 | Space |
| 相机平移 / 缩放 | 方向键 / Home、End |
| 建造 | 选工人，底部按钮；C 扩张据点、F 农舍、B 兵营、T 塔、L 祭坛、J 攻城工坊，随后左键选址 |
| 施工 / 维修 | 选工人右键己方工地或受损建筑，或 R 后左键；选工地点击 Cancel 返还 75% |
| 塔防 | 工人 T 守卫塔、G 冰塔、H 火塔；选塔点击升级或出售 |
| 出兵 / 研究 | 选建筑后点底部按钮；兵营 U 研究 |
| 集结 / 取消生产 | 选生产建筑后右键地面或点 Rally；Cancel last 取消队尾并全额退还、释放预留人口 |
| 选择英雄 | 主菜单或联机大厅 H / 英雄按钮 |
| 学习技能 | K 切换学习页，Q/W/E/R 学习；Shift+Q/W/E/R 直接加点 |
| 技能 | Q/W/E/R，目标技能随后左键指定；自身技能立即施放 |
| 商店 | O 切换商店页；英雄回主基地附近，点击装备按钮 |
| 编队 | Ctrl+1..9 保存；1..9 选择 |
| 暂停 / 保存 / 返回菜单 | Escape / F5 / F10 |
| 编辑器页面 / RPG | V 切页面；单位页 Role 选择 scout / keeper / boss，RPG 地图必须具备任务角色 |
| 编辑器笔刷 | 数字 1..9 或底部按钮 |
| 编辑器保存 / 加载 / 试玩 | F5 / F6 / F7；N 切换保存槽 |
| 地图模式 / 波数 / 间隔 / 金币 | Tab / PageUp、PageDown / [、] / +、- |
| 编辑器撤销 | Ctrl+Z |

地图与单机存档以 JSON 存放于 Windows `%LOCALAPPDATA%/MEngine/UserData/<项目标识哈希>/`：`map1.json` 至 `map3.json`、`quicksave.json`。工程清单中的稳定 `storageId` 让编辑器与打包后的同一游戏共用存档；不同游戏应使用不同标识。分享地图可复制地图槽 JSON 到另一台电脑的对应目录，再在编辑器中加载。导入时检查版本、地形长度、坐标与数量限制。

## 联机

客户端与服务端使用协议 3，旧协议连接会被拒绝；更新时双方需同步。旧单机未完工建筑继续自动建造，新存档保留工人和施工状态。

```powershell
# 同机测试
node samples/frostbound-realms/server.mjs
# 局域网主机
node samples/frostbound-realms/server.mjs --host 0.0.0.0 --port 7788
```

多人菜单按 I 编辑服务器 `IPv4:端口`，F1 创建 RTS 房间、F2 创建 MOBA 房间、F3 浏览房间。大厅 H 更换英雄，更换后双方需要重新准备。双方 Enter 准备，房主再次 Enter 开局。协议版本为 2，客户端和服务器必须配套更新，旧协议连接会被拒绝。服务器以 10 Hz 推进模拟，客户端仅提交命令；拒绝重复序号、操作敌方单位、不可见目标与非法坐标，限制连接、请求大小和发送频率。未提供公网匹配、NAT 穿透、账户系统或加密传输；当前目标为本机与可信局域网。

## 资源与引擎扩展

`asset-sources.json` 保存官方下载地址、13 个原始文件的 SHA-256 和许可；`SourceAssets/` 保留原始 glTF 与两个 Kenney ZIP，`Licenses/` 保留许可来源。角色来自 [Quaternius RPG Character Pack](https://quaternius.com/packs/rpgcharacters.html)，建筑来自 [Ultimate Fantasy RTS](https://quaternius.com/packs/ultimatefantasyrts.html)，自然物件来自 [Kenney Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit)，粒子贴图来自 [Kenney Particle Pack](https://kenney.nl/assets/particle-pack)。四套均标注 CC0。角色原始骨架和动画保留，多个材质合成图集；生成器提供原创 24 秒循环配乐及指令、战斗、法术、胜利音效，字体沿用仓库的 Roboto 及其许可。导入器优先使用保留的原件，并在转换前核对源文件哈希。

`environment-sources.json` 记录新增 [Kenney Castle Kit](https://kenney.nl/assets/castle-kit)、[Nature Kit](https://kenney.nl/assets/nature-kit) 原始 ZIP，以及 [Poly Haven](https://polyhaven.com/license) 的 snow_02 / rocky_terrain 贴图，共 20 个源模型及两张地表贴图，含四种攻城器械。三种塔由下载的模块离线组装；加上 Dragon，目录合计 39 个来源模型和 3 个组合模型。冬季调色和积雪材质由代码适配，下载原件不改动。`font-sources.json` 保留 Cinzel 字体及 OFL 许可校验值。

`dragon-sources.json` 记录 [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) 的 CC0 Dragon FBX 镜像、原件哈希和固定版本 FBX2glTF 转换器归档哈希。原 FBX、派生 glTF、骨架与五个动画都保留；Windows 导入器在项目 tmp 目录提取转换工具，不修改系统安装。官方 glTF 文件本次遇到 Drive 配额限制，因此使用可取得的 FBX 源模型转换。

`generated-art.json` 保存内置 image_gen 生成菜单背景与 4×4 技能图集的完整提示词和 SHA-256；这两张原创插画位于 `Assets/Art/`，战场由引擎实时渲染。uuu9 当前主站跳转至资讯站，旧 war3.uuu9.com 未取得可用下载或明确再分发许可，本次没有纳入该站素材。

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

游戏规则位于 `game/simulation.js`，原生交互位于 `game/client.js`，地形数据打包位于 `game/terrain.js`；修改后执行生成器。地表通过 64 个区块的自定义材质绘制，邻块共享一格边界，使贴图与迷雾连续。免费素材可通过 `scripts/import-frost-assets.py` 重新获取和适配（需 numpy、Pillow，自动接续环境和 Dragon 导入）；仅刷新环境可执行 `scripts/import-frost-environment.py`。原生截图与验收记录输出至 `docs/designs/frostbound-realms/`。

## 当前边界

这是可扩展的基础版本。尚未实现原作战役、四族完整独立建筑与科技树/全部兵种、完整海陆空兵种体系、完整装备合成与技能树、完整 Dota 内容、可视化触发器图与通用脚本编辑、多层地形、录像、观战、大规模单位寻路与完整公网服务。模拟上限 160 个单位，单张地图 64×64 世界单位。寻路使用网格广度优先搜索，角色姿态为 12 Hz，尚需进一步优化大规模战斗表现；不应将本次测试视为这些未实现功能的验收。

本任务进展、性能数据及验收限制见 [交付证据](../../docs/designs/frostbound-realms/README.md)。
