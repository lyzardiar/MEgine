# 倒地动作与尸体生命周期

生物单位死亡时保留一个独立尸体记录，播放一次倒地动作，再保持最后一帧。尸体不占人口、不参与寻路和战斗，也不能选中。最多保留 64 具；20 秒后清理，最后 4 秒逐渐沉入地面。英雄复活时移除对应旧尸体，召唤单位不留持久尸体。建筑和攻城机械的残骸表现尚未接入。

10 种写实角色新增 Death 动画：步兵、工人、弓手、骑士、普通圣骑士、黎明圣骑士、寒霜法师、烈焰法师、女性游侠与火枪手。人体使用 0 A.D. 的 `death_a.dae`；骑士同时使用 `horse_death_01.dae` 与骑手 `death_01.dae`，马与骑手同步倒下。现有其余生物模型复用其自带 Death 动画，飞行生物随倒地进度落向地面。

新增素材固定在 Wildfire Games / 0 A.D. revision `61a3b9507d974084e6badb88a0826bd89a6d5b8b`，采用 CC-BY-SA-3.0。Player 附带 `Assets/Licenses/0ad-death.txt`，6 份来源清单记录 URL 与 SHA256。

尸体年龄、位置、模型类别和朝向随存档恢复。移动、攻击及定向施法记录可选朝向，旧存档缺失尸体或朝向仍可加载。瞬发技能造成死亡后、下一次单位清理前也能保存。服务器只下发当前可见敌方尸体和本方已知尸体，并明确筛选公开字段；尸体不会提供视野。战斗结束后继续清理尸体，但不推进战斗计时。协议保持 10，新增字段兼容既有客户端。

## 验证与复现

```powershell
# Blender 4.5.9，对以下 6 份 manifest 分别执行：
# human / cavalry / paladin / mage / ranger / rifleman
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest human-sources.json
node scripts/build-frostbound.mjs
python scripts/test-frost-death-import.py
node scripts/test-frostbound.mjs
node scripts/render-frost-unit-icons.mjs --death-sheet
node scripts/qa-frostbound.mjs --death-only
```

原生蒙皮检查覆盖 10 种角色的 163 个死亡姿势，验证有限几何和倒地后的头部高度。原有装备、动作、弓弦、骑手及枪口检查一并更新；火枪手倒地时松开支撑手。法师长杖在部分倒地过渡帧略穿过地面，人物头部与身体的最终倒地位置正常，尚未实现武器刚体碰撞。

原生 Agent 检查覆盖 4 次实际射击死亡、倒地中保存与恢复、尸体不能选中、最后姿势不循环及消退后实体停用。规则与 TCP 检查覆盖人口和寻路独立、容量上限、英雄复活、非法和旧存档、即时法术死亡存档、重连时序、迷雾出入及胜利后的清理。物理鼠标、听音、跨机器局域网和完整魔兽玩法还原未由这些检查证明。

6 份清单完整重复导入后，268 个去重的来源和生成文件 SHA256 全部一致。Release 包含 534 个文件、222,744,812 字节，内容哈希为 `3911b4c44405cf345829b9aa8b52d883cbaa7079087aa2bd017b352b86f2e456`；包校验通过，独立 Player 持续运行 30 秒、窗口响应正常、错误日志为 0，详情见 [打包运行检查](player-smoke.json)。

- [倒地姿势图](death-poses.png)
- [战场倒地](death-falling.png)、[保持尸体](death-corpses.png)、[恢复死亡动作](death-restored.png)、[清理后的战场](death-cleared.png)
- [原生姿势验证](death-import-qa.json)、[原生游戏验证](native-death-qa.json)
