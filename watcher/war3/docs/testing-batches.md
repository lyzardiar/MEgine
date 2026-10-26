# 独立客户端测试队列

按用户2026-10-26的要求，先按[集中实现清单](implementation-roadmap.md)覆盖可运行流程，再在功能阶段集中测试修正，源码与待测记录持续提交。必要编译和阻塞问题最小复现及时执行；原件逐项精度检查与回归后置，不运行旧MEngine全量检查。此前三项合并批次保留为历史记录。证据保存在仓库根目录 `tmp/docs-artifacts/war3/`。

| 任务 | 路径 | 验证内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W001 原生程序与归档 | CMake、platform、archive、renderer、main | x86 独立构建、MPQ 覆盖、有界缓存与引用生命周期、无 Game.dll、D3D9/9Ex 绘制与窗口恢复 | 归档错误传播、设备恢复和资源生命周期 | 基础范围通过，批次关闭 |
| W002 图像、字体和音频边界 | image、media、main、rea-boundaries | BLP1/JPEG/palette、BLP2/BC、TGA、原版中文字体、Miles 内存 MP3 | IJL 调用约定、透明平面、codec 路径与 sample 生命周期 | 基础范围通过，批次关闭；音效与听感仍待验收 |
| W003 原版 MDX 菜单场景 | model、model_pose、binary、archive、renderer、main、fdf、glue、tests | MDX800 基础场景、纹理来源、FDF 模板与字符串、真实帧、退出输入 | 不可信记录边界、FDF 预算、菜单按钮输入边界 | 基础范围通过，批次关闭；完整还原留在功能矩阵 |

## W001–W003 批次结果（2026-10-25）

源版本为 `d158fc1` 加本次菜单、设备和音频实现。Win32 Release 构建通过，13 项 CPU 检查通过、0 失败：地图覆盖与共享引用生命周期、纹理别名来源优先级、归档路径与失败挂载、palette 透明度、JPEG 四原始分量、JPEG 三原始分量、BC1/2/3 固定像素、TGA 方向/RLE、图像截断与预算、二进制记录边界、原版 FDF 模板与字符串、UTF-8/UTF-16 BOM、FDF include/继承循环边界。JPEG 常量参考图每通道误差不超过 2。证据为 `foundation-final-build.log`、`foundation-final-tests.log`。

Amazonia、BootyBay、DotA_v6.83d 的归档 probe 均退出 0，无 Game.dll。它们只读取归档成员，不执行地图 JASS、地形构建或对局，不能作为玩法和地图加载性能验收。证据为 `{amazonia,bootybay,dota}-probe.log`、`map-probes.json`。PE 检查为 0x14c x86，仅导入系统 DLL；原版 IJL/Miles 按摘要动态载入。

D3D9Ex HAL 与 reference 实际绘制通过；缩放、最小化恢复、Q 退出通过，最终 1264×921 帧与固定帧逐像素一致。证据为 `foundation-{fixed,window,reference}.{log,png}`、`foundation-runtime.json`。原版菜单读取 18 个 geoset、211 个 node、49 个 texture，解码纹理 11,292,672 字节。字体来自原版 `MasterFont=Fonts\dfst-m3u.ttf`，按钮模板、中文、位置和边框来自原版 FDF；完整视觉还原尚未通过。

Miles 运行状态为 `SMP_PLAYING=4`，采样位置由 12 推进至 1237ms；产品构造/析构探针退出 0，sample、driver、Miles 及 codec 均释放，无 Game.dll。证据为 `audio/music-product-probe.log`、`audio/probe-init1-redist1.log`。尚未对音效和听感作验收。

提交前补充修复按钮按下起点与捕获取消边界，只重建并复测受影响窗口路径，沿用未受影响的 13 项 CPU 结果。此次标准 D3D9 实际运行 92 帧后由 Q 退出，缩放、最小化恢复、从按钮外拖入、取消捕获均通过；未加载 Game.dll。最终帧与同版本固定帧均为 1264×921、逐像素一致，像素 SHA-256 为 `c8a9d3684ebb9b2eb1692c51f389959de33a37a86bfdb615d9b30a1f2d09ca6a`。证据为 `delivery-build.log`、`delivery-{fixed,window}.{log,png}`、`delivery-runtime.json`。

批次仅关闭已实现的基础设施范围。完整 UI、地图会话、音效、持续切图和性能保持 [功能矩阵](acceptance.md) 中的待实现/待验收状态；旧 MEngine 161–163 GPU 批次继续延期，旧转换缓存尚不满足清理条件。

## 复现命令

在 `watcher/war3` 执行：

```powershell
cmake --preset windows-x86 -DWAR3_BUILD_TESTS=ON
cmake --build --preset release --parallel 8
./build/windows-x86/bin/Release/war3_native_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/native-tests"
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --hidden --frames 120 --time-ms 0 --window-check --log "../../tmp/docs-artifacts/war3/delivery-window.log" --capture "../../tmp/docs-artifacts/war3/delivery-window.png"
```

CPU 测试只生成临时夹具 MPQ，游戏运行不生成解包资产。无输入或相关源码变化时不重复执行已通过的检查。

## 下一批队列

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W004 原生地图定义 | map.h/map.cpp、map_tests.cpp、CMake、map-loading.md | W3I18/25、WTS、W3E11、WPM0，代表地图与畸形输入；当前层地图目录排序 | 源记录边界、缺省编辑器尾表、地图间串资源、路径尺寸 | 基础范围通过，批次关闭 |
| W005 动态 FDF 控件与文本 | glue、media、fdf、player_setup_ui | 原版控件挂接、可见性、运行时文字/图像、文本尺寸、换行/颜色/裁剪、玩家草稿与弹层 | 控件名与锚点、长地图文字、D3D 状态恢复 | 基础绘制/交互通过，批次关闭；完整还原留在功能矩阵 |
| W006 单人模式与地图目录 | main、map_browser、platform、glue、renderer、CMake、setup | S/G/A/Escape 导航，任意 w3m/w3x，选择信息/预览、滚轮、目录与错误恢复、无解包 | 菜单资源不受地图覆盖、失效目录、重复切选释放、超长描述、设备创建回退 | 基础范围通过，批次关闭；实际开局待实现 |

W004 定向命令：`build/windows-x86/bin/Release/war3_map_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/map-tests>`。原版格式参考与来源见 `map-loading.md`；CPU 测试不表示原版地图会话已能运行。

本批达到三项，提交后先运行原生地图定向检查、受影响的 FDF 检查及 `--menu-check` 原版路径。导航检查使用实际窗口按键和地图行点击，要求进入选图、读取指定地图并逐级返回；`--window-check` 覆盖窗口恢复与取消捕获。原始证据统一写 `tmp/docs-artifacts/war3/map-menu/`，不执行旧 MEngine 全量验证。

## W004–W006 批次结果（2026-10-26，未关闭）

集成范围 `eeeb747`、`643f0b7`、`c98f45d` 及本次补充修复。Win32 Release 编译通过。原有 CPU 13 项通过、0 失败；地图 CPU 10 项通过、0 失败，包含完整经典尾表、省略尾表、WTS、源角点/路径位、截断/版本、目录排序、单人/选图 FDF 定义以及三张真实地图。证据为 `map-menu/native-tests.log`、`map-tests.log`、`batch-final-build.log`。

三图元数据由独立 Python 读取器交叉核对：Amazonia 为 W3I25、97×97 角点、2 玩家、1 势力；Booty Bay 为 W3I18、193×97、2 玩家、1 势力；DotA v6.83d 中文版为 W3I25、129×129、10 玩家、2 势力，显式省略编辑器尾表。独立结果见 `independent-map-records.json`。产品三图 `--probe` 均退出 0、无 Game.dll，见 `{amazonia,bootybay,dota}-probe.log`。这些结果仅证明原生源记录读取，不表示地图初始化或对局通过。

新导航运行在创建设备时失败，未进入本批新增界面。当前执行进程属于 Windows 会话 1，`query session` 显示为 Disc；标准 D3D9 查询返回 D3DERR_INVALIDCALL，D3D9Ex 与 On12Ex 不可用。已将回退扩展到完整的能力、显示模式、深度和创建设备过程，编译通过；环境仍没有可用设备，不能沿用上一批旧帧证明新 UI 通过。证据为 `initial-device-error.log`、`amazonia-menu.log`、`display-session.log`。

