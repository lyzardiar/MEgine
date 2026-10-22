# 性能风险与实施进度

2026-10-23：已完成十二个编辑器性能优化阶段，覆盖资源索引、撤销／恢复、脚本桥、ECS查询、空间索引、视口回读、网格／材质／纹理处理、UI遍历与图元存储、按需上传软裁剪数据及密集UI批次构建。保留 Rust + TypeScript + Tauri 技术栈。下列基准来自 Frostbound 3,812 实体场景或注明的压力数据，不能换算成实际游戏 FPS。

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
- [ ] **RenderObject 每帧重新提取。** `frame_compiler.rs` 仍重复规范化 mesh 路径、复制字段；同次共享材质解析已合并，第五阶段已在同一编译帧内让嵌入视图复用主画面提取结果，第八阶段消除渲染读取时的材质源深拷贝和重复路径构造；root 过滤仍沿 Parent 链查找，跨帧提取仍需评估组件 revision 与路径缓存。
- [ ] **逐物体绘制及准备。** 第七阶段让主 pass／阴影 pass 复用单次提交的材质键和错误状态，减少纹理键字符串复制、Shader指纹计算与缺失纹理检查。通用实例化、重复GPU状态设置、材质哈希查找和临时Vec／draw order复用仍待评估；绘制次数及透明物体顺序保持不变。
- [ ] **ECS 查询集合与存储。** 内建组件 TypeId 查找和有序联合查询已完成；自定义组件保留兼容查找。稠密组件存储属于后续架构变更。
- [ ] **命令跨桥批处理。** 本阶段仅减少非组件解析次数，未改变逐条 stringify/跨桥协议。
- [ ] **UI、timeline、animation、physics 性能审计。** 第九阶段已优化UI子节点借用、布局结果顺序匹配及按需建立索引；第十阶段消除普通控件图元的临时数组分配和往返搬运；第十一阶段跳过无软裁剪帧的裁剪数据打包／上传和Shader裁剪循环；第十二阶段按有效图元数量细化批次空间网格。默认位图文字按亮点生成独立图元，数量、批次构建和其他实例数据上传成本仍在；文本／嵌套布局和其他模块仍需审计，不能据局部数据排除剩余开销。

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
