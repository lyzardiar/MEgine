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
| Agent 雏形 | `packages/agent/src/index.ts`：`Intent → validateIntent → expandIntent → WorldCommand[]` | 已有意图层，但仅 4 个 intent，且未接编辑器 |
| World facade | `@mengine/api` `World` 类（`index.ts:40`），注释明确「used by game scripts, editor, and AI agents」 | 官方认可的 Agent 接入面 |
| 菜单注册表 | `MenuItemEntry`（`editorWindow/registry.ts:30`）：path/label/priority/shortcut/validate/action | 数据驱动、可自描述的命令目录 |
| 组件目录 | `componentCatalog.ts`：type/label/description/create()/requires | 组件可发现性 |
| 组件 schema | `inspectorMetadata.ts`（InspectorFieldMeta）+ `behaviour` 的 `FieldMeta` + 生成的 `schema.json` | 属性级类型/范围/枚举/条件，Agent 可知「能填什么」 |
| 面板聚焦 | `mengine:focus-panel` 事件（`DockWorkspace.tsx:1126`） | 现成的「打开/聚焦面板」程序化入口 |
| 状态快照 | `store.snapshot(): WorldSnapshotView & {selectedIds}` | 完整世界读取 |
| 多窗口同步 | BroadcastChannel `mengine.editor.workspace.v1`（`App.tsx`） | 全量状态复制协议，可作事件流参考 |
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
                │ MCP(stdio)                   │ WS / HTTP / CLI(后续)
        ┌───────▼────────┐            ┌────────▼─────────┐
        │  MCP Adapter    │            │  WS/HTTP Adapter  │
        │  (Node sidecar) │            │  (后续阶段)        │
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