已静态补齐 Maps 内指定地图的父目录导航，以及切选文件夹/错误地图时释放旧预览引用；相关交互仍随 GPU 导航等待实际验收。本批保持未关闭，恢复可用显示会话后先执行下列定向命令，再开展下一批：

```powershell
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/FrozenThrone/(2)Amazonia.w3x" --hidden --frames 240 --time-ms 0 --menu-check --log "../../tmp/docs-artifacts/war3/map-menu/amazonia-menu.log" --capture "../../tmp/docs-artifacts/war3/map-menu/amazonia-menu.png"
```

对 BootyBay、DotA_v6.83d 重复同一导航路径；检查单人/选图帧、目录双击/返回、滚轮和坏地图恢复，并复测 `--window-check`。不重复已通过且输入未变化的 CPU 项，不关闭/重启现有编辑器，不清理旧地图转换缓存。

## W005／W006 原版展示补充（2026-10-26）

本次补充保持原批次计数。按 REA 和原件配置接入运行时信息锚点、标题偏移、尺寸分类、中文地形名、列表字体、HM3W 头部名称/人数/分类，以及已接入按钮的键盘焦点。修正单行区域计算成两行导致的文字裁剪，菜单动作在完整绘制后处理。

Win32 Release 编译通过。地图专项现在 14 项通过、0 失败；新覆盖头部边界、INI 分段/引号/注释、原版展示配置、源焦点链，以及三图头部与 W3I/WTS、完整尺寸与 W3E 的一致性。原有 13 项 CPU 结果沿用。证据为 `source-ui-final-build.log`、`source-ui-tests.log`，均在 `tmp/docs-artifacts/war3/map-menu/`。

原版 CPU 对照通过 5 条锚点、40 组标题位置、64 组尺寸类别，证据为 `source-ui-cpu.json`、`source-ui-cpu.log`。配置成员和 C++ 夹具摘要写入该 JSON。原件只在 PE 读取器和 Unicorn 中作为指令数据使用；GUI/配置边界由探针提供，此检查不代替 GPU、字形测量或实际输入验收。

复现：先运行 `war3_map_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/map-tests>` 生成原生夹具，再在仓库根目录执行 `python watcher/war3/tools/verify_map_ui_cpu.py`。其他输出目录需通过 `--fixture <map-ui-native.json>` 指定；原版和输出路径可用 `--data-root`、`--output` 覆盖，默认输出在仓库根目录 tmp。

本轮重验仍显示执行会话 1 为 Disc，设备不可用，见 `continuation-menu.log`；没有新增 GPU 通过结论。增强后的 `--menu-check` 要求通过实际窗口 Enter／Space 进入单人/选图、Tab 切换列表/按钮、确认地图列表 Enter 不触发取消，再检查 S/G/A/Escape/Q 返回。恢复显示会话后完成这些检查，并人工检查 Shift+Tab、目录双击、坏地图恢复和像素；此前保持本批未关闭。

## W005／W006 玩家槽与显示恢复验证（2026-10-26）

本次仍是原批次的补充任务，不增加待测计数。路径为 `src/setup.*`、`player_setup_ui.*`、`fdf.*`、`glue.*`、`map_browser.*`、`main.cpp`、`platform.cpp`、`tests/map_tests.cpp` 和 CMake。实现源玩家 ID/势力的配置草稿、复用 PlayerSlot 实例、重复 MenuItem、上下文锚点、名称/种族/队伍/颜色/障碍下拉、固定设置约束、统一焦点与弹层输入；同图重复选择保留编辑，解析或布局失败清空部分状态。

Win32 Release 构建通过，见 `player-setup-build.log`。地图专项 **19 通过、0 失败**，新增源 popup 选项、两个独立上下文、源 ID/记录、本地槽移动、计算机控制、非法编辑、颜色交换、障碍边界、固定设置、force 掩码和文字内联颜色；三图分别核对草稿槽数与本地 ID，DotA 特别核对缺少 0/6 的稀疏 ID 和两队固定设置。基础 CPU **13 通过、0 失败**，本次因 FDF 解析/继承变更而复测，未执行旧 MEngine 全量测试。证据为 `player-setup-tests.log`、`player-setup-native-tests.log`。

原生地图 UI 规则夹具 SHA-256 仍为 `64bd263b499277b3a86cf63438c264dfde8cea886a3ff79ffba2894d722e128c`，布局/类别代码及配置未变，复用此前 5/40/64 条原版 CPU 对照；不重复执行 Unicorn。

会话 1 恢复为 console/admin/Active 后，标准 D3D9 的三图 `--menu-check` 均退出 0：Amazonia **104 帧**、BootyBay **104 帧**、DotA **108 帧**，均报告无 Game.dll。本地 ID 分别为 0、0、1。检查使用真实 HWND 消息：Enter/Space 进入单人和选图、地图行点击、滚轮、列表 Enter、Tab 到本地障碍、修改为 90%、重复选中地图保留草稿、再次展开与 Esc 关闭弹层、Tab/Space 取消以及 S/G/A/Escape/Q 返回。窗口恢复检查 **92 帧**退出 0，覆盖两次缩放、最小化恢复、从按钮外拖入与取消捕获；未停止或重启编辑器。

证据统一在 `tmp/docs-artifacts/war3/map-menu/`：`player-setup-{amazonia,bootybay,dota}.log`、同前缀的 `-single.png`／`-browser.png`／`-popup.png`，以及 `player-setup-window.{log,png}`。已查看三图选图帧和弹层输出，能确认源控件、预览和分组被绘制，不能据此宣称与原版逐像素一致。所有检查进程均已正常退出。

DotA 的 `|c00` 标题和说明色按原版 `0x6f0d8780`、`0x6f0d8948`、`0x6f029c80` 固定文字 alpha 为 255，修复后红/绿势力标题与说明颜色可见。`tools/verify_text_color_cpu.py` 的 **32 组合法颜色**与 C++ 全部一致，证据为 `text-color-parser-rea.json`、`text-color-cpu.json`／`.log`；ASCII 与 CRT strtol 为受控探针边界。文字修复后只重跑受影响的 DotA 导航，仍为 108 帧退出 0；沿用未受影响的另外两图、窗口恢复和基础 CPU 结果。

复现命令沿用上一节的三图入口，`--menu-check` 现在至少需要 `--frames 240`；步骤未完成而帧数耗尽会失败。增加 `--mute` 可跳过本批未改动的音频路径。选图、弹层和地图草稿不运行 JASS，不产生解包工程。

本批剩余待测：目录双击/Enter/Backspace 返回、坏地图与失效目录恢复、反向 Tab、玩家长列表滚动、颜色/队伍/名称的完整鼠标操作与切图释放。完整 UI 的组布局、颜色网格、字体/过渡和对局默认 AI/JASS 顺序保持待实现或对照；开始游戏仍禁用。W004–W006 保持未关闭，完成这些与已实现路径有关的检查后再开启下一批。

## W004–W006 基础批次关闭（2026-10-26）

在 `e1889bf` 上补充只读界面查询和 `tests/browser_tests.cpp`，Win32 Release 编译通过；原生 D3D9 界面检查 **11 通过、0 失败**，无 Game.dll。覆盖目录双击、Enter 与 Backspace 返回；坏归档、缺少/截断 W3I 的状态清空和选择恢复；同一失效文件替换后重试；删除/重建测试文件夹后的目录恢复；坏图选择直接释放旧预览节点的 COM 引用；弹层外部点击不进入地图列表；名称、种族、队伍、颜色交换、障碍值及本地槽移动；Tab/Shift+Tab 正反遍历；静止鼠标不覆盖键盘、滚轮切换；16 槽滚动及底部弹层向上展开；固定设置与空草稿/重绑。

夹具仅在 `tmp/docs-artifacts/war3/browser-tests/<PID>-<ticks>/` 新建目录、复制一张原地图并生成畸形 MPQ，不改动原安装。测试直接向产品 GlueScreen/MapBrowser 输入 UiInput 并实际绘制 D3D9 帧；此前 `e1889bf` 的三图产品 HWND 导航、窗口恢复、19 项地图/13 项基础 CPU 和 32 组原版颜色对照沿用，没有相关输入或行为变化时不重复执行。

