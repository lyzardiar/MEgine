# 性能风险与实施进度

2026-10-23：完成编辑器资源轮询、撤销历史、自动恢复点和脚本快照桥的第一阶段优化，资源刷新合并、组件查询、空间索引和共享材质提取的第二阶段优化，以及视口 GPU 回读流水线的第三阶段实现。保留 Rust + TypeScript + Tauri 技术栈。下列基准来自 Frostbound 3,812 实体场景或注明的压力数据，不能换算成实际游戏 FPS。

## 已完成

- [x] 工程资源增量索引。原生 `project_asset_index.rs` 使用 `notify`，Vite 开发服务使用 Node `fs.watch`。首次加载、主动刷新全扫，普通轮询只重读文件事件涉及的路径；空闲响应仅携带版本，前端不再解析完整资源列表或做 diff。移除工程资源索引的 10,000 条静默截断，扫描失败保留上一份完整索引。覆盖目录移动、Assets 删除重建、项目切换和 `.meta`/GUID 变化；前端确认写入的查找改为 Map。
- [x] 撤销历史共享不变实体。`captureEditorUndoState` 比较相邻快照，仅深拷贝变化实体；恢复仍深拷贝，避免编辑中的对象污染历史。拖拽开始只捕获一次；保留嵌套拖拽、取消、redo 和 128 步淘汰。服务检查点使用不暴露历史对象的 opaque handle，内部 WeakMap 保存栈。
- [x] 自动恢复点缩小响应并移入工作线程。`checkpoint_snapshot` 返回 revision、dirty、恢复点信息，不回传世界；恢复文件使用紧凑 JSON，保持原子替换和持久化写入。Tauri 使用 `spawn_blocking`，在同一项目锁内保证顺序。校验项目、场景及 revision；前端排队时校验场景 generation，普通同场景保存不会误丢随后编辑。canonical 世界按需取回，失败也使旧缓存失效。
- [x] 脚本快照按实体缓存 JSON 片段。以 Arc/Weak 身份识别不变实体，多数实体变化时直接全量序列化；稳定后预热片段。每帧元数据和 JS 对象保持独立，删除实体及注入世界会清理缓存。V8、QuickJS 使用相同语义。
- [x] 规范 op-first 非组件脚本命令不再尝试两次反序列化；保留大组件数组与任意字段顺序的兼容解析。

- [x] 资源变化后的刷新合并。本窗口监听事件直接复用已发布索引，远端/内部事件共享一次扫描；脚本列表读取项目元数据，取消完整世界快照请求。Project 只在纹理/切片依赖变化时重新发现精灵。旧刷新不能覆盖较新的轮询结果或新项目，主动刷新仍强制扫描。
- [x] 空间索引增量 refit。移动只更新所属节点和祖先的内容 bounds；增删、已知/未知 bounds 转换及空间质量退化时重建。保留深度上限和原始物体顺序，未知 bounds 保持可见。
- [x] 内建组件 TypeId 索引。仅对确认具有稳定 Any 类型的生成组件和 Parent/Children 使用直接查找；自定义组件保留逐项查找，兼容运行中改变投影视图、同名替换和实体槽复用。成功的可写访问仍推进实体 revision。
- [x] 同次 mesh 提取复用共享材质。缓存仅限本次提取，逐物体覆盖作用于副本；下一帧仍经过既有材质热更新检查。mesh 路径和完整 RenderObject 尚未跨帧缓存。

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

## 第二阶段 CPU 基准

| 工作负载 | 第一阶段实现 | 第二阶段实现 | 测量范围 |
| --- | ---: | ---: | --- |
| 20k bounds，1% 移动，更新 + 3 次查询 | 1.2819 ms | 0.2937 ms | 3 次交错进程基准中位数，逐项核对查询结果 |
| 20k bounds，全量移动，更新 + 3 次查询 | 1.2998 ms | 0.4038 ms | 同上 |
| Frostbound 每实体 15 次混合组件读写，57,180 次查询 | 1.2522 ms | 0.9665 ms | Release，9 组样本中位数 |
| 20k 实体、40k 组件插入 | 8.7612 ms | 8.9451 ms | 类型索引维护增加约 0.184 ms |
| Frostbound 作者场景，65 个 mesh 材质提取 | 0.1173 ms | 0.0568 ms | Release，同进程交错运行，9 组样本中位数 |
| 全部对象池激活，1,381 个 mesh 材质提取 | 2.1969 ms | 1.0468 ms | 同上，输出对象逐项一致 |

