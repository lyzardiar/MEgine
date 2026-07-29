# MEngine 编辑器 AI Agent 友好化改造技术方案

> 文档状态：设计草案（已自审 v1.1）
>
> 编写日期：2026-07-21
>
> 作者：MiYu / QoderWork
>
> 首要目标：让 AI Agent 能观察、驱动、发现并验证 MEngine 编辑器
>
> 接入策略：传输无关内核（AgentBridge）+ MCP 优先
>
> 参考方案：`mengine-local-editor-technical-design.md`、`mengine-dock-particles-spine-technical-design.md`

## 1. 文档目的

MEngine 编辑器当前对人类友好，但对 AI Agent 不够友好。AI Agent（如 Claude、Cursor、QoderWork 或自研脚本）想要驱动编辑器时，缺少四类基础能力：

- **看不见**：没有截图/视觉通道，Agent 无法确认自己操作的视觉结果。
- **摸不清**：无法枚举当前打开了哪些窗口/面板、场景里有什么、选中了什么。
- **够不着**：没有对外的控制传输层，编辑器外的进程无法调用编辑器的能力。
- **不知道能做什么**：缺少自描述的命令目录与能力清单，Agent 只能靠人写死指令。

本方案不是零散加几个接口，而是建设一个**传输无关的 AgentBridge 内核**，把编辑器已有的能力（场景修改 RPC、`WorldCommand`、菜单注册表、组件 schema）统一收敛为「观察 / 操作 / 发现 / 验证」四类机器接口，再以 **MCP Server 优先**对外暴露，后续可平滑扩展 WebSocket / HTTP / CLI。

### 1.1 设计原则

| 原则 | 说明 |
| --- | --- |
| 复用优先 | 不重造轮子：场景修改走 `submit_editor_request`，命令原语用 `WorldCommand`，能力发现复用菜单注册表与组件 schema |
| 传输无关 | 命令/观察内核与传输协议解耦，MCP/WS/HTTP/CLI 都是内核的「适配器」 |
| 只读先行 | 先上观察类能力（零风险），再上写操作（带版本锁与确认） |
| 自描述 | 每个命令带 id、描述、参数 schema，Agent 可动态发现而非硬编码 |
| 可验证 | 每个写操作返回新状态/revision，并支持「操作后自动截图」形成视觉闭环 |
| 本地可信 | 仅监听 localhost，命令默认本地可信，但保留权限与危险操作确认机制 |

## 2. 现状盘点

### 2.1 已有基础（可直接复用）

| 能力 | 位置 | 价值 |
| --- | --- | --- |
| 场景修改 RPC | `submit_editor_request`（`src-tauri/src/lib.rs:4608`），`EditorRequest{request_id, project_id, base_revision, operation}`（`mengine-editor-host/src/project.rs:231`） | 带乐观锁的权威修改入口，写操作的基石 |
| 命令原语 | `WorldCommand`（`packages/api/src/generated/components.ts:730`）：spawn/despawn/setComponent/removeComponent/setParent/setClearColor | 类型化、可序列化的世界修改词汇 |
| 命令应用 | `store.applyCommands(cmds)`（`store.ts:1303`） | 进程内批量应用命令 |
| Agent 意图层 | `packages/agent/src/index.ts`：`Intent → validateIntent → expandIntent → WorldCommand[]` | ✅ 3 个语义真实、严格校验且自描述的 intent；已接入 AgentBridge 与 MCP |
| World facade | `@mengine/api` `World` 类（`index.ts:40`），注释明确「used by game scripts, editor, and AI agents」 | 官方认可的 Agent 接入面 |
| 菜单注册表 | `MenuItemEntry`（`editorWindow/registry.ts:30`）：path/label/priority/shortcut/validate/action | 数据驱动、可自描述的命令目录 |
| 组件目录 | `componentCatalog.ts`：type/label/description/create()/requires | 组件可发现性 |
| 组件 schema | `inspectorMetadata.ts`（InspectorFieldMeta）+ `behaviour` 的 `FieldMeta` + 生成的 `schema.json` | 属性级类型/范围/枚举/条件，Agent 可知「能填什么」 |
| 面板聚焦 | `mengine:focus-panel` 事件（`DockWorkspace.tsx:1126`） | 现成的「打开/聚焦面板」程序化入口 |
| 状态快照 | `store.snapshot(): WorldSnapshotView & {selectedIds}` | 完整世界读取 |
| 多窗口同步 | 按原生编辑器实例 ID 隔离的 BroadcastChannel（Workspace / Panel / Asset / Profiler / Sorting Layers / Dialog） | 全量状态复制协议，可作事件流参考；多个同源编辑器进程不会串扰 |
| 开发期 HTTP | Vite `/__mengine/*`（`vite/mengineFsPlugin.ts`） | 现成 HTTP 路由范式 |
| 窗口类型注册 | `editorWindow/registry.ts`：windowTypes / openEditorWindow / getOpenEditorWindows | 浮动窗口枚举基础 |

### 2.2 缺口（本方案要补的）

| 缺口 | 影响 |
| --- | --- |
| 无截图/视觉通道 | Agent 无法「看见」操作结果 |
| 无窗口/面板枚举 | Agent 不知道当前 UI 状态 |
| 无对外传输层 | 编辑器外进程无法调用能力（最核心缺口） |
| 无统一命令调度器 | ~150 个 store 方法 + 菜单命令 + 面板操作各自为政，无 `execute(id, args)` |
| 日志非结构化 | `logs[]` 是字符串数组（300 上限），无 level/time/source |
| 命名不一致 | `@mengine/api` 用 camelCase，store/场景 JSON 用 snake_case |
| 快捷键不可发现 | 硬编码在 `App.tsx` keydown，`MenuItemEntry.shortcut` 仅展示 |
| 无事件订阅 | 外部无法订阅状态变化/日志/构建进度（仅 `pc-build-progress` 一个事件） |

## 3. 总体架构

### 3.1 分层模型

```
┌─────────────────────────────────────────────────────────────┐
│  AI Agent / 外部客户端                                         │
│  (Claude / Cursor / QoderWork / 自研脚本 / CLI)               │
└───────────────┬─────────────────────────────┬───────────────┘
                │ MCP(stdio)                   │ WS / HTTP / CLI
        ┌───────▼────────┐            ┌────────▼─────────┐
        │  MCP Adapter    │            │  WS/HTTP Adapter  │
        │  (Node sidecar) │            │  (已实现)          │
        └───────┬────────┘            └────────┬─────────┘
                │        WebSocket (localhost)  │
        ┌───────▼──────────────────────────────▼─────────┐
        │        Bridge Transport (Rust / Tauri)          │
        │   本地 WS 服务器 + 消息路由 + 发现端口文件          │
        └───────┬──────────────────────────────┬─────────┘
                │ Tauri event(请求下行)         │ Tauri command(响应上行)
        ┌───────▼──────────────────────────────▼─────────┐
        │        AgentBridge Core (Webview JS)            │
        │  ┌──────────────┬──────────────┬─────────────┐  │
        │  │ 命令调度器     │ 状态观察器     │ 事件发射器   │  │
        │  │ Dispatcher   │ Observer     │ EventBus    │  │
        │  └──────┬───────┴──────┬───────┴──────┬──────┘  │
        └─────────┼──────────────┼──────────────┼─────────┘
                  │              │              │
        ┌─────────▼───┐  ┌───────▼──────┐  ┌────▼─────────┐
        │ EditorStore  │  │ Tauri 命令    │  │ 菜单注册表    │
        │ (~150 方法)  │  │ (截图/窗口/   │  │ 组件 schema  │
        │ WorldCommand │  │  资产/构建)   │  │ 面板/窗口     │
        └──────────────┘  └──────────────┘  └──────────────┘
```

### 3.2 三个核心组件

**AgentBridge Core（Webview JS）** —— 传输无关内核，本方案的心脏：

- **Dispatcher（命令调度器）**：统一 `execute(commandId, args) → CommandResult`。写命令路由到 `EditorStore` 方法（与 UI/菜单同路径，store 内部再同步到 Rust），菜单命令路由到 `MenuItemEntry.action`，面板/窗口操作路由到对应事件。
- **Observer（状态观察器）**：统一 `query(queryId, params)`。聚合 `store.snapshot()`、Tauri 截图/窗口命令、日志、组件 schema。
- **EventBus（事件发射器）**：把状态变化、日志、构建进度、面板变化推给已订阅的传输客户端。

**Bridge Transport（Rust / Tauri）** —— 本地 WebSocket 服务器：

- 监听 `127.0.0.1` 自动分配端口，端口号和随机 token 通过同目录临时文件同步落盘后原子替换发现文件（如 `<project>/.mengine/agent-bridge.json`），供适配器发现；拒绝把符号链接或非普通文件当作凭据目标，Unix 新文件使用 `0600`，客户端不会读到半截 JSON。
- 下行：WS 消息 → 有界启动队列 / Tauri event `agent-bridge:request` → webview。主 WebView 注册监听后用带 session id 的握手声明就绪；冷启动和页面重载期间到达的请求会按序等待，并由握手 command 的返回值直接交给新页面处理，避免在同一次 IPC 尚未返回时反向发送事件。原生层最多同时保留 32 个连接、每客户端 64 个及全进程 256 个在途请求；输入消息/帧显式限制为 64 MiB，避免依赖库默认值漂移。
- 上行：webview 通过 Tauri command `agent_bridge_respond` / `agent_bridge_broadcast` 回传，Rust 按 `client_id` 路由给对应 WS 客户端。
- 主 WebView 每次开始导航时由 Rust 页加载钩子原子重置就绪状态；旧页面的延迟清理只能释放自己的 session，不能误停用新页面。启动队列上限为 256，超限请求会收到保留原 JSON-RPC id 的 `NOT_READY` 错误，而不是静默丢失；运行期在途请求超限则返回含客户端/进程容量和重试提示的 `RATE_LIMITED`。每个连接的出站通道同时受 64 条消息和 128 MiB 字节预算约束，无法继续读取的慢客户端会被断开，不会让广播或截图响应无限占用内存。
- 仅绑定 localhost，不暴露到网络。