证据为 `map-menu/browser-build.log`、`map-menu/browser-tests.log` 和 `browser-tests/browser-results.json`；恢复后的地图与长玩家列表帧为 `browser-recovered.png`、`setup-scrolled.png`，已查看。原始 JSON/日志/PNG 不提交。复现（`watcher/war3`）：

```powershell
./build/windows-x86/bin/Release/war3_browser_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/browser-tests"
```

本批关闭已实现的地图定义、基础动态控件与选图交互。完整 UI 像素、组间距、颜色网格、过渡、对局配置覆盖、地图初始化和实际玩法保持总矩阵待完成状态，不据此缩小独立客户端目标。下一批从原生脚本和地图会话展开。

## 原生脚本批次队列

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W007 JASS 源与语法树 | jass.*、archive.*、main/platform、CMake、jass_tests | 原公共库、三图脚本成员与来源、语法/位置/预算、入口、后续 VM 对 AST 的消费 | token 与字符串混淆、CR 源位置、公共来源覆盖、表达式绑定与语义 | 语法基础与三图装配通过，本批关闭；执行能力待实现 |
| W008 原版数值转换 | jass_numeric.*、numeric_tests、verify_jass_numeric_cpu、CMake | VM 实数位型、I2R/R2I 边界、原版 CPU 差分、后续 native 绑定消费 | 尾数截断、符号、越界、NaN/无穷、宿主浮点转换差异 | 转换与当前数值层集成通过，本批关闭 |
| W009 实数算术与字面量编译 | jass_numeric.*、jass_reciprocal.inc、jass/main、生成/验证工具 | 原版四则与倒数插值、十进制 token、AST 实数位型、三图脚本装配 | 移位/截断、系数来源、长小数回绕、零除函数与 VM 策略边界 | 数值差分、AST 实数位型与三图装配通过，本批关闭；VM 边界待实现 |

W007 为后续执行开发所需立即编译和最小集成验证，未运行旧引擎全量测试或重跑无变化的 GUI/纹理检查。Win32 Release 构建通过，`war3_jass_tests` **8 通过、0 失败**；产品 `--hidden --script-check` 直接挂载原公共 MPQ 与 DotA，退出 0、无 Game.dll，语法树含 91 类型、3,369 全局、1,160 native 声明、5,599 函数体、281,324 表达式、65,968 语句。独立文本声明计数的类型/native/函数分别为 91/1,160/5,599，与原生输出一致。

证据在 `tmp/docs-artifacts/war3/jass/`：`build.log`、`tests.log`、`dota-script.log`、`independent-declarations.json`、`source-paths-rea.json`。公共库和原地图保持只读；测试夹具另写 tests 子目录。本次只构建语法树，没有执行 global initializer、config/main 或任何 native；单次解析时间不表示冷地图载入或对局性能。

定向命令（`watcher/war3`）：

```powershell
./build/windows-x86/bin/Release/war3_jass_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/tests"
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --script-check --log "../../tmp/docs-artifacts/war3/jass/dota-script.log"
```

累计三个功能任务后合并验证三图脚本/VM接口及原生函数边界；原版表达式优先级、结合性、短路、数值/字符串语义及完整执行能力均未由本次语法树测试证明，实施 VM 时先按原件核对。未接入的 UI/世界/AI/战役等继续按完整矩阵推进。

W008 原生 Release 构建与转换边界检查通过。I2R **695 组**、R2I **3,072 组** C++ 输出与原版 native 包装/转换指令逐位一致，原件只在 Unicorn 中作为 PE 指令数据执行，没有任何代码边界替身，产品与原生检查均不加载 Game.dll。此最小差分是数值层继续开发的必要依据，未扩展到旧引擎或重复已通过的 UI/语法检查。证据在 `tmp/docs-artifacts/war3/jass/numeric-{build.log,tests.log,native.json,cpu.json,cpu.log}`，原始 REA 文件见 `jass.md`。

复现（仓库根目录）：

```powershell
./watcher/war3/build/windows-x86/bin/Release/war3_jass_numeric_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/numeric-native.json"
python watcher/war3/tools/verify_jass_numeric_cpu.py
```

W009 补齐 Real 四则、固定倒数系数和十进制 token，并把实数位型接入 AST。`jass/arithmetic-build.log`、`arithmetic-tests.log`、`arithmetic-native.json`、`arithmetic-cpu.json`／`.log` 记录 **55,296 次四则运算、2,061 个十进制 token** 与原版一致，无替代函数代码；旧 695/3,072 组转换证据保持原文件，未重复执行。生成器核对 Game.dll 固定摘要，运行时使用已提交的 4,100 字节系数，不加载原件。语法/字面量消费在后续三图集成中验证；完整 tokenizer、VM 零除/线程语义与其他执行行为未被本次差分覆盖。

本批达到 3/3。提交后合并执行受影响的 JASS 自编夹具和三张代表地图 `--script-check`，核对根/Scripts 成员、原版实数位型已在 AST 生成、声明数与无 Game.dll；复用已通过的数值函数原版差分和未变的 UI/地图源记录结果。语法/数值批次通过也不表示 VM、config/main、对局或完整 UI 一致；相应项目继续保留在总矩阵。

## W007–W009 语法与数值批次结果（2026-10-26）

集成版本 `47a1324`，原生 Release 构建通过。JASS 自编夹具 **9 通过、0 失败**，新增验证实数 AST 位型来自原版数值层、保留精度边界、相邻 then 和非法实数诊断。产品三图 `--script-check` 均退出 0、无 Game.dll：

| 地图 | native 声明 | 函数体 | 全局变量 | 预编译实数 | 位型序列校验值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Amazonia | 1,160 | 960 | 898 | 569 | 2,208,139,060 |
| Booty Bay | 1,160 | 952 | 898 | 428 | 1,822,572,789 |
| DotA_v6.83d | 1,160 | 5,599 | 3,369 | 4,687 | 626,114,605 |

三图均含 91 个扩展类型，类型/native/函数/全局数量与固定源文本的独立计数一致；前两图读取根 war3map.j，DotA 读取 Scripts\war3map.j。位型序列校验值用于定位同一脚本输入下的编译结果，不代替原版 VM 执行比较。I2R/R2I 的 695/3,072 组、四则的 55,296 次及 2,061 token 原版差分输入/实现未变，沿用已保存结果，不重复运行；不扩大到旧引擎、GPU、纹理或全库检查。

证据为 `jass/arithmetic-frontend-build.log`、`batch-jass-tests.log`、`batch-{amazonia,bootybay,dota}.log`、`batch-w007-w009.json`。数值差分和系数来源文件继续保留。该批关闭语法树、数值函数和字面量预编译范围；没有执行 globals initializer、config/main、触发器或任何地图 native。下一批为表达式绑定/类型与执行栈，随后实现 native 和地图会话；完整玩法与 UI 仍按总矩阵推进。

## W010–W012 原生链接与执行批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W010 类型与符号解析 | jass_module.*、main、CMake、jass_module_tests | 三图公共/地图符号与槽位、源位置诊断、后续执行层消费直接绑定与隐式数值转换 | handle 兼容、遮蔽、数组形状、继承环、原版类型规则与静态检查边界 | 类型/槽位基础验证通过，本批关闭 |
| W011 原版表达式与整数 token | jass.*、jass_literal.*、CMake、frontend/jass_tests、verify_jass_frontend_cpu | 三图布尔表达式、整数字面量、执行层对 AST 位型/组合的消费 | or/and 优先级与右结合、32 位回绕、语法/类型/执行的验证边界 | 原版定向对照与本批消费通过，本批关闭 |
| W012 执行栈与 native 边界 | jass_runtime.*、jass_literal/jass、main、CMake、runtime_tests、verify_jass_literals_cpu | 三图指令编译、初始化/槽位/流程/短路/code/native 的执行、失败位置与预算释放、前批消费 | 调用帧/跳转、I2R、字节与转义、未绑定函数、重入预算、原版异常策略尚未完整对照 | 13项执行检查、字面量对照及三图指令编译通过，本批关闭 |

