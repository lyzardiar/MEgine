# 游戏顶部栏

顶部按钮按原版 `UpperButtonBar.fdf` 的顺序显示任务、菜单、盟友和聊天，按钮尺寸为 0.085 × 0.022，种族贴图由原皮肤的 `UpperMenuButtonTexture` 取得，地图皮肤可覆盖该贴图。按钮文字使用本地化源内容并居中；按下和释放必须落在同一按钮，分别连接 F9 任务、F10 菜单、F11 盟友和 F12 聊天窗口。任务提醒继续闪烁。聊天接收范围及历史见[对局聊天窗口](chat-dialog.md)。

资源栏图标大小、间隔及数值的右对齐位置参考 `ResourceBar.fdf`，金矿、木材、人口仍读取当前会话，维修费用维持现有数值语义。两个源帧未定义屏幕根锚点，当前分别按左上和右上放置；按钮按下／高亮状态、长本地化文本及维修费用的精确规则仍待完善。

本机 1.27 `War3Patch.mpq` 的 `UI/FrameDef/UI/UpperButtonBar.fdf` SHA-256 `f185b4f4dc4d7eca1a732451c6fd85ced15fcfb32dd6bb700ad43adc765d3e1c`，`UI/FrameDef/UI/ResourceBar.fdf` SHA-256 `88a62703a9a8a0239c8faed95ac471f2aa924d1b1424432960f4eb7305d4ad2e`。还需集中验证四族皮肤、地图皮肤覆盖、不同窗口尺寸和 DPI、鼠标及快捷键、聊天／任务切换、资源大数值与原版实际画面。

IceCrown 原图默认配置的隐藏窗口复现显示胜利对话框；发送 C 键后面板消失。顶部资源栏和按钮在该图的修复版截图中可见，日志与截图位于 `tmp/docs-artifacts/war3/icecrown-*`；真实鼠标及各族画面仍待集中验证。
