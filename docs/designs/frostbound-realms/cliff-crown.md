# 立体崖顶肩面

Author: MiYu

水平高地的外沿向下折 0.18 世界单位，内侧平台保持地图设定的高度。肩面使用实际顶面三角形形成斜切，连续接入岩壁；凸角、凹角及不同高度交汇使用共享角点。接触坡道的角点保留入口轮廓和高度，地图内的连续起伏仍叠加在实际顶点上。

原生网格、脚本贴地和鼠标拾取采用同一套肩面三角形。步兵与攻城单位沿用既有身体间隙、坡道通行规则和地图高度数据。三种悬崖样式共享顶面，岩壁外观各自保留。地图格式为 1，联机协议为 31。

`cargo test -p mengine-assets terrain_mesh` 覆盖肩面倾斜、平台高度、192 种接缝组合、水域、三种崖壁以及 72 组脚本／原生三角形样本。`node scripts/test-frostbound.mjs` 检查贴地、边缘拾取、移动、坡道、存读档和完整规则／TCP 路径。

原生验收入口为 `node scripts/qa-frostbound.mjs --ground-only --ramp-modules --deterministic-input` 与 `node scripts/qa-frostbound.mjs --terrain-only --deterministic-input`。截图和结果见 `crown-native-tile-courses-qa.json`、`crown-terrain-native-qa.json`、`cliff-crown-validation.json`。运行包为 `samples/frostbound-realms/Builds/windows-x64/Frostbound Realms.exe`。

地形仍使用自行构造的模块，原版全部地形轮廓、美术及完整游戏复刻尚未完成。原生自动输入验收不包含人工鼠标、音频、跨机器联机或稳定帧耗。