W010 为收尾未提交源码及后续执行开发进行必要编译和最小集成：MSVC Win32 Release 的产品和 `war3_jass_module_tests` 编译通过，**9 通过、0 失败**。覆盖 handle/null 与数值赋值、非法类型图、参数/局部/全局槽位及 set 目标、前向函数和 code、数组形状与下标、初始化和常量、条件/返回/运算符、20,000 次左结合运算、移动后 AST 所有权与绑定完整性。

产品 `--hidden --script-check` 对 DotA 直接挂载原归档，类型和符号解析退出 0；91 类型、3,369 全局、1,160 native、5,599 函数体、281,324 表达式、65,968 语句，实数位型序列与既有输入一致，无 Game.dll。证据为 `tmp/docs-artifacts/war3/jass/module-{build.log,tests.log,dota.log}`。该最小产品检查用于确认新模块被真实入口消费；没有重跑旧引擎、GUI、数值差分、全量资产或性能基准。

后续累计三个功能任务后，在同一集成版本合并执行三图检查、源位置与绑定消费的相关用例。确定赋值、全部路径返回、constant 纯度及原版完整类型语义尚未核验；未执行全局初始化、config/main 或 native，未将地图标记为可玩。W010 保持待批次验证，旧 MEngine 161–163 批次继续延期。

定向命令（`watcher/war3`）：

```powershell
cmake --build --preset release --target war3 war3_jass_module_tests --parallel 8
./build/windows-x86/bin/Release/war3_jass_module_tests.exe
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --script-check --log "../../tmp/docs-artifacts/war3/jass/module-dota.log"
```

W011 为执行层开发核对原件表达式组合并修正已确认偏差。Win32 Release 编译通过，5 项 frontend 检查及受影响的9项语法检查通过、0失败。245 组表达式结构通过原版解析状态机指令对照；591 个整数 token（199 十进制／196 八进制／196 十六进制）通过原版回调及 lexer 分类、长度和位型对照。原版解析只执行移进/归约指令，语义动作记录为符号树，到 return 表达式归约停止；lexer 的 CRT memmove 由受控内存复制替代。完整类型、源文件验收、短路、编译和 VM 不在此对照范围，见 `jass.md`。

DotA 最小产品集成退出 0、无 Game.dll，仍为 91 类型、3,369 全局、1,160 native、5,599 函数体、281,324 表达式与65,968语句；此次检查未执行地图脚本。证据为 `tmp/docs-artifacts/war3/jass/frontend-{build.log,tests.log,native.json,cpu.json,cpu.log,parser-tests.log,dota.log}` 与 `frontend-{integers,parser,identifiers}-rea.json`。当前批次 **2/3**，W012 后合并三图及实际执行层消费；已通过且未变化的数值差分、GUI与旧引擎不重复运行。

W012 接入原生执行指令与显式脚本帧，产品 `--script-check` 新增指令编译，保持 `initialized=false`。开发所需 Win32 Release 构建及12项自编脚本执行检查通过；字符串构造器解码循环5组、完整Rawcode回调268组与原版指令一致。DotA 370,552 条指令编译通过，无 Game.dll；地图 native 尚未实现，不执行原图全局初始化或 config/main。原版短路/实参顺序已有发射器及参数布局路径依据，执行完整一致性仍待差分，见 `jass.md`。

证据在 `tmp/docs-artifacts/war3/jass/runtime-{build.log,tests.log,native.json,literals-cpu.json,literals-cpu.log,dota.log}` 与 `runtime-{shortcircuit,strings,call-grammar,parameters}-rea.json`。本批达到 **3/3**；提交后合并构建并执行受影响的语法、Module、frontend、Runtime 检查及三图产品编译，覆盖新增嵌套loop与共享native预算用例。无实现变化的 DotA 最小结果及数值/解析状态机差分按输入与产物摘要复用；不扩大到旧引擎、UI或全量资产。

## W010–W012 脚本基础批次结果（2026-10-26）

集成版本 `d1afdb3`（W010 `c03da05`、W011 `2e9b6de`、W012 `d1afdb3`）。MSVC Win32 Release 构建通过，无编译警告；语法9／Module9／frontend5／Runtime13，**36通过、0失败**。Runtime检查实际执行自编脚本，包含参数/槽位/数组、全局初始化次序、分支/循环/嵌套exitwhen、短路、code同步重入、整数回绕与Real转换、字符串/Rawcode、native错误位置与类型、初始化失败、共享预算和20,000次左结合表达式。

| 地图 | 表达式 | 语句 | 执行指令 | 原图初始化 |
| --- | ---: | ---: | ---: | --- |
| Amazonia | 14,864 | 3,687 | 21,086 | 未执行 |
| Booty Bay | 13,904 | 3,400 | 19,785 | 未执行 |
| DotA_v6.83d | 281,324 | 65,968 | 370,552 | 未执行 |

三图产品 `--hidden --script-check` 均退出0、无Game.dll，直接挂载原公共MPQ与地图，未创建解包工程。当前构建的产品二进制摘要与快速检查版本不同，三图在同一集成二进制重新检查；结果保留 `initialized=false`。本批frontend、Runtime字面量夹具分别与既有原件对照的摘要 `07dc0758df41c6e66a352d3ff6bb6f9e29c5cdce5f593a55fe74497571e9aa70`、`a4b1d9418681924acb17b9a5c51d2bcfb74dcf096757002e4bea2d0d2efc61f3` 一致，复用245组表达式/591个整数和5组字符串/268组Rawcode对照。此前Real数值实现及差分输入未变化，不重跑；未扩大到UI、旧引擎、纹理或全量资产。

证据为 `tmp/docs-artifacts/war3/jass/batch-runtime-{build.log,build-receipt.json,syntax.log,module.log,frontend.log,execution.log,amazonia.log,bootybay.log,dota.log}`、`batch-{frontend,runtime}-native.json`、`batch-w010-w012.json`。本批关闭已实现的类型/绑定、字面量和执行层基础；原版完整类型/VM一致性、游戏native、句柄/计时器调度、原图全局初始化与config/main、实际对局继续在总矩阵待实现。旧MEngine 161–163批次继续延期。下一批从原版公共常量、真实native状态与地图配置/会话开始。

## W013–W015 地图配置与会话批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W013 原图全局初始化/config | session.*、jass_enums.inc、main/platform、CMake、session_tests、verify_jass_enums_cpu | 三图globals/config、配置与玩家草稿/选图的消费、坏图与native失败恢复、切图释放、后续main对状态的消费 | 原版句柄分配/重用、玩家初始状态、菜单占槽与配置次序、未绑定native、范围/销毁诊断边界 | 配置基础范围合并验证通过；完整main消费及原版一致性继续待完成 |
| W014 后台选图与配置草稿 | map_preparation.*、map_browser.*、setup.*、player_setup_ui.*、session.*、main、CMake、setup_tests、browser_tests | 三图选图/config、玩家修改回写、最新选择/目录取消、配置失败与重试、同图草稿/切图释放；合并原11项界面检查及W013会话检查 | 后台归档独立所有权、旧结果覆盖、脚本耗时/退出、原版开局占槽与本地身份时序、组合种族偏好的界面表现 | 基础联动合并验证通过；持续切图性能/完整UI待验收 |
| W015 原生世界与main入口 | world.*、session_world.cpp、session.*、map_preparation、main/platform、CMake、world_tests、verify_world_cpu | 三图世界/globals/config与选图、位置/矩形生命周期、源CameraMargins、main阶段/失败、归档卸载后的世界所有权，合并W013/W014相关验证 | 完整地形/相机范围、边界数值、globals前挂接、原版异常句柄规则、未实现的世界渲染/native | 世界空间/生命周期合并验证通过；完整原图main失败保留后续队列 |

W013 为原图执行开发进行必要编译和最小产品集成：Win32 Release 构建通过、无警告；7项session检查通过、0失败。覆盖44枚举与GetHandleId位型、对象全局初始化/查询/修改/销毁、会话隔离、WTS/config状态/出生点/优先级、源玩家/势力与游戏类型、配置失败阻断及签名错误。初始化只能成功一次；未知native不会回传默认值。

