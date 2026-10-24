# 性能风险与实施进度

后续实现按[批次测试台账](testing-batches.md)执行：逐任务提交代码和资产，登记待测内容，默认累计3个功能／修复任务后合并验证。下文已完成阶段的历史测试结果保留；其中的全量命令不作为每次提交的必跑清单。

2026-10-24：编辑器性能与验证已推进至第五十六阶段，覆盖资源索引、撤销／恢复、脚本桥、ECS查询、空间索引、视口回读、网格／材质／纹理处理、UI遍历与图元存储、按需上传软裁剪数据、密集UI批次构建、固定负载采样、Play特效时钟、截图原生世界复用、字体缓存直接追加、Windows材质／纹理文件检查、共享模型源校验、层级变换构建、嵌套UI布局测量复用、稀疏物理候选查询、原版地形分块及编辑器层级／选择同步。保留 Rust + TypeScript + Tauri 技术栈。下列基准来自 Frostbound 3,812 实体场景或注明的压力数据，不能换算成实际游戏 FPS。

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
- [ ] **逐物体绘制及准备。** 第七阶段让主 pass／阴影 pass 复用单次提交的材质键和错误状态，减少纹理键字符串复制、Shader指纹计算与缺失纹理检查。第二十六阶段消除同一pass内重复的管线／纹理／网格绑定，阴影与环境共享绑定只提交一次；定向GPU对照及Amazonia原生Scene/Game、播放恢复验收通过；嵌入菜单视图复用同EXE的已有验证。通用实例化、材质哈希查找和临时Vec／draw order复用仍待评估；绘制次数及透明物体顺序保持不变。
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

原地图合并压力输入已就绪：Amazonia地形／水面／装饰／单位共7,403实体，项目`tmp/docs-artifacts/warcraft-map-tests/amazonia-complete-visuals/project/`。组合播放验收报告`B001/original-map-composition-1792733463253.json`通过；打开加快照5.01秒，五次截图总耗时29.47–55.06ms，包含冷暖帧与不同视角，不能当作性能对照。后续优化可复用此输入，避免只用589实体的单位独立场景。

性能采样必须逐帧对齐：原单位报告`B001/original-units-1792732411819.json`的13帧中，仅一帧含来源校验（72次、3.8961ms），该帧mesh sync为4.9587ms；其他帧不含此节点。只对出现的子节点取中位数再与全部父节点中位数比较，会造成虚假热点关系。快照差异路径已做共享指针／结构比较，本轮未据单帧耗时添加缓存或宣称编辑器提速。

## 第二十六阶段大图绘制状态复用

Amazonia组合场景的7,403实体报告`B001/original-map-composition-1792733463253.json`在一个轮询帧中记录来源校验11.21ms、网格提取4.65ms、世界通道提交2.48ms。独立依赖统计发现263个放置模型有263个独立文件依赖，没有重复文件可合并。本阶段针对已确认的逐物体重复GPU绑定，未改变来源校验节奏或热更新语义。

`mengine-rhi/src/renderer.rs`在每个shadow／forward pass内记录最后实际绑定的资源引用，仅资源身份变化时调用纹理、顶点和索引绑定；forward同时复用管线，阴影采样与环境绑定只设置一次。所有forward及诊断管线使用同一显式布局。缓存止于pass，嵌入视图与下一帧重新开始；逐物体uniform动态偏移、剔除、draw顺序、透明排序及绘制数量保持原行为。生产代码没有跨帧资源缓存或可配置开关；测试编译保留重复绑定路径供GPU对照。

定向检查：RHI库编译通过；材质提交2项、独立嵌入视图1项GPU测试通过，包含实际像素逐字节对照、阴影／主通道、重复及切换资源、透明／加法／alpha裁剪、合法自定义Shader与缺失纹理诊断、纹理替换、缺失与剔除物体、逆序输入、空场景及多视图目标恢复。GPU验证范围没有错误。仅执行受影响用例，没有全库测试、Editor重建或原地图原生QA重跑。

同进程交替重复／复用两条路径，128×128目标，2组预热后9组、每组4帧取中位数；每帧读回像素与基准一致。共享材质及网格的CPU编码耗时如下，包含驱动提交前的编码工作，不能换算为原地图FPS：

| 物体数 | 阴影重复→复用 ms | 世界重复→复用 ms |
| --- | --- | --- |
| 64 | 0.058625→0.054675 | 0.073425→0.066475 |
| 1,024 | 0.516975→0.408950 | 0.587300→0.469725 |
| 4,096 | 2.806450→2.147650 | 3.299325→2.454825 |

另补4,096物体的混合材质／纹理／网格输入，包含透明、裁剪、自定义Shader和缺失纹理诊断；同样交替测量并逐帧核对像素，阴影2.980450→2.749225ms，世界4.879525→4.351100ms。此项只运行新增混合输入，沿用前三组共享资源结果。

证据为`tmp/docs-artifacts/testing-batches/B001-draw-bindings-{check,tests,views,benchmark,mixed}.log`。本变更登记为B001-01大图性能修复，下一次相关Editor构建合并验证原地图Scene／Game／嵌入视图及Play恢复，不为此单项立即重建整套或重复旧QA。后续地图加载进度构建已更新原生EXE；同版本原生集成结果见本阶段补验。原生收益仍需同一输入下的新旧版本对照。

```powershell
cargo test -p mengine-rhi --release --lib material_submission_tests -- --test-threads=1
cargo test -p mengine-rhi --release --lib live_scene_views_render_independently_and_restore_main_target -- --test-threads=1
cargo test -p mengine-rhi --release --lib benchmark_reused_draw_bindings -- --ignored --nocapture --test-threads=1
# 混合材质／纹理／网格压力输入：设置 MENGINE_DRAW_BINDING_MIXED=1 后运行上一条基准
```

### 第二十六阶段原生补验

复用后续地图加载进度构建的Editor（SHA256 `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`）。构建日志 `B001/map-progress/native-build.log`、RHI编译指纹2026-10-23 16:05和EXE生成时间20:05，均晚于绘制绑定提交 `76bf8ac`。本轮没有重复构建、重新转换地图或改动用户未提交的资产代码。

`qa-frost-original-map-composition.mjs` 支持 `MENGINE_MAP_PROFILE_FRAMES=12`，记录源场景／脚本摘要、采样场景与逐帧像素摘要。原版Amazonia输入7403实体、2452装饰、96可渲染单位通过Scene/Game显示、三层动画、暂停、Stop恢复及确定性重新播放；12次固定Game截图像素一致，控制台0 error。原生编辑器正常退出；WebView锁缓存保留。Scene截图通过截图接口，Scene性能来自 `profiler.get_samples`；Game截图返回其自身原生profile，二者不混作同一种逐帧采样。

报告 `tmp/docs-artifacts/testing-batches/B001/original-map-composition-1792762023404.json`，截图已目视核对；首次脚本错误把Scene请求设为Game专用profiling参数，失败报告 `original-map-composition-1792761964519.json` 保留，修正参数后复验。已有同EXE的Warcraft主菜单及三页选项报告覆盖RawImage嵌入模型视图，不重复运行。独立GPU测试仍是阴影／透明／自定义Shader／纹理替换的像素对照证据，本原图输入没有可见阴影物体，不扩大其覆盖声明。

固定Game采样取后10帧中位数：截图总耗时29.672ms；来源校验10.177ms、网格缓存同步12.443ms、对象／材质提取3.920ms、Frame compile7.085ms、世界通道编码2.493ms。来源校验是网格同步子节点，对象提取是Frame compile子节点，不能相加为独立总成本。10帧均包含来源校验；截图间隔触发文件轮询，不能换算成实时FPS。2746个可见提交物体、0次mesh上传，汇总 `B001/draw-bindings-native-summary.json`。本次没有新旧EXE同输入对照，不声称原生提速。

下一步先细分来源路径身份／依赖检查与对象材质开销。原图4745个MeshRenderer有339种key、4719个PropertyBlock；所有key已使用正斜杠且无首尾空白，现有owned String输出仍需复制。未据总提取耗时直接增加字符串缓存；继续保留热更新、路径身份、实体generation、层级与相机专属billboard行为。


## 第二十七阶段来源校验的设备路径

原版Amazonia作者场景的263个动画GLB均没有外部buffer／image依赖，263次请求对应263个不同文件。依赖合并不能减少该输入的文件查询。分段计时确认Windows规范化DOS路径查询是主要成本之一；本阶段保留路径规范化，每次轮询重新打开文件，从同一handle核对最终设备路径、文件类型、长度和mtime。

来源加载时记录规范化DOS路径及可用的规范化NT设备路径。只有两个名称的卷内目录／文件组件完全一致且设备为标准HarddiskVolume数字名称时才保留设备身份；顺序查询期间改名造成的混合名称、挂载目录／SUBST路径前缀差异及未知设备命名均回退DOS校验。请求绝对DOS组件与记录路径一致时使用设备路径，省去每次查询盘符映射；盘符前缀按Rust的Windows路径规则比较，分隔符和verbatim前缀兼容。不同文件名大小写、父目录遍历、别名和UNC请求走原规范化DOS路径检查；缺少设备路径、设备查询不支持或失败时保留回退。未缓存文件handle、当前metadata或验证结果，不改变250ms轮询、新姿态立即校验、项目切换或显式失效规则。首次加载多一次设备路径查询，记录随共享来源释放。

Windows API依据：[GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew) 的规范化路径与VOLUME_NAME_NT语义。生产校验始终使用规范化文件名；设备路径包含卷设备和最终文件路径。mtime与长度仍是既有内容失效规则，不新增内容hash保证。

同进程交替执行旧DOS校验、设备路径校验和独立分段计时，2组预热、9组测量，每组5轮、每轮263文件，逐项比较路径／长度／mtime。旧路径13.26196ms，设备路径9.34456ms，减少29.54%。分段中DOS路径5.92442ms、设备路径2.40018ms、打开5.05948ms、metadata0.69820ms、关闭1.71416ms；分段计时执行了两种路径查询，不能与未插桩整轮结果相加比较。该结果仅为本机NTFS文件来源校验，不是整帧、持续FPS或原生Editor提速证明。

快速检查覆盖共享来源并发复用、外部依赖修改／删除／恢复、项目边界、主文件替换、目录alias重新指向、已记录canonical目录本身被替换为junction、硬链接别名、文件名大小写、盘符／UNC筛选、长路径和错误回退。收尾定向复验9项通过、0失败、1项手动基准忽略，包含顺序查询混合名称拒绝及挂载目录／未知设备回退。收尾修改只约束加载时记录设备身份的条件，已测轮询路径保持不变；不重复性能基准。Runtime的3项来源验证用例通过，覆盖250ms缓存周期、新姿态立即检查、main／buffer热更新、移除恢复和render-only兼容。无全库测试或Editor重建。

复现命令：

```powershell
cargo test -p mengine-assets --release --lib gltf_pose::shared -- --test-threads=1
$env:MENGINE_METADATA_PROJECT = '<保留的原地图工程目录>'
cargo test -p mengine-assets --release --lib benchmark_dependency_metadata_steps -- --ignored --nocapture --test-threads=1
cargo test -p mengine-runtime --release --lib source_validation_tests -- --test-threads=1
```

原始证据：`tmp/docs-artifacts/editor-performance-risk/metadata-{final-tests,identity-tests,dos-prefix-test,identity-benchmark,runtime-tests}.log`、`metadata-identity-summary.json` 与 `source-validation-inputs.json`。之前的路径查询分解实验保留在同目录。待下次相关SDK／Editor集成构建验证实际地图Scene／Game／嵌入视图、热更新与Stop恢复；UNC／网络盘／挂载卷和Linux／macOS实际文件系统尚未实测。


## 第二十八阶段网格对象输出分配

原版Amazonia作者场景输出2747个对象。分阶段诊断中，组件／层级查找约1.043ms、材质构造与复制约1.026ms、属性覆盖约0.251ms、对象组装约0.832ms；分阶段流程额外创建中间数组，不能作为原生帧成本。对应4719个属性块均无自定义参数／纹理覆盖，未据此增加跨帧属性缓存。

`collect_mesh_objects` 在当前不可变World／Hierarchy中先收集通过活动状态、根节点和类型检查的紧凑借用输入，一次分配最终RenderObject数组。避免每轮逐渐扩容搬移大型对象；材质仍按本次提取解析一次，再为每个对象独立应用覆盖。实体顺序、项目／文件热更新、根节点筛选、相机专属修改与失败材质处理保持原规则，不延长任何输入的生命周期。

同进程交替旧输出分配与新实现，2组预热、9组测量，每组20轮。最终基准3.353525ms降至2.515425ms，减少24.99%；逐对象比较网格key、model、投影阴影标志和全部材质字段一致。RenderObject为800字节，最终输出容量4096降至2747，输出数组占用减少1,079,200字节；该数字不包含新增借用输入数组，也不是进程峰值内存。输入哈希与完整样本见 `tmp/docs-artifacts/editor-performance-risk/mesh-output-summary.json`。

`cargo test -p mengine-runtime --release --lib frame_compiler -- --test-threads=1`：10通过、0失败、6项手动基准忽略。覆盖材质热更新／私有属性覆盖、池激活／父变换／实体slot复用、根深度／循环、多视图对象私有性、主相机和UI-only帧、视图背景策略。无全库测试。手动诊断入口为benchmark_large_map_material_steps；对照为benchmark_mesh_output_allocation，均需设置MENGINE_MATERIAL_PROJECT到保留地图工程。

待与第二十七阶段合并构建原生Editor，验证同输入地图Scene／Game、嵌入视图与Play／Stop恢复。上述CPU基准不是整体帧耗时或持续FPS证明。原始日志为material-stages.log、mesh-output-tests.log、mesh-output-allocation-final.log，仅保留在临时目录。


### 第二十七、二十八阶段原生合并验证

两项代码提交0b9c6f4、30eb1a2共同构建一次Editor：`cargo build -p mengine-editor-tauri --release --features custom-protocol`，1分53秒，EXE SHA256 `544fb7fc2ee301653197ab39153814e0d83f168d8f5432c96a23e402ecf243fa`。复用已构建的前端；原生只有既有world_from_snapshot未使用警告。没有全库测试、SDK重建或地图重新转换。

保留原地图输入通过Scene／Game、三层动画、暂停稳定画面、12次固定Game像素一致、Stop完整恢复与确定性重启，7403实体／2452装饰／96渲染单位、0 error，进程正常退出。报告 `B001/original-map-composition-1792767053644.json`。同EXE主菜单嵌入模型／相机视图报告 `war3-ui/native-1792767119833.json` 通过、0 error；截图已目视核验。锁定的WebView缓存保留。两项实现已进入该EXE；新的真实热更新／UNC／挂载变化仍以待测记录为准。

固定Game后10帧中位：总27.7694ms，来源校验8.30915ms，对象／材质3.80875ms，Frame compile7.095ms，世界通道编码2.55315ms。与历史同场景／脚本／分辨率的29.67195ms、10.1771ms、3.9204ms对照，固定像素哈希均为e6394c096b674ef9acab0c908c40278f3fad0f06da339c101cf4d5728957f471。历史与新样本并非同场交替的新旧EXE测量，不将差值当作稳定原生提速比例。独立CPU测试的24.99%也不能代替原生对象提取结果；截图间隔使每帧触发来源轮询，不能换算持续FPS。汇总 `B001/phase27-28-native-summary.json`，原始构建／运行日志 `editor-performance-risk/phase27-28-native-*.log`。


## 第二十九阶段普通编辑快照复用

App 的普通 Edit 刷新复用已经生成的 presentation entities，避免再为 Timeline 深拷贝一次完整世界。动画预览或 Timeline 预览期间仍单独读取 authored entities，保证属性录制和预览检查读取原始编辑值；退出预览恢复复用。Play 使用既有运行快照。是否显示 Timeline 不参与这个判断，隐藏面板仍可能保留录制状态。

Amazonia 固定输入7,409实体、场景5,429,683字节；实际 store 的普通快照与 authored entities 深比较相等。Node 定向测量8次，额外复制均值15.073ms，范围13.456–21.546ms，每次临时堆增长约9.44MiB。移除的是该重复复制与分配，不是整个场景快照；此数据不能换算实时FPS或宣称所有地图卡顿已解决。原始脚本和报告在 `tmp/docs-artifacts/testing-batches/B001/authored-clone-cost.{mjs,json}`。

`node --test packages/editor/tests/authoredPresentation.test.mjs` 通过，执行实际App表达式与store，覆盖普通编辑不复制、两类预览保留原始值、退出预览和Play运行值。另有独立只读复核确认Timeline不修改传入快照。原生构建及节点/镜头集成证据见 `docs/testing-batches.md` 本阶段条目。

实时Amazonia稀疏原生样本中来源校验和frame compile仍占主要CPU开销。采样由最新帧查询去重得到，不覆盖全部渲染帧，不将调用数总和或截图间隔当成持续帧率。后续优化需同时记录脚本、WebView呈现/输入延迟和native整帧，保持热更新与来源身份校验语义。


## 第三十阶段层级展开状态独立刷新

Hierarchy 的展开/折叠仅更新层级面板的呈现计数，不再请求场景快照、脏状态检查、自动恢复计时或跨窗场景广播。普通Edit选择复用树结构，实体内容、展开状态或完整场景刷新变化时才重建。Ping与选中折叠后代仍显式展开祖先；面板左右键、全局左右导航、工具栏和右键菜单均使用该路径。Play的“展开全部”读取当前运行世界，兼容地图切换后的运行实体ID。

Amazonia同一7409实体输入，4次预热、8次测量，展开与折叠交替，前后测量顺序轮换，并逐行比较实体ID/深度/展开/子节点标志。Node中“场景快照+树构建”均值14.649ms，复用快照后仅树构建0.742ms；临时堆增长均值14,191,779→3,599,298字节。此局部诊断不含React绘制、脏检查、同步与GPU，不代表整体FPS。原始脚本/报告：`tmp/docs-artifacts/testing-batches/B001/hierarchy-fold-cost.{mjs,json}`。

定向检查6项通过（hierarchyRefresh、sceneSelectionRefresh及nativePlayOwnership的expand-all场景），覆盖树memo、内容更新、祖先展开/Ping、左右导航、预览/选择批处理、远程面板选择语义及运行ID重映射；TypeScript项目检查通过。独立只读复核确认创建/复制/父级变更/加载/撤销和跨窗同步仍有完整刷新来源。未重建原生Editor、未重复地图QA；下一次合并构建验证实际折叠滚动、搜索/双击、脱离窗口与运行地图切换。


## 第三十一阶段层级搜索合并查询

Hierarchy搜索一次解析查询词，在同一遍实体匹配中收集结果行与直接命中标记；祖先路径遇到已经纳入的节点即停止，保留原有模糊匹配、type/tag/layer过滤、兄弟顺序和折叠分支上下文。没有跨查询或跨帧实体缓存，直接修改名字、组件和元数据后下一次查询读取当前值。已有filterHierarchyTree和单实体匹配入口保持兼容。

实际Amazonia 7,409实体，四组查询（装饰物名称、MeshRenderer类型、Unit名称和无匹配文本），4组预热、8组测量，新旧顺序交替。每组全部结果行ID/深度/展开/子节点标志和命中ID逐项一致。四组查询合计均值28.6767→11.6985ms，约减少59.2%；GC后测量段临时堆净增长均值47,220,453→34,081,967字节。此数据不含React呈现、IPC、原生渲染，不是整体FPS或峰值进程内存。输入摘要、旧实现、测量脚本及完整样本位于`tmp/docs-artifacts/editor-performance-risk/hierarchy-search/`。

定向测试5项通过，包含原查询语义、直接命中与祖先标记区分、原地元数据变更、缺失父节点/循环、空查询与隐藏组件字段，以及层级独立刷新路径。前端TypeScript/Vite构建通过；与第三十阶段合并构建一次Editor，原生验证结果见测试台账。

## 第三十二阶段编辑选择跨窗口同步

Edit模式的纯选择只发送节点ID、场景名及同步版本，接收端复用实体快照，不重新加载场景、计算内容指纹或触发完整刷新。内容修改正在排队时由完整消息携带最新选择；无同步基线时仍先同步完整场景。Play/Pause保留完整刷新路径。完整状态按本地/远端统一的时间序号与状态ID排序，选择消息另按版本与发送窗口排序，保证三个窗口并发回复或选择时最终一致；新完整状态使旧选择消息失效。

实际Amazonia 7,409实体，使用App实际发送/接收函数与独立真实store，3组预热、8组测量、交替执行。完整消息平均6,551,058字节，薄消息110字节；发送路径23.4305→0.0693ms，接收路径53.9579→0.0223ms。测量包含Node模拟通道的structuredClone，不包含真实浏览器IPC、React呈现或原生渲染，也未计完整发送前的原选择刷新；不是整体FPS。脚本与样本位于`tmp/docs-artifacts/editor-performance-risk/selection-sync/`。

定向10项通过，覆盖选择/多选/清空、无回声、脏状态保持、内容排队、场景/模式边界、三窗口并发完整同步与选择、延迟旧消息拒绝；TypeScript检查通过。独立审核发现的并发选择分歧已补排序及回归。未重建Editor或运行全库测试。待下次合并构建验证真实脱离Hierarchy/Inspector窗口、连续选择延迟、内容编辑/撤销和主窗口Play/Stop恢复。

## 第三十三阶段连续呈现采样与特效文件检查

`qa-frost-map-session.mjs --continuous-profile`在地图动画预热后继续运行，清空Profiler历史，10秒内不通过Agent轮询，结束时读取现有汇总和WebView样本。复用EXE `9cb87294569f0e5e8d71666f38583eb0df5e59185874fa9583a9ccacfb52a93a`，报告`tmp/docs-artifacts/testing-batches/B001/map-session-1792774425728.json`通过，0 error，进程正常退出，锁定WebView缓存保留。输入含7,409地图实体和1个QA观察节点。

850×478原生Game视口在此窗口末尾保留240个完成帧，平均呈现间隔19.9388ms、P95 31.2ms，对应50.15次完成呈现/秒；这240帧约覆盖末尾4.8秒，不是整个10秒的完整帧历史，也不代表显示器扫描输出或新模拟帧率。原生渲染平均14.465ms、完整请求27.481ms、模拟请求12.729ms；管线有重叠，不能相加。38个WebView采样段平均绘制3.157ms。最新原生帧的特效阶段约1.980ms、对象材质2.956ms、层级变换2.048ms，单帧阶段值只用于定位下一处检查。

作者地图108个SampledEffect实例共用37份文件。特效文件检查改用已有`mengine_platform::file_change_stamp`：Windows普通文件直接查询属性，目录／重解析点／异常路径沿用metadata回退；其他平台沿用metadata。仍然每次收集检查一次共享文件，下一帧可见修改，保留mtime和长度失效、缺失/错误去重、项目切换和模型加载失败后的重试语义。

同进程交替旧metadata与平台接口，2组预热、9组测量，每组20轮、每轮37文件，逐文件结果相等；中位数0.82789→0.15752ms，减少约81.0%，每轮约省0.670ms。仅文件检查CPU基准，不是整个特效阶段或原生FPS提升证明。`cargo test -p mengine-runtime --release --lib sampled_effects::tests -- --test-threads=1`最终6通过、0失败、1手动基准忽略；共享特效回归补充同mtime长度变化及恢复后的粒子重新输出。单独运行`benchmark_sampled_effect_file_checks -- --ignored --nocapture --test-threads=1`通过。原始日志`sampled-effect-stamp-tests-final.log`、`sampled-effect-stamp-benchmark.log`及`continuous-profile.log`在`tmp/docs-artifacts/editor-performance-risk/`。

未重建原生Editor；上述连续采样是本项优化前的基线。待与跨窗口选择同步共同构建，验证原地图特效、暂停／Stop恢复、实际文件热更新和相同视口的连续呈现，不将旧EXE结果作为新实现的原生验收。


## 第三十四阶段脱离窗口操作归属与原生集成

Agent的window.ui_*命令由目标窗口处理刷新和发布；主窗口只观察结果，不再额外广播自身场景。该边界保留脱离Inspector的内容编辑及其Undo记录，同时避免纯选择命令触发完整场景同步。返回的sceneRevision是主窗口当时已观察到的版本，不是跨窗同步完成确认；原生QA等待实际选中节点和Inspector值。playback.input既有截图刷新行为保持不变。

`agentWindowUiOwnership.test.mjs`与`agentPlaybackCost.test.mjs`共2项通过；前端构建及Rust Release增量构建通过，仅既有world_from_snapshot未使用警告。第三十二、三十三阶段与此修复共用最终EXE SHA256 `40f8e9048c975dcc6273b99e0dee3765aa51471f29af1aff71e2e230acad9710`。独立只读复核通过。

