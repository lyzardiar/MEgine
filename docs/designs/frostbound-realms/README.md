# Frostbound Realms 交付证据

2026-09-28。工程与操作说明见 [样例 README](../../../samples/frostbound-realms/README.md)。这是原创 RTS/RPG/MOBA/塔防基础版本；《冰封王座》完整内容复刻与约 5 ms 整体帧预算尚未完成。

## 本次范围

- 四阵营 16 个地面兵种、4 个攻城兵种、4 个飞行兵种定义、三级据点科技、采集建造生产、战争迷雾、英雄四技能、机器人对战。
- 攻城工坊、三级祭坛飞行单位、对空限制、攻击/护甲倍率、建筑集结和取消队尾全额退款；F9 攻城地图可直接游玩。采集支持耗尽后交付尾货并转向下一处资源，修复快速阵营在据点交付距离外停住的问题。
- 原创四阶段 RPG，任务角色、装备掉落、成长、死亡复活与存档；规则回放用合法命令在 707 tick 完成任务，并覆盖中途恢复。
- 三路 MOBA、三件基础装备与三套合成配方；十二波塔防、三类塔、升级出售、首领与快速波。
- 地图编辑器支持地形、单位、RPG 角色、玩家阵营与 AI、条件和动作触发器、前置依赖、三槽保存加载与试玩。RPG 地图校验必需角色。
- 服务端权威 TCP 房间、准备开局、可见性过滤、重连和退出后 AI 接管；两个独立原生编辑器进程验证真实收发。
- 39 个 Quaternius/Kenney 来源模型与 3 个模块组合塔楼，Poly Haven 地表贴图、粒子贴图及 Cinzel 字体。21 项来源/派生文件/许可/字体哈希核对通过。原始 ZIP 与贴图保留，冬季材质由代码适配；原创菜单插画、技能图集的完整生成提示词和哈希保存在 generated-art.json，合成配乐与四类音效由生成器重建。

引擎补充项目 JSON 存储、GLB 骨骼姿态、实体激活接口、Canvas 子节点索引、无物理组件场景快速路径，以及 GLB 姿态引用的打包依赖识别。原生视口 profiler 记录实际 renderSize，区分逻辑截图尺寸与编辑器预览尺寸。地表使用 64 个共享边界数据的区块，采用实际雪地/岩土贴图和插值迷雾；并接入冬季松林/岩石、建筑预览、技能图标、悬停说明、英雄状态条、远程弹道和伤害数字。

## 验证

| 验证路径 | 结果 |
| --- | --- |
| Node 游戏规则与真实 TCP | 通过；含完整 RPG 合法命令回放、科技、地图、迷雾、TD、合成和断线恢复 |
| mengine-script 库 | 20 通过 |
| mengine-physics 库 | 17 通过 |
| mengine-runtime UI | 85 通过 |
| gltf_pose / frost_skins | 2 + 1 通过；四个下载角色模型的蒙皮顶点变化，含 Dragon 飞行动画 |
| editor-host frost_sample | 1 通过；真实 QuickJS，含 RPG 地图角色与试玩 |
| CLI pcPackage | 63 通过 |
| editorProfiler / nativeViewportFrame | 14 通过 |
| 编辑器前端及 Release 编辑器/Player | 构建通过，编辑器启用 tauri/custom-protocol |

[native-qa.json](native-qa.json) 与最终贴图复测 [native-tactics-qa.json](native-tactics-qa.json) 记录原生 Agent 菜单点击、英雄移动、施法、暂停、存档恢复、地图绘制与保存加载试玩、单位/触发器持久化、RPG 保存，以及双客户端真实 TCP 开局与强制断线重连。最新额外验证生产建筑选择/右键集结/取消队列、四种攻城模型、飞龙空中选中及跨河移动、塔防工人选择/建造预览/下单、RPG 施法、地表自定义材质未被拒绝；共享边界、玩家施法跨 tick 保留、AI 施法不重复发送均有规则回归。QA 使用独立配置和独立 storageId，不触碰用户存档。

