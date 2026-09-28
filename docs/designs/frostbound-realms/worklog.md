# 霜境战纪当前交接

工作目录 C:/Users/admin/.codex/worktrees/1339/MEgine，分支 codex/frostbound-realms。原目录 G:/work/github/MEgine 未改动。攻城与空军里程碑 5227391 已推送；本文件随四英雄阶段提交。完整复刻目标保持 active。

2026-09-28 本阶段：四名英雄和 16 个技能、技能点和等级门槛、持续法术区域、护盾/控制/加速/化身/临时飞龙、旧档迁移和严格新档校验。菜单与大厅 H 选人，K 学习，Shift+Q/W/E/R 加点，O 商店。地图玩家/英雄单位保留 heroClass；编辑器支持指定英雄并保存加载试玩。TCP 协议 2，选人清除双方准备，重连保留英雄。原有下载模型复用为英雄，新增原创四头像与 16 图标，提示词/哈希见 hero-art.json。39 来源模型 + 3 组合塔楼，原始来源清单和许可保持可追溯。

验证：Node 规则/真实 TCP 通过，完整 RPG 合法命令回放 676 tick；真实 QuickJS frost_sample 1 通过；最终完整双原生编辑器 QA 通过，包含四英雄学习/施法/存档、地图英雄往返、生产/攻城/飞行、两客户端不同选人/重连。最终证据 native-qa.json，hero-0..3.png 和 hero-editor.png；独立 heroes/network QA 也已保留。修复地图预置玩家单位移动后返回出生点以及持续区域首发事件重复。

最新约三秒开局采样：1579 实体，实际渲染 1280×720，53 次原生采样；模拟 15.354 ms，原生命令含渲染 10.514 ms，上传 1.434 ms，浏览器绘制 5.111 ms；工作预算代理 32.412 ms，呈现约 17.02 FPS。未达 5 ms；GPU timestamp 和选用适配器未记录。

最终 Player 158 文件，内容哈希 4c8deac19ec31b629011f76179705600bd9d6f6cb5baf83fc9e87332b7c10eaf。启动证据见 player-smoke.json。Main.js 与 Builds 按仓库规则忽略，新检出先 node scripts/build-frostbound.mjs。tmp 和 scripts/__pycache__ 未纳入提交。

仍未完成：原作战役/完整四族建筑科技与兵种、完整 Dota 英雄物品、海军、多层地形、触发器图、录像观战、大规模导航、完整公网系统及 5 ms 预算。物理键鼠、实际听感和跨机器局域网未验收。后续优先统一阵营视觉、完善战斗/地图内容与脚本/快照性能。不要把当前原型的阶段完成当作整个目标完成。
