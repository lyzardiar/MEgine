# 原生客户端交接入口

2026-10-26。目标仍为 1.27.0.52240 完整客户端，未完成；MEngine 移植尚未开始。

- `cbfbe1a`：独立 C++20／Win32 x86 工程，固定 StormLib、原件只读挂载、有界公共／地图成员缓存、独立参数和用户日志。
- `aa2b3f6`：固定 IJL ABI、BLP1/2 与 TGA 内存解码，原版字体和 Miles 菜单音乐边界。
- `d158fc1`：MDX800 菜单几何、层级、轨道、材质和相机路径；纹理别名按实际来源缓存；开发帧捕获与独立检查入口。
- `9ad11d6`：原版 FDF 模板、中文、布局与退出输入；D3D9Ex 纹理上传和 ResetEx 恢复；MasterFont 字体选择；Miles codec 路径、初始化及版本校验。窗口检查覆盖缩放、最小化恢复、拖入按钮、取消捕获与 Q 退出。
- `eeeb747`：原生 W3I/WTS/W3E/WPM，保留规则表与原始空间数据；当前层地图目录枚举，独立地图专项测试。
- `643f0b7`：FDF 动态控件挂接、可见性、运行时文本/图像和文本换行、对齐、颜色与裁剪。
- `c98f45d`：单人模式与 Skirmish 选图、原版控件/图标/滚动条，任意地图的原生元数据和预览，实际窗口导航检查。
- `970e1bf`：完整设备创建回退、Maps 父目录导航及预览释放。
- `d309e74`：按原版运行时锚点和配置展示地图信息、中文尺寸/地形、可见地图 HM3W 头部和类型/人数；接入按钮 Tab／Shift+Tab、Enter／Space 与列表焦点，完成绘制后再处理菜单动作。
- `e1889bf`：接入原版玩家槽和下拉控件、保留源 ID／势力的配置草稿、统一焦点和弹层输入；同图重复选择保留编辑，失败选择清空部分数据，文字颜色按原版固定 alpha。
- `48eb311`：11 项原生界面定向检查通过，关闭 W004–W006 的基础实现批次，完整 UI/玩法范围继续保留。
- `69d7419`：W007 原生 JASS 公共/地图来源隔离、带源位置的语法树、原 EXE 的无 GPU `--script-check`；8 项定向检查与公共库加 DotA 脚本读取通过。尚不执行脚本。
- `5d1f607`：W008 原始 32 位 Real、I2R 尾数截断、R2I 向零与饱和；695 组 I2R、3,072 组 R2I 与原版指令逐位一致。
- `47a1324`：W009 实数四则、倒数插值系数和十进制 token，AST 实数字面量编译为原版位型；55,296 次算术和 2,061 token 对照通过。
- 旧 5 个 MEngine 遗留源码已在 `5df88b2` 提交推送；161–163 GPU 合并验证继续延期，交接补丁与原始证据保留。

W001–W003 基础批次已关闭，标准 D3D9 与 D3D9Ex 的原菜单帧/窗口恢复、Miles 内存 MP3 状态和释放已有运行证据。本次 Win32 Release 编译通过，地图专项 19 项、基础 CPU 13 项均通过、0 失败；三图独立读取器比对和产品 probe 沿用原有效结果。

Windows 会话 1 已恢复 Active，标准 D3D9 可用。Amazonia、BootyBay、DotA 的实际窗口检查分别运行 104、104、108 帧退出 0，无 Game.dll；原版单人/选图控件、玩家槽、90% 障碍编辑、重复选择保留草稿、Esc 关闭弹层及 S/G/A/Escape/Q 返回均通过。窗口缩放、最小化恢复、拖入/取消捕获检查 92 帧通过。证据前缀为 `tmp/docs-artifacts/war3/map-menu/player-setup-`，不存在仍在运行的检查进程。

W004–W006 的基础实现批次已关闭。`war3_browser_tests` 11 项原生 D3D9 界面检查通过、0 失败：目录双击/Enter/Backspace 返回、坏归档/缺失与截断 W3I 的清空和重试、失效目录恢复、预览 COM 引用释放、弹层阻挡地图点击、名称/种族/队伍/颜色/障碍鼠标选择、本地槽移动、正反向焦点、静止鼠标与键盘/滚轮弹层、16 槽长列表和底部菜单、固定设置与草稿重绑。证据为 `tmp/docs-artifacts/war3/map-menu/browser-{build,tests}.log`、`browser-tests/browser-results.json`。这些检查直接输入 UiInput 并实际绘制，不替代此前产品 HWND 导航；两部分证据合并覆盖本批基础路径。

