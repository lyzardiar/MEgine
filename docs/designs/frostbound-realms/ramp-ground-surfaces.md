# 缓坡地表与崖沿材质

Author: MiYu

缓坡顶面延续相邻地块的道路、土壤、草地、岩地和积雪混合。地表法线的竖直分量在 0.60–0.85 之间控制陡坡裸岩权重；双格缓坡的竖直分量约为 0.894，不触发整面裸岩覆盖。岩石露头主要跟随崖沿权重，坡度的贡献为 0.35。颜色、法线和粗糙度共用混合权重。

岩石、冰壁和砌石悬崖通过网格 UV 中的侧壁标记使用各自扫描图集。地块的真实高度、缓坡面片、拾取、通行边界、地图数据和联机协议 29 保持一致。

验证入口为 `cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends --lib`、`node scripts/qa-frostbound.mjs --ground-only --cliff-styles --deterministic-input` 和 `node scripts/qa-frostbound.mjs --terrain-only --deterministic-input`。原生流程覆盖三种悬崖材质、编辑选择、撤销、地图和游戏存读档、试玩、64 个分块及英雄沿坡道登高。地形验收报告中的坡道数量和着色器拒绝数来自当前原生状态。

验收记录见 `ramp-ground-validation.json`、`native-ramp-ground-qa.json`、`native-ramp-terrain-qa.json` 和 `native-ramp-styles-qa.json`。实际截图为 `ramp-ground-ground-highland.png`、`ramp-ground-highland-ascent.png` 和 `ramp-styles-cliff-masonry.png`。同机位参考为 `ramp-ground-before-highland.png`。

运行包使用已验证的独立 Release runtime，包含更新后的地形着色器。全部文件的 SHA-256、文件大小与 30 秒 Player 启动检查记录在验收 JSON 中。原生自动化输入不代表人工物理输入验收；完整原版地形套件、美术一致性与稳定 Player 帧耗仍需完善。
