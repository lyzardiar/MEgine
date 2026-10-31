# 原生地图与选图流程

W3I18/25、W3E11、WPM0 和 WTS 的布局沿用仓库已核对的经典格式，参考 [flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer) 固定提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。上游 MIT 许可证保存在仓库根目录 `third_party/warcraft-map-format/LICENSE`；源数据与原安装归属独立。原生读取器为 `src/map.cpp`，不依赖旧 Python/Rust 实现运行。

读取器保留玩家、势力、随机单位/物品表、科技限制、加载文字、雾、相机、原始角点与路径格。WTS 只替换完整 TRIGSTR 标识；省略编辑器尾表的已分发地图显式记录 `omittedEditorTables`。版本、计数、字节边界、有限浮点、玩家 ID 和路径尺寸均检查。读取失败应保留原选图界面和错误信息，不让部分数据进入会话。

原版入口依次为 `MainMenu/SinglePlayerButton`、`SinglePlayerMenu/SkirmishButton`、`Skirmish`。单人模式快捷键 S，自定义游戏快捷键 G，开始游戏快捷键 S，取消为 A。原版 FDF 定义 `MapListContainer` 与 `MapInfoPaneContainer`，Game.dll 在 `0x6f2b8f04`、`0x6f2b907a` 查找这些容器，再通过 `0x6f0bd750` 挂接动态控件。REA 静态证据与原版 FDF 存于 `tmp/docs-artifacts/war3/map-menu/`，不能替代原版运行对照。

目录列表按需枚举当前层的文件夹、w3m 和 w3x，不扫描或解包全部地图；公共 MPQ 使用进程内共享缓存。地图数据从 StormLib 内存读取，不生成转换工程。地图元数据解析、可视化与完整 JASS 初始化/玩法分别验收。

GlueScreen 支持把原版 FDF 根控件挂到既有容器、设置可见性、源坐标矩形、运行时文本和内存图像。文字按原版字体测量，支持颜色转义、换行、对齐及边界裁剪；测量不分配 GPU 纹理。仍只支持已消费的 FDF 子集，完整锚点/控件规则和原版逐帧一致性待验收。

`MapBrowser` 消费原版 `SinglePlayerMenu.fdf`、`Skirmish.fdf`、`MapListBox.fdf`、`MapInfoPane.fdf` 与按钮/滚动条/目录图标 BLP。只在选择文件时读取其 W3I、WTS 和预览图，不为每一行解包归档。切选释放旧预览，异常地图清空元数据、玩家草稿和预览，保留目录浏览并记录错误。目录支持鼠标、双击文件夹、滚轮、方向键、翻页、Home/End、Enter 和 Backspace；开始游戏仍待会话模块实现。

普通启动的 `--map` 仅定位选图偏好，菜单始终从公共归档读取；probe 模式才挂载指定地图并检查完整源记录。动态布局的实际像素、标题截断、列表行高、认证图标、玩家槽和原版菜单过渡仍需继续对照，不能把当前选图帧记为 UI 完全一致。

## 原版地图展示规则

`src/map_ui.cpp` 从 `UI\MiscUI.txt` 的 FontHeights 读取 MapListBoxItem=0.013、MapListBoxMaxPlayers=0.009，从 `UI\WorldEditData.txt` 读取 MapSizes 和 TileSets，从 `UI\WorldEditGameStrings.txt` 的 WorldEditStrings 解析中文标签。尺寸类别按完整地形宽×高与 Size00–Size05 的面积阈值比较；W3I 的可玩尺寸加四侧补边恢复完整尺寸，三张代表地图已与 W3E 逐项核对。UI 人数采用类型 1 的用户槽，游戏定义仍保留计算机槽。

地图列表只按需读取可见文件的前 512 字节，保留 HM3W 名称、flags 和人数，按 flags 的 0x4 位使用原版 melee／ums 图标；无包装头时保留文件名。每个目录缓存已读头部，进入其他目录时释放；文件选中后才打开其 MPQ 成员。元数据与预览不写入解包目录。

