# 原版小精灵采木

作者：MiYu

新暗夜精灵近战对局使用原版 `ewsp` 单位与 `Awha` 采集技能数据：120 生命、无攻击、0 点中型护甲、270 源移动速度、60 金币、1 人口、14 秒训练，夜间恢复 0.5 生命／秒。当前样例沿用每 100 源单位对应 1 世界单位的移动和技能距离映射；这不是全游戏地形坐标比例的完整复刻。

小精灵到树旁后开始完整 8 秒采集周期，每周期直接增加 5 木材，不携带木材、不消耗树、不依赖扎根主树。移动、停止、换树、眩晕或维修中断当前周期；回到有效位置后重新计时。Shift 队列在下一次收入后继续。原版 `ClassicWispWood` 使用 `Stand Lumber`；可见敌方只收到工作位置，不收到采集订单、资源计时和货物。AI 优先分配空闲树，确保开局能生产军队。

HUD 显示原版训练价格与时间，小精灵不显示攻击按钮，A 键不会为单独选中的小精灵开启攻击模式。新存档保存规则版本、采集周期和训练队列；旧存档保留原有普通工人经济行为。普通金矿搬金与金矿货物存档仍可用；缠绕金矿、驻矿小精灵、自爆和自然的祝福尚未在这一阶段实现。

`wisp-rule-sources.json` 记录原版 MPQ 归档、四份源 SLK 表和全部生成输出的字节数及 SHA-256；原始字节保存在 `SourceAssets/WarcraftIII/Units`，版权署名保存在 `Assets/Licenses/Classic-Wisp-Rules.txt`。生成器可从保留的签名源表重生成，无须临时导出目录或游戏安装；手工修改生成输出时拒绝覆盖。

```powershell
python scripts/import-frost-wisp-rules.py
python scripts/test-frost-wisp-sources.py
node scripts/build-frostbound.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frost-wisp-harvest.mjs
```

源哈希与七个重生成文件、原子覆盖保护、完整规则／客户端／TCP 回归通过。原生验收使用隔离项目与存储目录，通过真实 HUD 点击检查 8 秒收入、不耗树、原版工作模型、暂停、存档与 14 秒训练队列；双原生客户端检查完整服务器采集周期、敌方工作动画与隐私、断线重连。报告见 `native-wisp-harvest-qa.json`，画面见 `wisp-harvest-lumber.png` 和 `wisp-harvest-network.png`。这些验收使用 Agent 输入，未验收物理鼠标和音频。
