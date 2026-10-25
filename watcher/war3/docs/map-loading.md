# 原生地图与选图流程

W3I18/25、W3E11、WPM0 和 WTS 的布局沿用仓库已核对的经典格式，参考 [flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer) 固定提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。上游 MIT 许可证保存在仓库根目录 `third_party/warcraft-map-format/LICENSE`；源数据与原安装归属独立。原生读取器为 `src/map.cpp`，不依赖旧 Python/Rust 实现运行。

读取器保留玩家、势力、随机单位/物品表、科技限制、加载文字、雾、相机、原始角点与路径格。WTS 只替换完整 TRIGSTR 标识；省略编辑器尾表的已分发地图显式记录 `omittedEditorTables`。版本、计数、字节边界、有限浮点、玩家 ID 和路径尺寸均检查。读取失败应保留原选图界面和错误信息，不让部分数据进入会话。

原版入口依次为 `MainMenu/SinglePlayerButton`、`SinglePlayerMenu/SkirmishButton`、`Skirmish`。单人模式快捷键 S，自定义游戏快捷键 G，开始游戏快捷键 S，取消为 A。原版 FDF 定义 `MapListContainer` 与 `MapInfoPaneContainer`，Game.dll 在 `0x6f2b8f04`、`0x6f2b907a` 查找这些容器，再通过 `0x6f0bd750` 挂接动态控件。REA 静态证据与原版 FDF 存于 `tmp/docs-artifacts/war3/map-menu/`，不能替代原版运行对照。

目录列表按需枚举当前层的文件夹、w3m 和 w3x，不扫描或解包全部地图；公共 MPQ 使用进程内共享缓存。地图数据从 StormLib 内存读取，不生成转换工程。地图元数据解析、可视化与完整 JASS 初始化/玩法分别验收。