**MCP Adapter（Node sidecar）** —— MCP 协议适配器：

- 独立 Node 进程，实现 MCP（stdio），把 `tools/list`、`tools/call`、`resources/*` 翻译为 AgentBridge 消息，经 WS 发给编辑器。
- 作为 Tauri sidecar 随编辑器启动，或独立运行（读发现文件连接）。
- 这样 MCP 协议处理与编辑器解耦，且天然支持任何 MCP 客户端。

### 3.3 统一消息协议（JSON-RPC 风格）

所有传输共用一套消息格式：

```jsonc
// 请求（客户端 → 编辑器）
{
  "jsonrpc": "2.0",
  "id": "req-uuid",
  "method": "execute" | "query",
  "params": {
    "command": "scene.set_transform",     // execute 时
    "args": { "entity": 12, "position": [0, 1, 0] },
    "query": "editor.screenshot"          // query 时
  }
}

// 响应（编辑器 → 客户端）
{
  "jsonrpc": "2.0",
  "id": "req-uuid",
  "result": {
    "ok": true,
    "revision": 42,                        // 写操作后的新 revision
    "data": { /* 命令/查询特定结果 */ },
    "screenshot": "data:image/png;base64,..." // 可选：操作后自动截图
  }
}

// 错误
{
  "jsonrpc": "2.0",
  "id": "req-uuid",
  "error": { "code": "STALE_REVISION", "message": "...", "data": { "currentRevision": 43 } }
}

// 事件（编辑器 → 客户端，无 id）
{ "jsonrpc": "2.0", "method": "event", "params": { "topic": "log.added", "data": { /*...*/ } } }
```

版本与并发：写操作携带 `base_revision`，复用 `submit_editor_request` 的乐观锁；冲突返回 `STALE_REVISION` 与当前 revision，Agent 重新读取后重试。

幂等性：AI Agent 常因超时重试。写请求携带客户端生成的 `request_id`（复用 `EditorRequest.request_id: Uuid`），Bridge 缓存最近若干条 `request_id → result`，重复 `request_id` 直接返回上次结果而不重复执行，保证写操作可安全重放。

## 4. 能力细分

按「观察 / 操作 / 发现 / 验证」四类组织。每条标注命名空间式 command/query id、参数、返回与集成点。

### 4.1 可观察性（Observability）—— 让 Agent「看见」

#### 4.1.1 截图与视觉（用户明确提出）

| query id | 参数 | 返回 | 集成点 |
| --- | --- | --- | --- |
| `view.screenshot` | `{ target?: "scene"\|"game", format?: "image/png"\|"image/jpeg", quality?, maxSize?: 256..4096 }` | `{ dataUrl, width, height, sourceWidth, sourceHeight, scale, capturedAt, mime }` | 视口（scene/game）：`Viewport.tsx` 的 `canvasRef` 在目标 DOM 内按需降采样后编码；默认最长边 2048 |
| `view.window_screenshot` | `{ windowLabel?: string, maxSize?: 256..4096 }` | `{ dataUrl, width, height, sourceWidth, sourceHeight, scale, capturedAt, mime, windowLabel, captureMethod, backgroundSafe }` | Windows 桌面版通过 WebView2 DevTools `Page.captureScreenshot` 在目标 webview 内离屏缩放渲染；不会激活窗口，也不读取前台屏幕像素；默认最长边 2048 |
| `view.screenshot_to_file` | `{ path, target? }` | `{ path, width, height }` | 同上，写入磁盘供 Agent 读取 |
| `view.capture_region` | `{ windowLabel?, x, y, width, height, maxSize? }` | `{ dataUrl, width, height, region, backgroundSafe }` | ✅ 使用 WebView2 DevTools clip 直接截取后台 WebView CSS 像素区域；坐标可直接复用 `window.ui_snapshot` 的元素 rect，越界明确拒绝 |
| `view.capture_element` | `{ windowLabel?, selector, expectedSnapshotRevision, maxSize? }` | `{ dataUrl, width, height, region, elementRect, clipped, selector, snapshotRevision, backgroundSafe }` | ✅ 通过同一语义快照暴露的 selector 原子定位元素，重新核对 revision、DOM 身份与渲染状态，自动裁剪到当前可见 viewport，并在截图后再次拒绝变更过的快照；Agent 无需复制裸坐标，也不会把旧矩形误当成当前控件 |

说明：当前 Scene/Game 视口是 Canvas2D，`toDataURL` 可稳定截取，无 WebGL `preserveDrawingBuffer` 顾虑。编辑器整窗/浮动窗口不能使用 GDI 屏幕 `BitBlt`：该方式必须把编辑器置前，且窗口被遮挡时会截到其它应用。当前实现改为 WebView2 DevTools 渲染面截图，并已在主窗 `visible=false` 的真实 Tauri 实例上验证：工程欢迎页仍能完整成像，请求前后 Windows 前台窗口句柄不变。**前向兼容**：本地编辑器方案规划了「Rust 进程内原生 wgpu Surface」的真实 Scene View，届时视口不再是 DOM canvas，需改用 wgpu 纹理回读；窗口 UI 截图仍由 WebView2 路径负责。

后台自动化实例可设置 `MENGINE_EDITOR_BACKGROUND=1`。主窗口配置从创建时即为 `visible=false/focus=false`；普通启动由 Rust `setup` 显式显示并聚焦，后台模式则从未显示或抢占前台，不依赖 Windows 对 `SW_HIDE` 的不稳定事后处理。测试或并行 Agent 实例还应把 `MENGINE_EDITOR_CONFIG_DIR` 指向独立的绝对目录，并配套隔离 `WEBVIEW2_USER_DATA_FOLDER`，避免读取或改写前台编辑器的最近工程与 WebView 偏好。

#### 4.1.2 窗口与面板枚举（用户明确提出）

| query id | 返回 | 集成点 |
| --- | --- | --- |
| `window.list` | `[{ label, title, typeId?, editorType?, kind: "main"\|"panel"\|"editor", visible, focused, position, size, url }]` | ✅ Rust `app.webview_windows()`；注册编辑器窗同时返回与 `window.types` / `window.open_editor` 一致的规范 `typeId`，并保留等值 `editorType` 兼容别名；标签规则 `panel-<id>`（`detachedPanelWindow.ts`）、`editor-<hash>`（`nativeEditorWindow.ts`）；可直接确认后台实例从未显示 |
| `window.ui_snapshot` | `{ windowLabel?, maxElements?, offset?, expectedSnapshotRevision? }` → `{ snapshotRevision, nextOffset, elements: [{ role, name, text, value, state, rect, actions, selector }], truncated, ... }` | ✅ WebView2 `Runtime.evaluate` 离屏提取可见且未被自身/祖先 `aria-hidden=true` 或 `inert` 排除的语义 DOM；名称与文本也跳过这些子树中的装饰内容；密码脱敏，默认 2000/上限 5000 项，不需要 OCR；续页必须回传首屏 `snapshotRevision`，语义内容或顺序变化时返回 `STALE_REVISION` 并从 offset 0 重读 |
| `window.ui_content` | `{ windowLabel?, selector, expectedSnapshotRevision, field, offset?, maxChars?, expectedContentRevision? }` → `{ contentRevision, nextOffset, content, ... }` | ✅ 只允许精确读取同一快照完整语义集合中的 selector，返回未截断的语义名称/说明、未归一化文本、表单值或 `options` JSON（原生 select/datalist 的 value、label、group、disabled、selected）；每页必须回传 selector 所属 `snapshotRevision`，续页还必须回传首屏 `contentRevision`；元素身份或内容变化时返回 `STALE_REVISION`，避免读错重排后的元素或把长代码、日志和未保存文本拼成撕裂结果 |
| `dialog.state` | 当前编辑器内 alert/confirm/prompt 的稳定 id、完整消息、按钮标签与 prompt 默认值；无对话框时为 `null` | ✅ 非阻塞 DOM Dialog Host；可被语义快照和整窗截图同时读取 |
| `panel.list` | `[{ kind, title, visible, active, detached, dockPath }]` | ✅ 可由 `panel.get_layout` 的 docked/detached/active 集合推导 |
| `panel.get_layout` | dock 二叉树（leaf/split）+ docked/detached/active 集合 | ✅ `DockWorkspace` 每次树变化直连 AgentBridge，读取实时内存树而不是过期 localStorage |
| `window.get_active` | 当前聚焦窗口信息 | `WebviewWindow` focus 状态 |

所有编辑器业务确认、输入和提示均使用队列化 `EditorDialogHost`，不再调用会阻塞 WebView 线程且无法离屏观察的 `window.alert/confirm/prompt`。Agent 先读 `get_active_dialog`，再以稳定 `dialogId` 调用 `respond_to_dialog`；过期 id 返回冲突，不会误答后来出现的另一个确认框。全部多 WebView 通道都使用当前原生编辑器进程的随机实例 ID 做命名空间隔离，不会让后台 Agent 实例与同源的另一个前台编辑器进程交换 Workspace、Panel、Asset、Profiler、Sorting Layers 或 Dialog 消息，也不会向 WebView 暴露 Bridge 鉴权 token。分离窗口完成场景创建、重命名或删除后，会通知同实例的其他 WebView 从原生工程会话重载场景索引，保证主 Agent 查询与磁盘状态一致。原生文件选择器仍只服务人工 UI，Agent 应使用带精确路径参数的领域工具。