原版注册签名/地址核对与CPU指令比较：44枚举native加GetHandleId，每个65组，共**2,925次逐位一致**，无替代函数。当前C++夹具摘要 `7c2d63f14c5159a09d7bb73b86641314efcadb34da9508dfc2e89a2e8f48e6ee` 未变化，补充源玩家/阶段检查后复用该对照。原版对象分配、默认状态、完整VM和config副作用一致性不由这项数字比较证明，见 `session.md`。

DotA_v6.83d 的产品 `--hidden --config-check` 退出0、无Game.dll：公共库和地图全局初始化/config已实际执行，10名额/10队伍记录，源ID1–5/7–11分别配置为队伍0/1，出生点0–9；Group3/Timer4/Trigger1对象状态保留，main=false。地图与MPQ只读，未解包。另两图和菜单会话联动留在新批次，未重跑已关闭的36项JASS、旧引擎、UI、数值或资产全量检查。

证据为 `tmp/docs-artifacts/war3/jass/session-{build.log,tests-build.log,tests.log,dota.log,enums-native.json,enums-cpu.json,enums-cpu.log,registration-rea.json,enum-conversion-rea.json,handles-rea.json,lookup-rea.json,native-catalog.json,receipt.json}`。原图main/可玩对局与完整原版一致性保持总矩阵待实现状态。

W014开发必需的Win32 Release产品、setup/browser测试目标构建通过，无警告。4项setup定向检查通过、0失败：配置覆盖和稀疏ID、种族/控制限制、UI草稿到native查询、占槽/AI/障碍、势力/组合偏好保留、阶段与会话隔离。3项新增D3D9异步检查通过、0失败：快速选择/目录取消、UI写回/同图保留/切图重建、原config未知native失败清空与恢复。旧11项界面检查已适配有界等待但本项未重跑，留到批次合并；未重跑W013七项、数值、旧引擎或全资产检查。

DotA产品最小集成实际完成原图globals/config后导航110帧退出0、无Game.dll：本地源ID1，10槽及原势力分组，障碍90%、同图保留、弹层取消、返回/再次进入菜单通过。截图已核看，原版完整UI像素、背景模型/粒子等仍属总矩阵待还原；不将导航通过写成完整UI/对局通过。证据为 `jass/setup-{build.log,tests.log,player-natives-rea.json}`、`map-menu/setup-{browser-tests.log,browser-tests/browser-results.json,dota.log,dota*.png}`。尚未执行main或可玩对局；本批当前2/3。

W015最小范围：产品和world目标Win32 Release构建通过，无警告；7项world检查通过，195组坐标夹取及77组SSE相机距离换算与原件指令逐位一致、0失败，不加载Game.dll。SourceSettings和Real原实现未变化，未重跑旧数值或全量资产。Amazonia真实main已完成相机/昼夜模型/水色写入和1个矩形创建，随后明确在AddWeatherEffect失败（退出1，main_completed=false），不记录成原图main通过。证据为 `tmp/docs-artifacts/war3/world/{build.log,product-build.log,tests.log,cpu.log,world-*.json,main-amazonia.log}`。world/CPU实现和输入未变化，合并验证复用该结果。

## W013–W015 合并结果（2026-10-26）

集成提交 `a07fcab`，包括W013 `527ad20`、W014 `f802c63` 与W015 `a07fcab`。产品/相关测试目标MSVC Win32 Release构建通过、无警告。会话7、玩家草稿4、原生D3D9界面14，**本次执行25通过、0失败**；复用同一实现/输入的world7项后，已实现范围合计**32通过、0失败**。14项界面包含原11项和新增3项异步检查，覆盖目录/坏图/重试/预览释放、焦点/弹层、全部玩家字段、长列表/固定设置、最新选择/目录取消、草稿回写/保留及config失败恢复。

同一产品二进制 SHA-256 `30b0d76f73d88277e0165f98888a33feb6761c66f6da558812a96b6714f77ae8`：Amazonia、BootyBay、DotA原图globals/config均退出0，带世界数据的产品菜单导航分别104、104、110帧通过，均无Game.dll。world源码/夹具与272次原版比较的摘要一致；新枚举夹具摘要 `7c2d63f14c5159a09d7bb73b86641314efcadb34da9508dfc2e89a2e8f48e6ee` 及元数据与2,925次原版比较报告一致，复用有效结果。没有重跑W010–W012的36项、旧引擎、全量资产或性能基准。

三次完整原图main尝试均退出1，**未通过**，保留以下实现队列：

| 原图 | 实际停止位置 | 待实现 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 原版天气定义、实例与启停、渲染消费；后续单位/触发器 |
| BootyBay | `war3map.j:789:10` NewSoundEnvironment | 真实声音环境、昼夜环境音/音乐、后续单位/触发器 |
| DotA_v6.83d | `Scripts\war3map.j:90177:6` NewSoundEnvironment | 真实声音环境、地图声音/音乐及后续初始化native |

证据为 `tmp/docs-artifacts/war3/world/batch-{build.log,session.log,setup.log,browser.log,browser-tests/,enums-native.json,config-{amazonia,bootybay,dota}.log,menu-{amazonia,bootybay,dota}.log,main-{amazonia,bootybay,dota}.log,w013-w015.json}`，复用证据见同目录world检查和 `jass/session-enums-cpu.json`。本批只关闭已实现配置/世界空间基础；原版完整客户端矩阵、UI像素、main与可玩对局继续待实现/验收，旧MEngine 161–163保持延期。下一批从W016声音环境及相关实际native开始，不用空回调越过失败项。

## W016–W018 运行资源与声音批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W016共享归档视图与世界资源寿命 | archive.*、world.*、CMake、archive_tests | 公共/地图去重与作用域、跨线程读取、地图视图隔离/最后释放、LRU和外部引用；声音/模型实际消费，三图持续切图 | 共享StormLib句柄加锁、地图视图遗留、引用与缓存预算差异、后续声音线程寿命 | 资源基础/声音消费合并验证通过；持续切图性能及模型消费待验收 |
| W017共享Miles与MIDI/DLS后端 | audio.*、media.*、CMake、profile、audio_tests | 数字声音与MIDI/DLS实际播放/控制、设备/源字节/音色库寿命，菜单共用设备，地图声音消费与切图释放 | 原stdcall ABI、转换内存分配器、DLS/XMIDI/数字设备关闭次序、重建与并发、听感/空间效果边界 | 已实现后端合并验证通过；3D/听感与完整音频待验收 |
| W018源声音表与脚本MIDI对象 | slk.*、sound.*、session_sound、session.*、main、map_browser/preparation、CMake、sound_tests | SYLK/原声音字段、地图覆盖、globals创建、实际播放控制/状态、抢占/退役/独立寿命、静音传递、原main停止位置；合并资源/Miles及选图受影响范围 | 变量/源资源/设备寿命、同步读取、未还原的渐变/3D环境/时钟、普通声音与Music尚未绑定 | 源表/MIDI对象合并验证通过；渐变/时间/环境与完整main继续待实现 |

W016开发必需编译通过、无警告；7项新归档检查通过，含8视图各128次并发读取、9MiB双成员的16MiB地图LRU、真实BootyBay世界资源视图。DotA产品导航108帧退出0、无Game.dll。没有重跑旧JASS、图像、UI14项、三图全量或性能基准；合并验证覆盖后续音频消费及必要受影响范围。证据为 `tmp/docs-artifacts/war3/audio/archive-*`，接口与预算见 `archives.md`。

W017开发必需的产品/audio目标构建通过，无警告；7项真实Miles定向检查通过、0失败，含原MP3、原MIDI+DLS双sequence共享库、PCM参考长度/定位、播放状态与时间推进、设备/声音/音色库释放及4线程各4次设备重开。检查输出音量为0，未做听感或3D混响验收。产品原菜单带音乐运行60帧退出0，无Game.dll。尚未绑定原图声音native，main停止位置保持天气/声音环境，待下一项接入后合并。没有重跑旧界面、脚本、地图全量、图像或性能基准；证据为 `tmp/docs-artifacts/war3/audio/miles-*`，ABI/来源与生命周期见 `audio.md`。

W018开发必需编译通过、无警告；6项sound检查通过、0失败，实际调用Miles且输出音量0。BootyBay/DotA原main均完成Default源环境登记和1个MIDI/DLS声音创建，随后在 `Scripts\Blizzard.j:1224:12` 的GetFloatGameState失败，退出1、main未完成，无Game.dll。非零渐变及源Pitch非1保持显式错误，3D环境属性仅登记源请求，未做效果一致性验收。证据为 `tmp/docs-artifacts/war3/audio/sound-*`，合并验证复用同一sound二进制/输入的有效结果。

