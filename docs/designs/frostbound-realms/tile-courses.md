# 地块材质与分层岩壁

Author: MiYu

自动地表使用两单位地块网格上的连续角点变化，控制土壤／草地／积雪覆盖、扫描纹理变体混合和土壤色差。世界坐标使相邻分块采用同一套权重；明确绘制的材质仍沿用地表画刷数据。

岩壁每隔两个世界单位重复一个几何岩层，包含顶缘斜面、突出岩架和收回的下段。平直岩壁按四分之一单位增加纵向采样；坡道接头保留共享细分位置。每层岩架配合土壤覆盖和凹部阴影。顶部三角形、地图高度与单位落点保持一致，冰壁和砌石的几何轮廓沿用各自样式。

`cargo test -p mengine-assets terrain_mesh --lib` 检查岩层重复、6 单位岩壁、192 种接缝组合、水域分块和 JavaScript／原生地表一致性。着色器四后端编译、原生脚本、完整 JavaScript／TCP、身体间隙和缓坡规则各自验证。`node scripts/qa-frostbound.mjs --ground-only --tile-courses --deterministic-input` 在独立原生项目内生成 2／4／6 单位阶地，检查三种地形套件、地图存读档和试玩；该测试场景不写入游戏地图。常规地图另用 `--tilesets --deterministic-input` 验证绘制、撤销、存读档、双客户端和重连。

使用 Release 原生编辑器时需启用 `--features tauri/custom-protocol`，并指定独立构建目录，避免覆盖正在运行的编辑器。截图和结果见 `tile-courses-validation.json`、`courses-native-tile-courses-qa.json` 与 `courses-map-native-qa.json`。当前 Player 在 `samples/frostbound-realms/Builds/windows-x64/Frostbound Realms.exe`。

这次完善地块变化与岩壁层次，尚未达到原版全部地形模块和美术表现。人工物理输入、音频、跨机器联机与稳定 Player 帧耗未由这些检查确认。