#### 4.1.3 场景与层级读取

| query id | 参数 | 返回 |
| --- | --- | --- |
| `scene.snapshot` | `{ overlay?: bool }` | 完整 `WorldSnapshotView`（实体 + 组件 + frame + clearColor） |
| `scene.hierarchy` | `{ depth?, filter? }` | 精简树 `[{ id, name, active, icon, children }]` |
| `entity.get` | `{ id }` 或 `{ name }` | 单个实体完整记录（含组件） |
| `entity.find` | `{ name?, component?, active?, limit?, offset?, expectedSceneRevision? }` | ✅ 按名称子串、组件类型和 active 状态过滤实时世界，返回带 `sceneRevision` 的有界紧凑记录；续页必须回传首屏 revision，场景变化时返回 `STALE_REVISION` 并从 offset 0 重读 |
| `entity.get_component` | `{ id, component }` | ✅ 精确读取一个实体组件值；缺失实体和组件使用结构化错误 |
| `scene.get_meta` | — | `{ name, path, dirty, objectCount, mode, gizmo, sceneCamera, sceneView, gameResolution }` |

集成点：`store.snapshot()`、`store.getVisibleFlat()`、`store.authoredEntities()`。

#### 4.1.4 选中与编辑器状态

| query id | 返回 |
| --- | --- |
| `selection.get` | `{ selected, selectedIds }` |
| `editor.state` | ✅ `{ mode, gizmo, sceneCamera, sceneView: { mode2D, gridVisible, smartGuidesEnabled, pivotMode, handleOrientation, snap }, timelinePreferences: { animationTimeline: { timeDisplayMode, snapping }, sequencer: { snapping, rippleMode, inspectorOpen, loopPreview } }, gameResolution, canUndo, canRedo, undoLabel, redoLabel, dirty, sceneName, sceneRevision, eventSequence }`；Scene 与时间编辑器偏好在同一编辑器实例的所有窗口间持久化同步 |
| `workspace.documents` | ✅ 当前场景与已打开资源文档的路径、脏状态、活动/拆分状态及可观测窗口标签 |
| `editor.get_camera` | ✅ 已合并进 `editor.state.sceneCamera { yaw, pitch, distance, pivot }`，减少一次查询 |

#### 4.1.5 控制台日志（结构化）

| query id | 参数 | 返回 |
| --- | --- | --- |
| `console.get_logs` | `{ level?, since?, limit? }` | `[{ level, message, time, source? }]` |
| `console.clear` | — | `{ ok }` |

集成点：需把 `App.tsx` 的 `logs[]`（字符串、300 上限）提升为结构化日志服务（level/time/source/message），下沉到 store 或独立 `LogService`，供 Observer 与 EventBus 共用。

#### 4.1.6 项目与资产

| query id | 返回 | 集成点 |
| --- | --- | --- |
| `project.info` | `{ name, root, revision }` | `get_project_snapshot` |
| `asset.list` | `{ search?, kind?, folder?, limit?, offset?, expectedIndexRevision? }` → `{ indexRevision, total, nextOffset, assets }` | ✅ 刷新统一 Project asset index；筛选后完整索引生成确定性 revision，续页必须回传，外部磁盘或编辑器内资源变化时返回 `STALE_REVISION` 并从 offset 0 重读 |
| `asset.read_text` | `{ path, revision, size, contents }` | ✅ UTF-8 严格解码，默认 1 MiB/上限 8 MiB |
| `asset.find_references` | 引用报告 | ✅ 复用完整项目引用扫描器 |
| `scene.list` | `{ ready, activeScene, dirty, scenes[] }` | ✅ 读取实时 Scene Library 与内存场景状态 |
| `sprite.list` | 带 `spriteRevision` 的分页 `ProjectSpriteInfo[]`，支持 search/folder 过滤 | ✅ 复用 `list_project_sprites`；返回稳定 sprite id、切片 rect/pivot/PPU，续页用 revision 防止导入变化造成撕裂 |
| `sprite.import_settings` | `{ texturePath, importPath, textureSize, revision, settings: { mode, pixelsPerUnit, slices } }` | ✅ 读取 Sprite Editor 规范化导入设置；缺少 sidecar 时返回兼容 Single 默认值与 `revision: null`，支持 texture#slice 引用 |

### 4.2 可操作性（Controllability）—— 让 Agent「动手」

所有写命令统一经 Dispatcher。**关键约束：写操作必须走与 UI / 菜单完全相同的路径——调用 `EditorStore` 方法**（菜单命令经 `MenuItemContext.store` 调用，快捷键直接调用），再由 store 内部经 `desktopProjectSession` 串行队列与 Rust `submit_editor_request` 同步。AgentBridge 绝不绕过 store 直接写 Rust，否则会制造第三个事实源——本地编辑器方案已明确「React Store 与 Rust Session 双事实源」是要消除的问题。命令返回 `{ ok, revision, data }`。

#### 4.2.0 工程生命周期

| command/query id | 参数 | 说明 |
| --- | --- | --- |
| `project.state` | — | ✅ 欢迎页、工程挂载中和工程打开后均可读取 phase、busy/error、当前工程摘要、recent 数量/内容 revision 与事件 cursor；revision 覆盖名称、路径、时间和顺序，因此同数量重排也会触发 `project.changed` |
| `project.recent` | — | ✅ 无弹窗读取原生配置中的最近工程；页面刷新后若 Rust Host 已持有工程则自动重新挂载 |
| `project.open` | `{ root }` | ✅ 欢迎页按路径打开并校验 `project.json`；已有工程时拒绝切换；响应会等待新 store 完成场景、设置与资源初始化，过渡期查询返回 `NOT_READY` 而不是旧场景 |
| `project.create` | `{ parent, name }` | ✅ 欢迎页无弹窗创建；父目录与工程名由原生 `ProjectSession` 严格校验，并使用同一 store-ready 握手后才返回 |
| `project.close` | `{ discardDirty? }` | ✅ 不退出编辑器进程地返回欢迎页；播放、构建或未显式允许丢弃的脏工作区会拒绝。原生临界区销毁全部次级窗口、清理恢复快照并原子释放 `ProjectSession`，Bridge 在响应完成后随页面重载自动重连 |
| `project.forget_recent` | `{ path }` | ✅ 仅移除原生最近工程记录，不删除工程目录 |

Rust Host 使用独立的工程生命周期互斥门串行化 open/create/close 与四类构建任务的预留阶段，并在创建目录或读取新会话前复核“无现有工程、无活跃构建”。因此前端状态机不是唯一保护层，直接 IPC 或并发请求也不能覆盖现有 `ProjectSession`、启动脱离工程的构建或留下被拒绝的半创建工程。

#### 4.2.1 实体生命周期

| command id | 参数 | 映射 |
| --- | --- | --- |
| `entity.create` | `{ name?, components?, parent? }` | `store.createGameObject` |
| `entity.create_typed` | `{ kind }`，枚举由 `commands.describe` 返回 | 覆盖 GameObject 菜单的 37 种内建对象；Tilemap/UI 等复合创建返回被选中的目标对象而非隐式 Grid/Canvas，Cube 始终走根对象创建路径 |
| `entity.delete` | `{ ids[] }` | `store.deleteSelection`（先选中）或命令批 |
| `entity.duplicate` | `{ ids[] }` | `store.duplicateSelection` |
| `entity.rename` | `{ id, name }` | `store.rename` |
| `entity.set_active` | `{ id, active }` | `store.setActive` |
| `entity.reparent` | `{ ids[], parent, index? }` | `store.setParent` |
| `entity.reorder` | `{ id, index }` | ✅ 复用 `store.setParent` 的同父级排序路径；同位置为明确 no-op，其余保持单次 undo |

#### 4.2.2 组件操作

| command id | 参数 | 映射 |
| --- | --- | --- |
| `component.add` | `{ entity, type, value? }` | `store.addComponent`（自动补 RequireComponent） |
| `component.remove` | `{ entity, type }` | `store.removeComponent` |
| `component.set` | `{ entity, type, value }` | `store.setComponent` |
| `component.patch` | `{ entity, type, patch }` | `store.patchComponent` |
| `component.invoke` | `{ entity, type, method }` | ✅ 仅允许 schema 中已注册的 Behaviour 方法，复用 `store.invokeBehaviourMethod`，返回调用后的组件值 |

#### 4.2.3 Transform 与 UI

| command id | 参数 | 映射 |
| --- | --- | --- |
| `transform.set` | `{ entity, position?, rotation?, scale? }` | `store.setTransform` |
| `transform.translate` | `{ entity, delta }` | ✅ 从实时 Transform 计算有限新位置并走 `store.setTransform`，因此与 Inspector 一样可撤销 |
| `rect.set` | `{ entity, anchoredPosition?, sizeDelta?, pivot?, anchorMin?, anchorMax?, localRotation?, localScale? }` | ✅ 严格校验并规范化 RectTransform；未提供字段保持当前值，整次修改走 `store.setComponent` 形成单次撤销 |

#### 4.2.4 选择 / 播放 / 历史