`qa-editor-selection-sync.mjs`在独立Amazonia副本的7,409实体上通过四组真实UI交互：主Hierarchy到脱离Inspector，三窗口顺序单选/多选/清空及主窗键盘选择，脱离Inspector编辑和原编辑窗口Undo，同名重载、Play/Step/Stop与面板重新打开。选择保持内容和脏状态；Undo验证限于发起编辑的窗口，没有实现跨窗口全局Undo。报告`tmp/docs-artifacts/testing-batches/B001/selection-sync-1792775727537.json`通过，0 error、正常退出。

`qa-frost-map-session.mjs --continuous-profile --effect-reload`使用原地图脚本和独立资产副本。连续采样后暂停，使用游戏输入移到原火焰装饰物区域，再清空37份特效文件的帧粒子/四边形/光源；首次观察即发现像素变化且图元778→68，恢复文件后首次观察即逐像素还原、图元恢复778，场景实体未改变。文件恢复放在finally中，读取真实原生截图并限定等待时间。报告`tmp/docs-artifacts/testing-batches/B001/map-session-1792776070367.json`通过，0 error、正常退出。两项原生QA的锁定WebView缓存保留；原始构建和运行日志在`tmp/docs-artifacts/editor-performance-risk/`。

850×478连续采样10秒、7,410实体（含1个QA观察节点），末尾240个完成帧约覆盖4.95秒，平均间隔20.6292ms、P95 31.2ms、48.475次完成呈现/秒；原生渲染13.5149ms、完整请求26.1867ms、模拟请求11.9971ms，39个WebView采样段平均绘制3.0685ms。各阶段重叠，不能相加。与旧EXE分次采样的50.15次/秒相比，本次没有证明整体呈现率提升；局部文件检查和选择路径节省仍以此前定向测量为准。该数据不是显示器FPS、新模拟帧率或完整10秒原生帧历史。

常规脱离窗口选择/编辑/原窗口Undo与特效修改/恢复集成已验证。原生三窗口同时操作、真实连续输入延迟、独立Ping滚动、自动恢复计时、原生特效损坏/删除恢复和跨平台仍待后续场景；损坏/删除恢复已有Rust定向测试，不能替代原生验收。Amazonia持续性能风险保持开放。


## 第三十五阶段层级结果表容量规划

TransformHierarchy完整构建先收集当前活动实体ID，按请求数量预留结果表容量，再沿既有顺序解析自身与祖先，减少逐项扩容和大尺寸变换记录搬运。子集构建只使用请求迭代器的容量下界，不按整个World大小分配；未计入请求的祖先仍可按需扩展。没有跨帧缓存，激活、重设父级、循环失活、generation和精确层级矩阵语义保持不变。

实际作者场景同进程新旧顺序交替，2组预热、9组测量、每组30次（包含构建及释放）。Amazonia 7,409实体／5,411解析节点，中位1.11017→0.97115ms，减少约12.5%；主菜单4,340实体／1,640节点，0.18387→0.15269ms，减少约17.0%。最终HashMap容量分别仍为7,168和1,792；额外临时ID数组随请求数量增长，不宣称进程峰值内存降低。新旧每个实体的活动状态、变换和父级聚合逐项相等。本测量是CPU层级构建，不能替代实际编辑器输入延迟或FPS。

`cargo test -p mengine-core --release --lib transform_hierarchy -- --test-threads=1` 7通过、0失败、1手动基准忽略；随后单独执行`benchmark_hierarchy_capacity -- --ignored --nocapture --test-threads=1`通过。覆盖稀疏子集、重复请求、失活祖先、循环、旧generation、无Transform父级、非均匀缩放及遍历逆序。原始日志及含输入SHA256的汇总在`tmp/docs-artifacts/editor-performance-risk/hierarchy-capacity-{tests.log,benchmark.log,summary.json}`。

本次未重建原生Editor或重复全图QA；待后续相关改动合并构建后验证Scene/Game、激活/父级编辑和运行地图连续呈现。网格／材质提取在上轮原生单帧仍约2.79ms，是接下来的重点；层级局部节省不关闭Amazonia整体性能风险。


## 第三十六阶段网格提取借用层级变换

TransformHierarchy提供只读get_ref入口，既有get仍返回独立值。网格提取的临时输入借用本帧不可变层级结果，生成RenderObject时仅复制需要的矩阵，避免先将完整位置／旋转／缩放／矩阵写入临时数组再搬出。借用由Rust生命周期约束，不延长到后续帧、不引入实体或材质缓存；文件轮询、对象覆盖、渲染根过滤、遍历顺序和材质热更新沿用现有路径。

真实Amazonia场景2,747个渲染对象，中间输入单元素128→24字节，有效元素字节351,616→65,928（减少81.25%）；主菜单219对象为28,032→5,256字节。数字不包含Vec空余容量、分配器开销或最终渲染对象，不代表进程峰值内存。旧/新同进程交替，2组预热、9组测量、每组20次，完整渲染对象字段一致。Amazonia单轮CPU中位1.58698→1.54558ms，主菜单0.19375→0.20269ms；小场景样本略慢，不能据此宣称稳定CPU或整体FPS提升。

定向`cargo test -p mengine-core --release --lib transform_hierarchy -- --test-threads=1` 7通过、1手动忽略；`cargo test -p mengine-runtime --release --lib frame_compiler::mesh_cache_tests -- --test-threads=1` 6通过、7手动忽略，均0失败。单独`benchmark_mesh_transform_borrows -- --ignored --nocapture --test-threads=1`通过。覆盖失活/循环/旧generation、父级变换、共享视图独立性、根过滤边界和材质覆盖/热更新。原始日志在`tmp/docs-artifacts/editor-performance-risk/borrowed-transform-{core-tests.log,mesh-tests.log,mesh-benchmark.log}`，输入摘要及样本在`borrowed-transform-summary.json`。

现有分项测量也确认Amazonia非轮询材质解析约0.139ms、完整提取约2.250ms，不能将所有开销归于材质加载。此分项记录为独立CPU采样，见`material-breakdown-current.log`，不是原生整帧归因。下一轮原生合并构建需验证第三十五／三十六阶段对Scene/Game和编辑操作的实际影响；本轮未重建Editor或全图回归，整体性能风险仍开放。


## 第三十七阶段对象材质覆盖就地更新

网格提取对各对象自己的RenderMaterial调用就地覆盖入口，不再通过该调用的参数／返回值传递完整结构；已有按值API保留，所有入口共用同一覆盖实现。类型大小为704字节，材质源、共享缓存和其他对象不会被修改；数值清理、范围限制、自定义参数／纹理以及原材质管线状态语义保持不变。

真实Amazonia 2,747对象与主菜单219对象，在同进程交替测量等价的按值和就地覆盖提取路径，2组预热、9组有效样本、每组20次。完整RenderObject输出相等；中位分别1.62840→1.58706ms、0.22755→0.20856ms。该小幅局部CPU差异不含真实IPC或原生呈现，不能直接换算FPS或保证每次提取都同幅提速。输入摘要与完整样本见`tmp/docs-artifacts/editor-performance-risk/inplace-material-summary.json`。

属性覆盖边界测试1通过，mesh_cache_tests 6通过、8手动基准忽略，均0失败；单独benchmark_material_override_moves通过。原始日志`inplace-material-{property-tests.log,mesh-tests.log,benchmark.log}`位于同一临时目录。第三十五、三十六、三十七阶段已合并完成下面的原生Game集成验证。


2e8c4be、3fd5b17、576913a共用一次Rust Release构建（1分28秒），复用未变更的前端产物，仅既有world_from_snapshot未使用告警。EXE SHA256 `4e429e11e48deacb53be7bb8509fd40de71bd21708dec72e757820c576a74faa`。`qa-frost-map-session.mjs --continuous-profile --effect-reload`报告`tmp/docs-artifacts/testing-batches/B001/map-session-1792777658238.json`通过：原地图加载与连续呈现、37份特效修改/恢复（图元880→68→880且暂停像素精确还原）、Stop恢复原作者实体。0 error、正常退出，锁定WebView缓存保留；Game截图已目视核对。脚本补充Stop后的显式快照断言。日志为`hierarchy-material-{native-build.log,map-qa.log}`。

850×478、7,410实体含QA节点，10秒不轮询采样窗口末尾保留240帧（约5.11秒）：呈现间隔均值21.2863ms、P95 33.9ms，46.979次完成呈现/秒；渲染均值13.1459ms、完整请求26.1829ms、模拟请求13.4942ms，38个WebView采样段平均绘制3.3323ms。阶段会重叠，不能相加，也不是显示器或新模拟帧率。相比此前单次采样48.475次/秒，本次没有证明整体提升；不同次运行不是受控A/B，也不能把差异直接归因于本项。下一步应拆查模拟/呈现调度、请求等待与传输成本。Scene视图、父级/活动编辑及Undo仍待相关原生场景；本次Game通过不关闭整体性能或完整Warcraft复刻目标。


## 第三十八阶段请求耗时拆分与 Game 完成校验

Agent `profiler.get_samples` 与 MCP `get_profiler_samples` 增加可选 `includeNativeTimings`，默认不返回逐帧时序。启用时只返回限制数量内的标量、渲染尺寸和共享传输阶段，最多沿用 240 帧历史；资源清单、调用树、内存明细不进入时序列表。查询汇总读取保留数据，只有返回的最新完整帧和轻量时序字段复制，避免为了查询深拷贝全部历史。返回值修改不会污染保留数据。

`qa-frost-map-session.mjs --continuous-profile --transport-profile` 启用已有原生传输追踪，10 秒不轮询 Agent 后读取时序。诊断版本 EXE SHA256 `e869302c07b4edf5cd96d5cd22bd450a7a15f058ead7c230f32cfd6293f2e214` 的前端/原生构建通过；报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792778305733.json` 通过、0 error、正常退出，并验证 Stop 恢复作者快照。该版本只含查询与传输诊断，不含下述 Game 完成校验优化和新增前端分段字段。

Amazonia 7,410 实体、850×478，末尾 240 帧：完成呈现间隔均值 21.2171ms、P95 32.6ms，47.132 次/秒；原生渲染均值 13.0717ms，命令 15.9531ms，paint 起点至上传结束 25.5371ms。共享请求至事件 19.8054ms，其中发布至 WebView 事件均值 2.6927ms、P95 7.4939ms；原生 UI 排队 0.0761ms、复制 0.1187ms、分配 0.0006ms，Canvas 上传 0.3413ms。前后两个请求口径平均相差约 5.7317ms，包含前端请求准备、完成校验、上传及调度，不能全部归因于 IPC。不同阶段可能重叠，不相加；这次独立采样没有证明整体 FPS 提升。

Game 返回帧在同一同步回调中取得一次新鲜运行时快照，复用于当前面板、显示配置及世界归属检查。有效帧的快照读取由三次减至一次，不跨异步边界缓存；项目代次和请求票据检查仍先执行，拒绝路径释放缓冲区。新增 `frontendPrepareMs`（paint 起点至世界准备完成、调用原生请求之前）和 `frontendCompleteMs`（完成回调开始至归属校验及 Canvas 上传结束），供后续真实运行定位使用。两者不是纯 CPU 测量，未报告尚未采集的节省量。

定向测试 29 通过、0 失败，覆盖生产完成回调、过期项目/请求/呈现顺序、面板/尺寸/显示器/会话/编辑实体变化，保留世界的深层编辑、直接别名、重启以及诊断字段边界。nativePlayOwnership 中两处完整快照断言按既有 96cb4ea 的模拟时钟契约校正：保留会话 ID，仍无可复用 revision。TypeScript 检查通过。原始结果位于 `tmp/docs-artifacts/editor-performance-risk/` 的 `native-timing-{query-tests.log,editor-build.log,native-build.log,map-qa.log,summary.json}` 和 `game-completion-tests.log`。

待下一批相关原生构建验证新增前端时序、Game/Scene 切换、分辨率变化、运行地图切换与 Stop 后旧帧拒绝；复用相同视口采样并单列前端阶段，不能把减少读取次数当作已证明的整图提速。本轮未再次构建原生 Editor、重导地图或运行全库回归。


## 第三十九阶段 Scene 完成校验与前端分段原生采样

Scene 主视图和选中相机预览的完成回调也复用一次新鲜运行时快照，将有效帧的读取次数分别由两次减为一次。先拒绝项目/票据/呈现顺序失效，再核对当前会话、实体来源、Scene 相机/隐藏节点/尺寸，或预览相机/选中节点/输出显示配置。没有跨回调缓存；拒绝帧继续释放共享缓冲区。

`viewportSceneCompletion.test.mjs`执行生产回调，覆盖两个路径各 11 组输入：有效帧、旧项目/票据/序列、切换面板/会话/编辑实体，以及 Scene 尺寸/环绕相机/隐藏节点/2D 切换，预览选中节点/相机参数/分辨率/显示器变化。与 Game 完成回调共 2 个测试通过、0 失败；前端 TypeScript/Vite 构建通过。与 507c149 共用一次 Rust Release 构建（1分07秒），EXE SHA256 `1f0c9f8f44581de0cd3a1654cde768c216ad7e84e0f620f514200d8408dea4d6`；只有既有 world_from_snapshot 未使用警告。

本 EXE 的 10 秒不轮询采样保留末尾 240 帧：850×478、7,410 实体，完成呈现间隔均值 19.8754ms、P95 30.3ms，50.313 次完成呈现/秒。原生渲染均值 13.1495ms、命令 15.8056ms、完整请求 23.1696ms；新前端准备均值 1.8363ms/P95 2.4ms，完成回调均值 2.0304ms/P95 2.5ms（包含 0.3563ms 上传），共享请求 19.2713ms，发布至 WebView 事件 1.7116ms。两段前端工作解释了大部分共享请求以外的差额；下一步应定位运行时快照内容校验与完成归属检查之间的职责边界，同时保留直接引用编辑的检测。当前没有受控 A/B，也没有稳定 60 FPS 证据。

采样所在报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792779146027.json` 在所有时序断言通过后，因 QA 在暂停模式调用仅允许编辑模式的 view.set_scene_visibility 而失败，不能标记整个报告通过。脚本调整为暂停模式下合法的视口操作，并增加 `--viewport-transitions-only` 单独重测失败阶段，未重复构建或采样。重测报告 `map-session-1792779242868.json` 通过、0 error、正常退出：Scene/Game 切换、选中相机预览、环绕相机后的像素变化、Game 导出尺寸 960×900、回到 1280×720，地图实体保持一致，Stop 恢复作者实体。Scene 原生历史有 14 帧；截图已核对右下角相机预览及地图显示。两个进程均正常退出，锁定 WebView 缓存保留。

本地证据在 `tmp/docs-artifacts/editor-performance-risk/` 的 `scene-completion-tests.log`、`completion-{editor-build.log,native-build.log,native-qa.log,transitions-qa.log,timing-summary.json}`。关闭第三十八阶段 Game 分段采样及常规 Scene/Game/相机预览/分辨率切换待测；强制请求在途的竞态、编辑模式隐藏节点/父级/活动修改与 Undo、实际交互延迟仍待相关批次。单元回调拒绝测试不等于这些原生时序场景已验收。


## 第四十阶段运行时归属与世界内容校验分离

App 为 Viewport 提供实时 readRuntimeSessionId，直接读取当前 store.playSessionId。Game/Scene 返回帧、显式 Game 截图返回、旧请求异常归属以及 UI 命中结果验证，只读取当前会话归属；原生会话存在时不调用 playRenderSnapshot，不比较世界内容或复制实体。每次使用时重新读取，未引入跨帧缓存。相机小预览仍读取当前世界来校验相机组件，新渲染请求和模拟步仍沿用完整内容校验，直接引用编辑继续触发快照上传。

没有会话时仍读取当前实体来源；实时读取到的 undefined 覆盖可能滞后的 React 会话属性，确保 Stop 和尚未完成的重启拒绝旧帧。无新回调的嵌入调用方保留原行为。数值 0 是有效会话，脱离窗口使用 store 中实时接收的远程会话 ID；没有将会话 ID 当作世界 revision，也没有改变同会话内帧序列发布规则。

新增 viewportOwnership.test.mjs，执行从 App/Viewport 源码提取的实际接线与读取函数，结合真实 store、native runtime 和模拟 IPC 验证：会话 0、UI 命中复用不读取世界、直接编辑仍上传、滞后 React 属性下 Stop、等待启动、重启、远程会话替换，以及无原生会话/旧调用方回退。更新 Game/Scene 完成回调检查，已有相机预览内容检查保留。相关 16 个定向测试通过；最终细化回退后重测 3 个回调/生命周期测试，接线检查补充后再次单测通过。TypeScript 检查通过。

实际 Amazonia 7,409 实体、固定同一暂停世界，Node/Vite SSR 同进程对比旧 currentViewportProps 与新归属读取；2组预热、9组交替测量、每组100次，两个路径的归属判断一致。实体仍私有时单次 CPU 中位 0.001330ms 与低于0.001ms；通过公共接口暴露数组后为 2.801755ms 与低于0.001ms。后者测量了必须防范直接引用修改的情况，不代表所有实际帧都处于该状态，也不能换算原生 FPS。额外断言直接编辑仍产生完整上传、Stop 拒绝旧会话。数据 SHA256 和原始值见 `tmp/docs-artifacts/editor-performance-risk/viewport-owner-benchmark.json`，脚本与日志位于同目录。

本轮未重建原生 Editor、运行地图 QA 或全库回归。当前 EXE 仍为第三十九阶段 `1f0c9f8f44581de0cd3a1654cde768c216ad7e84e0f620f514200d8408dea4d6`，不含本项。下一批在新 EXE 测量 frontendCompleteMs，并覆盖返回帧/截图/UI命中过程中 Stop/重启/切换地图、脱离窗口、直接编辑与相机预览；既有原生强制竞态及编辑/Undo待测项继续保留。日志为 `viewport-owner-{tests,final-tests,wiring-tests,benchmark}.log`，均在临时证据目录。


## 第四十一阶段等待请求期间跳过无效 Game 世界校验

Game 的 rAF、运行时通知和请求定时器可以多次唤醒同一幅已显示画面。Viewport 在世界内容读取之前增加轻量判断：仅原生 Play 会话、已显示帧及项目/请求所有者匹配、呈现配置/尺寸/像素比/交互状态/环境版本/失效版本均未改变、且无需浏览器动画或交互绘制时，才可能提前返回。还必须满足请求队列已满、正在捕获，或已有恢复定时器且尚未到请求/重试时刻；这些状态下原有逻辑本来也不会提交请求或安排新的唤醒。未改动调度器、请求容量和重试时序。

共享 currentNativeGamePaintState 生成原有与提前判断的画面状态，避免两套失效规则。新完成帧、会话/项目/窗口/分辨率/显示器/相机预览/hover/press/资源环境变更都会继续完整路径；Spine 和需浏览器绘制的交互 UI 不提前返回。没有定时器或已到请求时刻也继续读取当前世界，以保留直接修改检测和新请求准备。捕获/请求完成后的原有恢复逻辑保持不变。

新增 viewportPendingPaint.test.mjs 执行实际 helper 和 paint 至世界读取处的代码，覆盖队列满、捕获、等待间隔/重试、定时器 ID 0，以及项目/会话/画面等失效或不应跳过的情况；明确断言等待期间世界读取为0、定时器到期恢复读取、新完成像素立即进入绘制。相关呈现、请求、重绘共20项最终通过；失败项仅定向重测8项，测试提取参数及既有请求键断言已与当前源码一致。TypeScript及diff检查通过。日志为 `tmp/docs-artifacts/editor-performance-risk/pending-game-paint-{tests,retest}.log`。

本项减少不可能提交请求且画面未变时的内容校验，不宣称已测得实际唤醒占比或FPS收益。实现时未进行原生构建或整图QA；与8421aa4的后续合并验证见下节。

## 第四十二阶段归属与等待路径的原生合并验证

8421aa4与73b74de共用一次前端及原生Release构建，Rust耗时1分05秒，只有既有world_from_snapshot未使用告警。EXE SHA256 `4ee10a4afa086e07ec1865048c612334439b2ad2c064b47c7de2902f8c9d6d54`。执行 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --viewport-transitions --effect-reload`，报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792780821762.json` 通过、0 error、正常退出；锁定的WebView缓存保留。

Amazonia 7,410实体（含QA观察节点）、850×478原生画面，10秒无Agent轮询窗口保留最后240帧：呈现间隔均值18.8325ms、P95 28.1ms，53.0997次完成呈现/秒。前端准备均值2.0588ms/P95 2.5ms，完成回调0.5867ms/P95 0.8ms（含上传0.3538ms）；原生渲染12.9827ms/P95 22.2732ms，命令15.6604ms，完整请求21.2188ms，共享请求至事件18.5367ms，发布至WebView事件1.0538ms，模拟请求9.8946ms。前次独立采样完成回调2.0304ms，本次降低与减少世界校验一致；没有受控A/B或稳定60 FPS证据。QA启动期间有一次短REA查询，是否与采样重叠未确定，不能视为隔离性能基准。

Scene/Game切换、选中相机预览、环绕镜头、Game截图960×900与1280×720、实体保持及Stop恢复通过；Scene截图已核对。37个原特效文件修改/恢复后图元778→68→778，恢复后暂停像素完全一致，场景实体未改动。构建/QA日志为 `tmp/docs-artifacts/editor-performance-risk/owner-pending-{editor-build,native-build,native-qa}.log`，指标汇总为同目录 `owner-pending-timing-summary.json`。

阶段40/41的正常原生集成路径已验证。强制请求在途Stop/重启/换图/截图/UI命中竞态、脱离窗口、队列饱和/重试与隐藏窗口恢复、Edit父级/活动/隐藏变更及Undo、直接引用编辑、真实输入延迟仍待合并验证，不以单次采样宣布Amazonia性能问题全部解决。

## 第四十三阶段模拟增量直接序列化共享实体

PlaySnapshotStream已有不可变Arc实体和原生历史快照；此前生成增量后调用into_owned，将仍被流与历史引用的所有变更实体及组件树再次深拷贝。现在增量保持SharedWorldSnapshot直到Tauri响应序列化。PlayWorldUpdate增加默认WorldSnapshot的泛型，原advance_update仍返回独立可修改数据，新advance_shared_update供step_editor_play使用。JSON字段、版本/重置/退出标志及会话前后校验保持一致；旧API的独占转换移到接收端，需要可修改结果的调用方仍承担该拷贝。

新增检查证明共享结果保持原实体指针，后续修改/Stop不会改变已返回的帧，新旧结构序列化JSON一致，转成独占结果后修改不会污染原实体；实际worker验证空增量、显式编辑完整reset及过期会话。play_runtime相关最终25项通过，4个手动基准忽略；初次24通过/1失败是新增测试写死输入ID，改为使用运行时映射后的ID后仅重测该项通过。`cargo check -p mengine-editor-tauri --release --features custom-protocol` 通过，仅既有world_from_snapshot未使用警告。

手动定向基准 `cargo test -p mengine-editor-host --release --lib benchmark_shared_snapshot_update_serialization -- --ignored --nocapture --test-threads=1` 通过。使用当前Amazonia作者场景，比较独占转换加JSON序列化与共享JSON序列化，两组预热、九组交替采样、每组20次；前64实体中位0.052035→0.015535ms，全7,409实体17.62375→5.479445ms。两个数据量用于控制负载，不是实际运行帧的变更实体分布，不包含模拟、IPC、绘制，也不能作为每帧节省或FPS收益。完整JSON等价断言通过；历史与流继续保留原Arc实体，未测量进程峰值内存。

证据为 `tmp/docs-artifacts/editor-performance-risk/shared-play-update-{tests,retest,benchmark,integration-check}.log` 与 `shared-play-update-summary.json`（含源场景SHA256）。本轮只编译接口和执行定向检查，未重建Editor EXE或重复地图QA；下一相关原生批次需验证新Tauri传输、持续模拟/呈现、显式编辑reset、Stop/换图/退出和实际模拟请求耗时。当前已生成EXE仍为第四十二阶段版本，不包含本项。

## 第四十四阶段空增量复用实体索引

原生增量没有实体变更时，retainPlayWorldPatch复用前一帧已冻结的实体数组，仍创建新的世界元数据并更新版本、时钟、颜色和选中信息。store只在私有数组与曝光版本仍匹配且变更索引为空时保留可编辑数组；外部取得引用、直接编辑或有实体变更时继续原有校验和复制路径。没有以数组不变推断世界版本不变。

