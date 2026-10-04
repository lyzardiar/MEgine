# 连续的草皮、雪盖与崖顶

Author: MiYu

地表覆盖沿既有两单位地块网格连接。森林的自动地表保持 82% 至 100% 草皮覆盖，角点遮罩决定局部变化；冬季自动地表保持连续雪盖。显式泥地、积雪、草地、岩石笔刷仍决定各自区域，道路和岸边继续使用既有材质过渡。崖顶露岩带收窄，地面扫描法线强度调整为 0.38，使坡面朝向与实时投影更容易辨认。

本阶段修改共享地表 shader，所有地形区块、河床及水面使用相同地表字段。地图高度、坡道、地形网格、实体 ID、模型和源贴图保持既有数据。运行包沿用已交付的协议 30 脚本；工作区待验证的通灵塔升级未包含在此包中。

原生验证入口：`node scripts/qa-frostbound.mjs --tilesets --deterministic-input`，另运行 `--ground-only --cliff-styles --deterministic-input`。三种地表、三种崖壁、笔刷与撤销、地图存档、试玩、游戏存档、双客户端自定义地图和重连均通过，shader 拒绝数为 0。运行包 757 个文件的大小及 SHA-256 全部验证，Player 启动 30 秒正常响应，日志无 ERROR。记录见 [地表原生验收](coherent-ground-native-qa.json)、[崖壁原生验收](coherent-ground-cliffs-native-qa.json)、[包验证](coherent-ground-validation.json) 与 [Player 检查](coherent-ground-player-smoke.json)。

截图：[森林](coherent-ground-forest.png)、[冬季高地](coherent-ground-winter.png)、[同机位调整前](coherent-ground-before-winter.png)、[冰壁](coherent-ground-ice.png)。森林截图保留笔刷验收绘制的泥地、积雪和草地区域；冬季高地截图使用未绘制的 Highland Pass。

当前采用已有扫描材质和程序地形，尚未复刻 Warcraft III 原版专用 tile 美术。物理鼠标、音频、跨机器联机和稳定帧率未在本阶段验收。
