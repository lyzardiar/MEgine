# 原生视口的浏览器开销

2026-09-29。浏览器绘制前先检查视口尺寸；隐藏视口不再获取运行快照。环境光与 Spine 叠加层先筛选组件，再查询活动层级。原生 Game 画面就绪后，其余实体直接跳过浏览器绘制检查。

活动层级查询沿父链调用 `list().find`。此前，即使没有 Spine，也会对所有实体执行两轮层级查询；约 1,899 个实体时产生多余的平方级扫描。现在保留需要浏览器绘制的 Spine、非活动父级过滤，以及 Inspector 直接修改后的快照同步行为。

## 实测

基线为 `b79fa4cf218d17bcb236d7b914696357e3209abe`。相同原生 Release 编辑器、1,899 实体、1280×720、4× MSAA 和资源，标准视角预热 5 秒后连续测量三个 5 秒窗口。此为顺序短窗口诊断，机器未独占，不代表长期帧率。

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 标准视角 FPS，三次中位数 | 12.13 | 13.27 |
| 浏览器 paint 耗时，三次平均值的中位数 | 6.75 ms | 3.36 ms |
| 原生渲染耗时，三次平均值的中位数 | 9.36 ms | 9.39 ms |
| 最近视角 FPS，单次 5 秒窗口 | 10.54 | 10.19 |

修改后三次 FPS 为 12.88、14.05、13.27。浏览器绘制开销约减半，标准视角呈现中位数约提高 9.4%；最近视角没有测得改善。原生请求仍约 54–58 ms，整体 5 ms 目标未达到，不能以浏览器局部节省替代端到端性能结果。

## 验证与交付

- 编辑器快照、运行态和 Spine 相关测试 11 通过、0 失败；前端及启用 `tauri/custom-protocol` 的 Release 编辑器构建通过。
- 原生标准视角性能采样、近景三维树木、远景树冠 LOD 和地图编辑器回归通过，MSAA 为 4，材质管线拒绝数 0。
- 本次仅修改编辑器前端；独立 Player 和资源沿用 [MSAA 阶段交付](multisampling.md)。物理输入、音频听感、跨机器 LAN 不在本次验收范围内。
- 完整游戏及写实美术仍未完成。近景树冠偏暗稀疏、角色及其他阵营风格、自然地形轮廓需要继续完善。

原始结果：[标准视角](native-performance-qa.json)、[美术回归](native-realistic-qa.json)、[前后对照及编辑器哈希](viewport-performance-qa.json)。前后对照保存基线摘要，后续采样覆盖标准报告时仍可核对本阶段结果。

复现：`pnpm.cmd --filter @mengine/editor build`，`cargo build --release -p mengine-editor-tauri --features tauri/custom-protocol`，随后依次运行 `node scripts/qa-frostbound.mjs --performance-only`、`node scripts/qa-frostbound.mjs --realistic-only`。
