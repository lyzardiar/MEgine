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

主菜单的“单人模式(S) → 自定义游戏(G)”进入地图目录列表，可用鼠标选择、双击目录、滚轮、上下/翻页/Home/End、Enter 与 Backspace 浏览。取消(A)或 Escape 返回上一级界面。`--map <路径>` 在选图界面定位任意地图；`--probe --map <路径>` 直接读取 W3I/WTS/W3E/WPM。开发导航检查为 `--menu-check --map <路径> --hidden --frames 120 --capture <PNG路径>`，同时生成单人模式与选图帧。

已接入按钮按原版 FDF 焦点链支持 Tab／Shift+Tab 和 Enter／Space；选图中的 Tab 在列表与已接入按钮之间切换。列表名称、人数和类型来自可见地图的 512 字节 HM3W 文件头，选中文件后读取完整元数据与预览。地图尺寸分类、地形中文名和字体尺寸直接使用原版配置。

完整内容按 [功能矩阵](docs/acceptance.md) 跟进，独立验证见 [测试队列](docs/testing-batches.md)。当前版本是客户端基础设施，地图信息与原生记录可读取，“开始游戏”尚未接入会话，完整载入、战斗、JASS、战役和网络仍待实现。菜单 MDX 已绘制，logo 精确比例、灯光、雾、粒子、完整 FDF 与交互仍需还原和对照验收。

StormLib 来源、版本和逐文件摘要见 [source-info.json](third_party/stormlib/source-info.json)，许可证在 [LICENSE](third_party/stormlib/source/LICENSE)。原安装资源和 DLL 不随项目分发。REA 作为开发分析工具，不参与游戏运行。
