# 原版山丘之王素材与有符号 MDX 时间轴

Author: MiYu

本阶段完善引擎的源动画时间轴支持，并转换原版山丘之王素材，作为四技能游戏接入的基础。当前对局的人族 heroClass=1 仍使用 Ember Sage；本阶段没有替换其玩法。完整 Warcraft III 复刻目标保持 active。

真实雷霆一击模型 ThunderclapCaster 的首个原始序列名为 nothing，起点 -400ms、终点 400ms。转换后的 glTF 完整保留这份源元数据。此前引擎将序列起点读为 u32，模型因此被拒绝。现在 Sequence.start/end 与 Track.times 使用 i64 表示，校验接受 i32::MIN..u32::MAX；普通轨道保留源序列起点，global 轨道仍使用相对播放时间对周期取模。序列长度上限仍为 600,000ms，节点变换和 attachment visibility 使用相同时间原点。这里没有实现跨片段连续的 Warcraft global 时钟。

素材转换器 scripts/import-frost-mountain-king.py 复用已验证的几何和头像转换路径，产生 323 个签名文件、七组几何绑定和五组原始采样特效。包括普通／Alternate 全身与头像动画、风暴之锤投射物、雷霆一击、天神下凡施法效果、BPSE 眩晕与 BHtc 减速效果。BPSE 实际依赖 CommonAbilityFunc.txt 中的 ThunderclapTarget，不能依据名称替换成 BHtb 的 StormBoltTarget。Alternate 外观使用原模型的材质层和动画，不重定向团队色贴图。

mountain-king-rules.json 保留 Hmkg 与 AHtb/AHtc/AHbh/AHav 的有效等级、原始行、技能热键、按钮、成长、Buff 依赖及 AI 学习顺序。导入严格按 levels=3/3/3/1，不导入表格残留的第四级列。Avatar 源文案要求魔法免疫，MiscGame.CanDeactivateAvatar=0；DataD=0 不能解释成没有魔免。原版资产遵循 Blizzard 原始条款，提取不建立免费再分发许可。asset-library 保持只读。

完整素材模块 86/86 测试通过；1419 个真实原生姿态检查覆盖七组几何各片段的起点、中点和终点，包括负时间轴及普通／Alternate 形态。原有经典素材视觉回归通过。独立重新转换目录为 E:/work/codex/cache/mengine/mountain-king-rebuild-1791480000，323 个文件与来源记录均逐字节一致。

原生编辑器以孤立素材预览场景检查普通／石质全身、两种头像模型及原版特效；native-mountain-king-assets-qa.json 记录执行、二进制和预览场景指纹。最终画面为 mountain-king-source-assets.png，属于原始模型检查，不是对局画面或游戏技能验收。几何使用便于观察的预览缩放，头像背景几何也可见；真正的 HUD 动态头像应使用已保存的原始相机配置。控制台错误及材质管线拒绝均为零，自有原生实例正常退出，成功用例的临时场景和存储已删除。

下一阶段将 heroClass=1 接入 Hmkg：力量属性、四技能、AI、原始命令卡、头像相机、严格存档与真实 TCP 同步，并保留旧存档规则。需明确对照的 Warcraft 执行边界仍包括重击额外伤害的伤害类型和魔免／护甲处理、雷霆一击目标筛选、Avatar 当前生命增减及结束恢复、免疫例外和体型计算。风暴之锤需要真实追踪投射物，不能在施法完成帧直接结算远程命中。本阶段也未验收物理键鼠、音频听感或跨机器 LAN。