字体、组布局、颜色网格、菜单过渡和完整像素仍在功能矩阵中待还原。批次关闭不表示地图初始化或对局已能运行。

文字内联颜色遵循原版解析器，忽略源 token 的 alpha 并固定为 255；DotA 的红/绿势力名和说明颜色已正常绘出。原版指令与 C++ 的 32 组颜色对照通过；修复后只重跑受影响的 DotA 导航，108 帧通过，其他未受影响结果沿用。证据为 `text-color-{parser-rea.json,cpu.json,cpu.log}` 及更新的 DotA 帧，地图保持只读。

原版指令与 C++ 规则对照的 5 条锚点、40 组标题位置、64 组尺寸类别通过，记录为 `tmp/docs-artifacts/war3/map-menu/source-ui-{tests.log,cpu.json,cpu.log}`。本次原生规则夹具摘要不变，复用该 CPU 对照结果；不据此宣称字形或完整 UI 一致。

构建／启动见项目 README；行为依据见 `rea-boundaries.md`，范围见 `acceptance.md`，命令及结果见 `testing-batches.md`。原始诊断、REA JSON、临时夹具、日志与 PNG 都位于仓库根目录 `tmp/docs-artifacts/war3/`，不提交快照或原版资源。

W007–W009 的语法与数值批次已关闭：9 项 JASS 检查通过，三图脚本装配/实数字面量预编译均退出 0、无 Game.dll；三图声明数与独立文本计数一致。Amazonia/BootyBay/DotA 的预编译实数分别为 569/428/4,687，来源成员为根 war3map.j／根 war3map.j／Scripts\war3map.j。证据为 `tmp/docs-artifacts/war3/jass/batch-{jass-tests.log,amazonia.log,bootybay.log,dota.log,w007-w009.json}`，已通过且未变化的数值差分沿用。

W010 类型与符号解析已接入产品 `--script-check`：Module 拥有 AST、handle 继承和函数/局部槽表，表达式与 set 目标保存直接索引，诊断包含源位置。Win32 Release 编译、9 项定向检查和 DotA 原脚本的最小产品集成通过，无 Game.dll；证据为 `tmp/docs-artifacts/war3/jass/module-{build.log,tests.log,dota.log}`。三图合并、跨源诊断及后续执行层消费待批次验证。原版完整类型规则、确定赋值、全部路径返回与 constant 纯度尚未完成核验。

W011 已按原版状态机修正 `or` 高于 `and`、两者右结合，整数字面量按原版十进制/八进制/十六进制回绕预编译到 AST。245 组表达式组合与原版移进/归约指令一致；591 个整数的回调位型及原版 lexer 分类/边界一致。5 项新夹具与9项受影响的语法检查通过，DotA 最小产品集成退出 0，无 Game.dll。证据为 `jass/frontend-*`，具体受控边界见 `jass.md`；W010–W012 当前 2/3，未重复数值四则、GUI、旧引擎或全量资产检查。

接续工作为字符串语义、原版短路/调用次序和执行栈，再实现 native 绑定，连通地图 config/main、载入界面、会话、地形/对象、AI 和可玩流程。底层 Real 除法与 VM 零除策略保持分层，不能用数值函数结果代替脚本错误路径；未绑定的 native 应显式失败并保留源位置，不能返回默认值伪装执行成功。语法树保留源文本并预编译整数/实数位型，当前没有执行 globals initializer 或 config/main。来源和边界见 `jass.md`，原始证据在 `tmp/docs-artifacts/war3/jass/`。

菜单已连接单人、自定义游戏、玩家草稿、取消和退出；开始游戏尚未接入。草稿默认 AI、配置持久化及 JASS config 覆盖顺序尚未对照；颜色网格、组间距、logo 精确比例、灯光／雾／粒子、完整 FDF 控件、动态布局像素、标题截断/列表行高/认证图标、MDL 与完整节点规则仍需实现或核验。四族、战役、存档／回放、局域网、OpenGL 均未完成。普通启动的 `--map` 只定位选图偏好，probe 检查原生记录，script-check 构建脚本语法树并解析类型/符号，都不表示已能运行地图。

完整直接加载验收前不清理旧地图解包缓存；保留 sample 的 `.mengine/`、孤立 `asset-sources.json.meta` 和五个 `.frost-worker-*.mjs`，不纳入本次源码提交。不关闭或重启用户编辑器。