| command id | 参数 | 映射 |
| --- | --- | --- |
| `selection.set` | `{ ids[], mode? }` | `store.selectMany` |
| `selection.reveal` | `{ id }` | `store.revealEntity`（Ping） |
| `playback.play` / `pause` / `stop` / `step` | `{ deltaTime? }` | ✅ 幂等进入/恢复 Play Mode；暂停态可按指定 deltaTime 单帧推进并保持暂停；粒子、Spine 与 AnimatedSprite 共用模拟时钟，暂停不偷跑 |
| `history.undo` / `redo` | — | `store.undo/redo` |
| `view.frame_selected` | — | `store.frameSelected` |
| `view.set_camera` | `{ yaw?, pitch?, distance?, pivot? }` | ✅ 复用 `store.setSceneCamera` 的 pitch/distance 安全钳制；后台调用不激活窗口 |
| `view.set_scene_preferences` | `{ mode2D?, gridVisible?, smartGuidesEnabled?, pivotMode?, handleOrientation?, snap?: { enabled?, move?, rotate?, scale? } }` | ✅ 精确部分更新并持久化 Scene 编辑开关与 Pivot/Center、Local/Global 手柄模式；同实例窗口实时同步并触发 `view.changed`，省略字段保持不变 |
| `view.set_timeline_preferences` | `{ animationTimeline?: { timeDisplayMode?, snapping? }, sequencer?: { snapping?, rippleMode?, inspectorOpen?, loopPreview? } }` | ✅ 精确部分更新 Animation Timeline 与 Sequencer 编辑偏好；保留已有用户设置键，同实例窗口实时同步并触发 `view.changed` |
| `gizmo.set` | `{ mode }` | `store.setGizmo` |

#### 4.2.5 场景 I/O

| command id | 参数 | 映射 |
| --- | --- | --- |
| `scene.new` | `{ name, overwrite?, discardDirty? }` | ✅ `store.newScene` + 持久化；默认拒绝覆盖和丢弃脏场景 |
| `scene.open` | `{ name, discardDirty? }` | ✅ `openSceneByName`；无弹窗且默认拒绝丢弃脏场景 |
| `scene.save` | `{ name?, overwrite? }` | ✅ `persistScene`；Save As 默认拒绝覆盖 |
| `scene.save_all` | `{ name?, overwrite? }` | ✅ 保存场景与所有窗口已挂载的资源文档；用定向请求 ID 汇总后台窗口结果，保存失败、超时或保存后仍脏均明确报错 |
| `scene.rename` | `{ oldName, newName }` | ✅ 保持 GUID，原子更新场景名、活动场景路径与 Build Settings 引用；写前拒绝未保存工作 |
| `scene.delete_preview` | `{ name }` | ✅ 返回文件修订、活动/构建阻断项与 SHA-256 预览令牌 |
| `scene.delete` | `{ name, previewToken }` | ✅ 重新验证预览令牌后永久删除；拒绝活动场景、Build Settings 场景及过期文件修订 |
| `scene.load_json` | `{ json }` | ✅ 严格校验后原子替换当前 authored world；单次 undo、不自动保存，并保留 Scene 相机与工程分辨率 |

#### 4.2.6 面板 / 窗口 / 菜单

| command id | 参数 | 映射 |
| --- | --- | --- |
| `panel.focus` | `{ kind }` | ✅ dispatch `mengine:focus-panel`；agent 路径携带 `activateWindow: false`；目标已激活则零变更返回，否则宿主窗口必须 hidden/unfocused |
| `panel.reset_layout` | `{}` | ✅ 复用 `mengine:reset-dock-layout`；已是默认布局则零变更返回，否则主窗与全部拆分面板窗必须 hidden/unfocused |
| `panel.detach` / `dock` | `{ kind }` | ✅ 复用 `detachedPanelWindow` 与 dock channel；Agent 拆分窗以 `visible=false/focus=false` 创建，脏资源面板拒绝迁移，任何实际布局变更均拒绝影响可见或聚焦宿主 |
| `layout.reset` | — | dispatch `mengine:reset-dock-layout` |
| `window.open_editor` | `{ typeId }` | ✅ 隐藏创建后同时等待原生窗口可发现与目标 WebView 非空语义快照就绪；返回初始 `snapshotRevision` / `semanticElementCount`，不会把仍在加载的窗口误报为空；成功创建及 `window.close` 销毁均发出 `window.changed` |
| `menu.invoke` | `{ path }` | ✅ 查 `MenuItemEntry`、执行实时 validator，再复用 `entry.action(ctx)` |
| `window.ui_click` | `{ windowLabel?, selector, offsetX?, offsetY?, shiftKey?, ctrlKey?, altKey?, metaKey? }` | ✅ 对 `window.ui_snapshot` 返回的 selector 合成受限 Pointer/Mouse/Click 事件；可使用元素左上角相对 CSS 像素定位画布内目标，省略坐标时兼容使用可见元素中心，并可携带显式修饰键完成范围/追加选择，不激活顶层窗口 |
| `window.ui_set_value` | `{ windowLabel?, selector, value }` | ✅ 仅允许 input/textarea/select/contenteditable；文本型控件按 `focus → input/change → render → blur → render` 原子提交，保证 `onBlur` 草稿与 Inspector 撤销手势在操作后观察前闭合；checkbox/radio 通过 change 直接提交。拒绝 disabled/readonly，禁止调用方注入脚本 |
| `window.ui_double_click` / `context_click` / `scroll` | 快照 selector 与对应参数 | ✅ 双击和上下文菜单支持可选 `offsetX/offsetY` 精确点位；滚轮可指定元素内落点、横纵增量和修饰键，先派发真实语义 `WheelEvent` 供 Scene/Timeline 等画布缩放消费，未消费时再执行原生容器滚动；均遵守元素级 Agent 禁止策略，脚本 IDE 启动、系统文件选择器、工程关闭与进程退出等人工路径不能借键盘或上下文菜单旁路 |
| `window.ui_drag_to` | `{ windowLabel?, selector, targetSelector, offsetX?, offsetY?, targetOffsetX?, targetOffsetY?, shiftKey?, ctrlKey?, altKey?, metaKey? }` | ✅ 仅接受语义快照中的源/目标 selector，可分别指定源与目标元素内的 CSS 像素点，在同一隐藏 WebView 内合成可带修饰键的 HTML5 拖放事件；不移动前台鼠标 |
| `window.ui_drag_by` | `{ windowLabel?, selector, offsetX?, offsetY?, button?, deltaX?/deltaY? 或 path?, shiftKey?, ctrlKey?, altKey?, metaKey? }` | ✅ 从快照标记为 `dragBy` 的元素内精确点位（默认中心）开始，可选择 `left/middle/right` 按钮；简单手势使用单终点增量，曲线/绕行手势可传最多 64 个相对起点的累计位移点。所有路径点必须留在同一隐藏 WebView 视口内，事件数量有界，不接受屏幕坐标且不移动系统鼠标 |
| `window.ui_hover` | `{ windowLabel?, selector, state?, offsetX?, offsetY? }` | ✅ 仅接受快照标记为 `hover` 的 React 悬停目标；`state=enter`（默认）可在元素内精确点位展开层级菜单，`state=leave` 显式释放当前合成 hover 并收起临时 UI，整个过程不移动系统鼠标 |
| `window.ui_press_key` | `{ windowLabel?, selector, key, shiftKey?, ctrlKey?, altKey?, metaKey? }` | ✅ 允许 Enter/Escape/Tab/Space、方向/翻页/首尾/删除类语义键、F1–F24 功能键，或单个非空白可打印 Unicode 字符；可打印键通过当前 React props 同步受控草稿，Enter/Escape 只为可编辑控件补齐失落的 blur 提交，Tab 对可编辑草稿先提交再按原生 HTML/SVG 语义焦点顺序移动、对按钮/菜单项则仅移动焦点；功能键与修饰键组合可触发编辑器快捷键。多字符文本、控制字符与调用方脚本仍被拒绝，所有事件只进入目标隐藏 WebView，不向前台应用注入输入 |

所有 `window.ui_*` 写动作还必须传入 selector 所属页面的 `expectedSnapshotRevision`。Rust Host 会在事件分发前重新计算完整语义元素身份与顺序指纹；隐藏 WebView 还把 revision 绑定到 DOM mutation epoch、完整语义 selector、对应 DOM 元素身份和当时声明的动作集合，并在查询 selector 前于同一个 JS 任务内同步复核。源 selector 不属于该快照、动作未由该元素声明，或拖放目标不属于该快照时返回带原因的 `INVALID_ARGS`；DOM 已重排、元素身份已变化或检查与执行之间出现竞态时返回 `STALE_REVISION`。元素相对坐标会在执行任务内按当前 `getBoundingClientRect()` 重新换算，必须同时位于目标元素和 WebView viewport；越界返回 `invalidPointerCoordinates`，不会把截图中的旧像素点注入其他控件。调用方必须重新读取快照，不能用手写的非快照 selector、把未声明动作作用到元素，或把过期 selector 作用到新元素。每个窗口最多保留最近 8 份 revision 授权记录，MutationObserver 观察到页面变化时全部失效，不会因滚动或重复查询无限保留 DOM 引用。

动作分发后，目标 WebView 会等待两次渲染机会（后台限流时由有界 timer 接管），Rust Host 再读取一次完整语义指纹。成功结果携带 `settledFrames`、`postObservationConfirmed`、`postSnapshotRevision`、`postSemanticElementCount` 与 `snapshotChanged`；因此 Agent 可以直接把返回的 post revision 用于下一次交互，而不需要任意 sleep。若动作已执行但目标窗口随即消失，结果保留成功分发并以 `postObservationConfirmed=false` 和 `postObservationError` 明确标记未能完成后置观测。

