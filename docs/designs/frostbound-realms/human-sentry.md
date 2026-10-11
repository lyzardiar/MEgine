# 人族魔法岗哨

作者：MiYu。协议 84。

神秘圣地研究 Rhse 使用原版 50 金、50 木、30 秒、M 热键和第 10 指令槽。研究完成后，本方已建成、存活的侦察塔与防御塔自动侦测 9 世界单位内的隐形和潜地单位。研究途中、建造途中、死亡或其他阵营的塔不提供该能力；侦测仍受本方视野约束，不能读取战争迷雾里的单位。

原始 Adts 的 DataA1=3 经 UI/UnitEditorData.txt 的 detectionType 枚举确认，表示同时侦测隐形与潜地。源表支持 hwtw、hgtw、hatw、hctw；当前实际模型对应 hwtw/hgtw，因此仅绑定 scouttower、guardtower、tower。圣地、主城和其他类型塔没有该绑定。hatw/hctw 的具体游戏塔型尚待接入。

生效的塔在第 6 指令槽显示原版被动图标，MagicSentryCaster 挂在原模型 Overhead Ref 附件上，按原始 Birth/Stand 动画与透明度轨迹播放。特效保留三个几何部分，其中第 0 部分在 Stand 阶段透明，另外两部分可见。8,978 个现有场景节点的内容、编号和父节点保持完整，仅追加 4 个禁用模板，运行时按需创建实例。

研究、建造及命令收尾即时维护激活帧，任意帧完成后都可立即保存。F5 重载和断线重连保持激活时间，不重新播放 Birth。可见敌方塔公开被动特效标记，敌方研究表和队列保持隐藏。humanSentryVersion 缺失的旧存档保持该功能关闭；恢复时严格校验版本、激活时间及公开字段。

来源记录位于 human-sentry-sources.json 与 human-sentry-effects-sources.json。11 个原始源文件及 44 个签名输出包含确定性纹理、材质、模型和效果 meta。独立资产检查核对源表、图标像素、GLB、逐字节再现，以及修改输出、未签名输出和依赖损坏时的拒绝行为。

验证入口为 test-frost-human-sentry.mjs、test-frost-human-sentry-client.mjs、test-frost-human-sentry-network.mjs、test-frost-human-sentry-assets.py 和 qa-frost-human-sentry.mjs。规则与生成客户端使用实际 Wind Walk、实际甲虫潜地、范围边界、研究支付、存档、原生节点采样及敌方信息过滤；TCP 验证权威研究、状态切换和重连。原生结果记录于 native-human-sentry-qa.json，截图为 human-sentry-native-detection.png。

本阶段未宣称原版可执行程序行为一致性、物理输入、独立 Player 或跨机器联机验收完成。其他牧师与女巫技能、Feedback 和 Control Magic 仍待接入；完整游戏复刻继续进行。