Agent 输入没有覆盖物理键鼠设备；未听取实际音频，未做跨机器局域网和弱网验收。独立 Player 启动后保持响应，窗口标题正确，日志无 ERROR；本次未核验音频设备状态或实际听感，日志仍有 wgpu downlevel 能力警告。见 [启动证据](player-smoke.json) 和 [日志](player-stderr.txt)，不能替代 Player 窗口内完整操作验收。

## 原生画面

截图由原生 Game 路径生成，逻辑截图尺寸 1280×720。

![Skirmish](skirmish.png)
![Tower defense](tower-defense.png)
![RPG](rpg.png)
![Map editor](map-editor.png)

另有 [攻城战场](siege.png)、[飞行单位](flight.png)、[生产与集结](production.png)、[标题](title.png)、[MOBA](ancients.png)、[大厅](lobby.png)、[联机](multiplayer.png)、[建造预览](placement.png)、[RPG 伤害反馈](combat.png)。

## 性能口径

| 指标（ms） | 初始基线 | 上一阶段 | 当前画面 |
| --- | ---: | ---: | ---: |
| 模拟 | 46.990 | 25.484 | 15.024 |
| 原生渲染（已包含在命令内） | 46.645 | 7.013 | 7.170 |
| 原生命令 | 59.454 | 13.634 | 10.320 |
| 上传 | 0.689 | 0.684 | 1.458 |
| 浏览器绘制（按 sampleCount 加权） | 10.912 | 9.412 | 5.135 |
| 整体工作预算代理值 | 118.045 | 49.214 | 31.937 |
| 原生请求延迟 | 101.763 | 58.012 | 48.822 |
| 模拟请求延迟 | 120.742 | 104.514 | 63.229 |
| 呈现间隔 | 171.161 | 72.610 | 56.156 |
| P95 呈现间隔 | 220.800 | 144.400 | 103.900 |

最新实际原生预览 **1280×720**，**1574 实体**，55 次原生采样，呈现频率约 **17.81 FPS**。整体工作预算约 **31.94 ms**，**未达到 5 ms**。上一画面阶段实测 850×478，不能将跨分辨率短采样作为严格性能提升结论。

采样场景是开局 20 单位 Skirmish，不能代表 160 单位压力测试。CPU 为 Intel Core Ultra 7 265K；系统安装 AMD Radeon RX 6800 XT 和 Intel Graphics，编辑器本次实际选择的适配器未记录。未接入 GPU timestamp，表内原生渲染是 CPU/提交墙钟耗时，不能作为 GPU 执行时间。

原生命令已经包含渲染，不能再次相加。整体工作预算采用模拟 + 原生命令 + 上传 + 浏览器绘制的平均值之和；这是多个采样流的工作预算代理值，不是逐帧端到端延迟。IPC 请求、呈现间隔另列。采样窗口约三秒，尚无长期或独占机器基准；基线未记录真实渲染尺寸，不能视为严格同分辨率对照。原始数据见 [基线](performance-baseline.json)、[最新回归](native-qa.json)、[汇总](performance-summary.json)。

## 运行与复现

```powershell
node scripts/build-frostbound.mjs
node scripts/test-frostbound.mjs
pnpm.cmd run build:editor
cargo build --release -p mengine-runtime -p mengine-editor-tauri --features tauri/custom-protocol
node scripts/qa-frostbound.mjs
pnpm.cmd --filter @mengine/cli build
node packages/cli/dist/cli.js build samples/frostbound-realms --runtime target/release/mengine-runtime.exe --skip-runtime-build --out samples/frostbound-realms/Builds/windows-x64 --clean
```

运行 `samples/frostbound-realms/Builds/windows-x64/Frostbound Realms.exe`。生成脚本 Main.js 和 Builds 目录按仓库惯例不提交；新检出必须先运行生成器。最终包的内容哈希、文件数与启动检查留存于 player-smoke.json。

## 剩余工作

原作战役、四阵营完整独立建筑和科技/空军/攻城、完整 Dota 英雄池与装备规则、长篇 RPG、可视化触发器图、复杂地形、录像观战、大规模导航、公网匹配/认证/NAT 尚未实现。界面、美术与动画也仍处于原型阶段；已实现的系统和本次验证不等于这些功能的验收。
