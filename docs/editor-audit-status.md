# MEngine 编辑器自主审计状态

更新日期：2026-08-02

本文用于后续代码与产品审核。它区分“已经实现并有当前回归证据”“已知边界”和“尚待继续审计”，不以提交数量代替整体完成证明。

## 已完成并纳入回归的主要能力

### AI Agent 后台开发

- AgentBridge 已覆盖发现、观察、操作与验证主路径；组件 schema、场景状态、Canvas draw plan 和窗口语义树均可机器读取。
- 全部原生编辑器窗口支持聚合语义快照与逐窗截图；聚合结果只有在窗口清单稳定、全部读取成功且逐窗声明安全时才会标记 `complete/backgroundSafe`。
- UI 等待支持期望 revision 与零超时稳定观察；截图优先走 WebView2 页面捕获，不依赖抢占前台焦点。
- Agent 适配器随桌面构建发布，并可在项目打开前进入配置与文档入口。

### Unity Canvas / uGUI 基础链

- RectTransform 坐标、Canvas 三种 Render Mode、CanvasScaler 三种屏幕模式与 World Space authoring、Reference Pixels Per Unit、Pixel Perfect 继承、Nested/Override Sorting Canvas、Target Display 和 Camera 引用已进入 Editor/Runtime 契约。
- CanvasGroup、GraphicRaycaster、Graphic enabled/raycast target/padding、MaskableGraphic、Mask/RectMask2D、8 层 Stencil、软裁剪、透明网格剔除、嵌套 Canvas batching island、重叠感知批处理和 Additional Shader Channels 已对齐并有无窗口回归。
- Image 的 Simple/Sliced/Tiled/Filled、Preserve Aspect、Fill、边框、Pixels Per Unit Multiplier、Alpha Hit Test、SpriteSwap，以及 UI Material/Shader 发布与 Player 管线已经形成基础闭环。
- Unity Text 已覆盖段落换行/溢出、Best Fit、Font Style、Align By Geometry、Rich Text、TTF/OTF 资产导入与构建、Runtime 动态图集、热更新、字偶距，以及 World Space Dynamic Pixels Per Unit。

### 编辑器其他已推进能力

- Timeline 已具备密集轨道横纵虚拟化、递归子 Timeline 浏览、Control/Prefab/Activation 生命周期、Clip 级 Source、自动控制、依赖与性能视图等基础闭环。
- Behaviour 内置组件 token 由 IDL 完整生成，动态 Play 生命周期可重协调；AudioSource 播放时间可观察。
- 项目工作区启动已拆分延迟加载；本轮所有操作均使用后台命令与无窗口测试，没有启动或聚焦可见编辑器窗口。

## 2026-08-01 当前批次：Dynamic Pixels Per Unit

完成：

- World Space Canvas 将 `dynamic_pixels_per_unit` 只传播给动态字体栅格化，不改变文本布局、RectTransform 或世界尺寸。
- Runtime 字体缓存同时按逻辑字号、栅格字号、字体 revision 和样式分组；密度变化会生成独立图集，逻辑 glyph bounds 保持稳定。
- Editor 后台 draw plan 明确公开 `text.dynamicPixelsPerUnit`；浏览器预览继续按最终屏幕分辨率直接栅格化。
- 输入密度限制为 `0.01–64`，栅格字号和图集页数也有界；非法密度回退，不允许 Agent 写入制造无界字体纹理。

本批验证门禁：

- `cargo test -p mengine-runtime --lib`
- Editor Canvas Render Modes 定向测试
- 提交前执行 Editor 全量测试、CLI 全量测试、Rust workspace all-targets、严格 Clippy、格式检查、生产构建和 `git diff --check`

## 2026-08-02 当前批次：Scene View Canvas Quad

完成：

