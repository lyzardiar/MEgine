# 玩家颜色选择菜单

选图玩家槽的颜色按钮使用原 `PlayerSlot.fdf` 中的 `TeamColorMenu` 背景，按原菜单中的 0.013 行高和 0.008 边距纵向展示颜色；按鼠标或键盘选择后继续通过 `PlayerSetup::color` 应用颜色并处理已占用颜色交换。弹层沿用现有键盘焦点、鼠标按下释放一致性、Esc 取消和遮挡输入机制。色块仍从 `ReplaceableTextures/TeamColor/TeamColorXX.blp` 读取；用户界面保留当前 16 色范围。

原件证据：固定版 `Game.dll` 在 `0x6f296060` 创建 `TeamColorMenu` 并调用 `0x6f29eac0` 添加颜色项目，此处传入 12 项；菜单初始化 `0x6f291061` 写入行高 `0x3c54fdf4`（0.013）以及四边距 `0x3c03126f`（0.008）。`PlayerSlot.fdf` 的 `TeamColorMenu` 使用 `TeamColorMenuBackdrop`。只读指令记录位于 `tmp/docs-artifacts/war3/map-menu/team-color-menu.txt`。这组证据表明菜单按行建立项目，不能据此确认全部像素、焦点、色块材质、滚动条或 12 色以外的原版规则。

待集中验证：地图和玩家槽数量、16 色及占用交换、鼠标按下／拖出／取消、键盘方向／回车／Esc、窗口边缘弹层翻转、滚轮、固定颜色地图、切换槽位和地图、控件遮挡／焦点、不同缩放及原版 1.27 逐项布局和滚动条。尚未编译或运行。
