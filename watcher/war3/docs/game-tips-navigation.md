# 游戏提示页滚动交互

游戏内提示页对较长的源条目按实际行数显示滚动范围，并支持鼠标滚轮、Page Up／Page Down、Home／End，以及点击或拖动滚动条。条目切换时滚动位置回到开头；同一条目每帧限制位置在当前可见范围内。文字使用原 TipsTextArea 的内边距，轨道与滑块使用 EscMenuTemplates 的原贴图。

来源：`UI/FrameDef/UI/EscMenuMainPanel.fdf` 的 `TipsTextArea` 继承 `EscMenuTextAreaTemplate`，该模板定义文本内边距及 `EscMenuScrollBarTemplate`。资源从原归档直接读取。

待集中验证：多行和极长条目、原版与地图覆盖、中文换行、首尾切换与缩放、滚轮和键盘、轨道／滑块拖动、失焦和 ESC、原版窗口布局与实际输入；本次仅差异检查，未编译或运行。
