# 对局命令栏布局

命令按钮使用统一的四列三行网格；图标、冷却、激活边框、自动施法效果和鼠标命中共用同一单元格坐标。标准 0.8 × 0.6 界面根下，命令栏左上为 (0.618125, 0.469)，列间距 0.043625、行间距 0.043，每个按钮为 0.038 × 0.038。

固定版 Warcraft III 1.27.0.52240 的 Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。原版命令栏构造器 0x6f37fc80 定义四列三行、0.1745 × 0.129 的区域，并将右下角相对父框右下角偏移 (-0.007375, +0.002)；按钮构造器定义 0.038 方形，布局例程按栏宽高均分格位并左上对齐。`SimpleConsole` 与 `CGameUI` 两角对齐，命令栏以其为父；汇编见 `tmp/docs-artifacts/war3/command-bar-source-refs.txt`、`command-bar-grid-init.txt`、`command-bar-grid-reflow.txt` 和 `command-bar-set-all-points.txt`。宽屏和 DPI 下根矩形、实际画面及交互仍待对照。
