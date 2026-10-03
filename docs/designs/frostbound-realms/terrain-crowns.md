# 崖顶露头与岩土坡面

Author: MiYu

岩壁扫描材质延伸至崖顶露头，与坡面岩土同时混合颜色、法线和粗糙度。坡道上的雪量随几何坡度减少；平缓地表保留积雪。露头边界结合扫描高度和世界空间噪声，崖顶土层延续岩壁色调。地表绘制材质的插值坐标加入局部扰动，雾与河岸沿用各自的采样路径。

使用现有 Poly Haven CC0 岩壁、土壤、雪地素材，来源及哈希见 `samples/frostbound-realms/ground-sources.json`。本次仅修改 `Ground.mshader`，地图高度、网格、坡道和通行逻辑沿用当前实现。

验证：四后端着色器编译、地形回归、独立 Release 实例的地表渲染、实际指针登坡、地图保存读取和游戏存档恢复；记录见 `native-crown-qa.json` 与 `terrain-crowns-validation.json`。截图为 `crown-ridge-overview.png`、`crown-ridge-summit.png`，同机位前一版为 `gentle-ridge-overview.png`。

当前地块轮廓仍偏规则，尚未复刻原版完整地形套件；本阶段完成崖顶与坡面的材质衔接。自动化运行截图与输入验证不代表人工物理输入或稳定帧耗验收。
