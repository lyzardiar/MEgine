# 霜境战纪进展

目标：RTS、联机、RPG、内置 MOBA/塔防及地图编辑器。当前是原创可玩基础版本，与《冰封王座》全内容复刻仍有显著差距。

来源：独立 worktree 最初为 35136de；已 fetch 并以 origin/master 873f5c1 建立 codex/frostbound-realms。原目录 G:/work/github/MEgine 仅只读核对。指定范围复制前 HEAD 相同；未混入 eclipse-survivors、spinning-cube 元数据、原目录 tmp 或 __pycache__。

已接续：18 个 CC0 模型、原始骨骼动画、存储、RTS/MOBA/TD、房间/重连。两个 Kenney 源 ZIP 已补入 SourceAssets，13 个源文件哈希全部匹配，导入器同步保留。

新增：16 个阵营兵种、两次据点升级、治疗/减速/吸血；四阶段 RPG 任务、掉落、升级、复活与存档。编辑器单位/任务角色、玩家阵营和 AI、一次性条件触发器。联机修复隐藏经济/地图布置、主动离开 AI 接管与结束对局重连。

验证：Node 规则/TCP 通过；完整 RPG 合法命令回放 707 tick 胜利，包含中途恢复。QuickJS 原生模式测试通过；storage/pose 与三个实际模型蒙皮变化通过。首轮两个独立 Release 编辑器的 Agent 输入、真实 TCP、原生截图、菜单/移动/施法/暂停/保存/地图编辑试玩/RPG/重连通过（native-baseline.json）。这不是物理键鼠或音频听感验收。

性能：已补 setActive、地形变更缓存、Canvas 当前帧子节点索引、每帧寻路占用缓存、无物理组件场景快速路径。最终 2343 实体/20 单位采样：模拟 25.484 ms、原生命令（含渲染）13.634 ms、上传 0.684 ms、浏览器绘制 9.412 ms，工作预算代理值 49.214 ms，约 13.77 次呈现/秒。实际原生预览 850×478，逻辑截图 1280×720。未达到约 5 ms，GPU timestamp 未接入。详见 performance-summary.json 与 README.md。

打包：修复 GLB #pose 被识别为精灵切片的依赖扫描；63 项专项包测试通过。Player Tab/Escape 与编辑器 Tab 的输入转发已修复。最终 Release 包 74 文件，内容哈希 9b58533440fe63362fede55cb5138656ee012009359da87109c01c1cb748d049；Player 启动保持响应、日志无 ERROR。环境缺少默认音频设备，实际音频输出被禁用。详见 player-smoke.json。

最终回归：补三种防御塔、升级/出售、首领与快速波、三套装备合成，修正塔防初始镜头并加入原创配乐/音效。最新 Node 规则/TCP 与双独立原生 Release 编辑器回归全部通过，八张截图已刷新。仅关闭本次启动的 Player 检查进程，用户编辑器保持原状。

提交：第一阶段 fbcb1b62c3b54f49e3e23d14a3ebc83be3b2a1e8 已推送到 origin/codex/frostbound-realms；后续提交收录本文件的最终验证和优化，精确哈希以该分支 Git 历史为准。

下一阶段：继续降低 QuickJS/快照与浏览器绘制开销；完善独立阵营建筑、空军/攻城、战役、英雄池/装备规则、触发器图、录像观战、大规模寻路和公网服务。物理鼠标、音频、真实不同机器局域网仍待验收，当前不是完整复刻。