信息面板使用原版运行时锚点：缩略图 TOP 对面板 TOP，Y=-0.0325；第一行 TOP 对缩略图外框 BOTTOM，Y=0.0115；尺寸、地形行间距 0.002，说明标签间距 0.008。说明区高度 0.103125 由 Skirmish 初始化路径给定。标题行按测量宽度、两侧图标及 0.0025 间隔计算偏移，字形测量和实际像素仍需 GPU 对照。

行为依据为固定 Game.dll 的 `0x6f2b3f50`（面板布局）、`0x6f2de920`（行锚点）、`0x6f2b3d06–0x6f2b3ddb`（标题位置）、`0x6f701fe0`（尺寸类别）、`0x6f702230`（地形名称）及 Skirmish 的 `0x6f2b90ab`。REA 原始记录在 `tmp/docs-artifacts/war3/map-menu/map-ui-*-rea.json`。

`tools/verify_map_ui_cpu.py` 使用固定摘要的原件在 Unicorn 中执行上述布局和算术指令，与 C++ 导出的规则逐项比较。帧边界、可见性、锚点接收、配置、字符串格式化与 cookie 检查由探针提供；原生游戏不加载 Game.dll。已验证 5 条锚点、40 组标题位置及 64 组尺寸类别，不能据此宣称字体像素、输入或玩法与原版一致。开发检查依赖 Python 的 pefile、Unicorn 及仓库 MPQ 读取器，不是游戏运行依赖。

## 战役载入背景

载入界面按地图 W3I 背景编号读取公共归档 `UI/WorldEditData.txt` 的 `LoadingScreens` 行，使用其中的原模型和动画序列；地图显式指定的载入模型优先，未指定背景的普通对战按玩家种族选择原多人载入模型。标题、说明和副标题使用地图 W3I／WTS，背景编号有效时启用自定义文字面板。

本机 1.27 的 `War3Patch.mpq` 中该表 SHA-256 为 `0c29dcfc58d02c2a227d3549e8da06ddd7ee046c70138c5782ba17daec9a93a4`。人族第一、二章分别选择 Lordaeron 模型的 `Human01`／`Human02` 序列；原模型和首章序列已在 CPU 路径读取。实际画面、原版过渡以及 W3I 序章界面仍需实现或核对。

## 键盘焦点

已接入按钮消费 FDF 的 TabFocusDefault 和 TabFocusNext。焦点链跳过禁用和隐藏控件，支持反向 Tab、Enter 与 Space；循环和缺失链接有遍历上限。选图列表与玩家控件使用同一焦点树，列表 Enter 只进入所选目录；按钮动作在当前画面绘制完成后交给菜单状态处理。弹层使用独立输入与绘制顺序，Esc 先关闭弹层，静止鼠标不覆盖键盘选项，点击和滚轮不会落入背后列表。编辑框及其他控件的完整焦点语义仍待接入。

## 玩家配置草稿

`src/setup.cpp` 保留 W3I 玩家 ID、原记录和完整 forces；类型 1／2 显示为玩家槽，其他类型保留在 MapInfo。草稿将首个类型 1 作为本地槽，其他类型 1 设为开放，类型 2 设为中等计算机。单人近战选图时，若没有其他队伍的已启用玩家，将首个其他队伍的开放槽设为中等计算机；玩家可继续修改该槽。固定设置和自定义势力地图不应用这一默认值。原版单机默认 AI、用户配置与 JASS config 的覆盖次序仍需对照。DotA 的槽 ID 为 1–5、7–11，本地 ID 为 1，不能把列表行号当作玩家 ID。

BootyBay 的当前 Release 隐藏窗口复现中，默认对手接入前原地图脚本在开局后显示胜利对话框；接入后 300 帧画面未出现该对话框，启动日志记录 71 个单位。配置专项 6/6 通过，覆盖默认槽、手动修改、自定义地图、固定设置和已有电脑；实际鼠标、其他地图、AI 完整对局及原版默认行为仍待验证。证据保留在 `tmp/docs-artifacts/war3/bootybay-{current,opponent}-1030.*`。

