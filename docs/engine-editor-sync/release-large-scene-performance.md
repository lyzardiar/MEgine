# Release 大场景持续卡顿优化

Author: MiYu

Frostbound Main 场景含 9,019 个实体。加载完成后的主要 Scene 开销发生在浏览器 UI 布局、重复模型绘制和相机移动时的全场景处理。原生模型渲染本身约 4.6 ms，因此仅开启 Release 不能解决这些开销。

## 当前行为

- UI 布局使用实体 ID 索引查找祖先，字体和 Sprite 使用资产索引。
- 编辑态 Scene 使用完整浏览器快照负责选择与命中；传入原生渲染的快照排除 inactive 子树。模型像素由原生渲染器负责，浏览器只计算选择范围，原生失败时恢复浏览器绘制。
- 相机移动发送独立相机状态消息，复用实体数组对应的世界参数与变换，不重建场景快照、层级和 dirty 指纹。隐藏的 Timeline 面板按编辑快照复用 authoredEntities；相机更新不再触发完整深拷贝，实体编辑与预览更新仍刷新该副本。
- 编辑态浏览器持续使用当前修订的完整 owned 快照，使相机请求等待期间的 UI 和变换缓存保持稳定。UI 与模型投影批次只计算一次相机基向量，保留现有 near/far 裁剪及选择几何。
- 原生 Scene 首次接收快照后保留一个世界，后续相机请求引用该世界。引用区分工程、窗口、修订及隐藏项，失效时重传快照；Play 保持自己的世界所有权。
- Scene UI 仅处理 Canvas 后代、相机及必要祖先。单个 Overlay Canvas 缓存逻辑布局与可见区域纹理，通过 WebGL 一次投影绘制；选中描边独立绘制。缓存随实体、资产、字体、尺寸和选择变化失效，并有 250 ms 更新上限。
- 投影仍每帧更新裁剪与命中；WorldSpace、Camera Canvas、多 Canvas、Canvas Mask 及不支持 GPU 的环境保留相应回退路径。

## 真实 Release 验证

同一隔离样本通过真实 WebView 连续右键拖动 12 秒，并运行单机 Game 12 秒。测量包含浏览器与原生呈现链路，不把桥接调用成功当作帧率。

| 指标 | 优化前 | 当前 |
| --- | ---: | ---: |
| 静止 Scene 浏览器平均绘制 | 约 187 ms | 11.01 ms |
| 连续拖动 Scene 浏览器平均绘制 | 180.53 ms | 12.07 ms |
| 连续拖动 Scene 浏览器平均帧间隔 | 467.54 ms | 20.14 ms |
| 单机 Game 原生帧上传 | 25.57 FPS | 32.04 FPS |

当前连续拖动 Scene 原生帧上传为 48.17 FPS，原生世界同步平均 0.0004 ms、渲染平均 2.86 ms。静止 Scene 原生请求使用既有约 200 ms 周期，呈现约 5 FPS；这个数字不代表交互帧率。工程打开耗时 5.99 秒。

层级初始仅 15 个 DOM 行，展开和滚动后各 30 行；模型选择、Collider 选择、层级展开和滚动均通过。真实 WebView 四色 GPU 像素检查验证纹理方向与半透明结果，控制台无 error，QA 正常退出。

本阶段投影、UI、原生快照与 Timeline 定向测试 121 通过、0 失败；TypeScript/Vite 与独立原生 Release 构建通过。此前世界引用与 Canvas 投影阶段的 224 项前端测试及 1 项 Rust 测试均通过。

相同鼠标拖动与 CPU 采样流程下，上一阶段构建呈现 14.59 FPS，当前为 48.17 FPS；平均浏览器帧间隔由 63.29 ms 降到 20.14 ms。上一阶段 12 秒拖动采样中的 authoredEntities 深拷贝占约 5.2 秒，当前不再随相机移动重复深拷贝。CPU 采样自耗时不等于完整调用链耗时。

## Game 脚本阶段与同环境对照

Play profiler 将脚本阶段分为世界状态发布、QuickJS 回调和命令提交，运行时请求保留在父阶段自身耗时中。命令提交与脚本异常回滚的行为保持一致。

