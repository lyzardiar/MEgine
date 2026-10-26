# War3 原生客户端

使用 C++20、Win32 x86、MSVC 和 CMake 独立重建 Warcraft III 1.27.0.52240 客户端。运行不依赖 MEngine、Rust、Tauri、Node.js，不加载原版 Game.dll。原安装只读，StormLib 直接将公共 MPQ 和地图成员读取到内存；运行地图不生成解包目录。

```powershell
cd watcher/war3
cmake --preset windows-x86
cmake --build --preset release --target war3 --parallel 8
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
```

主菜单通过“单人模式 → 自定义游戏”进入地图目录。选择地图、调整玩家配置后，点击原版“开始游戏”按钮，后台运行原图main并准备场景，在窗口线程分帧上传GPU，进入游戏画面。载入阶段按Esc取消；游戏阶段Esc、F10或顶部菜单入口返回选图。完整游戏内暂停菜单仍待实现。

`--map <w3m/w3x路径>` 定位选图；增加 `--play` 自动进入所选地图，支持原安装内相对路径或外部绝对路径。例如：

```powershell
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map 'Maps/(2)BootyBay.w3m' --play
```

地图画面已接入原W3E纹理混合、悬崖、坡道、动画水面，原DOO树木/装饰物，脚本创建的单位/物品模型，以及原版ConsoleUI九片控制台。地形使用静态GPU区块，装饰物使用空间区块与视锥裁剪。相机读取原MiscData六档角度/距离，滚轮有界缩放；方向键和边缘滚屏平移，左键/框选/Shift选择单位，右键或M后点地面移动，S停止，H保持位置。移动查询WPM并按模拟步进推进；完整碰撞、编队、战斗和规则继续实现。

运行中单位外观、模型/图标后台读取、区域/接近/聊天事件、基础物品栏、视野、哈希表和会话缓存已接入；显式 `--mute` 的声音状态不依赖输出设备。Amazonia原main及250ms推进已通过，DotA当前停在商店库存。新增GPU画面与完整客户端能力仍待阶段验证，见[运行中世界状态](docs/live-world.md)。

BootyBay已获得原地图画面及20帧开发运行证据，无Game.dll。完整操作、三图、像素还原、性能与切图释放仍在阶段A待测队列。项目尚未完成完整可玩对局、完整JASS/AI、战役、存档/回放、局域网或OpenGL。当前能力与边界见[场景流程](docs/world-rendering.md)、[功能矩阵](docs/acceptance.md)和[集中实现清单](docs/implementation-roadmap.md)。

地图列表支持双击目录、滚轮、方向/翻页/Home/End、Enter与Backspace；按钮使用原FDF焦点链，支持Tab/Shift+Tab和Enter/Space。玩家配置消费源PlayerSlot/TeamSetup、地图玩家ID、势力、颜色与种族限制，保留同图草稿，配置错误可重试。颜色网格、默认AI/占槽时序与完整像素仍待还原或核验。

其他选项为 `--renderer d3d9`、`--renderer d3d9-reference`、`--mute` 和 `--log <路径>`。默认日志为 `%LOCALAPPDATA%/MEgine/War3/Logs/client.log`。渲染器按D3D9、D3D9Ex、D3D9On12Ex顺序尝试可用设备；原版字体/BLP使用原资源及固定版本IJL，Miles从指定安装加载音频库与codec，辅助DLL检查架构和摘要。

开发入口按用途选择，避免无关重复检查：

- `--probe --map <路径>`：原生资源/地图记录读取。
- `--script-check --map <路径>`：读取、解析、链接和编译公共及地图JASS。
- `--config-check --map <路径>`：原图globals/config和配置状态。
- `--main-check --map <路径> --simulate-ms 250`：main及指定早期模拟区间；未知native记录源位置并非零退出。
- `--hidden --frames 120 --capture <PNG路径>`：限定帧输出；配合 `--play` 时帧数统计游戏画面，等待开局上限120秒。
- `--menu-check --map <路径> --hidden --frames 10000`：已有菜单导航检查；`--window-check --frames 120`：已有窗口/输入恢复检查。

开发截图、日志、JSON与采样统一放仓库根目录 `tmp/docs-artifacts/war3/`，不提交。实现期间只执行必要编译、静态检查与开发阻塞的最小复现；按[测试队列](docs/testing-batches.md)在功能阶段集中验证和修正。旧MEngine待测批次继续延期；旧转换缓存清理等待完整直接加载验收。

已有实现依据见[脚本调度](docs/script-events.md)、[JASS](docs/jass.md)、[对象定义](docs/entities.md)、[共享归档](docs/archives.md)、[音频](docs/audio.md)及[REA边界](docs/rea-boundaries.md)。StormLib源站、版本和摘要见[source-info.json](third_party/stormlib/source-info.json)，许可证在[LICENSE](third_party/stormlib/source/LICENSE)。原安装资源和DLL不随项目分发。REA仅用于开发分析。
