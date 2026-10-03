# 按地块绘制悬崖

Author: MiYu

地图编辑器的地表页新增悬崖画笔，`C` 或命令按钮循环关闭、岩石、冰壁、砌石、地图默认样式；`1–5` 切回地表画笔。两种画笔共用 1、3、5 格范围。悬崖画笔保留水域、高度、坡道、起伏和地表材质，可撤销、保存、读取并进入游戏。

可选地图字段 `cliffs` 包含 1024 个整数：0 继承地图的 `cliffStyle`，1 岩石，2 冰壁，3 砌石。未包含该字段的地图沿用地图默认样式。默认样式切换保留已绘制的地块，恢复默认画笔将选中地块设为 0。联机协议 29 要求客户端与服务器同时更新，拒绝协议 28。

原生地形网格在样式混合的分块中读取 36 格样式边界，分别生成岩层、冰壁和砌石剖面。顶面、拾取和通行边界沿用现有坐标。UV 的独立区间携带地块样式和接触阴影，避免在同一三角形中串用图集层。均匀样式继续使用原有短网格编码，水面与河床编码不变。

地图外围底板使用同样的平坦地形网格和零悬崖权重，保持地表材质的连续性。

颜色和 NRH 图集由既有 CC0 扫描素材 `rock_face_03`、`Ice001`、`castle_brick_07` 生成，每个 1024 格素材带 4 像素环绕边框。标准颜色和粗糙度绑定承载图集，不增加着色器纹理槽位。来源、许可、SHA-256 与复现入口见 `ground-sources.json`、`Assets/Licenses/ground.txt`、`scripts/import-frost-ground.py` 和 `scripts/test-frost-ground.py`。

回归入口：`node scripts/test-frost-terrain.mjs`、`node scripts/test-frost-cliff-clearance.mjs`、`node scripts/test-frostbound.mjs`、`cargo test -p mengine-assets terrain_mesh --lib`、`cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends --lib`、`cargo test -p mengine-editor-host --test frost_sample`。原生验收运行 `node scripts/qa-frostbound.mjs --cliff-tiles --deterministic-input`。

证据见 `native-cliff-tiles-qa.json`、`cliff-tile-painting-validation.json` 和 `cliff-tiles-cliffs-painted.png`。此阶段完成同图多种悬崖的编辑和渲染，完整原版地形套件、美术一致性与稳定帧耗仍未完成。
