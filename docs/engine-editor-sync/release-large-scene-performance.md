# Release 大场景持续卡顿优化

Author: MiYu

Frostbound Main 场景含 9,019 个实体。加载完成后的主要 Scene 开销发生在浏览器 UI 布局、重复模型绘制和相机移动时的全场景处理。原生模型渲染本身约 4.6 ms，因此仅开启 Release 不能解决这些开销。

## 当前行为

- UI 布局使用实体 ID 索引查找祖先，字体和 Sprite 使用资产索引。
- 编辑态 Scene 使用完整浏览器快照负责选择与命中；传入原生渲染的快照排除 inactive 子树。模型像素由原生渲染器负责，浏览器只计算选择范围，原生失败时恢复浏览器绘制。
- 相机移动发送独立相机状态消息，复用实体数组对应的世界参数与变换，不重建场景快照、层级和 dirty 指纹。
- 原生 Scene 首次接收快照后保留一个世界，后续相机请求引用该世界。引用区分工程、窗口、修订及隐藏项，失效时重传快照；Play 保持自己的世界所有权。
- Scene UI 仅处理 Canvas 后代、相机及必要祖先。单个 Overlay Canvas 缓存逻辑布局与可见区域纹理，通过 WebGL 一次投影绘制；选中描边独立绘制。缓存随实体、资产、字体、尺寸和选择变化失效，并有 250 ms 更新上限。
- 投影仍每帧更新裁剪与命中；WorldSpace、Camera Canvas、多 Canvas、Canvas Mask 及不支持 GPU 的环境保留相应回退路径。

## 真实 Release 验证

同一隔离样本通过真实 WebView 连续右键拖动 12 秒，并运行单机 Game 12 秒。测量包含浏览器与原生呈现链路，不把桥接调用成功当作帧率。

| 指标 | 优化前 | 当前 |
| --- | ---: | ---: |
| 静止 Scene 浏览器平均绘制 | 约 187 ms | 12.80 ms |
| 连续拖动 Scene 浏览器平均绘制 | 180.53 ms | 20.04 ms |
| 连续拖动 Scene 浏览器平均帧间隔 | 467.54 ms | 52.29 ms |
| 单机 Game 原生实际呈现 | 25.57 FPS | 32.85 FPS |

当前连续拖动 Scene 原生实际呈现为 15.89 FPS，原生世界同步平均 0.015 ms、渲染平均 3.44 ms。静止 Scene 原生请求使用既有约 200 ms 周期，实测 4.78 FPS；这个数字不代表交互帧率。工程打开耗时 5.89 秒。

层级初始仅 15 个 DOM 行，展开和滚动后各 30 行；模型选择、Collider 选择、层级展开和滚动均通过。真实 WebView 四色 GPU 像素检查验证纹理方向与半透明结果，控制台无 error，QA 正常退出。

前端定向测试 224 通过、0 失败；Rust 世界引用测试 1 通过、0 失败；TypeScript/Vite 与独立原生 Release 构建通过。

## 验收边界

连续拖动尚未达到 60 FPS，浏览器平均帧间隔与跨 WebView 呈现仍有优化空间。本机 Game 未复现用户机器的极度持续卡顿，需用户以同步后的源码重建并复测，不能据此认定其机器的 Game 问题已完全解决。

## 构建

```powershell
npm.cmd --prefix packages/editor run build
cargo build --release -p mengine-editor-tauri --features custom-protocol
```

两步均执行后，使用 Cargo Release 输出的编辑器 EXE。原生 EXE 内嵌前端资源，因此需要先构建前端。
