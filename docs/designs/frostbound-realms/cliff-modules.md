# 岩石悬崖模块

Author: MiYu

岩石悬崖沿两单位高度分层，每层具有上沿倒角、凹进的岩面和凸出的崖脚。横向采用三种非对称折线轮廓，按世界地块坐标和高度层选择，使相邻岩块与上下层呈现不同棱面。最大外凸为 0.42 世界单位，沿现有四列、四分之一单位高度采样生成，三角形数量不增加。

模块顶沿、崖脚、垂直接缝和坡道尖端回到共享轮廓。行走顶面、JavaScript 落地三角形、冰壁与砌石造型保持兼容；地图格式与协议仍为 30。编辑器与 Player 使用同一原生网格生成入口。

地形结构参考 [mdx-m3-viewer 的 Warcraft III 地形加载器](https://github.com/flowtsohg/mdx-m3-viewer/blob/2ff0bc00c6363f425016e23d88c0fb2929d3b3cc/src/viewer/handlers/w3x/map.ts) 及其 [悬崖造型变体表](https://github.com/flowtsohg/mdx-m3-viewer/blob/2ff0bc00c6363f425016e23d88c0fb2929d3b3cc/src/viewer/handlers/w3x/variations.ts)：四角高度组合选择模型，同一组合允许多个变体。本次轮廓是自行实现的程序网格，未下载或导入 Warcraft 原版模型，也不声称与原版模型逐顶点一致。纹理继续使用已经登记的 Poly Haven CC0 岩石扫描。

验证结果见 `cliff-modules-validation.json`。原生截图使用同一专用地图，展示 2、4、6 单位高的悬崖与坡道；测试地图仅附加在隔离 QA 项目中。

```powershell
cargo test -p mengine-assets terrain_mesh
node scripts/test-frost-terrain.mjs
node scripts/test-frost-gentle-ramps.mjs
node scripts/test-frost-cliff-clearance.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --ground-only --tile-courses --deterministic-input
node scripts/qa-frostbound.mjs --terrain-only --deterministic-input
```

完整原版地形模块套件仍未完成。崖壁中段没有完整人体体积碰撞；单位避崖由现有脚底轮廓通行检查负责。物理鼠标、音频、跨机器联机及稳定 Player 帧性能未在本阶段验收。
