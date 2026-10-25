# War3 原生客户端

使用 C++20、Win32 x86、MSVC 和 CMake 独立重建 Warcraft III 1.27.0.52240 客户端。运行不依赖 MEngine、Rust、Tauri、Node.js，不加载原版 Game.dll。原安装只读，StormLib 直接将 MPQ 和地图成员读取到内存。

```powershell
cd watcher/war3
cmake --preset windows-x86
cmake --build --preset release --parallel
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
```

可指定 `--map Maps/FrozenThrone/(2)Amazonia.w3x`、`--renderer d3d9`、`--mute`、`--log <路径>`。开发检查入口为 `--probe` 和 `--hidden --frames 120`。默认日志位于 `%LOCALAPPDATA%/MEgine/War3/Logs/client.log`；地图运行不生成解包目录。

完整内容按 [功能矩阵](docs/acceptance.md) 跟进，独立验证见 [测试队列](docs/testing-batches.md)。当前版本是客户端基础设施，完整战斗、JASS、战役和网络仍待实现。原版菜单的三维场景必须经 MDX 渲染恢复，窗口启动不等于菜单还原验收。

StormLib 来源、版本和逐文件摘要见 [source-info.json](third_party/stormlib/source-info.json)，许可证在 [LICENSE](third_party/stormlib/source/LICENSE)。原安装资源和 DLL 不随项目分发。REA 作为开发分析工具，不参与游戏运行。