## W016–W018 合并结果（2026-10-26）

集成提交 `6557119`，包含W016 `98197bd`、W017 `a3bc2f7` 和W018 `6557119`。MSVC Win32 Release产品及相关检查目标构建通过，无警告。归档7、Miles7、D3D9界面14，**本次执行28通过、0失败**；复用当前未变化的sound6项，合计**34通过、0失败**。复用前核对了sound二进制/相关源码与最后执行日志的时间及摘要。覆盖资源共享/读写边界、源资源/声音/设备寿命、实际播放/控制及受影响选图/玩家输入；声音检查音量为0，听感/3D混响和完整性能仍待验收。

同一产品二进制 SHA-256 `b15fcbe0550c357710515ff34e480429bd8e9dd73e2bae2a12e7a40520b1fb92`：三图globals/config退出0；Amazonia、BootyBay、DotA菜单导航分别104、104、108帧通过，无Game.dll。BootyBay/DotA的main证据来自同一产品二进制的W018最小集成，未重复；Amazonia本批补查。三图完整main均退出1，**未通过**：

| 原图 | 实际停止位置 | 后续实现队列 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 天气定义/实例/启停与渲染；后续单位/触发器 |
| BootyBay、DotA | `Scripts\Blizzard.j:1224:12` GetFloatGameState | 原版时间初值/变量求值/推进与事件；随后声音渐变、环境效果、Music与单位初始化 |

BootyBay/DotA在停止前各持有1个真实MIDI声音、1个DLS库和Default环境请求；尚未进入后续StartSound，不能视为原图声音播放/完整main通过。额外的非零声音渐变、3D环境应用、普通CreateSound、Music、开局/完整UI与性能保持待实现/验收。下一批W019从时间变量和声音渐变的实际原件调用继续，不填推测状态。

证据为 `tmp/docs-artifacts/war3/audio/batch-{build.log,archives.log,archive-tests/,miles.log,browser.log,browser-tests/,config-{amazonia,bootybay,dota}.log,menu-{amazonia,bootybay,dota}.log,main-amazonia.log,w016-w018.json}`，复用证据为 `sound-{tests.log,main-bootybay.log,main-dota.log}`。没有重跑旧JASS/数值/图像、全资产、旧引擎或性能基准；旧MEngine161–163批次仍延期。本批仅关闭已实现资源/声音基础，完整客户端目标继续进行。

## W019–W021：时间、MIDI与音乐初始化批次（3/3）

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W019同步初始化时间状态 | game_clock.*、world.*、session_world.cpp、CMake、clock_tests、verify_clock_cpu | 三图globals/config/main、源昼夜规则覆盖/切图隔离、与后续声音和选图的消费；后续调度需补跨日/反向/时间事件 | 当前没有模拟tick/回绕/事件派发，变量层上界只夹取；数值CPU对照替换3个系统边界且没有订阅者，不证明完整昼夜 | 已实现范围合并验证通过；完整时间模拟继续待实现 |
| W020非空间MIDI渐变 | sound_fade.*、sound.*、audio.*、session_sound/session.h、map_browser、CMake、sound_tests、verify_sound_fade_cpu | 合并Miles/选图受影响检查、三图globals/config/main、正反渐变/静音/淡出释放/跨会话资源；源定时器相位/3D保持后续范围 | 无符号步长与回绕、减到零后下一次才停止、脚本句柄退役后的播放所有权；对照替换6个链表/硬件/诊断边界 | 已实现范围合并验证通过；完整音频/玩法待完成 |
| W021脚本音乐配置/播放 | music.*、audio_random.*、session_music.cpp、session.*、map_ui.*、main、CMake、music_tests、verify_music_cpu | 合并时间/MIDI/Miles/选图、三图globals/config/main；地图skin覆盖、选曲、暂停/恢复、定位、渐变、曲终排队与释放 | 声音RNG共享消费时序、最终种族/版本上下文、ThematicMusic与调度相位尚未完成；原件CPU只覆盖RNG及渐变标量/回调边界 | 已实现范围合并验证通过；5,434次原件对照一致；完整main与后续音乐/玩法待完成 |

W019开发必需的Win32 Release产品/clock目标构建通过，无警告。6项定向检查通过、0失败；3,288组变量赋值与7组速率计算和固定原件指令逐位一致。对照范围为零模拟时差、无订阅者的变量层；引用解析、时间取样和时间戳存储共3个边界被替换，跨日/昼夜/脚本事件未验证。

