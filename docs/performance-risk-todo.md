# 性能风险与实施进度

2026-10-23：完成编辑器资源轮询、撤销历史、自动恢复点和脚本快照桥的第一阶段优化。保留 Rust + TypeScript + Tauri 技术栈。下列基准来自 Frostbound 3,812 实体场景或注明的压力数据，不能换算成实际游戏 FPS。

## 已完成

- [x] 工程资源增量索引。原生 `project_asset_index.rs` 使用 `notify`，Vite 开发服务使用 Node `fs.watch`。首次加载、主动刷新全扫，普通轮询只重读文件事件涉及的路径；空闲响应仅携带版本，前端不再解析完整资源列表或做 diff。移除工程资源索引的 10,000 条静默截断，扫描失败保留上一份完整索引。覆盖目录移动、Assets 删除重建、项目切换和 `.meta`/GUID 变化；前端确认写入的查找改为 Map。
- [x] 撤销历史共享不变实体。`captureEditorUndoState` 比较相邻快照，仅深拷贝变化实体；恢复仍深拷贝，避免编辑中的对象污染历史。拖拽开始只捕获一次；保留嵌套拖拽、取消、redo 和 128 步淘汰。服务检查点使用不暴露历史对象的 opaque handle，内部 WeakMap 保存栈。
- [x] 自动恢复点缩小响应并移入工作线程。`checkpoint_snapshot` 返回 revision、dirty、恢复点信息，不回传世界；恢复文件使用紧凑 JSON，保持原子替换和持久化写入。Tauri 使用 `spawn_blocking`，在同一项目锁内保证顺序。校验项目、场景及 revision；前端排队时校验场景 generation，普通同场景保存不会误丢随后编辑。canonical 世界按需取回，失败也使旧缓存失效。
- [x] 脚本快照按实体缓存 JSON 片段。以 Arc/Weak 身份识别不变实体，多数实体变化时直接全量序列化；稳定后预热片段。每帧元数据和 JS 对象保持独立，删除实体及注入世界会清理缓存。V8、QuickJS 使用相同语义。
- [x] 规范 op-first 非组件脚本命令不再尝试两次反序列化；保留大组件数组与任意字段顺序的兼容解析。

## 性能实测

| 工作负载 | 原实现 | 当前实现 | 测量范围 |
| --- | ---: | ---: | --- |
| 10,025 资源，完整扫描与空闲查询 | 1,743.978 ms | 0.000102 ms/次 | 本机原生目录；1,000 次空闲查询，无资产 payload；不含 IPC |
| 3,812 实体，128 步单实体编辑的历史捕获 | 1,858.85 ms | 498.02 ms | Node，3 次独立进程中位数 |
| 同一历史的保留堆 | 464,655,744 bytes | 7,668,952 bytes | 强制 GC 后；不代表编辑器总内存 |
| 同一历史的实体副本 | 487,936 | 3,939 | 不变实体共享；恢复约 13 ms |
| 3,812 实体自动恢复点 | 194.95 ms | 99.52 ms | Rust test profile，CPU、持久化写盘及响应序列化；不含请求 IPC/UI |
| 自动恢复点响应大小 | 2,707,712 bytes | 209 bytes | 同场景，恢复后的世界一致 |
| 恢复文件大小 | 5,607,758 bytes | 2,707,344 bytes | 紧凑 JSON |
| V8 静态场景快照，native + VM | 14.45 ms | 6.93 ms | 作者场景快照，包含 VM 解析；不含游戏逻辑、渲染、IPC |
| V8，322 个单位/UI 合成运动 | 14.84 ms | 8.68 ms | 同上 |
| QuickJS 静态场景快照，native + VM | 25.90 ms | 18.20 ms | 同上 |
| QuickJS，322 个单位/UI 合成运动 | 25.64 ms | 19.39 ms | 同上 |

压力测试的取舍：20,000 实体静态 native JSON，V8 从 59.35 降到 5.80 ms；全部实体每帧变化时从 59.78 到 63.12 ms，仍有约 5.6% 身份维护开销。QuickJS 对应静态 59.43→5.71 ms、全动态 57.94→61.01 ms。缓存额外保存实体 JSON，不延长旧实体 payload 寿命；完整字符串复制与 VM `JSON.parse` 仍存在。

资源索引在真实变化后仍重建重复 GUID 视图、发送完整列表；独立 sprite 发现路径的数量上限尚未改变。恢复点仍上传完整世界，仍需比较/重建世界和持有项目锁，尚未改成增量协议。撤销捕获仍遍历并比较实体，恢复仍全量复制。

## 验证与复现

