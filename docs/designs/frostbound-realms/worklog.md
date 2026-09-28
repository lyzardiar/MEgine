# 霜境战纪当前交接

工作目录 C:/Users/admin/.codex/worktrees/1339/MEgine，分支 codex/frostbound-realms。原目录 G:/work/github/MEgine 未改动。先前里程碑 fbcb1b6、20e32e4、6145574 已推送；本文件随空军与攻城阶段提交。完整复刻目标保持 active。

2026-09-28 本阶段：Kenney Castle Kit 四种 CC0 攻城模型进入工坊生产；Quaternius Ultimate Monsters Dragon FBX 保留原件，通过固定 SHA 的 FBX2glTF 0.9.7 转为 glTF，再沿原生骨骼导入路径生成 GLB 与纯色图集。五个动画、来源/转换器哈希、冬季调色全部可复现。共 39 来源模型 + 3 组合塔楼，21 项来源/派生/字体/许可哈希通过。运行 scripts/import-frost-assets.py 自动重建全部资产；原生模型不依赖系统安装转换器。

新增四阵营共 4 攻城和 4 飞行定义、工坊和三级祭坛生产、空中移动/高度/选择、对空判定、攻击护甲倍率、建筑集结/旗标、队尾取消全额退款/释放人口、队列与集结存档、敌方命令和生产数据过滤。F9 Siege of Winterfall 可直接游玩攻城与飞龙。编辑器 Unit 按钮可循环全部单位。修复工人接近据点停在交付距离之外、采集资源耗尽遗留货物，以及中立生产建筑的 trainable 异常。

验证：Node 规则与真实 TCP 通过，新增四阵营合法采集→科技→建造→取消/退款→集结→出兵→三级飞行生产；对空/跨水/资源守恒/中立建筑/存档和隐私检查通过。RPG 合法回放仍 707 tick 通关。frost_skins 1 通过（4 模型，含飞行动画），frost_sample 1 通过（真实 QuickJS）。双原生编辑器完整 QA 通过；最终 Dragon 贴图独立原生复测通过。证据 native-qa.json、native-tactics-qa.json、production.png、siege.png、flight.png 以及既有模式截图。

最新性能是 20 单位开局的约三秒采样：1574 实体，实际渲染 1280×720，55 次原生采样；模拟 15.024 ms、原生命令含渲染 10.320 ms、上传 1.458 ms、浏览器绘制 5.135 ms；工作预算代理 31.937 ms，呈现约 17.81 FPS。未达 5 ms；前次实际渲染 850×478，不能做同分辨率提升结论。GPU timestamp 和选用适配器未记录。

最终 Player 154 文件，内容哈希 e8d419bfd32f1ae17274bb94fb1f5039ce211d72431b07141237232e5a70204d。启动检查见 player-smoke.json。Main.js 与 Builds 按仓库规则忽略，新检出先 node scripts/build-frostbound.mjs。tmp 和 scripts/__pycache__ 为未跟踪工作文件，未纳入提交。

仍未完成：原作战役/完整四族建筑科技与兵种、完整 Dota 英雄物品、海军、多层地形、触发器图、录像观战、大规模导航、完整公网系统及 5 ms 预算。物理键鼠、实际听感和跨机器局域网未验收；本次启动日志未出现音频禁用提示，但设备状态与实际听感尚未核验。后续优先统一阵营视觉、完善战斗/地图内容与脚本/快照性能。不要把当前原型的阶段完成当作整个目标完成。