BootyBay最小产品集成退出1，日志显示 `main_completed=false`，已通过GetFloatGameState并创建2个真实MIDI声音/1个DLS库，随后在 `Scripts\Blizzard.j:2482:14` StartSound非零fade-in明确失败，无Game.dll，不能记为完整main通过。产品SHA-256为 `b50a1e579ebeb2f24bb698cc9f58b203657cb83847fc52960d56e0c88d438eb8`。DotA/Amazonia、界面、旧脚本/数值/声音及性能未重复执行，纳入本批受影响范围后去重验证。原始证据为 `tmp/docs-artifacts/war3/clock/{build.log,tests.log,tests/clock-native.json,clock-cpu.json,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。

W020开发必需产品/sound目标Win32 Release构建通过、无警告；10项定向检查通过、0失败。包含真实Miles的非零速率首次播放、重复启动保持播放位置、淡出取消、100ms单脉冲、内部淡入、精确减至0后的延迟结束、kill/独立播放所有权和通道抢占；正音量查询仅在未播放声音上执行，播放时静音。原件对照2,934组步进、8组无符号速率和80组首次/重复启动共3,022组零差异，保留源算术和状态写入，替换6个链表/硬件/诊断边界，不证明物理声音、源定时器或3D分支。

BootyBay真实main已通过StartSound，在 `war3map.j:792:10` 的SetMapMusic明确失败，退出1、main_completed=false，无Game.dll。产品SHA-256为 `0e4fb69db78cbefe6351708ef8d3b4d0b90e44341a28f9178e714c31546a8291`。证据为 `tmp/docs-artifacts/war3/audio/fade-{build.log,tests.log,tests/107988-352511640/fade-native.json,cpu.json,cpu.log,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。最后的播放状态边界修改后，重新执行10项sound与BootyBay最小集成；新夹具和sound_fade源码摘要均与原件对照输入一致，复用3,022组CPU结果。没有重复旧完整Miles/界面、三图全量、旧引擎或性能基准；下一项完成后先关闭本批受影响验证。

## W019–W021 合并结果（2026-10-26）

集成提交 `e073a7d`，包括W019 `8c2f6af`、W020 `355ceb4`及W021 `e073a7d`。Win32 Release产品及相关测试目标构建通过、无警告。本批执行clock6、sound10、Miles7、world7、browser14共**44通过、0失败**；复用同一实现/输入/测试二进制刚通过的music8项，已实现范围共**52通过、0失败**。这些检查包含源时刻/地图覆盖、真实静音音频/MIDI、曲目表/skin覆盖/渐变/曲终排队、世界/资源所有权与14项选图界面消费。clock/sound的新夹具与受控源码摘要和既有CPU结果一致，分别复用3,295次和3,022次对照；音乐5,434次对照输入/源码摘要亦核对一致，不重复数值执行。

同一产品二进制SHA-256 `94277e14b1f03472babeb0740ff7593d37c0c9b4ca06ee04a320320cc8c5915a`：三图globals/config退出0；Amazonia、BootyBay、DotA菜单导航分别104、104、108帧退出0，无Game.dll。三图完整main均退出1，**未通过**：

| 地图 | 实际停止位置 | 后续队列 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 天气与后续单位/触发器 |
| BootyBay | `war3map.j:643:13` CreateUnit | 单位定义/创建与后续初始化 |
| DotA_v6.83d | `Scripts\war3map.j:90181:8` CreateSound | 普通声音创建与后续初始化 |

BootyBay的main复用同一产品二进制的W021最小复现，另两图本批执行。BootyBay/DotA均持有Music、index=−1、tracks=0的配置，未提前播放；音乐实际播放由定向原资源/JASS用例验证。完整音乐上下文/ThematicMusic、模拟tick/事件、世界渲染、实际开局、玩法/完整UI/性能仍待实现或验收。

证据为 `tmp/docs-artifacts/war3/audio/batch-w019-w021-build.log`、`batch-w019-w021.json`、`batch-w019-w021/{clock,sound,audio,world,browser}.log`及夹具/三图日志，复用music证据见 `script-music.md`。未重复旧JASS/数值、图像/资产全量、旧引擎或性能基准；MEngine161–163批次仍延期。本批关闭已实现范围，完整客户端目标保持未完成。

## 阶段A：对象初始化到可操作地图（实现中）

门槛为选图、载入、地图主函数、世界画面、单位操作和返回菜单的连续流程。源码分批提交，完整流程实现后集中验证；W022–W024达到三项不触发中断实现的回归批次。

| 任务 | 路径 | 待测内容 | 边界/风险 | 状态 |
| --- | --- | --- | --- | --- |
| W022源对象与单位/物品 | object_data.*、entities.h、session_entities.cpp、session.*、slk.*、map_ui.*、CMake | 原单位/物品表、w3u/w3t继承及类型/终止标记、Profile大小写、源属性、创建/查询/修改/分组/销毁、切图所有权 | 完整对象家族/放置、碰撞/寻路、渲染、能力/物品库存及死亡事件继续实现；未映射修改保留记录 | 源码已接入，产品编译/静态签名检查通过；功能与原版一致性待阶段验证 |
| W023天气实例状态 | session_weather.cpp、entities.h、session.* | 源Weather.slk、区域/启用状态、生命周期、原图main消费与切图释放 | 天气粒子/渲染消费者尚未接线，源行为细节待核对 | 状态实现已接入；画面与阶段验证待完成 |
| W024普通数字声音 | audio.*、sound.*、session_sound.cpp | 实际WAV/MP3、延迟声音申请、loop/pitch/时长、标签参数、自然结束/释放、源脚本初始化与MIDI兼容 | 监听器/空间混音尚未接线，空间播放明确失败；声音变体、EAX、完整原版音频待实现/核对 | 基础实现已接入，产品编译通过；Miles运行/相关回归待阶段验证 |

本批只执行必要Win32 Release产品编译（无警告）、56个字面量native签名的静态核对与差异检查，没有运行功能测试、三图回归、CPU逐位对照、全量资产或性能检查。编译证据为 `tmp/docs-artifacts/war3/implementation-build.log`。历史52项通过属于e073a7d，不能作为本批新增代码已通过运行验证的依据。详细来源和边界见 `entities.md`。

| 阶段A接续任务 | 路径 | 待阶段验证 | 当前证据/边界 |
| --- | --- | --- | --- |
| W025回调/枚举/事件/时钟核心 | script_state.h、session_callbacks/collections/tick、session.*、game_clock.*、session_world | 嵌套回调、删除/重启/禁用、短/周期计时器、阈值/回绕、事件顺序与切图 | BootyBay原main及250ms早期回调通过；线程等待、全部生产者与原版时序待完成 |
| W026原版开局资源/状态 | session_game/dialogs、session_entities、object_data、entities、sound/session_sound、slk、archive、main/platform、CMake | 源表/能力别名、声音标签、资源枚举、PLD、规则/种族/科技/相机/窗口状态、三图main与持续模拟 | BootyBay65单位/42触发器/8计时器/57事件；完整游戏RNG、规则/渲染消费者和另外两图待完成/复查 |
| W027Miles waveOut输出 | audio.cpp、CMake开发符号图 | Miles/MIDI/MP3、音量/渐变/自然结束/释放、窗口与听感回归 | Miles库内waveOut路径已在静音最小复现创建3声音/1DLS库；未做完整音频回归/听感验收 |

接续只执行开发必需编译、165项字面量native签名静态核对、BootyBay阻塞复现及新增250ms模拟入口；没有运行旧全套测试、三图遍历、逐位CPU、全资产或性能基准。最新Win32 Release产品无警告，SHA-256 `035b4a2c02f786f355fa927481a21b49aa37c815c34e02a8a5aa71793c96bbe4`。原图globals/config/main退出0，推进后bj_gameStarted=true，无Game.dll，预载缺失0。它不证明地图已经显示、单位可操作或完整玩法通过；功能/原版一致性继续在阶段A集中验证。证据与必要边界见 `script-events.md` 和 `tmp/docs-artifacts/war3/stage-a-*`。旧MEngine161–163仍延期。


## 阶段A：原图场景和基础命令（W028–W030）

| 任务 | 主要路径 | 已实现消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- | --- |
| W028原地图世界绘制 | scene_assets/math/objects、terrain_scene/layout、model/pose、renderer | 地面混合、源悬崖/坡道/动画水面；DOO及w3b/w3d、单位/物品MDX、队伍色、静态缓冲与空间裁剪 | 三图拓扑/透明材质、动画、路径贴图变换、缩放/设备恢复、预算边界、CPU/GPU内存与帧耗时；光照/迷雾/粒子/LOD继续实现 | 已接入；BootyBay画面开发复现通过，完整待阶段验证 |
| W029开局/载入/返回 | game_loading、loading_screen、map_browser、main、fdf、platform | 源PlayGameButton、现有会话转移、后台main/CPU准备、实数GPU上传进度、源Loading/ConsoleUI、取消/失败/返回和--play | 菜单鼠标/键盘开始，三图、取消/快速切换/失败重试、退出时资源释放、CPU工作取消延迟、连续切图无磁盘增长；完整源游戏内菜单待实现 | 已接入；开局/返回开发复现通过，队列未关闭 |
| W030相机/选择/基础命令 | game_view、world_path、session_orders/tick/entities、script_state | 六档源相机/有界滚轮、平移、选择/框选/Shift/源圈、同一native/UI移动与S/H、WPM八邻A*和固定步进、订单事件 | 实际移动轨迹/终点、不可达/穿角/边界/半径、删除/事件重入、缩放上下限、相机边界、选择/命令时序；动态碰撞/编队和完整类型待实现 | 已接入；选中1单位和接受移动命令、滚轮输入开发复现通过，完整待阶段验证 |

本批必要Win32 Release产品编译无警告、差异检查通过。只运行BootyBay新开局/窗口输入的最小开发复现：最新CPU准备1156ms、192纹理、177区块、2011放置物、65单位，30游戏帧退出0，无Game.dll，随后返回选图；首次地图画面另有20帧证据。未检查移动终点/全缩放边界，不作为完整玩法或性能验收。原始产物为 `tmp/docs-artifacts/war3/scene-{build.log,input.ps1,input.log,bootybay.log,bootybay.png}`。没有运行旧测试全集、三图遍历、逐位CPU对照或全资产基准。阶段A其余功能继续实现；三图及输入/还原/释放/性能集中执行后才关闭本队列。旧MEngine161–163继续延期。

阶段验证入口：使用 `--map <地图> --play` 分别进入Amazonia、BootyBay、DotA_v6.83d，合并验证上表；无GPU的初始化故障先用 `--main-check --map <地图> --simulate-ms <区间>` 缩小。只重测失败及修复影响范围；截图/采样均写 `tmp/docs-artifacts/war3/`。


## 阶段A：运行中世界消费接续

| 任务 | 主要路径 | 实际消费 | 待合并验证 | 状态 |
| --- | --- | --- | --- | --- |
| W031单位呈现和资源队列 | session_visual/entities/orders、scene_assets/streaming、model/pose、game_view | 颜色/alpha/缩放/高度速率/动画、CPU后台解码、依赖复用、GPU交付边界 | 动态GPU实例、透明材质、全部序列/队列、取消/预算/切图、设备恢复；--play返回单人界面补充路径 | 已实现；CPU交付/单位状态定向检查通过，GPU待测 |
| W032区域/聊天/物品栏 | spatial_region、session_spatial_events/inventory/text、game_view/main | 点/区域成员、进入离开/接近/聊天生产者、文字/Unicode输入、槽位/拾取丢弃事件/物品图标 | 量化和事件时序、重入删除、完整库存能力/死亡/使用、频道/布局/文本边界 | 已实现；区域进入和3次物品事件在复制原图中通过；其他待测 |
| W033视野/天空/typed storage | fog_grid/render、session_fog/cache/hashtable、world、terrain_scene | 单位昼夜/共享视野、modifier启停/优先级、模型/地形投影、源天空、基本类型/句柄和键值清理 | 原版迷雾刷新/分辨率/遮挡、shader画面/恢复、hash类型交叉与句柄寿命、字符串边界；持久w3v与同步待实现 | 已实现；CPU视野/存储检查通过，新增GPU待测 |
| W034无输出设备的显式静音 | audio_duration、audio、sound、music | 原WAV/MP3/SMF时长和逻辑voice，播放/循环/暂停/定位/渐变，取消静音回到Miles | 时长/格式错误边界、自然结束/速率/切换；有声Miles/3D/听感继续按原范围验证 | 静音原图初始化/状态通过；未验证有声输出 |

只执行开发必需Win32 Release产品/定向程序编译、源native签名校验、当前开局阻塞定位及1项新增消费者集成检查。夹具在复制BootyBay中延迟创建单位，跨API检查区域进入、3次物品事件、视野覆盖/停止、基本类型/句柄读写与清理、外观/高度状态及CPU后台解码；通过1、失败0，GPU未执行。夹具生成器保留原图只读，所有map/JSON/log仍写 `tmp/docs-artifacts/war3/`。

Amazonia原globals/config/main与250ms推进退出0：102单位、55触发器、83事件，bj_gameStarted=true，无Game.dll；显式静音device voices/DLS均为0。DotA最新到121单位/13触发器/74事件，在 `Scripts/war3map.j:91823` AddUnitToStock失败。当前Windows会话Disconnected，实际D3D9/9Ex/On12设备创建均失败；新增GPU画面/输入/恢复/释放仍排队，未关闭阶段A。已有3fc434c帧不复用为新增GPU消费者通过证据。

原始证据为 `live-world-{build.log,consumers.log,streaming.log,amazonia.log,dota.log,amazonia-render.log}`，均在 `tmp/docs-artifacts/war3/`。未运行旧全套、三图完整回归、性能或逐位原件对照。原件精度、完整交互和性能继续合并验证，旧MEngine161–163继续延期。实现细节与复现命令见live-world.md。


## 阶段A/B：商店、训练与人口（W035–W037）

| 任务 | 主要路径 | 实际消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- | --- |
| W035商店库存和购买 | session_commerce、commerce、session_entities | 源售卖清单/价格/补货，库存及中立订单native，真实扣费/单位/物品/事件 | 原件库存/买家选择/前置/出生点/售卖时序、重入、DotA商店；英雄雇佣额度及物品使用/出售另行实现 | 已接入；编译通过，运行待阶段验证 |
| W036单位生产与人口 | session_production/food/orders/tick/callbacks | 7项队列、扣费/退款、队首预留、完成单位/事件/集结点、人口生命周期/转让 | 队列/事件重入删除转让、资源溢出/人口边界、死亡/取消/出口阻塞、完整类型/原件精度 | 已接入；编译通过，专项夹具排队 |
| W037源产品命令区 | game_commands/view、object_data/session_game | 产品图标/位置/热键/价格/库存/禁用、进度/取消，流式图标、GetObjectName及能力名称表 | 真窗口鼠标/键盘/热键冲突/工具提示/源HUD排版、动态GPU、地图切换与三图回归 | 已接入；GPU及输入待测 |

只执行开发必需Win32 Release产品和新消费者程序编译、差异检查与DotA开局阻塞最小复现。编译无警告。DotA已越过AddUnitToStock和GetObjectName，当前121单位/13触发器/74事件，停在Scripts/war3map.j:8416的SetPlayerHandicapXP；main未完成。没有运行专项夹具、旧全套、三图完整回归或性能基准。新消费者生成器和运行命令见commerce.md，原始日志在tmp/docs-artifacts/war3/commerce-{build.log,dota.log}。阶段队列及旧MEngine延期状态保持开放。


## 阶段A/B：英雄成长和地图标记（W038）

| 主要路径 | 实际消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- |
| session_hero、entities/session、game_commands、session_world/game_view | 源经验阈值/公式、等级/三属性/HP/MP/技能点、经验倍率/暂停、原版能力学习/事件与HUD；Alt小地图资源/绘制 | 原件倍率适用范围/舍入/属性语义、历史规则集、升级/学习重入、完整效果、图标/输入/GPU；自定义w3a、完整战斗及经验分配未完成 | 已接入；必要编译/开局阻塞定位，专项夹具待阶段执行 |

英雄与商店共用war3_commerce_tests/复制BootyBay夹具，新增经验倍率/暂停、升级/学习上下文、属性及生命上限检查，未执行。DotA越过SetPlayerHandicapXP、SetAltMinimapIcon和GetItemType，最新123单位/1物品/67触发器/700事件，停在UnitAddItem拾取脚本的IsUnitIllusion（Scripts/war3map.j:17014）；main未完成，幻象子系统仍待实现。Win32 Release产品及扩展消费者编译无警告，字面量native签名静态核对通过。源签名与说明见heroes.md。没有扩大为旧全套、三图完整回归、性能或原件逐位检查。


## 阶段A/B：能力、幻象与物品使用（W039–W041）

| 任务 | 路径与实际消费 | 合并待测 | 状态 |
| --- | --- | --- | --- |
| W039能力覆盖 | object_data；w3a元数据/等级/Data槽/继承，能力查询/英雄学习/物品共用 | 复杂覆盖/索引/损坏文件/历史规则；自定义效果仍逐项实现 | 编译/开局读取通过，专项待测 |
| W040物品与幻象 | session_illusion/item_use/inventory、game_view/commands；魔棒实例、药水、次数/魔法/冷却、事件/定时生命/人口、输入/蓝色外观 | 原件复制/倍率/时序、重入删除、输入/目标/失败/GPU、释放/性能 | 已接入，消费者夹具未执行 |
| W041基础脚本伤害 | session_damage/callbacks；源分类/基础护甲/幻象倍率、伤害/来源/死亡/击杀者 | 完整防御/护盾/魔免/自动战斗/经验尚未实现；原件公式/边界/重入 | 已接入，数值/事件夹具未执行 |

开发必需Release产品/扩展消费者编译通过；22个字面量native声明和生成器语法检查通过。DotA原main已完成，123单位/1物品/205触发器/1,303事件，无Game.dll；250ms推进仍在延迟CreateQuest失败，完整开局未通过。专项夹具复用war3_commerce_tests，增加w3a/w3t覆盖、召唤/真假、伤害倍率、药水/冷却和定时生命/人口断言，保持待阶段执行。REA确认原版IsUnitIllusion注册和单位标志，细节见illusions-items.md。新GPU、专项夹具、三图完整玩法和性能未执行。


## 阶段A/C：任务窗口与开局查询（W042–W043）

| 任务 | 实际消费 | 合并待测与缺口 | 状态 |
| --- | --- | --- | --- |
| W042任务状态/窗口 | session_quest、quest_dialog、game_view、glue；真实句柄/目标/发现/完成/失败/通知，原QuestDialog FDF/纹理/字体/勾选/F9/焦点/文字翻页 | GPU/源锚点/皮肤/长文/真实输入/增删/释放；完整滚动条和未发现任务展示、暂停规则待完成/对照 | 已接入；编译通过，窗口/专项夹具待测 |
| W043空槽与源分类 | session_entities/main；空物品槽查询、武器启用位/类型/目标和召唤分类、任务数量日志 | 非零失效句柄/边界、完整类型、原件分类精度及重入；未知状态分类仍明确失败 | 原件空槽依据及DotA阻塞复现通过；完整待测 |

必要Release产品及扩展消费者编译无警告，8个字面量任务native声明核对通过，实际DotA模块绑定/创建任务通过。DotA原main完成：123单位/1物品/205触发器/1,303事件；250ms推进创建6任务后在Scripts/war3map.j:32750的IsPointBlighted失败，无Game.dll，完整开局未通过。任务/目标/通知、空槽和近战源分类断言加入既有消费者，尚未执行。原始证据为tmp/docs-artifacts/war3/quests-{build,dota}.log、quest-item-*-rea.json。没有运行专项夹具、三图完整玩法、GPU或性能；旧MEngine延期状态保持。
