# 分层地块与岩壁

Author: MiYu

地形以 2 世界单位的地块组织，每个渲染块包含 4×4 地块。`terrain4r:` 网格键保存渲染块坐标及 6×6 邻接高度；原有 `terrain4:` 格式继续可用。相同高度的接缝共用世界坐标，邻接地块决定是否生成露出的岩壁，避免为每格绘制完整盒子。

每格顶面细分为 4×4 面片。露出的高地顶沿向内收边，转角由周围四格共同决定；岩壁以四段水平和四段竖向面片连接高地与低地，并在中部加入有限的岩面起伏。地块轮廓带有小幅确定性变化，相邻渲染块复用相同边界计算。逻辑高度、坡道方向、建造检查、存档和寻路继续使用原有高度数据；视觉轮廓收边最大 0.3 世界单位，不改变逻辑通行边界。

顶面传递邻接高差产生的崖脚遮蔽和高地边缘权重。地表着色器据此减少边缘积雪、显示土层顶沿并压暗崖脚，岩壁继续使用现有 Poly Haven CC0 扫描及世界坐标投影。没有新增纹理槽或第三方依赖。此阶段改善分层地块的体积与拼接表现，尚未达到原版全部地形套件、悬崖转角造型和美术风格的一致复刻。

## 验证入口

```powershell
cargo test -p mengine-assets terrain_mesh
node scripts/test-frost-terrain.mjs
cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends
cargo test -p mengine-editor-host --test frost_sample
$env:MENGINE_QA_CAPTURE_PREFIX='tile-after-'
node scripts/qa-frostbound.mjs --ground-only
node scripts/qa-frostbound.mjs --terrain-only
```

原生验收使用带 `tauri/custom-protocol` 的独立 Release 编辑器和 Agent 输入。高地移动验收明确增加一名友方英雄用于登坡，默认对战开局保持现有规则。高度笔刷、撤销、地图保存读取和重复试玩属于本阶段验收。人工物理输入和音频聆听尚未验证。

同机位截图：[之前](tile-before-ground-highland.png)、[之后](tile-after-ground-highland.png)。操作截图：[高度编辑](tile-after-highland-editor.png)、[沿坡道登高](tile-after-highland-ascent.png)。记录见 [阶段验证](terrain-tiles-validation.json)。基线通过 `--tile-baseline` 在独立样例副本中读取提交 `6f3c306` 的地形脚本及着色器；主工作区不回退。