`snapshotRevision` 的哈希输入与快照的可观察内容共用同一份 `semanticElements` 序列化结果，覆盖 id/parent、selector、role/name/text、快照控件值、原生 input 类型与 min/max/step/pattern/长度约束、select/datalist 选项数量及内容指纹、description、disabled/readOnly/focused、非密码文本输入的光标/选区与 ARIA/check 状态、Agent 交互策略、actions、滚动状态、bounds，并同时覆盖 viewport、活动元素和 DOM/语义元素总数。任何已返回字段或选项内容的变化都会使续页和写动作的旧 revision 失效，不会把不同时间点的控件状态拼成一份快照；未截断的完整语义名称/说明、未归一化长文本、值和选项 JSON 通过 `window.ui_content` 分页读取。快照版本 8 还完整保留自定义控件当前声明的标准 ARIA 状态与属性，包括 slider/progressbar/spinbutton 的 `valuemin` / `valuemax` / `valuenow` / `valuetext`、方向与多选、校验和忙碌状态、键盘快捷键、live region，以及 controls/active-descendant/description 等关系；同时按原生 HTML 语义区分 number `spinbutton`、search `searchbox`、datalist `combobox`、output `status` 和 meter，并为 output/progress/meter 公开精确 value、值域及 indeterminate 元数据。版本 9 进一步遵守 ARIA 可访问性树继承规则：自身或任一祖先声明 `aria-hidden=true` 的装饰、重复或视觉反馈节点不会进入快照；原生动作脚本也会独立拒绝未渲染或已从语义树隐藏的源和拖放目标。版本 10 把 snapshot revision 提升为有界的语义能力清单：精确读取必须命中快照成员，交互源还必须声明请求动作，拖放目标也必须是快照成员，三条路径均再次核对 selector 对应的 DOM 元素身份。版本 11 把 `inert` 继承纳入同一观察与交互边界，并通过语义文本遍历从父控件名称/文本中排除隐藏装饰子树；Inspector 与通用 Schema 折叠按钮同时公开准确的 `aria-expanded`，不再把折叠符号和装饰首字母混入组件名称。版本 12 让合成 `Tab`/`Shift+Tab` 遵守浏览器正 `tabindex` 优先顺序，并跳过语义隐藏、`inert`、原生/ARIA 禁用与未渲染控件；存在模态框时，焦点循环严格限制在当前最上层模态框内。版本 13 按标准优先解析有序 `aria-describedby` ID 引用，再回退到 `aria-description` 和非重复 title，使对话框与带帮助文本的控件在单次快照中直接携带完整语义说明。版本 14 补齐原生 HTML 的结构角色：article/region/list/listitem、definition term/definition、paragraph/code、group、table/row/cell/header 等节点会保留在父子链中，Agent 可直接重建文档、列表、表格和面板结构。版本 15 还把原生 `<details>.open` 同步为 details 与 summary 的布尔 `state.expanded`，点击前后无需根据子节点数量猜测折叠状态。版本 16 把原生 `<dialog>.showModal()` 纳入与 ARIA modal 相同的语义边界，并公开布尔 `state.open/modal`；快照和执行脚本都会优先锁定当前持有焦点的最上层模态框，背后的编辑器控件不再暴露动作或接受手工 selector 交互。版本 17 为非密码 input/textarea 公开 selectionStart/selectionEnd/selectionDirection，并在语义按键未被页面阻止时补执行 ArrowLeft/Right、Home/End、Space、Textarea Enter、Backspace/Delete 的原生文本默认行为；textarea 的纵向/Page 导航保留期望列，原生 modal dialog 的 Escape 还会先发出可取消 cancel 再关闭。checkbox/radio 的 Space、单选 select 的方向/Home/End/Page 键以及 number/range 的步进键也使用相同的可取消默认行为，并通过 input/change 与新 revision 验证结果。版本 18 将同一套可观测选区和默认编辑语义扩展到 contenteditable：方向/Home/End/Page 键可移动或扩展选区，Space/Enter/Backspace/Delete 会先发出可取消 beforeinput，再以 DOM Range 保留未编辑的富文本结构并发出 input；`aria-readonly=true` 仍允许导航但不会修改内容。版本 19 统一快照、精确名称读取和交互回执的可访问名称优先级：有序 `aria-labelledby` 引用优先于 `aria-label`，再回退到原生 `<label>`，三条路径不会再为同一控件给出不同名称。版本 20 按 W3C Hidden Not Referenced 规则保留显式引用语义：直接被 `aria-labelledby`、`aria-describedby` 或原生 `<label>` 关系引用的隐藏根，其子树文本仍可组成名称/说明；未被关系引用的 `aria-hidden`/`inert` 装饰继续从快照、父控件文本和交互目标中排除。版本 21 不再仅因标签类型就保留无角色、无名称、无自身文本且无动作的空 `<label>` 包装层；其可见标签文字和已命名控件仍分别保留，并直接连接到最近的有效语义祖先，Agent 不会在结构树中得到无意义节点。版本 22 将原生 `<fieldset>/<legend>`、`<figure>/<figcaption>`、`<table>/<caption>` 和 input button 的宿主语言名称统一纳入快照、精确名称读取与交互回执，并让带非空 `alt` 的原生图片公开准确的 `img` 角色；Sequencer 等复杂字段组不再要求 Agent 从首个子节点反推分组名称。仅移动光标也会产生新 snapshot revision，Agent 可验证每次后台编辑结果。Agent 不再需要从标签、几何位置或相邻文本猜测控件类型和当前值，也不会把行号、图标、折叠符号或拖拽辅助层误判为编辑器内容，手工 selector 不能绕过已观察到的语义边界。

编辑器中的图形表面也必须声明机器可判定的语义类型：Scene/Game 及可编辑曲线使用 `application`，Animator 图使用保留子控件的 `group`，Profiler、只读曲线、Sprite 与 Sprite Atlas 预览使用 `img`。因此 Agent 能先从快照区分“交互式画布、图形控件组、只读图像”，再按需使用 `view.capture_element` 读取对应像素，而不必仅凭 `canvas`/`svg` 标签猜测用途。

存在可见的 `role="dialog" aria-modal="true"` 或原生 `dialog:modal` 时，语义快照仍保留底层界面的只读观察，但会把模态框外元素标记为 `state.modalBlocked=true` 并移除其动作；原生动作脚本再次独立检查当前最上层模态框，拒绝任何越界 selector 或拖放目标，并返回结构化 `CONFLICT`。因此合成 DOM 事件不能绕过视觉遮罩修改底层编辑器状态。

快照与原生动作脚本还分别使用浏览器权威的 `:disabled` 匹配和 `aria-disabled` 祖先检查计算有效禁用状态。被 `<fieldset disabled>`、`<optgroup disabled>` 或禁用 ARIA 容器包围的后代会返回 `state.disabled=true` 且不再暴露动作；执行端即使收到手工构造的 selector 也会再次拒绝源元素或拖放目标，Agent 不能用合成 React 事件绕过 Timeline 锁定区等 UI 门禁。

`setValue` 在发出 React/input/change 事件前先用原生 `ValidityState` 校验 required、type、pattern、min/max/step 及长度约束；不合法的临时 DOM 值会先回滚，再以 `INVALID_ARGS` 返回具体 `validityIssues`，不会让 Agent 绕过快照中已经公开的控件约束。通过校验后优先调用元素当前 React props 的 `onInput/onChange`，无 React handler 时才回退到原生冒泡事件，避免受控输入只改 DOM 未改模型。文本型控件还必须成功取得 WebView 内语义编辑焦点，等待受控 props 与 DOM 值同步，再按捕获/冒泡顺序补齐 WebView 未派发的 React focus/blur 生命周期并等待提交渲染；结果用 `valueCommitMethod/valueCommitConfirmed` 明示采用 change 或 blur 提交以及提交边界是否实际触发，附带 React handler 与草稿同步证据供 Agent 判断。若 DOM 值已经变化但提交边界未获确认，Bridge 返回 `CONFLICT` 并要求重新读取 UI 与领域模型，不把未落模的草稿误报为成功。

快照版本 23 收紧 `keyPress` 能力声明：只有原生可聚焦控件、contenteditable、显式 `tabindex`（含 `-1`）或可聚焦 SVG 才公开按键动作。仅在父容器监听冒泡键盘事件、但自身不能获得焦点的 menu/dialog 包装层不再产生无法执行的虚假动作；Agent 应把按键发送给快照中的实际焦点项，事件仍会按 DOM/React 规则冒泡到容器处理。

Tab 的合成焦点顺序同时包含可见、可用且 `tabIndex >= 0` 的 HTML 与 SVG 元素，并遵循正 `tabIndex` 优先、同组 DOM 顺序的原生规则。这样 Timeline 曲线编辑器、曲线关键帧和切线手柄不会被跳过；显式 `tabIndex=-1` 仍可直接接收 Agent 按键，但不会错误进入 Tab 顺序。

#### 4.2.7 资产与构建

