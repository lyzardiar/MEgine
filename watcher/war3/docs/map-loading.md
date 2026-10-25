# 原生地图与选图流程

W3I18/25、W3E11、WPM0 和 WTS 的布局沿用仓库已核对的经典格式，参考 [flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer) 固定提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。上游 MIT 许可证保存在仓库根目录 `third_party/warcraft-map-format/LICENSE`；源数据与原安装归属独立。原生读取器为 `src/map.cpp`，不依赖旧 Python/Rust 实现运行。

读取器保留玩家、势力、随机单位/物品表、科技限制、加载文字、雾、相机、原始角点与路径格。WTS 只替换完整 TRIGSTR 标识；省略编辑器尾表的已分发地图显式记录 `omittedEditorTables`。版本、计数、字节边界、有限浮点、玩家 ID 和路径尺寸均检查。读取失败应保留原选图界面和错误信息，不让部分数据进入会话。

原版入口依次为 `MainMenu/SinglePlayerButton`、`SinglePlayerMenu/SkirmishButton`、`Skirmish`。单人模式快捷键 S，自定义游戏快捷键 G，开始游戏快捷键 S，取消为 A。原版 FDF 定义 `MapListContainer` 与 `MapInfoPaneContainer`，Game.dll 在 `0x6f2b8f04`、`0x6f2b907a` 查找这些容器，再通过 `0x6f0bd750` 挂接动态控件。REA 静态证据与原版 FDF 存于 `tmp/docs-artifacts/war3/map-menu/`，不能替代原版运行对照。

目录列表按需枚举当前层的文件夹、w3m 和 w3x，不扫描或解包全部地图；公共 MPQ 使用进程内共享缓存。地图数据从 StormLib 内存读取，不生成转换工程。地图元数据解析、可视化与完整 JASS 初始化/玩法分别验收。

GlueScreen 支持把原版 FDF 根控件挂到既有容器、设置可见性、源坐标矩形、运行时文本和内存图像。文字按原版字体测量，支持颜色转义、换行、对齐及边界裁剪；测量不分配 GPU 纹理。仍只支持已消费的 FDF 子集，完整锚点/控件规则和原版逐帧一致性待验收。

`MapBrowser` 消费原版 `SinglePlayerMenu.fdf`、`Skirmish.fdf`、`MapListBox.fdf`、`MapInfoPane.fdf` 与按钮/滚动条/目录图标 BLP。只在选择文件时读取其 W3I、WTS 和预览图，不为每一行解包归档。切选释放旧预览，异常地图保留目录浏览并记录错误。目录支持鼠标、双击文件夹、滚轮、方向键、翻页、Home/End、Enter 和 Backspace；开始游戏及玩家槽配置仍待会话模块实现。

普通启动的 `--map` 仅定位选图偏好，菜单始终从公共归档读取；probe 模式才挂载指定地图并检查完整源记录。动态信息面板的精确布局、地图行名称/分类、地形名称本地化、玩家槽和原版菜单过渡仍需继续对照，不能把当前选图帧记为 UI 完全一致。