空间索引保留容量从约 0.94 增至 1.30 MB（20k，不含分配器开销）；同一静止负载总耗时 0.2529→0.2740 ms，增加约 0.021 ms。更新仍比较全部输入 bounds，大范围瞬移仍可能触发重建。上述 CPU 数据不代表真实游戏 FPS。

第二阶段验证：编辑器资源相关测试 26 通过、前端构建通过；最终 core 24 通过、2 个手动基准忽略，查询基准另行通过。串行 Release 库测试 RHI 72、runtime 232、scene 25 通过（RHI/runtime 各忽略 1 个手动基准），包含 GPU 相机/阴影可见集合、mesh bounds 更新、独立材质覆盖和热更新。core 后续补充自定义组件初始 self 视图再切换投影的兼容回归；原生集成使用最终版本。首次并行 RHI 全套测试以 Windows STATUS_HEAP_CORRUPTION 退出，串行全套通过；未将该异常视为已定位修复。

复现：`cargo test -p mengine-core --release`；`cargo test -p mengine-runtime -p mengine-rhi -p mengine-scene --release --lib -- --test-threads=1`；CPU 基准分别筛选 `benchmark_component_type_lookup`、`benchmark_moving_spatial_updates`、`benchmark_mesh_material_extraction` 并增加 `-- --ignored --nocapture`。原始证据保存于同一临时目录：`core-component-benchmark.log`、`spatial-comparison.json`、`mesh-material-benchmark.log`、`phase2-integration-serial-tests.log`。

## 第二阶段原生编辑器对照

使用同一 Release QA 脚本、Frostbound 隔离副本和 EXE 旁配套 SDK，前后均通过 3,812 实体编辑、undo/redo、真实恢复文件、资源增改删、进入真实对局、Play/Pause/Step/Stop 和停止后的编辑状态恢复；无 console error，源场景 SHA-256 不变。两轮各采 12 个预热 native 帧，去前 2 个，对余下 10 个取中间两项平均。

| 原生观察项 | 第一阶段 | 第二阶段 |
| --- | ---: | ---: |
| 外部资源新增通知 | 1.13 s | 1.94 s |
| 外部资源修改通知 | 5.50 s | 1.92 s |
| 外部资源删除通知 | 9.26 s | 1.91 s |
| Scene viewport 总耗时中位数 | 4.17 ms | 3.65 ms |
| Scene 帧编译中位数 | 0.408 ms | 0.283 ms |
| 对局 viewport 总耗时中位数 | 15.23 ms | 14.27 ms |
| 对局帧编译中位数 | 3.99 ms | 2.93 ms |
| 对局 mesh/材质提取中位数 | 1.97 ms | 1.48 ms |

资源通知仍采用两秒轮询，单次新增延迟受轮询相位影响；主要收益是后续修改/删除不再积压。Game 的 GPU 回读仍约 5.11→5.26 ms，mesh 同步约 2.09→2.36 ms，尚未优化；整体采样包含 GPU/运行状态波动，不据此承诺 FPS 增幅。QA 创建的编辑器正常退出，部分 WebView 缓存因 EPERM 保留在临时目录。

构建日志：`phase2-editor-build.log`、`phase2-sdk-build.log`、`phase2-native-build.log`；原生证据：`phase2-before.json`、`phase2-after.json`、`phase2-comparison.json`。复现时设置 `MENGINE_EDITOR_EXECUTABLE` 和可选 `MENGINE_PERFORMANCE_LABEL`，运行 `node scripts/qa-editor-performance-risk.mjs`。下一阶段继续处理 GPU 回读的帧归属、mesh 来源校验和纹理同步开销。

