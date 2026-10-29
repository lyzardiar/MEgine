# 阴影选项

主菜单视频选项的 `ShadowsMenu` 和游戏内视频选项的 `EscOptionsShadowsMenu` 均按原版资源提供“关闭／开启”两项。确认开启后显示现有地图、建筑和单位阴影；关闭后停止绘制阴影，取消或 Esc 放弃草稿。两处使用同一独立用户设置；旧版 `video.bin` 曾保存的低档和高档均映射为开启，关闭状态维持关闭，保存格式不变。

依据是本机 1.27 `War3Patch.mpq` 的 `UI\\FrameDef\\Glue\\OptionsMenu.fdf`（SHA-256 `9fbd1b7013d0d33b22989cdf89034b7361bdae08dcffb584a062cefd9d27fe85`）和 `UI\\FrameDef\\UI\\EscMenuOptionsPanel.fdf`（SHA-256 `50800656634111843bf0d1aa4c59c7f296914c8279a592ff8367b6a9b0812659`），两处阴影菜单原始条目均为 `OFF`、`ON`。该资源说明菜单选项，不能单独证明原版阴影绘制细节。

Win32 x86 Release 产品编译通过。待集中验证：主菜单和对局内选项的鼠标／键盘选择、取消／确认、旧设置迁移、切图与重启后状态、设备恢复，以及阴影外观和性能的原版对照。
