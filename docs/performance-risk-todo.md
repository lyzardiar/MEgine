# 性能风险与实施进度

后续实现按[批次测试台账](testing-batches.md)执行：逐任务提交代码和资产，登记待测内容，默认累计3个功能／修复任务后合并验证。下文已完成阶段的历史测试结果保留；其中的全量命令不作为每次提交的必跑清单。

2026-10-23：编辑器性能与验证已推进至第二十五阶段，覆盖资源索引、撤销／恢复、脚本桥、ECS查询、空间索引、视口回读、网格／材质／纹理处理、UI遍历与图元存储、按需上传软裁剪数据、密集UI批次构建、固定负载采样、Play特效时钟、截图原生世界复用、字体缓存直接追加、Windows材质／纹理文件检查、共享模型源校验、层级变换构建、嵌套UI布局测量复用、稀疏物理候选查询及原版地形分块。保留 Rust + TypeScript + Tauri 技术栈。下列基准来自 Frostbound 3,812 实体场景或注明的压力数据，不能换算成实际游戏 FPS。

B001地图视觉修复补充：地表图集按64像素对齐、逐mip夹紧并限制至单图块1×1级；水面按128像素帧对齐、帧内循环过滤并限制至单帧1×1级，避免跨块／跨帧串色。Amazonia地表与水面图集基础像素量分别减少约11.4%／6%。原生地表六色与水面16组RGBA对照、实际地图动画／暂停／恢复通过。相同场景1280×720硬件timestamp对照中，地表GPU pass增加约0.02ms，水面增加约0.11ms；不能从贴图缩小推断FPS提升。复现入口与原始报告路径见[图集性能说明](designs/frostbound-realms/original-terrain-scene.md#同场景图集性能)，归入B001-01，不新开测试批次。

## 已完成

原版单位场景补充：生成器可复用既有同图地形／装饰项目，校验摘要后仅追加单位资产；Amazonia 96个视觉对象复用33个模型与148个动画组，静止部件和相同采样帧不重复发布，561个新增实体由现有批次桥更新。原生589实体项目打开及快照约0.72秒，无前后性能对照，不作为提速结论。范围与限制见[单位视觉说明](designs/frostbound-realms/original-map-import.md#单位视觉场景)。

- [x] 工程资源增量索引。原生 `project_asset_index.rs` 使用 `notify`，Vite 开发服务使用 Node `fs.watch`。首次加载、主动刷新全扫，普通轮询只重读文件事件涉及的路径；空闲响应仅携带版本，前端不再解析完整资源列表或做 diff。移除工程资源索引的 10,000 条静默截断，扫描失败保留上一份完整索引。覆盖目录移动、Assets 删除重建、项目切换和 `.meta`/GUID 变化；前端确认写入的查找改为 Map。
- [x] 撤销历史共享不变实体。`captureEditorUndoState` 比较相邻快照，仅深拷贝变化实体；恢复仍深拷贝，避免编辑中的对象污染历史。拖拽开始只捕获一次；保留嵌套拖拽、取消、redo 和 128 步淘汰。服务检查点使用不暴露历史对象的 opaque handle，内部 WeakMap 保存栈。
- [x] 自动恢复点缩小响应并移入工作线程。`checkpoint_snapshot` 返回 revision、dirty、恢复点信息，不回传世界；恢复文件使用紧凑 JSON，保持原子替换和持久化写入。Tauri 使用 `spawn_blocking`，在同一项目锁内保证顺序。校验项目、场景及 revision；前端排队时校验场景 generation，普通同场景保存不会误丢随后编辑。canonical 世界按需取回，失败也使旧缓存失效。
- [x] 脚本快照按实体缓存 JSON 片段。以 Arc/Weak 身份识别不变实体，多数实体变化时直接全量序列化；稳定后预热片段。每帧元数据和 JS 对象保持独立，删除实体及注入世界会清理缓存。V8、QuickJS 使用相同语义。
- [x] 规范 op-first 非组件脚本命令不再尝试两次反序列化；保留大组件数组与任意字段顺序的兼容解析。

- [x] 资源变化后的刷新合并。本窗口监听事件直接复用已发布索引，远端/内部事件共享一次扫描；脚本列表读取项目元数据，取消完整世界快照请求。Project 只在纹理/切片依赖变化时重新发现精灵。旧刷新不能覆盖较新的轮询结果或新项目，主动刷新仍强制扫描。
- [x] 空间索引增量 refit。移动只更新所属节点和祖先的内容 bounds；增删、已知/未知 bounds 转换及空间质量退化时重建。保留深度上限和原始物体顺序，未知 bounds 保持可见。
- [x] 内建组件 TypeId 索引。仅对确认具有稳定 Any 类型的生成组件和 Parent/Children 使用直接查找；自定义组件保留逐项查找，兼容运行中改变投影视图、同名替换和实体槽复用。成功的可写访问仍推进实体 revision。
- [x] 同次 mesh 提取复用共享材质。缓存仅限本次提取，逐物体覆盖作用于副本；下一帧仍经过既有材质热更新检查。mesh 路径和完整 RenderObject 尚未跨帧缓存。

- [x] 层级变换直接构建结果表，消除单次解析结束后的整表分配、哈希及复制；完整World和指定实体子集共用实现，保留循环失活、祖先变换及实体generation语义。
- [x] 稀疏2D／3D物理通过组件成员索引取得候选，仅构建候选及祖先的变换层级；密集场景及自定义Any投影视图保留完整扫描。
- [x] 原版地形按32×32格合并地面、崖壁与水面网格；水动画仅在源帧变化时发布材质参数。独立原地图项目通过原生Editor验收，主游戏场景接入仍待完成。

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
- [ ] **RenderObject 每帧重新提取。** `frame_compiler.rs` 仍重复规范化 mesh 路径、复制字段；同次共享材质解析已合并，第五阶段已在同一编译帧内让嵌入视图复用主画面提取结果，第八阶段消除渲染读取时的材质源深拷贝和重复路径构造；第二十五阶段的单次视图共享祖先距离复用已通过 B001 行为与性能验证；跨帧提取仍需评估组件 revision 与路径缓存。
- [ ] **逐物体绘制及准备。** 第七阶段让主 pass／阴影 pass 复用单次提交的材质键和错误状态，减少纹理键字符串复制、Shader指纹计算与缺失纹理检查。通用实例化、重复GPU状态设置、材质哈希查找和临时Vec／draw order复用仍待评估；绘制次数及透明物体顺序保持不变。
- [ ] **ECS 查询集合与存储。** 内建组件 TypeId 查找和有序联合查询已完成；自定义组件保留兼容查找。稠密组件存储属于后续架构变更。
- [ ] **命令跨桥批处理。** 第二十四阶段的 V8／QuickJS 有序 JSON 批次接口与装饰动画已通过 B001 行为和原生验证；QuickJS 大批次微基准获益，V8 与原生整帧未证明加速。JSON 与逐命令组件写入仍有成本。
- [ ] **UI、timeline、animation、physics 性能审计。** 第九阶段已优化UI子节点借用、布局结果顺序匹配及按需建立索引；第十阶段消除普通控件图元的临时数组分配和往返搬运；第十一阶段跳过无软裁剪帧的裁剪数据打包／上传和Shader裁剪循环；第十二阶段按有效图元数量细化批次空间网格。默认位图文字按亮点生成独立图元，数量、批次构建和其他实例数据上传成本仍在；第二十一阶段已复用同帧同宽度的嵌套LayoutGroup尺寸；第二十二阶段已优化稀疏物理的候选和层级准备；其他文本／布局路径、timeline、animation及物理解算器本身仍需审计，不能据局部数据排除剩余开销。

后续按原生 Scene/Game 的实际采样继续处理 mesh 来源校验、纹理同步和逐物体准备成本；ECS 存储重构单独安排。

## 第五阶段主画面与嵌入视图共享提取

同一 `FrameCompiler::compile` 调用内，主画面保存可见 MeshRenderer 对应的实体序列；头像和嵌入场景视图按原有根节点边界筛选，并复制已提取的 RenderObject。每个视图仍拥有可独立修改的网格键和材质，摄像机专属 billboard 不会污染主画面或其他视图。没有主摄像机的 UI-only 画面按原路径提取所需网格；不含 UI 的帧不创建实体序列。

复用范围限于单次不可变世界编译。材质文件继续按既有轮询规则在后续帧刷新，材质组件与逐物体覆盖、实体顺序、激活状态及重新设置父级即时参与新帧。根节点包含自身，最多追溯128层，保留原有深度边界与环终止行为。额外内存为单帧可见网格的实体ID数组，未跨帧保留 RenderObject。

| Release CPU 工作负载（主画面加嵌入视图） | 独立提取 | 同帧复用 |
| --- | ---: | ---: |
| 作者场景65个网格，无嵌入视图 | 0.05893 ms | 0.05985 ms |
| 作者场景65个网格，一个仅含1个网格的局部视图 | 0.09504 ms | 0.06206 ms |
| 作者场景65个网格，一个完整视图 | 0.11577 ms | 0.07925 ms |
| 作者场景65个网格，八个完整视图 | 0.54924 ms | 0.24179 ms |
| 激活全部对象池1,381个网格，无嵌入视图 | 1.06044 ms | 1.04590 ms |
| 激活全部对象池1,381个网格，一个局部视图 | 1.23323 ms | 1.19829 ms |
| 激活全部对象池1,381个网格，一个完整视图 | 2.14797 ms | 1.62039 ms |
| 激活全部对象池1,381个网格，八个完整视图 | 10.40940 ms | 5.76349 ms |

同进程交错执行，预热后9组中位数，每组20次；各组输出按网格、矩阵、阴影标志和材质逐项核对。无视图情况包含维护实体序列的开销；多视图压力数据不代表通常只有一个头像的实际对局帧率。

复现：`cargo test -p mengine-runtime --release --lib frame_compiler -- --include-ignored --nocapture --test-threads=1`。10项通过，包含两个手动基准，以及同帧副本隔离、重设父级、激活、材质热更新、128层边界与环、主摄像机／UI-only／不含UI组合。原始数据为 `tmp/docs-artifacts/editor-performance-risk/phase5-frame-benchmark.log` 和 `phase5-extraction-benchmark.json`。

串行 Release 集成：Runtime 236、Editor Host 62 项通过，分别忽略3／6个手动基准。Debug／Release配套SDK和Tauri Release已重建，原生验收使用EXE旁的SDK；3,812实体编辑、undo/redo、真实恢复文件、外部资源增改删、Play/Pause/Step/Stop及停止后恢复通过，控制台无error，源场景摘要保持一致。Scene与游戏截图已检查，测试编辑器正常退出；WebView缓存因EPERM保留在临时目录。构建和集成日志为 `phase5-integration-tests.log`、`phase5-sdk-build.log`、`phase5-native-build.log`；SDK摘要为 `phase5-sdk-copy.json`。

原生前后各采12个预热帧，去前2个后取10个中位数；优化后复采一次，以检查首轮Game变慢的波动。三轮Scene总计为 **3.87／3.65／4.24 ms**，Game为 **13.71／14.85／13.62 ms**（基线／首次优化后／复采）。Game编译为2.86／3.21／2.90 ms，网格同步2.24／2.80／2.17 ms。未修改环节也发生变化，不能将多视图微基准解释为普通对局整体加速；目前仅证明同帧重复提取减少与功能一致。两次优化后功能验收均通过，不丢弃首次采样。证据为 `phase5-before.json`、`phase5-after.json`、`phase5-after-repeat.json`、`phase5-comparison.json`、`phase5-comparison-repeat.json`；复现沿用 `scripts/qa-editor-performance-risk.mjs` 和对应 `MENGINE_PERFORMANCE_LABEL`。

## 第六阶段姿态源校验与文件指纹复用

RuntimeMeshCache 在轮询或请求新姿态时，先完整验证已加载源及其依赖，再使用该源版本的主文件时间戳／长度；有效源不再额外读取一次主文件元数据。首次加载、源失效和静态网格仍沿用文件检查与重试路径，250毫秒轮询、新姿态立即校验、显式失效、项目切换及相机专属姿态保持原有规则。

`SharedGltfPoseSource::validate_at` 同时验证本次请求路径的规范路径身份，防止目录联接重定向后继续使用原目标。主模型的指纹来自验证后的已加载版本，不使用加载前观察到的旧指纹；同帧静态网格和姿态网格因此可以共享正确的检查结果。渲染专用兼容加载仍验证其主文件和全部保留依赖，不把兼容源加入脚本共享池。完整依赖检查没有被缓存时间窗口替代。

测试覆盖主文件修改／删除／恢复、外部buffer变化、新姿态在轮询间隔内的刷新、已有姿态的轮询节奏、兼容加载、加载前旧指纹、Windows目录联接重定向。重定向用例保留相同主文件长度和修改时间，确认旧规范路径仍有效时，新请求能识别目标变化，并加载不同的动画数据。

Release CPU对照选择人族建筑和狮鹫笼目录中的17个保留模型源，同进程交错执行，预热后9组、每组25次：校验耗时 **1.52483→1.20812 ms**。额外主文件元数据读取17→0，17次完整源／依赖校验全部保留；这不表示文件系统读取被全部取消，也不直接代表FPS收益。复现：`cargo test -p mengine-runtime --release --lib benchmark_pose_source_validation -- --ignored --nocapture --test-threads=1`；证据为 `phase6-source-benchmark.log` 与 `phase6-source-benchmark.json`。

最终串行Release测试：Assets 94、Runtime 239、Editor Host 62项通过；Runtime／Host分别忽略4／6个手动基准，新增校验基准另行通过。来源、渲染缓存、热更新和相机覆盖的结果保存在 `phase6-integration-tests.log`。

Debug／Release配套运行时和Tauri Release均已重建，原生编辑器使用旁置SDK且摘要一致。前后均通过3,812实体重命名、undo/redo、真实恢复文件、外部资源增改删、Play/Pause/Step/Stop与停止后编辑状态恢复；控制台错误0、作者场景摘要不变，Scene／Game截图已检查，测试编辑器正常退出，WebView缓存因EPERM保留。

前后各12个预热native帧，去前2个后对10个取中位数：Game网格同步 **2.28295→1.83340 ms**；外层文件元数据 **22→5次、0.58600→0.12470 ms**；完整源校验仍17次，耗时1.26710→1.38875 ms。Scene总计3.69365→3.84235 ms，Game总计13.70845→13.75850 ms，整体基本持平，不据此承诺FPS提升。姿态生成与上传次数也会随采样帧变化，完整依赖与路径身份检查仍是剩余成本。

原生证据为 `phase6-before.json`、`phase6-after.json`、`phase6-comparison.json` 及对应日志；构建与SDK证据为 `phase6-sdk-build.log`、`phase6-native-build.log`、`phase6-sdk-copy.json`，均位于 `tmp/docs-artifacts/editor-performance-risk/`。复现沿用 `scripts/qa-editor-performance-risk.mjs`，设置 `MENGINE_PERFORMANCE_LABEL` 区分采样轮次。

## 第七阶段跨绘制pass复用材质准备

Renderer 对相机／阴影视锥可见集合的并集，每个物体只生成一次纹理集合键和Shader管线键、检查一次纹理可用性。主画面与阴影pass按已有uniform槽位复用结果；保留剔除、透明排序、逐物体参数与绘制次数。预热管线接口继续使用相同的管线创建逻辑。

准备结果仅存在于本次提交，包含当前错误材质状态；每次新提交重新查询纹理和Shader，因此纹理上传、替换、删除／恢复及Shader修复立即参与绘制。额外保留与提交物体数量成正比的临时材质键数组及路径字符串，提交返回时释放，不跨帧保存世界或材质副本。纹理集合缓存首次建立时复制一次键，命中后两种pass不再分别复制键。

256×256真实GPU提交基准使用64／1,024个带纹理立方体，含透明物体和48／768个阴影绘制物体；两个版本各预热2组后取9组中位数，每组20帧。每帧回读核对稳定性，前后RGBA逐字节一致。完整提交耗时包含准备、绘制编码、queue submit及临时数据释放，不包含随后GPU回读等待。

| 工作负载 | 第六阶段 | 第七阶段 |
| --- | ---: | ---: |
| 64物体，完整CPU提交 | 0.22675 ms | 0.21580 ms |
| 1,024物体，完整CPU提交 | 1.53515 ms | 1.45091 ms |
| 1,024物体，材质准备 | 0.19597 ms | 0.20358 ms |
| 1,024物体，阴影pass编码 | 0.42325 ms | 0.39284 ms |
| 1,024物体，主画面pass编码 | 0.68566 ms | 0.59088 ms |

材质准备略有增加，净收益主要来自两个绘制pass少做重复工作。该合成负载不能代表Frostbound实际帧率；GPU绘制次数没有减少。复现：设置 `MENGINE_PERFORMANCE_LABEL`，运行 `cargo test -p mengine-rhi --release --lib benchmark_material_submission -- --ignored --nocapture --test-threads=1`。基线为5562452的Renderer配合同一基准；证据为 `phase7-submission-before-total.log`、`phase7-submission-after-total.log` 和对应RGBA。初次仅记录分段耗时的基准也保留在 `phase7-submission-before.log`／`phase7-submission-after.log`。

串行Release集成测试：RHI 75、Runtime 239、Editor Host 62项通过，分别忽略2／4／6个手动基准。新增GPU回归覆盖剔除后槽位映射、纹理颜色空间、同路径纹理替换、删除／恢复、错误Shader修复、显式错误材质、混合／深度／剔除状态、自定义纹理。现有多视图、阴影可见性、透明排序和回读所有权回归全部通过；日志为 `phase7-integration-tests.log`。所有原始验证产物位于 `tmp/docs-artifacts/editor-performance-risk/`。

Debug／Release SDK与原生Release构建通过，EXE旁置SDK摘要核对一致。前后原生验收均通过3,812实体重命名、undo/redo、真实恢复文件、资源增改删、进入对局、Play/Pause/Step/Stop与编辑状态恢复；无控制台error，作者场景摘要不变，Scene／Game截图已检查。测试编辑器正常退出，部分WebView缓存因EPERM保留在临时目录。

原生前后各采12帧，去前2帧后取10帧中位数：Game材质准备 **0.22710→0.23875 ms**，阴影编码 **0.27725→0.26565 ms**，主画面编码 **0.41470→0.29245 ms**；Scene主画面编码 **0.12650→0.09490 ms**。Scene总耗时3.86195→4.11895 ms，Game总耗时13.33100→13.51850 ms；网格同步、纹理同步和GPU等待等未修改环节仍有波动，当前不能据此宣称整体FPS提升。原生证据为 `phase7-before.json`、`phase7-after.json`、`phase7-comparison.json`；构建记录为 `phase7-sdk-build.log`、`phase7-native-build.log`、`phase7-sdk-copy.json`。原生复现仍使用 `scripts/qa-editor-performance-risk.mjs`。

## 第八阶段共享不可变材质源

RuntimeMaterialCache 的3D／UI渲染解析直接读取缓存中的不可变Arc材质源，再生成本物体独立的渲染材质。普通.mmat／.mat不再先深拷贝完整源资产；公开resolve_asset仍返回可编辑的独立值。材质实例覆盖在独立父值上执行，嵌套实例中仅独占的临时父值可以直接移交，不改写缓存源。材质路径经过原有项目相对路径校验后传入加载函数，取消同层加载时的重复路径构造。

保持250毫秒轮询、显式invalidate、父材质热更新、错误诊断去重及修复后清除、Shader验证与实例继承32层限制。没有新增跨帧RenderObject缓存，也没有缓存已合并的实例结果；自定义Shader绑定解析和最终渲染材质字段复制仍按原流程执行。

Release基准使用Frostbound作者场景与全部对象池激活场景，预热后9组、每组80次。每组计时前将文件检查时间设为当前时间，专门测量普通缓存命中帧，不包含250毫秒轮询中的磁盘检查；轮询及失效语义由单独回归验证。

| 网格提取工作负载 | 第七阶段 | 第八阶段 |
| --- | ---: | ---: |
| 作者场景65网格、1个文件材质源 | 0.05797 ms | 0.05639 ms |
| 全部对象池1,381网格、291个文件材质源 | 1.12614 ms | 0.98334 ms |

前后完整RenderObject字段逐项一致。该压力基准不代表通常对局的FPS；作者场景收益很小。复现：设置MENGINE_PERFORMANCE_LABEL，运行 `cargo test -p mengine-runtime --release --lib benchmark_shared_material_sources -- --ignored --nocapture --test-threads=1`。证据为 `phase8-material-benchmark-before.log`／`phase8-material-benchmark-after.log` 和对应字段快照，均位于 `tmp/docs-artifacts/editor-performance-risk/`。

材质专项17项通过，1个手动基准另行运行。新增回归覆盖源共享身份、可编辑副本与嵌套实例隔离、逐物体渲染副本、跨项目隔离、路径拒绝、父源轮询热更新、显式失效、删除／恢复和诊断清理、继承循环及31层实例加根材质可用／32层实例超限。现有UI自定义材质及Shader热更新测试也通过；日志为 `phase8-material-tests-final.log`。

串行Release集成测试：Assets 94、Runtime 242、Editor Host 62项通过，Runtime／Host分别忽略5／6个手动基准。日志为 `phase8-integration-tests.log`。

Debug／Release SDK与原生Release均已重建，原生编辑器使用摘要核对一致的旁置SDK。前后均通过3,812实体编辑、undo/redo、真实恢复文件、资源增改删、进入对局、Play/Pause/Step/Stop及编辑状态恢复；控制台无error，作者场景摘要不变，测试编辑器正常退出。Scene截图逐字节一致，Game截图已检查；部分WebView缓存因EPERM保留。

前后各采12个native帧，去前2个后取10帧中位数：Game网格提取 **1.42805→1.45465 ms**，帧编译2.85830→2.76035 ms；Scene总计3.93610→4.00195 ms，Game总计13.49075→13.86255 ms。真实采样未体现缓存命中基准中的网格提取收益，不能宣称整体FPS提高；轮询、实际对象状态和其他帧阶段的成本仍需继续分解。原生记录为 `phase8-before.json`、`phase8-after.json`、`phase8-comparison.json`；构建记录为 `phase8-sdk-build.log`、`phase8-native-build.log`、`phase8-sdk-copy.json`。复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第九阶段UI子节点与布局遍历

UI编译按需建立单帧子节点索引：没有符合显示条件的Canvas时跳过索引构造；有多个Canvas时共享同一索引。节点遍历直接借用子节点切片，Tab选择也使用切片，不再逐节点复制Vec。布局结果按有序子集顺序匹配，替代每个子节点遍历查找，从平方级降为线性匹配。逆序绘制从末尾匹配对应布局结果，布局矩形及ignore_layout行为保持一致。

索引与借用仅存在于本次不可变世界编译，后续帧仍重新读取激活、同级顺序、父级和Canvas状态。未引入跨帧UI缓存，文本生成、嵌套布局度量及图元数量仍保留原实现。

Release CPU基准包含完整UI帧生成和批次构造，层级预先构建，字体使用默认测量器；各预热2组后取9组中位数，每组25次。普通作者场景首次优化后较慢，因此复采一次，两个结果都保留。四种工作负载前后及复采的全部UI输出字段一致。

| 工作负载 | 第八阶段 | 首次优化后 | 复采 |
| --- | ---: | ---: | ---: |
| Frostbound作者场景，1,103图元 | 0.75636 ms | 0.81906 ms | 0.77329 ms |
| 无Canvas，20,001实体 | 0.93139 ms | 0.00004 ms | 0.00004 ms |
| 2,000个Image，正序布局 | 4.02134 ms | 3.16584 ms | 2.83779 ms |
| 2,000个Image，逆序布局 | 3.54379 ms | 3.14164 ms | 2.84507 ms |

无Canvas数据仅表示省去空UI编译的索引工作，不含世界层级构造或整个编辑器帧。普通Frostbound场景未显示稳定收益，不能将布局压力数据换算为实际FPS。早期2,000个InputField负载生成304,000图元，正／逆序基线为209.44／185.61 ms；该负载的图元数量和生成成本另列后续风险，本阶段没有对其作优化后性能验收。原始记录保留在 `phase9-inputfields-baseline.log`。

复现：设置MENGINE_PERFORMANCE_LABEL，运行 `cargo test -p mengine-runtime --release --lib benchmark_ui_traversal -- --ignored --nocapture --test-threads=1`。主要基准证据为 `phase9-ui-benchmark-before.log`、`phase9-ui-benchmark-after.log`、`phase9-ui-benchmark-after-repeat.log`。全部原始数据位于 `tmp/docs-artifacts/editor-performance-risk/`。

UI专项88项通过，1个手动基准另行运行。新增用例穷举8个子节点的所有布局子集、正／逆序及矩形数量边界，并验证快照同级排序、重新设父级、激活、Tab选择和Canvas显示状态变化；现有屏幕／世界Canvas、布局、文字、裁剪和射线回归均通过。日志为 `phase9-ui-tests-final.log`。

串行Release集成测试：Runtime 245、Editor Host 62项通过，各忽略6个手动基准；日志为 `phase9-integration-tests.log`。

Debug／Release SDK及原生Release构建通过，旁置SDK摘要核对一致。前后原生验收均通过3,812实体编辑、undo/redo、真实恢复文件、资源增改删、进入对局、Play/Pause/Step/Stop和编辑状态恢复；控制台error为0，作者场景摘要不变，测试编辑器正常退出。Scene截图逐字节一致，Game截图已检查；WebView缓存因EPERM保留。

前后各12个预热native帧，去前2帧后取10帧中位数：Game Canvas布局／文字 **0.70255→0.76070 ms**，UI批次0.15255→0.17045 ms，帧编译2.79815→2.86460 ms；Scene总计4.02265→3.75055 ms，Game总计13.17755→13.42970 ms。原生普通UI场景未显示本阶段收益，不据此宣称整体FPS提升。证据为 `phase9-before.json`、`phase9-after.json`、`phase9-comparison.json`，构建与SDK记录为 `phase9-sdk-build.log`、`phase9-native-build.log`、`phase9-sdk-copy.json`。原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十阶段UI图元存储

普通控件生成的图元直接留在目标数组中，继承父Mask时在原切片上设置stencil测试；只有启用的Mask需要保存Push／Pop图元时才分配临时数组。省去普通控件每次绘制的一次数组分配和图元往返搬运，保留Mask显示开关、嵌套深度上限、禁用Graphic时预留深度，以及后续同级控件的状态恢复。

默认InputField使用5×7位图字形，每个亮点生成一个图元。512个输入框仍产生77,824个图元；本阶段没有减少字形细节、图元数量、RHI实例上传或GPU绘制成本。

| Release CPU工作负载 | 修改前 | 修改后 | 修改后复测 |
| --- | ---: | ---: | ---: |
| Frostbound作者场景，3,812实体、1,103图元 | 0.74760 ms | 0.73115 ms | 0.72170 ms |
| 2,000个Image | 3.14148 ms | 3.16658 ms | 2.70571 ms |
| 512个InputField，正序布局 | 79.79523 ms | 77.91150 ms | 77.39673 ms |
| 同一输入框负载，逆序布局 | 72.73380 ms | 70.65715 ms | 71.42636 ms |

每项预热2组、测量9组，每组8次，取组中位数；4096×1024、默认字体解析，世界层级构造位于计时外。计时包含图元生成、批次构建和结果释放，不包含GPU提交；三次运行的完整UI输出Debug字段摘要一致。输入框收益较小，Image数据存在波动，不能推导整体编辑器FPS。原始记录为 `phase10-benchmark-{before,after,after-repeat}.log` 和 `phase10-benchmark-comparison.json`，位于 `tmp/docs-artifacts/editor-performance-risk/`。复现：`cargo test -p mengine-runtime --release --lib benchmark_ui_graphic_storage -- --ignored --nocapture --test-threads=1`。

修改前后UI专项均89项通过，2个手动基准忽略；新增多图元输入框用例验证显示／隐藏Mask、禁用Graphic时的子级stencil深度及后续同级控件的完整图元内容。串行Release集成Runtime 246、Editor Host 62项通过，分别忽略7／6个手动基准。证据为 `phase10-ui-tests-{before,after}.log` 和 `phase10-integration-tests.log`。

Debug／Release SDK及原生Release构建通过，旁置SDK摘要一致。前后原生验收均通过3,812实体编辑、undo/redo、真实恢复文件、外部资源增改删、进入对局、Play/Pause/Step/Stop及编辑状态恢复；控制台error为0，源场景与HEAD逐字节一致。Scene截图逐字节一致，Game截图已检查；测试编辑器正常退出，WebView缓存因EPERM保留在临时目录。

前后各12个预热native帧，去前2帧后取10帧中位数：Game Canvas布局／文字 **0.76405→0.65440 ms**，UI批次0.15770→0.19290 ms，帧编译2.79160→2.83665 ms；Scene总计4.00910→3.84570 ms，Game总计13.51235→13.57765 ms。单项改善没有转化为整体Game帧耗时下降，不据此宣称FPS提升。证据为 `phase10-before.json`、`phase10-after.json`、`phase10-comparison.json`；构建与SDK摘要见 `phase10-sdk-build.log`、`phase10-native-build.log`、`phase10-sdk-copy.json`。原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十一阶段按需准备UI软裁剪

UI准备阶段检查当前帧是否含有软裁剪槽；无裁剪时跳过每图元256字节裁剪数据的CPU打包和GPU上传，并通过帧uniform让内建、自定义及错误材质的片元Shader跳过8槽裁剪循环。帧uniform保持16字节，顶点实例大小保持184字节。Stencil、Scissor及几何布局继续使用原有路径。

裁剪缓冲独立扩容，初始仅保留一个256字节绑定占位；有裁剪时按图元数量增长至下一次幂并完整上传。已分配的容量保留供后续复用，无裁剪帧不读取旧内容；从无裁剪切回裁剪时重新写入本帧数据。混合裁剪／普通图元的帧继续按原有逐实例布局上传全部裁剪槽。

| Release UI准备CPU负载 | 修改前 | 修改后 | 修改后复测 |
| --- | ---: | ---: | ---: |
| 1,103图元，无裁剪 | 0.060875 ms | 0.029708 ms | 0.029325 ms |
| 77,824图元，无裁剪 | 12.672400 ms | 6.120325 ms | 6.167092 ms |
| 1,103图元，有裁剪 | 0.062008 ms | 0.058533 ms | 0.052925 ms |
| 77,824图元，有裁剪 | 12.558700 ms | 11.802608 ms | 12.025992 ms |

每项预热2组、测量9组，每组12次，取组中位数。计划提前构造；计时涵盖整个 `UiRenderer::prepare`，每次计时后提交队列并等待GPU完成写入，等待时间不计入上述CPU数据。负载采用同材质图元，数量对应普通作者场景和输入框压力场景，不等同于完整Frostbound渲染。77,824图元无裁剪时，每帧减少19 MiB上传；从未使用裁剪的同规模renderer，其裁剪缓冲从32 MiB变为256字节。首次实际裁剪仍分配完整缓冲，已分配容量不自动收缩。

GPU对照覆盖513个普通图元、裁剪启停、空帧、稀疏与8层裁剪、混合图元、自定义／错误材质、Stencil、投影及32／48像素尺寸切换。无裁剪输出同时与显式全视口硬裁剪对照，修改前后全部24幅RGBA结果逐字节一致。额外用例验证独立容量在1／1,024／4,096之间按需求增长，以及旧裁剪状态不会延续到普通帧；UI专项24项通过，1个手动基准另行运行。

复现：`cargo test -p mengine-rhi --release --lib ui::soft_clip_tests -- --test-threads=1`；基准过滤 `benchmark_ui_soft_clip_preparation` 并添加 `--ignored --nocapture`。主要证据为 `phase11-gpu-{before,after}.log`、`phase11-benchmark-{before,after,after-repeat}.log`、`phase11-benchmark-comparison.json` 和配对RGBA，均在 `tmp/docs-artifacts/editor-performance-risk/`。

串行Release集成RHI 77、Runtime 246、Editor Host 62项通过，分别忽略3／7／6个手动基准。包含真实GPU材质、MSAA、视口回读、场景恢复及资源热更新；日志为 `phase11-integration-tests.log`。

Debug／Release SDK与原生Release构建通过，旁置SDK摘要一致。前后原生验收均通过3,812实体编辑、undo/redo、真实恢复文件、资源增改删、对局播放／暂停／单步／停止及编辑状态恢复；控制台error为0、源场景摘要不变。Scene截图逐字节一致，Game截图已检查，测试编辑器正常退出；WebView缓存因EPERM保留。

前后各12个预热native帧，去前2帧后取10帧中位数：Game UI准备 **0.07470→0.06155 ms**，其中实例打包0.03680→0.02075 ms、缓冲写入0.02100→0.01615 ms；Scene UI准备0.01700→0.01200 ms。Scene总计4.04170→3.79005 ms、Game总计13.37275→13.54710 ms；普通场景的局部收益很小，未建立整体Game帧耗时或FPS改善。证据为 `phase11-before.json`、`phase11-after.json`、`phase11-comparison.json`，构建与SDK记录为 `phase11-sdk-build.log`、`phase11-native-build.log`、`phase11-sdk-copy.json`。原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十二阶段密集UI批次空间网格

批次构建使用有效图元数量估算空间网格密度，目标平均64个图元／格；取配置分辨率与密度估算值中的较大值，每轴仍最多128格。图元较少时保持原有网格，密集文本减少同格中不相交候选的检查。透明重叠关系仍由原有包围盒相交判断建立，拓扑排序及批次合并规则不变。

取舍是密集界面可能保存更多临时网格引用；引用数1,048,576、相交边262,144及原始顺序回退规则保留。既有最多16,384图元的批次顺序缓存边界不变。候选检查数量尚无独立预算，极端非均匀空间分布仍需审计。

| Release批次构建CPU负载 | 修改前 | 修改后 | 修改后复测 |
| --- | ---: | ---: | ---: |
| Frostbound作者场景，1,103图元 | 0.35093 ms | 0.35343 ms | 0.33568 ms |
| 512个InputField，77,824图元，正序布局 | 44.08824 ms | 31.92035 ms | 30.99355 ms |
| 同一输入框负载，逆序布局 | 36.74305 ms | 25.73048 ms | 25.42148 ms |

输入框图元生成仍约28～30 ms，释放约5.9 ms。独立测量的完整UI编译（生成、批次与释放）正序 **77.34765→65.18571 ms**、逆序 **70.30101→59.16616 ms**；作者场景0.72019→0.72728 ms，2,000个Image为2.65863→2.68304 ms。图元、控制区域及完整输出Debug字段摘要一致，没有通过减少内容或绘制次数取得该压力测试收益。

每项预热2组、测量9组，每组8次，取组中位数；4096×1024、默认字体解析，世界层级构造位于计时外，不含GPU提交。分项中位数不直接相加替代完整编译测量。复现：`cargo test -p mengine-runtime --release --lib benchmark_ui_generation_and_batching -- --ignored --nocapture --test-threads=1`；完整输出基准使用 `benchmark_ui_graphic_storage`。证据为 `phase12-breakdown-{before,after,after-repeat}.log`、`phase12-output-{before,after}.log`、`phase12-benchmark-comparison.json`，位于 `tmp/docs-artifacts/editor-performance-risk/`。

新增回归在修改前后均通过：8,192图元逐对检查全部重叠顺序、不同网格配置得到相同排序、几何变化刷新缓存；20,000个高度重叠图元保持复杂度上限回退。实际GPU对照验证密集透明图元及Stencil遮罩的批次优化结果与原始绘制顺序逐字节相同。最终RHI UI专项27项通过，1个手动基准忽略；日志为 `phase12-gpu-before.log` 和 `phase12-gpu-after.log`。

串行Release集成RHI 80、Runtime 246、Editor Host 62项通过，分别忽略3／8／6个手动基准；日志为 `phase12-integration-tests.log`。

Debug／Release SDK及原生Release构建通过，旁置SDK摘要一致。原生基线、修改后和复测均通过3,812实体编辑、undo/redo、真实恢复文件、资源增改删、对局播放／暂停／单步／停止及编辑状态恢复；控制台error为0，源场景与HEAD一致。Scene截图逐字节一致，Game截图已检查，测试编辑器正常退出；WebView缓存因EPERM保留。

原生前／后／复测各采12帧，去前2帧后取10帧中位数：Game UI批次 **0.15700／0.16230／0.19125 ms**，Game总计 **12.96425／14.04975／13.61895 ms**；Scene总计3.64405／3.88565／3.85835 ms。原生普通场景没有性能收益，修改后整帧采样更慢；动态样本中的UI图元约453～521、每帧网格上传0～7次且前后并不完全一致，不能把整帧差异归因于网格策略。这些动态帧不替代固定负载基准，也不支持整体FPS提升结论。后续原生性能归因需要增加固定模拟状态的对照。

证据为 `phase12-before.json`、`phase12-after.json`、`phase12-after-repeat.json`、`phase12-comparison.json`，构建与SDK记录为 `phase12-sdk-build.log`、`phase12-native-build.log`、`phase12-sdk-copy.json`。原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十三阶段原生固定负载与同帧采样

`view.screenshot` 新增可选 `includeNativeProfile`，桌面 Game 返回生成本次截图的原生性能数据及渲染尺寸，默认响应保持原样。Scene 请求该选项返回 `INVALID_ARGS`，原生捕获不可用返回 `NOT_READY`。沿用项目、世界和视口 generation 校验，避免把另一次 `profiler.get_samples` 查询的帧误配到截图。Play捕获可携带原生 `worldRevision`；完整快照路径通过请求持有的世界内容和最终归属校验确认对应关系。

QA 在暂停状态下完成固定 9 步（0.144 秒）后保存游戏世界，完整动态播放验收仍单独运行。固定渲染副本排除 217 个 `ParticleEmitter3D` 和 238 个 `SampledEffect`；这些渲染器内部状态使用墙钟推进，单纯暂停 Play 不会使画面静止。运行时新增实体允许同级排序索引重复，导入测试场景时按原有同级顺序生成唯一索引。所有处理只发生在隔离副本，源场景不变。

固定副本通过 `scene.load_json` 加载，连续采集 12 次，前 2 次预热。每次同时保存图片与对应 profile，校验世界不变、预热后像素一致，以及捕获尺寸等于实际显示尺寸。正式测量采用 850×478，避免截图与显示尺寸交替触发渲染目标重建。世界内容按对象键排序计算 SHA-256，数组顺序保留；前后世界摘要均为 `bc6efb1ee8caaebc69794baa22e7ed496b498ed764147663122f68702c4aacb2`，PNG 摘要均为 `2ea14ee0ffa7817ed746b2e9ed1911738aee55506559f9a83fa8205027471a2f`。

对照版本仅替换 RHI `ui.rs` 为 `0e313f7` 的网格实现；两版使用相同的新采样前端、QA 和各自配套 SDK，是受控构建，不是未经改动的历史发布包。构建后已恢复当前源文件与 Release 程序，SDK 复制摘要校验通过。两版固定负载均为 4,031 实体、187 个 RenderObject、412 个 UI 图元、34 个 UI 批次／绘制，预热后 mesh 上传和 UI 缓冲分配均为 0；几何、可见性及上传计数一致。

| 固定负载原生阶段，10帧中位数 | 旧网格 | 密度网格 |
| --- | ---: | ---: |
| 原生渲染总计 | 11.14310 ms | 10.93255 ms |
| FrameCompiler.compile | 2.16505 ms | 2.05160 ms |
| Canvas布局与文本 | 0.64150 ms | 0.61460 ms |
| UI批处理 | 0.03440 ms | 0.03115 ms |
| UI准备 | 0.05195 ms | 0.04975 ms |
| 网格同步 | 1.12940 ms | 1.04055 ms |
| GPU回读等待 | 4.52055 ms | 4.24760 ms |
| 世界快照同步（独立于渲染总计） | 5.36010 ms | 5.41450 ms |

该固定负载没有显示回退，但静态重复捕获可复用 UI 排序缓存，不能据此归因密度网格收益，也不能排除其他动态负载的回退。截图采样受节流约束，原生渲染总计不包括世界同步、PNG编码及完整IPC往返；不代表连续帧率。第十二阶段密集输入框的独立批次构建基准仍是该优化的主要收益证据，完整动态对局的整体FPS改善尚未建立。

前端协议／AgentBridge／MCP测试 34 项通过，TypeScript与前端构建通过。两版原生Release均通过编辑、undo/redo、恢复文件、资源增改删、播放／暂停／单步／停止、停止后编辑状态恢复、固定画面及默认截图兼容检查，控制台error为0，测试程序正常退出。固定截图已检查；WebView缓存因EPERM保留。

待跟进：

- [x] Play中的粒子、采样特效、Effekseer及拖尾跟随模拟暂停／单步；保留编辑模式预览，退出Play、新会话和时间回退清理播放状态，见第十四阶段。
- [ ] 为完整动态原生负载建立确定性的特效状态与逐帧工作量对照，补充排序缓存失效、同会话场景替换及隐藏视口重开的历史重建；当前固定副本不替代此项。

复现：设置 `MENGINE_EDITOR_EXECUTABLE` 和 `MENGINE_PERFORMANCE_LABEL`，清除 SDK 环境覆盖，运行 `node scripts/qa-editor-performance-risk.mjs`。证据位于 `tmp/docs-artifacts/editor-performance-risk/`：`phase13-before.json`、`phase13-after.json`、`phase13-comparison.json`、两版 `phase13-builds/*/receipt.json`、构建日志及 `native-qa/*/fixed-game-*.json/png`。原始诊断数据不提交。

## 第十四阶段Play特效时钟

Game、Scene及相机预览按Play会话和世界模拟时间计算特效增量。同一时刻的重复渲染增量为0，单步只消费一次时间差；完整截图和过期revision后的快照回退也保留Play会话身份，并拒绝过期会话。编辑模式继续使用墙钟。退出Play、新会话或时间回退会清理粒子、拖尾、采样特效及Effekseer播放状态；采样资源与模型缓存继续复用。

采样特效先推进有效时间增量，再选择绘制帧，零增量重绘不会再显露上次绘制之后偷偷推进的状态。组件的显式起始／跳转时间直接采用，不叠加当前增量。保留既有每次渲染最多0.25秒的推进上限；首次观察一个会话从当前组件的起始状态建立播放状态，不重建视口未观察到的运动轨迹。因此本阶段解决暂停／重复渲染的时钟问题，尚不支持把不同可见历史的动态视口当作完全确定性的对照。

验证包括：纯时钟的暂停、单步、会话切换、回退、非有限时间和编辑预览；实际GPU上的粒子／拖尾冻结、单步变化、回退／重启清理和恢复编辑动画；官方Effekseer示例连续30个模拟步后的重复捕获。采样特效覆盖零增量稳定、播放中显式跳转、暂停、热更新、资源恢复及重启保留资源缓存。

前端39项通过，TypeScript与前端构建通过；串行Release Runtime 246项通过、8个手动基准忽略，Host全套64项通过、6个手动基准忽略；随后新增的官方Effekseer GPU专项1项通过，补充的采样特效跳转用例单独复验通过。Debug／Release SDK与原生Release构建通过，旁置SDK摘要一致。

原生旧版对照被新增回归准确拒绝：暂停世界摘要不变，但连续4次截图的图元为423／438／446／453，像素持续变化。新版完整Frostbound保留217个粒子组件和238个采样特效组件；首次暂停6次捕获均为412图元。正常播放后再次暂停，6次捕获均为509图元、277个RenderObject，像素SHA-256均为 `2eaeebbe29f83825f694ed21b382a710aae9bc6ee977d6d75784c0f13d612421`，网格上传为0；这验证了已产生的特效保持冻结。独立固定副本的世界和像素摘要仍与第十三阶段相同。编辑、undo/redo、真实恢复文件、资源增改删、播放恢复及停止后的编辑状态恢复全部通过，控制台error为0，源场景与HEAD一致，QA程序正常退出。截图已检查；WebView缓存因EPERM保留。本阶段未测得可归因的整体FPS增益。

复现沿用 `scripts/qa-editor-performance-risk.mjs`。证据在 `tmp/docs-artifacts/editor-performance-risk/`：`phase14-before.json`（预期失败的旧版对照）、`phase14-after-final.json`、`phase14-final-validation.json`、`phase14-frontend-tests.log`、`phase14-runtime-tests.log`、`phase14-host-tests.log`、`phase14-effekseer-test.log`、`phase14-sampled-effect-test.log`及构建／SDK记录。

## 第十五阶段截图复用发布的原生世界

桌面Game截图优先使用当前请求持有的Play会话和revision，与实时视口复用同一原生世界镜像，省去重复上传完整实体快照。仅在revision过期时惰性构造该请求原有快照并重试一次；保留尺寸、会话身份和组件内容。会话失效、GPU错误及其他异常直接返回，项目／视口generation和捕获配置校验仍生效。编辑状态或无法确认原生revision的浏览器世界继续使用完整快照。

PNG响应和二进制帧共用revision回退逻辑；PNG／JPEG编码、默认截图响应及250ms最小截图间隔保持原有行为。新增测试验证正常捕获不调用快照工厂、revision 0有效、回退保留原有世界而非较新状态、重试次数有界，以及错误传播。原有共享缓冲、帧所有权、编辑Scene回退与MCP相关测试一起通过，共41项；TypeScript、前端和原生Release构建通过。

原生对照采用第十四阶段EXE和当前EXE，配套SDK相同且复制摘要一致。每轮初始暂停世界均为0.144秒、4,031实体，保留完整粒子和采样特效；850×478、187个RenderObject、412个UI图元、34次UI绘制，预热后网格上传为0。每轮6次截图，去掉2次预热取4次中位数，优化后额外复测一轮。完整世界摘要均为 `c61c3d59472d61e0dae354f871cc9d4ee43a43a4721aa63d727848c4980f73b6`，像素摘要均为 `2ea14ee0ffa7817ed746b2e9ed1911738aee55506559f9a83fa8205027471a2f`，几何／可见性／上传计数一致。

| 暂停Game截图 | 完整快照 | 原生revision | 原生revision复测 |
| --- | ---: | ---: | ---: |
| 世界同步 | 5.65285 ms | 0.41865 ms | 0.41770 ms |
| 原生渲染 | 11.45140 ms | 10.74210 ms | 10.83645 ms |
| QA客户端等待截图返回 | 228.18605 ms | 117.80740 ms | 117.00230 ms |

同步耗时独立于原生渲染耗时；客户端等待还包含截图节流、编码、IPC和Bridge传输，是本QA调用方式下的观察值。截图吞吐仍受250ms间隔约束，实时Game渲染路径未修改，不宣称游戏FPS提升。优化后的两轮初始捕获全部返回原生revision 9；播放后再次暂停的6次捕获也各自对应一个固定revision，图像稳定。默认QA要求该原生revision，旧版对照仅通过显式 `MENGINE_ALLOW_SNAPSHOT_CAPTURES=1` 放行历史完整快照路径，报告记录此设置；日常验收不设置该变量。

三轮均通过编辑、undo/redo、恢复文件、资源增改删、播放／暂停／单步／停止、已有特效冻结及固定副本验证，控制台error为0，源场景与HEAD一致，测试程序正常退出。优化后截图已检查，WebView缓存因EPERM保留。证据位于 `tmp/docs-artifacts/editor-performance-risk/`：`phase15-before.json`、`phase15-after.json`、`phase15-after-repeat.json`、`phase15-comparison.json`、`phase15-builds/*/receipt.json`及前端测试／构建日志。复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十六阶段字体缓存直接追加

命中字体现有几何缓存时，直接将独立图元副本追加到本帧数组，省去中间Vec分配和整段搬运。每个图元的字符串等字段仍复制，本帧的材质、位置及stencil修改不污染缓存。`UiFontResolver::cached_text` 保留原有公开接口；新增追加接口默认委托该方法，现有第三方resolver继续生效。Runtime字体缓存提供直接追加实现，仍先检查字体状态，保留250ms文件检查、失效处理和原有缓存容量限制。

Release同进程对照缓存命中路径，交替执行“复制为临时数组后追加”和“直接追加”，每项预热2组后取9组中位数，每组100次。目标数组提前留出容量并保留前缀图元；计时包含字体查询、图元复制和本次副本释放，不包含排版、生成、GPU提交。缓存图元为合成数据，完整字段与追加结果核对一致。

| 单条缓存图元数 | 临时数组后追加 | 直接追加 |
| --- | ---: | ---: |
| 16 | 0.001193 ms | 0.001104 ms |
| 256 | 0.023501 ms | 0.022929 ms |
| 4,096 | 0.975787 ms | 0.371655 ms |

小文本收益很小，大缓存收益不能外推到普通Frostbound界面或整体FPS。默认位图文字仍按亮点生成图元；其首次生成、图元数量和字体缓存未命中的工作量未在此阶段优化。

复现：`cargo test -p mengine-runtime --release --lib benchmark_cached_text_append -- --ignored --nocapture --test-threads=1`。原始基准在 `tmp/docs-artifacts/editor-performance-risk/phase16-font-benchmark.log`。

串行Release测试：Runtime 246项通过、9个手动基准忽略；Editor Host 65项通过、6个手动基准忽略。扩充字体回归覆盖追加前缀、空缓存命中、未命中不写入、本帧位置／材质／stencil修改后的缓存隔离，以及追加请求直接检测字体失效；现有只实现旧缓存接口的resolver回归继续通过。最终字体失效用例另行通过。Debug／Release SDK与原生Release构建通过，旁置SDK复制摘要一致。

原生QA通过编辑、undo/redo、持久恢复、外部资源增改删、播放／暂停／单步／停止和固定画面验证，控制台error为0、源场景与HEAD逐字节一致、测试编辑器正常退出。两次暂停均保持完整特效画面稳定，播放后6次截图都是509个UI图元、277个RenderObject、网格上传0，revision固定为186；截图已检查。WebView缓存因EPERM保留。

对照使用第十五阶段已验收的相同旧EXE和SDK（`phase15-after-repeat.json`），本阶段产物另存旧／新构建副本。初始暂停仍为相同完整世界和像素摘要、850×478、4,031实体、187个RenderObject、412个UI图元、34次UI绘制。每轮6次去前2次预热后，Canvas布局和文字中位数 **0.60240→0.57920 ms**，原生整帧 **10.83645→10.85690 ms**。普通场景整体基本持平，不能据此声称FPS提升。证据：`phase16-integration-tests.log`、`phase16-font-invalidation-final.log`、`phase16-after.json`、`phase16-comparison.json`、`phase16-sdk-copy.json`及构建日志，均在上述临时目录；原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十七阶段Windows材质文件检查

新增材质提取分项基准，将完整提取、唯一材质解析、源资源解析和路径构造分开测量，并区分普通帧与强制轮询帧。暂停游戏的18个唯一材质／4个Shader在普通帧解析约0.014ms，轮询帧约0.475ms；路径构造约0.003ms。当前峰值主要来自同步文件检查，继续增加解析结果缓存对该峰值帮助有限。

平台层新增 `file_modified_time`。Windows普通文件通过 `GetFileAttributesExW` 查询最后写入时间，保留100ns精度；重解析点、查询失败及无法直接处理的路径回退 `std::fs::metadata`，继续跟随链接目标。其他平台使用原有metadata。材质、材质实例和自定义Shader使用该接口；250ms轮询、显式失效、继承／错误处理与读取内容的路径均保持现有行为。依赖沿用仓库已有的windows-sys 0.61.2。

Release基准每项预热2组后取9组中位数，每组20次。世界和TransformHierarchy提前建立；每次计时前单独设置文件检查期限，计时包含提取及其临时结果释放。暂停游戏使用原生QA保存的固定世界，排除特效组件不影响本基准的MeshRenderer提取。

| 提取负载 | 普通帧之前 | 普通帧之后 | 轮询帧之前 | 轮询帧之后 |
| --- | ---: | ---: | ---: | ---: |
| 作者场景，65物体 | 0.06601 ms | 0.05881 ms | 0.11607 ms | 0.06990 ms |
| 全对象池，1,381物体／291材质 | 1.02716 ms | 1.02736 ms | 10.67818 ms | 4.05855 ms |
| 暂停游戏，187物体／18材质 | 0.16887 ms | 0.19452 ms | 0.69677 ms | 0.26755 ms |

普通帧没有稳定收益；轮询成本降低，但仍同步执行，不能据此推算整体FPS。复现：`cargo test -p mengine-runtime --release --lib benchmark_material_extraction_breakdown -- --ignored --nocapture --test-threads=1`；可用 `MENGINE_PERFORMANCE_WORLD` 指定QA输出的 `fixed-game-world.json`。证据：`tmp/docs-artifacts/editor-performance-risk/phase17-breakdown-before.log` 和 `phase17-breakdown-after.log`。

平台测试3项通过，覆盖写入时间变化、100ns精度及Unix纪元两侧、中文／空格路径、目录、硬链接、缺失文件、NUL错误、长路径及显式扩展路径。当前机器无法创建文件符号链接，测试实际创建目录junction，验证重解析点走metadata并读取目标目录时间；文件符号链接的运行验收仍受此权限限制。Runtime 246项通过、10个手动基准忽略；Host 65项通过、6个手动基准忽略，包含材质继承、删除／恢复、失效和Shader热更新。日志为 `phase17-platform-final.log`、`phase17-runtime-tests.log` 及 `phase17-integration-tests.log` 中的Host测试段。

配套Debug／Release SDK和原生Release构建通过，旁置SDK摘要一致。原生QA完成编辑、undo/redo、持久恢复、资源增改删、播放／暂停／单步／停止及特效冻结验证，控制台error为0，测试编辑器正常退出。源场景与HEAD逐字节一致，原始样例资源未改动；WebView缓存因EPERM保留。

固定世界对照第十六阶段已验收的EXE／SDK和 `phase16-after.json`：完整世界及像素摘要一致，均为850×478、4,031实体、187个RenderObject、412个UI图元、34次UI绘制，预热后网格上传0。各取6帧去前2帧后，网格／材质提取 **1.07895→0.52365 ms**，原生整帧 **10.85690→10.60730 ms**，Canvas布局／文字0.57920→0.64645ms，客户端截图等待110.69430→119.83135ms。其他阶段与传输仍有波动，不能据此声称整体FPS提升。

原生QA额外在隔离副本修改 `Ground.mmat` 和 `ClassicGround.mshader`，分别确认像素发生变化，恢复后均精确回到原始像素摘要；整个过程中世界摘要不变。资源刷新使旧截图被拒绝时，仅在原有30秒等待窗口内重试明确的canvas `NOT_READY`，其他错误直接失败；最终材质恢复经历1次重试，Shader恢复未重试。截图已检查。证据：`phase17-after-final.json`、`phase17-native-qa-final.log`、`phase17-comparison.json`、`phase17-sdk-copy.json`及构建日志，位于同一临时目录；复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十八阶段Windows纹理文件检查

平台层 `file_change_stamp` 同时返回修改时间和文件长度，普通Windows文件复用一次属性查询；目录和重解析点使用标准metadata，错误与不可直接处理的路径继续回退。已有 `file_modified_time` 保留接口与错误行为。纹理缓存将该信息映射为原有FileStamp，继续用时间和长度共同判断变化。3D材质纹理保留250ms轮询，UI纹理保留逐帧检查；未改变线性／sRGB变体、失败去重、删除／恢复及项目切换处理。

Release基准每项预热2组后取5组中位数，每组100次。Renderer、已编译帧、资源首次加载和上传均在计时外；材质测试交替测普通帧与强制轮询帧，UI测试使用真实字体解析器编译的静态图元。阶段内仅测资源同步，不计排版、绘制和GPU回读。

| 纹理同步负载 | 之前 | 之后 |
| --- | ---: | ---: |
| 作者场景，65物体／8纹理变体，普通帧 | 0.01233 ms | 0.01183 ms |
| 作者场景，3D纹理轮询帧 | 0.18292 ms | 0.04056 ms |
| 全对象池，1,381物体／213纹理变体，普通帧 | 0.12759 ms | 0.12796 ms |
| 全对象池，3D纹理轮询帧 | 4.93705 ms | 1.05933 ms |
| 作者UI，249图元／13批次／4文件纹理 | 0.07544 ms | 0.01666 ms |
| 暂停游戏UI，412图元／34批次／20文件纹理 | 0.39218 ms | 0.08196 ms |

普通帧基本持平；文件查询收益不等同于整体FPS。复现：`cargo test -p mengine-runtime --release --lib textures::sync_tests::benchmark_ -- --ignored --nocapture --test-threads=1`；暂停游戏UI同样通过 `MENGINE_PERFORMANCE_WORLD` 指定QA的固定世界。证据在 `tmp/docs-artifacts/editor-performance-risk/phase18-texture-before.log`、`phase18-ui-before.log` 和 `phase18-texture-after.log`。

平台层回归新增固定mtime下的文件长度变化、目录长度及链接目标信息核对；真实GPU纹理回归覆盖同mtime不同长度的PNG在3D线性／sRGB和UI路径重新加载。串行Release结果为Platform 3、Runtime 246、Host 65项通过，Runtime／Host分别忽略11／6个手动基准；当前Windows仍以真实junction验证重解析点回退，文件符号链接受本机权限限制。Debug／Release SDK及原生Release构建通过，旁置SDK摘要一致。证据：`phase18-platform-tests.log`、`phase18-texture-tests.log`、`phase18-integration-tests.log`、`phase18-sdk-copy.json`和构建日志。

原生对照使用第十七阶段已验收的EXE／SDK和 `phase17-after-final.json`。每轮初始暂停6帧去前2帧，完整世界和像素摘要相同，850×478、4,031实体、187个RenderObject、412个UI图元、34次UI绘制，网格上传为0，Play revision固定为9。

| 原生固定负载中位数 | 第十七阶段 | 第十八阶段 |
| --- | ---: | ---: |
| UI纹理同步 | 0.52235 ms | 0.12205 ms |
| 3D材质纹理同步 | 0.87250 ms | 0.23130 ms |
| 资源同步合计 | 2.60430 ms | 1.51725 ms |
| 原生整帧 | 10.60730 ms | 9.05225 ms |

整帧还包含其他阶段与GPU等待的波动，当前数据是固定负载观察值，不是持续FPS验收。原生QA完成编辑、undo/redo、持久恢复、外部资源增改删、播放／暂停／单步／停止和完整特效冻结，控制台error为0，测试编辑器正常退出，源场景与HEAD逐字节一致。

热更新QA覆盖材质、Shader、UI金币图标和3D队伍色纹理，分别确认画面变化，恢复后像素精确回到原始摘要，世界摘要始终不变。PNG采用同尺寸现有图像作为临时替换内容，通过临时文件原子替换隔离副本来断开硬链接；原始样例PNG与HEAD逐字节一致。材质／Shader各遇1次有界canvas `NOT_READY`重试，两项纹理未重试。截图已检查，WebView缓存因EPERM保留。证据：`phase18-after.json`、`phase18-native-qa.log`、`phase18-comparison.json`及隔离构建receipt，仍在同一临时目录；原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第十九阶段Windows共享模型源校验

共享姿态源的依赖检查在Windows使用同一文件句柄取得规范路径和metadata，减少重复打开文件。路径解析失败时回退到原有标准库调用；其他平台保持标准库实现。保留规范路径、修改时间、长度、项目边界和外部buffer检查，链接重新指向同长度／同时间文件仍会失效。短路径使用栈缓冲区，长路径按需要分配；文件句柄由RAII关闭。

Release基准对17个源采样9组，每组25次。当前共享路径的校验中位数 **1.10507→0.82280 ms**，减少约26%；两侧均为17次源校验，额外主文件metadata读取为0。两版均取基准输出的 `shared_ms` 字段。复现：`cargo test -p mengine-runtime --release --lib benchmark_pose_source_validation -- --ignored --nocapture --test-threads=1`。证据：`tmp/docs-artifacts/editor-performance-risk/phase19-source-before.log` 和 `phase19-source-after-final.log`。

串行Release库测试Assets 95、Runtime 246、Host 65项通过，Runtime／Host分别忽略11／6个手动基准。覆盖中文／空格／点路径、目录、硬链接、固定mtime下长度变化、缺失文件、NUL错误、长路径和显式扩展路径；共享源回归包含并发复用、外部buffer删除／恢复、项目边界及真实目录junction重定向。日志为同目录的 `phase19-assets-tests.log`、`phase19-runtime-tests.log` 和 `phase19-host-tests.log`。

Debug／Release SDK及原生Release构建通过，旁置SDK摘要一致。原生验收完成编辑、undo/redo、持久恢复、外部资源增改删、播放／暂停／单步／停止及完整特效冻结，控制台error为0，测试编辑器正常退出。源场景、测试PNG和GLB均与HEAD逐字节一致。

固定世界对照第十八阶段已验收的EXE／SDK和 `phase18-after.json`；每组6帧去前2帧，完整世界和像素摘要一致，850×478、4,031实体、187个RenderObject、412个UI图元、34次UI绘制、网格上传0，Play revision固定为9。

| 原生固定负载中位数 | 第十八阶段 | 第十九阶段 |
| --- | ---: | ---: |
| 模型源校验 | 0.96345 ms | 0.83550 ms |
| 网格缓存同步 | 1.15375 ms | 1.02810 ms |
| 资源同步合计 | 1.51725 ms | 1.38445 ms |
| 原生整帧 | 9.05225 ms | 8.94735 ms |

整帧及客户端截图等待仍有波动，当前固定负载观察值不能代替持续FPS验收。原生QA新增TownHall模型位置热更新：只修改隔离GLB的POSITION顶点和对应边界，重新打包JSON及二进制块，以原子替换断开硬链接，最后恢复原始字节。模型、材质、Shader、UI图标和3D纹理五项均确认画面变化及精确像素恢复，世界摘要不变。材质／Shader／3D纹理各遇1次有界canvas `NOT_READY`重试，模型未重试。暂停画面已检查，WebView缓存保留。

证据位于 `tmp/docs-artifacts/editor-performance-risk/`：`phase19-after.json`、`phase19-native-qa.log`、`phase19-comparison.json`、`phase19-final-validation.json`、`phase19-sdk-copy.json`及构建日志。复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第二十阶段层级变换结果表

TransformHierarchy在一次构建内直接填充最终节点表，解析祖先时以无效节点标记尚未完成的路径，循环引用仍使整条分支失活。返回前所有已访问的存活节点均完成解析，免去状态表到结果表的再次分配、哈希和复制。公开查询接口、变换组合次序、非均匀缩放／剪切、无Transform父节点、失活祖先和实体generation检查保持原有语义；每次构建独立读取当前World。

Release基准每组100次构建并释放结果，预热2组后取9组中位数，场景加载在计时外。作者场景／全部对象池使用Main.mscene，暂停游戏使用第十九阶段完整世界快照；子集从有有效Transform的实体中取16个，并验证包含祖先的结果与完整构建一致。

| 层级构建负载 | 之前 | 之后 |
| --- | ---: | ---: |
| 作者场景，3,812实体／271个有效Transform | 0.20418 ms | 0.15026 ms |
| 全对象池激活，3,812实体／2,043个有效Transform | 1.96603 ms | 0.96719 ms |
| 暂停游戏，4,031实体／395个有效Transform | 0.22385 ms | 0.16064 ms |
| 作者场景，16实体子集及祖先 | 0.00428 ms | 0.00311 ms |
| 全对象池，16实体子集及祖先 | 0.00429 ms | 0.00299 ms |
| 暂停游戏，16实体子集及祖先 | 0.00426 ms | 0.00289 ms |

复现：`cargo test -p mengine-runtime --release --lib benchmark_transform_hierarchy_build -- --ignored --nocapture --test-threads=1`，通过 `MENGINE_PERFORMANCE_WORLD` 指定QA输出的 `fixed-game-simulation-world.json`。证据为 `tmp/docs-artifacts/editor-performance-risk/phase20-hierarchy-before.log`、`phase20-hierarchy-after.log`及 `phase20-hierarchy-comparison.json`。结果仅代表层级构建CPU成本。

串行Release库测试Core 27、Physics 17、Script（V8）39、Runtime 246、Editor Host 65项通过，分别忽略3／0／3／12／6个手动基准。新增核心回归验证自循环、双节点循环及其下游节点、失效父实体的槽位复用、逆序／重复请求和父子关系修复后的再次构建；既有祖先失活／恢复、稀疏子集、旋转缩放和无Transform父节点测试通过。日志为同目录的 `phase20-core-tests.log`、`phase20-physics-tests.log`、`phase20-script-tests.log`、`phase20-runtime-tests.log` 和 `phase20-editor-host-tests.log`。

Debug／Release SDK和原生Release构建通过，旁置SDK摘要一致。隔离原生QA完成编辑、undo/redo、持久恢复、外部资源增改删、播放／暂停／单步／停止及完整特效冻结；五类材质／Shader／纹理／模型热更新均改变画面，恢复后像素精确还原，控制台error为0，测试编辑器正常退出。源场景、测试PNG及GLB与HEAD逐字节一致，暂停截图已检查。

对照第十九阶段已验收的EXE／SDK和 `phase19-after.json`，每组初始暂停6帧去前2帧；完整世界和像素摘要一致，850×478、4,031实体、187个RenderObject、412个UI图元、34次UI绘制、网格上传0，Play revision为9。

| 原生固定负载中位数 | 第十九阶段 | 第二十阶段 |
| --- | ---: | ---: |
| 层级变换构建 | 0.44720 ms | 0.36205 ms |
| 帧编译合计（含层级） | 1.78415 ms | 1.64365 ms |
| 原生整帧 | 8.94735 ms | 9.02015 ms |

本轮确认层级构建成本下降，整帧仍受其他阶段和GPU等待波动影响，未观察到整体帧耗时改善。证据在同一临时目录：`phase20-after.json`、`phase20-native-qa.log`、`phase20-comparison.json`、`phase20-final-validation.json`、`phase20-sdk-copy.json`及构建日志。原生复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第二十一阶段嵌套布局测量复用

每次UI收集创建独立的布局树，按LayoutGroup实体和测量宽度的精确浮点位缓存子树尺寸。父布局初测、宽度重测及ContentSizeFitter共用同帧结果，缓存随本次收集释放。普通图片／文字叶节点直接测量；检测到循环布局后清空并停用本次缓存，保留基于当前祖先集合的回退结果。

基准使用真实字体缓存，场景加载、层级构建和首次字体预热在计时外；每组50次生成并释放UI结果，预热2组后取9组中位数。单独测量父子索引成本，用于区分全世界索引和布局生成。四组修改前后的完整RuntimeUiFrame摘要、图元数及控件数一致。

| UI生成负载 | 之前 | 之后 |
| --- | ---: | ---: |
| 作者场景，3,812实体／249图元 | 0.13950 ms | 0.15442 ms |
| 暂停游戏，4,031实体／412图元 | 0.23618 ms | 0.24155 ms |
| 水平布局，2,000图片／控件 | 3.05775 ms | 2.84330 ms |
| 7层嵌套布局＋ContentSizeFitter，9实体／1图元 | 0.44043 ms | 0.03291 ms |

收益集中在重复测量的嵌套布局，普通Frostbound场景没有稳定收益。基准不包含GPU绘制或IPC；父子索引仍约0.06～0.08ms。复现：`cargo test -p mengine-runtime --release --lib benchmark_ui_collection_breakdown -- --ignored --nocapture --test-threads=1`，用 `MENGINE_PERFORMANCE_WORLD` 指定完整暂停世界。证据位于 `tmp/docs-artifacts/editor-performance-risk/phase21-ui-before-final.log`、`phase21-ui-after-final.log` 和 `phase21-ui-comparison.json`。

串行Release验证Runtime 249项、Editor Host 65项通过，分别忽略13／6个手动基准。新增测试覆盖50／100宽度下不同的文本换行高度、相同宽度重复测量、下一帧文字／激活变化、循环子树的祖先回退及深层字体测量次数；七层子树结果与不使用缓存时相等，字体测量调用少于四分之一。证据：`phase21-runtime-tests.log`、`phase21-editor-host-tests.log`。

Debug／Release SDK和原生Release构建通过，旁置SDK摘要一致。完整隔离样例通过编辑、undo/redo、持久恢复、外部资源变化、播放／暂停／单步／停止及特效冻结；材质、Shader、UI纹理、3D纹理和模型热更新均改变画面，恢复后像素精确一致，控制台error为0，测试编辑器正常退出。源场景、测试PNG及GLB与HEAD逐字节一致，暂停截图已检查。

对照第二十阶段已验收的EXE／SDK和 `phase20-after.json`，初始暂停各6帧去前2帧，完整世界和像素摘要一致；850×478、4,031实体、187个RenderObject、412个UI图元、34次UI绘制、网格上传0、Play revision 9。Canvas布局／文字中位数0.61960→0.68570ms，整帧9.02015→9.09005ms，未证明普通场景提速。该固定负载没有LayoutGroup；七层布局收益由上述CPU基准及字段一致性验证，原生对照覆盖既有渲染和交互回归。

原生证据：同目录的 `phase21-after.json`、`phase21-native-qa.log`、`phase21-comparison.json`、`phase21-final-validation.json`、`phase21-sdk-copy.json`及构建日志；复现沿用 `scripts/qa-editor-performance-risk.mjs`。

## 第二十二阶段稀疏物理候选与层级准备

World提供保序的类型读取候选查询。请求组件的成员总数不超过存活实体数的四分之一时，使用已有组件成员索引；成员较密或World曾登记自定义Any投影类型时，使用完整实体扫描。返回值是候选集合，调用方继续按真实组件类型和激活状态筛选。完整扫描分支不会构造或排序未使用的索引结果，兼容快照中的显式实体顺序。

2D／3D物理每个子步据此构建候选及祖先层级，并收集刚体／碰撞体定义。祖先的旋转、缩放、失活、无Transform中间节点、循环与实体generation仍由既有TransformHierarchy处理；写回使用同一子步的父世界矩阵。删除组件后仍清理旧Rapier对象，接触与触发器事件、TargetJoint2D和求解器保持既有流程。没有跨帧变换缓存。

基准包含4,104实体、8级共享祖先链，以及8／4,096个物理体，分别测量顺序遍历与显式逆序快照。比较范围是层级构建与物理定义收集，包含结果释放，不含Rapier求解、脚本、渲染和IPC。修改前后在同一进程交错运行，每组50次，预热2组后取9组中位数；定义、刚体字段、世界变换和父世界变换摘要一致。

| 物理准备负载 | 之前 | 之后 |
| --- | ---: | ---: |
| 2D，8物理体，默认顺序 | 1.40925 ms | 0.00402 ms |
| 2D，4096物理体，默认顺序 | 3.14749 ms | 3.15500 ms |
| 2D，8物理体，显式逆序 | 1.21660 ms | 0.00421 ms |
| 2D，4096物理体，显式逆序 | 3.09284 ms | 3.08546 ms |
| 3D，8物理体，默认顺序 | 1.13894 ms | 0.00367 ms |
| 3D，4096物理体，默认顺序 | 2.36903 ms | 2.37795 ms |
| 3D，8物理体，显式逆序 | 1.14818 ms | 0.00379 ms |
| 3D，4096物理体，显式逆序 | 2.35395 ms | 2.37108 ms |

稀疏场景省去无关实体的层级和组件读取，密集场景的差异小于1%。上述是CPU准备阶段结果，不是整帧或FPS。

空物理场景在原实现中已有提前返回，本阶段不将直接准备函数的空场景基准解释为空闲Play收益。Frostbound当前作者场景没有物理组件，原生Frostbound验收用于编辑器功能与画面回归，不用于证明该场景的FPS提升。

复现：`cargo test -p mengine-physics --release --lib benchmark_physics_preparation -- --ignored --nocapture --test-threads=1`。同进程历史实现对照脚本和原始日志位于`tmp/docs-artifacts/editor-performance-risk/phase22-interleaved.cjs`与`phase22-physics-interleaved.log`，历史实现固定为提交`60f3419`。原生物理验收使用`scripts/qa-editor-sparse-physics.mjs`，完整编辑器验收沿用`scripts/qa-editor-performance-risk.mjs`。

串行Release库测试Core 28、Physics 19、Runtime 249、Editor Host 65项通过，分别忽略3／2／13／6个手动基准。新增测试覆盖稀疏与密集候选、失活实体、显式逆序、删除／槽位复用、自定义类型后来改变Any投影，以及两种物理的旋转缩放祖先、无Transform父节点、重新挂接、组件移除和失效父generation。既有2D边／多边形、TargetJoint2D、质量、3D球体落地和触发器进出测试继续通过。

独立原生场景包含4,106实体，其中4,096个只有Transform；两套刚体分别通过缩放父节点和无Transform中间节点使用2D／3D求解器。每帧真实Play单步后捕获对应worldRevision的simulationStages，采8帧去前2帧，对余下6帧取中位数：物理与碰撞回调阶段 **1.68225→0.03915ms**，模拟步骤合计 **2.02825→0.40440ms**。此场景使用空onTick，仅用于定位物理准备开销，不能换算成真实游戏FPS。

两版本均验证下落、落地、局部坐标写回、4,096个无关实体不变、Stop恢复及重开Play重现。源场景、最终刚体变换和截图像素完全一致；截图已检查，控制台error为0，测试编辑器正常退出。证据为同目录的`phase22-physics-native-before.json`、`phase22-physics-native-after.json`、`phase22-physics-native-comparison.json`及截图。

Debug／Release SDK与原生Release构建通过，EXE旁配套SDK摘要一致。完整Frostbound隔离项目通过编辑、undo／redo、持久恢复、外部资源增改删、播放／暂停／单步／停止和特效冻结；材质、Shader、UI纹理、3D纹理、模型热更新后画面均变化，恢复后像素精确还原。控制台error为0，测试编辑器正常退出，WebView缓存因EPERM保留。源Main.js、场景及被验证PNG／GLB与HEAD逐字节一致。

同一当前样例的前后两轮固定负载为4,029实体、187个RenderObject、412个UI图元、34次UI绘制、网格上传0、Play revision 9；完整世界和像素摘要一致，截图已检查。普通Frostbound原生整帧中位数9.05215→9.09065ms，未观察到整帧提速；其物理为空，收益以独立物理场景为准。对应证据为`phase22-before.json`、`phase22-after.json`、`phase22-comparison.json`、`phase22-final-validation.json`、`phase22-sdk-copy.json`及构建／测试日志。

## 第二十三阶段原版地形分块与水动画发布

原地图导入后的地面、悬崖／坡道和水面按区块与材质合并GLB，默认32×32格，也支持8和16。保留原始192×96或96×96地形尺寸及高度；地表图集复用源变体与四角透明掩码，水动画只在源动画帧变化时更新材质参数，避免每个模拟步重复发布相同值。项目可直接在原生Editor打开，生成与来源维护见[原版地形说明](designs/frostbound-realms/original-terrain-scene.md)。

Booty Bay同一相机、源水帧与网格几何，分别使用16格和32格区块。每轮原生截图采6帧，去掉前2帧后取4帧中位数：

| 指标 | 16格区块 | 32格区块 |
| --- | ---: | ---: |
| 实体 | 179 | 54 |
| RenderObject／网格 | 177 | 52 |
| Frame compile | 0.30485 ms | 0.26930 ms |
| 原生截图渲染 totalMs | 10.06100 ms | 5.93825 ms |
| 对应模拟步骤 simulationMs | 0.09930 ms | 0.09290 ms |

两者顶点133,615、三角形75,867，预热后网格上传均为0；全景PNG逐字节相同，SHA-256为`6a47df893f53f6e93754e95f595ccf1f562dad7bd2e1994daadaeaf4305c73ca`。32格方案减少约70.6%的渲染对象。时间是本机两轮截图渲染采样，包含GPU及读回波动，不能换算成持续游戏FPS，也不能证明现有Frostbound主场景提速；不同视角的剔除收益需另行测量。

8组地形测试通过，验证原始拓扑、四向过渡占用、全部普通崖壁模式与变体、纹理混合、输入不变性及非法材质槽。两图全部输出网格和接缝通过独立几何检查，水深纹理与源float32逐位一致。客户端测试覆盖真实运行时ID映射、15 FPS发布、相同帧无命令、暂停与重开。两图原生加载、动画画面变化、Stop恢复与重开像素重现通过，控制台error为0，隔离Editor正常退出。已检查全景与斜视近景，默认相机适配两种地图比例。

沿用第二十二阶段的已验证原生EXE与SDK，本阶段不改引擎二进制、主样例Main.js或Main.mscene。原版地图单位、装饰、JASS和对局寻路尚未接入，生成项目是地形消费路径。证据位于`tmp/docs-artifacts/frost-original-terrain/`：`booty-bay-native-validated16.json`、`booty-bay-native-validated32.json`、`validated/chunk-comparison.json`、`amazonia-native-camera-fit.json`及几何报告。最终项目位于`camera-fit/`；Booty Bay与已测项目的所有运行资源逐字节一致，Amazonia更新相机后单独完成原生复验。来源收据核对当前脚本摘要，验证结果见`camera-fit/final-validation.json`。

## 第二十四阶段脚本命令跨桥批次

V8／QuickJS 增加 `engine.pushCommandsJson(json): boolean`，一次传递 JSON 命令数组。op 在首字段的 `setComponent` 直接读取字段和组件载荷，避免先扫描原始片段再解析载荷；其余排列／命令回放已读前缀给通用解析器。全部解析成功后按顺序追加队列。非法数组或任意非法命令使本批全部拒绝，既有队列不变；空批次成功。单条命令、批次与精灵命令共用原队列，脚本帧失败时一起清空。成功入队不表示实体存在或世界提交成功，精确边界见[运行脚本说明](runtime-scripting.md)。

原版装饰动画按改变帧收集命令，只调用一次批次接口并序列化一次数组；未变化帧不跨桥，旧 Host 保留逐条路径。只有发送成功后记录发布帧，避免被拒批次阻止下一次重试。CLI 新项目声明与共享样例类型包含新接口，主 Frostbound 场景和脚本未修改。

本次必要检查：V8 和 QuickJS 的 `cargo check -p mengine-script --lib` 通过，后者带 `--no-default-features --features quickjs-runtime`；CLI `tsc --noEmit` 和 JS 语法通过。客户端定向检查通过，逐条与批次产生完全相同的命令值／顺序，三个变化帧分别为6／2／6条命令；批次路径每变化帧只有一次调用，拒绝后可重新发布。同次记录只能证明调用数与客户端行为，不是帧时间收益。

最终5个 Rust 行为用例与1个手动基准在双 VM 下通过，覆盖精确整数／组件载荷、通用解析兼容、无部分入队、交错顺序、失败帧清理与宿主隔离。此前整库检查 V8 为43通过、4忽略；QuickJS为42通过、1失败、4忽略，失败为TCP测试接收套接字继承非阻塞模式。夹具显式设置阻塞后，该失败项在两种VM下均重测通过；后续批次解析调整仅重测受影响用例，不重复无关用例。新SDK、原生EXE及真实Play检查通过，详见 [B001](testing-batches.md)。

快速检查日志保留在 `tmp/docs-artifacts/testing-batches/B001-script-check-{v8,quickjs}.log`、`B001-cli-typecheck.log`；批次生成项目必须使用最终脚本，已有 `4bf357b` 的 Booty Bay 冒烟产物保留为来源对照。

## 第二十五阶段嵌入视图共享父链

每次嵌入视图提取使用局部根筛选器，缓存共享祖先到指定根的距离。主画面不限制根时直接通过，根本身和直接子节点保持快速路径；通常只访问一次的网格叶节点不加入缓存。缓存只存在于一次不可变世界提取内，后续帧／视图重新创建，重设父级和实体generation沿用既有组件读取。

保留原先包含根自身、最多128次父链接跳转的语义。距离用于判断较深候选是否越界；查询截断时不将未知后缀标为不可达，以免把距根128层的后续节点错误剔除。循环及失效父实体仍在有限步数内终止。主相机提取复用与UI-only独立提取共用筛选器，对象顺序、材质副本与摄像机专属修改规则不变。

`cargo check -p mengine-runtime --lib` 通过。B001合并执行 frame_compiler 测试10项通过、4个手动基准忽略；共享父链基准另行通过。覆盖查询顺序、260层链、128层边界、循环、旧generation、缓存范围、重设父级、失活、主相机／UI-only及相机副本隔离。该项先作为B001-03提交，随后与前两项共用一次SDK／原生构建和Frostbound回归。

合并验证沿用已有同帧对象复用、失活、主相机／UI-only和相机副本隔离用例，复现命令见[批次台账](testing-batches.md)。快速编译日志：`tmp/docs-artifacts/testing-batches/B001-runtime-check.log`。

### B001 性能实测

单条→批量跨桥微基准中位数（ms），对应1／32／256／1024条命令：V8为0.003230→0.003175、0.035360→0.032975、0.283945→0.281435、1.084530→1.106795；QuickJS为0.004810→0.004910、0.121935→0.116690、1.005940→0.943595、3.934865→3.591850。V8基本持平，QuickJS大批约快9%；不代表世界应用或整帧收益。

共享父链4,096候选、9组中位数（ms）：深度1为0.0809167→0.1024933，深度16为1.15394→0.14575，深度64为4.7246167→0.17973。逐项筛选结果相同，浅层增加约0.02ms。

同一新EXE的原生截图总耗时中位数：Booty地形4.71175ms、装饰批量25.18910ms、装饰单条22.84035ms、Amazonia装饰33.47670ms；未证明原生整帧提速。采样包含GPU与读回波动。原始数据与版本摘要位于 `tmp/docs-artifacts/testing-batches/B001/`。
