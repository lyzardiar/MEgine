# 界面布局与近景性能测量

界面布局在每次调用中建立父子节点索引，按 siblingIndex 稳定排序。嵌套布局测量、内容尺寸适配和递归绘制共享该索引，避免对每个节点重复扫描完整实体列表。索引不会跨调用保留，因此直接修改父节点、显示状态、兄弟顺序或实体数组后，下次布局立即生效。

2463 个实体、577 个界面绘制项的独立 Node/Vite 基准，预热 50 次后测量五组，每组 100 次。单次布局的组中位数从 **3.286 ms 降至 0.799 ms**。这是保存场景的布局 CPU 测量，不能换算成游戏帧率。

原生对照使用同一写实素材、1280×720、缩放 12 的对战和高地编辑场景，各预热 5 秒、连续测量三次 5 秒。两个场景均没有启用浏览器交互控件；原生画面就绪后不执行上述布局路径。近景仍然缓慢，本次修改不解决这两个场景的主要性能问题，5 ms 目标未达到。基线提交、编辑器二进制哈希、两侧每组帧率、前端耗时及原生调用树见 [测量数据](ui-layout-performance.json)。

交互控件启用时仍使用完整快照渲染，维持浏览器命中区域与原生底图的一致性。已有 session ID 不能保证排队的渲染命令读取同一版世界：此前入队的模拟步骤可能先推进世界。因此未解除此保护，也未以引用比较替代可变实体的失效检测。

## 验证

- 52 项界面测试通过，覆盖嵌套 Canvas、LayoutGroup、输入框命中、射线阻挡和同一实体数组的动态增删、改父节点、改顺序及启停。
- TypeScript/Vite 和嵌入前端的原生 Release 编辑器构建通过。
- 对战、高地原生性能采样通过；材质管线拒绝为 0。
- 原生地图编辑验收通过：窗口指针命中输入框，区域及任务文本使用中文，暂停编辑、保存读取、触发条件和护送任务运行正常。见 [实际输入画面](editor-unicode-input.png) 和 [验收记录](native-triggers-qa.json)。该输入由自动化触发，不代表物理输入法验收。
- 本阶段只修改编辑器布局，Player 程序及素材包沿用扫描地表阶段。本测量不是独立 Player 帧率，也不包含物理键鼠、音频或跨机器 LAN 验收。

## 复现

```powershell
node scripts/bench-frost-ui.mjs
node --test packages/editor/tests/nativeUiInput.test.mjs packages/editor/tests/canvasRenderModes.test.mjs packages/editor/tests/uiPhysicsRaycast.test.mjs
npm.cmd --prefix packages/editor run build
cargo build --release -p mengine-editor-tauri --features tauri/custom-protocol
$env:MENGINE_QA_ROOT='D:/MEngineNativeQA'
node scripts/qa-frostbound.mjs --performance-only --near
node scripts/qa-frostbound.mjs --performance-only --near --map-editor
node scripts/qa-frostbound.mjs --triggers-only
```
