# 回城卷轴

Author: MiYu

首个祭坛训练完成的英雄获得一张 Town Portal Scroll。取消训练不会消耗首次赠送资格，后续招募与复活不会补发卷轴。主城商店可用 350 金币购买，物品占用普通背包格。

点击物品格或按数字小键盘 1–6 后，在战场或小地图选择己方存活且完工的主基地；双击卷轴自动选择最高等级、同等级最早创建的基地。开始施法即消耗卷轴，完整施法时间为 5 秒。英雄保持施法姿态，显示蓝色粒子与倒计时，期间不能行动并免疫攻击、范围伤害和敌方施法。冷却、法力与已有状态计时继续推进。S 停止施法，不返还卷轴；目标基地被摧毁也会取消。

完成时重新检查附近存活的己方移动单位，包括其他英雄与空军。当前世界单位下携带半径为 12，目标点击允许距主基地 10；这两个数值是本项目规则参数，并非对原版数值的认定。受困、进入建筑、过期召唤物，以及正在采集、建造或维修的工人和食尸鬼留在原地。施法结束前停止工作的工人可以随行。

传送可跨越无法步行连通的地形。落点按距目标点的距离搜索，避开阻挡、建筑与同层移动单位，并为乘客逐个保留空间。无法找到英雄落点时安全失败；其他无法安置的乘客留在原地。到达后清除移动路线与指令，保留身份、背包、资源携带和生命值，并立即更新视野。普通遭遇战主基地不会自动治疗英雄。

联机协议为 22。服务器执行消耗、计时与传送；敌方只能看到可见英雄的剩余施法时间，目的地指令与首次赠送记录保持私有。存档验证活动施法目标和计时，重连继续同一次施法。

行为参考：[Warcraft III 官方回城卷轴指南](https://classic.battle.net/war3/basics/townportalscrolls.shtml)。当前只有两个对立队伍，盟友玩家基地传送及完整联盟机制仍待实现，完整魔兽争霸 III 复刻尚未完成。

## 验证

- `node scripts/test-frostbound.mjs`：规则与实际本机 TCP，包括回城中重连、隐私、英雄招募和复活。
- `node scripts/test-frost-town-portal.mjs`：实际 50 tick 施法、无敌、取消、资源工人排除、跨地形、精确存档恢复和单位容量上限下落点。
- `cargo test -p mengine-editor-host --test frost_sample`：原生 QuickJS 4 通过、0 失败。
- `node scripts/qa-frost-town-portal.mjs`：原生 Release 编辑器中，通过 Agent 输入操作明确构造的祭坛、军队和攻击者练习场；真实 55 秒招募与完整 5 秒施法，验证小地图与战场选点、实际敌方攻击和伤亡、工人留守、保存、购买、双击返回和停止。此场景不是默认开局验收。
- 打包 717 文件完成哈希校验，Player 运行 30 秒且响应正常、日志错误为 0。人工物理输入、音频聆听和跨机器局域网尚未验证。

记录见 [原生报告](town-portal-native.json)、[验证汇总](town-portal-validation.json) 和 [Player 检查](player-smoke.json)。截图：[首次卷轴](portal-first-scroll.png)、[施法](portal-channel.png)、[到达](portal-arrival.png)、[双击回城](portal-double-click-return.png)。

图标由内置 `image_gen` 生成，保存为 `Assets/Art/town-portal-scroll.png`。准确提示词及资产 SHA-256 见样例根目录 `town-portal-art.json`，随 Player 分发的来源说明为 `Assets/Licenses/Town-Portal-Icon.txt`；生成过程具有随机性，仓库保存实际交付图像。