createPlayWorldSync的原生基线共享已认证的不可变数组；普通capture在首次实体变化时复制索引，随后更新自己的基线。仅时钟或颜色变化不复制实体表，viewportSnapshot仍向调用方返回独立索引。三个新增检查覆盖连续空增量的新元数据、后续实体变更/重复ID拒绝、普通capture的写时复制与toJSON回退、异步返回期间新暴露引用的修改及下一次完整上传。playWorldSync与nativePlayOwnership共32项通过；Play增量和原生帧参数相关17项检查通过，TypeScript检查通过。

局部对照通过Vite分别加载提交c694440与当前生产模块，真实native runtime/store接收模拟空增量；使用Amazonia作者场景7,409实体，两组预热、九组交替采样，每组100帧。每100帧长度7,409的实体数组slice次数300→0，前端处理每帧采样中位0.543986→0.209788ms；最终完整实体内容一致、版本与时钟推进断言通过。该结果覆盖空增量路径的前端处理，不含真实模拟/IPC/绘制，也未测得实际空增量占比、浏览器GC或FPS改善。源场景摘要、逐组数据及脚本在 `tmp/docs-artifacts/editor-performance-risk/clock-play-arrays-{summary.json,benchmark.mjs,benchmark.log}`，测试日志为同目录 `clock-play-arrays-{tests,integration-tests,typescript}.log`。

本项与c694440共享增量序列化合并进行下一次相关原生验证，当前EXE仍不包含两项。需要确认持续呈现与时钟推进、动画/水面变化、Inspector直接修改、Stop/重启/换图和跨窗口版本传播；既有强制竞态及真实输入延迟待测项保持未完成。

## 第四十五阶段共享增量与空帧索引原生验证

c694440、8679fcb共用一次前端/原生Release构建，Rust耗时1分09秒，仅既有world_from_snapshot未使用告警。EXE SHA256 `ff659f5a318a9c15e2ddc9b3abec8b26631da5c245a55a69180f861cf4a1e281`。map-session QA新增 `--runtime-edits` 与 `--runtime-edits-only`，通过真实Inspector输入修改暂停运行世界，再推进原生模拟并检查值保留、三层动画/时钟和恢复。

合并执行 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --viewport-transitions --effect-reload --runtime-edits`。报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792782700435.json` 的连续采样、37份特效热更新/精确像素恢复、Scene/Game/相机预览/环绕及960×900和1280×720切换均通过。随后新增QA用值不符合Inspector的0.1步长，命令被stepMismatch拒绝，整份报告为失败。修正为原高度精确符合步长的静态节点，修改0→3.2；未修改产品输入约束。

同EXE只重跑 `node scripts/qa-frost-map-session.mjs --runtime-edits-only`，报告 `B001/map-session-1792782801041.json` 通过：Doodad-7-LRrk-1219在30个原生模拟步后保留高度3.2，3,603个装饰物、442个单位、9个水面节点组件推进，地图时钟0.016667→0.516667；高度恢复0后再推进2步仍正确，Stop恢复作者场景。两次进程均正常退出、控制台error为0；WebView锁缓存保留。没有重复构建、连续采样或已通过的视口/特效检查；Scene预览截图已核对。

本次10秒无Agent轮询采样保留末尾240帧，7,410实体、850×478：完成呈现间隔均值19.0871ms/P95 29ms，52.3915次完成呈现/秒；原生渲染12.8643ms/P95 22.0056ms，命令15.5247ms，完整请求21.3817ms，世界同步1.9938ms；前端准备1.9921ms/P95 2.3ms，完成0.5979ms/P95 0.8ms，上传0.3592ms；模拟2.2117ms，模拟请求9.6704ms。前次独立采样53.0997次/秒、模拟请求9.8946ms；这些结果不证明整体稳定提速或60 FPS，也不能将局部复制基准的差额直接当作真实帧收益。

构建与运行日志 `tmp/docs-artifacts/editor-performance-risk/shared-clock-{editor-build,native-build,native-qa,runtime-edits-qa}.log`，指标汇总 `shared-clock-timing-summary.json`。阶段43/44的正常传输、时钟/动画、真实Inspector修改和Stop恢复已有原生证据；强制在途Stop/重启/换图/截图/UI命中竞态、脱离窗口、隐藏/重试恢复、Edit父级/活动/隐藏及Undo、真实输入延迟继续待测。模拟请求与原生模拟之间的差额仍需分解，不能直接归因于IPC。


## 第四十六阶段帧内材质共享与修改隔离

RenderObject改为持有SharedRenderMaterial；同次提取中的相同基础材质、相同基础材质加纯颜色覆盖共享Arc数据，其他属性覆盖与PbrMaterial保持独立值。修改对象或相机视图的材质时通过Arc::make_mut分离，后续帧重新解析资源。颜色键保留f32原始位；含其他覆盖或自定义参数/纹理的属性块不走纯颜色缓存。

Rust源码构造接口有变化：RenderObject.material从RenderMaterial变为SharedRenderMaterial，已有独占材质初始化需要material.into()；需要独占RenderMaterial的管线预热使用(*object.material).clone()。已更新仓内调用点，GPU参数、资源格式和TypeScript接口不变。

定向检查：runtime/frame_compiler::mesh_cache_tests 7通过、9项手动基准忽略；RHI/material_submission_tests 2通过、2项手动基准忽略；material_sync_preserves_variants_hot_reload_removal_and_project_ownership 1通过。覆盖对象/视图修改隔离、下一帧更新、材质与纹理/着色器热更新、提交像素等价及项目切换。runtime/editor-host/rhi的tests/examples编译和Tauri release接口编译通过，仅既有world_from_snapshot未使用告警。

手动benchmark_shared_render_materials 1项通过：以82417af的独占材质生产提取实现为对照，两组预热、九组交替采样，每组20次，完整对象/材质值一致。Amazonia 2,747对象共享224份材质载荷，提取中位1.731245→1.022065ms（减少40.96%）；菜单219对象共享155份，中位0.207100→0.178775ms。RenderObject结构800→112字节，704字节材质载荷在Arc中单独分配；该结构尺寸不代表总内存降幅。结果仅为CPU提取，不含绘制、IPC或实际FPS。

原始日志为tmp/docs-artifacts/editor-performance-risk/shared-render-material-{check,tests,benchmark,rhi-tests,texture-tests,integration-check}.log；shared-render-material-summary.json记录两份场景SHA256及逐组数据。未重建Editor EXE或运行地图QA，当前ff659f5a版本不包含本项。下次相关原生批次合并验证Game/Scene/相机预览、对象材质修改、材质/纹理/着色器热更新、透明/自定义材质、阴影及连续性能；既有交互和竞态待测项继续保留。


## 第四十七阶段模拟请求分段计时

PlayWorldUpdate增加可选timing：请求进入模拟线程的排队时间、模拟与快照增量时间、包含历史发布的worker总耗时，以及Tauri命令从入口到返回前的耗时。命令计时不含响应序列化；独占转换保留timing。Rust直接构造PlayWorldUpdate需要补timing: None；旧前端可忽略新增JSON字段，前端也允许旧后端缺少timing。

原生driver在成功验证会话/版本并应用增量后保存不可变计时，store补充输入/世界准备、接受运行世界及请求总耗时。Stop清空计时，过期响应不能发布；Game/Scene记录请求开始时最新完成的模拟样本，样本保留独立sessionId/revision，不能按渲染worldRevision当作同一帧。Profiler CPU面板展示互不重叠的范围，缺失或不合法计时显示不可用。profiler.get_samples的includeNativeTimings保留这份小型元数据，不附带世界或资源表。

分段为准备、模拟排队、模拟/快照增量、worker发布及簿记、命令调度/返回、IPC编码/投递/解码、前端增量应用、编辑器接收和剩余前端工作。IPC范围仍含WebView投递/回调调度，不是纯传输；不把模拟请求与另一个渲染版本的simulationMs直接相减。QA新增--simulation-profile（要求--transport-profile和--continuous-profile），按会话/版本去重并校验至少15个完整样本及嵌套范围。

定向前端21项通过；补充Stop清空后，计时/视口完成/归属5项通过（其中2项计时检查为重测）。原生shared_step_timing测试通过，验证队列时间、成功版本、独占序列化等价和Stop拒绝。首次测试编译发现既有并发测试的内部Request构造缺少queued_at，补齐后通过。Tauri release检查与TypeScript通过，仅既有world_from_snapshot未使用告警。


与c12e856材质共享共用一次前端/原生构建（Rust 1分15秒），EXE SHA256 aa67609c2f6c6b2b3cd975d0cbb54b797793cebfbf1d3b282f61a68c81c4686b。执行 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --simulation-profile --viewport-transitions --effect-reload --runtime-edits`，报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792784239971.json` 通过、0 error、正常退出。Scene/Game/相机预览与环绕、分辨率切换、运行Inspector修改经30步保留、动画/时钟、特效文件修改后精确像素恢复及Stop还原均通过；Scene预览截图已核对。WebView锁缓存保留。

7,410实体、850×478、末尾240次呈现：51.6562次/秒，平均间隔19.35875ms/P95 31.9ms，渲染12.7287ms、命令15.4554ms、世界同步2.0398ms。225个去重模拟版本的平均耗时：准备1.7884ms、invoke 7.8738ms、增量应用0.5347ms、编辑器接收0.8098ms、总计11.0116ms；原生排队0.01135ms、模拟2.21565ms、worker 2.40051ms、命令2.45863ms。invoke减命令为5.41515ms，范围包含编码/序列化、投递、解码与WebView回调等待；证据支持继续分解该范围及前端准备，不能直接归因于传输或模拟队列。两种平均请求值口径不同：呈现样本可引用重复模拟版本，模拟分解先按会话/版本去重。

这是独立运行采样，不证明材质共享带来整体FPS改善或已达60 FPS。原始日志为 `tmp/docs-artifacts/editor-performance-risk/play-timing-{check,typescript,tests,viewport-tests,native-tests,native-retest,editor-build,native-build,native-qa}.log`，`play-timing-summary.json`保存二进制摘要和指标。阶段46的正常地图/视口/编辑/特效路径已集成；原生材质预览、材质/纹理/着色器真实热更新和特殊透明/自定义材质的专项覆盖继续待测，既有强制在途竞态/脱离窗口/Edit状态及Undo/真实输入延迟仍未完成。


## 第四十八阶段菜单可用性查询保留运行世界归属

MenuBar为所有菜单渲染下拉内容，关闭时由CSS隐藏；“全选”的disabled曾调用getVisibleFlat，构建/排序整棵可见树并向调用方暴露可编辑节点。即使菜单未展开，普通面板刷新也会使这些记录进入后续逐节点内容比较，并阻止相关私有数组快速路径。现在store提供hasVisibleHierarchyRows，只读判断当前世界是否存在根节点；可见层级必从根开始，因此空场景/仅有无根循环与普通层级保持原可用性。实际全选仍使用既有selectAllVisible，折叠/展开和可编辑引用行为不变。

新测试使用真实MenuBar的React服务端渲染，禁止渲染时调用可编辑行查询，覆盖空场景、无根循环、折叠/展开全选、Edit/Play切换、连续原生空增量及显式getTransform引用编辑仍完整上传。菜单与键盘相关最终6项通过，TypeScript与diff检查通过。首次检查修正新增getter缺少逗号；随后修正测试调用为实际API selectAllVisible，仅重跑失败测试通过。没有修改世界比较/失效规则。

对照b449992与当前生产MenuBar/store，使用Amazonia 7,409实体及模拟空增量，两组预热、九组交替采样、每组20次；每次包含关闭MenuBar渲染、store模拟步和一次render snapshot读取。首次菜单读取可编辑行2,577→0，菜单HTML及最终实体内容相同；模拟前准备中位1.052660→0.010140ms，整个局部前端循环3.499855→0.790790ms。基准包含SSR与模拟回复，不代表原生FPS；真实动态增量和浏览器绘制尚待验证。原始脚本/逐组数据/场景SHA256位于tmp/docs-artifacts/editor-performance-risk/menu-read-{benchmark.mjs,benchmark.log,summary.json}，测试/编译日志同前缀。

本项仅做定向检查，未重建Editor或重复原生QA；当前aa67609c版本不包含本修复。下一相关批次合并验证菜单关闭/展开、Ctrl+A与空场景/折叠层级、实时地图切换，以及连续simulation-profile中的prepareMs/acceptMs与实际交互。此前特殊材质、强制竞态/跨窗口/EditUndo/真实延迟待测项继续保留。


## 第四十九阶段稳定结构的原生世界同步

SharedSnapshotWorld保留源ID与本地Entity的顺序表。新快照的数量、逐项ID和父级均一致时，只应用Arc身份变化的记录，继续更新时钟/背景/选择元数据；跳过ID集合重建、删除检查、遍历顺序重建和previous整表重填。实体增删、重排、父级变化或重复ID走完整处理，引用映射改变仍刷新受影响组件。world只通过不可变引用提供给消费者，不允许外部修改后绕过结构判定；数据更新及热更新路径保持既有职责。

既有snapshot_world 5项通过，新增与6370937生产实现的完整结果对照1项通过；Play运行时集成26项通过、4项手动基准忽略，覆盖历史版本、运行/排队中的Stop及重启、Scene/预览独立镜像、脚本输入和显式reset。新增对照覆盖时钟/选择/背景、组件/名称/活动/层/标签、增删/重排/重设父级、重复ID、generation复用、前后版本、空世界及owned入口，并验证不变组件的快照Arc身份。独立HashMap的删除顺序可能改变本地槽分配，对照需按源ID回映实体和组件引用；首次直接比较本地ID失败，调整对照口径后通过。

定向手动benchmark_stable_snapshot_world对照完整旧实现，真实Amazonia 7,409实体，两组预热、九组交替采样、每组20次。仅时钟变化中位0.675540→0.144000ms；64个Transform往返变化0.864505→0.358015ms，结果内容一致。每份mirror增加118,544字节顺序元素存储（16字节×7,409，不含分配器元数据）；结构变更时仍有完整处理及临时分配。该CPU基准不含模拟/IPC/渲染，不代表实际动态负载或FPS。首次基准假定所有Transform显式带position而失败，改为选择有明确位置的64个记录后通过。

证据位于tmp/docs-artifacts/editor-performance-risk/stable-world-{tests,equivalence-tests,equivalence-retest,benchmark,benchmark-retest,host-tests}.log与stable-world-summary.json（含源场景摘要和逐组数据）。本轮没有Editor EXE构建或地图QA；当前aa67609c版本不含本项和6370937菜单修复。下次相关原生批次共用一次构建，检查真实Game/Scene/相机预览、动态对象与直接编辑、Stop/重启/换图、顺序/父级变化，并复测simulation-profile及worldSyncMs。特殊材质、强制竞态、跨窗口/EditUndo和真实输入延迟风险继续保留。


## 第五十阶段节点选择的只读访问

范围选择、全选和纵向导航通过内部visibleIds读取可见节点；选择子节点和横向导航通过readChildren/lookup读取。保留兄弟排序、折叠状态、选择锚点和边界行为，横向导航每次只收集一次子节点。公共getVisibleFlat和实际编辑仍暴露可编辑记录，继续检测直接引用修改。此修改避免只读选择使运行世界进入后续逐节点校验，不改变世界比较规则。

定向29项通过，覆盖选择/活动/移动、真实菜单渲染及原生记录归属。新增测试在Vite测试环境观察实际记录暴露，连续三轮范围/全选/子节点/方向导航新增暴露为0；验证选择结果、空/无效节点、模拟步无需上传、公共节点引用修改仍完整上传且不污染已发布快照。前端构建通过。日志为tmp/docs-artifacts/editor-performance-risk/hierarchy-read-{tests,editor-build}.log。

与6370937菜单查询、c8902a0稳定原生同步合并一次原生构建及相关地图验证。QA新增--hierarchy-interactions，在连续采样后覆盖实际双击/空格聚焦、折叠Ctrl+A、展开菜单全选、Shift范围选择及换图后的重复操作；结合Scene/Game/相机预览和Inspector运行编辑核对真实动态路径。执行结果追加于本阶段，未覆盖的特殊材质、强制竞态、跨窗口/EditUndo和真实输入延迟继续保留。


三项共用一次前端构建和1分14秒原生构建，EXE SHA256 f00c7f2e53e6b59257b80270cb0d5ee5bcef7abea35f288cf544b7d0bf94757c，仅既有world_from_snapshot未使用告警。首次原生报告B001/map-session-1792785972914.json完成连续采样、Scene/Game/预览/分辨率、Inspector高度0→3.2经30步保留及恢复、动画和双击/空格聚焦，随后新增菜单测试对空名称调用startsWith中断。修正后同EXE仅重跑hierarchy-only；B001/map-session-1792786047637.json的Ctrl+A/菜单全选通过，范围断言因测试用selection.reveal重设锚点失败。按API的选择语义将揭示操作移到设置锚点之前，再定向重测。两次失败均保留原始报告，未重建产品或重复性能采样。

已完成的10秒采样为7,410实体、850×478、末尾240次呈现：55.1382次/秒，间隔均值18.13625ms/P95 27.8ms，渲染12.56645ms，世界同步1.26488ms。239个去重模拟版本平均准备0.02720ms、invoke 6.05941ms、增量应用0.47322ms、编辑器接收0.13264ms、请求总计6.69582ms；原生模拟2.11095ms、命令2.32918ms。此前独立运行准备1.78844ms/世界同步2.03981ms，当前读路径与同步成本下降，但独立运行不能证明受控整体提速或稳定60 FPS。invoke减命令3.73024ms仍含编码、投递、解码与回调等待。

本地证据为tmp/docs-artifacts/editor-performance-risk/hierarchy-read-{native-build,native-qa,interactions-retest,interactions-final}.log及hierarchy-read-summary.json；Game采样截图已目视核对。强制在途竞态、跨窗口、特殊材质、Edit父级/重排与Undo、真实输入延迟仍待测；未以本批正常路径验证关闭这些风险。


最终定向报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792786117908.json` 通过：折叠Ctrl+A、展开菜单全选、Shift范围选择、展开/折叠/左右键、双击/空格聚焦、换图后重复操作和Stop作者场景恢复全部通过，编辑器正常退出。结合首次采样已通过的阶段，本批关闭三项优化的上述正常集成覆盖；其余专项待测保持开放。


## 第五十一阶段密集层级按实体槽存储

最新原生采样1792785972914的单帧TransformHierarchy.build为2.0137ms，网格/材质提取为2.9032ms；这些是单帧定位依据，不是阶段平均。完整层级构建现在统计所有存活实体的槽范围，并收集活动请求；槽范围不超过活动请求数的两倍时，按实体槽直接存储解析结果，逐项校验generation。槽范围包含失活祖先，稀疏高槽位/大量失活对象及build_for_entities子集查询保留哈希存储。每次构建独立，变换组合、循环占位、活动继承和公共API不变。

9项层级测试通过，补充密度阈值后单项重测通过；渲染消费者11项、2D/3D物理5项、音频1项通过，共26项不同检查。新增测试使用08ce6b2哈希解析器作为独立结果对照，覆盖槽复用/旧generation、失活高位祖先、缺失/循环父级、无Transform中间节点、非法数值、倒序遍历、空世界、密度临界点及稀疏子集。既有容量基准继续明确比较哈希表增长与预留，避免混入密集存储收益。

手动局部benchmark_dense_hierarchy通过：两组预热、九组交替样本，每组30次构建。真实Amazonia 7,409实体解析5,411节点，中位1.023467→0.636240ms（约37.8%）；菜单4,340实体解析1,640节点，保留稀疏存储，中位0.157127→0.156907ms，基本持平。输出逐项相同。Amazonia密集槽数组为1,066,896字节（7,409×144），不包含临时请求数组和分配器元数据；未测整个Editor内存或FPS。

复现：`cargo test -p mengine-core --release --lib benchmark_dense_hierarchy -- --ignored --nocapture --test-threads=1`。证据保存在tmp/docs-artifacts/editor-performance-risk/dense-hierarchy-{tests,equivalence,density,consumers,audio,physics,benchmark}.log及dense-hierarchy-summary.json（源场景摘要、完整样本、内存口径）。本项未重建原生Editor或重跑地图QA；当前f00c7f2e EXE尚不含本项。下一相关原生批次核对Game/Scene/预览、动画/失活及复活、父级与Undo/Redo、正常地图切换/Stop，观察连续层级构建及总呈现耗时。已有特殊材质、强制竞态、跨窗口和真实输入延迟待测继续保留。


### 密集层级的原生集成结果

与大厅文本提交共用EXE `3371f8fc2dfb46bf16bf871569bbc570e7feecd594d45ae4934339b261ae1054`，前端构建及原生Release构建通过，原生耗时1分27秒，仅既有world_from_snapshot未使用告警。B001/map-session-1792788103376.json通过，0 error、正常退出；覆盖Scene/Game／相机预览／轨道、分辨率、真实Inspector修改与恢复、三层动画、模拟时钟和Stop还原。运行截图已检查。

7,410实体、850×478、末尾240次呈现：54.4452次/秒，间隔平均18.3671ms/P95 27.7ms，原生渲染12.4069ms，世界同步1.3059ms；239个模拟版本分段数据完整。此前独立运行55.1382次/秒，本轮没有证据支持稳定整帧提速或60 FPS。最新单帧TransformHierarchy.build为1.4908ms，不作平均收益结论。此前CPU基准的局部收益与本次真实呈现口径分开保留。

证据为 `tmp/docs-artifacts/editor-performance-risk/dense-hierarchy-native-{qa.log,summary.json}`，完整报告见测试批次。父级修改与Undo/Redo、失活／复活、强制切换竞态、脱离窗口、材质专项和真实操作延迟仍待后续相关批次验证。本次未重跑全库、全量地图导入或其他已通过的专项。


## 第五十二阶段普通材质跨帧复用与颜色覆盖去重

最新原生报告1792788103376中的单帧“Mesh objects and materials”为2.7443ms，是本阶段定位依据，不是平均值。RuntimeMaterialCache现在在原有源文件检查后，按不可变MaterialAsset身份复用普通材质的SharedRenderMaterial；源改变即替换，显式失效／读取失败移除对应缓存，旧帧继续持有独立快照。材质实例与自定义shader继续经过现有解析路径，250ms文件检查间隔不变；resolve仍返回可编辑副本，帧提取改用resolve_shared。

仅颜色覆盖先复用同一颜色规范化函数，结果位级相同时直接使用原材质；其他颜色按本次提取内存活的材质载荷身份和颜色位缓存，避免重复哈希长路径。范围外值、NaN／Infinity、正负零均与原结果一致；其他覆盖不共享可编辑状态。每个普通材质路径新增一个持久渲染载荷，完整进程内存尚未测量。

| 真实作者场景 | 对象数 | 原提取中位 | 当前提取中位 |
| --- | ---: | ---: | ---: |
| Amazonia | 2,747 | 1.008140 ms | 0.788635 ms |
| 主菜单 | 219 | 0.176265 ms | 0.153020 ms |

对照固定9d3e983的完整提取／材质解析实现，两个版本各预热2组，再交替9组×20次；完整RenderObject与材质输出相等。Amazonia局部耗时减少约21.77%，菜单约13.19%，不包含GPU、IPC、整帧或实际FPS。基准保留正常源文件检查，原始样本与场景摘要在 `tmp/docs-artifacts/editor-performance-risk/prepared-material-summary.json`。

材质解析19项、提取8项通过，手动基准1项通过；覆盖跨帧共享、编辑隔离、正常轮询／别名失效、缺失／损坏恢复、实例父级更新、自定义shader切换／恢复、项目隔离、颜色边界与场景视图。首次新增shader断言未考虑加载器规范化末尾换行，修正断言后通过；一次提取测试过滤名未命中，已改用mesh_cache_tests实际执行8项。日志为prepared-material-{tests,final-tests,extraction-final,final-benchmark}.log。原生集成编译结果与待批次范围见testing-batches；本阶段未重建Editor EXE或重跑完整地图QA，现有3371f8fc EXE尚不含此优化。


## 第五十三阶段网格同步提前去重

Amazonia作者场景包含2,747个活动网格对象、246个不同网格键，其中2,721个对象使用220个姿势键。RuntimeMeshCache在主视图与嵌套视图的合并迭代入口按完整GPU网格键去重，再解析姿势、规范化扩展名与更新使用帧。每个键保留首次出现的顺序；不同相机／模型变换生成的billboard键继续独立处理。去重集合只存活于本次同步，250ms文件轮询、源验证、失败重试、上传和缓存淘汰规则保持不变；需要逐对象变换的prepare_billboards不受影响。

18项网格定向测试通过，2项手动基准默认忽略。新增测试以0a7f7d2完整sync_objects为固定对照，比较跨主／嵌套视图重复键和空白、静态网格、姿势、地形、非法patch／pose、缺失源，以及外部buffer修改／删除／恢复的错误顺序、轮询次数、上传、缓存字节和使用帧。既有不同相机billboard、源热更新及淘汰检查同时通过。复现：`cargo test -p mengine-runtime --release --lib meshes:: -- --test-threads=1`。

手动benchmark_warm_mesh_key_dedup通过，固定旧实现与当前实现各预热2组、交替9组×200次。使用实际作者场景的网格列表，预置已尝试状态并在计时中固定为非轮询帧，只比较热缓存遍历；不包含billboard准备、源加载、GPU上传或IPC。两边缓存状态相等。

| 作者场景 | 对象／不同键 | 原遍历中位 | 当前遍历中位 |
| --- | ---: | ---: | ---: |
| Amazonia | 2,747／246 | 0.460216 ms | 0.133081 ms |
| 主菜单 | 219／156 | 0.039481 ms | 0.037798 ms |

Amazonia此局部路径减少约71.08%，菜单约4.26%；不代表整个RuntimeMeshCache.sync、内存总量或实际FPS收益。复现：`cargo test -p mengine-runtime --release --lib benchmark_warm_mesh_key_dedup -- --ignored --nocapture --test-threads=1`。完整样本、源场景SHA256和日志保存在 `tmp/docs-artifacts/editor-performance-risk/mesh-key-dedup-{summary.json,tests.log,benchmark.log}`；测试参考实现固定于0a7f7d2。

本轮未重建原生Editor、运行完整地图QA或全库测试。与第五十二阶段材质优化合并进入下一相关原生批次：连续Amazonia性能、Game／Scene／多相机预览、动画与billboard、资源热更新及删除恢复、换图／Stop和缓存淘汰。当前EXE仍为3371f8fc，不能用于证明本阶段已通过原生验收。


## 第五十四阶段同视图普通姿势键复用判定

prepare_billboards在一个视图内借用无需billboard的源键，重复对象直接跳过姿势解析和源检查；需要相机朝向的对象仍逐个计算模型变换与相机专属键。替换键收集后在同次调用末尾写回，借用期间原对象字符串不变；主视图和各预览视图使用独立集合，源验证继续共享本帧FrameSourceChecks。集合不跨帧，原有文件轮询／失败恢复保持生效。

19项网格定向测试通过（3项手动基准默认忽略），局部基准1项通过。新增对照固定0076a12的完整prepare_billboards，验证重复键、不同姿势、平移共享、旋转／缩放分离、零尺度、空白与非法键、两个相机，以及源buffer修改／删除／恢复和移除billboard标记；输出键、相机变换、缓存状态、源检查与文件检查次数一致。复现：`cargo test -p mengine-runtime --release --lib meshes:: -- --test-threads=1`。

实际作者场景、预热2组后交替9组×100次，在不触发文件轮询的暖源状态测量prepare_billboards；对象克隆不计时，GPU同步和IPC不包含。Amazonia 2,747对象／198来源／23个billboard，中位0.351219→0.144535ms，减少58.85%；主菜单219对象／154来源／0个billboard，0.023742→0.036900ms，增加约0.013ms。主菜单重复较少，集合检查成本超过复用收益；保留这一小场景代价，不宣称全部场景均提速或整体FPS收益。

复现：`cargo test -p mengine-runtime --release --lib benchmark_billboard_source_decisions -- --ignored --nocapture --test-threads=1`。证据为 `tmp/docs-artifacts/editor-performance-risk/billboard-source-{mesh-tests.log,benchmark-final.log,summary.json}`，包含完整样本及源场景摘要。与第五十二、五十三阶段共用本次原生构建，实际运行结果登记于测试批次台账。


### 第五十二至五十四阶段原生合并结果

共用Release构建1分14秒，EXE SHA256 `c49946ba87fdad37899dfeb3feb7607f7f72944c16a1c79cce7aebc022d896aa`，仅既有world_from_snapshot未使用告警。`qa-frost-map-session.mjs --continuous-profile --transport-profile --simulation-profile --viewport-transitions --runtime-edits` 报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792790439071.json` 通过：Game／Scene／相机预览、轨道、两种分辨率、Inspector修改保留及恢复、三层动画和时钟、Stop还原，0 error、正常退出；Game截图已目视核对。