## 第三阶段视口 GPU 回读流水线

Scene/Game 将渲染提交与 GPU 回读完成拆开。每个提交持有独立像素 staging buffer、GPU 时间查询 mask、世界 revision 和 profile；Tauri 先释放 renderer/world 锁，再等待此提交的 GPU copy。完成时再次校验项目和 Play generation，旧会话结果不会发布到新会话。同步 API 保留为 submit/finish 包装。

每个 renderer 最多保留 3 个回读槽，槽满立即返回 busy，前端重试完整请求。Scene/Game 每窗口最多 2 个请求在途，相机预览最多 1 个；无效或乱序返回在上传像素前释放，截图先排空旧请求再取得新帧。调度间隔单列为 `Pending frame scheduling`，不归入本帧 CPU self。

Release 基准使用 Frostbound 作者场景、960×540，串行与两帧流水线交错运行，每组 24 帧，取 5 组中位数：**4.1749→2.0331 ms/帧**，全部像素一致。这是批量 CPU/GPU 吞吐量，不是交互 FPS 或单帧延迟。复现：`cargo test -p mengine-editor-host --release --lib benchmark_viewport_submission_pipeline -- --ignored --nocapture --test-threads=1`。

内存取舍：每个回读槽保留所请求的最大尺寸容量，最多 3 份带行对齐的像素缓冲；两请求流水线通常使用 2 份。GPU 时间查询 staging 也随槽独立保留。GPU 到 CPU 的传输和 RGBA 行转换仍存在。

串行 Release 库测试：Host 62 通过、6 个手动基准忽略；RHI 74 通过、1 个手动基准忽略。覆盖反序完成、resize、renderer/target 释放后完成、三槽背压、取消复用、映射失败、RGBA/BGRA 行对齐及逐帧 GPU 查询 mask。证据：`phase3-integrated-tests.log`、`phase3-pipeline-benchmark.log`。

前端相关回归 125/125 通过，TypeScript、前端构建、Tauri Release 检查与构建通过。最终 EXE 使用旁置配套 SDK，在隔离 Frostbound 项目通过重命名、undo/redo、真实恢复文件、资源增改删、进入对局、Play/Pause/Step/Stop 及停止后恢复；Scene/Game 截图已检查，控制台无 error，源场景 SHA-256 不变。测试编辑器正常退出，部分 WebView 缓存因 EPERM 留在临时目录。

同脚本前后各采 12 个 native 帧，去前 2 个后取余下 10 个中位数：Scene 总耗时 **3.78→3.85 ms**、Game **14.37→14.16 ms**；对应回读 **2.34→2.27 ms**、**5.18→4.80 ms**。单帧延迟基本持平，不能把两帧批量基准的收益解释为单帧延迟减半。资源增/改/删通知为 0.85/1.91/1.91 秒，仍受两秒轮询相位影响。证据：`frontend-owned-pipeline-tests.txt`、`phase3-editor-build.log`、`phase3-native-build.log`、`phase3-before.json`、`phase3-after.json`、`phase3-comparison.json`；复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第四阶段纹理同步与联合查询

材质纹理缓存按 linear/sRGB 分开保存，普通帧直接借用当前 RenderObject 中的路径，不再为引用列表及查找重复分配带颜色空间前缀的字符串。失效检查复用已排序引用列表，实际移除资源才复制键。250 ms 文件轮询、显式 invalidate、新纹理立即加载、失败去重、项目切换和同路径双颜色空间均保留。

组件联合查询直接合并已有的有序成员索引，保留去重、非激活实体、实体槽复用及快照遍历顺序。少量类型使用直接归并，超过 8 个有效成员集合使用最小堆，避免类型数增加导致逐项线性扫描。常规顺序只保留与类型数相关的迭代状态；显式快照顺序仍需结果 Vec 和按 rank 排序。

