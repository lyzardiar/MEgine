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

W011 已按原版状态机修正 `or` 高于 `and`、两者右结合，整数字面量按原版十进制/八进制/十六进制回绕预编译到 AST。245 组表达式组合与原版移进/归约指令一致；591 个整数的回调位型及原版 lexer 分类/边界一致。5 项新夹具与9项受影响的语法检查通过，DotA 最小产品集成退出 0，无 Game.dll。证据为 `jass/frontend-*`，具体受控边界见 `jass.md`；本项未重复数值四则、GUI、旧引擎或全量资产检查。

W012 原生 Runtime 已执行自编脚本：显式帧/槽位/稀疏数组、流程、短路、code 重入、I2R/R2I 与有类型的 native 边界已接入。W010–W012 在 `d1afdb3` 合并验证通过，语法9／Module9／frontend5／Runtime13，共36项、0失败；Amazonia／BootyBay／DotA 分别编译21,086／19,785／370,552条指令，均无Game.dll、initialized=false。5组字符串及268组Rawcode原版对照、245组解析结构与591个整数对照按当前夹具摘要一致复用。证据为 `jass/batch-runtime-*`、`batch-w010-w012.json`，本批关闭脚本基础范围；原版完整运行/玩法继续在总矩阵中待实现。

W013新增ScriptSession：公共/地图全局初始化、配置native和Group/Timer/Trigger状态已接入。DotA配置保留10名额/10队伍记录，槽位1–5/7–11分别属队伍0/1，出生点0–9，3个Group、4个Timer、1个Trigger。7项session检查及44枚举/GetHandleId的2,925次原版指令对照通过，已纳入W013–W015合并结果。句柄/默认值未覆盖边界见 `session.md`，证据为 `jass/session-*`。

W014接入单个后台选图线程和配置会话：独立归档/解码器、最新待处理选择、过期结果丢弃及失败清空；GPU/FDF保持界面线程更新。玩家草稿消费脚本控制/队伍/颜色/种族及锁定，保留源ID/势力；修改本地玩家、AI、占槽、种族、颜色、队伍及障碍值写回原会话。4项setup和包含原11项/新增3项的14项D3D9界面检查已合并通过；同图保留草稿，配置错误可恢复。证据见 `jass/setup-*`、`map-menu/setup-*` 及本批world目录。

W015 `a07fcab`建立World，选图/配置在globals前挂接W3E/WPM；21个空间/相机/环境native保存实际会话状态。7项world与195组坐标/77组相机整数的原版指令比较通过。`--main-check`接入真实main和阶段/失败限制；Amazonia写入相机、昼夜模型、水色及1个矩形后在AddWeatherEffect失败，BootyBay/DotA在NewSoundEnvironment失败，均退出1、无Game.dll，完整main未完成。环境尚未交给渲染器，不能将状态写入当成地图效果已经显示。

W013–W015在 `a07fcab` 合并验证已实现范围：本次session7/setup4/browser14共25项通过，复用未变化的world7项，合计32通过、0失败；三图globals/config均退出0，产品菜单导航分别104/104/110帧通过，无Game.dll。已核对夹具/元数据摘要后复用272次世界和2,925次枚举原件对照；未重复旧JASS、引擎或资产全量检查。三图完整main失败与UI/玩法总矩阵保留待实现，下一批W016从真实声音环境继续。证据为 `tmp/docs-artifacts/war3/world/batch-*`、`batch-w013-w015.json`，细节见 `testing-batches.md`、`world.md`。

W016新增共享归档视图：同根公共句柄/64MiB缓存共享并加锁，fork共享地图挂载/16MiB缓存而独立切图；World保留资源视图供加载后继续读成员，最后地图视图释放缓存。7项归档定向检查和DotA产品108帧导航通过，无Game.dll。新批次1/3，未重跑旧全量检查；声音/模型消费与持续切图仍待合并验证，见 `archives.md`，证据为 `audio/archive-*`。

W017建立共享Miles设备、WAV/MP3与标准MIDI转XMIDI/DLS后端；菜单音乐也使用共享设备，声音/音色库/转换缓冲保留正确源字节寿命。7项真实Miles定向检查通过，包括原MIDI/DLS双sequence共享库、状态/时间推进、暂停/恢复/定位/结束和并发重开；产品带音乐菜单60帧通过、无Game.dll。当前批次2/3，测试用零音量，听感/3D环境效果待验收。声音native尚未绑定，完整main仍停在天气/声音环境。边界与源调用见 `audio.md`，证据为 `audio/miles-*`。

W018接入SYLK常量表、原MIDI/环境定义及10个sound native，声音持有实际Miles资源，支持零渐变率播放控制、查询、通道抢占及退役/独立播放寿命；`--mute`在globals/config前传入。6项定向检查通过。BootyBay/DotA真实main已登记Default环境并创建1个MIDI/DLS声音，随后均在 `Scripts\Blizzard.j:1224:12` GetFloatGameState失败，无Game.dll、main未完成。非零渐变显式报错，环境3D效果未应用。当前3/3，提交后合并验证；边界见 `script-sound.md`，证据为 `audio/sound-*`。

接续为GameState时间变量、声音渐变/环境效果、Music及天气/单位native。已查得时间状态2的引用/求值路径 `0x6f2676d0`/`0x6f03adf0`，初值/推进尚未核对；保持未绑定，不填推测初值。SetAmbientDaySound/SetAmbientNightSound继续沿用Blizzard.j。后续载入界面、地形/对象渲染、AI与可玩流程、开局时序/随机数/调度和句柄一致性均未完成。来源见 `audio.md`、`script-sound.md`，原始证据在 `tmp/docs-artifacts/war3/audio/`。

菜单已连接单人、自定义游戏、玩家草稿、取消和退出；开始游戏尚未接入。草稿保持当前选图会话，不写设置存档；原版默认AI与JASS config覆盖时序尚未完成对照。颜色网格、组间距、logo精确比例、灯光／雾／粒子、完整FDF控件、动态布局像素、标题截断/列表行高/认证图标、MDL与完整节点规则仍需实现或核验。四族、战役、存档／回放、局域网、OpenGL均未完成。普通启动的 `--map` 定位选图偏好，进入选图后执行globals/config，probe检查原生记录，script-check构建脚本语法树、解析类型/符号并编译指令，都不表示已能运行地图。

完整直接加载验收前不清理旧地图解包缓存；保留 sample 的 `.mengine/`、孤立 `asset-sources.json.meta` 和五个 `.frost-worker-*.mjs`，不纳入本次源码提交。不关闭或重启用户编辑器。
