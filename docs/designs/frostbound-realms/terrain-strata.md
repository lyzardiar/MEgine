# 分层岩壁与岩土坡面

Author: MiYu

岩石悬崖使用五点剖面形成上部退台、中部凸出的岩层及收拢的崖脚。最大凸出为 0.38 世界单位，沿地块两端衰减；顶面、崖脚及垂直拼接点共用原有边界。坡道侧壁的凸出随露出高度衰减，零高度的坡尖收拢成单点。冰壁和砌石造型继续使用各自的剖面。

坡面根据几何法线减少积雪，露出岩土，并同时混合扫描纹理的颜色、法线与粗糙度。岩壁顶沿使用薄土层和少量积雪，扫描高度打散土层边缘。平地、连续地表起伏、河床、水层、逻辑高度和通行数据保持现有格式；无新增纹理、资产下载、协议或地图数据变更。

验证入口：`cargo test -p mengine-assets terrain_mesh --lib`、`cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends`、`node scripts/test-frost-terrain.mjs`、`node scripts/test-frostbound.mjs`。原生 QA 复用 `--ridge-layout --deterministic-input` 的实际指针登坡、地图保存读取和游戏存档恢复流程。

截图见 `strata-ridge-overview.png`、`strata-ridge-summit.png`，同机位前一版见 `ridge-after-ridge-overview.png`。原生验收记录见 `native-strata-qa.json`，构建及校验记录见 `terrain-strata-validation.json`。此阶段改善岩壁体积与坡面材质，原版全部地形套件及美术一致性仍未完成；自动化输入不代表人工物理输入或音频验收。
