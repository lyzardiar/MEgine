# War3 原生客户端

使用 C++20、Win32 x86、MSVC 和 CMake 独立重建 Warcraft III 1.27.0.52240 客户端。运行不依赖 MEngine、Rust、Tauri、Node.js，不加载原版 Game.dll。原安装只读，StormLib 直接将 MPQ 和地图成员读取到内存。

```powershell
cd watcher/war3
cmake --preset windows-x86
cmake --build --preset release --parallel
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
```

可指定 `--map Maps/FrozenThrone/(2)Amazonia.w3x`、`--renderer d3d9`、`--mute`、`--log <路径>`。开发检查入口为 `--probe` 和 `--hidden --frames 120`。默认日志位于 `%LOCALAPPDATA%/MEgine/War3/Logs/client.log`；地图运行不生成解包目录。

开发帧输出可加 `--capture <PNG路径>`，仅在限定帧数或退出按钮结束运行时写出指定证据。`--time-ms 0` 固定动画时间；`--window-check --frames 120` 检查缩放、最小化恢复、鼠标取消与 Q 退出。`--renderer d3d9-reference` 选择系统参考光栅器，仅用于正确性检查。

渲染器优先使用 Direct3D 9；设备能力不可用时依次尝试 Direct3D 9Ex、系统 D3D9On12Ex。实际驱动名称写入日志。D3D9 与 D3D9Ex 的菜单帧输出、窗口缩放及恢复均已有运行证据。主菜单从原版 FDF 读取模板、中文、布局和快捷键，从 `war3skins.txt` 选择字体；原版 Miles 从 `redist/miles` 加载 MP3 codec，直接播放 MPQ 内存中的音乐。

主菜单的“单人模式(S) → 自定义游戏(G)”进入地图目录列表，可用鼠标选择、双击目录、滚轮、上下/翻页/Home/End、Enter 与 Backspace 浏览。取消(A)或 Escape 返回上一级界面。`--map <路径>` 在选图界面定位任意地图；`--probe --map <路径>` 直接读取 W3I/WTS/W3E/WPM。开发导航检查为 `--menu-check --map <路径> --hidden --frames 10000 --capture <PNG路径>`，等待配置完成后生成选图和下拉菜单帧，完成导航即退出；配置等待超过30秒或帧数耗尽而步骤未完成时检查失败。

已接入按钮按原版 FDF 焦点链支持 Tab／Shift+Tab 和 Enter／Space；选图列表、可编辑玩家控件和取消按钮统一遍历焦点。下拉菜单支持方向键、滚轮、Enter／Space、Esc 和鼠标，展开时消费底层输入。列表名称、人数和类型来自可见地图的 512 字节 HM3W 文件头，选中文件后读取完整元数据与预览。地图尺寸分类、地形中文名和字体尺寸直接使用原版配置。

玩家配置消费原版 PlayerSlot／TeamSetup FDF、中文标签和队伍颜色 BLP，保留地图玩家 ID、原始记录和势力分组，支持本地槽移动、计算机难度、种族、队伍、颜色交换和 50%–100% 障碍值。选图时后台读取元数据/预览并执行原图 globals/config，完成后按脚本配置生成玩家槽；同一工作线程只保留最新待处理选择，切图立即清空旧会话。固定设置及脚本种族锁定限制编辑，界面修改写回会话；同图重选保留草稿。配置失败会清空选择并允许重试。实际开局、原版默认 AI/占槽时序及颜色菜单网格仍待实现或对照。

完整内容按 [功能矩阵](docs/acceptance.md) 跟进，独立验证见 [测试队列](docs/testing-batches.md)。当前版本是客户端基础设施，地图信息与原生记录可读取，“开始游戏”尚未接入会话，完整载入、战斗、JASS、战役和网络仍待实现。菜单 MDX 已绘制，logo 精确比例、灯光、雾、粒子、完整 FDF 与交互仍需还原和对照验收。

当前按[集中实现清单](docs/implementation-roadmap.md)先覆盖可运行流程，再集中测试修正。[对象初始化](docs/entities.md)已接入源对象表、单位/物品状态、天气实例和普通数字声音基础，只有编译/静态检查，运行与原版一致性待阶段验证；后续继续连接调度、世界画面、输入和开局。历史测试通过数保留原验证版本范围。

原生脚本开发入口为 `--script-check --map <路径>`，可配合 `--hidden`，直接从公共 MPQ 和地图读取 common.j、Blizzard.j 与地图脚本，解析类型/槽位并编译执行指令，不需要图形设备。Runtime 可执行已绑定 native 的脚本；当前产品检查只编译地图，不执行其全局初始化或 config/main，见 [JASS 链路](docs/jass.md)。

`--config-check --map <路径>` 执行原图全局初始化与config，保存玩家/队伍/出生点等状态；Amazonia、BootyBay、DotA_v6.83d已合并通过。此入口不执行main，开始游戏尚未接通，见[地图配置会话](docs/session.md)。

后台选图和配置检查已挂接原地图世界，保留W3E/WPM，并支持位置/矩形及相机/昼夜模型/水色状态。`--main-check --map <路径>` 实际尝试执行原图main；遇到未绑定native会记录源位置并非零退出。Amazonia当前推进至AddWeatherEffect，尚无地图渲染或可玩对局，见[原生世界与主函数](docs/world.md)。

地图会话保留[共享归档视图](docs/archives.md)，加载后仍直接读取地图资源。菜单和游戏声音使用[共享Miles后端](docs/audio.md)，支持内存WAV/MP3及原MIDI+DLS。[脚本MIDI对象](docs/script-sound.md)已接入源表、实际播放和非空间MIDI渐变，[脚本音乐](docs/script-music.md)支持原版曲目表、独立声音随机流、暂停/恢复、定位与50ms渐变；[游戏时间控制](docs/game-clock.md)已接入同步初始化状态。BootyBay原main已推进至CreateUnit，模拟推进/事件、3D环境、世界渲染和实际开局继续实现。

StormLib 来源、版本和逐文件摘要见 [source-info.json](third_party/stormlib/source-info.json)，许可证在 [LICENSE](third_party/stormlib/source/LICENSE)。原安装资源和 DLL 不随项目分发。REA 作为开发分析工具，不参与游戏运行。