frostbound 客户端记录已完成隐藏的普通单位槽，持续隐藏时跳过重复呈现；可见、死亡动画和复活阶段清除该标记。effect pool 继续重试未获原生确认的写入。死亡动画结束、复活结束及槽复用仍执行首次必要清理。

同环境依次运行旧版与候选版，每次使用独立 WebView 调试端口，并确认自己拥有的 QA 编辑器真正退出。两版打开同一 9,019 实体场景，Game 预热 6 秒后采样 12 秒。

| 指标 | 旧版 | 候选版 |
| --- | ---: | ---: |
| 连续拖动 Scene 原生帧上传 | 29.93 FPS | 29.74 FPS |
| Game 原生帧上传 | 25.94 FPS | 28.38 FPS |
| Game 原生模拟平均耗时 | 15.54 ms | 12.61 ms |
| Game 原生渲染平均耗时 | 10.23 ms | 9.34 ms |

候选打开工程耗时 5.95 秒。Scene 层级初始 15 行 DOM，展开与滚动均为 30 行；模型和 Collider 选择、GPU 方向与透明度检查通过。两版 QA 无控制台 error，拥有的编辑器均确认退出。当前 Scene 结果低于上一阶段 48.17 FPS 的采样，不能混用两次测量作为本轮对照。

独立原生模拟基准使用真实 QuickJS 和生成 Main.js，预热 360 帧后采样 60 帧：QuickJS 回调由 11.56 ms 降至 8.72 ms。该结果只衡量模拟，不包含渲染、WebView 或 IPC。生成客户端等价测试覆盖 21 个呈现场景；同一重复隐藏测试中 effect pool hide 调用由 19,890 次降至 7,200 次。65 项 Rust 测试和 7 组客户端/真实 TCP 测试通过，0 失败。

本轮 EXE：`D:/MEngineNativeQA/release-editor-game-performance.exe`，SHA-256：`C62B7D841386AEA9EB4DCA5AB402211BD2DB3FB7433E5FB52ABBAF2ED207DB26`。

证据：
- `D:/MEngineNativeQA/release-scene-profile-game-matched-baseline-isolated-1791732473197/report.json`
- `D:/MEngineNativeQA/release-scene-profile-game-matched-candidate-isolated-1791732583285/report.json`
- `D:/MEngineNativeQA/game-native-steady-baseline.log`
- `D:/MEngineNativeQA/game-native-steady-candidate.log`

原生模拟基准可用 `cargo test --release -p mengine-editor-host --lib measure_sample_script_stages -- --ignored --nocapture --test-threads=1` 执行；设置 `MENGINE_SAMPLE_ROOT` 为工程根目录，可用 `MENGINE_PROFILE_SOURCE` 指定另一个生成脚本作对照。

## Scene 连续画面与 Play 渲染线程

相机移动期间持续显示最近完成且适用于当前世界、隐藏项与视口尺寸的原生帧。新帧到达后同时更新模型像素、相机、选择命中、编辑操作和网格。下一次原生请求使用实时相机；当前显示帧的相机不会覆盖请求参数。首次无帧或原生错误时，浏览器模型绘制保持可见。

Play worker 只发布不可变世界快照及模拟 profile。调用线程更新独立世界镜像并执行 GPU 渲染与回读，QuickJS 可以继续模拟。镜像锁获取后及渲染返回后均检查 session generation，旧渲染结果不进入重启后的会话；历史淘汰不影响已发布快照的生命周期。Scene 隐藏过滤使用发布源的实体 ID。

对同一 9,019 实体工程连续右键拖动 12 秒，拖动阶段暂时隐藏 Interface，并取消相机选择，单独检查主 Scene 画面。每次画布开始绘制时记录主原生 bitmap 与浏览器模型多边形，排除 Camera Preview；原生帧上传频率不能代替画布实际显示验证。

