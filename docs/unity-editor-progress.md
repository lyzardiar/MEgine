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

## 2026-09-25：2D/3D 场景变换

- 同一屏幕空间 Canvas 内拖换 UI 父节点时保留渲染位置和尺寸，同时保留 anchors、pivot、旋转与镜像比例；覆盖子层级、拉伸锚点、CanvasScaler、Undo/Redo 和 Play 副本。
- 新父节点的 LayoutGroup 继续管理参与布局的子项；`LayoutElement.ignore_layout` 子项保持自己的矩形。移出 LayoutGroup 时保留当前显示矩形。
- 3D 中心移动按相机视平面吸附，慢速小位移会累计。
- 均匀缩放以手势累计比例计算，单次手势最小相对比例为 1%；多选对象保留相对大小、镜像和位置比例，往返拖动可恢复。

验证：Editor 全量 925/925，生产构建和嵌入最新前端的 Tauri Debug 构建通过。原生窗口实际拖动：两段缩放得到 `[1.2, 1.2, 1.2]`；中心移动为 `0.5`；Undo 恢复原 Transform。Hierarchy 将 Child 从 A 拖入 B 后，Canvas bounds 均为 `{x:650, y:445, width:240, height:150}`；Undo/Redo 正确。所有截图均 `backgroundSafe=true`。

边界：本批 UI 保矩形针对同一 Screen Space Canvas；跨 Canvas、World Space Canvas 和不同投影平面仍需独立设计与验证。布局驱动组件依然按自身规则求解。

本地验证产物：`tmp/editor-batch2-tests.log`、`tmp/editor-batch2-desktop.log`、`tmp/editor-transform-native.png`、`tmp/editor-ui-reparent.png`。

## 后续审计重点

- Scene/Hierarchy：跨 Canvas/World Space 重设父级、多选变换极端尺度与旋转父级，以及各自的 Undo/Redo。
- 2D：Sprite/Tilemap、碰撞与动画的编辑器到 Player 一致性，真实项目存取与构建闭环。
- 3D：相机、材质、光照、拾取与变换一致性；大场景与扩展面板的响应时间及资源回收。
- UI：继续检查 Unity 风格面板布局、缩窄窗口、键盘操作与持久化；通过像素和行为证据逐项验收。
