# 悬崖地块折线轮廓

Author: MiYu

平直悬崖的中段使用世界坐标控制的凹凸轮廓，最大横向偏移 0.24 世界单位。顶面、岩壁和崖脚共用该轮廓；弧形转角、坡道交汇、等高拼接和河岸的既有过渡保留。每段偏移在两端收拢，跨地块和跨分块的连接共用世界坐标。引擎网格与 JavaScript 的脚底高度、拾取和通行边界使用相同计算。

地图高度、坡道和起伏字段沿用当前格式，旧地图无需转换。联机协议更新为 28，客户端与服务器必须同时更新；旧协议 27 被拒绝，以避免混用不同地形通行边界。

验证入口：`node scripts/test-frost-cliff-clearance.mjs`、`node scripts/test-frost-terrain.mjs`、`node scripts/test-frostbound.mjs`、`cargo test -p mengine-assets terrain_mesh --lib`、`cargo test -p mengine-editor-host --test frost_sample`。跨语言样本为 72 组，在岩石、冰壁和砌石三种材质下比对原生顶面；另有 192 组转角组合检查封闭边界。新回归验证长直悬崖的中段轮廓和单位占地通行。

原生验收使用独立 Release 编辑器的 `--ridge-layout --deterministic-input` 和 `--network-only --gentle-network --deterministic-input`。结果、运行包校验与截图见 `terrain-fractures-validation.json`、`native-fracture-qa.json`、`native-fracture-network-qa.json`、`fracture-ridge-overview.png` 和 `fracture-ridge-summit.png`。同机位前一阶段参考为 `crown-ridge-overview.png`。

本阶段扩展实际网格轮廓及对应的通行边界，完整原版地形套件和场景美术一致性仍未完成。原生 QA 使用自动化输入，稳定 Player 帧耗仍需单独验收。
