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
- 源码已拉取，20 项移植尚未完成，截图尚未交付。
- 已确认运行缺口：Editor Play 仅执行内置 Behaviour，未执行 `startupScript`；Player 脚本没有正式的输入状态 API。必须补通运行链路后再验收互动样例。

## 下一步

1. 共享脚本 host 的世界快照、输入、错误与生命周期；接通 Editor 和 Player。
2. 导入官方场景层级、贴图切片、布局及动画，移植样例行为。
3. 每项验证交互/模拟、停止后恢复、再次运行及 Agent 操作，保存真实截图与验收记录。

本地研究/QA：`tmp/unity-official-sources/`、`tmp/unity-title-qa.mjs`、`tmp/unity-dock-titles.png`。这些工作文件不作为完成交付。