| command id | 映射 |
| --- | --- |
| `asset.import_file` | ✅ 从绝对本地路径导入 UI 支持的单个二进制/内容资产；64 MiB 上限，拒绝 symlink、覆盖和残留 `.meta`，目标以 create-only 原子安装并生成新 GUID，sidecar 失败则完整回滚 |
| `asset.create` | ✅ 在不打开资源编辑器、不激活窗口的前提下，复用人工 Assets/Create 的默认工厂创建 Animation、Animator、Avatar Mask、Material、Material Instance、Shader、Sprite Atlas、Timeline；返回主资源及自动生成伴生资源的精确路径、GUID 与 revision |
| `asset.open` | ✅ 校验资产索引与 `.meta` 后，在对应 Material/Material Instance/Shader/Animator/Avatar Mask/Timeline/Sprite 编辑器中打开；只把 Sprite 编辑器实际支持的 PNG/JPEG/WebP/GIF 纹理作为 Sprite 文档，跨拆分窗口同步文档路径，切换前拒绝丢弃本地或远端脏文档，目标宿主可见或聚焦时直接拒绝 |
| `asset.instantiate` | ✅ 校验资产索引与 `.meta` 后，把 Prefab、glTF/GLB Model 或 Sprite 纹理通过与 Project 面板一致的路径实例化到当前编辑场景；返回根实体完整快照并形成一次撤销 |
| `asset.write_text` | ✅ 8 MiB UTF-8 上限；已有文件必须携带精确 revision，新文件必须传 null；写前拒绝任何窗口的未保存工作 |
| `sprite.import_settings.set` | ✅ 以 `sprite.import_settings` 的精确 revision 完整更新模式、PPU 与最多 4096 个切片；复用 Sprite Editor 校验并刷新 Sprite 索引，外部变化会刷新干净文档，脏文档保留草稿且过期保存失败 |
| `asset.rename_preview` / `asset.rename` | ✅ 两阶段引用感知重命名；预览令牌绑定 source revision、自动重写和人工引用，执行前重新扫描校验 |
| `asset.duplicate_preview` / `asset.duplicate` | ✅ 两阶段复制；新 GUID，移动相对依赖时重写自身内容，脚本引用需显式确认 |
| `asset.trash_preview` / `asset.trash` | ✅ 完整引用与 manifest 预检；有引用或扫描截断时禁止移动，成功后可恢复 |
| `asset.list` / `sprite.list` / `asset.trash_list` / `asset.restore` | ✅ 有界、revision-safe 的资源/精灵/回收站查询；精确 record revision 恢复且不覆盖已占用目标；对应 MCP 资源可订阅，分离资源窗口保存或磁盘外部修改都会统一失效 |
| `project.script_diagnostics` | ✅ 复用 PC Player 的严格 TypeScript 编译配置，只读返回源码 revision、TypeScript 版本、文件数以及有界结构化诊断（工程相对路径、1 基行列、错误码、消息）；不 Emit、不写构建缓存、不启动 Player；`mengine://project/script/diagnostics` 在工程或脚本资产变化后失效 |
| `build.start` / `build.cancel` | ✅ 异步 job；写前检查整个 workspace 已保存，进度与结果由 `build.status` 轮询 |
| `build.settings` / `build.history` / `build.patches` / `build.status` / `build.artifact_status` | ✅ 构建设置、有界历史/补丁清单和当前/最近异步 job 的只读查询；对应 MCP 资源可订阅 |
| `build.settings.set_scenes` | ✅ 原子保存精确有序的启用场景；仅接受 `availableScenes` 中的路径，第一项为入口场景，写前拒绝未保存工作 |
| `build.verify` | ✅ 复用发布 Player 的 `--validate-package`，校验 content hash、manifest、场景与资源；Windows 使用 `CREATE_NO_WINDOW`，不会抢前台 |
| `build.run` | ✅ 复用 `run_pc_player` 与当前 Manifest/工程输出校验；必须传 `allowForegroundLaunch: true` 显式确认 Player 会创建可见窗口 |

#### 4.2.8 批量与事务

| command id | 参数 | 说明 |
| --- | --- | --- |
| `batch.apply` | `{ commands: WorldCommand[] }` | ✅ 1–256 条 WorldCommand 在写入前模拟实体存在性、组件存在性、删除顺序与父子循环；整批校验成功后通过 `store.applyCommands` 形成单个 undo 事务 |
| `intent.apply` | `{ intent }` | ✅ 复用 `packages/agent` 的严格校验与展开；部分 Transform 先合并当前值，再经 `batch.apply` 同一校验路径形成单个 undo 事务 |

### 4.3 可发现性（Discoverability）—— 让 Agent「知道能做什么」

| query id | 返回 | 集成点 |
| --- | --- | --- |
| `queries.list` | `[{ id, category, description, readOnly }]` | ✅ 全部只读 Bridge 查询目录；MCP resource、原生 WebSocket 与 CLI 共用 |
| `queries.describe` | `{ id }` → 完整参数 schema | ✅ 返回查询参数 JSON Schema；所有传输在查询执行前按同一 schema 严格校验 |
| `commands.list` | `[{ id, category, description, readOnly }]` | ✅ 命令注册表（Dispatcher 内建） |
| `menu.list` | `{ root? }` → 注册菜单元数据与实时 `enabled` | ✅ 读取统一 MenuItem 注册表并执行 validator；MCP `mengine://editor/menus` 会随注册、选择、场景和模式变化失效 |
| `commands.describe` | `{ id }` → 完整 schema | ✅ 返回命令参数 JSON Schema 与通用执行选项 schema；未知命令明确拒绝 |
| `schema.components` | 所有组件 `{ type, label, description, fields[], methods[], requires[] }` | ✅ 合并 `componentCatalog`、`inspectorMetadata` 与 `behaviour.FieldMeta/MethodMeta`，并包含专用 Transform 契约 |
| `schema.component` | `{ type }` → 字段级 schema（默认值/类型/范围/枚举/条件/资产引用/可编辑状态） | ✅ 与真实 Inspector authoring metadata 同源，不再仅从默认值猜粗粒度类型 |
| `intents.list` | 支持的高层意图、说明与完整 JSON Schema | ✅ `packages/agent` 单一契约源；MCP 对应 `list_intents` |

这是「自描述」的关键：Agent 先调 `queries.list`、`commands.list` 和 `schema.components`，就能动态知道可读什么、可改什么、每个组件能填什么字段，无需人工硬编码。MCP 同时暴露 `mengine://queries`、查询描述工具和领域工具。

### 4.4 反馈与验证（Feedback & Verification）—— 让 Agent「确认结果」

| 能力 | 说明 |
| --- | --- |
| 查询契约 | ✅ 每个只读查询都有权威 `paramsSchema`；所有一一映射的 MCP query tool 自动对比结构约束（含非空、pattern、长度和分页条件），WebSocket、CLI 与 MCP 对非法、缺失或多余字段返回一致的 `INVALID_ARGS`，不再静默忽略 |
| 命令结果 | ✅ 每个写命令返回 `{ ok, sceneRevision, eventSequence, data }`；所有传输先按同一 `paramsSchema` 严格校验参数，再检查 `expectedSceneRevision`，不匹配时在任何改动前返回 `STALE_REVISION` |
| 操作后自动截图 | 写命令可带 `options.screenshot: true`；结果显式返回 `screenshotRequested=true`，成功时返回 `screenshotCaptured=true` 与 `screenshot`，失败时保留已完成写动作并返回 `screenshotCaptured=false` 和有界 `screenshotError`。MCP 将不含 Base64 的尺寸、缩放、时间与后台安全元数据作为 text block，并另附 image block |
| 状态 diff | ✅ `query: scene.diff({ fromRevision })` 返回实体增删改、场景级状态（当前含 clear color）和当前 payload；切场景或历史过期时返回 `resetRequired` 与完整快照 |
| 事件订阅 | ✅ 有界 journal + cursor 查询 `events.get`；`events.wait` 可按 topic 等待最多 15 秒并显式返回 `timedOut`，MCP/CLI 无需高频轮询；最多 64 个等待请求，超限返回带容量与重试提示的 `RATE_LIMITED`；MCP `notifications/cancelled` 会按原请求 ID 精确释放 sidecar、原生 Bridge 和 WebView waiter 三层资源且不回写已取消响应，不会关闭共享 WS 或误伤其他请求；原生 WebSocket 同时广播 `project.changed` / `scene.changed` / `selection.changed` / `mode.changed` / `dialog.changed` / `log.*` / `panel.changed` / `workspace.changed` / `window.changed` / `window.types.changed` / `menu.changed` / `view.changed` / `build.progress` / `build.artifacts` / `build.settings` / `project.settings` / `asset.changed`。其中 `dialog.changed` 覆盖所有窗口非阻塞对话框的打开、切换和关闭，`workspace.changed` 覆盖资源文档路径、dirty、活动/拆分状态和宿主窗口变化，`window.changed` 由完整原生窗口清单去重驱动，覆盖 Agent 或用户路径造成的创建、关闭、显隐、焦点、位置与尺寸变化，并在窗口消失后撤销 Agent 所有权，`window.types.changed` 覆盖可创建辅助窗口类型注册变化，`menu.changed` 覆盖菜单注册及实时可用性变化，`view.changed` 覆盖 Scene 相机、Gizmo、Game 分辨率，以及任意窗口修改的 Scene、Animation Timeline 和 Sequencer 持久化编辑偏好，`build.artifacts` 只在构建历史、补丁或发布产物确实变化时发出，避免用高频 progress 失效库存资源，`build.settings` 与 `project.settings` 分别统一覆盖 UI 或 Agent 在任意窗口成功保存构建策略，以及 Tags、GameObject Layers 与 Sorting Layers，`asset.changed` 同样覆盖 UI 或 Agent 成功重命名、删除场景以及其他资源写入；同一次保存或场景资源变更只写一条 journal 事件。MCP 另声明标准 `resources.subscribe`，把这些事件映射为已订阅资源的 `notifications/resources/updated`；同一事件循环内按 URI 合并，断线持续重连，重连成功后统一失效已有订阅以补偿断线窗口 |
| 结构化错误 | 错误码：`STALE_REVISION` / `RATE_LIMITED` / `CONFLICT` / `ENTITY_NOT_FOUND` / `COMPONENT_NOT_FOUND` / `INVALID_ARGS` / `READONLY` / `PERMISSION_DENIED` / `NOT_READY` / `PROJECT_NOT_OPEN` / `IO_ERROR` / `INTERNAL` |

