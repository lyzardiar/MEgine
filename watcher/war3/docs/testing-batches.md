# 独立客户端测试队列

每个功能任务单独提交，默认累计三项合并验证。编译和已知故障的最小复现可即时执行；不运行旧 MEngine 全量检查。证据保存在仓库根目录 `tmp/docs-artifacts/war3/`。

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W001 原生程序与归档 | CMake、platform、archive、renderer、main | x86 独立构建；MPQ覆盖；无Game.dll；D3D9帧输出、缩放、最小化 | 归档错误不能回落；切图引用释放；设备恢复 | CPU通过，D3D9运行待验收（1/3） |
| W002 图像、字体和音频边界 | image、media、main、rea-boundaries | BLP1/JPEG/palette、BLP2/BC、TGA；原版字体纹理；Miles内存MP3 | IJL调用约定和透明平面；音频buffer生命周期 | 图像CPU通过，字体/音频运行待验收（2/3） |
| W003 原版MDX菜单场景 | model、model_pose、binary、archive、renderer、main、tests | MDX800层级、动画、相机、材质；纹理别名覆盖；三分量/四分量JPEG；真实帧输出 | 不可信记录边界、设备恢复参数、远程显示能力 | 原菜单CPU读取通过，GPU待验收（3/3） |

快速构建：`cmake --preset windows-x86`，`cmake --build --preset release --parallel`。运行检查使用 README 的原安装路径、`--probe` 或 `--hidden --frames 120 --log <本地证据路径>`。完整玩法、视觉还原与性能验收不能由 probe 替代。

W001 必要快速检查：MSVC 19.51 Win32 Release 配置和编译通过；`--probe` 实际挂载4个公共归档、读取62,316字节原版字体并正常退出，未加载Game.dll。证据为 `tmp/docs-artifacts/war3/core-build.log`、`core-probe.log`。D3D9实际绘制、设备恢复和切图仍待合并验证。

W002 必要快速检查：增量编译通过；真实logo、菜单背景、按钮及Footman四张BLP成功解码，probe退出0。`media-build.log`、`media-probe.log`记录实际输入与尺寸。透明平面合成、三分量JPEG、Miles播放和实际字体绘制等待合并验证。

W003 必要检查：实际原版TFT菜单MDX读取18个geoset、211个node、49个texture，解码纹理11,292,672字节，probe退出0且无Game.dll，见`scene-probe.log`。只读审核发现并修复Reset对传入尺寸的回写问题，期望窗口尺寸由独立参数副本保留。当前远程显示会话中HAL和REF设备创建返回D3DERR_NOTAVAILABLE，系统D3D9On12回退也未提供可用HAL；未取得GPU帧、字体绘制和音频播放证据，不能把CPU probe记为可运行菜单验收。`menu-render.log`保存设备错误，实际画面仍待具备D3D9设备的会话验证。

批次命令：`cmake --preset windows-x86 -DWAR3_BUILD_TESTS=ON`，`cmake --build --preset release --parallel 8`，再运行`build/windows-x86/bin/Release/war3_native_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/native-tests>`。测试只生成临时夹具MPQ，游戏运行不生成解包资产。原始结果写入同一证据目录，GPU未通过项继续保留。

## W001–W003 批次结果（2026-10-25，未关闭）

集成提交`d158fc1`。Win32 Release构建通过，10项定向检查全部通过：地图覆盖／引用生命周期、纹理别名来源优先级、失败挂载保护、palette透明度、JPEG四原始分量、JPEG三原始分量、BC1/2/3固定像素、TGA方向/RLE、截断/预算及二进制记录边界。JPEG参考为本地生成的常量图，原始平面每通道误差不超过2。证据`batch-{configure,build,native-tests}.log`，没有执行旧MEngine全库或地图转换检查。

Amazonia、BootyBay、DotA_v6.83d分别挂载真实w3x/w3m、读取原始地形成员和菜单资源，三个probe均退出0且无Game.dll；它们不执行地图JASS、完整地形构建或对局，不能作为游戏加载时间和玩法验收。证据为`{amazonia,bootybay,dota}-probe.log`与`map-probes.json`。PE检查为0x14c x86，仅导入系统DLL；原版IJL按固定摘要动态载入，未导入Game.dll，见`pe-dependencies.log`。

剩余：D3D9设备创建、真实画面、窗口尺寸变化/设备恢复、实际字体与Miles播放仍未通过。该批保持未关闭，先解决设备路径并补运行证据，再开展下一批；旧转换缓存尚不满足清理条件。独立只读审核确认Reset参数副本修复，未发现所审范围内其他可证实高严重度缺陷，审核不替代GPU运行。
