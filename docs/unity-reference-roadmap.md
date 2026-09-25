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

## 3D 参考

Fantasy Kingdom、Megacity Metro、Boss Room、Battle Royale 用于游戏循环与场景规模；Time Ghost、Enemies、The Heretic、Book of the Dead、Adam、The Blacksmith 用于渲染和动画能力对照。按可运行场景逐项推进，并区分资源复用、功能实现与设备性能验收。

第三方文章中的 `Unity-Technologies/2d-game-kit` 链接未核实为有效仓库；`2d-extras` 是 Tilemap 工具集，不能作为 Roguelike 游戏示例计数。
