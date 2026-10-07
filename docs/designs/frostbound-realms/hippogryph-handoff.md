# 角鹰兽交接

Author: MiYu

目标仍是完整复刻 Warcraft III Frozen Throne，尚未完成。Ponytail 在本任务禁用，asset-library 保持只读。

本阶段完成：原始角鹰兽/骑士本体与独立头像、源尺寸、签名资产导入；角鹰兽风之古树 H 训练、空中近战、夜间回血、正确升级族、无持续尸体；新存档 hippogryphVersion=1，旧存档=0 保留旧生产；协议 51。骑士只能作为预放置源形态使用，装载/卸载与 Reht 研究命令尚未接入。

原生验收一次通过，原版两种模型/头像、H 训练和 F5 队列续跑均成功，材质管线拒绝数为 0。拥有的隔离编辑器正常退出，成功夹具及存储已清理；之前被自动审批拒绝删除的 Slow Poison 失败夹具没有改动。

下一步先完成原版 Acoi/Adec 运行测量，核实生命分配、对象身份、效果归属、冷却、命令和卸载落地规则，再接入 Reht 研究以及真正的双单位骑乘。当前表证据：Aco2/Aco3 Area=900、Cool=30、DataB 是“移动到辅助”，而非生命继承；ehpr 原始生命 765，不等于 525+245。风之古树源训练项 ehip,edot,efdr，不应添加直接训练 ehpr。

共享导入器新增 --bindings。Druid 模型、Druid 法术与 Dryad 三个旧素材清单重新生成后仅 generator 哈希改变，旧签名输出字节保持不变。当前源码 Assets/Scripts/Main.js 为忽略的生成文件，运行客户端/原生验收前使用 node scripts/build-frostbound.mjs。测试结束恢复保护的 Main.mscene，勿提交它和现有脏 model-catalog.json、根 .gitattributes 或历史 QA。

证据：hippogryph.md、hippogryph-validation.json、native-hippogryph-qa.json、hippogryph-timings.md；截图 hippogryph-original.png、hippogryph-rider-original.png、hippogryph-trained.png。

原生输入为 Agent 模拟，不证明原版运行等价、物理输入、音频听感或跨机器 LAN。阶段测试与远端提交结果由提交时的验证记录确定。

Accepted generated Main.js SHA-256: `b649f1ee348748e512a6f03300ed4fa4d2c80d0e836102ccb9333f5ab39ee85d`

Protected scene backup SHA-256: `f305cea6876e8e452cef5826e6054679053c9b77bb42d8a92c918c57e787d748`

最终验证：完整 test-frostbound.mjs 为 165 组 PASS；新素材和三个受影响旧素材导入器均通过源哈希、再生成与写入保护检查。
