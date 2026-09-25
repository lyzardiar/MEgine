# 编辑器实时预览性能验证

2026-09-26，Windows 本机原生编辑器，`samples/unity-physics-friction`，65 个实体。

## 结果

1440×900 编辑器窗口，Game 与 Profiler 可见，Game 输出选择 1080×1920。等待至少 5 个原生帧完成，再预热 4 秒、采样 12 秒。使用独立配置目录和后台 Agent 编辑器，关闭 WebView 后台计时器降频；没有改变用户的项目或窗口布局。

| 版本 | Game 原生画面更新 | 原生渲染平均耗时 | 请求至像素上传平均耗时 |
| --- | ---: | ---: | ---: |
| 优化前 Debug，提交 `09d4882` | 5.75 FPS | 未记录均值 | 未记录 |
| 优化后 Debug | 25.49 FPS | 12.69 ms | 31.46 ms |
| 优化后 Release | 42.65 FPS | 4.23 ms | 18.35 ms |

同为 Debug 的提升约 **4.4 倍**。Release 是另列的构建结果，不用于计算代码优化倍率。

优化前使用采样期内完成的 69 个原生帧除以 12.009 秒。优化后使用 `nativeSummary` 中完成帧间隔的平均值；原生历史仅保留最近 240 帧，不能用饱和后的 `nativeProfileCount / 12` 计算 FPS。`WebView Frame` 表示浏览器 rAF 间隔，`Presented Frame` 表示原生帧传输及像素上传完成的间隔，均不等同于显示器或 GPU 驱动的呈现统计。

原始数据与界面截图：`before-steady.json/png`、`after-steady.json/png`、`after-release.json/png`。实时 Game 预览按面板显示像素渲染，本次为 286×509；固定像素 Canvas 保持所选渲染尺寸，避免改变 UI 布局。显式截图仍为 1080×1920。

Scene、选中相机预览、独立 Game 窗口同时运行的 Release 验证中，Scene 为 **22.64 FPS**、Game 为 **17.72 FPS**，见 `multi-view.json`。该场景仍有明显的 GPU 回读、IPC 和跨窗口同步开销，尚未达到稳定 60 FPS。本次测量不是用户截图中 2560×1369 同窗布局的逐像素复现。

## 实现

- Game 与播放中的 Scene 请求上限调整为 60 Hz，每个视图只保留一个进行中的请求。
- 实时原生帧使用带元数据的二进制 RGBA 响应，复用 Canvas；显式 PNG 截图接口保持兼容。
- Play 视图读取已完成的运行时帧。Hierarchy、Inspector 每 100 ms 刷新；Agent 在节流检查之后才复制场景；没有独立窗口时跳过周期性场景序列化。初始窗口握手仍立即同步。
- FrameCompiler 在图元合并与材质解析之后合批，避免重复的 Canvas 重排。公共 UI 收集器继续返回完整批次。
- 字形度量和字偶距使用有界缓存，字体变更和项目切换时失效。
- Profiler 分开记录浏览器重绘与原生帧交付，前台面板每 250 ms 更新显示，后台每秒更新；采样持续记录。Agent `profiler.get_samples` 提供原生帧率、平均请求耗时和 p95 间隔。

## 验证

- 编辑器 Node 测试：936 通过，0 失败。
- Rust runtime 测试：207 通过，0 失败。
- TypeScript/Vite、原生 Debug、原生 Release 构建通过。
- Release Agent 实测：独立窗口在 Edit 首次打开时获得正确场景，Play 持续同步，暂停冻结、单步推进、Stop 恢复编辑态，以及 1080×1920 PNG 截图通过。
- 雷霆战机 Release 回归：开始、移动、Nova、暂停/恢复、重开、Stop 恢复与标题/Nova 原生截图通过。记录位于 `thunder/`。

```powershell
$env:MENGINE_EDITOR_CONFIG_DIR = "$PWD/tmp/performance-verify"
$env:MENGINE_EDITOR_EXECUTABLE = "$PWD/target/release/mengine-editor-tauri.exe"
node scripts/measure-editor-friction.mjs verification
node scripts/qa-editor-performance.mjs
```

本机可执行文件：`target/release/mengine-editor-tauri.exe`，SHA-256：`79CAC69AF55B38D5DE7E6BDB2BF1C97F7B9D2A2BD12B3D9E488D157C8CE41D9F`。Debug 文件也已更新；可执行文件不提交到 Git。
