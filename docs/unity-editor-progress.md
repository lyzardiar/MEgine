<!-- Author: MiYu -->

# Unity 风格编辑器迭代记录

目标：以 Unity 2D 的创作工作流为参照，维护可用的 3D 编辑能力；每批经过测试、构建和适用的真实窗口验证后提交。此记录不代表引擎已达到 Unity 功能或性能对等。

## 2026-09-25：播放控制与 Console

- 顶部使用 Play/Pause/Step 三按钮；Play 再次点击退出，运行时 Step 先暂停再前进一步。播放期间工具栏变色。
- `Ctrl/Cmd+P` 切换播放，`Ctrl/Cmd+Shift+P` 暂停/继续，`Ctrl/Cmd+Alt+P` 单步；输入控件、IME 和按键重复不会误触播放。
- Console 支持独立信息/警告/错误开关、全文搜索、重复日志折叠计数、完整消息详情、方向键/Home/End 选择和 Follow。继续沿用 300 条日志上限与现有图标库。
- Agent 日志查询 `limit: 0` 正确返回空数组；语义测试允许 Rust 源码的合法换行。

验证：Editor 全量 920/920，TypeScript/Vite 生产构建、Tauri Debug no-bundle 构建通过；后台原生窗口实际验证播放按钮、三个快捷键、暂停单步、日志折叠与详情。截图通道为 WebView2，`backgroundSafe=true`。

本地验证产物：`tmp/editor-batch1-tests.log`、`tmp/editor-desktop-build.log`、`tmp/editor-console-detail.png`。这些临时产物不纳入版本控制。

## 后续审计重点

- Scene/Hierarchy：UI 重设父级的位置与尺寸、3D 中心移动吸附、连续均匀缩放，以及各自的 Undo/Redo。
- 2D：Sprite/Tilemap、碰撞与动画的编辑器到 Player 一致性，真实项目存取与构建闭环。
- 3D：相机、材质、光照、拾取与变换一致性；大场景与扩展面板的响应时间及资源回收。
- UI：继续检查 Unity 风格面板布局、缩窄窗口、键盘操作与持久化；通过像素和行为证据逐项验收。
