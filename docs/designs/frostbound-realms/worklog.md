# 霜境战纪当前交接

工作目录 C:/Users/admin/.codex/worktrees/1339/MEgine，分支 codex/frostbound-realms。原目录 G:/work/github/MEgine 未改动。施工阶段 651dab9 已推送；本文件随地图事件阶段提交。完整复刻目标保持 active。

2026-09-28 本阶段：World 实体写入维护 revision，WorldSnapshotCache 复用 Arc<EntitySnapshot>，每个 World 有唯一缓存身份。ScriptHost 和 PlaySession 使用不可变快照；原生 Play 返回变化实体、完整顺序、帧元数据及连续revision，前端重建全量状态；显式 Inspector/Agent 编辑强制全量校正。快照过滤重复 Name/Parent/Children 元数据，修复运行改名回滚。异步启动/停止串行且停止绑定原生会话；编译子进程有 30 秒超时和 kill_on_drop。组件序列化状态变更通过 World 写 API 或 get_component_mut，不能经只读引用内部修改。

验证：core 11、script 20、scene 18、Play runtime 8、Play compiler 1、Play 前端 4、真实 QuickJS frost_sample 2 全部通过；另一个手动采样测试未运行。快照测试覆盖所有 World 写入口、未知组件、父子/排序/激活/标签/层、删除与代际复用、更换 World、历史帧隔离、过期结果和重启。真实 QuickJS 的 35 帧载荷 1,060,789 / 35,148,665 字节（431 个变化实体），减少约 97%。完整双原生编辑器 QA 通过，包含原有各游戏模式、编辑保存试玩、英雄加点施法、攻城飞行、两客户端真实 TCP 与重连。

性能原始数据：performance-hero-baseline.json 和 native-performance-qa.json；对照汇总 performance-cache-comparison.json。同场景 1280×720，预热 5s + 三组 5s 窗口，单位数 20/21/22。中位数模拟 15.616→6.217 ms，模拟请求 54.724→17.644 ms，工作预算代理 32.631→19.893 ms，呈现 17.60→21.33 FPS。最终完整 QA 短采样 62 次、20.72 FPS，工作预算 21.176 ms。整体未达 5 ms，非 GPU 时间、非 Player 帧率、非大军团基准。前端全量 fingerprint 和原生帧读回/传输仍有耗时。

最终 Player 158 文件，内容哈希 e5770aeb6351f2f73ed83ab28473094e94550f2fe625bbfca020a048a58dcb09。启动证据见 player-smoke.json。Main.js 与 Builds 按仓库规则忽略，新检出先 node scripts/build-frostbound.mjs。tmp 和 scripts/__pycache__ 未纳入提交。

已有内容：四阵营地面/攻城/飞行单位、四英雄16技能、RPG/三路MOBA/十二波TD、地图编辑、联机。免费资产39来源模型+3组合塔、地表/粒子/字体及原创UI插画。未完成原作战役、完整四族内容/美术、完整 Dota 规则、海军、多层地形、触发器图、录像观战、大规模导航、公网系统与5ms目标。物理键鼠、实际听感和跨机器联机未验收。下一阶段继续提升战斗/地图和阵营内容，不得把阶段完成当整个目标完成。

2026-09-28 施工阶段：四族施工/协作/驻留/生长消耗/领地召唤，10%初始工地生命与随进度补血，75%取消退款，按损伤支付维修，扩张据点/最近完工据点交货/最后据点胜负，AI派工与补充工人。存档校验占用关系并兼容旧工地，协议3拒绝旧客户端，敌方看不到驻留工人或施工私有字段。复用现有 Quaternius 建筑及 Kenney wall-block，新增32个工地装饰槽和施工粒子。未新增外部下载。

本阶段 Node 游戏规则/TCP 全通过（新增 test-frost-construction.mjs，四族AI 800 tick、施工生命周期/经济/存档/胜负边界），真实 QuickJS frost_sample 2/2 通过，完整原生 QA 和独立施工 QA 均通过。独立只读审查发现生长工地缺失吞噬工人的存档漏洞，已修复并回归。Agent验证选工人、开工、停止暂停、右键恢复、工地取消75%退款，完整QA还验证所有既有游戏/编辑/英雄/两客户端TCP重连。最后据点取消及未完工商店/补给限制由规则回归验证。截图 construction.png/construction-selected.png；native-construction-qa.json 与 native-qa.json 为证据。

当前独立包158文件、1611场景实体、42模型条目，内容哈希98df4f19478ee937e2d33bd7a9a95afe0b353403ffb27093fe79779e62cb7047。按manifest逐文件SHA-256与Release exe核验；最终启动证据以player-smoke.json为准。施工阶段完整QA短采样59次，模拟7.779ms、原生命令8.157ms、呈现18.80FPS；此前专项性能对照继续保留，不能将不同流程直接比较。物理键鼠、听感、跨机LAN和完整Player操作仍未验收。

2026-09-28 地图事件阶段：32矩形区域、每条8条件/8动作、all/any、前置依赖、相对延迟、重复次数与间隔；增援整批规划保证资源奖励和生成的原子性，动作按作者顺序执行。区域/触发器依赖删除受保护，保存计数和调度时间，兼容旧地图/存档。公告按队伍保存、对手看不到作者配置和运行状态；协议4拒绝旧客户端。五页编辑器可编辑区域、条件/动作/依赖和英文名称/公告，纯点选不污染撤销。F8模板Supply Road完成抵达增援、自动行军、护送奖励，新增资产只是该地图JSON，复用免费模型。

验证：Node规则与TCP通过，新的test-frost-triggers.mjs包含合法命令完成护送，TCP上传该地图并验证服务器增援和公告隔离。QuickJS frost_sample 2/2通过；完整原生QA和专项native-triggers-qa.json通过，后者含命名、条件/动作编辑、依赖保护、边缘移动、撤销、模式切换、存取和护送完成。Sol只读复核发现并已修复公告泄露、选择污染undo、边缘范围和Tab路径错误。最终画面布局由专项原生QA再验；完整QA覆盖既有各模式、施工、英雄、编辑器和双客户端重连。

包159文件、1739场景实体、42模型条目，内容哈希0e14b54ac7e101f60b266b03069885daaf92dbb0ff43a4fef62e5fb3f1473614。启动及逐文件校验看player-smoke.json。仍未完成完整战役、原版TD/Dota规则、美术统一、可视化触发器节点、多层地形、录像观战、大规模导航和5ms目标；此次键码文本输入不支持Unicode/IME，后续需贯通ScriptInput的文本提交和编辑器/Player输入法通道及CJK字体。物理设备、音频听感、跨机LAN未验收。完整目标保持active。

地图事件收尾补齐传输容量：合法最大数量的区域/事件/文本地图超过原生64KiB与服务端16KiB限制，ScriptNetwork和服务器统一512KiB消息上限，服务器累计缓冲1MiB，原生队列仍有界。新增150KB Unicode分片往返与超过512KiB拒绝，mengine-script 21/21通过。新Release runtime/editor重建后用native-large-map-qa验证超过256KiB合法地图从原生客户端创建房间、双端游玩与重连；此测试只在隔离QA样例中注入作者地图，不修改交付默认地图。

最终大地图原生验收通过：上传 263,398 字节合法作者地图，双原生客户端进入权威比赛并重连成功。Release 引擎已重建，最终包哈希已更新，159文件逐文件SHA-256与新Release可执行文件一致。
