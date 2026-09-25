# Astral Thunder 验收记录

日期：2026-09-26。项目：`samples/thunder-fighter`。

- 原生 runtime library：207 项通过，0 失败。
- CLI PC 打包：62 项通过，0 失败，包含只被 SpriteBatch2D 引用的贴图、材质与自定义着色器依赖。
- 编辑器排序：4 项通过，包含 SpriteBatch2D 与原生渲染优先级一致。
- 编辑器前端生产构建、QA 原生编辑器构建、release Player 构建通过。
- `gameplay-test.json`：完整编译脚本运行，覆盖精确移动、暂停冻结、Nova、重开、完整通关、失败和重试。
- `native-campaign.json`：输入回放经真实 Boa 和原生 World 约 109 秒完成，五种 Boss 阶段均经过；峰值 478 发敌弹、56 次击落、16 次擦弹、4 次 Nova、1 次受伤。
- `agent-checks.json`：隔离编辑器的实时 Play 输入、暂停、继续、重开及 Stop 恢复原始场景通过。
- `player-smoke.json`：Windows Player 构建包通过资源/SHA-256 校验，8 秒进程启动检查通过。机器缺少默认音频输出设备；桌面自动化报告 `GetCursorPos 0x80070005`，没有完成独立窗口键鼠与音频听感验收。

`title.png`、`live-nova.png` 为实时原生 Play 截图。其他 PNG 从同一次原生通关回放导出的场景状态重绘，覆盖全部 Boss 阶段、激光、Nova 与结算。截图修正并验证了六舰图集切片和激光预警表现；这些验证不包含 60 FPS 或 GPU 帧耗时承诺。

源码入口、控制说明和复验命令见 [样例 README](../../../samples/thunder-fighter/README.md)。Unity 参考路线图记录了已交付的批量精灵能力及仍待实现的通用工具。