7,410实体／850×478，末尾240次呈现平均54.1908次/秒，间隔18.4533ms／P95 27.3ms，原生渲染11.4695ms，世界同步1.2987ms；240个不同模拟版本的计时完整。此前独立运行54.4452次/秒、原生渲染12.4069ms，本次不能据此宣称整体FPS提升或稳定60 FPS。主线程前端准备平均0.3183ms、完成0.6242ms，请求15.8663ms；后续应继续检查呈现间隔和传输／调度，保留实际呈现口径。

最新单帧Mesh objects and materials 2.0312ms、TransformHierarchy.build 1.5367ms、RuntimeMeshCache.sync self 0.6108ms、GPU map wait 1.3768ms仅作定位依据，不是阶段平均。构建、地图日志和原生摘要在 `tmp/docs-artifacts/editor-performance-risk/render-cache-{native-build.log,map-qa.log,native-summary.json}`。资源专项结果与剩余验收边界记录于测试批次台账。


同EXE资源专项 `render-cache-resources-final.json` 通过：改名／撤销重做／持久恢复、资产监听增改删、Play生命周期及暂停像素稳定、五种材质／shader／纹理／glTF资源热更新和精确像素恢复；0 error、正常退出。初次连接失败及QA异常类型识别修正见批次台账。原资源摘要保持不变；截图已目视核对。父级Undo、失活复活、强制竞态、独立窗口、资源删除恢复和缓存总内存等专项继续待测。


## 第五十五阶段按实际接受的请求推进视口节拍

上一原生报告1792790439071的240帧中，请求起点相邻间隔平均18.4276ms；由完成时间减去transportMs还原起点，相对上一帧完成平均间隔2.5707ms（含20次重叠提交）。这些数据用于定位调度，不把全部等待归因于同一个定时器。代码确认Game、Scene和相机预览在beginNativeViewportRequest判定重复之前就更新lastRequestAt，未提交的请求也会推迟后续截止时间。

现在由beginNativeViewportRequest在真正接受ticket时记录调用者的请求起点；容量满或重复键保持原时间戳。到期的Game完成回调直接进入下一次paint，未到期或处于原生busy／会话重试期则按剩余时间唤醒。已到期的重复请求不再建立短周期轮询，等待原请求完成或新世界通知。保留双在途容量、单相机预览容量、generation／世界归属校验、截图排空及失败重试；运行帧节拍采用第五十八阶段的固定时间轴。

56项定向测试通过，涵盖Game／Scene完成节拍、重复与容量限制、到期立即提交、无rAF／整数定时器、busy恢复、乱序完成、项目／会话／分辨率切换、截图与卸载。新增测试确认拒绝重复键不延后新版本提交、等待期间不产生短周期timer、到期提交不增加零延时task。旧测试环境补齐当前视口归属与准备计时接口，Scene绘制判断提取范围限定为Scene逻辑；未修改产品归属规则。复现：`node --test packages/editor/tests/nativeViewportRequests.test.mjs packages/editor/tests/nativeGameCompletionScheduling.test.mjs packages/editor/tests/nativeSceneCompletionScheduling.test.mjs`。

前端构建通过，原生Release构建1分07秒通过，仅既有world_from_snapshot未使用告警。由于修改影响真实WebView计时与呈现，本轮定向运行连续Amazonia和Scene／Game／预览／Stop验收；未重复上一批资源热更新、全库测试或地图全量遍历。结果记录于测试批次台账，初次测试环境缺失的失败日志与最终56项通过日志均保留在 `tmp/docs-artifacts/editor-performance-risk/native-pacing-*`。


原生报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792791223023.json` 通过，EXE SHA256 `46eecf10edec16a1fa35e82ee3ff675d18626f7383fd66a1f26d2e1d825d1887`。连续Amazonia、Game／Scene／相机预览／轨道、分辨率、Stop还原通过，0 error、正常退出；Game截图已目视核对。7,410实体，末尾240次呈现平均55.0269次/秒，间隔18.1729ms／P95 27.0ms；原生渲染11.4975ms，世界同步1.2744ms，239个不同模拟版本计时完整。

请求起点相邻间隔平均18.1778ms，相对上一帧完成平均间隔2.0226ms。此前独立运行分别为54.1908次/秒、18.4276ms和2.5707ms；两次单独运行不能证明稳定提速或60 FPS。确定性测试证明请求被拒绝时不再推迟截止时间，到期完成不再依赖额外timer；原生验收证明正常集成路径可用。摘要为 `tmp/docs-artifacts/editor-performance-risk/native-pacing-summary.json`，原始构建与QA日志使用同前缀。此轮未重复资源热更新、Inspector编辑和全库测试，上一批相关结果保留；真实操作延迟、强制在途竞态和脱离窗口等专项保持待测。


## 第五十六阶段 Play 编译结果的大小校验与脚本所有权

原地图单位绑定的原生验证触发“Play script exceeds 16 MiB”。复现时入口脚本为 15,993,429 字节，编译器 JSON 输出为 16,795,948 字节，既有检查把 JSON 转义开销计入 16,777,216 字节的脚本上限，因而拒绝了仍在范围内的脚本。证据：tmp/docs-artifacts/frost-original-maps/unit-bindings-compiler-size.json；首次原生失败报告 B001/map-session-1792794010926.json。

start_editor_play 调用 play_compiler::source，按解码后的 UTF-8 源码字节数检查原有 16 MiB 上限；编码响应另按 JSON 最坏六倍转义开销加信封余量设界限。直接反序列化到拥有 String 的结构并转移所有权，避免先构造 serde_json::Value 再复制整份源码。没有增大脚本上限，也没有改变编译超时、Play generation 或项目归属校验。

两项 Rust 边界测试通过：大量反斜杠／引号／换行造成的合法大 JSON、中文源码精确边界、实际超限脚本、缺失／错误类型 source 和非法 JSON。命令 cargo test -p mengine-editor-tauri --release --lib play_compiler::source_tests -- --test-threads=1。该修复解决启动误拒绝与一次源码复制，不作为稳定 FPS 或实测内存峰值收益。入口仍接近上限，后续资源模块化应按真实加载需求设计。


Release 构建通过，耗时1分06秒，仅既有 world_from_snapshot 未使用警告。EXE SHA256 `7e8e4e9b2f32cec3c8a75342ba0bf5932d2c7a12856bd778718cd670ee87f93a`。原生报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792794409250.json` 确认大入口脚本能进入 Play、进行地图交互并 Stop 恢复，0 error、进程正常退出；该报告的选择圈组件断言不代替视觉验收，后续贴图修复与截图结论另记。源码 LF 规范化发生在构建后，未改变 Rust 语义。没有重跑完整编辑器回归或帧率基准。


## 第五十七阶段编辑器变换层级增量计算

EditorViewportRenderer 持有 TransformHierarchyCache，以 World 身份、实体 generation、局部 Transform 原始位、Parent、激活状态和父级计算版本判断复用。World 为 Transform／Parent 的写入、可写访问、移除及激活状态改变维护独立 hierarchy_revision；网格动画、材质、名称和兄弟排序不触发无关的局部变换读取。自定义 Any 投影不信任 revision，每次读取实际输入。父级计算改变会传播到子级；循环仍按当前遍历顺序插入无效占位并禁用该分支。

每次返回独立拥有的 TransformHierarchy，不让旧帧引用可变缓存。新 World、实体槽复用和计数边界会重置对应状态；稀疏／高槽号场景继续使用原有有界 HashMap 计算，释放稠密缓存。没有缓存镜头投影、材质或对象活动过滤结果。该缓存目前仅接入编辑器视口，独立 Player 仍采用原有构建路径。

核心定向检查 34 项通过、6 项手动基准忽略，覆盖原有 World／snapshot／层级行为及新增重复帧、非变换编辑、父级改动、局部变换、激活、移除 Transform、循环／自环、反向顺序、失效父级、generation 复用、非有限值、跨 World、自定义实时 Any 投影和计数边界。原生构建与实际编辑器结果另记。本次涉及核心失效规则，因此在批次内提前执行相关原生变换／多视图专项，不重复全库和资源热更验收。

手动局部对照使用实际作者场景，原 stateless TransformHierarchy::build 与新 cache.build 在相同 World 上各预热2组、交替9组×40次。每次移动一个相机；另测所有 MeshRenderer 可写访问，以及所有 Transform 都变化。计时包含可写访问和独立输出分配，不包含GPU、IPC或整个编辑器。所有场景输出与原构建结果一致。

| 场景／每帧变更 | 原构建 | 缓存构建 | 额外缓存 |
| --- | ---: | ---: | ---: |
| Amazonia／相机 | 0.669668 ms | 0.444190 ms | 1,778,400 B |
| Amazonia／相机及全部网格 | 0.895037 ms | 0.659703 ms | 1,778,400 B |
| Amazonia／全部变换 | 0.854058 ms | 0.971197 ms | 1,778,400 B |
| 菜单／相机 | 0.158313 ms | 0.163808 ms | 0 B |
| 菜单／相机及全部网格 | 0.201780 ms | 0.204115 ms | 0 B |
| 菜单／全部变换 | 0.213673 ms | 0.208615 ms | 0 B |

Amazonia前两种局部场景分别减少约33.67%与26.29%；全部变换每帧变化时增加约0.117ms，不能宣称所有动态场景提速。缓存字节仅为缓存 Vec 容量×元素大小，不是整个进程内存增量；World 另增加每记录一个 u64 版本字段。菜单使用稀疏回退，微小计时差异不作为提升结论。

复现：`cargo test -p mengine-core --release --lib -- --test-threads=1`；`cargo test -p mengine-core --release --lib benchmark_hierarchy_cache -- --ignored --nocapture --test-threads=1`。证据：tmp/docs-artifacts/editor-performance-risk/hierarchy-cache-{tests.log,benchmark.log,summary.json}，包含样本和场景摘要。首次新基准的 Rust 小数常量缺整数部分导致编译失败，修正测试后通过；原始失败日志保留。没有将局部 CPU 收益换算成 FPS。


原生Release构建1分26秒通过，仅既有 world_from_snapshot 未使用告警；EXE SHA256 `b09afab0956b20576c023ac697a01324a699a7fb468023ca8393221f85aded54`。原生报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792796299328.json` 通过连续模拟、Game／Scene／相机预览／轨道／分辨率、Inspector高度0→3.2经30步保留与恢复、三层动画和Stop还原，0 error、正常退出，截图已目视查看。此次不重复资源热更和全库测试。

7,411实体／850×478，末尾240次呈现平均54.9388次/秒，间隔18.2021ms／P95 27.9ms，原生渲染11.0336ms、世界同步1.2703ms，239个不同模拟版本。与此前独立运行55.0269次/秒相比，仍无稳定整体FPS收益或60 FPS结论。最新单帧TransformHierarchy.build为0.4897ms，仅用于定位，不充当平均或严格原生前后对照。摘要为 tmp/docs-artifacts/editor-performance-risk/hierarchy-cache-native-summary.json。


补充像素验收复用同EXE，仅运行 `qa-frost-map-session.mjs --runtime-edits-only`，报告 `B001/map-session-1792796459914.json` 通过，0 error、正常退出。QA将Scene相机对准受测岩石根节点，在截图前清除选择，避免选中框／gizmo变化代替实际网格变化；暂停时修改Inspector高度使原生像素变化，还原后图像SHA256与修改前完全一致。前后截图已目视确认岩石升起。随后30步的修改保留、动画／时钟、恢复和Stop也通过。测试脚本记录三张图的摘要；没有再次构建或重跑连续性能采样。WebView锁缓存按既有约定保留。


## 第五十八阶段模拟与视口固定时间轴

Play模拟、Game和连续Scene请求按60Hz固定时间轴推进截止时刻。定时器迟到后仍沿当前时间轴选择下一个时隙；长耗时跳过已经错过的时隙，不补发积压工作。相邻实际启动至少间隔半个周期（约8.33ms），限制恢复相位时的密集请求。模拟继续串行、实际dt上限0.25秒，视口继续最多两个在途请求；重复键／容量满不会推进截止时刻，busy／会话过期仍受16ms退避约束。首次进入、项目／会话／模式／尺寸变化沿既有归属规则重置请求状态，截图继续排空并拥有请求入口。静态编辑轮询、相机预览独立节流及资源刷新保持既有行为。

定位证据来自上一原生报告1792796299328：240条呈现记录推算的239个请求起点间隔平均18.1523ms，完成至下一起点平均2.6255ms，存在负值重叠。不能把所有差额都归因于定时器；代码确认模拟和视口都从实际启动时间再次加16.67ms，整数取整与迟到会沿每次启动向后累积。原始推算样本在 tmp/docs-artifacts/editor-performance-risk/frame-cadence-baseline.json。

定向调度71项与生产视口3项检查通过。新增测试在模拟、Game、Scene中注入每次1.3ms迟到，验证2秒内相位误差不累积；Game／Scene含初始帧各120次提交，模拟初次延迟启动共119次。覆盖600ms阻塞后跳过时隙、实际dt上限、半周期最小间隔、单步／暂停／重启、无rAF、整数timer、过期结果丢弃、乱序完成、并发容量、重复键、busy、截图、卸载、选中与浏览器覆盖层。已有精确时刻断言按固定时间轴更新；生产pending gate测试环境补入实际deadline helper及截止时刻，首次失败日志保留。

命令：node --test packages/editor/tests/playbackCompletionScheduling.test.mjs packages/editor/tests/nativeViewportRequests.test.mjs packages/editor/tests/nativeGameCompletionScheduling.test.mjs packages/editor/tests/nativeSceneCompletionScheduling.test.mjs；另运行viewportGameCompletion／viewportSceneCompletion／viewportPendingPaint三个生产代码集成检查。结果为 frame-cadence-tests-final.log、frame-cadence-viewport-tests.log、frame-cadence-pending-final.log。前端与原生共用一次构建，因真实WebView计时行为必须验证，执行连续原生呈现／多视图专项；不重复全库或资源热更。


原生定向结果：前端构建3.14秒、Release构建1分04秒通过，仅既有 world_from_snapshot 未使用告警。报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792797179807.json` 通过连续模拟、Game／Scene切换、相机预览／轨道、宽高分辨率及Stop还原，0 error、正常退出，截图已目视查看。EXE SHA256 `457b1b5c4c977ef9cc5585cea21ea49ca8cb4f87cf29d5e19e5c9da31e5dd55a`。测试临时WebView缓存因EPERM保留在本报告对应native-qa/runtime目录，发现文件已清理。

10秒采样窗口，7,411实体／850×478；末尾240次呈现平均59.9970次/秒、间隔16.6675ms／P95 24.6ms，原生渲染10.8891ms、世界同步1.2092ms，237个不同模拟版本。239个推算请求起点间隔平均16.6686ms，完成至下一起点平均1.4653ms。上一独立运行54.9388次/秒仅作为同场景参考；当前短窗口平均接近60，不代表长期无抖动或跨机器稳定60 FPS。摘要为 tmp/docs-artifacts/editor-performance-risk/frame-cadence-native-summary.json。


## 第五十九阶段跨窗口会话序列化

独立面板存在时，主窗口播放循环约每33ms通过scene-state发送完整会话。会话JSON采用紧凑格式；原生运行世界与私有编辑副本一致时，复用已冻结实体的JSON片段，只重新序列化变更实体和时钟、选择、镜头等元数据。缓存按对象身份保存于WeakMap，不持有旧实体；重排、删除、实体ID复用和跨场景使用当前实体顺序与身份。Inspector或外部引用直接修改使原生基线不匹配时，走实时序列化。自定义全局toJSON／JSON.stringify时停用缓存并清空缓存入口。作者场景saveSceneJson仍使用原来的两空格缩进，落盘格式保持一致。

局部对照使用作者Amazonia地图7,410实体，Node进程内预热2次，9组交替×每组12次。原会话路径按全部实体投影并两空格格式化，中位15.9624ms；仅紧凑序列化9.0770ms；当前真实Store.saveSessionSceneJson（含运行世界一致性检查）4.9892ms。解析后的文档深比较一致。新缓存首次填充另测9次，中位8.8916ms，仅统计序列化器，不含创建运行世界。UTF-8消息6,062,161→3,347,805字节；静态实体片段UTF-8合计3,340,120字节，不是V8堆内存或整个编辑器内存。强动态场景会重新生成变化实体片段，不能套用静态收益。

31项相关检查通过：新会话测试3项；复用本次同步／快照／Play世界检查28项通过结果。覆盖独立Store加载、运行改动、实体重排、删除／替换、选择、镜头、Stop作者实体恢复、提交时钟和原生revision；初次新测试对Stop后镜头／选择也应回退的假设不符合既有语义，已修正并仅重跑3项新测试。TypeScript检查通过。没有运行全库、前端打包或原生构建。

命令：node --test packages/editor/tests/sessionSceneSerialization.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs packages/editor/tests/presentationSnapshot.test.mjs packages/editor/tests/playWorldSync.test.mjs；pnpm --filter @mengine/editor exec tsc --noEmit。原始结果与基准输入SHA在tmp/docs-artifacts/editor-performance-risk/session-serialization-{tests.log,tests-final.log,types.log,benchmark.json,benchmark.mjs}。局部测量不包含BroadcastChannel复制、接收端JSON解析／世界重建或真实输入延迟，不作为FPS结论。接收端仍全量处理；原生双窗口长期运行、接收端增量复用及总内存待后续相关批次。


## 第六十阶段独立窗口运行副本复用

远端Play／Pause场景继续完整解析、迁移和规范化，通过已有Play世界比较基线保留未变化的冻结实体。私有作者镜像与运行副本分别按冻结实体身份复用；已通过Inspector、层级或公开引用暴露的运行副本在下一条权威消息中重新生成，防止本地修改污染后续消息。进入编辑状态的加载清除作者副本缓存。原生运行消息与本地原生结果共用不可变发布入口，保留session／revision／模拟时钟配对。App接收消息后发布presentationSnapshot，避免再深拷贝整个世界。作者镜像和运行数据仍相互独立，Stop后的编辑接口继续可写。

定向36项检查通过：远端稳定记录、变更／重排／删除／实体ID复用、直接引用和Inspector修改、旧帧不可变、Stop后编辑、旧版场景迁移、原生会话切换及缺失revision；真实App消息处理函数在独立Store之间同步，验证面板收到冻结记录、旧消息丢弃及停止后编辑。TypeScript检查通过。测试命令：node --test packages/editor/tests/remoteRuntimeReuse.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs packages/editor/tests/presentationSnapshot.test.mjs packages/editor/tests/sessionSceneSerialization.test.mjs packages/editor/tests/playWorldSync.test.mjs。35项首次通过后新增App覆盖并强化冻结记录断言，仅用test-name-pattern运行新增／受影响的2项，均通过；去重36项。

Node局部基准以同进程加载提交51890a5的原Store和当前Store，读取同一作者Amazonia地图7,410实体。预热2轮、9组交替×6次；两侧解析结果和作者指纹一致。接收加载本身26.6516→14.0709ms；包含实际接收端的指纹计算和面板快照68.4152→38.1849ms。只改一个Transform时完整接收链路69.2313→38.2900ms；全部7,403个Transform变化时93.0478→82.9847ms。稳定输入下7,410个冻结实体身份复用。仍有全量JSON.parse、规范化和作者指纹遍历；不宣称无分配、恒定时间、进程内存下降或FPS改善。

本项与第五十九／六十一阶段已合并构建，正常原生多窗口覆盖见第六十一阶段。证据：tmp/docs-artifacts/editor-performance-risk/remote-runtime-reuse-{tests.log,app-tests.log,types.log,benchmark.mjs,benchmark.json,benchmark-final.log}；基准保留输入SHA及原始分组。后续重点是作者指纹成本、接收消息增量化和原生跨窗口交互延迟／竞态／总内存。


## 第六十一阶段远端作者指纹与原生修改归属

独立窗口的运行作者镜像使用已冻结实体计算规范化JSON片段，WeakMap仅复用未变化实体；输出与原完整规范化指纹逐字节一致。颜色、顺序、替换和元数据继续参与；可变作者场景、稀疏数组及自定义全局序列化走原完整路径。Stop、进入本地Play或普通场景加载解除远端作者指纹引用，运行组件编辑不污染作者脏状态。

