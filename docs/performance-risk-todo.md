当前架构最主要的性能风险集中在三处，都是每帧或高频地做全量操作：

编辑器每 2 秒全量扫描工程资源。
脚本每读一次 engine.snapshot，就把整个世界序列化成 JSON。
渲染提交每帧从零重建，并且一个物体一次绘制。

这些开销都会随实体数线性增长。Frostbound 场景约有 3,800 个实体，正好会放大这几类问题。

覆盖范围：4 个并行分析里有 3 个因额度错误（429）中途退出。下面编辑器与脚本桥部分来自完成的那个子代理，渲染和 ECS 部分是我自己读代码核实的。UI（ui.rs 约 1.3 万行）、timeline、animation、physics 还没有审计。

一、编辑器与脚本桥（影响最大）
每 2 秒全量扫描工程资源。
App.tsx:1199 用 setInterval(check, 2000) 调 list_project_assets。
后端递归 read_dir，并且每个文件都调 ensure_asset_sidecar，即读取并解析 .meta（lib.rs:3795）。
前端 diff 时 find 嵌套在循环里，是 O(k·n)（projectAssets.ts:265）。
另有一个正确性问题：lib.rs:3727 超过 1 万个文件会静默截断，diff 可能把被截掉的文件误报为"删除"。
建议：改用 notify 做增量文件监听；.meta 按 mtime 缓存。
engine.snapshot 每帧全量走一遍 JSON。
bridge.rs:233 每个 tick 都把 JSON 缓存清掉。脚本一读，就要整世界 serde_json::to_string、再 clone、拷成 V8 字符串、再 JSON.parse，GC 压力随实体数线性增长。
建议：按实体缓存 JSON 片段，或改成按 id 懒查询。
编辑后的自动恢复点代价很高。
一次 checkpoint 会把整个世界物化 3～4 次（project.rs:1739、:1748、:1814），写成格式化 JSON 并同步刷盘，再把整个世界经 IPC 发回前端。
建议：只同步 diff，返回值只带 revision，文件写入放到后台线程。
撤销每步深拷贝整个场景。
editorUndo.ts:19 每次都 structuredClone(entities)，容量 128 步，拖拽开始和结束各拷一次。
建议：改成命令式撤销，Rust 侧的 undo.rs 已经是这个模型。
脚本命令逐条走 JSON 字符串。
每条命令都 JSON.stringify 一次。bridge.rs:127 先尝试按 ComponentCommand 解析，失败再解析一次，所以非组件命令都被解析两遍。
建议：每个 tick 把命令攒成一个数组一次性跨桥，并先看 op 字段只解析一次。
二、渲染（RHI）
每帧从零构建 RenderObject 列表（frame_compiler.rs:559）。
每个 MeshRenderer 每帧都要 mesh.trim().replace('\\', "/")，即新分配一个字符串，还要重新解析材质并拷贝。
有 root 过滤时，每个物体沿 Parent 链最多向上走 128 层。
建议：缓存提取结果，只在组件 revision 变化时更新；资源路径在加载时就规范化。
空间索引在有物体移动时整棵重建（spatial.rs:78）。
update 每帧都新建一个 Vec<Option<Aabb>> 并与上一帧整体比较，任何一个物体动了就整棵树重建。即时战略游戏里单位一直在动，等于每帧都重建。
建议：静态物体和动态物体分开，或者对移动的物体做增量 refit。
没有合批和实例化（renderer.rs:1770、:1889）。
每个物体一次 draw_indexed(.., 0..1)，阴影和主 pass 都要逐个设置 vertex/index buffer 和 bind group。
每次绘制前还要构造 MaterialTextureSetKey 并做哈希查找。
建议：按 (mesh, material) 分组做 instancing，同一状态下连续绘制。
每帧的分配与逐物体准备（renderer.rs:1643-1691）。
packed、uniform_slots 和裁剪结果都是每帧新分配的 Vec，draw_order 还被 clone 了一份。
材质准备循环对每个可见物体都做 pipeline 和纹理的字符串键查找。
建议：复用 Vec，材质状态缓存到 handle 上。
GPU 回读是同步阻塞的（renderer.rs:1519）。
device.poll(Maintain::Wait) 会让 CPU 一直等到 GPU 做完，之后 CPU 还要逐行去掉对齐填充、做 BGRA→RGBA 交换。
如果编辑器视口每帧都走这条回读路径，CPU 和 GPU 就会完全串行。调用频率我还没核实。
建议：用 2～3 个回读 buffer 轮转、延迟一帧映射；格式转换交给 shader 或接收端做。
三、ECS 核心
get_component<T> 是线性扫描（world.rs:195）。
组件存放在 HashMap<String, ComponentBox> 里，查询时遍历全部 values() 逐个 downcast_ref，复杂度是 O(该实体的组件数)。
runtime 里有 269 处 get_component::<…> 调用，热路径会被放大。
建议：按 TypeId 建索引，长期方案是改成按组件类型的稠密存储（archetype 或 SparseSet）。
按任一组件查询时每次新建集合（world.rs:349）。
entities_with_any_component 每次调用都新建一个 BTreeSet，可能还要再排序一次。
建议的优先顺序

先做第 1、2、3、10 条，改动小、收益最明显。再做第 6～9 条，即渲染提交的缓存加实例化。第 11 条是架构级改动，涉及 ECS 存储方式，最后安排。

还有一点：现在只有逐阶段的耗时统计（submission_profile 和 compile 里的 phase），没有 Frostbound 的实测数据，所以上面的排序是基于代码结构推断的。建议先用现有的分阶段计时跑一次大场景，把数据放到 tmp/docs-artifacts/ 下，再按数据确认优先级。

额度恢复后，我可以继续审计 UI、timeline、animation、physics 这几块。