## 5. MCP Server 设计（优先传输）

### 5.1 部署形态

- **进程**：独立 sidecar（`packages/agent` 下新增 `mcp/`），实现 MCP stdio。
- **连接**：读发现文件 `<project>/.mengine/agent-bridge.json` 拿到 WS 端口与 token，连上 Bridge Transport。
- **启动**：作为 Tauri sidecar 随编辑器拉起，或用户手动运行 `npx mengine-mcp`（供 Claude Desktop / Cursor 配置）。

**实现选型说明**：因为 AgentBridge 已经通过本地 WebSocket 暴露，MCP 适配器的实现语言与编辑器解耦——它只是一个「MCP(stdio) ↔ WS」的协议翻译器。两种选择：

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| Node sidecar（推荐先行） | TS 的 MCP SDK 成熟、开发快；编辑器本已为构建打包 Node CLI（`build-sdk/`）；MCP 客户端（Claude/Cursor）都跑在有 Node 的开发机上 | 依赖 Node 运行时 |
| Rust sidecar（后续可选） | 零额外依赖，契合「运行时不要求 Node」的发布目标 | Rust MCP SDK 相对不成熟，开发成本高 |

建议 Phase 1 用 Node sidecar 快速打通，待协议稳定后再评估是否用 Rust 重写以满足无 Node 发布。注意「运行时不要求 Node」主要针对**游戏 Player**，编辑器作为开发工具运行在开发机上，Node 普遍可用。

### 5.2 Tools（由 `commands.list` 自动生成）

只读 tools（Phase 1）：

```
get_project_state, list_recent_projects, get_active_dialog,
get_scene_snapshot, get_scene_changes, get_editor_events, wait_for_editor_events,
get_hierarchy, get_selection, get_editor_state,
get_entity, find_entities, get_entity_component, get_console_logs, list_windows, list_panels,
take_screenshot, list_assets, list_scenes, get_component_schema, list_commands
```

写 tools（Phase 2）：

```
open_project, create_project, close_project, forget_recent_project, respond_to_dialog,
create_gameobject, delete_entities, duplicate_entities, rename_entity,
set_active, reparent_entities, reorder_entity, add_component, remove_component, set_component,
patch_component, invoke_component_method, set_transform, translate_entity, set_selection,
reveal_entity, frame_selection, set_scene_camera, play, pause, stop, step,
clear_console_logs,
undo, redo, save_scene, open_scene, new_scene, focus_panel, open_editor_window,
invoke_menu, import_asset_file, write_asset_text, preview_asset_rename, rename_asset,
preview_asset_duplicate, duplicate_asset, preview_asset_trash, trash_asset,
list_asset_trash, restore_asset, set_build_scenes, start_pc_build, cancel_pc_build,
verify_pc_build,
list_intents, apply_batch, apply_intent
```

每个 tool 的 `inputSchema` 直接来自命令注册表的 `paramsSchema`（JSON Schema），保证 MCP 客户端能正确校验参数。

`tools/list` 同时为每个工具返回 MCP 官方 `readOnlyHint`、`destructiveHint`、`idempotentHint` 与 `openWorldHint`。只读查询统一标记为封闭世界且可重复；写工具默认按保守策略视为破坏性，仅对纯新增操作解除破坏性提示，并单独标出访问工程外路径、启动编译/Player 或读取外部密钥的开放世界操作。这些元数据用于宿主展示和审批提示，真正的安全边界仍由 token、路径校验、revision、preview token 与显式前台确认承担。

### 5.3 Resources（只读上下文）

```
mengine://project/state         工程生命周期状态（欢迎页也可读）
mengine://editor/state          当前编辑器状态
mengine://scene/snapshot        当前场景快照
mengine://scene/hierarchy       层级树
mengine://schema/components     全部组件 schema（供 Agent 理解可填字段）
mengine://commands              命令目录
mengine://console/logs          控制台日志
```

### 5.4 Prompts（可选工作流模板，✓ 已实现）

```
create_ui_button      「创建一个可点击的 UI 按钮并绑定回调」
setup_3d_scene        「搭建一个含相机、灯光、立方体的基础 3D 场景」
inspect_and_fix       「截图当前场景，检查并修复选中物体的问题」
```

MCP 初始化声明 `prompts` 能力，并实现 `prompts/list` / `prompts/get`。模板参数仅接受有界字符串；工作流统一要求先读工程、编辑器、场景和组件 schema，再使用最新 `expectedSceneRevision` 执行领域工具，最后以语义 diff 和后台截图验证。模板不会自行覆盖、丢弃或保存用户工作。

### 5.5 MCP 客户端配置示例

```jsonc
// claude_desktop_config.json / cursor mcp.json
{
  "mcpServers": {
    "mengine": {
      "command": "npx",
      "args": ["-y", "mengine-mcp"],
      "env": { "MENGINE_PROJECT": "G:/work/github/MEgine/packages/editor/project" }
    }
  }
}
```

### 5.6 单次 CLI（脚本 / CI / Agent Shell）

`mengine-agent` 复用 MCP Adapter 的同一 Bridge 客户端，不需要自己维护 WebSocket 或 MCP stdio 会话：

```powershell
mengine-agent query window.list
'{"id":"window.ui_snapshot"}' | mengine-agent query queries.describe --args -
'{"windowLabel":"main"}' | mengine-agent query window.ui_snapshot --args -
mengine-agent execute intent.apply --args @intent.json --expected-scene-revision 12
```

CLI 仅输出结构化 JSON，支持 `--args @file` / `--args -`、显式幂等 `--request-id`、`--discovery-file`、revision 锁和操作后截图。写请求遇到编辑器进程切换时与 MCP 一样返回 `UNKNOWN_OUTCOME`，不会假定重试安全。

### 5.7 本地 HTTP（curl / 自动化服务）

`mengine-agent-http` 同样复用 MCP Adapter 的 Bridge 客户端，默认在 `127.0.0.1` 的随机空闲端口启动，并将 `{ host, port, token, pid }` 原子写入 `%APPDATA%/com.mengine.editor/agent-http.json`（可用 `MENGINE_AGENT_HTTP_FILE` 覆盖）。所有端点都要求发现文件中的 Bearer token：

```powershell
mengine-agent-http
$agentHttp = Get-Content "$env:APPDATA/com.mengine.editor/agent-http.json" | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($agentHttp.token)" }
$uri = "http://127.0.0.1:$($agentHttp.port)"

Invoke-RestMethod "$uri/v1/query" -Method Post -Headers $headers -ContentType "application/json" `
  -Body '{"query":"window.ui_snapshot","args":{"windowLabel":"main"}}'

Invoke-RestMethod "$uri/v1/execute" -Method Post -Headers $headers -ContentType "application/json" `
  -Body '{"command":"history.undo","args":{},"requestId":"automation:undo:1","options":{"expectedSceneRevision":12}}'
```

端点固定为 `GET /v1/health`、`POST /v1/query`、`POST /v1/execute`。HTTP 写请求强制提供 1..128 字符的稳定 `requestId`，避免网络重试产生重复副作用；请求体最大 8 MiB、响应最大 128 MiB、最多 64 个活动请求和 128 个连接。适配器校验精确 loopback Host、拒绝 query string/CORS 探测和非 JSON 写入；客户端断开时会精确取消其 Bridge 请求，不影响共享连接上的其他调用。

### 5.8 危险操作授权策略

Rust Bridge Host 会在请求占用槽位或进入 WebView **之前**统一拦截 `scene.delete`、`asset.trash`、`build.start`、`build.run`、`build.history.create_patch` 与 `build.history.restore`。策略由编辑器进程的 `MENGINE_AGENT_DANGEROUS_POLICY` 配置：

- `allow`：默认值，保持本机可信环境下的无人值守 Agent 流程；
- `deny`：所有上述命令返回 `PERMISSION_DENIED`；
- `token`：仅接受带正确独立授权令牌的请求。编辑器进程和获批的 MCP / HTTP / CLI 适配器都配置相同的 `MENGINE_AGENT_APPROVAL_TOKEN`（16..256 个可见 ASCII 字符），适配器会在 Bridge 信封中自动转发，工具参数和 HTTP 请求体都不会暴露该令牌。

无效策略或 `token` 模式缺少合格令牌时按 `deny` 失败关闭。授权令牌不会写入 AgentBridge / HTTP 发现文件，不会出现在错误数据、幂等指纹或日志中；直连 WebSocket 客户端应把它放在 `execute.params.approvalToken`，而不是业务 `args`。

## 6. 关键集成点（落到代码）