| 指标 | 旧版 | 当前 |
| --- | ---: | ---: |
| Scene 绘制次数 | 676 | 676 |
| 无原生主画面且无浏览器模型的绘制 | 224 | 0 |
| Scene 原生帧上传频率 | 54.61 FPS | 54.79 FPS |
| Game 原生帧上传频率 | 35.49 FPS | 34.56 FPS |
| Game 模拟请求平均延迟 | 21.71 ms | 19.28 ms |

当前 Scene 673 次使用原生主画面、3 次使用浏览器模型回退；实际绘制到画布的新原生主帧为 655 张。拖动中的截图包含连续显示的地形。Game 本轮未获得帧率提升，线程解耦通过正确性验证，不能据此宣布 Game 卡顿已经解决。工程打开耗时为 6.05 秒，打开时间未改善。

42 项 editor-host 测试、1 项共享世界镜像测试、1 项原生相机/活跃实体测试与 29 项前端测试通过，0 失败；其中 3 项手动性能测试按设计忽略。覆盖渲染阻塞期间的模拟推进、旧修订淘汰、停止重启、等待镜像锁的旧发布、实体 ID 复用及 Scene 隐藏过滤。TypeScript/Vite 与原生 Release 构建通过。真实 WebView GPU 像素、模型/Collider 选择及层级展开/滚动检查通过；两个拥有的 QA 编辑器均已退出，未操作用户编辑器。

本轮 EXE：`D:/MEngineNativeQA/release-editor-parallel-play.exe`，SHA-256：`28C72084F4C54234B1CA46A5059AB1744C124351D0ABEC00284B2FFDEAD87DD3`。

证据：
- `D:/MEngineNativeQA/release-scene-profile-parallel-play-final-baseline-1791735746140/report.json`
- `D:/MEngineNativeQA/release-scene-profile-parallel-play-final-candidate-1791735819084/report.json`
- `D:/MEngineNativeQA/release-scene-profile-parallel-play-final-candidate-1791735819084/moving-scene.png`
- `D:/MEngineNativeQA/profile-release-scene-projection.mjs`
- `D:/MEngineNativeQA/parallel-play-performance-handoff.json`

## Play 完成回调调度

Play 使用单一 timeout，根据最近一次模拟启动时间安排下一步。模拟完成时，如果本轮已超过 60 Hz 周期，立即安排下一步；较快的步骤仍保持 60 Hz 上限。启动、暂停与忙碌期间保留轮询，完成回调检查 session generation，停止或重启后的旧回调不能发布面板状态或调整新会话的调度。

同一工程完成两组 Release 对照，第二组交换执行顺序，并在 12 秒稳定采样前后读取实际帧号及模拟时钟：

| 指标 | 旧版 | 当前 |
| --- | ---: | ---: |
| 第二组实际模拟推进频率 | 35.39 次/秒 | 38.90 次/秒 |
| 第一组 Game 原生帧上传频率 | 34.83 FPS | 33.54 FPS |
| 第二组 Game 原生帧上传频率 | 33.35 FPS | 33.86 FPS |
| 两组 Scene 拖动空画面次数 | 0 | 0 |

第二组模拟推进提高约 9.9%；两组 Game 画面上传结果未显示稳定帧率提升。模拟推进和画面上传分别计数，不能互相替代，也不能据此宣称 Game 卡顿已经解决。

25 项前端调度、runtime、输入序列与模拟时钟测试通过，0 失败；TypeScript/Vite 与原生 Release 构建通过。四次真实编辑器验收均通过 GPU 像素、模型选择、层级滚动、暂停时钟冻结、精确单步、继续运行和停止重启检查，无控制台 error，拥有的 QA 编辑器均确认退出。没有修改原生源码，因此本轮未重复原生单元测试。

本轮 EXE：`D:/MEngineNativeQA/release-editor-playback-completion.exe`，SHA-256：`D79A2AD617405D4C414C693ADA0B5FDF923D05BB24961A7B95A05FAF330A53D2`。

证据：
- `D:/MEngineNativeQA/release-scene-profile-playback-completion-baseline-1791737876830/report.json`
- `D:/MEngineNativeQA/release-scene-profile-playback-completion-candidate-1791737972228/report.json`
- `D:/MEngineNativeQA/release-scene-profile-playback-completion-candidate-repeat-1791738093842/report.json`
- `D:/MEngineNativeQA/release-scene-profile-playback-completion-baseline-repeat-1791738182520/report.json`
- `D:/MEngineNativeQA/profile-playback-completion.mjs`

