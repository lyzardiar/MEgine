# 冬季地表

积雪使用世界坐标中的三层噪声分布，扫描高度决定雪土交界处的覆盖。森林地表和积雪各采样两组平移坐标，颜色、法线、粗糙度与高度共用混合权重，减轻固定纹理周期的重复。融雪边缘的裸土降低亮度和粗糙度；灰褐色石路按石材高度保留石缝残雪。

本阶段沿用 Poly Haven 的 CC0 扫描资产和现有来源清单，没有新增纹理绑定或下载素材。改动位于 `Assets/Shaders/Ground.mshader`；地形笔刷、寻路、河道和迷雾仍读取现有地图数据。

## 实际画面

- [村庄](ground-settlement.png)
- [河道与石路](ground-river.png)
- [高地](ground-highland.png)

截图来自原生 Release 编辑器的地图编辑模式。积雪是材质表现，没有体积厚度、脚印或融化模拟；地表和场景仍需继续完善。

## 验证与复现

四后端着色器编译、16 份扫描原件和 4 张打包纹理校验、地形规则检查通过。原生验收覆盖村庄、河道、高地和 64 个地块，材质管线拒绝为 0。

独立 Player 使用同一可执行文件、默认单机地图和 2560×1440 视口，预热 5 秒后连续测量三个 5 秒窗口。结果为脚本帧循环间隔，不是物理显示器呈现时间；完整实测数据和本阶段包信息见 [阶段证据](snow-surface-qa.json)。

```powershell
cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends
python scripts/test-frost-ground.py
node scripts/test-frost-terrain.mjs
$env:MENGINE_QA_ROOT='D:/MEngineNativeQA'
node scripts/qa-frostbound.mjs --ground-only
node scripts/qa-frost-player.mjs skirmish
node packages/cli/dist/cli.js build samples/frostbound-realms --out samples/frostbound-realms/Builds/windows-x64 --runtime target/release/mengine-runtime.exe --skip-runtime-build --clean
./scripts/smoke-frostbound.ps1
```

物理输入、音频听感、跨机器联机及完整游戏复刻不在本阶段验证范围内。