- Screen Space Canvas 在 Scene View 中按固定 Game 分辨率建立作者空间 Quad；1920×1080 配置对应 1920×1080 RectTransform/世界作者单位，不再退化为当前编辑器面板 letterbox 尺寸。
- Scene 投影保留每个 UI Rect 的四个投影角、透视倒数 W、投影旋转与边长；Canvas 边框、选择命中和批处理边界不再以固定居中的轴对齐包围框代替空间 Quad。
- Scene 相机平移、环绕和缩放会改变 Canvas Quad 的投影；2D 模式自动取景与滚轮距离范围已适配分辨率级 Canvas 尺寸。
- 固定分辨率与 Free Aspect 回退通过同一个受测契约解析，避免布局和自动取景再次使用不同尺寸来源。
- `override_sorting` 嵌套 Canvas 在 Scene View 中按独立 batching island 只投影一次，不再同时混入父 Canvas 和自身布局造成重复绘制/命中。
- Screen Space Camera Canvas 按指定 Render Camera 的视锥、正交尺寸和 `plane_distance` 建立 Scene Quad；相机位置、旋转和距离会实际改变作者空间位置与尺寸。
- `Frame Selected` 复用相同的固定 Game 分辨率和 Camera Canvas 世界平面；不再退回 CanvasScaler 参考分辨率，也不受 Game View Target Display 过滤。

本批验证门禁：

- Canvas Render Modes、CanvasScaler 与 Game Resolution 定向测试：54/54
- Editor 全量测试：788/788
- Editor TypeScript/Vite 生产构建
- `git diff --check`

已知边界与下一入口：

- 浏览器预览仍使用 Canvas2D 近似绘制透视 Quad 内部内容；真实 wgpu Surface、自定义 UI Shader 与 GPU 像素一致性仍属于原生视口审计范围。

## 2026-08-02 当前批次：Game View InputField / IME

完成：

- Game View 中聚焦可交互 InputField 时挂载原生 `textarea` 输入代理，由浏览器处理光标、选区、粘贴、删除和平台 IME，不再用全局 `keydown` 拼接 `event.key`。
- IME composition 预编辑期间不修改组件值、不触发 `onValueChanged`；`compositionend` 后再统一规范换行、应用 Unicode code point 字符上限并提交。
- 单行 Enter 触发 `onSubmit` 并退出编辑，多行 Enter 保留原生换行；Escape 退出，Tab/Shift+Tab 继续走 UI 导航。
- 全局编辑器快捷键会识别输入代理并保留文本编辑的原生键盘行为。

本批验证门禁：

- InputField、Navigation 与 CanvasRenderer 定向测试：16/16
- Editor 全量测试：788/788
- Editor TypeScript/Vite 生产构建
- `git diff --check`

已知边界与下一入口：

- 当前输入代理用于浏览器文本语义，Canvas 内仍未绘制可视 caret/selection；内容类型校验、移动端软键盘属性和完整 Unity InputField 事件生命周期仍需继续审计。
- Graphic replacement material、Material Instance、UI Shader、自定义纹理与 Mask stencil 已贯通 Editor batch metadata、Runtime 和发布依赖收集；CanvasRenderer 多材质槽、外部自定义 UI Mesh、通用 `materialForRendering` / `IMaterialModifier` API 仍是独立契约缺口。

## 2026-08-02 当前批次：LayoutGroup / LayoutElement

完成：

- Horizontal/Vertical LayoutGroup 已支持九宫格 `child_alignment`、宽高轴独立的 Control Child Size / Force Expand、Use Child Scale 和 Reverse Arrangement；主轴空间按 min、preferred、flexible 指标分配，不再只把父 Rect 平均切块。
- Grid LayoutGroup 已支持 Flexible、Fixed Column Count、Fixed Row Count，Horizontal/Vertical 填充轴、四个 Start Corner、spacing、padding 和整体 alignment；Grid cell 保持固定尺寸。
- 新增可序列化、可由 Inspector/Agent 编辑并由 Player 执行的 LayoutElement，支持 `ignore_layout` 以及宽高轴的 min、preferred、flexible 覆盖；未参与布局的子项继续使用自身 RectTransform。
- ContentSizeFitter 使用与最终排布相同的参与子项和尺寸指标；Horizontal/Vertical 最小尺寸正确包含 spacing。
- Image 与 Text 现在作为隐式布局提供者贡献 preferred size：Image 使用 source size / pixels-per-unit multiplier，Text 使用真实排版宽高；显式 LayoutElement 继续覆盖隐式指标，同实体多个视觉提供者取最大值。
- 导入字体的 glyph、geometry、line-height 与 pair kerning 测量在 Editor 布局和绘制间复用同一 Canvas2D 测量器；测量缓存不会泄漏 font/fontKerning 状态，无效浏览器指标安全回退。Runtime 复用 UiFontResolver 的同一字体指标。
- LayoutGroup 先分配横向尺寸，再按最终宽度重新测量可换行 Text 的 preferred height；ContentSizeFitter 同样按横向、纵向两阶段求解，不再使用过时的 authored width。
- 父 LayoutGroup、同实体 ContentSizeFitter 与 AspectRatioFitter 共享 driven-axis 所有权：受控轴不会被后续 fitter 覆盖，未受控轴仍可由宽高比推导。
- 嵌套 LayoutGroup 会递归向父级贡献 min、preferred 与 flexible 指标；显式 LayoutElement 继续逐字段覆盖递归指标，异常父子环在 Editor/Runtime 测量链中都会安全终止。
- Editor Canvas 与 Rust Runtime 使用等价布局算法；LayoutGroup 属性或 LayoutElement 参与状态改变后，下一帧重新求解，不依赖滞后的 dirty 标记。
- 旧 `child_force_expand` 保留为宽高轴 Force Expand 的兼容主开关，已有序列化资产无需字段迁移即可加载。
- Behaviour SDK 已同步公开 LayoutElement token，并由完整性与 IDL 顺序测试约束后续生成组件变更。