- 监听 `127.0.0.1` 自动分配端口，端口号写入发现文件（如 `<project>/.mengine/agent-bridge.json`），供适配器发现。
- 下行：WS 消息 → Tauri event `agent-bridge:request` 转发给 webview。
- 上行：webview 通过 Tauri command `agent_bridge_respond` / `agent_bridge_emit` 回传，Rust 按 `request_id` 路由给对应 WS 客户端。
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
  "method": "execute" | "query" | "subscribe" | "unsubscribe",
  "params": {
    "command": "scene.set_transform",     // execute 时
    "args": { "entity": 12, "position": [0, 1, 0] },
    "query": "editor.screenshot",          // query 时
    "topic": "scene.changed"               // subscribe 时
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
| `view.screenshot` | `{ target?: "scene"\|"game"\|"window"\|"panel", panel?, format?: "png"\|"jpeg", quality?, maxSize? }` | `{ dataUrl, width, height, mime }` | 视口（scene/game）：`Viewport.tsx` 的 `canvasRef`（line 522）`canvas.toDataURL()`，**当前唯一已验证可靠路径**；整窗：Tauri 2.11.5 无原生截图 API，列为后续增强（Windows GDI `BitBlt` 取 RGBA 后经 canvas 编码，或升级 Tauri 版本） |
| `view.screenshot_to_file` | `{ path, target? }` | `{ path, width, height }` | 同上，写入磁盘供 Agent 读取 |
| `view.capture_region` | `{ x, y, w, h, target? }` | `{ dataUrl }` | canvas 裁剪 |

说明：当前 Scene/Game 视口是 Canvas2D（`Viewport.tsx` `getContext('2d')`，line 766），`toDataURL` 即可稳定截取，无 WebGL `preserveDrawingBuffer` 顾虑，这是 Phase 1 落地的主路径。**整窗截图**（含面板）经核实 Tauri 2.11.5 并无原生截图 API，列为后续增强：可在 Windows 上用 GDI `BitBlt`/`PrintWindow` 抓取窗口 RGBA（项目已依赖 `windows-sys`），再交由 webview canvas 编码为 PNG。**前向兼容**：本地编辑器方案规划了「Rust 进程内原生 wgpu Surface」的真实 Scene View，届时视口不再是 DOM canvas，`toDataURL` 会失效——需改用 wgpu 纹理回读或未来 Tauri 版本的截图 API。因此 `view.screenshot` 必须是一个抽象接口，内部按当前渲染后端选择实现，对 Agent 暴露统一签名。

#### 4.1.2 窗口与面板枚举（用户明确提出）

| query id | 返回 | 集成点 |
| --- | --- | --- |
| `window.list` | `[{ label, title, typeId?, kind: "main"\|"panel"\|"editor", focused, position, size, url }]` | Rust `app.webview_windows()`（当前未用）或 JS `WebviewWindow.getAll()`；标签规则 `panel-<id>`（`detachedPanelWindow.ts`）、`editor-<hash>`（`nativeEditorWindow.ts`） |
| `panel.list` | `[{ kind, title, visible, active, detached, dockPath }]` | `DockWorkspace` 的 dock tree + `PanelKind`（15 种，`detachedPanelWindow.ts:5`） |
| `panel.get_layout` | dock 二叉树（leaf/split） | `localStorage['mengine.dock.layout.v4']` 对应的内存树 |
| `window.get_active` | 当前聚焦窗口信息 | `WebviewWindow` focus 状态 |

#### 4.1.3 场景与层级读取

| query id | 参数 | 返回 |
| --- | --- | --- |
| `scene.snapshot` | `{ overlay?: bool }` | 完整 `WorldSnapshotView`（实体 + 组件 + frame + clearColor） |
| `scene.hierarchy` | `{ depth?, filter? }` | 精简树 `[{ id, name, active, icon, children }]` |
| `entity.get` | `{ id }` 或 `{ name }` | 单个实体完整记录（含组件） |
| `entity.find` | `{ name?, component?, active? }` | 匹配的实体列表 |
| `entity.get_component` | `{ id, component }` | 指定组件数据 |
| `scene.get_meta` | — | `{ name, path, dirty, objectCount, mode, gizmo, sceneCamera, gameResolution }` |

集成点：`store.snapshot()`、`store.getVisibleFlat()`、`store.authoredEntities()`。

#### 4.1.4 选中与编辑器状态

| query id | 返回 |
| --- | --- |
| `selection.get` | `{ selected, selectedIds }` |
| `editor.state` | `{ mode, gizmo, pivotMode, handleOrientation, canUndo, canRedo, undoLabel, redoLabel, dirty, sceneName }` |
| `editor.get_camera` | `sceneCamera { yaw, pitch, distance, pivot }` |

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
| `asset.list` | `ProjectAssetInfo[]` | `list_project_assets` |
| `scene.list` | `ProjectSceneInfo[]` | `list_project_scenes` |
| `sprite.list` | `ProjectSpriteInfo[]` | `list_project_sprites` |

### 4.2 可操作性（Controllability）—— 让 Agent「动手」

所有写命令统一经 Dispatcher。**关键约束：写操作必须走与 UI / 菜单完全相同的路径——调用 `EditorStore` 方法**（菜单命令经 `MenuItemContext.store` 调用，快捷键直接调用），再由 store 内部经 `desktopProjectSession` 串行队列与 Rust `submit_editor_request` 同步。AgentBridge 绝不绕过 store 直接写 Rust，否则会制造第三个事实源——本地编辑器方案已明确「React Store 与 Rust Session 双事实源」是要消除的问题。命令返回 `{ ok, revision, data }`。

#### 4.2.1 实体生命周期

| command id | 参数 | 映射 |
| --- | --- | --- |
| `entity.create` | `{ name?, components?, parent? }` | `store.createGameObject` |
| `entity.create_typed` | `{ kind: "cube"\|"camera"\|"light"\|"ui_button"\|..., parent? }` | 对应 `store.spawn*` |
| `entity.delete` | `{ ids[] }` | `store.deleteSelection`（先选中）或命令批 |
| `entity.duplicate` | `{ ids[] }` | `store.duplicateSelection` |
| `entity.rename` | `{ id, name }` | `store.rename` |
| `entity.set_active` | `{ id, active }` | `store.setActive` |
| `entity.reparent` | `{ ids[], parent, index? }` | `store.setParent` |
| `entity.reorder` | `{ id, index }` | `store.reorderSibling` |

#### 4.2.2 组件操作

| command id | 参数 | 映射 |
| --- | --- | --- |
| `component.add` | `{ entity, type, value? }` | `store.addComponent`（自动补 RequireComponent） |
| `component.remove` | `{ entity, type }` | `store.removeComponent` |
| `component.set` | `{ entity, type, value }` | `store.setComponent` |
| `component.patch` | `{ entity, type, patch }` | `store.patchComponent` |
| `component.invoke` | `{ entity, type, method }` | `store.invokeBehaviourMethod`（@Button 方法） |

#### 4.2.3 Transform 与 UI

| command id | 参数 | 映射 |
| --- | --- | --- |
| `transform.set` | `{ entity, position?, rotation?, scale? }` | `store.setTransform` |
| `transform.translate` | `{ entity, delta }` | `store.translateBy` |
| `rect.set` | `{ entity, anchoredPosition?, sizeDelta?, pivot?, anchors? }` | `store.setRectPivot/setRectAnchors/...` |

#### 4.2.4 选择 / 播放 / 历史

| command id | 参数 | 映射 |
| --- | --- | --- |
| `selection.set` | `{ ids[], mode? }` | `store.selectMany` |
| `selection.reveal` | `{ id }` | `store.revealEntity`（Ping） |
| `playback.play` / `pause` / `stop` / `step` | — | `store.play/pause/stop/tick` |
| `history.undo` / `redo` | — | `store.undo/redo` |
| `view.frame_selected` | — | `store.frameSelected` |
| `view.set_camera` | `{ yaw?, pitch?, distance?, pivot? }` | `store.setSceneCamera` |
| `gizmo.set` | `{ mode }` | `store.setGizmo` |

#### 4.2.5 场景 I/O

| command id | 参数 | 映射 |
| --- | --- | --- |
| `scene.new` | `{ name }` | `store.newScene` + 持久化 |
| `scene.open` | `{ name }` | `openSceneByName` |
| `scene.save` / `save_as` | `{ name? }` | `persistScene` |
| `scene.load_json` | `{ json }` | `store.loadSceneJson` |

#### 4.2.6 面板 / 窗口 / 菜单

| command id | 参数 | 映射 |
| --- | --- | --- |
| `panel.focus` | `{ kind }` | dispatch `mengine:focus-panel` |
| `panel.detach` / `dock` | `{ kind }` | `detachedPanelWindow` |
| `layout.reset` | — | dispatch `mengine:reset-dock-layout` |
| `window.open_editor` | `{ typeId }` | `EditorWindow.show` / `openNativeEditorWindow` |
| `menu.invoke` | `{ path }` | 查 `MenuItemEntry` 并 `entry.action(ctx)` |

#### 4.2.7 资产与构建

| command id | 映射 |
| --- | --- |
| `asset.read` / `write` / `rename` / `duplicate` / `trash` / `restore` | 对应 Tauri 资产命令 |
| `build.pc_player` / `build.cancel` / `build.run` | `build_pc_player` / `cancel_pc_build` / `run_pc_player` |

#### 4.2.8 批量与事务

| command id | 参数 | 说明 |
| --- | --- | --- |
| `batch.apply` | `{ commands: WorldCommand[] }` | 走 `submit_editor_request` 的 `ApplyBatch{forward, inverse}`，单 undo 事务 |
| `intent.apply` | `{ intent }` | 复用 `packages/agent` 的 `validateIntent + expandIntent`，把高层意图展开为命令批 |

### 4.3 可发现性（Discoverability）—— 让 Agent「知道能做什么」

| query id | 返回 | 集成点 |
| --- | --- | --- |
| `commands.list` | `[{ id, category, description, paramsSchema, readOnly, dangerous }]` | 命令注册表（Dispatcher 内建） |
| `commands.describe` | `{ id }` → 完整 schema | 同上 |
| `schema.components` | 所有组件 `{ type, label, description, fields[], requires[] }` | `componentCatalog` + `inspectorMetadata` + `behaviour.FieldMeta` + `schema.json` |
| `schema.component` | `{ type }` → 字段级 schema（类型/范围/枚举/条件/资产引用） | 同上 |
| `menu.list` | 菜单树（含 path/label/shortcut/enabled） | `listMenuItems` 各 root |
| `intents.list` | 支持的高层意图清单 | `packages/agent` |

这是「自描述」的关键：Agent 先调 `commands.list` 和 `schema.components`，就能动态知道能做什么、每个组件能填什么字段，无需人工硬编码。MCP 的 `tools/list` 直接由 `commands.list` 生成。

### 4.4 反馈与验证（Feedback & Verification）—— 让 Agent「确认结果」

| 能力 | 说明 |
| --- | --- |
| 命令结果 | 每个写命令返回 `{ ok, revision, data }`，data 含受影响实体/新状态摘要 |
| 操作后自动截图 | 写命令可带 `options.screenshot: true`，结果里附 `screenshot` 字段，形成「改→看」视觉闭环 |
| 状态 diff | `query: scene.diff({ fromRevision })` 返回自某 revision 起的实体增删改 |
| 事件订阅 | `subscribe` 主题：`scene.changed` / `selection.changed` / `mode.changed` / `log.added` / `panel.changed` / `build.progress` / `asset.changed` |
| 结构化错误 | 错误码：`STALE_REVISION` / `ENTITY_NOT_FOUND` / `COMPONENT_NOT_FOUND` / `INVALID_ARGS` / `READONLY` / `PERMISSION_DENIED` / `NOT_READY` |

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
get_scene_snapshot, get_hierarchy, get_selection, get_editor_state,
get_entity, get_component, get_console_logs, list_windows, list_panels,
take_screenshot, list_assets, list_scenes, get_component_schema, list_commands
```

写 tools（Phase 2）：

```
create_gameobject, delete_entities, duplicate_entities, rename_entity,
set_active, reparent, add_component, remove_component, set_component,
patch_component, set_transform, set_selection, play, pause, stop, step,
undo, redo, save_scene, open_scene, new_scene, focus_panel, open_editor_window,
invoke_menu, apply_batch, apply_intent
```

每个 tool 的 `inputSchema` 直接来自命令注册表的 `paramsSchema`（JSON Schema），保证 MCP 客户端能正确校验参数。

### 5.3 Resources（只读上下文）

```
mengine://editor/state          当前编辑器状态
mengine://scene/snapshot        当前场景快照
mengine://scene/hierarchy       层级树
mengine://schema/components     全部组件 schema（供 Agent 理解可填字段）
mengine://commands              命令目录
mengine://console/logs          控制台日志
```

### 5.4 Prompts（可选工作流模板）

```
create_ui_button      「创建一个可点击的 UI 按钮并绑定回调」
setup_3d_scene        「搭建一个含相机、灯光、立方体的基础 3D 场景」
inspect_and_fix       「截图当前场景，检查并修复选中物体的问题」
```

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

## 6. 关键集成点（落到代码）

| 能力 | 文件 / 位置 | 改造内容 |
| --- | --- | --- |
| 视口截图 | `src/panels/Viewport.tsx`（`canvasRef` line 522） | 暴露 `captureCanvas(): dataUrl`（`canvas.toDataURL`），由 Observer 调用——当前主路径 |
| 整窗截图 | （后续增强）`src-tauri/src/lib.rs` | Tauri 2.11.5 无原生截图 API；后续用 Windows GDI `BitBlt` 取 RGBA 经 canvas 编码，无需 capability 改动 |
| 窗口枚举 | `src-tauri/src/lib.rs` | ✅ 已实现 `list_editor_windows`（`app.webview_windows()`，按 label 分类 main/panel/editor） |
| 面板枚举 | `src/panels/DockWorkspace.tsx` | 导出当前 dock tree 与面板状态查询函数 |
| 命令调度 | 新增 `src/agent/AgentBridge.ts` + `src/agent/commands.ts` | 命令注册表 + Dispatcher，映射到 store / 菜单 / 面板 |
| 状态观察 | 新增 `src/agent/observer.ts` | 聚合 snapshot / 截图 / 窗口 / 日志 / schema |
| 结构化日志 | `src/App.tsx` `logs[]` → 新增 `src/agent/LogService.ts` | level/time/source/message，替换字符串数组 |
| Bridge 传输 | `src-tauri/src/lib.rs` | 引入 `tokio-tungstenite` 本地 WS 服务器 + 消息路由 + 发现文件 |
| MCP 适配 | `packages/agent/src/mcp/` | MCP stdio server，WS 客户端连 Bridge |
| 意图层扩展 | `packages/agent/src/index.ts` | 从 4 个 intent 扩展，接 Dispatcher |
| 命名统一 | `src/agent/protocol.ts` | AgentBridge 对外统一 camelCase，内部按需转换 snake_case |

## 7. 分阶段路线图

### Phase 1 —— 感官层（只读，零风险）

目标：让 Agent 能「看见」和「摸清」编辑器。

- AgentBridge Core 骨架（Observer + 命令注册表只读部分）
- 截图：`view.screenshot`（视口 canvas，主路径）；整窗截图列为后续增强
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

- `commands.list` / `schema.components` / `menu.list` 自描述
- 操作后自动截图 + `scene.diff`
- EventBus 事件订阅（scene/selection/mode/log/build/asset）
- MCP resources/prompts 完善

验收：Agent 仅凭 `commands.list` + `schema.components` 即可自主探索能力；写操作后能拿到截图与 diff 自我验证。

### Phase 4 —— 扩展传输层

目标：覆盖更多接入场景。

- WebSocket 直连适配器（自研 agent / 浏览器脚本）
- HTTP REST 适配器（curl / 简单集成）
- CLI（`mengine-cli execute scene.snapshot`）
- 权限与危险操作确认机制完善

验收：同一内核经 WS/HTTP/CLI 均可驱动，行为一致。

## 8. 风险与注意事项

| 风险 | 应对 |
| --- | --- |
| 安全：本地端口被其它进程调用 | 仅绑定 127.0.0.1；发现文件含随机 token，连接需校验；危险命令（删除/构建）可配置确认 |
| 并发：多客户端同时写 | 复用 `base_revision` 乐观锁；冲突返回 `STALE_REVISION` |
| 性能：大场景 snapshot / 高频截图 | snapshot 支持精简模式（hierarchy 不含组件）；截图支持 maxSize 缩放与频率限制 |
| 命名漂移：camelCase vs snake_case | AgentBridge 对外统一 camelCase，边界处集中转换，避免泄漏到协议 |
| Play Mode 双事实源 | 观察/写操作明确区分 edit/play 世界，Play 下写操作按现有 store 规则处理 |
| 截图与渲染时机 | Canvas2D 在 RAF 帧内捕获，确保取到最新帧 |
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
