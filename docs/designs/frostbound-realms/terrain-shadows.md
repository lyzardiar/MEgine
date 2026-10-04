# 地形与模型的贴地阴影

Author: MiYu

Frostbound Realms 的太阳光使用 90 单位阴影范围、0.0004 深度偏移、0.025 世界单位法线偏移与 0.65 阴影强度。原生渲染器的正交阴影深度范围为 224.9 世界单位，因此深度偏移对应约 0.09 世界单位。树木、建筑、草丛和岩壁继续使用同一实时阴影通道，地面与崖壁接收投影；颜色、地表纹理、扫描法线和模型几何保持各自的既有绑定。

阴影与昼夜光照共用太阳组件，地图编辑、近远视角和游玩使用同一组参数。当前调整只涉及样例的太阳配置，不改变引擎阴影算法、地图格式、规则或联网协议。

验证入口为 `node scripts/qa-frostbound.mjs --ground-only --cliff-styles --terrain-shadows --deterministic-input`。隔离的原生 Release 编辑器检查实际太阳参数、地形接收阴影、运行中关闭/恢复阴影以及岩石、冰壁、砌石的编辑和存档试玩。关闭阴影的按键只存在于隔离 QA 脚本，产品中不包含该测试操作。截图是同地图、同机位原生画面；验证和发布包记录见本目录 `terrain-shadows-validation.json`、`terrain-shadows-native-qa.json` 与 `terrain-shadows-player-smoke.json`。

Warcraft III 原版专用地块美术与完整游戏复刻仍未完成；物理输入、音频听感、跨机器网络和稳定 Player 帧率不由本阶段检查证明。