本批验证门禁：

- Editor 全量测试：796/796
- Runtime lib：189/189；Runtime 可执行目标：27/27；Core：9/9；Scene：18/18
- API、Behaviour、Agent 与 Editor TypeScript 构建检查；Editor 隔离 Vite 生产构建
- Tauri Debug no-bundle 桌面构建

已知边界与下一入口：

- Image/Text、嵌套 LayoutGroup、显式 LayoutElement、父 LayoutGroup、ContentSizeFitter 与 AspectRatioFitter 的内建优先级已闭环。RawImage 当前没有可序列化 source-size 契约，不能伪造 intrinsic size；自定义多个布局提供者的优先级以及病态循环依赖的作者诊断仍需独立审计。

## 2026-08-02 当前批次：统一 RHI / Effekseer 1.80.6

完成：
- Player、Game View、Scene View/Preview 与 Headless 已共享 CPU Frame Compiler、`CompiledFrame`、RenderTarget 和 RHI 提交流程；Game View 使用原生 Offscreen RHI readback，不再维护独立的浏览器渲染实现。
- 已 vendor Effekseer 1.80.6 核心求值代码并新增 `mengine-effekseer` 安全生命周期封装，支持 `.efk/.efkefc` 加载、播放、暂停、停止、速度、位置、起始帧、循环、热重载和 Transform 同步。
- Sprite、Ribbon、Ring、Track、Model 五类 Renderer 回调已转换为世界空间三角形/模型实例，并经当前 `FrameCamera` 投影后进入共享 RHI primitive 流；Player、Game View 和效果预览使用同一结果。
- 新增可停靠 Effekseer Preview 面板，支持项目效果列表、原生 RHI 预览帧、播放/暂停/重播、循环、速度、Front/3/4/Top 相机、拖动旋转、滚轮缩放和背景切换。
- CLI 已将 `EffekseerEffect.effect` 纳入引用扫描，并保守收集效果目录内的非编辑器元数据资源；Runtime 包验证使用 Effekseer 官方核心枚举 Color/Normal/Distortion Texture、Model、Material、Sound、Curve 七类依赖并逐项检查。

已知边界与下一入口：
- 当前是基础可见兼容，不等同于完整复刻 Effekseer Renderer：File Material、Distortion、Normal/Lighting、advanced alpha/flipbook 仍需继续接入。
- Subtractive blend 暂时映射为 Additive；Sprite 的 Rotated/Directional billboard 是近似实现，后续需对齐 Effekseer Common Renderer。
- Node 打包器不能直接调用 Rust/C++ 解析器，因此自动闭包当前覆盖效果所在目录。引用目录外资源时需通过 `alwaysInclude` 显式纳入，最终由 Runtime 严格验证；后续可增加专用 Rust 依赖扫描工具。
- Scene View 已接入使用 Editor Camera 的原生 RHI Base Pass，世界对象、2D primitive、粒子和 Effekseer 由共享 Frame Compiler 输出；相机/灯光图标、Spine 兼容层、Collider、Transform/Rect Gizmo 与 UI 作者叠加层继续覆盖在原生帧之上。
- Scene View 的编辑器叠加层与交互命中当前仍由前端维护；Gizmo/Picking 尚未进入原生 ID-buffer 流程，不能据此宣称统一视口或总体编辑器审计完成。

