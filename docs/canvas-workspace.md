# Canvas Workspace

MEngine 的 Screen Space Canvas 在 Scene 2D 模式中使用多画板工作台。场景仍只保存一份 Canvas、RectTransform 和 UI 组件；画板、活动画板、工作区相机、安全区与诊断开关保存在编辑器偏好中，不进入 `.mscene`、Scene Dirty 或 Undo。

## 工作方式

- 默认画板来自当前 Game Resolution、Desktop、Tablet 和 Phone；相同分辨率自动去重，总数最多 6 个。
- 活动画板执行实时布局、命中和 RectTransform Gizmo。其他可见画板使用按实体 revision、Canvas 和分辨率缓存的只读结果。
- 单击画板会切换活动画板并同步 Game Resolution，选择仍以实体 ID 为准。
- 工具栏提供 Fit All、Fit Active、1:1、安全区和问题列表；滚轮缩放，中键或 Space 拖拽平移。
- 拖拽期间只重新布局活动画板。次级画板在输入空闲后的下一帧更新，不进入同步输入路径。
- World Space Canvas 不进入此工作台，继续使用 3D Scene 流程。

## 布局诊断

绘制、画板标题、问题列表与 Agent 的 `view.canvas_plan` 共用同一份 Canvas Plan。目前只报告可确定的问题：

- `OUTSIDE_ARTBOARD`
- `SAFE_AREA_OVERFLOW`
- `CLIPPED_BY_MASK`
- `ZERO_SIZE`
- `TEXT_OVERFLOW`
- `NON_UNIT_RECT_SCALE`
- `TARGET_DISPLAY_MISMATCH`

问题列表中的条目可直接切换到对应画板并选中实体。诊断不自动修改设计，也不会猜测响应式意图。

## RectTransform 与创建体验

- Rect Tool 的尺寸手柄只修改 `sizeDelta` 或四边 offset，不通过 scale 模拟尺寸；Shift、Alt 与一次手势一次 Undo 继续沿用现有路径。
- Anchor Presets 默认保持可见矩形；Raw Edit 明确开启后才直接编辑 anchor 数值。
- 固定锚点显示位置和宽高，拉伸锚点显示 Left/Right/Top/Bottom。
- LayoutGroup、ContentSizeFitter 或 AspectRatioFitter 驱动的轴会禁用直接输入，并显示驱动来源。
- Smart Guides 使用固定 8 屏幕像素阈值，除边缘和中心外还支持等间距 Gap Snap，并标注换算后的设计像素。
- Hierarchy 的 `+` 是可搜索创建菜单；Canvas/RectTransform 上下文优先显示 UI，仍保留 Empty、3D、2D、Audio 等分类。UI 创建继续走 `spawnUi*` 单事务工厂。
- UI Inspector 以 Layout、Appearance、Interaction、Advanced 分组，Advanced 默认折叠。

## 游戏 UI 模板

`GameObject > UI > Templates` 提供三套可直接编辑的常用界面：

- `Inventory`：标题、分类筛选、响应式物品网格、详情区和操作按钮。
- `Leaderboard`：排行表头、名次行、玩家信息、分数与底部操作区。
- `Shop`：货币栏、分类栏、响应式商品卡片和购买操作区。

模板复用现有 RectTransform、Horizontal/Vertical/Grid LayoutGroup、LayoutElement、Text、Image、Button 和 ProgressBar，不引入模板专用运行时。创建时优先挂到选中的 Canvas 或其 UI 子节点；没有可用 Canvas 时自动创建一个。整棵模板在一次事务中生成，因此一次创建只产生一次 Undo。Agent 可使用 `ui_inventory`、`ui_leaderboard` 和 `ui_shop` 类型创建相同结构。

## Agent 查询

`view.canvas_plan` 支持 `canvasEntity`、`artboardKey`、`offset`、`limit` 和 `expectedPlanRevision`。首次读取返回 `sceneRevision` 与 `planRevision`；后续分页必须携带同一 plan revision，配置或场景变化会返回 stale，而不会混合两版数据。MCP 使用 `get_canvas_plan`，CLI 使用：

```text
mengine-agent query view.canvas_plan --args {"artboardKey":"phone","limit":200}
```

## 2026-08-07 桌面验收

验证使用隔离配置目录和临时工程，通过 `auto-background` 启动 Debug 编辑器。进程没有获得焦点，验证前后的 Windows 前台句柄保持一致。

- Editor TypeScript/Vite 生产构建通过。
- Tauri `--debug --no-bundle` 构建通过。
- RectTransform、Gap Snap、创建菜单与编辑器语义 30 项定向测试通过。
- 后台 Agent 创建 Canvas、Panel、Button 和 Text；`view.canvas_plan` 在 1920×1080、1024×768、1080×1920 三种画板上返回同一实体树和对应布局边界。
- WebView2 整窗离屏截图在三种活动画板下均返回 `backgroundSafe=true`；截图期间前台句柄不变，后台编辑器始终未获得焦点。

## Figma 直连

Figma 设计稿导入由 Agent 侧安全读取、Editor 侧确定性映射与一次 Undo 落地组成。配置、CLI/MCP/HTTP 用法、组件映射和限制见 [Figma UI Bridge](./figma-ui-bridge.md)。

2D 粒子预设与拖尾的创建、字段和运行时边界见 [2D Effects](./2d-effects.md)。
