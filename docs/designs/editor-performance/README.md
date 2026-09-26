# 编辑器与小游戏帧耗时验证

2026-09-26，Windows 本机 Release 原生编辑器，默认 1440×900 窗口。硬件与构建配置见 `environment.json`。

## 计时口径

已统计工作耗时取 `averageSimulationMs + averageCommandMs + averageUploadMs + averagePaintMs`。其中 Command 已包含原生 Render，不重复相加；该数值是各阶段均值之和，包含脚本、引擎更新、视口编译/提交/GPU 回读、响应准备、像素上传和浏览器绘制。它不是端到端请求延迟，也不是逐帧总耗时的 p95。

`averageRequestMs` 单列原生画面请求到上传完成的墙钟耗时，包含 IPC、排队与调度等待。`presentedFps` 是完成画面交付的间隔统计，不是显示器/驱动呈现计数。原生历史保留最近 240 帧；浏览器绘制统计覆盖 12 秒采样期。

## 结果

| 项目 | 雷霆战机优化前 | 雷霆战机最终 | 摩擦样例最终 |
| --- | ---: | ---: | ---: |
| 原生模拟 | 15.19 ms | 1.97 ms | 1.37 ms |
| 原生渲染 | 3.91 ms | 2.35 ms | 1.40 ms |
| 原生命令（含渲染） | 未单列 | 2.63 ms | 1.58 ms |
| 像素上传 | 未单列 | 0.66 ms | 0.28 ms |
| 浏览器绘制 | 0.58 ms | 0.60 ms | 0.59 ms |
| 已统计整体工作均值 | 至少 19.68 ms | **5.86 ms** | **3.82 ms** |
| 原生画面请求墙钟延迟 | 12.43 ms | 6.00 ms | 3.94 ms |
| 画面交付频率 | 48.05 FPS | 55.16 FPS | 55.52 FPS |

雷霆战机采样末尾有 265 发敌弹、峰值 269 发。**约 5 ms 的预算已接近，但严格整体 5 ms 尚未通过**：当前均值高 0.86 ms。该结论只覆盖此实战窗口，未证明所有 Boss 密集弹幕帧或所有窗口尺寸都在 5 ms 内。优化前未单列上传和响应准备，因此旧总耗时只给下界。

多视图同时运行时，Scene 为 55.57 FPS、独立 Game 为 55.55 FPS；两者均持续交付原生画面。

雷霆战机测量在开始战斗、重开后进行，预热 4 秒、采样 12 秒，并验证采样结束时仍为 playing。采样后立即暂停再截图，见 `final-thunder/performance.json`、`realtime-combat.png` 和 `realtime-editor.png`。没有减少敌弹、特效或所选输出分辨率；实时预览沿用面板显示像素尺寸，显式截图保留原始目标尺寸。

空白项目 Hub 的可见 WebView 对照为 55.73 次 rAF/秒，见 `empty-hub-refresh.json`。这是本次环境的观察值，不是通用硬件上限，不能据此宣称物理 60 FPS。最终数据在构建和测试进程结束后采集。

## 实现

- 编辑器 Play 和 Player 统一使用独立 QuickJS-NG VM，保留输入、事件、Animator、Timeline、音频和场景 API；每次调用限时 1 秒、堆上限 256 MiB。世界快照的 JSON 字符串序列化与 JS 对象解析在脚本读取时发生。
- `engine.setSpriteBatchData` 直接复制 JS 数值数组并在帧边界提交，避免弹幕每帧 JSON 往返。保留已有 SpriteBatch2D 材质、尺寸和排序属性；限制 8192 行，校验 float32，命令保持顺序，失败 tick 丢弃待提交命令。IDL、编辑器 Undo、Agent 原子批处理与 MCP schema 使用同一契约。
- 材质、材质实例、着色器和字体文件每 250 ms 检查一次变更，显式材质失效立即生效，字体项目切换立即清缓存。
- 文字几何使用完整布局/颜色/字体键缓存，字体更新失效；按条目和图元数量设上限。Canvas 合批跳过已连续的材质流，重叠候选使用数组标记去重，拓扑排序使用整数材质索引，保持透明遮挡顺序。
- Windows 编辑器和 Player 的 Rust 数据使用 mimalloc，QuickJS 保留自带的内存限额。原生画面通过 WebView2 SharedBuffer 传递，Canvas2D 上传；Play 保留原生 World，Inspector/Hierarchy 和 Profiler 按既有节流策略刷新。

## 验证

- 编辑器完整测试 943 通过；最后的 float32 边界校验专项通过。
- Rust core/host/rhi/runtime/script 共 308 项通过；Canvas 合批修改后重跑 RHI 45 项通过。
- 两款真实原生游戏回放通过：雷霆战机完整通关及五种 Boss 阶段、鹈鹕 2.7 km 比赛。真实脚本桥的回放结果保存在各样例验收目录。
- TypeScript/Vite、嵌入前端的原生 Release/Debug 构建通过；两款独立 Player 重新打包，包内程序完成文件哈希、场景、资源和启动脚本校验，见 `player-builds.json`。独立 Player 窗口输入与音频听感不在此次性能验收内。
- `final-multiview/multi-view.json` 记录 Scene、相机预览和独立 Game 同开；验证 Edit/Play 场景同步、独立窗口真实按键、暂停、单步、Stop 恢复与 1080×1920 截图。

## 复验

```powershell
$env:MENGINE_EDITOR_CONFIG_DIR = "$PWD/tmp/performance-verification"
$env:MENGINE_EDITOR_EXECUTABLE = "$PWD/target/release/mengine-editor-tauri.exe"
$env:MENGINE_PERFORMANCE_OUT = "$PWD/docs/designs/editor-performance/final-thunder"
node scripts/qa-thunder-fighter.mjs --live-only --measure
node scripts/measure-editor-friction.mjs final-release
$env:MENGINE_PERFORMANCE_OUT = "$PWD/docs/designs/editor-performance/final-multiview"
node scripts/qa-editor-performance.mjs
```

复验使用独立 QA 配置；每组测量前结束上一组 QA 进程，不关闭用户编辑器。直接 Cargo 构建编辑器时须带 `--features tauri/custom-protocol`，并先完成前端构建，确保测试的是嵌入前端的交付程序。

最终 Release Editor：`target/release/mengine-editor-tauri.exe`，SHA-256：`077d8f7848cba2d43d86e33b4dfe1817a3404b4babea465877cafd6b0e27cbc5`。Debug Editor、Build SDK 和两款样例 Player 也已更新；二进制不提交 Git。
