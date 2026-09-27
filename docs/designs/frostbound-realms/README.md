# Frostbound Realms 交付证据

2026-09-28。工程与操作说明见 [样例 README](../../../samples/frostbound-realms/README.md)。这是原创 RTS/RPG/MOBA/塔防基础版本；《冰封王座》完整内容复刻与约 5 ms 整体帧预算尚未完成。

## 本次范围

- 四阵营 16 个兵种定义、三级据点科技、采集建造生产、战争迷雾、英雄四技能、机器人对战。
- 原创四阶段 RPG，任务角色、装备掉落、成长、死亡复活与存档；规则回放用合法命令在 707 tick 完成任务，并覆盖中途恢复。
- 三路 MOBA、三件基础装备与三套合成配方；十二波塔防、三类塔、升级出售、首领与快速波。
- 地图编辑器支持地形、单位、RPG 角色、玩家阵营与 AI、条件和动作触发器、前置依赖、三槽保存加载与试玩。RPG 地图校验必需角色。
- 服务端权威 TCP 房间、准备开局、可见性过滤、重连和退出后 AI 接管；两个独立原生编辑器进程验证真实收发。
- 18 个 Quaternius/Kenney CC0 模型、动画与粒子贴图。13 个原始文件保留在 SourceAssets，哈希核对通过，重复导入未改变模型/纹理输出。原创合成配乐与四类音效可由生成器重建。

引擎补充项目 JSON 存储、GLB 骨骼姿态、实体激活接口、Canvas 子节点索引、无物理组件场景快速路径，以及 GLB 姿态引用的打包依赖识别。原生视口 profiler 记录实际 renderSize，区分逻辑截图尺寸与编辑器预览尺寸。

## 验证

| 验证路径 | 结果 |
| --- | --- |
| Node 游戏规则与真实 TCP | 通过；含完整 RPG 合法命令回放、科技、地图、迷雾、TD、合成和断线恢复 |
| mengine-script 库 | 20 通过 |
| mengine-physics 库 | 17 通过 |
| mengine-runtime UI | 85 通过 |
| gltf_pose / frost_skins | 2 + 1 通过；三个下载角色模型的蒙皮顶点变化 |
| editor-host frost_sample | 1 通过；真实 QuickJS，含 RPG 地图角色与试玩 |
| CLI pcPackage | 63 通过 |
| editorProfiler / nativeViewportFrame | 14 通过 |
| 编辑器前端及 Release 编辑器/Player | 构建通过，编辑器启用 tauri/custom-protocol |

[native-qa.json](native-qa.json) 记录原生 Agent 菜单点击、英雄移动、施法、暂停、存档恢复、地图绘制与保存加载试玩、单位/触发器持久化、RPG 保存，以及双客户端真实 TCP 开局与强制断线重连。QA 使用独立配置和独立 storageId，不触碰用户存档。

Agent 输入没有覆盖物理键鼠设备；未听取实际音频，未做跨机器局域网和弱网验收。独立 Player 启动后保持响应，窗口标题正确，日志无 ERROR；此环境无法找到默认音频设备，音频输出被禁用，另有 wgpu downlevel 能力警告。见 [启动证据](player-smoke.json) 和 [日志](player-stderr.txt)，不能替代 Player 窗口内完整操作验收。

## 原生画面

截图由原生 Game 路径生成，逻辑截图尺寸 1280×720。

![Skirmish](skirmish.png)
![Tower defense](tower-defense.png)
![RPG](rpg.png)
![Map editor](map-editor.png)

另有 [标题](title.png)、[MOBA](ancients.png)、[大厅](lobby.png)、[联机](multiplayer.png)。

## 性能口径

| 指标（ms） | 基线 | 最新 |
| --- | ---: | ---: |
| 模拟 | 46.990 | 25.484 |
| 原生渲染（已包含在命令内） | 46.645 | 7.013 |
| 原生命令 | 59.454 | 13.634 |
| 上传 | 0.689 | 0.684 |
| 浏览器绘制（按 sampleCount 加权） | 10.912 | 9.412 |
| 整体工作预算代理值 | 118.045 | 49.214 |
| 原生请求延迟 | 101.763 | 58.012 |
| 模拟请求延迟 | 120.742 | 104.514 |
| 呈现间隔 | 171.161 | 72.610 |
| P95 呈现间隔 | 220.800 | 144.400 |

最新原生渲染尺寸 **850×478**，2343 实体、43 次原生采样，交付频率约 **13.77 FPS**。整体工作预算约 **49.21 ms**，**未达到 5 ms**。基线为 2342 实体，增加配乐后为 2343 实体。

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