主窗口拥有原生运行会话时，收到跨窗口运行内容保留原作者场景、背景色、下一实体ID及撤销历史，仅替换运行世界。收到的数据标记为待上传；在原生接受前不发布原生世界引用。模拟提交记录远端修改版本，较早的启动／单步结果不会覆盖后来到达的编辑，下一次模拟上传当前完整运行世界。只有当前修改版本的原生结果恢复已同步状态。

38项定向检查通过：sceneFingerprint、remoteRuntimeReuse、workspaceSelectionSync、playWorldSync的去重用例，含播放归属和过期模式消息校验。新增覆盖规范化字节一致、缓存／可变数据、镜像与本地Play切换，以及原生启动和步骤在途时收到编辑、修改上传、后续免上传、Stop作者还原与撤销能力。命令与结果在tmp/docs-artifacts/editor-performance-risk/remote-{fingerprint-tests.log,fingerprint-final.log,edit-ownership-tests.log,edit-authoring-tests-final.log}。

局部Node对照基线ec60762、同一作者Amazonia7,410实体，2轮预热、9组交替×6次，结果相等。包含接收、指纹和面板快照：稳定输入48.7993→19.1200ms；一个Transform变化42.3295→17.3810ms；全部7,403个Transform变化84.8907→84.0420ms，密集变化基本持平。单独接收加载15.8239→17.0311ms，不能据此宣称所有阶段提速。完整JSON解析和规范化仍存在；缓存保留规范化字符串，不把CPU结果解释成FPS或进程内存下降。证据remote-fingerprint-benchmark.{mjs,json,log}记录输入SHA和全部样本。

本阶段与第五十九／六十阶段合并原生多窗口验收，使用qa-frost-map-session.mjs --detached-only。范围是原菜单载入Amazonia、独立Inspector双向变换编辑与原生保留、独立Scene／Game呈现、暂停／单步、换图重载、窗口重开、Stop还原、停止后作者编辑和正常窗口回收；不重复全库、全部地图或资源热更。原生结果另记。


播放模式由主窗口负责。独立窗口的播放操作通过携带场景、模式和会话的请求发往主窗口；过期请求不执行。主窗口拒绝独立窗口发来的不同模式、会话或运行场景的完整状态，并用更高同步序号重新发布当前状态，避免晚到的窗口启动回复把Stop后的编辑状态切回Pause。复现报告1792799649484记录了Stop实体还原后主窗口再次处于pause、Inspector显示旧运行相机的实际故障；新定向测试覆盖同类乱序与多窗口收敛。

最终原生报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792799928856.json` 全部通过，0 error、正常退出。EXE SHA256 `f4b4b4d323fc70630932d4aa7a73e7797b90d75d4aec03786a7f8a37b8845bf0`，最终Release构建1分09秒，仅既有world_from_snapshot未使用告警。真实独立Inspector编辑经3步原生模拟保留，主窗口恢复同步到Inspector；Scene／Game持续呈现并截图；暂停稳定、单步前进，独立Game的Ctrl+Shift+P能恢复／暂停主窗口；地图重载、Inspector重开、Stop全部作者实体还原、停止后独立Inspector编辑／恢复及窗口停靠均通过。最终Scene／Game截图已目视查看。测试WebView缓存因EPERM保留在隔离runtime目录，发现文件已清理。

三独立面板、7,411实体、5秒窗口：Scene平均5.9700次呈现/秒（29个间隔），Game4.8956（24个间隔），请求平均169.07／203.46ms，而原生渲染19.63／21.39ms。多窗口性能仍明显不足；这与此前单视口近60次/秒不是同一负载，不能宣称解决流畅度。Game最新profile未带worldRevision，需要继续核对是否走了完整snapshot渲染路径。汇总为tmp/docs-artifacts/editor-performance-risk/remote-sync-native-summary.json。

此前失败报告保留：1792799235274的QA用了Play不可调用的component.set，改为主窗口Inspector；1792799314125完成运行阶段后被QA固定Camera名称假设中断；后续authoring-only补测暴露晚到pause状态，诊断代码的空名称过滤错误也已修正。这些整份报告均不记为通过。修复播放归属后重新执行受影响的多窗口专项，最终报告覆盖全部正常路径；未重跑全库或资源热更。真实输入延迟分布、总内存、原生强制在途竞态和长期／跨机器性能继续待测。

### 第六十二阶段：跨窗口实体增量传输

主窗口发布已认证的原生运行世界时，以同步状态ID作为基线，仅传输变化位置的实体JSON和当前场景／帧元数据。首次同步、显式同步、换场景和换会话发送完整检查点；未上传的本地编辑、编辑模式及自定义全局JSON序列化保持完整JSON。稳定实体复用已有不可变记录的序列化缓存，每端只保留一个传输基线，删除和重排按实体数组位置准确还原。

接收端在应用前核对基线。缺失或乱序消息不推进已接受状态、不使用错误原生版本，并向主窗口请求一次完整检查点。启动和补齐请求只由主窗口响应，避免独立窗口旧状态与完整检查点竞争。编辑对象不作为传输缓存，运行编辑及Stop仍沿现有作者／原生归属规则执行。

快速检查：19项定向测试通过（18项首次检查及新增自定义序列化用例单独1项），TypeScript无输出通过。覆盖实体插入／删除／重排／ID复用、空场景、错误索引、漏收与乱序、三窗口补齐、运行编辑、会话切换和Stop。证据为 `tmp/docs-artifacts/editor-performance-risk/session-delta-tests.log`、`session-delta-types.log`，新增用例见 `packages/editor/tests/sessionSceneDelta.test.mjs`；未执行全套构建或原生QA。

同一作者Amazonia场景7,410实体的载荷检查逐条重建并对比完整JSON，均相等。仅场景字段按UTF-8 JSON编码计数：完整检查点3,679,246字节（完整JSON消息3,613,615）；仅时钟404字节（完整消息3,613,634）；一个Transform870字节（完整消息3,613,638）；全部7,403个Transform变化3,701,125字节（完整消息3,638,909）。这不是BroadcastChannel实际传输字节、CPU基准或原生FPS；完整和密集变化约增加1.7%至1.8%的编码载荷。输入SHA及明细见 `tmp/docs-artifacts/editor-performance-risk/session-delta-payload.json`。

接收端仍重建完整JSON并沿既有解析／规范化路径加载。原生 `PlayRenderHistory` 只保留3版，版本过期会走 `requestRevisionedNativeViewport` 的完整snapshot回退；这是已确认的代码机制，本次没有请求级证据证明上一批Game缺少worldRevision全部由此造成。多窗口约5 FPS问题仍开放，下一批需要复测呈现、版本回退、输入延迟和总内存；本阶段不扩大历史保留容量。

### 第六十三阶段：增量消息的解析与规范化复用

接收器为当前版本场景保留冻结的实体解析结果，只解析变化的实体JSON；不再拼接并解析完整场景字符串。Store仅对接收器认证的文档启用规范化缓存，未变化的实体直接沿用不可变运行记录。行为脚本实体引用字段签名变化时缓存失效；缺少siblingIndex的实体按当前位置规范化，重排后不会沿用旧索引。普通JSON、旧版本场景、外部对象及自定义序列化／解析继续走完整加载和迁移。

解析结果、规范化记录和可编辑作者／运行对象保持隔离；场景相机和清屏色复制后进入可修改状态。已有视口帧保留原生版本与时间，后续增量不会修改旧帧。实体记录保留函数从retainPlayWorld提取复用，原有快照语义不变。

定向检查46项最终通过：首次44通过、2处测试夹具错误（聚焦接口名称、加载了不同脚本注册实例），修正后仅重跑两项通过；随后对运行加载用例补充旧／新原生版本断言，单独复查通过。TypeScript检查通过。范围包括共享运行记录、增量协议、实际App多窗口消息处理、旧运行编辑隔离，以及新增解析复用、字段签名变化、聚焦、拓扑／空场景、Stop、迁移、外部修改和解析异常不推进基线。证据位于 `tmp/docs-artifacts/editor-performance-risk/session-reception-tests.log`、`session-reception-recheck.log`、`session-reception-owner-recheck.log` 和 `session-reception-types.log`。

局部CPU对照基线0752409，使用同一作者Amazonia7,410实体，经发送端Store迁移为真实会话版本3；双方解码、远端加载、指纹和面板快照纳入计时，4次预热、9组交替×6次，最终状态与指纹相等。组均值的中位数：仅时钟20.06675→5.30240ms；一个Transform19.86245→5.12345ms；全部7,403个Transform100.04758→90.16325ms。源文件为版本1，直接发送该旧版文档会进入兼容加载路径，相关诊断保存在session-reception-legacy-diagnostic.json，不作为当前会话链路结果。正式脚本／输入SHA／原始样本为 `tmp/docs-artifacts/editor-performance-risk/session-reception-benchmark.{mjs,json,log}`。

接收器额外保留解析后的冻结树，Store弱缓存规范化记录；这是CPU和内存之间的取舍，尚未测量进程总内存或长期回收。没有新的原生FPS结论。正常运行、窗口重开、换图、Stop、输入延迟、原生版本回退与总内存继续纳入当前批次集成验证。

### 第六十四阶段：原生视口世界请求观测

完成帧的profile新增worldRequest：区分完整快照、指定原生版本、最新运行世界及编辑缓存，记录请求会话／版本、尝试次数、版本过期原因、首次失败耗时、回退快照准备耗时及总请求耗时。数据跟随帧buffer传入Profiler，释放buffer后不再保留其索引；紧凑timings响应复制字段，失败请求不发布成功观测。不改变原生版本选择、回退内容或历史容量。

18项传输／步骤观测定向检查通过，QA脚本语法检查通过。新增检查覆盖直接来源分类、Scene版本过期的准确分段时间、Play过期／buffer释放、失败的快照与渲染不记成功、Profiler字段隔离。证据为 `tmp/docs-artifacts/editor-performance-risk/world-request-tests.log`。

当前三项合并原生验证：增量传输、增量解析／规范化复用、世界请求观测。`qa-frost-map-session.mjs --detached-only` 新增Play中新开Game窗口、完整请求timings、Inspector操作至主窗口观察耗时、四个阶段的编辑器及后代进程内存采样。操作耗时包含自动化调用和轮询，不等于硬件输入到显示延迟；工作集求和可能重复统计共享页，不能称为物理内存占用。合并构建及实际结果另记。

合并原生结果：最终 `B001/map-session-1792802023180.json` 的 `--detached-profile-only` 通过，0 error、正常退出；真实Play中新开Game、三窗口呈现、Pause／Step、独立Game播放快捷键、地图重载与Inspector重开、Stop完整作者实体恢复、停止后作者编辑和窗口停靠通过。Scene／Game截图已目视核对。最终EXE SHA256为 `394881b6682ac01e6ee7f1d08807494da9b4ee8953cff3299f9e4929546b7d88`，Release构建1分04秒，仅既有world_from_snapshot告警。WebView隔离缓存因EPERM保留，发现文件已移除。

5秒窗口、7,411实体：Scene48个间隔／10.2661次呈现每秒／P95为191.8ms，Game73个间隔／14.8504次呈现每秒／P95为136.7ms。Scene49个完整profile中13个版本过期回退，恰有13个缺少worldRevision；其余指定版本请求平均50.24ms，回退请求平均213.91ms（首次失败29.99ms、快照准备1.35ms）。Game74个profile全部使用指定版本，0回退、0缺版本，请求平均41.48ms。原生渲染均约15ms，多窗口仍不流畅，下一步处理Scene版本过期和请求等待；不得把单视口近60FPS套用到本结果。

进程树privateBytes：分离前4,849,201,152；三窗口运行6,765,801,472；地图重载后6,554,947,584；Stop并停靠后5,665,640,448。对应工作集求和3,058,245,632／4,800,225,280／4,620,804,096／3,211,517,952字节。仅一次短时采样，包含引擎、WebView和资源缓存；不证明泄漏或长期稳定。汇总及完整timings在 `tmp/docs-artifacts/editor-performance-risk/world-request-native-summary.json` 与上述原生报告。

前置运行 `1792801709656` 已通过独立Inspector编辑→主窗口→3个原生步骤及主窗口恢复→独立Inspector；其后Scene数量断言失败，整份报告不记通过。专项复查 `1792801839175` 确认了版本过期回退，但静态激活数量比实际帧多1，也未通过。Scene快照会过滤非激活实体，且激活状态随运行变化；worldRequest现记录实际上传实体数，最终验收按最新profile的请求类型检查实体数量；本次最新Scene／Game均为指定版本、数量7,411，回退样本尚未逐一记录对应的渲染实体数量。最后只复查受影响的性能及后续流程，未重复已经通过的Inspector编辑前置步骤。Inspector自动化调用至主窗口观察为443.11ms，仅首次运行的暂停状态样本，不是输入延迟分布。真实输入到显示延迟、强制原生竞态、长期／跨机器性能及行为字段热更新原生验收继续保留。

### 第六十五阶段：实时Scene的版本过期限次重试

针对上一批Scene13/49帧版本过期、回退平均213.91ms的问题，实时Scene允许最多两次放弃过期请求，在下一次绘制中使用最新已收到的世界。其间继续显示最后有效帧；第三次过期仍上传该请求拥有的完整快照，避免持续过期时无法呈现。预算由同一视口的并发请求共享，成功发布或所有者变更后重置。已过期的旧所有者请求丢弃，不占用当前预算。原生历史容量及精确版本／浏览器快照对应关系保持不变。

请求失败时读取当前Store播放模式；暂停、编辑、显式截图和相机预览不使用实时Scene重试策略，仍沿原精确回退路径。延期错误只安排受现有容量、截止时间和所有权约束的下一次请求，不将原生Scene标记为不可用。Profiler记录成功帧之前的deferredRevisionRetries，紧凑timings同时提供entityCount，下一批QA将逐个成功profile核对其上传与渲染实体数。

55项不同的定向检查最终通过（初轮54项；新增Stop用例随4项受影响用例补测），TypeScript检查及QA语法检查通过；补充timings字段断言后单独复查已有观测用例通过，不重复计数。生产Scene调度代码与真实请求包装器共同验证：新世界到达时无需旧快照上传、持续过期两次后必然回退、暂停／截图立即回退、并发预算／所有者切换、隐藏窗口继续调度、陈旧结果不发布和截图屏障。证据为 `tmp/docs-artifacts/editor-performance-risk/scene-expiry-tests.log`、`scene-expiry-types.log` 和 `scene-expiry-owner-final.log`。Stop用例首次观察窗口覆盖了合法的新编辑请求，缩短到旧请求完成后、新请求完成前验证隔离；失败记录保留在scene-expiry-owner-recheck.log，不计为通过。

当前为新批次第1/3项，未执行原生构建或FPS复测。下一批需要观察实际Scene延期数量、过期回退次数、完整帧呈现间隔与输入延迟；若频繁用尽预算，需继续处理跨窗口接收或原生请求等待。局部确定性检查不证明真实帧率已改善。


### 第六十六阶段：独立窗口运行面板合并刷新

独立窗口接收每条运行增量后立即更新Store、原生session/revision和视口帧通知；React面板快照、选择数组、分辨率、日志及节点刷新合并到100ms节拍。只对同场景、同会话、持续Play且面板状态未变化的增量延迟发布。首次／完整检查点、场景或会话切换、选择／可见性／相机／分辨率变化、暂停和Stop立即发布并取消待执行工作。资源路径、场景名和dirty状态仍立即更新，本机制不限制全部React渲染。

调度器仅保留一个最新回调和一个计时器；取消代次保护已进入事件队列的旧回调。执行时读取当前Store，不捕获旧快照，不广播同步消息；异常和工作区清理取消待执行任务。

快速检查：`node --test packages/editor/tests/remotePanelRefresh.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs` 共16项通过；`pnpm --dir packages/editor exec tsc --noEmit -p tsconfig.json` 通过。实际App消息处理与Store测试中，990ms内30次更新全部立即推进原生版本和视口帧，面板在1000ms内发布11次（含首次）；边界操作、取消旧回调、重入和延迟期间本地编辑保留均通过。证据为 `tmp/docs-artifacts/editor-performance-risk/remote-panel-tests.log` 和 `remote-panel-types.log`。

当前新批次第2/3项，未执行原生构建或帧率复测。合并验证需要覆盖三窗口运行、Inspector操作、选择与可见性、Pause／Step／Stop、换图及重开，检查面板最终状态、Scene延期／回退次数、实际呈现间隔和内存。此处测试数字仅证明面板发布节拍，不能作为真实FPS或输入到显示延迟。


### 第六十七阶段：运行接收端按需计算编辑指纹

App的updateSceneDirty仅在edit模式读取远端指纹；独立窗口的Play／Pause未保存状态由主窗口dirty字段提供。接收运行消息时不再规范化和拼接整场景指纹，编辑检查点（包括Stop）在加载完成后重新建立比较基线。主窗口接收远端修改仍计算作者内容指纹，保持保存基线、运行作者隔离和未保存判定；直接打开／保存场景的基线逻辑继续执行。

快速检查：workspaceSelectionSync的15项测试通过，TypeScript及QA脚本语法检查通过。新增实际App处理器测试确认运行完整检查点、增量、暂停和新会话零次接收端指纹调用，Stop重新计算，停止后本地修改／还原及主窗口dirty与清洁检查点正确；未重复已通过的调度器单元测试。证据为 `tmp/docs-artifacts/editor-performance-risk/runtime-dirty-tests.log` 和 `runtime-dirty-types.log`。

本项为新批次第3/3项，提交后与第六十五／六十六阶段合并构建及原生验证。qa-frost-map-session新增Stop未污染作者dirty状态、独立Inspector作者修改标脏、还原后清洁的检查；原生结果另记。局部调用计数不代表实际FPS收益。


本批原生集成完成：cb20d61、51dab64、e633561合并前端构建3.14秒及Release构建1分05秒通过，仅已有world_from_snapshot未使用告警。`node scripts/qa-frost-map-session.mjs --detached-only` 报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792803627596.json` 通过，0 error、正常退出，EXE SHA256为 `506e871e825fafc1fe462ab63f24d2c448d8060fd3377550ed7cac637bdcd77b`。三窗口Inspector双向修改及3步原生保留、Play中新Game加入、暂停／单步、独立窗口播放快捷键、地图重载及Inspector重开、Stop完整作者集合恢复、停止后编辑／还原和dirty恢复均通过。Scene／Game截图已目视查看，WebView隔离缓存因EPERM保留，发现文件已清理。

7,411实体、5秒窗口，Scene920×658：88个间隔、平均17.7119次呈现/秒、P95为96.5ms；Game920×518：92个间隔、18.5062次呈现/秒、P95为77.7ms。请求平均26.92／27.60ms，原生渲染13.98／15.93ms。Scene89个profile中1次完整回退，Game93个profile中0次；Scene63个成功profile记录共72次延期，单帧最大2次，回退帧记录2次延期、上传／渲染均5,410实体、请求177.2ms。所有成功profile逐一核对实体数通过，指定版本帧为7,411实体。与上一独立运行10.2661／14.8504次呈现每秒、Scene13/49次回退相比改善，但不是严格A/B或长期稳定结论，不能归因给单项修改。

原生worldLockWait／workerQueue／rendererLockWait均值不足0.02ms；Game前端prepare／complete平均0.35／0.75ms。实际呈现间隔仍约54至56ms，下一步应观测前端跨窗口接收、事件循环和实际请求起点之间的等待。延期减少完整上传但仍频繁出现，尚未消除版本过期来源。暂停时Inspector自动化写入至主窗口观察为934.95ms，包含自动化调用／快照／轮询，不是硬件输入到显示延迟。

进程树privateBytes依次为4,716,380,160（分离前）、6,589,648,896（三窗口）、6,953,811,968（重载）、6,046,130,176（Stop并停靠）；工作集求和分别2,927,726,592／4,638,593,024／4,966,989,824／3,462,840,320字节，可能重复统计共享页。尚未证明长期内存回收或无泄漏。汇总为 `tmp/docs-artifacts/editor-performance-risk/panel-cadence-native-summary.json`，构建及QA日志为同目录panel-cadence-*。保留实际输入延迟、长期／跨机器、强制原生竞态、可见性交互和行为字段热更新专项；不扩展为全库测试。


### 第六十八阶段：场景加载ID扫描合并

运行消息加载时，实体ID数组与集合只建立一次，供最大ID、选择恢复和展开节点过滤共用。父级查询表只在新场景需要展开已选节点祖先时建立；远端运行快照保留现有展开状态，无需创建该表。同步空隐藏／不可选列表时直接清空，不再建立整场景集合。非空列表继续过滤失效ID，普通场景打开、删除／重排和Stop保持原有语义。没有跨帧拓扑缓存。

18项定向检查及TypeScript通过：selectionRestore、remoteRuntimeReuse、sessionSceneReception。新增覆盖初次选择祖先展开、运行接收保留折叠、拓扑替换清理旧展开／选择、Stop后按最新最大ID创建节点、空场景从1分配，以及隐藏／不可选列表单独与同时清空。日志为 `tmp/docs-artifacts/editor-performance-risk/load-index-tests.log`、`load-index-types.log`。

局部CPU基线ec56d7f，Amazonia作者场景7,410实体，经Store迁移后生成真实增量；测量解析接收、运行加载、选择与空可见性同步，排除指纹、React面板和原生渲染。6次预热后9组交替各8次，组均值中位数：仅时钟1.88319→1.07469ms、单Transform2.31457→1.13338ms、全部7,403个Transform67.65552→67.91697ms。最终完整快照及指纹一致。密集变更无明显收益；这只减少接收端一部分扫描与分配，不能解释或消除上一批54至56ms呈现间隔。脚本、输入SHA及原始样本为 `tmp/docs-artifacts/editor-performance-risk/load-index-benchmark.{mjs,json,log}`。

当前新批次第1/3项，未构建或重跑原生QA。合并验证覆盖地图加载／重载、运行中节点展开／选择／隐藏、Stop后新增节点和多窗口呈现。下一步仍需测量前端实际paint、消息接收及请求调度等待；Profiler已有浏览器paint样本，下次原生专项应保留这些字段，不能仅依赖原生request耗时推断瓶颈。


### 第六十九阶段：补齐后台视口前端绘制采样

Viewport在所有真正完成的绘制结束时记录浏览器paint耗时，包括原生Scene完成回调、交互及非动画回调。未变化帧的提前返回不计样本；绘制前准备、Canvas提交等同步耗时计入paintMs，异步原生等待不计入。独立测量时钟在无尺寸或Scene／Game切换后重置，不更改原有请求唤醒时钟。浏览器绘制间隔与原生新帧呈现间隔是不同指标，不能互相充当FPS证明。

采样器在首帧frameIntervalMs为0时重建统计窗口，即使旧窗口刚输出、当前桶为空也会重新计时，避免把隐藏期间跨度带入下一采样窗口。qa-frost-map-session的独立窗口专项同时保存frontendSummary／frontendSamples及已有nativeSummary／timings，并检查两视口均有有效浏览器绘制样本。数据继续只写入tmp/docs-artifacts。

19项不同定向用例最终通过：editorProfiler的16项与新增viewportPaintProfiling的3项；TypeScript及QA语法通过。新增测试提取实际Viewport的提前返回、时钟及记录语句，验证无rAF的Scene完成绘制、未变化帧跳过、Game交互与动画只记录一次、原唤醒时钟不随新测量推进、无尺寸和切换视口的首帧重置，并通过真实采样器聚合。首轮17通过／1失败暴露空桶重新显示时计时未重置，修复后18通过；补充来源切换后仅重跑受影响3项通过。日志为 `tmp/docs-artifacts/editor-performance-risk/paint-coverage-tests.log`、`paint-coverage-final-tests.log`、`paint-coverage-source-tests.log` 和对应types日志。

当前新批次第2/3项，未构建或原生复测；尚无新的前端耗时数值或FPS结论。第三项完成后合并观察后台Scene、Game的新帧呈现与前端paint样本，结合实际请求起点／完成间隔继续定位等待；保留长期、真实输入延迟、内存和强制原生竞态专项。


### 第七十阶段：远端作者副本延迟可编辑化

远端Play／Pause文档的作者镜像直接保留已认证的不可变实体记录；可编辑运行副本仍独立保留，运行编辑及外部暴露不会修改作者镜像或旧帧。仅在本地Stop或运行错误退回Edit时，将仍引用远端镜像的作者数组复制为可编辑数据。主窗口原生所有者接收运行编辑时继续恢复已有作者数组／颜色／ID及撤销记录；收到edit检查点仍走正常场景加载。移除每条运行消息为作者镜像建立第二份可编辑记录的弱缓存。

