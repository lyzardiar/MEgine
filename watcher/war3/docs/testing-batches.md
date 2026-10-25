# 独立客户端测试队列

每个功能任务单独提交，默认累计三项合并验证。编译和已知故障的最小复现可即时执行；不运行旧 MEngine 全量检查。证据保存在仓库根目录 `tmp/docs-artifacts/war3/`。

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W001 原生程序与归档 | CMake、platform、archive、renderer、main | x86 独立构建；MPQ覆盖；无Game.dll；D3D9帧输出、缩放、最小化 | 归档错误不能回落；切图引用释放；设备恢复 | 实现完成，待批次验证（1/3） |
| W002 图像、字体和音频边界 | image、media、main、rea-boundaries | BLP1/JPEG/palette、BLP2/BC、TGA；原版字体纹理；Miles内存MP3 | IJL调用约定和透明平面；音频buffer生命周期 | 实现完成，待批次验证（2/3） |

快速构建：`cmake --preset windows-x86`，`cmake --build --preset release --parallel`。运行检查使用 README 的原安装路径、`--probe` 或 `--hidden --frames 120 --log <本地证据路径>`。完整玩法、视觉还原与性能验收不能由 probe 替代。

W001 必要快速检查：MSVC 19.51 Win32 Release 配置和编译通过；`--probe` 实际挂载4个公共归档、读取62,316字节原版字体并正常退出，未加载Game.dll。证据为 `tmp/docs-artifacts/war3/core-build.log`、`core-probe.log`。D3D9实际绘制、设备恢复和切图仍待合并验证。

W002 必要快速检查：增量编译通过；真实logo、菜单背景、按钮及Footman四张BLP成功解码，probe退出0。`media-build.log`、`media-probe.log`记录实际输入与尺寸。透明平面合成、三分量JPEG、Miles播放和实际字体绘制等待合并验证。
