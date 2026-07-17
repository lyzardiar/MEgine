# MEngine 原生 Dock、粒子与 Spine 4.3 技术方案

状态：执行基线

版本：2026-07-17

## 1. 目标与验收标准

本轮升级同时解决编辑器窗口模型、特效能力和骨骼动画三条基础能力。

1. Hierarchy、Scene、Game、Inspector（Property）、Project、Console 全部是同一种 Dock 面板。
2. 面板既能在主窗口内合并为页签或按四边拆分，也能通过弹出按钮、拖出主窗口的方式成为操作系统原生窗口；原生窗口可移动到其他显示器，不受主窗口裁剪。
3. 2D/3D 粒子均具有可序列化组件、确定性模拟、编辑器预览、Game 视图渲染和 Inspector 编辑能力。
4. Spine 使用 Esoteric Software 官方运行时 4.3.10，支持 JSON/二进制骨架、atlas、皮肤、动画、循环和播放速度；工程不内置任何第三方示例素材。
5. Spine 导出数据的 major/minor 必须为 4.3；版本不匹配时给出明确错误，不做静默兼容。

## 2. 原生 Dock 架构

### 2.1 面板模型

`PanelDescriptor` 是唯一面板来源，保存稳定 ID、标题、默认尺寸和渲染函数。主窗口 Dock 树只保存布局，不持有业务状态；Scene 和 Game 是两个独立面板，不再作为 `Viewport` 内部的二级页签。

```text
Panel registry
  -> main WebView Dock tree (tabs / horizontal split / vertical split)
  -> detached native WebView window (?detachedPanel=<id>)
```

每个核心面板同一时刻只能存在于一个宿主中。拆出成功后从主 Dock 树删除；独立窗口关闭后向主窗口广播 `panel-closed`，主窗口将面板重新停靠。重置布局会关闭独立面板并恢复默认树。

### 2.2 原生窗口与同步

桌面版通过 Tauri `WebviewWindow` 创建真实顶层窗口，窗口 label 为 `panel-<panel-id>`。浏览器开发模式退化为 `window.open`，但不把浏览器弹窗能力当成桌面验收结果。

各 WebView 的 React store 彼此独立，因此使用同源 `BroadcastChannel` 交换：

- `request-state`：新窗口请求当前场景；
- `scene-state`：场景 JSON、选择集、场景名和单调递增修订号；
- `selection`：轻量选择同步；
- `panel-closed`：独立窗口关闭通知。

消息包含随机 sender ID，接收远端状态时禁止再次广播，避免回环。场景广播按 animation frame 合并，播放状态最多每 33ms 一次。工程磁盘写入仍由既有 Desktop Project Host 负责，BroadcastChannel 只同步编辑会话，不替代持久化事务。

### 2.3 扩展窗口

Unity 风格 `EditorWindow` 注册时同时进入 Dock 面板注册表。可重建的自定义窗口使用稳定 type ID 和工厂函数，因此也能拆到原生窗口；只提供临时 React closure 的旧扩展保留在主窗口并显示迁移警告，避免在新 WebView 中执行不可序列化闭包。

## 3. 粒子系统

### 3.1 组件

新增 `ParticleEmitter2D` 与 `ParticleEmitter3D`。两者共享播放、循环、持续时间、发射率、最大粒子数、寿命、速度、大小、颜色渐变、重力、随机种子、材质混合和模拟空间字段；2D 增加 circle/box、方向、角度和排序层，3D 增加 sphere/box/cone、方向、角度和 billboard。

组件仅保存 authoring 数据；活跃粒子、累计发射小数、随机数状态等瞬时数据存放在运行时 `ParticleWorld`，不进入场景文件和 undo 快照。

### 3.2 模拟

- 固定种子的 xorshift32，保证同一输入得到同一发射序列；
- `dt` 最大钳制到 50ms，过长帧通过子步进避免穿越；
- 发射数量使用小数累加器，不依赖帧率；
- 达到 `max_particles` 时停止发射，不覆盖仍存活粒子；
- 2D 在 XY 平面模拟，3D 在 XYZ 空间模拟；local/world 空间在出生时确定变换语义。

编辑器 Scene/Game 视图与原生 runtime 使用相同字段和同一组确定性规则。Canvas2D 编辑器以批量路径/精灵绘制粒子；原生渲染器把 billboard 粒子转为实例批次，批键至少包含纹理和 alpha/additive 混合模式。

## 4. Spine 4.3 接入

### 4.1 版本与许可

Web 编辑器固定依赖 `@esotericsoftware/spine-canvas@4.3.10`，不使用非官方 `pixi-spine`。依赖及其 `spine-core` 禁止使用浮动版本。发布物必须包含 Spine Runtimes License 和版权声明。

Spine Runtime 的使用和再分发受官方许可约束：MEngine 只提供运行时集成，不附带 Spine Editor 或受版权保护的示例资产。使用者必须满足官方许可条件。

### 4.2 组件与资源

`SpineSkeleton` 保存 skeleton、atlas、animation、skin、loop、playing、time_scale、scale、tint、premultiplied_alpha 和 sorting_order。资源加载器按 atlas 相对路径解析贴图，缓存键包含工程根目录与规范化资源路径。

加载阶段读取 skeleton JSON 的 `skeleton.spine` 字段并校验 `4.3.x`。二进制 `.skel` 交给官方 4.3 runtime 解析；解析失败时在 Console 和视口占位符中同时报告资源路径和错误。

### 4.3 生命周期

每个实体持有独立 `Skeleton` 和 `AnimationState`，共享只读 `SkeletonData`、atlas 和纹理。组件改变动画或皮肤时只重建实例状态；资源路径改变才使共享数据缓存失效。实体删除、工程关闭和 WebView 卸载时释放纹理。

## 5. 执行顺序

1. 拆分 Scene/Game，完成核心 Dock 注册表、原生拆窗、关闭回停靠和跨窗口状态同步。
2. 添加粒子 IDL、代码生成、组件目录、GameObject 菜单、模拟器和编辑器渲染。
3. 接入 Spine 4.3.10、资源加载、组件、Inspector/菜单和许可证声明。
4. 补齐原生 runtime 粒子批处理；Spine 原生发布链路只接受官方 4.3 runtime 数据，不用自制不兼容解析器冒充完整支持。
5. 执行 TypeScript、Rust、IDL/codegen、单元测试、Tauri release 构建和真实多窗口交互验收。
6. 两轮自省：第一轮查功能闭环和异常路径，第二轮查架构重复、资源释放、性能与发布许可。

## 6. 风险控制

- Tauri 窗口权限只开放 editor 自身需要的 create/close/position 能力，不开放 shell。
- 场景同步使用修订号和 sender 去环；磁盘保存仍做 host revision 冲突检查。
- 粒子数量在组件和模拟器双重限制，防止错误配置拖垮编辑器。
- Spine atlas/贴图路径必须限制在当前工程根目录，防止路径穿越。
- 版本、许可或原生运行时未通过验收的能力必须明确标记，不能只在类型层出现就宣称完成。
