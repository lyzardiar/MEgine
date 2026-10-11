# Frostbound 工程加载与编辑性能

Author: MiYu

主要模型池按地图实例与模型实际部件数创建，Scene/Game 原生世界复用未变实体。初始场景从 22,370 个实体降到 8,973 个，根节点保持 8 个分组。层级列表继续使用可见行绘制，视图继续使用空间裁剪。

原场景有 20,419 个 inactive 实体：Unit、Missile、Scenery、Prop、Doodad、Objective 按全局最大容量和最大模型部件数预建，备用对象也参与场景导入、快照复制及世界同步。现在每类只保留两份模板，运行时由地图内容和可见模型驱动创建；节点按类型及 32 槽分组，延期命令确认后才显示，并处理命令丢弃后的重试。

| 测量 | 修改前 | 修改后 | 范围 |
|---|---:|---:|---|
| 初始实体数 | 22,370 | 8,973 | 同一 authored 内容 |
| Store 解析/导入中位数 | 36.50 ms | 13.43 ms | 20 次、2 次预热；不含 React、IPC、GPU、资产扫描 |
| 原生世界同步中位数 | 54.38 ms | 11.63 ms | 同一 8,973 实体、Release 20 次；不含共同 snapshot clone、IPC、GPU |
| 原生 Scene 世界同步均值 | 23.63 ms | 12.49 ms | before/after 各两次打开，8 次视角移动/次 |
| 工程打开实测 | 7.25 / 13.02 s | 6.17 / 6.10 s | 复用同一资产副本与 Release Editor；缓存已预热 |

`Assets/Maps/*.json` 是发布地图配置。构建器读取、校验并打包八张地图，菜单预览和默认单机入口使用该目录的数据；游戏运行时按地图对象生成主要模型节点。修改发布 JSON 后执行 `node scripts/build-frostbound.mjs` 更新脚本包；游戏地图编辑器的保存/加载继续使用工程 storage。初始化场景保留 UI、地形视图和部分固定特效池，并未彻底移除所有备用节点。

验证：178 个模块及入口主体累计 471 条不同 PASS；地图配置接入后复查运动、树木倒落、迫击炮客户端和动态池。原生项目四次打开、32 次视角移动、窗口截图和 Game 帧通过；最终脚本的迫击炮生产、升级、攻击与照明弹原生验收通过。11 个构建产物逐字节可复现，3,221 个已跟踪材质均有 meta。

报告位于本目录 `scene-loading-performance.json`、`scene-loading-regression.json`、`scene-loading-store-benchmark.json`、`snapshot-world-benchmark.json`、`native-scene-loading-qa.json` 和 `native-scene-loading-mortar-game-qa.json`。原生截图为 `scene-loading-native-scene.png`、`scene-loading-mortar-native-{training,artillery,flare}.png`。

工程打开仍包含资产扫描、IPC 和启动成本。两次配对打开只用于诊断；桥接调用和窗口捕获等待影响呈现间隔，不能据此承诺前台 60 FPS。

主干最终独立 Release 编辑器复验通过：迫击炮 82 步，0 控制台/材质错误；工程打开 6.21 s，Scene 8 次视角移动通过，原生世界同步均值 12.21 ms。最终二进制 SHA 与报告一致，详见 `native-scene-loading-4.json`。
