# 官方游戏与工具参考

来源：[Unity 英文示例目录](https://unity.com/demos)、[中文目录](https://unity.com/cn/demos)、[用户提供的第三方清单](https://www.cnblogs.com/puwen/p/18721845)。本表记录后续范围，不计入已移植的 20 个独立 2D 功能示例。

## 完整玩法与界面

| 参考项目 | 对应能力 | 交付状态 |
| --- | --- | --- |
| [Happy Harvest](https://assetstore.unity.com/packages/templates/packs/happy-harvest-2d-sample-project-259218) | 农场循环、角色骨骼动画、昼夜灯光与阴影 | 待实现与原生验收 |
| [Gem Hunter Match](https://assetstore.unity.com/packages/essentials/tutorial-projects/gem-hunter-match-2d-sample-project-278941) | 三消、触摸输入、关卡流程、2D 灯光与特效 | 待实现与原生验收 |
| [Dragon Crashers](https://unity.com/demos/1937-ui-toolkit-sample-dragon-crashers) | 放置 RPG、战斗表现、完整运行时 UI | 待实现与原生验收 |
| [QuizU](https://assetstore.unity.com/packages/essentials/tutorial-projects/quizu-a-ui-toolkit-sample-268492) | 问答流程、页面管理、数据与界面绑定 | 待实现与原生验收 |
| [PaddleGameSO](https://github.com/UnityTechnologies/PaddleGameSO) | Classic / Hockey / Foosball 玩法与数据驱动结构 | 待实现与原生验收 |
| Unity 2D Game Kit | 平台跳跃、战斗、关卡编辑工具 | 待核对官方包并实现 |

Asset Store 包与 PaddleGameSO 不作为本次 MIT 示例源码的一部分。后续优先复现公开玩法与工具行为；复制包内资源前分别核对其授权。Unity 目录当前 Dragon Crashers URP 2D 卡片指向 UI Toolkit 包，需先确认对应下载内容。

## 引擎扩展工具

| 参考 | MEngine 中的目标 | 验收要求 |
| --- | --- | --- |
| DOTween | 补间、序列、暂停/取消、回调 | 编辑器与 Player 时序一致，生命周期不泄漏 |
| Cinemachine | 跟随、阻尼、边界、镜头切换 | 2D/3D 实际场景与相机切换验收 |
| Addressables | 资源句柄、异步加载、依赖与释放 | 缺失资源、重复请求、卸载及打包路径验收 |
| UI Toolkit / Editor 工具 | 可视化 UI 编辑、属性、层级、预览 | Undo/Redo、布局、键盘操作及 Agent 同路径验收 |
| Input System | 动作映射、多设备、重绑定 | 键鼠、手柄与 Player 输入验收 |
| UniRx / 框架示例 | 状态通知和可释放订阅 | 沿用现有事件接口，验证取消与销毁 |
| URP / HDRP / VFX | 2D 灯光、3D 材质、粒子与后处理 | 原生画面、材质错误处理和性能测量 |
| Mirror / FishNet | 网络同步、状态复制与断线恢复 | 独立多进程验收 |
| NavMesh | 导航生成、路径与动态障碍 | 实际角色移动、重寻路与性能测量 |
| ML-Agents | AI 观测、动作和环境重置 | 可重复训练/推理接口与运行隔离 |
| AR Foundation / VR | 设备输入、跟踪和渲染适配 | 对应真实设备验收 |
| ECS 示例 | 大规模实体更新与资源访问 | 有负载场景的性能数据 |

这些是功能对照方向，尚未作为对应工具的完整复刻交付。现有原生物理、2D 材质、脚本、批量 Agent 步进和样例验收脚本可作为基础。

## 2026-09-25：海岸竞速垂直切片

[Pelican Road Rage](../samples/pelican-road-rage/README.md) 提供可运行的原创 3D 游戏：2.7 km 赛道、六名对手、近身攻击与击倒、漂移、氮气、拾取、暂停、重开与结算。美术采用连续曲面鹈鹕、分件摩托、起伏海面与夕阳着色器；保留生成器、源材质和原生截图。

| 对照方向 | 本次已实现 | 后续范围 |
| --- | --- | --- |
| Cinemachine | 三种带阻尼的跟随 / 侧视镜头、速度 FOV、受击抖动 | 可复用虚拟相机组件、遮挡避让、边界、轨道和镜头编辑工具 |
| Input System | 原生键鼠输入驱动完整比赛，Agent 可注入物理键并暂停步进 | 动作资产、重绑定、手柄与多设备验收 |
| URP / VFX | 原生 PBR、方向光阴影、海面 / 天空 / 路面自定义着色器、命中粒子 | 屏幕空间反射、接触阴影、泡沫、后处理与 GPU 性能分析 |
| UI / 游戏流程 | 标题、仪表、连击、暂停和结果界面 | 通用运行时 Button 事件桥、编辑器与 Player 的 RectTransform 坐标一致性 |
| Agent / 脚本效率 | Game 截图直接取得指定分辨率原生像素；QuickJS 按需转换快照；避免无事件帧重复注入 | 多步原生批处理、脚本快照增量化与帧预算分析 |

验证包括 Node 输入逻辑、真实 QuickJS / 原生 World 完整比赛，以及原生编辑器 Agent 交互截图。独立 Player 已构建、校验并启动；桌面自动化窗口捕获失败，Player 窗口内的操作与音频听感仍待人工确认。当前性能测量及其验收范围见[编辑器性能报告](designs/editor-performance/README.md)。

本次同时修复无 Transform 的全局 EnvironmentLight 被忽略的问题，并覆盖失活环境光不生效的回归测试。上述能力在实际样例内交付；DOTween、Cinemachine、Input System 等通用工具仍按各自验收要求推进。

## 2026-09-26：纵向弹幕射击

[Astral Thunder / 雷霆战机](../samples/thunder-fighter/README.md) 交付两段关卡、两名 Boss 与五种弹幕阶段，包含武器升级、追踪导弹、擦弹充能、Nova、Overdrive、暂停和结算。星云与发光弹幕使用原生自定义着色器，六舰图集为项目生成资源。

引擎新增 `SpriteBatch2D`：每个实例保存局部 X/Y、弧度和尺寸倍数，可提供平行颜色数组；支持父级变换、图集、材质、MaterialPropertyBlock、排序、编辑器预览和 Player 依赖收集。单组件处理前 8192 个实例，忽略非有限或非正尺寸；样例限制 900 发敌弹。复用现有精灵投影与材质合批路径。

真实 QuickJS / 原生 World 输入回放约 109 秒通关，覆盖五种 Boss 阶段、受伤、擦弹与四次 Nova，峰值 478 发敌弹。Agent 实况验证出击、移动、Nova、暂停、继续、重开及 Stop 场景恢复；原生 Game 截图检查各弹幕阶段和图集切片。独立 Player 的桌面操作与音频听感尚未通过验收，未宣称达到 60 FPS。

## 2026-09-26：小游戏帧预算与运行时重构

编辑器与独立 Player 使用 QuickJS-NG，脚本保持每宿主隔离、调用超时、堆限制和帧边界提交。新增 `engine.setSpriteBatchData` 数值数组接口；IDL、编辑器 Undo、Agent `batch.apply` 原子校验和 MCP schema 同步支持。雷霆战机直接提交弹幕数值数组；资源变更检查按 250 ms 轮询，原生渲染缓存文字几何并简化 Canvas 合批重叠分析。

按模拟、原生命令（包含渲染）、上传、浏览器绘制汇总约 5 ms 的整体工作预算，IPC 请求延迟和画面交付频率另列。最新实战值、与原实现的对比、测量环境及剩余差距见[完整性能报告](designs/editor-performance/README.md)，不以单独渲染耗时替代整体耗时。两款原生完整回放、Player 包校验及多视图回归分别留存证据。

## 3D 参考

### 2026-09-26：Ion Outpost 联机 FPS

[Ion Outpost](../samples/ion-outpost/README.md) 将 26 个实际下载的 CC0 角色、怪物、武器和场景模型接入原生 3D 样例，保留原件、许可、下载地址与校验值。包括双武器、掩体遮挡、爆头、换弹、复活、护盾补给、计分和机器人网格寻路。

联机采用 60 Hz 服务端权威模拟、逐帧输入记录、20 Hz 快照、本地预测与确认后重放、远端插值；房间支持创建、浏览、准备、开局、加入、房主移交和令牌重连。两个独立原生编辑器进程通过真实 TCP 服务端完成同房间对局与重连验收。该样例覆盖 Mirror / FishNet 对照方向中的基础能力，未将其记为对应工具的完整复刻；公网中继、认证和弱网验收尚未交付。

引擎增加 `engine.network` 有界异步 TCP 接口，以及 `Camera3D.capture_pointer`、相对鼠标位移和 Agent 输入通道。原生 Player 与 Game 视图点击捕获、Escape 释放鼠标；模型和 3D 材质贴图采用 250 ms 变更检查，显式失效和首次加载立即处理。[原生截图及验证证据](designs/ion-outpost/README.md)。

Fantasy Kingdom、Megacity Metro、Boss Room、Battle Royale 用于游戏循环与场景规模；Time Ghost、Enemies、The Heretic、Book of the Dead、Adam、The Blacksmith 用于渲染和动画能力对照。按可运行场景逐项推进，并区分资源复用、功能实现与设备性能验收。

第三方文章中的 `Unity-Technologies/2d-game-kit` 链接未核实为有效仓库；`2d-extras` 是 Tilemap 工具集，不能作为 Roguelike 游戏示例计数。
