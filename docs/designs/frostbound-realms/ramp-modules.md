# 坡道侧壁与悬崖分层

Author: MiYu

岩石坡道侧壁的每条竖向采样列按四分之一世界单位高度划分，连接相邻列时保留各自的节点。高度逐渐变化的侧壁因此包含岩块上沿、凹面和崖脚的轮廓，能与相邻直崖的高度节点对接。坡道末端的重合节点不生成退化三角形。

行走顶面、地块共享轮廓与落地高度保持兼容；冰壁与砌石采用现有网格。地图格式、协议 30 和六张产品地图保持兼容。侧壁细分数量随高度变化，受地块高度范围与四列采样上限约束。

网格回归检查构造六单位高的斜崖，在内侧采样列检查首个倒角和公共高度格点，并检查有限法线与网格预算。原生 QA 地图增加六段连续缓坡、宽三格，验证三个地形主题、地图保存/载入/试玩及英雄上下坡；通过原生单位 Transform 验证六单位高地上的模型高度。专用地图只存在于隔离 QA 项目，不写入产品地图。

验证结果见 `ramp-modules-validation.json`、`ramp-modules-native-qa.json` 和 `ramp-modules-player-smoke.json`。

```powershell
cargo test -p mengine-assets terrain_mesh
node scripts/qa-frostbound.mjs --ground-only --ramp-modules --deterministic-input
```

原版完整悬崖模型、物理输入、音频、跨机器联机、崖壁完整人体体积碰撞及稳定 Player 帧性能仍未完成验收。