| 能力 | 文件 / 位置 | 改造内容 |
| --- | --- | --- |
| 视口截图 | `src/panels/Viewport.tsx`（`canvasRef` line 522） | 暴露 `captureCanvas(): dataUrl`（`canvas.toDataURL`），由 Observer 调用——当前主路径 |
| 整窗截图 | `src-tauri/src/agent_bridge.rs` | ✅ 已实现 WebView2 DevTools 离屏截图；支持 `windowLabel`，被遮挡/隐藏时不抢焦点；禁止退化为 GDI 屏幕拷贝 |
| 语义窗口读取/交互 | `src-tauri/src/agent_bridge.rs` | ✅ `Runtime.evaluate` 返回可搜索的控件树；开放点击、双击、上下文菜单、改值、滚动和白名单语义按键，全部不激活窗口；参数经 JSON→Base64 边界传递 |
| 窗口枚举 | `src-tauri/src/lib.rs` | ✅ 已实现 `list_editor_windows`（`app.webview_windows()`，按 label 分类 main/panel/editor） |
| 面板枚举 | `src/panels/DockWorkspace.tsx` | ✅ 推送当前内存 dock tree、活动 tab、docked/detached 状态到 AgentBridge |
| 命令调度 | 新增 `src/agent/AgentBridge.ts` + `src/agent/commands.ts` | 命令注册表 + Dispatcher，映射到 store / 菜单 / 面板 |
| 状态观察 | 新增 `src/agent/observer.ts` | 聚合 snapshot / 截图 / 窗口 / 日志 / schema |
| 结构化日志 | `src/App.tsx` `logs[]` → 新增 `src/agent/LogService.ts` | level/time/source/message，替换字符串数组 |
| Bridge 传输 | `src-tauri/src/lib.rs` | 引入 `tokio-tungstenite` 本地 WS 服务器 + 消息路由 + 发现文件 |
| MCP 适配 | `packages/agent/mcp/` | MCP stdio server，WS 客户端连 Bridge |
| 单次 CLI | `packages/agent/cli/editor.mjs` | ✅ 复用 MCP Bridge 客户端的 query / execute JSON 命令 |
| 本地 HTTP | `packages/agent/http/server.mjs` | ✅ loopback + Bearer 鉴权的 query / execute REST 适配器；请求边界、并发和断开取消均有界 |
| 意图层扩展 | `packages/agent/src/index.ts` | ✅ 3 个严格、自描述的安全 intent，已接 Dispatcher |
| 命名统一 | `src/agent/protocol.ts` | AgentBridge 对外统一 camelCase，内部按需转换 snake_case |

## 7. 分阶段路线图

### Phase 1 —— 感官层（只读，零风险）

目标：让 Agent 能「看见」和「摸清」编辑器。

- AgentBridge Core 骨架（Observer + 命令注册表只读部分）
- 截图：`view.screenshot`（视口 canvas）+ `view.window_screenshot`（WebView2 离屏整窗/浮动窗口）
- 枚举：`window.list` / `panel.list` / `panel.get_layout`
- 状态：`scene.snapshot` / `scene.hierarchy` / `selection.get` / `editor.state` / `entity.get`
- 结构化日志服务 + `console.get_logs`
- Bridge Transport（Rust 本地 WS + 发现文件）
- MCP Adapter 只读 tools + resources

验收：MCP 客户端能 `take_screenshot`、`list_windows`、`get_hierarchy`、`get_editor_state`，Agent 可据此描述当前编辑器。

### Phase 2 —— 操作层（写，带锁与确认）

目标：让 Agent 能「动手」。

- Dispatcher 写命令（实体/组件/transform/选择/播放/历史/场景 I/O）
- 走 `submit_editor_request` 乐观锁，返回 revision
- `batch.apply` / `intent.apply`（扩展 packages/agent）
- 面板/窗口/菜单控制（`panel.focus` / `window.open_editor` / `menu.invoke`）
- MCP 写 tools

验收：Agent 能通过 MCP 创建物体、改组件、播放/停止、保存场景，且版本冲突正确报错。

### Phase 3 —— 发现与验证层

目标：让 Agent「知道能做什么」并「确认结果」。

- `queries.list` / `commands.list` / `schema.components` / `menu.list` 自描述
- 操作后自动截图 + `scene.diff`
- ✅ EventBus 事件订阅（project/scene/selection/mode/dialog/log/panel/workspace/window/window-types/menu/view/build-progress/build-artifacts/settings/asset）
- ✅ MCP resources/prompts 与标准资源订阅

验收：Agent 仅凭 `queries.list` + `commands.list` + `schema.components` 即可自主探索能力；写操作后能拿到截图与 diff 自我验证。

### Phase 4 —— 扩展传输层

目标：覆盖更多接入场景。

- ✅ WebSocket 直连适配器（自研 agent / 浏览器脚本）
- ✅ HTTP REST 适配器（curl / 简单集成）
- ✅ CLI（`mengine-agent query scene.snapshot` / `mengine-agent execute history.undo`）
- ✅ 原生统一权限策略（`allow` / `deny` / 独立 approval token）

验收：同一内核经 WS/HTTP/CLI 均可驱动，行为一致。

## 8. 风险与注意事项

| 风险 | 应对 |
| --- | --- |
| 安全：本地端口被其它进程调用 | 仅绑定 127.0.0.1；发现文件含随机 Bridge token，连接需校验；危险命令在原生入队前执行 `allow` / `deny` / 独立 approval token 策略，无效配置失败关闭且令牌不进入发现文件、错误或日志 |
| 并发：多客户端同时写 | 复用 `base_revision` 乐观锁；冲突返回 `STALE_REVISION`；不同 `request_id` 的唯一在途写请求最多 64 个，超限返回带当前容量与重试提示的 `RATE_LIMITED`，但相同 `request_id` 的超时重试仍复用原在途结果，不额外占位 |
| 传输：连接/请求洪泛或客户端停止读取 | 原生 WS 最多 32 个连接、每客户端 64/全进程 256 个在途请求、64 MiB 输入；每客户端出站队列最多 64 条且合计 128 MiB，超限断开该慢客户端，不拖累编辑器或其他 Agent |
| 适配器：MCP stdio 洪泛、生命周期违规、请求失联或宿主停止读取 | sidecar 严格执行 initialize → initialized → operation 生命周期，通知不回包，同会话请求 ID 唯一且最多记录 65,536 个；输入逐字节累计且单行最多 64 MiB，最多 128 个活动 MCP 请求和 64 个在途 Bridge RPC。请求超时会关闭对应 WS，使原生注销客户端并释放全部在途槽位；客户端主动取消则使用精确请求 ID 释放单个槽位并中止可取消的 WebView 等待，不关闭共享连接。读请求可重连，写请求用原 `requestId` 幂等恢复；资源订阅断线后按固定退避重连并统一发失效通知，单轮通知集合不超过固定资源目录。stdout 响应按序写入、64 MiB 时暂停 stdin，合计 192 MiB 时终止失去消费能力的会话，避免 Node 内部流缓冲无限增长 |
| 适配器：HTTP 被跨站调用、慢请求或网络重试 | HTTP 仅绑定 IPv4 loopback，精确校验 Host 并要求 16..256 字符 Bearer token；发现文件原子写入且仅由所属进程删除。请求体 8 MiB、响应 128 MiB、连接 128、活动请求 64，header/request/keep-alive 均有超时；写请求必须携带稳定 `requestId`，客户端断开触发精确 Bridge 取消 |
| 性能：大场景 snapshot / 高频截图 | snapshot 支持精简模式（hierarchy 不含组件）；所有位图截图默认最长边 2048（可在 256..4096 内指定），并在进程内串行且保留至少 250ms 冷却；最多保留 8 个当前/排队请求，超限明确返回 `RATE_LIMITED`；语义快照不受位图限频影响 |
| 命名漂移：camelCase vs snake_case | AgentBridge 对外统一 camelCase，边界处集中转换，避免泄漏到协议 |
| Play Mode 双事实源 | 观察/写操作明确区分 edit/play 世界，Play 下写操作按现有 store 规则处理 |
| 截图与渲染时机 | Canvas2D 在 RAF 帧内捕获；整窗使用 WebView2 渲染面，不激活窗口、不读取前台像素 |
| MCP 进程与编辑器生命周期 | sidecar 随编辑器启停；连接断开自动重连；发现文件过期清理 |

## 9. 附录

### 9.1 命令命名空间总览

```
view.*      截图、相机、frame
window.*    窗口枚举/控制
panel.*     面板枚举/聚焦/停靠
layout.*    布局
scene.*     场景快照/层级/I/O/diff
entity.*    实体生命周期/查询
component.* 组件增删改/调用
transform.* / rect.*   变换
selection.* 选择
playback.*  播放控制
history.*   撤销重做
gizmo.*     gizmo 模式
asset.*     资产
build.*     构建
menu.*      菜单命令
batch.* / intent.*   批量/意图
editor.*    编辑器全局状态
console.*   日志
commands.* / schema.*   发现
```

### 9.2 错误码

```
STALE_REVISION, ENTITY_NOT_FOUND, COMPONENT_NOT_FOUND, INVALID_ARGS,
READONLY, PERMISSION_DENIED, NOT_READY, PROJECT_NOT_OPEN, IO_ERROR, INTERNAL
```

### 9.3 与现有设施映射速查

```
写操作权威入口  → submit_editor_request (lib.rs:4608)
命令原语        → WorldCommand (components.ts:730)
进程内应用      → store.applyCommands (store.ts:1303)
意图展开        → packages/agent expandIntent
能力发现        → MenuItemEntry (registry.ts) + componentCatalog + schema.json
面板聚焦        → mengine:focus-panel (DockWorkspace.tsx:1126)
状态读取        → store.snapshot()
事件范式        → BroadcastChannel workspace.v1 + pc-build-progress
```
