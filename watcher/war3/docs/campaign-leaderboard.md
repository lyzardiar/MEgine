# 战役计数板

脚本 leaderboard 句柄连接玩家关联、显示、标题、条目增删、值／名称、颜色／样式、排序和销毁；Group 与 hashtable 句柄生命周期保持独立。当前本地玩家关联的计数板由游戏 HUD 消费，底板直接读取原版 UI/FrameDef/UI/Leaderboard.fdf 及种族皮肤，文字大小读取 UI/MiscUI.txt。动态行、条目值、颜色、显示开关和玩家颜色贴图随脚本状态更新。

原 FDF 未提供屏幕锚点和行模板，当前屏幕位置、行距及玩家图标采用近似布局；多行、字号适配、脚本颜色覆盖、排序及越界行为均待原版对照。完整视觉一致性、多玩家界面及 Prologue02 教程实际输入尚未验收。原安装只读，运行不加载 Game.dll。

Win32 Release 产品编译通过；独立定向探针验证真实 Prologue02 脚本运行环境中的创建／玩家关联／条目／显示／销毁，以及原 FDF 和皮肤底板的隐藏窗口绘制，未加载 Game.dll。探针不是完整 GameView 截图或教程流程验收；源和临时构建位于 tmp/docs-artifacts/war3/leaderboard-probe/。
