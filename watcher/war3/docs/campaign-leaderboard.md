# 战役计数板

脚本 leaderboard 句柄连接玩家关联、显示、标题、条目增删、值／名称、颜色／样式、排序和销毁；Group 与 hashtable 句柄生命周期保持独立。当前本地玩家关联的计数板由游戏 HUD 消费，底板直接读取原版 UI/FrameDef/UI/Leaderboard.fdf 及种族皮肤，文字大小读取 UI/MiscUI.txt。动态行、条目值、颜色、显示开关和玩家颜色贴图随脚本状态更新。

原 FDF 未提供屏幕锚点和行模板，当前屏幕位置、行距及玩家图标采用近似布局；多行、字号适配、脚本颜色覆盖、排序及越界行为均待原版对照。完整视觉一致性、多玩家界面及 Prologue02 教程实际输入尚未验收。原安装只读，运行不加载 Game.dll。

Win32 Release 产品编译通过；独立定向探针验证真实 Prologue02 脚本运行环境中的创建／玩家关联／条目／显示／销毁，以及原 FDF 和皮肤底板的隐藏窗口绘制，未加载 Game.dll。探针不是完整 GameView 截图或教程流程验收；源和临时构建位于 tmp/docs-artifacts/war3/leaderboard-probe/。

计时窗口标题、时间值及排行榜标题的手绘文字，按各自 FDF 帧继承的 `FontShadowColor` 与 `FontShadowOffset` 绘制阴影，并保留脚本设置的前景颜色。源帧与手绘的隐藏 D3D9 像素对照中，三个原始文字样式及自定义正向偏移共 4 组完全一致；自定义负向水平偏移有 7 个像素的裁剪差异，尚未解决。当前源子帧边界与手绘布局不一致，不能直接用子帧矩形裁剪；详见 `tmp/docs-artifacts/war3/path-review/`。

Human08 原图以独立用户目录在隐藏 Win32 Release 客户端自然运行至玩家阶段：模拟时间 104.25 秒时选择原图迫击炮，画面显示倒计时及剩余船只；F9 请求成功并显示焚烧船只任务。采样与日志在 `tmp/docs-artifacts/war3/human08-ui-probe/agent-ic80tN/`、`after-shadow.log`。这验证本客户端实际渲染及合成输入，未对照原版画面，也未验证前台输入或船只击沉后界面变化。
