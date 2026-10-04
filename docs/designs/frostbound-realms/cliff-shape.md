# 宽肩地块与连续岩面

Author: MiYu

水平高地边缘采用 0.42 世界单位的收边，顶面、崖壁和凸凹转角使用同一条轮廓。接触坡道的角点采用 0.3 单位收边，保留步兵与攻城单位的入口宽度。岩壁每两单位高度形成一个宽岩面，横向使用三种较宽的不对称切面；土壤顶沿与崖脚阴影沿用共享地表材质，层间阴影强度为 0.08。

脚本贴地、鼠标拾取和身体间隙使用与原生顶面一致的三角形。地图格式沿用版本 1，联机协议保持版本 31。单格高台容纳步兵，单格坡道限制大型攻城单位，宽坡和默认双坡支持攻城单位通行。

验证入口：`cargo test -p mengine-assets terrain_mesh`、`node scripts/test-frostbound.mjs`。72 组跨语言地表样本与 192 种接缝组合覆盖坡道、曲面转角和分块边界。原生入口 `node scripts/qa-frostbound.mjs --ground-only --ramp-modules --deterministic-input` 检查 2／4／6 单位高台、三种地表、六段坡道上下行、地图存读档与试玩。

实际截图与验收见 `shape-native-tile-courses-qa.json`、`shape-map-native-qa.json`、`cliff-shape-validation.json`。运行包为 `samples/frostbound-realms/Builds/windows-x64/Frostbound Realms.exe`。当前地形仍为自行构造的模块，尚未达到原版全部地形轮廓和美术表现。原生自动输入检查不包含人工鼠标、音频、跨机器联机或稳定帧耗验收。
