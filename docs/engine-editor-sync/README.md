# 引擎与编辑器主干同步

Author: MiYu

将 Frostbound 开发所需的通用引擎、编辑器、API 与 CLI 功能同步到完整工程主干 `master`，基于 `b287f55` 保留主干已有的项目 storage、打包姿态校验及来源缓存。

包含场景层级分组/折叠/列表虚拟化、视图空间裁剪与原生世界复用，父子激活/批量脚本命令、共享世界快照、原生 Play 所有权与桥接成本优化，地形网格、采样模型效果、骨骼姿态速率、抗锯齿及 UI 布局修复。姿态引用 `#pose=clip:frame@rate` 在 CLI、运行时和资产解析器中保持相同边界，GLB/GLTF 扩展名大小写均受支持。

通用新增测试使用 crate 内 fixtures，主干不依赖 Frostbound 的大型游戏资产；已有主干样例与共享资产库保持不变。游戏与引擎改动分别提交，避免将游戏分支整个合并到主干。

验证：Rust workspace 13 个库测试二进制串行运行，549 通过、0 失败、4 忽略；CLI 72/72，编辑器 1,032/1,032；API、behaviour、agent 与 editor 构建通过；runtime 非法姿态打包校验通过。Windows GPU 测试采用单线程执行。性能基准见 `snapshot-world-benchmark.json`，结构化统计见 `validation.json`。

本地独立编辑器构建使用 `npm.cmd run build:editor:desktop`；仅编译已有 Web 产物时使用 `cargo build --release -p mengine-editor-tauri --features custom-protocol`。`custom-protocol` 使程序加载内置前端，独立运行不依赖 Vite 开发服务器。

最终独立 Release 编辑器的原生集成复验通过：Frostbound 工程打开与 8 次 Scene 视角移动、迫击炮 82 步生产/升级/攻击/照明弹操作，0 控制台与材质错误。构建二进制 SHA 记录在 `validation.json`。