31项相关测试、TypeScript及QA语法通过，覆盖remoteRuntimeReuse、sessionSceneReception、workspaceSelectionSync。新增确认保存读取作者内容、Stop丢弃本地运行修改、最新远端作者可编辑且支持undo／redo、旧帧保持冻结，以及原生运行失败后作者数据仍可修改和撤销。证据为 `tmp/docs-artifacts/editor-performance-risk/remote-author-tests.log` 和 `remote-author-types.log`。

局部CPU对照基线1c4badf，沿第六十八阶段相同7,410实体输入、6次预热、9组交替各8次接收链路：仅时钟1.16806→1.16780ms、单Transform1.12293→1.00653ms、全部7,403个Transform68.57100→56.92978ms。最终完整快照与指纹一致；仅时钟无收益，密集变化减少重复复制。另测直接对远端Store执行Stop，排除加载准备、9组交替中位数0.0101→18.5888ms，说明复制成本移到返回编辑的边界。普通主窗口原生Stop保留原作者数组，独立窗口收到edit检查点仍走完整加载，不能把该直接Store测试套用于所有Stop操作。脚本、输入SHA、原始样本为同目录remote-author-benchmark及remote-author-stop-benchmark的mjs/json/log；没有进程内存或真实FPS结论。

本项为当前批次第3/3项，提交后与第六十八／六十九阶段合并构建并执行原生多窗口专项。QA新增Stop后实体ID分配及undo／redo／恢复检查，保留前端paint样本、原生请求与每帧实体数。真实隐藏／不可选UI、长时内存、输入延迟和强制原生竞态仍保留专项；结果另记。


