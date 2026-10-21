# MEgine 性能风险待办（架构级）

> 记录日期：2026-10-21
> 状态：待办清单（含代码定位证据与建议方案，尚未实施）

## 概述

当前架构最主要的性能风险集中在三处，都是**每帧或高频地做全量操作**：

1. 编辑器每 2 秒全量扫描工程资源。
2. 脚本每读一次 `engine.snapshot`，就把整个世界序列化成 JSON。
3. 渲染提交每帧从零重建，并且一个物体一次绘制。

这些开销都会**随实体数线性增长**。Frostbound 场景约有 3,800 个实体，正好会放大这几类问题。

## 覆盖范围与免责声明

- 4 个并行分析里有 3 个因额度错误（429）中途退出。「一、编辑器与脚本桥」部分来自完成的那个子代理；「二、渲染」「三、ECS 核心」是人工读代码核实。
- **未审计**：UI（`ui.rs` 约 1.3 万行）、timeline、animation、physics。
- 渲染部分**只看了主路径**。

---

## 一、编辑器与脚本桥（影响最大）

### 1.1 每 2 秒全量扫描工程资源

- `App.tsx:1199` 用 `setInterval(check, 2000)` 调 `list_project_assets`。
- 后端递归 `read_dir`，并且每个文件都调 `ensure_asset_sidecar`，即读取并解析 `.meta`（`lib.rs:3795`）。
- 前端 diff 时 `find` 嵌套在循环里，是 O(k·n)（`projectAssets.ts:265`）。
- **正确性问题**：`lib.rs:3727` 超过 1 万个文件会静默截断，diff 可能把被截掉的文件误报为"删除"。

待办：

- [ ] 改用 `notify` 做增量文件监听，替换 2 秒全量轮询。
- [ ] `.meta` 按 mtime 缓存，避免每次扫描重复读取解析。
- [ ] 前端 diff 用 `Map` 索引替换循环内 `find`，消除 O(k·n)。
- [ ] 修复 `lib.rs:3727` 的 1 万文件静默截断（分页或去除上限），避免误报删除。

### 1.2 `engine.snapshot` 每帧全量走一遍 JSON

- `bridge.rs:233` 每个 tick 都把 JSON 缓存清掉。脚本一读，就要整世界 `serde_json::to_string`、再 clone、拷成 V8 字符串、再 `JSON.parse`，GC 压力随实体数线性增长。

待办：

- [ ] 按实体缓存 JSON 片段，或改成按 id 懒查询，避免每 tick 整世界序列化。

### 1.3 编辑后的自动恢复点代价很高

- 一次 checkpoint 会把整个世界物化 3～4 次（`project.rs:1739`、`:1748`、`:1814`），写成格式化 JSON 并同步刷盘，再把整个世界经 IPC 发回前端。

待办：

- [ ] 只同步 diff，返回值只带 revision。
- [ ] 文件写入放到后台线程，避免阻塞主流程。

### 1.4 撤销每步深拷贝整个场景

- `editorUndo.ts:19` 每次都 `structuredClone(entities)`，容量 128 步，拖拽开始和结束各拷一次。

待办：

- [ ] 改成命令式撤销（Rust 侧的 `undo.rs` 已经是这个模型）。

### 1.5 脚本命令逐条走 JSON 字符串

- 每条命令都 `JSON.stringify` 一次。`bridge.rs:127` 先尝试按 `ComponentCommand` 解析，失败再解析一次，所以非组件命令都被解析两遍。

待办：

- [ ] 每个 tick 把命令攒成一个数组一次性跨桥。
- [ ] 先看 `op` 字段再分派，保证只解析一次。

---

## 二、渲染（RHI）

### 2.1 每帧从零构建 RenderObject 列表

- `frame_compiler.rs:559`。
- 每个 `MeshRenderer` 每帧都要 `mesh.trim().replace('\\', "/")`，即新分配一个字符串，还要重新解析材质并拷贝。
- 有 root 过滤时，每个物体沿 Parent 链最多向上走 128 层。

待办：

- [ ] 缓存提取结果，只在组件 revision 变化时更新。
- [ ] 资源路径在加载时就规范化，避免每帧字符串分配。

### 2.2 空间索引在有物体移动时整棵重建

- `spatial.rs:78`。`update` 每帧都新建一个 `Vec<Option<Aabb>>` 并与上一帧整体比较，任何一个物体动了就整棵树重建。即时战略游戏里单位一直在动，等于每帧都重建。

待办：

- [ ] 静态物体和动态物体分开，或对移动的物体做增量 refit。

### 2.3 没有合批和实例化

- `renderer.rs:1770`、`:1889`。每个物体一次 `draw_indexed(.., 0..1)`，阴影和主 pass 都要逐个设置 vertex/index buffer 和 bind group。
- 每次绘制前还要构造 `MaterialTextureSetKey` 并做哈希查找。

待办：

- [ ] 按 `(mesh, material)` 分组做 instancing，同一状态下连续绘制。

### 2.4 每帧的分配与逐物体准备

- `renderer.rs:1643-1691`。`packed`、`uniform_slots` 和裁剪结果都是每帧新分配的 `Vec`，`draw_order` 还被 clone 了一份。
- 材质准备循环对每个可见物体都做 pipeline 和纹理的字符串键查找。

待办：

- [ ] 复用 `Vec`，材质状态缓存到 handle 上。

### 2.5 GPU 回读是同步阻塞的

- `renderer.rs:1519`。`device.poll(Maintain::Wait)` 会让 CPU 一直等到 GPU 做完，之后 CPU 还要逐行去掉对齐填充、做 BGRA→RGBA 交换。
- 如果编辑器视口每帧都走这条回读路径，CPU 和 GPU 就会完全串行。**调用频率尚未核实。**

待办：

- [ ] 核实回读调用频率（是否每帧）。
- [ ] 用 2～3 个回读 buffer 轮转、延迟一帧映射。
- [ ] 格式转换交给 shader 或接收端做。

---

## 三、ECS 核心

### 3.1 `get_component<T>` 是线性扫描

- `world.rs:195`。组件存放在 `HashMap<String, ComponentBox>` 里，查询时遍历全部 `values()` 逐个 `downcast_ref`，复杂度是 O(该实体的组件数)。
- runtime 里有 269 处 `get_component::<…>` 调用，热路径会被放大。

待办：

- [ ] 按 `TypeId` 建索引。
- [ ] 长期方案：改成按组件类型的稠密存储（archetype 或 SparseSet）。

### 3.2 按任一组件查询时每次新建集合

- `world.rs:349`。`entities_with_any_component` 每次调用都新建一个 `BTreeSet`，可能还要再排序一次。

待办：

- [ ] 复用集合 / 缓存查询结果，避免每次调用重建。

---

## 未覆盖（后续需补审计）

- [ ] UI（`ui.rs` 约 1.3 万行）
- [ ] timeline
- [ ] animation
- [ ] physics
- [ ] 渲染的非主路径
