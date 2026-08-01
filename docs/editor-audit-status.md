# MEngine 编辑器自主审计状态

更新日期：2026-08-01

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

## 明确未完成或仍需继续审核

以下项目保持未完成状态，后续不得因为相邻能力已通过测试而宣称整体编辑器完成：

1. Text：字体 fallback 列表、连字、双向文本、Unicode Script shaping，以及与 TextCore/TMP 的完整差异审计。
2. CanvasRenderer / Graphic：Unity `materialForRendering` modifier 链、多材质槽、外部自定义 Mesh API；Editor 的 TypeScript Canvas 对自定义 UI Shader 仍是近似预览，真实 WGSL 只在 Player 执行。
3. Layout：当前统一 `LayoutGroup` 需要继续对照 Unity Horizontal/Vertical/Grid Layout Group 的 child alignment、control size、force expand、constraint、spacing 和布局重建时序逐项审核。
4. 高级控件：InputField、Dropdown、ScrollView、ListView、TabView 等复合控件需继续审计 Unity 模板引用、导航、选中状态、键盘/IME、滚动惯性和事件生命周期，而不能只以基础绘制/命中通过作为完整证明。
5. 原生编辑器视口：Editor 内仍以 Canvas2D 作者预览为主，原生 wgpu Surface 嵌入、DPI、多显示器、失焦/遮挡和真实 GPU 像素一致性需要单独完成与验证。
6. AI Agent：已有后台安全协议与全窗口采集回归；仍需在真实锁屏、窗口销毁竞态、超大多窗口工作区和长时间连续运行条件下做生产级稳定性审核，并继续保证不抢前台焦点。
7. 跨平台与发行：macOS/Linux 桌面行为、代码签名/公证、安装器签名、远程构建与完整发布治理仍不在已完成证明内。
8. 整体编辑器：Animation/Animator、材质、粒子、音频、Prefab、构建发布、Profiler 等虽已具备大量基础与扩展能力，仍需按模块建立当前代码证据、真实运行证据和缺口表；本文件不是最终完成证明。

## 后续审核规则

- 每一批先读取当前工作区与测试覆盖，再确认真实缺口；历史技术记录只作定位，不作当前完成证据。
- 每个能力必须同时核对作者数据、Inspector/Agent schema、Editor 预览、Runtime/Player、CLI/构建依赖和旧资产兼容；不适用的链路要明确记录原因。
- Canvas 与窗口能力优先增加无焦点、无窗口测试；需要视觉结论时使用后台安全的页面/Player 捕获，禁止以组件状态代替像素证据。
- 完成一批后更新本文，记录完成项、验证门禁、已知边界和下一审计入口；只有全目标逐项具有当前证据时，才能把总目标标记完成。
