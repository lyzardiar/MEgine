# 写实近景的编辑器场景同步性能

原生编辑器 Game 视图在相同写实素材、1280×720 和缩放 12 下，三次测量的帧率中位数由 **8.69 提升至 16.68 FPS**。没有调整模型、纹理、抗锯齿、阴影或输出分辨率。当前仍不够流畅，5 ms 目标尚未达到；这些数据不能代表独立 Player 的帧率。

## 实现

React 场景状态使用延迟初始化，后续组件刷新不再计算被忽略的初始快照。Agent 复用界面刷新时已生成的隔离快照，其他观察入口仍即时读取当前快照。实体字段筛选、Play/Pause 状态及 Edit 模式的动画和时间线预览保持一致。

场景变更追踪只保存 JSON 签名，显式快照和差异查询仍返回隔离的副本。逐实体深拷贝不再出现在观察阶段：差异查询使用查询时的数据，返回前进行克隆。同一实体对象的嵌套修改仍通过内容签名检测。

层级树每次展开列表时建立父子索引，保留 siblingIndex 和实体 ID 排序、折叠状态及非活动节点的显示。索引不跨调用保存，因此同一对象上的父节点和顺序修改立即生效。原生世界同步的指纹检测、交互控件的完整快照渲染路径保持现有语义。

## 测量

基线为 `1b986acb66cb080aa058515348bad3c5287998e7`。各预热 5 秒，测量三个连续的 5 秒窗口；两侧单位数依次为 21、21、22。CPU Profiler 使用另外两次预热后的 15 秒 Game 视图运行，采样间隔 1 ms。

| 指标 | 基线 | 当前 |
| --- | ---: | ---: |
| 三次实际呈现 FPS | 8.97 / 8.69 / 7.88 | 16.68 / 16.05 / 17.08 |
| FPS 中位数 | 8.69 | 16.68 |
| 原生请求平均耗时的中位数 | 72.60 ms | 49.71 ms |
| 原生渲染平均耗时的中位数 | 26.63 ms | 18.05 ms |
| 模拟平均耗时的中位数 | 11.19 ms | 6.57 ms |
| 15 秒 CPU 采样中 snapshotEntities 自身耗时 | 2168 ms | 851 ms |

减少主线程拷贝也减少了 CPU 争用。短窗口仍受机器调度影响，这不是长期稳定性或统计显著性证明。渲染耗时、请求耗时彼此包含，不能直接相加。两个版本的二进制哈希、逐组指标、CPU 汇总和原生差异验收见 [数据](frame-sync-performance.json)。原始 [基线 CPU profile](frame-sync-before.cpuprofile) 与 [当前 CPU profile](frame-sync-after.cpuprofile) 可在 Chromium DevTools Performance/JavaScript Profiler 中加载；函数 `Dn` 对应检查过的 `store.ts` 中 `snapshotEntities` 编译体。

## 验证

- 31 项相关测试通过，包括嵌套原地修改、实体 ID 删除后复用、查询结果隔离、重复 ID 拒绝、暂停层级编辑和运行时同步。新增实际 AgentBridge 集成测试确认观察快照不调用原始实体上的额外序列化钩子。
- TypeScript/Vite、嵌入前端的原生 Release 编辑器构建通过。
- 原生 Game 性能采样的材质管线拒绝为 0。原生 Agent 在暂停且已提交的模拟步骤完成后，快照没有虚假差异；单步后 revision 增长，并返回变化实体及更新后的游戏遥测。
- 最终版本的原生地图回归通过：中文区域名、中文任务文本、输入框命中、保存读取、触发条件保护及护送任务运行正常。结果见 [地图验收](native-triggers-qa.json)。
- Player、游戏规则和素材未修改，沿用扫描地表阶段的包；物理键鼠、IME、音频及跨机器 LAN 未在本阶段验收。

```powershell
node --test packages/editor/tests/agentEventJournal.test.mjs packages/editor/tests/playRuntime.test.mjs packages/editor/tests/hierarchyMove.test.mjs packages/editor/tests/agentBridge.test.mjs
npm.cmd --prefix packages/editor run build
cargo build --release -p mengine-editor-tauri --features tauri/custom-protocol
$env:MENGINE_QA_ROOT='D:/MEngineNativeQA'
node scripts/qa-frostbound.mjs --performance-only --near
node scripts/qa-frostbound.mjs --triggers-only
```

CPU 采样时可通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 为隔离的 QA 编辑器指定本机远程调试端口，再连接该编辑器的 Game 页面；采样前必须明确聚焦 Game 视图并确认对战缩放为 12。Scene 视图的软件预览有不同的调用链，不能混作 Game 基线。FPS 对照窗口不启用 CPU Profiler。