- `npm.cmd run build:editor`：TypeScript 与前端构建通过。
- `cargo test -p mengine-editor-host --lib`：60 通过、5 个手动基准忽略；其中恢复相关测试 4 通过。
- `cargo test -p mengine-editor-tauri --lib project_asset_index -- --nocapture`：3 通过，覆盖真实文件监听、大目录、扫描失败和项目切换。
- 编辑器历史、恢复点、播放历史保护、重设父级及选择恢复：24 通过。资源变化、资源信息及 Agent 资源 IO：17 通过；真实 Vite HTTP + 10,025 文件监听：1 通过。
- 脚本桥 V8 库测试 39 通过，`runtime_limits` 2 通过；QuickJS 库测试 39 通过。两种 VM 各 3 个手动基准通过。仓库现有 `frost_traffic`/`frost_ground_cache` 集成测试直接引用可选 `rquickjs`，默认 V8 全目标测试仍有编译问题，本阶段未修改这些测试。
- 基准命令：`node --expose-gc scripts/benchmark-editor-undo.mjs after`；`cargo test -p mengine-editor-host --lib benchmark_recovery_checkpoint -- --ignored --nocapture`；`cargo test -p mengine-script --lib benchmark_ -- --ignored --nocapture --test-threads=1`。QuickJS 增加 `--no-default-features --features quickjs-runtime`。
- 原生构建：`cargo build -p mengine-editor-tauri --release --features custom-protocol`。本机首次下载 V8 失败，使用缓存的 v152.2.0 Windows x64 Release 静态库完成构建。配套 SDK 使用 `node scripts/prepare-editor-build-sdk.mjs` 构建。
- 原生集成脚本：设置 `MENGINE_EDITOR_EXECUTABLE` 为新构建 EXE，`MENGINE_BUILD_SDK` 为配套 SDK，然后运行 `node scripts/qa-editor-performance-risk.mjs`。脚本创建独立项目副本，测试真实恢复文件、undo/redo、外部资源增改删和 Play/Pause/Step/Stop，并采集 Scene/Game profiler。

原生 Release 集成已通过，最后一轮使用 EXE 旁的配套 SDK，无环境覆盖：3,812 实体重命名、undo/redo、真实恢复文件、外部资源增改删、Play/Pause/Step/Stop、停止后的编辑状态恢复均通过，控制台无 error，作者场景 SHA-256 不变。QA 编辑器正常退出；部分 WebView 缓存目录因 EPERM 保留在临时产物目录。

预热后的 3D Scene 相机移动采集 12 个 native 帧，去除前 2 个后中位数：viewport 总计 4.23 ms、GPU 回读 2.71 ms（其中 map wait 2.18 ms、RGBA 行转换 0.43 ms）、帧编译 0.38 ms、绘制提交 0.56 ms。数据来自单机编辑视角，用于确定下一阶段优先级，不是连续播放 FPS，也没有原版本同场景的原生帧对照。外部资源变化到 UI 通知实测约 1.64/5.43/9.25 秒（增/改/删），仍包含变化后的列表更新和前端工作，不能用空闲索引微基准代替交互延迟。

所有原始数据、构建/测试日志及隔离 QA 项目保存在 `tmp/docs-artifacts/editor-performance-risk/`，不提交。主要文件：`undo-before.json`、`undo-after.json`、`recovery-benchmark.log`、`asset-index-native.json`、`asset-index-web.json`、`script-bridge-benchmarks.json`、`native-editor-qa.json`。

## 后续风险

- [ ] **编辑器 3D Scene 的同步 GPU 回读。** 已核实调用链：Tauri `render_native_scene_view` → `EditorViewportRenderer::render_scene` → 非 Window 目标的 `read_offscreen_rgba8_profiled` → `device.poll(Maintain::Wait)`。该链路用于 WebView Scene 展示，独立 Window 输出不走这条回读。后续评估 2～3 个 buffer 轮转、延迟映射，覆盖画面版本、资源生命周期、选择/拖拽和截图一致性。
- [ ] **RenderObject 每帧重新提取。** `frame_compiler.rs` 重复规范化 mesh 路径、解析材质、复制字段；root 过滤会反复沿 Parent 链查找。评估按组件 revision 缓存与加载时路径规范化。
- [ ] **空间索引移动后整树重建。** `spatial.rs` 每帧构造并比较 bounds，任意单位移动触发重建。根据实测选择静态/动态分离或增量 refit。
- [ ] **逐物体绘制及准备。** `renderer.rs` 主 pass/阴影 pass 缺少通用实例化，重复状态设置与材质哈希查找；临时 Vec 和 draw order 可复用。先测量 draw call 与准备时间，再实施 mesh/material 分组。
- [ ] **ECS 查询。** `get_component<T>` 遍历实体的组件 values 并 downcast；`entities_with_any_component` 每次建立 BTreeSet。先考虑 TypeId 索引与集合复用；稠密组件存储属于后续架构变更。
- [ ] **命令跨桥批处理。** 本阶段仅减少非组件解析次数，未改变逐条 stringify/跨桥协议。
- [ ] **UI、timeline、animation、physics 性能审计。** 尚未完成，不能据本阶段数据排除这些模块的开销。

下一阶段优先分析原生 Scene 的渲染与回读采样，按真实帧耗时选择实施项；ECS 存储重构单独安排。