## Game 原生帧完成后接续请求

Game 原生请求完成后安排下一次绘制，不再依赖下一次 requestAnimationFrame 才能发出请求。所有请求共用起点时间与 in-flight 状态，最快按 60 Hz 周期发送；剩余 timeout 延迟向上取整，避免 WebView 的整数 timer 提前触发后错过下一帧。新请求取消旧 timer；停止、切换视图、卸载、资产失效和错误均不能通过旧完成回调持续发出请求。

对同一工程执行两组 Release 对照，第二组先运行新版再运行旧版。每次预热后采样约 12 秒，同时记录实际 native profile 广播，以及 Game 主画布 drawImage 使用的新原生 buffer 序号。

| 指标 | 第一组旧版 | 第一组新版 | 第二组旧版 | 第二组新版 |
| --- | ---: | ---: | ---: | ---: |
| Game 画布新帧绘制频率 | 32.09 次/秒 | 37.65 次/秒 | 33.27 次/秒 | 38.04 次/秒 |
| Game 原生帧上传频率 | 34.20 FPS | 39.75 FPS | 33.25 FPS | 39.48 FPS |
| 完成帧到下次请求起点的平均等待 | 5.94 ms | 2.75 ms | 6.42 ms | 3.07 ms |
| 实际模拟推进频率 | 38.30 次/秒 | 38.05 次/秒 | 38.51 次/秒 | 38.34 次/秒 |
| Scene 拖动空画面次数 | 0 | 0 | 0 | 0 |

两组 Game 画布新帧绘制频率分别提高约 17.3% 和 14.4%，模拟推进基本保持不变。画布新帧计数证明新原生 buffer 已参与主画布绘制，不代表 Windows compositor 或物理显示器的呈现频率。完成帧 timestamp 减去该帧 transportMs 可恢复请求起点，用它与前一张完成帧 timestamp 计算请求间等待。

33 项原生帧、传输、呈现与调度测试通过，0 失败，覆盖整数 timer 且无 RAF 的快速续帧、RAF 竞争、延迟 timer、卸载、切换视图、资产失效、错误和会话重启。TypeScript/Vite 和原生 Release 构建通过。四次真实编辑器验收均通过 GPU 像素、模型选择、层级展开与滚动、暂停时钟、精确单步及停止重启检查，无控制台 error，拥有的 QA 编辑器全部退出。生产修改仅涉及前端，本轮没有重复原生单元测试。

本轮 EXE：`D:/MEngineNativeQA/release-editor-game-completion.exe`，SHA-256：`57680C43C494D6432C9A0E2B829199D95BBCE319735C894521CC1107BCE346CF`。

证据：
- `D:/MEngineNativeQA/release-scene-profile-game-completion-baseline-1791739102717/report.json`
- `D:/MEngineNativeQA/release-scene-profile-game-completion-candidate-1791739200333/report.json`
- `D:/MEngineNativeQA/release-scene-profile-game-completion-candidate-repeat-1791739319972/report.json`
- `D:/MEngineNativeQA/release-scene-profile-game-completion-baseline-repeat-1791739442017/report.json`
- `D:/MEngineNativeQA/profile-game-completion.mjs`
- `D:/MEngineNativeQA/game-completion-performance-handoff.json`

## 验收边界

连续拖动尚未达到 60 FPS，浏览器平均帧间隔与跨 WebView 呈现仍有优化空间。本机 Game 未复现用户机器的极度持续卡顿，需用户以同步后的源码重建并复测，不能据此认定其机器的 Game 问题已完全解决。

## 构建

```powershell
npm.cmd --prefix packages/editor run build
cargo build --release -p mengine-editor-tauri --features custom-protocol
```

两步均执行后，使用 Cargo Release 输出的编辑器 EXE。原生 EXE 内嵌前端资源，因此需要先构建前端。