## 2026-08-03 current batch: discoverable Effekseer sample

Completed:

- Added `samples/effekseer-fire`, a standard editor project with a directly
  openable scene and the minimal dependency closure for the official CC0
  `ef_fire01.efkefc` effect.
- Added `npm.cmd run sample:effekseer`, root/sample documentation, a native
  dependency and draw-call inspection example, a runtime real-asset rendering
  regression, and a CLI packaging regression.
- Fixed the Effekseer build script so vendored CMake source lists work with
  both LF and CRLF checkouts on Windows.

Verified boundaries and remaining work:

- This sample proves effect loading, dependency enumeration, CPU evaluation,
  RHI primitive generation, scene serialization, and PC package asset closure.
  It is not proof of every Effekseer renderer feature or GPU pixel parity.
- File Material shading, distortion, normal/lighting, advanced alpha and
  flipbook parity, subtractive blending, and exact rotated/directional
  billboards remain the next Effekseer compatibility audit.
- Foreground editor interaction was intentionally not used in this batch;
  a background/headless GPU capture can be added later without taking focus.

## 明确未完成或仍需继续审核

以下项目保持未完成状态，后续不得因为相邻能力已通过测试而宣称整体编辑器完成：

1. Text：字体 fallback 列表、连字、双向文本、Unicode Script shaping，以及与 TextCore/TMP 的完整差异审计。
2. CanvasRenderer / Graphic：Unity `materialForRendering` modifier 链、多材质槽、外部自定义 Mesh API；Editor 的 TypeScript Canvas 对自定义 UI Shader 仍是近似预览，真实 WGSL 只在 Player 执行。
3. Layout：LayoutGroup、LayoutElement、Image/Text intrinsic preferred size、宽度相关 Text 两阶段测量、嵌套组递归指标，以及内建 fitter 轴所有权已对齐 Editor/Runtime；仍需审计自定义多个布局提供者优先级、RawImage 尺寸契约和病态循环依赖的作者诊断。
4. 高级控件：InputField 已具备浏览器原生键盘、选区、粘贴和 IME 输入桥，但可视 caret/selection、内容类型验证、移动端软键盘和完整事件生命周期仍待审计；Dropdown、ScrollView、ListView、TabView 等复合控件仍需继续审计 Unity 模板引用、导航、选中状态、滚动惯性和事件生命周期。
5. 原生编辑器视口：Editor 内仍以 Canvas2D 作者预览为主，原生 wgpu Surface 嵌入、DPI、多显示器、失焦/遮挡和真实 GPU 像素一致性需要单独完成与验证。
6. AI Agent：已有后台安全协议与全窗口采集回归；仍需在真实锁屏、窗口销毁竞态、超大多窗口工作区和长时间连续运行条件下做生产级稳定性审核，并继续保证不抢前台焦点。
7. 跨平台与发行：macOS/Linux 桌面行为、代码签名/公证、安装器签名、远程构建与完整发布治理仍不在已完成证明内。
8. 整体编辑器：Animation/Animator、材质、粒子、音频、Prefab、构建发布、Profiler 等虽已具备大量基础与扩展能力，仍需按模块建立当前代码证据、真实运行证据和缺口表；本文件不是最终完成证明。

## 后续审核规则

- 每一批先读取当前工作区与测试覆盖，再确认真实缺口；历史技术记录只作定位，不作当前完成证据。
- 每个能力必须同时核对作者数据、Inspector/Agent schema、Editor 预览、Runtime/Player、CLI/构建依赖和旧资产兼容；不适用的链路要明确记录原因。
- Canvas 与窗口能力优先增加无焦点、无窗口测试；需要视觉结论时使用后台安全的页面/Player 捕获，禁止以组件状态代替像素证据。
- 完成一批后更新本文，记录完成项、验证门禁、已知边界和下一审计入口；只有全目标逐项具有当前证据时，才能把总目标标记完成。