| Release CPU 工作负载 | 第三阶段 | 第四阶段 |
| --- | ---: | ---: |
| 作者场景 65 个物体、8 个纹理变体，普通帧纹理同步 | 0.01383 ms | 0.01204 ms |
| 全对象池激活 1,381 个物体、213 个纹理变体，普通帧纹理同步 | 0.16324 ms | 0.12685 ms |
| 20k 实体，重叠组件联合查询 | 0.56491 ms | 0.24528 ms |
| 同一查询，显式反向遍历顺序 | 0.66824 ms | 0.34442 ms |
| 20k 实体，24 个互不相交组件类型 | 0.41631 ms | 0.28898 ms |

上述数据各取 5 组中位数，联合查询在同进程交错比较旧实现并逐项核对结果；纹理同步每组 100 次，分别强制普通帧与轮询帧。全对象池的轮询帧约 4.95→5.01 ms，磁盘检查成本仍在；作者场景粒子联合查询仅约 0.00273→0.00203 ms，不能把压力测试收益换算为当前游戏 FPS。材质路径省去重复字符串分配，不延长世界或 RenderObject 生命周期。

复现：`cargo test -p mengine-core --release benchmark_component_union -- --ignored --nocapture`；`cargo test -p mengine-runtime --release --lib benchmark_material_texture_sync_cadence -- --ignored --nocapture --test-threads=1`。本地证据：`phase4-union-benchmark.log`、`phase4-texture-before.log`、`phase4-texture-after.log`。

第四阶段串行 Release 验证：core 26、runtime 233、scene 25、Editor Host 62 项通过；core/runtime/Host 分别忽略 3/2/6 个手动基准。纹理专项包含真实 GPU 变体上传、独立卸载、文件修改、删除与恢复、显式失效和项目切换。日志：phase4-core-tests.log、phase4-texture-tests.log、phase4-integration-tests.log。

配套 SDK 和原生 Release 构建通过。隔离项目完成编辑/undo/redo/持久恢复、外部资源增改删、真实对局、Play/Pause/Step/Stop 和编辑状态恢复；Scene/Game 截图检查通过，控制台 error 为 0，源场景摘要不变，测试编辑器正常退出。对照第三阶段相同 EXE 基线，预热帧中位数 Scene 3.85→3.76 ms、Game 14.16→14.26 ms，整体延迟基本持平。原生材料同步约 1.00→0.98 ms，包含定期文件检查，不能当作普通帧微基准。构建、QA 及对照证据：phase4-sdk-build.log、phase4-native-build.log、phase4-after.json、phase4-comparison.json；基线为 phase3-after.json。

## 后续风险

- [x] **编辑器 Scene/Game 回读期间占用 renderer/world 锁。** 已使用有界独立 ticket、锁外等待与前端两请求流水线。GPU 数据传输仍需等待；后续以原生交互采样评估剩余成本。
- [ ] **RenderObject 每帧重新提取。** `frame_compiler.rs` 仍重复规范化 mesh 路径、复制字段；同次共享材质解析已合并，root 过滤会反复沿 Parent 链查找。评估按组件 revision 缓存与加载时路径规范化。
- [ ] **逐物体绘制及准备。** `renderer.rs` 主 pass/阴影 pass 缺少通用实例化，重复状态设置与材质哈希查找；临时 Vec 和 draw order 可复用。先测量 draw call 与准备时间，再实施 mesh/material 分组。
- [ ] **ECS 查询集合与存储。** 内建组件 TypeId 查找和有序联合查询已完成；自定义组件保留兼容查找。稠密组件存储属于后续架构变更。
- [ ] **命令跨桥批处理。** 本阶段仅减少非组件解析次数，未改变逐条 stringify/跨桥协议。
- [ ] **UI、timeline、animation、physics 性能审计。** 尚未完成，不能据本阶段数据排除这些模块的开销。

后续按原生 Scene/Game 的实际采样继续处理 mesh 来源校验、纹理同步和逐物体准备成本；ECS 存储重构单独安排。
