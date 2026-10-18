# 对象中心复用当前显示帧的相机投影

Author: MiYu

Scene/Game 绘制选定当前显示帧的相机后，创建一次 `createProjection(cam, vp)`，所有八叉树候选对象中心复用它。该批次仅存在于本次绘制，下一次绘制重新建立。相机基向量、裁剪参数及 viewport 不再逐对象计算；候选集合、排序和点击区域保持相同计算结果。

16 项针对性测试通过，覆盖批量投影与单点投影精确一致、移动相机时保留已完成帧、模型点击区域和八叉树裁剪。前端与 Release 构建通过。

## Release 验收

基线 `8bf765e`，旧版后运行新版，各一次，使用同一 Frostbound Main.js。采样期间没有构建和 CPU 测试。首次 QA 在打开工程时因测试脚本读取空恢复对话框而失败，未进入采样，已退出且排除；成功两次均完成采样。实际加载的编译模块确认候选中心调用只有世界坐标参数，基线逐对象传入相机和 viewport。

| 指标 | 旧版 | 新版 |
| --- | ---: | ---: |
| Scene 绘制耗时（ms） | 7.012 | 6.799 |
| Scene 新原生帧（张/秒） | 35.935 | 36.742 |
| Scene 模拟推进（次/秒） | 25.609 | 24.991 |
| Game 全区间新原生帧（张/秒） | 34.802 | 33.739 |
| Game 固定10秒新原生帧（张/秒） | 37.400 | 36.400 |
| Game 最大绘制间隔（ms） | 78.800 | 71.500 |
| Edit 移动空画面次数 | 0.000 | 0.000 |
| Play 移动空画面次数 | 0.000 | 0.000 |

本次 Scene 绘制耗时变化为 3.04% 下降。仅一次顺序配对，不能证明稳定帧率或把运行间波动归因于代码。Game 全区间包含采样启停和桥接读取；固定10秒从首个绘制时间加1秒起计，保留窗口内停顿。未宣称 Game 整体性能提升或稳定60 FPS。

Edit/Play 移动空画面均为0；等待相机请求时拾取、父子变换和激活、真实 Footman GLB 点击、Warcraft 模型姿态、粒子/UI、GPU Canvas、相机预览、层级滚动、暂停/单步/停止重启和资源刷新通过。两次自有 QA 编辑器退出，临时材质及 meta 移除，隔离 Main.js 恢复并核对哈希。其他机器及多窗口/DPR 尚未验收。

完整验收记录 (`entity-center-projection-performance.json`)

移动中的 Scene (`entity-center-moving.png`)

Release 构建耗时 8分46秒，已有 `world_from_snapshot` 未使用警告。先运行 `npm.cmd --prefix packages/editor run build`，再运行 `cargo build --release -p mengine-editor-tauri --features custom-protocol`，以重新嵌入前端。
