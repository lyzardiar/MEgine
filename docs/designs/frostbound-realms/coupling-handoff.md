# 骑乘阶段交接

Author: MiYu

完整 Warcraft III Frozen Throne 复刻目标仍处于 active，尚未完成。Ponytail 在本任务禁用，asset-library 只读。工作区 E:/work/codex/worktrees/1339/MEgine，分支 codex/frostbound-realms。

本阶段接入原始 Reht 研究、弓箭手/角鹰兽双入口合体、骑士拆分、原始按钮和头像、成员身份保留、共享 30 秒冷却、人口保持、容量/合法落地原子拒绝、严格保存与敌方私有状态隐藏。协议 52，新游戏 hippogryphVersion=2；真实版本 1 独立飞行单位存档仍兼容。

独立只读审核发现的追踪受晕保存拒绝、死亡追踪命令残留、保留身份与尸体别名已修复并测试。已发射箭矢保留源武器伤害和升级快照，两个合体入口均验证精确保存续跑。

生命分配、选择/成员身份策略、清空 buff/DOT/命令/武器冷却、共享冷却与拆分落地行为属于暂定实现，不能声称原版运行等价。源表支持范围、研究价格时间、模型/图标、移动标志、765 生命及 2+2⇄4 人口。具体区分见 coupling.md。

原版实测待办：已有检查过的 JASS 探针与地图，无 map-load 或 .pld 测量成功证据。不要重复生成相同探针、关闭或重新启动当前原版进程。若能取得原版测量，应按实际报告修正生命/身份/效果/冷却策略并升级存档兼容，不以合成分析器测试替代真实测量。

验证入口：test-frostbound.mjs 包含规则、生成客户端、真实 TCP；qa-frost-coupling.mjs 先运行生成客户端预检，再在拥有的隔离原生实例内验证 I/U/F5、头像和截图，记录逐命令耗时。桥接调用可设置 timeoutMs，QA 普通命令 60 秒，长播放/步进 300 秒；默认等待与授权未变。大型场景面板确认超过原先默认等待，前两次 QA 超时，诊断确认面板已经激活；完整生命周期及 30 秒研究/冷却结果见 native-coupling-qa.json；最终 U 路由专项结果见 native-coupling-hotkeys-qa.json。专项使用已研究与 0.1 秒剩余冷却的夹具，不能替代完整计时证据。

不得提交根 .gitattributes、源 Main.mscene、根 sample model-catalog 或旧截图/QA 改动。原生夹具只清理本次拥有且成功的实例，不触碰先前自动审批拒绝删除的 Slow Poison 目录。源码 Main.js 为忽略生成文件，验收前 node scripts/build-frostbound.mjs；验收后恢复受保护的 Main.mscene。

本阶段证据：coupling-validation.json、native-coupling-qa.json、native-coupling-hotkeys-qa.json、coupling-timings.md，截图 coupling-research.png、coupling-mounted.png、coupling-dismounted.png。下一阶段可继续暗夜精灵其余单位/科技、玩家交互与地图编辑器真实路径；完整单机、联机、战役、编辑器及 TD/Dota 等价仍有未完成项。
