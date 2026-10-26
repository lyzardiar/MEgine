# 独立客户端测试队列

每个功能任务单独提交，默认累计三项合并验证。编译和已知故障的最小复现可即时执行；不运行旧 MEngine 全量检查。证据保存在仓库根目录 `tmp/docs-artifacts/war3/`。

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
| W007 JASS 源与语法树 | jass.*、archive.*、main/platform、CMake、jass_tests | 原公共库、三图脚本成员与来源、语法/位置/预算、入口、后续 VM 对 AST 的消费 | token 与字符串混淆、CR 源位置、公共来源覆盖、表达式绑定与语义 | 构建、8 项定向检查及 DotA 全脚本读取通过；VM/三图集成待后续批次（1/3） |
| W008 原版数值转换 | jass_numeric.*、numeric_tests、verify_jass_numeric_cpu、CMake | VM 实数位型、I2R/R2I 边界、原版 CPU 差分、后续 native 绑定消费 | 尾数截断、符号、越界、NaN/无穷、宿主浮点转换差异 | 定向 C++ 边界与 695/3,072 组原版对照通过；VM/算术集成待后续批次（2/3） |

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

本批目前 2/3，下一项完成后合并相关集成验证。Real 的算术、十进制/字符串转换、表达式绑定表、类型/执行栈与 native 注册仍未全部实现；不以两个转换函数的通过宣称 JASS 或对局可运行。