本批合并原生验证通过：4ce6f62、1c4badf、e910ddc；前端构建3.08秒、Release构建1分04秒，仅已有world_from_snapshot告警。`qa-frost-map-session.mjs --detached-only` 报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792804951765.json` 为passed、0 error、正常退出，EXE SHA256为 `6af47b8deffce238c92d201470c2ee4e515d2a78c29a8d596a0319b198a6a849`。Inspector双向运行编辑及3步原生保留、Play中新Game、三窗口暂停／单步、快捷键、地图重载及Inspector重开、Stop完整作者集合和dirty恢复、停止后编辑／还原、新实体ID及undo／redo全部通过。Scene／Game截图已目视查看，WebView隔离缓存因EPERM保留，发现文件已清理。

7,411实体、5秒窗口：Scene120个间隔，24.0058次呈现/秒、P95为59.7ms，平均请求17.34ms、原生渲染11.62ms；Game99个间隔，19.8731次呈现/秒、P95为68.2ms，请求20.16ms、原生渲染13.74ms。Scene121个成功profile无完整回退、记录81次延期；Game100个profile无回退，所有profile实体数量检查通过。相较上一独立运行17.71／18.51次呈现每秒有所提高，但不是严格A/B、单项收益或长期稳定结论。

前端Scene18个聚合样本共194次paint，按sampleCount加权7.5619ms，单次峰值12.6ms；Game17个样本共101次paint，加权1.8960ms，峰值2.3ms。前端聚合窗口与原生profile边界不完全相同，不可直接相减推算重复帧数；浏览器paint间隔也不是原生呈现FPS。代码中Scene延期／错误完成仍调用paint(false,true)，目前未启用其未变化绘制跳过；这是下一步值得定向复现的重复绘制路径。Game约50.3ms呈现间隔与20.2ms请求差距仍需实际调度证据，不能归因给仅1.9ms的Canvas同步绘制。

进程树privateBytes：分离前4,732,862,464、三窗口6,765,031,424、重载6,355,042,304、Stop并停靠6,098,382,848；工作集求和2,955,288,576／4,781,658,112／4,383,244,288／3,541,188,608字节，可能重复计共享页。未证明长期内存改善或无泄漏。Inspector自动化写入至主窗口观察417.60ms，包含调用／快照／轮询，不是硬件输入显示延迟。汇总为 `tmp/docs-artifacts/editor-performance-risk/remote-author-native-summary.json`，构建／QA日志为remote-author-*-build.log和remote-author-native-qa.log。正常集成完成；隐藏／不可选真实UI、长时性能、输入延迟及强制原生竞态继续待专项。


### 第七十一阶段：跳过无新图像的Scene完成绘制

实际Viewport判断的定向复现确认：延期请求完成后，paint(false,true)没有新原生图像仍进入完整Canvas绘制。完成回调现在同动画和重试唤醒一样，检查已显示帧、相机／尺寸／DPI、交互epoch、hover／press和相机预览是否改变；没有变化时在清空Canvas及命中区域前返回。原生请求调度仍先执行，重试／后台推进不因跳过像素重画停止。新图像或交互变化继续绘制，显式截图强制绕过此判断，编辑模式浏览器动画保留重画。

38项定向检查和TypeScript通过，覆盖nativeSceneCompletionScheduling、viewportPaintProfiling及nativeSceneFrame。新增实际生产判断复现先失败（预期跳过但得到paint），修复后通过；验证新世界通知未替换显示图像时跳过、真实新图像刷新、截图、尺寸／DPI／交互／预览变化、编辑动画和首次图像前相机移动。已有调度检查继续覆盖隐藏窗口重试、两次延期后回退、暂停／截图、所有者切换及采样。原测试夹具补充第六十九阶段的独立测量时钟，不改变生产调度。证据为 `tmp/docs-artifacts/editor-performance-risk/completion-repaint-repro.log`、`completion-repaint-tests.log`、`completion-repaint-types.log`。

当前新批次第1/3项，未构建或原生复测。上批Scene平均paint7.56ms、81次延期只用于定位，此处不据此推算节省总时长或FPS。合并验证应同时记录前端paint与原生成功帧／延期，检查背景Scene持续推进、相机／选择／截图、Pause／Step／Stop，按实际采样判断收益；Game请求间等待仍开放。


### 第七十二阶段：跨窗口发送复用剩余时间间隔

App完成运行帧后触发broadcastScene；此前每次发送后，下一次完成通知都会另起33ms计时，发送周期包含等待下一帧的时间。现在以performance.now记录上次实际发送开始，只等待常规33ms间隔的剩余部分；期间仍只保留一个计时器，执行时序列化最新Store。没有新通知时不持续发送，无接收窗口时仍跳过；立即同步取消待发送任务、立即发布并重置间隔。消息排序时间戳、增量基线及选择同步协议不变。

实际App发送／接收处理器与Store的定向复现：每16ms完成一帧，960ms内原逻辑发送19次，新逻辑29次；990ms内完成30次常规发布并接收最后第60帧，之后无新帧不再发送。另验立即同步在待发送期间插入、后续满33ms才发送、长空档后无需额外33ms等待。17项workspaceSelectionSync测试与TypeScript通过。证据为 `tmp/docs-artifacts/editor-performance-risk/broadcast-cadence-repro.log`（旧逻辑预期失败）、`broadcast-cadence-tests.log`、`broadcast-cadence-types.log`。

当前新批次第2/3项，未原生构建或实测FPS。改动恢复既定发送节拍，也可能增加接收端每秒处理的消息，需在合并验证同时观察Game呈现、Scene延期、前端paint及进程内存。常规发送仍受33ms间隔约束；这不是独立Game达到60FPS的实现或保证，后续需按实际负载继续优化运行数据传递。


### 第七十三阶段：Scene连续相机呈现与页签可见性

相机与尺寸仍生成新的请求键，但不使同一世界／隐藏列表的在途帧失效；完成帧按序发布，使用该帧相机及等比例视口绘制与拾取。尺寸／DPI变化期间保留完整原生图像，避免回退成方块。世界、项目、隐藏列表、2D切换和过期序号仍拒绝旧结果。

Dock提供页签可见性，Scene／Game不可见时取消rAF与重试计时器、使在途请求失效，并停止运行通知触发绘制；切回恢复调度。可见的独立窗口仍可在WebView节流时完成绘制，显式截图按请求执行。41项Scene调度／呈现／采样测试与TypeScript通过；连续4ms相机输入、24ms原生延迟仍能持续呈现，隐藏后丢弃在途帧且不再续约，覆盖三类视口定时器清理。证据为scene-interaction-final-tests.log和scene-interaction-types.log，位于tmp/docs-artifacts/editor-performance-risk。前次夹具断言按保留的17ms节拍及生产隐藏入口修正，原日志保留。

这是当前第3/3项，与e468673、5df28a8合并构建／原生验证；尚不宣称实时旋转手感或FPS达标。


本批原生验证完成：e468673、5df28a8、c274d2e；Release构建1分26秒，EXE SHA256 1d22aaaa8cb680c5e02cb16014dd4f27ca4f72076ad66ef33823a2af25fa34d2。Scene专项报告B001/map-session-1792806256160.json通过：连续相机输入期间呈现14帧、分隔条尺寸拖动、隐藏900ms内0原生帧／0paint、恢复后33帧，Scene/Game切换、分辨率和Stop内容恢复通过。已目视检查Scene尺寸变化与旋转截图。

多窗口报告B001/map-session-1792806323286.json通过，0error、正常退出，覆盖Inspector双向编辑、运行三步保留、重开／重载、Pause／Step、Stop作者数据／dirty／新ID／undo恢复。两个隔离WebView缓存因EPERM保留，发现文件已清理。5秒样本Scene22.17／Game27.70次呈现每秒、完整回退均0；前端paint加权17.08／2.05ms。该采样与独立地图转换复现并行，存在CPU争用，不能用于与上批做性能收益比较；后续性能专项应在无转换任务时采集。正常功能集成关闭，新批0/3。日志／报告／截图仅在tmp/docs-artifacts，长期流畅、真实输入延迟和完整地图功能仍待处理。


### 第七十四阶段：Game滚轮缩放与距离边界

滚轮增量经Viewport、Store、独立Game窗口消息及ScriptInput送入当前模拟帧，处理后清零；滚动UI优先消费。独立运行窗口也提交未被UI消费的滚轮，正方向统一为向下。原地图相机在War3相机预设之间连续插值，Amazonia距离限制8.59375至12.890625引擎单位，滚轮向上拉近、向下拉远，保留键盘和中键拖动。地图构建源及已安装Amazonia脚本／资源摘要同步更新。

8项运行输入／Agent检查、原地图相机测试和TypeScript通过，覆盖累加／单帧消费、浮点滚轮、边界、非法值与空闲无写入。Rust输入桥测试已补充，待下一批合并执行；原生相机QA加入真实canvas wheel和上下限检查。当前新批1/3，不能把前端测试作为原生滚轮验收。


### 第七十五阶段：地图内容分组

安装器在全部地形／装饰／单位生成后添加恒等Transform分组，保持实体ID、模型子树、可见性和原Transform不变。Amazonia新增23个组，根节点2578→5；地图内容分为地形（地面／水面／悬崖）、装饰物（32单位空间区域）、单位，相机／光源／界面保留独立根。分组不代替渲染八叉树。

2项定向测试通过，逐实体核对7,410个原对象的世界变换、原子树、组件内容、唯一ID和重复运行；另覆盖负坐标、稀疏ID与隐藏根。原生QA目标选择按实体用途定位，支持新分组，待下一批验证展开／聚焦／运行单位选中、重载与Stop。安装器和缓存配方包括分组实现，已安装场景及manifest一并更新；无需重新转换公共资源。当前2/3。


### 第七十六阶段：自定义地图资源别名与单位／物品定义

用用户Maps目录复现WarChasers：先因Cliff1.tga被错误追加.blp失败；修复后又因war3map.w3u被整表拒绝而停止。现在贴图候选按地图、补丁、游戏档案优先级解析，每个档案先精确路径、再TGA／BLP别名；保留实际读取路径与源摘要。腐坏数据仍报错，不能用低优先级资源掩盖。

新增经典v1/v2单位／物品对象解析；按UnitMetaData把原对象修改和自定义继承应用到UnitUI／UnitData／UnitBalance／ItemData，模型、缩放、颜色、名称、生命和选择数据使用解析后的表，地图字符串解引用。放置物品生成源模型；原ItemStrings中的无赋值说明行允许保留。其他玩法／技能字段仍在源档案与覆盖记录中保存，不宣称执行；v3对象、装饰物修改表、随机放置和完整RPG逻辑仍有限制。

4项贴图、5项对象数据、5项单位绑定检查通过，含优先级、缓存路径、腐坏不回退、类型／边界／继承／兄弟隔离／物品及非有限数。WarChasers已完成完整转换：342个放置记录、147条对象定义／修改，生成1558资源记录；源SHA2e20cc37f939bac5341520d6d1d10bf30dfbd57ac25c0b0a949d80d100b401c6。日志和结果在tmp/docs-artifacts/map-loading-repro/war-chasers-complete*，各阶段失败证据保留。资源包存本地临时验证工程，不提交生成验证资产。

此前Booty Bay原生冷导入／缓存命中／返回／进度UI已通过（B001/arbitrary-map-1792806641566.json，5896实体，冷9.70秒／缓存2.00秒，0error，正常退出）。这不代表所有自定义地图兼容。当前3/3，合并原生构建验证滚轮、地图层级及WarChasers菜单导入；FPS在无资源转换并发时专项采样。


### 第七十七阶段：启动脚本同步地图相机

实际 Game 画布 wheelDelta=-1 已到达脚本输入，但注册地图的启动脚本仍嵌入旧相机代码。相机刷新工具现在同步已注册地图的启动 bundle；新增相机包／启动 bundle 一致性检查。同步只更新地图运行脚本，不重新生成场景或共享资源。

原生报告 B001/map-session-1792807989852.json 已通过主窗口滚轮、上下界与分离 Game 滚轮转发；该报告随后在层级 QA 的虚拟列表定位失败，不计整套通过。分组后展开全部需先 reveal 目标行，QA 已补充，层级验证继续执行。相机脚本定向检查通过；本次修复仅脚本资产，无需重复原生构建。当前集成 EXE SHA256 6839481621593ca37119e6b0461695713e0f657ebb7d926195baacc373dce13c。


### 第七十八阶段：DotA_v6.83d 地图场景导入

目标源文件为用户 Maps/Download/DotA_v6.83d.w3x，SHA256 c06547206849f7931ad61509e21b76d22d63ae38d05fe7f35dab48c3dff56ddf。支持完整 forces 后明确省略的 W3I 编辑器尾表并保留诊断，其他截断仍拒绝；读取 Scripts/war3map.j 并记录实际档案路径。经典装饰／可破坏物对象覆盖按源元数据解析，缺失模型变体可读取同源基础模型，损坏数据不回退。没有编辑器单位表时生成空静态单位收据，界面说明及 manifest 标明能力边界。

27项定向检查通过（地图10、对象6、装饰6、绑定5），语法与差异检查通过。最终完整转换约10秒：14,437实体、5,198装饰、111源模型、43覆盖、461资产；保留完整原地图和3,026,043字节JASS。结果 tmp/docs-artifacts/map-loading-repro/dota-final/result.json，失败阶段日志与最终摘要均在同目录。完整 DotA 脚本、动态单位生成和对局规则尚未接入，不能以场景加载通过表示可玩 DotA。

原生菜单缓存载入通过：B001/arbitrary-map-1792808418421.json，14,437实体，缓存载入2.724秒，进度／进入提示先于场景切换、返回菜单清除进度、Stop恢复作者场景，0 error、正常退出；已目视确认原生场景截图。测试缓存保留原地图标题，验证按源能力区分有／无静态单位；原生冷转换入口本次未重复，完整转换使用同一导入器独立执行。首轮原生QA仅因缓存标题断言写死而失败，证据保留。源说明、档案成员路径、哈希和能力信息随地图包保存，临时资源包不入库。


### 本批集成结论：滚轮、地图层级与自定义地图

范围 a8ff432、9ddbdda、d67cb8f、0e974f7、48090bb；前端和原生Release仅构建一次。Rust输入桥 `cargo test -p mengine-script --release --lib script_reads_world_and_input_edges_and_reports_failed_ticks` 1通过／0失败；首次遗漏 --lib 的命令触发无关QuickJS集成配置错误，修正后通过。EXE SHA256 6839481621593ca37119e6b0461695713e0f657ebb7d926195baacc373dce13c。

滚轮主窗口／分离窗口和源距离边界通过（B001/map-session-1792807989852.json的已完成子检查）；层级单独复测B001/map-session-1792808154384.json整体通过、0error，覆盖折叠／展开、隐藏子节点、左右键、Ctrl+A／菜单全选／Shift范围、搜索后双击／空格聚焦、重载和Stop恢复。虚拟列表QA在展开后先清空再选择目标，以触发选中滚动；不依赖同一已选项的重复选择。DotA转换及原生缓存菜单见第七十八阶段；WarChasers已通过转换，未追加原生菜单重复验证。

无转换／构建并发的5秒多窗口采样B001/map-session-1792808229345.json通过、0error、正常退出，Pause／Step、分离窗口快捷键、Stop及后续实体ID／undo／redo通过。Scene24.88／Game28.10次呈现每秒，平均间隔40.19／35.59ms，P95 67.0／49.2ms；原生渲染11.98／14.08ms，前端paint加权17.65／2.47ms，完整回退均0。摘要 tmp/docs-artifacts/editor-performance-risk/grouped-detached-native-summary.json。采样时间和系统负载有限，不据此声称稳定满帧或整体性能收益。

八叉树已参与相机和阴影视锥查询：2746渲染对象，Scene相机137／阴影602／实际提交607，Game相机82／阴影559／提交561。没有增加新LOD；阴影对象多于相机可见物有独立光源视锥依据，不能直接按相机列表删除。持续60FPS仍待解决：跨窗口世界发布33ms上限及Scene前端准备／绘制是下一步重点，需分别测量后优化。隐藏页签0刷新与连续相机／尺寸呈现已由上一批验证。本批正常功能集成已覆盖上述范围，长期内存／真实输入延迟／独立运行窗口滚轮／完整DotA玩法保持待测或未实现状态，不重跑无关全库测试。


### 第七十九阶段／新批次任务1/3：浏览器八叉树增量更新

Scene前端每帧计算对象包围盒并更新viewportSpatial；此前任一包围盒变化都会复制全部边界并重建八叉树。现在保持固定空间分区，对分区内变化只更新精确边界，跨分区对象移到能够完整包含它的最深已有节点；无边界项继续保守保留。长度变化、对象超出整体范围或节点迁入数量比建树时增加超过32项时重建，避免迁移持续堆积成线性列表。根区域留5%余量吸收边缘动画，最终查询仍逐项使用精确对象边界，不改变可见性判定，也不改变原生渲染或模拟。

6项定向测试和TypeScript通过：动态包围盒、跨区移动、未知／已知切换、重排、增删、聚集、原地修改、空场景与线性穷举结果一致，所有索引恰好出现一次；同时检查小幅动画不会为了重新建树反复读取静态边界。局部7400项／300动画索引、30帧预热＋120帧测量，索引更新加查询平均3.282→1.837ms，P95 5.006→2.219ms。该结果仅为本地空间索引样本，不能作为真实Scene帧率提升；脚本和汇总在tmp/docs-artifacts/editor-performance-risk/spatial-animation-bench.mjs、spatial-incremental-summary.json，测试与类型检查日志同目录。

本项代码与测试为packages/editor/src/viewportSpatial.ts及tests/viewportSpatial.test.mjs。当前1/3，待累计3项后统一构建和原生采样：覆盖Amazonia与DotA的持续动画、Scene移动／旋转、选择和框选、显隐、资源热加载、地图切换；检查拾取不漏项、Scene paint及呈现间隔。当前不重跑全库／原生QA，不将局部计时写成稳定满帧。


### 第八十阶段／新批次任务2/3：已显示帧世界包围盒复用

Viewport的原生帧拥有固定实体记录，worldTransform已有父变换身份缓存。空间剔除现在进一步按固定世界变换与模型局部边界身份复用world AABB；模型加载／热替换、动画网格切换、父变换变化分别使用新边界或新变换重新计算。缓存为WeakMap，不按实体ID跨项目复用；编辑态可变浏览器数据继续直接计算。未加载模型的立方体局部边界作为固定对象复用，仍在实际模型到达时失效；选择、粒子与轨迹保守不剔除规则保持不变。

相关7项空间检查与TypeScript通过，包含固定输入重复读取、移动后的新变换、模型边界替换、旧帧读取、非法变换和编辑态原地修改。局部4746网格／200变化变换、30帧预热＋120帧测量，仅world AABB转换平均1.054→0.380ms，P95 2.573→0.439ms，结果校验和一致。脚本／摘要在tmp/docs-artifacts/editor-performance-risk/spatial-owned-bounds-bench.mjs和spatial-owned-bounds-summary.json。此样本不代表完整渲染或FPS；没有重复原生构建。

变更：viewportSpatial、Viewport及viewportSpatial.test。当前2/3，待第三项后与第七十九阶段统一验证Scene动画与相机交互、父节点移动、资源热加载、选择／框选、显隐和Stop／地图切换；观察实际paint与呈现间隔，不把待测项写成通过。


### 第八十一阶段／新批次任务3/3：独立运行视口发布节奏

主窗口运行时，存在心跳有效的独立Scene或Game接收窗口，常规世界发布最短间隔改为16ms，与60Hz模拟完成节奏匹配；发布仍由完成通知触发，只保留一个计时器并在发送时读取最新世界。编辑／暂停、普通属性窗口及失效视口保持33ms合并。立即同步、选择顺序、会话／版本验证及接收端10Hz属性刷新边界保持不变，不增加空闲轮询。

19项实际App同步处理器与Store测试、TypeScript通过：16ms模拟输入960ms内向活跃视口发送60个世界，停止完成通知后不继续发送；1ms密集通知合并为一个最新版本，暂停及视口心跳失效恢复33ms。日志tmp/docs-artifacts/editor-performance-risk/viewport-cadence-tests.log和viewport-cadence-types.log。该检查证明调度上限解除，不保证实际FPS；更频繁的增量收发可能增加主线程负载，须用原生采样判断。

累计99498c9、76c5e1e及本项达到3/3，开始合并构建与原生验证。主工作区另有并发Unity包／粒子改动，本批复用干净验证worktree，仅构建本批已提交版本。合并检查多窗口Play／Pause／Step／Stop、Inspector编辑与重开、Scene选择／旋转／尺寸／隐藏、模型热加载及运行世界一致性，报告FPS和浏览器paint，逐项保留未覆盖范围。

### 第七十九至八十二阶段性能与交互验证

浏览器八叉树增量更新、固定帧world AABB复用、独立视口16ms发布节奏已提交推送；集成补充修复偏移网格选取中心，避免导入模型可见而点不到。实现范围99498c9、76c5e1e、9d275fc、66a2739，相关7项空间／19项同步／12项选取测试通过，隔离前端和原生构建通过。

5秒多窗口样本Scene41.37／Game51.00FPS，Scene浏览器paint10.32ms；上一样本24.88／28.10FPS和Scene paint17.65ms。单Game10.01秒采样中最近240个原生帧间隔平均16.645ms、P95 26.3ms（约60.08FPS），浏览器平均17.18ms、paint3.35ms。短时采样与原生保留窗口限制详见testing-batches.md，不视为稳定满帧结论。

Scene连续旋转期间13帧，隐藏页签原生／浏览器均0，切回30帧；尺寸变化、原始资源热更新、父变换、选取、层级聚焦、地图重载与Stop恢复通过。多窗口Inspector编辑、窗口重开和Pause／Step／Stop通过。证据B001/map-session-1792809672118.json、map-session-1792810463601.json及spatial-picking-1792810589579.json，日志位于tmp/docs-artifacts/editor-performance-risk/。

继续保留待办：多窗口稳定60FPS、长时间内存与真实输入延迟、DotA持续运行场景性能。八叉树已生效，本批优化更新成本与发布节奏；LOD尚未实现，应依据后续渲染和阴影采样决定，不从未满帧直接推定缺少空间剔除。

### 第八十三阶段：显示帧层级激活索引复用

固定显示帧的激活索引按实体顺序／ID／parent／active复用，组件动画不再重复建立全场景索引。父子关系、启用状态或实体集合变化会重新解析；作者态可变查询保留原实现。旧帧持有独立的精简层级记录，原生delta、重排、缺失父节点、循环和旧帧回读由17项定向检查覆盖，TypeScript通过。

7434实体、每帧200变换更新的3组局部样本，显示数据准备均值2.242→1.403ms，校验和一致；不代表整个Scene或原生FPS。实现位于hierarchyActivation／nativeViewportPresentation，证据tmp/docs-artifacts/editor-performance-risk/owned-activation-*。本批1/3，原生动画、层级显隐、地图切换及多窗口帧率待累计三项合并验证；完整记录见testing-batches.md。

### 第八十四阶段：显示帧包围盒来源复用

固定components记录的组件分类和局部范围复用，模型预览身份逐次检查以响应资源热更新；作者态可变数据继续直接计算。相关代码拆入viewportEntityBounds，Viewport保留原有选中／粒子／轨迹的保守规则。6项定向检查及TypeScript通过。

7434实体、每帧200模型组件／变换变化的3组局部样本，包围盒准备均值1.401→0.687ms、校验和一致；不作为FPS结论。证据tmp/docs-artifacts/editor-performance-risk/entity-bounds-*。本批2/3，模型热更新、地图动画、多窗口和实际Scene paint待三项后统一验证，详见testing-batches.md。

### 第八十五阶段：八叉树平面检查与固定输入

固定显示帧的包围盒身份参与索引增量判断，未变化输入无需重复读取坐标；编辑态保留原地修改检测。平面检查改为标量计算，保持容差及非有限数据保守纳入规则。16项相关检查和TypeScript通过，包含八角点独立判定、索引迁移／重建和模式切换。

7400范围／300变化项的3组局部样本，索引更新加查询均值1.975→0.297ms，校验和一致。证据tmp/docs-artifacts/editor-performance-risk/owned-index-*。本批3/3，开始合并原生构建和实际帧率采样；该局部收益不直接外推FPS，详见testing-batches.md。

### 第八十三至八十五阶段原生验证与剩余性能问题

隔离生产构建通过，原生模型选取、Amazonia旋转／尺寸／隐藏、特效热更新、父变换、层级／地图重载及Stop恢复通过。单Game最近240个原生间隔平均16.721ms（约59.80FPS）、浏览器paint2.07ms；场景隐藏原生与浏览器均0，恢复正常。具体范围与EXE指纹见testing-batches.md。

独立Game重开仍存在首帧准备停顿：固定等待的初测失败，改为清空历史后等待真实原生帧，功能复测通过但等待16.812秒。关闭共享缓冲池复用不能排除该现象，前端诊断显示两个请求在途；尚未定位到原生提交、GPU回读、WebView交付中的具体阶段，保留待修，不能宣称问题已解决。最终多窗口短样本Scene26.87／Game33.46FPS，paint13.52／2.85ms，尚未确认整体稳定性能收益。下一步应关联原生请求阶段与共享事件接收，而非继续盲目重试全套QA。

真实DotA14437实体缓存进入2.652秒；5秒连续窗口Game58.51FPS／paint3.13ms，Scene28.77FPS／paint17.71ms。Scene为全图远景并显示选中Camera预览，drawItems10723；全图绘制与相机预览成本为后续热点。LOD未实现，完整JASS玩法仍不支持。证据B001/spatial-picking-1792811986575.json、map-session-1792812060449.json、map-session-1792813730795.json及arbitrary-map-1792813844205.json。原始证据均在tmp/docs-artifacts，长期内存与真实输入延迟仍待验证。

### 第八十六阶段：原生Game等待时减少浏览器网格重复准备

桌面Game没有原生图像且原生未失败时，跳过浏览器世界条目和网格预览准备，UI与原生请求继续运行。原生失败后启用浏览器回退，普通浏览器Game和Scene维持原流程。8项定向检查与TypeScript通过，实际首帧收益待对照。

阶段探针确认有重开请求在几十毫秒内完成原生提交至交付，首轮约0.9秒；该次准备等待7.531秒。尚未定位全部停顿，不宣称根因已解决。日志与诊断报告位于tmp/docs-artifacts/editor-performance-risk/及B001/map-session-1792814341838.json；原生首帧对照按已知故障最小复现即时执行，其余批次1/3。

第八十六阶段定向验证完成：生产新旧版本同一--detached-profile-only路径均功能通过、0error、正常退出；采样前额外等待旧6.401秒／新319ms。该起点在固定2.5秒启动等候与内存采样之后；仅一次顺序对照，不能当作完整启动时间或稳定保证。新版本Scene53.32／Game55.53FPS，paint7.75／2.21ms，旧50.28／51.30FPS，paint8.00／2.21ms。

证据B001/map-session-1792814953803.json、1792815055089.json，构建／快速检查日志game-pending-*。重复浏览器网格工作已减少；首次Game renderer初始化约8秒、过期修订的完整快照回退、共享事件交付的剩余成本继续待查，不认定全部首帧停顿已修复。多窗口稳定60FPS仍待完成，当前新批次1/3。

### 第八十七阶段：Game运行版本过期时优先有限重试

Game在Play期间最多两次延后过期请求，让新世界进入请求槽位，减少旧地图快照的准备和上传；持续过期保留精确快照回退，暂停、截图和失效所有权保持原有一致性。成功发布重置预算，Profiler增加延后次数。54项请求／传输／Game调度定向检查、TypeScript通过，证据tmp/docs-artifacts/editor-performance-risk/game-revision-*。

当前批次2/3；实际首帧等待、原生版本追赶、截图一致性及多窗口帧率待第三项后合并验证。该项针对已确认的过期回退路径，不作为首次renderer初始化和所有窗口停顿均已解决的结论，详见testing-batches.md。

### 第八十八阶段：视口绘制条目收集减少临时分配

可见实体直接写入同一数组，MeshRenderer不再读取多余灯光名称和碰撞体字段；排序、独立特效与网格选取规则保留。4项实际代码块定向检查及TypeScript通过。10723候选的3组局部样本准备加排序均值2.537→1.665ms，完整输出一致，详见testing-batches.md及tmp/docs-artifacts/editor-performance-risk/draw-preparation-*。

当前批次3/3，统一原生构建与多窗口／选取／DotA持续场景验证开始。此优化减少CPU准备和短期分配，尚不作为全图Scene或多窗口稳定60FPS结论。

### 第八十六至八十八阶段原生集成结论

102项定向检查、隔离前端和原生生产构建通过；同一固定EXE完成模型热更新／父变换／偏心选取、多窗口重开／版本追赶／Pause／Step／截图／Stop／undo／redo，以及真实DotA持续采样，三份报告均0error、正常退出。版本范围、EXE指纹与复现路径见testing-batches.md，证据B001/spatial-picking-1792816005183、map-session-1792816039577、arbitrary-map-1792816112092。

多窗口5秒样本Scene53.33／Game56.13FPS、paint7.61／2.25ms；采样前额外等待318ms后有当前原生帧，该等待不包含已有固定启动等候与内存采样。实际DotA14437实体，缓存进入2.271秒，Game59.73FPS／paint3.00ms；全图Scene30.37FPS／paint16.74ms、drawItems10723并显示Camera预览。短样本较上次略有改善，未达到多窗口及全图Scene稳定60FPS；稳定Game窗口未出现过期回退，重试分支收益不从该窗口推算。

本批集成完成。后续优先测量全图Scene逐实体准备、相机预览与原生渲染成本，再确定下一项优化；首次renderer冷初始化、长期内存和真实输入延迟继续待查。LOD、完整JASS／DotA玩法仍未实现。

### 第八十九阶段：省略被不透明原生Scene图像完全覆盖的绘制

实际DotA全图23个临时分段样本，浏览器paint16.674ms，其中背景0.835、世界准备1.765、空间索引2.674、绘制条目3.426、世界绘制4.361、UI2.365ms。原生样本场景编译约8.0ms、提交与回读约11.4ms；不能仅靠浏览器局部收益外推满帧。诊断报告arbitrary-map-1792816702380，插桩已移除。

生产帧新增严格的opaquePixels标记，只有最终RGBA全部不透明且扫描量不超过16MiB才省略浏览器覆盖绘制；透明／旧协议／大图像保持原路径。空节点命中区保留，Game与相机预览不扫描。17项前端检查、TypeScript和1项实际Rust函数测试通过，850×507检查约0.106ms。当前新批次1/3，原生集成和实际收益待三项后统一验证，详见testing-batches.md。

### 第九十阶段：整批Scene命中数据在普通对象点击时准备

不透明原生Scene只逐帧准备选中辅助条目，整幅浏览器世界命中候选在普通对象点击时按该显示帧生成并缓存。UI／Gizmo优先与等距命中顺序保留，独立画布复用既有命中算法；Spine的可见动画每帧只推进一次，点击重放不推进。透明、浏览器及Game路径维持即时绘制。

23项绘制／几何／帧所有权／Spine定向检查和TypeScript通过。当前新批次2/3，原生FPS、首次点击、热更新、透明场景及多窗口待第三项合并验证，证据tmp/docs-artifacts/editor-performance-risk/deferred-scene-hits-*。浏览器drawItems现在只统计该帧实际准备的辅助条目，场景总数和真实提交数量继续使用原生counts；完整记录见testing-batches.md。

### 第九十一阶段：多Canvas Scene布局只计算一次

每次layoutUiScene3D调用按当前Canvas所属关系共享一份屏幕布局，不跨帧缓存，保留文字／层级／激活／相机／选择变化和嵌套遮罩。7项多Canvas与大场景检查、TypeScript通过；4Canvas／1204实体的3组局部样本均值8.881→4.976ms，完整输出一致，另16组动态修改与旧实现逐项一致。

当前新批次3/3，开始隔离构建和原生验证。局部数据不直接外推DotA或整帧FPS，证据tmp/docs-artifacts/editor-performance-risk/multi-canvas-layout-*，完整范围见testing-batches.md。

### 第八十九至九十一阶段集成与透明度后续

143项定向检查、隔离前端和Tauri生产构建通过；同一EXE的不透明／透明切换、模型选取与热替换、Spine动画／停止／命中重放、多窗口重开／版本追赶／Pause／Step／Stop／undo／redo及DotA持续采样均通过，0error、正常退出。证据B001/spatial-picking-1792818795004、1792819157144、map-session-1792819200641、arbitrary-map-1792818854152，EXE指纹及完整范围见testing-batches.md。

多窗口Scene51.57／Game55.44FPS、paint7.77／2.22ms；DotA Game59.85FPS／paint2.94ms，全图Scene31.63FPS／paint15.87ms。真实地图Scene的drawItems仍10723，原生像素含alpha<255，未进入本批不透明省略，不能归因FPS变化。Game原始PNG中211379／921600像素alpha<255，下一步核对材质输出／混合，保证透明语义后再减少重复绘制。首次大地图点击和真实输入延迟仍未验收；本批小夹具UI动作往返不作为物理延迟结论。

### 第九十二阶段：修复材质覆盖alpha

真实GPU复现确认opaque和镂空保留片元错误写出半透明alpha，Multiply混合也会降低不透明背景alpha。RHI现在让opaque／通过裁剪的片元写alpha1，透明材质保留输出透明度，Multiply使用源覆盖alpha。RGB与阴影裁剪、绑定布局和深度策略保持既有规则。

16种真实GPU清屏／混合组合全部通过，原有8处错误被定向测试捕获；另uniform与shader检查3项通过。当前新批次1/3，立即复现已有DotA原始alpha及Scene路径异常，不据GPU小夹具推断真实地图已经满帧；完整记录和证据见testing-batches.md及material-alpha-*日志。

第九十二阶段定向生产验证通过：原生构建完成，实际DotA报告arbitrary-map-1792819809985为14437实体、0error、正常退出。Game原始RGBA的921600像素全部不透明，Scene进入按需准备；浏览器drawItems1为选中Camera辅助条目，原生仍提交5342个对象，图像正常。

5秒样本全图Scene41.71FPS／paint10.41ms，上一样本31.63／15.87ms；Game59.08FPS。单组顺序对照不作稳定60FPS保证。Scene原生render均值22.40ms，最新编译7.492／backend11.468／资源同步1.165ms，是后续重点。3次全图点击均选中对象，UI动作及selection RPC往返约150～171ms，物理输入延迟仍待验收。当前新批次1/3，详见testing-batches.md。

### 第九十三阶段：共享材质按次提交准备一次

RHI通过共享材质源身份复用一次提交内的材质准备，各对象变换和uniform仍独立，阴影／粒子／世界使用相同映射。未共享源跳过索引，提交之间重新准备以保持纹理刷新、shader及单对象写时复制覆盖。

3项真实GPU定向检查、最终生产cargo check通过。4096对象／128源交替基准，96帧像素一致；材质准备CPU均值1.014100→0.084892ms、P95 1.119000→0.101900ms，不能外推真实地图FPS。当前批次2/3，实际DotA及多窗口待第三项统一集成；证据shared-material-preparation-*、shared-material-bindings-tests.log及shared-material-resources-tests.log，完整范围见testing-batches.md。

### 第九十四阶段：复用稳定forward绘制列表

RHI对重复列表复用render bundle，按实际GPU资源句柄、顺序及uniform偏移精确匹配；变换、灯光和顶点内容仍每帧更新。缓存最多4份／32768条目，8次提交未用则释放；首遇列表登记，粒子及规模不适合的列表保留直接编码。

真实GPU对照覆盖动态uniform／透明排序、纹理／shader／网格／环境热更新、顶点buffer内容复用、扩容、尺寸、阴影、粒子回退和释放。96帧像素一致的局部4096对象基准，世界编码均值3.097237→1.905038ms、P95 3.175600→1.972150ms。当前批次3/3，开始统一原生生产集成及DotA／多窗口实际性能验证。证据world-bundles-*，具体范围见testing-batches.md；尚无本项真实FPS结论。

### 第九十二至九十四阶段集成与剩余热点

4项主工作区真实GPU检查及隔离原生Release构建通过；同一固定EXE完成实际DotA缓存／进度／返回／持续Scene与Game／三次点击，以及多窗口重开／版本追赶／Pause／Step／截图／Stop／undo／redo，均0error、正常退出。隔离版本31903e3不含并行Unity粒子导入，具体范围及EXE指纹见testing-batches.md；证据B001/arbitrary-map-1792824175375、map-session-1792824239313及rhi-batch-*。

DotA14437实体，Game58.99FPS／paint3.09ms，全图Scene42.09FPS／paint10.20ms；上一样本59.08／41.71，整帧提升尚不明显。Scene原生render均值22.398→22.013ms，最新单帧材质准备1.1415→0.1298ms、世界编码4.7619→4.2599ms，但编译升至8.923ms、GPU回读等待3.702ms；各分段为最后一帧，不能当作平均收益。原生5342个提交对象保持存在，尚无LOD。

多窗口Scene54.44／Game55.59FPS、paint7.00／2.19ms；额外就绪等待324ms不包含已有固定等候。完整批次集成完成，稳定60FPS、场景编译与GPU编码／回读成本、长期内存、真实输入延迟和完整JASS玩法继续待办。三次DotA点击UI与selection RPC约139～170ms，仅为自动化往返。

### 第九十五阶段：未变化网格不再逐帧重建绘制输入

编辑器视口和独立运行器持有FrameMeshInputs，按World身份／Entity句柄／可信修订复用路径与材质输入，层级矩阵及顺序每次取当前值。实际使用的材质源沿原resolver轮询，源变化重新应用覆盖；自定义Any始终读取，不活跃或移除的输入／来源及时释放。

12项针对性检查、宿主与运行器Release全target编译检查通过。实际DotA5376对象／139源的交替局部对照，静态提取均值4.723225→1.775136ms，每次200个变换更新时5.798501→2.340243ms，每轮完整输出一致。只衡量CPU提取；缓存驻留内存及原生FPS待合并验证，证据mesh-inputs-*，详细范围见testing-batches.md。

当前新批次1/3，三项后统一构建并验证DotA／多窗口、资源热更新／父变换、Stop／重开与场景切换。下一步仍需降低原生绘制编码、GPU回读与其他编译阶段成本，不能将局部提取收益称为稳定60FPS。

### 第九十六阶段：世界图元稳定排序减少大对象移动

世界图元按紧凑键稳定排序，图层序每条只计算一次，深度保持f32::total_cmp顺序（含NaN／正负零）；已有序列表直接返回。4项定向检查及生产编译检查通过，完整输出与旧排序一致。

实际DotA资源1秒处的2521图元，排序均值0.834955→0.173579ms；已有序0.020809→0.011823ms，多图层4096条目5.280150→0.512108ms。当前批次2/3，真实FPS、透明／2D排序及多窗口集成待第三项后统一验证。证据world-sort-*，完整范围见testing-batches.md。

### 第九十七阶段：特效图元省去临时默认资源名

采样特效直接按最终UiBatchKey构造UiPrimitive，原solid默认行为保留；裁剪、UV、Multiply预乘和深度字段保持一致。6项采样特效检查及1项原solid默认UV检查通过，实际DotA2521图元的完整收集对照均值1.197697→1.033828ms，每组完整绘制与灯光输出一致。

当前批次3/3，开始统一当前分支前端／原生构建和实际地图、多窗口、资源热更新及父变换选取验证。此处仍为CPU局部收益，真实FPS及内存待采样，证据effect-keys-*，完整范围见testing-batches.md。

### 第九十五至九十七阶段原生集成与下一阶段

23项相关检查及3份局部对照通过；当前分支前端与Tauri生产构建通过，同一固定EXE完成模型／透明度热更新、父变换／偏心选取、真实DotA持续Game／全图Scene／点击、多窗口重开／Pause／Step／截图／Stop／undo／redo。3份报告均0error、正常退出，详见testing-batches.md及B001/spatial-picking-1792826667371、arbitrary-map-1792826765617、map-session-1792826856467。

DotA Game60.00FPS／paint3.53ms，全图Scene43.49FPS／paint10.39ms；Scene原生render均值22.013→18.669ms，最后一帧编译5.120ms／网格提取1.838ms，仍有世界编码4.517ms、GPU回读等待3.455ms。几何仍5342个提交对象。多窗口Scene53.82／Game56.40FPS、paint7.11／2.05ms，原生render成本下降但展示仍未稳定60FPS。对照前一隔离基线的范围不同，不能把所有差异都归因于本批。

进程树PrivateBytes短流程4520.62→6372.90→6947.46→5690.37MiB（detach前／三窗口／重载／Stop停靠）；不等于缓存独立占用，Stop后尚未回到起点，长期驻留待查。下一阶段优先测量原生绘制与回读、浏览器Scene paint及窗口／地图切换后的驻留资源，再确定优化方案；LOD、真实输入延迟和完整JASS玩法继续未完成。

### 第九十八阶段：不透明Scene空间查询随普通对象点击执行

包围盒和模型预热仍逐帧准备，八叉树更新与查询由固定显示帧的候选读取器按需执行一次；不透明Scene直接保留选中辅助条目，透明／浏览器／Game维持即时查询。34项针对性检查及TypeScript通过，包含旧显示所有者、失败重试、真实首次命中准备和保守候选规则。

实际DotA作者场景10746条目、48个裸路径GLB预览，局部候选处理均值0.951328→0.441996ms，每30帧点击一次0.959596→0.457785ms；完整结果与预览读取次数一致。当前新批次1/3，原生FPS和首次点击延迟待三项后合并验证，证据lazy-spatial-*。

独立待办：浏览器模型预览／命中目前只识别裸gltf／glb扩展名，带#pose的路径仍使用默认几何及包围盒。实际DotA作者场景9061个MeshRenderer中9012个带该后缀；动画姿态对应的精确浏览器包围盒与选取仍需接入，不作为本项已解决内容。


## 第九十九阶段：原生帧姿态网格选取

Scene原生渲染器在成功提交后捕获当前相机、可见网格顺序、最终世界矩阵及不可变位置／索引数据。姿态和billboard采用渲染时已采样的几何；浏览器不再为这些节点使用默认方块命中区域。Game、运行时和Camera Preview不启用额外几何留存。首次开启时重新同步已有GPU网格。

Tauri把镜像实体映射回源节点ID，随实际图像返回选取token。查询只读取该token对应快照，释放缓存锁后执行射线检测；支持锁定节点过滤及其后方网格。每窗口最多3帧、全局12帧，逻辑几何与对象预算256MiB，同一帧共享几何去重、不同帧保守重复计费；过大快照不发布token。项目、窗口、Play代次不匹配或token过期时查询失败，不替换成当前帧。窗口销毁／项目关闭清除留存。Profiler单列当前renderer的位置／索引长度；旧帧独占几何、分配器开销和完整进程内存不计入该项。

前端使用实际显示图像的letterbox坐标，UI／操作柄及原有Spine和辅助图标仍优先。异步网格点击立即发起查询、按手势顺序应用；双击等候选择结果再聚焦，过期查询不触发旧节点聚焦。外部UI操作、相机滚轮、项目变化与卸载取消旧查询。原生选取对应三角形表面，尚未按纹理alpha、shader裁剪逐像素判断；浏览器的姿态包围盒、选择框与聚焦范围仍有独立改进空间。

小范围验证：RHI 3项（含真实GPU像素／缓冲复用／旧几何和排序），宿主骨骼glTF 1项（先上传再启用、父节点偏移、姿态推进、外部bin热更新、旧显示帧），token隔离／淘汰1项、源ID重排／销毁／代际复用1项；前端19项及TypeScript通过。网格输入顺序复用3项及过滤镜像映射1项通过。原始日志为tmp/docs-artifacts/editor-performance-risk/native-picking-*.log。必要的Tauri库编译已通过；没有据此报告新FPS。

当前6283871及本项为2/3。第三项完成后统一生产构建，执行实际DotA_v6.83d.w3x的姿态节点／锁定过滤／连续选择／双击、热更新／父变换／透明切换、多窗口和Stop重开，记录选取快照开销、内存与Scene／Game持续FPS。既有稳定60FPS、长期驻留、LOD和完整JASS玩法继续待办。


### 第一百阶段／新批次任务3/3：关闭项目时释放原生视口资源

项目成功关闭后释放Game、Scene、Camera Preview、材质及Effekseer的renderer，清空四类快照镜像和原生选取留存。五个renderer槽之前只在切换不同project_root时替换，关闭项目仍保留GPU／CPU资源；同一路径重开也会继续复用旧槽。本项限定项目关闭生命周期，Play Stop仍保留当前项目的视口缓存。

请求在读取当前项目时记录视口项目代次，后台渲染持有只读租约；关闭项目等待在途工作结束后推进代次并释放资源。排队旧请求被拒绝，原生Scene token发布也检查租约，避免清理后旧请求重新填充缓存。锁顺序为项目读取→短代次读取，后台为代次租约→世界／renderer；关闭按项目→停止Play→独占代次→资源释放执行，后台不获取项目锁。

2项定向检查通过：在途工作与关闭竞态、已排队旧请求拒绝／新代次可重建、资源Arc释放，以及全部镜像修订和token清空。Tauri测试目标编译通过，地图QA脚本语法检查通过。qa-frost-map-import新增--project-reopen，在真实地图流程后采样关闭前／欢迎页／同路径重开后的进程树PrivateBytes并验证实体与原生Game图像。日志viewport-lifetime-test.log；尚未据此报告实际内存下降或FPS变化。

本批6283871、f212fab及本项达到3/3。接下来统一构建当前前端与Tauri Release，执行原生选取／热更新／透明切换、实际DotA与项目关闭重开、多窗口持续采样；复用不受影响的转换、层级和Spine结果。长时间驻留、LOD、稳定60FPS及完整JASS玩法仍待完成。


### 第九十八至一百阶段合并原生验证

实现6283871、f212fab、4bca411已提交推送。相关定向检查通过；当前分支前端TypeScript／Vite（3.14秒）及Tauri Release（1分21秒）构建通过，只有已有world_from_snapshot未使用警告。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-4bca411/mengine-editor-tauri.exe，SHA256 34b35a468c9c8ec1d55600ecfbfa123978e8e819f4b76e131a774b9f8ad2bee7，receipt.json记录源码及前端摘要。

B001/spatial-picking-1792831338865.json的5项原生检查通过、0控制台error、正常退出。--pose-cases让生产Scene加载带动画根节点的#pose路径，验证文件热更新、父节点移动、原点在相机后的可见几何、姿态推进和锁定前方网格后选择后方对象；同时执行opaque→transparent→opaque选取。9次UI操作与selection RPC往返56.72～77.82ms，只是该小夹具下的合成操作往返，不是物理输入延迟。姿态图像已检查；骨骼／外部bin／旧帧版本由宿主定向回归覆盖。

B001/arbitrary-map-1792831389250.json使用实际DotA_v6.83d.w3x匹配缓存，14437实体，缓存进入2.291秒；进度、返回、持续Game／全图Scene和3次地图点击通过。最近240个Game间隔均值16.694ms、59.90FPS、P95 23.3ms，浏览器paint均值3.35ms；Scene233个间隔均值21.418ms、46.69FPS、P95 36.4ms、paint9.36ms。上一生产样本Scene43.49FPS／paint10.39ms；此次单次短窗口有改善，Game59.90与此前60.00接近，不能宣称稳定60或严格归因某一改动。原生仍5376对象／5342提交，没有新增LOD或删减可见几何。Game／Scene图像已检查，完整JASS／DotA对局规则仍未接入。

DotA Scene原生render均值18.895ms（上一18.669ms）；最后一帧compile5.677ms、world编码5.790ms、回读等待2.993ms、选取捕获0.335ms；分段不是窗口均值。当前renderer选取几何逻辑长度4708152字节，旧快照独占版本及分配器开销另计。3次全图点击均选择4294981705，UI动作与selection RPC往返132.61／123.96／119.28ms；上次169.26／157.02／141.73ms，不作为物理输入延迟或单因素对照。

同次DotA流程执行--project-reopen：关闭项目返回欢迎页，同路径重开恢复原始实体并产生新的原生Game图像。进程树PrivateBytes为6176.82→2801.60→2903.35MiB（关闭前／欢迎页／重开），包含当前编辑器和WebView子进程，不是GPU缓存单项或长期泄漏测试。该流程验证项目关闭资源释放；Stop时仍保留当前项目缓存，不能由此认定Stop后所有驻留已解决。0控制台error的断言位于地图运行／Stop之后、关闭重开之前。

B001/map-session-1792831470405.json通过7434实体、多窗口重开／版本追赶、Pause／Step／快捷键／截图、Stop、编辑与undo／redo及停靠，0控制台error、正常退出。既有固定启动等候和内存采样后，额外315ms内出现18个新Game样本。最近240间隔Scene54.16／Game55.52FPS、paint7.60／2.16ms；上一53.82／56.40FPS，尚未稳定满帧。原生render均值Scene9.041／Game10.255ms。场景图像已检查。

多窗口进程树PrivateBytes为4550.07／6442.46／7450.48／5998.75MiB（detach前／三窗口／重载／Stop停靠）；这一短流程结束仍高于起点，长期驻留继续待查。三份QA均正常退出，WebView EPERM缓存保留，用户编辑器未关闭。脚本／原始报告只在tmp/docs-artifacts；本批不重复无关转换、完整层级及Spine验证。

本批3/3相关集成完成，下一批从0/3累计。继续待办：Scene及多窗口稳定60FPS、绘制编码／回读与浏览器paint、长期驻留、姿态选择框／聚焦范围及纹理alpha选取、LOD、完整JASS／DotA对局与War3界面保真。


### 第一百零一阶段／新批次任务1/3：对象参数按实例索引读取

原生主绘制、阴影和绘制bundle共用对象参数数组，通过first_instance及flat片元索引读取对应模型／法线矩阵、颜色、材质与自定义参数，减少逐网格的动态uniform绑定。GPU支持的存储绑定范围能覆盖原有max_buffer_size时启用；上限较低的设备继续沿用动态uniform路径，保持原有可容纳对象范围。材质hook中的object名称和参数、绘制顺序、粒子自身绑定、可见几何及阴影规则保持原语义。Profiler的indexedObjectSlots记录数组路径实际打包槽数，为0时可能是uniform路径或当前无提交对象。

实际DotA作者场景静态清点为5376活动网格／177种网格键；按当前源序连续网格及材质分组仍有4705段，单纯相邻实例合并最多减少约12.5%的调用。本项直接降低每次对象参数绑定成本，没有宣称减少绘制数量或加入LOD。

8项相关定向检查通过：新数组与uniform对照包含12阶段96帧的完整RGBA一致性（阴影、材质参数、shader与错误fallback、纹理／网格热替换、剔除、容量增长、相机／透明顺序、环境、resize及粒子之后的网格恢复），3种shader解析／布局验证，以及既有材质／绘制bundle4项、嵌套Scene View和原生几何选取GPU检查。RHI与editor-host Release库检查通过。未增加生产对照开关；强制uniform参考只存在于cfg(test)线程局部状态。

4096混合材质绘制、缓存bundle的12轮交替对照，排除2轮预热，10组各4帧；每帧128×128完整回读像素相同。世界编码CPU均值1.962848→1.694805ms，提交CPU3.194753→2.838718ms，提交加GPU回读5.135708→4.810100ms；不含IPC和游戏逻辑，不直接外推真实地图FPS。原始日志及摘要为tmp/docs-artifacts/editor-performance-risk/indexed-objects-{final-tests,gpu-final,material-tests,embedded-view-test,picking-test,benchmark,host-check}.log和indexed-objects-benchmark-summary.json。

当前新批次1/3。第三项后统一构建并验证实际DotA／多窗口持续FPS、indexedObjectSlots、材质／shader热更新、姿态选取／阴影与Stop／重开；本次没有重跑完整原生QA。最新已验证实际全图Scene仍为4bca411的46.69FPS、Game59.90FPS，完整JASS／War3保真、稳定60FPS、长期驻留和LOD继续待办。


第一百零一阶段补充：通过独立渲染阶段包装传递实例索引，保留材质辅助函数可用的VsOut结构、位置构造参数与成员；自动避开辅助函数、类型和私有变量的同名符号。构造函数及命名兼容回归通过，12阶段96帧uniform／数组完整像素对照仍一致。日志indexed-objects-constructor-before.log和indexed-objects-constructors-after.log。该补充属于同一功能，批次计数不增加。


### 第一百零二阶段／新批次任务2/3：相邻兼容网格实例绘制

对象参数数组启用后，批量主绘制列表仅合并相邻、对象槽连续且pipeline／纹理绑定／顶点和索引缓冲及索引数量完全一致的项，每个实例仍读取自己的模型与材质参数。原有排序和阴影路径保留；含粒子的列表与不满足批量条件的列表沿用原编码路径。首次提交也执行合并列表，随后可复用bundle。缓存匹配包含实例数量，准入及总预算仍按逻辑对象数计算（最多4项／32768对象），避免少量合并命令扩大留存范围。Profiler新增worldMeshDrawCalls与worldInstancedObjects，统计本次提交各主世界pass的网格命令及多实例组内对象，包含嵌套视图，不包含阴影或粒子调用。

定向GPU对照11阶段44帧的完整RGBA一致：128个兼容对象为1次调用；阴影独占对象造成参数槽间隔时保持2段绘制；覆盖纹理／网格／错误pipeline边界、顺序变化、透明重叠、深度相同的遮挡、alpha裁剪、容量增长及实例范围缩短。单独验证缓存按8192实例的4项计为32768，而非4条命令。既有bundle资源替换检查及对象数组／uniform的shader和96帧GPU对照通过；editor-host Release库检查通过。

从实际DotA作者场景提取5376活动网格的网格／材质路径源序，得到187类、4705连续组。输入及源文件SHA256保存在tmp/docs-artifacts/editor-performance-risk/dota-adjacent-draw-groups.receipt.json；基准用代理立方体和颜色替换组内真实几何、纹理及材质，不代表真实地图完整渲染。两个独立renderer交替12轮、排除2轮预热，每模式10组4帧，每个测量帧均命中自己的缓存且完整128×128回读像素一致。调用5376→4705；世界编码CPU均值1.238800→1.223598ms，提交CPU4.193785→4.181793ms，提交加回读4.921560→4.885898ms。完整时间变化很小，本项不据此宣称真实FPS提高。

命令：设置MENGINE_DRAW_GROUPS为上述txt后运行cargo test -p mengine-rhi --release --lib benchmark_adjacent_instancing -- --ignored --nocapture。日志adjacent-instancing-{gpu-final,cache-test,host-check,dota-groups-final-benchmark}.log及adjacent-instancing-dota-groups-final-summary.json；构造兼容回归为indexed-objects-constructors-after.log。当前504b42c（含3af8e85补充）及本项为2/3；第三项后统一原生构建，验证真实DotA／多窗口的调用数与持续FPS、材质热更、透明／阴影／姿态选取、Stop和重开。真实场景最新仍为4bca411的Scene46.69／Game59.90FPS，稳定满帧、LOD与完整JASS继续待办。


### 第一百零三阶段／编辑器批次任务3/3：按材质来源解析GPU绘制资源

材质准备和pipeline清理完成后，在本次提交内按材质来源解析GPU管线及纹理绑定引用，供阴影、主世界、bundle列表和粒子路径读取。引用只在该提交内有效；shader、纹理到达／移除／替换及错误fallback仍按当前准备结果解析。只需纹理的阴影／粒子来源可保留空的主绘制管线，实际网格绘制时验证管线。Profiler新增materialSources和materialBindingResolutions；后者按来源解析次数统计，单次解析可读取管线与纹理两个映射，不是底层HashMap调用次数。

48帧／12阶段的重复查表与来源引用完整RGBA一致；覆盖资源缺失／到达、纹理热替换和移除、shader错误及恢复、独立参数修改、相机／顺序／resize／环境、容量增长和缩短、粒子交错及空帧。来源解析数等于当次材质来源数；显式验证仅有纹理的部分来源有效。已有材质／bundle相关4项检查通过，editor-host Release库检查通过。对照开关只存在于cfg(test)，没有生产选项或跨帧GPU引用缓存。

4096绘制／128共享来源、两个独立renderer的12轮交替对照（2轮预热，10组各4帧）每个测量帧均命中自身bundle缓存，完整128×128像素一致。解析次数4096→128；材质准备CPU均值0.071653→0.085298ms，世界编码1.698693→1.246758ms，提交CPU2.860855→2.391148ms，提交加GPU回读4.845425→4.350050ms。该窗口包含新准备成本；不含IPC及游戏逻辑，不直接外推实际地图FPS。日志material-bindings-{gpu-final,existing-tests,host-check,benchmark}.log，摘要material-bindings-benchmark-summary.json，均在tmp/docs-artifacts/editor-performance-risk。

本批504b42c（含3af8e85补充）、48f317e及本项达到3/3。接下来在当前整合分支统一构建前端与Tauri Release，执行姿态／锁定选取／资源热更／透明切换、实际DotA与多窗口持续采样、Stop和关闭重开。记录indexedObjectSlots、worldMeshDrawCalls、worldInstancedObjects、materialSources、materialBindingResolutions及真实FPS／进程树内存；复用不受影响的地图转换、层级和Spine检查。完整JASS、War3保真、LOD、长期驻留与稳定满帧仍待完成。

### 第一百零一至一百零三阶段原生性能结论

当前61990bf的前端／Tauri Release构建、姿态及资源热更5项QA、实际DotA和多窗口QA通过，详细命令与本地报告见testing-batches.md同阶段记录。实际DotA保留5376总对象，Scene可见5342，绘制调用降至4675，材质来源／绑定解析均153；Game可见116、提交对象槽413、绘制99、来源／解析均33。实例参数、相邻合并及按来源解析均已生效。

实际DotA的Game60.05／Scene46.56FPS，Scene原生渲染均值18.895→16.614ms，整帧FPS与前次46.69相近，浏览器paint均值9.382ms。多窗口Scene55.78／Game56.69FPS，原生渲染均值8.471／9.895ms，paint6.686／2.113ms。下一步需沿请求、模拟、浏览器绘制和呈现链定位剩余成本，不能只以RHI小基准判断整帧收益。以上为短采样窗口，未证明稳定60FPS。

DotA关闭前／欢迎页／同路径重开的进程树PrivateBytes为6699.93／2651.41／3229.41MiB，关闭释放仍有效；多窗口detach前／三窗口／重载／Stop停靠为5189.99／6971.92／8044.71／6453.90MiB。Stop后驻留及长期内存仍需独立排查。本编辑器批次结束，下一批0/3；LOD、姿态选择框／聚焦范围、alpha选取和完整JASS／War3保真继续待办。

### 第一百零四阶段：Scene浏览器跳过原生已处理网格

显示帧有原生meshPickToken时，浏览器条目仅保留非网格、选中节点和相机／Spine／粒子／拖尾混合节点；普通未选中网格的选择由原生显示帧处理，省去重复边界与后备命中准备。覆盖层直接收集辅助节点。保留实体作者顺序、旧帧父变换、选中碰撞体／操作柄、无token回退和Game路径；原生场景对象与LOD未改变。

23项presentation／空间帧／边界、4项延迟命中／Spine检查及TypeScript通过。实际DotA作者场景的浏览器活动Transform条目10746→5371，源代码准备微基准相同固定帧0.366857→0.118327ms、新原生修订3.814223→3.238983ms；均非整帧或GPU测量，不据此宣称FPS提高。证据与范围见testing-batches.md同阶段记录及tmp/docs-artifacts/editor-performance-risk/native-scene-browser-entries-*。本项为新批次1/3，实际原生／多窗口验收按批次进行，Scene稳定60FPS仍待完成。

### 第一百零五阶段：浏览器视口CPU分段采样

原生DotA Scene的浏览器paint均值9.382ms尚未有细分证据。现对完成的Canvas绘制记录世界读取／请求派发、世界准备、世界合成、选择／操作柄、UI布局绘制和最终合成六个不重叠CPU范围；按现有250ms窗口汇总均值／峰值／覆盖次数，并通过Profiler CPU页及profiler.get的paintStages提供。窗口间及历史读取保留独立统计，长窗口按实际覆盖次数加权，缺失分段不计零。分段不包含请求后跳过绘制的唤醒、异步原生执行或图像上传回调，不作为整线程／整帧或GPU耗时。

新增6项分段、已有16项Profiler及55项视口相关检查通过，TypeScript通过；详细范围与本地证据见testing-batches.md同阶段记录。当前批次2/3，实际CPU分段、界面显示与第一百零四阶段的DotA／多窗口收益在第三项后统一原生验收。没有据此宣称新FPS，稳定60FPS、长期驻留、LOD及完整JASS／War3保真继续待办。

### 第一百零六阶段：网格缓存条目原位输出

FrameMeshInputs命中条目后直接使用该引用刷新／输出对象；输入失效时也沿已定位槽重建，省去每个网格末尾的第二次实体哈希查询。3项既有生命周期／动态Any／热更新回归及1项实际DotA旧缓存实现对照基准通过，输出对象与实体顺序一致。5376对象的提取阶段CPU静态均值1.008993→0.895941ms，每帧修改200节点时1.091764→0.951258ms；不含层级构建、模拟、IPC或GPU，不作为实际FPS结论。

证据及范围见testing-batches.md同阶段记录和tmp/docs-artifacts/editor-performance-risk/mesh-input-entry-*。当前编辑器批次3/3，接下来合并构建及原生验证，并使用第一百零五阶段的paintStages定位Scene剩余前端耗时。真实Scene稳定60FPS、多窗口、长期驻留、LOD及完整JASS／War3保真仍待完成。

### 第一百零四至一百零六阶段原生结论与下一热点

当前9c251d1前端／Tauri Release、最终姿态与透明选取5项、实际DotA／项目重开、多窗口QA通过，详细范围、首轮透明夹具计数失败及复验、本地证据见testing-batches.md。DotA Game59.93／Scene51.70FPS，Scene前次46.56；原生渲染均值16.614→16.453ms，浏览器paint桶均值9.382→8.354ms。Scene仍5376总对象／5342可见／4675调用／153材质来源及解析。此次短样本不能严格归因单项或证明稳定60FPS。

真实CPU分段定位：DotA Scene世界准备4.826ms、UI 2.380ms、世界合成0.599ms、请求派发0.440ms、选择与操作柄0.064ms、最终合成0.024ms；覆盖305次绘制，加权总和8.332ms。多窗口Scene世界准备4.042ms、UI 1.082ms，覆盖298次；持续Scene57.47／Game55.89FPS，前次55.78／56.69。CPU页实际显示、每桶六段合计、覆盖次数及加权汇总均已验证。后续优先缩减浏览器世界／层级／条目的重复准备，并继续检查UI成本；分段不覆盖请求后跳过绘制的唤醒、异步原生执行或上传回调。

DotA关闭前／欢迎页／重开PrivateBytes为6779.38／2508.22／3518.96MiB；多窗口detach前／三窗口／重载／Stop停靠为5207.35／6910.75／7973.09／6404.84MiB。关闭释放有效，Stop后及长期驻留仍未解决。三项最终QA正常退出，用户编辑器保留。本批结束，下一批0/3；稳定60FPS、LOD、姿态选择框／聚焦、alpha选取和完整JASS／War3保真继续待办。

### 第一百零七阶段：Scene按需解析变换父链

原生token负责普通网格选取时，浏览器按其条目、灯光、选择操作及祖先链解析变换。覆盖层复用局部Map，完整调用保持独立完整结果；局部Map不进入可变作者缓存。混合网格Light2D、不活动选择与独立主节点仍保留变换，深层父链及循环层级保持完整作者遍历结果。原生对象、几何、绘制顺序及LOD规则未改变。

新增7项与已有32项相关检查、TypeScript通过。实际DotA作者场景的解析节点14437→5377，5371个浏览器条目及其变换／边界／覆盖层保持一致；源码准备微基准固定帧0.265521→0.229528ms、新实体修订3.301939→2.586000ms，不含完整Canvas／UI、原生、模拟或IPC，不据此声明FPS变化。完整范围与证据见testing-batches.md同阶段记录和tmp/docs-artifacts/editor-performance-risk/sparse-scene-*。本项为新批次1/3，实际收益待第三项后统一原生验证；最近运行Scene51.70FPS仍未稳定60。

第一百零七阶段补充：不透明token帧将普通节点的条目、父链和空间候选准备延至首次普通命中，灯光／粒子／Spine／辅助图形及选择操作仍即时；固定帧选区副本与旧帧结果保持独立。44项相关检查、TypeScript通过。DotA单选夹具即时节点5377→6、条目5371→1，查询恢复完整5371个条目并保持边界及顺序。不透明新修订准备微基准2.717726→2.024139ms，每30帧查询一次2.671435→2.093199ms；透明2.580525→2.659146ms。冷缓存首次绘制9.316520→2.668300ms，首次点击准备0.284320→6.441270ms，合计9.600840→9.109570ms。成本按实际操作延后，不能作为物理输入延迟或FPS结论。证据、范围与待测项见testing-batches.md同阶段补充及tmp/docs-artifacts/editor-performance-risk/deferred-scene-*；同一任务计数仍1/3。


### 第一百零八阶段：按需计算Game呈现标记

固定显示记录的Spine与交互快照标记按首次读取计算并缓存，Scene免除未使用的两次全量扫描；无Spine的Game帧不再重复收集空条目。局部active、非活动Spine、旧帧和字段枚举语义保留。27项定向检查和TypeScript通过。实际DotA作者场景新不透明修订准备微基准2.003232→1.510236ms，透明2.645024→2.182571ms；Game标记／Spine条目0.701847→0.525838ms。完整范围及本地证据见testing-batches.md与tmp/docs-artifacts/editor-performance-risk/presentation-flags-*；不是FPS测量。批次2/3，实际原生与多窗口验收在第三项后合并执行。


### 第一百零九阶段：复用未变化的Scene UI输入与画布

固定显示记录的UI子集按记录身份及顺序复用；场景Canvas像素缓存依据该子集，避免无关世界修订触发栅格重建。UI／父节点／相机／层级／画布范围、资源事件与250ms刷新继续失效，投影／选择／标签仍逐帧执行。18项定向检查和TypeScript通过；实际DotA的7个UI相关实体模拟120次无关更新，数组120→1、布局缓存失效120→8，完整布局一致。这是计数验证，不是CPU或FPS结果。证据owned-scene-ui-*及细节见testing-batches.md。107–109批次达到3/3，开始统一原生构建与实际DotA／多窗口验收。


### 第一百零七至一百零九阶段原生结论

2573607固定原生程序（650705e7406fc04321cd04523cf70a5163d182100b7ea4d30fa942e095127204）的最终空间选取6项、Spine、实际DotA关闭重开及多窗口QA通过；构建参数、初轮启动和Spine夹具断言失败及复验范围见testing-batches.md。61项合并定向检查通过。DotA Scene51.70→57.25FPS，Game59.66FPS；Scene浏览器paint均值8.354→5.999ms、世界准备4.826→2.293ms，UI 2.380→2.518ms未改善，原生渲染均值16.345ms。仍5376对象／5342可见／4675调用，无LOD删减；短窗口不能证明稳定60或单项因果。

多窗口Scene58.09／Game55.64FPS，paint3.851／1.967ms；Scene世界准备2.092ms、UI1.093ms。关闭仍释放资源，DotA PrivateBytes 6737.58→2371.95→3323.42MiB；多窗口Stop停靠6520.68MiB仍高于起点5138.23MiB。完整证据与计时口径见tmp/docs-artifacts/editor-performance-risk/owned-ui-batch-*及testing-batches.md。本批完成、下一批0/3；后续优先UI扫描／绘制与原生整帧瓶颈，并继续长期驻留、LOD、姿态聚焦／alpha选取与JASS／War3保真。所有最终QA正常退出，用户编辑器保留。


### 第一百一十阶段：固定UI记录跳过重复拓扑解引用

Scene固定显示记录的UI子集读取按相邻记录身份跳过未替换记录的ID／父节点／Canvas／Camera检查，替换记录仍验证拓扑；实时可变编辑入口保留。21项定向检查及TypeScript通过。实际DotA作者场景拓扑读取微基准0.213044→0.064036ms，相机与UI同时替换0.222220→0.066373ms，结果及顺序一致。仅测子集读取，不是UI整段或FPS。证据owned-ui-topology-*与范围见testing-batches.md；新批次1/3，实际收益按三项合并验收。


### 第一百一十一阶段：复用未变化的Canvas投影像素

Canvas独立WebGL投影器按实际Float32顶点、输出尺寸及纹理来源／版本／尺寸复用保留画面；当前目标合成、选择与裁剪继续逐帧执行。相机／DPR／几何／源及输出尺寸变化、无版本源和context恢复重绘，GPU不可用仍回退CPU。6项定向检查及TypeScript通过；60次固定输入的测试替身记录1次GPU计划、60次合成，并非实际像素或性能结果。证据cached-ui-projection-*与范围见testing-batches.md；批次2/3，实际GPU路径、图像正确性和UI收益待合并原生验收。


### 第一百一十二阶段：Stop释放原生Play世界镜像

已定位Stop清理脚本会话／发布历史后，三份视口世界镜像仍保留记录。Stop及新会话按版本回收空闲镜像，在用镜像异步等待释放，迟到回收保留较新镜像，不阻塞重启。最小复现由失败转通过，3项新增和26项既有运行时检查通过，4项原有ignored基准未执行；证据play-mirror-release-*与范围见testing-batches.md。该检查证明镜像及弱引用释放，不证明完整内存驻留已解决。110–112达到3/3，开始合并原生GPU投影、DotA／多窗口、Stop／重启及内存验收。


### 第一百一十至一百一十二阶段原生结论

90c5501固定程序（26dcbafddc124ec7a75dc03549aada2963abd0fdb6efbeb85ab552e5bbb9c616）完成实际DotA、六项多窗口和定向Play／Stop重启范围；首轮尾部QA选错地图页的整体失败报告保留，修正后只重测失败部分，详见testing-batches.md。实际GPU投影152对完整RGBA一致，固定120帧真实WebGL绘制120→1，不是原生RHI或FPS结果。27项前端与29项运行时检查通过，4项ignored基准未执行。

DotA Scene57.25→58.58FPS、Game59.99FPS；浏览器paint5.999→5.633ms，UI2.518→2.141ms，原生渲染16.266ms。多窗口Scene57.77／Game55.66FPS、Scene UI1.093→0.852ms、paint3.549ms，整帧仍未稳定60。多窗口Stop停靠6196.53MiB仍高于起点5320.32MiB；独立两次Stop短流程5319.93／5238.88MiB不能证明长期稳定。世界镜像及弱引用回收已针对性验证，其他资源与分配器驻留仍待分析。证据ui-mirror-batch-*及gpu-projection-check；本批范围完成、下一批0/3。继续UI／原生整帧、长期内存、LOD与完整War3目标。


第一百一十一阶段补充：纯source-over按实际Float32投影顶点的保守范围合成；离屏／空几何省略无效复制，目标敏感模式、滤镜／阴影和不安全权重保持整幅语义。8项检查、TypeScript及实际GPU的172对完整RGBA通过；固定夹具每帧复制196608→73326像素，不是FPS或CPU测量。证据cropped-ui-projection-*及gpu-projection-crop-check，完整范围见testing-batches.md。作为投影补充不新增任务计数，独立队列仍0/3，原生收益待下一批。
