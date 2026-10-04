# 岩壁轮廓变体

Author: MiYu

岩石悬崖的两单位高度模块具有三组横向与纵向轮廓。不同纵向轮廓的凸面分别靠近上部、中部和下部，横向轮廓偏向不同侧面；每个高度层选用对应的一组。世界坐标通过整数混合选择基础变体，使长直崖壁不按三个地块固定循环。同一坐标、地图和引擎版本始终选择同一轮廓。

模块侧沿、上沿和下沿继续落在共享边界，局部岩面外凸不超过 0.36 世界单位。顶面、崖顶肩面、转角、坡道、贴地和拾取规则沿用已有几何；四列横向采样和四分之一单位高度采样保持不变。冰壁与砌石沿用各自的造型。地图格式为 1，协议为 31。

结构参考继续使用已登记的 MIT `mdx-m3-viewer` 悬崖变体表，见 [岩石悬崖模块](cliff-modules.md)。当前轮廓由引擎生成，完整原版模型套件尚未完成。

`cargo test -p mengine-assets terrain_mesh` 检查轮廓差异、闭合边界、有限且受限的顶点、192 种接缝组合和 72 组脚本／原生顶面样本。脚本通行验证使用 `scripts/test-frost-terrain.mjs`、`scripts/test-frost-gentle-ramps.mjs` 和 `scripts/test-frost-cliff-clearance.mjs`。

原生对照使用同一脚本、场景、着色器和素材，仅替换 Release 引擎。`node scripts/qa-frostbound.mjs --ground-only --ramp-modules --deterministic-input` 展示森林、雪地、荒地及 2／4／6 单位高地，并检查地图存读档、试玩、六级坡道上下行和原生单位位置。`node scripts/qa-frostbound.mjs --terrain-only --deterministic-input` 检查高度画刷、撤销、存读档和英雄登坡。结果与运行包验证见 `cliff-facet-validation.json`。

程序轮廓仍存在重复特征；完整原版地形、植被和游戏内容需继续完善。自动原生验收不包含人工鼠标、听音、跨机器联机和稳定帧率。