本地槽可移到其他类型 1 的槽，始终保持一个本地控制者；类型 2 只允许计算机难度。开放/关闭的槽不可编辑种族、队伍、颜色和障碍。flags 的 0x20 固定种族和颜色，0x40 保留源 force 掩码与分组并固定队伍。颜色 0–15 选择占用项时交换；障碍范围为 50%–100%，间隔 10%。未归入任何源 force 的槽不并入已有势力。草稿不改写源地图，不执行 JASS，也不证明对局规则已实现。

`src/player_setup_ui.cpp` 将源 TeamSetup 挂到 TeamSetupContainer，预建 16 个带上下文的 PlayerSlot，切图复用这些节点。解析器保留重复 MenuItem，实例只重写局部锚点和控件引用；普通 Text 和外部锚点保持原值。名称、种族和障碍使用原版 popup 背景、箭头、菜单行高与标签，颜色直接读取 `ReplaceableTextures\TeamColor\TeamColor00.blp` 至 `15.blp`。行高沿用 FDF 的 0.025，超出可视区以滚轮查看，不压缩行。颜色选项使用原 TeamColorMenu 背景和原版行高／边距，16 色范围、滚动条和色块像素仍待原版对照，见[颜色选择菜单](map-color-selector.md)；组标题间距和最终像素仍待还原。

原件绑定字符串为 RaceMenu `0x6f979d64`、HandicapMenu `0x6f979dd0`、TeamButton `0x6f979d70`、ColorButton `0x6f979d9c`、TeamSetupContainer `0x6f983218`。REA 原始记录为 `tmp/docs-artifacts/war3/map-menu/player-slot-bindings-rea.json`；具体控件和选项取自只读原安装中的 PlayerSlot.fdf／TeamSetup.fdf，不把这些字符串引用视为默认对局行为证据。

原版内联文字颜色由 `0x6f0d8780` 解析，`0x6f0d8948` 将 alpha 固定为 255，再由 `0x6f029c80` 打包 RGB。`inlineTextColor` 使用同一规则，支持 `|c`／`|C` 和八位十六进制颜色；不把 `|c00` 误作透明文字。FDF 的 FontColor 透明度独立处理。`tools/verify_text_color_cpu.py` 在 Unicorn 中执行原版解析与打包指令，与 C++ 输出比较 32 组合法颜色；ASCII 解码与两位十六进制 strtol 由探针提供，不表示非法转义、字形或完整文本行为已一致。先运行地图专项生成 `text-color-native.json`，再从仓库根目录运行该脚本；证据写入 `tmp/docs-artifacts/war3/map-menu/text-color-cpu.json`。

## 开局队伍与联盟

单机与实验局域网在最终玩家配置应用后，为同队的已启用玩家及地图声明的中立／可救援玩家建立双向基础盟友关系。开放／关闭槽和 12–15 中立特殊槽不因队伍编号默认值而结盟；地图 `config` 中逐位调用的 `SetPlayerAlliance` 优先于初始化，重新应用玩家草稿会重新计算未显式设置的关系。自定义 force 的共享视野／共享单位／完全控制标志按 W3I `0x04`／`0x10`／`0x20` 接入对应联盟位；共同胜利初始化另待完成。

Human01 原图 `config` 将玩家 1 与玩家 9 分配到队伍 0，原脚本过场包含阿尔萨斯与乌瑟尔对话。修复前两者联盟位均为 0，乌瑟尔在开场杀死阿尔萨斯；修复后静音战役上下文最小检查推进 60 秒，两者生命分别为 650／1250，未触发该失败。证据 `tmp/docs-artifacts/war3/human01-session-probe/baseline.log`、`after.log`。原 Game.dll 的 `IsPlayerAlly` 和 `GetPlayerAlliance` 均读取联盟位而非单纯比较队伍编号，静态指令见同目录 `original-alliance-static.txt`；它们不证明原版开局赋位过程。

同队基础盟友默认值、force 未设置 allied 标志时的原版语义、地图／大厅及脚本覆盖时序、复选与共同胜利、12–15 号槽和完整双端同步均待原版及真实对局验证；此项不表示完整战役通过。
