# 扫描地表材质

本页记录扫描地表接入阶段；第四种扫描材质见 [自然岩壁](cliff-art.md)，当前地表混合、画面和运行包见 [冬季地表](snow-surface.md)。

森林地表、积雪和石路使用 Poly Haven 的配套 OpenGL 法线、粗糙度与高度图。雪面按 2 米的纹理周期采样；雪土交界参考相对扫描高度混合，保留突出的落叶和石块。岩壁按朝向投影石材颜色及法线，坡道将细节投影到几何切平面。材质混合只改变画面，地图地形、寻路和迷雾规则保持一致。

新增九张 1K PNG 原件，加上已有三张颜色图，共十二份来源。素材均为 CC0：`forest_ground_04` 由 Rob Tuytel / Rico Cilliers 制作，`snow_02` 由 Rob Tuytel 制作，`rocky_terrain` 由 Amal Kumar 制作。`ground-sources.json` 固定下载 URL、SHA256、作者和三张派生图哈希；Player 附带 `Assets/Licenses/ground.txt`。

`import-frost-ground.py` 将法线 XY、粗糙度、相对高度打包为线性 RGBA。16 位高度按完整范围转换，不使用会截断数值的普通灰度转换。颜色仍由独立 sRGB 纹理采样。源法线与高度梯度的相关系数为 0.78–0.86，验证 OpenGL 绿色通道朝向；世界空间采样的 V 轴使用对应反向切线。重复生成的三张派生图与清单逐字节一致。

Surface/UI Shader 支持六个自定义纹理，核心解析、材质实例、对象覆盖、编辑器和 CLI 使用同一容量。Forward 总绑定数为五个标准材质纹理、六个自定义纹理、四个环境纹理和一个阴影纹理，恰好满足 WebGPU 默认的十六纹理上限。后续新增纹理语义需重新分配绑定或引入按需求生成的布局。

## 实际画面

- 村庄：[更新前](ground-before-settlement.png)、[扫描材质](ground-settlement.png)
- 河岸：[更新前](ground-before-river.png)、[扫描材质](ground-river.png)
- 高地：[更新前](ground-before-highland.png)、[扫描材质](ground-highland.png)
- [游戏中沿坡道登高](highland-ascent.png)

截图来自原生 Release 编辑器。地表对比使用相同地图、相机和缩放；人物待机姿势随截图时刻变化。积雪与河岸仍是材质表现，没有微几何位移、实时流体或脚印交互；高地几何仍采用可编辑的分层网格。当前画面属于写实素材的 RTS 原型，尚未达到完整魔兽复刻或精细写实场景的完成标准。

## 验证

- 核心纹理 Schema：4 通过；RHI 全套：50 通过，其中包括四后端着色器编译。新增第六槽的无窗口 UI GPU 编码检查通过。
- Runtime 材质：13 通过；材质和实例解析：13 通过；编辑器材质及反射相关：29 通过；CLI 原有 68 项及新增六纹理打包/第七项拒绝检查通过。
- 地表导入检查通过，完整规则/TCP 检查通过。
- 原生地表检查覆盖村庄、河岸、高地及 64 个地块，材质管线拒绝为 0。原生地形检查覆盖高度笔刷、撤销、保存读取和英雄登高。
- 同一高地近景的单次 5 秒窗口：更新前约 7.66 FPS / render 17.86 ms，更新后约 7.73 FPS / render 19.06 ms。这是局部测量，不能证明整体性能改善；5 ms 目标仍未达到。
- Release 包共 538 文件、230,993,061 字节，内容哈希 `6200b02ad94467cb6bcef11e06e2bc5eacae85a16a1599b8ecfc9938a8614f45`。资源校验及独立 Player 30 秒启动响应检查通过，错误日志为 0。

物理鼠标键盘、音频听感和跨机器局域网未由本阶段验证。结构化结果见 [素材检查](ground-import-qa.json)、[原生地表](native-ground-qa.json)、[地形交互](native-terrain-qa.json) 和 [阶段汇总](ground-art-qa.json)。

## 复现

```powershell
python scripts/import-frost-ground.py
python scripts/test-frost-ground.py
node scripts/test-frostbound.mjs
npm.cmd --prefix packages/editor run build
cargo build --release -p mengine-runtime
cargo build --release -p mengine-editor-tauri --features tauri/custom-protocol
$env:MENGINE_QA_ROOT='D:/MEngineNativeQA'
node scripts/qa-frostbound.mjs --ground-only
node scripts/qa-frostbound.mjs --terrain-only
```
