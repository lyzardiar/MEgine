# Unity 官方 2D 示例移植

目标：修复编辑器标题栏的一致性，在 `samples` 中复刻 20 个来自 Unity 官方仓库的独立示例，并交付每个示例在 MEngine 中实际运行的截图。

## 来源

未找到 Unity 发布的官方 Top 20 排名。采用官方源码中的独立演示，保留名称、来源、固定版本和许可证；清单是本项目的移植选择，不代表官方排名。

- `Unity-Technologies/2d-techdemos`，提交 `6593d544df2ea598e51f5cf1d7165d5ed42ceba7`，MIT：16 个独立场景（Normal Mapping 的 Built-in 和 URP 版本只计一次）。
- `Unity-Technologies/PhysicsExamples2D`，`archive/2019`，提交 `873d60529b7e4735bdc8821048e728e42d3a0fad`，Unlicense；Platformer Art 为 Kenney CC0：4 个独立物理演示。
- 示例属于小游戏或功能演示，不能称作 20 款完整游戏。

## 验收状态

- 标题栏：统一 29px 高度、靠左的内容宽度标签、固定分离窗口按钮、窄窗口标签选择器；移除按面板宽度拉伸当前标签并隐藏其他标题的行为。Windows 窗口使用深色主题。
- 原生编辑器截图已核对；标签实测宽度 67–92px，不再拉满面板。构建、键盘导航和 Agent 快照检查通过。
- Brick 已移植并通过原生 Agent 验收：128 → 126 块砖、挡板移动、实体 ID 稳定、落底重开、R 重开、停止恢复、再次播放清空输入。Animated Tile、Destructible 也已完成；其余 17 项尚未完成。
- Brick 实际运行截图：`docs/designs/unity-demos/brick-game.png`，编辑器全窗：`brick-editor.png`，结果：`brick-result.json`。复验入口：`scripts/qa-unity-brick.mjs`（使用独立 QA 配置目录）。
- Animated Tile：保留 8 个单元格、10 个官方 Sprite 切片及 10 FPS 帧序列；原生截图验证换帧、暂停冻结、重开首帧与停止恢复。证据 `docs/designs/unity-demos/animated-tile-*`，复验 `scripts/qa-unity-animated-tile.mjs`。
- Destructible：559 个单元格、官方图集与爆炸关键帧；一次十字爆破使前景 235 → 228，保留全部 128 个 Border，24 个地面单元更新，远处 Sprite 不变。按住鼠标不重复触发、特效结束回收、R 重开与停止恢复通过。证据 `docs/designs/unity-demos/destructible-*`；复验 `scripts/qa-unity-destructible.mjs`。
- Editor Play 已接通项目启动脚本、物理和输入，Agent 已验证单步、按下边沿、停止恢复与重新运行。场景切换和公开运行请求复用 Player 处理。Timeline 粒子 seek、相机 override 与运行时 UI 控件事件仍需接通/验收。

## 下一步

1. 共享脚本 host 的世界快照、输入、错误与生命周期；接通 Editor 和 Player。
2. 导入官方场景层级、贴图切片、布局及动画，移植样例行为。
3. 每项验证交互/模拟、停止后恢复、再次运行及 Agent 操作，保存真实截图与验收记录。

本地研究/QA：`tmp/unity-official-sources/`、`tmp/unity-title-qa.mjs`、`tmp/unity-dock-titles.png`。这些工作文件不作为完成交付。

## 补充参考

用户提供的 [Unity 英文目录](https://unity.com/demos)、[中文目录](https://unity.com/cn/demos)
和 [第三方工具清单](https://www.cnblogs.com/puwen/p/18721845) 纳入后续移植依据。
Happy Harvest、Gem Hunter Match、Dragon Crashers 和 QuizU 用于完整玩法与视觉参考；
其 Asset Store 资源复用许可需逐项核实。3D showcase 和 DOTween、Cinemachine、Addressables、
UI Toolkit 等工具作为扩展项目单独跟踪，不计入 20 个 2D Demo。
