# Pelican Road Rage 验收证据

- `model-sunset.png`：原生 Game 像素，侧视检查角色轮廓、车辆与海面。
- `title.png`：原生菜单截图，背景是 AI 生成封面。
- `coast.png`、`nitro.png`、`pause.png`：Agent 输入驱动的原生 Game 截图。
- `gameplay-test.json`：Node 输入逻辑、漂移、完整比赛与帧步长变化检查。
- `native-race.json`：真实 EditorPlayRuntime / Boa / 原生 World 的完整赛程结果。
- `result.json`：编辑器 Agent 开始、油门、氮气、暂停、刹车、重开与 Stop 恢复结果。
- `build-validation.json`：Windows 包内容哈希、资源校验、测试数量与桌面操作待验状态。

再现方式见 [样例说明](../../../samples/pelican-road-rage/README.md)。Player 的打包 / 启动验证与窗口操作验收分别记录，不以逻辑测试或插画替代实机效果。
