# 原生地图与选图流程

W3I18/25、W3E11、WPM0 和 WTS 的布局沿用仓库已核对的经典格式，参考 [flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer) 固定提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。上游 MIT 许可证保存在仓库根目录 `third_party/warcraft-map-format/LICENSE`；源数据与原安装归属独立。原生读取器为 `src/map.cpp`，不依赖旧 Python/Rust 实现运行。

读取器保留玩家、势力、随机单位/物品表、科技限制、加载文字、雾、相机、原始角点与路径格。WTS 只替换完整 TRIGSTR 标识；省略编辑器尾表的已分发地图显式记录 `omittedEditorTables`。版本、计数、字节边界、有限浮点、玩家 ID 和路径尺寸均检查。读取失败应保留原选图界面和错误信息，不让部分数据进入会话。

原版入口依次为 `MainMenu/SinglePlayerButton`、`SinglePlayerMenu/SkirmishButton`、`Skirmish`。单人模式快捷键 S，自定义游戏快捷键 G，开始游戏快捷键 S，取消为 A。原版 FDF 定义 `MapListContainer` 与 `MapInfoPaneContainer`，Game.dll 在 `0x6f2b8f04`、`0x6f2b907a` 查找这些容器，再通过 `0x6f0bd750` 挂接动态控件。REA 静态证据与原版 FDF 存于 `tmp/docs-artifacts/war3/map-menu/`，不能替代原版运行对照。

目录列表按需枚举当前层的文件夹、w3m 和 w3x，不扫描或解包全部地图；公共 MPQ 使用进程内共享缓存。地图数据从 StormLib 内存读取，不生成转换工程。地图元数据解析、可视化与完整 JASS 初始化/玩法分别验收。

GlueScreen 支持把原版 FDF 根控件挂到既有容器、设置可见性、源坐标矩形、运行时文本和内存图像。文字按原版字体测量，支持颜色转义、换行、对齐及边界裁剪；测量不分配 GPU 纹理。仍只支持已消费的 FDF 子集，完整锚点/控件规则和原版逐帧一致性待验收。

`MapBrowser` 消费原版 `SinglePlayerMenu.fdf`、`Skirmish.fdf`、`MapListBox.fdf`、`MapInfoPane.fdf` 与按钮/滚动条/目录图标 BLP。只在选择文件时读取其 W3I、WTS 和预览图，不为每一行解包归档。切选释放旧预览，异常地图保留目录浏览并记录错误。目录支持鼠标、双击文件夹、滚轮、方向键、翻页、Home/End、Enter 和 Backspace；开始游戏及玩家槽配置仍待会话模块实现。

普通启动的 `--map` 仅定位选图偏好，菜单始终从公共归档读取；probe 模式才挂载指定地图并检查完整源记录。动态布局的实际像素、标题截断、列表行高、认证图标、玩家槽和原版菜单过渡仍需继续对照，不能把当前选图帧记为 UI 完全一致。

## 原版地图展示规则

`src/map_ui.cpp` 从 `UI\MiscUI.txt` 的 FontHeights 读取 MapListBoxItem=0.013、MapListBoxMaxPlayers=0.009，从 `UI\WorldEditData.txt` 读取 MapSizes 和 TileSets，从 `UI\WorldEditGameStrings.txt` 的 WorldEditStrings 解析中文标签。尺寸类别按完整地形宽×高与 Size00–Size05 的面积阈值比较；W3I 的可玩尺寸加四侧补边恢复完整尺寸，三张代表地图已与 W3E 逐项核对。UI 人数采用类型 1 的用户槽，游戏定义仍保留计算机槽。

地图列表只按需读取可见文件的前 512 字节，保留 HM3W 名称、flags 和人数，按 flags 的 0x4 位使用原版 melee／ums 图标；无包装头时保留文件名。每个目录缓存已读头部，进入其他目录时释放；文件选中后才打开其 MPQ 成员。元数据与预览不写入解包目录。

信息面板使用原版运行时锚点：缩略图 TOP 对面板 TOP，Y=-0.0325；第一行 TOP 对缩略图外框 BOTTOM，Y=0.0115；尺寸、地形行间距 0.002，说明标签间距 0.008。说明区高度 0.103125 由 Skirmish 初始化路径给定。标题行按测量宽度、两侧图标及 0.0025 间隔计算偏移，字形测量和实际像素仍需 GPU 对照。

行为依据为固定 Game.dll 的 `0x6f2b3f50`（面板布局）、`0x6f2de920`（行锚点）、`0x6f2b3d06–0x6f2b3ddb`（标题位置）、`0x6f701fe0`（尺寸类别）、`0x6f702230`（地形名称）及 Skirmish 的 `0x6f2b90ab`。REA 原始记录在 `tmp/docs-artifacts/war3/map-menu/map-ui-*-rea.json`。

`tools/verify_map_ui_cpu.py` 使用固定摘要的原件在 Unicorn 中执行上述布局和算术指令，与 C++ 导出的规则逐项比较。帧边界、可见性、锚点接收、配置、字符串格式化与 cookie 检查由探针提供；原生游戏不加载 Game.dll。已验证 5 条锚点、40 组标题位置及 64 组尺寸类别，不能据此宣称字体像素、输入或玩法与原版一致。开发检查依赖 Python 的 pefile、Unicorn 及仓库 MPQ 读取器，不是游戏运行依赖。

## 键盘焦点

已接入按钮消费 FDF 的 TabFocusDefault 和 TabFocusNext。焦点链跳过禁用和隐藏控件，支持反向 Tab、Enter 与 Space；循环和缺失链接有遍历上限。选图列表持有独立焦点，Enter 进入所选目录；按钮动作在当前画面绘制完成后交给菜单状态处理。玩家槽、编辑框和其他控件的完整焦点语义仍待接入。
